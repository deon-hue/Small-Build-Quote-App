// Turns an email (or a message pasted in) into the parts of a lead: who it is from, how to reach them, and what they said.
//   • An email forwarded to the company's leads address: the person is in the forwarded message ("From: Sam Jones <sam@example.com>"), not the sender, who is the builder passing it on. What the builder typed above it is a note.
//   • An email a customer sent straight to the leads address: the sender is the person.
//   • A note the builder typed to themselves ("Mrs Patel 07700 900123 wants a loft conversion"): the details are in the words.
// Pure, no database and no network, so it is tested on its own. The database half is lib/lead-email-submit.ts and the route is app/api/email-ingest.

export interface ParsedLead {
  name: string
  email: string
  phone: string
  /** what they wrote, tidied (quoted replies and the forwarding line removed), up to 5000 characters */
  message: string
  /** the subject of the email they wrote (the original one when forwarded), without Fw:/Re:/LEAD: */
  subject: string
  /** what the builder typed above a forwarded message, kept as a private note */
  note: string
  forwarded: boolean
  /** the sender is the company itself (so no one needs telling a lead has come in) */
  fromBuilder: boolean
}

export const MESSAGE_MAX = 5000

// ── small helpers ───────────────────────────────────────────────────────────────────────────────────────────────

/** An email's HTML body as plain lines (Power Automate hands the body over as HTML). Plain text is returned as it is. */
export function plainText(body: string): string {
  const b = (body || '').replace(/\r\n?/g, '\n')
  if (!/<\s*(html|body|div|p|br|table|span)\b/i.test(b)) return b
  return b
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\s*(p|div)\b[^>]*>/gi, '\n').replace(/<\/\s*(p|div|tr|li|h[1-6])\s*>/gi, '\n').replace(/<\/\s*t[dh]\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
}

/** "Fwd: Re: LEAD: Loft quote" → "Loft quote" */
export function cleanSubject(subject: string): string {
  let s = (subject || '').replace(/[\r\n\t]+/g, ' ').trim()
  for (let i = 0; i < 6; i++) {
    const next = s.replace(/^\s*(?:fw|fwd|re)\s*:\s*/i, '').replace(/^\s*lead\s*(?::|\s[-–])\s*/i, '')
    if (next === s) break
    s = next
  }
  return s.trim().slice(0, 200)
}

/** Is the subject tagged as a lead ("LEAD: ...", "Fwd: LEAD - ...")? */
export function hasLeadTag(subject: string): boolean {
  return /^\s*(?:(?:fw|fwd|re)\s*:\s*)*lead\s*(?::|\s[-–]\s)/i.test(subject || '')
}

const EMAIL_RX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

/** The first email address in some text that is not one of `skip` (lower case) */
export function extractEmail(text: string, skip: string[] = []): string {
  const rx = new RegExp(EMAIL_RX.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = rx.exec(text || '')) !== null) { const e = m[0].toLowerCase().replace(/[.,;:]+$/, ''); if (!skip.includes(e)) return e }
  return ''
}

/** The first phone number in some text, as it was written. A UK number (07…, 01…, 02…, +44…) or an international one with a plus; dates, postcodes and prices are not numbers like that. */
export function extractPhone(text: string): string {
  const rx = /(?<![\w.])(\+?\(?\d[\d \t().-]{7,18}\d)(?![\w])/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(text || '')) !== null) {
    const raw = m[1].trim()
    const digits = raw.replace(/\D/g, '')
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(raw) || /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(raw)) continue   // a date
    const uk = /^(?:0|\+?44)\d{9,10}$/.test(digits.replace(/^\+/, '').replace(/^440/, '0').replace(/^44/, '0'))
    const intl = raw.startsWith('+') && digits.length >= 10 && digits.length <= 15
    if ((uk && digits.length >= 10 && digits.length <= 13) || intl) return raw.replace(/\s+/g, ' ')
  }
  return ''
}

