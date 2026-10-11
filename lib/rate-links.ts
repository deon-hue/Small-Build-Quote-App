// Linking an assembly calculator's cost line to a Back Office product (materials) or plant item (plant): the line then takes that item's price, so a price changed
// in Back Office (by hand now, from supplier feeds later) is the price the calculator uses. A link is only made between lines and items per the SAME unit (a
// concrete line per m³ to a product per m³): the price is used as it stands. A product sold in another unit (a roll of breather membrane) can still be linked by
// saying how much of the line's unit one of it covers (a 50 m² roll: per = 50), and the line then takes the product's price divided by that. Pure, so it can be tested.

export type RateRefKind = 'product' | 'plant'

/** `per`: how many of the line's unit one of the product's unit covers (1 roll = 50 m²: per 50). Absent or 1 = the units are the same. */
export interface RateLink { kind: RateRefKind; refId: string; per?: number }

export interface RateItem {
  id: string
  kind: RateRefKind
  name: string
  unit: string
  cost: number
  supplier: string
  category: string
  active: boolean
}

/** A unit as a plain key, so "m³", "m3" and "cu m" are the same, and each / nr / item are the same. */
export function normUnit(u: string | null | undefined): string {
  const x = (u ?? '').toLowerCase().replace(/[\s._]+/g, '').replace(/³/g, '3').replace(/²/g, '2')
  if (['m3', 'cum', 'cubicmetre', 'cubicmetres', 'cubicm'].includes(x)) return 'm3'
  if (['m2', 'sqm', 'squaremetre', 'squaremetres', 'squarem'].includes(x)) return 'm2'
  if (['m', 'lm', 'metre', 'metres', 'linearmetre', 'linearmetres', 'linm'].includes(x)) return 'm'
  if (['t', 'tonne', 'tonnes', 'ton', 'tons'].includes(x)) return 'tonne'
  if (['nr', 'no', 'each', 'ea', 'number', 'pc', 'pcs', 'piece', 'item', 'items', 'unit', 'units', 'visit', 'skip', 'sum'].includes(x)) return 'nr'
  if (['hr', 'hrs', 'hour', 'hours'].includes(x)) return 'hr'
  if (['day', 'days'].includes(x)) return 'day'
  if (['wk', 'week', 'weeks', 'prop-week', 'propweek', '-week'].includes(x) || x.endsWith('week')) return 'week'
  return x
}

export const unitsMatch = (a: string | null | undefined, b: string | null | undefined) => normUnit(a) === normUnit(b)

const tokens = (s: string) => Array.from(new Set(s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length > 1)))

/** How alike two names are: the share of the line's words that appear in the item's name (0 to 1). */
export function similarity(lineName: string, itemName: string): number {
  const a = tokens(lineName), b = new Set(tokens(itemName))
  if (a.length === 0) return 0
  return a.filter(t => b.has(t)).length / a.length
}

export function toRateItems(
  products: { id: string; name: string; unit: string; default_cost: number; supplier: string; category?: string; active: boolean }[],
  plant: { id: string; name: string; unit: string; default_cost: number; supplier: string; category?: string; active: boolean }[],
): RateItem[] {
  return [
    ...products.map(p => ({ id: p.id, kind: 'product' as const, name: p.name, unit: p.unit, cost: Number(p.default_cost) || 0, supplier: p.supplier || '', category: p.category || '', active: p.active !== false })),
    ...plant.map(p => ({ id: p.id, kind: 'plant' as const, name: p.name, unit: p.unit, cost: Number(p.default_cost) || 0, supplier: p.supplier || '', category: p.category || '', active: p.active !== false })),
  ]
}

/** Only materials lines link to products and plant lines to plant items; the other cost types have no Back Office list to link to. */
export const linkKindFor = (category: string): RateRefKind | null => category === 'materials' ? 'product' : category === 'plant' ? 'plant' : null

/** Lines the estimator typed in (miscellaneous materials) have an id that changes every session, so a link to one could not be kept. */
export const isStableLayerId = (layerId: string) => !/^(misc|suggested|profit|trim_extra_|drain_extra_|fitmat\|)/.test(layerId) && layerId.length > 0

export function isLinkable(layerId: string, category: string): boolean {
  return isStableLayerId(layerId) && linkKindFor(category) !== null
}

/** The items a line could be linked to: the right kind, switched on, the same unit; the best name match first. */
export function candidatesFor(line: { name: string; unit: string; category: string }, items: RateItem[]): RateItem[] {
  const kind = linkKindFor(line.category)
  if (!kind) return []
  return items
    .filter(i => i.kind === kind && i.active && unitsMatch(i.unit, line.unit))
    .map(i => ({ i, s: similarity(line.name, i.name) }))
    .sort((a, b) => b.s - a.s || a.i.name.localeCompare(b.i.name))
    .map(x => x.i)
}

