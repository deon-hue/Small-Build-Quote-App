// The customer-facing description of a gable roof structure (Roof → Roof Structure, "Pitched roof — gable
// ends") — what's supplied and fitted. Kept as its own pure function so its wording can be tested, and so
// the calculator's own screen stays about the calculator. Type-only import from the engine, like every
// lib/*-description.ts module here — see lib/rooflight-description.ts for why.

export interface GableRoofDescriptionInput {
  lengthM: number
  spanM: number
  pitchDeg: number
  rafterCount: number
  rafterSectionLabel: string
  ridgeLm: number
  ceilingJoistCount: number
  slopeAreaM2: number
}

export function describeGableRoofShort(i: GableRoofDescriptionInput): string {
  if (i.rafterCount === 0) return 'Gable roof structure — not set up yet.'
  return `Gable roof structure, ${i.lengthM.toFixed(1)}m × ${i.spanM.toFixed(1)}m at ${i.pitchDeg}°: ${i.rafterCount} ${i.rafterSectionLabel} rafters to a ridge, ${i.ceilingJoistCount} ceiling joists.`
}

export function describeGableRoof(i: GableRoofDescriptionInput): string {
  if (i.rafterCount === 0) return 'Nothing is set up yet, so there is nothing to describe.'
  const lines: string[] = []
  lines.push(
    `Rafters: ${i.rafterCount} × ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch, both faces, meeting a ${i.ridgeLm.toFixed(1)}m ridge board ` +
    `— ${i.slopeAreaM2.toFixed(1)}m² of slope over a ${i.lengthM.toFixed(1)}m ridge and a ${i.spanM.toFixed(1)}m overall span.`,
  )
  lines.push('A wall plate is fixed along each of the two eaves walls, and the rafters are strapped to them.')
  lines.push(`Ceiling joists: ${i.ceilingJoistCount} joists span the full width between the two wall plates, tying the rafter feet together.`)
  lines.push('Not included: the gable end walls, the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  return lines.join('\n')
}
