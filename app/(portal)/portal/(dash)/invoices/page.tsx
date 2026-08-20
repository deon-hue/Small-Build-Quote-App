'use client'

import { usePortal } from '@/contexts/PortalContext'
import { fmt } from '@/lib/utils'
import type { PaymentMilestone } from '@/lib/types'

const STATUS_COLOR: Record<string, string> = {
  draft: '#aaa', sent: '#4a90a4', paid: '#7ab533', overdue: '#c0392b',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', overdue: 'Overdue',
}
const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank transfer', other: 'Other',
}

export default function PortalInvoicesPage() {
  const { invoices, payments, loading, error } = usePortal()

  if (loading) return <div className="portal-loading">Loading…</div>
  if (error && error !== 'no_admin_linked') {
    return <div className="portal-notice"><p>Unable to load invoices.</p></div>
  }

  const cashPaidTotal = payments.reduce((s, p) => s + p.amount, 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0) + cashPaidTotal
  const totalOutstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.total, 0)

  return (
    <>
      <div className="portal-page-hd">
        <h1>Your Invoices</h1>
        <p>{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} on file</p>
      </div>

      {/* Summary */}
      {(invoices.length > 0 || payments.length > 0) && (
        <div className="portal-stats" style={{ marginBottom: 24 }}>
          <div className="portal-stat">
            <div className="portal-stat-num">{fmt(totalPaid)}</div>
            <div className="portal-stat-label">Total Paid</div>
          </div>
          <div className="portal-stat">
            <div className="portal-stat-num">{fmt(totalOutstanding)}</div>
            <div className="portal-stat-label">Outstanding</div>
          </div>
        </div>
      )}

      {!invoices.length ? (
        <div className="portal-notice">
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧾</div>
          <p>No invoices on file yet.</p>
        </div>
      ) : (
        invoices.map(inv => {
          // Contract account summary for follow-up invoices on the same job
          const priorInvs = inv.jobId ? invoices.filter(i => i.jobId === inv.jobId && i.id !== inv.id) : []
          const cashPaid = inv.jobId ? payments.filter(p => p.jobId === inv.jobId).reduce((s, p) => s + (p.amount || 0), 0) : 0
          const priorInvoicedTotal = priorInvs.reduce((s, i) => s + (i.total || 0), 0)
          const priorPaidTotal = priorInvs.filter(i => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0) + cashPaid
          const showContractSummary = priorInvs.length > 0 || cashPaid > 0

          return (
          <div key={inv.id} className="portal-card" style={{ borderLeft: `3px solid ${STATUS_COLOR[inv.status] || '#aaa'}` }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{inv.ref}</div>
                <div style={{ fontWeight: 700, fontSize: 20, fontFamily: 'DM Mono, monospace' }}>{fmt(inv.total)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Issued {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('en-GB') : '—'}
                  {' · '}
                  Due {inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-GB') : '—'}
                </div>
              </div>
              <span className="portal-badge" style={{ background: STATUS_COLOR[inv.status] || '#aaa' }}>
                {STATUS_LABEL[inv.status] || inv.status}
              </span>
            </div>

            {/* Line items */}
            {inv.lineItems.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginBottom: 10 }}>
                {inv.lineItems.map((li, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}>
                    <span>{li.desc || '—'}</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', color: 'var(--moss)' }}>{fmt(li.total)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                  <span>Total{inv.vatIncluded ? ' (inc. 20% VAT)' : ''}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace' }}>{fmt(inv.total)}</span>
                </div>
              </div>
            )}

            {/* Payment plan / schedule */}
            {inv.paymentPlan && inv.paymentPlan.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                  Payment Schedule
                </div>
                {inv.paymentPlan.map((m: PaymentMilestone) => (
                  <div key={m.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: m.paid ? 400 : 600 }}>{m.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        Due {m.dueDate ? new Date(m.dueDate).toLocaleDateString('en-GB') : 'TBC'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: 12 }}>
                      <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>{fmt(m.amount)}</div>
                      <div style={{ fontSize: 11, marginTop: 2, color: m.paid ? '#7ab533' : '#888', fontWeight: m.paid ? 600 : 400 }}>
                        {m.paid
                          ? '✓ Paid' + (m.paidDate ? ' ' + new Date(m.paidDate).toLocaleDateString('en-GB') : '')
                          : '○ Pending'}
                      </div>
                    </div>
                  </div>
                ))}
                {/* Summary: paid vs remaining */}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 8, color: 'var(--muted)' }}>
                  <span>
                    {inv.paymentPlan.filter(m => m.paid).length} of {inv.paymentPlan.length} paid
                  </span>
                  <span>
                    {fmt(inv.paymentPlan.filter(m => !m.paid).reduce((s, m) => s + m.amount, 0))} remaining
                  </span>
                </div>
              </div>
            )}

            {/* Contract account summary */}
            {showContractSummary && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                  Contract Account
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Previously invoiced</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', textAlign: 'right' }}>{fmt(priorInvoicedTotal)}</span>
                  <span style={{ color: 'var(--muted)' }}>Previously paid</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', textAlign: 'right', color: 'var(--moss)' }}>({fmt(priorPaidTotal)})</span>
                  <span style={{ fontWeight: 700, paddingTop: 6, borderTop: '1px solid var(--border)' }}>This invoice</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', textAlign: 'right', fontWeight: 700, paddingTop: 6, borderTop: '1px solid var(--border)' }}>{fmt(inv.total)}</span>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>Total invoiced to date</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', textAlign: 'right', fontSize: 12 }}>{fmt(priorInvoicedTotal + inv.total)}</span>
                  {(priorInvoicedTotal - priorPaidTotal + inv.total) > 0.01 && (<>
                    <span style={{ color: '#c0392b', fontWeight: 700 }}>Balance now due</span>
                    <span style={{ fontFamily: 'DM Mono, monospace', textAlign: 'right', color: '#c0392b', fontWeight: 700 }}>{fmt(priorInvoicedTotal - priorPaidTotal + inv.total)}</span>
                  </>)}
                </div>
              </div>
            )}

            {/* Notes */}
            {inv.notes && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                {inv.notes}
              </div>
            )}
          </div>
        )})
      )}

      {/* Payments received (cash / cheque / bank transfer) */}
      {payments.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Payments Received</h2>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 14px' }}>
            {payments.length} payment{payments.length !== 1 ? 's' : ''} · {fmt(cashPaidTotal)} total
          </p>
          {payments.map(p => (
            <div key={p.id} className="portal-card" style={{ borderLeft: '3px solid #7ab533', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'DM Mono, monospace' }}>{fmt(p.amount)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {METHOD_LABEL[p.method] || p.method}
                  {p.paymentDate ? ` · ${new Date(p.paymentDate).toLocaleDateString('en-GB')}` : ''}
                </div>
                {p.notes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{p.notes}</div>}
              </div>
              <span className="portal-badge" style={{ background: '#7ab533' }}>✓ Received</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
