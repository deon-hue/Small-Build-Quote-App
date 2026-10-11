// Showing a PDF, a picture, a printable page or a file inside the app, with a Close button, instead of in a new browser tab.
// The installed app on a tablet or phone has no tabs and no back button, so a file opened in a new tab can only be left by closing the whole app.
// On those devices (installed app, or any touch screen) these helpers hand the document to the viewer (components/DocumentViewerHost.tsx) and return
// true; on a desktop browser they return false and the caller opens a new tab as before. Client-side only.

export type OpenDocumentDetail =
  | { kind: 'html'; html: string; title: string }
  | { kind: 'url'; url: string; title: string; mime?: string }

export const OPEN_DOCUMENT_EVENT = 'buildos:open-document'

let hostMounted = false
export function setDocumentHostMounted(v: boolean) { hostMounted = v }

/** True in the installed app (standalone) or on any touch screen, once the viewer is mounted. */
export function shouldUseInAppViewer(): boolean {
  if (typeof window === 'undefined' || !hostMounted) return false
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true
    if ((navigator as unknown as { standalone?: boolean }).standalone === true) return true
    return window.matchMedia('(pointer: coarse)').matches
  } catch { return false }
}

function emit(detail: OpenDocumentDetail) { window.dispatchEvent(new CustomEvent<OpenDocumentDetail>(OPEN_DOCUMENT_EVENT, { detail })) }

/** Shows a printable HTML page (a quote, invoice, report or list) in the viewer. Returns false when the caller should open a new tab instead. */
export function showHtmlDocument(html: string, opts: { title: string }): boolean {
  if (!shouldUseInAppViewer()) return false
  emit({ kind: 'html', html, title: opts.title })
  return true
}

/** Shows a file (PDF, picture, a blob made in the browser) in the viewer. Returns false when the caller should open a new tab instead. */
export function showUrlDocument(url: string, opts: { title: string; mime?: string }): boolean {
  if (!shouldUseInAppViewer()) return false
  emit({ kind: 'url', url, title: opts.title, mime: opts.mime })
  return true
}

const FILE_EXT = /\.(pdf|png|jpe?g|gif|webp|heic|heif|bmp|svg)$/i

/** Whether a link points at a file the viewer can show (a stored document or picture, or something made in the browser), as opposed to another website. */
export function looksLikeFileUrl(href: string): boolean {
  try {
    const u = new URL(href, window.location.href)
    if (u.protocol === 'blob:') return true
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    return FILE_EXT.test(u.pathname) || u.pathname.includes('/storage/v1/object/')
  } catch { return false }
}

/** Whether a link is a page of this same app (terms, a client page...). */
export function isSameAppPage(href: string): boolean {
  try {
    const u = new URL(href, window.location.href)
    return u.origin === window.location.origin && !FILE_EXT.test(u.pathname)
  } catch { return false }
}

/** Which way to show a file: from its type if known, else its name. */
export function documentKind(url: string, mime?: string): 'pdf' | 'image' | 'unknown' {
  const m = (mime ?? '').toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.startsWith('image/')) return 'image'
  let path = url
  try { path = new URL(url, 'http://x').pathname } catch { /* keep as is */ }
  if (/\.pdf$/i.test(path)) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(path)) return 'image'
  return 'unknown'
}
