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
  | 'lengthM'     // the wall's run — for a DPC course, coping, or anything else priced per linear metre
  | 'fixed'

// The cavity wall module's quantities (DPC to wall plate — see calculateCavityGeometry below).
export type CavityQuantitySource =
  | 'netAreaM2'
  | 'grossAreaM2'
  | 'lengthM'
  | 'innerBlockCount'
  | 'outerBlockCount'
  | 'brickCount'
  | 'tieCount'
  | 'steelCavityLintelCount'
  | 'concreteLintelCount'
  | 'steelAngleCount'
  | 'trayCount'      // separate cavity trays — one per opening whose lintel doesn't carry its own
  | 'weepCount'      // weep vents over every opening
  | 'closerLm'       // cavity closers down each opening's two reveals
  | 'headClosureLm'  // closing the cavity along the top of the wall
  | 'wallPlateLm'
  | 'strapCount'     // roof restraint straps along the wall plate
  | 'fixed'

// Every AssemblyLayerDef/CostedLine carries a `source` from whichever module built it —
// widen this union rather than the wall module's own WallQuantitySource as more modules
// (roof, foundations, ...) get their own quantity kinds. (SolidBlockQuantitySource and
// TimberFrameQuantitySource are declared beside their own modules further down.)
export type AssemblyQuantitySource = WallQuantitySource | MasonryQuantitySource | CavityQuantitySource | SolidBlockQuantitySource | TimberFrameQuantitySource

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
  lengthM: number
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

  return { lengthM: toM(L), grossAreaM2, openingAreaM2, netAreaM2, blockCount, lintels, warnings }
}

