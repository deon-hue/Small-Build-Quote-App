'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import NumInput from '@/components/NumInput'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/contexts/AppContext'
import { STAGE_COLOR, STAGE_LABEL, fmt, resolveJobColor, jobDisplayTitle, findLinkedQuote } from '@/lib/utils'
import { resolveGanttState, workingDaySpanInCalendarDays, countWorkingDays } from '@/lib/gantt-utils'
import type { Job, GanttPhase, GanttState } from '@/lib/types'
import { assignableContacts, assignmentsFor, assignmentKey, assigneesForRow, allAssignees, type AssigneeTag } from '@/lib/task-assignments'
import AssigneePicker, { picksFromKeys } from '@/components/AssigneePicker'
import { taskDays as buildTaskDays, bookedDays } from '@/lib/task-days'
import { createClient } from '@/lib/supabase/client'
import { fetchAllJobOrders, updateJobOrder, deliveryMarkers, poRef, expectedNet, ORDER_STATUS_LABEL, todayYmd, type JobOrder, type DeliveryMarker } from '@/lib/job-orders'

// ── Date helpers ───────────────────────────────────────────────
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function sameDay(a: Date, b: Date): boolean { return a.toDateString() === b.toDateString() }
function fmtShort(d: Date): string { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }
function fmtFull(d: Date): string { return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
function toISODate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function getMonday(d: Date): Date {
  const day = d.getDay()
  return addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate()), day === 0 ? -6 : 1 - day)
}
// ── Types ──────────────────────────────────────────────────────
interface CalEvent {
  id: string
  job: Job
  phaseLabel: string
  phaseIdx: number
  /** Stable id of the underlying GanttPhase — always set (resolveGanttState guarantees
   *  every row has one), so editing/dragging a task can find it again after a save
   *  regardless of how the phases list happens to be filtered or re-ordered. */
  phaseId?: string
  startDate: Date
  endDate: Date   // exclusive end (startDay + durDays)
  color: string
  isComplete: boolean
  percentComplete: number
  /** This task's own "allow Saturday working" override — see GanttPhase.allowSaturday. */
  allowSaturday: boolean
  /** Subcontractors / workers booked on this task or on its sub-tasks */
  assignees: AssigneeTag[]
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
// Deliveries and collections from each job's Orders (supabase/job-orders.sql), drawn as small chips on their day
const DELIVERY_STYLE = {
  delivery: { bg: '#e0f2fe', fg: '#075985', solid: '#0369a1', icon: '📦', word: 'Delivery' },
  collect:  { bg: '#ede9fe', fg: '#6d28d9', solid: '#6d28d9', icon: '↩', word: 'Collect' },
} as const
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MIN_ROWS = 3  // a week strip in month view is at least this many task rows tall; it grows to show every task
const DATE_H   = 26 // px – date-number strip height
const EVT_H    = 22 // px – one event bar height
const STRIP_PAD = 6  // px – breathing space under the last task row of a week

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
import './touch.css'

export default function CalendarPage() {
  const { jobs, quotes, ganttStates, saveGanttState, updateJob, loading, clients, taskAssignments, taskAssignmentsReady, setTaskAssignees } = useApp()
  const router = useRouter()

  const today = useMemo(() => new Date(new Date().setHours(0, 0, 0, 0)), [])
  const [view,            setView]           = useState<'month' | 'week' | 'day'>('day')
  const [anchor,          setAnchor]         = useState<Date>(() => today)
  const [selected,        setSelected]       = useState<CalEvent | null>(null)
  const [highlightJobId,  setHighlightJobId] = useState<string | null>(null)
  // Show only the tasks one person is booked on ('' = everyone)
  const [personFilter, setPersonFilter] = useState('')
  // Orders: skips, hire and deliveries show on the calendar on their day
  const [orders, setOrders] = useState<JobOrder[]>([])
  const [openDelivery, setOpenDelivery] = useState<DeliveryMarker | null>(null)
  const [deliveryBusy, setDeliveryBusy] = useState(false)
  async function reloadOrders() {
    try { const r = await fetchAllJobOrders(createClient()); setOrders(r.orders) } catch { /* the orders tables may not exist yet: no deliveries to show */ }
  }
  useEffect(() => {
    void reloadOrders()
    const onVis = () => { if (document.visibilityState === 'visible') void reloadOrders() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  // Task edit fields in the detail panel — reset whenever a different event is selected.
  const [editLabel, setEditLabel] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editDur,   setEditDur]   = useState(1)
  const [editPct,   setEditPct]   = useState(0)
  const [editAllowSaturday, setEditAllowSaturday] = useState(false)
  const [taskSaving, setTaskSaving] = useState(false)
  const [taskSaved,  setTaskSaved]  = useState(false)

  useEffect(() => {
    if (!selected) return
    setEditLabel(selected.phaseLabel)
    setEditStart(toISODate(selected.startDate))
    // Duration (working days) field, editable — pre-filled with the working-day count the
    // task's already-saved calendar-day span represents (not that raw span itself), so
    // re-saving without touching this field doesn't silently inflate the duration.
    setEditDur(Math.max(1, countWorkingDays(selected.startDate, selected.endDate, selected.allowSaturday)))
    setEditPct(selected.percentComplete)
    setEditAllowSaturday(selected.allowSaturday)
    setTaskSaved(false)
  }, [selected])

  // ── New task, created straight from the calendar (like adding an event in Outlook)
  // and assigned to a job — appends a task to that job's own Gantt state, so it's
  // immediately visible in the job's own Gantt chart too. ─────────────────────────
  const [showNewTask,   setShowNewTask]   = useState(false)
  const [newTaskJobId,  setNewTaskJobId]  = useState('')
  const [newTaskLabel,  setNewTaskLabel]  = useState('')
  const [newTaskStart,  setNewTaskStart]  = useState('')
  const [newTaskDur,    setNewTaskDur]    = useState(5)
  const [newTaskAllowSaturday, setNewTaskAllowSaturday] = useState(false)
  const [newTaskSaving, setNewTaskSaving] = useState(false)

  function openNewTask() {
    setNewTaskJobId('')
    setNewTaskLabel('')
    setNewTaskStart(toISODate(anchor))
    setNewTaskDur(5)
    setNewTaskAllowSaturday(false)
    setShowNewTask(true)
  }

  async function createTask() {
    const job = jobs.find(j => j.id === newTaskJobId)
    if (!job || !job.start || !newTaskLabel.trim()) return
    const jobStart = new Date(job.start); jobStart.setHours(0, 0, 0, 0)
    const chosen = new Date(newTaskStart); chosen.setHours(0, 0, 0, 0)
    const startDay = Math.max(0, daysBetween(jobStart, chosen))
    const durDays = workingDaySpanInCalendarDays(chosen, Math.max(1, newTaskDur), newTaskAllowSaturday)
    const gs = resolveGanttState(job, linkedQuotePhasesFor(job), ganttStates[job.id])
    const newPhase: GanttPhase = { id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: newTaskLabel.trim(), startDay, durDays, allowSaturday: newTaskAllowSaturday }
    const phases = [...gs.phases, newPhase]
    const maxEndDay = Math.max(...phases.map(p => p.startDay + p.durDays))
    setNewTaskSaving(true)
    const ok = await saveGanttState(job.id, { phases, totalDays: Math.max(gs.totalDays, maxEndDay) })
    setNewTaskSaving(false)
    if (ok) {
      const neededWeeks = Math.ceil(maxEndDay / 7)
      if (neededWeeks > (job.weeks || 12)) await updateJob({ ...job, weeks: neededWeeks })
      setShowNewTask(false)
    }
  }

  // ── Job number helper (JOB-001 based on creation order) ──────
  function getJobNum(jobId: string): string {
    const idx = jobs.findIndex(j => j.id === jobId)
    return idx >= 0 ? `JOB-${String(idx + 1).padStart(3, '0')}` : ''
  }

  // ── Event style helpers (highlight / dim) ────────────────────
  function barOpacity(jobId: string): number {
    if (!highlightJobId) return 1
    return jobId === highlightJobId ? 1 : 0.18
  }
  function barShadow(jobId: string, baseColor: string): string {
    if (!highlightJobId || jobId !== highlightJobId) return '0 1px 3px rgba(0,0,0,0.15)'
    return `0 0 0 2px white, 0 0 0 4px ${baseColor}, 0 2px 8px rgba(0,0,0,0.25)`
  }
  // Same job colour either way — a completed task gets a diagonal hatch layered over it
  // (a background-image, so it never dims the label text on top) instead of a different
  // colour, so it's obvious at a glance without losing which job it belongs to.
  // `fill` (0 to 1) is how much of THIS stretch of the bar is done: that part is drawn darker, so a task that is 80% finished reads as 80% filled.
  function barFill(color: string, isComplete: boolean, fill = 0): { backgroundColor: string; backgroundImage?: string } {
    const pct = Math.round(Math.max(0, Math.min(1, fill)) * 1000) / 10
    return {
      backgroundColor: color,
      backgroundImage: isComplete
        ? 'repeating-linear-gradient(135deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 5px, transparent 5px, transparent 10px)'
        : pct > 0 ? `linear-gradient(to right, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0.32) ${pct}%, transparent ${pct}%)` : undefined,
    }
  }

  /** How much of one stretch of a task's bar (a week's piece of it, in month and week views) is done, given the task's overall % complete. */
  function segFill(evt: CalEvent, segStart: Date, segDays: number): number {
    if (evt.isComplete || evt.percentComplete <= 0 || segDays <= 0) return 0
    const total = Math.max(1, daysBetween(evt.startDate, evt.endDate))
    const doneDays = total * evt.percentComplete / 100
    return Math.max(0, Math.min(1, (doneDays - daysBetween(evt.startDate, segStart)) / segDays))
  }
  const pctTag = (evt: CalEvent) => (!evt.isComplete && evt.percentComplete > 0 ? ` · ${evt.percentComplete}%` : '')

  /** The one-click "it's finished": saves 100% on its own (a finished task is marked complete) without typing the number. */
  async function markTaskDone(evt: CalEvent) {
    const ok = await saveTaskChange(evt, { percentComplete: 100 })
    if (ok) setSelected(null)
  }

  // Same "find the linked quote" matching logic GanttModal / the Jobs page use, so the
  // schedule Calendar resolves for a job is built from exactly the same phases.
  function linkedQuotePhasesFor(job: Job) {
    return findLinkedQuote(job, quotes)?.phases ?? []
  }

  // Moves/resizes one task and saves it back through the exact same saveGanttState the
  // Job's own Gantt chart uses — so opening that job's Gantt afterward shows the change,
  // and dragging it there afterward keeps starting from what got set here.
  async function saveTaskChange(evt: CalEvent, updates: { label?: string; startDay?: number; durDays?: number; percentComplete?: number; allowSaturday?: boolean }) {
    if (!evt.phaseId) return false
    const gs = resolveGanttState(evt.job, linkedQuotePhasesFor(evt.job), ganttStates[evt.job.id])
    const phases = gs.phases.map(p => {
      if (p.id !== evt.phaseId) return p
      const next: GanttPhase = {
        ...p,
        label:         updates.label !== undefined ? (updates.label.trim() || p.label) : p.label,
        startDay:      updates.startDay !== undefined ? Math.max(0, updates.startDay) : p.startDay,
        durDays:       updates.durDays !== undefined ? Math.max(1, updates.durDays) : p.durDays,
        allowSaturday: updates.allowSaturday !== undefined ? updates.allowSaturday : p.allowSaturday,
      }
      // Same "100% = complete" rule GanttModal's own % complete setter uses.
      if (updates.percentComplete !== undefined) {
        next.percentComplete = Math.max(0, Math.min(100, updates.percentComplete))
        next.isComplete = next.percentComplete === 100
      }
      return next
    })
    const maxEndDay = Math.max(...phases.map(p => p.startDay + p.durDays))
    const newState: GanttState = { phases, totalDays: Math.max(gs.totalDays, maxEndDay) }
    setTaskSaving(true)
    const ok = await saveGanttState(evt.job.id, newState)
    setTaskSaving(false)
    if (ok) {
      setTaskSaved(true)
      // Same "grow the job to fit" behaviour GanttModal applies after a drag.
      const neededWeeks = Math.ceil(maxEndDay / 7)
      if (neededWeeks > (evt.job.weeks || 12)) await updateJob({ ...evt.job, weeks: neededWeeks })
    }
    return ok
  }
  // The drag effect below registers its document mousemove/mouseup listeners once, at
  // mount, and never re-subscribes — so those handlers would otherwise keep calling the
  // very first render's saveTaskChange forever, which closes over that same first render's
  // ganttStates. Every drag after the first then recomputed its save from that stale,
  // out-of-date snapshot, silently discarding whatever the previous drag (or anything else)
  // had just saved — the reported "moving one task scatters the others" bug. Mirroring the
  // latest saveTaskChange into a ref (same stateRef.current pattern GanttModal already uses
  // for its own closures) and calling through the ref fixes it without having to tear down
  // and rebuild the listeners on every ganttStates change.
  const saveTaskChangeRef = useRef(saveTaskChange)
  saveTaskChangeRef.current = saveTaskChange

  // Splits a task into two adjacent halves — same operation as the Gantt chart's own
  // Split button (lib logic mirrored here, since GanttModal's lives in its own closure
  // with no exported version to call). Saves immediately and closes the panel, since the
  // original task's own duration has changed and a second one now exists alongside it.
  async function splitTask(evt: CalEvent) {
    if (!evt.phaseId) return
    const gs = resolveGanttState(evt.job, linkedQuotePhasesFor(evt.job), ganttStates[evt.job.id])
    const idx = gs.phases.findIndex(p => p.id === evt.phaseId)
    if (idx < 0) return
    const ph = gs.phases[idx]
    const dur1 = Math.max(1, Math.floor(ph.durDays / 2))
    const dur2 = Math.max(1, ph.durDays - dur1)
    const part2: GanttPhase = {
      id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: ph.label, startDay: ph.startDay + dur1, durDays: dur2,
      level: ph.level, parentId: ph.parentId, allowSaturday: ph.allowSaturday,
    }
    const phases = [...gs.phases]
    phases[idx] = { ...ph, durDays: dur1 }
    phases.splice(idx + 1, 0, part2)
    setTaskSaving(true)
    const ok = await saveGanttState(evt.job.id, { phases, totalDays: gs.totalDays })
    setTaskSaving(false)
    if (ok) setSelected(null)
    return ok
  }

  // Deletes a task (and any child tasks under it) — same operation as the Gantt chart's own
  // Delete button, saved through the same shared state so the job's Gantt chart and every
  // other Calendar view drop it at the same time. Refuses to remove a job's very last task:
  // resolveGanttState treats an empty saved state as "nothing saved" and would quietly
  // regenerate placeholder tasks in its place.
  async function deleteTask(evt: CalEvent) {
    if (!evt.phaseId) return
    const gs = resolveGanttState(evt.job, linkedQuotePhasesFor(evt.job), ganttStates[evt.job.id])
    const toRemove = new Set<string>()
    const collect = (id: string) => {
      toRemove.add(id)
      gs.phases.filter(p => p.parentId === id).forEach(c => { if (c.id) collect(c.id) })
    }
    collect(evt.phaseId)
    const remaining = gs.phases.filter(p => !p.id || !toRemove.has(p.id))
    if (remaining.length === 0) {
      alert("A job needs at least one task on its programme, so the last one can't be deleted.")
      return
    }
    const kids = toRemove.size - 1
    const what = kids > 0 ? `"${evt.phaseLabel}" and its ${kids} sub-task${kids === 1 ? '' : 's'}` : `"${evt.phaseLabel}"`
    if (!confirm(`Delete ${what}? This also removes it from the job's Gantt chart.`)) return
    setTaskSaving(true)
    const ok = await saveGanttState(evt.job.id, { phases: remaining, totalDays: gs.totalDays })
    setTaskSaving(false)
    if (ok) setSelected(null)
    else alert('Could not delete the task. Please try again.')
    return ok
  }

  // ── Drag / resize a task bar (desktop Month & Week view only — touch shows agenda
  // cards instead, so this code simply never runs there). Uses day-cell hit testing
  // (which strip/column the pointer is physically over) rather than raw pixel deltas,
  // so it stays correct across Month view's week-row wrapping. Saves through the same
  // saveTaskChange() the panel's Start/Duration fields use. ─────────────────────────
  interface DragInfo {
    event: CalEvent
    mode: 'move' | 'resize-start' | 'resize-end'
    origStartDay: number
    origDurDays: number
    jobStart: Date
    view: 'month' | 'week'
    numWeeks: number
    originGlobalDay: number
  }
  const dragRef = useRef<DragInfo | null>(null)
  const monthStripRefs = useRef<(HTMLDivElement | null)[]>([])
  const weekTrackRef = useRef<HTMLDivElement | null>(null)
  const [dragPreview, setDragPreview] = useState<{ eventId: string; startDate: Date; endDate: Date } | null>(null)
  const [isDragging,  setIsDragging]  = useState(false)
  // A real drag (the pointer actually crossed into a different day) must not also open
  // the detail panel — set true the moment a drag moves anything, checked and cleared by
  // each bar's onClick so a genuine click (mousedown+mouseup with no movement) still opens
  // it exactly as before.
  const suppressClickRef = useRef(false)

  // Global day index (relative to calStart for month, weekStart for week) the pointer
  // is currently over.
  function hitTestMonth(clientX: number, clientY: number, numWeeks: number): number {
    let wi = 0
    for (let i = 0; i < numWeeks; i++) {
      const el = monthStripRefs.current[i]
      if (!el) continue
      wi = i
      if (clientY < el.getBoundingClientRect().bottom) break
    }
    const el = monthStripRefs.current[wi]
    if (!el) return 0
    const r = el.getBoundingClientRect()
    const col = Math.min(6, Math.max(0, Math.floor(((clientX - r.left) / r.width) * 7)))
    return wi * 7 + col
  }
  function hitTestWeek(clientX: number): number {
    const el = weekTrackRef.current
    if (!el) return 0
    const r = el.getBoundingClientRect()
    return Math.min(6, Math.max(0, Math.floor(((clientX - r.left) / r.width) * 7)))
  }
  function computeDragDays(d: DragInfo, clientX: number, clientY: number): { startDay: number; durDays: number } {
    const globalDay = d.view === 'month' ? hitTestMonth(clientX, clientY, d.numWeeks) : hitTestWeek(clientX)
    const dayDelta = globalDay - d.originGlobalDay
    if (d.mode === 'move') return { startDay: Math.max(0, d.origStartDay + dayDelta), durDays: d.origDurDays }
    if (d.mode === 'resize-end') return { startDay: d.origStartDay, durDays: Math.max(1, d.origDurDays + dayDelta) }
    const end = d.origStartDay + d.origDurDays
    const startDay = Math.max(0, Math.min(end - 1, d.origStartDay + dayDelta))
    return { startDay, durDays: Math.max(1, end - startDay) }
  }
  function startDrag(e: React.MouseEvent, event: CalEvent, mode: DragInfo['mode'], view: 'month' | 'week', numWeeks: number) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const jobStart = new Date(event.job.start); jobStart.setHours(0, 0, 0, 0)
    const info: DragInfo = {
      event, mode, view, numWeeks, jobStart,
      origStartDay: daysBetween(jobStart, event.startDate),
      origDurDays:  daysBetween(event.startDate, event.endDate),
      originGlobalDay: view === 'month' ? hitTestMonth(e.clientX, e.clientY, numWeeks) : hitTestWeek(e.clientX),
    }
    dragRef.current = info
    setIsDragging(true)
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize'
  }
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      const { startDay, durDays } = computeDragDays(d, e.clientX, e.clientY)
      if (startDay !== d.origStartDay || durDays !== d.origDurDays) suppressClickRef.current = true
      setDragPreview({ eventId: d.event.id, startDate: addDays(d.jobStart, startDay), endDate: addDays(d.jobStart, startDay + durDays) })
    }
    async function onUp(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      dragRef.current = null
      setIsDragging(false)
      setDragPreview(null)
      document.body.style.cursor = ''
      const { startDay, durDays } = computeDragDays(d, e.clientX, e.clientY)
      if (startDay !== d.origStartDay || durDays !== d.origDurDays) await saveTaskChangeRef.current(d.event, { startDay, durDays })
      // Cleared after the click that would follow this mouseup has had a chance to run
      // and see it — not immediately, or a genuine drag's own click would slip through.
      setTimeout(() => { suppressClickRef.current = false }, 0)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Build calendar events from all jobs + Gantt states ───────
  const calEvents = useMemo((): CalEvent[] => {
    const events: CalEvent[] = []
    for (const job of jobs) {
      // A finished job has nothing left to schedule — leave it off the calendar rather
      // than have its old phases clutter every view indefinitely. Also naturally excludes
      // archived jobs, since only a completed job can be archived in the first place.
      if (!job.start || job.stage === 'complete') continue
      const jobStart = new Date(job.start)
      jobStart.setHours(0, 0, 0, 0)

      const color = resolveJobColor(job)

      // The exact same schedule GanttModal would show for this job — a saved layout if
      // one exists, otherwise the same quote-derived or generic placeholder it would
      // build. Editing a task here saves back through this, so the two are never showing
      // (or silently saving) two different placeholder schedules for the same job.
      const gs = resolveGanttState(job, linkedQuotePhasesFor(job), ganttStates[job.id])

      // Only show level-1 phase bars (skip level-0 group headers and level-2 task bars).
      // Level undefined = legacy flat phases with no hierarchy — show those too.
      const phases = gs.phases.filter(p => (p.level ?? 1) === 1)

      phases.forEach((ph, i) => {
        events.push({
          id: `${job.id}-${ph.id ?? i}`,
          // One consistent colour per job everywhere — a completed task is marked with
          // the ✓ shown wherever its label appears, not a different bar colour, so the
          // same job doesn't look like several different colours depending on which of
          // its tasks happen to be done.
          job, phaseLabel: ph.label, phaseIdx: i, phaseId: ph.id, color,
          isComplete: !!(ph as GanttPhase).isComplete,
          percentComplete: (ph as GanttPhase).percentComplete ?? 0,
          allowSaturday: !!(ph as GanttPhase).allowSaturday,
          assignees: assigneesForRow(taskAssignments, job.id, ph.id, gs.phases.filter(p => p.parentId && p.parentId === ph.id).map(p => p.id)),
          startDate: addDays(jobStart, ph.startDay),
          endDate:   addDays(jobStart, ph.startDay + ph.durDays),
        })
      })
    }
    const shown = personFilter ? events.filter(e => e.assignees.some(a => a.key === personFilter)) : events
    return shown.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  }, [jobs, quotes, ganttStates, taskAssignments, personFilter])

  // Month/Week view render from this instead of calEvents directly, so the bar being
  // dragged reflows live (including Month view's week-row wrapping and +N more overflow)
  // using the exact same layoutWeek() logic — no separate "ghost" element to keep in sync.
  const eventsForRender = useMemo(() => {
    if (!dragPreview) return calEvents
    return calEvents.map(e => e.id === dragPreview.eventId ? { ...e, startDate: dragPreview.startDate, endDate: dragPreview.endDate } : e)
  }, [calEvents, dragPreview])

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

  // ── Deliveries ───────────────────────────────────────────────
  // (hidden while the calendar is filtered to one person: a delivery is not anyone's task)
  const markers = useMemo(
    () => (personFilter ? [] : deliveryMarkers(orders).filter(m => jobs.some(j => j.id === m.order.jobId))),
    [orders, jobs, personFilter],
  )
  const markersOn = (d: Date) => markers.filter(m => m.date === toISODate(d))
  const markerJob = (m: DeliveryMarker) => jobs.find(j => j.id === m.order.jobId)
  const markerLabel = (m: DeliveryMarker) => `${DELIVERY_STYLE[m.kind].icon} ${m.kind === 'collect' ? 'Collect ' : ''}${m.order.title}`
  function markerTip(m: DeliveryMarker): string {
    const j = markerJob(m)
    return `${DELIVERY_STYLE[m.kind].word}: ${m.order.title}\n${m.order.supplierName} · ${poRef(m.order.poNumber)}${j ? ' · ' + j.client : ''}${m.done ? '\n✓ done' : ''}${m.tentative ? '\nnot sent to the supplier yet' : ''}`
  }

  /** The small coloured chips for one day: the first delivery in a month cell, up to three under a weekday heading, then "+N". */
  function renderChips(d: Date, mode: 'month' | 'week') {
    const list = markersOn(d)
    if (list.length === 0) return null
    const max = mode === 'month' ? 1 : 3
    return (
      <div style={{ display: 'flex', flexDirection: mode === 'week' ? 'column' : 'row', gap: 2, minWidth: 0, flex: 1, alignItems: mode === 'week' ? 'stretch' : 'center' }}>
        {list.slice(0, max).map(m => {
          const st = DELIVERY_STYLE[m.kind]
          return (
            <button
              key={m.id}
              onClick={e => { e.stopPropagation(); setOpenDelivery(m) }}
              title={markerTip(m)}
              style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'inherit', background: st.bg, color: st.fg, borderRadius: 3, padding: '1px 4px',
                border: m.tentative ? `1px dashed ${st.fg}` : '1px solid transparent', cursor: 'pointer', textAlign: 'left',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, maxWidth: '100%',
                opacity: m.done ? 0.55 : 1, textDecoration: m.done ? 'line-through' : 'none',
              }}
            >{markerLabel(m)}</button>
          )
        })}
        {list.length > max && (
          <span onClick={e => { e.stopPropagation(); setView('day'); setAnchor(new Date(d)) }} title={list.map(markerLabel).join('\n')} style={{ fontSize: 10, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 700 }}>+{list.length - max}</span>
        )}
      </div>
    )
  }

