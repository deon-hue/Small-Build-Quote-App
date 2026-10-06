'use client'

// The subcontractor portal's "My schedule": the days a builder has booked them on site, day by day. A plain display component used by BOTH
// the real subcontractor portal (page and dashboard card) and the builder's preview of it, so they cannot drift apart.
// The data is only the person's OWN bookings (database function get_my_task_schedule): the job, its address, the task and which of its days
// they work. Never other people, other tasks, the client's name or any prices.

import { dayLabelLong, isoDay, type ScheduleDay, type ScheduleEntry } from '@/lib/task-days'

function relativeLabel(d: Date, today: Date): string {
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return ''
}

function EntryRow({ e }: { e: ScheduleEntry }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
      <span style={{ marginTop: 5, width: 9, height: 9, borderRadius: '50%', background: '#7ab533', flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{e.taskName}</div>
        <div style={{ fontSize: 12.5, color: '#475569', marginTop: 1 }}>{e.stageName ? `${e.stageName} · ` : ''}{e.jobTitle}</div>
        {e.address && <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>📍 {e.address}</div>}
      </div>
      {e.ofDays > 1 && <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', marginTop: 2 }}>Day {e.dayNo} of {e.ofDays}</span>}
    </div>
  )
}

function DayCard({ day, today }: { day: ScheduleDay; today: Date }) {
  const rel = relativeLabel(day.date, today)
  return (
    <div style={{ background: '#fff', border: `1.5px solid ${rel === 'Today' ? '#7ab533' : '#e2e8f0'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 10, boxShadow: rel === 'Today' ? '0 0 0 3px rgba(122,181,51,0.15)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{dayLabelLong(day.date)}</div>
        {rel && <span style={{ fontSize: 11, fontWeight: 700, color: '#3e6b12', background: '#e4f2cf', borderRadius: 10, padding: '1px 9px' }}>{rel.toUpperCase()}</span>}
      </div>
      {day.entries.map((e, i) => <EntryRow key={e.jobId + e.taskName + i} e={e} />)}
    </div>
  )
}

/** The full schedule page */
export default function SubScheduleView({ days, preview }: { days: ScheduleDay[]; preview?: boolean }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>My schedule</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>The days you are booked to be on site. Check back here if plans change.</p>
      </div>
      {preview && (
        <div style={{ background: '#1e2022', color: '#f0c040', borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600, marginBottom: 16 }}>👁 Preview mode</div>
      )}
      {days.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '28px 20px', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
          <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>Nothing booked yet</div>
          <div style={{ fontSize: 13 }}>When your builder books you on a task, the days will appear here.</div>
        </div>
      ) : days.map(d => <DayCard key={d.key} day={d} today={today} />)}
    </div>
  )
}

/** A small "your next days on site" card for the dashboard: the next few booked days */
export function SubNextDaysCard({ days, onSeeAll, limit = 3 }: { days: ScheduleDay[]; onSeeAll?: () => void; limit?: number }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const next = days.slice(0, limit)
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#374151', margin: 0 }}>Your next days on site</h2>
        {onSeeAll && days.length > 0 && <button onClick={onSeeAll} style={{ fontSize: 12, border: 'none', background: 'none', color: '#5e8f20', fontWeight: 700, cursor: 'pointer' }}>See all →</button>}
      </div>
      {next.length === 0 ? (
        <div style={{ fontSize: 13, color: '#64748b' }}>Nothing booked yet. When your builder books you on a task, the days will show here.</div>
      ) : next.map(d => {
        const rel = relativeLabel(d.date, today)
        return (
          <div key={isoDay(d.date)} style={{ padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0f172a' }}>
              {dayLabelLong(d.date)} {rel && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#3e6b12', background: '#e4f2cf', borderRadius: 10, padding: '1px 8px', marginLeft: 6 }}>{rel.toUpperCase()}</span>}
            </div>
            {d.entries.map((e, i) => (
              <div key={i} style={{ fontSize: 12.5, color: '#475569', marginTop: 2 }}>{e.taskName} · {e.jobTitle}{e.address ? ` · ${e.address}` : ''}</div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
