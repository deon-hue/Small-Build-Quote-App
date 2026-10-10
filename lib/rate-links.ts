// Linking an assembly calculator's cost line to a Back Office product (materials) or plant item (plant): the line then takes that item's price, so a price changed
// in Back Office (by hand now, from supplier feeds later) is the price the calculator uses. A link is only made between lines and items per the SAME unit (a
// concrete line per m³ to a product per m³), because the price is used as it stands, never converted. Pure, so it can be tested.

export type RateRefKind = 'product' | 'plant'

export interface RateLink { kind: RateRefKind; refId: string }

export interface RateItem {
  id: string
  kind: RateRefKind
  name: string
  unit: string
  cost: number
  supplier: string
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
  products: { id: string; name: string; unit: string; default_cost: number; supplier: string; active: boolean }[],
  plant: { id: string; name: string; unit: string; default_cost: number; supplier: string; active: boolean }[],
): RateItem[] {
  return [
    ...products.map(p => ({ id: p.id, kind: 'product' as const, name: p.name, unit: p.unit, cost: Number(p.default_cost) || 0, supplier: p.supplier || '', active: p.active !== false })),
    ...plant.map(p => ({ id: p.id, kind: 'plant' as const, name: p.name, unit: p.unit, cost: Number(p.default_cost) || 0, supplier: p.supplier || '', active: p.active !== false })),
  ]
}

/** Only materials lines link to products and plant lines to plant items; the other cost types have no Back Office list to link to. */
export const linkKindFor = (category: string): RateRefKind | null => category === 'materials' ? 'product' : category === 'plant' ? 'plant' : null

/** Lines the estimator typed in (miscellaneous materials) have an id that changes every session, so a link to one could not be kept. */
export const isStableLayerId = (layerId: string) => !/^(misc|suggested|profit|trim_extra_|drain_extra_)/.test(layerId) && layerId.length > 0

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

/** The price a link gives, or null when the item it points at is gone. */
export function costOf(link: RateLink, items: RateItem[]): number | null {
  const it = items.find(i => i.kind === link.kind && i.id === link.refId)
  return it ? it.cost : null
}
