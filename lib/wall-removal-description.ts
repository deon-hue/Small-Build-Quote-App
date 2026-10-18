// The words for a wall removal on the quote: a short line (printed on the quote) and a full part-by-part description (the "What's included" text).
// Pure and tested, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engine.

export interface WallRemovalDescriptionInput {
  /** e.g. "solid brick wall" */
  wallWords: string
  lengthM: number
  heightM: number
  thicknessMm: number
  structural: boolean
  propWeeks: number
  engineer: boolean
  buildingControl: boolean
  boxInSteel: boolean
  makeGoodPlaster: boolean
  makeGoodFloor: boolean
  dustProtection: boolean
  skips: number
  services: number
  /** e.g. "178 × 102 UB 19", when the wall is load-bearing */
  beamLabel: string
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function describeWallRemovalShort(i: WallRemovalDescriptionInput): string {
  return `${i.structural ? 'Knock through' : 'Remove'} ${i.lengthM.toFixed(1)}m of ${i.wallWords}${i.structural ? ' and fit a steel beam' : ''}, rubble cleared and made good.`
}

export function describeWallRemoval(i: WallRemovalDescriptionInput): string {
  const lines: string[] = []
  if (i.dustProtection) lines.push('Protect the floors and doorways with dust sheets and seal off the work area.')
  if (i.services > 0) lines.push(`Move or cap off ${plural(i.services, 'service', 'services')} found in the wall (a provisional sum for each).`)
  if (i.structural) {
    lines.push(`Support the structure above with needles and acrow props${i.propWeeks > 0 ? ` for ${plural(i.propWeeks, 'week', 'weeks')}` : ''}, to the engineer's design${i.engineer ? '' : ' (not included)'}.`)
  }
  lines.push(`Carefully take out ${i.lengthM.toFixed(1)}m of the ${i.wallWords} (${i.heightM.toFixed(1)}m high, ${i.thicknessMm}mm thick) and clear the rubble to ${plural(i.skips, 'skip', 'skips')}.`)
  if (i.structural) {
    lines.push(`Supply and install a steel beam (about ${i.beamLabel}, to the engineer's final design) on padstones${i.boxInSteel ? ', and box in the steel with fire board and skim' : ''}.`)
    if (i.engineer) lines.push('The structural engineer\'s design and calculations are included.')
    if (i.buildingControl) lines.push('Building Control are notified and inspect the work (a provisional sum).')
  }
  if (i.makeGoodPlaster) lines.push('Make good the plaster to the ends of the opening, the ceiling line and the new reveals, ready for decoration.')
  if (i.makeGoodFloor) lines.push('Patch the floor where the wall stood.')
  lines.push('Not included: decoration, new floor finishes beyond the patch, moving radiators or services beyond those listed, or any asbestos found.')
  return lines.join('\n')
}
