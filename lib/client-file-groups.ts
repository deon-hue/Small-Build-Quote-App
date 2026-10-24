import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchClientFiles, type ClientFile } from './client-files'

// Everything filed against one customer, in folders: the files kept on the contact itself (client_files), then the files on each of their quotes (quote_documents) and jobs (job_attachments). Read only, never copied.
// Used by the Files section on the contact card and by Take-off's "load a plan from a customer's files".

export type FileBucket = 'quote-documents' | 'job-documents'
export interface FileItem { key: string; bucket: FileBucket; path: string; name: string; mime: string; size: number; category: string; label: string; at?: string; own?: ClientFile }
export interface FileGroup { id: string; kind: 'customer' | 'quote' | 'job'; title: string; files: FileItem[] }

export async function fetchClientFileGroups(
  sb: SupabaseClient,
  client: { id: string },
  quotes: { id: string; ref: string; title: string }[],
  jobs: { id: string; title: string }[],
): Promise<{ groups: FileGroup[]; notSetUp: boolean; readError: string }> {
  const out: FileGroup[] = []
  let readError = ''
  const own = await fetchClientFiles(sb, client.id)
  out.push({
    id: 'customer', kind: 'customer', title: 'Customer files',
    files: own.files.map(f => ({ key: 'c-' + f.id, bucket: 'job-documents' as FileBucket, path: f.storagePath, name: f.fileName, mime: f.mimeType, size: f.fileSize, category: f.category, label: f.label, at: f.createdAt, own: f })),
  })
  try {
    const qIds = quotes.map(q => q.id)
    if (qIds.length > 0) {
      const { data, error } = await sb.from('quote_documents').select('id, quote_id, filename, storage_path, mime_type, file_size, category, label, uploaded_at').in('quote_id', qIds).order('uploaded_at', { ascending: true })
      if (error) throw error
      for (const q of quotes) {
        const rows = (data ?? []).filter(d => d.quote_id === q.id)
        if (rows.length > 0) out.push({ id: 'q-' + q.id, kind: 'quote', title: `Quote ${q.ref || ''} ${q.title ? '— ' + q.title : ''}`.trim(), files: rows.map(d => ({ key: 'q-' + d.id, bucket: 'quote-documents' as FileBucket, path: d.storage_path, name: d.filename, mime: d.mime_type ?? '', size: Number(d.file_size) || 0, category: d.category || 'document', label: d.label ?? '', at: d.uploaded_at })) })
      }
    }
    const jIds = jobs.map(j => j.id)
    if (jIds.length > 0) {
      const { data, error } = await sb.from('job_attachments').select('id, job_id, file_name, storage_path, mime_type, file_size, category, label, created_at').in('job_id', jIds).order('created_at', { ascending: true })
      if (error) throw error
      for (const j of jobs) {
        const rows = (data ?? []).filter(d => d.job_id === j.id)
        if (rows.length > 0) out.push({ id: 'j-' + j.id, kind: 'job', title: `Job — ${j.title}`, files: rows.map(d => ({ key: 'j-' + d.id, bucket: 'job-documents' as FileBucket, path: d.storage_path, name: d.file_name, mime: d.mime_type ?? '', size: Number(d.file_size) || 0, category: d.category || 'document', label: d.label ?? '', at: d.created_at })) })
      }
    }
  } catch (e) {
    readError = `Some quote or job files could not be read (${(e as { message?: string })?.message || 'unknown problem'}).`
  }
  return { groups: out, notSetUp: own.notSetUp, readError }
}

/** A picture or a PDF: what Take-off can load as a plan. */
export function isPlanFile(f: { name: string; mime: string }): boolean {
  const n = f.name.toLowerCase()
  return f.mime.startsWith('image/') || f.mime === 'application/pdf' || n.endsWith('.pdf') || /\.(png|jpe?g|webp|gif|heic|heif)$/.test(n)
}
