// A calculator's costed lines -> quote items: one item per line, its cost in the single field that matches its category. Used by the quote's
// "Save & Price" and by the AI quote when it prices a calculator wall itself, so both produce the same items.

import type { QuoteItem } from './types'
import type { CostedLine } from './assembly-calc'

export function assemblyLinesToItems(lines: CostedLine[]): Omit<QuoteItem, 'id'>[] {
  return lines
    .filter(l => l.cost !== 0)
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

/** The size the AI heard for a wall, validated: metres, both positive and sensible. null when it was not given or does not make sense. */
export function wallMeasurementsMm(m: unknown): { lengthMm: number; heightMm: number } | null {
  if (!m || typeof m !== 'object') return null
  const o = m as Record<string, unknown>
  const len = Number(o.lengthM), h = Number(o.heightM)
  if (!Number.isFinite(len) || !Number.isFinite(h)) return null
  if (len < 0.3 || len > 100 || h < 0.3 || h > 12) return null
  return { lengthMm: Math.round(len * 1000), heightMm: Math.round(h * 1000) }
}
