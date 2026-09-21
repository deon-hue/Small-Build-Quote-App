// Trims, edgings and accessories for a flat roof covering — what goes at each edge and detail of the roof,
// for the GRP (Cure It) and EPDM systems. Given the roof's edges, size, parapet and rooflight kerbs it works
// out how much of each trim is wanted (metres of edge, numbers of corners), offers the trim choices for
// each place, and turns the choices into quantities the calculator prices. Pure, so it can be tested.
//
// GRP is the Cure It range (cureit.com trim range): the A trims (edge drainage), B trims (raised edge),
// D trims (wall abutment fillets), C trims (simulated lead flashing), AT trims (angle trims for upstands),
// and the preformed corners. EPDM is brand-neutral (drip edge, termination bar, cover flashing and
// preformed corners) — the supplier's own range can replace it. Rates are SAMPLE rates, editable in the
// calculator's breakdown, like every calculator here; check each trim against the manufacturer's detail.

import type { FlatRoofEdges } from './assembly-calc'

export type TrimCovering = 'epdm' | 'grp' | 'tpo'

export interface TrimProduct {
  code: string
  name: string
  /** What it's for, in the manufacturer's words where they give them. */
  use: string
  /** 'length' — sold in lengths of `packLm`; 'lm' — by the metre; 'nr' — each. */
  unit: 'length' | 'lm' | 'nr'
  packLm?: number
  /** Sample rate per length / metre / each, ex VAT. */
  rate: number
}

const grp = (code: string, name: string, use: string, rate: number, unit: TrimProduct['unit'] = 'length', packLm = 3): TrimProduct =>
  ({ code, name: `Cure It ${code} ${name}`, use, unit, packLm: unit === 'length' ? packLm : undefined, rate })

const GRP_LEAD: TrimProduct = { code: 'LEAD4', name: 'Code 4 lead flashing', use: 'Lead flashing to the existing wall', unit: 'lm', rate: 32.0 }

export const GRP_TRIMS: TrimProduct[] = [
  // A — roof edge drainage
  grp('A170', 'edge drainage trim', 'Roof edge drainage trim', 17.5),
  grp('A200', 'edge trim (into gutter)', 'Edge drainage into a gutter', 19.5),
  grp('A250', 'edge trim (into gutter)', 'Edge drainage into a gutter, deeper', 22.0),
  grp('AF200', 'drip fascia trim', 'Advanced drip fascia — stops water kicking back', 23.5),
  // B — raised edge
  grp('B230', 'raised edge trim', 'Raised edge that stops water running off', 19.5),
  grp('B260', 'raised edge trim', 'Raised edge that stops water running off', 21.5),
  grp('B300', 'deep raised edge trim', 'Deep fascia for warm roofs', 28.0),
  // D — wall abutment fillets
  grp('D260', 'wall abutment fillet', 'Asymmetric wall abutment fillet, with expansion', 23.5),
  grp('D300', 'long-flange wall abutment fillet', 'Wall abutment fillet with a long flange', 29.0),
  // C — simulated lead flashing
  grp('C100', 'lead-effect flashing', 'Standard lead-effect flashing', 21.0),
  grp('C100L', 'long-leg lead-effect flashing', 'Long-leg lead-effect flashing', 24.0),
  grp('C100MT', 'lead-effect flashing with moisture trap', 'Lead-effect flashing with a moisture trap', 27.0),
  grp('C150', 'lead-effect flashing', 'Standard lead-effect flashing, 150', 25.0),
  grp('C150L', 'long-leg lead-effect flashing', 'Long-leg lead-effect flashing, 150', 29.0),
  // AT — angle trims
  grp('AT195Int', 'internal angle trim', 'Internal angle for upstands and gutter floors', 22.5),
  grp('AT195Ext', 'external angle trim', 'External angle for step details and flashings', 22.5),
  grp('AT300Ext', 'long external angle trim', 'Extra-long external angle for parapet walls', 33.0),
  // E, G, OLB, S — expansion, gulley, overlay, soffit
  grp('E280', 'expansion joint / ridge roll', 'Expansion joint and ridge rolls', 29.0),
  grp('G180', 'gulley trim', 'Large roof drainage gulley', 26.0),
  grp('OLB300', 'overlay trim', 'Encapsulates existing edges', 29.0),
  grp('S500', 'soffit trim', 'Fully encapsulates concrete and roof edges', 38.0),
  // F — flat flashing, by the metre
  grp('F150', 'flat flashing 150mm', 'Gutter lining and roof junctions', 2.4, 'lm'),
  grp('F300', 'flat flashing 300mm', 'Gutter lining and roof junctions', 4.5, 'lm'),
  grp('F600', 'flat flashing 600mm', 'Gutter lining and roof junctions', 8.5, 'lm'),
  grp('F900', 'flat flashing 900mm', 'Gutter lining and roof junctions', 12.5, 'lm'),
  // Preformed corners
  grp('C1', 'universal external corner', 'External corner for A and B trims', 8.5, 'nr'),
  grp('C2', 'fillet-to-trim wall junction corner (left / right)', 'Where a wall fillet meets an A, B or D trim', 8.5, 'nr'),
  grp('C3Int', 'internal fillet corner', 'Internal corner for D trims', 8.5, 'nr'),
  grp('C3Ext', 'external fillet corner', 'External corner for D trims', 8.5, 'nr'),
  grp('C4', 'universal internal corner', 'Internal corner for A200 and B260', 8.5, 'nr'),
  grp('C5', 'ridge closure', 'Closure for the E280 trim', 7.5, 'nr'),
  grp('C6', 'rolled rib closure', 'Closure for the ER35/40 trim', 7.5, 'nr'),
  grp('C7', 'lead flashing corner', 'Corner for C100 and C150 flashings', 8.5, 'nr'),
  grp('C8B', 'expansion joint closure', 'Closure for E280 and B trims', 8.5, 'nr'),
  GRP_LEAD,
]

