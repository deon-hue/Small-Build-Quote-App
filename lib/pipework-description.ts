// The words for pipework on the quote: a short line (printed on the quote) and a full run-by-run description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface PipeworkDescriptionRun {
  name: string
  /** e.g. "22mm copper hot water" */
  what: string
  lengthM: number
  /** how it is routed, in words, e.g. "chased into the wall" */
  routed: string
  lagged: boolean
}

export interface PipeworkDescriptionInput {
  runs: PipeworkDescriptionRun[]
  totalLm: number
  valves: number
  boxingLm: number
  pressureTest: boolean
  hasGas: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describePipeworkShort(i: PipeworkDescriptionInput): string {
  if (i.runs.length === 0) return 'Pipework.'
  return `Pipework: ${i.totalLm}m in ${plural(i.runs.length, 'run', 'runs')}${i.valves > 0 ? `, ${plural(i.valves, 'isolation valve', 'isolation valves')}` : ''}${i.pressureTest ? ', pressure tested' : ''}.`
}

export function describePipework(i: PipeworkDescriptionInput): string {
  const lines: string[] = []
  lines.push('Supply and install the pipework below, complete with fittings and clips, to the lengths stated.')
  for (const r of i.runs) lines.push(`${r.name}: ${r.lengthM}m of ${r.what}, ${r.routed}${r.lagged ? ', lagged' : ''}.`)
  if (i.valves > 0) lines.push(`Fit ${plural(i.valves, 'isolation valve', 'isolation valves')}.`)
  if (i.boxingLm > 0) lines.push(`Box in ${i.boxingLm}m of the pipework.`)
  if (i.pressureTest) lines.push('Pressure test the pipework before it is covered.')
  if (i.hasGas) lines.push('Gas pipework is installed, tested and signed off by a Gas Safe registered engineer.')
  lines.push('Not included: the fittings these runs serve (priced room by room), the boiler or cylinder, making good plaster and decoration after chasing, or drainage outside the building.')
  return lines.join('\n')
}
