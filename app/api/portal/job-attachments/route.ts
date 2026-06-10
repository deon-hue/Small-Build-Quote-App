import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET = 'job-documents'

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const jobId = req.nextUrl.searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

  const { data: rows, error } = await sb.rpc('get_job_attachments_for_portal', { p_job_id: jobId })
  if (error || !Array.isArray(rows)) return NextResponse.json([])

  const result = await Promise.all(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rows as any[]).map(async r => {
      const { data } = await sb.storage.from(BUCKET).createSignedUrl(r.storage_path, 3600)
      return {
        id:        r.id,
        fileName:  r.file_name,
        mimeType:  r.mime_type,
        fileSize:  r.file_size,
        category:  r.category,
        label:     r.label,
        createdAt: r.created_at,
        url:       data?.signedUrl ?? null,
      }
    })
  )

  return NextResponse.json(result)
}
