// A calculator's costed lines -> quote items: one item per line, its cost in the single field that matches its category. Used by the quote's
// "Save & Price" and by the AI quote when it prices a calculator wall itself, so both produce the same items.

import type { QuoteItem } from './types'
import type { CostedLine } from './assembly-calc'

/** The calculator's own profit line. It is not a cost: in a quote it becomes the sub-phase's margin (QuotePhase.markupPct), applied the same way as every other margin. */
export const PROFIT_LAYER_ID = 'profit'

/** The profit % a calculator's lines were priced with (from its "Profit (20%)" line), or undefined when it had none. */
export function profitPctOf(lines: CostedLine[]): number | undefined {
  const l = lines.find(x => x.layerId === PROFIT_LAYER_ID)
  const m = l && /\((\d+(?:\.\d+)?)%\)/.exec(l.name)
  return m ? Number(m[1]) : undefined
}

export function assemblyLinesToItems(lines: CostedLine[]): Omit<QuoteItem, 'id'>[] {
  return lines
    .filter(l => l.cost !== 0 && l.layerId !== PROFIT_LAYER_ID)
    .map(l => {
      const base: Omit<QuoteItem, 'id'> = {
        desc: l.name, qty: 1, unit: l.unit,
        labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0,
        notes: `${l.purchaseQty} ${l.unit} @ £${l.unitCost.toFixed(2)}/${l.unit}${l.wastePct ? ` (${l.wastePct}% waste)` : ''}`,
        itemType: l.category,
      }
      const key = l.category === 'plant' ? 'plantHire' : l.category
      return { ...base, [key]: l.cost }
    })
}
