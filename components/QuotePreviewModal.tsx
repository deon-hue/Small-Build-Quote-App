'use client'

import { useState, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { buildHtml, buildHtmlClientView } from '@/lib/quoteHtml'
import type { Quote } from '@/lib/types'
import { DEFAULT_CLIENT_PORTAL_SETTINGS } from '@/lib/types'
import QuoteCommentsSection from './QuoteCommentsSection'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

interface Props {
  quote: Quote
  onClose: () => void
  boTasks?: any[]
}

export default function QuotePreviewModal({ quote, onClose, boTasks = [] }: Props) {
  const { settings, clients } = useApp()
  const [view, setView] = useState<'detailed' | 'client'>('detailed')
  const frameRef = useRef<HTMLIFrameElement>(null)
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, isInteracting, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()

  // Look up this client's portal settings so "Client View" here matches what
  // they actually see in the portal/emailed quote, instead of always
  // defaulting to 'full' (which was showing prices regardless of the
  // client's configured quoteView).
  const matchedClient = clients.find(
    c => c.email && quote.customer.email &&
      c.email.toLowerCase() === quote.customer.email.toLowerCase()
  )
  const clientSettings = matchedClient?.portalSettings ?? DEFAULT_CLIENT_PORTAL_SETTINGS

  const html = view === 'detailed'
    ? buildHtml(quote, settings, {}, boTasks)
    : buildHtmlClientView(quote, settings, {
        quoteView:        clientSettings.quoteView,
        showScope:        clientSettings.showScope,
        showPaymentTerms: clientSettings.showPaymentTerms,
      }, boTasks)

  function handlePrint() {
    const w = window.open('', '_blank')
    if (!w) { alert('Pop-up blocked — please allow pop-ups and try again.'); return }
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  function handleDownload() {
    const blob = new Blob([html], { type: 'text/html' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Quote-${quote.ref || 'Draft'}-${(quote.customer.name || 'Client').replace(/[^a-z0-9]/gi, '_')}.html`
    a.click()
  }

  return (
    <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
      <div ref={boxRef} className="modal-box" style={{ width: 'min(900px,96vw)', maxHeight: '92vh', ...draggableStyle }}>
        <div className="modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700 }}>{quote.ref || '—'} — {quote.customer.name || '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{quote.jobType}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View toggle */}
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', fontSize: 11 }}>
              <button
                onClick={() => setView('detailed')}
                style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: view === 'detailed' ? '#2b2f33' : 'white',
                  color: view === 'detailed' ? 'white' : '#2b2f33', borderRight: '1px solid var(--border)' }}
              >
                Detailed
              </button>
              <button
                onClick={() => setView('client')}
                style={{ padding: '5px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: view === 'client' ? '#7ab533' : 'white',
                  color: view === 'client' ? 'white' : '#2b2f33' }}
              >
                Client View
              </button>
            </div>
            <button className="btn-sm btn-outline" onClick={handlePrint}>🖨 Print / PDF</button>
            <button className="btn-sm btn-outline" onClick={handleDownload}>⬇ Download</button>
            <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column', gap: 0 }}>
          <iframe
            ref={frameRef}
            className="modal-iframe"
            srcDoc={html}
            style={{ flex: 0.7, border: 'none', minHeight: 400, pointerEvents: isInteracting ? 'none' : 'auto' }}
            title="Quote Preview"
          />
          <div style={{ flex: 0.3, overflowY: 'auto', borderTop: '1px solid var(--border)', paddingTop: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 16 }}>
            <QuoteCommentsSection quoteId={quote.id} phases={quote.phases.map(p => p.phase)} />
          </div>
        </div>
        {!isMaximized && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
      </div>
    </div>
  )
}
