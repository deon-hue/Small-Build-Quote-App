'use client'

/**
 * QuoteCommentsModal — the client Q&A thread for a quote, as its own small modal rather
 * than tacked onto the bottom of QuotePreviewModal's read-only view (which made viewing a
 * quote feel cluttered, especially on a phone or tablet where there's little room to
 * begin with). Opened from a dedicated "💬 Q&A" button on the Quotes page and, for a job's
 * linked quote, on the Jobs page — same small modal either way.
 */

import type { Quote } from '@/lib/types'
import QuoteCommentsSection from './QuoteCommentsSection'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

interface Props {
  quote: Quote
  onClose: () => void
}

export default function QuoteCommentsModal({ quote, onClose }: Props) {
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()

  return (
    <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
      <div ref={boxRef} className="modal-box" style={{ width: 'min(560px,96vw)', maxHeight: '85vh', ...draggableStyle }}>
        <div className="modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700 }}>💬 Questions &amp; replies</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{quote.ref || '—'} — {quote.customer.name || '—'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div style={{ padding: 16, overflowY: 'auto' }}>
          <QuoteCommentsSection quoteId={quote.id} phases={quote.phases.map(p => p.phase)} />
        </div>
        {!isMaximized && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
      </div>
    </div>
  )
}
