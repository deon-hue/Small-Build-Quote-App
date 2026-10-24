import type { SupabaseClient } from '@supabase/supabase-js'
import type { AttachmentCategory } from './types'

// Files kept on a customer's contact card (table client_files, supabase/client-files.sql). The files themselves go in the existing private job-documents bucket under <user>/clients/<contact>/, which its
// storage policy already allows, so a customer's own files need no storage setup.

const BUCKET = 'job-documents'
export const CLIENT_FILE_MAX_BYTES = 50 * 1024 * 1024

export type ClientFileCategory = Exclude<AttachmentCategory, 'contract'>

export interface ClientFile {
  id: string
  clientId: string
  fileName: string
  storagePath: string
  mimeType: string
  fileSize: number
  category: ClientFileCategory
  label: string
  createdAt?: string
}

function rowToFile(r: Record<string, unknown>): ClientFile {
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    fileName: (r.file_name as string) ?? '',
    storagePath: (r.storage_path as string) ?? '',
    mimeType: (r.mime_type as string) ?? '',
    fileSize: Number(r.file_size) || 0,
    category: ((r.category as string) || 'document') as ClientFileCategory,
    label: (r.label as string) ?? '',
    createdAt: r.created_at as string | undefined,
  }
}

/** True when an error from the database means the client_files table has not been created yet (supabase/client-files.sql not run). */
export function tableMissing(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const m = (err.message ?? '').toLowerCase()
  return err.code === '42P01' || err.code === 'PGRST205' || m.includes('client_files') && (m.includes('does not exist') || m.includes('schema cache'))
}

export async function fetchClientFiles(sb: SupabaseClient, clientId: string): Promise<{ files: ClientFile[]; notSetUp: boolean }> {
  const { data, error } = await sb.from('client_files').select('*').eq('client_id', clientId).order('created_at', { ascending: true })
  if (error) return { files: [], notSetUp: tableMissing(error) }
  return { files: (data ?? []).map(rowToFile), notSetUp: false }
}

export async function uploadClientFile(
  sb: SupabaseClient,
  clientId: string,
  file: File,
  category: ClientFileCategory,
  label: string,
): Promise<{ file: ClientFile } | { error: string }> {
  if (file.size > CLIENT_FILE_MAX_BYTES) return { error: `${file.name} exceeds the 50 MB limit` }
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  // the row belongs to the company owner (a team member's files are the company's), the storage folder to whoever signed in
  let ownerId = user.id
  try { const { data } = await sb.rpc('get_effective_owner_id'); if (typeof data === 'string' && data) ownerId = data } catch { /* the signed-in user is the owner */ }
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${user.id}/clients/${clientId}/${Date.now().toString(36)}-${safe}`

  const { data: up, error: upErr } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (upErr || !up) return { error: (upErr as { message?: string } | null)?.message || 'Storage upload failed' }

  const { data, error } = await sb.from('client_files').insert({
    user_id: ownerId, client_id: clientId, file_name: file.name, storage_path: up.path, mime_type: file.type, file_size: file.size, category, label: label.trim(),
  }).select().single()
  if (error || !data) {
    await sb.storage.from(BUCKET).remove([up.path])
    return { error: tableMissing(error) ? "Customer files are not set up yet: the database step (supabase/client-files.sql) has not been run." : (error as { message?: string } | null)?.message || 'Database insert failed' }
  }
  return { file: rowToFile(data) }
}

export async function deleteClientFile(sb: SupabaseClient, f: ClientFile): Promise<void> {
  if (f.storagePath) await sb.storage.from(BUCKET).remove([f.storagePath])
  await sb.from('client_files').delete().eq('id', f.id)
}

/** Removes every file kept on a contact from storage (called before the contact is deleted, so no files are left behind using space). Quietly does nothing if the table is not set up. */
export async function removeAllClientFiles(sb: SupabaseClient, clientId: string): Promise<void> {
  try {
    const { data } = await sb.from('client_files').select('storage_path').eq('client_id', clientId)
    const paths = (data ?? []).map(r => r.storage_path as string).filter(Boolean)
    for (let i = 0; i < paths.length; i += 100) await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100))
  } catch { /* nothing to remove */ }
}
