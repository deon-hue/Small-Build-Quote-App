'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { STAGE_COLOR, STAGE_LABEL, fmt } from '@/lib/utils'

export default function CalendarPage() {
  const { jobs, loading } = useApp()
  const [current, setCurrent] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }
  })

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const { year, month } = current
  const today = new Date()

  function prevMonth() {
    setCurrent(c => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 })
  }
  function nextMonth() {
    setCurrent(c => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 })
  }

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Build calendar grid (Mon–Sun)
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startOffset = (firstDay.getDay() + 6) % 7 // Mon=0
  const totalDays = lastDay.getDate()

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ]
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null)

  // Jobs by day of month (start date in this month)
  function jobsOnDay(day: number) {
    return jobs.filter(j => {
      if (!j.start) return false
      const d = new Date(j.start)
      return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day
    })
  }

  // Jobs active during this month (started before end, end before start+weeks)
  function jobsActiveDuring() {
    const monthStart = new Date(year, month, 1)
    const monthEnd = new Date(year, month + 1, 0)
    return jobs.filter(j => {
      if (!j.start || j.stage === 'complete') return false
      const s = new Date(j.start)
      const e = new Date(j.start)
      e.setDate(e.getDate() + (j.weeks || 1) * 7)
      return s <= monthEnd && e >= monthStart
    })
  }

  const activeThisMonth = jobsActiveDuring()

  return (
    <>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <button className="btn-sm btn-outline" onClick={prevMonth}>← Prev</button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: 'DM Serif Display, serif', fontSize: 22 }}>{monthLabel}</div>
        <button className="btn-sm btn-outline" onClick={nextMonth}>Next →</button>
        <button className="btn-sm btn-outline" onClick={() => setCurrent({ year: today.getFullYear(), month: today.getMonth() })}>Today</button>
      </div>

      {/* Active jobs this month */}
      {activeThisMonth.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-hd">Jobs Active This Month</div>
          <div style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {activeThisMonth.map(j => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--warm)', borderRadius: 6, padding: '6px 12px', fontSize: 13 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STAGE_COLOR[j.stage] || 'var(--muted)', flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{j.client}</span>
                <span style={{ color: 'var(--muted)' }}>— {j.type}</span>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--moss)' }}>{fmt(j.value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="card">
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '2px solid var(--border)' }}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
            <div key={d} style={{ padding: '10px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)' }}>{d}</div>
          ))}
        </div>
        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {cells.map((day, i) => {
            const isToday = day !== null && today.getDate() === day && today.getMonth() === month && today.getFullYear() === year
            const dayJobs = day !== null ? jobsOnDay(day) : []
            const isWeekend = i % 7 >= 5
            return (
              <div key={i} style={{
                minHeight: 90,
                borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--border)' : 'none',
                borderBottom: i < cells.length - 7 ? '1px solid var(--border)' : 'none',
                background: day === null ? '#f8f9fa' : isWeekend ? '#fafafa' : 'white',
                padding: '6px 8px',
              }}>
                {day !== null && (
                  <>
                    <div style={{
                      fontSize: 13, fontWeight: isToday ? 700 : 400,
                      color: isToday ? 'white' : isWeekend ? 'var(--muted)' : 'var(--ink)',
                      background: isToday ? '#7ab533' : 'none',
                      width: isToday ? 24 : 'auto', height: isToday ? 24 : 'auto',
                      borderRadius: isToday ? '50%' : 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 4,
                    }}>
                      {day}
                    </div>
                    {dayJobs.slice(0, 3).map(j => (
                      <div key={j.id} style={{
                        background: STAGE_COLOR[j.stage] || '#aaa',
                        color: 'white',
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 3,
                        marginBottom: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: 600,
                      }} title={`${j.type} — ${j.client}`}>
                        {j.client}
                      </div>
                    ))}
                    {dayJobs.length > 3 && (
                      <div style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 2 }}>+{dayJobs.length - 3} more</div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
        {Object.entries(STAGE_COLOR).map(([stage, color]) => (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            {STAGE_LABEL[stage] || stage}
          </div>
        ))}
      </div>
    </>
  )
}
