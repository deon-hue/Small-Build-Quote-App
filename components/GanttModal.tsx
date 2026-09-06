'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Job, QuotePhase, GanttState, GanttPhase } from '@/lib/types'
import type { Quote } from '@/lib/types'
import { fmt, quoteTotal, Q_BADGE, Q_LABEL } from '@/lib/utils'
import { formatGanttDuration, buildGanttFromQuote, stripPhasePrefix } from '@/lib/gantt-utils'
import { notifyClient } from '@/lib/notify'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'

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
  const { getGanttState, saveGanttState, updateJob, clients, settings } = useApp()
  const containerRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<GanttState | null>(null)
  // Stores the cleanup fn for the current drag event listeners so we
  // can remove them before each re-render and on unmount.
  const cleanupDragRef = useRef<(() => void) | null>(null)
  const extraWeeksRef = useRef(0)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [fullscreen, setFullscreen] = useState(false)
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown } = useDraggableModal()
  // dirty = true means the chart has been dragged since the last save
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const router = useRouter()

  // ── Row editing / BO picker state ────────────────────────────
  interface EditingRow { id: string; label: string; startDay: number; durDays: number }
  const [editingRow, setEditingRow] = useState<EditingRow | null>(null)
  const [showBoPanel, setShowBoPanel] = useState(false)
  const [boPhaseList, setBoPhaseList] = useState<Array<{ phaseName: string; subPhaseName: string }>>([])
  const [boPanelLoading, setBoPanelLoading] = useState(false)
  const [boSearch, setBoSearch] = useState('')

  function buildState(): GanttState {
    // Use any previously saved layout — never silently discard a custom arrangement.
    const saved = getGanttState(job.id)
    if (saved && saved.phases && saved.phases.length > 0) return saved

    // No saved state → build hierarchical Gantt from quote phases if available.
    if (phases.length) {
      return buildGanttFromQuote(phases, job.weeks || 12)
    }

    // Fallback for jobs with no linked quote phases — flat generic list.
    const totalDays = (job.weeks || 12) * 7
    const ganttPhases: GanttPhase[] = [
      'Preliminaries','Demolition & Enabling','Foundations','Structure','Roof',
      'External Doors & Windows','First Fix','Insulation','Plastering','Second Fix','External Works',
    ].map(label => ({ label, startDay: 0, durDays: 2 }))
    return { phases: ganttPhases, totalDays }
  }

  // ── Save handler — silent=true skips the client notification ──
  const handleSave = useCallback(async (overrideState?: GanttState, silent = false) => {
    const s = overrideState ?? stateRef.current
    if (!s) return
    setSaveStatus('saving')
    const ok = await saveGanttState(job.id, s)
    if (ok) {
      stateRef.current = s
      setDirty(false)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)

      // Persist expanded weeks to the job so the chart keeps its size after reload
      if (s.phases.length) {
        const maxEndDay = Math.max(...s.phases.map(p => p.startDay + p.durDays))
        const neededWeeks = Math.ceil(maxEndDay / 7)
        if (neededWeeks > (job.weeks || 12)) {
          updateJob({ ...job, weeks: neededWeeks })
        }
      }

      if (!silent) {
        const client = clients.find(c =>
          c.name?.toLowerCase() === job.client?.toLowerCase()
        )
        if (client?.phone || client?.email) {
          notifyClient({
            type:         'schedule_updated',
            clientName:   client.name || job.client,
            clientPhone:  client.phone || undefined,
            clientEmail:  client.email || undefined,
            jobType:      job.type,
            jobAddress:   job.address,
            companyName:  settings?.name,
            companyPhone: settings?.phone,
            companyEmail: settings?.email,
            portalUrl:    typeof window !== 'undefined'
                            ? window.location.origin + '/portal'
                            : undefined,
          })
        }
      }
    } else {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 5000)
    }
  }, [job, clients, settings, saveGanttState, updateJob])

  // ── Auto-save 1.5s after any edit ───────────────────────────
  useEffect(() => {
    if (!dirty) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave(undefined, true)
    }, 1500)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [dirty, handleSave])

  // Re-render the chart when job props or view mode changes.
  // Reset dirty/status when a different job is opened.
  useEffect(() => {
    extraWeeksRef.current = 0
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

  // Re-render chart when fullscreen changes so track widths recalculate
  useEffect(() => {
    if (!stateRef.current) return
    renderGantt(stateRef.current, viewMode)
  }, [fullscreen]) // eslint-disable-line react-hooks/exhaustive-deps

  function renderGantt(state: GanttState, mode: 'day' | 'week' | 'month') {
    const container = containerRef.current
    if (!container) return

    const totalWeeks = (job.weeks || 12) + extraWeeksRef.current
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

    // Build a lookup: id → collapsed, for ancestor visibility checks
    const collapsedById: Record<string, boolean> = {}
    state.phases.forEach(p => { if (p.id) collapsedById[p.id] = !!p.collapsed })

    function isRowVisible(ph: GanttPhase): boolean {
      if (!ph.parentId) return true
      if (collapsedById[ph.parentId]) return false
      const parent = state.phases.find(p => p.id === ph.parentId)
      return parent ? isRowVisible(parent) : true
    }

    const hasHierarchy = state.phases.some(p => p.level !== undefined)

    // Pre-compute parent phase IDs in order (for ↑↓ reorder buttons)
    const parentPhaseIds = state.phases.filter(p => p.level === 0 && p.id).map(p => p.id!)

    const phaseRowsHtml = state.phases.map((ph, i) => {
      const level = ph.level ?? 1  // legacy phases (no level field) render as level 1
      const visible = isRowVisible(ph)
      const displayStyle = visible ? 'flex' : 'none'

      // ── Level 0: group header ─────────────────────────────────
      if (level === 0) {
        const toggleIcon = ph.collapsed ? '▶' : '▼'
        const idAttr = ph.id ? `data-row-id="${esc(ph.id)}"` : ''
        const groupPos = ph.id ? parentPhaseIds.indexOf(ph.id) : -1
        const isFirst = groupPos === 0
        const isLast = groupPos === parentPhaseIds.length - 1
        const upBtn = ph.id
          ? `<span onclick="${!isFirst ? `window.__ganttMoveGroup('${esc(ph.id)}','up')` : ''}" title="Move up" style="cursor:${isFirst ? 'default' : 'pointer'};font-size:10px;opacity:${isFirst ? '0.15' : '0.5'};flex-shrink:0;user-select:none;line-height:1;padding:0 1px">↑</span>`
          : ''
        const dnBtn = ph.id
          ? `<span onclick="${!isLast ? `window.__ganttMoveGroup('${esc(ph.id)}','down')` : ''}" title="Move down" style="cursor:${isLast ? 'default' : 'pointer'};font-size:10px;opacity:${isLast ? '0.15' : '0.5'};flex-shrink:0;user-select:none;line-height:1;padding:0 1px">↓</span>`
          : ''
        return `<div class="gantt-row" ${idAttr} data-level="0" style="display:${displayStyle};align-items:center;height:${ROW_H}px;margin-bottom:2px;background:#e5e8ec;border-radius:3px">
          <div class="gantt-label-cell" style="width:${LABEL_W}px;flex-shrink:0;font-size:11px;font-weight:700;color:#1e2022;padding:0 6px 0 8px;display:flex;align-items:center;height:${ROW_H}px;gap:4px" title="${esc(ph.label)}">
            <span class="gantt-toggle" data-for="${esc(ph.id ?? '')}" onclick="window.__ganttToggle('${esc(ph.id ?? '')}')" style="cursor:pointer;font-size:9px;opacity:0.65;user-select:none;flex-shrink:0;line-height:1">${toggleIcon}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(stripPhasePrefix(ph.label))}</span>
            ${upBtn}${dnBtn}
            ${ph.id ? `<span onclick="window.__ganttEdit('${esc(ph.id)}')" title="Edit" style="cursor:pointer;font-size:11px;opacity:0.45;flex-shrink:0;user-select:none;padding:0 2px">✎</span>` : ''}
          </div>
          <div class="gantt-col-divider" style="width:5px;flex-shrink:0;align-self:stretch;cursor:col-resize;background:transparent;border-left:2px dashed #c8d0d8;margin-right:4px" title="Drag to resize label column"></div>
          <div class="gantt-track" style="flex:1;position:relative;height:${ROW_H - 8}px;background:#e5e8ec;border-radius:3px;overflow:hidden">
            ${trackWeekendHtml}
            <div style="position:absolute;left:${dayToPct(ph.startDay).toFixed(2)}%;width:${(dayToPct(ph.startDay + ph.durDays) - dayToPct(ph.startDay)).toFixed(2)}%;height:3px;top:50%;transform:translateY(-50%);background:#b8bec8;border-radius:2px;pointer-events:none"></div>
          </div>
        </div>`
      }

      // ── Level 1: phase bar / Level 2: task bar ────────────────
      const rowH = level === 2 ? 28 : ROW_H
      const leftPct = dayToPct(ph.startDay)
      const widthPct = dayToPct(ph.startDay + ph.durDays) - dayToPct(ph.startDay)
      const phEndDay = ph.startDay + ph.durDays
      const isDone = phEndDay <= doneWeeks * 7
      const isActive = ph.startDay < doneWeeks * 7 && phEndDay > doneWeeks * 7
      const barColor = level === 2
        ? (ph.isComplete || isDone ? '#5a9e2a' : isActive ? '#3a7a94' : '#a8c4d4')
        : (ph.isComplete || isDone ? '#7ab533' : isActive ? '#4a90a4' : '#c8d8e8')
      const textColor = (ph.isComplete || isDone || isActive) ? 'white' : '#2b2f33'
      const pct = ph.percentComplete ?? 0
      const startD = fmtDateShort(addDays(startDate, ph.startDay))
      const endD = fmtDateShort(addDays(startDate, phEndDay))
      const indentPx = level === 2 ? 28 : 18
      const hasChildren = level === 1 && state.phases.some(p => p.parentId === ph.id)
      const toggleIcon = ph.collapsed ? '▶' : '▼'
      const idAttr = ph.id ? `data-row-id="${esc(ph.id)}"` : ''
      const parentAttr = ph.parentId ? `data-parent-id="${esc(ph.parentId)}"` : ''

      const pctBg = ph.isComplete ? '#7ab533' : pct > 0 ? '#dbeafe' : '#eef0f2'
      const pctTxt = ph.isComplete ? '#fff' : pct > 0 ? '#1d4ed8' : '#9ba3ae'
      const showCtrl = !!ph.id
      return `<div class="gantt-row" ${idAttr} ${parentAttr} data-level="${level}" style="display:${displayStyle};align-items:center;height:${rowH}px;margin-bottom:3px">
        <div class="gantt-label-cell" style="width:${LABEL_W}px;flex-shrink:0;font-size:${level === 2 ? '10px' : '11px'};font-weight:${level === 2 ? '400' : '500'};color:#1e2022;padding:0 6px 0 ${indentPx}px;display:flex;align-items:center;gap:3px;height:${rowH}px" title="${esc(ph.label)}">
          ${hasChildren
            ? `<span class="gantt-toggle" data-for="${esc(ph.id ?? '')}" onclick="window.__ganttToggle('${esc(ph.id ?? '')}')" style="cursor:pointer;font-size:8px;opacity:0.55;user-select:none;flex-shrink:0;line-height:1">${toggleIcon}</span>`
            : (level === 1 ? '<span style="display:inline-block;width:10px;flex-shrink:0"></span>' : '')}
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">${esc(ph.label)}</span>
          ${showCtrl && level === 1 ? `<span onclick="window.__ganttAddChild('${esc(ph.id!)}')" title="Add task" style="font-size:12px;cursor:pointer;opacity:0.4;flex-shrink:0;user-select:none;padding:0 2px;line-height:1">+</span>` : ''}
          ${showCtrl ? `<span onclick="window.__ganttSetPct('${esc(ph.id!)}')" title="Set % complete" style="font-size:9px;cursor:pointer;background:${pctBg};color:${pctTxt};border-radius:3px;padding:1px 4px;flex-shrink:0;min-width:28px;text-align:center;user-select:none;font-weight:600">${pct}%</span><span onclick="window.__ganttCompleteToggle('${esc(ph.id!)}')" title="${ph.isComplete ? 'Mark incomplete' : 'Mark complete'}" style="font-size:13px;cursor:pointer;flex-shrink:0;color:${ph.isComplete ? '#7ab533' : '#c8d0d8'};user-select:none;line-height:1;padding:0 1px">${ph.isComplete ? '✓' : '○'}</span>` : ''}
          ${showCtrl ? `<span onclick="window.__ganttEdit('${esc(ph.id!)}')" title="Edit row" style="cursor:pointer;font-size:11px;opacity:0.4;flex-shrink:0;user-select:none;padding:0 2px">✎</span>` : ''}
        </div>
        <div class="gantt-col-divider" style="width:5px;flex-shrink:0;align-self:stretch;cursor:col-resize;background:transparent;border-left:2px dashed #c8d0d8;margin-right:4px" title="Drag to resize label column"></div>
        <div class="gantt-track" style="flex:1;position:relative;height:${rowH - 6}px;background:#f0f2f4;border-radius:3px;cursor:default;overflow:hidden">
          ${trackWeekendHtml}
          <div class="gantt-bar" data-idx="${i}" style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;background:${barColor};border-radius:3px;cursor:grab;user-select:none;display:flex;align-items:center;justify-content:space-between;padding:0 4px;box-shadow:0 1px 3px rgba(0,0,0,0.15);min-width:6px;z-index:1;overflow:hidden">
            ${pct > 0 && !ph.isComplete ? `<div style="position:absolute;left:0;top:0;height:100%;width:${pct}%;background:rgba(0,0,0,0.13);pointer-events:none;z-index:0"></div>` : ''}
            <span style="font-size:${level === 2 ? '8px' : '9px'};color:${textColor};white-space:nowrap;overflow:hidden;flex:1;position:relative;z-index:1">${ph.isComplete || isDone ? '✓ ' : isActive ? '▶ ' : ''}<span class="bar-dates" style="opacity:0.85">${startD}–${endD}</span>${pct > 0 && !ph.isComplete ? `<span style="opacity:0.9;margin-left:3px">${pct}%</span>` : ''}</span>
            <div class="gantt-resize-handle" data-idx="${i}" style="width:8px;height:100%;cursor:ew-resize;flex-shrink:0;display:flex;align-items:center;justify-content:center;opacity:0.6;position:relative;z-index:1"><div style="width:3px;height:60%;background:${textColor};border-radius:2px"></div></div>
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
          ${hasHierarchy ? `<button onclick="window.__ganttExpandAll()" style="font-size:10px;background:transparent;border:1px solid #dde1e5;border-radius:3px;padding:2px 8px;cursor:pointer;color:#6b7580" title="Expand all groups">▼ All</button><button onclick="window.__ganttCollapseAll()" style="font-size:10px;background:transparent;border:1px solid #dde1e5;border-radius:3px;padding:2px 8px;cursor:pointer;color:#6b7580" title="Collapse all groups">▶ All</button>` : ''}
          ${hasHierarchy && parentPhaseIds.length > 1 ? `<button onclick="window.__ganttSortByDate()" style="font-size:10px;background:transparent;border:1px solid #dde1e5;border-radius:3px;padding:2px 8px;cursor:pointer;color:#6b7580" title="Sort phases into date order">↕ Sort by date</button>` : ''}
          <button onclick="window.__ganttReset()" style="font-size:10px;background:transparent;border:1px solid #dde1e5;border-radius:3px;padding:2px 8px;cursor:pointer;color:#6b7580">Reset to default</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <div style="min-width:${innerMinW}px">
          <div data-hdr-offset="1" style="display:flex;margin-left:${LABEL_W + 9}px;margin-bottom:0">${monthRowHtml}</div>
          <div data-hdr-offset="1" style="display:flex;margin-left:${LABEL_W + 9}px;margin-bottom:6px">${weekRowHtml}</div>
          <div style="position:relative;margin-top:20px"><div style="position:absolute;left:${LABEL_W + 9}px;right:0;top:0;bottom:0;pointer-events:none">${msHtml}${todayHtml}</div>${phaseRowsHtml}</div>
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
      const pctInfo = ph.isComplete ? '<br>✓ Complete' : ph.percentComplete ? `<br>Progress: ${ph.percentComplete}%` : ''

      // Cost breakdown from linked quote phases
      const phLevel = ph.level ?? 1
      const markup = linkedQuotes[0]?.markup ?? 0
      let costHtml = ''
      if ((phLevel === 0 || phLevel === 1) && phases.length > 0) {
        const strippedLabel = stripPhasePrefix(ph.label)
        const matchingPhases = phLevel === 0
          ? phases.filter(qp => stripPhasePrefix(qp.parentPhase?.trim() || qp.phase.trim()) === strippedLabel)
          : phases.filter(qp => qp.phase === ph.label)

        if (matchingPhases.length > 0) {
          let labour = 0, materials = 0, plant = 0, sub = 0, other = 0
          for (const qp of matchingPhases) {
            const hasLabourTrades = (qp.labourTrades?.length ?? 0) > 0
            for (const item of qp.items) {
              const mkpMult = 1 + markup / 100
              materials += (Number(item.materials) || 0) * mkpMult
              plant     += (Number(item.plantHire) || 0) * mkpMult
              sub       += (Number(item.subcontractors) || 0) * mkpMult
              other     += (Number(item.other) || 0) * mkpMult
              const l    = Number(item.labour) || 0
              labour    += (item.itemType === 'labour' && hasLabourTrades) ? l : l * mkpMult
            }
            for (const pr of qp.products ?? []) {
              if (pr.enabled !== false) materials += pr.sellPrice * pr.qty
            }
            for (const pl of qp.plantItems ?? []) {
              if (pl.enabled !== false) plant += pl.sellPrice * pl.qty
            }
          }
          const total = labour + materials + plant + sub + other
          if (total > 0) {
            const parts: string[] = []
            if (labour > 0)    parts.push(`Labour: ${fmt(Math.round(labour))}`)
            if (materials > 0) parts.push(`Materials: ${fmt(Math.round(materials))}`)
            if (plant > 0)     parts.push(`Plant: ${fmt(Math.round(plant))}`)
            if (sub > 0)       parts.push(`Sub: ${fmt(Math.round(sub))}`)
            if (other > 0)     parts.push(`Other: ${fmt(Math.round(other))}`)
            const breakdownLine = parts.length > 1
              ? `<br><span style="opacity:0.7;font-size:10px">${parts.join(' · ')}</span>`
              : ''
            costHtml = `<br><span style="display:block;opacity:0.25;font-size:8px;padding:3px 0 1px">————————</span><span style="font-size:13px;font-weight:700">${fmt(Math.round(total))}</span><span style="opacity:0.65;font-size:10px"> excl. VAT</span>${breakdownLine}`
          }
        }
      }

      tooltip.innerHTML = `<strong>${esc(ph.label)}</strong><br>Start: ${fmtDate(barStart)}<br>End: ${fmtDate(barEnd)}<br>Duration: ${durText}${pctInfo}${costHtml}`
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
      const ph = state.phases[dragging.idx]
      dragging = null
      document.body.style.cursor = ''
      if (tooltip) tooltip.style.display = 'none'
      stateRef.current = state
      setDirty(true)
      setSaveStatus('idle')
      // Auto-expand chart if the task was pushed to the right boundary
      if (ph.startDay + ph.durDays >= totalDays - 1) {
        extraWeeksRef.current += 4
        renderGantt(state, mode)
      }
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

  // Expose view/reset/toggle to inline onclick handlers
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>
    win.__ganttView = (mode: 'day' | 'week' | 'month') => setViewMode(mode)

    win.__ganttReset = async () => {
      if (!confirm('Reset Gantt to default layout? This will clear your custom dates.')) return
      const freshState: GanttState = phases.length
        ? buildGanttFromQuote(phases, job.weeks || 12)
        : {
            totalDays: (job.weeks || 12) * 7,
            phases: ['Preliminaries','Demolition & Enabling','Foundations','Structure','Roof',
              'External Doors & Windows','First Fix','Insulation','Plastering','Second Fix','External Works',
            ].map(label => ({ label, startDay: 0, durDays: 2 })),
          }
      stateRef.current = freshState
      setSaveStatus('saving')
      setDirty(false)
      const ok = await saveGanttState(job.id, freshState)
      setSaveStatus(ok ? 'saved' : 'error')
      if (ok) setTimeout(() => setSaveStatus('idle'), 3000)
      else setTimeout(() => setSaveStatus('idle'), 5000)
      renderGantt(freshState, viewMode)
    }

    win.__ganttToggle = (id: string) => {
      const s = stateRef.current
      if (!s) return
      const ph = s.phases.find(p => p.id === id)
      if (!ph) return
      ph.collapsed = !ph.collapsed
      const container = containerRef.current
      if (!container) return
      // Update toggle icon
      container.querySelectorAll<HTMLElement>(`.gantt-toggle[data-for="${id}"]`).forEach(el => {
        el.textContent = ph.collapsed ? '▶' : '▼'
      })
      // Recalculate visibility for all non-root rows
      function isVisible(rowId: string): boolean {
        const el = container!.querySelector<HTMLElement>(`[data-row-id="${rowId}"]`)
        if (!el) return true
        const pId = el.dataset.parentId
        if (!pId) return true
        const parentPh = s!.phases.find(p => p.id === pId)
        if (!parentPh) return true
        if (parentPh.collapsed) return false
        return isVisible(pId)
      }
      s.phases.forEach(p => {
        if (!p.id || (p.level ?? 1) === 0) return
        const el = container!.querySelector<HTMLElement>(`[data-row-id="${p.id}"]`)
        if (el) el.style.display = isVisible(p.id) ? 'flex' : 'none'
      })
      setDirty(true)
    }

    win.__ganttExpandAll = () => {
      const s = stateRef.current
      if (!s) return
      const container = containerRef.current
      if (!container) return
      s.phases.forEach(p => {
        p.collapsed = false
        if (p.id) {
          container.querySelectorAll<HTMLElement>(`.gantt-toggle[data-for="${p.id}"]`).forEach(el => { el.textContent = '▼' })
        }
        if (p.id && (p.level ?? 1) > 0) {
          const el = container.querySelector<HTMLElement>(`[data-row-id="${p.id}"]`)
          if (el) el.style.display = 'flex'
        }
      })
      setDirty(true)
    }

    win.__ganttCollapseAll = () => {
      const s = stateRef.current
      if (!s) return
      const container = containerRef.current
      if (!container) return
      s.phases.forEach(p => {
        if ((p.level ?? 1) <= 1) {
          p.collapsed = true
          if (p.id) {
            container.querySelectorAll<HTMLElement>(`.gantt-toggle[data-for="${p.id}"]`).forEach(el => { el.textContent = '▶' })
          }
        }
        if (p.id && (p.level ?? 1) > 0) {
          const el = container.querySelector<HTMLElement>(`[data-row-id="${p.id}"]`)
          if (el) el.style.display = 'none'
        }
      })
      setDirty(true)
    }

    win.__ganttEdit = (id: string) => {
      const s = stateRef.current
      if (!s) return
      const ph = s.phases.find(p => p.id === id)
      if (!ph) return
      setEditingRow({ id, label: ph.label, startDay: ph.startDay, durDays: ph.durDays })
    }

    win.__ganttAddChild = (parentId: string) => {
      const s = stateRef.current
      if (!s) return
      const parentIdx = s.phases.findIndex(p => p.id === parentId)
      if (parentIdx < 0) return
      const parent = s.phases[parentIdx]
      const siblings = s.phases.filter(p => p.parentId === parentId)
      const lastSib = siblings[siblings.length - 1]
      const newStartDay = lastSib ? lastSib.startDay + lastSib.durDays : parent.startDay
      const newId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const newTask: GanttPhase = { id: newId, label: 'New Task', level: 2, parentId, startDay: newStartDay, durDays: 1 }
      // Insert after the last sibling, or right after the parent if no siblings
      const insertAfter = lastSib ? s.phases.indexOf(lastSib) : parentIdx
      s.phases.splice(insertAfter + 1, 0, newTask)
      stateRef.current = s
      setDirty(true)
      renderGantt(s, viewMode)
      setEditingRow({ id: newId, label: 'New Task', startDay: newStartDay, durDays: 1 })
    }

    win.__ganttCompleteToggle = (id: string) => {
      const s = stateRef.current
      if (!s) return
      const ph = s.phases.find(p => p.id === id)
      if (!ph) return
      ph.isComplete = !ph.isComplete
      if (ph.isComplete) ph.percentComplete = 100
      stateRef.current = s
      setDirty(true)
      renderGantt(s, viewMode)
    }

    win.__ganttMoveGroup = (id: string, dir: string) => {
      const s = stateRef.current
      if (!s) return

      const groupIdx = s.phases.findIndex(p => p.id === id)
      if (groupIdx < 0) return

      // Collect this level-0 row + all its descendants
      const slice: GanttPhase[] = [s.phases[groupIdx]]
      let i = groupIdx + 1
      while (i < s.phases.length && (s.phases[i].level ?? 1) !== 0) {
        slice.push(s.phases[i])
        i++
      }
      const sliceLen = slice.length

      // Remove the group from the array
      s.phases.splice(groupIdx, sliceLen)

      if (dir === 'up') {
        // Find the previous level-0 row
        let prevIdx = groupIdx - 1
        while (prevIdx >= 0 && (s.phases[prevIdx].level ?? 1) !== 0) prevIdx--
        if (prevIdx < 0) {
          // Already first — restore in place
          s.phases.splice(groupIdx, 0, ...slice)
          return
        }
        s.phases.splice(prevIdx, 0, ...slice)
      } else {
        // groupIdx now points to what was the next group
        if (groupIdx >= s.phases.length || (s.phases[groupIdx].level ?? 1) !== 0) {
          // Already last — restore in place
          s.phases.splice(s.phases.length, 0, ...slice)
          return
        }
        // Find the end of the next group
        let nextEnd = groupIdx + 1
        while (nextEnd < s.phases.length && (s.phases[nextEnd].level ?? 1) !== 0) nextEnd++
        s.phases.splice(nextEnd, 0, ...slice)
      }

      stateRef.current = s
      setDirty(true)
      renderGantt(s, viewMode)
    }

    win.__ganttSortByDate = () => {
      const s = stateRef.current
      if (!s) return

      // Split flat array into ordered groups
      type Group = { header: GanttPhase; children: GanttPhase[] }
      const groups: Group[] = []
      const orphans: GanttPhase[] = []
      let cur: Group | null = null

      for (const ph of s.phases) {
        if ((ph.level ?? 1) === 0) {
          cur = { header: ph, children: [] }
          groups.push(cur)
        } else if (cur) {
          cur.children.push(ph)
        } else {
          orphans.push(ph)
        }
      }

      groups.sort((a, b) => a.header.startDay - b.header.startDay)
      s.phases = [...orphans, ...groups.flatMap(g => [g.header, ...g.children])]

      stateRef.current = s
      setDirty(true)
      renderGantt(s, viewMode)
    }

    win.__ganttSetPct = (id: string) => {
      const s = stateRef.current
      if (!s) return
      const ph = s.phases.find(p => p.id === id)
      if (!ph) return
      const cur = ph.percentComplete ?? 0
      const raw = window.prompt('Set % complete (0–100):', String(cur))
      if (raw === null) return
      const parsed = parseInt(raw, 10)
      if (isNaN(parsed)) return
      const newPct = Math.max(0, Math.min(100, parsed))
      ph.percentComplete = newPct
      ph.isComplete = newPct === 100
      stateRef.current = s
      setDirty(true)
      renderGantt(s, viewMode)
    }

    return () => {
      delete win.__ganttView
      delete win.__ganttReset
      delete win.__ganttToggle
      delete win.__ganttExpandAll
      delete win.__ganttCollapseAll
      delete win.__ganttEdit
      delete win.__ganttAddChild
      delete win.__ganttCompleteToggle
      delete win.__ganttSetPct
      delete win.__ganttMoveGroup
      delete win.__ganttSortByDate
    }
  }) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save button label / colour helpers ──────────────────────
  function saveBtnLabel() {
    if (saveStatus === 'saving') return 'Saving…'
    if (saveStatus === 'saved')  return '✓ Saved'
    if (saveStatus === 'error')  return '⚠ Save failed'
    return 'Save & Notify Client'
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

  // ── Edit row helpers ─────────────────────────────────────────
  function applyEdit() {
    if (!editingRow) return
    const s = stateRef.current
    if (!s) return
    const ph = s.phases.find(p => p.id === editingRow.id)
    if (!ph) return
    ph.label    = editingRow.label.trim() || ph.label
    ph.startDay = editingRow.startDay
    ph.durDays  = Math.max(1, editingRow.durDays)
    // If this is a level-0 header, stretch it to cover its children
    if ((ph.level ?? 1) === 0) {
      const children = s.phases.filter(p => p.parentId === ph.id)
      if (children.length) {
        ph.startDay = Math.min(...children.map(c => c.startDay))
        ph.durDays  = Math.max(...children.map(c => c.startDay + c.durDays)) - ph.startDay
      }
    }
    stateRef.current = s
    setDirty(true)
    renderGantt(s, viewMode)
    setEditingRow(null)
  }

  function doSplit(phaseId: string) {
    const s = stateRef.current
    if (!s) return
    const idx = s.phases.findIndex(p => p.id === phaseId)
    if (idx < 0) return
    const ph = s.phases[idx]
    const dur1 = Math.max(1, Math.floor(ph.durDays / 2))
    const dur2 = Math.max(1, ph.durDays - dur1)
    const newId = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    ph.durDays = dur1
    const part2: GanttPhase = {
      id: newId,
      label: ph.label,
      startDay: ph.startDay + dur1,
      durDays: dur2,
      level: ph.level,
      parentId: ph.parentId,
    }
    s.phases.splice(idx + 1, 0, part2)
    stateRef.current = s
    setDirty(true)
    renderGantt(s, viewMode)
  }

  function splitEditRow() {
    if (!editingRow) return
    doSplit(editingRow.id)
    setEditingRow(null)
  }

  function deleteEditRow() {
    if (!editingRow) return
    const s = stateRef.current
    if (!s) return
    if (!confirm('Remove this row and any child tasks?')) return
    const toRemove = new Set<string>()
    const phases = s.phases
    function collect(id: string) {
      toRemove.add(id)
      phases.filter(p => p.parentId === id).forEach(c => collect(c.id!))
    }
    collect(editingRow.id)
    s.phases = s.phases.filter(p => !p.id || !toRemove.has(p.id))
    stateRef.current = s
    setDirty(true)
    renderGantt(s, viewMode)
    setEditingRow(null)
  }

  function addBlankPhase() {
    const s = stateRef.current
    if (!s) return
    const lastRow = [...s.phases].reverse().find(p => (p.level ?? 1) <= 1)
    const startDay = lastRow ? lastRow.startDay + lastRow.durDays : 0
    const groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const phaseId = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    s.phases.push({ id: groupId, label: 'New Phase', level: 0, startDay, durDays: 5 })
    s.phases.push({ id: phaseId, label: 'New Phase', level: 1, parentId: groupId, startDay, durDays: 5 })
    stateRef.current = s
    setDirty(true)
    renderGantt(s, viewMode)
    setEditingRow({ id: phaseId, label: 'New Phase', startDay, durDays: 5 })
  }

  async function openBoPanel() {
    setShowBoPanel(true)
    if (boPhaseList.length > 0) return
    setBoPanelLoading(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const [{ data: phases }, { data: subPhases }] = await Promise.all([
        sb.from('bo_phases').select('id, name').eq('user_id', user.id).eq('active', true),
        sb.from('bo_sub_phases').select('id, name, phase_id').eq('user_id', user.id).eq('active', true),
      ])
      const phaseById: Record<string, string> = Object.fromEntries((phases ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
      setBoPhaseList((subPhases ?? []).map((sp: { id: string; name: string; phase_id: string }) => ({
        phaseName: phaseById[sp.phase_id] || 'Other',
        subPhaseName: sp.name,
      })))
    } finally {
      setBoPanelLoading(false)
    }
  }

  function addBoPhase(phaseName: string, subPhaseName: string) {
    const s = stateRef.current
    if (!s) return
    const lastRow = [...s.phases].reverse().find(p => (p.level ?? 1) <= 1)
    const startDay = lastRow ? lastRow.startDay + lastRow.durDays : 0
    // Reuse an existing group header with the same name, or create one
    let groupId = s.phases.find(p => p.level === 0 && p.label === phaseName)?.id
    if (!groupId) {
      groupId = `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      s.phases.push({ id: groupId, label: phaseName, level: 0, startDay, durDays: 5 })
    }
    const phaseId = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    s.phases.push({ id: phaseId, label: subPhaseName, level: 1, parentId: groupId, startDay, durDays: 5 })
    // Stretch group header to cover new child
    const grp = s.phases.find(p => p.id === groupId)!
    const children = s.phases.filter(p => p.parentId === groupId)
    grp.startDay = Math.min(...children.map(c => c.startDay))
    grp.durDays  = Math.max(...children.map(c => c.startDay + c.durDays)) - grp.startDay
    stateRef.current = s
    setDirty(true)
    renderGantt(s, viewMode)
  }

  // Convert startDay ↔ date for the edit panel
  const jobStartDate = job.start ? new Date(job.start) : new Date()
  jobStartDate.setHours(0, 0, 0, 0)
  function startDayToDateStr(day: number): string {
    const d = new Date(jobStartDate); d.setDate(d.getDate() + day)
    return d.toISOString().slice(0, 10)
  }
  function dateStrToStartDay(str: string): number {
    const d = new Date(str); d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - jobStartDate.getTime()) / 86400000)
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={boxRef} style={fullscreen
        ? { background: 'var(--cream)', borderRadius: 0, width: '100vw', height: '100vh', maxHeight: '100vh', display: 'flex', flexDirection: 'column', boxShadow: 'none' }
        : { background: 'var(--cream)', borderRadius: 8, width: 'min(980px,96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', position: 'relative', ...draggableStyle }
      }>
        <div className="form-modal-hd" onMouseDown={fullscreen ? undefined : onHeaderMouseDown}>
          <div>
            <div className="serif" style={{ fontSize: 20 }}>{job.type} — {job.address}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{job.client}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setFullscreen(f => !f)}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
              style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: 'var(--ink)' }}
            >
              {fullscreen ? '⤡' : '⛶'}
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
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
                ⚠ The Gantt chart could not be saved. Check your internet connection, then try again.
              </div>
            )}

            {/* ── Edit row panel ── */}
            {editingRow && (
              <div style={{ marginBottom: 10, padding: '12px 14px', background: '#fff', border: '1px solid #c8d0d8', borderRadius: 6, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: 140 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>Name</div>
                  <input
                    value={editingRow.label}
                    onChange={e => setEditingRow(r => r ? { ...r, label: e.target.value } : r)}
                    onKeyDown={e => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') setEditingRow(null) }}
                    autoFocus
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #c8d0d8', borderRadius: 4, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>Start date</div>
                  <input
                    type="date"
                    value={startDayToDateStr(editingRow.startDay)}
                    onChange={e => setEditingRow(r => r ? { ...r, startDay: dateStrToStartDay(e.target.value) } : r)}
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #c8d0d8', borderRadius: 4, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 90 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 3 }}>Duration (days)</div>
                  <input
                    type="number" min={1}
                    value={editingRow.durDays}
                    onChange={e => setEditingRow(r => r ? { ...r, durDays: parseInt(e.target.value) || 1 } : r)}
                    style={{ width: '100%', fontSize: 12, padding: '5px 8px', border: '1px solid #c8d0d8', borderRadius: 4, fontFamily: 'inherit' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={applyEdit} style={{ fontSize: 12, padding: '6px 14px', background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>Apply</button>
                  <button onClick={() => setEditingRow(null)} style={{ fontSize: 12, padding: '6px 10px', background: '#e8eaec', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={splitEditRow} title="Split this task into two equal halves" style={{ fontSize: 12, padding: '6px 10px', background: '#eef4ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 4, cursor: 'pointer' }}>Split</button>
                  <button onClick={deleteEditRow} style={{ fontSize: 12, padding: '6px 10px', background: '#fce8e8', color: '#c0392b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Delete</button>
                </div>
              </div>
            )}

            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', minHeight: 200 }}>
              <div ref={containerRef} style={{ padding: '20px 16px 12px' }} />
            </div>

            {/* ── Add phase buttons ── */}
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={addBlankPhase} style={{ fontSize: 11, padding: '5px 12px', background: '#fff', border: '1px solid #c8d0d8', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>+ Add blank phase</button>
              <button onClick={openBoPanel} style={{ fontSize: 11, padding: '5px 12px', background: '#fff', border: '1px solid #c8d0d8', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>+ Add from Back Office</button>
            </div>

            {/* ── Back Office phase picker ── */}
            {showBoPanel && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: '#fff', border: '1px solid #c8d0d8', borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, flex: 1 }}>Back Office phases</span>
                  <input
                    placeholder="Search…"
                    value={boSearch}
                    onChange={e => setBoSearch(e.target.value)}
                    style={{ fontSize: 11, padding: '4px 8px', border: '1px solid #c8d0d8', borderRadius: 4, width: 160 }}
                  />
                  <button onClick={() => setShowBoPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, color: '#888' }}>×</button>
                </div>
                {boPanelLoading
                  ? <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>Loading…</div>
                  : boPhaseList.length === 0
                    ? <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0' }}>No Back Office phases found. Add them in the Back Office section first.</div>
                    : (() => {
                        const filtered = boSearch.trim()
                          ? boPhaseList.filter(p =>
                              p.phaseName.toLowerCase().includes(boSearch.toLowerCase()) ||
                              p.subPhaseName.toLowerCase().includes(boSearch.toLowerCase()))
                          : boPhaseList
                        const groups: Record<string, string[]> = {}
                        filtered.forEach(p => { (groups[p.phaseName] ||= []).push(p.subPhaseName) })
                        return Object.entries(groups).map(([grp, subs]) => (
                          <div key={grp} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{grp}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {subs.map(sub => (
                                <button key={sub} onClick={() => addBoPhase(grp, sub)}
                                  style={{ fontSize: 11, padding: '4px 10px', background: '#f0f4ff', border: '1px solid #c8d4f8', borderRadius: 4, cursor: 'pointer', fontWeight: 500 }}>
                                  + {sub}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))
                      })()
                }
              </div>
            )}
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
        {!fullscreen && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
      </div>
    </div>
  )
}

