'use client'

import { useState } from 'react'
import { useSubPortal } from '@/contexts/SubPortalContext'
import type { SubTimeEntry } from '@/contexts/SubPortalContext'

const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDay  = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
const todayISO = () => new Date().toISOString().slice(0, 10)

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

function rateLabel(e: SubTimeEntry): string {
  const typeStr = e.rate_type === 'day' ? 'Day rate' : e.rate_type === 'half_day' ? 'Half day' : e.rate_type === 'hourly' ? 'Hourly' : e.rate_type ?? ''
  const amtStr  = e.rate_amount ? ` · £${Number(e.rate_amount).toFixed(2)}${e.rate_type === 'hourly' ? '/hr' : ''}` : ''
  if (e.source === 'admin') return typeStr + amtStr
  if (e.rate_type && e.rate_amount) return typeStr + amtStr
  return e.units > 0 ? `${e.units}h` : ''
}

function weekStatusPriority(status: string): number {
  return { paid: 4, approved: 3, submitted: 2, queried: 1, rejected: 1, pending: 0 }[status] ?? 0
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  approved:  { bg: '#dcfce7', text: '#166534' },
  submitted: { bg: '#fef9c3', text: '#854d0e' },
  queried:   { bg: '#ffedd5', text: '#9a3412' },
  rejected:  { bg: '#fee2e2', text: '#991b1b' },
  paid:      { bg: '#dbeafe', text: '#1e40af' },
  pending:   { bg: '#f1f5f9', text: '#64748b' },
}

interface ParsedEntry {
  date: string
  startTime: string | null
  finishTime: string | null
  breakMins: number
  totalHours: number
  description: string
  contractId: string | null
  jobId: string | null
}

