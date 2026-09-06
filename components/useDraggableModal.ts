'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 380
const MIN_HEIGHT = 260

/** True for a mouse/trackpad, never a touchscreen — same test used for the
 *  touch-target CSS, just checked from JS at the moment it's needed rather
 *  than as a media query. */
function isDesktopPointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(hover:hover) and (pointer:fine)').matches
}

/**
 * Lets a modal be dragged by its header, resized from a corner handle, and
 * maximized to fill the screen — desktop/mouse only. Also exposes
 * onOverlayClick, which makes the backdrop stop closing the modal on
 * desktop (only its own × button does), so one can be dragged aside while
 * a second is opened to compare side by side. Nothing here ever fires from
 * a touch tap, so tablet and phone keep the existing fixed, full-width
 * modal — including backdrop-click-to-close — untouched.
 *
 * Each modal already unmounts on close (`{state && <Modal .../>}`), so a
 * fresh hook instance — and fresh position/size/maximized state — is
 * created every time it reopens; no manual reset needed.
 */

export function useDraggableModal() {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState<{ w: number | null; h: number | null }>({ w: null, h: null })
  const [isMaximized, setIsMaximized] = useState(false)
  // True while actively dragging/resizing — lets a modal disable pointer
  // events on any <iframe> it contains, since an iframe is a separate
  // browsing context that can otherwise swallow mousemove/mouseup and
  // make the drag "stick" the moment the cursor crosses into it.
  const [isInteracting, setIsInteracting] = useState(false)

  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null)

  const toggleMaximize = useCallback(() => setIsMaximized(m => !m), [])

  /** Use as the modal-overlay's onClick. On desktop, clicking the backdrop
   *  does nothing — the only way to close a modal is its own × button, so
   *  you can drag one out of the way and open a second to compare side by
   *  side without losing the first. Touch/tablet is untouched: the backdrop
   *  still closes the modal there, exactly as before. */
  const onOverlayClick = useCallback((e: React.MouseEvent, onClose: () => void) => {
    if (e.target !== e.currentTarget) return
    if (isDesktopPointer()) return
    onClose()
  }, [])

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return
    // Don't hijack clicks on the header's own buttons (close, view toggle, etc.)
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
    setIsInteracting(true)
    e.preventDefault()
  }, [pos, isMaximized])

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMaximized) return
    const rect = boxRef.current?.getBoundingClientRect()
    resizeRef.current = {
      startX: e.clientX, startY: e.clientY,
      startW: rect?.width ?? MIN_WIDTH, startH: rect?.height ?? MIN_HEIGHT,
    }
    setIsInteracting(true)
    e.preventDefault()
    e.stopPropagation()
  }, [isMaximized])

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

  const draggableStyle: React.CSSProperties = isMaximized
    ? { position: 'fixed', inset: 0, width: '100vw', height: '100vh', maxWidth: 'none', maxHeight: 'none', borderRadius: 0, transform: 'none' }
    : {
        transform: pos.x || pos.y ? `translate(${pos.x}px, ${pos.y}px)` : undefined,
        ...(size.w ? { width: size.w, maxWidth: 'none' } : {}),
        ...(size.h ? { height: size.h, maxHeight: 'none' } : {}),
      }

  return { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, isInteracting, onOverlayClick, isMaximized, toggleMaximize }
}