export const EPDM_TRIMS: TrimProduct[] = [
  { code: 'EPDM-DRIP', name: 'Aluminium drip edge trim, 3m', use: 'Edge trim: the membrane is dressed over it and the water drips clear', unit: 'length', packLm: 3, rate: 9.5 },
  { code: 'EPDM-TERM', name: 'Aluminium termination bar, 2m (with sealant and fixings)', use: 'Fixes the membrane at the top of an upstand, kerb or wall', unit: 'length', packLm: 2, rate: 6.5 },
  { code: 'EPDM-COVER', name: 'EPDM cover flashing 300mm', use: 'Covers a detail or seam, taken up an upstand', unit: 'lm', rate: 6.5 },
  { code: 'EPDM-OUT', name: 'Preformed EPDM external corner', use: 'Preformed corner at an external angle', unit: 'nr', rate: 6.0 },
  { code: 'EPDM-IN', name: 'Preformed EPDM internal corner', use: 'Preformed corner at an internal angle', unit: 'nr', rate: 6.0 },
  { code: 'EPDM-MASTIC', name: 'Lap sealant / water cut-off mastic (tube)', use: 'Seals terminations and laps', unit: 'nr', rate: 6.5 },
  GRP_LEAD,
]

export const TRIM_CATALOGUE: Record<TrimCovering, TrimProduct[]> = { grp: GRP_TRIMS, epdm: EPDM_TRIMS, tpo: [] }

export function trimProduct(covering: TrimCovering, code: string): TrimProduct | undefined {
  return TRIM_CATALOGUE[covering].find(p => p.code === code)
}

// ── Where the trims go ──────────────────────────────────────────────────────────

export type TrimSlotId =
  | 'gutter_edge' | 'free_low_edge' | 'raised_edge'
  | 'abutment' | 'abutment_flashing'
  | 'parapet_base' | 'parapet_top'
  | 'kerb'
export type CornerSlotId = 'corner_external' | 'corner_wall' | 'corner_wall_internal' | 'corner_kerb'
export type SlotId = TrimSlotId | CornerSlotId

export const NONE = 'none'

export interface TrimSlotDef {
  id: SlotId
  label: string
  /** A short line saying where it goes. */
  where: string
  /** Product codes offered, the default first; 'none' is always offered as well. */
  options: string[]
}

