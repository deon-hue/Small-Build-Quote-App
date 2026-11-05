// Cloud copies of a take-off's plan pictures, so a take-off's plans follow it to any computer. The device's own copy (IndexedDB, lib/takeoff-sheet-images.ts) stays the one the screen reads first;
// these put a copy in the user's account and fetch it back when the device has none.
//
// They use the existing private `quote-documents` bucket, whose policies already let each user read, write and delete only inside their own folder (supabase/phase9.sql): no new setup. A take-off's pictures live
// in `{user_id}/takeoff-{project_id}/{sheet_id}.pic`. The bucket allows 10MB a file, so a bigger picture is squeezed first. There is no UPDATE policy, so a picture is replaced by removing it and uploading again.

import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'quote-documents'
/** The bucket's limit is 10MB a file; stay a little under it. */
export const MAX_PICTURE_BYTES = 9.5 * 1024 * 1024

const folderOf = (userId: string, projectId: string) => `${userId}/takeoff-${projectId}`
export const picturePath = (userId: string, projectId: string, sheetId: string) => `${folderOf(userId, projectId)}/${sheetId}.pic`

/** A data: URL as a Blob, or null if it is not one. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(dataUrl)
  if (!m) return null
  const type = m[1] || 'application/octet-stream'
  try {
    if (/;base64/i.test(m[2])) {
      const bin = atob(m[3])
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new Blob([bytes], { type })
    }
    return new Blob([decodeURIComponent(m[3])], { type })
  } catch { return null }
}

/** A Blob as a data: URL (no FileReader, so it runs anywhere). */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(bin)}`
}

/** Re-draws a picture as a JPEG at a lower quality (and, if it still will not fit, smaller) until it is under the limit. Browser only. Returns null if it cannot. */
export async function shrinkPicture(dataUrl: string, maxBytes = MAX_PICTURE_BYTES): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const img = await new Promise<HTMLImageElement | null>(resolve => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => resolve(null)
    i.src = dataUrl
  })
  if (!img) return null
  for (const [scale, quality] of [[1, 0.75], [1, 0.6], [0.75, 0.6], [0.5, 0.6]] as const) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= maxBytes) return blob
  }
  return null
}

export type PictureUploadResult = 'saved' | 'too-big' | 'failed'

/** Puts a sheet's picture in the account, replacing any earlier one for that sheet. Never throws. */
export async function uploadSheetPicture(
  sb: SupabaseClient, userId: string, projectId: string, sheetId: string, dataUrl: string,
  shrink: (dataUrl: string) => Promise<Blob | null> = shrinkPicture,
): Promise<PictureUploadResult> {
  try {
    let blob = dataUrlToBlob(dataUrl)
    if (!blob) return 'failed'
    if (blob.size > MAX_PICTURE_BYTES) {
      const smaller = await shrink(dataUrl)
      if (!smaller) return 'too-big'
      blob = smaller
    }
    const path = picturePath(userId, projectId, sheetId)
    await sb.storage.from(BUCKET).remove([path])   // there is no update policy: replace by removing first (nothing there is fine)
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/jpeg' })
    return error ? 'failed' : 'saved'
  } catch { return 'failed' }
}

/** The sheet ids that have a picture in the account for this take-off, or null if the list could not be read. */
export async function listCloudPictureSheetIds(sb: SupabaseClient, userId: string, projectId: string): Promise<Set<string> | null> {
  try {
    const { data, error } = await sb.storage.from(BUCKET).list(folderOf(userId, projectId), { limit: 1000 })
    if (error || !data) return null
    return new Set(data.map((f: { name: string }) => f.name).filter(n => n.endsWith('.pic')).map(n => n.slice(0, -4)))
  } catch { return null }
}

/** A sheet's picture from the account as a data: URL, or null if there is none (or it could not be fetched). */
export async function downloadSheetPicture(sb: SupabaseClient, userId: string, projectId: string, sheetId: string): Promise<string | null> {
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(picturePath(userId, projectId, sheetId))
    if (error || !data) return null
    return await blobToDataUrl(data)
  } catch { return null }
}

/** Removes every picture of a take-off from the account (when the take-off is deleted). Returns whether it could be done. */
export async function deleteProjectPictures(sb: SupabaseClient, userId: string, projectId: string): Promise<boolean> {
  try {
    const folder = folderOf(userId, projectId)
    const { data, error } = await sb.storage.from(BUCKET).list(folder, { limit: 1000 })
    if (error) return false
    const paths = (data ?? []).filter((f: { name: string }) => f.name !== 'drawings').map((f: { name: string }) => `${folder}/${f.name}`)
    // the printed drawings (PDFs) kept with the take-off are in a folder of their own
    const { data: pdfs } = await sb.storage.from(BUCKET).list(`${folder}/drawings`, { limit: 1000 })
    for (const f of pdfs ?? []) paths.push(`${folder}/drawings/${f.name}`)
    if (paths.length === 0) return true
    const { error: rmErr } = await sb.storage.from(BUCKET).remove(paths)
    return !rmErr
  } catch { return false }
}

// ── Printed drawings (PDF) kept with the take-off ───────────────────────────────────────────────────────────────────────────────
// A drawing printed from Take-off can be saved with the take-off, so the quote can pick it from there. Same private bucket, a 'drawings' folder inside the take-off's own folder; the file name has a time stamp in front so
// a second print never replaces the first.

export interface SavedDrawing { path: string; name: string; at: number; size?: number }

const drawingsFolder = (userId: string, projectId: string) => `${folderOf(userId, projectId)}/drawings`
/** 'k3j2h1-Smith - Plan 1 - drawing.pdf' becomes the stamp 'k3j2h1' and the name 'Smith - Plan 1 - drawing.pdf' */
export function splitDrawingName(stored: string): { name: string; at: number } {
  const i = stored.indexOf('-')
  const stamp = i > 0 ? stored.slice(0, i) : ''
  const at = stamp && /^[0-9a-z]+$/.test(stamp) ? parseInt(stamp, 36) : 0
  return i > 0 && at > 1e12 ? { name: stored.slice(i + 1), at } : { name: stored, at: 0 }
}

/** Saves a printed drawing with the take-off. Never throws. */
export async function saveDrawingPdf(sb: SupabaseClient, userId: string, projectId: string, fileName: string, bytes: Uint8Array | Blob): Promise<{ path: string } | { error: string }> {
  try {
    const safe = fileName.replace(/[^a-zA-Z0-9._ -]/g, '_')
    const path = `${drawingsFolder(userId, projectId)}/${Date.now().toString(36)}-${safe}`
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type: 'application/pdf' })
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf' })
    return error ? { error: error.message || 'The drawing could not be saved' } : { path }
  } catch (e) { return { error: (e as Error)?.message || 'The drawing could not be saved' } }
}

/** The drawings saved with a take-off, newest first (empty if none or the list could not be read). */
export async function listDrawingPdfs(sb: SupabaseClient, userId: string, projectId: string): Promise<SavedDrawing[]> {
  try {
    const folder = drawingsFolder(userId, projectId)
    const { data, error } = await sb.storage.from(BUCKET).list(folder, { limit: 200 })
    if (error || !data) return []
    return data.filter((f: { name: string }) => /.pdf$/i.test(f.name)).map((f: { name: string; metadata?: { size?: number } | null }) => {
      const s = splitDrawingName(f.name)
      return { path: `${folder}/${f.name}`, name: s.name, at: s.at, size: f.metadata?.size }
    }).sort((a: SavedDrawing, b: SavedDrawing) => b.at - a.at)
  } catch { return [] }
}

export async function downloadDrawingPdf(sb: SupabaseClient, path: string): Promise<Blob | null> {
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(path)
    return error || !data ? null : data
  } catch { return null }
}

export async function deleteDrawingPdf(sb: SupabaseClient, path: string): Promise<boolean> {
  try { const { error } = await sb.storage.from(BUCKET).remove([path]); return !error } catch { return false }
}
