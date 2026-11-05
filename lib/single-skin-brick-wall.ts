// Single skin brick wall with piers: ONE half-brick skin (102.5mm, stretcher bond) stiffened by brick piers, the wall of a single skin garage, an outbuilding, a store or a garden or boundary wall. Facing bricks (or commons
// all through), cement or lime mortar, a pier at each end, at a spacing along the wall and beside the wide openings (a garage door), a lintel or beam over each opening, a DPC under the wall and the piers, and optionally a
// concrete coping and movement joints. Pure: sizes in, priced lines out. It counts and prices what is drawn; it does not design the wall (the pier size and spacing, ties to the roof, the lintels over a wide door and the
// foundation are the designer's), and every rate is a sample typed over in the calculator. The foundation is priced under Foundations and the roof, wall plate and door are priced elsewhere.
//
// Bricks: a 215 x 102.5 x 65 brick with a 10mm joint covers 225 x 75mm of face, so one skin takes 59.26 bricks per m2 of wall. A pier is built on in the same courses: the part that stands out from the wall is its width
// times its projection (the pier's overall depth less the 102.5 skin), and a course of it takes (width x projection) / (225 x 112.5) bricks (a pier 440 wide that projects 112.5 takes about two bricks a course).
// Mortar: the volume less the bricks' own, times 1.35 for waste, squeeze-out and filling the frogs.

import { costLayer, openingsAreaInWallM2, type AssemblyLayerDef, type AssemblyOpening, type CostedLine } from './assembly-calc'
import { BRICK_LENGTH_MM, BRICK_WIDTH_MM, BRICK_HEIGHT_MM, JOINT_MM, BRICKS_PER_SKIN_M2, MORTAR_ALLOWANCE, FACING_BRICK, COMMON_BRICK_COST, BRICK_MORTAR_LABEL, type FacingBrick, type BrickMortar } from './solid-brick-wall'

export const SKIN_MM = BRICK_WIDTH_MM                                   // 102.5: one half-brick skin
const BRICK_COURSE_MM = BRICK_HEIGHT_MM + JOINT_MM                      // 75
const BRICK_PLAN_MM2 = (BRICK_LENGTH_MM + JOINT_MM) * (BRICK_WIDTH_MM + JOINT_MM)   // 225 x 112.5: the plan area a brick takes in a course, with its joints
const BRICK_VOLUME_M3 = (BRICK_LENGTH_MM * BRICK_WIDTH_MM * BRICK_HEIGHT_MM) / 1e9
const toM = (mm: number) => mm / 1000

export { FACING_BRICK, BRICK_MORTAR_LABEL }
export type { FacingBrick, BrickMortar }

/** the brick of the wall and its piers: any of the facing bricks, or commons all through (a wall that is to be rendered or painted, or an outbuilding) */
export type SkinBrick = FacingBrick | 'common'
export const SKIN_BRICK_LABEL: Record<SkinBrick, string> = {
  'stock-new': FACING_BRICK['stock-new'].label, 'stock-reclaimed': FACING_BRICK['stock-reclaimed'].label,
  'machine': FACING_BRICK['machine'].label, 'engineering': FACING_BRICK['engineering'].label, 'common': 'Common bricks (to be rendered or painted)',
}
export const skinBrickCost = (b: SkinBrick) => (b === 'common' ? COMMON_BRICK_COST : FACING_BRICK[b].unitCost)

/** How wide a pier is along the wall: it is built in whole bricks (a brick is 215, a brick and a half 327.5, two bricks 440) */
export type PierWidth = 'one' | 'one-half' | 'two'
export const PIER_WIDTH: Record<PierWidth, { label: string; mm: number }> = {
  'one': { label: 'One brick wide (215mm)', mm: 215 },
  'one-half': { label: 'One and a half bricks wide (327.5mm: three times the wall)', mm: 327.5 },
  'two': { label: 'Two bricks wide (440mm)', mm: 440 },
}
/** How far a pier goes through the wall, overall (the wall's own 102.5 included): it stands out from the wall by the rest */
export type PierDepth = 'one' | 'one-half'
export const PIER_DEPTH: Record<PierDepth, { label: string; mm: number }> = {
  'one': { label: '215mm overall (stands out 112.5mm: two times the wall)', mm: 215 },
  'one-half': { label: '327.5mm overall (stands out 225mm)', mm: 327.5 },
}
export type PierSide = 'inside' | 'outside'
export const PIER_SIDE_LABEL: Record<PierSide, string> = { inside: 'On the inside face', outside: 'On the outside face' }

