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

// ── Flashing where the roof meets an existing wall ────────────────────────────────────────────────────────────────────────────────────────────
// Lead (or a lead-effect or GRP substitute) is fixed into a chase cut in the wall and dressed over the roof covering. Where the abutment runs UP the slope (a gable
// or hip end built against a wall) tiles and slates need a soaker under the flashing at every course; along the high wall of a lean-to (horizontal) it is an apron
// flashing and needs none. The chase is cut and pointed in whatever the flashing. All rates are sample rates, editable in the calculator.

export type AbutmentFlashing = 'lead4' | 'lead5' | 'lead-effect' | 'grp'

export interface FlashingOption {
  label: string
  /** the name of the line in the cost breakdown */
  line: string
  /** £ per metre, supplied */
  rate: number
  /** lead needs a lead soaker at every course up a sloping abutment */
  leadSoakers: boolean
  /** how it reads in the customer's description */
  phrase: string
}

export const ABUTMENT_FLASHING: Record<AbutmentFlashing, FlashingOption> = {
  lead4: { label: 'Code 4 lead', line: 'Code 4 lead flashing, at the abutment', rate: 15, leadSoakers: true, phrase: 'code 4 lead flashing' },
  lead5: { label: 'Code 5 lead (heavier)', line: 'Code 5 lead flashing, at the abutment', rate: 19.5, leadSoakers: true, phrase: 'code 5 lead flashing' },
  'lead-effect': { label: 'Lead-effect (lead-free)', line: 'Lead-effect flashing, at the abutment', rate: 9, leadSoakers: false, phrase: 'lead-effect flashing' },
  grp: { label: 'GRP lead-effect trim', line: 'GRP lead-effect flashing trim, at the abutment', rate: 21, leadSoakers: false, phrase: 'GRP lead-effect flashing' },
}

export const SOAKER_RATE = 2.4          // £ each, a lead soaker
export const CHASE_MATERIALS_RATE = 1.8 // £ per metre: lead wedges, mortar and flashing sealant

/** Lead soakers for a sloping abutment: one per batten course up its length. None along a horizontal (lean-to) abutment or for a flashing that has no soakers. */
export function soakerCountFor(abutmentLm: number, battenGaugeMm: number, sloped: boolean, flashing: AbutmentFlashing): number {
  if (!sloped || !ABUTMENT_FLASHING[flashing].leadSoakers || !(abutmentLm > 0) || !(battenGaugeMm > 0)) return 0
  return Math.ceil((abutmentLm * 1000) / battenGaugeMm - 1e-9)
}
