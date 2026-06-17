// CRUD + file helpers for the job document/cost-capture feature.
// Uses the browser Supabase client (RLS scopes everything to the user).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobCost, JobDocument, JobCostCategory, InboxDocument, QuotePhase } from './types'
import type { ExtractedCostLine } from './doc-extract/types'

const BUCKET = 'job-documents'

// ── Quoted budget (per cost category) from a quote's phases ───────────────────
export interface CategoryBudget { labour: number; materials: number; plant: number; subcontractors: number; other: number; total: number }

/** Cost budget (ex-markup, ex-VAT) per category, mirroring how the app totals a quote. */
export function quoteBudget(phases: QuotePhase[]): CategoryBudget {
  const b: CategoryBudget = { labour: 0, materials: 0, plant: 0, subcontractors: 0, other: 0, total: 0 }
  for (const p of phases) {
    for (const i of p.items) {
      if (i.enabled === false) continue
      b.labour += i.labour ?? 0
      b.materials += i.materials ?? 0
      b.plant += i.plantHire ?? 0
      b.subcontractors += i.subcontractors ?? 0
      b.other += i.other ?? 0
    }
    for (const pr of p.products ?? []) if (pr.enabled !== false) b.materials += (pr.costPrice || 0) * (pr.qty || 0)
    for (const pl of p.plantItems ?? []) if (pl.enabled !== false) b.plant += (pl.costPrice || 0) * (pl.qty || 0)
  }
  b.total = +(b.labour + b.materials + b.plant + b.subcontractors + b.other).toFixed(2)
  return b
}

// ── Row <-> model mapping ─────────────────────────────────────────────────────
function rowToCost(r: Record<string, unknown>): JobCost {
  return {
    id: r.id as string,
    jobId: (r.job_id as string) || undefined,
    quoteId: (r.quote_id as string) || undefined,
    documentId: (r.document_id as string) || undefined,
    supplier: (r.supplier as string) ?? '',
    docDate: (r.doc_date as string) || '',
    docNumber: (r.doc_number as string) ?? '',
    description: (r.description as string) ?? '',
    costCategory: (r.cost_category as JobCostCategory) ?? 'materials',
    netAmount: Number(r.net_amount) || 0,
    vatAmount: Number(r.vat_amount) || 0,
    grossAmount: Number(r.gross_amount) || 0,
    paymentStatus: (r.payment_status as JobCost['paymentStatus']) ?? 'unknown',
    source: (r.source as JobCost['source']) ?? 'document',
    chargeToClient: Boolean(r.charge_to_client),
    createdAt: r.created_at as string | undefined,
  }
}

function costToRow(c: Partial<JobCost>) {
  const row: Record<string, unknown> = {}
  if (c.jobId !== undefined) row.job_id = c.jobId
  if (c.quoteId !== undefined) row.quote_id = c.quoteId ?? null
  if (c.documentId !== undefined) row.document_id = c.documentId ?? null
  if (c.supplier !== undefined) row.supplier = c.supplier
  if (c.docDate !== undefined) row.doc_date = c.docDate || null
  if (c.docNumber !== undefined) row.doc_number = c.docNumber
  if (c.description !== undefined) row.description = c.description
  if (c.costCategory !== undefined) row.cost_category = c.costCategory
  if (c.netAmount !== undefined) row.net_amount = c.netAmount
  if (c.vatAmount !== undefined) row.vat_amount = c.vatAmount
  if (c.grossAmount !== undefined) row.gross_amount = c.grossAmount
  if (c.paymentStatus !== undefined) row.payment_status = c.paymentStatus
  if (c.source !== undefined) row.source = c.source
  if (c.chargeToClient !== undefined) row.charge_to_client = c.chargeToClient
  return row
}

// ── Costs ─────────────────────────────────────────────────────────────────────
export async function fetchJobCosts(sb: SupabaseClient, userId: string, jobId: string): Promise<JobCost[]> {
  const { data } = await sb.from('job_costs').select('*')
    .eq('user_id', userId).eq('job_id', jobId).order('created_at', { ascending: false })
  return (data ?? []).map(rowToCost)
}

export async function insertJobCost(sb: SupabaseClient, userId: string, cost: Partial<JobCost>): Promise<JobCost | null> {
  const { data } = await sb.from('job_costs').insert({ ...costToRow(cost), user_id: userId }).select().single()
  return data ? rowToCost(data) : null
}

export async function updateJobCost(sb: SupabaseClient, id: string, cost: Partial<JobCost>): Promise<JobCost | null> {
  const { data } = await sb.from('job_costs').update({ ...costToRow(cost), updated_at: new Date().toISOString() }).eq('id', id).select().single()
  return data ? rowToCost(data) : null
}

export async function deleteJobCost(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('job_costs').delete().eq('id', id)
}

// ── Documents ─────────────────────────────────────────────────────────────────
export async function insertJobDocument(sb: SupabaseClient, userId: string, doc: {
  jobId: string; quoteId?: string; fileName: string; storagePath: string; mimeType: string; fileSize: number;
  status?: JobDocument['status']; rawExtraction?: unknown
}): Promise<string | null> {
  const { data } = await sb.from('job_documents').insert({
    user_id: userId, job_id: doc.jobId, quote_id: doc.quoteId ?? null,
    file_name: doc.fileName, storage_path: doc.storagePath, mime_type: doc.mimeType,
    file_size: doc.fileSize, status: doc.status ?? 'reviewed', raw_extraction: doc.rawExtraction ?? null,
  }).select('id').single()
  return data?.id ?? null
}

