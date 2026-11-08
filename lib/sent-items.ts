// "Sent to them": the record of what the company has sent a lead or a contact (design ideas, photographs, AI drawings, a scope of works, a brief), by email or WhatsApp, kept in the app so the history is
// never only in a phone or an inbox. Pure rules only (what is accepted, how a record finds its person, the words for an email and a WhatsApp message): the database half is lib/sent-items-store.ts, the
// upload is lib/sent-items-upload.ts, the email is app/api/sent-items/send/route.ts and the table is supabase/sent-items.sql. Self-contained (no imports), so it can be hand-tested with plain Node.

export type SentChannel = 'email' | 'whatsapp' | 'other'
export type SentKind = 'sent' | 'logged'

export interface SentFile { name: string; path: string; isImage: boolean; size?: number }

export interface SentItem {
  id: string
  leadId: string | null
  clientId: string | null
  channel: SentChannel
  kind: SentKind
  subject: string
  body: string
  files: SentFile[]
  toName: string
  toEmail: string
  toPhone: string
  showInPortal: boolean
  sentAt: string
}

/** the most files in one message */
export const SENT_FILES_MAX = 20
/** an email's attachments together (the mail service takes about 40 MB; this leaves room) */
export const EMAIL_ATTACH_MAX_BYTES = 20 * 1024 * 1024
export const SUBJECT_MAX = 200
export const BODY_MAX = 8000

