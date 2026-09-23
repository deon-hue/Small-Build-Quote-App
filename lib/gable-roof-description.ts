// The customer-facing description of a gable roof structure (Roof → Roof Structure, "Pitched roof — gable
// ends") — what's supplied and fitted. Kept as its own pure function so its wording can be tested, and so
// the calculator's own screen stays about the calculator. GableEndTreatment is just a plain two-value union,
// restated locally rather than imported — see lib/rooflight-description.ts for why every lib/*-description.ts
// module here only takes type imports from the engine it describes, and even those only when genuinely needed.

export type GableRoofEndTreatment = 'gable' | 'existing-wall'

export interface GableRoofDescriptionInput {
  lengthM: number
  spanM: number
  pitchDeg: number
  endA: GableRoofEndTreatment
  endB: GableRoofEndTreatment
  rafterCount: number
  rafterSectionLabel: string
  ridgeLm: number
  ceilingJoistCount: number
  slopeAreaM2: number
}

const bothGable = (i: GableRoofDescriptionInput) => i.endA === 'gable' && i.endB === 'gable'

export function describeGableRoofShort(i: GableRoofDescriptionInput): string {
  if (i.rafterCount === 0) return 'Gable roof structure — not set up yet.'
  const ends = bothGable(i) ? '' : i.endA === i.endB ? ' — each end against the existing wall' : ' — one end a new gable wall, the other against the existing wall'
  return `Gable roof structure, ${i.lengthM.toFixed(1)}m × ${i.spanM.toFixed(1)}m at ${i.pitchDeg}°: ${i.rafterCount} ${i.rafterSectionLabel} rafters to a ridge, ${i.ceilingJoistCount} ceiling joists${ends}.`
}

export function describeGableRoof(i: GableRoofDescriptionInput): string {
  if (i.rafterCount === 0) return 'Nothing is set up yet, so there is nothing to describe.'
  const lines: string[] = []
  lines.push(
    `Rafters: ${i.rafterCount} × ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch, both faces, meeting a ${i.ridgeLm.toFixed(1)}m ridge board ` +
    `— ${i.slopeAreaM2.toFixed(1)}m² of slope over a ${i.lengthM.toFixed(1)}m ridge and a ${i.spanM.toFixed(1)}m overall span.`,
  )
  lines.push('A wall plate is fixed along each of the two eaves walls, and the rafters are strapped to them.')
  if (bothGable(i)) {
    lines.push('Not included: the gable end walls, the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  } else {
    lines.push(
      i.endA === i.endB
        ? 'Both gable ends are built against the existing wall — no new wall needed at either, just restraint straps tying the ridge and end rafters back to it.'
        : `One gable end is a new wall (priced separately, under External Walls); the other is built against the existing wall — no new wall needed there, just restraint straps tying the ridge and end rafters back to it.`,
    )
    lines.push('Not included: any new gable end wall, the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  }
  lines.push(`Ceiling joists: ${i.ceilingJoistCount} joists span the full width between the two wall plates, tying the rafter feet together.`)
  return lines.join('\n')
}
