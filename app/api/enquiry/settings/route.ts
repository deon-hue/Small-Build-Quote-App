// The builder's side of the enquiry form: its link name, whether it is on, the sentence above it, and whether to be emailed about each enquiry. Signed-in company owners only.
//   GET   the current settings (and the names the company has had)
//   POST  { action: 'check', slug }   is that name free?
//         { action: 'claim', slug }   take that name (the old ones keep working)
//         { action: 'save', enabled, intro, notify, thanks }
// Link names are held in enquiry_slugs, which only the server can touch (service role), after checking who is asking here.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { slugify } from '@/lib/enquiry'
import { claimSlug, slugAvailability, isMissingSchema } from '@/lib/enquiry-submit'

const SETUP_NEEDED = 'The enquiry form has not been set up on this database yet. Run supabase/enquiry-form.sql in the Supabase SQL editor, then reload this page.'
const INTRO_MAX = 300

async function owner() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  return user ? { sb, user } : null
}

export async function GET() {
  const who = await owner()
  if (!who) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data, error } = await who.sb.from('settings').select('company_name, enquiry_slug, enquiry_enabled, enquiry_intro, enquiry_notify, enquiry_thanks').eq('user_id', who.user.id).maybeSingle()
  if (error) return NextResponse.json({ setupNeeded: isMissingSchema(error), error: isMissingSchema(error) ? SETUP_NEEDED : 'Could not read your settings.' }, { status: isMissingSchema(error) ? 200 : 500 })
  if (!data) return NextResponse.json({ error: 'Only the company owner can set up the enquiry form.' }, { status: 403 })

  let slugs: string[] = []
  try {
    const sr = createServiceRoleClient()
    const r = await sr.from('enquiry_slugs').select('slug, created_at').eq('user_id', who.user.id).order('created_at', { ascending: true })
    if (r.error && isMissingSchema(r.error)) return NextResponse.json({ setupNeeded: true, error: SETUP_NEEDED })
    slugs = ((r.data ?? []) as { slug: string }[]).map(x => x.slug)
  } catch { /* the names list is a nicety: the rest still works */ }

  const name = (data.company_name as string) || ''
  return NextResponse.json({
    companyName: name,
    slug: (data.enquiry_slug as string | null) || null,
    suggestion: slugify(name),
    enabled: data.enquiry_enabled !== false,
    intro: (data.enquiry_intro as string) || '',
    notify: data.enquiry_notify !== false,
    thanks: data.enquiry_thanks === true,
    slugs,
  })
}

export async function POST(req: NextRequest) {
  const who = await owner()
  if (!who) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  let body: { action?: string; slug?: string; enabled?: unknown; intro?: unknown; notify?: unknown; thanks?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  // the signed-in person must have a company settings row of their own (a team member does not)
  const mine = await who.sb.from('settings').select('user_id').eq('user_id', who.user.id).maybeSingle()
  if (mine.error) return NextResponse.json({ error: isMissingSchema(mine.error) ? SETUP_NEEDED : 'Could not read your settings.' }, { status: 500 })
  if (!mine.data) return NextResponse.json({ error: 'Only the company owner can set up the enquiry form.' }, { status: 403 })

  if (body.action === 'check' || body.action === 'claim') {
    let sr
    try { sr = createServiceRoleClient() } catch { return NextResponse.json({ error: 'Service unavailable' }, { status: 503 }) }
    if (body.action === 'check') return NextResponse.json({ availability: await slugAvailability(sr, who.user.id, String(body.slug ?? '')) })
    const r = await claimSlug(sr, who.user.id, String(body.slug ?? ''))
    return r.ok ? NextResponse.json({ ok: true, slug: r.slug }) : NextResponse.json({ error: r.error }, { status: 400 })
  }

  if (body.action === 'save') {
    const intro = typeof body.intro === 'string' ? body.intro.replace(/\u0000/g, '').trim() : ''
    if (intro.length > INTRO_MAX) return NextResponse.json({ error: `Keep the sentence above the form to ${INTRO_MAX} characters or fewer.` }, { status: 400 })
    const patch: Record<string, unknown> = { enquiry_intro: intro }
    if (typeof body.enabled === 'boolean') patch.enquiry_enabled = body.enabled
    if (typeof body.notify === 'boolean') patch.enquiry_notify = body.notify
    if (typeof body.thanks === 'boolean') patch.enquiry_thanks = body.thanks
    const { error } = await who.sb.from('settings').update(patch).eq('user_id', who.user.id)
    if (error) return NextResponse.json({ error: isMissingSchema(error) ? SETUP_NEEDED : 'Could not save just now. Please try again.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 })
}
