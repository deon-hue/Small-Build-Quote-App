// A PAYMENT PLAN on a quote: when each part of the price falls due, worked out from rough timescales for each sub-phase (task) so the customer can plan
// their cash flow before the job is confirmed. Pure functions, no imports of values (types only), tested on their own.
//
// How it works. Each sub-phase (a quote line group) has a number of WORKING DAYS; they run one after another from a start date. The plan is a list of
// rows: a deposit when the quote is accepted (10% to start), then either
//   'phase-end'  one stage as each MAIN phase is finished, or
//   'periodic'   a stage every K weeks for the percentage of each phase planned to be done in that time (work is spread evenly over a sub-phase's days),
// A CUSTOMER DISCOUNT can be set on any sub-phase (a percentage): it comes off that sub-phase's value BEFORE the deposit, stages and retention are worked out, so every
// payment is already the lower amount and the rows add up to the quote total less the discount. It is shown to the customer as its own visible line, never folded in.
// then the RETENTION (5% to start) is held back from the last payment(s) and released some months after completion. The deposit is taken off the later
// stages in proportion, so everything adds up to the quote's total EXACTLY. All amounts are in pounds INCLUDING VAT when the quote has VAT.
//
// Due days are stored as calendar days AFTER the start date, not as dates, so the whole plan moves when the start date does (and when the quote becomes
// a job and gets its real start date). With no start date the plan reads "about N weeks after work starts".

import type { QuotePhase } from './types'

export type PlanMode = 'phase-end' | 'periodic'
export type PlanRowKind = 'deposit' | 'stage' | 'final' | 'retention'

/** One sub-phase, as the plan needs it: where it sits, what it is worth (incl. VAT) and how many working days it has. */
export interface PlanTask { key: string; group: string; name: string; value: number; days: number; /** customer discount %, 0 to 100 (none when absent) */ discountPct?: number }

/** One customer discount, as the customer sees it: which task, the percentage, and the amount taken off (incl. VAT when the quote has VAT). */
export interface PlanDiscountItem { group: string; name: string; pct: number; amount: number }

export interface PlanSettings {
  /** yyyy-mm-dd, or '' when the start is not known yet */
  startDate: string
  mode: PlanMode
  /** for 'periodic': a stage every this many weeks (1 weekly, 2 fortnightly, 4 about monthly) */
  everyWeeks: number
  depositPct: number
  retentionPct: number
  /** the retention is released this many months after the last stage */
  retentionMonths: number
}

export interface PlanRow {
  id: string
  kind: PlanRowKind
  description: string
  /** pounds, incl. VAT when the quote has VAT */
  amount: number
  /** calendar days after the start date it falls due; null for the deposit (due when the quote is accepted) */
  dueDay: number | null
}

export interface PaymentPlan extends PlanSettings {
  version: 1
  /** working days for each sub-phase, by `PlanTask.key` (the quote phase's id) */
  days: Record<string, number>
  /** customer discount % for each sub-phase, by `PlanTask.key` (only those above 0) */
  discounts: Record<string, number>
  /** each discount given, with the amount taken off, for the customer's view */
  discountItems: PlanDiscountItem[]
  /** all the discounts together, in pounds (incl. VAT when the quote has VAT) */
  discountTotal: number
  rows: PlanRow[]
  /** the quote total (before any customer discount) these rows were worked out from, to say when the quote has changed since */
  total: number
  /** the customer sees it in the quote and the portal when true */
  showToClient: boolean
  generatedAt: string
}

export const DEFAULT_SETTINGS: PlanSettings = { startDate: '', mode: 'phase-end', everyWeeks: 1, depositPct: 10, retentionPct: 5, retentionMonths: 6 }

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const clampPct = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0)

// ── Dates ──────────────────────────────────────────────────────────────────────

/** yyyy-mm-dd -> a local Date (midday, so a clock change never moves the day); null if it is not a real date. */
export function parseDay(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '')
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null
}
export function isoDayOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function addDaysTo(d: Date, n: number): Date { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); x.setDate(x.getDate() + n); return x }

/** The calendar day offset (0 = the start date) on which the n-th WORKING day (Monday to Friday) falls. With no start date a Monday is assumed. n < 1 gives 0. */
export function workDayToCalDay(start: Date | null, n: number): number {
  const ref = start ?? new Date(2001, 0, 1, 12)   // 1 Jan 2001 was a Monday
  let worked = 0, off = 0
  const target = Math.max(0, Math.floor(n))
  if (target < 1) return 0
  for (let guard = 0; guard < 4000; guard++) {
    const dow = addDaysTo(ref, off).getDay()
    if (dow !== 0 && dow !== 6) { worked++; if (worked === target) return off }
    off++
  }
  return off
}

