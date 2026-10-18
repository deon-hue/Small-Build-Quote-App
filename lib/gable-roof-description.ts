// The customer-facing description of a gable roof structure (Roof → Roof Structure, "Pitched roof — gable
// ends") — what's supplied and fitted. Kept as its own pure function so its wording can be tested, and so
// the calculator's own screen stays about the calculator. GableEndTreatment is just a plain two-value union,
// restated locally rather than imported — see lib/rooflight-description.ts for why every lib/*-description.ts
// module here only takes type imports from the engine it describes, and even those only when genuinely needed.

export type GableRoofEndTreatment = 'gable' | 'existing-wall' | 'roof-abut' | 'roof-valley' | 'roof-over'

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
  /** default 'flat' */
  ceiling?: 'flat' | 'vaulted'
  /** one sentence for each end that joins an existing roof, written by the screen (lib/roof-extras.ts describeRoofJoin) */
  extraLines?: string[]
}

const bothGable = (i: GableRoofDescriptionInput) => i.endA === 'gable' && i.endB === 'gable'
const isWall = (t: GableRoofEndTreatment) => t === 'existing-wall'
const isRoofJoin = (t: GableRoofEndTreatment) => t === 'roof-abut' || t === 'roof-valley' || t === 'roof-over'

export function describeGableRoofShort(i: GableRoofDescriptionInput): string {
  if (i.rafterCount === 0) return 'Gable roof structure — not set up yet.'
  const joins = isRoofJoin(i.endA) || isRoofJoin(i.endB)
  const ends = bothGable(i) ? '' : joins ? ' — joined into the existing roof' : i.endA === i.endB ? ' — each end against the existing wall' : ' — one end a new gable wall, the other against the existing wall'
  const ceiling = i.ceiling === 'vaulted' ? 'a vaulted ceiling (no ceiling joists)' : `${i.ceilingJoistCount} ceiling joists`
  return `Gable roof structure, ${i.lengthM.toFixed(1)}m × ${i.spanM.toFixed(1)}m at ${i.pitchDeg}°: ${i.rafterCount} ${i.rafterSectionLabel} rafters to a ridge${i.ceiling === 'vaulted' ? ' beam' : ''}, ${ceiling}${ends}.`
}

export function describeGableRoof(i: GableRoofDescriptionInput): string {
  if (i.rafterCount === 0) return 'Nothing is set up yet, so there is nothing to describe.'
  const lines: string[] = []
  lines.push(
    `Rafters: ${i.rafterCount} × ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch, both faces, meeting a ${i.ridgeLm.toFixed(1)}m ridge ${i.ceiling === 'vaulted' ? 'beam' : 'board'} ` +
    `— ${i.slopeAreaM2.toFixed(1)}m² of slope over a ${i.lengthM.toFixed(1)}m ridge and a ${i.spanM.toFixed(1)}m overall span.`,
  )
  lines.push('A wall plate is fixed along each of the two eaves walls, and the rafters are strapped to them.')
  if (bothGable(i)) {
    lines.push('Not included: the gable end walls, the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  } else {
    const walls = [i.endA, i.endB].filter(isWall).length
    if (walls === 2) lines.push('Both gable ends are built against the existing wall — no new wall needed at either, just restraint straps tying the ridge and end rafters back to it.')
    else if (walls === 1) lines.push('One gable end is built against the existing wall — no new wall needed there, just restraint straps tying the ridge and end rafters back to it.')
    if ([i.endA, i.endB].some(t => t === 'gable')) lines.push('A new gable end wall is priced separately, under External Walls.')
    for (const l of i.extraLines ?? []) lines.push(l)
    lines.push('Not included: any new gable end wall, the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  }
  if (i.ceiling === 'vaulted') {
    lines.push('Vaulted ceiling: there are no ceiling joists. The ridge is a beam, carried on a bearing at each end, and the ceiling follows the rafters. Not included: the insulation and the plasterboard lining of the vaulted ceiling, which are priced separately.')
  } else {
    lines.push(`Ceiling joists: ${i.ceilingJoistCount} joists span the full width between the two wall plates, tying the rafter feet together.`)
  }
  return lines.join('\n')
}
