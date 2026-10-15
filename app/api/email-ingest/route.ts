import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { extractDocument } from '@/lib/doc-extract'
import { processQuoteAttachment } from '@/lib/quote-inbox'
import { askForAttachment } from '@/lib/ask-for-attachment'
import { codeFromRecipients } from '@/lib/mail-address'
import { normaliseInbound, readableAttachments, describeAttachments, type NormalisedEmail } from '@/lib/inbound-email'

// reading a quote with the AI can take a while; give the request room to finish
export const maxDuration = 60

function stamp()               { return Date.now().toString(36) }
function safeName(n: string)   { return n.replace(/[^a-z0-9._-]/gi, '_').toLowerCase() }

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

  const email = normaliseInbound(body)

  // Whose is it? A company code in the address it was sent to (quotes+ab12cd34@...) names the company. With no code it is the default company (the one set in EMAIL_INGEST_USER_ID),
  // as it always was. A code that matches no company is refused rather than filed under someone else.
  const sbLookup = createServiceRoleClient()
  const ourDomains = [process.env.NEXT_PUBLIC_QUOTES_EMAIL, process.env.NEXT_PUBLIC_DOCUMENTS_EMAIL].map(x => (x || '').split('@')[1] || '').filter(Boolean)
  const code = codeFromRecipients(email.recipients, ourDomains)
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

  const attachments = readableAttachments(email)

  if (!attachments.length) {
    const asked = await askForAttachment(createServiceRoleClient(), userId, email, { quotesEmail: process.env.NEXT_PUBLIC_QUOTES_EMAIL || '', resendKey: process.env.RESEND_API_KEY, fromEmail: process.env.NOTIFY_FROM_EMAIL })
    await logEmail(userId, email, 'no_attachments', describeAttachments(email) + asked)
    return NextResponse.json({ processed: 0, skipped: 'no valid attachments' })
  }

  const sb = createServiceRoleClient()
  let processed = 0

  for (const att of attachments) {
    try {
      const ext = att.mime === 'application/pdf' ? 'pdf' : att.mime.split('/')[1]
      const fileName = att.name || `email-doc-${stamp()}.${ext}`

      // The ordinary document reading starts now, side by side with the quote check, so a document that is not a quote does not wait for two readings one after the other (the host stops a request that takes too long).
      // (a picture shown inside the email is only ever checked as a quote, never filed, so it is not read as a document)
      const extractionPromise = (att.inline ? Promise.resolve(null) : extractDocument({ base64: att.base64, mimeType: att.mime, fileName })).catch(err => { console.warn('email-ingest: AI extraction failed', err); return null })

      // Is this a supplier's quote for one of the open price requests? Then it becomes their reply (to be checked), or waits in the unmatched list. Anything else is filed as a document, as before.
      try {
        const q = await processQuoteAttachment(sb, userId, { name: fileName, mime: att.mime, base64: att.base64 }, { from: email.from, subject: email.subject, body: email.body })
        if (q.result === 'attached') { await logEmail(userId, email, 'quote_attached', `Added to ${q.po} as ${q.supplierName}'s reply (${q.mode === 'itemised' ? 'item by item' : 'total only'}). Please check it.`, fileName); processed++; continue }
        if (q.result === 'unmatched') { await logEmail(userId, email, 'quote_unmatched', `Read as a quote but not placed: ${q.reason}`, fileName); processed++; continue }
        // a picture inside the email that is not a quote (a banner, a signature) is left alone, not filed as a document
        if (att.inline) { await logEmail(userId, email, 'no_attachments', `A picture inside the email (${fileName}) was read but is not a quote for an open price request, so it was left alone.`, fileName); continue }
      } catch (err) {
        console.warn('email-ingest: quote check failed, filing as a document', err)
        await logEmail(userId, email, 'error', `The quote check failed, so it was ${att.inline ? 'left alone' : 'filed as a document'}. ${err instanceof Error ? err.message : ''}`, fileName)
        if (att.inline) continue
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
