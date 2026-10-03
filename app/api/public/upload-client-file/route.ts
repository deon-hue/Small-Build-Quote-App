import { NextRequest, NextResponse } from 'next/server'
import { publicGuard } from '@/lib/public-guard'
import { randomUUID } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'client-uploads'
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

// Photos and PDFs only. The stored file's extension comes from this table, never from the visitor's file name.
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
}

// Anonymous endpoint (the public Get-a-Quote form), so it is deliberately narrow: size and type limited, and
// every upload goes into its own random folder with no overwrite — nobody can replace someone else's file or
// guess where it is.
export async function POST(req: NextRequest) {
  const limited = await publicGuard(req, 'upload')
  if (limited) return limited

  let body: { sessionId?: string; name?: string; mimeType?: string; dataBase64?: string; isImage?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { name, mimeType, dataBase64, isImage } = body
  if (!name || !dataBase64) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const mime = (mimeType || '').toLowerCase()
  const ext = EXT_BY_MIME[mime]
  if (!ext) return NextResponse.json({ error: 'Only photos and PDF files can be uploaded' }, { status: 415 })

  const buffer = Buffer.from(dataBase64, 'base64')
  if (buffer.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
  if (buffer.length > MAX_BYTES) return NextResponse.json({ error: 'File is too large (8 MB maximum)' }, { status: 413 })

  let sb
  try {
    sb = createServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }

  // Create the bucket if it doesn't exist yet, and keep its own limits in step with the checks above.
  const bucketOptions = { public: true, fileSizeLimit: MAX_BYTES, allowedMimeTypes: Object.keys(EXT_BY_MIME) }
  await sb.storage.createBucket(BUCKET, bucketOptions).catch(() => {})
  await sb.storage.updateBucket(BUCKET, bucketOptions).catch(() => {})

  const base = name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'file'
  const safeName = `${base}.${ext}`
  const path = `${randomUUID()}/${safeName}`

  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  })

  if (error) {
    console.error('Storage upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: publicUrl, name: safeName, isImage: isImage ?? false })
}
