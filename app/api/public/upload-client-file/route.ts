import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'client-uploads'

export async function POST(req: NextRequest) {
  let body: { sessionId?: string; name?: string; mimeType?: string; dataBase64?: string; isImage?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  const { sessionId, name, mimeType, dataBase64, isImage } = body
  if (!sessionId || !name || !dataBase64) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  let sb
  try {
    sb = createServiceRoleClient()
  } catch {
    return NextResponse.json({ error: 'Storage unavailable' }, { status: 500 })
  }

  // Create the bucket if it doesn't exist yet (idempotent)
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${sessionId}/${safeName}`

  const buffer = Buffer.from(dataBase64, 'base64')
  const { error } = await sb.storage.from(BUCKET).upload(path, buffer, {
    contentType: mimeType || 'application/octet-stream',
    upsert: true,
  })

  if (error) {
    console.error('Storage upload error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(path)
  return NextResponse.json({ url: publicUrl, name: safeName, isImage: isImage ?? false })
}
