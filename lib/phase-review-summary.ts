// What the AI phase review is shown about a sub-phase: the description of the work, what it contains (each row with its quantity and cost), what a calculator
// was set to, and the cost, margin and sell price, so it can say whether the price looks right for the work described and what may have been forgotten.
// Builder-facing (this is for the estimator's own review, not the client). Pure, so it can be tested: type-only imports.

import type { QuotePhase } from './types'

const money = (n: number) => '£' + n.toFixed(2)

export interface PhaseReviewSummary {
  /** the description and scope text */
  description: string
  /** every cost row with its quantity and cost */
  rows: string
  /** cost, margin % and sell */
  pricing: string
  costTotal: number
  sellTotal: number
  marginPct: number
}

export function summarisePhaseForReview(phase: QuotePhase, quoteMarkup: number): PhaseReviewSummary {
  const marginPct = typeof phase.markupPct === 'number' && Number.isFinite(phase.markupPct) ? phase.markupPct : quoteMarkup
  const lines: string[] = []
  let cost = 0
  for (const i of phase.items ?? []) {
    if (i.enabled === false) continue
    const qty = Number(i.qty) || 1
    const each = (Number(i.labour) || 0) + (Number(i.materials) || 0) + (Number(i.plantHire) || 0) + (Number(i.subcontractors) || 0) + (Number(i.other) || 0)
    const c = qty * each
    if (c === 0 && !i.desc?.trim()) continue
    cost += c
    lines.push(`- [${i.itemType ?? 'other'}] ${i.desc?.trim() || 'Item'}${i.qty && i.qty !== 1 ? ` (${i.qty} ${i.unit ?? ''})` : ''} — ${money(c)}${i.notes && /@ £/.test(i.notes) ? ` (${i.notes})` : ''}`)
  }
  for (const p of phase.products ?? []) {
    if (p.enabled === false) continue
    const c = (p.costPrice ?? 0) * (p.qty ?? 1)
    cost += c
    lines.push(`- [materials] ${p.name} (${p.qty} ${p.unit ?? ''}) — ${money(c)}`)
  }
  for (const p of phase.plantItems ?? []) {
    if (p.enabled === false) continue
    const c = (p.costPrice ?? 0) * (p.qty ?? 1)
    cost += c
    lines.push(`- [plant] ${p.name} (${p.qty} ${p.unit ?? ''}) — ${money(c)}`)
  }
  for (const m of phase.miscItems ?? []) {
    if (m.enabled === false) continue
    cost += m.cost ?? 0
    lines.push(`- [other] ${m.desc || 'Item'} — ${money(m.cost ?? 0)}`)
  }
  const shown = lines.slice(0, 40)
  const rows = shown.length ? shown.join('\n') + (lines.length > 40 ? `\n- … and ${lines.length - 40} more rows` : '') : '(no cost rows entered)'
  const sellTotal = +(cost * (1 + marginPct / 100)).toFixed(2)
  const desc = [phase.taskName?.trim(), phase.scopeDetail?.trim()].filter(Boolean).join('\n')
  return {
    description: desc ? desc.slice(0, 1500) : '(no description written)',
    rows,
    pricing: `Cost ${money(cost)} (ex VAT) · margin ${marginPct}% on cost · sell ${money(sellTotal)} (ex VAT)`,
    costTotal: +cost.toFixed(2),
    sellTotal,
    marginPct,
  }
}
