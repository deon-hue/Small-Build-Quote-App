// Assembly calculation engine — Stage 1 (see the assembly-calculator feasibility report, §8/§17).
//
// Pure, side-effect-free functions only — no React, no Supabase, no UI, and nothing here is
// wired into a screen, Back Office, or a quote yet. This file proves out two things:
//
//   1. The shared "shell" every future assembly module will use: a layer names which Back
//      Office record it draws from (`boRef` — not a real table yet, see the report §7) and
//      how its raw quantity is derived (`source`); the shell applies waste%, rounds to a
//      real purchase unit, and costs it. Every later module (roof, foundations, drainage,
//      floor, ...) reuses `costLayer` unchanged — only `resolveRawQty` and the geometry
//      function are specific to a given construction method.
//   2. The first real geometry module: a timber-framed wall with openings — field stud
//      count at a given centres, the king/jack/cripple-stud framing and header span around
//      each window or door, plates, and noggin rows.
//
// Millimetres in for every dimension; metres/m² only appear at the point of calculation, to
// avoid the float-drift that comes from storing 2.4 and multiplying it repeatedly.
//
// Header/lintel SIZE is never calculated here — see `WallGeometry.headers`, which gives the
// span that needs clearing, not a section size. That stays a manual or engineer-confirmed
// value wherever this is used; this module counts and prices what's drawn, it doesn't
// approve that a header will hold.

export type LayerCategory = 'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'

// Every quantity this module is able to produce. A layer picks exactly one. This list is
// specific to the framed-wall module — a roof or foundation module would define its own,
// suited to its own geometry (slope area, rafter count, excavation volume, ...). Only the
// shell (`costLayer` below) is meant to be identical across every module.
export type WallQuantitySource =
  | 'netAreaM2'
  | 'grossAreaM2'
  | 'plateLm'
  | 'studCount'
  | 'nogginCount'
  | 'openingFramingCount' // king + jack + sill/head cripples, summed across every opening
  | 'headerCount'         // one per opening — the header/lintel itself, not its size
  | 'fixed'               // a flat allowance unrelated to the wall's size (e.g. a skip, a delivery charge)

// The masonry module's own quantities (see calculateMasonryGeometry below) — coursing
// replaces stud spacing, a lintel replaces a header, and there's no plate/noggin framing.
export type MasonryQuantitySource =
  | 'netAreaM2'
  | 'grossAreaM2'
  | 'blockCount'
  | 'lintelCount' // one per opening — the lintel itself, not its size
  | 'fixed'

// Every AssemblyLayerDef/CostedLine carries a `source` from whichever module built it —
// widen this union rather than the wall module's own WallQuantitySource as more modules
// (roof, foundations, ...) get their own quantity kinds.
export type AssemblyQuantitySource = WallQuantitySource | MasonryQuantitySource

export interface AssemblyOpening {
  id: string
  kind: 'window' | 'door' | 'custom'
  widthMm: number
  heightMm: number
  offsetMm: number     // distance from the wall's left end to the opening's left (rough) edge
  sillHeightMm: number // 0 for a door — the opening runs down to the sole plate, no sill trimmer
}

export interface WallInput {
  lengthMm: number
  heightMm: number
  studCentresMm: number
  doubleTopPlate?: boolean  // default false (single top plate + sole plate)
  headerBearingMm?: number  // bearing each side of an opening; default 100mm — confirm on site
  nogginRows?: number       // override; default 1 row for heightMm <= 2400, else 2
  openings: AssemblyOpening[]
}

export interface WallGeometry {
  grossAreaM2: number
  openingAreaM2: number
  netAreaM2: number
  fieldStudsBeforeOpenings: number
  studsDisplacedByOpenings: number
  kingStuds: number
  jackStuds: number
  sillCripples: number
  headCripples: number
  totalStuds: number
  plateLm: number
  nogginRows: number
  nogginCount: number
  headers: { openingId: string; spanMm: number }[]
  /** Non-fatal issues worth the estimator's attention — an opening that doesn't fit, etc. */
  warnings: string[]
}

