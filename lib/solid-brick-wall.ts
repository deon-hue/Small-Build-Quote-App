// Solid brick wall (no cavity): the old-fashioned wall of a Victorian house, one, one and a half or two bricks thick, built of facing bricks on the outside with common bricks behind (or facing bricks all through), in lime or cement mortar.
// Pure: sizes and counts in, priced lines out. Counts and prices what is drawn; it does not design the wall (stability, lintel sizes, insulation to meet Part L are the designer's), and every rate is a sample typed over in the calculator.
//
// Bricks: a standard 215 x 102.5 x 65 brick with a 10mm joint covers 225 x 75mm of face, so a half-brick thickness (one skin of stretchers) takes 59.26 bricks per m2, a one brick wall 118.5, one and a half 177.8, two 237.
// Mortar: the wall's volume less the bricks' own, with an allowance (x1.35) for waste, squeeze-out and filling the frogs; that comes to about 0.06 m3 per m2 of one-brick wall and 0.1 m3 per m2 of one and a half brick wall, which is what the usual
// estimating tables give.

import { costLayer, type AssemblyLayerDef, type AssemblyOpening, type CostedLine } from './assembly-calc'

export const BRICK_LENGTH_MM = 215
export const BRICK_WIDTH_MM = 102.5
export const BRICK_HEIGHT_MM = 65
export const JOINT_MM = 10
const BRICK_COURSE_MM = BRICK_HEIGHT_MM + JOINT_MM           // 75
const BRICK_FACE_ALONG_MM = BRICK_LENGTH_MM + JOINT_MM       // 225
/** bricks in one half-brick skin of wall, per m2 of face */
export const BRICKS_PER_SKIN_M2 = 1_000_000 / (BRICK_FACE_ALONG_MM * BRICK_COURSE_MM)
const BRICK_VOLUME_M3 = (BRICK_LENGTH_MM * BRICK_WIDTH_MM * BRICK_HEIGHT_MM) / 1e9
/** allowance on the mortar between the bricks for waste, squeeze-out and the frogs */
export const MORTAR_ALLOWANCE = 1.35

export type BrickThickness = 'one' | 'one-half' | 'two'
export const BRICK_THICKNESS: Record<BrickThickness, { label: string; mm: number; skins: number }> = {
  'one':      { label: 'One brick (215mm, 9 inch)', mm: 215, skins: 2 },
  'one-half': { label: 'One and a half bricks (327.5mm, about 13 inch: the usual Victorian wall)', mm: 327.5, skins: 3 },
  'two':      { label: 'Two bricks (440mm, 18 inch)', mm: 440, skins: 4 },
}

export type BrickBond = 'english' | 'flemish' | 'english-garden'
export const BRICK_BOND_LABEL: Record<BrickBond, string> = {
  'english': 'English bond',
  'flemish': 'Flemish bond',
  'english-garden': 'English garden wall bond',
}

export type FacingBrick = 'stock-new' | 'stock-reclaimed' | 'machine' | 'engineering'
/** the outer skin's brick: the name written on the quote and a sample price each (typed over in the breakdown) */
export const FACING_BRICK: Record<FacingBrick, { label: string; quoteName: string; unitCost: number }> = {
  'stock-new':       { label: 'London stock style, new', quoteName: 'new London stock style facing bricks', unitCost: 1.45 },
  'stock-reclaimed': { label: 'Reclaimed stocks (cleaned)', quoteName: 'cleaned reclaimed stock bricks', unitCost: 1.10 },
  'machine':         { label: 'Machine-made facing brick', quoteName: 'machine-made facing bricks', unitCost: 0.75 },
  'engineering':     { label: 'Engineering brick', quoteName: 'engineering bricks', unitCost: 0.95 },
}
export const COMMON_BRICK_COST = 0.42

export type BrickMortar = 'lime' | 'cement'
export const BRICK_MORTAR_LABEL: Record<BrickMortar, string> = {
  'lime': 'Lime mortar (NHL 3.5, 1:3)',
  'cement': 'Cement and sand mortar (1:4)',
}
/** bags of binder (25kg) per m3 of mortar, and tonnes of sand per m3 of mortar */
const MORTAR_MIX: Record<BrickMortar, { binderBags: number; sandT: number; binderName: string; binderCost: number }> = {
  'lime':   { binderBags: 11, sandT: 1.6, binderName: 'NHL 3.5 natural hydraulic lime (25kg bag)', binderCost: 11.5 },
  'cement': { binderBags: 13, sandT: 1.5, binderName: 'Cement (25kg bag)', binderCost: 6.5 },
}

export type BrickLintel = 'concrete' | 'steel' | 'arch'
export const BRICK_LINTEL_LABEL: Record<BrickLintel, string> = {
  'concrete': 'Precast concrete lintels',
  'steel': 'Steel box lintel / beam (the designer sizes it)',
  'arch': 'Gauged brick arch over a concrete lintel (specialist)',
}
/** a precast lintel leaf is about 215 wide, so a wall of more than one brick takes two across it */
export const lintelLeaves = (t: BrickThickness) => (t === 'one' ? 1 : 2)

