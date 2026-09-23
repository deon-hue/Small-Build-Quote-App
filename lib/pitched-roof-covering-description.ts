// The customer-facing description of a pitched roof covering (Roof → Roof Coverings, pitched) — what's
// supplied and fitted. Kept as its own pure function so its wording can be tested, and so the calculator's
// own screen stays about the calculator. Type-only import from the engine, like every lib/*-description.ts
// module here — see lib/rooflight-description.ts for why.

import type { PitchedCoveringMaterial } from './pitched-roof-covering'

const MATERIAL_PHRASE: Record<PitchedCoveringMaterial, string> = {
  'concrete-tile': 'concrete interlocking tiles',
  'clay-tile': 'plain clay tiles',
  'natural-slate': 'natural slate',
  'fibre-cement-slate': 'fibre cement slate',
}

export interface PitchedRoofCoveringDescriptionInput {
  material: PitchedCoveringMaterial
  slopeAreaM2: number
  battenGaugeMm: number
  ridgeLm: number
  hipLm: number
  vergeLm: number
  abutmentLm: number
}

export function describePitchedRoofCoveringShort(i: PitchedRoofCoveringDescriptionInput): string {
  if (i.slopeAreaM2 === 0) return 'Pitched roof covering — not set up yet.'
  const bits: string[] = [`${MATERIAL_PHRASE[i.material]}, ${i.slopeAreaM2.toFixed(1)}m² at a ${i.battenGaugeMm}mm gauge`]
  if (i.ridgeLm > 0) bits.push(`${i.ridgeLm.toFixed(1)}m ridge`)
  if (i.hipLm > 0) bits.push(`${i.hipLm.toFixed(1)}m hips`)
  if (i.vergeLm > 0) bits.push(`${i.vergeLm.toFixed(1)}m verge`)
  if (i.abutmentLm > 0) bits.push(`${i.abutmentLm.toFixed(1)}m abutment flashing`)
  return `Pitched roof covering: ${bits.join(', ')}.`
}

export function describePitchedRoofCovering(i: PitchedRoofCoveringDescriptionInput): string {
  if (i.slopeAreaM2 === 0) return 'Nothing is set up yet, so there is nothing to describe.'
  const lines: string[] = []
  lines.push(`Covering: ${MATERIAL_PHRASE[i.material]} over battens at a ${i.battenGaugeMm}mm gauge and a breather membrane, ${i.slopeAreaM2.toFixed(1)}m² in all.`)
  const trims: string[] = []
  if (i.ridgeLm > 0) trims.push(`${i.ridgeLm.toFixed(1)}m of ridge capping`)
  if (i.hipLm > 0) trims.push(`${i.hipLm.toFixed(1)}m of hip capping`)
  if (i.vergeLm > 0) trims.push(`${i.vergeLm.toFixed(1)}m of verge`)
  if (i.abutmentLm > 0) trims.push(`${i.abutmentLm.toFixed(1)}m of lead flashing where the roof meets a wall`)
  if (trims.length) {
    const joined = trims.length > 1 ? `${trims.slice(0, -1).join(', ')} and ${trims[trims.length - 1]}` : trims[0]
    lines.push(`Trims: ${joined}.`)
  }
  lines.push('Not included: the roof structure, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  return lines.join('\n')
}
