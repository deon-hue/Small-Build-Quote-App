'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Job, JobPayment, PaymentMethod } from '@/lib/types'

interface Props {
  job: Job
  onClose: () => void
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: '💵 Cash',
  cheque: '📝 Cheque',
  bank_transfer: '🏦 Bank Transfer',
  other: '📋 Other',
}

const fmt = (n: number) => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function todayStr() { return new Date().toISOString().split('T')[0] }

export default function CashPaymentModal({ job, onClose }: Props) {
  const { jobPayments, addJobPayment, deleteJobPayment } = useApp()

  const payments = jobPayments.filter(p => p.jobId === job.id)
  const totalReceived = payments.reduce((s, p) => s + p.amount, 0)

  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleAdd() {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Enter a valid amount'); return }
    if (!date) { setError('Enter a payment date'); return }
    setError('')
    setSaving(true)
    try {
      await addJobPayment(job.id, amt, date, method, notes.trim() || undefined)
      setAmount('')
      setNotes('')
      setDate(todayStr())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save payment')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(p: JobPayment) {
    if (!confirm(`Delete payment of ${fmt(p.amount)} on ${p.paymentDate}?`)) return
    await deleteJobPayment(p.id)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Record Payment</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{job.type} — {job.client}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px' }}>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#166534', fontWeight: 600, marginBottom: 2 }}>CONTRACT VALUE</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(job.value)}</div>
            </div>
            <div style={{ flex: 1, background: '#eff6ff', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600, marginBottom: 2 }}>RECEIVED</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(totalReceived)}</div>
            </div>
            <div style={{ flex: 1, background: totalReceived >= job.value ? '#f0fdf4' : '#fef3c7', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: totalReceived >= job.value ? '#166534' : '#92400e', fontWeight: 600, marginBottom: 2 }}>OUTSTANDING</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(Math.max(0, job.value - totalReceived))}</div>
            </div>
          </div>

          {/* Add payment form */}
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Add payment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={lbl}>Amount (£)</label>
                <input style={inp} type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Date</label>
                <input style={inp} type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={lbl}>Method</label>
              <select style={inp} value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
                {(Object.entries(METHOD_LABELS) as [PaymentMethod, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Notes (optional)</label>
              <input style={inp} placeholder="e.g. Stage 2 payment" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>⚠ {error}</div>}
            <button
              onClick={handleAdd}
              disabled={saving}
              style={{ width: '100%', padding: '10px', background: '#2b3a2b', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving…' : '+ Record Payment'}
            </button>
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 8 }}>Payment history</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {payments.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e2e8f0' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{fmt(p.amount)} <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>· {METHOD_LABELS[p.method]}</span></div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.paymentDate}{p.notes ? ` · ${p.notes}` : ''}</div>
                    </div>
                    <button onClick={() => handleDelete(p)} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16, padding: '2px 4px' }}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {payments.length === 0 && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '12px 0' }}>No payments recorded yet</div>
          )}
        </div>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', background: '#fff' }
