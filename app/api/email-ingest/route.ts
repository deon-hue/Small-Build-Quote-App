import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { extractDocument } from '@/lib/doc-extract'

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
      attachments: (body.attachments as Record<string, unknown>[]).map(a => ({
        name:   String(a.name         ?? ''),
        base64: String(a.contentBytes ?? ''),
        mime:   mimeBase(String(a.contentType ?? '')),
        size:   Number(a.size         ?? 0),
      })),
    }
  }
  // Postmark
  return {
    from:    String(body.From    ?? ''),
    subject: String(body.Subject ?? ''),
    attachments: (Array.isArray(body.Attachments) ? body.Attachments as Record<string, unknown>[] : []).map(a => ({
      name:   String(a.Name          ?? ''),
      base64: String(a.Content       ?? ''),
      mime:   mimeBase(String(a.ContentType ?? '')),
      size:   Number(a.ContentLength ?? 0),
    })),
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
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.EMAIL_INGEST_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.EMAIL_INGEST_USER_ID
  if (!userId) {
    console.error('email-ingest: EMAIL_INGEST_USER_ID not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json() as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = normalise(body)

  const attachments = email.attachments
    .filter(a => ALLOWED_TYPES.has(a.mime) && a.size <= MAX_BYTES && a.base64)
    .slice(0, MAX_ATTACHMENTS)

  if (!attachments.length) {
    return NextResponse.json({ processed: 0, skipped: 'no valid attachments' })
  }

  const sb = createServiceRoleClient()
  let processed = 0

  for (const att of attachments) {
    try {
      const ext = att.mime === 'application/pdf' ? 'pdf' : att.mime.split('/')[1]
      const fileName = att.name || `email-doc-${stamp()}.${ext}`
      const storagePath = `${userId}/inbox/${stamp()}-${safeName(fileName)}`
      const fileBuffer = Buffer.from(att.base64, 'base64')

      const { error: uploadErr } = await sb.storage
        .from('job-docs')
        .upload(storagePath, fileBuffer, { contentType: att.mime, upsert: false })

      if (uploadErr) { console.error('email-ingest: upload failed', uploadErr.message); continue }

      let extraction = null
      try {
        extraction = await extractDocument({ base64: att.base64, mimeType: att.mime, fileName })
      } catch (err) {
        console.warn('email-ingest: AI extraction failed', err)
      }

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
        await sb.storage.from('job-docs').remove([storagePath])
        continue
      }

      processed++
    } catch (err) {
      console.error('email-ingest: unexpected error', att.name, err)
    }
  }

  return NextResponse.json({ processed })
}
