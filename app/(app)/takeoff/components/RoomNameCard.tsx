'use client'

/**
 * Take-off: a small card on the plan to name a room, shown when a room has just been closed by the walls (or a room edge) and when a room's name on the plan is clicked. What is typed is kept as it is typed; picking a kind
 * of room names it and closes the card. It never takes the keyboard unless it was asked for (a typed wall length must keep working while it is showing).
 */

import React from 'react'
import { ROOM_KINDS } from '@/lib/rooms-from-walls'

interface Props {
  /** where the room's name is, in the drawing area's own pixels */
  left: number
  top: number
  /** the size of the drawing area, so the card stays inside it */
  areaW: number
  areaH: number
  /** the room's name as it shows now ('Room 2' until named) and what has been typed for it */
  shownName: string
  typedName: string
  kind?: string
  areaM2: number
  autoFocus: boolean
  onName: (name: string) => void
  onKind: (kind: string) => void
  onClose: () => void
  /** offered when the card came up by itself */
  onStopAsking?: () => void
}

const W = 268

export default function RoomNameCard(p: Props) {
  const H = 220
  const left = Math.max(8, Math.min(p.areaW - W - 8, p.left - W / 2))
  const below = p.top + 26
  const top = Math.max(8, below + H > p.areaH ? p.top - H - 22 : below)
  return (
    <div data-testid="room-name-card" data-print-hide="1" onMouseDown={e => e.stopPropagation()} onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
      style={{ position: 'absolute', left, top, width: W, zIndex: 20, background: 'var(--to-panel)', border: '1px solid #16a34a', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', padding: 10, color: 'var(--to-text)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
        <strong style={{ fontSize: 12.5, flex: 1, color: 'var(--to-textb)' }}>🏠 Name this room · {p.areaM2.toFixed(1)} m²</strong>
        <button type="button" onClick={p.onClose} aria-label="Close" title="Close" style={{ border: 'none', background: 'none', color: 'var(--to-muted)', fontSize: 18, lineHeight: 1, cursor: 'pointer' }}>×</button>
      </div>
      <input data-testid="room-name-input" autoFocus={p.autoFocus} value={p.typedName} placeholder={p.shownName} onChange={e => p.onName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); p.onClose() } }}
        style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '6px 8px', background: 'var(--to-bg)', color: 'var(--to-text)', border: '1px solid var(--to-border)', borderRadius: 6, fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
        {ROOM_KINDS.map(k => (
          <button key={k.id} type="button" onClick={() => p.onKind(k.id)}
            style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${p.kind === k.id ? '#16a34a' : 'var(--to-border)'}`, background: p.kind === k.id ? 'rgba(22,163,74,0.2)' : 'var(--to-bg)', color: 'var(--to-text)', fontFamily: 'inherit' }}>{k.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        {p.onStopAsking && <button type="button" onClick={p.onStopAsking} style={{ border: 'none', background: 'none', color: 'var(--to-muted)', fontSize: 10.5, cursor: 'pointer', padding: 0, textDecoration: 'underline', fontFamily: 'inherit' }}>Don&apos;t ask me</button>}
        <span style={{ flex: 1 }} />
        <button type="button" data-testid="room-name-done" onClick={p.onClose} style={{ fontSize: 12, fontWeight: 700, padding: '5px 14px', borderRadius: 6, cursor: 'pointer', border: 'none', background: '#16a34a', color: '#fff', fontFamily: 'inherit' }}>Done</button>
      </div>
    </div>
  )
}
