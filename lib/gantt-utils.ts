import type { QuotePhase, GanttPhase, GanttState, Job } from './types'

/** Strip "Phase N – " or "Phase N - " prefixes from group header labels. */
export function stripPhasePrefix(label: string): string {
  return label.replace(/^Phase\s+\d+\s*[–\-]\s*/i, '').trim()
}

/**
 * Build a hierarchical GanttState from quote phases.
 *
 * Produces a 3-level structure:
 *   level 0 — parentPhase group header (no bar, just a label row)
 *   level 1 — sub-phase bar (default 2 days each, sequential within group)
 *   level 2 — individual estimator task bar (default 1 day each, sequential within phase)
 *
 * Phases that share a parentPhase are grouped together.
 * All days are calendar days from a day-0 project start.
 *
 * @param quotePhases  The QuotePhase[] array from the saved quote.
 * @param totalWeeks   The planned job length in weeks (used as minimum totalDays).
 */
export function buildGanttFromQuote(
  quotePhases: QuotePhase[],
  totalWeeks = 8,
): GanttState {
  const rows: GanttPhase[] = []
  let cursor = 0   // running project day counter

  // Default durations (calendar days)
  const PHASE_DAYS = 2
  const TASK_DAYS  = 1

  // Group phases by parentPhase — preserve insertion order
  const groupOrder: string[] = []
  const groupMap: Record<string, QuotePhase[]> = {}

  for (const qp of quotePhases) {
    const group = stripPhasePrefix(qp.parentPhase?.trim() || qp.phase.trim())
    if (!groupMap[group]) {
      groupOrder.push(group)
      groupMap[group] = []
    }
    groupMap[group].push(qp)
  }

  for (const groupLabel of groupOrder) {
    const groupPhases = groupMap[groupLabel]
    // Deterministic — anchored on the group's first sub-phase's own stable numeric id
    // (assigned once by the quote builder, persisted with the quote), not Date.now()/
    // Math.random(). Calling this function twice for the same quote phases must always
    // produce the same ids — GanttModal only ever calls it once per session and freezes
    // the result, but Calendar's task editor calls it independently to both display a
    // task and to save it, and a random id would make those two calls agree on nothing.
    const groupId = `grp-${groupPhases[0].id}`

    // Level 0 — group header row (spans duration of all its children)
    const groupStartDay = cursor
    const groupHeaderIndex = rows.length
    rows.push({
      id: groupId,
      label: groupLabel,
      level: 0,
      startDay: groupStartDay,
      durDays: 0,     // filled in after children are processed
      collapsed: false,
    })

    for (const qp of groupPhases) {
      const phaseId = `ph-${qp.id}`
      const phaseStart = cursor

      // Collect task names from estimatorItems (if any)
      const tasks = qp.estimatorItems ?? []

      // Level 1 — phase row
      const phaseDur = tasks.length > 0 ? tasks.length * TASK_DAYS : PHASE_DAYS
      rows.push({
        id: phaseId,
        label: qp.phase,
        level: 1,
        parentId: groupId,
        startDay: phaseStart,
        durDays: phaseDur,
        collapsed: false,
      })

      // Level 2 — task rows (sequential within phase)
      let taskCursor = phaseStart
      tasks.forEach((task, ti) => {
        rows.push({
          id: `task-${task.id ?? `${qp.id}-${ti}`}`,
          label: task.name || task.description || 'Task',
          level: 2,
          parentId: phaseId,
          startDay: taskCursor,
          durDays: TASK_DAYS,
        })
        taskCursor += TASK_DAYS
      })

      cursor = phaseStart + phaseDur
    }

    // Backfill the group header span
    rows[groupHeaderIndex].durDays = cursor - groupStartDay
  }

  const minDays = totalWeeks * 7
  const totalDays = Math.max(cursor, minDays)

  return { phases: rows, totalDays }
}

/** Flat fallback labels for a job with no linked quote phases at all — used only when
 *  there's nothing else to build a schedule from. Every row gets a stable `id` so
 *  anything that edits one (Calendar's task editor, drag/resize) can find it again
 *  after a save, the same way buildGanttFromQuote's rows already can. */
