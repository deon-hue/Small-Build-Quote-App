// The builder deletes one of a job's Selections, with its photos. The item is found and deleted with the builder's OWN session (so row security decides whether it is theirs);
// only then are its files removed from storage (by the service role, since that is the only thing allowed to delete them).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'job-documents'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let body: { id?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { data: files } = await sb.from('job_selection_files').select('storage_path').eq('selection_id', id)
  const { data: gone, error } = await sb.from('job_selections').delete().eq('id', id).select('id')
  if (error || !gone || gone.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const paths = (files ?? []).map(f => f.storage_path as string).filter(Boolean)
  if (paths.length) { try { await createServiceRoleClient().storage.from(BUCKET).remove(paths) } catch { /* orphaned at worst */ } }
  return NextResponse.json({ ok: true })
}