function resolveMasonryRawQty(layer: AssemblyLayerDef, geometry: MasonryWallGeometry): number {
  switch (layer.source) {
    case 'netAreaM2':   return geometry.netAreaM2
    case 'grossAreaM2': return geometry.grossAreaM2
    case 'blockCount':  return geometry.blockCount
    case 'lintelCount': return geometry.lintels.length
    case 'lengthM':     return geometry.lengthM
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

// ── Cavity wall module — external cavity wall from DPC up to the wall plate. Two masonry
// leaves either side of an adjustable cavity: an inner block leaf, and an outer leaf that's
// either facing brick or block (block/block walls take a render or similar finish, priced by
// the calculator screen). The cavity can be empty, partly filled with rigid board, or fully
// filled with mineral wool. Each opening carries its own lintel type, which decides what gets
// bought (one steel cavity lintel, two concrete lintels, or a concrete inner lintel plus a
// steel angle carrying the brick). Everything below the DPC is a separate calculator.
//
// This module counts and prices what's drawn. It does not size lintels, design ties, or check
// the wall against Building Regulations — those stay with the designer/engineer/manufacturer.
// The few defaults here (2.5 ties per m², 900mm weep spacing, ties at 300mm down reveals) are
// the usual site practice, so the quantities land where a bricklayer's take-off would.
//
// Reuses costLayer unchanged; only this geometry function and resolveCavityRawQty are
// specific to the construction method.

export type CavityLeafType = 'brick' | 'block'
export type CavityInsulationType = 'none' | 'pir' | 'wool'
export type LintelType = 'steel-cavity' | 'concrete-pair' | 'concrete-steel-angle'

export interface CavityOpening extends AssemblyOpening {
  lintelType: LintelType
}

export interface CavityWallInput {
  lengthMm: number
  heightMm: number            // DPC to wall plate
  outerLeaf: CavityLeafType
  innerLeafThicknessMm: number // 100 or 140
  cavityWidthMm: number
  insulation: CavityInsulationType
  insulationThicknessMm?: number // rigid board only — a full fill always fills the cavity
  openings: CavityOpening[]
  blockLengthMm?: number  // coordinating size incl. one mortar joint; default 450
  blockHeightMm?: number  // default 225
  brickLengthMm?: number  // coordinating size incl. one mortar joint; default 225 (215 + 10)
  brickHeightMm?: number  // default 75 (65 + 10)
  lintelBearingMm?: number // bearing each side of an opening; default 150 — confirm on site
}

export const BRICK_OUTER_LEAF_MM = 102.5
export const BLOCK_OUTER_LEAF_MM = 100
export const TIES_PER_M2 = 2.5
const STANDARD_TIE_LENGTHS_MM = [200, 225, 250, 275, 300]

export interface CavityWallGeometry {
  lengthM: number
  grossAreaM2: number
  openingAreaM2: number
  netAreaM2: number
  innerBlockCount: number
  outerBlockCount: number
  brickCount: number
  outerLeafThicknessMm: number
  insulationThicknessMm: number
  retainedCavityMm: number
  overallThicknessMm: number
  tieCount: number
  tieLengthMm: number
  lintels: { openingId: string; lintelType: LintelType; spanMm: number }[]
  steelCavityLintels: number
  concreteLintels: number
  steelAngles: number
  trayCount: number
  weepCount: number
  closerLm: number
  headClosureLm: number
  wallPlateLm: number
  strapCount: number
  warnings: string[]
}

export function calculateCavityGeometry(input: CavityWallInput): CavityWallGeometry {
  const { lengthMm: L, heightMm: H, openings } = input
  const blockLengthMm = input.blockLengthMm ?? 450
  const blockHeightMm = input.blockHeightMm ?? 225
  const brickLengthMm = input.brickLengthMm ?? 225
  const brickHeightMm = input.brickHeightMm ?? 75
  const bearing = input.lintelBearingMm ?? 150
  const cavity = input.cavityWidthMm
  const warnings: string[] = []

  if (L <= 0 || H <= 0) throw new Error('Wall length and height must be greater than zero.')
  if (cavity <= 0) throw new Error('Cavity width must be greater than zero.')
  if (input.innerLeafThicknessMm <= 0) throw new Error('Inner leaf thickness must be greater than zero.')
  if (blockLengthMm <= 0 || blockHeightMm <= 0 || brickLengthMm <= 0 || brickHeightMm <= 0) {
    throw new Error('Block and brick sizes must be greater than zero.')
  }

  const grossAreaM2 = toM(L) * toM(H)
  const openingAreaM2 = openings.reduce((s, o) => s + toM(o.widthMm) * toM(o.heightMm), 0)
  const netAreaM2 = Math.max(0, grossAreaM2 - openingAreaM2)

  const blockAreaM2 = toM(blockLengthMm) * toM(blockHeightMm)
  const brickAreaM2 = toM(brickLengthMm) * toM(brickHeightMm)
  const innerBlockCount = netAreaM2 / blockAreaM2
  const outerBlockCount = input.outerLeaf === 'block' ? netAreaM2 / blockAreaM2 : 0
  const brickCount = input.outerLeaf === 'brick' ? netAreaM2 / brickAreaM2 : 0

  const outerLeafThicknessMm = input.outerLeaf === 'brick' ? BRICK_OUTER_LEAF_MM : BLOCK_OUTER_LEAF_MM
  let insulationThicknessMm = 0
  if (input.insulation === 'wool') insulationThicknessMm = cavity
  else if (input.insulation === 'pir') {
    const wanted = input.insulationThicknessMm ?? 75
    insulationThicknessMm = Math.min(wanted, cavity)
    if (wanted > cavity) warnings.push(`The insulation board (${wanted}mm) is thicker than the cavity (${cavity}mm) — it's been limited to the cavity width.`)
  }
  const retainedCavityMm = cavity - insulationThicknessMm
  if (input.insulation === 'pir' && retainedCavityMm < 50) {
    warnings.push(`Partial fill leaves only ${retainedCavityMm}mm of clear cavity — usually at least 50mm is kept clear. Widen the cavity or use thinner board.`)
  }

  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)
  const lintels: CavityWallGeometry['lintels'] = []
  let steelCavityLintels = 0, concreteLintels = 0, steelAngles = 0
  let trayCount = 0, weepCount = 0, closerLm = 0, revealTies = 0

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

    lintels.push({ openingId: o.id, lintelType: o.lintelType, spanMm: o.widthMm + bearing * 2 })
    switch (o.lintelType) {
      case 'steel-cavity':
        steelCavityLintels += 1
        break
      case 'concrete-pair':
        concreteLintels += 2 // one under each leaf
        trayCount += 1
        break
      case 'concrete-steel-angle':
        concreteLintels += 1 // inner leaf
        steelAngles += 1     // carries the brick/block outer leaf
        trayCount += 1
        break
    }

    // A tray runs the length of the lintel; weep vents at 900mm centres, never fewer than two.
    const trayLengthMm = o.widthMm + bearing * 2
    weepCount += Math.max(2, Math.ceil(trayLengthMm / 900) + 1)

    // Cavity closer down both reveals, and extra ties at 300mm centres up each reveal.
    closerLm += (2 * o.heightMm) / 1000
    revealTies += 2 * (Math.ceil(o.heightMm / 300) + 1)
  }

  const tieCount = Math.ceil(netAreaM2 * TIES_PER_M2 + revealTies)
  // Ties are bedded 50mm into each leaf, so the tie is the cavity plus 100mm, rounded up to a
  // stocked length.
  const tieLengthMm = STANDARD_TIE_LENGTHS_MM.find(v => v >= cavity + 100) ?? cavity + 100

  return {
    lengthM: toM(L), grossAreaM2, openingAreaM2, netAreaM2,
    innerBlockCount, outerBlockCount, brickCount,
    outerLeafThicknessMm, insulationThicknessMm, retainedCavityMm,
    overallThicknessMm: input.innerLeafThicknessMm + cavity + outerLeafThicknessMm,
    tieCount, tieLengthMm,
    lintels, steelCavityLintels, concreteLintels, steelAngles,
    trayCount, weepCount, closerLm: +closerLm.toFixed(2),
    headClosureLm: toM(L), wallPlateLm: toM(L),
    strapCount: Math.ceil(L / 2000) + 1,
    warnings,
  }
}

