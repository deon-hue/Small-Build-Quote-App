// The database half of the public enquiry form. Everything takes the Supabase client as an argument (the service-role one, from the API routes), so it can be tested with a stand-in.
// The rules about what an enquiry must contain are in lib/enquiry.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { slugProblem, leadRowFromEnquiry, type EnquiryInput } from './enquiry'

export interface EnquiryCompany {
  ownerId: string
  slug: string
  companyName: string
  intro: string
  enabled: boolean
  notify: boolean
  /** send the enquirer a thank-you email (off unless the company switches it on) */
  thanks: boolean
  /** the company's own email, where "a new enquiry" is sent */
  email: string
  hasLogo: boolean
}

export type CompanyLookup =
  | { ok: true; company: EnquiryCompany }
  | { ok: false; reason: 'not-found' | 'setup-needed' }

/** The database says a table or column is not there yet (the SQL has not been run) */
export function isMissingSchema(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  return ['42P01', '42703', 'PGRST204', 'PGRST205'].includes(err.code || '') || /does not exist|could not find the .* column|schema cache/i.test(err.message || '')
}

/** Which company a link name belongs to, with what the public page and the submit need. An old link name keeps working (every name a company has had stays in enquiry_slugs). */
export async function companyForSlug(sb: SupabaseClient, rawSlug: string): Promise<CompanyLookup> {
  const slug = (rawSlug || '').trim().toLowerCase()
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { ok: false, reason: 'not-found' }   // anything that cannot be a link name is not looked up at all
  const found = await sb.from('enquiry_slugs').select('user_id').eq('slug', slug).maybeSingle()
  if (found.error) return { ok: false, reason: isMissingSchema(found.error) ? 'setup-needed' : 'not-found' }
  const ownerId = (found.data as { user_id?: string } | null)?.user_id
  if (!ownerId) return { ok: false, reason: 'not-found' }

  const s = await sb.from('settings').select('company_name, logo, email, enquiry_enabled, enquiry_intro, enquiry_notify, enquiry_thanks').eq('user_id', ownerId).maybeSingle()
  if (s.error) return { ok: false, reason: isMissingSchema(s.error) ? 'setup-needed' : 'not-found' }
  const row = s.data as { company_name?: string; logo?: string; email?: string; enquiry_enabled?: boolean; enquiry_intro?: string; enquiry_notify?: boolean; enquiry_thanks?: boolean } | null
  if (!row) return { ok: false, reason: 'not-found' }
  return {
    ok: true,
    company: {
      ownerId, slug,
      companyName: (row.company_name || '').trim() || 'Enquiry',
      intro: (row.enquiry_intro || '').trim(),
      enabled: row.enquiry_enabled !== false,
      notify: row.enquiry_notify !== false,
      thanks: row.enquiry_thanks === true,
      email: (row.email || '').trim(),
      hasLogo: /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(row.logo || ''),
    },
  }
}

/** At most this many enquiries into one company in an hour: past it the form says it is busy (a flood of junk cannot bury a builder's Leads list) */
export const ENQUIRIES_PER_HOUR = 30
/** The same person sending twice within this many minutes (a double tap, a retry) is one enquiry */
export const DUPLICATE_MINUTES = 10

export interface SaveResult {
  status: number
  body: { ok?: true; id?: string; error?: string }
  /** a new lead was made (not a repeat), so the builder should be told */
  created: boolean
}

