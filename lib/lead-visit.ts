// Booking a site visit with a lead. This file is the pure rules, so they can be tested on their own: what a booking must contain, UK date and time handling (a visit is entered as UK wall-clock time and stored as a
// moment in UTC, so the clocks changing never moves it), the words the customer is sent, and the calendar file ("add to calendar") that goes with the email.
// The database half is lib/lead-visit-submit.ts, the email is lib/lead-visit-email.ts, the route is app/api/leads/visit and the screens are the Leads page and the Calendar.

export type VisitAction = 'book' | 'reschedule' | 'cancel'
export const VISIT_MIN_MINUTES = 15
export const VISIT_MAX_MINUTES = 480
export const VISIT_DEFAULT_MINUTES = 60
export const VISIT_NOTE_MAX = 500
export const VISIT_ADDRESS_MAX = 300
const TZ = 'Europe/London'

// ── UK time ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** How many minutes London is ahead of UTC at a given moment (0 in winter, 60 in summer) */
function londonOffsetMin(ms: number): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms))
  const g = (t: string) => Number(p.find(x => x.type === t)?.value ?? 0)
  return Math.round((Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ms / 1000) * 1000) / 60000)
}

/** A UK wall-clock date and time ('2026-11-04', '10:00') as the real moment, in ISO UTC. Null if it is not a real date or time, or does not exist (the hour the clocks go forward). */
export function ukLocalToUtcIso(ymd: string, hm: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || ''), t = /^(\d{1,2}):(\d{2})$/.exec(hm || '')
  if (!d || !t) return null
  const [y, mo, da, h, mi] = [+d[1], +d[2], +d[3], +t[1], +t[2]]
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null
  const probe = new Date(Date.UTC(y, mo - 1, da))
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== da) return null   // 31 November
  const guess = Date.UTC(y, mo - 1, da, h, mi)
  const off1 = londonOffsetMin(guess)
  let ms = guess - off1 * 60000
  const off2 = londonOffsetMin(ms)
  if (off2 !== off1) ms = guess - off2 * 60000
  // the time must read back the same in London (it does not in the hour that is skipped when the clocks go forward)
  const back = localParts(new Date(ms).toISOString())
  return back && back.ymd === ymd && back.hm === `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}` ? new Date(ms).toISOString() : null
}

/** A moment as the UK date ('2026-11-04') and time ('10:00') it is on a London clock, for filling the form back in or drawing the day it is on */
export function localParts(iso: string | null | undefined): { ymd: string; hm: string } | null {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return null
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t))
  const g = (k: string) => p.find(x => x.type === k)?.value ?? ''
  return { ymd: `${g('year')}-${g('month')}-${g('day')}`, hm: `${g('hour')}:${g('minute')}` }
}

/** The weekday, day and month of a moment on a London clock, built from its parts so the words never depend on a computer's punctuation ("Wednesday, 4 November" in some) */
function dayWords(t: number, weekday: 'long' | 'short', month: 'long' | 'short', withYear: boolean): string {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday, day: 'numeric', month, year: 'numeric' }).formatToParts(new Date(t))
  const g = (k: string) => p.find(x => x.type === k)?.value ?? ''
  return [g('weekday'), g('day'), g('month'), withYear ? g('year') : ''].filter(Boolean).join(' ')
}

/** 'Wednesday 4 November 2026 at 10:00' */
export function visitWhenLong(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return `${dayWords(t, 'long', 'long', true)} at ${localParts(iso)?.hm ?? ''}`
}

/** 'Wed 4 Nov, 10:00' */
export function visitWhenShort(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return `${dayWords(t, 'short', 'short', false)}, ${localParts(iso)?.hm ?? ''}`
}

/** 'about an hour', 'about 90 minutes', 'about 2 hours' */
export function durationWords(minutes: number): string {
  const m = Math.round(minutes)
  if (m === 60) return 'about an hour'
  if (m < 60) return `about ${m} minutes`
  if (m % 60 === 0) return `about ${m / 60} hours`
  if (m === 90) return 'about an hour and a half'
  return `about ${m} minutes`
}

// ── What a booking request must contain ─────────────────────────────────────────────────────────────────────────

export interface VisitInput {
  action: VisitAction
  /** UK date and time, for book and reschedule */
  date: string
  time: string
  minutes: number
  note: string
  address: string
  sendEmail: boolean
}

export type VisitCheck = { ok: true; value: VisitInput & { startIso: string } } | { ok: false; error: string }

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim().slice(0, max) : '')