  // ── Month view ───────────────────────────────────────────────
  function renderMonth() {
    const year = anchor.getFullYear(), month = anchor.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)
    const offset   = (firstDay.getDay() + 6) % 7
    const calStart = addDays(firstDay, -offset)
    const numWeeks = Math.ceil((offset + lastDay.getDate()) / 7)

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
          const slots     = layoutWeek(eventsForRender, weekStart)
          // Every task is shown: the week grows taller to fit however many rows it needs (never hidden behind "+N more")
          const rowsNeeded = Math.max(MIN_ROWS, ...slots.map(s => s.row + 1))
          const stripH = DATE_H + rowsNeeded * EVT_H + STRIP_PAD

          return (
            <div
              key={wi}
              ref={el => { monthStripRefs.current[wi] = el }}
              style={{ position: 'relative', height: stripH, borderBottom: wi < numWeeks - 1 ? '1px solid var(--border)' : 'none' }}
            >
              {/* Weekend column shading — spans the whole strip (date row + bars), not just
                  the date-number row, so Sat/Sun read as non-working days at a glance even
                  where a bar is sitting on top of them. Drawn first/behind everything else. */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', pointerEvents: 'none', zIndex: 0 }}>
                {Array.from({ length: 7 }, (_, col) => (
                  <div key={col} style={{ flex: 1, background: col >= 5 ? 'var(--weekend-tint)' : 'transparent' }} />
                ))}
              </div>

              {/* Date numbers */}
              <div style={{ display: 'flex', height: DATE_H, position: 'relative' }}>
                {Array.from({ length: 7 }, (_, col) => {
                  const d         = addDays(weekStart, col)
                  const isToday   = sameDay(d, today)
                  const inMonth   = d.getMonth() === month
                  return (
                    <div key={col} style={{
                      flex: 1,
                      borderRight: col < 6 ? '1px solid var(--border)' : 'none',
                      padding: '3px 5px',
                      background: !inMonth ? 'rgba(244,245,243,0.85)' : 'transparent',
                      display: 'flex', alignItems: 'center', gap: 4, minWidth: 0,
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
                      {renderChips(d, 'month')}
                    </div>
                  )
                })}
              </div>

              {/* Event bars */}
              {slots.map(slot => (
                <div
                  key={slot.event.id}
                  onClick={() => { if (suppressClickRef.current) return; setSelected(slot.event) }}
                  onMouseDown={e => startDrag(e, slot.event, 'move', 'month', numWeeks)}
                  title={`${getJobNum(slot.event.job.id)} · ${slot.event.job.client} · ${jobDisplayTitle(slot.event.job)}\n${slot.event.isComplete ? '✓ Complete ' : ''}${slot.event.phaseLabel}\n${fmtShort(slot.event.startDate)} – ${fmtShort(addDays(slot.event.endDate, -1))}`}
                  style={{
                    position: 'absolute',
                    top: DATE_H + slot.row * EVT_H + 1,
                    left:  `calc(${(slot.startCol / 7) * 100}% + ${slot.startsHere ? 2 : 0}px)`,
                    width: `calc(${((slot.endCol - slot.startCol) / 7) * 100}% - ${(slot.startsHere ? 2 : 0) + (slot.endsHere ? 4 : 0)}px)`,
                    height: EVT_H - 3,
                    ...barFill(slot.event.color, slot.event.isComplete, segFill(slot.event, addDays(weekStart, slot.startCol), slot.endCol - slot.startCol)),
                    borderRadius: `${slot.startsHere ? 3 : 0}px ${slot.endsHere ? 3 : 0}px ${slot.endsHere ? 3 : 0}px ${slot.startsHere ? 3 : 0}px`,
                    cursor: isDragging ? 'grabbing' : 'grab', overflow: 'hidden',
                    zIndex: highlightJobId === slot.event.job.id ? 3 : 1,
                    opacity: barOpacity(slot.event.job.id),
                    boxShadow: barShadow(slot.event.job.id, slot.event.color),
                    display: 'flex', alignItems: 'center',
                    paddingLeft: slot.startsHere ? 5 : 2, paddingRight: 2,
                    transition: 'opacity 0.2s, box-shadow 0.2s',
                    userSelect: 'none',
                  }}
                >
                  {/* A continuation segment (this task started in an earlier week's row and
                      just carries on into this one) still gets a label — just the task name,
                      not the full "JOB-NNN · client · task" detail — so it never renders as a
                      bare, unlabelled colour bar. Matches how Week view already always shows
                      at least the task name regardless of where a bar starts. */}
                  <span style={{ fontSize: 10, color: 'white', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {slot.startsHere
                      ? <>{getJobNum(slot.event.job.id)} · {slot.event.job.client} · {slot.event.isComplete ? '✓ Complete ' : ''}{slot.event.phaseLabel}{pctTag(slot.event)}</>
                      : <>{slot.event.isComplete ? '✓ Complete ' : ''}{slot.event.phaseLabel}{pctTag(slot.event)}</>
                    }
                  </span>
                  {slot.startsHere && (
                    <div
                      onMouseDown={e => startDrag(e, slot.event, 'resize-start', 'month', numWeeks)}
                      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize' }}
                    />
                  )}
                  {slot.endsHere && (
                    <div
                      onMouseDown={e => startDrag(e, slot.event, 'resize-end', 'month', numWeeks)}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 6, cursor: 'ew-resize' }}
                    />
                  )}
                </div>
              ))}

            </div>
          )
        })}
      </div>
    )
  }

  // ── Week view ─────────────────────────────────────────────────
  function renderWeek() {
    const weekStart = getMonday(anchor)
    const slots  = layoutWeek(eventsForRender, weekStart)
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
                background: isWeekend ? 'var(--weekend-tint)' : 'white',
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
                {markersOn(d).length > 0 && <div style={{ marginTop: 4, padding: '0 3px' }}>{renderChips(d, 'week')}</div>}
              </div>
            )
          })}
        </div>

        {/* Timeline */}
        <div ref={weekTrackRef} style={{ position: 'relative', minHeight: minH, padding: '8px 0' }}>
          {/* Column stripe backgrounds */}
          <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', pointerEvents: 'none' }}>
            {Array.from({ length: 7 }, (_, col) => (
              <div key={col} style={{ borderRight: col < 6 ? '1px solid #f0f2ee' : 'none', background: col >= 5 ? 'var(--weekend-tint)' : 'transparent' }} />
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
                onClick={() => { if (suppressClickRef.current) return; setSelected(slot.event) }}
                onMouseDown={e => startDrag(e, slot.event, 'move', 'week', 1)}
                title={`${getJobNum(slot.event.job.id)} · ${slot.event.job.client} · ${slot.event.isComplete ? '✓ Complete ' : ''}${slot.event.phaseLabel}`}
                style={{
                  position: 'absolute',
                  top: 8 + slot.row * 40,
                  left:  `${(slot.startCol / 7) * 100}%`,
                  width: `${((slot.endCol - slot.startCol) / 7) * 100}%`,
                  height: 34,
                  ...barFill(slot.event.color, slot.event.isComplete, segFill(slot.event, addDays(weekStart, slot.startCol), slot.endCol - slot.startCol)),
                  borderRadius: `${slot.startsHere ? 4 : 0}px ${slot.endsHere ? 4 : 0}px ${slot.endsHere ? 4 : 0}px ${slot.startsHere ? 4 : 0}px`,
                  cursor: isDragging ? 'grabbing' : 'grab', overflow: 'hidden',
                  zIndex: highlightJobId === slot.event.job.id ? 3 : 1,
                  opacity: barOpacity(slot.event.job.id),
                  boxShadow: barShadow(slot.event.job.id, slot.event.color),
                  display: 'flex', alignItems: 'center',
                  paddingLeft: slot.startsHere ? 8 : 4, paddingRight: 4,
                  transition: 'opacity 0.2s, box-shadow 0.2s',
                  userSelect: 'none',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {slot.event.isComplete ? '✓ Complete ' : ''}{slot.event.phaseLabel}{pctTag(slot.event)}
                  </div>
                  {slot.startsHere && (
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {getJobNum(slot.event.job.id)} · {slot.event.job.client} · {jobDisplayTitle(slot.event.job)} · {Math.ceil(durDays / 7 * 10) / 10}w{slot.event.assignees.length ? ` · 👷 ${slot.event.assignees.map(a => a.name).join(', ')}` : ''}
                    </div>
                  )}
                </div>
                {slot.startsHere && (
                  <div
                    onMouseDown={e => startDrag(e, slot.event, 'resize-start', 'week', 1)}
                    style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }}
                  />
                )}
                {slot.endsHere && (
                  <div
                    onMouseDown={e => startDrag(e, slot.event, 'resize-end', 'week', 1)}
                    style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 8, cursor: 'ew-resize' }}
                  />
                )}
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
    const dayMarkers = markersOn(anchor)

    if (dayEvents.length === 0 && dayMarkers.length === 0) {
      return (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          No phases scheduled for {fmtFull(anchor)}
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {dayMarkers.map(m => {
          const st = DELIVERY_STYLE[m.kind]
          const j = markerJob(m)
          return (
            <div
              key={m.id}
              onClick={() => setOpenDelivery(m)}
              className="card"
              style={{ padding: '12px 16px', cursor: 'pointer', background: st.bg, border: m.tentative ? `1px dashed ${st.fg}` : 'none', borderLeft: `4px solid ${st.fg}`, opacity: m.done ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div style={{ fontSize: 20 }}>{st.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: st.fg }}>{m.done ? '✓ ' : ''}{st.word}: {m.order.title}</div>
                <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>
                  {m.order.supplierName} · {poRef(m.order.poNumber)}{j ? ` · ${j.client} · ${jobDisplayTitle(j)}` : ''}{m.kind === 'delivery' && m.order.deliverySlot ? ` · ${m.order.deliverySlot}` : ''}
                </div>
                {m.order.siteAddress && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{m.order.siteAddress.split('\n')[0]}</div>}
              </div>
              {m.tentative && <span style={{ fontSize: 11, fontWeight: 600, color: st.fg }}>not sent yet</span>}
            </div>
          )
        })}
        {dayEvents.map(evt => {
          const durDays = daysBetween(evt.startDate, evt.endDate)
          const stageColor = STAGE_COLOR[evt.job.stage] || '#888'
          return (
            <div
              key={evt.id}
              onClick={() => setSelected(evt)}
              className="card cal-day-item"
              style={{
                padding: '14px 16px', cursor: 'pointer', background: evt.color, borderLeft: 'none', border: 'none',
                display: 'flex', alignItems: 'center', gap: 16,
                opacity: barOpacity(evt.job.id), transition: 'opacity 0.2s',
                '--job-color': evt.color,
              } as React.CSSProperties}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2 }}>
                  <span className="cal-day-code" style={{ fontSize: 10, fontWeight: 700, color: 'white', background: 'rgba(255,255,255,0.25)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                    {getJobNum(evt.job.id)}
                  </span>
                  <div className="cal-day-title" style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{evt.isComplete ? '✓ Complete ' : ''}{evt.phaseLabel}{pctTag(evt)}</div>
                </div>
                {!evt.isComplete && evt.percentComplete > 0 && (
                  <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.28)', overflow: 'hidden', marginTop: 5, maxWidth: 260 }}>
                    <div style={{ height: '100%', width: `${evt.percentComplete}%`, background: '#fff' }} />
                  </div>
                )}
                <div className="cal-day-sub" style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 2 }}>
                  {evt.job.client} · {jobDisplayTitle(evt.job)}
                </div>
                <div className="cal-day-sub" style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                  {evt.job.address}
                </div>
                {(() => {
                  // only the people who work on THIS day: someone booked for just Wed-Fri is not listed on Monday
                  const dayStart = evt.startDate
                  const all = buildTaskDays(dayStart, Math.max(1, daysBetween(evt.startDate, evt.endDate)), evt.allowSaturday)
                  const ownKeys = new Set(assignmentsFor(taskAssignments, evt.job.id, evt.phaseId).map(assignmentKey))
                  const working = evt.assignees.filter(a => {
                    if (!ownKeys.has(a.key)) return true   // booked on a sub-task of this phase: shown as before
                    const mine = assignmentsFor(taskAssignments, evt.job.id, evt.phaseId).find(x => assignmentKey(x) === a.key)
                    return bookedDays(all, mine?.dayOffsets).some(d => d.date.toDateString() === anchor.toDateString())
                  })
                  return working.length > 0 ? (
                    <div className="cal-day-sub" style={{ fontSize: 11.5, color: '#fff', marginTop: 3, fontWeight: 700 }}>👷 {working.map(a => a.name).join(', ')}</div>
                  ) : null
                })()}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div className="cal-day-title" style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{fmtShort(evt.startDate)} → {fmtShort(addDays(evt.endDate, -1))}</div>
                <div className="cal-day-sub" style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{Math.ceil(durDays / 7 * 10) / 10} weeks</div>
              </div>
              {!evt.isComplete && evt.phaseId && (
                <button
                  onClick={e => { e.stopPropagation(); void markTaskDone(evt) }}
                  title="Mark this task 100% done"
                  style={{ fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 10, border: 'none', background: '#fff', color: '#166534', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}
                >✓ 100%</button>
              )}
              <span className="cal-day-badge" style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.92)', color: '#1f2a24', flexShrink: 0 }}>
                {STAGE_LABEL[evt.job.stage] || evt.job.stage}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Delivery detail ──────────────────────────────────────────
  function renderDeliveryDetail() {
    if (!openDelivery) return null
    const m = openDelivery
    const o = m.order
    const st = DELIVERY_STYLE[m.kind]
    const j = markerJob(m)
    const canMarkDelivered = m.kind === 'delivery' && (o.status === 'ordered' || o.status === 'confirmed')
    const canMarkCollected = m.kind === 'collect' && o.status === 'delivered'
    async function mark(status: 'delivered' | 'collected') {
      setDeliveryBusy(true)
      try {
        await updateJobOrder(createClient(), o.id, status === 'delivered' ? { status } : { status, offHireDate: o.offHireDate || todayYmd() })
        await reloadOrders()
        setOpenDelivery(null)
      } finally { setDeliveryBusy(false) }
    }
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16, background: 'rgba(0,0,0,0.25)' }}
        onClick={e => { if (e.target === e.currentTarget) setOpenDelivery(null) }}
      >
        <div style={{ background: 'var(--cream)', borderRadius: 12, width: 'min(420px,100%)', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', animation: 'slideUp 0.2s ease' }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ fontSize: 22, lineHeight: 1 }}>{st.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{st.word}: {o.title}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{poRef(o.poNumber)} · {o.supplierName}</div>
            </div>
            <button onClick={() => setOpenDelivery(null)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <DetailRow label="When" value={new Date(m.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + (m.kind === 'delivery' && o.deliverySlot ? ', ' + o.deliverySlot : '')} />
            <DetailRow label="Status" value={ORDER_STATUS_LABEL[o.status] + (m.tentative ? ' (not sent to the supplier yet)' : '')} />
            {j && <DetailRow label="Job" value={`${getJobNum(j.id)} · ${j.client} · ${jobDisplayTitle(j)}`} />}
            {o.siteAddress && <DetailRow label="Where" value={o.siteAddress} />}
            {(o.siteContact || o.sitePhone) && <DetailRow label="Site contact" value={[o.siteContact, o.sitePhone].filter(Boolean).join(', ')} />}
            {o.accessNotes && <DetailRow label="Access" value={o.accessNotes} />}
            {o.supplierPhone && <DetailRow label="Supplier" value={o.supplierPhone} />}
            <DetailRow label="Cost" value={`${fmt(expectedNet(o))} ex VAT${o.rateBasis !== 'fixed' ? ` (${fmt(o.rate)} per ${o.rateBasis})` : ''}`} />
          </div>
          <div style={{ padding: '0 18px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canMarkDelivered && <button className="btn-sm btn-primary" disabled={deliveryBusy} onClick={() => mark('delivered')}>{deliveryBusy ? 'Saving…' : '✓ It has arrived'}</button>}
            {canMarkCollected && <button className="btn-sm btn-primary" disabled={deliveryBusy} onClick={() => mark('collected')}>{deliveryBusy ? 'Saving…' : '✓ It has been collected'}</button>}
            <button className="btn-sm btn-outline" onClick={() => router.push(`/jobs?orders=${encodeURIComponent(o.jobId)}`)}>Open this job&apos;s Orders</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Detail panel (click-through) ─────────────────────────────
  function renderDetail() {
    if (!selected) return null
    const evt       = selected
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{editLabel || evt.phaseLabel}</div>
                {evt.isComplete && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'white', background: '#5e8f20', borderRadius: 10, padding: '2px 8px' }}>✓ Complete</span>
                )}
                {!evt.isComplete && evt.percentComplete > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', borderRadius: 10, padding: '2px 8px' }}>{evt.percentComplete}% done</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Phase {evt.phaseIdx + 1}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1, padding: 0 }}>×</button>
          </div>

          {/* Details */}
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <DetailRow label="Job ref"    value={<span className="mono" style={{ fontWeight: 700 }}>{getJobNum(evt.job.id)}</span>} />
            <DetailRow label="Customer"   value={evt.job.client} />
            <DetailRow label="Job"        value={jobDisplayTitle(evt.job)} />
            <DetailRow label="Address"    value={evt.job.address} />
            {taskAssignmentsReady && evt.phaseId && (
              <DetailRow label="Booked" value={(() => {
                const phaseId = evt.phaseId as string
                const here = assignmentsFor(taskAssignments, evt.job.id, phaseId)
                const contacts = assignableContacts(clients)
                const extras = here.filter(a => !a.assigneeId).map(a => ({ key: assignmentKey(a), name: a.assigneeName }))
                const daysByKey: Record<string, number[] | null> = Object.fromEntries(here.map(a => [assignmentKey(a), a.dayOffsets]))
                const keys = here.map(assignmentKey)
                const save = (nextKeys: string[], nextDays: Record<string, number[] | null>) => {
                  void setTaskAssignees(evt.job.id, phaseId, picksFromKeys(nextKeys, contacts, extras, nextDays)).then(saved => { if (!saved) window.alert('Could not save who is booked on this task. If you have just updated the app, the one-off database updates (supabase/task-assignments-multi.sql and task-assignment-days.sql) may not have been run yet.') })
                }
                return (
                  <AssigneePicker
                    contacts={contacts}
                    extras={extras}
                    selected={keys}
                    onChange={nextKeys => save(nextKeys, daysByKey)}
                    taskDays={buildTaskDays(evt.startDate, Math.max(1, daysBetween(evt.startDate, evt.endDate)), evt.allowSaturday)}
                    daysByKey={daysByKey}
                    onDaysChange={(k, offs) => save(keys, { ...daysByKey, [k]: offs })}
                  />
                )
              })()} />
            )}
            {evt.assignees.some(a => !assignmentsFor(taskAssignments, evt.job.id, evt.phaseId).some(x => assignmentKey(x) === a.key)) && (
              <DetailRow label="Also booked" value={evt.assignees.filter(a => !assignmentsFor(taskAssignments, evt.job.id, evt.phaseId).some(x => assignmentKey(x) === a.key)).map(a => a.name).join(', ') + ' (on its sub-tasks)'} />
            )}
            <DetailRow label="Name" value={
              <input
                type="text"
                value={editLabel}
                onChange={e => { setEditLabel(e.target.value); setTaskSaved(false) }}
                style={{ font: 'inherit', fontWeight: 600, fontSize: 13, width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px' }}
              />
            } />
            <DetailRow label="Start" value={
              <input
                type="date"
                value={editStart}
                onChange={e => { setEditStart(e.target.value); setTaskSaved(false) }}
                style={{ font: 'inherit', fontWeight: 600, fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px' }}
              />
            } />
            <DetailRow label="Duration (working days)" value={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <NumInput
                  type="number"
                  min={1}
                  value={editDur}
                  onChange={e => { setEditDur(Math.max(1, Number(e.target.value) || 1)); setTaskSaved(false) }}
                  style={{ font: 'inherit', fontWeight: 600, fontSize: 13, width: 52, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px' }}
                />
                days
              </span>
            } />
            <DetailRow label="" value={
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editAllowSaturday}
                  onChange={e => { setEditAllowSaturday(e.target.checked); setTaskSaved(false) }}
                />
                Allow Saturday working (Sunday is never a working day)
              </label>
            } />
            <DetailRow label="% complete" value={
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <NumInput
                  type="number"
                  min={0}
                  max={100}
                  value={editPct}
                  onChange={e => { setEditPct(Math.max(0, Math.min(100, Number(e.target.value) || 0))); setTaskSaved(false) }}
                  style={{ font: 'inherit', fontWeight: 600, fontSize: 13, width: 52, border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px' }}
                />
                % {editPct === 100 ? '· marks it complete' : ''}
                {[25, 50, 75].map(p => (
                  <button key={p} type="button" onClick={() => { setEditPct(p); setTaskSaved(false) }}
                    style={{ fontSize: 11, fontWeight: 600, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: editPct === p ? 'var(--ink)' : '#fff', color: editPct === p ? '#fff' : 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}>{p}%</button>
                ))}
                <button type="button" disabled={taskSaving || !evt.phaseId || evt.isComplete} onClick={() => void markTaskDone(evt)}
                  title="Marks the task 100% done and saves straight away"
                  style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: 'none', background: evt.isComplete ? '#cbd5e1' : '#5e8f20', color: '#fff', cursor: evt.isComplete ? 'default' : 'pointer', fontFamily: 'inherit' }}>{evt.isComplete ? '✓ Done' : '✓ 100% done'}</button>
              </span>
            } />
            <DetailRow label="Job value"  value={fmt(evt.job.value)} />
            <DetailRow label="Status"     value={
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 10, background: stageColor + '22', color: stageColor }}>
                {STAGE_LABEL[evt.job.stage] || evt.job.stage}
              </span>
            } />
          </div>

          {/* Task edit — same save path the Job's own Gantt chart uses, so a change here
              shows up there and vice versa. Works the same on a phone or tablet (there's
              no drag/resize here, just these fields) as it does on desktop. */}
          <div style={{ padding: '0 18px 12px' }}>
            <button
              className="btn btn-primary"
              disabled={taskSaving || !evt.phaseId}
              style={{ width: '100%', fontSize: 13 }}
              onClick={async () => {
                const newStartDate = new Date(editStart); newStartDate.setHours(0, 0, 0, 0)
                const jobStart = new Date(evt.job.start); jobStart.setHours(0, 0, 0, 0)
                const durDays = workingDaySpanInCalendarDays(newStartDate, editDur, editAllowSaturday)
                await saveTaskChange(evt, {
                  label: editLabel, startDay: daysBetween(jobStart, newStartDate), durDays,
                  percentComplete: editPct, allowSaturday: editAllowSaturday,
                })
              }}
            >
              {taskSaving ? 'Saving…' : taskSaved ? '✓ Saved' : 'Save changes'}
            </button>
            <button
              className="btn-sm btn-outline"
              disabled={taskSaving || !evt.phaseId}
              style={{ width: '100%', fontSize: 13, marginTop: 8 }}
              title="Splits this task into two equal halves, right next to each other — drag the second one out if there's a gap before it resumes"
              onClick={() => splitTask(evt)}
            >
              ✂ Split task
            </button>
            <button
              className="btn-sm btn-outline"
              disabled={taskSaving || !evt.phaseId}
              style={{ width: '100%', fontSize: 13, marginTop: 8, color: '#c0392b', borderColor: '#f1b8b8' }}
              title="Removes this task from the Calendar and from the job's Gantt chart"
              onClick={() => deleteTask(evt)}
            >
              🗑 Delete task
            </button>
          </div>

          {/* Actions */}
          <div style={{ padding: '10px 18px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 13 }}
              onClick={() => { router.push(`/jobs?open=${evt.job.id}`); setSelected(null) }}
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

  // ── New task modal — pick a job, name it, give it a start date and duration; saves
  // straight into that job's Gantt state, same as everything else here. ────────────
  function renderNewTaskModal() {
    if (!showNewTask) return null
    const eligibleJobs = jobs
      .filter(j => j.start && !j.archived && j.stage !== 'complete')
      .sort((a, b) => (a.client || '').localeCompare(b.client || ''))
    return (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16, background: 'rgba(0,0,0,0.25)' }}
        onClick={e => { if (e.target === e.currentTarget) setShowNewTask(false) }}
      >
        <div style={{ background: 'var(--cream)', borderRadius: 12, width: 'min(420px,100%)', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', animation: 'slideUp 0.2s ease' }}>
          <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>+ New task</div>
            <button onClick={() => setShowNewTask(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {eligibleJobs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>No on-site jobs with a start date to add a task to yet.</div>
            ) : (
              <>
                <div className="fg" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Job</label>
                  <select value={newTaskJobId} onChange={e => setNewTaskJobId(e.target.value)} style={{ width: '100%' }}>
                    <option value="">Select a job…</option>
                    {eligibleJobs.map(j => (
                      <option key={j.id} value={j.id}>{getJobNum(j.id)} · {j.client} · {jobDisplayTitle(j)}</option>
                    ))}
                  </select>
                </div>
                <div className="fg" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Task name</label>
                  <input
                    value={newTaskLabel}
                    onChange={e => setNewTaskLabel(e.target.value)}
                    placeholder="e.g. Second fix electrics"
                    style={{ width: '100%' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="fg" style={{ margin: 0, flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Start date</label>
                    <input type="date" value={newTaskStart} onChange={e => setNewTaskStart(e.target.value)} style={{ width: '100%' }} />
                  </div>
                  <div className="fg" style={{ margin: 0, width: 90 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Working days</label>
                    <NumInput type="number" min={1} value={newTaskDur} onChange={e => setNewTaskDur(Math.max(1, Number(e.target.value) || 1))} style={{ width: '100%' }} />
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  <input type="checkbox" checked={newTaskAllowSaturday} onChange={e => setNewTaskAllowSaturday(e.target.checked)} />
                  Allow Saturday working (Sunday is never a working day)
                </label>
              </>
            )}
          </div>
          <div style={{ padding: '10px 18px 16px', display: 'flex', gap: 8, borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1, fontSize: 13 }}
              disabled={newTaskSaving || !newTaskJobId || !newTaskLabel.trim() || !newTaskStart}
              onClick={createTask}
            >
              {newTaskSaving ? 'Creating…' : 'Create task'}
            </button>
            <button className="btn-sm btn-outline" style={{ fontSize: 13, padding: '8px 14px' }} onClick={() => setShowNewTask(false)}>Cancel</button>
          </div>
        </div>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const jobsOnCalendar = jobs.filter(j => j.start && j.stage !== 'complete').length
  const jobsNoStart    = jobs.filter(j => !j.start && j.stage !== 'complete')
  const activeCount    = jobs.filter(j => j.stage === 'active').length
  const firstEvent     = calEvents[0] ?? null
  const lastEvent      = calEvents[calEvents.length - 1] ?? null

  // Determine if the current view has any events
  const viewStart = view === 'month'
    ? new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    : view === 'week'
    ? getMonday(anchor)
    : new Date(anchor)
  const viewEnd = view === 'month'
    ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1)
    : view === 'week'
    ? addDays(getMonday(anchor), 7)
    : addDays(anchor, 1)
  const eventsInView = calEvents.filter(e => e.startDate < viewEnd && e.endDate > viewStart)
  const viewMarkers = markers.filter(m => m.date >= toISODate(viewStart) && m.date < toISODate(viewEnd))

  function jumpToFirst() {
    if (!firstEvent) return
    const d = firstEvent.startDate
    if (view === 'month') setAnchor(new Date(d.getFullYear(), d.getMonth(), 1))
    else if (view === 'week') setAnchor(getMonday(d))
    else setAnchor(new Date(d))
  }

  const agendaEvents = [...eventsInView].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.phaseIdx - b.phaseIdx)

  return (
    <div className="cal-page">
      {/* Touch header (phone/tablet only) */}
      <div className="tp-head">
        <div>
          <div className="tp-kicker">Schedule</div>
          <h1 className="tp-title">Calendar</h1>
        </div>
        <div className="tp-head-btns">
          <button className="tp-btn tp-btn-light" onClick={goToday}>Today</button>
          <button className="tp-btn" onClick={openNewTask}>+ New task</button>
        </div>
      </div>
      {jobsOnCalendar > 0 && (
        <div className="tp-stats">
          <div className="tp-stat"><span>Jobs on calendar</span><b>{jobsOnCalendar}</b></div>
          <div className="tp-stat"><span>Active jobs</span><b>{activeCount}</b></div>
          <div className="tp-stat"><span>Total phases</span><b>{calEvents.length}</b></div>
        </div>
      )}

      {/* No-start-date warning */}
      {jobsNoStart.length > 0 && (
        <div style={{
          background: '#fff8e1', border: '1px solid #f59e0b', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>
              {jobsNoStart.length} job{jobsNoStart.length > 1 ? 's' : ''} {jobsNoStart.length > 1 ? 'have' : 'has'} no start date — set one in Jobs to show {jobsNoStart.length > 1 ? 'them' : 'it'} here
            </div>
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 3 }}>
              {jobsNoStart.map(j => j.client + ' · ' + jobDisplayTitle(j)).join('  |  ')}
            </div>
          </div>
          <button
            className="btn-sm btn-outline"
            style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }}
            onClick={() => window.location.href = '/jobs'}
          >
            Go to Jobs →
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="cal-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* View switcher */}
        <div className="cal-views" style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
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

        <button className="btn-sm btn-outline cal-prev" onClick={prev}>← Prev</button>
        <div className="cal-label" style={{ flex: 1, textAlign: 'center', fontFamily: 'DM Serif Display, serif', fontSize: view === 'month' ? 22 : 17, whiteSpace: 'nowrap' }}>
          {headerLabel()}
        </div>
        <button className="btn-sm btn-outline cal-next" onClick={next}>Next →</button>
        <button className="btn-sm btn-outline tp-hide" onClick={goToday}>Today</button>
        <button className="btn-sm btn-primary tp-hide" onClick={openNewTask}>+ New task</button>
      </div>

      {taskAssignmentsReady && allAssignees(taskAssignments).length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>👷 Show:</span>
          <select
            value={personFilter}
            onChange={e => setPersonFilter(e.target.value)}
            aria-label="Show only one person's tasks"
            style={{ fontSize: 13, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', fontFamily: 'inherit' }}
          >
            <option value="">Everyone</option>
            {allAssignees(taskAssignments).map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
          {personFilter && <button className="btn-sm btn-outline" onClick={() => setPersonFilter('')}>✕ Show everyone</button>}
        </div>
      )}

      {markers.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>📦 delivery · ↩ collection, from each job&apos;s Orders (dashed = not sent to the supplier yet). Change a date in the job&apos;s Orders.</div>
      )}

      {/* Stats */}
      {jobsOnCalendar > 0 && (
        <div className="tp-hide" style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <StatChip value={jobsOnCalendar} label="jobs on calendar" color="#4a90a4" />
          <StatChip value={activeCount}    label="active jobs"      color="#7ab533" />
          <StatChip value={calEvents.length} label="total phases"   color="#9b59b6" />
        </div>
      )}

      {/* Jump-to-first banner — shown when this view is empty but events exist elsewhere */}
      {eventsInView.length === 0 && calEvents.length > 0 && firstEvent && (
        <div style={{
          background: '#f0f7ff', border: '1px solid #93c5fd', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 13, color: '#1e40af', flex: 1 }}>
            No phases in this {view}. First phase starts <strong>{fmtShort(firstEvent.startDate)}</strong>
            {lastEvent && lastEvent !== firstEvent ? <>, last ends <strong>{fmtShort(lastEvent.endDate)}</strong></> : null}.
          </span>
          <button className="btn-sm btn-outline" style={{ fontSize: 11, padding: '4px 10px' }} onClick={jumpToFirst}>
            Jump to first phase →
          </button>
        </div>
      )}

      {/* Empty state — no jobs at all */}
      {jobs.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No jobs yet</div>
          <div style={{ fontSize: 13 }}>Create a job in the Jobs section and set a start date to see it here.</div>
        </div>
      )}

      {/* Calendar body */}
      {jobs.length > 0 && view === 'month' && <div className="cal-grid-wrap">{renderMonth()}</div>}
      {jobs.length > 0 && view === 'week'  && <div className="cal-grid-wrap">{renderWeek()}</div>}

      {/* Touch agenda: a tappable list of this month/week's phases (the grid is hidden on touch) */}
      {jobs.length > 0 && view !== 'day' && (
        <div className="cal-agenda">
          {agendaEvents.length === 0 ? (
            <div className="cal-agenda-empty">No phases scheduled this {view}</div>
          ) : agendaEvents.map(evt => {
            const durDays = daysBetween(evt.startDate, evt.endDate)
            return (
              <div key={evt.id} className="cal-ag-item" onClick={() => setSelected(evt)} style={{ '--job-color': evt.color, opacity: barOpacity(evt.job.id) } as React.CSSProperties}>
                <div className="cal-ag-when">
                  <b>{fmtShort(evt.startDate)}</b>
                  <span>→ {fmtShort(addDays(evt.endDate, -1))}</span>
                </div>
                <div className="cal-ag-main">
                  <div className="cal-ag-title">{evt.isComplete ? '✓ Complete ' : ''}{evt.phaseLabel}{pctTag(evt)}</div>
                  <div className="cal-ag-sub">{getJobNum(evt.job.id)} · {evt.job.client} · {jobDisplayTitle(evt.job)}</div>
                </div>
                <div className="cal-ag-dur">{Math.ceil(durDays / 7 * 10) / 10}w</div>
              </div>
            )
          })}
        </div>
      )}
      {jobs.length > 0 && view !== 'day' && viewMarkers.length > 0 && (
        <div className="cal-agenda" style={{ marginTop: 10 }}>
          {viewMarkers.map(m => {
            const st = DELIVERY_STYLE[m.kind]
            const j = markerJob(m)
            return (
              <div key={m.id} className="cal-ag-item" onClick={() => setOpenDelivery(m)} style={{ '--job-color': st.solid, opacity: m.done ? 0.6 : m.tentative ? 0.8 : 1 } as React.CSSProperties}>
                <div className="cal-ag-when"><b>{fmtShort(new Date(m.date + 'T12:00:00'))}</b><span>{st.word.toLowerCase()}</span></div>
                <div className="cal-ag-main">
                  <div className="cal-ag-title">{st.icon} {m.done ? '✓ ' : ''}{m.order.title}</div>
                  <div className="cal-ag-sub">{m.order.supplierName} · {poRef(m.order.poNumber)}{j ? ` · ${j.client}` : ''}{m.tentative ? ' · not sent yet' : ''}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {jobs.length > 0 && view === 'day'   && renderDay()}

      {/* Job legend + highlight toggles — on-site jobs only. A planning/on-hold/complete
          job isn't currently being worked, so highlighting it on the calendar isn't
          useful; Complete ones don't even have bars to highlight any more. */}
      {jobs.filter(j => j.start && j.stage === 'active').length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Jobs:</span>
            {highlightJobId && (
              <button
                onClick={() => setHighlightJobId(null)}
                style={{ fontSize: 10, padding: '2px 8px', border: '1px solid #f59e0b', borderRadius: 10, background: '#fff8e1', color: '#92400e', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                ✕ Clear highlight
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {jobs.filter(j => j.start && j.stage === 'active').map(j => {
              const color    = resolveJobColor(j)
              const isLit    = highlightJobId === j.id
              const jobNum   = getJobNum(j.id)
              return (
                <div
                  key={j.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: isLit ? color : 'var(--warm)',
                    border: `2px solid ${isLit ? color : 'transparent'}`,
                    borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                    boxShadow: isLit ? `0 0 0 3px ${color}44` : 'none',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => setHighlightJobId(isLit ? null : j.id)}
                  title={isLit ? 'Click to remove highlight' : 'Click to highlight this job on the calendar'}
                >
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: isLit ? 'white' : color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: isLit ? 'white' : 'var(--ink)', fontFamily: 'monospace' }}>{jobNum}</span>
                  <span style={{ fontSize: 11, color: isLit ? 'rgba(255,255,255,0.9)' : 'var(--muted)' }}>{j.client} · {jobDisplayTitle(j)}</span>
                  <span style={{ fontSize: 10, color: isLit ? 'rgba(255,255,255,0.75)' : 'var(--muted)', marginLeft: 2 }}>{isLit ? '● highlighted' : '○ highlight'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {renderDetail()}
      {renderDeliveryDetail()}
      {renderNewTaskModal()}
    </div>
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
