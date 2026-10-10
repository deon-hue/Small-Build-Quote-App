'use client'
// A thin strip you press and drag to resize something (mouse, finger or pen). It reports how far the pointer has moved from where it went down, as
// `pulledLeft` and `pulledUp` (positive when dragged towards the left / the top), so a panel anchored to the right or bottom of the screen can grow by
// being pulled out. `onStart` is called once on press, so the caller can note the size it started from.

import React, { useRef } from 'react'

export function DragHandle({ onStart, onMove, onEnd, cursor, style, title }: {
  onStart: () => void
  onMove: (pulledLeft: number, pulledUp: number) => void
  onEnd?: () => void
  cursor: 'ew-resize' | 'ns-resize' | 'nwse-resize'
  style: React.CSSProperties
  title?: string
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      title={title}
      onPointerDown={e => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, y: e.clientY }
        onStart()
      }}
      onPointerMove={e => { if (start.current) onMove(start.current.x - e.clientX, start.current.y - e.clientY) }}
      onPointerUp={() => { if (start.current) { start.current = null; onEnd?.() } }}
      onPointerCancel={() => { if (start.current) { start.current = null; onEnd?.() } }}
      style={{ position: 'absolute', cursor, touchAction: 'none', zIndex: 5, ...style }}
    />
  )
}
