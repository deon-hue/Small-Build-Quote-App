// The builder's side: signed addresses for the photos of a job's (or several jobs') Selections, so the builder's window and their preview of the portal can show them.
// The files are listed with the builder's OWN session, so row security decides which ones they may see; only those are signed (by the service role, since the storage
// itself only lets the file's exact owner read it, which is not always the person using the app, for example a team member).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'job-documents'

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  const ids = (req.nextUrl.searchParams.get('jobIds') || '').split(',').map(s => s.trim()).filter(s => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 50)
  if (ids.length === 0) return NextResponse.json({ files: {} })

  const { data: sels } = await sb.from('job_selections').select('id').in('job_id', ids)
  const selIds = (sels ?? []).map(s => s.id as string)
  if (selIds.length === 0) return NextResponse.json({ files: {} })
  const { data: files } = await sb.from('job_selection_files').select('id, selection_id, storage_path, file_name, mime_type, file_size').in('selection_id', selIds).order('created_at')

  const svc = createServiceRoleClient()
  const out: Record<string, { id: string; fileName: string; mimeType: string; fileSize: number; url: string | null }[]> = {}
  await Promise.all((files ?? []).map(async f => {
    const { data: s } = await svc.storage.from(BUCKET).createSignedUrl(f.storage_path as string, 3600)
    ;(out[f.selection_id as string] ||= []).push({ id: f.id as string, fileName: (f.file_name as string) || '', mimeType: (f.mime_type as string) || '', fileSize: Number(f.file_size) || 0, url: s?.signedUrl ?? null })
  }))
  // keep the order the files were added in
  for (const k of Object.keys(out)) out[k] = (files ?? []).filter(f => f.selection_id === k).map(f => out[k].find(o => o.id === f.id)!).filter(Boolean)
  return NextResponse.json({ files: out })
}
