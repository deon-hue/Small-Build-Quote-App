'use client'

/**
 * The in-app document viewer. Mounted once in the root layout. A PDF, picture, printable page or file opens full screen with a big Close button
 * (and Esc, and the device's Back), instead of a new browser tab — which, in the installed app on a tablet, has no way back.
 * It opens when something calls showHtmlDocument / showUrlDocument (lib/open-document.ts), and it also catches a tap on a link that would open
 * a stored file or another page of this app in a new tab, on touch screens and in the installed app only. Other links (WhatsApp, other websites)
 * are left alone.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import DocumentPreviewPane from '@/components/DocumentPreviewPane'
import {
  OPEN_DOCUMENT_EVENT, setDocumentHostMounted, shouldUseInAppViewer, looksLikeFileUrl, isSameAppPage, documentKind, type OpenDocumentDetail,
} from '@/lib/open-document'

type Doc = OpenDocumentDetail | { kind: 'page'; url: string; title: string }

export default function DocumentViewerHost() {
  const [doc, setDoc] = useState<Doc | null>(null)
  const [sniffed, setSniffed] = useState<'pdf' | 'image' | 'unknown' | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const pushed = useRef(false)

  const open = useCallback((d: Doc) => {
    setSniffed(null)
    setDoc(d)
    // The device's Back should close the viewer, not leave the app
    try { window.history.pushState({ docViewer: true }, ''); pushed.current = true } catch { pushed.current = false }
  }, [])

  const close = useCallback(() => {
    setDoc(null)
    if (pushed.current) { pushed.current = false; try { window.history.back() } catch { /* nothing to go back to */ } }
  }, [])

  useEffect(() => {
    setDocumentHostMounted(true)
    const onOpen = (e: Event) => open((e as CustomEvent<OpenDocumentDetail>).detail)
    const onPop = () => { if (pushed.current) { pushed.current = false; setDoc(null) } }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    // A link that would open a file or a page of this app in a new tab opens here instead (touch screens and the installed app only)
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || !shouldUseInAppViewer()) return
      const a = (e.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null
      if (!a || a.target !== '_blank' || !a.href || a.hasAttribute('download') || a.hasAttribute('data-no-viewer')) return
      const title = (a.title || a.textContent || 'Document').trim().slice(0, 80) || 'Document'
      if (looksLikeFileUrl(a.href)) { e.preventDefault(); open({ kind: 'url', url: a.href, title }) }
      else if (isSameAppPage(a.href)) { e.preventDefault(); open({ kind: 'page', url: a.href, title }) }
    }
    window.addEventListener(OPEN_DOCUMENT_EVENT, onOpen)
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick, true)
    return () => {
      setDocumentHostMounted(false)
      window.removeEventListener(OPEN_DOCUMENT_EVENT, onOpen)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick, true)
    }
  }, [open, close])

  // A file with no type in its name (something made in the browser, say): ask what it is
  const url = doc?.kind === 'url' ? doc.url : null
  const mime = doc?.kind === 'url' ? doc.mime : undefined
  useEffect(() => {
    if (!url) return
    if (documentKind(url, mime) !== 'unknown') return
    let cancelled = false
    fetch(url).then(r => r.blob()).then(b => { if (!cancelled) setSniffed(documentKind('', b.type)) }).catch(() => { if (!cancelled) setSniffed('unknown') })
    return () => { cancelled = true }
  }, [url, mime])

  // Lock the page behind it from scrolling while it is open
  useEffect(() => {
    if (!doc) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [doc])

  if (!doc) return null
  const fileKind = doc.kind === 'url' ? (documentKind(doc.url, doc.mime) !== 'unknown' ? documentKind(doc.url, doc.mime) : (sniffed ?? 'unknown')) : 'unknown'
  const btn: React.CSSProperties = { minHeight: 44, padding: '0 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }

  return (
    <div role="dialog" aria-modal="true" aria-label={doc.title}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', flexDirection: 'column', background: '#1e293b' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', paddingTop: 'max(8px, env(safe-area-inset-top))', background: '#3a4149', flexShrink: 0 }}>
        <button type="button" onClick={close} aria-label="Close" style={{ ...btn, background: '#9acd32', borderColor: '#9acd32', color: '#1f2933' }}>✕ Close</button>
        <div style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
        {doc.kind === 'html' && (
          <button type="button" style={btn} onClick={() => { try { iframeRef.current?.contentWindow?.focus(); iframeRef.current?.contentWindow?.print() } catch { window.print() } }}>🖨 Print</button>
        )}
        {doc.kind !== 'html' && (
          <a href={doc.url} target="_blank" rel="noreferrer" data-no-viewer style={{ ...btn, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', fontSize: 13 }}
            onClick={e => e.stopPropagation()}>↗ Open in browser</a>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {doc.kind === 'html' && <iframe ref={iframeRef} title={doc.title} srcDoc={doc.html} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />}
        {doc.kind === 'page' && <iframe title={doc.title} src={doc.url} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />}
        {doc.kind === 'url' && (fileKind === 'pdf' || fileKind === 'image') && <DocumentPreviewPane url={doc.url} isPdf={fileKind === 'pdf'} fileName={doc.title} />}
        {doc.kind === 'url' && fileKind === 'unknown' && (
          <div style={{ margin: 'auto', color: '#cbd5e1', fontSize: 14, textAlign: 'center', padding: 24, lineHeight: 1.6 }}>
            {sniffed === null ? 'Opening…' : 'This kind of file can’t be shown here. Use Open in browser at the top, or Close.'}
          </div>
        )}
      </div>
    </div>
  )
}
