'use client'

// The client portal dashboard's "what's happening" section: Next payment, Project progress, Upcoming works.
// A plain display component used by BOTH the real client portal dashboard and the builder's preview of it, so they cannot drift apart.
// The numbers come from lib/portal-dashboard.ts (invoices and their payment plans, and the job's saved build plan). Dates are estimates.

import type { Job, GanttState } from '@/lib/types'
import { fmt as fmtMoney } from '@/lib/utils'
import { fmtDay } from '@/lib/portal-build-plan'
import { describeDaysAway, nextPayment, projectProgress, upcomingWorks, type PortalInvoiceLike } from '@/lib/portal-dashboard'

const TITLE: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }

export default function PortalDashboardCards({ jobs, ganttStates, invoices, onViewInvoices }: {
  jobs: Job[]
  ganttStates: Record<string, GanttState | null | undefined>
  invoices: PortalInvoiceLike[]
  onViewInvoices?: () => void
}) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const live = jobs.filter(j => !j.archived)
  const pay = nextPayment(invoices, today)
  const progress = live.map(j => projectProgress(j, ganttStates[j.id], today))
  const upcoming = upcomingWorks(live, ganttStates, today)
  const many = live.length > 1

  // Nothing to say yet: no confirmed job and nothing invoiced
  if (live.length === 0 && !pay) return null

  return (
    <div style={{ marginBottom: 24 }}>
      {/* ── Next payment ── */}
      <div className="portal-card" style={{ borderLeft: `4px solid ${pay?.overdue ? '#c0392b' : '#7ab533'}`, marginBottom: 14 }}>
        <div style={TITLE}>Next payment</div>
        {pay ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{fmtMoney(pay.amount)}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>{pay.label}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: pay.overdue ? '#c0392b' : 'var(--ink)' }}>
                {pay.due ? fmtDay(pay.due) + ' ' + pay.due.getFullYear() : 'Date to be confirmed'}
              </div>
              <div style={{ fontSize: 12.5, color: pay.overdue ? '#c0392b' : 'var(--muted)', marginTop: 2 }}>{describeDaysAway(pay)}</div>
              {pay.moreCount > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>+ {pay.moreCount} more to come</div>}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>✓ No payment is due right now.</div>
        )}
        {pay && onViewInvoices && (
          <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={onViewInvoices}>View invoices →</button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {/* ── Project progress ── */}
        {progress.length > 0 && (
          <div className="portal-card" style={{ margin: 0 }}>
            <div style={TITLE}>Project progress</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {progress.map(p => (
                <div key={p.jobId}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{many ? p.title : p.headline}</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15 }}>{p.pct}%</div>
                  </div>
                  <div role="img" aria-label={`${p.pct} percent complete`} style={{ height: 10, background: '#e7ebe0', borderRadius: 6, overflow: 'hidden', margin: '8px 0 6px' }}>
                    <div style={{ width: `${p.pct}%`, height: '100%', background: p.state === 'complete' ? '#27ae60' : '#7ab533', borderRadius: 6, transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                    {many ? p.headline : ''}{many && p.finish ? ' · ' : ''}
                    {p.finish ? (p.state === 'complete' ? `Finished ${fmtDay(p.finish)}` : `Estimated finish ${fmtDay(p.finish)}`) : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Upcoming works ── */}
        {live.length > 0 && (
          <div className="portal-card" style={{ margin: 0 }}>
            <div style={TITLE}>Upcoming works</div>
            {upcoming.length === 0 ? (
              <div style={{ fontSize: 13.5, color: 'var(--muted)', lineHeight: 1.6 }}>Your builder will show what&rsquo;s coming up here once the programme has been planned.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcoming.map(u => (
                  <div key={u.jobId + u.name + u.start.getTime()} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ marginTop: 5, width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: u.status === 'now' ? '#7ab533' : '#c9d3bd' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {u.name}
                        {u.status === 'now' && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: '#3e6b12', background: '#e4f2cf', borderRadius: 10, padding: '1px 8px', letterSpacing: 0.4 }}>ON SITE NOW</span>}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
                        {u.status === 'now' ? `Until ${fmtDay(u.end)}` : `From ${fmtDay(u.start)}`}
                        {many && u.jobTitle ? ` · ${u.jobTitle}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 12 }}>Dates are estimates and can change with weather and site conditions.</div>
          </div>
        )}
      </div>
    </div>
  )
}