function resolveCavityRawQty(layer: AssemblyLayerDef, g: CavityWallGeometry): number {
  switch (layer.source) {
    case 'netAreaM2':              return g.netAreaM2
    case 'grossAreaM2':            return g.grossAreaM2
    case 'lengthM':                return g.lengthM
    case 'innerBlockCount':        return g.innerBlockCount
    case 'outerBlockCount':        return g.outerBlockCount
    case 'brickCount':             return g.brickCount
    case 'tieCount':               return g.tieCount
    case 'steelCavityLintelCount': return g.steelCavityLintels
    case 'concreteLintelCount':    return g.concreteLintels
    case 'steelAngleCount':        return g.steelAngles
    case 'trayCount':              return g.trayCount
    case 'weepCount':              return g.weepCount
    case 'closerLm':               return g.closerLm
    case 'headClosureLm':          return g.headClosureLm
    case 'wallPlateLm':            return g.wallPlateLm
    case 'strapCount':             return g.strapCount
    case 'fixed':
      if (layer.fixedQty == null) throw new Error(`Layer "${layer.name}" uses a fixed quantity but none was given.`)
      return layer.fixedQty
    default:
      throw new Error(`Layer "${layer.name}" uses a source ("${layer.source}") the cavity wall module doesn't support.`)
  }
}

export interface CavityWallCostResult {
  geometry: CavityWallGeometry
  lines: CostedLine[]
  totalCost: number
}

export function calculateCavityWallCost(input: CavityWallInput, layers: AssemblyLayerDef[]): CavityWallCostResult {
  const geometry = calculateCavityGeometry(input)
  const lines = layers.map(l => costLayer(l, resolveCavityRawQty(l, geometry)))
  const totalCost = +lines.reduce((s, l) => s + l.cost, 0).toFixed(2)
  return { geometry, lines, totalCost }
}

