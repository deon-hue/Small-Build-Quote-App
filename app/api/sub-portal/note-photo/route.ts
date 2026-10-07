/**
 * POST /api/sub-portal/note-photo   (multipart: noteId, file)
 *
 * A subcontractor attaches a photo to a note THEY wrote (database function sub_note_photo_target confirms the note is theirs and says which
 * builder/job it belongs to). The file goes into the builder's private job-documents bucket under that job's notes folder, and is listed in
 * job_note_photos, so it shows up in the builder's Activity Log. The server does the upload because the bucket only lets the builder in.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const BUCKET = 'job-documents'
const MAX_BYTES = 8 * 1024 * 1024
const MAX_PER_NOTE = 6
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }

export async function POST(req: NextRequest) {
  const sbAuth = await createClient()
  const { data: { user } } = await sbAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const noteId = form?.get('noteId')
  const file = form?.get('file')
  if (typeof noteId !== 'string' || !/^[0-9a-f-]{36}$/i.test(noteId) || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing note or photo' }, { status: 400 })
  }
  const ext = TYPES[file.type]
  if (!ext) return NextResponse.json({ error: 'Please send a photo (JPEG, PNG or WebP).' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That photo is too big.' }, { status: 413 })

  // Is this note theirs? (runs as the signed-in subcontractor)
  const { data: target, error: tErr } = await sbAuth.rpc('sub_note_photo_target', { p_note_id: noteId })
  const t = target as { error?: string; admin_id?: string; job_id?: string; photo_count?: number } | null
  if (tErr || !t || t.error || !t.admin_id || !t.job_id) return NextResponse.json({ error: 'Note not found' }, { status: 404 })
  if ((t.photo_count ?? 0) >= MAX_PER_NOTE) return NextResponse.json({ error: `Up to ${MAX_PER_NOTE} photos on one note.` }, { status: 400 })

  const sb = createServiceRoleClient()
  const path = `${t.admin_id}/${t.job_id}/notes/${noteId}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { data: up, error: upErr } = await sb.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type })
  if (upErr || !up) return NextResponse.json({ error: 'Could not save the photo' }, { status: 500 })

  const { error: dbErr } = await sb.from('job_note_photos').insert({ user_id: t.admin_id, note_id: noteId, job_id: t.job_id, storage_path: up.path })
  if (dbErr) {
    await sb.storage.from(BUCKET).remove([up.path])
    return NextResponse.json({ error: 'Could not save the photo' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
