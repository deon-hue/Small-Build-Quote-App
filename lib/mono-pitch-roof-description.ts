// The customer-facing description of a mono-pitch (lean-to) roof structure (Roof → Roof Structure, "Mono-pitch
// / lean-to roof") — what's supplied and fitted, part by part. Kept as its own pure function so its wording
// can be tested, and so the calculator's own screen stays about the calculator. Type-only import from the
// engine, like every lib/*-description.ts module here — see lib/rooflight-description.ts for why.

import type { MonoPitchWallConnection } from './mono-pitch-roof'

export interface MonoPitchDescriptionInput {
  lengthM: number
  spanM: number
  pitchDeg: number
  rafterCount: number
  rafterSectionLabel: string
  highWallConnection: MonoPitchWallConnection
  slopeAreaM2: number
}

export function describeMonoPitchRoofShort(i: MonoPitchDescriptionInput): string {
  if (i.rafterCount === 0) return 'Mono-pitch (lean-to) roof structure — not set up yet.'
  const highWall = i.highWallConnection === 'ledger' ? 'ledgered to the existing wall' : 'bearing on its own wall plate'
  return `Mono-pitch (lean-to) roof structure, ${i.lengthM.toFixed(1)}m × ${i.spanM.toFixed(1)}m at ${i.pitchDeg}°: ${i.rafterCount} ${i.rafterSectionLabel} rafters, ${highWall} at the high wall.`
}

export function describeMonoPitchRoof(i: MonoPitchDescriptionInput): string {
  if (i.rafterCount === 0) return 'Nothing is set up yet, so there is nothing to describe.'
  const lines: string[] = []
  lines.push(
    `Rafters: ${i.rafterCount} × ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch, spanning ${i.spanM.toFixed(1)}m ` +
    `plan (${i.slopeAreaM2.toFixed(1)}m² of slope) over a ${i.lengthM.toFixed(1)}m eaves length.`,
  )
  lines.push('A wall plate is fixed along the low (eaves) wall, and the rafters are strapped to it.')
  lines.push(
    i.highWallConnection === 'ledger'
      ? 'At the high wall, a ledger plate is bolted to the existing wall and the rafters hang from joist hangers.'
      : 'At the high wall, the rafters bear on their own wall plate, strapped to the wall for lateral restraint.',
  )
  lines.push('Not included: the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  return lines.join('\n')
}
