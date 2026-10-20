// The words for internal wall insulation and backing on the quote: a short line (printed on the quote) and a full wall-by-wall description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in each wall already worded (its `parts`).

export interface InsulationDescriptionWall {
  name: string
  /** plain phrases from the engine: "50mm PIR insulated plasterboard fixed to the wall, 11.1m²", "a taped vapour control layer" */
  parts: string[]
  /** how much the lining takes off the width of the room, mm (0 when there is no wall lining) */
  depthMm: number
}

export interface InsulationDescriptionInput {
  walls: InsulationDescriptionWall[]
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

export function describeInsulationShort(i: InsulationDescriptionInput): string {
  const walls = i.walls.filter(w => w.parts.length > 0)
  if (walls.length === 0) return 'Internal wall insulation.'
  return `Insulate and line the walls: ${list(walls.map(w => w.name))}.`
}

export function describeInsulation(i: InsulationDescriptionInput): string {
  const walls = i.walls.filter(w => w.parts.length > 0)
  if (walls.length === 0) return 'Internal wall insulation.'
  const lines: string[] = ['Insulate and line the walls below, ready for plastering or taping and jointing.']
  for (const w of walls) lines.push(`${w.name}: ${list(w.parts)}${w.depthMm > 0 ? `. This takes about ${Math.round(w.depthMm)}mm off the width of the room` : ''}.`)
  lines.push('Floors and fittings are protected with dust sheets while we work.')
  lines.push('Internal wall insulation changes how the wall handles moisture: the walls are checked for damp before we start, and the vapour control layer is kept continuous.')
  lines.push('Not included: the skim or decoration over the board, moving radiators, sockets or switches, damp treatment, or external wall insulation.')
  return lines.join('\n')
}
