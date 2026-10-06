// The client portal dashboard's three "what's happening" cards — Next payment, Project progress, Upcoming works.
// Everything is worked out from data the portal already has (invoices and their payment plans, the job and its saved build plan).
// Clients only ever see stages and phases, never individual tasks (same rule as the Build Plan page). Dates are estimates.
// Pure functions: the portal and the builder's preview both call these, and they are tested without a browser.

import type { Job, GanttState } from './types'
import { buildStages, fmtDay, type Item, type Stage } from './portal-build-plan'

// ── Next payment ─────────────────────────────────────────────────────────────

export interface PortalInvoiceLike {
  ref: string
  status: string
  total: number
  dueDate?: string | null
  paymentPlan?: { description: string; amount: number; dueDate: string; paid: boolean }[] | null
}

export interface NextPayment {
  amount: number
  /** null when no due date has been set */
  due: Date | null
  overdue: boolean
  /** whole days from today: negative when overdue, null with no date */
  daysAway: number | null
  /** what it is for, e.g. the milestone description or the invoice reference */
  label: string
  invoiceRef: string
  /** how many further payments are waiting after this one */
  moreCount: number
}

function parseDue(s: string | null | undefined): Date | null {
  if (!s) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const d = iso ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : new Date(s)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  return d
}

/** The payment the client should expect next: anything overdue first (oldest first), otherwise the soonest due. Only invoices that have
 *  actually been sent count (drafts and paid invoices don't). An invoice with a payment plan counts its unpaid milestones instead of its total. */
export function nextPayment(invoices: PortalInvoiceLike[], today: Date): NextPayment | null {
  type C = { amount: number; due: Date | null; label: string; ref: string; flaggedOverdue: boolean }
  const cands: C[] = []
  for (const inv of invoices) {
    if (inv.status !== 'sent' && inv.status !== 'overdue') continue
    const invDue = parseDue(inv.dueDate)
    const unpaid = (inv.paymentPlan ?? []).filter(m => !m.paid && Number(m.amount) > 0)
    if (unpaid.length > 0) {
      for (const m of unpaid) cands.push({ amount: Number(m.amount), due: parseDue(m.dueDate) ?? invDue, label: m.description || inv.ref, ref: inv.ref, flaggedOverdue: inv.status === 'overdue' })
    } else if (Number(inv.total) > 0) {
      cands.push({ amount: Number(inv.total), due: invDue, label: inv.ref, ref: inv.ref, flaggedOverdue: inv.status === 'overdue' })
    }
  }
  if (cands.length === 0) return null

  const isOver = (c: C) => c.flaggedOverdue || (c.due !== null && c.due.getTime() < today.getTime())
  const rank = (c: C) => (isOver(c) ? 0 : c.due ? 1 : 2)           // overdue, then dated, then undated
  cands.sort((a, b) => rank(a) - rank(b) || (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity))
  const c = cands[0]
  const daysAway = c.due ? Math.round((c.due.getTime() - today.getTime()) / 86400000) : null
  return { amount: c.amount, due: c.due, overdue: isOver(c), daysAway, label: c.label, invoiceRef: c.ref, moreCount: cands.length - 1 }
}

export function describeDaysAway(p: NextPayment): string {
  if (p.daysAway === null) return 'Date to be confirmed'
  if (p.daysAway < 0) return `${-p.daysAway} day${p.daysAway === -1 ? '' : 's'} overdue`
  if (p.daysAway === 0) return 'Due today'
  if (p.daysAway === 1) return 'Due tomorrow'
  return `Due in ${p.daysAway} days`
}

// ── Project progress ─────────────────────────────────────────────────────────

export interface ProgressInfo {
  jobId: string
  title: string
  pct: number
  state: 'complete' | 'onsite' | 'upcoming' | 'unscheduled'
  /** One line, e.g. "Week 3 of 12", "Starts Mon 20 Oct" */
  headline: string
  start: Date | null
  finish: Date | null
}

function timeBasedPct(job: Pick<Job, 'start' | 'weeks' | 'stage'>, today: Date): { pct: number; started: boolean } {
  const days = (Number(job.weeks) || 0) * 7
  if (job.stage === 'complete') return { pct: 100, started: true }
  const start = parseDue(job.start)
  if (!start || days <= 0) return { pct: 0, started: false }
  const elapsed = Math.min(days, Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000)))
  return { pct: Math.round((elapsed / days) * 100), started: elapsed > 0 }
}

