// The last steps every calculator's "price it from its basics" function shares: cost the layers, add the suggested labour (priced at the company's trades,
// exactly as the screen does before anything is edited), then the 20% profit line. Kept next to the screens (not in lib/) because it uses the same
// hourlyRate the screens do.

import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { hourlyRate } from '@/components/assembly-ui'
import type { BOLabourTrade } from '@/lib/back-office-types'

export interface PricedFromBasics {
  name: string
  qty: number
  location: string
  description: string
  detail?: string
  lines: CostedLine[]
}

export function costFromBasics(o: { layers: AssemblyLayerDef[]; suggestions: LabourSuggestion[]; labourTrades: BOLabourTrade[]; profitPct?: number }): CostedLine[] {
  const lines: CostedLine[] = o.layers.map(l => costLayer(l, l.fixedQty ?? 0))
  const labour = toLabourLines(o.suggestions, o.labourTrades, false).lines
  for (const l of labour) {
    const trade = o.labourTrades.find(t => t.id === l.tradeId)
    if (!trade || l.hours <= 0) continue
    const rate = hourlyRate(trade)
    lines.push({ layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour', source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr', unitCost: rate, cost: +(l.hours * rate).toFixed(2) })
  }
  const profitPct = o.profitPct ?? 20
  const subtotal = lines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(subtotal * profitPct / 100).toFixed(2)
  if (profitPct > 0) lines.push({ layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed', wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount })
  return lines
}
