import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobNotePhoto } from './types'

// Reuses the same private storage bucket as lib/job-attachments.ts, under its own path
// prefix — deliberately a separate table from job_attachments, since that one is shared by
// unrelated features (email-ingest, Xero bill push, the portal attachments route) and a
// note's photos are scoped to one specific note, not the job in general.
const BUCKET = 'job-documents'

function stamp() { return Date.now().toString(36) }

export async function uploadNotePhoto(
  sb: SupabaseClient,
  userId: string,
  jobId: string,
  noteId: string,
  file: File,
): Promise<{ photo: JobNotePhoto } | { error: string }> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${jobId}/notes/${noteId}/${stamp()}-${safe}`

  const { data: uploadData, error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })

  if (uploadErr || !uploadData) {
    const msg = (uploadErr as { message?: string })?.message || 'Storage upload failed'
    return { error: msg }
  }

  const { data, error: dbErr } = await sb.from('job_note_photos').insert({
    user_id: userId,
    job_id: jobId,
    note_id: noteId,
    storage_path: uploadData.path,
  }).select().single()

  if (dbErr || !data) {
    await sb.storage.from(BUCKET).remove([uploadData.path])
    const msg = (dbErr as { message?: string })?.message || 'Database insert failed'
    return { error: msg }
  }

  return { photo: rowToPhoto(data) }
}

export async function fetchNotePhotos(
  sb: SupabaseClient,
  noteId: string,
): Promise<JobNotePhoto[]> {
  const { data } = await sb.from('job_note_photos')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })
  return (data ?? []).map(rowToPhoto)
}

export async function fetchNotePhotosForJob(
  sb: SupabaseClient,
  jobId: string,
): Promise<JobNotePhoto[]> {
  const { data } = await sb.from('job_note_photos')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  return (data ?? []).map(rowToPhoto)
}

export async function deleteNotePhoto(
  sb: SupabaseClient,
  photo: JobNotePhoto,
): Promise<void> {
  if (photo.storagePath) await sb.storage.from(BUCKET).remove([photo.storagePath])
  await sb.from('job_note_photos').delete().eq('id', photo.id)
}

export async function signedNotePhotoUrl(
  sb: SupabaseClient,
  storagePath: string,
  seconds = 3600,
): Promise<string | null> {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, seconds)
  return data?.signedUrl ?? null
}

function rowToPhoto(r: Record<string, unknown>): JobNotePhoto {
  return {
    id:          r.id as string,
    noteId:      r.note_id as string,
    jobId:       r.job_id as string,
    storagePath: (r.storage_path as string) ?? '',
    createdAt:   r.created_at as string | undefined,
  }
}
