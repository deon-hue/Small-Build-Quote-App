'use client'

// Fixed-price payments: the staged payments on a subcontractor's fixed-price work (the stages the builder sets up with "Add Payment"), paid or still to come.
// Pay for day-rate and hourly work does NOT appear here: it is on their Timesheets (each day shows approved, then paid), and the page says so.

import Link from 'next/link'
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
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Fixed-price payments</h1>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 18 }}>
        The payments for your fixed-price work, stage by stage. Pay for day-rate and hourly work is shown on your <Link href="/sub-portal/timesheets" style={{ color: '#3e6b12', fontWeight: 600 }}>Timesheets</Link>.
      </p>

      {paymentStages.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 20 }}>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Total paid</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: '#16a34a' }}>{fmt(totalPaid)}</div>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Still to come</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: totalOutstanding > 0 ? '#d97706' : '#94a3b8' }}>{fmt(totalOutstanding)}</div>
          </div>
        </div>
      )}

      {paymentStages.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, textAlign: 'center', padding: '32px 20px', color: '#64748b' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>No fixed-price payments</div>
          <div style={{ fontSize: 14, marginBottom: 16 }}>You don’t have any fixed-price work with payment stages. If you are paid by the day or by the hour, your pay is on your Timesheets.</div>
          <Link href="/sub-portal/timesheets" style={{ display: 'inline-block', background: '#7ab533', color: '#fff', borderRadius: 12, padding: '12px 22px', fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>Go to Timesheets</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {paymentStages.map(p => {
            const contract = contractById[p.sub_contract_id]
            const isPaid = !!p.paid_date
            return (
              <div key={p.id} style={{ background: '#fff', border: `1px solid ${isPaid ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{p.description || 'Payment'}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: isPaid ? '#dcfce7' : '#fef9c3', color: isPaid ? '#166534' : '#854d0e' }}>
                        {isPaid ? 'Paid' : 'To come'}
                      </span>
                    </div>
                    {contract && (
                      <div style={{ fontSize: 14, color: '#475569', marginBottom: 3 }}>
                        {contract.job_type || contract.description}{contract.job_address ? ` · ${contract.job_address}` : ''}
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: '#94a3b8', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {p.due_date && !isPaid && <span>Due {fmtDate(p.due_date)}</span>}
                      {p.paid_date && <span style={{ color: '#16a34a' }}>✓ Paid {fmtDate(p.paid_date)}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: isPaid ? '#16a34a' : '#0f172a', flexShrink: 0 }}>
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