// ── Solid block wall module — an external single-leaf blockwork wall (no cavity). The block is
// laid one of two ways, which decides the wall's thickness and the coursing:
//   - on its side (the standard way): a 100mm block gives a 100mm wall, in 215mm courses;
//   - flat: the block's 215mm height becomes the wall thickness, a 215mm wall built up in
//     100mm courses (140mm blocks give 140mm courses).
// Piers are optional — attached to the outside face, or to both — at a chosen spacing, with
// blocks added course by course. Openings each get a lintel. Optional extras are movement
// joints, bed-joint reinforcement, and coping with a cap on each pier.
//
// Counts and prices only: no wall-stability or pier design check — that stays with the
// designer/engineer. Reuses costLayer unchanged.

export type BlockLaid = 'side' | 'flat'

export interface SolidBlockWallInput {
  lengthMm: number
  heightMm: number
  blockWidthMm: number         // the block's thin dimension — 100 or 140
  laid: BlockLaid
  openings: AssemblyOpening[]
  blockLengthMm?: number       // default 440
  blockHeightMm?: number       // default 215
  lintelBearingMm?: number     // bearing each side of an opening; default 150 — confirm on site
  pierSpacingMm?: number       // maximum centres between piers; 0/absent = no piers
  pierWidthMm?: number         // along the wall; default 440
  pierProjectionMm?: number    // beyond the wall face; default 215
  pierFaces?: 1 | 2            // 1 = outside face only, 2 = both faces; default 1
  pierAtEnds?: boolean         // a pier at each end of the wall; default true
  movementJointSpacingMm?: number // 0/absent = none
  reinforceEveryNCourses?: number // 0/absent = none
}

export interface SolidBlockWallGeometry {
  lengthM: number
  grossAreaM2: number
  openingAreaM2: number
  netAreaM2: number
  thicknessMm: number
  courseHeightMm: number       // block height including one mortar joint
  courseCount: number
  wallBlockCount: number
  pierCount: number
  pierBlockCount: number
  blockCount: number           // wall + piers
  /** Wall area plus the equivalent face area of the pier blocks — what mortar is worked out over. */
  mortarAreaM2: number
  /** Mortar per m² of blockwork for this coursing — thicker/flatter walls use much more. */
  mortarM3PerM2: number
  externalFaceAreaM2: number   // wall face + pier faces on the outside
  internalFaceAreaM2: number
  lintels: { openingId: string; spanMm: number }[]
  reinforcementLm: number
  movementJointCount: number
  movementJointLm: number
  pierCapCount: number
  warnings: string[]
}

export type SolidBlockQuantitySource =
  | 'netAreaM2'
  | 'grossAreaM2'
  | 'lengthM'
  | 'blockCount'
  | 'lintelCount'
  | 'mortarAreaM2'
  | 'externalFaceAreaM2'
  | 'internalFaceAreaM2'
  | 'reinforcementLm'
  | 'movementJointLm'
  | 'pierCapCount'
  | 'fixed'