export interface AssemblyLayerDef {
  id: string
  name: string
  category: LayerCategory
  source: AssemblyQuantitySource
  unit: string
  unitCost: number
  wastePct?: number         // default 0
  roundToWhole?: boolean    // round the purchase qty up to a whole unit (e.g. studs, sheets)
  coveragePerUnit?: number  // for sheet/roll goods: raw units (m², lm, ...) covered per purchase unit, e.g. 2.88 m² per sheathing sheet
  fixedQty?: number         // required when source === 'fixed'
  /** Multiplies the raw quantity — e.g. 2 for a material applied to both faces of a wall
   * (plasterboard lining, sheathing). Default 1 (one side only). */
  sidesMultiplier?: number
  /** Placeholder for a real bo_task / bo_product / bo_labour_trade / bo_plant_item id. */
  boRef?: string
}

export interface CostedLine {
  layerId: string
  name: string
  category: LayerCategory
  source: AssemblyQuantitySource
  wastePct: number
  rawQty: number
  purchaseQty: number
  unit: string
  unitCost: number
  /** purchaseQty × unitCost — no markup. The quote's own markup applies this, not the module. */
  cost: number
}

export interface WallCostResult {
  geometry: WallGeometry
  lines: CostedLine[]
  totalCost: number
}

const toM = (mmVal: number) => mmVal / 1000

/**
 * Field stud positions at regular centres from one end, plus a closing stud at the far end if
 * the length isn't an exact multiple of the centres (a real wall always terminates in a stud,
 * whatever the spacing arithmetic leaves as a remainder). Exported for the elevation drawing —
 * the geometry/costing above only needs the count, but the UI needs the actual positions.
 */
export function studPositionsMm(lengthMm: number, centresMm: number): number[] {
  const positions: number[] = []
  for (let x = 0; x <= lengthMm; x += centresMm) positions.push(x)
  if (positions[positions.length - 1] !== lengthMm) positions.push(lengthMm)
  return positions
}

export function calculateWallGeometry(input: WallInput): WallGeometry {
  const { lengthMm: L, heightMm: H, studCentresMm: C, openings } = input
  const bearing = input.headerBearingMm ?? 100
  const warnings: string[] = []

  if (L <= 0 || H <= 0) throw new Error('Wall length and height must be greater than zero.')
  if (C <= 0) throw new Error('Stud centres must be greater than zero.')

  const grossAreaM2 = toM(L) * toM(H)
  const openingAreaM2 = openings.reduce((s, o) => s + toM(o.widthMm) * toM(o.heightMm), 0)
  const netAreaM2 = Math.max(0, grossAreaM2 - openingAreaM2)

  const positions = studPositionsMm(L, C)
  const fieldStudsBeforeOpenings = positions.length

  let kingStuds = 0, jackStuds = 0, sillCripples = 0, headCripples = 0, studsDisplacedByOpenings = 0
  const headers: { openingId: string; spanMm: number }[] = []
  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)

  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]
    if (o.offsetMm < 0 || o.offsetMm + o.widthMm > L) {
      warnings.push(`Opening "${o.id}" falls outside the wall — check its offset and width.`)
    }
    if (o.sillHeightMm + o.heightMm > H) {
      warnings.push(`Opening "${o.id}" is taller than the wall above its sill — check sill height.`)
    }
    const next = sorted[i + 1]
    if (next && o.offsetMm + o.widthMm > next.offsetMm) {
      warnings.push(`Openings "${o.id}" and "${next.id}" overlap — check offsets and widths.`)
    }

    kingStuds += 2 // full height, one each side, carry the header load to the sole plate
    jackStuds += 2 // cut to the header's underside, sit inside the king studs, support the header directly

    // Field studs that would have landed inside this opening's rough width are removed and
    // replaced by the framing above/below; the same count also gives the cripple studs above
    // (and, for a window, below) the opening. Assumes a stud grid aligned to the opening's
    // edges — a genuinely misaligned opening can be a stud either way off this in reality,
    // a known Stage-1 simplification worth flagging for the framed-openings module later.
    const crippleSpan = Math.max(0, Math.floor(o.widthMm / C) - 1)
    studsDisplacedByOpenings += crippleSpan
    headCripples += crippleSpan
    // A door has no sill — the opening runs to the sole plate — so it gets head cripples only.
    if (o.sillHeightMm > 0) sillCripples += crippleSpan

    headers.push({ openingId: o.id, spanMm: o.widthMm + bearing * 2 })
  }

  const totalStuds =
    Math.max(0, fieldStudsBeforeOpenings - studsDisplacedByOpenings) +
    kingStuds + jackStuds + sillCripples + headCripples

  // Single top plate + sole plate by default; a second top plate (common where trusses/joists
  // need extra bearing, or over long spans) adds one more run the full length of the wall.
  const plateLm = toM(L) * (input.doubleTopPlate ? 3 : 2)

  const nogginRows = input.nogginRows ?? (H <= 2400 ? 1 : 2)
  const bays = Math.max(1, fieldStudsBeforeOpenings - 1)
  const nogginCount = bays * nogginRows

  return {
    grossAreaM2, openingAreaM2, netAreaM2,
    fieldStudsBeforeOpenings, studsDisplacedByOpenings,
    kingStuds, jackStuds, sillCripples, headCripples, totalStuds,
    plateLm, nogginRows, nogginCount, headers, warnings,
  }
}

