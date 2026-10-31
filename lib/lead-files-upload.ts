import type { SupabaseClient } from '@supabase/supabase-js'
import { toJpeg } from './order-item-images'
import { isImageType, isLeadFilePath, leadFileProblem, leadFileType, safeFileName, LEAD_FILE_MAX_BYTES, type LeadFile } from './lead-files'

// The browser half of files on a lead (rules and the list are lib/lead-files.ts): a picture is shrunk to a JPEG in the browser (a phone photo is several MB), anything else goes up as it is, into the private
// job-documents bucket under <user>/leads/<lead>/, which that bucket's policy already allows for your own folder, so there is no storage setup.

const BUCKET = 'job-documents'
/** the longest side of a kept picture: big enough to read a dimension on a photographed plan */
const LEAD_PICTURE_SIDE = 2000

/** Uploads one file for a lead and returns the entry for the lead's list. `leadKey` is the lead's id, or a random word for a lead that is not saved yet. */
export async function uploadLeadFile(sb: SupabaseClient, file: File, leadKey: string): Promise<{ file: LeadFile } | { error: string }> {
  const problem = leadFileProblem(file.name, file.type, file.size)
  if (problem) return { error: problem }
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: 'You are not signed in: please refresh and try again.' }
  let blob: Blob = file
  let name = file.name || 'file'
  let type = leadFileType(file.name, file.type)
  let asImage = false
  if (isImageType(type)) {
    try {
      blob = await toJpeg(file, LEAD_PICTURE_SIDE)
      type = 'image/jpeg'; asImage = true
      name = name.replace(/\.[A-Za-z0-9]{1,5}$/, '') + '.jpg'
    } catch {
      // a picture this browser cannot open (an iPhone HEIC on a computer, say) is still kept, as a file, exactly as it was sent
      blob = file; asImage = false
    }
  }
  if (blob.size > LEAD_FILE_MAX_BYTES) return { error: `${file.name} is too big to keep here.` }
  const key = (leadKey || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 60) || 'new'
  const path = `${user.id}/leads/${key}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${safeFileName(name)}`
  if (!isLeadFilePath(path)) return { error: `${file.name} could not be given a safe name.` }
  const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type })
  if (up.error) return { error: `${file.name} could not be saved: ${up.error.message || 'the upload failed'}` }
  return { file: { name, url: '', isImage: asImage, path } }
}

/** Links the builder's own screen can open the files from (one for each file that has a path); files that arrived with a public address need none. */
export async function signLeadFiles(sb: SupabaseClient, files: LeadFile[], seconds = 3600): Promise<Record<string, string>> {
  const paths = files.map(f => f.path).filter(isLeadFilePath)
  if (!paths.length) return {}
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, seconds)
  const out: Record<string, string> = {}
  for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl
  return out
}

/** Removes stored copies (best effort: when a file is taken off a lead, or the lead is deleted). Only our own paths are ever touched. */
export async function removeLeadFiles(sb: SupabaseClient, files: LeadFile[]): Promise<void> {
  const paths = files.map(f => f.path).filter(isLeadFilePath)
  for (let i = 0; i < paths.length; i += 100) { try { await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)) } catch { /* left behind at worst */ } }
}
