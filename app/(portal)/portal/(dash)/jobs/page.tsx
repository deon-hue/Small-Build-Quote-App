'use client'

import { useState } from 'react'
import { usePortal } from '@/contexts/PortalContext'
import { STAGE_COLOR, STAGE_LABEL } from '@/lib/utils'
import PortalGanttChart from '@/components/PortalGanttChart'

export default function PortalJobsPage() {
  const { jobs, ganttStates, loading, error } = usePortal()
  const [expandedGantt, setExpandedGantt] = useState<string | null>(null)

  if (loading) return <div className="portal-loading">Loading…</div>
  if (error && error !== 'no_admin_linked') {
    return <div className="portal-notice"><p>Unable to load jobs.</p></div>
  }

  return (
    <>
      <div className="portal-page-hd">
        <h1>Your Jobs</h1>
        <p>{jobs.length} job{jobs.length !== 1 ? 's' : ''} on file</p>
      </div>

      {!jobs.length ? (
        <div className="portal-notice">
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏗</div>
          <p>No jobs on file yet.</p>
        </div>
      ) : (
        jobs.map(j => {
          const pct = j.weeks ? Math.min(100, Math.round((j.done / j.weeks) * 100)) : 0
          const col = STAGE_COLOR[j.stage] || '#888'
          const ganttState = ganttStates[j.id] || null
          const ganttOpen = expandedGantt === j.id

          return (
            <div key={j.id} className="portal-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{j.type}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{j.address}</div>
                  {j.start && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Started {new Date(j.start).toLocaleDateString('en-GB')}
                    </div>
                  )}
                </div>
                <span className="portal-badge" style={{ background: col }}>
                  {STAGE_LABEL[j.stage] || j.stage}
                </span>
              </div>

              {/* Progress */}
              <div className="portal-progress">
                <div className="portal-progress-bar" style={{ width: pct + '%', background: col }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>
                <span>Week {j.done} of {j.weeks}</span>
                <span style={{ fontWeight: 600 }}>{pct}% complete</span>
              </div>

              {j.notes && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--warm)', borderRadius: 6, fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
                  {j.notes}
                </div>
              )}

              {/* Programme / Gantt toggle */}
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <button
                  onClick={() => setExpandedGantt(ganttOpen ? null : j.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, background: 'none',
                    border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px',
                    fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span>📋</span>
                  {ganttOpen ? 'Hide Programme' : 'View Programme'}
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 2 }}>
                    {ganttOpen ? '▲' : '▼'}
                  </span>
                </button>

                {ganttOpen && (
                  <PortalGanttChart
                    job={j}
                    phases={[]}
                    ganttState={ganttState}
                  />
                )}
              </div>
            </div>
          )
        })
      )}
    </>
  )
}