/** Checks what the Leads page sent. Nothing is trusted: a date that is not real, a time in the past or in the skipped hour, or a length that is not a sensible number is refused with a plain sentence. */
export function checkVisitInput(raw: unknown, nowMs: number): VisitCheck {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Something went wrong. Please try again.' }
  const b = raw as Record<string, unknown>
  const action = b.action === 'reschedule' ? 'reschedule' : b.action === 'cancel' ? 'cancel' : b.action === 'book' ? 'book' : null
  if (!action) return { ok: false, error: 'Something went wrong. Please try again.' }
  const sendEmail = b.sendEmail === true
  if (action === 'cancel') return { ok: true, value: { action, date: '', time: '', minutes: VISIT_DEFAULT_MINUTES, note: text(b.note, VISIT_NOTE_MAX), address: '', sendEmail, startIso: '' } }

  const date = text(b.date, 10), time = text(b.time, 5)
  if (!date) return { ok: false, error: 'Please choose the date of the visit.' }
  if (!time) return { ok: false, error: 'Please choose the time of the visit.' }
  const startIso = ukLocalToUtcIso(date, time)
  if (!startIso) return { ok: false, error: 'That date or time is not valid (the hour the clocks go forward does not exist).' }
  const t = Date.parse(startIso)
  if (t < nowMs - 5 * 60 * 1000) return { ok: false, error: 'That time has already passed. Please choose a time in the future.' }
  if (t > nowMs + 2 * 365 * 24 * 3600 * 1000) return { ok: false, error: 'That date is too far ahead. Please check the year.' }
  const minutes = typeof b.minutes === 'number' ? Math.round(b.minutes) : NaN
  if (!Number.isFinite(minutes) || minutes < VISIT_MIN_MINUTES || minutes > VISIT_MAX_MINUTES) return { ok: false, error: `The visit should be between ${VISIT_MIN_MINUTES} minutes and ${VISIT_MAX_MINUTES / 60} hours long.` }
  if (typeof b.note === 'string' && b.note.trim().length > VISIT_NOTE_MAX) return { ok: false, error: `Please keep the note to ${VISIT_NOTE_MAX} characters or fewer.` }
  if (typeof b.address === 'string' && b.address.trim().length > VISIT_ADDRESS_MAX) return { ok: false, error: `Please keep the address to ${VISIT_ADDRESS_MAX} characters or fewer.` }
  return { ok: true, value: { action, date, time, minutes, note: text(b.note, VISIT_NOTE_MAX), address: text(b.address, VISIT_ADDRESS_MAX), sendEmail, startIso } }
}

// ── The words the customer is sent ──────────────────────────────────────────────────────────────────────────────

export interface VisitWords {
  kind: 'booked' | 'changed' | 'cancelled'
  companyName: string
  /** the customer's first name, or '' */
  firstName: string
  whenLong: string
  minutes: number
  address: string
  note: string
  /** the company's phone number, if it has one */
  phone: string
  /** the earlier time, when it was changed or cancelled */
  wasLong?: string
}

/** The plain-words message: it is the email's text version AND what is put in a WhatsApp message to a customer with no email address */
export function visitMessageText(w: VisitWords): string {
  const hi = w.firstName ? `Hello ${w.firstName},` : 'Hello,'
  const where = w.address ? ` at ${w.address.replace(/\s*\n\s*/g, ', ')}` : ''
  const reply = w.phone ? `If you need to change it, please reply or call us on ${w.phone}.` : 'If you need to change it, please reply.'
  const sign = `Kind regards\n${w.companyName}`
  if (w.kind === 'cancelled') {
    return `${hi}\n\nWe are sorry, but we need to cancel the site visit${w.wasLong ? ` we had booked for ${w.wasLong}` : ''}. We will be in touch to arrange another time${w.phone ? `, or you can call us on ${w.phone}` : ''}.\n\n${sign}`
  }
  const when = w.kind === 'changed'
    ? `The time of your site visit has changed${w.wasLong ? ` (it was ${w.wasLong})` : ''}. We will now see you on ${w.whenLong}${where}.`
    : `Thank you for your enquiry. We have booked a visit to look at the job: ${w.whenLong}${where}.`
  return [hi, `${when} It should take ${durationWords(w.minutes)}.`, w.note, reply, sign].filter(Boolean).join('\n\n')
}

// ── The calendar file ───────────────────────────────────────────────────────────────────────────────────────────

/** The same visit always has the same id, so a changed or cancelled visit UPDATES the entry in the customer's calendar instead of adding another */
export const visitUid = (leadId: string) => `visit-${leadId}@buildospro.ai`

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
/** a line longer than 75 characters continues on the next line after a space (RFC 5545) */
const fold = (line: string) => { const out: string[] = []; let rest = line; while (rest.length > 73) { out.push(rest.slice(0, 73)); rest = ' ' + rest.slice(73) } out.push(rest); return out.join('\r\n') }
const icsTime = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

export interface VisitIcs {
  uid: string
  startIso: string
  minutes: number
  summary: string
  location: string
  description: string
  /** how many times the visit has changed: a higher number replaces the earlier entry */
  sequence: number
  cancelled?: boolean
  nowMs?: number
}

/** A calendar file (.ics) for the visit. It is a plain "add to calendar" entry; changing it later sends the same entry again with a higher sequence number, and a cancelled visit is the same entry marked cancelled. */
export function buildVisitIcs(v: VisitIcs): string {
  const start = Date.parse(v.startIso)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BuildOS Pro//Site visit//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${v.uid}`, `DTSTAMP:${icsTime(v.nowMs ?? Date.now())}`, `SEQUENCE:${Math.max(0, Math.round(v.sequence))}`,
    `DTSTART:${icsTime(start)}`, `DTEND:${icsTime(start + Math.max(15, Math.round(v.minutes)) * 60000)}`,
    `SUMMARY:${icsEscape(v.cancelled ? `CANCELLED: ${v.summary}` : v.summary)}`,
    ...(v.location ? [`LOCATION:${icsEscape(v.location)}`] : []),
    ...(v.description ? [`DESCRIPTION:${icsEscape(v.description)}`] : []),
    `STATUS:${v.cancelled ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE',
    'END:VEVENT', 'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}
