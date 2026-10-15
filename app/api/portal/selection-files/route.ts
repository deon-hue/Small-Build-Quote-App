// A client adds a photo or PDF to one of their Selections. The database (supabase/job-selections.sql) decides whether this customer may add to this item and where the file must go;
// this route checks the file itself, stores it in the builder's storage and records it. The file is only recorded if the database accepts the path it was stored at.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { rowToFile, SELECTION_MAX_FILE_BYTES } from '@/lib/selections'

const BUCKET = 'job-documents'
export const maxDuration = 30

// what a file is by what it starts with, not by what the browser says it is
function sniff(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  if (buf.length > 5 && buf.slice(0, 5).toString() === '%PDF-') return 'application/pdf'
  return null
}
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' } as const
const safeName = (n: string) => n.replace(/[^a-z0-9._-]/gi, '_').toLowerCase().slice(0, 80) || 'file'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const file = form.get('file')
  const selectionId = String(form.get('selectionId') || '')
  if (!(file instanceof File) || !selectionId) return NextResponse.json({ error: 'Choose a file first.' }, { status: 400 })
  if (file.size > SELECTION_MAX_FILE_BYTES) return NextResponse.json({ error: 'That file is too big. Please use a photo or PDF under about 4 MB.' }, { status: 413 })

  const buf = Buffer.from(await file.arrayBuffer())
  const kind = sniff(buf)
  if (!kind) return NextResponse.json({ error: 'Please use a photo (JPEG, PNG or WebP) or a PDF.' }, { status: 400 })

  // may this customer add a file to this item, and where does it go?
  const { data: target, error: tErr } = await sb.rpc('portal_selection_file_target', { p_selection_id: selectionId })
  const t = target as { owner?: string; job_id?: string } | null
  if (tErr || !t || !t.owner || !t.job_id) return NextResponse.json({ error: 'You cannot add a file to this item (it may be full, or already ordered).' }, { status: 403 })

  const baseName = safeName(file.name || 'file').replace(/\.[a-z0-9]+$/i, '')
  const path = `${t.owner}/selections/${t.job_id}/${selectionId}/${Date.now().toString(36)}-${baseName}.${EXT[kind]}`
  const svc = createServiceRoleClient()
  const { error: upErr } = await svc.storage.from(BUCKET).upload(path, buf, { contentType: kind, upsert: false })
  if (upErr) return NextResponse.json({ error: 'Could not save the file. Please try again.' }, { status: 500 })

  const { data: fileId, error: addErr } = await sb.rpc('portal_add_selection_file', { p_selection_id: selectionId, p_path: path, p_name: (file.name || baseName).slice(0, 200), p_mime: kind, p_size: buf.length })
  if (addErr || !fileId) {
    try { await svc.storage.from(BUCKET).remove([path]) } catch { /* orphaned at worst */ }
    return NextResponse.json({ error: 'Could not add the file to this item.' }, { status: 403 })
  }
  const { data: signed } = await svc.storage.from(BUCKET).createSignedUrl(path, 3600)
  return NextResponse.json({ ok: true, file: rowToFile({ id: fileId, file_name: file.name, mime_type: kind, file_size: buf.length }, signed?.signedUrl ?? null) })
}
