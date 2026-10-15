// Reads an inbound email (as Postmark or Power Automate hands it over) into one plain shape, and decides which of its files are worth reading as a document or a quote.
// Pure: no database, no network, so it can be tested on its own (the route app/api/email-ingest/route.ts does the rest).

export const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
])
export const MAX_BYTES = 9 * 1024 * 1024
export const MAX_ATTACHMENTS = 10
/**
 * A picture shown INSIDE the email (a logo, a signature, or a screenshot pasted into the writing) is not an attachment as such. The small ones are signatures and icons and are ignored;
 * a larger one is kept as a possible quote, but only ever looked at as a quote: if it is not one it is left alone rather than filed as a document.
 */
export const INLINE_MIN_BYTES = 30 * 1024
/** When nothing else came with the email, a smaller picture inside it (a cropped screenshot of a quote) is still worth a look, down to this size: below it is an icon. */
export const INLINE_SMALL_MIN_BYTES = 5 * 1024
/** ...but at most this many of them, largest first, so a row of icons is not read one by one */
export const INLINE_SMALL_MAX_COUNT = 2

export interface NormalisedAttachment {
  name: string
  base64: string
  mime: string
  size: number
  /** shown inside the body of the email rather than attached beside it */
  inline?: boolean
}

export interface NormalisedEmail {
  from: string
  subject: string
  /** the words of the email, where the sender mentioned a PO number */
  body: string
  /** every address it was sent to, so the company code in the address (quotes-ab12cd34@...) can be read */
  recipients: string[]
  attachments: NormalisedAttachment[]
  /** the sender's address on its own (a@b.com), lower case; '' if it could not be read */
  fromEmail: string
  /** the email's headers, names in lower case */
  headers: Record<string, string>
}

function mimeBase(ct: string) { return ct.split(';')[0].trim().toLowerCase() }
/** a@b.com out of `Dave <a@b.com>` or a bare address */
export function emailAddressOf(from: string): string {
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(from) || /([^\s<>",;]+@[^\s<>",;]+)/.exec(from)
  return m ? m[1].trim().toLowerCase() : ''
}
const sizeOf = (reported: number, base64: string) => (reported > 0 ? reported : Math.floor((base64.length * 3) / 4))

// Accepts two formats:
//   Power Automate: { from, subject, attachments: [{ name, contentBytes, contentType, size }] }
//   Postmark:       { From, Subject, Attachments: [{ Name, Content, ContentType, ContentLength, ContentID }] }
export function normaliseInbound(body: Record<string, unknown>): NormalisedEmail {
  // Power Automate
  if (Array.isArray(body.attachments)) {
    return {
      from: String(body.from ?? ''),
      subject: String(body.subject ?? ''),
      body: String(body.body ?? body.bodyPreview ?? ''),
      fromEmail: emailAddressOf(String(body.from ?? '')),
      headers: {},
      recipients: [body.to, body.cc, body.toRecipients, body.ccRecipients].flatMap(x => (Array.isArray(x) ? x : [x])).map(x => (typeof x === 'string' ? x : JSON.stringify(x ?? ''))),
      attachments: (body.attachments as Record<string, unknown>[]).map(a => {
        const b64 = String(a.contentBytes ?? '')
        return { name: String(a.name ?? ''), base64: b64, mime: mimeBase(String(a.contentType ?? '')), size: sizeOf(Number(a.size ?? 0), b64) }
      }),
    }
  }
  // Postmark
  const htmlBody = String(body.HtmlBody ?? '')
  const textBody = String(body.TextBody ?? '')
  return {
    from: String(body.From ?? ''),
    subject: String(body.Subject ?? ''),
    body: textBody,
    fromEmail: emailAddressOf(String((body.FromFull as { Email?: string } | undefined)?.Email || body.From || '')),
    headers: Object.fromEntries((Array.isArray(body.Headers) ? body.Headers as { Name?: string; Value?: string }[] : []).filter(h => h && h.Name).map(h => [String(h.Name).toLowerCase(), String(h.Value ?? '')])),
    recipients: [body.To, body.Cc, body.OriginalRecipient, ...(Array.isArray(body.ToFull) ? body.ToFull : []), ...(Array.isArray(body.CcFull) ? body.CcFull : [])]
      .map(x => (typeof x === 'string' ? x : JSON.stringify(x ?? ''))),
    attachments: (Array.isArray(body.Attachments) ? body.Attachments as Record<string, unknown>[] : []).map(a => {
      const rawMime = mimeBase(String(a.ContentType ?? ''))
      const name = String(a.Name ?? '').toLowerCase()
      // Outlook forwards PDFs as application/octet-stream: detect by extension
      let mime = rawMime
      if (rawMime === 'application/octet-stream') {
        if (name.endsWith('.pdf')) mime = 'application/pdf'
        else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mime = 'image/jpeg'
        else if (name.endsWith('.png')) mime = 'image/png'
        else if (name.endsWith('.webp')) mime = 'image/webp'
      }
      // a file the body of the email points at (cid:...) is shown inside it
      const cid = a.ContentID ? String(a.ContentID) : ''
      const inline = !!cid && (htmlBody.includes(`cid:${cid}`) || textBody.includes(`cid:${cid}`))
      const b64 = String(a.Content ?? '')
      return { name: String(a.Name ?? ''), base64: b64, mime, size: sizeOf(Number(a.ContentLength ?? 0), b64), inline }
    }),
  }
}

