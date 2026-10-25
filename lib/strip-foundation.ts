// Strip foundation (traditional) — and, with the concrete filling the trench to near ground level, a trench fill foundation — a trench dug the length of the wall, filled part-way with concrete, with blockwork built up from the
// concrete to the damp-proof course just above ground level. Sized from the drawn line (its length) and four dimensions: the trench's
// width and depth, the thickness of the concrete, and how far the DPC sits above ground. Counts and volumes only: the trench size, concrete
// strength and whether it needs reinforcement are the designer's / building control's to confirm — this only warns about the usual rules of thumb.
// Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs these quantities through the
// shared costLayer with each layer's fixedQty set from the geometry below.

export type StripWallBuild = 'solid-flat' | 'cavity-filled' | 'single-skin'

/** A cavity-filled wall built in courses: facing brick (splash courses) at the top of the outer leaf, block below it, the inner leaf in block to the DPC. */
export interface StripCoursing {
  /** Courses of facing brick at the top of the outer leaf, up to the DPC. */
  brickCourses: number
  /** Courses of block under the brick on the outer leaf. Left out (or null): as many as fit up to the DPC. */
  blockCourses?: number | null
}

/** A brick course is 75mm with its joint, a block course 225mm: three brick courses make one block course. */
export const BRICK_COURSE_MM = 75
export const BLOCK_COURSE_MM = 225
/** A brick with its joint: 215mm + 10mm. A 100mm block on its side with its joint: 450mm. */
const BRICK_LENGTH_M = 0.225
const BLOCK_LENGTH_M = 0.45
/** Mortar per m² of a 102mm brick leaf. */
const MORTAR_M3_PER_M2_BRICK = 0.028

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
  /** A single skin wall: how thick the block is, mm (100, 140 or 215 on edge). Default 215. */
  skinThicknessMm?: number
  /** Build a cavity-filled wall in courses (brick splash courses on a block base), so the courses decide the wall height. Leave out for the older all-block wall worked out from the height alone. */
  coursing?: StripCoursing
  /** Take all the dug soil away, instead of only the surplus the concrete and wall displace. Default false. */
  takeAllSpoilAway?: boolean
}

/** What the courses come to, when the wall is built in courses. */
export interface StripCoursesResult {
  brickCourses: number
  blockCourses: number
  /** The wall as the courses build it, from the top of the concrete to the DPC, mm. */
  builtHeightMm: number
  /** What the trench, concrete and DPC level asked for, mm. */
  requiredHeightMm: number
  /** required minus built: positive = the concrete is made this much thicker to make up; negative = the DPC ends up this much higher than asked. */
  gapMm: number
  brickCount: number
  outerBlockCount: number
  innerBlockCount: number
  /** Height of the brick and of the block part of the outer leaf, mm. */
  brickMm: number
  blockMm: number
}

export interface StripFoundationGeometry {
  lengthM: number
  /** The concrete thickness actually used (thicker than asked when the courses fall short of the DPC), mm. */
  concreteThicknessMm: number
  /** How far the DPC actually ends up above ground, mm. */
  dpcAboveGroundMm: number
  /** Set when the wall is built in courses. */
  courses?: StripCoursesResult
  /** Bricks of the splash courses (0 when the wall has none). */
  brickCount: number
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

  const cavity = input.wall === 'cavity-filled'
  // a single skin: ONE leaf of block laid on edge, in 225mm courses (no brick facing and no cavity: the facing brick of a house starts above the DPC)
  const single = input.wall === 'single-skin'
  const skinMm = single ? Math.max(50, input.skinThicknessMm ?? 215) : 0
  const wallThicknessMm = single ? skinMm : cavity ? 300 : 215
  const coursing = single ? { brickCourses: 0, blockCourses: input.coursing?.blockCourses ?? null } : cavity ? input.coursing : undefined
  const requiredHeightMm = depthMm - concreteThicknessMm + dpcAboveGroundMm
  // Built in courses (cavity wall only): the courses decide the wall height. A shortfall to the DPC is made up in the concrete, so the DPC never ends up lower than asked; courses that stand
  // taller than the space put the DPC higher.
  let courses: StripCoursesResult | undefined
  let effConcreteMm = concreteThicknessMm
  let effDpcMm = dpcAboveGroundMm
  let wallHeightMm = requiredHeightMm
  if (coursing) {
    const brick = Math.max(0, Math.round(coursing.brickCourses))
    const brickMm = brick * BRICK_COURSE_MM
    const asked = coursing.blockCourses
    const block = asked == null ? Math.max(0, Math.floor((requiredHeightMm - brickMm + 1) / BLOCK_COURSE_MM)) : Math.max(0, Math.round(asked))
    const blockMm = block * BLOCK_COURSE_MM
    const builtHeightMm = blockMm + brickMm
    if (builtHeightMm <= 0) throw new Error('The wall needs at least one course of brick or block.')
    const gapMm = requiredHeightMm - builtHeightMm
    if (gapMm > 0) effConcreteMm = concreteThicknessMm + gapMm
    else effDpcMm = dpcAboveGroundMm - gapMm
    if (effConcreteMm >= depthMm) throw new Error('The courses are too short for this trench: the concrete would have to fill it. Add courses or make the trench shallower.')
    wallHeightMm = builtHeightMm
    courses = {
      brickCourses: brick, blockCourses: block, builtHeightMm, requiredHeightMm, gapMm, brickMm, blockMm,
      brickCount: 0, outerBlockCount: 0, innerBlockCount: 0,   // counted below, once the length is known
    }
  }
  const L = toM(lengthMm), W = toM(widthMm), D = toM(depthMm), T = toM(effConcreteMm)
  const H = toM(wallHeightMm)
  const belowGroundM = toM(depthMm - effConcreteMm)