export type SkinLintel = 'concrete' | 'steel'
export const SKIN_LINTEL_LABEL: Record<SkinLintel, string> = {
  concrete: 'Precast concrete lintel, 100mm (up to 2.4m)',
  steel: 'Steel box lintel or beam (the designer sizes it)',
}
/** an opening wider than this is always priced with a steel lintel or beam */
export const MAX_CONCRETE_LINTEL_SPAN_MM = 2400
/** a pier is built beside every opening at least this wide (a garage door or a wide gate) when asked to */
export const WIDE_OPENING_MM = 1500

export type SkinCoping = 'none' | 'concrete'
export const SKIN_COPING_LABEL: Record<SkinCoping, string> = { none: 'None (the roof or a plate sits on the wall)', concrete: 'Precast concrete coping (a boundary or garden wall)' }

export interface SingleSkinInput {
  lengthMm: number
  heightMm: number
  openings: AssemblyOpening[]
  pierWidth: PierWidth
  pierDepth: PierDepth
  /** a pier at each end of the wall: 0, 1 or 2 (a corner or a stop end) */
  endPiers: 0 | 1 | 2
  /** a pier every this far along the wall (0 = none between the ends) */
  pierSpacingMm: number
  /** a pier each side of every opening at least 1.5m wide */
  piersBesideOpenings: boolean
  /** piers added by hand, not placed on the plan view */
  extraPiers: number
  lintelBearingMm?: number           // bearing each side of an opening; default 150, confirm on site
  movementJointSpacingMm?: number    // 0 / absent = none
}

export interface SingleSkinGeometry {
  lengthM: number
  grossAreaM2: number
  openingAreaM2: number
  netAreaM2: number
  courseCount: number
  wallBricks: number
  pierCount: number
  pierWidthMm: number
  pierProjectionMm: number
  /** where the piers' centres are along the wall, mm from its left end (the ones placed by the rules; hand-added ones have no place) */
  pierXs: number[]
  pierBricksEach: number
  pierBricks: number
  brickCount: number
  wallMortarM3: number
  pierMortarM3: number
  mortarM3: number
  lintels: { openingId: string; spanMm: number; steel: boolean }[]
  concreteLintelLm: number
  steelLintelLm: number
  steelLintelCount: number
  movementJointCount: number
  movementJointLm: number
  warnings: string[]
  notes: string[]
}

