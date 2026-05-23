'use client'

import { useApp } from '@/contexts/AppContext'
import { fmt, fmtK, quoteTotal, STAGE_COLOR, Q_BADGE, Q_LABEL } from '@/lib/utils'

export default function DashboardPage() {
  const { jobs, quotes, loading } = useApp()

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
    </>
  )
}
