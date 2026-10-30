// The database half of booking a site visit: what booking, changing or cancelling does to the lead. The client is passed in so it can be tested with a stand-in; the rules are in lib/lead-visit.ts,
// the email is lib/lead-visit-email.ts and the route that ties them together is app/api/leads/visit.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingSchema } from './enquiry-submit'
import { addDays, leadStatusOf } from './leads'
import { localParts, type VisitInput } from './lead-visit'

export interface LeadVisitRow {
  id: string
  client_name: string
  client_email: string
  client_phone: string
  project_address: string
  status: string
  chase_on?: string | null
  visit_at?: string | null
  visit_minutes?: number
  visit_note?: string
  visit_address?: string
  visit_status?: string
  visit_seq?: number
}

export type VisitKind = 'booked' | 'changed' | 'cancelled'

export type ApplyResult =
  | { ok: true; kind: VisitKind; lead: LeadVisitRow; /** the visit as it was before (for 'it was ...' in the email) */ was: { at: string; minutes: number } | null }
  | { ok: false; error: string; status: number }

const NEEDS_SQL = 'Booking visits has not been set up on this database yet. Run supabase/lead-visits.sql in the Supabase SQL editor, then try again.'
const COLUMNS = 'id, client_name, client_email, client_phone, project_address, status, chase_on, visit_at, visit_minutes, visit_note, visit_address, visit_status, visit_seq'

export async function applyVisit(sb: SupabaseClient, userId: string, leadId: string, v: VisitInput & { startIso: string }): Promise<ApplyResult> {
  const found = await sb.from('quote_requests').select(COLUMNS).eq('id', leadId).eq('user_id', userId).maybeSingle()
  if (found.error) return { ok: false, status: isMissingSchema(found.error) ? 409 : 500, error: isMissingSchema(found.error) ? NEEDS_SQL : 'Could not read that lead just now. Please try again.' }
  const lead = found.data as LeadVisitRow | null
  if (!lead) return { ok: false, status: 404, error: 'That lead could not be found.' }

  const hasVisit = lead.visit_status === 'booked' && !!lead.visit_at
  const was = hasVisit ? { at: lead.visit_at as string, minutes: lead.visit_minutes || 60 } : null
  const seq = (lead.visit_seq ?? 0) + 1
  const stage = leadStatusOf(lead.status)
  const patch: Record<string, unknown> = { visit_seq: seq }
  let kind: VisitKind

  if (v.action === 'cancel') {
    if (!hasVisit) return { ok: false, status: 400, error: 'There is no visit booked to cancel.' }
    kind = 'cancelled'
    patch.visit_status = 'cancelled'
    if (stage === 'visit') patch.status = 'contacted'   // it is no longer waiting for a visit
  } else {
    kind = hasVisit ? 'changed' : 'booked'
    // an address typed for the visit that is just the lead's own address is not stored twice
    const own = (lead.project_address || '').trim()
    Object.assign(patch, {
      visit_at: v.startIso, visit_minutes: v.minutes, visit_note: v.note, visit_address: v.address && v.address !== own ? v.address : '', visit_status: 'booked',
    })
    if (stage === 'pending' || stage === 'contacted') patch.status = 'visit'
    const day = localParts(v.startIso)?.ymd
    if (day) patch.chase_on = addDays(day, 1)   // a reminder to follow up the day after the visit
  }

  let upd = await sb.from('quote_requests').update(patch).eq('id', leadId).eq('user_id', userId)
  if (upd.error && isMissingSchema(upd.error) && 'chase_on' in patch) { const { chase_on: _c, ...plain } = patch; upd = await sb.from('quote_requests').update(plain).eq('id', leadId).eq('user_id', userId) }
  if (upd.error) {
    console.error('[lead-visit] could not save:', upd.error)
    return { ok: false, status: isMissingSchema(upd.error) ? 409 : 500, error: isMissingSchema(upd.error) ? NEEDS_SQL : 'Could not save the visit just now. Please try again.' }
  }
  return { ok: true, kind, was, lead: { ...lead, ...patch } as LeadVisitRow }
}
