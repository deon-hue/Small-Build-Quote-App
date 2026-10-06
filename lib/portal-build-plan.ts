// Turns a job's saved Gantt state into the stages and phases a client may see (never individual tasks). Shared by the portal's Build Plan
// page (components/PortalBuildPlan.tsx) and the dashboard's progress / upcoming-works cards (lib/portal-dashboard.ts) so both always agree.

import type { Job, GanttState, GanttPhase } from './types'
import { stripPhasePrefix } from './gantt-utils'
import { parseLocalDay } from './utils'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const fmt = (d: Date) => `${d.getDate()} ${MON[d.getMonth()]}`
export const fmtDay = (d: Date) => `${DAY[d.getDay()]} ${fmt(d)}`
export const weeksOf = (start: Date, end: Date) => Math.max(1, Math.round(((end.getTime() - start.getTime()) / 86400000 + 3) / 7))

export type Status = 'done' | 'now' | 'next'
export interface Item { key: string; name: string; start: Date; end: Date; pct: number; status: Status }
export interface Stage { name: string; items: Item[]; status: Status; start: Date; end: Date }

export function buildStages(job: Job, state: GanttState | null | undefined, today: Date): Stage[] {
  if (!job.start || !state?.phases?.length) return []
  const jobStart = parseLocalDay(job.start)
  const jobComplete = job.stage === 'complete'

  const groups: { name: string; phases: GanttPhase[] }[] = []
  for (const ph of state.phases) {
    const level = ph.level ?? 1
    if (level >= 2) continue
    if (level === 0) { groups.push({ name: stripPhasePrefix(ph.label), phases: [] }); continue }
    if (!groups.length) groups.push({ name: '', phases: [] })
    groups[groups.length - 1].phases.push(ph)
  }

  return groups.filter(g => g.phases.length > 0).map((g, gi) => {
    const items: Item[] = g.phases.map((ph, i) => {
      const start = addDays(jobStart, ph.startDay)
      const end = addDays(jobStart, ph.startDay + Math.max(1, ph.durDays) - 1)
      const pct = ph.isComplete ? 100 : Math.max(0, Math.min(100, ph.percentComplete ?? 0))
      const status: Status = jobComplete || pct >= 100 || end < today ? 'done' : start <= today ? 'now' : 'next'
      return { key: ph.id ?? `${gi}-${i}`, name: stripPhasePrefix(ph.label), start, end, pct, status }
    })
    const status: Status = items.every(p => p.status === 'done') ? 'done' : items.some(p => p.status === 'now') ? 'now' : 'next'
    const start = items.reduce((m, p) => (p.start < m ? p.start : m), items[0].start)
    const end = items.reduce((m, p) => (p.end > m ? p.end : m), items[0].end)
    return { name: g.name, items, status, start, end }
  })
}
