// Files kept on a lead: the pictures and plans a customer sends by WhatsApp, text or email, added by the builder (chosen, taken on a phone, pasted or dragged in). They sit in the lead's own list, `quote_requests.client_files`
// (the same list the enquiry form and a lead email already fill, so there is no new column and no SQL). A file that arrived on its own has a public `url`; one added here has only a `path` in the private job-documents
// bucket (<user>/leads/<lead>/<file>) and is shown through a link signed when the lead is opened, so only the signed-in company can read it. Pure rules only: the upload itself is lib/lead-files-upload.ts.

export interface LeadFile { name: string; url: string; isImage: boolean; path?: string }

/** most files on one lead, however they got there */
export const LEAD_FILES_MAX = 40
/** the biggest single file (pictures are shrunk first, so this is mostly for PDFs and drawings) */
export const LEAD_FILE_MAX_BYTES = 25 * 1024 * 1024

/** what the private bucket accepts (supabase/phase27.sql), by extension for a file the browser gives no type for */
const OK_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/tiff', 'image/gif', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const EXT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff', gif: 'image/gif', pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
/** the value for an <input accept="..."> */
export const LEAD_FILE_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx'

const extOf = (name: string) => ((name || '').match(/\.([A-Za-z0-9]{1,5})$/)?.[1] || '').toLowerCase()

/** The type a file is stored as: the browser's own when it is one we accept, else from the ending of its name (a phone sometimes gives none), else '' */
export function leadFileType(name: string, type: string): string {
  const t = (type || '').toLowerCase()
  if (OK_TYPES.has(t)) return t === 'image/jpg' ? 'image/jpeg' : t
  return EXT_TYPE[extOf(name)] || ''
}

export const isImageType = (t: string) => t.startsWith('image/')

/** Why a file cannot be added, in words, or null when it can */
export function leadFileProblem(name: string, type: string, size: number): string | null {
  const shown = name || 'That file'
  if (!leadFileType(name, type)) return `${shown} is not a kind of file that can be kept here. Pictures, PDFs, Word and Excel files can.`
  if (!(size > 0)) return `${shown} is empty.`
  if (size > LEAD_FILE_MAX_BYTES) return `${shown} is over ${LEAD_FILE_MAX_BYTES / 1024 / 1024} MB. Send a smaller one, or a PDF of it.`
  return null
}

/** A name safe for a storage path: letters, numbers, dot, dash, underscore only, never empty, the ending kept */
export function safeFileName(name: string): string {
  const ext = extOf(name)
  const base = (name || '').replace(/\.[A-Za-z0-9]{1,5}$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+|[._-]+$/g, '').slice(0, 80)
  return `${base || 'file'}${ext ? '.' + ext : ''}`
}

/** A picture pasted from the clipboard is always called "image.png": give it a name worth reading */
export function nameForPasted(name: string, type: string, n: number, now = new Date()): string {
  if (!/^image\.(png|jpe?g|gif|webp|bmp)$/i.test(name || '') && name) return name
  const ext = type.includes('png') ? 'png' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : 'jpg'
  const pad = (x: number) => String(x).padStart(2, '0')
  return `Pasted picture ${pad(now.getDate())}-${pad(now.getMonth() + 1)} ${pad(now.getHours())}.${pad(now.getMinutes())}${n > 1 ? ` (${n})` : ''}.${ext}`
}

const PATH = /^[0-9a-f-]{36}\/leads\/[A-Za-z0-9-]{1,60}\/[A-Za-z0-9._-]{1,140}$/i
/** Is this the path of a file made by the lead uploader? Anything else (another folder, `..`, a full web address) is never trusted, wherever it came from. */
export function isLeadFilePath(v: unknown): v is string {
  return typeof v === 'string' && PATH.test(v) && !v.includes('..')
}

/** The list as it came out of the database, made safe: only objects with a name and either a web address or one of our own paths, at most LEAD_FILES_MAX */
export function cleanLeadFiles(raw: unknown): LeadFile[] {
  if (!Array.isArray(raw)) return []
  const out: LeadFile[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const o = r as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.slice(0, 200) : ''
    const url = typeof o.url === 'string' ? o.url : ''
    const path = isLeadFilePath(o.path) ? o.path : undefined
    if (!name || (!url && !path)) continue
    out.push({ name, url: path ? '' : url, isImage: o.isImage === true, ...(path ? { path } : {}) })
    if (out.length >= LEAD_FILES_MAX) break
  }
  return out
}

/** Adds files to a lead's list, never over the limit; says how many did not fit */
export function addLeadFiles(existing: LeadFile[], added: LeadFile[], max = LEAD_FILES_MAX): { files: LeadFile[]; dropped: LeadFile[] } {
  const room = Math.max(0, max - existing.length)
  return { files: [...existing, ...added.slice(0, room)], dropped: added.slice(room) }
}

/** The list without the one at `index`, and the file taken out (so its stored copy can be removed) */
export function removeLeadFile(existing: LeadFile[], index: number): { files: LeadFile[]; removed: LeadFile | null } {
  if (index < 0 || index >= existing.length) return { files: existing, removed: null }
  return { files: existing.filter((_, i) => i !== index), removed: existing[index] }
}

/** The files on a clipboard or a drop, when it carries files and no words (copying words from a page can carry a picture of them too: that is not a file to keep) */
export function filesFromTransfer(dt: { files?: ArrayLike<File> | null; getData?: (t: string) => string } | null | undefined): File[] {
  if (!dt || !dt.files || dt.files.length === 0) return []
  let words = ''
  try { words = dt.getData ? dt.getData('text/plain') : '' } catch { words = '' }
  if (words.trim()) return []
  return Array.from(dt.files)
}