/** The places trims go, and what's offered at each, for a covering. */
export function trimSlotDefs(covering: TrimCovering): TrimSlotDef[] {
  if (covering === 'grp') return [
    { id: 'gutter_edge', label: 'Gutter edge', where: 'Edge draining into a gutter', options: ['A200', 'A250', 'A170', 'AF200'] },
    { id: 'free_low_edge', label: 'Low edge, no gutter', where: 'Lowest edge, water drips clear', options: ['AF200', 'A200', 'A250', 'A170'] },
    { id: 'raised_edge', label: 'Raised edges', where: 'Free edges the water must not run off (sides and high edge)', options: ['B260', 'B230', 'B300'] },
    { id: 'abutment', label: 'Wall junction', where: 'Roof meeting an existing wall', options: ['D260', 'D300'] },
    { id: 'abutment_flashing', label: 'Flashing over the wall junction', where: 'Covers the top of the wall fillet', options: ['LEAD4', 'C100', 'C100L', 'C100MT', 'C150', 'C150L'] },
    { id: 'parapet_base', label: 'Parapet — base upstand', where: 'Where the roof turns up the parapet', options: ['AT195Int'] },
    { id: 'parapet_top', label: 'Parapet — top', where: 'Over the top of the parapet wall', options: ['AT300Ext', 'AT195Ext'] },
    { id: 'kerb', label: 'Rooflight kerbs', where: 'Upstand round each lantern, roof window, dome or hatch', options: ['AT195Int', 'D260'] },
    { id: 'corner_external', label: 'External roof corners', where: 'Where two edge trims meet', options: ['C1'] },
    { id: 'corner_wall', label: 'Wall junction corners', where: 'Where a wall fillet meets an edge trim', options: ['C2'] },
    { id: 'corner_wall_internal', label: 'Internal wall corners', where: 'Where two walls meet', options: ['C3Int'] },
  ]
  if (covering === 'epdm') return [
    { id: 'gutter_edge', label: 'Gutter edge', where: 'Edge draining into a gutter', options: ['EPDM-DRIP'] },
    { id: 'free_low_edge', label: 'Low edge, no gutter', where: 'Lowest edge, water drips clear', options: ['EPDM-DRIP'] },
    { id: 'raised_edge', label: 'Other free edges', where: 'Sides and high edge', options: ['EPDM-DRIP'] },
    { id: 'abutment', label: 'Wall junction', where: 'Membrane fixed at the top of the wall upstand', options: ['EPDM-TERM', 'EPDM-COVER'] },
    { id: 'abutment_flashing', label: 'Flashing over the wall junction', where: 'Covers the termination', options: ['LEAD4', 'EPDM-COVER'] },
    { id: 'parapet_base', label: 'Parapet — base', where: 'Where the roof turns up the parapet', options: ['EPDM-COVER'] },
    { id: 'parapet_top', label: 'Parapet — top', where: 'Membrane fixed at the top of the parapet', options: ['EPDM-TERM'] },
    { id: 'kerb', label: 'Rooflight kerbs', where: 'Upstand round each lantern, roof window, dome or hatch', options: ['EPDM-TERM', 'EPDM-COVER'] },
    { id: 'corner_external', label: 'External roof corners', where: 'Where two edge trims meet', options: ['EPDM-OUT'] },
    { id: 'corner_wall', label: 'Wall junction corners', where: 'Where a wall upstand meets an edge trim', options: ['EPDM-IN'] },
    { id: 'corner_wall_internal', label: 'Internal wall corners', where: 'Where two walls meet', options: ['EPDM-IN'] },
    { id: 'corner_kerb', label: 'Rooflight kerb corners', where: 'The four corners of each kerb', options: ['EPDM-IN'] },
  ]
  return []
}

/** What each place starts with. Some start off: a parapet's top trim and a flashing over the wall (lead, as before). */
const DEFAULT_OFF: Partial<Record<TrimCovering, SlotId[]>> = { grp: ['parapet_top'], epdm: ['abutment_flashing'] }
export function defaultPick(covering: TrimCovering, slot: TrimSlotDef): string {
  if (DEFAULT_OFF[covering]?.includes(slot.id)) return NONE
  return slot.options[0]
}

export interface TrimRoofInput {
  edges: FlatRoofEdges
  lengthMm: number
  widthMm: number
  kerbLm: number
  openingCount: number
}

/** Metres of edge and detail at each place — before any choice is made. */
export function trimSlotLengthsM(r: TrimRoofInput): Record<TrimSlotId, number> {
  const len: Record<keyof FlatRoofEdges, number> = { high: r.lengthMm / 1000, low: r.lengthMm / 1000, left: r.widthMm / 1000, right: r.widthMm / 1000 }
  const out: Record<TrimSlotId, number> = { gutter_edge: 0, free_low_edge: 0, raised_edge: 0, abutment: 0, abutment_flashing: 0, parapet_base: 0, parapet_top: 0, kerb: r.kerbLm }
  for (const k of Object.keys(len) as (keyof FlatRoofEdges)[]) {
    const t = r.edges[k]
    if (t === 'gutter') out.gutter_edge += len[k]
    else if (t === 'free') out[k === 'low' ? 'free_low_edge' : 'raised_edge'] += len[k]
    else if (t === 'abutment') { out.abutment += len[k]; out.abutment_flashing += len[k] }
    else if (t === 'parapet') { out.parapet_base += len[k]; out.parapet_top += len[k] }
  }
  for (const id of Object.keys(out) as TrimSlotId[]) out[id] = +out[id].toFixed(3)
  return out
}