const readableType = (a: NormalisedAttachment) => ALLOWED_TYPES.has(a.mime) && a.size <= MAX_BYTES && !!a.base64

/**
 * The files worth reading: a PDF or photo that is not too big, and (if shown inside the email) not a small logo or icon.
 * If that leaves nothing, the larger of the smaller pictures inside the email are tried instead: a quote pasted in as a small screenshot is often only a few KB.
 * (Either way a picture inside the email is only ever looked at as a quote.)
 */
export function readableAttachments(email: NormalisedEmail): NormalisedAttachment[] {
  const normal = email.attachments.filter(a => readableType(a) && (!a.inline || a.size >= INLINE_MIN_BYTES)).slice(0, MAX_ATTACHMENTS)
  if (normal.length > 0) return normal
  return email.attachments
    .filter(a => readableType(a) && a.inline && a.size >= INLINE_SMALL_MIN_BYTES)
    .sort((a, b) => b.size - a.size)
    .slice(0, INLINE_SMALL_MAX_COUNT)
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const KIND: Record<string, string> = { 'application/pdf': 'PDF', 'image/jpeg': 'photo', 'image/jpg': 'photo', 'image/png': 'picture', 'image/webp': 'picture' }

/** What came with an email, in plain words, for the log: "2 files: quote.png (picture, 812 KB, shown inside the email), logo.png (picture, 4 KB, shown inside the email, too small to be a quote)". */
export function describeAttachments(email: NormalisedEmail): string {
  if (email.attachments.length === 0) return 'No file came with the email (the words of an email are not read).'
  const parts = email.attachments.map(a => {
    const kind = KIND[a.mime] ?? (a.mime || 'unknown type')
    const why: string[] = []
    if (a.inline) why.push('shown inside the email')
    if (!ALLOWED_TYPES.has(a.mime)) why.push('not a PDF or photo')
    else if (a.size > MAX_BYTES) why.push('too big')
    else if (a.inline && a.size < INLINE_SMALL_MIN_BYTES) why.push('too small to be a quote')
    return `${a.name || 'unnamed'} (${kind}, ${kb(a.size)}${why.length ? ', ' + why.join(', ') : ''})`
  })
  return `${email.attachments.length} file${email.attachments.length === 1 ? '' : 's'} came with it: ${parts.join('; ')}.`
}

/**
 * Is this email from a machine rather than a person: a no-reply address, a bounce, a mailing list, or anything marked as automatic? Such senders are never answered,
 * so two automatic systems cannot end up replying to each other for ever, and nobody receives a reply to something they did not write.
 */
export function looksAutomated(email: NormalisedEmail): boolean {
  const local = email.fromEmail.split('@')[0] || ''
  if (!email.fromEmail || /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|mailer[-_.]?daemon|postmaster|bounces?|notifications?|alerts?|auto[-_.]?(reply|response|mail)?|daemon|donotreply)/i.test(local)) return true
  const h = email.headers
  const autoSubmitted = (h['auto-submitted'] || '').trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') return true
  if (/^(bulk|list|junk|auto_reply)$/i.test((h['precedence'] || '').trim())) return true
  if (h['x-auto-response-suppress'] || h['list-unsubscribe'] || h['list-id'] || h['x-autoreply'] || h['x-autorespond']) return true
  return false
}

/** Why none of the files could be read, in a sentence for the supplier ("the quote was pasted into the email instead of attached as a file"). */
export function whyNothingReadable(email: NormalisedEmail): string {
  const files = email.attachments
  if (files.length === 0) return 'there was no file attached to your email'
  if (files.every(a => a.inline && ALLOWED_TYPES.has(a.mime))) return 'the quote was shown inside the writing of your email (or was only a small picture) rather than attached as a file'
  const wrong = files.find(a => !ALLOWED_TYPES.has(a.mime))
  if (wrong) return `the file attached (${wrong.name || 'unnamed'}) is not a PDF or a photo`
  if (files.some(a => a.size > MAX_BYTES)) return 'the file attached was too big (over 9 MB)'
  return 'we could not find a PDF or a photo attached to your email'
}
