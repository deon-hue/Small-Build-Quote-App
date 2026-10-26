// What the AI quote can hand to the floor and roof calculators (the six floors of Floors & Screeds, and Roof Structure, Roof Coverings, Gutters & Downpipes, Fascias & Soffits and the whole flat roof):
// the one floor or roof the scope describes, checked here and turned into the values the calculator is opened with. Only what the scope says: a floor with no stated area (or length and width), or a roof with
// no stated length and width, is left out (never invented); anything else not stated takes the calculator's own starting value and is reported, so the estimator checks it. Whatever the AI sends back is
// untrusted, so every value is checked and anything that does not check out is treated as "not stated". Pure (apart from the calculators' own tables), so it can be tested.

import { isObj, between, whole } from './ai-spec'
import { SCREED_TYPES, INSULATION_THICKNESSES_MM as SCREED_INSULATION_MM, type ScreedType } from './screed-floor'
import { INSULATION_THICKNESSES_MM as SLAB_INSULATION_MM } from './concrete-slab-floor'
import { OVERLAY_KINDS, type OverlayKind } from './floor-overlay'
import { FLOOR_KINDS, type FloorKind } from './suspended-timber-floor'

export const FLOOR_AI_IDS = ['fs-screeded-floor', 'fs-floor-overlay', 'fs-concrete-slab', 'fs-insulated-concrete', 'fs-block-beam', 'fs-suspended-timber'] as const
export const ROOF_AI_IDS = ['roof-structure', 'roof-covering', 'roof-rainwater', 'roof-fascia-soffit', 'roof-flat'] as const
export const FLOOR_ROOF_AI_IDS: ReadonlySet<string> = new Set<string>([...FLOOR_AI_IDS, ...ROOF_AI_IDS])

/** The nearest value in a list (a stated 60mm screed on a list of 50, 65, 75 is 65), so a calculator is never opened on a thickness it has no option for. */
const nearest = (v: number, list: readonly number[]) => list.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), list[0])

// ── Floors ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiFloor {
  areaM2: number
  perimeterM: number
  /** the calculator's own saved values for what the scope stated (beyond the size), by their saved names */
  values: Record<string, unknown>
  /** plain-English words for what was stated, for the review note ("a 75mm liquid screed") */
  stated: string[]
  /** what the scope did not say and the calculator's standard was used: for the review note */
  assumed: string[]
}