export function calculateSolidBlockGeometry(input: SolidBlockWallInput): SolidBlockWallGeometry {
  const { lengthMm: L, heightMm: H, openings } = input
  const blockLengthMm = input.blockLengthMm ?? 440
  const blockHeightMm = input.blockHeightMm ?? 215
  const W = input.blockWidthMm
  const bearing = input.lintelBearingMm ?? 150
  const warnings: string[] = []

  if (L <= 0 || H <= 0) throw new Error('Wall length and height must be greater than zero.')
  if (W <= 0 || blockLengthMm <= 0 || blockHeightMm <= 0) throw new Error('Block size must be greater than zero.')

  // Which block dimension runs through the wall, and which stands vertical.
  const thicknessMm = input.laid === 'flat' ? blockHeightMm : W
  const verticalMm = input.laid === 'flat' ? W : blockHeightMm
  const coordAlongMm = blockLengthMm + 10   // block length + one mortar joint
  const courseHeightMm = verticalMm + 10

  const grossAreaM2 = toM(L) * toM(H)
  const openingAreaM2 = openings.reduce((s, o) => s + toM(o.widthMm) * toM(o.heightMm), 0)
  const netAreaM2 = Math.max(0, grossAreaM2 - openingAreaM2)

  const blockFaceM2 = toM(coordAlongMm) * toM(courseHeightMm)
  const wallBlockCount = netAreaM2 / blockFaceM2
  const courseCount = Math.ceil(H / courseHeightMm)

  // Piers
  const spacing = input.pierSpacingMm ?? 0
  const pierWidth = input.pierWidthMm ?? 440
  const projection = input.pierProjectionMm ?? 215
  const faces = input.pierFaces ?? 1
  const atEnds = input.pierAtEnds ?? true
  let pierCount = 0
  if (spacing > 0) {
    pierCount = atEnds ? Math.ceil(L / spacing) + 1 : Math.max(0, Math.ceil(L / spacing) - 1)
  }
  // Extra plan area a pier adds beyond the wall, over the plan footprint of one block, rounded
  // up to whole blocks per course.
  const blockPlanMm2 = coordAlongMm * (thicknessMm + 10)
  const blocksPerPierCourse = pierCount > 0 && projection > 0 && pierWidth > 0
    ? Math.ceil((pierWidth * projection * faces) / blockPlanMm2)
    : 0
  const pierBlockCount = pierCount * courseCount * blocksPerPierCourse
  const pierFaceAreaM2 = pierCount * toM(pierWidth + 2 * projection) * toM(H)

  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)
  const lintels: SolidBlockWallGeometry['lintels'] = []
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

  // Mortar: bed joints along every course plus the cross joints between blocks, scaled by 1.98
  // to match the calibrated 0.013 m³/m² the masonry calculator uses for a 100mm block (it
  // allows for waste, frogs and squeeze-out — see AssemblyMasonryWallDemo).
  const tM = toM(thicknessMm), vM = toM(verticalMm)
  const bed = (tM * 0.010) / toM(courseHeightMm)
  const cross = (0.010 * tM * vM) / blockFaceM2
  const mortarM3PerM2 = +((bed + cross) * 1.98).toFixed(5)

  const reinforceN = input.reinforceEveryNCourses ?? 0
  const reinforcementLm = reinforceN > 0 ? +(Math.floor(courseCount / reinforceN) * toM(L)).toFixed(2) : 0
  const mjSpacing = input.movementJointSpacingMm ?? 0
  const movementJointCount = mjSpacing > 0 ? Math.max(0, Math.floor((L - 1) / mjSpacing)) : 0

  return {
    lengthM: toM(L), grossAreaM2, openingAreaM2, netAreaM2,
    thicknessMm, courseHeightMm, courseCount,
    wallBlockCount, pierCount, pierBlockCount,
    blockCount: wallBlockCount + pierBlockCount,
    mortarAreaM2: netAreaM2 + pierBlockCount * blockFaceM2,
    mortarM3PerM2,
    externalFaceAreaM2: netAreaM2 + pierFaceAreaM2,
    internalFaceAreaM2: netAreaM2 + (faces === 2 ? pierFaceAreaM2 : 0),
    lintels, reinforcementLm,
    movementJointCount, movementJointLm: +(movementJointCount * toM(H)).toFixed(2),
    pierCapCount: pierCount,
    warnings,
  }
}

function resolveSolidBlockRawQty(layer: AssemblyLayerDef, g: SolidBlockWallGeometry): number {
  switch (layer.source) {
    case 'netAreaM2':          return g.netAreaM2
    case 'grossAreaM2':        return g.grossAreaM2
    case 'lengthM':            return g.lengthM
    case 'blockCount':         return g.blockCount
    case 'lintelCount':        return g.lintels.length
    case 'mortarAreaM2':       return g.mortarAreaM2
    case 'externalFaceAreaM2': return g.externalFaceAreaM2
    case 'internalFaceAreaM2': return g.internalFaceAreaM2
    case 'reinforcementLm':    return g.reinforcementLm
    case 'movementJointLm':    return g.movementJointLm
    case 'pierCapCount':       return g.pierCapCount
    case 'fixed':
      if (layer.fixedQty == null) throw new Error(`Layer "${layer.name}" uses a fixed quantity but none was given.`)
      return layer.fixedQty
    default:
      throw new Error(`Layer "${layer.name}" uses a source ("${layer.source}") the solid block wall module doesn't support.`)
  }
}