/** Upload a file to the private job-documents bucket. Returns the storage path. */
export async function uploadJobDocumentFile(sb: SupabaseClient, userId: string, jobId: string, file: File | Blob, fileName: string): Promise<string | null> {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${jobId}/${stamp()}-${safe}`
  const { data, error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file instanceof File ? file.type : undefined,
  })
  if (error) { console.error('upload error', error); return null }
  return data?.path ?? null
}

export async function signedDocUrl(sb: SupabaseClient, storagePath: string, seconds = 300): Promise<string | null> {
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, seconds)
  return data?.signedUrl ?? null
}

// ── Document inbox ────────────────────────────────────────────────────────────
function rowToDoc(r: Record<string, unknown>): InboxDocument {
  const status = r.status === 'allocated' ? 'allocated' : r.status === 'archived' ? 'archived' : r.status === 'error' ? 'error' : 'unallocated'
  return {
    id: r.id as string,
    jobId: (r.job_id as string) || undefined,
    fileName: (r.file_name as string) ?? '',
    storagePath: (r.storage_path as string) ?? '',
    mimeType: (r.mime_type as string) ?? '',
    fileSize: Number(r.file_size) || 0,
    status,
    extraction: (r.raw_extraction as Record<string, unknown>) ?? null,
    xeroBillId: (r.xero_bill_id as string) || undefined,
    createdAt: r.created_at as string | undefined,
  }
}

/** Upload a file to the inbox (no job yet). Returns storage path. */
export async function uploadInboxFile(sb: SupabaseClient, userId: string, file: File | Blob, fileName: string): Promise<string | null> {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/inbox/${stamp()}-${safe}`
  const { data, error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file instanceof File ? file.type : undefined,
  })
  if (error) { console.error('inbox upload error', error); return null }
  return data?.path ?? null
}

export async function fetchDocuments(sb: SupabaseClient, userId: string): Promise<InboxDocument[]> {
  const { data } = await sb.from('job_documents').select('*').eq('user_id', userId).order('created_at', { ascending: false })
  return (data ?? []).map(rowToDoc)
}

export async function createInboxDocument(sb: SupabaseClient, userId: string, doc: {
  fileName: string; storagePath: string; mimeType: string; fileSize: number; rawExtraction?: unknown
}): Promise<InboxDocument | null> {
  const { data } = await sb.from('job_documents').insert({
    user_id: userId, job_id: null, file_name: doc.fileName, storage_path: doc.storagePath,
    mime_type: doc.mimeType, file_size: doc.fileSize, status: 'unallocated', raw_extraction: doc.rawExtraction ?? null,
  }).select().single()
  return data ? rowToDoc(data) : null
}

export async function deleteDocument(sb: SupabaseClient, doc: InboxDocument): Promise<void> {
  if (doc.storagePath) await sb.storage.from(BUCKET).remove([doc.storagePath])
  await sb.from('job_documents').delete().eq('id', doc.id)
}

/** Allocate (or re-allocate) a document to a job: replaces its cost lines and flips status. */
export async function allocateDocument(
  sb: SupabaseClient, userId: string, doc: InboxDocument, defaultJobId: string,
  meta: { supplier: string; docDate: string; docNumber: string; paymentStatus: JobCost['paymentStatus'] },
  lines: ExtractedCostLine[],
): Promise<JobCost[]> {
  // Clear any costs previously created from this document (supports re-allocation).
  await sb.from('job_costs').delete().eq('document_id', doc.id)
  const created: JobCost[] = []
  for (const ln of lines) {
    const resolvedJobId = ln.jobId || defaultJobId
    if (!resolvedJobId) continue  // line has no job — skip
    const c = await insertJobCost(sb, userId, {
      jobId: resolvedJobId, documentId: doc.id, supplier: meta.supplier, docDate: meta.docDate, docNumber: meta.docNumber,
      description: ln.description, costCategory: ln.costCategory,
      netAmount: ln.netAmount, vatAmount: ln.vatAmount, grossAmount: ln.grossAmount,
      paymentStatus: meta.paymentStatus, source: 'document', chargeToClient: ln.chargeToClient ?? false,
    })
    if (c) created.push(c)
  }
  await sb.from('job_documents').update({
    job_id: defaultJobId || null, status: 'allocated', updated_at: new Date().toISOString(),
    raw_extraction: { ...meta, lines, grossAmount: lines.reduce((s, l) => s + l.grossAmount, 0) },
  }).eq('id', doc.id)
  return created
}

// A timestamp that doesn't rely on Date.now in restricted contexts is fine here
// (this is browser code); used only to keep upload paths unique.
function stamp(): string { return new Date().toISOString().replace(/[^0-9]/g, '') }

// ── Client-side file → base64 helpers (for the extraction request) ────────────
export function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve((e.target?.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Compress an image to <=1600px JPEG and return base64 (no data-URI prefix). */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1600
      const scale = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1])
    }
    img.onerror = reject
    img.src = url
  })
}
