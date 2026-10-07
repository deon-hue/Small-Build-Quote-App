'use client'

// The subcontractor portal's Company calendar: one WEEK at a time. A strip of seven day buttons (dots show green where they are booked and grey
// where the company has other work), and a card for the chosen day: their own job in green, then "Also working today" with the company's other
// jobs (job name, address and phase only). A plain display component used by BOTH the real subcontractor portal and the builder's preview of it.
// Never shows client names, prices, notes, individual tasks or who else is booked.

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { calendarWeek, weekStartOf, type CalendarDay, type CompanyCalendarRow } from '@/lib/sub-calendar'
import { dayLabelLong, type ScheduleRow } from '@/lib/task-days'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GREEN = '#7ab533'
const GREEN_DARK = '#3e6b12'
const GREEN_SOFT = '#e4f2cf'
const GREY = '#c3cad1'

interface Props {
  schedule: ScheduleRow[]
  /** The company's jobs, or null when the builder has turned the company view off for this person */
  companyRows: CompanyCalendarRow[] | null
  /** Set when the company part could not be loaded (rather than switched off) */
  companyProblem?: boolean
  preview?: boolean
}

function rangeLabel(days: CalendarDay[]): string {
  const a = days[0].date, b = days[6].date
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`
}

export default function SubCalendarView({ schedule, companyRows, companyProblem, preview }: Props) {
  const [weekStart, setWeekStart] = useState<Date>(() => weekStartOf(new Date()))
  const [selected, setSelected] = useState<string | null>(null)
  const [showCompany, setShowCompany] = useState(true)

  const rows = companyRows && showCompany ? companyRows : null
  const days = useMemo(() => calendarWeek(weekStart, schedule, rows, new Date()), [weekStart, schedule, rows])
  const thisWeek = weekStartOf(new Date()).getTime() === weekStart.getTime()
  // the chosen day (kept while moving about the week); otherwise today if this week, else the first day they are booked, else Monday
  const sel = days.find(d => d.key === selected) ?? days.find(d => d.isToday) ?? days.find(d => d.mine.length > 0) ?? days[0]

  function go(delta: number) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + delta * 7)
    setWeekStart(d); setSelected(null)
  }

  const navBtn: React.CSSProperties = { width: 42, height: 42, borderRadius: '50%', border: '1px solid #d9dee3', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#1e2022', padding: 0 }

  return (
    <div style={{ maxWidth: 620, margin: '0 auto' }}>
      {preview && <div style={{ background: '#1e2022', color: '#f0c040', borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>👁 Preview mode</div>}
      {companyProblem && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '9px 14px', fontSize: 13, marginBottom: 14 }}>
          The company’s other jobs could not be loaded just now, so only your own days are shown.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <button type="button" onClick={() => go(-1)} aria-label="Previous week" style={navBtn}><ChevronLeft size={22} /></button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{rangeLabel(days)}</div>
          {!thisWeek && <button type="button" onClick={() => { setWeekStart(weekStartOf(new Date())); setSelected(null) }} style={{ background: 'none', border: 'none', color: GREEN_DARK, fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '2px 0 0', fontFamily: 'inherit' }}>Back to this week</button>}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Next week" style={navBtn}><ChevronRight size={22} /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5, marginBottom: 14 }}>
        {days.map((d, i) => {
          const on = d.key === sel.key
          return (
            <button key={d.key} type="button" onClick={() => setSelected(d.key)} aria-pressed={on}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 0', minHeight: 70, borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
                background: on ? '#1e2022' : '#fff', color: on ? '#cbd2d9' : '#5b6570', border: `1px solid ${on ? '#1e2022' : d.isToday ? GREEN : '#e2e6ea'}`,
                outline: d.isToday && !on ? `1px solid ${GREEN}` : 'none',
              }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{LETTERS[i]}</span>
              <span style={{ fontSize: 18, fontWeight: 600, color: on ? '#fff' : '#1e2022' }}>{d.date.getDate()}</span>
              <span style={{ display: 'flex', gap: 3, height: 8 }}>
                {d.mine.length > 0 && <i style={{ width: 8, height: 8, borderRadius: '50%', background: GREEN, display: 'block' }} />}
                {d.company.length > 0 && <i style={{ width: 8, height: 8, borderRadius: '50%', background: GREY, display: 'block' }} />}
              </span>
            </button>
          )
        })}
      </div>

      {companyRows && (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, color: '#1e2022', margin: '0 2px 12px', cursor: 'pointer' }}>
          Show company jobs
          <input type="checkbox" checked={showCompany} onChange={e => setShowCompany(e.target.checked)} style={{ width: 22, height: 22, accentColor: GREEN, cursor: 'pointer' }} />
        </label>
      )}

      <DayCard day={sel} showCompany={!!rows} companyAvailable={!!companyRows} />

      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#5b6570', margin: '12px 2px 0' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN, display: 'block' }} />You</span>
        {companyRows && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: '50%', background: GREY, display: 'block' }} />Company</span>}
      </div>
    </div>
  )
}

function DayCard({ day, showCompany, companyAvailable }: { day: CalendarDay; showCompany: boolean; companyAvailable: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{dayLabelLong(day.date)}</span>
        {day.isToday && <span style={{ fontSize: 12, fontWeight: 700, color: GREEN_DARK, background: GREEN_SOFT, borderRadius: 10, padding: '2px 9px' }}>TODAY</span>}
      </div>

      {day.mine.length === 0
        ? <div style={{ fontSize: 15, color: '#64748b', marginBottom: 4 }}>You are not booked this day.</div>
        : day.mine.map((e, i) => (
          <div key={i} style={{ background: GREEN, color: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{e.taskName}{e.ofDays > 1 && <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.92 }}>  ·  Day {e.dayNo} of {e.ofDays}</span>}</div>
            <div style={{ fontSize: 14, opacity: 0.95, marginTop: 2 }}>{[e.address, e.stageName].filter(Boolean).join(' · ') || e.jobTitle}</div>
          </div>
        ))}

      {showCompany && day.company.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: '12px 0 2px' }}>{day.isToday ? 'Also working today' : 'Also working this day'}</div>
          {day.company.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? '1px solid #eef0f2' : 'none' }}>
              <i style={{ width: 10, height: 10, borderRadius: '50%', background: GREY, display: 'block', marginTop: 6, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1e2022' }}>{c.address || c.jobTitle}</div>
                <div style={{ fontSize: 14, color: '#64748b' }}>{[c.address ? c.jobTitle : '', c.phaseName].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
        </>
      )}
      {companyAvailable && !showCompany && <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>Company jobs are hidden.</div>}
    </div>
  )
}
