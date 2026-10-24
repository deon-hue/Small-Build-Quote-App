// The words for the four Tiling & Finishes calculators on the quote: a short line (printed on the quote) and a full room-by-room description (the "What's included" text) for each of floor tiling, wall tiling,
// tiling preparation and electric underfloor heating. Pure, so they follow the calculator's inputs until they are edited by hand. No imports needed from the engines: the screen passes in each room already worded
// (its `parts`).

export interface TilingDescriptionRoom {
  name: string
  /** plain phrases from the engine: "porcelain tiles laid straight to 8.4m² of floor", "3.9m of edge trim" */
  parts: string[]
}
export interface TilingDescriptionInput {
  rooms: TilingDescriptionRoom[]
  /** the job runs in occupied rooms: floors and fittings protected */
  occupied: boolean
  /** the tiles are all supplied by the client (floor and wall tiling only) */
  clientTiles?: boolean
  /** the electrical connection is by others (underfloor heating only) */
  electricianByOthers?: boolean
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const withParts = (i: TilingDescriptionInput) => i.rooms.filter(r => r.parts.length > 0)
const protection = (i: TilingDescriptionInput) => i.occupied
  ? 'The rooms are occupied: floors and fittings are covered and cleaned as we go.'
  : 'Floors and fittings are protected while we work.'

export function describeTileFloorShort(i: TilingDescriptionInput): string {
  const names = withParts(i).map(r => r.name)
  return names.length === 0 ? 'Floor tiling.' : `Tile the floor: ${list(names)}.`
}
export function describeTileFloor(i: TilingDescriptionInput): string {
  const rooms = withParts(i)
  if (rooms.length === 0) return 'Floor tiling.'
  const lines: string[] = ['Tile the floors of the rooms below, grouted and sealed to the edges.']
  for (const r of rooms) lines.push(`${r.name}: ${list(r.parts)}.`)
  lines.push(protection(i))
  if (i.clientTiles) lines.push('The tiles are supplied by the client.')
  else lines.push('Tiles are priced at the allowance per m² shown above; a different tile changes the price.')
  lines.push('The floor is to be sound, dry and flat before tiling (see Tiling Preparation for levelling, backer board and waterproofing). Allow time before the floor is walked on and before grouting.')
  lines.push('Not included: preparing the floor, underfloor heating, skirting other than tiled skirting, or making good after other trades.')
  return lines.join('\n')
}

export function describeTileWallShort(i: TilingDescriptionInput): string {
  const names = withParts(i).map(r => r.name)
  return names.length === 0 ? 'Wall tiling.' : `Tile the walls: ${list(names)}.`
}
export function describeTileWall(i: TilingDescriptionInput): string {
  const rooms = withParts(i)
  if (rooms.length === 0) return 'Wall tiling.'
  const lines: string[] = ['Tile the walls of the rooms below, grouted, trimmed and sealed with silicone at the bath, tray and corners.']
  for (const r of rooms) lines.push(`${r.name}: ${list(r.parts)}.`)
  lines.push(protection(i))
  if (i.clientTiles) lines.push('The tiles are supplied by the client.')
  else lines.push('Tiles are priced at the allowance per m² shown above; a different tile changes the price.')
  lines.push('The walls are to be sound, flat and dry (see Tiling Preparation for backer board and waterproofing of the wet areas).')
  lines.push('Not included: preparing the walls, waterproofing, painting, sanitaryware or plumbing, or making good after other trades.')
  return lines.join('\n')
}

export function describeTilePrepShort(i: TilingDescriptionInput): string {
  const names = withParts(i).map(r => r.name)
  return names.length === 0 ? 'Preparation for tiling.' : `Prepare for tiling: ${list(names)}.`
}
export function describeTilePrep(i: TilingDescriptionInput): string {
  const rooms = withParts(i)
  if (rooms.length === 0) return 'Preparation for tiling.'
  const lines: string[] = ['Prepare the rooms below for tiling.']
  for (const r of rooms) lines.push(`${r.name}: ${list(r.parts)}.`)
  lines.push(protection(i))
  lines.push('Waterproofing needs time to cure before it is tiled, and the compound to dry before it is walked on: allow for this in the programme.')
  lines.push('Not included: the tiling itself, skirting and decoration, underfloor heating, or any structural repair to the floor or walls.')
  return lines.join('\n')
}

export function describeTileUfhShort(i: TilingDescriptionInput): string {
  const names = withParts(i).map(r => r.name)
  return names.length === 0 ? 'Electric underfloor heating.' : `Electric underfloor heating: ${list(names)}.`
}
export function describeTileUfh(i: TilingDescriptionInput): string {
  const rooms = withParts(i)
  if (rooms.length === 0) return 'Electric underfloor heating.'
  const lines: string[] = ['Supply and lay electric underfloor heating under the tiles in the rooms below, each room on its own thermostat with a floor sensor.']
  for (const r of rooms) lines.push(`${r.name}: ${list(r.parts)}.`)
  lines.push(protection(i))
  if (i.electricianByOthers) lines.push('The electrical connection to the supply is by others (the client\'s electrician).')
  else lines.push('A qualified electrician connects each thermostat to a dedicated circuit protected by a 30mA RCD, tests it and issues the certificate.')
  lines.push('The mat is tested before and after it is covered. It is not switched on until the adhesive and any levelling compound have fully cured, as the maker instructs.')
  lines.push('Not included: the tiles and their adhesive, the floor preparation under the heating, or any new supply cable or consumer unit work.')
  return lines.join('\n')
}