const GENERIC_FALLBACK_LABELS = [
  'Preliminaries', 'Demolition & Enabling', 'Foundations', 'Structure', 'Roof',
  'External Doors & Windows', 'First Fix', 'Insulation', 'Plastering', 'Second Fix', 'External Works',
]

/**
 * The single canonical way to get a job's Gantt schedule, used by both the Gantt chart
 * (GanttModal) and the Calendar page, so the two never show — or silently save — two
 * different placeholder layouts for the same unscheduled job.
 *
 * Priority:
 *   1. A previously saved layout — never discard a custom arrangement someone dragged.
 *   2. A hierarchical schedule built from the linked quote's phases, if there is one.
 *   3. A flat, generic 11-row fallback for a job with no linked quote at all.
 */
export function resolveGanttState(
  job: Pick<Job, 'weeks'>,
  linkedQuotePhases: QuotePhase[],
  savedState: GanttState | null | undefined,
): GanttState {
  if (savedState && savedState.phases && savedState.phases.length > 0) return savedState
  if (linkedQuotePhases.length) return buildGanttFromQuote(linkedQuotePhases, job.weeks || 12)
  // Spread evenly across the job's planned length rather than stacking every row at
  // day 0 — this is what a job with no quote actually looks like before anyone has
  // opened its Gantt chart to lay it out by hand.
  const totalDays = (job.weeks || 12) * 7
  const n = GENERIC_FALLBACK_LABELS.length
  const ganttPhases: GanttPhase[] = GENERIC_FALLBACK_LABELS.map((label, i) => {
    const startDay = Math.round((i / n) * totalDays)
    const durDays = Math.max(1, Math.round(((i + 1) / n) * totalDays) - startDay)
    return { id: `ph-generic-${i}`, label, startDay, durDays }
  })
  return { phases: ganttPhases, totalDays }
}

/**
 * Gantt chart duration helpers.
 *
 * All durations are stored internally as *calendar* days (durDays).
 * These helpers format that value for display in whichever view the
 * user has selected, so the unit always matches what they see on screen.
 *
 * Day view   → days   (5 calendar days = "5 days",  NOT "0.7 weeks")
 * Week view  → weeks  (14 calendar days = "2 weeks")
 * Month view → months (30 calendar days ≈ "1 month")
 */

export type GanttMode = 'day' | 'week' | 'month'

/**
 * Format a duration expressed in calendar days into a human-readable
 * string that matches the active Gantt view mode.
 *
 * Examples
 * --------
 *   formatGanttDuration(5,  'day')   → "5 days"
 *   formatGanttDuration(1,  'day')   → "1 day"
 *   formatGanttDuration(7,  'week')  → "1 week"
 *   formatGanttDuration(14, 'week')  → "2 weeks"
 *   formatGanttDuration(5,  'week')  → "0.7 weeks"
 *   formatGanttDuration(30, 'month') → "1 month"
 *   formatGanttDuration(91, 'month') → "3 months"
 */
export function formatGanttDuration(durDays: number, mode: GanttMode): string {
  if (mode === 'day') {
    const d = Math.max(1, Math.round(durDays))
    return `${d} day${d !== 1 ? 's' : ''}`
  }

  if (mode === 'month') {
    // Average calendar month = 30.44 days
    const months = Math.round((durDays / 30.44) * 10) / 10
    return `${months} month${months !== 1 ? 's' : ''}`
  }

  // week (default)
  const weeks = Math.round((durDays / 7) * 10) / 10
  return `${weeks} week${weeks !== 1 ? 's' : ''}`
}

/**
 * Count working days (Mon–Fri, or Mon–Sat when `allowSaturday`) between two dates
 * (exclusive of endDate).
 *
 * Example: Monday 2025-01-06 → Friday 2025-01-10 = 4 working days (exclusive end).
 * Doubles as the inverse of workingDaySpanInCalendarDays() — used to re-derive how many
 * working days an already-saved task's calendar-day span represents, so its duration field
 * can be pre-filled with the right number when it's opened for editing again, rather than
 * the raw (weekend-inclusive) calendar-day count.
 */