/** The date a row falls due (null for the deposit, or when there is no start date). */
export function rowDate(plan: Pick<PlanSettings, 'startDate'>, row: PlanRow): Date | null {
  const s = parseDay(plan.startDate)
  if (!s || row.dueDay == null) return null
  return addDaysTo(s, row.dueDay)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function longDate(d: Date): string { return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}` }

/** Plain words for when a row is due: the date when the start is known, else "about N weeks after work starts". */
export function dueLabel(plan: Pick<PlanSettings, 'startDate'>, row: PlanRow): string {
  if (row.kind === 'deposit' || row.dueDay == null) return 'When you accept the quote'
  const d = rowDate(plan, row)
  if (d) return longDate(d)
  const weeks = Math.max(1, Math.round(row.dueDay / 7))
  return weeks === 1 ? 'About 1 week after work starts' : `About ${weeks} weeks after work starts`
}

// ── Making the rows ────────────────────────────────────────────────────────────

/** Working days per sub-phase, as a number the plan can use: a whole day, at least 1, at most 400. */
export function cleanDays(n: unknown): number {
  const v = Math.round(Number(n))
  return Number.isFinite(v) ? Math.min(400, Math.max(1, v)) : 1
}

/** A GUESS at how many working days a sub-phase takes, from its labour: the man-days in it shared between a two-person team, at least one day.
 *  A starting point only (it is shown as "suggested"): the estimator types the real figure. */
export function suggestDays(p: Pick<QuotePhase, 'items' | 'labourTrades'>): number {
  let manDays = 0
  for (const t of p.labourTrades ?? []) {
    const q = Number(t.qty) || 0
    manDays += t.unit === 'day' ? q : t.unit === 'half-day' ? q / 2 : q / 8
  }
  if (manDays === 0) {
    for (const i of p.items ?? []) {
      if (i.itemType !== 'labour' || i.enabled === false) continue
      const q = Number(i.qty) || 0
      if (/^(hr|hrs|hour|hours)$/i.test((i.unit || '').trim())) manDays += q / 8
      else if (/^(day|days)$/i.test((i.unit || '').trim())) manDays += q
      else if (/^(half|half-day|half day)$/i.test((i.unit || '').trim())) manDays += q / 2
    }
  }
  return cleanDays(Math.ceil(manDays / 2))
}

interface Timed extends PlanTask { s: number; e: number }   // working-day span: starts after s days, ends after e

function timeline(tasks: PlanTask[]): Timed[] {
  let c = 0
  return tasks.map(t => { const d = cleanDays(t.days); const x = { ...t, days: d, s: c, e: c + d }; c += d; return x })
}

const pct = (x: number) => `${Math.round(x)}%`

/** The stage rows BEFORE the deposit and retention are applied: each has the full value of the work it pays for. */
function rawStages(tasks: Timed[], s: PlanSettings): { description: string; value: number; endWork: number }[] {
  const start = parseDay(s.startDate)
  if (tasks.length === 0) return []
  const out: { description: string; value: number; endWork: number }[] = []
  if (s.mode === 'phase-end') {
    const groups: string[] = []
    for (const t of tasks) if (!groups.includes(t.group)) groups.push(t.group)
    for (const g of groups) {
      const mine = tasks.filter(t => t.group === g)
      const value = mine.reduce((a, t) => a + t.value, 0)
      if (value <= 0) continue
      out.push({ description: `On completion of ${g}`, value, endWork: Math.max(...mine.map(t => t.e)) })
    }
    return out
  }
  // periodic: every K weeks of working days (5 per week), the share of each sub-phase planned to be done in that time
  const step = Math.max(1, Math.round(s.everyWeeks || 1)) * 5
  const N = tasks[tasks.length - 1].e
  const groups: string[] = []
  for (const t of tasks) if (!groups.includes(t.group)) groups.push(t.group)
  const groupValue = new Map(groups.map(g => [g, tasks.filter(t => t.group === g).reduce((a, t) => a + t.value, 0)]))
  const doneBefore = new Map<string, number>()
  for (let from = 0, n = 1; from < N; from += step, n++) {
    const to = Math.min(N, from + step)
    let value = 0
    const doneNow = new Map<string, number>()
    for (const t of tasks) {
      const overlap = Math.max(0, Math.min(t.e, to) - Math.max(t.s, from))
      if (overlap > 0) {
        const v = t.value * overlap / t.days
        value += v
        doneNow.set(t.group, (doneNow.get(t.group) ?? 0) + v)
      }
    }
    if (value <= 0.004) continue
    // "Foundations to 60%": how far each phase worked on in this time has got by the end of it
    const parts: string[] = []
    for (const g of groups) {
      const add = doneNow.get(g)
      if (!add) continue
      const total = (doneBefore.get(g) ?? 0) + add
      doneBefore.set(g, total)
      const gv = groupValue.get(g) || 0
      parts.push(gv > 0 ? `${g} to ${pct(100 * total / gv)}` : g)
    }
    const shown = parts.length > 4 ? [...parts.slice(0, 4), 'and other work'] : parts
    const endCal = workDayToCalDay(start, to)
    const endDate = start ? ` (to ${longDate(addDaysTo(start, endCal))})` : ''
    const label = step === 5 ? `Week ${n}` : `Weeks ${(n - 1) * (step / 5) + 1}–${Math.min(n * (step / 5), Math.ceil(N / 5))}`
    out.push({ description: `${label}${endDate}: ${shown.join(', ')}`, value, endWork: to })
  }
  return out
}

/** Takes each task's customer discount off its value: the tasks with their lower values, each discount given (to show the customer) and the total of them. */
export function applyDiscounts(tasks: PlanTask[]): { tasks: PlanTask[]; items: PlanDiscountItem[]; total: number } {
  const items: PlanDiscountItem[] = []
  const out = tasks.map(t => {
    const pct = clampPct(Number(t.discountPct ?? 0))
    if (pct <= 0 || !(t.value > 0)) return t
    const amount = round2(t.value * pct / 100)
    if (amount <= 0) return t
    items.push({ group: t.group, name: t.name, pct, amount })
    return { ...t, value: round2(t.value - amount) }
  })
  return { tasks: out, items, total: round2(items.reduce((a, i) => a + i.amount, 0)) }
}

/** Works the rows out. `tasks` carry each sub-phase's value (incl. VAT), days and any customer discount %; the amounts add up to `total` less the discounts, exactly. */
export function generateRows(allTasks: PlanTask[], s: PlanSettings, total?: number): PlanRow[] {
  const disc = applyDiscounts(allTasks)
  const tasks = disc.tasks
  const timed = timeline(tasks.filter(t => t.value > 0))
  const T = round2((total ?? allTasks.reduce((a, t) => a + t.value, 0)) - disc.total)
  if (timed.length === 0 || T <= 0) return []
  const start = parseDay(s.startDate)
  const dep = clampPct(s.depositPct), ret = clampPct(s.retentionPct)
  const stages = rawStages(timed, s)
  const rows: PlanRow[] = []
  let n = 0
  const id = () => `r${++n}`

  const D = round2(T * dep / 100)
  if (D > 0) rows.push({ id: id(), kind: 'deposit', description: `Deposit (${pct(dep)}) on acceptance of the quote`, amount: D, dueDay: null })

  // the work value, less the deposit in proportion; the pennies left over go on the last stage so the total is exact
  const workTotal = stages.reduce((a, x) => a + x.value, 0)
  const toPay = round2(T - D)
  let pay = stages.map(x => round2(x.value / workTotal * toPay))
  const drift = round2(toPay - pay.reduce((a, b) => a + b, 0))
  pay[pay.length - 1] = round2(pay[pay.length - 1] + drift)

  // the retention is held back from the end: the last payment first, and the one before it if the last is not big enough
  let H = Math.min(round2(T * ret / 100), toPay)
  const held = H
  for (let i = pay.length - 1; i >= 0 && H > 0; i--) { const take = Math.min(H, pay[i]); pay[i] = round2(pay[i] - take); H = round2(H - take) }

  const lastWith = pay.reduce((last, p, i) => (p > 0 ? i : last), -1)
  stages.forEach((x, i) => {
    if (pay[i] <= 0) return
    const isFinal = i === lastWith
    const note = isFinal && held > 0 ? ' (less retention)' : ''
    const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
    const description = !isFinal ? x.description
      : s.mode === 'phase-end' ? `Final payment: ${lowerFirst(x.description)}${note}`
      : `Final payment${note}: ${x.description}`
    rows.push({ id: id(), kind: isFinal ? 'final' : 'stage', description, amount: pay[i], dueDay: workDayToCalDay(start, x.endWork) })
  })
  if (held > 0) {
    const finalDay = rows.filter(r => r.dueDay != null).reduce((m, r) => Math.max(m, r.dueDay as number), 0)
    const months = Math.max(0, Math.round(s.retentionMonths || 0))
    rows.push({ id: id(), kind: 'retention', description: `Retention (${pct(ret)}) released ${months} month${months === 1 ? '' : 's'} after completion, once any defects are put right`, amount: held, dueDay: finalDay + Math.round(months * 30.4) })
  }
  return rows
}

/** Builds a whole plan: the tasks' days come from `days` (by task key), then the rows are worked out from the settings. */
export function generatePlan(tasks: PlanTask[], days: Record<string, number>, s: PlanSettings, total: number, now: Date = new Date(), showToClient = true, discounts: Record<string, number> = {}): PaymentPlan {
  const withDays = tasks.map(t => ({ ...t, days: cleanDays(days[t.key] ?? t.days), discountPct: clampPct(Number(discounts[t.key] ?? t.discountPct ?? 0)) }))
  const cleanMap: Record<string, number> = {}
  const discMap: Record<string, number> = {}
  for (const t of withDays) { cleanMap[t.key] = t.days; if ((t.discountPct ?? 0) > 0) discMap[t.key] = t.discountPct as number }
  const disc = applyDiscounts(withDays)
  return {
    version: 1, ...s,
    depositPct: clampPct(s.depositPct), retentionPct: clampPct(s.retentionPct),
    retentionMonths: Math.min(60, Math.max(0, Math.round(s.retentionMonths || 0))),
    everyWeeks: Math.min(12, Math.max(1, Math.round(s.everyWeeks || 1))),
    days: cleanMap, discounts: discMap, discountItems: disc.items, discountTotal: disc.total,
    rows: generateRows(withDays, s, total), total: round2(total), showToClient, generatedAt: now.toISOString(),
  }
}

// ── Checking a plan ────────────────────────────────────────────────────────────

export const planSum = (rows: PlanRow[]) => round2(rows.reduce((a, r) => a + (Number(r.amount) || 0), 0))

/** What is wrong with a plan, in words: rows that do not add up to the quote total, a quote that has changed since, no start date, no rows. */
export function planProblems(plan: PaymentPlan | null | undefined, currentTotal: number): string[] {
  const out: string[] = []
  if (!plan) return out
  if (plan.rows.length === 0) { out.push('The plan has no payments yet.'); return out }
  const sum = planSum(plan.rows)
  const discount = plan.discountTotal > 0 ? plan.discountTotal : 0
  const expected = round2(currentTotal - discount)   // what the payments should come to: the quote total less any customer discount
  const diff = round2(expected - sum)
  const what = discount > 0 ? 'the total to pay (the quote total less the customer discount)' : 'the quote total'
  if (Math.abs(diff) >= 0.01) out.push(diff > 0 ? `The payments come to £${sum.toFixed(2)}, which is £${diff.toFixed(2)} less than ${what} of £${expected.toFixed(2)}.` : `The payments come to £${sum.toFixed(2)}, which is £${Math.abs(diff).toFixed(2)} more than ${what} of £${expected.toFixed(2)}.`)
  if (Math.abs(round2(currentTotal - plan.total)) >= 0.01 && Math.abs(diff) < 0.01) out.push('The quote total has changed since the plan was made, but the payments still add up to it.')
  if (!parseDay(plan.startDate)) out.push('No start date yet: the customer is told how many weeks after work starts each payment falls due.')
  return out
}

/** Makes a plan read from the database safe to use: anything that is not a whole plan is ignored (null), never half used. */
export function cleanPlan(raw: unknown): PaymentPlan | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== 1 || !Array.isArray(o.rows)) return null
  const rows: PlanRow[] = []
  for (const r of o.rows as unknown[]) {
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    const kind = x.kind === 'deposit' || x.kind === 'stage' || x.kind === 'final' || x.kind === 'retention' ? x.kind : null
    const amount = Number(x.amount)
    if (!kind || !Number.isFinite(amount) || amount < 0 || amount > 1e8) continue
    const dueDay = x.dueDay == null ? null : Number(x.dueDay)
    rows.push({
      id: typeof x.id === 'string' && x.id ? x.id.slice(0, 40) : `r${rows.length + 1}`,
      kind, description: typeof x.description === 'string' ? x.description.slice(0, 300) : '',
      amount: round2(amount), dueDay: dueDay != null && Number.isFinite(dueDay) && dueDay >= 0 && dueDay < 4000 ? Math.round(dueDay) : null,
    })
  }
  const days: Record<string, number> = {}
  if (o.days && typeof o.days === 'object') for (const [k, v] of Object.entries(o.days as Record<string, unknown>)) days[k.slice(0, 40)] = cleanDays(v)
  const discounts: Record<string, number> = {}
  if (o.discounts && typeof o.discounts === 'object') for (const [k, v] of Object.entries(o.discounts as Record<string, unknown>)) { const p = clampPct(Number(v)); if (p > 0) discounts[k.slice(0, 40)] = p }
  const discountItems: PlanDiscountItem[] = []
  if (Array.isArray(o.discountItems)) for (const it of o.discountItems as unknown[]) {
    if (!it || typeof it !== 'object') continue
    const x = it as Record<string, unknown>
    const amount = Number(x.amount), pct = clampPct(Number(x.pct))
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e8) continue
    discountItems.push({ group: typeof x.group === 'string' ? x.group.slice(0, 120) : '', name: typeof x.name === 'string' ? x.name.slice(0, 160) : '', pct, amount: round2(amount) })
  }
  const discountTotal = round2(discountItems.reduce((a, i) => a + i.amount, 0))
  const startDate = typeof o.startDate === 'string' && parseDay(o.startDate) ? o.startDate : ''
  return {
    version: 1, startDate,
    mode: o.mode === 'periodic' ? 'periodic' : 'phase-end',
    everyWeeks: Math.min(12, Math.max(1, Math.round(Number(o.everyWeeks) || 1))),
    depositPct: clampPct(Number(o.depositPct)), retentionPct: clampPct(Number(o.retentionPct)),
    retentionMonths: Math.min(60, Math.max(0, Math.round(Number(o.retentionMonths) || 0))),
    days, discounts, discountItems, discountTotal, rows, total: Number.isFinite(Number(o.total)) ? round2(Number(o.total)) : planSum(rows),
    showToClient: o.showToClient !== false, generatedAt: typeof o.generatedAt === 'string' ? o.generatedAt : '',
  }
}

/** The three figures the customer is shown: the quote total, the customer discount, and what they pay (always the sum of the payments, so it cannot disagree with them). */
export function planTotals(plan: PaymentPlan): { gross: number; discount: number; payable: number } {
  const payable = planSum(plan.rows)
  const discount = plan.discountTotal > 0 ? plan.discountTotal : 0
  return { gross: round2(payable + discount), discount, payable }
}

/** A plan the customer is allowed to see: switched on, and with at least one payment. */
export function visiblePlan(raw: unknown): PaymentPlan | null {
  const p = cleanPlan(raw)
  return p && p.showToClient && p.rows.length > 0 ? p : null
}

/** What leaves the customer's account month by month (for the little cash-flow summary): the running total of payments with a known date, by month. */
export function monthlyTotals(plan: PaymentPlan, accepted: Date = new Date()): { label: string; amount: number }[] {
  const start = parseDay(plan.startDate)
  const by = new Map<string, number>()
  const order: string[] = []
  for (const r of plan.rows) {
    const d = r.dueDay == null ? accepted : start ? addDaysTo(start, r.dueDay) : null
    if (!d) return []   // no start date: no months to name
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (!by.has(key)) { by.set(key, 0); order.push(key) }
    by.set(key, round2((by.get(key) ?? 0) + r.amount))
  }
  return order.sort().map(k => ({ label: `${MONTH_NAMES[Number(k.slice(5)) - 1]} ${k.slice(0, 4)}`, amount: by.get(k) ?? 0 }))
}

/** The plan as invoice milestones (description, amount, due date dd/mm/yyyy or ''): what the invoice screen takes when a job is made from this quote. */
export function planToMilestones(plan: PaymentPlan): { description: string; amount: number; dueDate: string }[] {
  const start = parseDay(plan.startDate)
  return plan.rows.map(r => {
    const d = r.dueDay != null && start ? addDaysTo(start, r.dueDay) : null
    return { description: r.description, amount: r.amount, dueDate: d ? isoDayOf(d) : '' }
  })
}
