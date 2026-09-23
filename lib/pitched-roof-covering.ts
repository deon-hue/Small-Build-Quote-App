// Pitched roof covering — tiles or slate, their battens and breather membrane, over whatever the roof's edge
// lengths are (Roof → Roof Coverings → pitched). This module is deliberately roof-shape-agnostic: which
// roof type (mono-pitch, gable, hip) and which per-end treatment gives which ridge/hip/verge/abutment/eaves
// lengths is worked out by the screen, calling the already-tested structure engines directly
// (lib/mono-pitch-roof.ts, lib/gable-roof.ts, lib/hip-roof.ts have no such constraint) — this file only takes
// the resulting edge lengths and adds the covering-specific quantity, the batten run.
//
// Battens: batten courses run parallel to the eaves at the chosen gauge, all the way up each roof face —
// for a simple rectangular face, that's (face width) × (courses), and courses = (slope length)/gauge, so
// batten lm = width × slope-length / gauge = face area / gauge; the same identity holds for a hip's
// triangular/trapezoidal faces too (a batten course's length is proportional to the face's local width, and
// summing evenly-spaced courses over a face converges to area/gauge). So the whole roof's batten run is
// simply its total slope area over the gauge, whatever shape it's hipped or gabled into — no need to work
// per-face. Self-contained (no cross-file runtime imports — see the note in CLAUDE.md about why every
// lib/*.ts engine here can be hand-tested with plain Node).

export type PitchedCoveringMaterial = 'concrete-tile' | 'clay-tile' | 'natural-slate' | 'fibre-cement-slate'

export interface PitchedRoofCoveringInput {
  slopeAreaM2: number
  battenGaugeMm: number
  /** 0 for a mono-pitch, or a hip whose ridge has clamped to zero (a pyramid). */
  ridgeLm: number
  /** 0 unless the roof is a hip with at least one hipped end. */
  hipLm: number
  /** Up the slope, at any new-wall gable end (or a hip's non-hipped 'gable' end). */
  vergeLm: number
  /** Along a mono-pitch's high wall, or any gable/hip end built against an existing wall. */
  abutmentLm: number
  eavesLm: number
}

export interface PitchedRoofCoveringGeometry {
  slopeAreaM2: number
  battenLm: number
  ridgeLm: number
  hipLm: number
  vergeLm: number
  abutmentLm: number
  eavesLm: number
  warnings: string[]
}

export function calculatePitchedRoofCoveringGeometry(input: PitchedRoofCoveringInput): PitchedRoofCoveringGeometry {
  const { slopeAreaM2, battenGaugeMm, ridgeLm, hipLm, vergeLm, abutmentLm, eavesLm } = input
  if (!(slopeAreaM2 > 0)) throw new Error('The roof must have some slope area to cover.')
  if (!(battenGaugeMm > 0)) throw new Error('The batten gauge must be greater than zero.')
  if (ridgeLm < 0 || hipLm < 0 || vergeLm < 0 || abutmentLm < 0 || eavesLm < 0) throw new Error('Edge lengths cannot be negative.')

  const battenLm = (slopeAreaM2 * 1000) / battenGaugeMm

  const warnings: string[] = []
  if (battenGaugeMm < 245) warnings.push(`A ${battenGaugeMm}mm gauge is unusually tight for most tiles and slates — check it against the product's own gauge table.`)
  if (battenGaugeMm > 400) warnings.push(`A ${battenGaugeMm}mm gauge is unusually wide — check it against the product's own gauge table.`)

  return {
    slopeAreaM2: +slopeAreaM2.toFixed(3), battenLm: +battenLm.toFixed(3),
    ridgeLm: +ridgeLm.toFixed(3), hipLm: +hipLm.toFixed(3), vergeLm: +vergeLm.toFixed(3),
    abutmentLm: +abutmentLm.toFixed(3), eavesLm: +eavesLm.toFixed(3),
    warnings,
  }
}
