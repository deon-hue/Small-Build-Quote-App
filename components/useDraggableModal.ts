'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 380
const MIN_HEIGHT = 260

/**
 * Lets a modal be dragged by its header and resized from a corner handle —
 * desktop/mouse only. Nothing here ever fires from a touch tap, so tablet
 * and phone keep the existing fixed, full-width modal untouched: the
 * returned handlers are plain onMouseDown props, and the resize handle
 * itself is hidden for touch via CSS (`(hover:none), (pointer:coarse)`).
 *
 * Each modal already unmounts on close (`{state && <Modal .../>}`), so a
 * fresh hook instance — and fresh position/size — is created every time
 * it reopens; no manual reset needed.
 */
export function useDraggableModal() {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState<{ w: number | null; h: number | null }>({ w: null, h: null })
  // True while actively dragging/resizing — lets a modal disable pointer
  // events on any <iframe> it contains, since an iframe is a separate
  // browsing context that can otherwise swallow mousemove/mouseup and
  // make the drag "stick" the moment the cursor crosses into it.
  const [isInteracting, setIsInteracting] = useState(false)

  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't hijack clicks on the header's own buttons (close, view toggle, etc.)
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
    setIsInteracting(true)
    e.preventDefault()
  }, [pos])

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = boxRef.current?.getBoundingClientRect()
    resizeRef.current = {
      startX: e.clientX, startY: e.clientY,
      startW: rect?.width ?? MIN_WIDTH, startH: rect?.height ?? MIN_HEIGHT,
    }
    setIsInteracting(true)
    e.preventDefault()
    e.stopPropagation()
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragRef.current) {
        const d = dragRef.current
        setPos({ x: d.startPosX + (e.clientX - d.startX), y: d.startPosY + (e.clientY - d.startY) })
      }
      if (resizeRef.current) {
        const r = resizeRef.current
        setSize({
          w: Math.max(MIN_WIDTH, r.startW + (e.clientX - r.startX)),
          h: Math.max(MIN_HEIGHT, r.startH + (e.clientY - r.startY)),
        })
      }
    }
    function onUp() {
      dragRef.current = null
      resizeRef.current = null
      setIsInteracting(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const draggableStyle: React.CSSProperties = {
    transform: pos.x || pos.y ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
    ...(size.w ? { width: size.w, maxWidth: 'none' } : {}),
    ...(size.h ? { height: size.h, maxHeight: 'none' } : {}),
  }

  return { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, isInteracting }
}
