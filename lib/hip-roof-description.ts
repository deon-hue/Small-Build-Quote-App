// The customer-facing description of a hip roof structure (Roof → Roof Structure, "Pitched roof — hipped")
// — what's supplied and fitted. Kept as its own pure function so its wording can be tested, and so the
// calculator's own screen stays about the calculator. No engine types are needed here (HipEndTreatment is
// just a plain three-value union, restated locally), so — unlike most lib/*-description.ts modules — there's
// nothing to import at all.

export type HipRoofEndTreatment = 'hip' | 'gable' | 'existing-wall'

const END_PHRASE: Record<HipRoofEndTreatment, string> = {
  hip: 'hipped',
  gable: 'a gable end',
  'existing-wall': 'built against the existing wall',
}

export interface HipRoofDescriptionInput {
  lengthM: number
  spanM: number
  pitchDeg: number
  endA: HipRoofEndTreatment
  endB: HipRoofEndTreatment
  isPyramid: boolean
  ridgeLm: number
  rafterSectionLabel: string
  commonRafterCount: number
  hipRafterCount: number
  jackRafterCount: number
  ceilingJoistCount: number
  slopeAreaM2: number
}

const totalRafters = (i: HipRoofDescriptionInput) => i.commonRafterCount + i.hipRafterCount + i.jackRafterCount
const bothHipped = (i: HipRoofDescriptionInput) => i.endA === 'hip' && i.endB === 'hip'

export function describeHipRoofShort(i: HipRoofDescriptionInput): string {
  if (totalRafters(i) === 0) return 'Hip roof structure — not set up yet.'
  const ridge = i.isPyramid ? 'meeting at a point (a pyramid hip)' : `to a ${i.ridgeLm.toFixed(1)}m ridge`
  const rafters = i.isPyramid
    ? `${i.hipRafterCount} hip and ${i.jackRafterCount} jack ${i.rafterSectionLabel} rafters ${ridge}`
    : i.hipRafterCount > 0
      ? `${i.commonRafterCount} common, ${i.hipRafterCount} hip and ${i.jackRafterCount} jack ${i.rafterSectionLabel} rafters ${ridge}`
      : `${i.commonRafterCount} common ${i.rafterSectionLabel} rafters ${ridge}`
  const ends = bothHipped(i) ? '' : i.endA === i.endB ? ` — each end ${END_PHRASE[i.endA]}` : ` — one end ${END_PHRASE[i.endA]}, the other ${END_PHRASE[i.endB]}`
  return `Hip roof structure, ${i.lengthM.toFixed(1)}m × ${i.spanM.toFixed(1)}m at ${i.pitchDeg}°: ${rafters}${ends}.`
}

export function describeHipRoof(i: HipRoofDescriptionInput): string {
  if (totalRafters(i) === 0) return 'Nothing is set up yet, so there is nothing to describe.'
  const lines: string[] = []
  if (i.isPyramid) {
    lines.push(
      `Rafters: ${i.commonRafterCount} common and ${i.jackRafterCount} jack ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch, plus ${i.hipRafterCount} hip rafters, ` +
      `meeting at a single point — a pyramid hip, no ridge board — over ${i.slopeAreaM2.toFixed(1)}m² of slope.`,
    )
  } else if (i.hipRafterCount > 0) {
    lines.push(
      `Rafters: ${i.commonRafterCount} common ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch to a ${i.ridgeLm.toFixed(1)}m ridge board, ` +
      `${i.hipRafterCount} hip rafters, and ${i.jackRafterCount} jack rafters filling the hip${i.hipRafterCount > 2 ? 's' : ''} — ${i.slopeAreaM2.toFixed(1)}m² of slope in all.`,
    )
  } else {
    lines.push(
      `Rafters: ${i.commonRafterCount} common ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch to a ${i.ridgeLm.toFixed(1)}m ridge board, no hips — ` +
      `${i.slopeAreaM2.toFixed(1)}m² of slope in all.`,
    )
  }
  if (bothHipped(i)) {
    lines.push('A wall plate is fixed along every wall — there are no gable ends on this roof — and the rafters are strapped to it.')
  } else {
    const endNote = (e: HipRoofEndTreatment) => e === 'existing-wall' ? ' — no new wall needed there, just restraint straps back to it' : ''
    lines.push(
      i.endA === i.endB
        ? `Each end is ${END_PHRASE[i.endA]}${endNote(i.endA)}.`
        : `One end is ${END_PHRASE[i.endA]}${endNote(i.endA)}, the other is ${END_PHRASE[i.endB]}${endNote(i.endB)}.`,
    )
    lines.push('A wall plate is fixed along every eaves wall and any new gable end, and the rafters are strapped to it.')
    if (i.endA === 'gable' || i.endB === 'gable') lines.push('The gable end wall itself is priced separately, under External Walls.')
  }
  lines.push(`Ceiling joists: ${i.ceilingJoistCount} joists span the full width, tying the wall plates together, including under any hipped end.`)
  lines.push('Not included: the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  return lines.join('\n')
}