export default function SubPortalTimesheets() {
  const { timeEntries, contracts, jobs, subRates, loading, reload } = useSubPortal()

  const [aiText, setAiText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsed, setParsed] = useState<ParsedEntry | null>(null)

  // Form fields (pre-filled by AI, editable by sub)
  const [formDate, setFormDate] = useState(todayISO())
  const [formHours, setFormHours] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formFinish, setFormFinish] = useState('')
  const [formBreak, setFormBreak] = useState('0')
  const [formDesc, setFormDesc] = useState('')
  // Primary: job-based
  const [formJobId, setFormJobId] = useState('')
  // Secondary: specific contract (optional)
  const [formContractId, setFormContractId] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Derive default rate for the selected job (from subRates)
  const defaultRateType = subRates.dayRate ? 'daily' : subRates.hourlyRate ? 'hourly' : subRates.halfDayRate ? 'half_day' : 'daily'
  const defaultRateAmount = subRates.dayRate ?? subRates.hourlyRate ?? subRates.halfDayRate ?? 0

  // Find contracts matching the selected job
  const jobContracts = formJobId ? contracts.filter(c => c.job_id === formJobId) : []

  const contractById = Object.fromEntries(contracts.map(c => [c.id, c]))

  async function parseWithAI() {
    if (!aiText.trim()) return
    setParsing(true); setParseError('')
    try {
      const res = await fetch('/api/sub-portal/parse-timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: aiText,
          today: todayISO(),
          contracts: contracts.map(c => ({
            id: c.id,
            description: c.description,
            job_type: c.job_type,
            job_address: c.job_address,
            type: c.type,
            rate_type: c.rate_type,
          })),
          jobs: jobs.map(j => ({ id: j.id, client: j.client, type: j.type, address: j.address })),
        }),
      })
      const data = await res.json() as { parsed?: ParsedEntry; error?: string }
      if (!res.ok || data.error) { setParseError(data.error || 'Parse failed'); return }
      const p = data.parsed!
      setParsed(p)
      setFormDate(p.date || todayISO())
      setFormHours(String(p.totalHours ?? ''))
      setFormStart(p.startTime ?? '')
      setFormFinish(p.finishTime ?? '')
      setFormBreak(String(p.breakMins ?? 0))
      setFormDesc(p.description ?? '')
      if (p.jobId) setFormJobId(p.jobId)
      if (p.contractId) setFormContractId(p.contractId)
    } catch {
      setParseError('Network error — please try again.')
    } finally {
      setParsing(false)
    }
  }

  function clearForm() {
    setParsed(null); setAiText('')
    setFormDate(todayISO()); setFormHours(''); setFormStart(''); setFormFinish('')
    setFormBreak('0'); setFormDesc(''); setFormJobId(''); setFormContractId('')
    setSubmitError(''); setSubmitted(false)
  }

  async function submitTimesheet() {
    if (!formDate || !formHours) { setSubmitError('Please fill in date and hours.'); return }
    if (!formJobId && !formContractId) { setSubmitError('Please select a project or job.'); return }

    setSubmitting(true); setSubmitError('')
    try {
      const body: Record<string, unknown> = {
        date:        formDate,
        units:       Number(formHours),
        description: formDesc,
        startTime:   formStart || null,
        finishTime:  formFinish || null,
        breakMins:   Number(formBreak) || 0,
      }

      if (formContractId) {
        // Specific contract path
        body.contractId = formContractId
      } else {
        // Direct job path — send rate info so admin knows what to pay
        body.jobId = formJobId
        body.rateType = defaultRateType
        body.rateAmount = defaultRateAmount
      }

      const res = await fetch('/api/sub-portal/submit-timesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setSubmitError(data.error || 'Submit failed'); return }
      setSubmitted(true)
      reload()
      setTimeout(clearForm, 2500)
    } catch {
      setSubmitError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // Group time entries by week (Monday start)
  const weekMap = new Map<string, SubTimeEntry[]>()
  for (const e of timeEntries) {
    const ws = getWeekStart(e.entry_date)
    if (!weekMap.has(ws)) weekMap.set(ws, [])
    weekMap.get(ws)!.push(e)
  }
  const weeks = Array.from(weekMap.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  function toggleWeek(ws: string) {
    setExpandedWeeks(prev => {
      const next = new Set(prev)
      next.has(ws) ? next.delete(ws) : next.add(ws)
      return next
    })
  }

  if (loading) return <div className="portal-loading">Loading timesheets…</div>

  const hasJobs = jobs.length > 0

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Timesheets</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
        Log your time — describe your day and let AI fill in the details, or enter it manually.
      </p>

      {/* ── Entry form ── */}
      {!submitted && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>✨ Describe your day</div>

          {!parsed ? (
            <>
              <textarea
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                placeholder={'e.g. "On site from 8am to 5:30pm at the Acacia Road job, 30 min break, laying floor screed"\nor "Half day at the Camden extension, plastering internal walls"'}
                rows={3}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) parseWithAI() }}
              />
              {parseError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 6 }}>⚠ {parseError}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setParsed({ date: todayISO(), startTime: null, finishTime: null, breakMins: 0, totalHours: 0, description: '', contractId: null, jobId: null })}
                  style={{ fontSize: 12, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  Enter manually instead
                </button>
                <button
                  onClick={parseWithAI}
                  disabled={parsing || !aiText.trim()}
                  style={{ padding: '9px 20px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (!aiText.trim() || parsing) ? 0.5 : 1 }}
                >
                  {parsing ? 'Parsing…' : '✨ Parse with AI'}
                </button>
              </div>
            </>
          ) : (
            <>
              {aiText && (
                <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginBottom: 12, padding: '7px 10px', background: '#f0fdf4', borderRadius: 7, border: '1px solid #bbf7d0' }}>
                  ✓ AI filled in the details — check everything looks right and submit.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>

                {/* Job picker — primary */}
                {hasJobs && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldGroup label="Job / Project *">
                      <select value={formJobId} onChange={e => { setFormJobId(e.target.value); setFormContractId('') }} style={inp}>
                        <option value="">— select job —</option>
                        {jobs.map(j => (
                          <option key={j.id} value={j.id}>
                            {j.client}{j.address ? ` · ${j.address}` : ''}{j.type ? ` (${j.type})` : ''}
                          </option>
                        ))}
                      </select>
                    </FieldGroup>
                  </div>
                )}

                {/* If a job has a specific contract, offer it optionally */}
                {jobContracts.length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldGroup label="Under a specific contract (optional)">
                      <select value={formContractId} onChange={e => setFormContractId(e.target.value)} style={inp}>
                        <option value="">— general day rate —</option>
                        {jobContracts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.description || (c.type === 'rate' ? `${c.rate_type} rate` : 'fixed price')}
                            {c.rate_amount ? ` · £${c.rate_amount}` : ''}
                          </option>
                        ))}
                      </select>
                    </FieldGroup>
                  </div>
                )}

                {/* If sub has contracts but no jobs (older subs), show contract picker */}
                {!hasJobs && contracts.length > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <FieldGroup label="Contract *">
                      <select value={formContractId} onChange={e => setFormContractId(e.target.value)} style={inp}>
                        <option value="">— select contract —</option>
                        {contracts.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.job_type || c.description}{c.job_address ? ` · ${c.job_address}` : ''}
                          </option>
                        ))}
                      </select>
                    </FieldGroup>
                  </div>
                )}

                {/* Rate display (read-only, from contact record) */}
                {!formContractId && defaultRateAmount > 0 && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', borderRadius: 7, padding: '7px 10px', border: '1px solid #e2e8f0' }}>
                      💷 Rate: <strong>£{defaultRateAmount} {defaultRateType === 'hourly' ? 'per hour' : defaultRateType === 'half_day' ? 'half day' : 'per day'}</strong>
                    </div>
                  </div>
                )}

                <FieldGroup label="Date *">
                  <input type="date" style={inp} value={formDate} onChange={e => setFormDate(e.target.value)} />
                </FieldGroup>

                <FieldGroup label="Total hours *">
                  <input type="number" min={0.5} step={0.5} style={inp} value={formHours} onChange={e => setFormHours(e.target.value)} placeholder="e.g. 8" />
                </FieldGroup>

                <FieldGroup label="Start time">
                  <input type="time" style={inp} value={formStart} onChange={e => setFormStart(e.target.value)} />
                </FieldGroup>

                <FieldGroup label="Finish time">
                  <input type="time" style={inp} value={formFinish} onChange={e => setFormFinish(e.target.value)} />
                </FieldGroup>

                <FieldGroup label="Break (mins)">
                  <input type="number" min={0} step={5} style={inp} value={formBreak} onChange={e => setFormBreak(e.target.value)} />
                </FieldGroup>

                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldGroup label="Description of work">
                    <input style={inp} value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="What did you work on?" />
                  </FieldGroup>
                </div>
              </div>

              {submitError && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8 }}>⚠ {submitError}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={clearForm} style={{ padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff', fontSize: 13, cursor: 'pointer' }}>
                  ✗ Clear
                </button>
                <button
                  onClick={submitTimesheet}
                  disabled={submitting}
                  style={{ padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
                >
                  {submitting ? 'Submitting…' : '✓ Submit Timesheet'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {submitted && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '16px 20px', marginBottom: 24, fontSize: 14, color: '#166534', fontWeight: 600, textAlign: 'center' }}>
          ✓ Timesheet submitted — your site manager will review it shortly.
        </div>
      )}

      {/* ── History ── */}
      <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Your Timesheets</h2>

      {timeEntries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
          <div style={{ fontSize: 13 }}>No timesheets yet — log your first entry above.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {weeks.map(([ws, entries]) => {
            const isOpen = expandedWeeks.has(ws)
            const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
            const topStatus = sorted.reduce((best, e) => weekStatusPriority(e.status) > weekStatusPriority(best) ? e.status : best, sorted[0].status)
            const sc = STATUS_STYLE[topStatus] ?? { bg: '#f1f5f9', text: '#64748b' }
            const totalAmount = entries.filter(e => e.source === 'admin' && e.amount != null).reduce((s, e) => s + Number(e.amount), 0)
            const totalHours  = entries.filter(e => e.source !== 'admin').reduce((s, e) => s + Number(e.units), 0)
            const hasAmount   = entries.some(e => e.source === 'admin' && e.amount != null)
            const hasHours    = entries.some(e => e.source !== 'admin')

            return (
              <div key={ws} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {/* Week header — click to expand */}
                <button
                  onClick={() => toggleWeek(ws)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', gap: 10, textAlign: 'left' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>w/c {fmtDate(ws)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: sc.bg, color: sc.text }}>{topStatus}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{entries.length} day{entries.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      {hasAmount && <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>£{totalAmount.toFixed(2)}</div>}
                      {hasHours  && <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{totalHours}h</div>}
                    </div>
                    <span style={{ fontSize: 14, color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>

                {/* Expanded day rows */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    {sorted.map(e => {
                      const contract = e.sub_contract_id ? contractById[e.sub_contract_id] : null
                      const jobEntry = !e.sub_contract_id && e.job_id ? jobs.find(j => j.id === e.job_id) : null
                      const ds = STATUS_STYLE[e.status] ?? { bg: '#f1f5f9', text: '#64748b' }
                      const payLabel = rateLabel(e)
                      return (
                        <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f8fafc' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{fmtDay(e.entry_date)}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 99, background: ds.bg, color: ds.text }}>{e.status}</span>
                              {e.source === 'admin' && (
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>office logged</span>
                              )}
                              {payLabel && (
                                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #ddd6fe' }}>{payLabel}</span>
                              )}
                            </div>
                            {(contract || jobEntry) && (
                              <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600 }}>
                                {contract ? (contract.job_type || contract.description) + (contract.job_address ? ` · ${contract.job_address}` : '') : ''}
                                {jobEntry ? jobEntry.client + (jobEntry.address ? ` · ${jobEntry.address}` : '') : ''}
                              </div>
                            )}
                            {e.notes && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{e.notes}</div>}
                            {e.start_time && e.finish_time && (
                              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                                {e.start_time.slice(0, 5)} – {e.finish_time.slice(0, 5)}{e.break_mins > 0 ? ` (${e.break_mins}min break)` : ''}
                              </div>
                            )}
                            {(e.status === 'paid' || e.payment_method) && (
                              <div style={{ fontSize: 11, color: '#1e40af', marginTop: 2 }}>
                                ✓ {e.payment_method === 'bill' ? 'Bill payment' : 'Cash'}{e.paid_date ? ` · ${fmtDate(e.paid_date)}` : ''}
                              </div>
                            )}
                            {e.admin_notes && (
                              <div style={{ marginTop: 4, fontSize: 11, padding: '4px 8px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 5, color: '#92400e' }}>
                                💬 {e.admin_notes}
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a', flexShrink: 0, textAlign: 'right' }}>
                            {e.source === 'admin' && e.amount != null ? `£${Number(e.amount).toFixed(2)}` : `${e.units}h`}
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
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }
