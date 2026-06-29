'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  url: string | null
  isPdf: boolean
  fileName: string
}

interface RenderedPage { dataUrl: string }

/**
 * Document preview with multi-page support, zoom and grab-to-pan.
 * - PDFs are rendered page-by-page to canvases via pdfjs-dist (every page shown,
 *   stacked vertically) so multi-page bills are fully visible.
 * - Images are shown directly.
 * Zoom is applied as a percentage of the pane width, so zoom = 1 fits the width
 * and zoom > 1 overflows to enable horizontal scrolling / panning.
 */
export default function DocumentPreviewPane({ url, isPdf, fileName }: Props) {
  const [zoom, setZoom] = useState(1)
  const [pages, setPages] = useState<RenderedPage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [panning, setPanning] = useState(false)

  // Render every page of a PDF to an image once the signed URL is available.
  useEffect(() => {
    if (!url || !isPdf) { setPages([]); return }
    let cancelled = false
    setLoading(true); setError(null); setPages([]); setZoom(1)
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const buf = await fetch(url).then(r => r.arrayBuffer())
        if (cancelled) return
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise
        const rendered: RenderedPage[] = []
        const scale = 2 // base render resolution — kept crisp when zoomed in
        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale })
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: ctx, viewport, canvas }).promise
          rendered.push({ dataUrl: canvas.toDataURL('image/png') })
        }
        if (!cancelled) setPages(rendered)
      } catch (err) {
        console.error('PDF preview error:', err)
        if (!cancelled) setError('Could not render preview.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [url, isPdf])

  // Grab-to-pan: drag anywhere in the pane to scroll around.
  function onMouseDown(e: React.MouseEvent) {
    const el = scrollRef.current
    if (!el) return
    pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
    setPanning(true)
  }
  function onMouseMove(e: React.MouseEvent) {
    const el = scrollRef.current
    if (!el || !pan.current) return
    el.scrollLeft = pan.current.left - (e.clientX - pan.current.x)
    el.scrollTop = pan.current.top - (e.clientY - pan.current.y)
  }
  function endPan() { pan.current = null; setPanning(false) }

  // Ctrl/⌘ + wheel to zoom (matches the hand-pan interaction model).
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(z => clampZoom(z - e.deltaY * 0.002))
  }

  const zoomIn = () => setZoom(z => clampZoom(z + 0.25))
  const zoomOut = () => setZoom(z => clampZoom(z - 0.25))
  const reset = () => setZoom(1)

  const widthPct = `${zoom * 100}%`

  return (
    <div style={paneStyle}>
      {url && (
        <div style={controls}>
          <button onClick={zoomIn} style={zoomBtn} title="Zoom in">＋</button>
          {zoom !== 1 && <button onClick={reset} style={zoomBtn} title="Reset zoom">↺</button>}
          <button onClick={zoomOut} style={zoomBtn} disabled={zoom <= MIN_ZOOM} title="Zoom out">－</button>
          {pages.length > 1 && (
            <span style={pageBadge}>{pages.length} pages</span>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
        onWheel={onWheel}
        style={{
          ...scrollArea,
          cursor: panning ? 'grabbing' : 'grab',
        }}
      >
        {!url ? (
          <span style={msg}>Loading preview…</span>
        ) : error ? (
          <span style={msg}>{error}</span>
        ) : isPdf ? (
          loading ? (
            <span style={msg}>Rendering pages…</span>
          ) : (
            <div style={{ width: widthPct, display: 'flex', flexDirection: 'column', gap: 10, margin: '0 auto' }}>
              {pages.map((p, i) => (
                <img
                  key={i}
                  src={p.dataUrl}
                  alt={`${fileName} — page ${i + 1}`}
                  draggable={false}
                  style={pageImg}
                />
              ))}
            </div>
          )
        ) : (
          <img
            src={url}
            alt={fileName}
            draggable={false}
            style={{ ...pageImg, width: widthPct, margin: '0 auto' }}
          />
        )}
      </div>
    </div>
  )
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 5
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, +z.toFixed(2)))

const paneStyle: React.CSSProperties = {
  flex: '1 1 45%', background: '#1e293b', position: 'relative',
  display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden',
}
const scrollArea: React.CSSProperties = {
  flex: 1, overflow: 'auto', padding: 10, display: 'flex',
  alignItems: 'flex-start', justifyContent: 'center',
}
const pageImg: React.CSSProperties = {
  width: '100%', height: 'auto', display: 'block',
  background: '#fff', borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
  userSelect: 'none',
}
const controls: React.CSSProperties = {
  position: 'absolute', top: 10, right: 10, zIndex: 10,
  display: 'flex', gap: 4, alignItems: 'center',
}
const pageBadge: React.CSSProperties = {
  background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, fontWeight: 600,
  padding: '0 8px', height: 30, borderRadius: 5, display: 'flex', alignItems: 'center',
}
const zoomBtn: React.CSSProperties = {
  background: 'rgba(0,0,0,0.55)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)',
  borderRadius: 5, width: 30, height: 30, cursor: 'pointer', fontSize: 17, fontWeight: 700,
  lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
const msg: React.CSSProperties = { color: '#94a3b8', fontSize: 13, margin: 'auto' }
