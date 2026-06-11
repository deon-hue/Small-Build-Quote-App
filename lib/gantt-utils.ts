import type { QuotePhase, GanttPhase, GanttState } from './types'

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
    const groupId = `grp-${groupLabel.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const groupPhases = groupMap[groupLabel]

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
      const phaseId = `ph-${qp.phase.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
      for (const task of tasks) {
        rows.push({
          id: `task-${task.id ?? Math.random().toString(36).slice(2, 8)}`,
          label: task.name || task.description || 'Task',
          level: 2,
          parentId: phaseId,
          startDay: taskCursor,
          durDays: TASK_DAYS,
        })
        taskCursor += TASK_DAYS
      }

      cursor = phaseStart + phaseDur
    }

    // Backfill the group header span
    rows[groupHeaderIndex].durDays = cursor - groupStartDay
  }

  const minDays = totalWeeks * 7
  const totalDays = Math.max(cursor, minDays)

  return { phases: rows, totalDays }
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
 * Count working days (Mon–Fri) between two dates (exclusive of endDate).
 *
 * Example: Monday 2025-01-06 → Friday 2025-01-10 = 5 working days.
 * Useful for an optional "working days" tooltip line alongside calendar days.
 */
export function countWorkingDays(startDate: Date, endDate: Date): number {
  let count = 0
  const d = new Date(startDate)
  d.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  while (d < end) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}
