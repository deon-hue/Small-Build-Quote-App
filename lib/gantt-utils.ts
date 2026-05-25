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
