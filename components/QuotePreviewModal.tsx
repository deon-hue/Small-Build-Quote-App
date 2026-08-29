'use client'

import { useState, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { buildHtml, buildHtmlClientView } from '@/lib/quoteHtml'
import type { Quote } from '@/lib/types'
import QuoteCommentsSection from './QuoteCommentsSection'

interface Props {
  quote: Quote
  onClose: () => void
}

export default function QuotePreviewModal({ quote, onClose }: Props) {
  const { settings } = useApp()
  const [view, setView] = useState<'detailed' | 'client'>('detailed')
  const frameRef = useRef<HTMLIFrameElement>(null)

  const html = view === 'detailed' ? buildHtml(quote, settings) : buildHtmlClientView(quote, settings)

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
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ width: 'min(900px,96vw)', maxHeight: '92vh' }}>
        <div className="modal-hd">
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
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 560, gap: 20 }}>
          <iframe
            ref={frameRef}
            className="modal-iframe"
            srcDoc={html}
            style={{ flex: 1, border: 'none' }}
            title="Quote Preview"
          />
          <div style={{ width: 320, overflowY: 'auto', borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
            <QuoteCommentsSection quoteId={quote.id} />
          </div>
        </div>
      </div>
    </div>
  )
}
