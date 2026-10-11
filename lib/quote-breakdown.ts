// The numbers behind the card-style breakdown at the bottom of a quote: cost, margin and sell for the whole quote, for each cost type
// (labour, materials, plant, subcontract, other), for each main phase and sub-phase, plus plain flags ("Electrics margin is 6%") and a
// comparison of each sub-phase with the same sub-phase on past won quotes. Pure functions, no screen code, so they can be tested.
//
// Margin is "% added on top of cost", the same wording the rest of the quote uses. All figures are ex VAT.

import type { QuotePhase } from './types'
import { calcMiscItemSell, phaseMarkup } from './utils'

export type CostKey = 'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'
export const COST_KEYS: CostKey[] = ['labour', 'materials', 'plant', 'subcontractors', 'other']
export const COST_LABEL: Record<CostKey, string> = { labour: 'Labour', materials: 'Materials', plant: 'Plant', subcontractors: 'Subcontract', other: 'Other' }

export type Split = Record<CostKey, number>
const zero = (): Split => ({ labour: 0, materials: 0, plant: 0, subcontractors: 0, other: 0 })
const sum = (s: Split) => COST_KEYS.reduce((t, k) => t + s[k], 0)
const addInto = (a: Split, b: Split) => { for (const k of COST_KEYS) a[k] += b[k] }

export interface Figures {
  cost: Split
  sell: Split
  costTotal: number
  sellTotal: number
  margin: number
  /** margin as % added on top of cost */
  marginPct: number
}

function finish(cost: Split, sell: Split): Figures {
  const costTotal = sum(cost), sellTotal = sum(sell)
  const margin = sellTotal - costTotal
  return { cost, sell, costTotal, sellTotal, margin, marginPct: costTotal > 0 ? (margin / costTotal) * 100 : 0 }
}

/** Cost and sell of one sub-phase, split by cost type. Adds up to the same totals as calcPhase / calcPhaseSell. */
export function phaseFigures(p: QuotePhase, quoteMarkup: number): Figures {
  const cost = zero(), sell = zero()
  const mkp = 1 + phaseMarkup(p, quoteMarkup) / 100
  const hasLabourTrades = (p.labourTrades?.length ?? 0) > 0
  for (const i of p.items ?? []) {
    if (i.enabled === false) continue
    const qty = Math.max(Number(i.qty) || 1, 1)
    const t = (i.itemType ?? 'other') as CostKey
    const key: CostKey = COST_KEYS.includes(t) ? t : 'other'
    const raw = key === 'labour' ? i.labour : key === 'materials' ? i.materials : key === 'plant' ? i.plantHire : key === 'subcontractors' ? i.subcontractors : i.other
    const c = (Number(raw) || 0) * qty
    cost[key] += c
    // A labour row on a phase that uses labour trades already holds its sell price (calcPhaseSell passes it through)
    sell[key] += key === 'labour' && hasLabourTrades ? c : c * mkp
  }
  for (const pr of p.products ?? []) {
    if (pr.enabled === false) continue
    cost.materials += pr.costPrice * pr.qty
    sell.materials += pr.sellPrice * pr.qty
  }
  for (const pl of p.plantItems ?? []) {
    if (pl.enabled === false) continue
    cost.plant += pl.costPrice * pl.qty
    sell.plant += pl.sellPrice * pl.qty
  }
  for (const mi of p.miscItems ?? []) {
    if (mi.enabled === false) continue
    cost.other += mi.cost
    sell.other += calcMiscItemSell(mi)
  }
  return finish(cost, sell)
}

export interface SubPhaseFigures extends Figures { name: string; mainPhase: string; room?: string; markupPct: number }
export interface MainPhaseFigures extends Figures { name: string; subPhases: SubPhaseFigures[] }
export interface QuoteBreakdown extends Figures { mainPhases: MainPhaseFigures[]; subPhases: SubPhaseFigures[]; quoteMarkup: number; emptySubPhases: string[] }

export function quoteBreakdown(phases: QuotePhase[], quoteMarkup: number): QuoteBreakdown {
  const subPhases: SubPhaseFigures[] = []
  const order: string[] = []
  const byMain = new Map<string, SubPhaseFigures[]>()
  for (const p of phases) {
    const f = phaseFigures(p, quoteMarkup)
    const main = p.parentPhase || '(No Phase)'
    const sp: SubPhaseFigures = { ...f, name: p.phase, mainPhase: main, room: p.roomLabel || undefined, markupPct: phaseMarkup(p, quoteMarkup) }
    subPhases.push(sp)
    if (!byMain.has(main)) { byMain.set(main, []); order.push(main) }
    byMain.get(main)!.push(sp)
  }
  const total = { cost: zero(), sell: zero() }
  const mainPhases: MainPhaseFigures[] = order.map(name => {
    const subs = byMain.get(name)!
    const cost = zero(), sell = zero()
    for (const s of subs) { addInto(cost, s.cost); addInto(sell, s.sell) }
    addInto(total.cost, cost); addInto(total.sell, sell)
    return { ...finish(cost, sell), name, subPhases: subs }
  })
  return {
    ...finish(total.cost, total.sell), mainPhases, subPhases, quoteMarkup,
    emptySubPhases: subPhases.filter(s => s.costTotal <= 0).map(s => s.name),
  }
}

// ── Flags ────────────────────────────────────────────────────────────────────

export interface BreakdownFlag { level: 'bad' | 'warn' | 'ok'; text: string }

const pct = (n: number) => `${Math.round(n)}%`