const EDGE_SLOT = (roof: FlatRoofEdges, k: keyof FlatRoofEdges): TrimSlotId | null => {
  const t = roof[k]
  if (t === 'gutter') return 'gutter_edge'
  if (t === 'free') return k === 'low' ? 'free_low_edge' : 'raised_edge'
  if (t === 'abutment') return 'abutment'
  return null // a parapet edge takes an upstand, not an edge trim
}
const CORNERS: [keyof FlatRoofEdges, keyof FlatRoofEdges][] = [['high', 'left'], ['high', 'right'], ['low', 'left'], ['low', 'right']]
const isEdgeTrim = (s: TrimSlotId | null) => s === 'gutter_edge' || s === 'free_low_edge' || s === 'raised_edge'

/** How many of each corner the roof has, counting only corners whose trims are both actually used. */
export function cornerCounts(r: TrimRoofInput, picks: Partial<Record<SlotId, string>>): Record<CornerSlotId, number> {
  const used = (s: TrimSlotId | null) => s !== null && (picks[s] ?? '') !== NONE
  const out: Record<CornerSlotId, number> = { corner_external: 0, corner_wall: 0, corner_wall_internal: 0, corner_kerb: 0 }
  for (const [a, b] of CORNERS) {
    const sa = EDGE_SLOT(r.edges, a), sb = EDGE_SLOT(r.edges, b)
    if (!used(sa) || !used(sb)) continue
    if (isEdgeTrim(sa) && isEdgeTrim(sb)) out.corner_external++
    else if ((sa === 'abutment' && isEdgeTrim(sb)) || (sb === 'abutment' && isEdgeTrim(sa))) out.corner_wall++
    else if (sa === 'abutment' && sb === 'abutment') out.corner_wall_internal++
  }
  if ((picks.kerb ?? '') !== NONE) out.corner_kerb = 4 * r.openingCount
  return out
}

// ── The choices, turned into what to buy ────────────────────────────────────────

export interface ExtraTrim { id: string; code: string; qty: number }

export interface TrimLine {
  /** A stable id for the priced line, so its rate can be edited. */
  id: string
  name: string
  where: string
  product: TrimProduct
  /** Metres or numbers needed, before waste. */
  qty: number
}

/** The trims the choices come to: one line per place that has something chosen and something to trim, and the
 * extra trims added by hand. A pick that isn't offered for the covering falls back to the default. */
export function resolveTrimLines(
  covering: TrimCovering, roof: TrimRoofInput,
  picks: Partial<Record<SlotId, string>>, extras: ExtraTrim[],
): { lines: TrimLine[]; picks: Record<SlotId, string>; lengthsM: Record<TrimSlotId, number>; corners: Record<CornerSlotId, number> } {
  const defs = trimSlotDefs(covering)
  const resolved = {} as Record<SlotId, string>
  for (const d of defs) {
    const p = picks[d.id]
    resolved[d.id] = p === NONE || (p !== undefined && d.options.includes(p)) ? p : defaultPick(covering, d)
  }
  const lengthsM = trimSlotLengthsM(roof)
  const corners = cornerCounts(roof, resolved)
  const lines: TrimLine[] = []
  for (const d of defs) {
    const code = resolved[d.id]
    if (code === NONE) continue
    const product = trimProduct(covering, code)
    if (!product) continue
    const qty = d.id in corners ? corners[d.id as CornerSlotId] : lengthsM[d.id as TrimSlotId]
    if (!(qty > 0)) continue
    lines.push({ id: `trim_${d.id}_${code}`, name: `${product.name} — ${d.label.toLowerCase()}`, where: d.where, product, qty })
  }
  for (const e of extras) {
    const product = trimProduct(covering, e.code)
    if (!product || !(e.qty > 0)) continue
    lines.push({ id: `trim_extra_${e.id}`, name: `${product.name} — added by hand`, where: 'Added by hand', product, qty: e.qty })
  }
  return { lines, picks: resolved, lengthsM, corners }
}

// ── Covering coverage (GRP) ─────────────────────────────────────────────────────

/** Cure It: a 20kg tin of resin laminates 13.5 m² with 450g mat; a 20kg tin of topcoat covers 40 m². Hardener is
 * about 2% of the resin. */
export const CURE_IT = { resinTinKg: 20, resinTinM2: 13.5, topcoatTinKg: 20, topcoatTinM2: 40, hardenerPctOfResin: 2 } as const

export function grpCoverage(areaM2: number, wastePct = 0) {
  const a = areaM2 * (1 + wastePct / 100)
  const resinTins = Math.ceil(a / CURE_IT.resinTinM2 - 1e-9)
  const topcoatTins = Math.ceil(a / CURE_IT.topcoatTinM2 - 1e-9)
  const hardenerKg = Math.ceil(resinTins * CURE_IT.resinTinKg * CURE_IT.hardenerPctOfResin / 100 - 1e-9)
  return { areaM2: a, resinTins, topcoatTins, hardenerKg }
}
