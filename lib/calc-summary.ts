// The live summary of a calculator: what the job comes to by kind of cost, the profit and the total, shown ex VAT or inc VAT. Pure: the screen gives it the costed lines. A calculator always SAVES its price ex VAT (the quote adds
// VAT), so the VAT here is for comparing with a merchant's or a customer's inc-VAT figure only.

export interface CalcTotals {
  materials: number
  plant: number
  subcontractors: number
  other: number
  labour: number
  /** all the costs before profit (one item) */
  costSubtotal: number
  profitPct: number
  profitAmount: number
  /** cost plus profit (one item), ex VAT */
  total: number
  /** how many of the item (the calculator's Qty) */
  qty: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/** Adds up costed lines by kind. A line with a category this does not know goes under Other. */
export function totalsFromLines(lines: { category: string; cost: number }[], profitPct: number, qty: number): CalcTotals {
  const t = { materials: 0, plant: 0, subcontractors: 0, other: 0, labour: 0 }
  for (const l of lines) {
    const c = Number.isFinite(l.cost) ? l.cost : 0
    if (l.category === 'materials') t.materials += c
    else if (l.category === 'plant') t.plant += c
    else if (l.category === 'subcontractors') t.subcontractors += c
    else if (l.category === 'labour') t.labour += c
    else t.other += c
  }
  const costSubtotal = t.materials + t.plant + t.subcontractors + t.other + t.labour
  const pct = Number.isFinite(profitPct) && profitPct > 0 ? profitPct : 0
  const profitAmount = round2(costSubtotal * pct / 100)
  return { ...t, costSubtotal, profitPct: pct, profitAmount, total: costSubtotal + profitAmount, qty: Number.isFinite(qty) && qty >= 1 ? qty : 1 }
}

export interface SummaryRow { key: string; label: string; value: number }
export interface CalcSummary {
  /** the costs by kind that are not nothing, then the profit, each shown ex or inc VAT; they add up to `shown` to the penny */
  rows: SummaryRow[]
  /** the total as shown (ex or inc VAT as chosen) */
  shown: number
  totalEx: number
  vat: number
  totalInc: number
  vatRate: number
  inc: boolean
  /** £ per kg of steel, as shown, when there is steel */
  perKg: number | null
}

const LABELS: [keyof Pick<CalcTotals, 'materials' | 'subcontractors' | 'plant' | 'labour' | 'other'>, string][] = [
  ['materials', 'Steel and materials'], ['subcontractors', 'Subcontractors (fabricator, engineer)'], ['plant', 'Plant hire and lifting'], ['labour', 'Labour'], ['other', 'Other'],
]

/**
 * The summary for a set of totals. With `inc` every figure is multiplied by the VAT rate; the rows are shared out so they always add up to the total shown (to the penny), however the pennies round.
 */
export function buildSummary(t: CalcTotals, opts: { inc: boolean; vatRate: number; kg?: number }): CalcSummary {
  const rate = Number.isFinite(opts.vatRate) && opts.vatRate > 0 ? Math.min(100, opts.vatRate) : 0
  const mult = opts.inc ? 1 + rate / 100 : 1
  const totalEx = round2(t.total * t.qty)
  const vat = round2(totalEx * rate / 100)
  const totalInc = round2(totalEx + vat)
  const shown = opts.inc ? totalInc : totalEx
  const raw: SummaryRow[] = LABELS.map(([k, label]) => ({ key: k as string, label, value: t[k] * t.qty * mult })).filter(r => Math.abs(r.value) >= 0.005)
  if (t.profitAmount > 0) raw.push({ key: 'profit', label: `Profit (${t.profitPct}%)`, value: t.profitAmount * t.qty * mult })
  // share the pennies out (largest remainder) so the rows add up to the total shown
  const cents = raw.map(r => Math.floor(Math.round(r.value * 1e6) / 1e4))
  let short = Math.round(shown * 100) - cents.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r.value * 100 - Math.floor(r.value * 100) })).sort((a, b) => b.frac - a.frac)
  for (let j = 0; short > 0 && order.length > 0; j = (j + 1) % order.length, short--) cents[order[j].i]++
  for (let j = 0; short < 0 && order.length > 0; j = (j + 1) % order.length, short++) cents[order[order.length - 1 - j].i]--
  const rows = raw.map((r, i) => ({ key: r.key, label: r.label, value: cents[i] / 100 }))
  const kg = opts.kg ?? 0
  return { rows, shown, totalEx, vat, totalInc, vatRate: rate, inc: opts.inc, perKg: kg > 0 ? round2(shown / (kg * t.qty)) : null }
}