export const CHANNEL_LABEL: Record<SentChannel, string> = { email: 'Email', whatsapp: 'WhatsApp', other: 'Other' }
export const CHANNEL_ICON: Record<SentChannel, string> = { email: '✉️', whatsapp: '💬', other: '📨' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

const PATH = /^[0-9a-f-]{36}\/sent\/[A-Za-z0-9-]{1,60}\/[A-Za-z0-9._-]{1,140}$/i
/** Is this the path of a file made by the sent-items uploader? Anything else (another folder, `..`, a web address) is never trusted, wherever it came from. */
export function isSentFilePath(v: unknown): v is string {
  return typeof v === 'string' && PATH.test(v) && !v.includes('..')
}
/** The path belongs to this signed-in person's own folder (the first part is their id) */
export const isOwnSentPath = (v: unknown, userId: string): v is string => isSentFilePath(v) && v.startsWith(userId + '/sent/')

/** The list as it came out of the database (or a request), made safe: objects with a name and one of our own paths, at most SENT_FILES_MAX */
export function cleanSentFiles(raw: unknown): SentFile[] {
  if (!Array.isArray(raw)) return []
  const out: SentFile[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.slice(0, 200) : ''
    if (!name || !isSentFilePath(o.path)) continue
    const size = typeof o.size === 'number' && o.size >= 0 && Number.isFinite(o.size) ? Math.round(o.size) : undefined
    out.push({ name, path: o.path, isImage: o.isImage === true, ...(size !== undefined ? { size } : {}) })
    if (out.length >= SENT_FILES_MAX) break
  }
  return out
}

function str(v: unknown, max: number): string { return typeof v === 'string' ? v.trim().slice(0, max) : '' }

export interface SendInput {
  leadId: string | null
  clientId: string | null
  subject: string
  body: string
  files: SentFile[]
  showInPortal: boolean
}

/** What a request to email something must say, checked (nothing in it is trusted): who it is for, words or files, and only our own stored files. The address is never part of it: the server takes it from the lead or contact. */
export function checkSendInput(raw: unknown, userId: string): { ok: true; value: SendInput } | { ok: false; error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const leadId = b.leadId == null || b.leadId === '' ? null : b.leadId
  const clientId = b.clientId == null || b.clientId === '' ? null : b.clientId
  if (leadId !== null && !isUuid(leadId)) return { ok: false, error: 'That lead could not be found.' }
  if (clientId !== null && !isUuid(clientId)) return { ok: false, error: 'That contact could not be found.' }
  if (leadId === null && clientId === null) return { ok: false, error: 'Choose who this is for.' }
  if (typeof b.subject === 'string' && b.subject.length > SUBJECT_MAX) return { ok: false, error: `The subject is over ${SUBJECT_MAX} characters.` }
  if (typeof b.body === 'string' && b.body.length > BODY_MAX) return { ok: false, error: `The message is over ${BODY_MAX} characters. Put the rest in a file.` }
  const subject = str(b.subject, SUBJECT_MAX)
  const body = str(b.body, BODY_MAX)
  const rawFiles = Array.isArray(b.files) ? b.files : []
  if (rawFiles.length > SENT_FILES_MAX) return { ok: false, error: `Send at most ${SENT_FILES_MAX} files in one message.` }
  const files = cleanSentFiles(rawFiles)
  if (files.length !== rawFiles.length || !files.every(f => isOwnSentPath(f.path, userId))) return { ok: false, error: 'One of the files could not be used: add it again.' }
  if (!subject && !body && files.length === 0) return { ok: false, error: 'Write a message or add a file first.' }
  return { ok: true, value: { leadId: leadId as string | null, clientId: clientId as string | null, subject, body, files, showInPortal: b.showInPortal !== false } }
}

/** A row of the table, read safely */
export function sentItemFromRow(r: Record<string, unknown>): SentItem {
  const channel = r.channel === 'whatsapp' || r.channel === 'other' ? r.channel : 'email'
  return {
    id: String(r.id ?? ''),
    leadId: isUuid(r.lead_id) ? r.lead_id : null,
    clientId: isUuid(r.client_id) ? r.client_id : null,
    channel,
    kind: r.kind === 'logged' ? 'logged' : 'sent',
    subject: typeof r.subject === 'string' ? r.subject : '',
    body: typeof r.body === 'string' ? r.body : '',
    files: cleanSentFiles(r.files),
    toName: typeof r.to_name === 'string' ? r.to_name : '',
    toEmail: typeof r.to_email === 'string' ? r.to_email : '',
    toPhone: typeof r.to_phone === 'string' ? r.to_phone : '',
    showInPortal: r.show_in_portal !== false,
    sentAt: typeof r.sent_at === 'string' ? r.sent_at : '',
  }
}

/** Newest first; one with no date goes last */
export function sortSent(items: SentItem[]): SentItem[] {
  return [...items].sort((a, b) => (Date.parse(b.sentAt) || 0) - (Date.parse(a.sentAt) || 0))
}

/** Merges lists found different ways (by contact, by address, by lead) into one, each record once, newest first */
export function mergeSent(...lists: SentItem[][]): SentItem[] {
  const seen = new Map<string, SentItem>()
  for (const l of lists) for (const i of l) if (i.id && !seen.has(i.id)) seen.set(i.id, i)
  return sortSent([...seen.values()])
}

const emailKey = (e: string) => (e || '').trim().toLowerCase()
/** Does this record belong to this person: sent to their contact, or to the same email address, or from one of their leads */
export function belongsTo(item: SentItem, person: { clientId?: string | null; email?: string; leadIds?: string[] }): boolean {
  if (person.clientId && item.clientId === person.clientId) return true
  const e = emailKey(person.email || '')
  if (e && emailKey(item.toEmail) === e) return true
  if (item.leadId && person.leadIds?.includes(item.leadId)) return true
  return false
}

/** "Email · 3 files · sent" or "WhatsApp · logged": one line to say what a record is */
export function summaryLine(i: SentItem): string {
  const bits: string[] = [CHANNEL_LABEL[i.channel]]
  if (i.files.length) bits.push(`${i.files.length} file${i.files.length === 1 ? '' : 's'}`)
  bits.push(i.kind === 'logged' ? 'added after it was sent' : i.channel === 'email' ? 'sent from the app' : 'sent')
  return bits.join(' · ')
}

/** The date of a record in words, UK style: "Tue 10 Nov, 14:05" (with the year when it is not this year) */
export function whenShort(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${day}, ${time}`
}

export const firstNameOf = (name: string) => (name || '').trim().split(/\s+/)[0] || ''

/** The words of a WhatsApp message: a greeting, the subject and message, a line saying the pictures and files are coming (WhatsApp links cannot carry files) and the company name */
export function whatsappMessageText(o: { companyName: string; firstName: string; subject: string; body: string; fileCount: number }): string {
  const lines: string[] = []
  lines.push(o.firstName ? `Hi ${o.firstName},` : 'Hello,')
  if (o.subject.trim()) lines.push('', o.subject.trim())
  if (o.body.trim()) lines.push('', o.body.trim())
  if (o.fileCount > 0) lines.push('', `${o.fileCount === 1 ? 'The file is' : `The ${o.fileCount} files are`} attached.`)
  lines.push('', `Thanks, ${o.companyName || 'your builder'}`)
  return lines.join('\n')
}

/** A WhatsApp chat link with the text ready in the box (the number from whatsappLink in lib/leads.ts), or '' when there is no number */
export function whatsappLinkWithText(chatLink: string, text: string): string {
  if (!chatLink) return ''
  return `${chatLink}?text=${encodeURIComponent(text)}`
}

/** The email's text, as plain paragraphs, for the email and for a preview */
export function emailParagraphs(o: { firstName: string; body: string }): string[] {
  const paras = (o.body || '').split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  return [o.firstName ? `Hi ${o.firstName},` : 'Hello,', ...paras]
}

// ── What the client sees in their portal ─────────────────────────────────────────────────────────────────────────

export interface PortalSentFile { name: string; isImage: boolean; url: string | null }
export interface PortalSentItem { id: string; channel: SentChannel; subject: string; body: string; sentAt: string; files: PortalSentFile[] }

/** A record as the client may see it: the words, the date and the files with their links, and nothing else (not who sent it, where it was sent, or any path). `urls` is path → signed link. */
export function portalItemFrom(i: SentItem, urls: Record<string, string>): PortalSentItem {
  return { id: i.id, channel: i.channel, subject: i.subject, body: i.body, sentAt: i.sentAt, files: i.files.map(f => ({ name: f.name, isImage: f.isImage, url: urls[f.path] || null })) }
}

/** Only the records marked for the portal, newest first */
export function portalVisible(items: SentItem[]): SentItem[] { return sortSent(items.filter(i => i.showInPortal)) }

/** Escapes % and _ so an email address can be used with a case-insensitive match without being read as a pattern */
export const likeSafe = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m)
