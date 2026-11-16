'use client'

// The subcontractor portal's Company calendar, in two views the person switches between with two big buttons:
//  WEEK (the first view): seven plain rows, Monday to Sunday. Each row is the day, then in big coloured blocks where they are working (the job's address
//  and what they are doing) or a plain 'Not booked'. A line at the top says how many days they are working. Tap a day to see it in the Day view.
//  DAY: a strip of seven day buttons and a card for the chosen day: their own work, then 'Also working' with the company's other jobs.
// Every job is in its own colour (the colour the builder picked for the job). A plain display component used by BOTH the real subcontractor portal and
// the builder's preview of it. Never shows client names, prices, notes, individual tasks or who else is booked.

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { calendarWeek, weekStartOf, safeColour, type CalendarDay, type CompanyCalendarRow } from '@/lib/sub-calendar'
import { jobColor } from '@/lib/utils'
import { dayLabelLong, type ScheduleRow } from '@/lib/task-days'

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MODE_KEY = 'sbc_sub_calendar_mode'
type Mode = 'week' | 'day'
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
  // Week to start with; the last one chosen is remembered on this phone (never needed: a blocked or empty store just means Week)
  const [mode, setModeState] = useState<Mode>('week')
  useEffect(() => { try { const m = localStorage.getItem(MODE_KEY); if (m === 'day' || m === 'week') setModeState(m) } catch { /* no storage */ } }, [])
  function setMode(m: Mode) { setModeState(m); try { localStorage.setItem(MODE_KEY, m) } catch { /* no storage */ } }

  const rows = companyRows && showCompany ? companyRows : null
  const days = useMemo(() => calendarWeek(weekStart, schedule, rows, new Date()), [weekStart, schedule, rows])
  // each job's colour: the one the builder picked (sent with the company's jobs), else the app's automatic colour for a job with no pick
  const colourByJob = useMemo(() => new Map((companyRows ?? []).map(r => [r.job_id, safeColour(r.job_color)] as const)), [companyRows])
  const colourOf = (jobId: string) => colourByJob.get(jobId) || jobColor(jobId)
  const thisWeek = weekStartOf(new Date()).getTime() === weekStart.getTime()
  // the chosen day (kept while moving about the week); otherwise today if this week, else the first day they are booked, else Monday
  const sel = days.find(d => d.key === selected) ?? days.find(d => d.isToday) ?? days.find(d => d.mine.length > 0) ?? days[0]

  function go(delta: number) {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + delta * 7)
    setWeekStart(d); setSelected(null)
  }

  const navBtn: React.CSSProperties = { width: 42, height: 42, borderRadius: '50%', border: '1px solid #d9dee3', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#1e2022', padding: 0 }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
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

      <div role="group" aria-label="Choose how to see the calendar" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {(['week', 'day'] as Mode[]).map(m => {
          const on = mode === m
          return (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={on}
              style={{ height: 50, borderRadius: 14, fontSize: 18, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', background: on ? '#1e2022' : '#fff', color: on ? '#fff' : '#1e2022', border: '2px solid #1e2022' }}>
              {m === 'week' ? '📅 Week' : '🕘 Day'}
            </button>
          )
        })}
      </div>

      {mode === 'week' && <WeekList days={days} showCompany={!!rows} colourOf={colourOf} onPick={key => { setSelected(key); setMode('day') }} />}

      {mode === 'day' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5, marginBottom: 14 }}>
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
              <span style={{ display: 'flex', gap: 3, height: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {[...new Set([...d.mine.map(m => m.jobId), ...d.company.map(c => c.jobId)])].slice(0, 4).map(id => (
                  <i key={id} style={{ width: 8, height: 8, borderRadius: '50%', background: colourOf(id), display: 'block' }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>}

      {companyRows && (
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 15, color: '#1e2022', margin: '0 2px 12px', cursor: 'pointer' }}>
          Show company jobs
          <input type="checkbox" checked={showCompany} onChange={e => setShowCompany(e.target.checked)} style={{ width: 22, height: 22, accentColor: GREEN, cursor: 'pointer' }} />
        </label>
      )}

      {mode === 'day' && <DayCard day={sel} showCompany={!!rows} companyAvailable={!!companyRows} colourOf={colourOf} />}
    </div>
  )
}

function DayCard({ day, showCompany, companyAvailable, colourOf }: { day: CalendarDay; showCompany: boolean; companyAvailable: boolean; colourOf: (jobId: string) => string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>{dayLabelLong(day.date)}</span>
        {day.isToday && <span style={{ fontSize: 12, fontWeight: 700, color: GREEN_DARK, background: GREEN_SOFT, borderRadius: 10, padding: '2px 9px' }}>TODAY</span>}
      </div>

      {day.mine.length === 0
        ? <div style={{ fontSize: 15, color: '#64748b', marginBottom: 4 }}>You are not booked this day.</div>
        : day.mine.map((e, i) => (
          <div key={i} style={{ background: colourOf(e.jobId), color: '#fff', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ fontSize: 17, fontWeight: 600 }}>{e.taskName}{e.ofDays > 1 && <span style={{ fontSize: 13, fontWeight: 500, opacity: 0.92 }}>  ·  Day {e.dayNo} of {e.ofDays}</span>}</div>
            <div style={{ fontSize: 14, opacity: 0.95, marginTop: 2 }}>{[e.address, e.stageName].filter(Boolean).join(' · ') || e.jobTitle}</div>
          </div>
        ))}

      {showCompany && day.company.length > 0 && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', margin: '12px 0 2px' }}>{day.isToday ? 'Also working today' : 'Also working this day'}</div>
          {day.company.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: i ? '1px solid #eef0f2' : 'none' }}>
              <i style={{ width: 10, height: 10, borderRadius: '50%', background: colourOf(c.jobId), display: 'block', marginTop: 6, flexShrink: 0 }} />
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

/** The whole week at a glance: one big row per day, Monday to Sunday. Where they are working: a coloured block with the address and the job. Otherwise: Not booked. */
function WeekList({ days, showCompany, colourOf, onPick }: { days: CalendarDay[]; showCompany: boolean; colourOf: (jobId: string) => string; onPick: (key: string) => void }) {
  const booked = days.filter(d => d.mine.length > 0).length
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 2px 10px' }}>
        {booked === 0 ? 'You are not booked this week.' : `You are working ${booked} ${booked === 1 ? 'day' : 'days'} this week.`}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map((d, i) => {
          const others = showCompany ? [...new Map(d.company.map(c => [c.jobId, c] as const)).values()] : []
          return (
            <button key={d.key} type="button" onClick={() => onPick(d.key)} aria-label={dayLabelLong(d.date) + (d.mine.length ? ': you are working' : ': not booked') + '. Tap to open this day.'}
              style={{ display: 'flex', gap: 12, alignItems: 'stretch', textAlign: 'left', width: '100%', padding: 8, borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
                background: '#fff', border: d.isToday ? `2px solid ${GREEN}` : '1px solid #e2e6ea' }}>
              <div style={{ width: 66, flexShrink: 0, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 0',
                background: d.isToday ? '#1e2022' : '#f1f4f6', color: d.isToday ? '#fff' : '#1e2022' }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>{DAY_NAMES[i]}</span>
                <span style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>{d.date.getDate()}</span>
                {d.isToday && <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, marginTop: 2 }}>TODAY</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
                {d.mine.length === 0
                  ? <div style={{ fontSize: 17, color: '#94a3b8', padding: '6px 2px' }}>Not booked</div>
                  : d.mine.map((e, k) => (
                    <div key={k} style={{ background: colourOf(e.jobId), color: '#fff', borderRadius: 12, padding: '10px 12px' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25 }}>{e.address || e.jobTitle}</div>
                      <div style={{ fontSize: 15, opacity: 0.95, marginTop: 2 }}>
                        {[e.taskName, e.ofDays > 1 ? `Day ${e.dayNo} of ${e.ofDays}` : ''].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                {others.length > 0 && (
                  <div style={{ fontSize: 13, color: '#64748b', display: 'flex', flexWrap: 'wrap', gap: '2px 12px', padding: '0 2px' }}>
                    <span style={{ fontWeight: 600 }}>Company also on:</span>
                    {others.map(c => (
                      <span key={c.jobId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <i style={{ width: 9, height: 9, borderRadius: '50%', background: colourOf(c.jobId), display: 'block' }} />{c.address || c.jobTitle}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 13, color: '#64748b', margin: '10px 2px 0' }}>Tap a day to see it in more detail.</div>
    </div>
  )
}
