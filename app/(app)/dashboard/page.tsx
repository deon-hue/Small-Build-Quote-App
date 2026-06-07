'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, fmtK, quoteTotal, STAGE_COLOR, Q_BADGE, Q_LABEL } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { quoteBudget } from '@/lib/job-costs'

function marginColor(pct: number): string {
  if (pct >= 20) return '#7ab533'
  if (pct >= 10) return '#e67e22'
  return '#c0392b'
}

export default function DashboardPage() {
  const { jobs, quotes, invoices, variations, loading } = useApp()

  // ── Job costing: fetch all costs in one query ─────────────────────────────
  const [allJobCosts, setAllJobCosts] = useState<{ job_id: string; net_amount: number }[]>([])

  useEffect(() => {
    const sb = createClient()
    sb.from('job_costs')
      .select('job_id, net_amount')
      .then(({ data }) => setAllJobCosts((data ?? []) as { job_id: string; net_amount: number }[]))
  }, [])

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const now = new Date()
  const active   = jobs.filter(j => j.stage === 'active')
  const open     = quotes.filter(q => q.status === 'pending' || q.status === 'sent')
  const complete = jobs.filter(j => j.stage === 'complete')
  const totalVal = active.reduce((s, j) => s + (Number(j.value) || 0), 0)
  const pipeline = open.reduce((s, q) => s + quoteTotal(q), 0)

  // Overdue quotes — pending/sent saved more than 30 days ago
  const overdueQuotes = open.filter(q => {
    if (!q.savedDate) return false
    const parts = q.savedDate.split('/')
    if (parts.length !== 3) return false
    const saved = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]))
    return (now.getTime() - saved.getTime()) / 86400000 > 30
  })

  // Jobs starting within the next 7 days
  const weekFromNow = new Date(now.getTime() + 7 * 86400000)
  const upcomingJobs = jobs.filter(j => {
    if (!j.start || j.stage === 'complete') return false
    const s = new Date(j.start)
    return s >= now && s <= weekFromNow
  })

  // Revenue chart — last 6 months based on job start date
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const value = jobs
      .filter(j => {
        if (!j.start) return false
        const s = new Date(j.start)
        return s.getFullYear() === d.getFullYear() && s.getMonth() === d.getMonth()
      })
      .reduce((s, j) => s + (Number(j.value) || 0), 0)
    return { label: d.toLocaleDateString('en-GB', { month: 'short' }), value }
  })
  const maxVal = Math.max(...months.map(m => m.value), 1)
  const hasChartData = months.some(m => m.value > 0)

  const stageGroups: Record<string, typeof jobs> = {
    Planning: jobs.filter(j => j.stage === 'planning'),
    'On Site': jobs.filter(j => j.stage === 'active'),
    'On Hold': jobs.filter(j => j.stage === 'onhold'),
    Complete:  jobs.filter(j => j.stage === 'complete'),
  }

  // ── Job costing calculations ───────────────────────────────────────────────
  const costingRows = jobs
    .filter(j => j.stage !== 'planning')
    .sort((a, b) => {
      const order: Record<string, number> = { active: 0, onhold: 1, complete: 2, planning: 3 }
      const stageDiff = (order[a.stage] ?? 3) - (order[b.stage] ?? 3)
      return stageDiff !== 0 ? stageDiff : (Number(b.value) || 0) - (Number(a.value) || 0)
    })
    .map(j => {
      const linkedQuote = quotes.find(q => q.id === j.quoteId)
      const budget = linkedQuote ? quoteBudget(linkedQuote.phases) : null

      const actualCost = allJobCosts
        .filter(c => c.job_id === j.id)
        .reduce((s, c) => s + (Number(c.net_amount) || 0), 0)

      const invoicedTotal = invoices
        .filter(i => i.jobId === j.id)
        .reduce((s, i) => s + i.total, 0)

      const approvedVarTotal = (variations ?? [])
        .filter(v => v.jobId === j.id && ['approved', 'invoiced', 'paid'].includes(v.status))
        .reduce((s, v) => s + (v.total || 0), 0)

      const contractValue = (Number(j.value) || 0) + approvedVarTotal
      const hasActual     = actualCost > 0
      const overBudget    = budget !== null && hasActual && actualCost > budget.total
      const budgetUsedPct = budget && budget.total > 0
        ? Math.min(150, Math.round((actualCost / budget.total) * 100))
        : null

      // Prefer actual cost for margin; fall back to quoted budget estimate
      const costForMargin    = hasActual ? actualCost : budget?.total ?? null
      const marginPct        = costForMargin !== null && contractValue > 0
        ? Math.round(((contractValue - costForMargin) / contractValue) * 100)
        : null
      const marginEstimated  = !hasActual && budget !== null

      return {
        job: j, contractValue, budgetTotal: budget?.total ?? null,
        actualCost, hasActual, invoicedTotal,
        overBudget, budgetUsedPct, marginPct, marginEstimated,
      }
    })

  const activeRows         = costingRows.filter(r => r.job.stage === 'active')
  const summaryContract    = activeRows.reduce((s, r) => s + r.contractValue, 0)
  const summaryActual      = activeRows.reduce((s, r) => s + r.actualCost, 0)
  const rowsWithMargin     = costingRows.filter(r => r.marginPct !== null)
  const avgMargin          = rowsWithMargin.length
    ? Math.round(rowsWithMargin.reduce((s, r) => s + (r.marginPct ?? 0), 0) / rowsWithMargin.length)
    : null

  return (
    <>
      {/* Stats */}
      <div className="stats-grid">
        <div className="stat green">
          <div className="stat-label">Active Jobs</div>
          <div className="stat-val">{active.length}</div>
          <div className="stat-sub">{active.length ? active.length + ' job' + (active.length !== 1 ? 's' : '') + ' on site' : 'No active jobs'}</div>
        </div>
        <div className="stat gold">
          <div className="stat-label">Open Quotes</div>
          <div className="stat-val">{open.length}</div>
          <div className="stat-sub">{open.length ? fmtK(pipeline) + ' pipeline' : 'No open quotes'}</div>
        </div>
        <div className="stat terra">
          <div className="stat-label">Contract Value</div>
          <div className="stat-val">{fmtK(totalVal)}</div>
          <div className="stat-sub">Active jobs total</div>
        </div>
        <div className="stat sky">
          <div className="stat-label">Jobs Complete</div>
          <div className="stat-val">{complete.length}</div>
          <div className="stat-sub">{complete.length ? complete.length + ' job' + (complete.length !== 1 ? 's' : '') + ' done' : 'None yet'}</div>
        </div>
      </div>

      {/* Chart + Overdue quotes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18, marginBottom: 18 }}>
        {/* Revenue chart */}
        <div className="card">
          <div className="card-hd">Contract Value by Month</div>
          <div style={{ padding: '20px 24px' }}>
            {!hasChartData
              ? <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>
                  Add jobs with start dates to see monthly revenue
                </div>
              : <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 130 }}>
                  {months.map((m, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'DM Mono, monospace', textAlign: 'center', minHeight: 14 }}>
                        {m.value > 0 ? fmtK(m.value) : ''}
                      </div>
                      <div style={{
                        width: '100%',
                        background: m.value > 0 ? '#7ab533' : 'var(--border)',
                        borderRadius: '4px 4px 0 0',
                        height: m.value > 0 ? Math.max(6, Math.round((m.value / maxVal) * 90)) + 'px' : '4px',
                        transition: 'height 0.3s',
                      }} />
                      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
            }
          </div>
        </div>

        {/* Overdue quotes */}
        <div className="card">
          <div className="card-hd">
            <span>Overdue Quotes</span>
            {overdueQuotes.length > 0 && <span className="badge b-onhold">{overdueQuotes.length} overdue</span>}
          </div>
          <div>
            {!overdueQuotes.length
              ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No overdue quotes — great!</div>
              : overdueQuotes.slice(0, 5).map(q => (
                  <div key={q.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{q.customer.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--terra)' }}>Sent {q.savedDate}</div>
                    </div>
                    <div className="mono" style={{ fontSize: 13 }}>{fmt(quoteTotal(q))}</div>
                  </div>
                ))
            }
            {overdueQuotes.length > 0 && (
              <div style={{ padding: '10px 18px' }}>
                <a href="/quotes" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>View all quotes →</a>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active jobs + recent quotes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 18 }}>
        {/* Active jobs */}
        <div className="card">
          <div className="card-hd">
            <span>Active Jobs</span>
            <a href="/jobs" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>View all →</a>
          </div>
          <div>
            {!active.length
              ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No active jobs — add one in Jobs</div>
              : active.slice(0, 4).map(j => {
                  const pct = j.weeks ? Math.min(100, Math.round((j.done / j.weeks) * 100)) : 0
                  const col = STAGE_COLOR[j.stage] || 'var(--muted)'
                  return (
                    <div key={j.id} className="job-row">
                      <div className="job-dot" style={{ background: col }} />
                      <div className="job-info">
                        <div className="job-name">{j.type} — {j.client}</div>
                        <div className="job-meta">{j.address}</div>
                        <div className="progress">
                          <div className="progress-bar" style={{ width: pct + '%', background: col }} />
                        </div>
                      </div>
                      <div className="job-right">
                        <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(j.value)}</div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{pct}% done</div>
                      </div>
                    </div>
                  )
                })
            }
            {upcomingJobs.length > 0 && (
              <div style={{ padding: '10px 20px', background: 'rgba(74,144,164,0.05)', borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sky)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 8 }}>
                  Starting This Week
                </div>
                {upcomingJobs.map(j => (
                  <div key={j.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{j.type} — {j.client}</span>
                    <span style={{ color: 'var(--sky)', fontWeight: 600 }}>
                      {new Date(j.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent quotes */}
        <div className="card">
          <div className="card-hd">
            <span>Recent Quotes</span>
            <a href="/quotes" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>View all →</a>
          </div>
          <div>
            {!quotes.length
              ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No quotes yet</div>
              : [...quotes].reverse().slice(0, 5).map(q => (
                  <div key={q.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{q.customer.name || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{q.jobType}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="mono" style={{ fontSize: 13 }}>{fmt(quoteTotal(q))}</div>
                      <span className={`badge ${Q_BADGE[q.status] || 'b-pending'}`}>{Q_LABEL[q.status] || q.status}</span>
                    </div>
                  </div>
                ))
            }
          </div>
        </div>
      </div>

      {/* Pipeline board */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-hd">Job Pipeline</div>
        <div className="pipeline">
          {Object.entries(stageGroups).map(([label, stageJobs]) => (
            <div key={label} className="pip-col">
              <div className="pip-label">{label} ({stageJobs.length})</div>
              {stageJobs.length === 0
                ? <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>—</div>
                : stageJobs.map(j => (
                    <div key={j.id} className="pip-card">
                      <div className="pip-card-name">{j.client}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>{j.type}</div>
                      <div className="pip-card-val">{fmt(j.value)}</div>
                    </div>
                  ))
              }
            </div>
          ))}
        </div>
      </div>

      {/* ── Job Costing ────────────────────────────────────────────────────────── */}
      <div className="card" style={{ marginTop: 18 }}>
        <div className="card-hd">
          <span>Job Costing</span>
          <a href="/jobs" style={{ fontSize: 12, color: 'var(--muted)', textDecoration: 'none' }}>Enter costs in Jobs →</a>
        </div>

        {/* Summary bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1.5px solid var(--border)' }}>
          <div style={{ padding: '14px 20px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 4 }}>Active Contract Value</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: '#7ab533' }}>{fmtK(summaryContract)}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{activeRows.length} active job{activeRows.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ padding: '14px 20px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 4 }}>Actual Costs Entered</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: 'var(--text)' }}>{fmtK(summaryActual)}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {activeRows.filter(r => r.hasActual).length} of {activeRows.length} jobs with costs
            </div>
          </div>
          <div style={{ padding: '14px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)', marginBottom: 4 }}>Avg Gross Margin</div>
            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'DM Mono, monospace', color: avgMargin !== null ? marginColor(avgMargin) : 'var(--muted)' }}>
              {avgMargin !== null ? avgMargin + '%' : '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>across {rowsWithMargin.length} job{rowsWithMargin.length !== 1 ? 's' : ''}</div>
          </div>
        </div>

        {/* Table header */}
        {costingRows.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 110px 110px 170px 90px',
            padding: '6px 18px',
            background: '#f0f2f4',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--muted)',
          }}>
            <span>Job</span>
            <span style={{ textAlign: 'right' }}>Contract</span>
            <span style={{ textAlign: 'right' }}>Budget</span>
            <span style={{ paddingLeft: 8 }}>Actual Cost</span>
            <span style={{ textAlign: 'right' }}>Margin</span>
          </div>
        )}

        {/* Rows */}
        {costingRows.length === 0
          ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No jobs yet — create jobs to track costs and margin
            </div>
          : costingRows.map(r => {
              const stageCol = STAGE_COLOR[r.job.stage] || 'var(--muted)'
              const barPct   = Math.min(100, r.budgetUsedPct ?? 0)
              const barColor = r.overBudget ? '#c0392b' : (r.budgetUsedPct ?? 0) > 85 ? '#e67e22' : '#7ab533'

              return (
                <div key={r.job.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 110px 110px 170px 90px',
                  padding: '11px 18px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                }}>

                  {/* Job info */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: stageCol, marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.job.type} — {r.job.client}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{r.job.address}</div>
                    </div>
                  </div>

                  {/* Contract value */}
                  <div style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>
                    {fmt(r.contractValue)}
                  </div>

                  {/* Quoted budget (cost) */}
                  <div style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, color: r.budgetTotal !== null ? 'var(--text)' : 'var(--muted)' }}>
                    {r.budgetTotal !== null ? fmt(r.budgetTotal) : '—'}
                  </div>

                  {/* Actual cost + budget bar */}
                  <div style={{ paddingLeft: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: r.hasActual && r.budgetTotal !== null ? 4 : 0 }}>
                      <span style={{
                        fontFamily: 'DM Mono, monospace', fontSize: 13,
                        color: r.overBudget ? '#c0392b' : r.hasActual ? 'var(--text)' : 'var(--muted)',
                        fontWeight: r.overBudget ? 700 : 400,
                      }}>
                        {r.overBudget && '⚠ '}
                        {r.hasActual ? fmt(r.actualCost) : <span style={{ fontSize: 11 }}>No costs entered</span>}
                      </span>
                      {r.budgetUsedPct !== null && r.hasActual && (
                        <span style={{ fontSize: 10, color: r.overBudget ? '#c0392b' : 'var(--muted)', fontWeight: r.overBudget ? 700 : 400 }}>
                          {r.budgetUsedPct}%
                        </span>
                      )}
                    </div>
                    {r.hasActual && r.budgetTotal !== null && (
                      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: barPct + '%', background: barColor, borderRadius: 2, transition: 'width 0.4s' }} />
                      </div>
                    )}
                  </div>

                  {/* Margin */}
                  <div style={{ textAlign: 'right' }}>
                    {r.marginPct !== null ? (
                      <span style={{
                        fontWeight: 700, fontSize: 13, fontFamily: 'DM Mono, monospace',
                        color: marginColor(r.marginPct),
                      }}>
                        {r.marginPct}%
                        {r.marginEstimated && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)' }}> est</span>}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                    )}
                  </div>
                </div>
              )
            })
        }

        {/* Legend */}
        <div style={{ padding: '8px 18px', display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7ab533', display: 'inline-block' }} /> ≥20% margin
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e67e22', display: 'inline-block' }} /> 10–19%
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c0392b', display: 'inline-block' }} /> &lt;10% or over budget
          </span>
          <span style={{ marginLeft: 'auto' }}>
            Budget = quoted cost (ex-markup) · est = estimated from quote, no actual costs yet
          </span>
        </div>
      </div>
    </>
  )
}
