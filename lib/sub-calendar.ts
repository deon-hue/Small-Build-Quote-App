// The subcontractor portal's Calendar: a month of days, each showing where THIS person is booked (their own days) and, in grey, where the company
// has work on (job name, address and phase only). Pure functions, no browser, tested on their own.
//
// The company part comes from the database function get_company_calendar_for_sub (rows below). It never carries the client's name, prices,
// notes or who else is booked — only what a subcontractor needs to see that the company is busy where: the job, its address, and each phase and TASK
// with how many days it has (a task of three days is on each of its three days, Day 1 of 3, Day 2 of 3, Day 3 of 3).

import { isoDay, parseIsoDay, taskDays, expandSchedule, type ScheduleRow, type ScheduleEntry } from './task-days'

/** One phase of a job, as the database function hands it over */
export interface CompanyPhase { label: string | null; start_day: number; dur_days: number; allow_saturday: boolean }

/** One task of a job (a sub-phase), as the database function hands it over: its name, the phase it is under, when it starts and how many days it has. Never who does it. */
export interface CompanyTask { label: string | null; parent_label: string | null; start_day: number; dur_days: number; allow_saturday: boolean }

/** One active job of the company, with its phases and tasks */
export interface CompanyCalendarRow {
  job_id: string
  job_title: string | null
  job_address: string | null
  job_start: string          // yyyy-mm-dd
  weeks: number | null
  stage: string | null
  /** the colour the builder picked for the job (a #rrggbb swatch); absent until supabase/sub-company-calendar-colour.sql has been run, or when none was picked */
  job_color?: string | null
  phases: CompanyPhase[] | null
  /** the job's tasks; absent until supabase/sub-company-calendar-tasks.sql has been run (the calendar then shows the phases, with their days) */
  tasks?: CompanyTask[] | null
}

/** One piece of company work on one day. taskName is empty when only the phase is known (then the phase is what is on). dayNo of ofDays: which working day of it this is. */
export interface CompanyDayEntry { jobId: string; jobTitle: string; address: string; phaseName: string; taskName: string; dayNo: number; ofDays: number }

export interface CalendarDay {
  date: Date
  key: string                // yyyy-mm-dd
  inMonth: boolean
  isToday: boolean
  /** this person's own bookings that day */
  mine: ScheduleEntry[]
  /** the company's other work that day (jobs this person is booked on that day are left out — their own booking already shows it) */
  company: CompanyDayEntry[]
  /** ALL the company's work that day, including on jobs this person is booked on (the week page lists every job and every task) */
  companyAll: CompanyDayEntry[]
}

function addDays(d: Date, n: number): Date { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x }

/** "Phase 3 – Structural Shell" -> "Structural Shell" */
function cleanPhase(label: string): string { return (label || '').replace(/^Phase\s+\d+\s*[–\-]\s*/i, '').trim() }

/** Every day the company has work on, as day-key -> entries: each TASK on each of its working days (Day 1 of 3, Day 2 of 3 ...), and a phase that has no tasks on each of its days.
 *  A job with no saved phases or tasks shows as one bar for its whole length. */
export function companyDays(rows: CompanyCalendarRow[]): Map<string, CompanyDayEntry[]> {
  const out = new Map<string, CompanyDayEntry[]>()
  const push = (date: Date, e: CompanyDayEntry) => {
    const key = isoDay(date)
    const list = out.get(key) ?? []
    // the same job + phase + task never appears twice on a day
    if (!list.some(x => x.jobId === e.jobId && x.phaseName === e.phaseName && x.taskName === e.taskName)) list.push(e)
    out.set(key, list)
  }
  const spread = (start: Date, dur: number, sat: boolean, base: Omit<CompanyDayEntry, 'dayNo' | 'ofDays'>) => {
    const days = taskDays(start, dur, sat)
    days.forEach((d, i) => push(d.date, { ...base, dayNo: i + 1, ofDays: days.length }))
  }
  for (const r of rows) {
    const jobStart = parseIsoDay(r.job_start)
    if (isNaN(jobStart.getTime())) continue
    const jobTitle = (r.job_title || '').trim() || 'Job'
    const address = (r.job_address || '').split('\n')[0]
    const phases = (r.phases ?? []).filter(p => p && Number.isFinite(p.dur_days))
    const tasks = (r.tasks ?? []).filter(t => t && Number.isFinite(t.dur_days) && (t.label || '').trim())
    if (phases.length === 0 && tasks.length === 0) {
      spread(jobStart, Math.max(1, Math.round((r.weeks || 1) * 7)), false, { jobId: r.job_id, jobTitle, address, phaseName: '', taskName: '' })
      continue
    }
    // a phase that has tasks under it is shown by those tasks, not as a bar of its own
    const withTasks = new Set(tasks.map(t => cleanPhase(t.parent_label || '').toLowerCase()))
    for (const p of phases) {
      const name = cleanPhase(p.label || '')
      if (name && withTasks.has(name.toLowerCase())) continue
      spread(addDays(jobStart, p.start_day || 0), p.dur_days || 1, !!p.allow_saturday, { jobId: r.job_id, jobTitle, address, phaseName: name, taskName: '' })
    }
    for (const t of tasks) {
      spread(addDays(jobStart, t.start_day || 0), t.dur_days || 1, !!t.allow_saturday,
        { jobId: r.job_id, jobTitle, address, phaseName: cleanPhase(t.parent_label || ''), taskName: (t.label || '').trim() })
    }
  }
  return out
}