export interface SolidBlockWallCostResult {
  geometry: SolidBlockWallGeometry
  lines: CostedLine[]
  totalCost: number
}

export function calculateSolidBlockWallCost(input: SolidBlockWallInput, layers: AssemblyLayerDef[]): SolidBlockWallCostResult {
  const geometry = calculateSolidBlockGeometry(input)
  const lines = layers.map(l => costLayer(l, resolveSolidBlockRawQty(l, geometry)))
  const totalCost = +lines.reduce((s, l) => s + l.cost, 0).toFixed(2)
  return { geometry, lines, totalCost }
}

// ── Timber frame wall module — an external timber stud wall (garden room, outbuilding, ...).
// The framing (studs at centres, doubled studs + header around each opening, plates, noggins)
// comes from calculateWallGeometry unchanged; this module adds what an EXTERNAL wall needs on
// top of it, and works timber out in linear metres rather than counting studs as "full height":
//   - stud/cripple lengths that reflect the plates, and openings (a jack stud stops at the
//     header, a sill cripple at the sill), so timber is priced by the metre actually used
//   - extra studs at any external corner on this wall's ends
//   - header timber as doubled members
//   - cavity battens under the cladding, plus horizontal counter-battens when the boards run
//     vertically
//   - corner trims and opening reveal/cill trims
// Everything else (sheathing, membrane, cladding, insulation, VCL, lining) is priced off the
// wall's area, so it needs no geometry of its own.
//
// Counts and prices only — no structural design (bracing, uplift, lintel sizes). Cripple lengths
// are approximate, same Stage-1 simplification as the framed-wall module above. Reuses
// costLayer unchanged.

export type CladdingOrientation = 'horizontal' | 'vertical'

export interface TimberFrameWallInput {
  lengthMm: number
  heightMm: number              // overall frame height, plates included
  studCentresMm: number
  studThicknessMm?: number      // the stud's narrow face (38/45/50) — also the plate thickness; default 50
  doubleTopPlate?: boolean
  headerBearingMm?: number
  headerDepthMm?: number        // default 140 — takes depth off the head cripples
  nogginRows?: number
  cornerEnds?: 0 | 1 | 2        // ends of this wall that are external corners; default 0
  battenCentresMm?: number      // default 600
  claddingOrientation?: CladdingOrientation // default 'horizontal'
  openings: AssemblyOpening[]
}

export interface TimberFrameWallGeometry extends WallGeometry {
  lengthM: number
  studLengthMm: number         // a full-height stud, between the plates
  studLm: number               // every stud, king, jack, cripple and corner stud, by length
  cornerStuds: number
  headerLm: number             // doubled members
  cornerTrimLm: number
  battenLm: number             // vertical cavity battens
  counterBattenLm: number      // horizontal counter-battens — only when the boards run vertically
  openingPerimeterLm: number   // reveal and cill trim around every opening
}

export type TimberFrameQuantitySource =
  | 'netAreaM2'
  | 'grossAreaM2'
  | 'lengthM'
  | 'plateLm'
  | 'studLm'
  | 'nogginCount'
  | 'headerLm'
  | 'cornerTrimLm'
  | 'battenLm'
  | 'counterBattenLm'
  | 'openingPerimeterLm'
  | 'fixed'

