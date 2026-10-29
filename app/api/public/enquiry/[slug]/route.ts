// The public enquiry form of one company, reached by its link name (/enquiry/<company-slug>).
//   GET   what the page needs to show: the company's name, the sentence above the form, whether it is taking enquiries, and its logo address. Nothing else about the company.
//   POST  an enquiry. It is checked (lib/enquiry.ts), the visitor is limited, and it is saved as a New lead in THAT company's Leads list (lib/enquiry-submit.ts).
// Anyone can call it, so every number and word in it is checked and a script gets no hint why it was turned away.

import { NextRequest, NextResponse } from 'next/server'
import { publicGuard } from '@/lib/public-guard'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { siteOrigin } from '@/lib/site-origin'
import { checkEnquiry } from '@/lib/enquiry'
import { companyForSlug, saveEnquiry } from '@/lib/enquiry-submit'
import { notifyBuilderOfEnquiry, sendEnquiryThanks } from '@/lib/enquiry-notify'

export const maxDuration = 30

const NOT_AVAILABLE = 'This enquiry form is not available.'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  let sb
  try { sb = createServiceRoleClient() } catch { return NextResponse.json({ error: NOT_AVAILABLE }, { status: 503 }) }
  const found = await companyForSlug(sb, slug)
  if (!found.ok) return NextResponse.json({ error: NOT_AVAILABLE }, { status: found.reason === 'setup-needed' ? 503 : 404 })
  const c = found.company
  return NextResponse.json(
    { companyName: c.companyName, intro: c.intro, enabled: c.enabled, logoUrl: c.hasLogo ? `/api/public/company-logo/${c.ownerId}` : null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params

  let raw: unknown
  try {
    const text = await req.text()
    if (text.length > 100_000) return NextResponse.json({ error: 'Some of the information is too long. Please shorten it and try again.' }, { status: 413 })
    raw = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 400 })
  }

  const check = checkEnquiry(raw, Date.now(), process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  if (!check.ok) {
    // a script is told it worked and nothing is saved; a person is told what to fix
    if (check.silent) return NextResponse.json({ ok: true })
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  // counted only once the form is valid, so a typo does not use up someone's allowance
  const limited = await publicGuard(req, 'enquiry')
  if (limited) return limited

  let sb
  try { sb = createServiceRoleClient() } catch { return NextResponse.json({ error: 'Sorry, we could not send that just now. Please try again.' }, { status: 503 }) }

  const found = await companyForSlug(sb, slug)
  if (!found.ok) return NextResponse.json({ error: NOT_AVAILABLE }, { status: found.reason === 'setup-needed' ? 503 : 404 })
  const company = found.company
  if (!company.enabled) return NextResponse.json({ error: 'This company is not taking enquiries through this form at the moment.' }, { status: 403 })

  const result = await saveEnquiry(sb, company, check.value)

  // the enquirer's own thank-you: only if the company switched it on, and only to an address that passed the checks
  if (result.created && company.thanks && check.value.email) {
    await sendEnquiryThanks({ companyName: company.companyName, companyEmail: company.email, input: check.value, origin: siteOrigin(req), ownerId: company.ownerId, hasLogo: company.hasLogo })
  }

  if (result.created && company.notify) {
    // the company's own email, or failing that the email it signs in with
    let to = company.email
    if (!to) {
      try { to = (await sb.auth.admin.getUserById(company.ownerId)).data?.user?.email || '' } catch { to = '' }
    }
    await notifyBuilderOfEnquiry({ to, companyName: company.companyName, input: check.value, origin: siteOrigin(req), ownerId: company.ownerId, hasLogo: company.hasLogo })
  }
  return NextResponse.json(result.body, { status: result.status })
}
