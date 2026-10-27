// The words for hacking off existing render on the quote: a short line (printed on the quote) and a full wall-by-wall description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine: the screen passes in each wall already worded (its `parts`).

export interface RenderHackoffDescriptionWall {
  name: string
  /** plain phrases from the engine: "hack off the sand and cement render, 24.6m²", "the bare masonry brushed down and washed" */
  parts: string[]
}

export interface RenderHackoffDescriptionInput {
  walls: RenderHackoffDescriptionWall[]
  /** the scaffold is priced in with this */
  scaffold: boolean
  /** total area hacked off, m² */
  totalAreaM2: number
  skips: number
  grabLoads: number
  /** samples of old coatings sent for an asbestos test */
  asbestosTests: number
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeRenderHackoffShort(i: RenderHackoffDescriptionInput): string {
  const walls = i.walls.filter(w => w.parts.length > 0)
  if (walls.length === 0) return 'Hack off existing external render.'
  return `Hack off the existing render: ${list(walls.map(w => w.name))}, ${Math.round(i.totalAreaM2 * 10) / 10}m².`
}

export function describeRenderHackoff(i: RenderHackoffDescriptionInput): string {
  const walls = i.walls.filter(w => w.parts.length > 0)
  if (walls.length === 0) return 'Hack off existing external render.'
  const lines: string[] = ['Hack off the existing render from the outside walls below and take the rubble away from site.']
  for (const w of walls) lines.push(`${w.name}: ${list(w.parts)}.`)
  lines.push('Windows, doors and the ground are masked up and sheeted to keep the dust and stones off them while we work.')
  if (i.asbestosTests > 0) lines.push(`${plural(i.asbestosTests, 'sample', 'samples')} of the old coating ${i.asbestosTests === 1 ? 'is' : 'are'} tested for asbestos before it is hacked off.`)
  const away = [i.skips > 0 ? plural(i.skips, 'skip', 'skips') : '', i.grabLoads > 0 ? plural(i.grabLoads, 'grab lorry load', 'grab lorry loads') : ''].filter(Boolean).join(' and ')
  if (away) lines.push(`The rubble is cleared to ${away} and taken away by a licensed carrier.`)
  if (i.scaffold) lines.push('Scaffold is included for the work.')
  lines.push(`Not included: ${i.scaffold ? '' : 'scaffold (priced separately), '}new render or painting, repairs to the brickwork or damp-proof course behind (unless stated), taking off any insulation boards, or any asbestos removal.`)
  return lines.join('\n')
}
