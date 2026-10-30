// Leads: an enquiry that has not been quoted yet. They live in the quote_requests table (the website quote form already fills it), extended with where the lead came from, a date to chase it,
// and how it ended. This file is the pure rules (stages, sources, who is due for a chase, whether two entries are the same person, a WhatsApp link) so they can be tested on their own;
// the screens are app/(app)/quote-requests/page.tsx (the list) and the dashboard's Leads card.

/** The stages of a lead. 'pending' is stored for New (that is what the website form has always written), and the three older words are still read: reviewing = Contacted, accepted = Won, declined = Lost. */
export type LeadStatus = 'pending' | 'contacted' | 'visit' | 'quoting' | 'won' | 'lost'

export const LEAD_STATUSES: LeadStatus[] = ['pending', 'contacted', 'visit', 'quoting', 'won', 'lost']
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = { pending: 'New', contacted: 'Contacted', visit: 'Site visit', quoting: 'Quoting', won: 'Won', lost: 'Lost' }
export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = { pending: 'b-pending', contacted: 'b-sent', visit: 'b-progress', quoting: 'b-progress', won: 'b-active', lost: 'b-declined' }

/** Any status word found in the table, old or new, as one of the six stages */
export function leadStatusOf(raw: string | null | undefined): LeadStatus {
  switch ((raw || '').trim().toLowerCase()) {
    case 'contacted': case 'reviewing': return 'contacted'
    case 'visit': return 'visit'
    case 'quoting': return 'quoting'
    case 'won': case 'accepted': return 'won'
    case 'lost': case 'declined': return 'lost'
    default: return 'pending'
  }
}

/** Still being worked on: not won and not lost */
export const isOpenLead = (raw: string | null | undefined) => { const s = leadStatusOf(raw); return s !== 'won' && s !== 'lost' }

export const LEAD_SOURCES = ['My contacts', 'Phone call', 'WhatsApp', 'Email', 'Facebook', 'Instagram', 'TikTok', 'Google', 'QR code', 'Leaflet / van', 'Website form', 'Referral', 'Other'] as const
export const LOST_REASONS = ['Too expensive', 'Not ready yet', 'Chose someone else', 'Out of my area', 'Not the kind of job I do', 'No reply', 'Other'] as const

/** Today as YYYY-MM-DD in the UK (the date a "chase on" is compared with), whatever the computer's own zone */
export function todayUk(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const g = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

/** A date `days` after another (YYYY-MM-DD), done in whole days so a clock change never moves it */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + days))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

/** An open lead whose chase date is today or has passed */
export function isDueForChase(l: { status: string; chase_on?: string | null }, today: string): boolean {
  return isOpenLead(l.status) && !!l.chase_on && l.chase_on <= today
}
/** ...and one that is past, not just today, for the red wording */
export const isOverdue = (l: { status: string; chase_on?: string | null }, today: string) => isOpenLead(l.status) && !!l.chase_on && l.chase_on < today

/** A YYYY-MM-DD as a whole number of days, so two dates can be subtracted */
const dayNumber = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5) }

/** How the chase date reads: "today", "tomorrow", "2 days ago", "in 3 days", or a date a fortnight or more away */
export function chaseWords(chaseOn: string | null | undefined, today: string): string {
  if (!chaseOn) return ''
  const days = dayNumber(chaseOn) - dayNumber(today)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days < 0) return `${-days} days ago`
  if (days < 14) return `in ${days} days`
  return new Date(chaseOn + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const digits = (s: string) => (s || '').replace(/\D/g, '')
/** A UK phone as comparable digits: 07700 900123, +44 7700 900123 and 0044 7700 900123 all give 7700900123. Anything shorter than 9 digits is not a number worth matching on. */
export function phoneKey(phone: string): string {
  let d = digits(phone)
  if (d.startsWith('0044')) d = d.slice(4)
  else if (d.startsWith('44') && d.length >= 11) d = d.slice(2)
  else if (d.startsWith('0')) d = d.slice(1)
  return d.length >= 9 ? d : ''
}
export const emailKey = (email: string) => { const e = (email || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+$/.test(e) ? e : '' }

/** Whether an entry already exists for this person: the same email, or the same phone number. Returns the first match. */
export function findSamePerson<T extends { email?: string | null; phone?: string | null }>(person: { email?: string; phone?: string }, others: T[]): T | null {
  const e = emailKey(person.email || ''), p = phoneKey(person.phone || '')
  if (!e && !p) return null
  return others.find(o => (e && emailKey(o.email || '') === e) || (p && phoneKey(o.phone || '') === p)) ?? null
}

/** A WhatsApp chat link for a UK mobile or landline (wa.me wants the number with the country code and no plus), or '' when there is no usable number */
export function whatsappLink(phone: string): string {
  const k = phoneKey(phone)
  return k ? `https://wa.me/44${k}` : ''
}

/** What to say a lead is, in one line: the kind of job and where, or the first words of what they asked for */
export function leadHeadline(l: { project_type?: string | null; project_address?: string | null; scope_text?: string | null }): string {
  const bits = [l.project_type, l.project_address].map(x => (x || '').trim()).filter(Boolean)
  if (bits.length) return bits.join(' · ')
  const t = (l.scope_text || '').replace(/\s+/g, ' ').trim()
  return t.length > 90 ? t.slice(0, 89).trimEnd() + '…' : t
}

// ── The address and its postcode ──────────────────────────────────────────────────────────────────────────────────
// A lead keeps ONE address text (quote_requests.project_address, 'Chalfont, 5 Oak Road, SL2 3SU': the website form, the enquiry form and an email all write it that way), so no new column is needed. The screens show the
// postcode as its own field and put the two back together on save; the postcode is also a link to Google Maps.

const UK_POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi

/** A UK postcode written the usual way: capitals, one space before the last three characters (sl23su → SL2 3SU). Anything that is not shaped like one is returned trimmed and in capitals. */
export function tidyPostcode(pc: string): string {
  const s = (pc || '').trim().toUpperCase().replace(/\s+/g, ' ')
  const m = /^([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})$/.exec(s)
  return m ? `${m[1]} ${m[2]}` : s
}

/** Splits an address text into the address and its postcode (the last UK postcode in it); the postcode is tidied and taken out, with the comma that was beside it. No postcode found: it all stays the address. */
export function splitPostcode(text: string | null | undefined): { address: string; postcode: string } {
  const t = (text || '').trim()
  let last: RegExpExecArray | null = null
  const rx = new RegExp(UK_POSTCODE.source, 'gi')
  for (let m = rx.exec(t); m; m = rx.exec(t)) last = m
  if (!last) return { address: t, postcode: '' }
  const before = t.slice(0, last.index).replace(/[\s,;-]+$/, '')
  const after = t.slice(last.index + last[0].length).replace(/^[\s,;-]+/, '')
  return { address: [before, after].filter(Boolean).join(', '), postcode: tidyPostcode(`${last[1]} ${last[2]}`) }
}

/** The address and postcode as one text again: '5 Oak Road, Chalfont, SL2 3SU' */
export function joinAddress(address: string | null | undefined, postcode: string | null | undefined): string {
  return [(address || '').trim().replace(/[\s,]+$/, ''), tidyPostcode(postcode || '')].filter(Boolean).join(', ')
}

/** A Google Maps link for an address and/or postcode (opens the map search), or '' when there is nothing to look up. The postcode alone is enough for a map. */
export function mapsUrl(address: string | null | undefined, postcode: string | null | undefined): string {
  const q = [(address || '').trim(), tidyPostcode(postcode || '')].filter(Boolean).join(', ')
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q).replace(/'/g, '%27')}` : ''
}
