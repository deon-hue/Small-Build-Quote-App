'use client'

import { usePortal } from '@/contexts/PortalContext'
import PortalGanttChart from '@/components/PortalGanttChart'

export default function BuildPlanPage() {
  const { jobs, ganttStates, loading, error } = usePortal()

  if (loading) {
    return (
      <div className="portal-section">
        <p className="portal-empty">Loading build plan…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="portal-section">
        <p className="portal-empty">Unable to load build plan.</p>
      </div>
    )
  }

  const activeJobs = jobs.filter(j => !j.done)
  const completedJobs = jobs.filter(j => j.done)

  if (jobs.length === 0) {
    return (
      <div className="portal-section">
        <div className="portal-section-hd">
          <h2 className="portal-section-title">Build Plan</h2>
        </div>
        <p className="portal-empty">No programme on file yet.</p>
      </div>
    )
  }

  function renderJob(j: typeof jobs[0]) {
    const ganttState = ganttStates[j.id] ?? null
    return (
      <div key={j.id} style={{ marginBottom: 32 }}>
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 500, margin: '0 0 2px' }}>
            {j.type || 'Building Works'}
          </h3>
          {j.address && (
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{j.address}</p>
          )}
        </div>
        <PortalGanttChart job={j} phases={[]} ganttState={ganttState} />
      </div>
    )
  }

  return (
    <div className="portal-section">
      <div className="portal-section-hd">
        <h2 className="portal-section-title">Build Plan</h2>
      </div>

      {activeJobs.length > 0 && activeJobs.map(renderJob)}

      {completedJobs.length > 0 && (
        <>
          <h3 style={{ fontSize: 13, fontWeight: 500, color: '#888', margin: '32px 0 16px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Completed
          </h3>
          {completedJobs.map(renderJob)}
        </>
      )}
    </div>
  )
}
