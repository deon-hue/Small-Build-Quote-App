// The words for external rendering on the quote: a short line (printed on the quote) and a full wall-by-wall description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in each wall already worded (its `parts`).

export interface RenderDescriptionWall {
  name: string
  /** plain phrases from the engine: "monocouche render on a scratch coat, 20.3m²", "18m of beads" */
  parts: string[]
}

export interface RenderDescriptionInput {
  walls: RenderDescriptionWall[]
  /** the scaffold is priced in with this */
  scaffold: boolean
  /** total area rendered, m² */
  totalAreaM2: number
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

export function describeRenderShort(i: RenderDescriptionInput): string {
  const walls = i.walls.filter(w => w.parts.length > 0)
  if (walls.length === 0) return 'External rendering.'
  return `Render the outside walls: ${list(walls.map(w => w.name))}, ${Math.round(i.totalAreaM2 * 10) / 10}m².`
}

export function describeRender(i: RenderDescriptionInput): string {
  const walls = i.walls.filter(w => w.parts.length > 0)
  if (walls.length === 0) return 'External rendering.'
  const lines: string[] = ['Render the outside walls below, with beads fixed to the corners, reveals and base.']
  for (const w of walls) lines.push(`${w.name}: ${list(w.parts)}.`)
  lines.push('Windows, doors and the ground are masked up and protected while we work.')
  if (i.scaffold) lines.push('Scaffold is included for the rendering.')
  lines.push('The colour and texture are agreed from a sample before we start. Render must be kept dry while it sets: allow for the weather in the programme.')
  lines.push(`Not included: ${i.scaffold ? '' : 'scaffold (priced separately), '}external wall insulation, repairs to the brickwork or damp-proof course, painting (unless stated), or changes to roof or rainwater details.`)
  return lines.join('\n')
}