/** Name and address out of "Sam Jones <sam@example.com>", '"Jones, Sam" <sam@x.com>' or a bare address */
export function parseAddress(v: string): { name: string; email: string } {
  const s = (v || '').trim()
  const m = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(s)
  if (m) return { name: tidyName(m[1]), email: m[2].toLowerCase() }
  const e = extractEmail(s)
  return { name: '', email: e }
}

function tidyName(n: string): string {
  let s = (n || '').replace(/^["'\s]+|["'\s]+$/g, '').trim()
  const comma = /^([^,]+),\s*([^,]+)$/.exec(s)   // "Jones, Sam" → "Sam Jones"
  if (comma && !/\d|@/.test(s)) s = `${comma[2].trim()} ${comma[1].trim()}`
  if (/@/.test(s) || s.length > 80) return ''
  return s
}

/** A name guessed from a short first line such as "Mrs Patel" or "Sam Jones, Chalfont": 1 to 4 capitalised words, no digits. */
const NOT_A_NAME = new Set(['hi', 'hello', 'hey', 'hiya', 'dear', 'lead', 'leads', 'enquiry', 'enquiries', 'quote', 'quotes', 'fw', 'fwd', 're', 'thanks', 'thank', 'regards', 'help', 'please', 'phone', 'tel', 'telephone', 'mobile', 'email', 'name', 'address', 'from', 'to', 'subject', 'date', 'sent', 'cc', 'note', 'notes', 'message', 'new', 'good', 'morning', 'afternoon', 'evening'])
export function nameFromLine(line: string): string {
  const l = (line || '').replace(/^\s*lead\s*(?::|\s[-–])\s*/i, '').trim().replace(/[,:;.-]+\s.*$/, '').trim()
  if (!l || l.length > 40 || /\d|@/.test(l) || l.split(/\s+/).some(w => NOT_A_NAME.has(w.toLowerCase().replace(/[^a-z]/g, '')))) return ''
  return /^(?:(?:Mr|Mrs|Ms|Miss|Dr|Mx)\.?\s+)?[A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*){0,3}$/.test(l) ? l : ''
}

// ── a forwarded message ─────────────────────────────────────────────────────────────────────────────────────────

const FWD_MARKER = /^[\s>*_-]*(?:-{2,}\s*forwarded message\s*-{2,}|begin forwarded message:?|-{2,}\s*original message\s*-{2,}|_{8,}|forwarded message:?)[\s>*_-]*$/i
const HEADER_LINE = /^[\s>*_]*([A-Za-z-]+)\s*:\*?\s*(.*)$/

interface Forwarded { before: string; from: string; subject: string; body: string }

/** Finds a forwarded message in an email's words: a block of header lines (From:, Sent:/Date:, To:, Subject:) and what follows. The words above it are what the person forwarding typed. */
export function splitForwarded(text: string): Forwarded | null {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^[\s>*_]*from\s*:\*?\s*(.+)$/i.exec(lines[i])
    if (!m) continue
    // a header block: another header line (Subject, Sent, Date or To) within the next few lines
    let subjectSeen = false, otherSeen = false
    for (let j = i + 1; j < Math.min(lines.length, i + 9); j++) {
      const h = HEADER_LINE.exec(lines[j]); if (!h) { if (!lines[j].trim()) break; continue }
      const k = h[1].toLowerCase(); if (k === 'subject') subjectSeen = true; if (['sent', 'date', 'to', 'cc'].includes(k)) otherSeen = true
    }
    if (!subjectSeen || !otherSeen) continue
    let from = m[1].trim(), subject = ''
    let j = i + 1
    for (; j < lines.length; j++) {
      if (!lines[j].trim()) { if (j + 1 < lines.length && HEADER_LINE.test(lines[j + 1]) && /^(subject|sent|date|to|cc|reply-to)$/i.test((HEADER_LINE.exec(lines[j + 1]) as RegExpExecArray)[1])) continue; break }
      const h = HEADER_LINE.exec(lines[j]); if (!h) break
      const k = h[1].toLowerCase()
      if (k === 'subject') subject = h[2].trim()
    }
    // a "From:" whose value runs on to the next line (an address in angle brackets split over lines) is rare; the value as found is used
    const before = lines.slice(0, i).filter(l => !FWD_MARKER.test(l)).join('\n').trim()
    const body = lines.slice(j + 1).join('\n').trim()
    return { before, from, subject, body }
  }
  return null
}

/** What a person wrote, without the quoted reply under it ("> ..." lines and an "On <date>, X wrote:" line onward) */
export function stripQuoted(text: string): string {
  const lines = (text || '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  for (const l of lines) {
    if (/^\s*on .{5,120}wrote:\s*$/i.test(l) || /^\s*-{2,}\s*original message\s*-{2,}\s*$/i.test(l) || /^\s*_{8,}\s*$/.test(l)) break
    if (/^\s*>/.test(l)) continue
    out.push(l)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const cap = (s: string) => s.trim().slice(0, MESSAGE_MAX)

// ── the lead from an email ──────────────────────────────────────────────────────────────────────────────────────

export interface EmailForLead { from: string; fromEmail: string; subject: string; body: string }

/** `ownEmails`: the addresses of the company itself (lower case), to tell a builder forwarding an enquiry from a customer writing to the leads address. */
export function parseLeadEmail(email: EmailForLead, ownEmails: string[] = []): ParsedLead {
  const own = ownEmails.map(x => x.trim().toLowerCase()).filter(Boolean)
  const text = plainText(email.body)
  const fromBuilder = !!email.fromEmail && own.includes(email.fromEmail.toLowerCase())
  const fwd = splitForwarded(text)

  if (fwd) {
    const who = parseAddress(fwd.from)
    const msg = stripQuoted(fwd.body) || fwd.body
    const phone = extractPhone(msg) || extractPhone(fwd.body)
    const email2 = who.email || extractEmail(msg, own)
    return {
      name: who.name || nameFromLine(fwd.from) || '',
      email: own.includes(email2) ? '' : email2, phone,
      message: cap(msg), subject: cleanSubject(fwd.subject || email.subject), note: cap(fwd.before),
      forwarded: true, fromBuilder,
    }
  }

  if (fromBuilder) {
    // a note the builder typed to themselves: the details are in the words
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const subj = cleanSubject(email.subject)
    const name = nameFromLine(lines[0] || '') || nameFromLine(subj)
    return { name, email: extractEmail(text, own), phone: extractPhone(text), message: cap(text), subject: subj, note: '', forwarded: false, fromBuilder: true }
  }

  // a customer writing straight to the leads address
  const who = parseAddress(email.from)
  const msg = stripQuoted(text) || text.trim()
  return {
    name: who.name || '', email: (email.fromEmail || who.email || '').toLowerCase(), phone: extractPhone(msg),
    message: cap(msg), subject: cleanSubject(email.subject), note: '', forwarded: false, fromBuilder: false,
  }
}

/** A message pasted into "Add a lead": an email with its headers, or just the words. Gives what can be found; the rest is left for the builder to type. */
export function parsePastedMessage(text: string): { name: string; email: string; phone: string; want: string; kind: 'email' | 'chat' | 'text' } {
  const t = plainText(text).trim()
  const fwd = splitForwarded(t)
  if (fwd) {
    const who = parseAddress(fwd.from)
    const msg = stripQuoted(fwd.body) || fwd.body
    return { name: who.name || '', email: who.email || extractEmail(msg), phone: extractPhone(msg), want: cap(msg), kind: 'email' }
  }
  // "Name: message" chat lines (WhatsApp, Messenger): the first speaker is the person
  const chat = /^\s*(?:\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]m)?\]?\s*[-–]?\s*)?([A-Z][A-Za-z'’ -]{1,30}):\s+\S/m.exec(t)
  const chatName = chat && !/^(from|to|subject|date|sent|cc|re|fw|fwd|tel|phone|mobile|email|address|name)$/i.test(chat[1].trim()) ? nameFromLine(chat[1].trim()) : ''
  const first = t.split('\n').map(l => l.trim()).filter(Boolean)[0] || ''
  return { name: chatName || nameFromLine(first), email: extractEmail(t), phone: extractPhone(t), want: cap(t), kind: chatName ? 'chat' : 'text' }
}
