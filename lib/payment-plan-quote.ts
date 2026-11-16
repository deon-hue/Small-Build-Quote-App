// The link between a quote and its payment plan: turns the quote's sub-phases into the plan's tasks (value incl. VAT, group, a key that survives a reload).
// Kept apart from lib/payment-plan.ts so that file stays pure; this one reads the quote's own pricing.

import type { QuotePhase } from './types'
import { calcPhaseSell, VAT } from './utils'
import { stripPhasePrefix } from './gantt-utils'
import type { PlanTask } from './payment-plan'

/** A key for each sub-phase that is the same every time the quote is opened (the quote screen renumbers phase ids on every load, so ids cannot be used):
 *  main phase, room and sub-phase name, with a number added when the very same three appear twice. */
export function planKeys(phases: QuotePhase[]): string[] {
  const seen = new Map<string, number>()
  return phases.map(p => {
    const base = [p.parentPhase || '', p.roomLabel || '', p.phase || ''].join('|')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}#${n}`
  })
}

/** The main phase a sub-phase is paid under: its parent phase, else its own name, without a "Phase 3 –" prefix. */
export function planGroup(p: Pick<QuotePhase, 'parentPhase' | 'phase'>): string {
  return stripPhasePrefix((p.parentPhase || '').trim() || (p.phase || '').trim()) || 'The works'
}

/** Every sub-phase worth money, in quote order, with its value (cost plus margin, plus VAT when the quote has VAT) rounded to the penny, and `days` as given or 1. */
export function planTasksFromQuote(phases: QuotePhase[], markup: number, vatOn: boolean, days: Record<string, number> = {}): PlanTask[] {
  const keys = planKeys(phases)
  const mult = vatOn ? 1 + VAT : 1
  return phases.map((p, i) => ({
    key: keys[i], group: planGroup(p), name: p.phase || 'Work',
    value: Math.round(calcPhaseSell(p, markup || 0) * mult * 100) / 100,
    days: days[keys[i]] ?? 1,
  }))
}

/** The quote's total including VAT, to the penny (the sum of the sub-phases above). */
export function planQuoteTotal(phases: QuotePhase[], markup: number, vatOn: boolean): number {
  return Math.round(phases.reduce((s, p) => s + calcPhaseSell(p, markup || 0), 0) * (vatOn ? 1 + VAT : 1) * 100) / 100
}
