// What a floor drawn on a Take-off plan LOOKS like, instead of a flat coloured infill: underfloor heating shows its pipe laid in rows with the turns at the ends, a block and beam floor its beams at their centres
// with the infill blocks between them, and a concrete slab its concrete hatching. Pure geometry (no imports), so it can be tested with plain Node; the screen paints what this returns inside the floor's outline.

export interface Pt { x: number; y: number }

export type FloorLook = 'ufh' | 'ufh-electric' | 'block-beam' | 'slab'

/**
 * Which look a floor has, from the calculator its sub-phase picks (canonical id) or the Build-Up Type it was drawn with. Underfloor heating (warm water, electric mats, or a screed with underfloor heating), a block and beam
 * floor, or a concrete slab (also the insulated one). Anything else keeps the plain infill.
 */
export function floorLookOf(canonicalId: string | undefined, makeupId: string | undefined): FloorLook | null {
  if (canonicalId === 'tile-ufh-electric') return 'ufh-electric'
  if (canonicalId === 'plumb-ufh' || canonicalId === 'fs-ufh-screed' || makeupId === 'ufh_screed') return 'ufh'
  if (canonicalId === 'fs-block-beam' || makeupId === 'block_beam') return 'block-beam'
  if (canonicalId === 'fs-concrete-slab' || canonicalId === 'fs-insulated-concrete' || makeupId === 'concrete_slab' || makeupId === 'insulated_concrete') return 'slab'
  return null
}

export function boxOf(poly: Pt[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of poly) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY }
}

const f = (n: number) => +n.toFixed(2)

/**
 * The pipe of an underfloor heating zone as one SVG path: rows across the floor (along its longer side) `spacingPx` apart, each joined to the next by a turn at the end, kept `marginPx` in from the edges.
 * The screen clips it to the floor's outline, so an L-shaped floor shows its pipe where the floor is. Rows are never closer than `minPx` (a very large floor at a small scale keeps a readable picture), and there
 * are at most `maxRows`.
 */
export function ufhPipePath(poly: Pt[], spacingPx: number, marginPx: number, minPx = 3, maxRows = 400): { d: string; rows: number; spacingPx: number } {
  const b = boxOf(poly)
  if (!(b.w > 0 && b.h > 0)) return { d: '', rows: 0, spacingPx }
  const horizontal = b.w >= b.h   // rows run along the longer side
  const along = horizontal ? b.w : b.h, across = horizontal ? b.h : b.w
  let s = Math.max(spacingPx, minPx)
  if (across / s > maxRows) s = across / maxRows
  const m = Math.min(marginPx, Math.min(along, across) / 4)
  const a0 = (horizontal ? b.minX : b.minY) + m, a1 = (horizontal ? b.maxX : b.maxY) - m
  const c0 = (horizontal ? b.minY : b.minX) + m, c1 = (horizontal ? b.maxY : b.maxX) - m
  if (!(a1 > a0) || !(c1 > c0)) return { d: '', rows: 0, spacingPx: s }
  const pt = (a: number, c: number) => (horizontal ? `${f(a)},${f(c)}` : `${f(c)},${f(a)}`)
  let d = ''
  let rows = 0
  for (let c = c0, k = 0; c <= c1 + 0.001; c += s, k++) {
    const from = k % 2 === 0 ? a0 : a1, to = k % 2 === 0 ? a1 : a0
    d += (k === 0 ? 'M' : 'L') + pt(from, c) + ' L' + pt(to, c) + ' '
    rows++
  }
  return { d: d.trim(), rows, spacingPx: s }
}

export interface BeamLook {
  /** each beam as a line, from end to end of the floor (the screen clips them to the outline) */
  beams: [Pt, Pt][]
  /** the ends of the block joints in the infill between the beams, as one path */
  joints: string
  beamPx: number
  /** the beams run across the shorter side (their span): true = they run up and down the plan */
  vertical: boolean
}

/** A block and beam floor: beams across the SHORTER side of the floor at `centresMm`, each `beamMm` wide, with the infill blocks (`blockMm` long) between them. Joints are left out when they would be too close to read. */
export function blockBeamLook(poly: Pt[], mpp: number, o: { centresMm: number; beamMm?: number; blockMm?: number; minPx?: number; maxJoints?: number }): BeamLook {
  const b = boxOf(poly)
  const px = (mm: number) => mm / (mpp * 1000)
  const minPx = o.minPx ?? 3
  const vertical = b.h <= b.w ? true : false   // beams run along the shorter side: up and down when the floor is wider than it is deep
  const span0 = vertical ? b.minY : b.minX, span1 = vertical ? b.maxY : b.maxX
  const across0 = vertical ? b.minX : b.minY, across1 = vertical ? b.maxX : b.maxY
  let step = Math.max(px(o.centresMm), minPx * 2)
  const maxBeams = 300
  if ((across1 - across0) / step > maxBeams) step = (across1 - across0) / maxBeams
  const beamPx = Math.max(px(o.beamMm ?? 150), 1)
  const beams: [Pt, Pt][] = []
  const pos: number[] = []
  for (let c = across0 + step / 2; c < across1; c += step) {
    pos.push(c)
    beams.push(vertical ? [{ x: f(c), y: f(span0) }, { x: f(c), y: f(span1) }] : [{ x: f(span0), y: f(c) }, { x: f(span1), y: f(c) }])
  }
  // the block joints: a short line across each bay every block length along the span
  const blockPx = Math.max(px(o.blockMm ?? 440), minPx)
  let joints = ''
  const bays = Math.max(0, pos.length - 1)
  const perBay = Math.floor((span1 - span0) / blockPx)
  if (bays * perBay <= (o.maxJoints ?? 3000)) {
    for (let i = 0; i < pos.length - 1; i++) {
      const c0 = pos[i] + beamPx / 2, c1 = pos[i + 1] - beamPx / 2
      if (!(c1 > c0)) continue
      for (let k = 1; k <= perBay; k++) {
        const a = span0 + k * blockPx
        joints += vertical ? `M${f(c0)},${f(a)} L${f(c1)},${f(a)} ` : `M${f(a)},${f(c0)} L${f(a)},${f(c1)} `
      }
    }
  }
  return { beams, joints: joints.trim(), beamPx, vertical }
}
