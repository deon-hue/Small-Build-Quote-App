'use client'

import { useState } from 'react'
import { usePortal } from '@/contexts/PortalContext'
import { calcPhaseSell, fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Quote } from '@/lib/types'
import PortalQuoteDetailsModal from '@/components/PortalQuoteDetailsModal'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting review', sent: 'Sent — awaiting your approval',
  accepted: 'Approved', declined: 'Declined',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#888', sent: '#e67e22', accepted: '#7ab533', declined: '#c0392b',
}


export default function PortalQuotesPage() {
  const supabase = createClient()
  const { quotes, settings, clientSettings, reload, loading, error } = usePortal()
  const qv = clientSettings.quoteView  // 'full' | 'phases' | 'total_only'

  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null)
  const [approvingQuote, setApprovingQuote] = useState<Quote | null>(null)
  const [sigName, setSigName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approveError, setApproveError] = useState('')
  const approvalModal = useDraggableModal()

  // Determine which version is current (latest) for each quote group
  const currentVersionMap = new Map<string, string>() // groupId -> quoteId of current version
  quotes.forEach(q => {
    const groupId = q.parentQuoteId || q.id
    const existing = currentVersionMap.get(groupId)
    if (!existing || (q.versionNumber || 1) > (quotes.find(x => x.id === existing)?.versionNumber || 1)) {
      currentVersionMap.set(groupId, q.id)
    }
  })

  const selectedQuote = quotes.find(q => q.id === selectedQuoteId)

  function openApproval(q: Quote) {
    setApprovingQuote(q); setSigName(''); setAgreed(false); setApproveError('')
  }
  function closeApproval() { setApprovingQuote(null) }

  async function handleApprove() {
    if (!approvingQuote || !sigName.trim() || !agreed) return
    setSubmitting(true); setApproveError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('approve_quote', {
        p_quote_id: approvingQuote.id,
        p_signature: sigName.trim(),
      })
      if (rpcErr || data?.error) {
        setApproveError(rpcErr?.message || data?.error || 'Something went wrong. Please try again.')
        return
      }
      closeApproval(); reload()
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="portal-loading">Loading…</div>
  if (error && error !== 'no_admin_linked') {
    return <div className="portal-notice"><p>Unable to load quotes.</p></div>
  }

  return (
    <>
      <div className="portal-page-hd">
        <h1>Your Quotes</h1>
        <p>{quotes.length} quote{quotes.length !== 1 ? 's' : ''} on file</p>
      </div>

      {!quotes.length ? (
        <div className="portal-notice">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
          <p>No quotes on file yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {quotes.map(q => {
            const subtotal = q.phases.reduce((s, p) => s + calcPhaseSell(p, q.markup), 0)
            const vatAmount = q.vatIncluded ? subtotal * 0.20 : 0
            const total = subtotal + vatAmount
            const groupId = q.parentQuoteId || q.id
            const isCurrentVersion = currentVersionMap.get(groupId) === q.id
            const isSuperseded = q.versionNumber && !isCurrentVersion
            const canApprove = isCurrentVersion && (q.status === 'pending' || q.status === 'sent') && clientSettings.allowOnlineApproval

            return (
              <button
                key={q.id}
                onClick={() => setSelectedQuoteId(q.id)}
                style={{
                  all: 'unset' as any,
                  cursor: 'pointer',
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  flexWrap: 'wrap',
                  transition: 'all 0.15s',
                } as React.CSSProperties}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#fafaf8'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--moss)'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#fff'
                  ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
                }}
              >
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {q.ref || '—'}
                      {q.versionNumber && <span style={{ marginLeft: 4, fontSize: 12, background: '#f0f2ee', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>v{q.versionNumber}</span>}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{q.jobType}</span>
                  </div>
                  {q.savedDate && (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Issued {q.savedDate}</div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                    {fmt(total)}
                    {q.vatIncluded && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>inc. VAT</span>}
                  </span>
                  <span style={{ background: STATUS_COLOR[q.status] || '#888', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[q.status] || q.status}
                  </span>
                  {isSuperseded && (
                    <span style={{ background: '#cbd5e1', color: '#475569', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      Superseded
                    </span>
                  )}
                  {isCurrentVersion && q.versionNumber && q.versionNumber > 1 && (
                    <span style={{ background: '#dbeafe', color: '#0c4a6e', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                      Current Version
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Quote details modal ────────────────────────────────── */}
      {selectedQuote && (
        <PortalQuoteDetailsModal
          quote={selectedQuote}
          settings={settings}
          onClose={() => setSelectedQuoteId(null)}
          onApproveClick={() => {
            setSelectedQuoteId(null)
            openApproval(selectedQuote)
          }}
          canApprove={
            currentVersionMap.get(selectedQuote.parentQuoteId || selectedQuote.id) === selectedQuote.id
            && (selectedQuote.status === 'pending' || selectedQuote.status === 'sent')
            && clientSettings.allowOnlineApproval
          }
          isPreview={false}
          quoteView={qv}
          clientSettings={clientSettings}
        />
      )}

      {/* ── Approval signing modal ────────────────────────────────── */}
      {approvingQuote && (
        <div className="modal-overlay" onClick={e => approvalModal.onOverlayClick(e, closeApproval)}>
          <div ref={approvalModal.boxRef} className="portal-modal" style={approvalModal.draggableStyle}>
            <div className="portal-modal-hd" onMouseDown={approvalModal.onHeaderMouseDown}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Approve Quote</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {approvingQuote.ref} — {approvingQuote.jobType}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ModalMaximizeButton isMaximized={approvalModal.isMaximized} onClick={approvalModal.toggleMaximize} />
                <button className="modal-close" onClick={closeApproval}>×</button>
              </div>
            </div>

            <div className="portal-modal-bd">
              {/* Summary */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Quote reference</span>
                  <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{approvingQuote.ref}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Works</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{approvingQuote.jobType}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Total</span>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                    {fmt(
                      approvingQuote.phases.reduce((s, p) => s + calcPhaseSell(p, approvingQuote.markup), 0)
                      * (approvingQuote.vatIncluded ? 1.2 : 1)
                    )}
                    {approvingQuote.vatIncluded && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>inc. VAT</span>}
                  </span>
                </div>
              </div>

              {/* Declaration */}
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7, marginBottom: 20, padding: '14px 16px', background: '#fffbf0', border: '1px solid #f0d080', borderRadius: 8 }}>
                <strong>Please read before signing:</strong><br />
                By approving this quote, you confirm that you have read and understood the scope of works
                and agree to proceed on the terms stated. This approval is legally binding.
              </div>

              {/* Signature */}
              <div className="fg" style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600 }}>Your Full Name <span style={{ color: '#c0392b' }}>*</span></label>
                <input
                  type="text"
                  value={sigName}
                  onChange={e => setSigName(e.target.value)}
                  placeholder="Type your full name to sign"
                  autoFocus
                  style={{ fontSize: 15 }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>This acts as your electronic signature</div>
              </div>

              {/* Agree checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={e => setAgreed(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }}
                />
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  I have read and agree to the quote and scope of works above
                </span>
              </label>

              {approveError && (
                <div style={{ color: '#c0392b', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fdf0ef', borderRadius: 6 }}>
                  {approveError}
                </div>
              )}
            </div>

            <div className="portal-modal-ft">
              <button className="btn btn-outline" onClick={closeApproval} disabled={submitting}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleApprove}
                disabled={submitting || !sigName.trim() || !agreed}
                style={{ minWidth: 160 }}
              >
                {submitting ? 'Approving…' : '✍️ Approve Quote'}
              </button>
            </div>
            {!approvalModal.isMaximized && <ModalResizeHandle onMouseDown={approvalModal.onResizeMouseDown} />}
          </div>
        </div>
      )}
    </>
  )
}
