// The link between a quote and its payment plan: turns the quote's sub-phases into the plan's tasks (value incl. VAT, group, a key that survives a reload).
// Kept apart from lib/payment-plan.ts so that file stays pure; this one reads the quote's own pricing.

import type { QuotePhase } from './types'
import { calcPhaseSell, phaseMarkup, VAT } from './utils'
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

/** What a sub-phase's MATERIALS sell for (excluding VAT): its materials lines with the margin, plus any catalogue products. Labour, plant, subcontractors and other are not in it. */
export function phaseMaterialsSell(p: QuotePhase, markup: number): number {
  const mkp = phaseMarkup(p, markup || 0)
  const items = p.items.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.materials) || 0) * (1 + mkp / 100), 0)
  const products = (p.products ?? []).reduce((s, pr) => (pr.enabled === false ? s : s + pr.sellPrice * pr.qty), 0)
  return items + products
}

/** Every sub-phase worth money, in quote order, with its value (cost plus margin, plus VAT when the quote has VAT) rounded to the penny, and `days` as given or 1. */
export function planTasksFromQuote(phases: QuotePhase[], markup: number, vatOn: boolean, days: Record<string, number> = {}): PlanTask[] {
  const keys = planKeys(phases)
  const mult = vatOn ? 1 + VAT : 1
  return phases.map((p, i) => {
    const value = Math.round(calcPhaseSell(p, markup || 0) * mult * 100) / 100
    const materials = Math.min(value, Math.max(0, Math.round(phaseMaterialsSell(p, markup) * mult * 100) / 100))
    return { key: keys[i], group: planGroup(p), name: p.phase || 'Work', value, materials, days: days[keys[i]] ?? 1 }
  })
}

/** The quote's total including VAT, to the penny (the sum of the sub-phases above). */
export function planQuoteTotal(phases: QuotePhase[], markup: number, vatOn: boolean): number {
  return Math.round(phases.reduce((s, p) => s + calcPhaseSell(p, markup || 0), 0) * (vatOn ? 1 + VAT : 1) * 100) / 100
}