  const trenchVolumeM3 = L * W * D
  const concreteVolumeM3 = L * W * T
  const masonryAreaM2 = L * H
  const masonryBelowGroundM3 = L * toM(wallThicknessMm) * belowGroundM
  // Solid: one skin of 215mm blocks laid flat. Cavity-filled: two 100mm leaves, with the 100mm cavity filled with concrete up to the DPC.
  let blockCount = cavity ? 2 * masonryAreaM2 / LEAF_BLOCK_FACE_M2 : masonryAreaM2 / FLAT_BLOCK_FACE_M2
  let mortarM3 = cavity ? 2 * masonryAreaM2 * MORTAR_M3_PER_M2_LEAF : masonryAreaM2 * MORTAR_M3_PER_M2_FLAT
  let brickCount = 0
  if (courses && single) {
    // one leaf of block on edge: 450mm blocks, 225mm courses; the mortar follows the block's thickness (a 100mm leaf is the base figure)
    courses.outerBlockCount = courses.blockCourses * L / BLOCK_LENGTH_M
    blockCount = courses.outerBlockCount
    mortarM3 = L * toM(courses.blockMm) * MORTAR_M3_PER_M2_LEAF * (skinMm / 100)
  } else if (courses) {
    // outer leaf: brick on top, block below; inner leaf: block all the way up to the DPC
    courses.brickCount = courses.brickCourses * L / BRICK_LENGTH_M
    courses.outerBlockCount = courses.blockCourses * L / BLOCK_LENGTH_M
    courses.innerBlockCount = (wallHeightMm / BLOCK_COURSE_MM) * L / BLOCK_LENGTH_M
    brickCount = courses.brickCount
    blockCount = courses.outerBlockCount + courses.innerBlockCount
    mortarM3 = L * (toM(courses.brickMm) * MORTAR_M3_PER_M2_BRICK + toM(courses.blockMm) * MORTAR_M3_PER_M2_LEAF + H * MORTAR_M3_PER_M2_LEAF)
  }
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
  else if (effConcreteMm < projectionMm) warnings.push(`The concrete (${effConcreteMm}mm) is thinner than it projects each side of the wall (${Math.round(projectionMm)}mm). A strip foundation is normally at least as thick as its projection — check with the designer.`)
  if (effDpcMm < 150) warnings.push(`The DPC is only ${Math.round(effDpcMm)}mm above ground level: it is normally at least 150mm above, so splashing rain does not bridge it.`)
  if (courses && courses.gapMm < 0) warnings.push(`These courses build ${-courses.gapMm}mm higher than the DPC level asked for, so the DPC would sit ${Math.round(effDpcMm)}mm above ground. Take a course off, or make the trench deeper.`)
  if (courses && courses.gapMm > 0) warnings.push(`The courses stop ${courses.gapMm}mm short of the DPC level, so the concrete is made ${courses.gapMm}mm thicker (${Math.round(effConcreteMm)}mm) to bring the wall up to it.`)
  if (single && skinMm < 215) warnings.push(`A single skin of ${skinMm}mm block is thin for a foundation wall: it suits light loads (a garden wall, say). Check the thickness with the designer or building control.`)
  if (depthMm < 750) warnings.push('A foundation less than about 750mm deep is only suitable where the ground and frost depth allow — confirm the depth with building control or the engineer.')
  if (depthMm > 1200) warnings.push('A trench deeper than 1.2m normally needs its sides supported while people work in it. Support is not priced here.')

  return {
    lengthM: L,
    concreteThicknessMm: effConcreteMm,
    dpcAboveGroundMm: effDpcMm,
    ...(courses ? { courses } : {}),
    brickCount,
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
