// Roof lanterns and rooflights — the glazed units themselves (Roof → Rooflights & Dormers), priced apart
// from the roof structure (which already prices each opening, its trimmers and its kerb — Roof Structure)
// and apart from the covering (which already prices the roof and dresses the covering up the kerb — Roof
// Coverings). This calculator supplies and fits the unit that sits in that kerb: the frame and glass (or
// the hatch), its flashing kit, and the fitter's time.
//
// Every rate here is a SAMPLE rate — editable in the calculator's breakdown like every calculator in this
// app. Pure, so the per-item pricing can be tested with hand-worked numbers.

export type RooflightKind = 'lantern' | 'roof-window' | 'flat-rooflight' | 'dome' | 'hatch'

export const ROOFLIGHT_KIND_LABEL: Record<RooflightKind, string> = {
  lantern: 'Roof lantern',
  'roof-window': 'Roof window',
  'flat-rooflight': 'Fixed flat rooflight',
  dome: 'Dome rooflight',
  hatch: 'Access hatch',
}

export type VeluxPreset = 'mk04' | 'mk06' | 'sk06' | 'bespoke'
export const VELUX_PRESET: Record<Exclude<VeluxPreset, 'bespoke'>, { label: string; widthMm: number; depthMm: number; manualSupply: number }> = {
  mk04: { label: 'MK04 (78 × 98cm)',   widthMm: 780,  depthMm: 980,  manualSupply: 320 },
  mk06: { label: 'MK06 (78 × 118cm)',  widthMm: 780,  depthMm: 1180, manualSupply: 380 },
  sk06: { label: 'SK06 (114 × 118cm)', widthMm: 1140, depthMm: 1180, manualSupply: 520 },
}
export type RoofWindowOpening = 'manual' | 'electric'
export type GlazingTier = 'double' | 'triple'
export type DomeSkin = 'single' | 'twin' | 'triple'

export interface RooflightItem {
  id: string
  kind: RooflightKind
  widthMm: number
  depthMm: number
  qty: number
  veluxPreset?: VeluxPreset          // roof-window only; 'bespoke' prices by area instead of a named size
  opening?: RoofWindowOpening        // roof-window only
  glazing?: GlazingTier              // lantern / flat-rooflight
  walkOn?: boolean                   // flat-rooflight only
  skin?: DomeSkin                    // dome only
}

/** What a newly-added item of each kind starts as. */
export const KIND_DEFAULTS: Record<RooflightKind, Pick<RooflightItem, 'widthMm' | 'depthMm' | 'veluxPreset' | 'opening' | 'glazing' | 'walkOn' | 'skin'>> = {
  lantern:          { widthMm: 2000, depthMm: 1500, glazing: 'double' },
  'roof-window':    { widthMm: 780,  depthMm: 980,  veluxPreset: 'mk04', opening: 'manual' },
  'flat-rooflight': { widthMm: 1000, depthMm: 1000, glazing: 'double', walkOn: false },
  dome:             { widthMm: 900,  depthMm: 900,  skin: 'twin' },
  hatch:            { widthMm: 600,  depthMm: 600 },
}

const m2 = (widthMm: number, depthMm: number) => (widthMm / 1000) * (depthMm / 1000)
const perimeterM = (widthMm: number, depthMm: number) => 2 * (widthMm + depthMm) / 1000

export interface RooflightCostPart { label: string; qty: number; unit: string; rate: number; cost: number }
export interface RooflightPriced {
  areaM2: number
  /** One unit's supply and flashing parts — before its quantity is applied. */
  parts: RooflightCostPart[]
  unitSupplyCost: number
  /** One unit's fitting time. */
  fittingHours: number
}

// Sample rates — a contemporary aluminium/uPVC product, double-glazed self-cleaning/solar-control glass
// unless noted. Every figure here is editable afterwards in the calculator's breakdown.
const LANTERN_HARDWARE_KIT = 180      // ridge end caps, corner posts, jacking legs
const LANTERN_BAR_RATE_PER_M = 45     // aluminium eaves and hip bar, per metre of perimeter
const LANTERN_GLASS_RATE_PER_M2 = 260
const TRIPLE_GLAZED_UPLIFT = 1.2

const FLAT_ROOFLIGHT_RATE_PER_M2 = 420
const WALK_ON_UPLIFT = 1.35
const FLAT_ROOFLIGHT_MIN = 280

const DOME_RATE_PER_M2: Record<DomeSkin, number> = { single: 210, twin: 260, triple: 300 }
const DOME_MIN = 150

const HATCH_SUPPLY = 240
const FLASHING_KIT_RATE = 45          // roof-window, flat-rooflight, dome, hatch
const ELECTRIC_ADDER = 180

/** One unit's price and fitting time, before its quantity. Kept apart from `resolveRooflightMaterials` so the
 * arithmetic for a single item — the part most worth hand-checking — can be tested on its own. */
