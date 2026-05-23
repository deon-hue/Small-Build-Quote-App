'use client'

import { usePortal } from '@/contexts/PortalContext'
import { STAGE_COLOR, STAGE_LABEL } from '@/lib/utils'

export default function PortalJobsPage() {
  const { jobs, loading, error } = usePortal()

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
            </div>
          )
        })
      )}
    </>
  )
}
