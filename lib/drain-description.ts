// The words for underground drainage on the quote: a short line (printed on the quote) and a full run-by-run description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface DrainDescriptionRun {
  name: string
  /** e.g. "110mm foul water" */
  what: string
  lengthM: number
  depthMm: number
  /** how it is dug, in words: "by machine" or "by hand" */
  dug: string
  /** what it crosses, in words, e.g. "block paving" */
  crosses: string
}

export interface DrainDescriptionInput {
  runs: DrainDescriptionRun[]
  totalLm: number
  /** the chambers, as words, e.g. "2 inspection chambers" */
  chambers: string[]
  connectExisting: number
  connectSewer: number
  cctv: boolean
  importBackfill: boolean
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeDrainShort(i: DrainDescriptionInput): string {
  if (i.runs.length === 0) return 'Underground drainage.'
  const bits = [`${i.totalLm}m of drain in ${plural(i.runs.length, 'run', 'runs')}`]
  if (i.chambers.length > 0) bits.push(i.chambers.join(', '))
  return `Underground drainage: ${bits.join(', ')}${i.cctv ? ', with a CCTV survey' : ''}.`
}

export function describeDrain(i: DrainDescriptionInput): string {
  const lines: string[] = []
  lines.push('Excavate, supply and lay the underground drainage below to the lengths and depths stated, on a granular bed and surround, to the falls the designer sets, backfilled and compacted.')
  for (const r of i.runs) lines.push(`${r.name}: ${r.lengthM}m of ${r.what} drain, about ${(r.depthMm / 1000).toFixed(1)}m deep, dug ${r.dug}, surface reinstated in ${r.crosses}.`)
  if (i.chambers.length > 0) lines.push(`Build in ${i.chambers.join(', ')}.`)
  if (i.connectExisting > 0) lines.push(`Make ${plural(i.connectExisting, 'connection', 'connections')} to the existing drain.`)
  if (i.connectSewer > 0) lines.push(`${plural(i.connectSewer, 'connection', 'connections')} to the public sewer (a provisional sum: the water company's approval and charges are separate).`)
  lines.push(i.importBackfill ? 'All the excavated soil is taken away and the trench is backfilled with imported granular material.' : 'Surplus soil is taken away; the rest is used to backfill the trench.')
  if (i.cctv) lines.push('A CCTV survey of the new drain is carried out and the report supplied.')
  // the chambers, gullies and connections are their own calculator: say so unless this (older) line still carries them
  const separate = i.chambers.length === 0 && i.connectExisting === 0 && i.connectSewer === 0
  lines.push(`Not included: ${separate ? 'inspection chambers, manholes, gullies and connections (priced separately), ' : ''}drainage inside the building or above ground (priced with the plumbing), soakaways and rainwater gullies (priced separately), the water company\'s fees and approvals, or diverting any services found in the trench.`)
  return lines.join('\n')
}
