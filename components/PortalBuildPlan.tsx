'use client'

/**
 * PortalBuildPlan — the customer portal's view of a job's programme: a stage timeline
 * (done / on site now / up next) built from the job's saved Gantt state. Replaces the old
 * Gantt chart in the portal. Customers only ever see stages (level 0) and phases (level 1),
 * never the individual tasks (level 2).
 */

import './PortalBuildPlan.css'
import type { Job, GanttState } from '@/lib/types'
import { jobProgress } from '@/lib/utils'
import { buildStages, fmt, fmtDay, weeksOf, type Item } from '@/lib/portal-build-plan'

const Check = () => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function Node({ p, upNext }: { p: Item; upNext: boolean }) {
  return (
    <div className={`bp-node bp-${p.status}`}>
      <div className="bp-dot">{p.status === 'done' && <Check />}</div>
      <div className="bp-card">
        <div className="bp-nm">{p.name}</div>
        {p.status === 'now' && (
          <>
            <div className="bp-meta">
              <span className="bp-pill bp-pill-now">ON SITE NOW</span>
              <span>{fmt(p.start)} to {fmt(p.end)}</span>
              <span className="bp-chip">{weeksOf(p.start, p.end)} {weeksOf(p.start, p.end) === 1 ? 'wk' : 'wks'}</span>
            </div>
            {p.pct > 0 && (
              <div className="bp-bar" role="img" aria-label={`${Math.round(p.pct)} percent complete`}><i style={{ width: `${p.pct}%` }} /></div>
            )}
            <div className="bp-bar-note">
              <span>{p.pct > 0 ? `${Math.round(p.pct)}% done` : ''}</span>
              <span>Finishes {fmtDay(p.end)}</span>
            </div>
          </>
        )}
        {p.status === 'done' && (
          <div className="bp-meta"><span>{fmt(p.start)} to {fmt(p.end)}</span></div>
        )}
        {p.status === 'next' && (
          <div className="bp-meta">
            {upNext && <span className="bp-pill bp-pill-next">UP NEXT</span>}
            <span>Starts {fmtDay(p.start)}</span>
            <span className="bp-chip">{weeksOf(p.start, p.end)} {weeksOf(p.start, p.end) === 1 ? 'wk' : 'wks'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface Props {
  job: Job
  ganttState?: GanttState | null
}

export default function PortalBuildPlan({ job, ganttState }: Props) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const stages = buildStages(job, ganttState, today)

  if (!stages.length) {
    return (
      <p className="portal-empty">
        {job.start ? "Your builder hasn't added a programme for this job yet." : 'The programme will appear here once a start date is set.'}
      </p>
    )
  }

  const all = stages.flatMap(s => s.items)
  const finish = all.reduce((m, p) => (p.end > m ? p.end : m), all[0].end)
  const firstStart = all.reduce((m, p) => (p.start < m ? p.start : m), all[0].start)
  const upNext = all.filter(p => p.status === 'next').sort((a, b) => a.start.getTime() - b.start.getTime())[0]
  const prog = jobProgress(job)
  const complete = job.stage === 'complete'

  const main = complete ? 'Complete'
    : prog.started && prog.weeks ? `Week ${prog.weekNo} of ${prog.weeks}`
    : prog.started ? 'In progress'
    : `Starts ${fmtDay(firstStart)}`
  const sub = complete ? `Finished ${fmtDay(finish)}` : `Finishing around ${fmtDay(finish)}`

  return (
    <div className="bp">
      <div className="bp-card bp-summary">
        <div className="bp-ring" style={{ background: `conic-gradient(#7ab533 ${prog.pct * 3.6}deg, #dde1e5 0)` }}>
          <span>{prog.pct}%</span>
        </div>
        <div>
          <div className="bp-sum-main">{main}</div>
          <div className="bp-sum-sub">{sub}</div>
        </div>
      </div>

      <p className="bp-note">
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="8" cy="5.2" r=".85" fill="currentColor" />
        </svg>
        <span>This is an estimated plan and will change from time to time. It is an indication of what is happening and when, not a fixed schedule.</span>
      </p>

      {stages.map((g, gi) => g.status === 'done' ? (
        <details className="bp-done-stage" key={`${g.name}-${gi}`}>
          <summary>
            <span className="bp-tick"><Check /></span>
            <span>
              <div className="bp-sn">{g.name || 'Programme'}</div>
              <div className="bp-ss">Complete, {fmt(g.start)} to {fmt(g.end)}</div>
            </span>
            <svg className="bp-chev" viewBox="0 0 12 12" width="14" height="14" aria-hidden="true">
              <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="bp-tl">{g.items.map(p => <Node key={p.key} p={p} upNext={false} />)}</div>
        </details>
      ) : (
        <div key={`${g.name}-${gi}`}>
          {g.name && (
            <div className="bp-stage-h"><span>{g.name}</span><span className="bp-rng">{fmt(g.start)} to {fmt(g.end)}</span></div>
          )}
          <div className="bp-tl">{g.items.map(p => <Node key={p.key} p={p} upNext={p === upNext} />)}</div>
        </div>
      ))}
    </div>
  )
}