export function floorFromScope(canonicalId: string, spec: unknown): AiFloor | null {
  if (!(FLOOR_AI_IDS as readonly string[]).includes(canonicalId) || !isObj(spec)) return null
  const lengthM = between(spec.lengthM, 0, 200), widthM = between(spec.widthM, 0, 200)
  let areaM2 = between(spec.areaM2, 0, 2000)
  if (areaM2 === null && lengthM !== null && widthM !== null) areaM2 = lengthM * widthM
  if (areaM2 === null) return null   // never invent the size of the floor
  areaM2 = Math.round(areaM2 * 100) / 100
  const assumed: string[] = []
  const stated: string[] = []
  // the edge of the floor (the edge strip, and the span of the beams or joists): from the length and width when both are stated and agree with the area, else a rectangle about 4 to 3
  let perimeterM: number
  if (lengthM !== null && widthM !== null && Math.abs(lengthM * widthM - areaM2) <= areaM2 * 0.1) perimeterM = 2 * (lengthM + widthM)
  else { perimeterM = 4.04 * Math.sqrt(areaM2); assumed.push('the shape of the floor (taken as a rectangle about 4 to 3, for the edge strip and the span)') }
  perimeterM = Math.round(perimeterM * 100) / 100

  const values: Record<string, unknown> = { areaM2, perimeterLm: perimeterM }
  switch (canonicalId) {
    case 'fs-screeded-floor': {
      const type: ScreedType | null = typeof spec.screedType === 'string' && spec.screedType in SCREED_TYPES ? (spec.screedType as ScreedType) : null
      const info = SCREED_TYPES[type ?? 'sand-cement']
      if (type) values.screedType = type
      const t = between(spec.thicknessMm, 0, 200)
      const thick = t !== null ? nearest(t, info.thicknessesMm) : info.defaultMm
      values.thicknessMm = thick   // a changed type starts on that type's own usual thickness, as the screen does
      if (type || t !== null) stated.push(`a ${thick}mm ${type === 'liquid' ? 'liquid' : 'sand and cement'} screed`)
      const ins = between(spec.insulationMm, 0, 300)
      if (ins !== null) { values.insulationMm = nearest(ins, SCREED_INSULATION_MM); stated.push(`${values.insulationMm}mm of insulation under it`) }
      if (!type) assumed.push('the kind of screed (taken as sand and cement)')
      if (t === null) assumed.push(`the screed thickness (taken as ${info.defaultMm}mm)`)
      break
    }
    case 'fs-floor-overlay': {
      const kind: OverlayKind | null = typeof spec.overlayKind === 'string' && spec.overlayKind in OVERLAY_KINDS ? (spec.overlayKind as OverlayKind) : null
      const info = OVERLAY_KINDS[kind ?? 'self-levelling']
      if (kind) values.kind = kind
      const t = between(spec.thicknessMm, 0, 60)
      values.thicknessMm = t !== null ? nearest(t, info.thicknessesMm) : info.defaultMm
      if (kind || t !== null) stated.push(`${values.thicknessMm}mm of ${kind === 'plywood' ? 'plywood' : 'self-levelling compound'}`)
      if (!kind) assumed.push('the kind of overlay (taken as self-levelling compound)')
      if (t === null) assumed.push(`the thickness (taken as ${info.defaultMm}mm)`)
      break
    }
    case 'fs-concrete-slab':
    case 'fs-insulated-concrete': {
      const slab = between(spec.slabMm, 50, 400)
      if (slab !== null) { values.slabMm = Math.round(slab); stated.push(`a ${values.slabMm}mm slab`) }
      const ins = between(spec.insulationMm, 0, 300)
      if (ins !== null) { values.insulationMm = nearest(ins, SLAB_INSULATION_MM); stated.push(`${values.insulationMm}mm of insulation under it`) }
      if (slab === null) assumed.push(`the slab thickness (taken as ${canonicalId === 'fs-insulated-concrete' ? 100 : 150}mm)`)
      if (ins === null) assumed.push(`the insulation (taken as ${canonicalId === 'fs-insulated-concrete' ? 150 : 100}mm)`)
      break
    }
    case 'fs-block-beam':
      break
    case 'fs-suspended-timber': {
      const kind: FloorKind | null = typeof spec.floorKind === 'string' && spec.floorKind in FLOOR_KINDS ? (spec.floorKind as FloorKind) : null
      const k = kind ?? 'ground'
      const info = FLOOR_KINDS[k]
      values.kind = k
      // a different kind of floor starts on that kind's own joist depth, bearing and insulation, as the screen does when it is changed
      values.joistDepthMm = info.defaultDepthMm
      values.carry = info.defaultCarry
      values.insulationMm = info.defaultInsulationMm
      values.vcl = info.defaultVcl
      if (kind) stated.push(info.label.split(' (')[0].toLowerCase())
      else assumed.push('which floor it is (taken as a ground floor over a ventilated void)')
      break
    }
  }
  return { areaM2, perimeterM, values, stated, assumed }
}

// ── Roofs ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type AiRoofType = 'flat' | 'mono' | 'gable' | 'hip'
const ROOF_TYPES: AiRoofType[] = ['flat', 'mono', 'gable', 'hip']

export interface AiRoof {
  /** the longer side and the shorter side (the span) of the roof, mm */
  lengthMm: number
  widthMm: number
  type: AiRoofType
  pitchDeg: number | null
  buildUp: 'warm' | 'cold' | null
  flatCovering: 'grp' | 'epdm' | 'tpo' | null
  pitchedCovering: 'concrete-tile' | 'clay-tile' | 'natural-slate' | 'fibre-cement-slate' | null
  downpipes: number | null
  drainSystem: 'upvc-hr' | 'upvc-sq' | 'alu' | 'cast' | null
  fasciaMaterial: 'upvc' | 'timber' | 'composite' | null
  assumed: string[]
}