/** A product's price per one of the line's unit: its price as it stands, or divided by how much of the line's unit one of it covers. */
export function priceFor(cost: number, per?: number): number {
  return per && per > 0 && per !== 1 ? +(cost / per).toFixed(4) : cost
}

/** The price a link gives (per the line's unit), or null when the item it points at is gone. */
export function costOf(link: RateLink, items: RateItem[]): number | null {
  const it = items.find(i => i.kind === link.kind && i.id === link.refId)
  return it ? priceFor(it.cost, link.per) : null
}

export interface RateMatch { item: RateItem; /** the product is sold in the line's own unit: it can be linked as it stands */ sameUnit: boolean; score: number }

/**
 * What the picker lists for one line: every switched-on item of the right kind (any unit), narrowed by what is typed (each word must be in the name,
 * category or supplier), the ones in the line's own unit first, then the best name match, then A to Z. With nothing typed it is the whole list in that order.
 */
export function searchRateItems(line: { name: string; unit: string; category: string }, items: RateItem[], query: string): RateMatch[] {
  const kind = linkKindFor(line.category)
  if (!kind) return []
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return items
    .filter(i => i.kind === kind && i.active)
    .filter(i => {
      if (words.length === 0) return true
      const hay = `${i.name} ${i.category} ${i.supplier}`.toLowerCase()
      return words.every(w => hay.includes(w))
    })
    .map(i => ({ item: i, sameUnit: unitsMatch(i.unit, line.unit), score: similarity(line.name, i.name) }))
    .sort((a, b) => Number(b.sameUnit) - Number(a.sameUnit) || b.score - a.score || a.item.name.localeCompare(b.item.name))
}

// ── Buying whole packs ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A product sold in rolls or packs has to be bought whole: 20 m of breather membrane from a 50 m roll still costs the whole roll, and if a 20 m roll exists
// then 20 m costs a 20 m roll. So for a link with a pack size (`per`), the line pays for the number of whole packs that cover what it needs.

/** How many whole packs cover `needed` (of the line's unit), when one pack covers `per`. */
export function packsFor(needed: number, per: number): number {
  if (!(needed > 0) || !(per > 0)) return 0
  return Math.ceil(needed / per - 1e-9)
}

/** What it costs to cover `needed` of the line's unit from this item: whole packs when there is a pack size, otherwise the quantity at its price. */
export function costForQty(itemCost: number, needed: number, per?: number): number {
  if (!(needed > 0)) return 0
  if (per && per > 0 && per !== 1) return +(packsFor(needed, per) * itemCost).toFixed(2)
  return +(needed * itemCost).toFixed(2)
}

/**
 * The line's rate (£ per its own unit) that a link gives for the quantity the line buys: for a pack size it is what the whole packs cost, spread over the
 * quantity, so the line's total is exactly the whole packs' price. null when the linked item has gone.
 */
export function linkedRate(link: RateLink, items: RateItem[], purchaseQty: number): number | null {
  const it = items.find(i => i.kind === link.kind && i.id === link.refId)
  if (!it) return null
  if (!link.per || link.per <= 0 || link.per === 1) return it.cost
  if (!(purchaseQty > 0)) return priceFor(it.cost, link.per)
  return +(costForQty(it.cost, purchaseQty, link.per) / purchaseQty).toFixed(6)
}

const num = (s: string) => parseFloat(s)

/**
 * A guess at how much of the line's unit one of a product covers, read from its name: "50m² roll" or "1m x 50m" for an area line, "20m roll" for a length
 * line. A guess only: the estimator sees it filled in and can change it. null when nothing in the name fits.
 */
export function guessPackSize(productName: string, lineUnit: string): number | null {
  const n = productName.toLowerCase().replace(/×/g, 'x').replace(/\s+/g, ' ')
  const u = normUnit(lineUnit)
  if (u === 'm2') {
    const wl = n.match(/(\d+(?:\.\d+)?)\s*m?\s*x\s*(\d+(?:\.\d+)?)\s*m\b(?!\s*[²2])/)
    if (wl) { const a = num(wl[1]) * num(wl[2]); if (a > 0) return +a.toFixed(3) }
    const ar = n.match(/(\d+(?:\.\d+)?)\s*(?:m²|m2|sq\.? ?m|sqm)/)
    if (ar && num(ar[1]) > 0) return num(ar[1])
    return null
  }
  if (u === 'm') {
    const len = n.match(/(\d+(?:\.\d+)?)\s*(?:lm|mtr|mtrs|metre|metres|meter|meters|m)\b(?!\s*[²2x])/)
    if (len && num(len[1]) > 0) return num(len[1])
    return null
  }
  return null
}
