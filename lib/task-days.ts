// Which days of a task each person is on site, and the dated schedule a subcontractor sees. Pure functions, no imports, tested without a browser.
//
// A task starts on a date and lasts a number of calendar days (that is how the job's schedule stores it). Sundays are never working days and
// Saturdays only when the task allows them. A person booked on a task is on site either every working day of it (offsets = null), or on
// chosen days, stored as calendar-day OFFSETS from the task's first day (0 = first day). Offsets, not dates, so they move with the task.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface TaskDay { offset: number; date: Date }

function addDays(d: Date, n: number): Date { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x }
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function parseIsoDay(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return new Date(NaN)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** The working days a task covers, in order, each with its offset from the task's first day. */
export function taskDays(start: Date, durDays: number, allowSaturday: boolean): TaskDay[] {
  const out: TaskDay[] = []
  const n = Math.max(1, Math.floor(durDays) || 1)
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i)
    const dow = d.getDay()
    if (dow === 0) continue                    // Sunday is never a working day
    if (dow === 6 && !allowSaturday) continue  // Saturday only when the task opts in
    out.push({ offset: i, date: d })
  }
  // a task that lands entirely on a non-working day still has its first day
  return out.length ? out : [{ offset: 0, date: addDays(start, 0) }]
}

/** The days a person works: all of them (offsets null/empty), or just the chosen offsets that exist in the task. */
export function bookedDays(all: TaskDay[], offsets: number[] | null | undefined): TaskDay[] {
  if (!offsets || offsets.length === 0) return all
  const want = new Set(offsets)
  return all.filter(d => want.has(d.offset))
}

/** Normalises a chosen set of offsets: every day chosen means "every day" (null), so a task that is later lengthened still includes them. */
export function normaliseOffsets(all: TaskDay[], chosen: number[]): number[] | null {
  const valid = [...new Set(chosen)].filter(o => all.some(d => d.offset === o)).sort((a, b) => a - b)
  if (valid.length === 0 || valid.length === all.length) return null
  return valid
}

export function dayLabel(d: Date): string { return `${DAY_NAMES[d.getDay()]} ${d.getDate()}` }
export function dayLabelLong(d: Date): string { return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}` }

/** "Every day (5 days)", "Wed 15 – Fri 17 Oct", or "Mon 13, Wed 15 Oct" */
export function describeDays(all: TaskDay[], booked: TaskDay[]): string {
  if (booked.length === 0) return 'No days chosen'
  if (booked.length === all.length) return all.length === 1 ? '1 day' : `Every day (${all.length} days)`
  const idx = booked.map(b => all.findIndex(a => a.offset === b.offset)).sort((x, y) => x - y)
  const groups: TaskDay[][] = []
  let run: number[] = []
  const flush = () => { if (run.length) { groups.push(run.map(i => all[i])); run = [] } }
  for (const i of idx) { if (run.length && i === run[run.length - 1] + 1) run.push(i); else { flush(); run = [i] } }
  flush()
  const lastDate = groups[groups.length - 1].slice(-1)[0].date
  const parts = groups.map((g, gi) => {
    const a = g[0].date, b = g[g.length - 1].date
    const tail = gi === groups.length - 1 ? ` ${MONTH_NAMES[b.getMonth()]}` : ''
    if (g.length === 1) return dayLabel(a) + tail
    const monthFirst = a.getMonth() !== b.getMonth() ? ` ${MONTH_NAMES[a.getMonth()]}` : ''
    return `${dayLabel(a)}${monthFirst} – ${dayLabel(b)}${tail}`
  })
  void lastDate
  return parts.join(', ')
}

// ── The subcontractor's dated schedule ───────────────────────────────────────

/** One booking as the database function hands it over */
export interface ScheduleRow {
  job_id: string
  job_title: string | null
  job_address: string | null
  job_start: string          // yyyy-mm-dd
  task_label: string | null
  parent_label: string | null
  start_day: number
  dur_days: number
  allow_saturday: boolean
  day_offsets: number[] | null
}

export interface ScheduleEntry { jobId: string; jobTitle: string; address: string; taskName: string; stageName: string; dayNo: number; ofDays: number }
export interface ScheduleDay { date: Date; key: string; entries: ScheduleEntry[] }

/** "Phase 3 – Structural Shell" -> "Structural Shell" */
export function stripPhasePrefix(label: string): string {
  return (label || '').replace(/^Phase\s+\d+\s*[–\-]\s*/i, '').trim()
}

/** Turns bookings into a day-by-day list (earliest first) from `from` onwards (or up to `to`), one entry per task worked that day. */
export function expandSchedule(rows: ScheduleRow[], from: Date, to?: Date): ScheduleDay[] {
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const byDay = new Map<string, ScheduleDay>()
  for (const r of rows) {
    const jobStart = parseIsoDay(r.job_start)
    if (isNaN(jobStart.getTime())) continue
    const taskStart = addDays(jobStart, r.start_day || 0)
    const all = taskDays(taskStart, r.dur_days || 1, !!r.allow_saturday)
    const mine = bookedDays(all, r.day_offsets)
    for (const d of mine) {
      if (d.date < f || (to && d.date > to)) continue
      const key = isoDay(d.date)
      const day = byDay.get(key) ?? { date: d.date, key, entries: [] }
      day.entries.push({
        jobId: r.job_id,
        jobTitle: (r.job_title || '').trim() || 'Job',
        address: (r.job_address || '').split('\n')[0],
        taskName: stripPhasePrefix(r.task_label || 'Task'),
        stageName: stripPhasePrefix(r.parent_label || ''),
        dayNo: mine.findIndex(x => x.offset === d.offset) + 1,
        ofDays: mine.length,
      })
      byDay.set(key, day)
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime())
}
