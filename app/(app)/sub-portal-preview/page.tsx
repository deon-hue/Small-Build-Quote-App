'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import SubScheduleView, { SubNextDaysCard } from '@/components/SubScheduleView'
import SubCalendarView from '@/components/SubCalendarView'
import type { CompanyCalendarRow } from '@/lib/sub-calendar'
import { expandSchedule, type ScheduleRow } from '@/lib/task-days'

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
function effectiveStatus(e: TimeEntry): string {
  if (e.status === 'paid') return 'paid'
  if (e.payment_method != null) return 'paid'
  return e.status
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
  const [tab, setTab] = useState<'schedule' | 'calendar' | 'timesheets' | 'payments'>('schedule')
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [companyCalendar, setCompanyCalendar] = useState<CompanyCalendarRow[] | null>(null)
  const [companyCalendarProblem, setCompanyCalendarProblem] = useState(false)

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
      // the days this subcontractor is booked on site (same function the real portal's data comes from, for the builder to see)
      try {
        const { data: sch } = await supabase.rpc('get_sub_task_schedule_for_admin', { p_contact_id: contactId })
        const rows = (sch as { rows?: ScheduleRow[] } | null)?.rows
        setSchedule(Array.isArray(rows) ? rows : [])
      } catch { setSchedule([]) }
      // the company's other jobs, exactly as this subcontractor's Calendar tab gets them (null = switched off for them)
      try {
        const { data: cal, error: calErr } = await supabase.rpc('get_company_calendar_for_admin', { p_contact_id: contactId })
        const c = cal as { rows?: CompanyCalendarRow[]; error?: string } | null
        if (calErr || !c) { setCompanyCalendar(null); setCompanyCalendarProblem(true) }
        else if (c.error === 'disabled') { setCompanyCalendar(null); setCompanyCalendarProblem(false) }
        else if (c.error || !Array.isArray(c.rows)) { setCompanyCalendar(null); setCompanyCalendarProblem(true) }
        else { setCompanyCalendar(c.rows); setCompanyCalendarProblem(false) }
      } catch { setCompanyCalendar(null); setCompanyCalendarProblem(true) }
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

  // For fixed-contract subs, totals come from payment stages.
  // For rate/timesheet subs (no payment stages), sum from admin time log amounts.
  // status='paid' = cash handed over; 'approved' = billed but not yet received by sub.
  const paidFromStages = paymentStages.filter(p => !!p.paid_date).reduce((s, p) => s + p.amount, 0)
  const outstandingFromStages = paymentStages.filter(p => !p.paid_date).reduce((s, p) => s + p.amount, 0)
  const paidFromEntries = timeEntries
    .filter(e => e.source === 'admin' && e.amount != null && (e.status === 'paid' || e.payment_method != null))
    .reduce((s, e) => s + Number(e.amount), 0)
  const outstandingFromEntries = timeEntries
    .filter(e => e.source === 'admin' && e.amount != null && e.status !== 'paid' && e.payment_method == null && e.status !== 'rejected')
    .reduce((s, e) => s + Number(e.amount), 0)
  const totalPaid = paymentStages.length > 0 ? paidFromStages : paidFromEntries
  const totalOutstanding = paymentStages.length > 0 ? outstandingFromStages : outstandingFromEntries

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

      {/* Same big button the subcontractor has (here it just opens the Timesheets tab) */}
      <button onClick={() => setTab('timesheets')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '15px 18px', marginBottom: 18, background: '#7ab533', color: '#fff', border: 'none', borderRadius: 12, fontSize: 17, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(94,143,32,0.35)' }}>
        <span style={{ fontSize: 22, lineHeight: 1 }}>＋</span> Add my time
      </button>

      <SubNextDaysCard days={expandSchedule(schedule, new Date())} onSeeAll={() => setTab('schedule')} />

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
        {(['schedule', 'calendar', 'timesheets', 'payments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${tab === t ? '#6366f1' : 'transparent'}`,
            color: tab === t ? '#6366f1' : '#64748b', marginBottom: -2, textTransform: 'capitalize',
          }}>
            {t === 'schedule' ? `Schedule (${expandSchedule(schedule, new Date()).length})` : t === 'calendar' ? 'Calendar' : t === 'timesheets' ? `Timesheets (${timeEntries.length})` : `Payments (${paymentStages.length})`}
          </button>
        ))}
      </div>

      {/* Schedule tab: the days they are booked on site */}
      {tab === 'schedule' && <SubScheduleView days={expandSchedule(schedule, new Date())} preview />}

      {/* Calendar tab: their days, plus the company's other jobs in grey unless switched off for them */}
      {tab === 'calendar' && <SubCalendarView schedule={schedule} companyRows={companyCalendar} companyProblem={companyCalendarProblem} preview />}

      {/* What the subcontractor fills in to add their time (shown switched off here — nothing is saved from the preview) */}
      {tab === 'timesheets' && <AddTimeExample />}

      {/* Timesheets tab */}
      {tab === 'timesheets' && (
        timeEntries.length === 0
          ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: 13 }}>No timesheets recorded yet.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weeks.map(([ws, entries]) => {
                const isOpen = expandedWeeks.has(ws)
                const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
                const topStatus = sorted.reduce((best, e) => weekStatusPriority(effectiveStatus(e)) > weekStatusPriority(best) ? effectiveStatus(e) : best, effectiveStatus(sorted[0]))
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
                          const ds = STATUS_STYLE[effectiveStatus(e)] ?? { bg: '#f1f5f9', color: '#64748b' }
                          const payLabel = rateLabel(e)
                          return (
                            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f8fafc' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{fmtDay(e.entry_date)}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: ds.bg, color: ds.color }}>{effectiveStatus(e)}</span>
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

/** A read-only picture of the form a subcontractor uses to add their time, so the builder can see what it asks for */
function AddTimeExample() {
  const box: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 14, boxSizing: 'border-box', background: '#f8fafc', color: '#94a3b8' }
  const lab: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }
  return (
    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 4 }}>🕒 Add your time <span style={{ fontWeight: 500, color: '#94a3b8' }}>(what they fill in — switched off in this preview)</span></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}><label style={lab}>Job / Project</label><div style={box}>— select job —</div></div>
        <div><label style={lab}>Date</label><div style={box}>Today</div></div>
        <div><label style={lab}>Total hours</label><div style={box}>worked out for them</div></div>
        <div><label style={lab}>Start time</label><div style={box}>08:00</div></div>
        <div><label style={lab}>Finish time</label><div style={box}>17:00</div></div>
        <div><label style={lab}>Lunch / break (mins)</label><div style={box}>30</div></div>
        <div><label style={lab}>Description of work</label><div style={box}>What did you work on?</div></div>
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 10 }}>When they submit, it appears in the yellow <strong>Portal Timesheets Pending Review</strong> box on your Subcontractors page.</div>
    </div>
  )
}
