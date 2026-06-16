import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { extractDocument } from '@/lib/doc-extract'

// ── Postmark inbound email payload ────────────────────────────────────────────
interface PostmarkAttachment {
  Name: string
  Content: string      // base64-encoded file data
  ContentType: string  // may include params e.g. "application/pdf; name=file.pdf"
  ContentLength: number
}
interface PostmarkPayload {
  From?: string
  Subject?: string
  Attachments?: PostmarkAttachment[]
}

const ALLOWED_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
])
const MAX_BYTES = 9 * 1024 * 1024   // 9 MB per attachment
const MAX_ATTACHMENTS = 10

function mimeBase(ct: string) { return ct.split(';')[0].trim().toLowerCase() }
function stamp()               { return Date.now().toString(36) }
function safeName(n: string)   { return n.replace(/[^a-z0-9._-]/gi, '_').toLowerCase() }

// POST /api/email-ingest?token=<EMAIL_INGEST_TOKEN>
// Called by Postmark Inbound stream when an email arrives.
// Extracts PDF/image attachments, runs AI extraction, saves to document inbox.
//
// Required env vars (set in Netlify):
//   EMAIL_INGEST_TOKEN   — secret you paste into the Postmark webhook URL
//   EMAIL_INGEST_USER_ID — your Supabase user ID (find it in Supabase → Auth → Users)
export async function POST(req: NextRequest) {
  // ── Validate webhook token ──────────────────────────────────────────────────
  const token = req.nextUrl.searchParams.get('token')
  if (!token || token !== process.env.EMAIL_INGEST_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = process.env.EMAIL_INGEST_USER_ID
  if (!userId) {
    console.error('email-ingest: EMAIL_INGEST_USER_ID not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  // ── Parse Postmark payload ──────────────────────────────────────────────────
  let payload: PostmarkPayload
  try {
    payload = await req.json() as PostmarkPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const attachments = (payload.Attachments ?? [])
    .filter(a => {
      const mime = mimeBase(a.ContentType)
      return ALLOWED_TYPES.has(mime) && a.ContentLength <= MAX_BYTES
    })
    .slice(0, MAX_ATTACHMENTS)

  if (!attachments.length) {
    // No valid attachments — acknowledge silently (Postmark requires 200)
    return NextResponse.json({ processed: 0, skipped: 'no valid attachments' })
  }

  const sb = createServiceRoleClient()
  let processed = 0

  for (const att of attachments) {
    try {
      const mime = mimeBase(att.ContentType)
      const fileName = att.Name || `email-doc-${stamp()}.${mime === 'application/pdf' ? 'pdf' : 'jpg'}`
      const storagePath = `${userId}/inbox/${stamp()}-${safeName(fileName)}`
      const fileBuffer = Buffer.from(att.Content, 'base64')

      // Upload to Supabase Storage
      const { error: uploadErr } = await sb.storage
        .from('job-docs')
        .upload(storagePath, fileBuffer, { contentType: mime, upsert: false })

      if (uploadErr) {
        console.error('email-ingest: storage upload failed', uploadErr.message)
        continue
      }

      // Run AI extraction (best-effort — doc is still saved if this fails)
      let extraction = null
      try {
        extraction = await extractDocument({ base64: att.Content, mimeType: mime, fileName })
      } catch (err) {
        console.warn('email-ingest: AI extraction failed', err)
      }

      // Create document inbox record
      const { error: dbErr } = await sb.from('job_documents').insert({
        user_id: userId,
        file_name: fileName,
        storage_path: storagePath,
        mime_type: mime,
        file_size: att.ContentLength,
        status: 'unallocated',
        raw_extraction: extraction,
        source_email: payload.From ?? null,
        source_subject: payload.Subject ?? null,
      })

      if (dbErr) {
        console.error('email-ingest: DB insert failed', dbErr.message)
        // Clean up orphaned storage file
        await sb.storage.from('job-docs').remove([storagePath])
        continue
      }

      processed++
    } catch (err) {
      console.error('email-ingest: unexpected error for attachment', att.Name, err)
    }
  }

  return NextResponse.json({ processed })
}