/** How far along a job is. With a build plan: the share of the planned phase-days that are finished (finished phases count in full, the phase
 *  on site counts its own % complete). Without one: simply how far through the job's planned weeks we are. */
export function projectProgress(job: Job, state: GanttState | null | undefined, today: Date): ProgressInfo {
  const title = (job.title && job.title.trim()) || job.type || 'Your project'
  const base = { jobId: job.id, title }
  const stages = buildStages(job, state, today)
  const items = stages.flatMap(s => s.items)

  if (job.stage === 'complete') {
    const finish = items.length ? items.reduce((m, p) => (p.end > m ? p.end : m), items[0].end) : null
    return { ...base, pct: 100, state: 'complete', headline: 'Complete', start: items.length ? items[0].start : parseDue(job.start), finish }
  }

  if (items.length) {
    const dur = (i: Item) => Math.max(1, Math.round((i.end.getTime() - i.start.getTime()) / 86400000) + 1)
    const total = items.reduce((s, i) => s + dur(i), 0)
    const done = items.reduce((s, i) => s + dur(i) * (i.status === 'done' ? 1 : i.status === 'now' ? i.pct / 100 : 0), 0)
    const pct = Math.min(100, Math.round((done / total) * 100))
    const start = items.reduce((m, p) => (p.start < m ? p.start : m), items[0].start)
    const finish = items.reduce((m, p) => (p.end > m ? p.end : m), items[0].end)
    const onsite = items.some(i => i.status === 'now') || items.some(i => i.status === 'done')
    if (!onsite) return { ...base, pct, state: 'upcoming', headline: `Starts ${fmtDay(start)}`, start, finish }
    const weeks = Number(job.weeks) || 0
    const t = timeBasedPct(job, today)
    const wk = weeks ? Math.min(weeks, Math.floor(Math.floor((today.getTime() - start.getTime()) / 86400000) / 7) + 1) : 0
    return { ...base, pct, state: 'onsite', headline: weeks && t.started ? `Week ${wk} of ${weeks}` : 'On site', start, finish }
  }

  const start = parseDue(job.start)
  if (!start) return { ...base, pct: 0, state: 'unscheduled', headline: 'Start date to be confirmed', start: null, finish: null }
  const days = (Number(job.weeks) || 0) * 7
  const finish = days > 0 ? new Date(start.getFullYear(), start.getMonth(), start.getDate() + days) : null
  const t = timeBasedPct(job, today)
  if (!t.started) return { ...base, pct: 0, state: 'upcoming', headline: `Starts ${fmtDay(start)}`, start, finish }
  const weeks = Number(job.weeks) || 0
  const wk = weeks ? Math.min(weeks, Math.floor(Math.floor((today.getTime() - start.getTime()) / 86400000) / 7) + 1) : 0
  return { ...base, pct: t.pct, state: 'onsite', headline: weeks ? `Week ${wk} of ${weeks}` : 'On site', start, finish }
}

// ── Upcoming works ───────────────────────────────────────────────────────────

export interface UpcomingWork {
  jobId: string
  jobTitle: string
  name: string
  status: 'now' | 'next'
  start: Date
  end: Date
}

/** What is on site now and what comes next, across the client's jobs: every phase under way, then the next few to start (earliest first). */
export function upcomingWorks(
  jobs: Job[], states: Record<string, GanttState | null | undefined>, today: Date, nextLimit = 3,
): UpcomingWork[] {
  const now: UpcomingWork[] = []
  const next: UpcomingWork[] = []
  for (const job of jobs) {
    if (job.stage === 'complete') continue
    const title = (job.title && job.title.trim()) || job.type || ''
    const stages: Stage[] = buildStages(job, states[job.id], today)
    for (const it of stages.flatMap(s => s.items)) {
      if (it.status === 'now') now.push({ jobId: job.id, jobTitle: title, name: it.name, status: 'now', start: it.start, end: it.end })
      else if (it.status === 'next') next.push({ jobId: job.id, jobTitle: title, name: it.name, status: 'next', start: it.start, end: it.end })
    }
  }
  now.sort((a, b) => a.start.getTime() - b.start.getTime())
  next.sort((a, b) => a.start.getTime() - b.start.getTime())
  return [...now, ...next.slice(0, nextLimit)]
}
