'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Job, QuotePhase, GanttState, GanttPhase } from '@/lib/types'
import type { Quote } from '@/lib/types'
import { fmt, quoteTotal, Q_BADGE, Q_LABEL } from '@/lib/utils'
import { formatGanttDuration } from '@/lib/gantt-utils'
import { useRouter } from 'next/navigation'

interface Props {
  job: Job
  phases: QuotePhase[]
  linkedQuotes: Quote[]
  onClose: () => void
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function addDays(date: Date, n: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + n); return d
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export default function GanttModal({ job, phases, linkedQuotes, onClose }: Props) {
  const { getGanttState, saveGanttState } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<GanttState | null>(null)
  // Stores the cleanup fn for the current drag event listeners so we
  // can remove them before each re-render and on unmount.
  const cleanupDragRef = useRef<(() => void) | null>(null)
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  // dirty = true means the chart has been dragged since the last save
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const router = useRouter()

  function buildState(): GanttState {
    const totalDays = (job.weeks || 12) * 7

    // Use any previously saved layout — no phase-count gate so a custom arrangement
    // (different number of bars, renamed labels) is never silently discarded.
    const saved = getGanttState(job.id)
    if (saved && saved.phases && saved.phases.length > 0) return saved

    // No saved state → first-time creation: every phase starts at day 0 (job start date),
    // duration 2 days. User then drags/resizes to schedule properly.
    // Deduplicate labels — quote rows repeat the sub-phase name once per cost type.
    const rawLabels = phases.length
      ? phases.map(p => p.phase)
      : ['Preliminaries','Demolition & Enabling','Foundations','Structure','Roof',
         'External Doors & Windows','First Fix','Insulation','Plastering','Second Fix','External Works']
    const defaultLabels = [...new Set(rawLabels)]
    const ganttPhases: GanttPhase[] = defaultLabels.map(label => ({
      label,
      startDay: 0,
      durDays: 2,
    }))
    return { phases: ganttPhases, totalDays }
  }

  // ── Explicit save handler ────────────────────────────────────
  const handleSave = useCallback(async (overrideState?: GanttState) => {
    const s = overrideState ?? stateRef.current
    if (!s) return
    setSaveStatus('saving')
    const ok = await saveGanttState(job.id, s)
    if (ok) {
      stateRef.current = s
      setDirty(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } else {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 5000)
    }
  }, [job.id, saveGanttState])

  // Re-render the chart when job props or view mode changes.
  // Reset dirty/status when a different job is opened.
  useEffect(() => {
    setDirty(false)
    setSaveStatus('idle')
    const state = buildState()
    stateRef.current = state
    renderGantt(state, viewMode)
    return () => {
      // Clean up drag listeners when effect re-runs or component unmounts
      cleanupDragRef.current?.()
      cleanupDragRef.current = null
    }
  }, [job, phases, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

  function renderGantt(state: GanttState, mode: 'day' | 'week' | 'month') {
    const container = containerRef.current
    if (!container) return

    const totalWeeks = job.weeks || 12
    const startDate = job.start ? new Date(job.start) : new Date()
    startDate.setHours(0, 0, 0, 0)
    const totalDays = totalWeeks * 7
    const endDate = addDays(startDate, totalDays)
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0)
    const doneWeeks = Math.min(job.done || 0, totalWeeks)

    const LABEL_W = parseInt(container.dataset.labelW || '220') || 220
    const ROW_H = 36
    const CHART_MIN_W = 600
    const COL_MIN_W = mode === 'day' ? 18 : mode === 'month' ? 60 : 40

    // Build columns
    let cols: Array<{ date: Date, isToday: boolean, isWeekend: boolean, label: string, sublabel: string }> = []
    let colCount = 0

    if (mode === 'day') {
      colCount = totalDays
      cols = Array.from({ length: colCount }, (_, i) => {
        const d = addDays(startDate, i)
        return { date: d, isToday: d.toDateString() === todayDate.toDateString(),
          isWeekend: d.getDay() === 0 || d.getDay() === 6,
          label: d.getDate() + '', sublabel: MONTH_NAMES[d.getMonth()] }
      })
    } else if (mode === 'week') {
      colCount = totalWeeks
      cols = Array.from({ length: colCount }, (_, w) => {
        const d = addDays(startDate, w * 7)
        return { date: d, isToday: todayDate >= addDays(startDate, w * 7) && todayDate < addDays(startDate, (w + 1) * 7),
          isWeekend: false, label: 'W' + (w + 1), sublabel: fmtDateShort(d) }
      })
    } else {
      let mCursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
      while (mCursor <= endMonth) {
        cols.push({ date: new Date(mCursor),
          isToday: todayDate.getFullYear() === mCursor.getFullYear() && todayDate.getMonth() === mCursor.getMonth(),
          isWeekend: false, label: MONTH_NAMES[mCursor.getMonth()], sublabel: mCursor.getFullYear() + '' })
        mCursor.setMonth(mCursor.getMonth() + 1)
      }
      colCount = cols.length
    }

    // Inner div must be wide enough that flex:1 tracks match the overflowing column headers.
    // Without this, tracks are constrained to the visible modal width while day columns
    // expand to colCount * COL_MIN_W — causing bars to be squashed vs the column grid.
    const innerMinW = Math.max(CHART_MIN_W, LABEL_W + 9 + colCount * COL_MIN_W)

    // Month grouping
    let monthSections: Array<{ month: number, year: number, span: number }> = []
    if (mode !== 'month') {
      let currentMonth = -1, monthSpan = 0
      cols.forEach((col, i) => {
        const m = col.date.getMonth()
        if (m !== currentMonth) {
          if (currentMonth !== -1) monthSections.push({ month: currentMonth, year: col.date.getMonth() === 0 ? col.date.getFullYear() - 1 : col.date.getFullYear(), span: monthSpan })
          currentMonth = m; monthSpan = 1
        } else { monthSpan++ }
        if (i === cols.length - 1) monthSections.push({ month: currentMonth, year: col.date.getFullYear(), span: monthSpan })
      })
    }

    function dayToPct(day: number): number {
      if (mode !== 'month') return (day / totalDays) * 100
      const d = addDays(startDate, day)
      const mIdx = cols.findIndex(c => c.date.getFullYear() === d.getFullYear() && c.date.getMonth() === d.getMonth())
      if (mIdx < 0) return (day / totalDays) * 100
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      const frac = (d.getDate() - 1) / mEnd.getDate()
      return ((mIdx + frac) / colCount) * 100
    }

    const todayOffset = Math.max(0, Math.min(totalDays, (todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))

    const monthRowHtml = mode === 'month' ? '' : monthSections.map(m =>
      `<div style="flex:${m.span};text-align:center;font-size:10px;font-weight:700;color:#2b2f33;padding:4px 2px;border-right:1px solid #dde1e5;border-bottom:1px solid #dde1e5;background:#eaedf0;white-space:nowrap;overflow:hidden">${MONTH_NAMES[m.month]} ${m.year}</div>`
    ).join('')

    const weekRowHtml = cols.map(col =>
      `<div style="flex:1;min-width:${mode === 'day' ? '18px' : mode === 'month' ? '60px' : '40px'};text-align:center;font-size:${mode === 'day' ? '8px' : '9px'};color:${col.isToday ? '#e67e22' : col.isWeekend ? '#7080a8' : '#6b7580'};font-weight:${col.isToday ? '700' : col.isWeekend ? '600' : '400'};padding:3px 1px;border-right:1px solid #dde1e5;border-bottom:2px solid #dde1e5;background:${col.isToday ? '#fff3e0' : col.isWeekend ? '#dde3f0' : '#f8fafc'};white-space:nowrap;overflow:hidden">${col.label}${mode !== 'month' ? '<br><span style="font-size:7px">' + col.sublabel + '</span>' : '<br><span style="font-size:8px">' + col.sublabel + '</span>'}</div>`
    ).join('')

    // ── Weekend column stripes (all modes) ───────────────────────
    // Iterate over every real calendar day in the project.
    // Use dayToPct() so positioning is correct in day / week / month views.
    // Pairs of Sat+Sun stripes sit side by side making a clearly visible band.
    const trackWeekendHtml = (() => {
      const parts: string[] = []
      for (let day = 0; day < totalDays; day++) {
        const d = addDays(startDate, day)
        const dow = d.getDay()          // 0 = Sun, 6 = Sat
        if (dow !== 0 && dow !== 6) continue
        const lPct = dayToPct(day).toFixed(3)
        const wPct = (dayToPct(day + 1) - dayToPct(day)).toFixed(3)
        parts.push(
          `<div style="position:absolute;left:${lPct}%;width:${wPct}%;top:0;bottom:0;` +
          `background:#d8e2f8;pointer-events:none;z-index:0"></div>`
        )
      }
      return parts.join('')
    })()

    const phaseRowsHtml = state.phases.map((ph, i) => {
      const leftPct = dayToPct(ph.startDay)
      const widthPct = dayToPct(ph.startDay + ph.durDays) - dayToPct(ph.startDay)
      const phEndDay = ph.startDay + ph.durDays
      const isDone = phEndDay <= doneWeeks * 7
      const isActive = ph.startDay < doneWeeks * 7 && phEndDay > doneWeeks * 7
      const barColor = isDone ? '#7ab533' : isActive ? '#4a90a4' : '#c8d8e8'
      const textColor = (isDone || isActive) ? 'white' : '#2b2f33'
      const startD = fmtDateShort(addDays(startDate, ph.startDay))
      const endD = fmtDateShort(addDays(startDate, phEndDay))
      return `<div class="gantt-row" style="display:flex;align-items:center;height:${ROW_H}px;margin-bottom:3px">
        <div class="gantt-label-cell" style="width:${LABEL_W}px;flex-shrink:0;font-size:11px;font-weight:500;color:#1e2022;padding:0 10px 0 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;justify-content:flex-start;height:${ROW_H}px;text-align:left" title="${esc(ph.label)}">${i + 1}. ${esc(ph.label)}</div>
        <div class="gantt-col-divider" style="width:5px;flex-shrink:0;align-self:stretch;cursor:col-resize;background:transparent;border-left:2px dashed #c8d0d8;margin-right:4px" title="Drag to resize label column"></div>
        <div class="gantt-track" style="flex:1;position:relative;height:${ROW_H - 6}px;background:#f0f2f4;border-radius:3px;cursor:default;overflow:hidden">
          ${trackWeekendHtml}
          <div class="gantt-bar" data-idx="${i}" style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;background:${barColor};border-radius:3px;cursor:grab;user-select:none;display:flex;align-items:center;justify-content:space-between;padding:0 4px;box-shadow:0 1px 3px rgba(0,0,0,0.15);min-width:6px;z-index:1">
            <span style="font-size:9px;color:${textColor};white-space:nowrap;overflow:hidden;flex:1">${isDone ? '✓ ' : isActive ? '▶ ' : ''}<span class="bar-dates" style="opacity:0.85">${startD}–${endD}</span></span>
            <div class="gantt-resize-handle" data-idx="${i}" style="width:8px;height:100%;cursor:ew-resize;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:0.6"><div style="width:3px;height:60%;background:${textColor};border-radius:2px"></div></div>
          </div>
        </div>
      </div>`
    }).join('')

    const milestones = [
      { day: 0, label: 'Start', color: '#2b2f33' },
      { day: totalDays * 0.5, label: 'Mid-point', color: '#4a90a4' },
      { day: totalDays, label: 'Completion', color: '#7ab533' },
    ]
    const msHtml = milestones.map(m => {
      const pct = dayToPct(m.day)
      const d = fmtDateShort(addDays(startDate, m.day))
      const lblPos = pct < 5 ? 'left:0;transform:none' : pct > 95 ? 'right:0;left:auto;transform:none' : 'left:50%;transform:translateX(-50%)'
      return `<div style="position:absolute;left:${pct}%;top:0;bottom:0;width:2px;background:${m.color};opacity:0.5;pointer-events:none;z-index:2"><div style="position:absolute;top:-20px;${lblPos};font-size:8px;color:${m.color};font-weight:700;white-space:nowrap;background:rgba(255,255,255,0.9);padding:1px 3px;border-radius:2px">${m.label}<br>${d}</div></div>`
    }).join('')

    const todayPct = dayToPct(todayOffset)
    const todayLabelPos = todayPct < 5 ? 'left:0;transform:none' : todayPct > 95 ? 'right:0;left:auto;transform:none' : 'left:50%;transform:translateX(-50%)'
    const todayHtml = todayPct >= 0 && todayPct <= 100
      ? `<div style="position:absolute;left:${todayPct}%;top:0;bottom:0;width:2px;background:#e67e22;z-index:3;pointer-events:none"><div style="position:absolute;top:-20px;${todayLabelPos};font-size:8px;color:#e67e22;font-weight:700;white-space:nowrap;background:rgba(255,255,255,0.9);padding:1px 3px;border-radius:2px">TODAY<br>${fmtDateShort(todayDate)}</div></div>`
      : ''

    container.innerHTML = `
      <div style="margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <span style="font-size:12px;font-weight:600">${esc(job.type)} · ${esc(job.client)}</span>
          <span style="font-size:11px;color:#6b7580;margin-left:10px">${fmtDate(startDate)} → ${fmtDate(endDate)} · ${totalWeeks} weeks</span>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <div style="display:flex;border:1px solid #dde1e5;border-radius:4px;overflow:hidden;font-size:11px">
            <button id="gv-day" onclick="window.__ganttView('day')" style="padding:4px 10px;border:none;cursor:pointer;font-family:inherit;font-size:11px;background:${mode === 'day' ? '#2b2f33' : 'white'};color:${mode === 'day' ? 'white' : '#2b2f33'};border-right:1px solid #dde1e5">Day</button>
            <button id="gv-week" onclick="window.__ganttView('week')" style="padding:4px 10px;border:none;cursor:pointer;font-family:inherit;font-size:11px;background:${mode === 'week' ? '#2b2f33' : 'white'};color:${mode === 'week' ? 'white' : '#2b2f33'};border-right:1px solid #dde1e5">Week</button>
            <button id="gv-month" onclick="window.__ganttView('month')" style="padding:4px 10px;border:none;cursor:pointer;font-family:inherit;font-size:11px;background:${mode === 'month' ? '#2b2f33' : 'white'};color:${mode === 'month' ? 'white' : '#2b2f33'}">Month</button>
          </div>
          <span style="display:flex;align-items:center;gap:4px;font-size:10px"><span style="width:10px;height:10px;border-radius:2px;background:#7ab533;display:inline-block"></span>Complete</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:10px"><span style="width:10px;height:10px;border-radius:2px;background:#4a90a4;display:inline-block"></span>Active</span>
          <span style="display:flex;align-items:center;gap:4px;font-size:10px"><span style="width:10px;height:10px;border-radius:2px;background:#c8d8e8;display:inline-block"></span>Upcoming</span>
          <button onclick="window.__ganttReset()" style="font-size:10px;background:transparent;border:1px solid #dde1e5;border-radius:3px;padding:2px 8px;cursor:pointer;color:#6b7580">Reset to default</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <div style="min-width:${innerMinW}px">
          <div data-hdr-offset="1" style="display:flex;margin-left:${LABEL_W + 9}px;margin-bottom:0">${monthRowHtml}</div>
          <div data-hdr-offset="1" style="display:flex;margin-left:${LABEL_W + 9}px;margin-bottom:6px">${weekRowHtml}</div>
          <div style="position:relative;margin-top:20px">${msHtml}${todayHtml}${phaseRowsHtml}</div>
        </div>
      </div>
      <div id="gantt-tooltip" style="position:fixed;background:#2b2f33;color:white;font-size:11px;padding:6px 10px;border-radius:4px;pointer-events:none;display:none;z-index:999;line-height:1.6"></div>
    `

    // Remove ALL previous event listeners (container + document) before attaching new ones.
    // Critical: container.innerHTML replacement removes child DOM, but NOT listeners on the
    // container div itself. Without this cleanup, each renderGantt call accumulates an extra
    // stale mouseover/mousedown handler, causing the tooltip to read durDays from an old
    // state object (e.g. the saved value "31 days") instead of the current in-memory state.
    cleanupDragRef.current?.()
    const cleanupDrag   = attachDrag(container, state, startDate, totalDays, mode)
    const cleanupResize = attachLabelResize(container, state, mode)
    cleanupDragRef.current = () => { cleanupDrag(); cleanupResize() }
  }

  // Returns a COMPREHENSIVE cleanup for ALL event listeners — container AND document.
  // Container listeners are named functions (not anonymous) so they can be individually
  // removed. Without this, multiple renderGantt calls silently stack up extra mouseover
  // handlers on the container div, each closing over a different (possibly stale) state
  // object, causing the tooltip to show old durDays values after re-renders.
  function attachDrag(container: HTMLDivElement, state: GanttState, startDate: Date, totalDays: number, mode: 'day' | 'week' | 'month'): () => void {
    const tooltip = container.querySelector<HTMLElement>('#gantt-tooltip')
    let dragging: { type: 'move' | 'resize', idx: number, startX: number, origStart: number, origDur: number, trackW: number } | null = null

    function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

    function updateBar(bar: Element, ph: GanttPhase) {
      const leftPct = (ph.startDay / totalDays) * 100
      const widthPct = (ph.durDays / totalDays) * 100;
      (bar as HTMLElement).style.left = leftPct + '%';
      (bar as HTMLElement).style.width = widthPct + '%'
      const datesEl = bar.querySelector('.bar-dates')
      if (datesEl) {
        const jStart = job.start ? new Date(job.start) : new Date()
        jStart.setHours(0, 0, 0, 0)
        datesEl.textContent = fmtDateShort(addDays(jStart, ph.startDay)) + '–' + fmtDateShort(addDays(jStart, ph.startDay + ph.durDays))
      }
    }

    function showTooltip(e: MouseEvent, ph: GanttPhase) {
      if (!tooltip) return
      const jStart = job.start ? new Date(job.start) : new Date()
      jStart.setHours(0, 0, 0, 0)
      const barStart = addDays(jStart, ph.startDay)
      const barEnd   = addDays(jStart, ph.startDay + ph.durDays)
      const durText  = formatGanttDuration(ph.durDays, mode)
      // Debug: open browser DevTools console to verify bar ↔ tooltip parity
      console.debug('[Gantt tooltip]', `"${ph.label}"`, {
        mode,
        startDay: ph.startDay,
        durDays: ph.durDays,
        barStart: fmtDateShort(barStart),
        barEnd: fmtDateShort(barEnd),
        durText,
      })
      tooltip.innerHTML = `<strong>${esc(ph.label)}</strong><br>Start: ${fmtDate(barStart)}<br>End: ${fmtDate(barEnd)}<br>Duration: ${durText}`
      tooltip.style.display = 'block'
      tooltip.style.left = (e.clientX + 12) + 'px'
      tooltip.style.top = (e.clientY - 10) + 'px'
    }

    // ── Named container handlers (must be named to be removable) ─────────────
    function onContainerMouseDown(e: Event) {
      const me = e as MouseEvent
      const handle = (me.target as Element).closest('.gantt-resize-handle')
      const bar = (me.target as Element).closest('.gantt-bar')
      if (!handle && !bar) return
      me.preventDefault()
      const idx = parseInt(((handle || bar) as HTMLElement).dataset.idx || '0')
      const ph = state.phases[idx]
      const trackEl = handle ? (handle as Element).closest('.gantt-track') : (bar as Element).closest('.gantt-track')
      dragging = {
        type: handle ? 'resize' : 'move', idx, startX: me.clientX,
        origStart: ph.startDay, origDur: ph.durDays,
        trackW: trackEl!.getBoundingClientRect().width,
      }
      document.body.style.cursor = handle ? 'ew-resize' : 'grabbing'
    }

    function onContainerMouseOver(e: Event) {
      const bar = (e.target as Element).closest('.gantt-bar')
      if (!bar || dragging) return
      const idx = parseInt((bar as HTMLElement).dataset.idx || '0')
      showTooltip(e as MouseEvent, state.phases[idx])
    }

    function onContainerMouseOut(e: Event) {
      if ((e.target as Element).closest('.gantt-bar') && !dragging && tooltip) tooltip.style.display = 'none'
    }

    container.addEventListener('mousedown', onContainerMouseDown)
    container.addEventListener('mouseover', onContainerMouseOver)
    container.addEventListener('mouseout',  onContainerMouseOut)

    const onMove = (e: Event) => {
      const me = e as MouseEvent
      if (!dragging) return
      const dxPx = me.clientX - dragging.startX
      const dDays = Math.round(dxPx * (totalDays / dragging.trackW))
      const ph = state.phases[dragging.idx]
      if (dragging.type === 'move') {
        ph.startDay = clamp(dragging.origStart + dDays, 0, totalDays - ph.durDays)
      } else {
        ph.durDays = clamp(dragging.origDur + dDays, 1, totalDays - ph.startDay)
      }
      const bar = container.querySelector(`.gantt-bar[data-idx="${dragging.idx}"]`)
      if (bar) updateBar(bar, ph)
      showTooltip(me, ph)
    }

    const onUp = () => {
      if (!dragging) return
      dragging = null
      document.body.style.cursor = ''
      if (tooltip) tooltip.style.display = 'none'
      // Mark as dirty — user must click Save to persist
      stateRef.current = state
      setDirty(true)
      setSaveStatus('idle')
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)

    // Cleanup removes ALL listeners — container + document.
    // This is called at the start of every renderGantt so no stale handlers remain.
    return () => {
      container.removeEventListener('mousedown', onContainerMouseDown)
      container.removeEventListener('mouseover', onContainerMouseOver)
      container.removeEventListener('mouseout',  onContainerMouseOut)
      document.removeEventListener('mousemove',  onMove)
      document.removeEventListener('mouseup',    onUp)
    }
  }

  function attachLabelResize(container: HTMLDivElement, state: GanttState, mode: string): () => void {
    // Named so it can be removed — prevents mousedown accumulation across re-renders
    function onContainerMouseDown(e: Event) {
      const me = e as MouseEvent
      const divider = (me.target as Element).closest('.gantt-col-divider')
      if (!divider) return
      me.preventDefault()
      const startX = me.clientX
      const startW = parseInt(container.dataset.labelW || '220') || 220
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      function onMove(ev: MouseEvent) {
        const newW = Math.max(80, Math.min(400, startW + (ev.clientX - startX)))
        container.dataset.labelW = String(newW)
        container.querySelectorAll<HTMLElement>('.gantt-label-cell').forEach(el => { el.style.width = newW + 'px' })
        container.querySelectorAll<HTMLElement>('[data-hdr-offset]').forEach(el => { el.style.marginLeft = (newW + 9) + 'px' })
      }
      function onUp() {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        renderGantt(stateRef.current || state, mode as 'day' | 'week' | 'month')
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    }

    container.addEventListener('mousedown', onContainerMouseDown)
    return () => { container.removeEventListener('mousedown', onContainerMouseDown) }
  }

  // Expose view/reset to inline onclick handlers
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__ganttView = (mode: 'day' | 'week' | 'month') => setViewMode(mode);
    (window as unknown as Record<string, unknown>).__ganttReset = async () => {
      if (!confirm('Reset Gantt to default layout? This will clear your custom dates.')) return
      // Build a fresh default state — same as first-time creation:
      // all phases start at day 0, duration 2 days.
      const totalDays = (job.weeks || 12) * 7
      const rawLabels = phases.length
        ? phases.map(p => p.phase)
        : ['Preliminaries','Demolition & Enabling','Foundations','Structure','Roof',
           'External Doors & Windows','First Fix','Insulation','Plastering','Second Fix','External Works']
      const freshState: GanttState = {
        phases: [...new Set(rawLabels)].map(label => ({
          label,
          startDay: 0,
          durDays: 2,
        })),
        totalDays,
      }
      stateRef.current = freshState
      // Reset immediately saves and clears the dirty flag
      setSaveStatus('saving')
      setDirty(false)
      const ok = await saveGanttState(job.id, freshState)
      setSaveStatus(ok ? 'saved' : 'error')
      if (ok) setTimeout(() => setSaveStatus('idle'), 3000)
      else setTimeout(() => setSaveStatus('idle'), 5000)
      renderGantt(freshState, viewMode)
    }
    return () => {
      delete (window as unknown as Record<string, unknown>).__ganttView
      delete (window as unknown as Record<string, unknown>).__ganttReset
    }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save button label / colour helpers ──────────────────────
  function saveBtnLabel() {
    if (saveStatus === 'saving') return 'Saving…'
    if (saveStatus === 'saved')  return '✓ Saved'
    if (saveStatus === 'error')  return '⚠ Save failed'
    return 'Save Gantt Chart'
  }
  function saveBtnStyle(): React.CSSProperties {
    const base: React.CSSProperties = {
      border: 'none', borderRadius: 5, padding: '7px 18px',
      fontSize: 12, fontWeight: 700, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'background 0.2s, opacity 0.2s',
    }
    if (saveStatus === 'saving')       return { ...base, background: '#888', color: '#fff', cursor: 'default' }
    if (saveStatus === 'saved')        return { ...base, background: '#7ab533', color: '#fff', cursor: 'default' }
    if (saveStatus === 'error')        return { ...base, background: '#c0392b', color: '#fff' }
    if (dirty)                         return { ...base, background: 'var(--moss)', color: '#fff' }
    return { ...base, background: '#e0e3e0', color: '#888', cursor: 'default' }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--cream)', borderRadius: 8, width: 'min(980px,96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
        <div className="form-modal-hd">
          <div>
            <div className="serif" style={{ fontSize: 20 }}>{job.type} — {job.address}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{job.client}</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {/* Gantt chart */}
          <div style={{ marginBottom: 24 }}>
            {/* Section header + save controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>Project Gantt Chart</span>
                <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400, marginLeft: 10 }}>
                  Drag bars to move · drag right edge to resize · drag divider to widen labels
                </span>
              </div>

              {/* Unsaved-changes pill */}
              {dirty && saveStatus === 'idle' && (
                <span style={{
                  fontSize: 11, fontWeight: 600, color: '#e67e22',
                  background: '#fff8ee', border: '1px solid #f5c77a',
                  borderRadius: 20, padding: '3px 10px',
                  display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
                }}>
                  ● Unsaved changes
                </span>
              )}

              {/* Save button */}
              <button
                onClick={() => handleSave()}
                disabled={!dirty || saveStatus === 'saving' || saveStatus === 'saved'}
                style={saveBtnStyle()}
              >
                {saveBtnLabel()}
              </button>
            </div>

            {/* Save-error detail */}
            {saveStatus === 'error' && (
              <div style={{ marginBottom: 8, padding: '7px 12px', background: '#fff0ef', border: '1px solid #f5a0a0', borderRadius: 6, fontSize: 12, color: '#c0392b' }}>
                ⚠ The Gantt chart could not be saved. Check your internet connection, then try again. If the problem persists, open the browser console for details.
              </div>
            )}

            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', minHeight: 200 }}>
              <div ref={containerRef} style={{ padding: '20px 16px 12px' }} />
            </div>
          </div>

          {/* Linked quotes */}
          <div>
            <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 10 }}>Linked Quotes</div>
            {linkedQuotes.length === 0
              ? <div style={{ fontSize: 12, color: 'var(--muted)', padding: '12px 0' }}>No quotes linked to this job yet.</div>
              : linkedQuotes.map(q => (
                  <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--muted)', minWidth: 70 }}>{q.ref || '—'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500 }}>{q.jobType}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{q.savedDate}</div>
                    </div>
                    <div className="serif" style={{ fontSize: 17 }}>{fmt(quoteTotal(q))}</div>
                    <span className={`badge ${Q_BADGE[q.status] || 'b-pending'}`}>{Q_LABEL[q.status] || q.status}</span>
                    <button className="btn-sm btn-gold" onClick={() => {
                      onClose()
                      router.push('/quotes')
                    }}>✉ Email</button>
                  </div>
                ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}
