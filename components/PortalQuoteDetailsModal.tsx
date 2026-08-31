'use client'

import { calcItemSell, calcPhaseSell, fmt } from '@/lib/utils'
import type { Quote } from '@/lib/types'
import QuoteCommentsSection from './QuoteCommentsSection'

interface Props {
  quote: Quote
  settings: { logo?: string; name?: string; tagline?: string; phone?: string; email?: string; address?: string }
  onClose: () => void
  onApproveClick?: () => void
  canApprove?: boolean
  isPreview?: boolean
  quoteView?: 'full' | 'phases' | 'total_only'
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting review', sent: 'Sent — awaiting your approval',
  accepted: 'Approved', declined: 'Declined',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#888', sent: '#e67e22', accepted: '#7ab533', declined: '#c0392b',
}

export default function PortalQuoteDetailsModal({
  quote,
  settings,
  onClose,
  onApproveClick,
  canApprove,
  isPreview = false,
  quoteView = 'full',
}: Props) {
  const subtotal = quote.phases.reduce((s, p) => s + calcPhaseSell(p, quote.markup), 0)
  const vatAmount = quote.vatIncluded ? subtotal * 0.20 : 0
  const total = subtotal + vatAmount
  const isApproved = quote.status === 'accepted'

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="portal-modal" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="portal-modal-hd">
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Quote Details</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {quote.ref} — {quote.jobType}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── Company header ─────────────────────────── */}
          <div style={{
            background: 'var(--moss)', color: '#fff',
            padding: '20px 24px', display: 'flex',
            justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
            marginBottom: 20, borderRadius: 8, marginLeft: -24, marginRight: -24, marginTop: -24,
          }}>
            <div>
              {settings.logo
                ? <img src={settings.logo} alt="logo" style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 6 }} />
                : <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{settings.name || 'Your Builder'}</div>
              }
              {settings.tagline && <div style={{ fontSize: 12, opacity: 0.85 }}>{settings.tagline}</div>}
              {settings.phone && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{settings.phone}</div>}
              {settings.email && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.email}</div>}
              {settings.address && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Quotation</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                {quote.ref}
                {quote.versionNumber && <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>v{quote.versionNumber}</span>}
              </div>
              {quote.savedDate && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Issued {quote.savedDate}</div>}
            </div>
          </div>

          {/* ── Quote meta row ──────────────────────────── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            flexWrap: 'wrap', gap: 16, padding: '16px 24px',
            borderBottom: '1px solid var(--border)', background: '#fafaf8',
            marginBottom: 20, marginLeft: -24, marginRight: -24,
            borderRadius: '8px 8px 0 0',
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Prepared for</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{quote.customer.name}</div>
              {quote.customer.address && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{quote.customer.address}</div>}
              {quote.customer.phone && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{quote.customer.phone}</div>}
              {quote.customer.email && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{quote.customer.email}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Status</div>
              <span className="portal-badge" style={{ background: STATUS_COLOR[quote.status] || '#888', fontSize: 12 }}>
                {STATUS_LABEL[quote.status] || quote.status}
              </span>
            </div>
          </div>

          {/* ── Job type heading ────────────────────── */}
          <div style={{ marginTop: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 20 }}>{quote.jobType}</div>
          </div>

          {/* ── Approved banner ─────────────────────── */}
          {isApproved && quote.clientApprovedBy && (
            <div style={{ background: '#f0f9e8', border: '1px solid #b8e08a', borderRadius: 8, padding: '12px 16px', margin: '16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>✅</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#4a7c1f' }}>Approved by {quote.clientApprovedBy}</div>
                {quote.clientApprovedAt && <div style={{ fontSize: 12, color: '#6a9a3a' }}>{fmtDateTime(quote.clientApprovedAt)}</div>}
              </div>
            </div>
          )}

          {/* ── Phases & line items ─────────────────── */}
          {quote.phases.length > 0 && quoteView !== 'total_only' && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
              {quote.phases.map((phase, pi) => (
                <div key={phase.id}>
                  {/* Phase heading */}
                  <div style={{
                    background: pi % 2 === 0 ? '#f0f2ee' : '#e8ebe4',
                    padding: '10px 16px', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    borderTop: pi > 0 ? '2px solid var(--border)' : undefined,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--ink)' }}>
                      {pi + 1}. {phase.phase}
                    </div>
                    {/* Phase total — only shown for 'full' quoteView */}
                    {quoteView === 'full' && (
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700, color: 'var(--moss)' }}>
                        {fmt(calcPhaseSell(phase, quote.markup))}
                      </div>
                    )}
                  </div>

                  {/* Line items — only shown for 'full' quoteView */}
                  {quoteView === 'full' && phase.items.filter(item => calcItemSell(item, quote.markup) > 0).map((item, ii) => (
                    <div key={item.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      padding: '10px 16px', gap: 12,
                      borderTop: '1px solid var(--border)',
                      background: ii % 2 === 0 ? '#fff' : '#fafaf8',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{item.desc}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          {item.qty} {item.unit}
                        </div>
                        {item.notes && (
                          <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 2 }}>
                            {item.notes}
                          </div>
                        )}
                      </div>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                        {fmt(calcItemSell(item, quote.markup))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* ── Financial summary ───────────────────── */}
          <div style={{
            border: '1px solid var(--border)', borderRadius: 8,
            overflow: 'hidden', marginBottom: 20,
          }}>
            {quoteView !== 'total_only' && (
              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal (ex. VAT)</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(subtotal)}</span>
              </div>
            )}
            {quoteView !== 'total_only' && quote.vatIncluded && (
              <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>VAT (20%)</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(vatAmount)}</span>
              </div>
            )}
            <div style={{
              padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', background: 'var(--moss)',
            }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>
                Total{quote.vatIncluded ? ' (inc. VAT)' : ''}
              </span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: '#fff' }}>
                {fmt(total)}
              </span>
            </div>
          </div>

          {/* ── Scope of works ──────────────────────── */}
          {quote.scope && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                Scope of Works
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '14px 16px', background: '#fafaf8', border: '1px solid var(--border)', borderRadius: 8 }}>
                {quote.scope}
              </div>
            </div>
          )}

          {/* ── Comments section ───────────────────── */}
          {!isPreview && <QuoteCommentsSection quoteId={quote.id} isPortalView={true} />}

        </div>

        {/* ── Footer with approve button ─────────────────────── */}
        {canApprove && !isPreview && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '16px 24px', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={onApproveClick} style={{ minWidth: 160 }}>
              ✍️ Approve Quote
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