export function roofFromScope(canonicalId: string, spec: unknown): AiRoof | null {
  if (!(ROOF_AI_IDS as readonly string[]).includes(canonicalId) || !isObj(spec)) return null
  const a = between(spec.lengthM, 0, 100), b = between(spec.widthM, 0, 100)
  if (a === null || b === null) return null   // never invent the size of the roof
  const assumed: string[] = []
  const lengthMm = Math.round(Math.max(a, b) * 1000), widthMm = Math.round(Math.min(a, b) * 1000)   // the longer side is the roof's length, as the calculators size it
  let type: AiRoofType
  if (canonicalId === 'roof-flat') type = 'flat'
  else if (typeof spec.roofType === 'string' && (ROOF_TYPES as string[]).includes(spec.roofType)) type = spec.roofType as AiRoofType
  else { type = 'flat'; assumed.push('what kind of roof it is (taken as a flat roof)') }
  const pitch = between(spec.pitchDeg, 4, 70)
  const pick = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)
  const flatCovering = pick(spec.flatCovering, ['grp', 'epdm', 'tpo'] as const)
  const pitchedCovering = pick(spec.pitchedCovering, ['concrete-tile', 'clay-tile', 'natural-slate', 'fibre-cement-slate'] as const)
  if (canonicalId === 'roof-covering' || canonicalId === 'roof-flat') {
    if (type === 'flat' && !flatCovering) assumed.push('the covering (taken as GRP)')
    if (type !== 'flat' && !pitchedCovering) assumed.push('the tile or slate (taken as concrete tiles)')
  }
  if ((canonicalId === 'roof-structure' || canonicalId === 'roof-covering') && type !== 'flat' && pitch === null) assumed.push('the pitch (taken as the calculator\'s usual for that roof)')
  return {
    lengthMm, widthMm, type, pitchDeg: pitch === null ? null : Math.round(pitch * 10) / 10,
    buildUp: pick(spec.buildUp, ['warm', 'cold'] as const), flatCovering, pitchedCovering,
    downpipes: whole(spec.downpipes, 1, 20), drainSystem: pick(spec.drainSystem, ['upvc-hr', 'upvc-sq', 'alu', 'cast'] as const),
    fasciaMaterial: pick(spec.fasciaMaterial, ['upvc', 'timber', 'composite'] as const),
    assumed,
  }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for the floor and roof calculator lines, with the exact words it may use. */
export function floorRoofPromptGuide(): string {
  const screeds = (Object.keys(SCREED_TYPES) as ScreedType[]).map(k => `${k} = ${SCREED_TYPES[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  const kinds = (Object.keys(FLOOR_KINDS) as FloorKind[]).map(k => `${k} = ${FLOOR_KINDS[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  return `For a floor calculator line (Floors & Screeds: screeded floor, existing floor overlay, concrete slab, insulated concrete floor, block and beam floor, suspended timber floor), add "calc": {"areaM2": <m²>, "lengthM": <m>, "widthM": <m>, plus only what the scope states for THAT floor}. The floor's size is required: give "areaM2", or "lengthM" and "widthM"; with none, leave "calc" out (never guess a size). Optional, only if stated: screeded floor "screedType" (${screeds}), "thicknessMm" and "insulationMm" (under the screed); overlay "overlayKind" ("self-levelling" or "plywood") and "thicknessMm"; concrete slab and insulated concrete floor "slabMm" and "insulationMm"; suspended timber floor "floorKind" (${kinds}). One floor per line: if the scope has several floors of different kinds, use the line for each kind with its own area.
  - For a roof calculator line (Roof Structure, Roof Coverings, Gutters & Downpipes, Fascias & Soffits and the whole flat roof), add "calc": {"lengthM": <m>, "widthM": <m>, "roofType": "flat"|"mono"|"gable"|"hip", "pitchDeg": <degrees>, plus only what the scope states}. "lengthM" and "widthM" are the roof's two sides in plan (required: with none, leave "calc" out); repeat the same sizes and "roofType" on every roof line of the same roof. "roofType": flat = flat roof; mono = mono-pitch or lean-to; gable = pitched with gable ends; hip = hipped. Leave out "roofType" and "pitchDeg" unless stated. Roof Structure: "buildUp" ("warm" or "cold", flat roofs only). Roof Coverings: "flatCovering" ("grp", "epdm" or "tpo") for a flat roof, "pitchedCovering" ("concrete-tile", "clay-tile", "natural-slate" or "fibre-cement-slate") for a pitched one. Gutters & Downpipes: "downpipes" (a count) and "drainSystem" ("upvc-hr" half-round uPVC, "upvc-sq" square uPVC, "alu" aluminium, "cast" cast iron). Fascias & Soffits: "fasciaMaterial" ("upvc", "timber" or "composite"). Use the roof lines instead of a general roofing task phase for the same work; do not use them for a roof that only needs repairs.`
}
