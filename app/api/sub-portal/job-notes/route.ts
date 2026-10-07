/**
 * GET /api/sub-portal/job-notes
 *
 * The signed-in subcontractor's OWN job notes with a temporary link for each photo. The notes come from the database function
 * get_my_job_notes (only theirs); the server signs the photo links because the private bucket only lets the builder's own session sign them.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'job-documents'

interface Row { id: string; job_id: string; note: string; created_at: string; photos: { id: string; storage_path: string }[] }

export async function GET() {
  const sbAuth = await createClient()
  const { data: { user } } = await sbAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { data, error } = await sbAuth.rpc('get_my_job_notes')
  const d = data as { error?: string; rows?: Row[] } | null
  if (error || !d || d.error || !Array.isArray(d.rows)) return NextResponse.json({ error: d?.error || 'Could not load your notes' }, { status: 400 })

  const sb = createServiceRoleClient()
  const rows = await Promise.all(d.rows.map(async r => ({
    id: r.id, jobId: r.job_id, note: r.note, createdAt: r.created_at,
    photos: (await Promise.all((r.photos ?? []).map(async p => {
      const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(p.storage_path, 3600)
      return s?.signedUrl ? { id: p.id, url: s.signedUrl } : null
    }))).filter((p): p is { id: string; url: string } => !!p),
  })))
  return NextResponse.json({ rows })
}
