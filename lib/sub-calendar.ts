// The subcontractor portal's Calendar: a month of days, each showing where THIS person is booked (their own days) and, in grey, where the company
// has work on (job name, address and phase only). Pure functions, no browser, tested on their own.
//
// The company part comes from the database function get_company_calendar_for_sub (rows below). It never carries the client's name, prices,
// notes, individual tasks or who else is booked — only what a subcontractor needs to see that the company is busy where.

import { isoDay, parseIsoDay, taskDays, expandSchedule, type ScheduleRow, type ScheduleEntry } from './task-days'

/** One phase of a job, as the database function hands it over */
export interface CompanyPhase { label: string | null; start_day: number; dur_days: number; allow_saturday: boolean }

/** One active job of the company, with its phases */
export interface CompanyCalendarRow {
  job_id: string
  job_title: string | null
  job_address: string | null
  job_start: string          // yyyy-mm-dd
  weeks: number | null
  stage: string | null
  phases: CompanyPhase[] | null
}

export interface CompanyDayEntry { jobId: string; jobTitle: string; address: string; phaseName: string }

export interface CalendarDay {
  date: Date
  key: string                // yyyy-mm-dd
  inMonth: boolean
  isToday: boolean
  /** this person's own bookings that day */
  mine: ScheduleEntry[]
  /** the company's other work that day (jobs this person is booked on that day are left out — their own booking already shows it) */
  company: CompanyDayEntry[]
}

function addDays(d: Date, n: number): Date { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x }

/** "Phase 3 – Structural Shell" -> "Structural Shell" */
function cleanPhase(label: string): string { return (label || '').replace(/^Phase\s+\d+\s*[–\-]\s*/i, '').trim() }

/** Every day the company has a phase on, as day-key -> entries. A job with no saved phases shows as one bar for its whole length. */
export function companyDays(rows: CompanyCalendarRow[]): Map<string, CompanyDayEntry[]> {
  const out = new Map<string, CompanyDayEntry[]>()
  const push = (date: Date, e: CompanyDayEntry) => {
    const key = isoDay(date)
    const list = out.get(key) ?? []
    // the same job + phase never appears twice on a day
    if (!list.some(x => x.jobId === e.jobId && x.phaseName === e.phaseName)) list.push(e)
    out.set(key, list)
  }
  for (const r of rows) {
    const jobStart = parseIsoDay(r.job_start)
    if (isNaN(jobStart.getTime())) continue
    const jobTitle = (r.job_title || '').trim() || 'Job'
    const address = (r.job_address || '').split('\n')[0]
    const phases = (r.phases ?? []).filter(p => p && Number.isFinite(p.dur_days))
    if (phases.length === 0) {
      const days = Math.max(1, Math.round((r.weeks || 1) * 7))
      for (const d of taskDays(jobStart, days, false)) push(d.date, { jobId: r.job_id, jobTitle, address, phaseName: '' })
      continue
    }
    for (const p of phases) {
      const start = addDays(jobStart, p.start_day || 0)
      for (const d of taskDays(start, p.dur_days || 1, !!p.allow_saturday)) {
        push(d.date, { jobId: r.job_id, jobTitle, address, phaseName: cleanPhase(p.label || '') })
      }
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
      })
    }
    weeks.push(week)
  }
  return weeks
}
