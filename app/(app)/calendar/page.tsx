'use client'

import { useState, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/contexts/AppContext'
import { STAGE_COLOR, STAGE_LABEL, fmt } from '@/lib/utils'
import type { Job } from '@/lib/types'

// ── Date helpers ───────────────────────────────────────────────
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function sameDay(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }
function fmtShort(d: Date): string { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
function fmtFull(d: Date): string { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
function getMonday(d: Date): Date {
  const day = d.getDay()
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), day === 0 ? -6 : 1 - day)
}
function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return h
}

// ── Types ──────────────────────────────────────────────────────
interface CalEvent {
  id: string
  job: Job
  phaseLabel: string
  phaseIdx: number
  startDate: Date
  endDate: Date   // exclusive end (startDay + durDays)
  color: string
}

interface WeekSlot {
  event: CalEvent
  row: number
  startCol: number  // 0–7 within the week
  endCol: number    // 0–7 within the week
  startsHere: boolean
  endsHere: boolean
}

// ── Constants ──────────────────────────────────────────────────
const JOB_COLORS = [
  '#4a90a4', '#7ab533', '#e07b22', '#9b59b6', '#2980b9',
  '#e74c3c', '#1abc9c', '#b5870a', '#16a085', '#c0392b',
]
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_ROWS = 3  // max event rows visible per week strip in month view
const DATE_H   = 26 // px – date-number strip height
const EVT_H    = 22 // px – one event bar height
const OVF_H    = 18 // px – "+N more" row height

// ── Slot-assignment algorithm ─────────────────────────────────
// Assigns each CalEvent overlapping [weekStart, weekStart+7) to a row
// so no two events in the same row overlap.
function layoutWeek(events: CalEvent[], weekStart: Date): WeekSlot[] {
  const weekEnd = addDays(weekStart, 7)
  const overlapping = events.filter(e => e.startDate < weekEnd && e.endDate > weekStart)

  // Continuations (started before this week) first, then by start asc, then longest first
  const sorted = [...overlapping].sort((a, b) => {
    const ac = a.startDate < weekStart ? 0 : 1
    const bc = b.startDate < weekStart ? 0 : 1
    if (ac !== bc) return ac - bc
    const sd = a.startDate.getTime() - b.startDate.getTime()
    return sd !== 0 ? sd : (b.endDate.getTime() - b.startDate.getTime()) - (a.endDate.getTime() - a.startDate.getTime())
  })

  const rowEnds: number[] = []
  return sorted.flatMap(event => {
    const startCol = Math.max(0, daysBetween(weekStart, event.startDate))
    const endCol   = Math.min(7, daysBetween(weekStart, event.endDate))
    if (endCol <= startCol) return []
    let row = 0
    while ((rowEnds[row] ?? 0) > startCol) row++
    rowEnds[row] = endCol
    return [{ event, row, startCol, endCol,
      startsHere: event.startDate >= weekStart,
      endsHere:   event.endDate   <= weekEnd }]
  })
}

