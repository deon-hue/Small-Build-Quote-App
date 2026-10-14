import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { extractDocument } from '@/lib/doc-extract'
import { processQuoteAttachment } from '@/lib/quote-inbox'
import { codeFromRecipients } from '@/lib/mail-address'

// reading a quote with the AI can take a while; give the request room to finish
export const maxDuration = 60

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
])
const MAX_BYTES = 9 * 1024 * 1024
const MAX_ATTACHMENTS = 10

function mimeBase(ct: string) { return ct.split(';')[0].trim().toLowerCase() }
function stamp()               { return Date.now().toString(36) }
function safeName(n: string)   { return n.replace(/[^a-z0-9._-]/gi, '_').toLowerCase() }

interface NormalisedAttachment {
  name: string
  base64: string
  mime: string
  size: number
}

interface NormalisedEmail {
  from: string
  subject: string
  /** the words of the email, where the sender mentioned a PO number */
  body: string
  /** every address it was sent to, so the company code in the address (quotes+ab12cd34@...) can be read */
  recipients: string[]
  attachments: NormalisedAttachment[]
}

// Accepts two formats:
//   Power Automate: { from, subject, attachments: [{ name, contentBytes, contentType, size }] }
//   Postmark:       { From, Subject, Attachments: [{ Name, Content, ContentType, ContentLength }] }
function normalise(body: Record<string, unknown>): NormalisedEmail {
  // Power Automate
  if (Array.isArray(body.attachments)) {
    return {
      from:    String(body.from    ?? ''),
      subject: String(body.subject ?? ''),
      body:    String(body.body ?? body.bodyPreview ?? ''),
      recipients: [body.to, body.cc, body.toRecipients, body.ccRecipients].flatMap(x => (Array.isArray(x) ? x : [x])).map(x => (typeof x === 'string' ? x : JSON.stringify(x ?? ''))),
      attachments: (body.attachments as Record<string, unknown>[]).map(a => ({
        name:   String(a.name         ?? ''),
        base64: String(a.contentBytes ?? ''),
        mime:   mimeBase(String(a.contentType ?? '')),
        size:   Number(a.size         ?? 0),
      })),
    }
  }
  // Postmark
  const htmlBody = String(body.HtmlBody ?? '')
  const textBody = String(body.TextBody ?? '')
  return {
    from:    String(body.From    ?? ''),
    subject: String(body.Subject ?? ''),
    body:    textBody,
    recipients: [body.To, body.Cc, body.OriginalRecipient, ...(Array.isArray(body.ToFull) ? body.ToFull : []), ...(Array.isArray(body.CcFull) ? body.CcFull : [])]
      .map(x => (typeof x === 'string' ? x : JSON.stringify(x ?? ''))),
    attachments: (Array.isArray(body.Attachments) ? body.Attachments as Record<string, unknown>[] : [])
      .filter(a => {
        if (!a.ContentID) return true
        const cid = String(a.ContentID)
        // Only skip if this ContentID is actually referenced inline in the email body
        return !htmlBody.includes(`cid:${cid}`) && !textBody.includes(`cid:${cid}`)
      })
      .map(a => {
        const rawMime = mimeBase(String(a.ContentType ?? ''))
        const name    = String(a.Name ?? '').toLowerCase()
        // Outlook forwards PDFs as application/octet-stream — detect by extension
        let mime = rawMime
        if (rawMime === 'application/octet-stream') {
          if (name.endsWith('.pdf'))                         mime = 'application/pdf'
          else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mime = 'image/jpeg'
          else if (name.endsWith('.png'))                    mime = 'image/png'
          else if (name.endsWith('.webp'))                   mime = 'image/webp'
        }
        return {
          name:   String(a.Name          ?? ''),
          base64: String(a.Content       ?? ''),
          mime,
          size:   Number(a.ContentLength ?? 0),
        }
      }),
  }
}

// POST /api/email-ingest?token=<EMAIL_INGEST_TOKEN>
//
// Accepts Power Automate (M365) or Postmark inbound webhooks.
// Extracts PDF/image attachments, runs AI extraction, saves to document inbox.
//
// Required Netlify env vars:
//   EMAIL_INGEST_TOKEN   — secret appended to the webhook URL as ?token=
//   EMAIL_INGEST_USER_ID — your Supabase user UUID (Auth → Users in Supabase dashboard)
type LogOutcome = 'no_attachments' | 'unknown_address' | 'quote_attached' | 'quote_unmatched' | 'filed_as_document' | 'error'