export function calculateSingleSkinGeometry(input: SingleSkinInput): SingleSkinGeometry {
  const { lengthMm: L, heightMm: H, openings } = input
  const bearing = input.lintelBearingMm ?? 150
  const warnings: string[] = []
  const notes: string[] = []
  if (!(L > 0) || !(H > 0)) throw new Error('Wall length and height must be greater than zero.')
  const pw = PIER_WIDTH[input.pierWidth], pd = PIER_DEPTH[input.pierDepth]
  if (!pw || !pd) throw new Error('Pick the size of the piers.')
  if (!(input.pierSpacingMm >= 0)) throw new Error('The pier spacing cannot be negative.')
  if (!(input.extraPiers >= 0) || Math.round(input.extraPiers) !== input.extraPiers) throw new Error('Extra piers must be a whole number, 0 or more.')

  const grossAreaM2 = toM(L) * toM(H)
  const openingAreaM2 = openingsAreaInWallM2(openings, L, H)
  const netAreaM2 = Math.max(0, grossAreaM2 - openingAreaM2)
  const courseCount = Math.ceil(H / BRICK_COURSE_MM)

  // the wall: one skin of stretchers
  const wallBricks = netAreaM2 * BRICKS_PER_SKIN_M2
  const wallMortarM3 = netAreaM2 * ((toM(SKIN_MM) - BRICKS_PER_SKIN_M2 * BRICK_VOLUME_M3) * MORTAR_ALLOWANCE)

  // the openings, their lintels and the piers beside them
  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)
  const lintels: SingleSkinGeometry['lintels'] = []
  const pierXs: number[] = []
  const halfPier = pw.mm / 2
  if (input.endPiers >= 1) pierXs.push(halfPier)
  if (input.endPiers === 2) pierXs.push(L - halfPier)
  if (input.pierSpacingMm > 0 && L > input.pierSpacingMm) {
    const bays = Math.ceil(L / input.pierSpacingMm)
    // a pier at the spacing that would stand in an opening is left out (the piers beside the opening hold it)
    for (let k = 1; k < bays; k++) {
      const x = (L * k) / bays
      if (!openings.some(o => x > o.offsetMm - halfPier && x < o.offsetMm + o.widthMm + halfPier)) pierXs.push(x)
    }
  }
  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]
    if (o.offsetMm < 0 || o.offsetMm + o.widthMm > L) warnings.push(`Opening "${o.id}" falls outside the wall — check its offset and width.`)
    if (o.sillHeightMm + o.heightMm > H) warnings.push(`Opening "${o.id}" is taller than the wall above its sill — check sill height.`)
    const next = sorted[i + 1]
    if (next && o.offsetMm + o.widthMm > next.offsetMm) warnings.push(`Openings "${o.id}" and "${next.id}" overlap — check offsets and widths.`)
    const span = o.widthMm + bearing * 2
    lintels.push({ openingId: o.id, spanMm: span, steel: o.widthMm > MAX_CONCRETE_LINTEL_SPAN_MM })
    if (input.piersBesideOpenings && o.widthMm >= WIDE_OPENING_MM) {
      pierXs.push(o.offsetMm - halfPier, o.offsetMm + o.widthMm + halfPier)
    }
  }
  const placed = pierXs.length
  const pierCount = placed + input.extraPiers

  // a pier: the part that stands out from the wall, a course at a time
  const projectionMm = Math.max(0, pd.mm - SKIN_MM)
  const pierBricksEach = courseCount * ((pw.mm * projectionMm) / BRICK_PLAN_MM2)
  const pierBricks = pierBricksEach * pierCount
  const pierVolumeEach = toM(pw.mm) * toM(projectionMm) * toM(H)
  const pierMortarM3 = pierCount * Math.max(0, pierVolumeEach - pierBricksEach * BRICK_VOLUME_M3) * MORTAR_ALLOWANCE

  const concreteLm = lintels.filter(l => !l.steel).reduce((s, l) => s + toM(l.spanMm), 0)
  const steelLm = lintels.filter(l => l.steel).reduce((s, l) => s + toM(l.spanMm), 0)

  const mj = input.movementJointSpacingMm ?? 0
  const movementJointCount = mj > 0 ? Math.max(0, Math.floor((L - 1) / mj)) : 0

  // what to look at
  if (input.pierSpacingMm > 3000) warnings.push('Piers more than about 3m apart: the designer needs to confirm the pier size and spacing for a half-brick wall.')
  if (H > 2700) warnings.push('A half-brick wall this high relies on its piers and on being tied to the roof and the foundation: the designer needs to confirm it is stable.')
  if (pierCount === 0 && L > 3000) warnings.push('A half-brick wall this long with no piers is not stable on its own: add piers, or have the designer confirm it.')
  for (const l of lintels) if (l.steel && input.pierWidth === 'one') warnings.push(`The opening "${l.openingId}" is wide: its steel lintel or beam needs a proper bearing on a pier, and a one brick wide pier may be too narrow: the designer decides.`)
  if (lintels.some(l => l.steel)) notes.push('Openings wider than 2.4m are priced with a steel lintel or beam, with padstones: the section is the designer\'s choice, the calculator only prices it.')
  notes.push('A single skin (half-brick) wall is not insulated and is not weathertight enough for a heated or lived-in room. It suits a garage, store or outbuilding; if the building is ever to be habitable it needs a different wall (a cavity wall) or insulation.')
  notes.push('Not in this line: the foundation (Foundations), the wall plate, roof and door (Roof, Windows & Doors), and plastering or painting inside.')

  return {
    lengthM: toM(L), grossAreaM2, openingAreaM2, netAreaM2, courseCount,
    wallBricks, pierCount, pierWidthMm: pw.mm, pierProjectionMm: projectionMm, pierXs: pierXs.sort((a, b) => a - b), pierBricksEach, pierBricks, brickCount: wallBricks + pierBricks,
    wallMortarM3, pierMortarM3, mortarM3: wallMortarM3 + pierMortarM3,
    lintels, concreteLintelLm: +concreteLm.toFixed(3), steelLintelLm: +steelLm.toFixed(3), steelLintelCount: lintels.filter(l => l.steel).length,
    movementJointCount, movementJointLm: +(movementJointCount * toM(H)).toFixed(2),
    warnings, notes,
  }
}

