'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

const fmt = (n: number) => `£${(n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d: string | null) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtDay  = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}
function weekStatusPriority(s: string): number {
  return ({ paid: 4, approved: 3, submitted: 2, queried: 1, rejected: 1, pending: 0 } as Record<string,number>)[s] ?? 0
}
function rateLabel(e: TimeEntry): string {
  const rt = e.rate_type
  const typeStr = rt === 'day' ? 'Day rate' : rt === 'half_day' ? 'Half day' : rt === 'hourly' ? 'Hourly' : rt ?? ''
  const amtStr  = e.rate_amount ? ` · £${Number(e.rate_amount).toFixed(2)}${rt === 'hourly' ? '/hr' : ''}` : ''
  if (e.source === 'admin') return typeStr + amtStr
  if (rt && e.rate_amount) return typeStr + amtStr
  return e.units > 0 ? `${e.units}h` : ''
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  approved: { bg: '#dcfce7', color: '#166534' },
  submitted: { bg: '#fef9c3', color: '#854d0e' },
  queried:   { bg: '#ffedd5', color: '#9a3412' },
  rejected:  { bg: '#fee2e2', color: '#991b1b' },
  paid:      { bg: '#dbeafe', color: '#1e40af' },
  pending:   { bg: '#f1f5f9', color: '#64748b' },
}

interface TimeEntry {
  id: string; entry_date: string; units: number; notes: string; status: string
  submitted_by: string; admin_notes: string | null; job_id: string | null
  start_time: string | null; finish_time: string | null; amount: number | null; source: string
  rate_type?: string | null; rate_amount?: number | null; paid_date?: string | null; payment_method?: string | null
}
interface Contract {
  id: string; job_id: string | null; type: string; description: string
  rate_type: string | null; rate_amount: number | null; quoted_amount: number | null
  job_type: string | null; job_client: string | null; job_address: string | null
  start_date: string | null; end_date: string | null
}
interface PaymentStage {
  id: string; description: string; amount: number; due_date: string | null; paid_date: string | null
}
interface Job { id: string; client: string; address: string }

function SubPortalPreviewInner() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const router = useRouter()
  const contactId = searchParams.get('contactId') || ''

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subName, setSubName] = useState('')
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [paymentStages, setPaymentStages] = useState<PaymentStage[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [tab, setTab] = useState<'timesheets' | 'payments'>('timesheets')

  useEffect(() => {
    if (!contactId) { setError('No contact specified.'); setLoading(false); return }
    async function load() {
      setLoading(true); setError('')
      const { data, error: rpcErr } = await supabase.rpc('get_sub_portal_preview_for_admin', { p_contact_id: contactId })
      if (rpcErr) { setError(`Could not load preview: ${rpcErr.message || rpcErr.code || 'unknown error'}. Make sure you have re-run supabase/phase47.sql in Supabase.`); setLoading(false); return }
      const d = data as AnyRecord
      if (d?.error) {
        const msg = d.error === 'contact_not_found' ? 'Subcontractor not found.'
          : d.error === 'not_admin' ? 'Admin check failed — your profile may not have role=admin.'
          : d.error
        setError(msg); setLoading(false); return
      }
      setSubName(d.subName || 'Subcontractor')
      setContracts((d.contracts ?? []) as Contract[])
      setTimeEntries((d.timeEntries ?? []) as TimeEntry[])
      setPaymentStages((d.paymentStages ?? []) as PaymentStage[])
      setJobs((d.jobs ?? []) as Job[])
      setLoading(false)
    }
    load()
  }, [contactId]) // eslint-disable-line react-hooks/exhaustive-deps

  const jobMap = Object.fromEntries(jobs.map(j => [j.id, j]))

  // Group time entries by week
  const weekMap = new Map<string, TimeEntry[]>()
  for (const e of timeEntries) {
    const ws = getWeekStart(e.entry_date)
    if (!weekMap.has(ws)) weekMap.set(ws, [])
    weekMap.get(ws)!.push(e)
  }
  const weeks = Array.from(weekMap.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  function toggleWeek(ws: string) {
    setExpandedWeeks(prev => { const n = new Set(prev); n.has(ws) ? n.delete(ws) : n.add(ws); return n })
  }

  if (loading) return <div style={{ padding: 40, color: '#6b7280', fontSize: 14 }}>Loading preview…</div>
  if (error) return (
    <div style={{ padding: 40 }}>
      <div style={{ background: '#fff0ef', border: '1px solid #f5a0a0', borderRadius: 8, padding: '16px 20px', color: '#c0392b', fontSize: 13, marginBottom: 16 }}>⚠ {error}</div>
      <button className="btn btn-outline" onClick={() => router.back()}>← Back</button>
    </div>
  )

  const totalPaid = paymentStages.filter(p => !!p.paid_date).reduce((s, p) => s + p.amount, 0)
  const totalOutstanding = paymentStages.filter(p => !p.paid_date).reduce((s, p) => s + p.amount, 0)

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 60px' }}>

      {/* Admin banner */}
      <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', marginBottom: 24, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>👁</span>
        <span>Admin preview — this is what <strong>{subName}</strong> sees in their sub-portal.</span>
        <button onClick={() => router.back()} style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 12px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer', color: '#374151' }}>← Back</button>
      </div>

      {/* Welcome header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Good morning, {subName.split(' ')[0]} 👋</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{contracts.length} active job{contracts.length !== 1 ? 's' : ''} · Here's your overview</p>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Active Jobs',      value: String(contracts.length),        color: '#6366f1', mono: false },
          { label: 'Timesheet Entries', value: String(timeEntries.length),     color: '#0ea5e9', mono: false },
          { label: 'Total Paid',        value: fmt(totalPaid),                 color: '#10b981', mono: true  },
          { label: 'Outstanding',       value: fmt(totalOutstanding),          color: totalOutstanding > 0 ? '#f59e0b' : '#94a3b8', mono: true },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: c.mono ? 'monospace' : undefined }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Active contracts */}
      {contracts.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Active Jobs</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contracts.map(c => (
              <div key={c.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{c.job_type || c.description || 'Contract'}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: c.type === 'fixed' ? '#ede9fe' : '#e0f2fe', color: c.type === 'fixed' ? '#6d28d9' : '#0369a1', flexShrink: 0 }}>
                    {c.type === 'fixed' ? 'Fixed price' : c.rate_type === 'daily' || c.rate_type === 'day' ? 'Day rate' : 'Hourly rate'}
                  </span>
                </div>
                {c.job_address && <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>📍 {c.job_address}</div>}
                <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: '#94a3b8' }}>
                  {c.start_date && <span>Start: {fmtDate(c.start_date)}</span>}
                  {c.end_date   && <span>Due: {fmtDate(c.end_date)}</span>}
                </div>
                {c.type === 'rate' && c.rate_amount && (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
                    {fmt(c.rate_amount)} / {c.rate_type === 'daily' || c.rate_type === 'day' ? 'day' : 'hour'}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
        {(['timesheets', 'payments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${tab === t ? '#6366f1' : 'transparent'}`,
            color: tab === t ? '#6366f1' : '#64748b', marginBottom: -2, textTransform: 'capitalize',
          }}>
            {t === 'timesheets' ? `Timesheets (${timeEntries.length})` : `Payments (${paymentStages.length})`}
          </button>
        ))}
      </div>

      {/* Timesheets tab */}
      {tab === 'timesheets' && (
        timeEntries.length === 0
          ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No timesheets recorded yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weeks.map(([ws, entries]) => {
                const isOpen = expandedWeeks.has(ws)
                const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
                const topStatus = sorted.reduce((best, e) => weekStatusPriority(e.status) > weekStatusPriority(best) ? e.status : best, sorted[0].status)
                const sc = STATUS_STYLE[topStatus] ?? { bg: '#f1f5f9', color: '#64748b' }
                const totalAmount = entries.filter(e => e.source === 'admin' && e.amount != null).reduce((s, e) => s + Number(e.amount), 0)
                const totalHours  = entries.filter(e => e.source !== 'admin').reduce((s, e) => s + Number(e.units), 0)
                const hasAmount   = entries.some(e => e.source === 'admin' && e.amount != null)
                const hasHours    = entries.some(e => e.source !== 'admin')
                return (
                  <div key={ws} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                    <button onClick={() => toggleWeek(ws)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', gap: 10, textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>w/c {fmtDate(ws)}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: sc.bg, color: sc.color }}>{topStatus}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{entries.length} day{entries.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <div style={{ textAlign: 'right' }}>
                          {hasAmount && <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{fmt(totalAmount)}</div>}
                          {hasHours  && <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{totalHours}h</div>}
                        </div>
                        <span style={{ fontSize: 14, color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ borderTop: '1px solid #f1f5f9' }}>
                        {sorted.map(e => {
                          const job = e.job_id ? jobMap[e.job_id] : null
                          const ds = STATUS_STYLE[e.status] ?? { bg: '#f1f5f9', color: '#64748b' }
                          const payLabel = rateLabel(e)
                          return (
                            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f8fafc' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{fmtDay(e.entry_date)}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: ds.bg, color: ds.color }}>{e.status}</span>
                                  {e.source === 'admin' && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>office logged</span>}
                                  {payLabel && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>{payLabel}</span>}
                                </div>
                                {job && <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>{job.client}{job.address ? ` · ${job.address}` : ''}</div>}
                                {e.notes && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{e.notes}</div>}
                                {e.start_time && e.finish_time && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{e.start_time.slice(0, 5)} – {e.finish_time.slice(0, 5)}</div>}
                                {(e.status === 'paid' || e.payment_method) && <div style={{ fontSize: 11, color: '#1e40af', marginTop: 2 }}>✓ {e.payment_method === 'bill' ? 'Bill payment' : 'Cash'}{e.paid_date ? ` · ${fmtDate(e.paid_date)}` : ''}</div>}
                                {e.admin_notes && <div style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, color: '#92400e' }}>💬 {e.admin_notes}</div>}
                              </div>
                              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', flexShrink: 0 }}>
                                {e.source === 'admin' && e.amount != null ? fmt(Number(e.amount)) : `${e.units}h`}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
      )}

      {/* Payments tab */}
      {tab === 'payments' && (
        paymentStages.length === 0
          ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No payment stages recorded yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {paymentStages.map(p => (
                <div key={p.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{p.description || 'Payment'}</div>
                    {p.paid_date
                      ? <div style={{ fontSize: 11, color: '#16a34a', marginTop: 3 }}>✓ Paid {fmtDate(p.paid_date)}</div>
                      : p.due_date
                        ? <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Due {fmtDate(p.due_date)}</div>
                        : null}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: p.paid_date ? '#16a34a' : '#0f172a' }}>{fmt(p.amount)}</div>
                </div>
              ))}
            </div>
      )}
    </div>
  )
}

export default function SubPortalPreviewPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#6b7280' }}>Loading…</div>}>
      <SubPortalPreviewInner />
    </Suspense>
  )
}