export function countWorkingDays(startDate: Date, endDate: Date, allowSaturday = false): number {
  let count = 0
  const d = new Date(startDate)
  d.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  while (d < end) {
    if (!isNonWorkingDay(d, allowSaturday)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

/** Sunday is never a working day. Saturday only counts as one when `allowSaturday` is set —
 *  a per-task choice, not a global one (see GanttPhase.allowSaturday). */
export function isNonWorkingDay(d: Date, allowSaturday: boolean): boolean {
  const day = d.getDay()
  if (day === 0) return true
  if (day === 6) return !allowSaturday
  return false
}

/**
 * How many calendar days `workingDays` working days spans, starting from `start` inclusive.
 *
 * Example: start=Wednesday, workingDays=5, allowSaturday=false -> 7
 * (Wed,Thu,Fri,Sat,Sun,Mon,Tue — the last of which is the 5th working day).
 *
 * If `start` itself falls on a non-working day, that day still counts toward the calendar
 * span but never toward the working-day count — deliberately: the rule holds even for a task
 * someone explicitly starts on one, pushing its real work into the next working day.
 */
export function workingDaySpanInCalendarDays(start: Date, workingDays: number, allowSaturday = false): number {
  if (workingDays <= 0) return 1
  const cursor = new Date(start)
  let span = 0, worked = 0
  while (worked < workingDays) {
    if (!isNonWorkingDay(cursor, allowSaturday)) worked++
    span++
    if (worked < workingDays) cursor.setDate(cursor.getDate() + 1)
  }
  return span
}

/**
 * "Tidy up" for a job's programme: after tasks have been moved around (in the Calendar or the Gantt),
 * puts the rows back into date order and re-fits each stage to its tasks.
 *
 *  - Stages (level 0), the phases inside each stage, and the tasks inside each phase are each sorted
 *    by start day (ties keep their existing order), and every child stays directly under its parent.
 *  - Each stage's own bar is re-fitted to cover its phases, since only editing a stage ever did that.
 *  - No phase or task's own start or duration is ever changed, so nothing moves on the Calendar.
 *
 * Rows are matched to their parent by `parentId`; older rows without one fall back to position
 * (the nearest earlier row one level up). `reordered` / `refitted` say whether anything changed.
 */
export function tidyGanttPhases(phases: GanttPhase[]): { phases: GanttPhase[]; reordered: boolean; refitted: number } {
  type Node = { ph: GanttPhase; idx: number; children: Node[] }
  const nodes: Node[] = phases.map((ph, idx) => ({ ph: { ...ph }, idx, children: [] }))
  const byId = new Map<string, Node>()
  nodes.forEach(n => { if (n.ph.id) byId.set(n.ph.id, n) })

  const roots: Node[] = []
  const lastAtLevel: Node[] = []
  for (const n of nodes) {
    const level = n.ph.level ?? 1
    let parent: Node | undefined = n.ph.parentId ? byId.get(n.ph.parentId) : undefined
    // A parent has to sit a level above its child — anything else is a bad link, so treat it as none.
    if (parent && (parent === n || (parent.ph.level ?? 1) >= level)) parent = undefined
    if (!parent && !n.ph.parentId) {
      for (let l = level - 1; l >= 0 && !parent; l--) parent = lastAtLevel[l]
    }
    if (parent) parent.children.push(n); else roots.push(n)
    lastAtLevel[level] = n
    lastAtLevel.length = level + 1
  }

  const byStart = (a: Node, b: Node) => a.ph.startDay - b.ph.startDay || a.idx - b.idx
  let refitted = 0
  const prepare = (n: Node) => {
    n.children.forEach(prepare)
    n.children.sort(byStart)
    if ((n.ph.level ?? 1) === 0 && n.children.length) {
      const start = Math.min(...n.children.map(c => c.ph.startDay))
      const end = Math.max(...n.children.map(c => c.ph.startDay + c.ph.durDays))
      if (start !== n.ph.startDay || end - start !== n.ph.durDays) {
        n.ph.startDay = start
        n.ph.durDays = end - start
        refitted++
      }
    }
  }
  roots.forEach(prepare)
  roots.sort(byStart)

  const out: Node[] = []
  const flatten = (n: Node) => { out.push(n); n.children.forEach(flatten) }
  roots.forEach(flatten)

  return {
    phases: out.map(n => n.ph),
    reordered: out.some((n, i) => n.idx !== i),
    refitted,
  }
}