/** Plain things worth a look. `target` is the quote's own margin setting, the one the builder chose for the whole job. */
export function breakdownFlags(b: QuoteBreakdown, target: number): BreakdownFlag[] {
  const out: BreakdownFlag[] = []
  if (b.costTotal <= 0) return out
  // Sub-phases well under the quote's margin: only ones big enough to matter (£150+ of cost)
  const thin = b.subPhases
    .filter(s => s.costTotal >= 150 && s.marginPct < target - 5)
    .sort((a, b2) => a.marginPct - b2.marginPct)
  for (const s of thin.slice(0, 4)) {
    out.push({
      level: s.marginPct < 0 || s.marginPct < target / 2 ? 'bad' : 'warn',
      text: `${s.name}: margin is ${pct(s.marginPct)}, under your ${pct(target)} target`,
    })
  }
  if (thin.length > 4) out.push({ level: 'warn', text: `${thin.length - 4} more sub-phases are under your ${pct(target)} target` })
  if (b.emptySubPhases.length > 0) {
    const names = b.emptySubPhases.slice(0, 3).join(', ')
    out.push({ level: 'warn', text: `Nothing priced yet in ${b.emptySubPhases.length === 1 ? '' : b.emptySubPhases.length + ' sub-phases: '}${names}${b.emptySubPhases.length > 3 ? '…' : ''}` })
  }
  if (b.cost.plant <= 0 && b.costTotal >= 5000) out.push({ level: 'warn', text: 'No plant or equipment priced anywhere (skips, scaffold, mini-digger?)' })
  if (b.cost.other <= 0 && b.costTotal >= 10000) out.push({ level: 'warn', text: 'Nothing in Other: no contingency, fees or provisional sums' })
  // Within a point of the target counts as on it (the cards show whole percentages)
  if (b.marginPct >= target - 1) out.push({ level: 'ok', text: `Overall margin is ${pct(b.marginPct)}, in line with your ${pct(target)} target` })
  else out.push({ level: b.marginPct < target / 2 ? 'bad' : 'warn', text: `Overall margin is ${pct(b.marginPct)}, under your ${pct(target)} target` })
  return out
}

// ── Compared with past jobs ──────────────────────────────────────────────────

/** A row from the learning table (quote_intelligence) */
export interface PastPhaseRow {
  quote_ref?: string | null
  job_type?: string | null
  phase_name: string
  labour_total?: number | null
  materials_total?: number | null
  plant_total?: number | null
  subcontract_total?: number | null
  other_total?: number | null
  total_sell?: number | null
  markup_pct?: number | null
}

export interface PhaseComparison {
  name: string
  thisCost: number
  pastCost: number
  /** how many past quotes it is compared with */
  count: number
  /** (this - past) / past, as a fraction: 0.4 = 40% dearer than before */
  diff: number
  direction: 'cheaper' | 'dearer'
  /** which cost type accounts for most of the difference */
  driver: CostKey
  driverThis: number
  driverPast: number
  /** past margin on this sub-phase, if known */
  pastMarginPct?: number
  thisMarginPct: number
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const num = (n: number | null | undefined) => Number(n) || 0

function pastSplit(r: PastPhaseRow): Split {
  return { labour: num(r.labour_total), materials: num(r.materials_total), plant: num(r.plant_total), subcontractors: num(r.subcontract_total), other: num(r.other_total) }
}

/**
 * Compare each sub-phase with the same-named sub-phase on past won quotes (never the quote being edited). Only a clear gap is reported
 * (25% or more, and £300+ of difference) so it is a nudge, not noise. Same-job-type history is used when there is some.
 */
export function comparePhases(
  subPhases: SubPhaseFigures[], history: PastPhaseRow[], opts: { jobType?: string; excludeRefs?: (string | undefined | null)[] } = {},
): PhaseComparison[] {
  const skip = new Set((opts.excludeRefs ?? []).filter(Boolean).map(String))
  const byName = new Map<string, PastPhaseRow[]>()
  for (const r of history) {
    if (r.quote_ref && skip.has(String(r.quote_ref))) continue
    const k = norm(r.phase_name || '')
    if (!k) continue
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k)!.push(r)
  }
  const out: PhaseComparison[] = []
  for (const s of subPhases) {
    if (s.costTotal <= 0) continue
    let rows = byName.get(norm(s.name)) ?? []
    if (opts.jobType) {
      const same = rows.filter(r => r.job_type === opts.jobType)
      if (same.length > 0) rows = same
    }
    rows = rows.filter(r => sum(pastSplit(r)) > 0)
    if (rows.length === 0) continue
    const avg = zero()
    for (const r of rows) addInto(avg, pastSplit(r))
    for (const k of COST_KEYS) avg[k] /= rows.length
    const pastCost = sum(avg)
    const diff = (s.costTotal - pastCost) / pastCost
    if (Math.abs(diff) < 0.25 || Math.abs(s.costTotal - pastCost) < 300) continue
    let driver: CostKey = 'labour', best = -1
    for (const k of COST_KEYS) { const d = Math.abs(s.cost[k] - avg[k]); if (d > best) { best = d; driver = k } }
    const margins = rows.map(r => r.markup_pct).filter((m): m is number => typeof m === 'number' && Number.isFinite(m))
    out.push({
      name: s.name, thisCost: s.costTotal, pastCost, count: rows.length, diff, direction: diff < 0 ? 'cheaper' : 'dearer',
      driver, driverThis: s.cost[driver], driverPast: avg[driver],
      pastMarginPct: margins.length ? margins.reduce((t, m) => t + m, 0) / margins.length : undefined,
      thisMarginPct: s.marginPct,
    })
  }
  // Cheaper than before first (that is where money is lost), then biggest gap
  return out.sort((a, b) => (a.direction === b.direction ? Math.abs(b.thisCost - b.pastCost) - Math.abs(a.thisCost - a.pastCost) : a.direction === 'cheaper' ? -1 : 1))
}
