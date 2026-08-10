import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractDocument } from '@/lib/doc-extract'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Extraction not configured' }, { status: 500 })
  }

  let body: {
    base64?: string
    mimeType?: string
    fileName?: string
    pages?: Array<{ base64: string; mimeType: string }>
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']

  // Multi-page path
  if (body.pages?.length) {
    const pages = body.pages
    for (const p of pages) {
      if (!p.base64 || !p.mimeType) return NextResponse.json({ error: 'Missing file data in pages' }, { status: 400 })
      if (!allowed.includes(p.mimeType)) return NextResponse.json({ error: `Unsupported type: ${p.mimeType}` }, { status: 400 })
      if (p.base64.length > 9_000_000) return NextResponse.json({ error: 'A page is too large — use a smaller image' }, { status: 413 })
    }
    try {
      const extracted = await extractDocument(pages)
      return NextResponse.json({ extracted })
    } catch (err) {
      console.error('extract-document (multi-page) error:', err)
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Extraction failed' }, { status: 500 })
    }
  }

  // Single-page path (backwards compatible)
  const { base64, mimeType, fileName } = body
  if (!base64 || !mimeType) return NextResponse.json({ error: 'Missing file data' }, { status: 400 })
  if (!allowed.includes(mimeType)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  if (base64.length > 9_000_000) return NextResponse.json({ error: 'File too large — please use a smaller image or PDF' }, { status: 413 })

  try {
    const extracted = await extractDocument({ base64, mimeType, fileName })
    return NextResponse.json({ extracted })
  } catch (err) {
    console.error('extract-document error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Extraction failed' }, { status: 500 })
  }
}
