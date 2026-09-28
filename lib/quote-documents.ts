import type { SupabaseClient } from '@supabase/supabase-js'
import type { QuoteDocument, AttachmentCategory } from './types'

const BUCKET = 'quote-documents'

function stamp() { return Date.now().toString(36) }

export async function uploadQuoteDocument(
  sb: SupabaseClient,
  userId: string,
  /** The quote's real id, or a locally-generated per-session key for a quote that hasn't
   *  been saved yet (see reassignQuoteDocuments) — always pass a concrete value, never the
   *  bare literal 'draft': that's a single shared bucket every not-yet-saved quote would
   *  otherwise collide in, showing one quote's stray files on a completely different one. */
  quoteId: string,
  file: File,
  category: Exclude<AttachmentCategory, 'contract'>,
  label: string,
): Promise<{ document: QuoteDocument } | { error: string }> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${quoteId}/${stamp()}-${safe}`

  const { data: uploadData, error: uploadErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type })

  if (uploadErr || !uploadData) {
    const msg = (uploadErr as { message?: string })?.message || 'Storage upload failed'
    return { error: msg }
  }

  const { data, error: dbErr } = await sb.from('quote_documents').insert({
    user_id: userId,
    quote_id: quoteId,
    filename: file.name,
    storage_path: uploadData.path,
    mime_type: file.type,
    file_size: file.size,
    category,
    label: label.trim(),
  }).select().single()

  if (dbErr || !data) {
    await sb.storage.from(BUCKET).remove([uploadData.path])
    const msg = (dbErr as { message?: string })?.message || 'Database insert failed'
    return { error: msg }
  }

  return { document: rowToDocument(data) }
}

export async function fetchQuoteDocuments(
  sb: SupabaseClient,
  quoteId: string,
): Promise<QuoteDocument[]> {
  const { data } = await sb.from('quote_documents')
    .select('*')
    .eq('quote_id', quoteId)
    .order('uploaded_at', { ascending: true })
  return (data ?? []).map(rowToDocument)
}

export async function deleteQuoteDocument(
  sb: SupabaseClient,
  doc: QuoteDocument,
): Promise<void> {
  if (doc.storagePath) await sb.storage.from(BUCKET).remove([doc.storagePath])
  await sb.from('quote_documents').delete().eq('id', doc.id)
}

export async function signedQuoteDocumentUrl(
  sb: SupabaseClient,
  storagePath: string,
  seconds = 3600,
): Promise<string | null> {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, seconds)
  return data?.signedUrl ?? null
}

/** Re-points a batch of attachments (by their own row ids — never a blanket 'draft' match,
 *  which could grab another quote's still-unsaved files) at a quote's real id, the first
 *  time that quote is saved. Safe to call with ids that already belong to that quote (e.g.
 *  when editing an existing quote and this just re-runs after another save) — it's a no-op
 *  UPDATE for those rows. */
export async function reassignQuoteDocuments(
  sb: SupabaseClient,
  ids: string[],
  realQuoteId: string,
): Promise<void> {
  if (!ids.length) return
  await sb.from('quote_documents').update({ quote_id: realQuoteId }).in('id', ids)
}

function rowToDocument(r: Record<string, unknown>): QuoteDocument {
  return {
    id:          r.id as string,
    quoteId:     r.quote_id as string,
    fileName:    (r.filename as string) ?? '',
    storagePath: (r.storage_path as string) ?? '',
    mimeType:    (r.mime_type as string) ?? '',
    fileSize:    Number(r.file_size) || 0,
    category:    ((r.category as string) || 'document') as Exclude<AttachmentCategory, 'contract'>,
    label:       (r.label as string) ?? '',
    createdAt:   r.uploaded_at as string | undefined,
  }
}