// ── Main component ─────────────────────────────────────────────
export default function CalendarPage() {
  const { jobs, ganttStates, loading } = useApp()
  const router = useRouter()

  const today = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), [])
  const [view,     setView]     = useState<'month' | 'week' | 'day'>('month')
  const [anchor,   setAnchor]   = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState<CalEvent | null>(null)

  // ── Build calendar events from all jobs + Gantt states ───────
  const calEvents = useMemo((): CalEvent[] => {
    const events: CalEvent[] = []
    for (const job of jobs) {
      if (!job.start) continue
      const jobStart = new Date(job.start)
      jobStart.setHours(0, 0, 0, 0)

      const color = JOB_COLORS[Math.abs(hashCode(job.id)) % JOB_COLORS.length]
      const gs    = ganttStates[job.id]

      // Use saved Gantt phases, or fall back to a default sequential layout
      const phases = (gs?.phases?.length ?? 0) > 0 ? gs!.phases : (() => {
        const totalDays = (job.weeks || 12) * 7
        const lbls = ['Preliminaries', 'Structural Works', 'First Fix', 'Second Fix', 'Completion & Snagging']
        return lbls.map((label, i, a) => ({
          label,
          startDay: Math.round((i / a.length) * totalDays),
          durDays:  Math.max(1, Math.round(((i + 1) / a.length) * totalDays) - Math.round((i / a.length) * totalDays)),
        }))
      })()

      phases.forEach((ph, i) => {
        events.push({
          id: `${job.id}-${i}`,
          job, phaseLabel: ph.label, phaseIdx: i, color,
          startDate: addDays(jobStart, ph.startDay),
          endDate:   addDays(jobStart, ph.startDay + ph.durDays),
        })
      })
    }
    return events.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  }, [jobs, ganttStates])

  // ── Navigation ───────────────────────────────────────────────
  function prev() {
    setAnchor(a =>
      view === 'month' ? new Date(a.getFullYear(), a.getMonth() - 1, 1)
      : view === 'week'  ? addDays(getMonday(a), -7)
      : addDays(a, -1)
    )
  }
  function next() {
    setAnchor(a =>
      view === 'month' ? new Date(a.getFullYear(), a.getMonth() + 1, 1)
      : view === 'week'  ? addDays(getMonday(a), 7)
      : addDays(a, 1)
    )
  }
  function goToday() {
    setAnchor(view === 'month'
      ? new Date(today.getFullYear(), today.getMonth(), 1)
      : new Date(today))
  }

  function headerLabel(): string {
    if (view === 'month') return anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    if (view === 'week') {
      const ws = getMonday(anchor)
      return `${fmtShort(ws)} – ${fmtFull(addDays(ws, 6))}`
    }
    return fmtFull(anchor)
  }

  // ── Month view ───────────────────────────────────────────────
  function renderMonth() {
    const year = anchor.getFullYear(), month = anchor.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    const offset   = (firstDay.getDay() + 6) % 7
    const calStart = addDays(firstDay, -offset)
    const numWeeks = Math.ceil((offset + lastDay.getDate()) / 7)
    const stripH   = DATE_H + MAX_ROWS * EVT_H + OVF_H

    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Day-name header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '2px solid var(--border)' }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)' }}>{d}</div>
          ))}
        </div>

        {/* Week strips */}
        {Array.from({ length: numWeeks }, (_, wi) => {
          const weekStart = addDays(calStart, wi * 7)
          const slots     = layoutWeek(calEvents, weekStart)
          const overflowByCol = Array.from({ length: 7 }, (_, col) =>
            slots.filter(s => s.row >= MAX_ROWS && s.startCol <= col && s.endCol > col).length
          )

          return (
            <div key={wi} style={{ position: 'relative', height: stripH, borderBottom: wi < numWeeks - 1 ? '1px solid var(--border)' : 'none' }}>
              {/* Date numbers */}
              <div style={{ display: 'flex', height: DATE_H }}>
                {Array.from({ length: 7 }, (_, col) => {
                  const d         = addDays(weekStart, col)
                  const isToday   = sameDay(d, today)
                  const inMonth   = d.getMonth() === month
                  const isWeekend = col >= 5
                  return (
                    <div key={col} style={{
                      flex: 1,
                      borderRight: col < 6 ? '1px solid var(--border)' : 'none',
                      padding: '3px 5px',
                      background: isWeekend && inMonth ? '#fafafa' : !inMonth ? '#f4f5f3' : 'white',
                    }}>
                      <span
                        onClick={() => { setView('day'); setAnchor(new Date(d)) }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 22, height: 22, fontSize: 12,
                          fontWeight: isToday ? 700 : 400,
                          borderRadius: '50%',
                          background: isToday ? '#7ab533' : 'none',
                          color: isToday ? 'white' : !inMonth ? '#ccc' : 'var(--ink)',
                          cursor: 'pointer',
                        }}
                      >{d.getDate()}</span>
                    </div>
                  )
                })}
              </div>

              {/* Event bars */}
              {slots.filter(s => s.row < MAX_ROWS).map(slot => (
                <div
                  key={slot.event.id}
                  onClick={() => setSelected(slot.event)}
                  title={`${slot.event.job.client} · ${slot.event.job.type}\n${slot.event.phaseLabel}\n${fmtShort(slot.event.startDate)} – ${fmtShort(addDays(slot.event.endDate, -1))}`}
                  style={{
                    position: 'absolute',
                    top: DATE_H + slot.row * EVT_H + 1,
                    left:  `calc(${(slot.startCol / 7) * 100}% + ${slot.startsHere ? 2 : 0}px)`,
                    width: `calc(${((slot.endCol - slot.startCol) / 7) * 100}% - ${(slot.startsHere ? 2 : 0) + (slot.endsHere ? 4 : 0)}px)`,
                    height: EVT_H - 3,
                    background: slot.event.color,
                    borderRadius: `${slot.startsHere ? 3 : 0}px ${slot.endsHere ? 3 : 0}px ${slot.endsHere ? 3 : 0}px ${slot.startsHere ? 3 : 0}px`,
                    cursor: 'pointer', overflow: 'hidden', zIndex: 1,
                    display: 'flex', alignItems: 'center',
                    paddingLeft: slot.startsHere ? 5 : 2, paddingRight: 2,
                  }}
                >
                  {slot.startsHere && (
                    <span style={{ fontSize: 10, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {slot.event.job.client} · {slot.event.phaseLabel}
                    </span>
                  )}
                </div>
              ))}

              {/* +N more per column */}
              {overflowByCol.map((cnt, col) => cnt > 0 ? (
                <div
                  key={col}
                  onClick={() => { setView('day'); setAnchor(addDays(weekStart, col)) }}
                  style={{
                    position: 'absolute', bottom: 2,
                    left:  `calc(${(col / 7) * 100}% + 4px)`,
                    width: `calc(${(1 / 7) * 100}% - 8px)`,
                    fontSize: 10, color: 'var(--muted)', cursor: 'pointer', fontWeight: 600,
                  }}
                >+{cnt} more</div>
              ) : null)}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Week view ─────────────────────────────────────────────────
  function renderWeek() {
    const weekStart = getMonday(anchor)
    const slots  = layoutWeek(calEvents, weekStart)
    const maxRow = slots.length > 0 ? Math.max(...slots.map(s => s.row)) + 1 : 0
    const minH   = Math.max(120, maxRow * 40 + 24)

    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '2px solid var(--border)' }}>
          {Array.from({ length: 7 }, (_, col) => {
            const d         = addDays(weekStart, col)
            const isToday   = sameDay(d, today)
            const isWeekend = col >= 5
            return (
              <div key={col} style={{
                padding: '6px 4px', textAlign: 'center',
                background: isWeekend ? '#fafafa' : 'white',
                borderRight: col < 6 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isToday ? '#7ab533' : 'var(--muted)' }}>
                  {DAYS[col]}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, fontSize: 16, fontWeight: isToday ? 700 : 400,
                  borderRadius: '50%', marginTop: 2,
                  background: isToday ? '#7ab533' : 'none',
                  color: isToday ? 'white' : 'var(--ink)',
                }}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative', minHeight: minH, padding: '8px 0' }}>
          {/* Column stripe backgrounds */}
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', pointerEvents: 'none' }}>
            {Array.from({ length: 7 }, (_, col) => (
              <div key={col} style={{ borderRight: col < 6 ? '1px solid #f0f2ee' : 'none', background: col >= 5 ? '#fafafa' : 'transparent' }} />
            ))}
          </div>

          {slots.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100, color: 'var(--muted)', fontSize: 13 }}>
              No phases scheduled this week
            </div>
          ) : slots.map(slot => {
            const durDays = daysBetween(slot.event.startDate, slot.event.endDate)
            return (
              <div
                key={slot.event.id}
                onClick={() => setSelected(slot.event)}
                title={`${slot.event.job.client} · ${slot.event.phaseLabel}`}
                style={{
                  position: 'absolute',
                  top: 8 + slot.row * 40,
                  left:  `${(slot.startCol / 7) * 100}%`,
                  width: `${((slot.endCol - slot.startCol) / 7) * 100}%`,
                  height: 34,
                  background: slot.event.color,
                  borderRadius: `${slot.startsHere ? 4 : 0}px ${slot.endsHere ? 4 : 0}px ${slot.endsHere ? 4 : 0}px ${slot.startsHere ? 4 : 0}px`,
                  cursor: 'pointer', overflow: 'hidden', zIndex: 1,
                  display: 'flex', alignItems: 'center',
                  paddingLeft: slot.startsHere ? 8 : 4, paddingRight: 4,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {slot.event.phaseLabel}
                  </div>
                  {slot.startsHere && (
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {slot.event.job.client} · {slot.event.job.type} · {Math.ceil(durDays / 7 * 10) / 10}w
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Day view ──────────────────────────────────────────────────
  function renderDay() {
    const dayEnd    = addDays(anchor, 1)
    const dayEvents = calEvents
      .filter(e => e.startDate < dayEnd && e.endDate > anchor)
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.phaseIdx - b.phaseIdx)

    if (dayEvents.length === 0) {
      return (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          No phases scheduled for {fmtFull(anchor)}
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dayEvents.map(evt => {
          const durDays = daysBetween(evt.startDate, evt.endDate)
          const stageColor = STAGE_COLOR[evt.job.stage] || '#888'
          return (
            <div
              key={evt.id}
              onClick={() => setSelected(evt)}
              className="card"
              style={{ padding: '14px 16px', cursor: 'pointer', borderLeft: `4px solid ${evt.color}`, display: 'flex', alignItems: 'center', gap: 16 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{evt.phaseLabel}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {evt.job.client} · {evt.job.type}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  {evt.job.address}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{fmtShort(evt.startDate)} → {fmtShort(addDays(evt.endDate, -1))}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{Math.ceil(durDays / 7 * 10) / 10} weeks</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: stageColor + '22', color: stageColor, flexShrink: 0 }}>
                {STAGE_LABEL[evt.job.stage] || evt.job.stage}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Detail panel (click-through) ─────────────────────────────
  function renderDetail() {
    if (!selected) return null
    const evt       = selected
    const durDays   = daysBetween(evt.startDate, evt.endDate)
    const stageColor = STAGE_COLOR[evt.job.stage] || '#888'

    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16, background: 'rgba(0,0,0,0.25)' }}
        onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}
      >
        <div style={{ background: 'var(--cream)', borderRadius: 12, width: 'min(420px,100%)', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', animation: 'slideUp 0.2s ease' }}>
          {/* Header */}
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: evt.color, flexShrink: 0, marginTop: 4 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{evt.phaseLabel}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Phase {evt.phaseIdx + 1}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1, padding: 0 }}>×</button>
          </div>

          {/* Details */}
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="Customer"   value={evt.job.client} />
            <DetailRow label="Job type"   value={evt.job.type} />
            <DetailRow label="Address"    value={evt.job.address} />
            <DetailRow label="Start"      value={fmtFull(evt.startDate)} />
            <DetailRow label="End"        value={fmtFull(addDays(evt.endDate, -1))} />
            <DetailRow label="Duration"   value={`${durDays} days (${Math.ceil(durDays / 7 * 10) / 10} weeks)`} />
            <DetailRow label="Job value"  value={fmt(evt.job.value)} />
            <DetailRow label="Status"     value={
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: stageColor + '22', color: stageColor }}>
                {STAGE_LABEL[evt.job.stage] || evt.job.stage}
              </span>
            } />
          </div>

          {/* Actions */}
          <div style={{ padding: '10px 18px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 13 }}
              onClick={() => { router.push('/jobs'); setSelected(null) }}
            >
              Open in Jobs →
            </button>
            <button
              className="btn-sm btn-outline"
              style={{ fontSize: 13, padding: '8px 14px' }}
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const jobsOnCalendar = jobs.filter(j => j.start).length
  const activeCount    = jobs.filter(j => j.stage === 'active').length

  return (
    <>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* View switcher */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['month', 'week', 'day'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 14px', border: 'none', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                background: view === v ? 'var(--ink)' : 'white',
                color:      view === v ? 'white' : 'var(--ink)',
                borderRight: v !== 'day' ? '1px solid var(--border)' : 'none',
                textTransform: 'capitalize',
              }}
            >{v}</button>
          ))}
        </div>

        <button className="btn-sm btn-outline" onClick={prev}>← Prev</button>
        <div style={{ flex: 1, textAlign: 'center', fontFamily: 'DM Serif Display, serif', fontSize: view === 'month' ? 22 : 17, whiteSpace: 'nowrap' }}>
          {headerLabel()}
        </div>
        <button className="btn-sm btn-outline" onClick={next}>Next →</button>
        <button className="btn-sm btn-outline" onClick={goToday}>Today</button>
      </div>

      {/* Stats */}
      {jobsOnCalendar > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <StatChip value={jobsOnCalendar} label="jobs on calendar" color="#4a90a4" />
          <StatChip value={activeCount}    label="active jobs"      color="#7ab533" />
          <StatChip value={calEvents.length} label="total phases"   color="#9b59b6" />
        </div>
      )}

      {/* Calendar body */}
      {view === 'month' && renderMonth()}
      {view === 'week'  && renderWeek()}
      {view === 'day'   && renderDay()}

      {/* Job colour legend */}
      {jobs.filter(j => j.start).length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Jobs:</span>
          {jobs.filter(j => j.start).map(j => (
            <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: JOB_COLORS[Math.abs(hashCode(j.id)) % JOB_COLORS.length], flexShrink: 0 }} />
              <span>{j.client} · {j.type}</span>
            </div>
          ))}
        </div>
      )}

      {renderDetail()}
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{value}</span>
    </div>
  )
}

function StatChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--warm)', borderRadius: 8, padding: '5px 12px' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span style={{ fontSize: 12, fontWeight: 700 }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
    </div>
  )
}
