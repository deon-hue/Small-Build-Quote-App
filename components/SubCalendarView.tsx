'use client'

// The subcontractor portal's Calendar: a month where the person's OWN booked days are green and, when their builder allows it, the company's other
// jobs are grey (job name, address and phase only). A plain display component used by BOTH the real subcontractor portal and the builder's preview
// of it, so they cannot drift apart. Never shows client names, prices, notes, individual tasks or who else is booked.

import { useMemo, useRef, useState } from 'react'
import { calendarMonth, type CalendarDay, type CompanyCalendarRow } from '@/lib/sub-calendar'
import { dayLabelLong, type ScheduleRow } from '@/lib/task-days'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const GREEN = '#7ab533'
const GREEN_DARK = '#3e6b12'
const GREEN_SOFT = '#e4f2cf'
const GREY = '#e2e8f0'
const GREY_TEXT = '#475569'

interface Props {
  schedule: ScheduleRow[]
  /** The company's jobs, or null when the builder has turned the company view off for this person */
  companyRows: CompanyCalendarRow[] | null
  /** Set when the company part could not be loaded (rather than switched off) */
  companyProblem?: boolean
  preview?: boolean
}

export default function SubCalendarView({ schedule, companyRows, companyProblem, preview }: Props) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [selected, setSelected] = useState<string | null>(null)
  // Busy weeks have many company jobs: by default the grid shows them as one quiet count per day (tap a day for the list); this spreads them out.
  const [spread, setSpread] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  const weeks = useMemo(() => calendarMonth(ym.y, ym.m, schedule, companyRows, new Date()), [ym, schedule, companyRows])
  const allDays = weeks.flat()
  const isThisMonth = ym.y === now.getFullYear() && ym.m === now.getMonth()
  const todayKey = allDays.find(d => d.isToday)?.key ?? null
  const sel: CalendarDay | undefined = allDays.find(d => d.key === (selected ?? (isThisMonth ? todayKey : null)))

  function go(delta: number) {
    const d = new Date(ym.y, ym.m + delta, 1)
    setYm({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(null)
  }
  const shortName = (c: { address: string; jobTitle: string }) => (c.address || c.jobTitle).split(',')[0].trim()
  function today() { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSelected(null) }

  return (
    <div>
      <style>{`
        .subcal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
        .subcal-chip-text { display: inline; }
        /* On a phone the month is a grid of day numbers with a dot per kind of work (green = you, grey = company); the full detail for a tapped day is the card underneath */
        @media (max-width: 640px) {
          .subcal-chip-text, .subcal-more, .subcal-spread { display: none !important; }
          .subcal-cell { min-height: 56px !important; padding: 4px 2px !important; }
          .subcal-date { justify-content: center !important; }
          .subcal-date span { font-size: 14px !important; min-width: 26px !important; line-height: 26px !important; }
          .subcal-chips { flex-direction: row !important; flex-wrap: wrap; justify-content: center; gap: 4px !important; margin-top: 4px !important; }
          .subcal-chip { width: 9px !important; height: 9px !important; line-height: 9px !important; border-radius: 50% !important; padding: 0 !important; }
          .subcal-head { font-size: 11px !important; }
          .subcal-legend { width: 100%; margin-left: 0 !important; flex-wrap: nowrap !important; }
        }
      `}</style>

      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0 }}>Calendar</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
          {companyRows ? 'Your booked days are green. The rest of the company’s work is grey, so you can see where things are happening.' : 'The days you are booked to be on site.'}
        </p>
      </div>
      {preview && <div style={{ background: '#1e2022', color: '#f0c040', borderRadius: 8, padding: '10px 16px', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>👁 Preview mode</div>}
      {companyProblem && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, marginBottom: 14 }}>
          The company’s other jobs could not be loaded just now, so only your own days are shown.
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <button onClick={() => go(-1)} aria-label="Previous month" style={navBtn}>‹</button>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', minWidth: 150, textAlign: 'center' }}>{MONTHS[ym.m]} {ym.y}</div>
        <button onClick={() => go(1)} aria-label="Next month" style={navBtn}>›</button>
        {!isThisMonth && <button onClick={today} style={{ ...navBtn, width: 'auto', padding: '0 12px', fontSize: 12.5 }}>Today</button>}
        <div className="subcal-legend" style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12, color: '#475569', flexWrap: 'wrap', alignItems: 'center' }}>
          {companyRows && <label className="subcal-spread" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}><input type="checkbox" checked={spread} onChange={e => setSpread(e.target.checked)} style={{ cursor: 'pointer' }} />List every job</label>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: GREEN }} />You</span>
          {companyRows && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: GREY }} />Company</span>}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div className="subcal-grid" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          {WEEKDAYS.map(w => <div key={w} className="subcal-head" style={{ padding: '6px 4px', textAlign: 'center', fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>{w}</div>)}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="subcal-grid" style={{ borderTop: wi ? '1px solid #eef2f6' : 'none' }}>
            {week.map(d => {
              const isSel = sel?.key === d.key
              const mineChips = d.mine.map(m => ({ k: 'm' + m.jobId + m.taskName, mine: true, text: m.taskName }))
              // company work: one summary chip by default ("3 other jobs"), or each job by its address when spread out
              const companyChips = spread
                ? d.company.map(c => ({ k: 'c' + c.jobId + c.phaseName, mine: false, text: shortName(c) }))
                : d.company.length ? [{ k: 'sum', mine: false, text: d.company.length === 1 ? shortName(d.company[0]) : `${d.company.length} other jobs` }] : []
              const shown = [...mineChips, ...companyChips]
              return (
                <div
                  key={d.key}
                  className="subcal-cell"
                  onClick={() => { setSelected(d.key); if (typeof window !== 'undefined' && window.innerWidth <= 640) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50) }}
                  style={{
                    minHeight: 92, padding: 5, cursor: 'pointer', borderLeft: d.date.getDay() === 1 ? 'none' : '1px solid #eef2f6',
                    background: isSel ? '#f0f9e0' : d.inMonth ? '#fff' : '#fafbfc', outline: isSel ? `2px solid ${GREEN}` : 'none', outlineOffset: -2,
                    opacity: d.inMonth ? 1 : 0.55,
                  }}
                >
                  <div className="subcal-date" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <span style={{
                      fontSize: 12, fontWeight: d.isToday ? 700 : 500, color: d.isToday ? '#fff' : '#334155',
                      background: d.isToday ? GREEN : 'transparent', borderRadius: 10, minWidth: 20, textAlign: 'center', padding: '0 5px',
                    }}>{d.date.getDate()}</span>
                  </div>
                  <div className="subcal-chips" style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 3 }}>
                    {shown.slice(0, 4).map(s => (
                      <div key={s.k} className="subcal-chip" title={s.text} style={{
                        height: 17, lineHeight: '17px', padding: '0 5px', borderRadius: 4, fontSize: 11, fontWeight: s.mine ? 700 : 500,
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                        background: s.mine ? GREEN : GREY, color: s.mine ? '#fff' : GREY_TEXT,
                      }}><span className="subcal-chip-text">{s.text}</span></div>
                    ))}
                    {shown.length > 4 && <div className="subcal-more" style={{ fontSize: 10.5, color: '#64748b', fontWeight: 600 }}>+{shown.length - 4} more</div>}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <div ref={detailRef} style={{ marginTop: 14, scrollMarginBottom: 12 }}>
        {sel ? <DayDetail day={sel} showCompany={!!companyRows} /> : <div style={{ fontSize: 13, color: '#64748b' }}>Tap a day to see what is on.</div>}
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = { width: 34, height: 34, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 18, color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }

function DayDetail({ day, showCompany }: { day: CalendarDay; showCompany: boolean }) {
  const nothing = day.mine.length === 0 && day.company.length === 0
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 6 }}>{dayLabelLong(day.date)}</div>
      {nothing && <div style={{ fontSize: 13, color: '#64748b' }}>{showCompany ? 'Nothing is scheduled this day.' : 'You are not booked this day.'}</div>}
      {day.mine.map((e, i) => (
        <div key={'m' + i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
          <span style={{ marginTop: 5, width: 9, height: 9, borderRadius: '50%', background: GREEN, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{e.taskName} <span style={{ fontSize: 10.5, fontWeight: 700, color: GREEN_DARK, background: GREEN_SOFT, borderRadius: 10, padding: '1px 8px', marginLeft: 4, whiteSpace: 'nowrap', display: 'inline-block' }}>BOOKED</span></div>
            <div style={{ fontSize: 12.5, color: '#475569', marginTop: 1 }}>{e.stageName ? `${e.stageName} · ` : ''}{e.jobTitle}</div>
            {e.address && <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>📍 {e.address}</div>}
          </div>
          {e.ofDays > 1 && <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', marginTop: 2 }}>Day {e.dayNo} of {e.ofDays}</span>}
        </div>
      ))}
      {day.company.length > 0 && (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', margin: '10px 0 2px', letterSpacing: 0.3 }}>ALSO ON THIS DAY (COMPANY)</div>
          {day.company.map((c, i) => (
            <div key={'c' + i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
              <span style={{ marginTop: 5, width: 9, height: 9, borderRadius: '50%', background: '#94a3b8', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, color: '#334155' }}>{c.address ? `📍 ${c.address}` : c.jobTitle}</div>
                <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 1 }}>{[c.address ? c.jobTitle : '', c.phaseName].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
