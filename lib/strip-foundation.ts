// Strip foundation (traditional) — and, with the concrete filling the trench to near ground level, a trench fill foundation — a trench dug the length of the wall, filled part-way with concrete, with blockwork built up from the
// concrete to the damp-proof course just above ground level. Sized from the drawn line (its length) and four dimensions: the trench's
// width and depth, the thickness of the concrete, and how far the DPC sits above ground. Counts and volumes only: the trench size, concrete
// strength and whether it needs reinforcement are the designer's / building control's to confirm — this only warns about the usual rules of thumb.
// Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs these quantities through the
// shared costLayer with each layer's fixedQty set from the geometry below.

export type StripWallBuild = 'solid-flat' | 'cavity-filled'

export interface StripFoundationInput {
  /** The trench's length along the wall, mm. */
  lengthMm: number
  /** Trench (and concrete) width, mm. Default 600. */
  widthMm: number
  /** Depth from ground level to the underside of the concrete, mm. Default 1000. */
  depthMm: number
  /** Thickness of the concrete in the bottom of the trench, mm. Default 225. */
  concreteThicknessMm: number
  /** How far the DPC sits above finished ground level, mm. Default 150. */
  dpcAboveGroundMm: number
  /** The wall from the concrete to the DPC: solid 215mm blocks laid flat, or two 100mm leaves with the 100mm cavity filled with concrete. */
  wall: StripWallBuild
  /** Take all the dug soil away, instead of only the surplus the concrete and wall displace. Default false. */
  takeAllSpoilAway?: boolean
}

export interface StripFoundationGeometry {
  lengthM: number
  trenchVolumeM3: number
  concreteVolumeM3: number
  /** Blockwork height, from the top of the concrete up to the DPC, mm. */
  wallHeightMm: number
  wallThicknessMm: number
  masonryAreaM2: number
  /** Volume of masonry below ground level (it displaces soil). */
  masonryBelowGroundM3: number
  blockCount: number
  /** Blocks of the 100mm outer and inner leaves together (cavity-filled) or the flat blocks (solid); the same figure as blockCount. */
  mortarM3: number
  /** Concrete poured into the cavity of a cavity-filled wall, below the DPC. */
  cavityFillM3: number
  tieCount: number
  dpcLm: number
  /** Soil dug out, bulked up by 30% for carting. */
  spoilAwayM3: number
  backfillM3: number
  /** Machine days for the trench, from an output of 20 m³ a day in a narrow trench, in half days (never less than half a day). */
  excavatorDays: number
  warnings: string[]
}

export const SPOIL_BULKING = 1.3
export const TRENCH_M3_PER_DAY = 20
/** One face of a flat-laid 100mm block with its joints: 450mm long × 110mm high. */
const FLAT_BLOCK_FACE_M2 = 0.45 * 0.11
/** A 100mm block on its side as a leaf: 450mm × 225mm with joints. */
const LEAF_BLOCK_FACE_M2 = 0.45 * 0.225
/** Mortar per m² of wall face: a 215mm wall of blocks laid flat (the same figure the parapet and sleeper walls use), and a 100mm leaf. */
const MORTAR_M3_PER_M2_FLAT = 0.0473
const MORTAR_M3_PER_M2_LEAF = 0.013
const TIES_PER_M2 = 2.5

const toM = (mm: number) => mm / 1000

export function calculateStripFoundationGeometry(input: StripFoundationInput): StripFoundationGeometry {
  const { lengthMm, widthMm, depthMm, concreteThicknessMm, dpcAboveGroundMm } = input
  if (!(lengthMm > 0)) throw new Error('The foundation length must be greater than zero.')
  if (!(widthMm > 0)) throw new Error('The trench width must be greater than zero.')
  if (!(depthMm > 0)) throw new Error('The trench depth must be greater than zero.')
  if (!(concreteThicknessMm > 0)) throw new Error('The concrete thickness must be greater than zero.')
  if (concreteThicknessMm >= depthMm) throw new Error('The concrete must be thinner than the trench is deep, so there is room for the wall above it.')
  if (dpcAboveGroundMm < 0) throw new Error('The DPC cannot be below ground level.')

  const L = toM(lengthMm), W = toM(widthMm), D = toM(depthMm), T = toM(concreteThicknessMm)
  const cavity = input.wall === 'cavity-filled'
  const wallThicknessMm = cavity ? 300 : 215
  const wallHeightMm = depthMm - concreteThicknessMm + dpcAboveGroundMm
  const H = toM(wallHeightMm)
  const belowGroundM = toM(depthMm - concreteThicknessMm)

  const trenchVolumeM3 = L * W * D
  const concreteVolumeM3 = L * W * T
  const masonryAreaM2 = L * H
  const masonryBelowGroundM3 = L * toM(wallThicknessMm) * belowGroundM
  // Solid: one skin of 215mm blocks laid flat. Cavity-filled: two 100mm leaves, with the 100mm cavity filled with concrete up to the DPC.
  const blockCount = cavity ? 2 * masonryAreaM2 / LEAF_BLOCK_FACE_M2 : masonryAreaM2 / FLAT_BLOCK_FACE_M2
  const mortarM3 = cavity ? 2 * masonryAreaM2 * MORTAR_M3_PER_M2_LEAF : masonryAreaM2 * MORTAR_M3_PER_M2_FLAT
  const cavityFillM3 = cavity ? L * 0.1 * H : 0
  const tieCount = cavity ? Math.ceil(masonryAreaM2 * TIES_PER_M2) : 0

  const displacedM3 = concreteVolumeM3 + masonryBelowGroundM3
  const dugM3 = trenchVolumeM3
  const spoilAwayM3 = (input.takeAllSpoilAway ? dugM3 : Math.min(dugM3, displacedM3)) * SPOIL_BULKING
  const backfillM3 = Math.max(0, trenchVolumeM3 - concreteVolumeM3 - masonryBelowGroundM3)
  const excavatorDays = Math.max(0.5, Math.round((trenchVolumeM3 / TRENCH_M3_PER_DAY) * 2) / 2)

  const warnings: string[] = []
  const projectionMm = (widthMm - wallThicknessMm) / 2
  if (widthMm < wallThicknessMm + 200) warnings.push(`A ${widthMm}mm trench leaves under 100mm of concrete each side of a ${wallThicknessMm}mm wall — the trench is normally wider than that.`)
  else if (concreteThicknessMm < projectionMm) warnings.push(`The concrete (${concreteThicknessMm}mm) is thinner than it projects each side of the wall (${Math.round(projectionMm)}mm). A strip foundation is normally at least as thick as its projection — check with the designer.`)
  if (depthMm < 750) warnings.push('A foundation less than about 750mm deep is only suitable where the ground and frost depth allow — confirm the depth with building control or the engineer.')
  if (depthMm > 1200) warnings.push('A trench deeper than 1.2m normally needs its sides supported while people work in it. Support is not priced here.')

  return {
    lengthM: L,
    trenchVolumeM3: +trenchVolumeM3.toFixed(4),
    concreteVolumeM3: +concreteVolumeM3.toFixed(4),
    wallHeightMm,
    wallThicknessMm,
    masonryAreaM2: +masonryAreaM2.toFixed(4),
    masonryBelowGroundM3: +masonryBelowGroundM3.toFixed(4),
    blockCount,
    mortarM3: +mortarM3.toFixed(4),
    cavityFillM3: +cavityFillM3.toFixed(4),
    tieCount,
    dpcLm: L,
    spoilAwayM3: +spoilAwayM3.toFixed(4),
    backfillM3: +backfillM3.toFixed(4),
    excavatorDays,
    warnings,
  }
}