export async function saveEnquiry(sb: SupabaseClient, company: EnquiryCompany, input: EnquiryInput, nowMs: number = Date.now()): Promise<SaveResult> {
  const fail = (status: number, error: string): SaveResult => ({ status, body: { error }, created: false })

  const hourAgo = new Date(nowMs - 3600 * 1000).toISOString()
  const recent = await sb.from('quote_requests').select('id', { count: 'exact', head: true }).eq('user_id', company.ownerId).gte('created_at', hourAgo)
  if (!recent.error && (recent.count ?? 0) >= ENQUIRIES_PER_HOUR) return fail(429, 'This form is very busy at the moment. Please try again in a little while, or phone us.')

  // the same person twice in a few minutes: say it worked, keep one
  const since = new Date(nowMs - DUPLICATE_MINUTES * 60 * 1000).toISOString()
  for (const [col, val] of [['client_email', input.email], ['client_phone', input.phone]] as const) {
    if (!val) continue
    const dup = await sb.from('quote_requests').select('id').eq('user_id', company.ownerId).eq(col, val).gte('created_at', since).limit(1)
    const hit = Array.isArray(dup.data) ? dup.data[0] : null
    if (!dup.error && hit?.id) return { status: 200, body: { ok: true, id: hit.id as string }, created: false }
  }

  const row = leadRowFromEnquiry(input, company.ownerId)
  let ins = await sb.from('quote_requests').insert(row).select('id').single()
  if (ins.error && isMissingSchema(ins.error)) {
    // supabase/leads.sql has not been run on this database: the lead is still saved, without its "where it came from"
    const { source: _s, ...plain } = row
    ins = await sb.from('quote_requests').insert(plain).select('id').single()
  }
  if (ins.error || !ins.data) {
    console.error('[enquiry] could not save:', ins.error)
    return fail(500, 'Sorry, we could not send that just now. Please try again, or phone us.')
  }
  return { status: 200, body: { ok: true, id: (ins.data as { id: string }).id }, created: true }
}

// ── Claiming a link name (the setup window) ─────────────────────────────────────────────────────────────────────

/** A company may hold this many link names in all (its current one and the old ones that still work), so names cannot be hoarded */
export const MAX_SLUGS_PER_COMPANY = 5

export type ClaimResult =
  | { ok: true; slug: string }
  | { ok: false; error: string }

/** Gives the company this link name: it becomes the one shown, and any earlier one keeps working. A name another company has (or ever had) is refused. */
export async function claimSlug(sb: SupabaseClient, ownerId: string, rawSlug: string): Promise<ClaimResult> {
  const slug = (rawSlug || '').trim().toLowerCase()
  const problem = slugProblem(slug)
  if (problem) return { ok: false, error: problem }

  const mine = await sb.from('enquiry_slugs').select('slug').eq('user_id', ownerId)
  if (mine.error) return { ok: false, error: isMissingSchema(mine.error) ? 'The enquiry form has not been set up on this database yet (supabase/enquiry-form.sql).' : 'Could not check your link names just now. Please try again.' }
  const have = ((mine.data ?? []) as { slug: string }[]).map(r => r.slug)

  if (!have.includes(slug)) {
    if (have.length >= MAX_SLUGS_PER_COMPANY) return { ok: false, error: `A company can have up to ${MAX_SLUGS_PER_COMPANY} link names, including its old ones. Please go back to one you had before.` }
    const ins = await sb.from('enquiry_slugs').insert({ slug, user_id: ownerId })
    if (ins.error) {
      if (ins.error.code === '23505') return { ok: false, error: 'That name is already taken. Please choose another.' }
      return { ok: false, error: 'Could not save that name just now. Please try again.' }
    }
  }
  const upd = await sb.from('settings').update({ enquiry_slug: slug }).eq('user_id', ownerId)
  if (upd.error) return { ok: false, error: isMissingSchema(upd.error) ? 'The enquiry form has not been set up on this database yet (supabase/enquiry-form.sql).' : 'Could not save that name just now. Please try again.' }
  return { ok: true, slug }
}

/** Whether a name is free for this company to take: free, already its own, or taken by someone else */
export async function slugAvailability(sb: SupabaseClient, ownerId: string, rawSlug: string): Promise<'free' | 'yours' | 'taken' | 'invalid' | 'unknown'> {
  const slug = (rawSlug || '').trim().toLowerCase()
  if (slugProblem(slug)) return 'invalid'
  const r = await sb.from('enquiry_slugs').select('user_id').eq('slug', slug).maybeSingle()
  if (r.error) return 'unknown'
  const owner = (r.data as { user_id?: string } | null)?.user_id
  if (!owner) return 'free'
  return owner === ownerId ? 'yours' : 'taken'
}
