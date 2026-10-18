// The words for underfloor heating on the quote: a short line (printed on the quote) and a full zone-by-zone description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface UfhDescriptionZone {
  name: string
  areaM2: number
  /** how the pipe is laid, in words, e.g. "in the screed" */
  laid: string
  spacingMm: number
  loops: number
}

export interface UfhDescriptionInput {
  zones: UfhDescriptionZone[]
  totalAreaM2: number
  manifolds: number
  mixingGroup: boolean
  commission: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeUfhShort(i: UfhDescriptionInput): string {
  if (i.zones.length === 0) return 'Underfloor heating.'
  return `Warm water underfloor heating, ${i.totalAreaM2.toFixed(0)}m² in ${plural(i.zones.length, 'zone', 'zones')}, with ${plural(i.manifolds, 'manifold', 'manifolds')} and thermostat control${i.commission ? ', tested and commissioned' : ''}.`
}

export function describeUfh(i: UfhDescriptionInput): string {
  const lines: string[] = []
  lines.push('Supply and install warm water underfloor heating to each zone below: 16mm pipe laid in loops at the stated centres, connected back to the manifold.')
  for (const z of i.zones) lines.push(`${z.name}: ${z.areaM2.toFixed(1)}m², pipe laid ${z.laid} at ${z.spacingMm}mm centres (${plural(z.loops, 'loop', 'loops')}), with its own room thermostat.`)
  if (i.manifolds > 0) lines.push(`Fit ${plural(i.manifolds, 'manifold', 'manifolds')} with flow meters, valves and actuators, and a wiring centre for the thermostats${i.mixingGroup ? ', with a mixing group (blending valve and pump) so the floor runs at a lower temperature than the boiler' : ''}, and connect it to the heating flow and return.`)
  if (i.commission) lines.push('Pressure test the pipework before it is covered, balance the loops and bring the floor up to temperature gradually.')
  lines.push('Not included: the floor insulation and screed over the pipes (priced separately), the heat source, the floor covering, or the electrical supply to the wiring centre and pump.')
  return lines.join('\n')
}