export function priceRooflightItem(item: Pick<RooflightItem, 'kind' | 'widthMm' | 'depthMm' | 'veluxPreset' | 'opening' | 'glazing' | 'walkOn' | 'skin'>): RooflightPriced {
  const areaM2 = +m2(item.widthMm, item.depthMm).toFixed(3)
  const parts: RooflightCostPart[] = []
  let fittingHours = 0

  if (item.kind === 'lantern') {
    const perim = +perimeterM(item.widthMm, item.depthMm).toFixed(3)
    const glassRate = +(LANTERN_GLASS_RATE_PER_M2 * (item.glazing === 'triple' ? TRIPLE_GLAZED_UPLIFT : 1)).toFixed(2)
    parts.push({ label: 'Hardware kit (ridge, corner posts, jacking legs)', qty: 1, unit: 'nr', rate: LANTERN_HARDWARE_KIT, cost: LANTERN_HARDWARE_KIT })
    parts.push({ label: 'Aluminium eaves and hip bar', qty: perim, unit: 'lm', rate: LANTERN_BAR_RATE_PER_M, cost: +(perim * LANTERN_BAR_RATE_PER_M).toFixed(2) })
    parts.push({ label: `Glazed panels (${item.glazing === 'triple' ? 'triple' : 'double'} glazed)`, qty: areaM2, unit: 'm²', rate: glassRate, cost: +(areaM2 * glassRate).toFixed(2) })
    fittingHours = 4
  } else if (item.kind === 'roof-window') {
    const preset = item.veluxPreset && item.veluxPreset !== 'bespoke' ? VELUX_PRESET[item.veluxPreset] : null
    const supply = preset ? preset.manualSupply : Math.max(280, +(areaM2 * 900).toFixed(2))
    parts.push({ label: preset ? `${preset.label} roof window` : 'Bespoke roof window (priced by area)', qty: 1, unit: 'nr', rate: supply, cost: supply })
    if (item.opening === 'electric') parts.push({ label: 'Electric opening kit (motor and control)', qty: 1, unit: 'nr', rate: ELECTRIC_ADDER, cost: ELECTRIC_ADDER })
    parts.push({ label: 'Flashing kit', qty: 1, unit: 'nr', rate: FLASHING_KIT_RATE, cost: FLASHING_KIT_RATE })
    fittingHours = 3
  } else if (item.kind === 'flat-rooflight') {
    const rate = +(FLAT_ROOFLIGHT_RATE_PER_M2 * (item.walkOn ? WALK_ON_UPLIFT : 1) * (item.glazing === 'triple' ? TRIPLE_GLAZED_UPLIFT : 1)).toFixed(2)
    const supply = Math.max(FLAT_ROOFLIGHT_MIN, +(areaM2 * rate).toFixed(2))
    parts.push({ label: `Fixed flat rooflight${item.walkOn ? ', walk-on' : ''} (${item.glazing === 'triple' ? 'triple' : 'double'} glazed)`, qty: areaM2, unit: 'm²', rate, cost: supply })
    parts.push({ label: 'Flashing kit', qty: 1, unit: 'nr', rate: FLASHING_KIT_RATE, cost: FLASHING_KIT_RATE })
    fittingHours = 2.5
  } else if (item.kind === 'dome') {
    const rate = DOME_RATE_PER_M2[item.skin ?? 'twin']
    const supply = Math.max(DOME_MIN, +(areaM2 * rate).toFixed(2))
    const skin = item.skin ?? 'twin'
    parts.push({ label: `${skin[0].toUpperCase()}${skin.slice(1)}-skin dome rooflight`, qty: areaM2, unit: 'm²', rate, cost: supply })
    parts.push({ label: 'Flashing kit', qty: 1, unit: 'nr', rate: FLASHING_KIT_RATE, cost: FLASHING_KIT_RATE })
    fittingHours = 2
  } else {
    parts.push({ label: 'Insulated access hatch', qty: 1, unit: 'nr', rate: HATCH_SUPPLY, cost: HATCH_SUPPLY })
    parts.push({ label: 'Flashing kit', qty: 1, unit: 'nr', rate: FLASHING_KIT_RATE, cost: FLASHING_KIT_RATE })
    fittingHours = 1.5
  }

  const unitSupplyCost = +parts.reduce((s, p) => s + p.cost, 0).toFixed(2)
  return { areaM2, parts, unitSupplyCost, fittingHours }
}

export interface RooflightMaterialLine { id: string; name: string; qty: number; unit: string; rate: number }

/** Every item's parts, multiplied out by its quantity, combined across all items into one priced line per
 * distinct part (so three identical roof windows share one "Flashing kit" line rather than listing three). */
export function resolveRooflightMaterials(items: RooflightItem[]): RooflightMaterialLine[] {
  const byKey = new Map<string, RooflightMaterialLine>()
  for (const item of items) {
    if (item.qty <= 0) continue
    const priced = priceRooflightItem(item)
    for (const part of priced.parts) {
      const key = `${item.kind}:${part.label}:${part.rate}`
      const existing = byKey.get(key)
      if (existing) existing.qty = +(existing.qty + part.qty * item.qty).toFixed(3)
      else byKey.set(key, { id: key, name: `${ROOFLIGHT_KIND_LABEL[item.kind]} — ${part.label}`, qty: +(part.qty * item.qty).toFixed(3), unit: part.unit, rate: part.rate })
    }
  }
  return [...byKey.values()]
}

export function totalRooflightSupplyCost(items: RooflightItem[]): number {
  return +items.reduce((s, item) => s + (item.qty > 0 ? priceRooflightItem(item).unitSupplyCost * item.qty : 0), 0).toFixed(2)
}
