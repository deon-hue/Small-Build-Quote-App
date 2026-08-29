'use client'

import { useState } from 'react'
import { usePortal } from '@/contexts/PortalContext'
import { calcItemSell, calcPhaseSell, fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Quote } from '@/lib/types'
import QuoteCommentsSection from '@/components/QuoteCommentsSection'

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting review', sent: 'Sent — awaiting your approval',
  accepted: 'Approved', declined: 'Declined',
}
const STATUS_COLOR: Record<string, string> = {
  pending: '#888', sent: '#e67e22', accepted: '#7ab533', declined: '#c0392b',
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return iso }
}

export default function PortalQuotesPage() {
  const supabase = createClient()
  const { quotes, settings, clientSettings, reload, loading, error } = usePortal()
  const qv = clientSettings.quoteView  // 'full' | 'phases' | 'total_only'
  const [approvingQuote, setApprovingQuote] = useState<Quote | null>(null)
  const [sigName, setSigName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [approveError, setApproveError] = useState('')

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
        quotes.map(q => {
          const subtotal = q.phases.reduce((s, p) => s + calcPhaseSell(p, q.markup), 0)
          const vatAmount = q.vatIncluded ? subtotal * 0.20 : 0
          const total = subtotal + vatAmount
          const canApprove = (q.status === 'pending' || q.status === 'sent') && clientSettings.allowOnlineApproval
          const isApproved = q.status === 'accepted'

          return (
            <div key={q.id} className="portal-card" style={{ padding: 0, overflow: 'hidden' }}>

              {/* ── Company header ─────────────────────────── */}
              <div style={{
                background: 'var(--moss)', color: '#fff',
                padding: '20px 24px', display: 'flex',
                justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12,
              }}>
                <div>
                  {settings.logo
                    ? <img src={settings.logo} alt="logo" style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 6 }} />
                    : <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>{settings.name || 'Your Builder'}</div>
                  }
                  {settings.tagline && <div style={{ fontSize: 12, opacity: 0.85 }}>{settings.tagline}</div>}
                  {settings.phone  && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>{settings.phone}</div>}
                  {settings.email  && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.email}</div>}
                  {settings.address && <div style={{ fontSize: 12, opacity: 0.8 }}>{settings.address}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, opacity: 0.75, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Quotation</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18 }}>{q.ref}</div>
                  {q.savedDate && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Issued {q.savedDate}</div>}
                </div>
              </div>

              {/* ── Quote meta row ──────────────────────────── */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                flexWrap: 'wrap', gap: 16, padding: '16px 24px',
                borderBottom: '1px solid var(--border)', background: '#fafaf8',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Prepared for</div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{q.customer.name}</div>
                  {q.customer.address && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{q.customer.address}</div>}
                  {q.customer.phone   && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{q.customer.phone}</div>}
                  {q.customer.email   && <div style={{ fontSize: 13, color: 'var(--muted)' }}>{q.customer.email}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Status</div>
                  <span className="portal-badge" style={{ background: STATUS_COLOR[q.status] || '#888', fontSize: 12 }}>
                    {STATUS_LABEL[q.status] || q.status}
                  </span>
                </div>
              </div>

              <div style={{ padding: '0 24px 24px' }}>

                {/* ── Approved banner ─────────────────────── */}
                {isApproved && q.clientApprovedBy && (
                  <div style={{ background: '#f0f9e8', border: '1px solid #b8e08a', borderRadius: 8, padding: '12px 16px', margin: '16px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 20 }}>✅</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#4a7c1f' }}>Approved by {q.clientApprovedBy}</div>
                      {q.clientApprovedAt && <div style={{ fontSize: 12, color: '#6a9a3a' }}>{fmtDateTime(q.clientApprovedAt)}</div>}
                    </div>
                  </div>
                )}

                {/* ── Job type heading ────────────────────── */}
                <div style={{ marginTop: 20, marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>{q.jobType}</div>
                </div>

                {/* ── Phases & line items ─────────────────── */}
                {q.phases.length > 0 && qv !== 'total_only' && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                    {q.phases.map((phase, pi) => (
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
                          {qv === 'full' && (
                            <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 700, color: 'var(--moss)' }}>
                              {fmt(calcPhaseSell(phase, q.markup))}
                            </div>
                          )}
                        </div>

                        {/* Line items — only shown for 'full' quoteView */}
                        {qv === 'full' && phase.items.filter(item => calcItemSell(item, q.markup) > 0).map((item, ii) => (
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
                              {fmt(calcItemSell(item, q.markup))}
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
                  {qv !== 'total_only' && (
                    <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal (ex. VAT)</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(subtotal)}</span>
                    </div>
                  )}
                  {qv !== 'total_only' && q.vatIncluded && (
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
                      Total{q.vatIncluded ? ' (inc. VAT)' : ''}
                    </span>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: '#fff' }}>
                      {fmt(total)}
                    </span>
                  </div>
                </div>

                {/* ── Scope of works ──────────────────────── */}
                {q.scope && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                      Scope of Works
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7, whiteSpace: 'pre-wrap', padding: '14px 16px', background: '#fafaf8', border: '1px solid var(--border)', borderRadius: 8 }}>
                      {q.scope}
                    </div>
                  </div>
                )}

                {/* ── Approve button ──────────────────────── */}
                {canApprove && (
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', fontSize: 14, padding: '12px 0' }}
                    onClick={() => openApproval(q)}
                  >
                    ✍️ Review &amp; Approve This Quote
                  </button>
                )}

                {/* ── Comments section ───────────────────── */}
                <QuoteCommentsSection quoteId={q.id} isPortalView={true} />

              </div>
            </div>
          )
        })
      )}

      {/* ── Approval modal ─────────────────────────────────── */}
      {approvingQuote && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) closeApproval() }}>
          <div className="portal-modal">
            <div className="portal-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Approve Quote</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {approvingQuote.ref} — {approvingQuote.jobType}
                </div>
              </div>
              <button className="modal-close" onClick={closeApproval}>×</button>
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
          </div>
        </div>
      )}
    </>
  )
}
