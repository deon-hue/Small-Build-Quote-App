// "This week on site": who is booked where, this week, worked out from the jobs' schedules and the people booked on their tasks. Pure functions.
// A task's days come from the job's start date plus the task's start day and length (Sundays never, Saturdays only when the task allows them); a
// person booked on only some days of a task (dayOffsets) is on site just those days. Only days inside the chosen Monday-to-Sunday week are shown.

import { taskDays, bookedDays, parseIsoDay, isoDay } from './task-days'

export interface WosJob { id: string; start: string; label: string }
export interface WosPhase { id?: string; startDay: number; durDays: number; allowSaturday?: boolean }
export interface WosAssignment { jobId: string; phaseId: string; assigneeName: string; dayOffsets: number[] | null }

export interface WosPerson { name: string; days: string }
export interface WosJobLine { jobId: string; label: string; people: WosPerson[] }

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function addDays(d: Date, n: number): Date { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x }

/** The Monday of the week a date falls in */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

/** [Mon, Tue, Wed, Fri] given as weekday numbers 1..6 -> "Mon-Wed, Fri" (runs of consecutive working days joined) */
export function dayRuns(dows: number[]): string {
  const order = [1, 2, 3, 4, 5, 6]
  const have = new Set(dows)
  const runs: string[] = []
  let i = 0
  while (i < order.length) {
    if (!have.has(order[i])) { i++; continue }
    let j = i
    while (j + 1 < order.length && have.has(order[j + 1])) j++
    runs.push(j > i ? DAY[order[i]] + '-' + DAY[order[j]] : DAY[order[i]])
    i = j + 1
  }
  return runs.join(', ')
}

/** Who is on site this week, grouped by job (jobs with nobody booked this week are left out). */
export function weekOnSite(
  jobs: WosJob[],
  phasesByJob: Record<string, WosPhase[] | undefined>,
  assignments: WosAssignment[],
  weekStart: Date,
): WosJobLine[] {
  const start = mondayOf(weekStart)
  const startKey = isoDay(start), endKey = isoDay(addDays(start, 6))
  const out: WosJobLine[] = []
  for (const job of jobs) {
    const jobStart = parseIsoDay(job.start || '')
    if (isNaN(jobStart.getTime())) continue
    const phases = phasesByJob[job.id] ?? []
    const byPerson = new Map<string, Set<number>>()
    for (const a of assignments) {
      if (a.jobId !== job.id) continue
      const ph = phases.find(p => p.id === a.phaseId)
      if (!ph) continue
      const taskStart = addDays(jobStart, ph.startDay || 0)
      const all = taskDays(taskStart, ph.durDays || 1, !!ph.allowSaturday)
      for (const d of bookedDays(all, a.dayOffsets)) {
        const key = isoDay(d.date)
        if (key < startKey || key > endKey) continue
        const set = byPerson.get(a.assigneeName) ?? new Set<number>()
        set.add(d.date.getDay())
        byPerson.set(a.assigneeName, set)
      }
    }
    if (byPerson.size === 0) continue
    out.push({
      jobId: job.id, label: job.label,
      people: [...byPerson.entries()].map(([name, set]) => ({ name, days: dayRuns([...set]) })).sort((a, b) => a.name.localeCompare(b.name)),
    })
  }
  return out
}
