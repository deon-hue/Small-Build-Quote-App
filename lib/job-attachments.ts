import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobAttachment, AttachmentCategory } from './types'

const BUCKET = 'job-documents'

function stamp() { return Date.now().toString(36) }

export async function uploadAttachment(
  sb: SupabaseClient,
  userId: string,
  jobId: string,
  file: File,
  category: AttachmentCategory,
  label: string,
): Promise<JobAttachment | null> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${jobId}/attachments/${stamp()}-${safe}`

  const { data: uploadData, error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })

  if (uploadErr || !uploadData) {
    console.error('[uploadAttachment] storage error', uploadErr)
    return null
  }

  const { data, error } = await sb.from('job_attachments').insert({
    user_id: userId,
    job_id: jobId,
    file_name: file.name,
    storage_path: uploadData.path,
    mime_type: file.type,
    file_size: file.size,
    category,
    label: label.trim(),
  }).select().single()

  if (error || !data) {
    await sb.storage.from(BUCKET).remove([uploadData.path])
    return null
  }

  return rowToAttachment(data)
}

export async function fetchAttachments(
  sb: SupabaseClient,
  jobId: string,
): Promise<JobAttachment[]> {
  const { data } = await sb.from('job_attachments')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
  return (data ?? []).map(rowToAttachment)
}

export async function deleteAttachment(
  sb: SupabaseClient,
  att: JobAttachment,
): Promise<void> {
  if (att.storagePath) await sb.storage.from(BUCKET).remove([att.storagePath])
  await sb.from('job_attachments').delete().eq('id', att.id)
}

export async function signedAttachmentUrl(
  sb: SupabaseClient,
  storagePath: string,
  seconds = 3600,
): Promise<string | null> {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, seconds)
  return data?.signedUrl ?? null
}

function rowToAttachment(r: Record<string, unknown>): JobAttachment {
  return {
    id:          r.id as string,
    jobId:       r.job_id as string,
    fileName:    (r.file_name as string) ?? '',
    storagePath: (r.storage_path as string) ?? '',
    mimeType:    (r.mime_type as string) ?? '',
    fileSize:    Number(r.file_size) || 0,
    category:    ((r.category as string) || 'document') as AttachmentCategory,
    label:       (r.label as string) ?? '',
    createdAt:   r.created_at as string | undefined,
  }
}
