'use client'

import { useState } from 'react'
import { usePortal } from '@/contexts/PortalContext'
import { fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Variation, VariationLineItem, VariationStatus } from '@/lib/types'

const VAR_STATUS_LABEL: Record<VariationStatus, string> = {
  draft:     'Draft',
  sent:      'Awaiting your approval',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
  invoiced:  'Invoiced',
  paid:      'Paid',
}
const VAR_STATUS_COLOR: Record<VariationStatus, string> = {
  draft:     '#888',
  sent:      '#e67e22',
  approved:  '#27ae60',
  rejected:  '#c0392b',
  cancelled: '#9aa3ad',
  invoiced:  '#4a90a4',
  paid:      '#7ab533',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return '' }
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

function itemSellTotal(item: VariationLineItem, markup: number): number {
  return (Number(item.rate) || 0) * (1 + (markup || 0) / 100) * (Number(item.qty) || 0)
}

export default function PortalVariationsPage() {
  const supabase = createClient()
  const { variations, loading, error, reload } = usePortal()

  const [viewingVar, setViewingVar]     = useState<Variation | null>(null)
  const [approvingVar, setApprovingVar] = useState<Variation | null>(null)
  const [rejectingVar, setRejectingVar] = useState<Variation | null>(null)
  const [sigName, setSigName]           = useState('')
  const [agreed, setAgreed]             = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [actionError, setActionError]   = useState('')

  function openApprove(v: Variation) { setApprovingVar(v); setSigName(''); setAgreed(false); setActionError('') }
  function openReject(v: Variation)  { setRejectingVar(v); setRejectReason(''); setActionError('') }

  async function handleApprove() {
    if (!approvingVar || !sigName.trim() || !agreed) return
    setSubmitting(true); setActionError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('approve_variation', {
        p_variation_id: approvingVar.id,
        p_signature: sigName.trim(),
      })
      if (rpcErr || data?.error) { setActionError(rpcErr?.message || data?.error || 'Something went wrong.'); return }
      setApprovingVar(null); reload()
    } finally { setSubmitting(false) }
  }

  async function handleReject() {
    if (!rejectingVar) return
    setSubmitting(true); setActionError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('reject_variation', {
        p_variation_id: rejectingVar.id,
        p_reason: rejectReason.trim(),
      })
      if (rpcErr || data?.error) { setActionError(rpcErr?.message || data?.error || 'Something went wrong.'); return }
      setRejectingVar(null); reload()
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="portal-loading">Loading…</div>
  if (error && error !== 'no_admin_linked') {
    return <div className="portal-notice"><p>Unable to load variations.</p></div>
  }

  const pending  = variations.filter(v => v.status === 'sent')
  const approved = variations.filter(v => ['approved', 'invoiced', 'paid'].includes(v.status))
  const other    = variations.filter(v => ['rejected', 'cancelled', 'draft'].includes(v.status))

  function VarCard({ v, showActions }: { v: Variation; showActions?: boolean }) {
    return (
      <div style={{
        background: '#fff', border: '1px solid var(--border)', borderRadius: 8,
        padding: '14px 16px', marginBottom: 8,
        borderLeft: `3px solid ${VAR_STATUS_COLOR[v.status]}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{v.ref}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{v.title}</span>
            </div>
            {v.description && (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4, lineHeight: 1.5 }}>
                {v.description.slice(0, 100)}{v.description.length > 100 ? '…' : ''}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ background: VAR_STATUS_COLOR[v.status], color: '#fff', fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                {VAR_STATUS_LABEL[v.status]}
              </span>
              {v.sentAt && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sent {fmtDate(v.sentAt)}</span>}
              {v.clientApprovedBy && (
                <span style={{ fontSize: 11, color: '#27ae60' }}>✓ {v.clientApprovedBy} · {fmtDate(v.clientApprovedAt)}</span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>
              {fmt(v.total)}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn-sm btn-outline" onClick={() => setViewingVar(v)}>View</button>
              {showActions && (
                <>
                  <button className="btn-sm btn-danger"  onClick={() => openReject(v)}>Reject</button>
                  <button className="btn-sm btn-primary" onClick={() => openApprove(v)}>Approve</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="portal-page-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1>Variations</h1>
          <p>{variations.length} variation{variations.length !== 1 ? 's' : ''} on file</p>
        </div>
        <button onClick={reload} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      {!variations.length ? (
        <div className="portal-notice">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📝</div>
          <p>No variations on file yet.</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{ background: '#fff8ee', border: '1px solid #f5c77a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>⏳</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#856a00' }}>
                  {pending.length} variation{pending.length > 1 ? 's' : ''} awaiting your decision
                </span>
              </div>
              {pending.map(v => <VarCard key={v.id} v={v} showActions />)}
            </section>
          )}

          {approved.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 8 }}>Approved</div>
              {approved.map(v => <VarCard key={v.id} v={v} />)}
            </section>
          )}

          {other.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 8 }}>Other</div>
              {other.map(v => <VarCard key={v.id} v={v} />)}
            </section>
          )}
        </>
      )}

      {/* ── Variation detail modal ── */}
      {viewingVar && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setViewingVar(null) }}>
          <div className="portal-modal" style={{ width: 'min(680px, 96vw)' }}>
            <div className="portal-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Variation Details</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{viewingVar.ref} · {viewingVar.title}</div>
              </div>
              <button className="modal-close" onClick={() => setViewingVar(null)}>×</button>
            </div>
            <div className="portal-modal-bd">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ background: VAR_STATUS_COLOR[viewingVar.status], color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                  {VAR_STATUS_LABEL[viewingVar.status]}
                </span>
                {viewingVar.clientApprovedBy && (
                  <span style={{ fontSize: 12, color: '#27ae60' }}>✓ Approved by {viewingVar.clientApprovedBy} · {fmtDateTime(viewingVar.clientApprovedAt)}</span>
                )}
              </div>
              {viewingVar.description && (
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--warm)', borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
                  {viewingVar.description}
                </div>
              )}
              {viewingVar.items.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ overflowX: 'auto' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 90px', padding: '7px 14px', background: '#f0f2ee', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', gap: 8, minWidth: 320 }}>
                    <div>Description</div><div style={{ textAlign: 'right' }}>Qty</div><div style={{ textAlign: 'center' }}>Unit</div><div style={{ textAlign: 'right' }}>Total</div>
                  </div>
                  {viewingVar.items.map((item, idx) => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 90px', padding: '8px 14px', borderTop: '1px solid var(--border)', background: idx % 2 === 0 ? '#fff' : '#fafaf8', alignItems: 'center', gap: 8, minWidth: 320 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{item.desc}</div>
                        {item.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 1 }}>{item.notes}</div>}
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 13 }}>{item.qty}</div>
                      <div style={{ textAlign: 'center', fontSize: 13 }}>{item.unit}</div>
                      <div style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>{fmt(itemSellTotal(item, viewingVar.markup))}</div>
                    </div>
                  ))}
                  </div>
                </div>
              )}
              {(() => {
                const sellEx = viewingVar.items.reduce((s, i) => s + itemSellTotal(i, viewingVar.markup), 0)
                const vatAmt = viewingVar.vatIncluded ? sellEx * 0.2 : 0
                return (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal (ex. VAT)</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(sellEx)}</span>
                    </div>
                    {viewingVar.vatIncluded && (
                      <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>VAT (20%)</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>+{fmt(vatAmt)}</span>
                      </div>
                    )}
                    <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--moss)' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>Total{viewingVar.vatIncluded ? ' (inc. VAT)' : ''}</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: '#fff' }}>{fmt(sellEx + vatAmt)}</span>
                    </div>
                  </div>
                )
              })()}
              {viewingVar.clientRejectionReason && (
                <div style={{ padding: '10px 14px', background: '#fdf0ef', border: '1px solid #f5a0a0', borderRadius: 8, fontSize: 13, color: '#c0392b', marginTop: 8 }}>
                  <strong>Rejection reason:</strong> &ldquo;{viewingVar.clientRejectionReason}&rdquo;
                </div>
              )}
            </div>
            <div className="portal-modal-ft">
              {viewingVar.status === 'sent' ? (
                <>
                  <button className="btn btn-danger"  onClick={() => { setViewingVar(null); openReject(viewingVar) }}>✗ Reject</button>
                  <button className="btn btn-primary" onClick={() => { setViewingVar(null); openApprove(viewingVar) }}>✓ Approve</button>
                </>
              ) : (
                <button className="btn btn-outline" onClick={() => setViewingVar(null)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve modal ── */}
      {approvingVar && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setApprovingVar(null) }}>
          <div className="portal-modal">
            <div className="portal-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Approve Variation</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{approvingVar.ref} — {approvingVar.title}</div>
              </div>
              <button className="modal-close" onClick={() => setApprovingVar(null)}>×</button>
            </div>
            <div className="portal-modal-bd">
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Variation</span>
                  <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{approvingVar.ref}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Description</span>
                  <span style={{ fontSize: 13, fontWeight: 600, maxWidth: '60%', textAlign: 'right' }}>{approvingVar.title}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Amount</span>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                    {fmt(approvingVar.total)}{approvingVar.vatIncluded && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>inc. VAT</span>}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7, marginBottom: 20, padding: '14px 16px', background: '#fffbf0', border: '1px solid #f0d080', borderRadius: 8 }}>
                <strong>Please read before approving:</strong><br />
                By approving this variation you authorise the additional works and agree to the additional cost stated above. This approval is legally binding.
              </div>
              <div className="fg" style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600 }}>Your Full Name <span style={{ color: '#c0392b' }}>*</span></label>
                <input type="text" value={sigName} onChange={e => setSigName(e.target.value)} placeholder="Type your full name to sign" autoFocus style={{ fontSize: 15 }} />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>This acts as your electronic signature</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>I have read and agree to the variation details and additional cost above</span>
              </label>
              {actionError && <div style={{ color: '#c0392b', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fdf0ef', borderRadius: 6 }}>{actionError}</div>}
            </div>
            <div className="portal-modal-ft">
              <button className="btn btn-outline" onClick={() => setApprovingVar(null)} disabled={submitting}>Cancel</button>
              <button className="btn btn-primary" onClick={handleApprove} disabled={submitting || !sigName.trim() || !agreed} style={{ minWidth: 180 }}>
                {submitting ? 'Approving…' : '✍️ Approve Variation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ── */}
      {rejectingVar && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setRejectingVar(null) }}>
          <div className="portal-modal">
            <div className="portal-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Reject Variation</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{rejectingVar.ref} — {rejectingVar.title}</div>
              </div>
              <button className="modal-close" onClick={() => setRejectingVar(null)}>×</button>
            </div>
            <div className="portal-modal-bd">
              <div style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
                Please let us know why you are rejecting this variation. Your builder will be notified.
              </div>
              <div className="fg">
                <label>Reason (optional but helpful)</label>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="e.g. Price too high — please provide a revised quote…" />
              </div>
              {actionError && <div style={{ color: '#c0392b', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fdf0ef', borderRadius: 6 }}>{actionError}</div>}
            </div>
            <div className="portal-modal-ft">
              <button className="btn btn-outline" onClick={() => setRejectingVar(null)} disabled={submitting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject} disabled={submitting} style={{ minWidth: 160 }}>
                {submitting ? 'Rejecting…' : '✗ Reject Variation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
