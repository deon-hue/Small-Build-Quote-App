// The customer-facing description of a hip roof structure (Roof → Roof Structure, "Pitched roof — hipped")
// — what's supplied and fitted. Kept as its own pure function so its wording can be tested, and so the
// calculator's own screen stays about the calculator. No engine types are needed here, so — unlike most
// lib/*-description.ts modules — there's nothing to import at all.

export interface HipRoofDescriptionInput {
  lengthM: number
  spanM: number
  pitchDeg: number
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

export function describeHipRoofShort(i: HipRoofDescriptionInput): string {
  if (totalRafters(i) === 0) return 'Hip roof structure — not set up yet.'
  const ridge = i.isPyramid ? 'meeting at a point (a pyramid hip)' : `to a ${i.ridgeLm.toFixed(1)}m ridge`
  const commons = i.isPyramid ? '' : `${i.commonRafterCount} common, `
  return `Hip roof structure, ${i.lengthM.toFixed(1)}m × ${i.spanM.toFixed(1)}m at ${i.pitchDeg}°: ${commons}${i.hipRafterCount} hip and ${i.jackRafterCount} jack ${i.rafterSectionLabel} rafters ${ridge}.`
}

export function describeHipRoof(i: HipRoofDescriptionInput): string {
  if (totalRafters(i) === 0) return 'Nothing is set up yet, so there is nothing to describe.'
  const lines: string[] = []
  if (i.isPyramid) {
    lines.push(
      `Rafters: ${i.commonRafterCount} common and ${i.jackRafterCount} jack ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch, plus 4 hip rafters, ` +
      `meeting at a single point — a pyramid hip, no ridge board — over ${i.slopeAreaM2.toFixed(1)}m² of slope.`,
    )
  } else {
    lines.push(
      `Rafters: ${i.commonRafterCount} common ${i.rafterSectionLabel} rafters at ${i.pitchDeg}° pitch to a ${i.ridgeLm.toFixed(1)}m ridge board, ` +
      `4 hip rafters at the corners, and ${i.jackRafterCount} jack rafters filling the hips — ${i.slopeAreaM2.toFixed(1)}m² of slope in all.`,
    )
  }
  lines.push('A wall plate is fixed along every wall — there are no gable ends on a hip roof — and the rafters are strapped to it.')
  lines.push(`Ceiling joists: ${i.ceilingJoistCount} joists span the full width, tying the wall plates together, including under the hipped ends.`)
  lines.push('Not included: the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.')
  return lines.join('\n')
}
