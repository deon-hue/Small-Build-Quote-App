'use client'

/**
 * The steel setup for one wall opening in its own pop-up window, so a wall with several doors and windows stays short: the calculator shows a one-line summary and a button, and the full options (the members,
 * plates, connections) open here. Drawn into the page body so a scrolling calculator window never clips it; Escape, Done, the cross and a click on the dark backdrop close it. Every change is live, so Done only closes it.
 */

import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function WallSteelModal({ title, subtitle, cost, onClose, children }: {
  title: string
  subtitle?: string
  /** what the steel for this opening comes to, ex VAT before profit, shown in the footer */
  cost?: number
  onClose: () => void
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div data-wall-steel-modal role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}
        style={{ background: '#fff', color: '#1a1a1a', borderRadius: 14, width: '100%', maxWidth: 780, maxHeight: '94vh', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '14px 18px 8px' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: '#5b6068', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#5b6068' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '4px 18px 12px', flex: 1 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 18px 14px', borderTop: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 13, color: '#334155' }}>{cost !== undefined ? <>Steel for this opening: <b>£{cost.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b> <span style={{ color: '#94a3b8' }}>(before profit)</span></> : null}</div>
          <button type="button" data-wall-steel-done onClick={onClose} style={{ fontSize: 14, padding: '7px 22px', borderRadius: 8, cursor: 'pointer', border: 'none', background: '#1a1a1a', color: '#fff', fontFamily: 'inherit' }}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
