'use client'

/**
 * Take-off: how an assembly calculator is shown for a wall you've drawn.
 *
 * The properties panel is only ~300px wide, far too narrow for a calculator (drawing, controls and a
 * cost breakdown), so the panel shows a short summary card with an "Open calculator" button, and the
 * calculator itself opens full size in a window over the drawing.
 *
 * The calculator stays mounted while the window is closed (just hidden), so whatever has been typed
 * into it survives closing and reopening while the Properties tab keeps showing that wall. Its inputs
 * aren't stored anywhere except as the priced result it saves, so — as before — switching to the
 * Schedule tab or selecting another wall unmounts it and it starts from its defaults again.
 */

import React from 'react'
import { fmt } from '@/lib/utils'
import type { CostedLine } from '@/lib/assembly-calc'

interface Props {
  /** The wall's name as it appears in the schedule. */
  name: string
  /** The wall's traced length in metres — the calculator's length is driven from this. */
  lengthM: number
  /** The calculator's saved result, once Save & Price has been used. */
  saved?: { lines: CostedLine[]; location?: string }
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** The calculator, from BUILT_ASSEMBLY_CANON_IDS[...].render(). Kept mounted while closed. */
  children: React.ReactNode
}

export default function AssemblyItemPanel({ name, lengthM, saved, open, onOpen, onClose, children }: Props) {
  // What goes to the quote is the sum of the saved lines' costs (see new-quote's assemblyResult branch).
  const total = saved ? saved.lines.reduce((s, l) => s + l.cost, 0) : 0
  const lineCount = saved ? saved.lines.filter(l => l.cost !== 0).length : 0

  return (
    <>
      <div style={{
        background: 'var(--to-alt)', border: '1px solid var(--to-border)', borderRadius: 8,
        padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--to-textb)', lineHeight: 1.3 }}>{name}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--to-muted)' }}>Length</span>
          <span style={{ color: 'var(--to-text)', fontFamily: 'monospace' }}>{lengthM.toFixed(2)} m</span>
        </div>
        {saved?.location?.trim() && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span style={{ color: 'var(--to-muted)' }}>Location</span>
            <span style={{ color: 'var(--to-text)' }}>{saved.location}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--to-muted)' }}>Priced</span>
          {saved
            ? <span style={{ color: '#16a34a', fontWeight: 700, fontFamily: 'monospace' }}>{fmt(total)}</span>
            : <span style={{ color: '#d97706' }}>Not priced yet</span>}
        </div>
        {saved && (
          <div style={{ fontSize: 11, color: 'var(--to-muted)' }}>{lineCount} cost line{lineCount !== 1 ? 's' : ''} saved from the calculator</div>
        )}
        <button
          onClick={onOpen}
          style={{
            background: '#2563eb', color: '#fff', border: '1px solid #1d4ed8', borderRadius: 6,
            padding: '8px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          }}>
          🧮 {saved ? 'Open calculator' : 'Open calculator and price'}
        </button>
      </div>

      {/* The window. Backdrop press closes it (closing only hides it, nothing is lost); Escape does too,
          handled by the page's key handler. */}
      <div
        role="dialog" aria-modal="true" aria-label={`${name} calculator`}
        onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
        style={{
          display: open ? 'flex' : 'none', position: 'fixed', inset: 0, zIndex: 1200,
          background: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
        <div style={{
          background: 'var(--to-panel)', border: '1px solid var(--to-border)', borderRadius: 12,
          width: 'min(1200px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            borderBottom: '1px solid var(--to-border)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--to-textb)' }}>{name}</span>
            <span style={{ fontSize: 12, color: 'var(--to-muted)' }}>· {lengthM.toFixed(2)} m from your drawing</span>
            <span style={{ flex: 1 }} />
            <button
              onClick={onClose} aria-label="Close calculator"
              style={{
                background: 'transparent', border: '1px solid var(--to-border)', borderRadius: 6,
                color: 'var(--to-text)', fontSize: 12, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit',
              }}>
              ✕ Close
            </button>
          </div>
          <div style={{ overflowY: 'auto', padding: 14 }}>
            {children}
          </div>
        </div>
      </div>
    </>
  )
}