function resolveRawQty(layer: AssemblyLayerDef, geometry: WallGeometry): number {
  switch (layer.source) {
    case 'netAreaM2':   return geometry.netAreaM2
    case 'grossAreaM2': return geometry.grossAreaM2
    case 'plateLm':     return geometry.plateLm
    case 'studCount':   return geometry.totalStuds
    case 'nogginCount': return geometry.nogginCount
    case 'openingFramingCount':
      return geometry.kingStuds + geometry.jackStuds + geometry.sillCripples + geometry.headCripples
    case 'headerCount': return geometry.headers.length
    case 'fixed':
      if (layer.fixedQty == null) throw new Error(`Layer "${layer.name}" uses a fixed quantity but none was given.`)
      return layer.fixedQty
    default:
      throw new Error(`Layer "${layer.name}" uses a source ("${layer.source}") the framed-wall module doesn't support.`)
  }
}

/**
 * The shared shell. Identical for every module — takes whatever raw quantity that module's own
 * geometry resolver worked out, applies sides multiplier/waste%, rounds to a real purchase unit,
 * and costs it. No markup is applied here — the quote's own markup does that, same as every
 * other line in the app (feasibility report §8, "Markup — pick one pattern").
 */
export function costLayer(layer: AssemblyLayerDef, baseRawQty: number): CostedLine {
  const rawQty = baseRawQty * (layer.sidesMultiplier ?? 1)
  const wastePct = layer.wastePct ?? 0
  const withWaste = rawQty * (1 + wastePct / 100)
  const units = withWaste / (layer.coveragePerUnit ?? 1)
  const purchaseQty = layer.roundToWhole ? Math.ceil(units) : +units.toFixed(2)
  const cost = +(purchaseQty * layer.unitCost).toFixed(2)
  return {
    layerId: layer.id, name: layer.name, category: layer.category, source: layer.source,
    wastePct, rawQty: +rawQty.toFixed(3), purchaseQty, unit: layer.unit, unitCost: layer.unitCost, cost,
  }
}

export function calculateWallCost(input: WallInput, layers: AssemblyLayerDef[]): WallCostResult {
  const geometry = calculateWallGeometry(input)
  const lines = layers.map(l => costLayer(l, resolveRawQty(l, geometry)))
  const totalCost = +lines.reduce((s, l) => s + l.cost, 0).toFixed(2)
  return { geometry, lines, totalCost }
}

