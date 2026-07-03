'use client'

import { useSubPortal } from '@/contexts/SubPortalContext'

const fmt = (n: number) => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function SubPortalPayments() {
  const { paymentStages, contracts, loading } = useSubPortal()

  const contractById = Object.fromEntries(contracts.map(c => [c.id, c]))

  const totalPaid        = paymentStages.filter(p => !!p.paid_date).reduce((s, p) => s + p.amount, 0)
  const totalOutstanding = paymentStages.filter(p => !p.paid_date).reduce((s, p) => s + p.amount, 0)

  if (loading) return <div className="portal-loading">Loading payments…</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Payments</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>Your payment history and outstanding amounts</p>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Total Paid',     value: fmt(totalPaid),        color: '#16a34a' },
          { label: 'Outstanding',    value: fmt(totalOutstanding),  color: totalOutstanding > 0 ? '#d97706' : '#94a3b8' },
          { label: 'All Payments',   value: paymentStages.length,  color: '#6366f1', mono: false },
        ].map(card => (
          <div key={card.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{card.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: card.color, fontFamily: 'monospace' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {paymentStages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
          <div style={{ fontSize: 14 }}>No payment records yet.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {paymentStages.map(p => {
            const contract = contractById[p.sub_contract_id]
            const isPaid = !!p.paid_date
            return (
              <div key={p.id} style={{ background: '#fff', border: `1px solid ${isPaid ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{p.description || 'Payment'}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                        background: isPaid ? '#dcfce7' : '#fef9c3',
                        color:      isPaid ? '#166534' : '#854d0e' }}>
                        {isPaid ? 'Paid' : 'Outstanding'}
                      </span>
                    </div>
                    {contract && (
                      <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, marginBottom: 3 }}>
                        {contract.job_type || contract.description}
                        {contract.job_address ? ` · ${contract.job_address}` : ''}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', gap: 12 }}>
                      {p.due_date  && !isPaid && <span>Due: {fmtDate(p.due_date)}</span>}
                      {p.paid_date && <span style={{ color: '#16a34a' }}>✓ Paid: {fmtDate(p.paid_date)}</span>}
                      {p.xero_bill_id && <span>Ref: {p.xero_bill_id.slice(0, 8)}…</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: isPaid ? '#16a34a' : '#0f172a', flexShrink: 0 }}>
                    {fmt(p.amount)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
