// The customer-facing description of a mono-pitch (lean-to) roof structure (Roof → Roof Structure, "Mono-pitch
// / lean-to roof") — what's supplied and fitted, part by part. Kept as its own pure function so its wording
// can be tested, and so the calculator's own screen stays about the calculator. Type-only import from the
// engine, like every lib/*-description.ts module here — see lib/rooflight-description.ts for why.

import type { MonoPitchWallConnection, MonoPitchOpeningKind } from './mono-pitch-roof'

// Its own copy of the kind phrases — see lib/rooflight-description.ts for why every lib/*-description.ts
// module here only takes type imports from the engine it describes.
const KIND_PHRASE: Record<MonoPitchOpeningKind, string> = {
  lantern:      'a roof lantern',
  'roof-window': 'a roof window',
  dome:         'a dome rooflight',
  hatch:        'an access hatch',
}
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export interface MonoPitchDescriptionInput {
  lengthM: number
  spanM: number
  pitchDeg: number
  rafterCount: number
  rafterSectionLabel: string
  highWallConnection: MonoPitchWallConnection
  slopeAreaM2: number
  openings: { kind: MonoPitchOpeningKind; widthMm: number; depthMm: number; trimmers: 2 | 3 }[]
}

export function describeMonoPitchRoofShort(i: MonoPitchDescriptionInput): string {
  if (i.rafterCount === 0) return 'Mono-pitch (lean-to) roof structure — not set up yet.'
  const highWall = i.highWallConnection === 'ledger' ? 'ledgered to the existing wall' : 'bearing on its own wall plate'
  const openings = i.openings.length ? ` and ${i.openings.length} rooflight ${plural(i.openings.length, 'opening', 'openings')}` : ''
  return `Mono-pitch (lean-to) roof structure, ${i.lengthM.toFixed(1)}m × ${i.spanM.toFixed(1)}m at ${i.pitchDeg}°: ${i.rafterCount} ${i.rafterSectionLabel} rafters, ${highWall} at the high wall${openings}.`
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
  if (i.openings.length) {
    const list = i.openings.map(o => `${KIND_PHRASE[o.kind]} (${o.widthMm} × ${o.depthMm}mm, ${o.trimmers === 3 ? 'tripled' : 'doubled'} trimmers)`)
    const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]
    lines.push(`Rooflight openings: ${plural(i.openings.length, 'an opening is', 'openings are')} formed in the roof for ${joined}. ${plural(i.openings.length, 'It is', 'Each is')} framed with doubled or tripled rafters and headers, and built up with a clad timber kerb, ready for the rooflight to be fitted. The rooflights themselves are supplied and fitted separately.`)
  }
  lines.push(`Not included: ${i.openings.length ? 'the rooflights themselves, ' : ''}the roof covering, gutters and downpipes, and any fascia, soffit and barge boards, which are priced separately.`)
  return lines.join('\n')
}