// ── Masonry module — a blockwork/brickwork partition. Coursing (block count over the net
// area) replaces stud spacing, and a lintel spans each opening the way a header does for a
// framed wall — but there's no stud/plate/noggin framing at all. Reuses costLayer unchanged;
// only this geometry function and resolveMasonryRawQty are specific to this construction
// method, exactly as the module comment at the top of this file describes.

export interface MasonryWallInput {
  lengthMm: number
  heightMm: number
  blockLengthMm?: number // coordinating size incl. one mortar joint; default 450mm (a standard block)
  blockHeightMm?: number // coordinating size incl. one mortar joint; default 225mm (a standard block)
  lintelBearingMm?: number // bearing each side of an opening; default 150mm — confirm on site
  openings: AssemblyOpening[]
}

export interface MasonryWallGeometry {
  grossAreaM2: number
  openingAreaM2: number
  netAreaM2: number
  blockCount: number
  lintels: { openingId: string; spanMm: number }[]
  warnings: string[]
}

export interface MasonryWallCostResult {
  geometry: MasonryWallGeometry
  lines: CostedLine[]
  totalCost: number
}

export function calculateMasonryGeometry(input: MasonryWallInput): MasonryWallGeometry {
  const { lengthMm: L, heightMm: H, openings } = input
  const blockLengthMm = input.blockLengthMm ?? 450
  const blockHeightMm = input.blockHeightMm ?? 225
  const bearing = input.lintelBearingMm ?? 150
  const warnings: string[] = []

  if (L <= 0 || H <= 0) throw new Error('Wall length and height must be greater than zero.')
  if (blockLengthMm <= 0 || blockHeightMm <= 0) throw new Error('Block size must be greater than zero.')

  const grossAreaM2 = toM(L) * toM(H)
  const openingAreaM2 = openings.reduce((s, o) => s + toM(o.widthMm) * toM(o.heightMm), 0)
  const netAreaM2 = Math.max(0, grossAreaM2 - openingAreaM2)

  const blockAreaM2 = toM(blockLengthMm) * toM(blockHeightMm)
  const blockCount = netAreaM2 / blockAreaM2

  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)
  const lintels: { openingId: string; spanMm: number }[] = []
  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]
    if (o.offsetMm < 0 || o.offsetMm + o.widthMm > L) {
      warnings.push(`Opening "${o.id}" falls outside the wall — check its offset and width.`)
    }
    if (o.sillHeightMm + o.heightMm > H) {
      warnings.push(`Opening "${o.id}" is taller than the wall above its sill — check sill height.`)
    }
    const next = sorted[i + 1]
    if (next && o.offsetMm + o.widthMm > next.offsetMm) {
      warnings.push(`Openings "${o.id}" and "${next.id}" overlap — check offsets and widths.`)
    }
    lintels.push({ openingId: o.id, spanMm: o.widthMm + bearing * 2 })
  }

  return { grossAreaM2, openingAreaM2, netAreaM2, blockCount, lintels, warnings }
}

function resolveMasonryRawQty(layer: AssemblyLayerDef, geometry: MasonryWallGeometry): number {
  switch (layer.source) {
    case 'netAreaM2':   return geometry.netAreaM2
    case 'grossAreaM2': return geometry.grossAreaM2
    case 'blockCount':  return geometry.blockCount
    case 'lintelCount': return geometry.lintels.length
    case 'fixed':
      if (layer.fixedQty == null) throw new Error(`Layer "${layer.name}" uses a fixed quantity but none was given.`)
      return layer.fixedQty
    default:
      throw new Error(`Layer "${layer.name}" uses a source ("${layer.source}") the masonry module doesn't support.`)
  }
}

export function calculateMasonryWallCost(input: MasonryWallInput, layers: AssemblyLayerDef[]): MasonryWallCostResult {
  const geometry = calculateMasonryGeometry(input)
  const lines = layers.map(l => costLayer(l, resolveMasonryRawQty(l, geometry)))
  const totalCost = +lines.reduce((s, l) => s + l.cost, 0).toFixed(2)
  return { geometry, lines, totalCost }
}