export interface SolidBrickWallInput {
  lengthMm: number
  heightMm: number
  thickness: BrickThickness
  /** a facing brick outside with common bricks behind, or facing bricks all the way through */
  backing: 'commons' | 'all-facing'
  openings: AssemblyOpening[]
  lintelBearingMm?: number           // bearing each side of an opening; default 150, confirm on site
  movementJointSpacingMm?: number    // 0 / absent = none
}

export interface SolidBrickWallGeometry {
  lengthM: number
  grossAreaM2: number
  openingAreaM2: number
  netAreaM2: number
  thicknessMm: number
  skins: number
  courseCount: number
  bricksPerM2: number
  facingBricks: number
  commonBricks: number
  brickCount: number
  mortarM3PerM2: number
  mortarM3: number
  lintels: { openingId: string; spanMm: number }[]
  lintelLm: number
  movementJointCount: number
  movementJointLm: number
  /** worth the estimator's attention (red) */
  warnings: string[]
  /** said every time, whatever was typed (amber) */
  notes: string[]
}

const toM = (mm: number) => mm / 1000

export function calculateSolidBrickGeometry(input: SolidBrickWallInput): SolidBrickWallGeometry {
  const { lengthMm: L, heightMm: H, openings } = input
  const bearing = input.lintelBearingMm ?? 150
  const warnings: string[] = []
  const notes: string[] = []
  if (!(L > 0) || !(H > 0)) throw new Error('Wall length and height must be greater than zero.')
  const t = BRICK_THICKNESS[input.thickness]
  if (!t) throw new Error('Pick how many bricks thick the wall is.')

  const grossAreaM2 = toM(L) * toM(H)
  const openingAreaM2 = openings.reduce((s, o) => s + toM(o.widthMm) * toM(o.heightMm), 0)
  const netAreaM2 = Math.max(0, grossAreaM2 - openingAreaM2)

  const bricksPerM2 = BRICKS_PER_SKIN_M2 * t.skins
  const facingBricks = netAreaM2 * BRICKS_PER_SKIN_M2 * (input.backing === 'all-facing' ? t.skins : 1)
  const commonBricks = input.backing === 'all-facing' ? 0 : netAreaM2 * BRICKS_PER_SKIN_M2 * (t.skins - 1)
  const mortarM3PerM2 = +((toM(t.mm) - bricksPerM2 * BRICK_VOLUME_M3) * MORTAR_ALLOWANCE).toFixed(5)

  const sorted = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)
  const lintels: SolidBrickWallGeometry['lintels'] = []
  for (let i = 0; i < sorted.length; i++) {
    const o = sorted[i]
    if (o.offsetMm < 0 || o.offsetMm + o.widthMm > L) warnings.push(`Opening "${o.id}" falls outside the wall — check its offset and width.`)
    if (o.sillHeightMm + o.heightMm > H) warnings.push(`Opening "${o.id}" is taller than the wall above its sill — check sill height.`)
    const next = sorted[i + 1]
    if (next && o.offsetMm + o.widthMm > next.offsetMm) warnings.push(`Openings "${o.id}" and "${next.id}" overlap — check offsets and widths.`)
    lintels.push({ openingId: o.id, spanMm: o.widthMm + bearing * 2 })
  }
  const lintelLm = +lintels.reduce((s, l) => s + toM(l.spanMm), 0).toFixed(3)

  const mj = input.movementJointSpacingMm ?? 0
  const movementJointCount = mj > 0 ? Math.max(0, Math.floor((L - 1) / mj)) : 0

  if (input.thickness === 'one' && H > 3000) warnings.push('A one brick wall this high is slender: the designer needs to confirm it is stable (piers, ties to floors and roof).')
  notes.push('A new solid brick wall does not reach the Part L insulation standard on its own: it needs insulation inside or outside (price it with Wall Insulation & Backing) and a check for damp and condensation.')

  return {
    lengthM: toM(L), grossAreaM2, openingAreaM2, netAreaM2,
    thicknessMm: t.mm, skins: t.skins, courseCount: Math.ceil(H / BRICK_COURSE_MM),
    bricksPerM2, facingBricks, commonBricks, brickCount: facingBricks + commonBricks,
    mortarM3PerM2, mortarM3: netAreaM2 * mortarM3PerM2,
    lintels, lintelLm, movementJointCount, movementJointLm: +(movementJointCount * toM(H)).toFixed(2),
    warnings, notes,
  }
}

export interface SolidBrickLayerOpts {
  wastePct: number
  facing: FacingBrick
  mortar: BrickMortar
  lintel: BrickLintel
  thickness: BrickThickness
}