/** The weeks (Monday first) that make up a month, each with this person's days and, when `rows` is given, the company's other work. */
export function calendarMonth(year: number, month: number, schedule: ScheduleRow[], rows: CompanyCalendarRow[] | null, today: Date = new Date()): CalendarDay[][] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7                    // days from Monday to the 1st
  const gridStart = addDays(first, -lead)
  const last = new Date(year, month + 1, 0)
  const weekCount = Math.ceil((lead + last.getDate()) / 7)
  const gridEnd = addDays(gridStart, weekCount * 7 - 1)

  const mineByDay = new Map<string, ScheduleEntry[]>()
  for (const d of expandSchedule(schedule, gridStart, gridEnd)) mineByDay.set(d.key, d.entries)
  const co = rows ? companyDays(rows) : new Map<string, CompanyDayEntry[]>()

  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const weeks: CalendarDay[][] = []
  for (let w = 0; w < weekCount; w++) {
    const week: CalendarDay[] = []
    for (let i = 0; i < 7; i++) {
      const date = addDays(gridStart, w * 7 + i)
      const key = isoDay(date)
      const mine = mineByDay.get(key) ?? []
      const mineJobs = new Set(mine.map(m => m.jobId))
      week.push({
        date, key,
        inMonth: date.getMonth() === month,
        isToday: date.getTime() === t.getTime(),
        mine,
        company: (co.get(key) ?? []).filter(c => !mineJobs.has(c.jobId)),
        companyAll: co.get(key) ?? [],
      })
    }
    weeks.push(week)
  }
  return weeks
}

/** The Monday of the week a date falls in (time of day dropped). */
export function weekStartOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

/** One week, Monday to Sunday, in the same shape as a month's days: this person's own bookings and (when `rows` is given) the company's other work. */
export function calendarWeek(weekStart: Date, schedule: ScheduleRow[], rows: CompanyCalendarRow[] | null, today: Date = new Date()): CalendarDay[] {
  const start = weekStartOf(weekStart)
  const end = addDays(start, 6)
  const mineByDay = new Map<string, ScheduleEntry[]>()
  for (const d of expandSchedule(schedule, start, end)) mineByDay.set(d.key, d.entries)
  const co = rows ? companyDays(rows) : new Map<string, CompanyDayEntry[]>()
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days: CalendarDay[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i)
    const key = isoDay(date)
    const mine = mineByDay.get(key) ?? []
    const mineJobs = new Set(mine.map(m => m.jobId))
    days.push({ date, key, inMonth: true, isToday: date.getTime() === t.getTime(), mine, company: (co.get(key) ?? []).filter(c => !mineJobs.has(c.jobId)), companyAll: co.get(key) ?? [] })
  }
  return days
}

/** A job colour from the database, only if it really is a #rrggbb colour (anything else is ignored: it is put into a style). */
export function safeColour(c: unknown): string | null {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : null
}

/** One cell of a job's week: this person is booked (mine), the company works on it that day (company) or nothing (none). */
export interface WeekCell { key: string; state: 'mine' | 'company' | 'none'; text: string }
/** One job across the week, in its own colour. */
export interface WeekJobRow { jobId: string; title: string; address: string; colour: string; mine: boolean; cells: WeekCell[] }

/**
 * The week as one row per job (every job worked on at least one day of the week), each with a cell per day: the jobs this person is booked on first
 * (their own days solid, the company's other days on the same job pale), then the company's other jobs by name. `colourOf(jobId)` gives a job's colour.
 * With `includeCompany` false only the jobs this person is booked on are listed.
 */
export function weekJobRows(days: CalendarDay[], colourOf: (jobId: string) => string, includeCompany = true): WeekJobRow[] {
  const rows = new Map<string, WeekJobRow>()
  const rowFor = (jobId: string, title: string, address: string): WeekJobRow => {
    let r = rows.get(jobId)
    if (!r) {
      r = { jobId, title: title || 'Job', address, colour: colourOf(jobId), mine: false, cells: days.map(d => ({ key: d.key, state: 'none' as const, text: '' })) }
      rows.set(jobId, r)
    }
    return r
  }
  days.forEach((d, i) => {
    for (const m of d.mine) {
      const r = rowFor(m.jobId, m.jobTitle, m.address)
      r.mine = true
      r.cells[i] = { key: d.key, state: 'mine', text: m.taskName }
    }
    if (includeCompany) {
      for (const c of d.company) {
        const r = rowFor(c.jobId, c.jobTitle, c.address)
        if (r.cells[i].state === 'none') r.cells[i] = { key: d.key, state: 'company', text: c.phaseName }
      }
    }
  })
  return [...rows.values()].sort((a, b) => Number(b.mine) - Number(a.mine) || (a.address || a.title).localeCompare(b.address || b.title))
}
