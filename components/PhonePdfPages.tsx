'use client'

/**
 * The pages of a PDF on a phone or tablet. A large drawing at full size can run a phone out of memory when it is zoomed (the browser then reloads the app), so each page is drawn no bigger than a phone can hold,
 * only the pages near what is on screen are held, and the rest are let go and drawn again if scrolled back to. "Open in browser" still shows the file at full detail.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { pdfjsResources } from '@/lib/pdfjs-resources'
import { phoneRenderScale, pagesToHold } from '@/lib/pdf-phone'

interface Size { w: number; h: number }
/* eslint-disable @typescript-eslint/no-explicit-any */

export default function PhonePdfPages({ url, fileName, widthPct, scroller }: { url: string; fileName: string; widthPct: string; scroller: React.RefObject<HTMLDivElement | null> }) {
  const [sizes, setSizes] = useState<Size[]>([])
  const [shown, setShown] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const doc = useRef<any>(null)
  const boxes = useRef<(HTMLDivElement | null)[]>([])
  const held = useRef(new Map<number, string>())
  const wanted = useRef<number[]>([])
  const busy = useRef(false)
  const gone = useRef(false)

  // open the file and measure its pages (nothing is drawn yet)
  useEffect(() => {
    gone.current = false
    let task: any = null
    const pictures = held.current
    setSizes([]); setShown({}); setError('')
    ;(async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const buf = await fetch(url).then(r => r.arrayBuffer())
        if (gone.current) return
        task = pdfjsLib.getDocument({ data: buf, ...pdfjsResources(pdfjsLib.version) })
        const pdf = await task.promise
        const list: Size[] = []
        for (let i = 1; i <= pdf.numPages; i++) {
          const v = (await pdf.getPage(i)).getViewport({ scale: 1 })
          list.push({ w: v.width, h: v.height })
        }
        if (gone.current) return
        doc.current = pdf
        setSizes(list)
      } catch (err) {
        console.error('PDF preview error:', err)
        if (!gone.current) setError('Could not render preview.')
      }
    })()
    return () => {
      gone.current = true
      doc.current = null
      wanted.current = []
      pictures.forEach(u => URL.revokeObjectURL(u))
      pictures.clear()
      task?.destroy?.()
    }
  }, [url])

  // draw the wanted pages, one at a time
  const draw = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      for (;;) {
        const pdf = doc.current
        const next = wanted.current.find(i => !held.current.has(i))
        if (!pdf || next === undefined || gone.current) break
        const page = await pdf.getPage(next + 1)
        const at1 = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: phoneRenderScale(at1.width, at1.height) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width); canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        if (!ctx) break
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
        const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'))
        canvas.width = 0; canvas.height = 0          // give the memory back at once
        page.cleanup?.()
        if (!blob || doc.current !== pdf) break
        const picture = URL.createObjectURL(blob)
        held.current.set(next, picture)
        setShown(Object.fromEntries(held.current))
      }
    } catch (err) {
      console.error('PDF page error:', err)
    } finally {
      busy.current = false
    }
  }, [])

  // which pages are near what is on screen: hold those, let the others go
  const look = useCallback(() => {
    const view = scroller.current
    if (!view || !doc.current) return
    const top = view.getBoundingClientRect().top
    const list = boxes.current.map(b => { const r = b?.getBoundingClientRect(); return r ? { top: r.top - top, height: r.height } : { top: Number.POSITIVE_INFINITY, height: 0 } })
    wanted.current = pagesToHold(list, view.clientHeight)
    let dropped = false
    held.current.forEach((picture, i) => { if (!wanted.current.includes(i)) { URL.revokeObjectURL(picture); held.current.delete(i); dropped = true } })
    if (dropped) setShown(Object.fromEntries(held.current))
    draw()
  }, [draw, scroller])

  useEffect(() => {
    const view = scroller.current
    if (!view || sizes.length === 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => { clearTimeout(timer); timer = setTimeout(look, 120) }
    view.addEventListener('scroll', soon, { passive: true })
    window.addEventListener('resize', soon)
    soon()
    return () => { clearTimeout(timer); view.removeEventListener('scroll', soon); window.removeEventListener('resize', soon) }
  }, [sizes, widthPct, look, scroller])

  if (error) return <span style={{ color: '#94a3b8', fontSize: 13, margin: 'auto' }}>{error}</span>
  if (sizes.length === 0) return <span style={{ color: '#94a3b8', fontSize: 13, margin: 'auto' }}>Opening pages…</span>
  return (
    <div style={{ width: widthPct, display: 'flex', flexDirection: 'column', gap: 10, margin: '0 auto', flexShrink: 0 }}>
      {sizes.map((s, i) => (
        <div key={i} data-testid="phone-pdf-page" ref={el => { boxes.current[i] = el }} style={{ width: '100%', aspectRatio: `${s.w} / ${s.h}`, background: '#fff', borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {shown[i]
            ? <img src={shown[i]} alt={`${fileName} — page ${i + 1}`} draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            : <span style={{ color: '#94a3b8', fontSize: 12 }}>Page {i + 1}</span>}
        </div>
      ))}
    </div>
  )
}