const DPC_COST_PER_M: Record<BrickThickness, number> = { 'one': 2.9, 'one-half': 4.4, 'two': 5.8 }
const LINTEL_PER_M = 24
const STEEL_LINTEL_PER_M = 78
const PADSTONE_EACH = 28
const ARCH_EACH = 420
const MOVEMENT_JOINT_PER_M = 4.5

/** The priced lines of the wall, every quantity fixed from the geometry (so one wall's lines are always from one set of figures). The estimator's typed rates replace the sample unit costs by layer id. */
export function buildSolidBrickLayers(g: SolidBrickWallGeometry, o: SolidBrickLayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const f = FACING_BRICK[o.facing]
  const mix = MORTAR_MIX[o.mortar]
  const layers: AssemblyLayerDef[] = [
    { id: 'facing_bricks', name: `Facing bricks: ${f.label}`, category: 'materials', source: 'fixed', fixedQty: g.facingBricks, unit: 'nr', unitCost: f.unitCost, roundToWhole: true, wastePct: w },
  ]
  if (g.commonBricks > 0) layers.push({ id: 'common_bricks', name: 'Common bricks (backing skins)', category: 'materials', source: 'fixed', fixedQty: g.commonBricks, unit: 'nr', unitCost: COMMON_BRICK_COST, roundToWhole: true, wastePct: w })
  // the mortar allowance already covers waste, so the mortar lines carry none of their own
  layers.push(
    { id: 'mortar_binder', name: mix.binderName + ' (mortar)', category: 'materials', source: 'fixed', fixedQty: g.mortarM3, unit: 'bag', unitCost: mix.binderCost, coveragePerUnit: +(1 / mix.binderBags).toFixed(4), roundToWhole: true },
    { id: 'mortar_sand', name: 'Building sand (mortar mix)', category: 'materials', source: 'fixed', fixedQty: g.mortarM3, unit: 'tonne', unitCost: 32, coveragePerUnit: +(1 / mix.sandT).toFixed(4) },
  )
  if (g.lintels.length > 0) {
    const leaves = lintelLeaves(o.thickness)
    if (o.lintel === 'steel') {
      layers.push(
        { id: 'lintel', name: 'Steel box lintel / beam over each opening (designer to size)', category: 'materials', source: 'fixed', fixedQty: g.lintelLm, unit: 'm', unitCost: STEEL_LINTEL_PER_M },
        { id: 'padstones', name: 'Concrete padstones (2 per opening)', category: 'materials', source: 'fixed', fixedQty: g.lintels.length * 2, unit: 'nr', unitCost: PADSTONE_EACH, roundToWhole: true },
      )
    } else if (o.lintel === 'arch') {
      layers.push(
        { id: 'lintel', name: 'Precast concrete lintel behind the arch', category: 'materials', source: 'fixed', fixedQty: g.lintelLm, unit: 'm', unitCost: LINTEL_PER_M },
        { id: 'arch', name: 'Gauged / rubbed brick arch (specialist allowance, per opening)', category: 'subcontractors', source: 'fixed', fixedQty: g.lintels.length, unit: 'nr', unitCost: ARCH_EACH, roundToWhole: true },
      )
    } else {
      layers.push({ id: 'lintel', name: `Precast concrete lintels (${leaves} across the wall)`, category: 'materials', source: 'fixed', fixedQty: g.lintelLm * leaves, unit: 'm', unitCost: LINTEL_PER_M })
    }
  }
  layers.push({ id: 'dpc', name: `DPC ${Math.round(g.thicknessMm)}mm wide (damp-proof course)`, category: 'materials', source: 'fixed', fixedQty: g.lengthM, unit: 'm', unitCost: DPC_COST_PER_M[o.thickness], wastePct: w })
  if (g.movementJointLm > 0) layers.push({ id: 'movement_joints', name: 'Movement joint (filler + sealant)', category: 'materials', source: 'fixed', fixedQty: g.movementJointLm, unit: 'm', unitCost: MOVEMENT_JOINT_PER_M, wastePct: w })
  return layers
}

export function costSolidBrickLayers(layers: AssemblyLayerDef[]): { lines: CostedLine[]; totalCost: number } {
  const lines = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  return { lines, totalCost: +lines.reduce((s, l) => s + l.cost, 0).toFixed(2) }
}

/** Hours to start the labour lines from: a bricklayer lays about 45 bricks an hour in a solid wall (about 360 in a day), a labourer serving at half the bricklayer's time. A guide, typed over in the calculator. */
export const BRICKS_PER_BRICKLAYER_HOUR = 45
export function suggestSolidBrickHours(g: SolidBrickWallGeometry): { bricklayer: number; labourer: number } {
  const bricklayer = Math.max(1, Math.round(g.brickCount / BRICKS_PER_BRICKLAYER_HOUR))
  return { bricklayer, labourer: Math.max(1, Math.round(bricklayer / 2)) }
}