export function calculateTimberFrameGeometry(input: TimberFrameWallInput): TimberFrameWallGeometry {
  const { lengthMm: L, heightMm: H, studCentresMm: C, openings } = input
  const T = input.studThicknessMm ?? 50
  const headerDepth = input.headerDepthMm ?? 140
  const cornerEnds = input.cornerEnds ?? 0
  const battenCentres = input.battenCentresMm ?? 600

  const base = calculateWallGeometry({
    lengthMm: L, heightMm: H, studCentresMm: C, doubleTopPlate: input.doubleTopPlate,
    headerBearingMm: input.headerBearingMm, nogginRows: input.nogginRows, openings,
  })
  const warnings = [...base.warnings]
  if (battenCentres <= 0) throw new Error('Batten centres must be greater than zero.')

  // Stud length between the sole plate and the underside of the top plate(s).
  const topPlates = input.doubleTopPlate ? 2 : 1
  const studLengthMm = H - T * (1 + topPlates)
  if (studLengthMm <= 0) throw new Error('Wall height is too low for the plates — check the height.')
  const studTopMm = H - T * topPlates // height above the floor of the underside of the top plate(s)

  // Studs by length. Field studs and king studs run full length; each opening's jack studs stop
  // at the header's underside, its sill cripples (windows only) fill below the sill, and its
  // head cripples fill between the header and the top plate — the same counts as the framed-wall
  // module, priced at their real lengths instead of as full studs.
  let studMm = Math.max(0, base.fieldStudsBeforeOpenings - base.studsDisplacedByOpenings) * studLengthMm
  studMm += base.kingStuds * studLengthMm
  for (const o of openings) {
    const headUnderside = o.sillHeightMm + o.heightMm
    studMm += 2 * Math.max(0, headUnderside - T)
    const crippleSpan = Math.max(0, Math.floor(o.widthMm / C) - 1)
    if (o.sillHeightMm > 0) studMm += crippleSpan * Math.max(0, o.sillHeightMm - T)
    studMm += crippleSpan * Math.max(0, studTopMm - headUnderside - headerDepth)
  }
  // A corner is three studs where a plain end is one — two extra per external corner.
  const cornerStuds = cornerEnds * 2
  studMm += cornerStuds * studLengthMm

  const headerLm = +(base.headers.reduce((s, h) => s + toM(h.spanMm), 0) * 2).toFixed(3)
  const openingPerimeterLm = +openings.reduce((s, o) => {
    const sill = o.sillHeightMm > 0 ? toM(o.widthMm) : 0 // a door has no sill
    return s + 2 * toM(o.heightMm) + toM(o.widthMm) + sill
  }, 0).toFixed(3)

  const battenLm = +(base.netAreaM2 / toM(battenCentres)).toFixed(3)
  const counterBattenLm = (input.claddingOrientation ?? 'horizontal') === 'vertical' ? battenLm : 0

  return {
    ...base,
    warnings,
    lengthM: toM(L),
    studLengthMm,
    studLm: +toM(studMm).toFixed(3),
    cornerStuds,
    headerLm,
    cornerTrimLm: +(cornerEnds * toM(H)).toFixed(3),
    battenLm,
    counterBattenLm,
    openingPerimeterLm,
  }
}

function resolveTimberFrameRawQty(layer: AssemblyLayerDef, g: TimberFrameWallGeometry): number {
  switch (layer.source) {
    case 'netAreaM2':          return g.netAreaM2
    case 'grossAreaM2':        return g.grossAreaM2
    case 'lengthM':            return g.lengthM
    case 'plateLm':            return g.plateLm
    case 'studLm':             return g.studLm
    case 'nogginCount':        return g.nogginCount
    case 'headerLm':           return g.headerLm
    case 'cornerTrimLm':       return g.cornerTrimLm
    case 'battenLm':           return g.battenLm
    case 'counterBattenLm':    return g.counterBattenLm
    case 'openingPerimeterLm': return g.openingPerimeterLm
    case 'fixed':
      if (layer.fixedQty == null) throw new Error(`Layer "${layer.name}" uses a fixed quantity but none was given.`)
      return layer.fixedQty
    default:
      throw new Error(`Layer "${layer.name}" uses a source ("${layer.source}") the timber frame wall module doesn't support.`)
  }
}

export interface TimberFrameWallCostResult {
  geometry: TimberFrameWallGeometry
  lines: CostedLine[]
  totalCost: number
}

export function calculateTimberFrameWallCost(input: TimberFrameWallInput, layers: AssemblyLayerDef[]): TimberFrameWallCostResult {
  const geometry = calculateTimberFrameGeometry(input)
  const lines = layers.map(l => costLayer(l, resolveTimberFrameRawQty(l, geometry)))
  const totalCost = +lines.reduce((s, l) => s + l.cost, 0).toFixed(2)
  return { geometry, lines, totalCost }
}
