'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import type { Job } from '@/lib/types'

interface PaymentRequest {
  id: string
  amount: number
  description: string
  due_date: string | null
  status: 'draft' | 'sent' | 'received' | 'cancelled'
  sent_at: string | null
  received_at: string | null
  received_method: string
  notes: string
  created_at: string
}

const METHODS = ['Bank Transfer', 'Cash', 'Cheque', 'Card', 'Other']
const fmt = (n: number) => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = () => new Date().toISOString().slice(0, 10)

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('44')) return digits
  if (digits.startsWith('0')) return '44' + digits.slice(1)
  return digits
}

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
  sent:      { bg: '#fef9c3', color: '#92400e', label: 'Sent' },
  received:  { bg: '#dcfce7', color: '#15803d', label: 'Received' },
  cancelled: { bg: '#fee2e2', color: '#dc2626', label: 'Cancelled' },
}

interface Props { job: Job; onClose: () => void }

export default function PaymentRequestsModal({ job, onClose }: Props) {
  const sb = createClient()
  const { clients } = useApp()

  const [requests, setRequests] = useState<PaymentRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // New request form
  const [newMode, setNewMode] = useState(false)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')

  // Receive form
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [recDate, setRecDate] = useState(today())
  const [recMethod, setRecMethod] = useState('Bank Transfer')
  const [recNotes, setRecNotes] = useState('')

  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await sb.from('payment_requests')
      .select('*').eq('user_id', user.id).eq('job_id', job.id)
      .order('created_at', { ascending: false })
    setRequests((data ?? []) as PaymentRequest[])
    setLoading(false)
  }, [job.id])

  useEffect(() => { load() }, [load])

  const totalRequested = requests.filter(r => r.status !== 'cancelled').reduce((s, r) => s + Number(r.amount), 0)
  const totalReceived  = requests.filter(r => r.status === 'received').reduce((s, r) => s + Number(r.amount), 0)
  const totalSent      = requests.filter(r => r.status === 'sent').reduce((s, r) => s + Number(r.amount), 0)

  const clientContact = clients.find(c => c.name.toLowerCase().trim() === (job.client ?? '').toLowerCase().trim())
  const clientPhone   = toE164(clientContact?.phone ?? '')

  async function createRequest() {
    if (!amount || Number(amount) <= 0) { setError('Enter an amount'); return }
    if (!description.trim()) { setError('Enter a description'); return }
    setSaving(true); setError('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setSaving(false); return }
    await sb.from('payment_requests').insert({
      user_id: user.id, job_id: job.id,
      amount: Number(amount), description: description.trim(),
      due_date: dueDate || null, notes: notes.trim(), status: 'draft',
    })
    setNewMode(false); setAmount(''); setDescription(''); setDueDate(''); setNotes('')
    await load(); setSaving(false)
  }

  async function sendRequest(req: PaymentRequest) {
    const to = clientContact?.email ?? ''
    const subject = encodeURIComponent(`Payment Request — ${job.type ?? 'Works'} at ${job.address ?? ''}`)
    const dueStr = req.due_date ? ` by ${new Date(req.due_date).toLocaleDateString('en-GB')}` : ''
    const body = encodeURIComponent(
      `Dear ${job.client ?? 'Client'},\n\nPlease find below a payment request for works carried out at ${job.address ?? 'your property'}.\n\n` +
      `Description: ${req.description}\nAmount: ${fmt(Number(req.amount))}${dueStr}\n\n` +
      `${req.notes ? `Notes: ${req.notes}\n\n` : ''}` +
      `Please arrange payment at your earliest convenience.\n\nKind regards`
    )
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`

    // Mark as sent
    await sb.from('payment_requests').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', req.id)
    await load()
  }

  async function sendWhatsApp(req: PaymentRequest) {
    const dueStr = req.due_date ? ` by ${new Date(req.due_date).toLocaleDateString('en-GB')}` : ''
    const message = encodeURIComponent(
      `Hi ${job.client ?? ''},\n\nPayment request for works at ${job.address ?? 'your property'}:\n\n` +
      `${req.description}\nAmount: ${fmt(Number(req.amount))}${dueStr}\n\n` +
      `${req.notes ? `${req.notes}\n\n` : ''}` +
      `Please arrange payment at your earliest convenience.\n\nThank you`
    )
    window.open(`https://wa.me/${clientPhone}?text=${message}`, '_blank')
    await sb.from('payment_requests').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', req.id)
    await load()
  }

  async function markReceived() {
    if (!receivingId) return
    setSaving(true)
    await sb.from('payment_requests').update({
      status: 'received',
      received_at: new Date(recDate).toISOString(),
      received_method: recMethod,
      notes: recNotes || (requests.find(r => r.id === receivingId)?.notes ?? ''),
    }).eq('id', receivingId)
    setReceivingId(null)
    await load(); setSaving(false)
  }

  async function cancelRequest(id: string) {
    if (!confirm('Cancel this payment request?')) return
    await sb.from('payment_requests').update({ status: 'cancelled' }).eq('id', id)
    await load()
  }

  async function deleteRequest(id: string) {
    if (!confirm('Delete this payment request?')) return
    await sb.from('payment_requests').delete().eq('id', id)
    await load()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
  const btn: React.CSSProperties = { padding: '8px 14px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 13, cursor: 'pointer' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px' }}
      onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 620, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Payment Requests</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{job.client}{job.address ? ` — ${job.address}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>

          {/* Summary */}
          {!loading && requests.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Outstanding', value: fmt(totalSent), color: '#d97706' },
                { label: 'Received', value: fmt(totalReceived), color: '#16a34a' },
                { label: 'Total Requested', value: fmt(totalRequested), color: '#111827' },
              ].map(c => (
                <div key={c.label} style={{ flex: 1, minWidth: 140, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{c.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: c.color, fontFamily: 'monospace' }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* New request form */}
          {newMode ? (
            <div style={{ border: '2px solid #111827', borderRadius: 8, padding: 16, marginBottom: 16, background: '#f9fafb' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>New Payment Request</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Amount (£) *</label>
                    <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inp} autoFocus />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Due Date</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inp} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Description / Milestone *</label>
                  <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Stage 2 payment — first fix complete" style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Notes (shown in email)</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes for the client…" style={{ ...inp, minHeight: 56, resize: 'vertical' }} />
                </div>
              </div>
              {error && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => { setNewMode(false); setError('') }} style={btn}>Cancel</button>
                <button onClick={createRequest} disabled={saving} style={{ ...btn, background: '#111827', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Creating…' : 'Create Request'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => { setNewMode(true); setError('') }}
              style={{ ...btn, background: '#111827', color: '#fff', border: 'none', marginBottom: 14, display: 'block' }}>
              + New Payment Request
            </button>
          )}

          {/* Receive form */}
          {receivingId && (
            <div style={{ border: '2px solid #16a34a', borderRadius: 8, padding: 14, marginBottom: 14, background: '#f0fdf4' }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#15803d', marginBottom: 10 }}>✓ Record Payment Received</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Date Received</label>
                  <input type="date" value={recDate} onChange={e => setRecDate(e.target.value)} style={inp} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Payment Method</label>
                  <select value={recMethod} onChange={e => setRecMethod(e.target.value)} style={inp}>
                    {METHODS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, color: '#6b7280', marginBottom: 3, fontWeight: 600 }}>Notes</label>
                <input value={recNotes} onChange={e => setRecNotes(e.target.value)} placeholder="Reference number, etc." style={inp} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button onClick={() => setReceivingId(null)} style={btn}>Cancel</button>
                <button onClick={markReceived} disabled={saving} style={{ ...btn, background: '#16a34a', color: '#fff', border: 'none', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Saving…' : 'Confirm Payment'}
                </button>
              </div>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Loading…</div>
          ) : requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af', border: '2px dashed #e5e7eb', borderRadius: 8, fontSize: 13 }}>
              No payment requests yet. Create one above to send to your client.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {requests.map(r => {
                const s = STATUS_STYLE[r.status] ?? STATUS_STYLE.draft
                return (
                  <div key={r.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 14px', background: r.status === 'received' ? '#f0fdf4' : r.status === 'cancelled' ? '#f9fafb' : '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, fontFamily: 'monospace', color: '#111827' }}>{fmt(Number(r.amount))}</span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color, fontWeight: 600 }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize: 13, color: '#374151' }}>{r.description}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {r.due_date && <span>Due: {new Date(r.due_date).toLocaleDateString('en-GB')}</span>}
                          {r.sent_at && <span>Sent: {new Date(r.sent_at).toLocaleDateString('en-GB')}</span>}
                          {r.received_at && <span>Received: {new Date(r.received_at).toLocaleDateString('en-GB')} via {r.received_method}</span>}
                          {r.notes && <span>📝 {r.notes}</span>}
                        </div>
                      </div>

                      {r.status !== 'cancelled' && r.status !== 'received' && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => sendRequest(r)}
                            style={{ fontSize: 12, padding: '5px 10px', background: '#fef9c3', color: '#92400e', border: '1px solid #fde68a', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>
                            {r.status === 'sent' ? '↩ Email' : '📧 Email'}
                          </button>
                          {clientPhone && (
                            <button onClick={() => sendWhatsApp(r)}
                              style={{ fontSize: 12, padding: '5px 10px', background: '#e7f9ef', color: '#128c7e', border: '1px solid #25d366', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>
                              {r.status === 'sent' ? '↩ WA' : '💬 WA'}
                            </button>
                          )}
                          {r.status === 'sent' && (
                            <button onClick={() => { setReceivingId(r.id); setRecDate(today()); setRecNotes('') }}
                              style={{ fontSize: 12, padding: '5px 10px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>
                              ✓ Received
                            </button>
                          )}
                          <button onClick={() => cancelRequest(r.id)}
                            style={{ fontSize: 11, padding: '5px 8px', background: '#fff', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      )}
                      {(r.status === 'cancelled' || r.status === 'draft') && (
                        <button onClick={() => deleteRequest(r.id)}
                          style={{ fontSize: 11, padding: '4px 8px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 5, cursor: 'pointer', flexShrink: 0 }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
