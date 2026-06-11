'use client'

import { useEffect, useRef, useState } from 'react'
import type { Job, QuotePhase, GanttState, GanttPhase } from '@/lib/types'

interface Props {
  job: Job
  phases: QuotePhase[]
  ganttState?: GanttState | null
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export default function PortalGanttChart({ job, phases, ganttState }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')

  function buildState(): GanttState {
    const totalDays = (job.weeks || 12) * 7
    // Use admin's saved custom layout if available
    if (ganttState && ganttState.phases && ganttState.phases.length > 0) return ganttState
    // Fall back to quote phases or sensible defaults
    const labels = phases.length
      ? phases.map(p => p.phase)
      : ['Preliminaries','Demolition & Enabling','Foundations','Structure','Roof',
         'External Doors & Windows','First Fix','Insulation','Plastering','Second Fix','External Works']
    const n = labels.length
    const ganttPhases: GanttPhase[] = labels.map((label, i) => ({
      label,
      startDay: Math.round((i / n) * totalDays),
      durDays: Math.max(1, Math.round(((i + 1) / n) * totalDays) - Math.round((i / n) * totalDays)),
    }))
    return { phases: ganttPhases, totalDays }
  }

  useEffect(() => {
    renderGantt(buildState(), viewMode)
  }, [job, phases, ganttState, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Expose view-mode setter to inline onclick handlers in the injected HTML
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__portalGanttView = (m: string) => setViewMode(m as 'day' | 'week' | 'month')
    return () => { delete w.__portalGanttView }
  })

  function renderGantt(state: GanttState, mode: 'day' | 'week' | 'month') {
    const container = containerRef.current
    if (!container) return

    const totalWeeks = job.weeks || 12
    const startDate = job.start ? new Date(job.start) : new Date()
    startDate.setHours(0, 0, 0, 0)
    const totalDays = totalWeeks * 7
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0)
    const doneWeeks = Math.min(job.done || 0, totalWeeks)
    const LABEL_W = 200
    const ROW_H = 34

    // Build column definitions
    type Col = { date: Date; isToday: boolean; isWeekend: boolean; label: string; sublabel: string }
    let cols: Col[] = []
    let colCount = 0

    if (mode === 'day') {
      colCount = totalDays
      cols = Array.from({ length: colCount }, (_, i) => {
        const d = addDays(startDate, i)
        return { date: d, isToday: d.toDateString() === todayDate.toDateString(),
          isWeekend: d.getDay() === 0 || d.getDay() === 6,
          label: String(d.getDate()), sublabel: MONTH_NAMES[d.getMonth()] }
      })
    } else if (mode === 'week') {
      colCount = totalWeeks
      cols = Array.from({ length: colCount }, (_, w) => {
        const d = addDays(startDate, w * 7)
        return { date: d,
          isToday: todayDate >= addDays(startDate, w * 7) && todayDate < addDays(startDate, (w + 1) * 7),
          isWeekend: false, label: 'W' + (w + 1), sublabel: fmtDateShort(d) }
      })
    } else {
      const endDate = addDays(startDate, totalDays)
      let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      const endM = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
      while (cur <= endM) {
        cols.push({ date: new Date(cur),
          isToday: todayDate.getFullYear() === cur.getFullYear() && todayDate.getMonth() === cur.getMonth(),
          isWeekend: false, label: MONTH_NAMES[cur.getMonth()], sublabel: String(cur.getFullYear()) })
        cur.setMonth(cur.getMonth() + 1)
      }
      colCount = cols.length
    }

    // Month grouping row (only for day/week modes)
    let monthRowHtml = ''
    if (mode !== 'month') {
      const sections: { month: number; year: number; span: number }[] = []
      let curM = -1, span = 0
      cols.forEach((col, i) => {
        const m = col.date.getMonth()
        if (m !== curM) {
          if (curM !== -1) sections.push({ month: curM, year: col.date.getMonth() === 0 ? col.date.getFullYear() - 1 : col.date.getFullYear(), span })
          curM = m; span = 1
        } else { span++ }
        if (i === cols.length - 1) sections.push({ month: curM, year: col.date.getFullYear(), span })
      })
      monthRowHtml = sections.map(s =>
        `<div style="flex:${s.span};text-align:center;font-size:10px;font-weight:700;color:#2b2f33;padding:4px 2px;border-right:1px solid #dde1e5;border-bottom:1px solid #dde1e5;background:#eaedf0;white-space:nowrap;overflow:hidden">${MONTH_NAMES[s.month]} ${s.year}</div>`
      ).join('')
    }

    const weekRowHtml = cols.map(col =>
      `<div style="flex:1;min-width:${mode === 'day' ? '18px' : mode === 'month' ? '60px' : '38px'};text-align:center;font-size:${mode === 'day' ? '8px' : '9px'};color:${col.isToday ? '#e67e22' : col.isWeekend ? '#a0a8b0' : '#6b7580'};font-weight:${col.isToday ? '700' : '400'};padding:3px 1px;border-right:1px solid #dde1e5;border-bottom:2px solid #dde1e5;background:${col.isToday ? '#fff3e0' : col.isWeekend ? '#f4f6f8' : '#f8fafc'};white-space:nowrap;overflow:hidden">${col.label}${mode !== 'month' ? '<br><span style="font-size:7px">' + col.sublabel + '</span>' : '<br><span style="font-size:8px">' + col.sublabel + '</span>'}</div>`
    ).join('')

    function dayToPct(day: number): number {
      if (mode !== 'month') return (day / totalDays) * 100
      const d = addDays(startDate, day)
      const mIdx = cols.findIndex(c => c.date.getFullYear() === d.getFullYear() && c.date.getMonth() === d.getMonth())
      if (mIdx < 0) return (day / totalDays) * 100
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return ((mIdx + (d.getDate() - 1) / mEnd.getDate()) / colCount) * 100
    }

    // Portal: show level 0 group headers + level 1 phase bars only.
    // Never show level 2 tasks (too granular for clients).
    // Always fully expanded — ignore collapsed flags.
    let phaseIndex = 0
    const phaseRowsHtml = state.phases
      .filter((ph: GanttPhase) => (ph.level ?? 1) <= 1)
      .map((ph: GanttPhase) => {
        const level = ph.level ?? 1

        if (level === 0) {
          // Group header row — no bar, just a dark label stripe
          return `<div style="display:flex;align-items:center;height:${ROW_H}px;margin-bottom:2px;background:#e5e8ec;border-radius:3px">
            <div style="width:${LABEL_W}px;flex-shrink:0;font-size:11px;font-weight:700;color:#1e2022;padding:0 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(ph.label)}">${esc(ph.label)}</div>
            <div style="width:8px;flex-shrink:0"></div>
            <div style="flex:1;position:relative;height:${ROW_H - 8}px;background:#e5e8ec;border-radius:3px">
              <div style="position:absolute;left:${dayToPct(ph.startDay).toFixed(2)}%;width:${(dayToPct(ph.startDay + ph.durDays) - dayToPct(ph.startDay)).toFixed(2)}%;height:2px;top:50%;transform:translateY(-50%);background:#b0b8c8;border-radius:1px"></div>
            </div>
          </div>`
        }

        // Level 1 phase bar
        const idx = phaseIndex++
        const leftPct = dayToPct(ph.startDay)
        const widthPct = dayToPct(ph.startDay + ph.durDays) - dayToPct(ph.startDay)
        const phEndDay = ph.startDay + ph.durDays
        const isDone = phEndDay <= doneWeeks * 7
        const isActive = ph.startDay < doneWeeks * 7 && phEndDay > doneWeeks * 7
        const barColor = (ph.isComplete || isDone) ? '#7ab533' : isActive ? '#4a90a4' : '#c8d8e8'
        const textColor = (ph.isComplete || isDone || isActive) ? 'white' : '#2b2f33'
        const startD = fmtDateShort(addDays(startDate, ph.startDay))
        const endD = fmtDateShort(addDays(startDate, phEndDay))
        const pct = ph.percentComplete ?? 0
        return `<div style="display:flex;align-items:center;height:${ROW_H}px;margin-bottom:3px">
          <div style="width:${LABEL_W}px;flex-shrink:0;font-size:11px;font-weight:500;color:#1e2022;padding-right:12px;padding-left:${ph.level !== undefined ? '18px' : '0'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:right" title="${esc(ph.label)}">${ph.level === undefined ? (idx + 1) + '. ' : ''}${esc(ph.label)}</div>
          <div style="width:8px;flex-shrink:0"></div>
          <div style="flex:1;position:relative;height:${ROW_H - 8}px;background:#f0f2f4;border-radius:3px">
            <div style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;background:${barColor};border-radius:3px;display:flex;align-items:center;padding:0 6px;min-width:6px;box-shadow:0 1px 3px rgba(0,0,0,0.12);overflow:hidden">
              ${pct > 0 && !ph.isComplete ? `<div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;background:rgba(0,0,0,0.13);pointer-events:none"></div>` : ''}
              <span style="font-size:9px;color:${textColor};white-space:nowrap;overflow:hidden;position:relative">${(ph.isComplete || isDone) ? '✓ ' : isActive ? '▶ ' : ''}${startD}–${endD}${pct > 0 && !ph.isComplete ? ' · ' + pct + '%' : ''}</span>
            </div>
          </div>
        </div>`
      }).join('')

    // Today marker
    const todayOffset = Math.max(0, Math.min(totalDays, (todayDate.getTime() - startDate.getTime()) / 86400000))
    const todayPct = dayToPct(todayOffset)
    const todayHtml = todayPct >= 0 && todayPct <= 100
      ? `<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:#e67e22;z-index:3;pointer-events:none"><div style="position:absolute;top:-18px;left:50%;transform:translateX(-50%);font-size:8px;color:#e67e22;font-weight:700;white-space:nowrap;background:rgba(255,255,255,0.95);padding:1px 4px;border-radius:2px">TODAY</div></div>`
      : ''

    container.innerHTML = `
      <div style="margin-bottom:10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;border:1px solid #dde1e5;border-radius:4px;overflow:hidden;font-size:11px">
          <button onclick="window.__portalGanttView('day')" style="padding:4px 10px;border:none;cursor:pointer;font-family:inherit;font-size:11px;background:${mode === 'day' ? '#2b2f33' : 'white'};color:${mode === 'day' ? 'white' : '#2b2f33'};border-right:1px solid #dde1e5">Day</button>
          <button onclick="window.__portalGanttView('week')" style="padding:4px 10px;border:none;cursor:pointer;font-family:inherit;font-size:11px;background:${mode === 'week' ? '#2b2f33' : 'white'};color:${mode === 'week' ? 'white' : '#2b2f33'};border-right:1px solid #dde1e5">Week</button>
          <button onclick="window.__portalGanttView('month')" style="padding:4px 10px;border:none;cursor:pointer;font-family:inherit;font-size:11px;background:${mode === 'month' ? '#2b2f33' : 'white'};color:${mode === 'month' ? 'white' : '#2b2f33'}">Month</button>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#555"><span style="width:10px;height:10px;border-radius:2px;background:#7ab533;display:inline-block"></span>Complete</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#555"><span style="width:10px;height:10px;border-radius:2px;background:#4a90a4;display:inline-block"></span>In progress</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:10px;color:#555"><span style="width:10px;height:10px;border-radius:2px;background:#c8d8e8;display:inline-block"></span>Upcoming</span>
        </div>
      </div>
      <div style="overflow-x:auto">
        <div style="min-width:520px">
          <div style="display:flex;margin-left:${LABEL_W + 8}px">${monthRowHtml}</div>
          <div style="display:flex;margin-left:${LABEL_W + 8}px;margin-bottom:8px">${weekRowHtml}</div>
          <div style="position:relative;margin-top:18px">${todayHtml}${phaseRowsHtml}</div>
        </div>
      </div>
    `
  }

  return (
    <div style={{ background: '#f8fafc', border: '1.5px solid var(--border)', borderRadius: 8, padding: '16px 14px', marginTop: 14 }}>
      <div ref={containerRef} />
    </div>
  )
}
