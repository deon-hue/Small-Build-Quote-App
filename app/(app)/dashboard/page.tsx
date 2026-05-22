'use client'

import { useApp } from '@/contexts/AppContext'
import { fmt, fmtK, quoteTotal, STAGE_COLOR, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'

export default function DashboardPage() {
  const { jobs, quotes, loading } = useApp()

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const active   = jobs.filter(j => j.stage === 'active')
  const open     = quotes.filter(q => q.status === 'pending' || q.status === 'sent')
  const complete = jobs.filter(j => j.stage === 'complete')
  const totalVal = active.reduce((s, j) => s + (Number(j.value) || 0), 0)
  const pipeline = open.reduce((s, q) => s + quoteTotal(q), 0)

  const pipelineStages = ['planning','active','snagging','complete'] as const
  const stageGroups: Record<string, typeof jobs> = {
    Planning: jobs.filter(j => j.stage === 'planning'),
    'On Site': jobs.filter(j => j.stage === 'active'),
    'On Hold': jobs.filter(j => j.stage === 'onhold'),
    Complete: jobs.filter(j => j.stage === 'complete'),
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

      {/* Two columns */}
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
              : [...quotes].reverse().slice(0, 4).map(q => (
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