export interface SingleSkinLayerOpts {
  wastePct: number
  brick: SkinBrick
  mortar: BrickMortar
  lintel: SkinLintel
  coping: SkinCoping
  /** the concrete lintel the calculator was told to use is also used for any opening up to 2.4m; this only matters for wording */
  pierWidthMm: number
}

const MORTAR_MIX: Record<BrickMortar, { binderBags: number; sandT: number; binderName: string; binderCost: number }> = {
  lime: { binderBags: 11, sandT: 1.6, binderName: 'NHL 3.5 natural hydraulic lime (25kg bag)', binderCost: 11.5 },
  cement: { binderBags: 13, sandT: 1.5, binderName: 'Cement (25kg bag)', binderCost: 6.5 },
}
const CONCRETE_LINTEL_PER_M = 22        // £/m: a 100mm precast lintel
const STEEL_LINTEL_PER_M = 78
const PADSTONE_EACH = 28
const DPC_WALL_PER_M = 1.9              // £/m: 100mm DPC
const DPC_PIER_PER_M = 4.4              // £/m: 215mm DPC (cut to a pier's width)
const COPING_PER_M = 16
const MOVEMENT_JOINT_PER_M = 4.5

/** The priced lines, every quantity fixed from the geometry. The estimator's typed rates replace the sample unit costs by layer id. */
export function buildSingleSkinLayers(g: SingleSkinGeometry, o: SingleSkinLayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const mix = MORTAR_MIX[o.mortar]
  const cost = skinBrickCost(o.brick)
  const what = o.brick === 'common' ? 'Common bricks' : `Facing bricks: ${FACING_BRICK[o.brick].label}`
  const layers: AssemblyLayerDef[] = [
    { id: 'wall_bricks', name: `${what} (the wall, one skin)`, category: 'materials', source: 'fixed', fixedQty: g.wallBricks, unit: 'nr', unitCost: cost, roundToWhole: true, wastePct: w },
  ]
  if (g.pierBricks > 0) layers.push({ id: 'pier_bricks', name: `${what} (${g.pierCount} pier${g.pierCount === 1 ? '' : 's'})`, category: 'materials', source: 'fixed', fixedQty: g.pierBricks, unit: 'nr', unitCost: cost, roundToWhole: true, wastePct: w })
  // the mortar allowance already covers waste, so the mortar lines carry none of their own
  layers.push(
    { id: 'mortar_binder', name: mix.binderName + ' (mortar)', category: 'materials', source: 'fixed', fixedQty: g.mortarM3, unit: 'bag', unitCost: mix.binderCost, coveragePerUnit: +(1 / mix.binderBags).toFixed(4), roundToWhole: true },
    { id: 'mortar_sand', name: 'Building sand (mortar mix)', category: 'materials', source: 'fixed', fixedQty: g.mortarM3, unit: 'tonne', unitCost: 32, coveragePerUnit: +(1 / mix.sandT).toFixed(4) },
  )
  // over the openings: a precast lintel up to 2.4m (or a steel one if asked), always steel over a wider opening
  const concrete = o.lintel === 'concrete' ? g.concreteLintelLm : 0
  const steelLm = g.steelLintelLm + (o.lintel === 'steel' ? g.concreteLintelLm : 0)
  const steelCount = g.steelLintelCount + (o.lintel === 'steel' ? g.lintels.filter(l => !l.steel).length : 0)
  if (concrete > 0) layers.push({ id: 'lintel', name: 'Precast concrete lintels, 100mm (over the openings)', category: 'materials', source: 'fixed', fixedQty: concrete, unit: 'm', unitCost: CONCRETE_LINTEL_PER_M })
  if (steelLm > 0) {
    layers.push(
      { id: 'lintel_steel', name: 'Steel box lintel / beam over the openings (designer to size)', category: 'materials', source: 'fixed', fixedQty: steelLm, unit: 'm', unitCost: STEEL_LINTEL_PER_M },
      { id: 'padstones', name: 'Concrete padstones (2 per steel lintel)', category: 'materials', source: 'fixed', fixedQty: steelCount * 2, unit: 'nr', unitCost: PADSTONE_EACH, roundToWhole: true },
    )
  }
  layers.push({ id: 'dpc', name: 'DPC 100mm wide (under the wall)', category: 'materials', source: 'fixed', fixedQty: g.lengthM, unit: 'm', unitCost: DPC_WALL_PER_M, wastePct: w })
  if (g.pierCount > 0) layers.push({ id: 'dpc_piers', name: 'DPC cut to the piers (under each pier)', category: 'materials', source: 'fixed', fixedQty: g.pierCount * toM(g.pierWidthMm), unit: 'm', unitCost: DPC_PIER_PER_M, wastePct: w })
  if (o.coping === 'concrete') layers.push({ id: 'coping', name: 'Precast concrete coping (top of the wall)', category: 'materials', source: 'fixed', fixedQty: g.lengthM, unit: 'm', unitCost: COPING_PER_M, wastePct: w })
  if (g.movementJointLm > 0) layers.push({ id: 'movement_joints', name: 'Movement joint (filler + sealant)', category: 'materials', source: 'fixed', fixedQty: g.movementJointLm, unit: 'm', unitCost: MOVEMENT_JOINT_PER_M, wastePct: w })
  return layers
}

export function costSingleSkinLayers(layers: AssemblyLayerDef[]): { lines: CostedLine[]; totalCost: number } {
  const lines = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  return { lines, totalCost: +lines.reduce((s, l) => s + l.cost, 0).toFixed(2) }
}

/** Hours to start the labour lines from, a guide typed over in the calculator: a bricklayer lays about 55 bricks an hour in a half-brick wall and 35 in a pier, takes about half an hour to set each lintel (an hour and a half for a steel one) and a quarter of an hour a metre to set a coping; a labourer serves at half. */
export const WALL_BRICKS_PER_HOUR = 55
export const PIER_BRICKS_PER_HOUR = 35
export function suggestSingleSkinHours(g: SingleSkinGeometry, coping: SkinCoping): { bricklayer: number; labourer: number } {
  const raw = g.wallBricks / WALL_BRICKS_PER_HOUR + g.pierBricks / PIER_BRICKS_PER_HOUR
    + (g.lintels.length - g.steelLintelCount) * 0.5 + g.steelLintelCount * 1.5 + (coping === 'concrete' ? g.lengthM * 0.25 : 0)
  const bricklayer = Math.max(1, Math.round(raw))
  return { bricklayer, labourer: Math.max(1, Math.round(bricklayer / 2)) }
}