/** One line in the "emails received" log shown in Settings. Never allowed to break the email itself. */
async function logEmail(userId: string | null, email: NormalisedEmail, outcome: LogOutcome, detail = '', fileName = '') {
  try {
    await createServiceRoleClient().from('inbound_email_log').insert({
      user_id: userId, from_address: email.from.slice(0, 200), to_address: email.recipients.join(' ').slice(0, 300), subject: email.subject.slice(0, 300), file_name: fileName.slice(0, 200), outcome, detail: detail.slice(0, 500),
    })
  } catch { /* the log is a convenience */ }
}

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.EMAIL_INGEST_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const defaultUserId = process.env.EMAIL_INGEST_USER_ID

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = normalise(body)

  // Whose is it? A company code in the address it was sent to (quotes+ab12cd34@...) names the company. With no code it is the default company (the one set in EMAIL_INGEST_USER_ID),
  // as it always was. A code that matches no company is refused rather than filed under someone else.
  const sbLookup = createServiceRoleClient()
  const code = codeFromRecipients(email.recipients)
  let userId = defaultUserId
  if (code) {
    const { data: s } = await sbLookup.from('settings').select('user_id').eq('mail_code', code).maybeSingle()
    if (!s) { await logEmail(null, email, 'unknown_address', `No company has the code ${code}.`); return NextResponse.json({ processed: 0, skipped: 'unknown address' }) }
    userId = s.user_id as string
  }
  if (!userId) {
    console.error('email-ingest: no company for this email and EMAIL_INGEST_USER_ID not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const attachments = email.attachments
    .filter(a => ALLOWED_TYPES.has(a.mime) && a.size <= MAX_BYTES && a.base64)
    .slice(0, MAX_ATTACHMENTS)

  if (!attachments.length) {
    await logEmail(userId, email, 'no_attachments', 'No PDF or photo was attached (the words of an email are not read).')
    return NextResponse.json({ processed: 0, skipped: 'no valid attachments' })
  }

  const sb = createServiceRoleClient()
  let processed = 0

  for (const att of attachments) {
    try {
      const ext = att.mime === 'application/pdf' ? 'pdf' : att.mime.split('/')[1]
      const fileName = att.name || `email-doc-${stamp()}.${ext}`

      // The ordinary document reading starts now, side by side with the quote check, so a document that is not a quote does not wait for two readings one after the other (the host stops a request that takes too long).
      const extractionPromise = extractDocument({ base64: att.base64, mimeType: att.mime, fileName }).catch(err => { console.warn('email-ingest: AI extraction failed', err); return null })

      // Is this a supplier's quote for one of the open price requests? Then it becomes their reply (to be checked), or waits in the unmatched list. Anything else is filed as a document, as before.
      try {
        const q = await processQuoteAttachment(sb, userId, { name: fileName, mime: att.mime, base64: att.base64 }, { from: email.from, subject: email.subject, body: email.body })
        if (q.result === 'attached') { await logEmail(userId, email, 'quote_attached', `Added to ${q.po} as ${q.supplierName}'s reply (${q.mode === 'itemised' ? 'item by item' : 'total only'}). Please check it.`, fileName); processed++; continue }
        if (q.result === 'unmatched') { await logEmail(userId, email, 'quote_unmatched', `Read as a quote but not placed: ${q.reason}`, fileName); processed++; continue }
      } catch (err) {
        console.warn('email-ingest: quote check failed, filing as a document', err)
        await logEmail(userId, email, 'error', `The quote check failed, so it was filed as a document. ${err instanceof Error ? err.message : ''}`, fileName)
      }
      const storagePath = `${userId}/inbox/${stamp()}-${safeName(fileName)}`
      const fileBuffer = Buffer.from(att.base64, 'base64')

      const { error: uploadErr } = await sb.storage
        .from('job-documents')
        .upload(storagePath, fileBuffer, { contentType: att.mime, upsert: false })

      if (uploadErr) { console.error('email-ingest: upload failed', uploadErr.message); continue }

      const extraction = await extractionPromise

      const { error: dbErr } = await sb.from('job_documents').insert({
        user_id:        userId,
        file_name:      fileName,
        storage_path:   storagePath,
        mime_type:      att.mime,
        file_size:      att.size,
        status:         'unallocated',
        raw_extraction: extraction,
        source_email:   email.from   || null,
        source_subject: email.subject || null,
      })

      if (dbErr) {
        console.error('email-ingest: DB insert failed', dbErr.message)
        await sb.storage.from('job-documents').remove([storagePath])
        continue
      }

      await logEmail(userId, email, 'filed_as_document', 'Not a quote for an open price request, so it went into your Documents inbox.', fileName)
      processed++
    } catch (err) {
      console.error('email-ingest: unexpected error', att.name, err)
      await logEmail(userId, email, 'error', err instanceof Error ? err.message : 'Unexpected error', att.name)
    }
  }

  return NextResponse.json({ processed })
}
