// What the AI quote can hand to the four Tiling & Finishes calculators (Floor Tiling, Wall Tiling, Tiling Preparation, Electric Underfloor Heating, all by room): the rooms, tiled areas and finishes the scope
// describes, checked here and turned into each calculator's own inputs. Only what the scope says: a room with no stated size gets the typical size for its kind and is reported, a wall area with no stated size
// is left to the kind's usual areas and reported, a tile that is not named is a standard one and reported, and the electrician is included unless the scope says someone else connects the heating.
// Pure (apart from the calculators' own tables), so it can be tested with a loader that resolves the extension-less imports.

import {
  TILING_ROOM_KINDS, TILING_ROOM_KIND_BY_ID, DEFAULT_TILING_SITUATIONS, TILE_SIZES, TILE_LAYOUTS, GROUT_KINDS, zonesFromKind, allWallsZone, newZoneId,
  type TileSizeId, type TileLayoutId, type GroutId, type TilingZone,
} from './tiling-common'
import { newTileFloorRoom, type TileFloorRoom } from './tile-floor-units'
import { newTileWallRoom, type TileWallRoom } from './tile-wall-units'
import {
  newTilePrepRoom, newPrepZone, BACKER_BOARDS, WALL_BASE_LABEL, TANK_LABEL, FLOOR_COVER_LABEL, CEILING_LABEL,
  type TilePrepRoom, type PrepZone, type BackerId, type WallBase, type TankSystem, type FloorCover, type CeilingKind,
} from './tile-prep-units'
import { newTileUfhRoom, UFH_KITS, THERMOSTAT_INFO, INSULATION_INFO, type TileUfhRoom, type UfhKit, type UfhThermostat, type UfhInsulation } from './tile-ufh-units'
import { isObj, whole, between, str } from './ai-spec'

let seq = 0
const situationOf = (v: unknown, fallback = 'empty'): string => (typeof v === 'string' && DEFAULT_TILING_SITUATIONS.some(s => s.id === v) ? v : fallback)
const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)
const TILE_IDS = TILE_SIZES.map(t => t.id) as TileSizeId[]
const LAYOUT_IDS = TILE_LAYOUTS.map(l => l.id) as TileLayoutId[]
const GROUT_IDS = GROUT_KINDS.map(g => g.id) as GroutId[]
const BACKER_IDS = BACKER_BOARDS.map(b => b.id) as BackerId[]

/** The kind of room a name looks like ("Ensuite" -> bathroom, "Wet room" -> shower), for a room the AI named without a kind. */
export function guessTilingRoomKind(name: string): string {
  const n = name.toLowerCase()
  const has = (...w: string[]) => w.some(x => n.includes(x))
  if (has('wet room', 'shower')) return 'shower'
  if (has('bath', 'en-suite', 'ensuite', 'en suite')) return 'bathroom'
  if (has('wc', 'cloak', 'toilet')) return 'cloakroom'
  if (has('kitchen')) return 'kitchen'
  if (has('utility', 'laundry', 'boot')) return 'utility'
  if (has('hall', 'landing', 'stair', 'entrance', 'porch')) return 'hall'
  if (has('conservatory', 'orangery', 'garden room', 'sun room', 'sunroom')) return 'conservatory'
  if (has('living', 'lounge', 'sitting', 'reception', 'family', 'dining', 'extension', 'open plan')) return 'living'
  return 'other'
}
const kindOf = (raw: Record<string, unknown>, name: string) => {
  const k = typeof raw.kind === 'string' && TILING_ROOM_KIND_BY_ID[raw.kind] ? raw.kind : guessTilingRoomKind(name)
  return { id: k, info: TILING_ROOM_KIND_BY_ID[k] }
}
const seen = (rooms: { name: string }[], name: string) => rooms.some(r => r.name.toLowerCase() === name.toLowerCase())
const sizeNote = (name: string, l: number | null, w: number | null, k: { lengthM: number; widthM: number }) => `${name} (${l === null && w === null ? 'a typical ' : 'part typical, '}${l ?? k.lengthM}m × ${w ?? k.widthM}m)`

// ── Floor tiling, by room ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiTileFloor { rooms: TileFloorRoom[]; jobSituationId: string; typicalRooms: string[]; assumed: string[] }

export function tileFloorFromScope(spec: unknown): AiTileFloor | null {
  if (!isObj(spec)) return null
  const rooms: TileFloorRoom[] = []
  const typicalRooms: string[] = []
  const unnamedTile: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name || seen(rooms, name)) continue
    const { id: kindId, info: k } = kindOf(raw, name)
    const tile = oneOf(raw.tile, TILE_IDS)
    const room = newTileFloorRoom('ai-room-' + ++seq, name, kindId, k, { tileId: tile ?? 'large', layoutId: oneOf(raw.layout, LAYOUT_IDS) ?? 'straight' })
    if (!tile) unnamedTile.push(name)
    const area = between(raw.areaM2, 0, 500)
    const l = between(raw.lengthM, 0, 40), w = between(raw.widthM, 0, 40)
    if (area !== null) { room.areaOverrideM2 = area; room.notTiledM2 = 0 }
    else {
      if (l !== null) room.lengthM = l
      if (w !== null) room.widthM = w
      if (l === null || w === null) typicalRooms.push(sizeNote(name, l, w, k))
      const nt = between(raw.notTiledM2, 0, 100)
      if (nt !== null) room.notTiledM2 = nt
    }
    room.doors = whole(raw.doors, 0, 20) ?? room.doors
    room.clientSupplies = raw.clientSupplies === true
    room.tilePriceM2 = room.clientSupplies ? null : between(raw.tilePriceM2, 0, 1000)
    room.groutId = oneOf(raw.grout, GROUT_IDS) ?? 'cement'
    room.sealed = raw.sealed === true
    room.skirtingLm = between(raw.skirtingLm, 0, 300) ?? 0
    room.movementJointLm = between(raw.movementJointLm, 0, 300) ?? 0
    rooms.push(room)
  }
  if (rooms.length === 0) return null
  const assumed: string[] = []
  if (unnamedTile.length > 0) assumed.push(`no tile was named for ${unnamedTile.join(', ')}, so 600 x 600 tiles at a sample allowance were used`)
  return { rooms, jobSituationId: situationOf(spec.situation), typicalRooms, assumed }
}

// ── Wall tiling, by room ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiTileWall { rooms: TileWallRoom[]; jobSituationId: string; assumed: string[] }

export function tileWallFromScope(spec: unknown): AiTileWall | null {
  if (!isObj(spec)) return null
  const rooms: TileWallRoom[] = []
  const assumed: string[] = []
  const unnamedTile: string[] = []
  const usualAreas: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name || seen(rooms, name)) continue
    const { id: kindId, info: k } = kindOf(raw, name)
    const heightM = between(raw.heightM, 1.8, 8) ?? k.heightM
    const tile = oneOf(raw.tile, TILE_IDS)
    const zones: TilingZone[] = []
    const areas = Array.isArray(raw.areas) ? raw.areas.slice(0, 12) : []
    for (const a of areas) {
      if (!isObj(a)) continue
      const aName = str(a.name, 60) || 'Wall area'
      const len = between(a.lengthM, 0, 100), h = between(a.heightM, 0, 8), m2 = between(a.areaM2, 0, 500)
      if (len !== null && h !== null) zones.push({ id: newZoneId(), label: aName, lengthM: len, heightM: h, deductM2: between(a.lessM2, 0, 100) ?? 0 })
      else if (m2 !== null) zones.push({ id: newZoneId(), label: aName, lengthM: +(m2 / heightM).toFixed(2), heightM, deductM2: 0 })
    }
    if (raw.fullHeight === true) {
      const l = between(raw.lengthM, 0, 40), w = between(raw.widthM, 0, 40)
      zones.push(allWallsZone({ lengthM: l ?? k.lengthM, widthM: w ?? k.widthM, heightM, doors: whole(raw.doors, 0, 20) ?? k.doors, windows: whole(raw.windows, 0, 20) ?? k.windows }))
      if (l === null || w === null) assumed.push(`${name}: a typical ${k.lengthM}m × ${k.widthM}m room for the full-height walls`)
    }
    if (zones.length === 0) {
      const usual = zonesFromKind(kindId)
      if (usual.length === 0) continue   // nothing to tile that the scope states, and no usual areas for this kind of room
      zones.push(...usual)
      usualAreas.push(name)
    }
    if (!tile) unnamedTile.push(name)
    const room = newTileWallRoom('ai-room-' + ++seq, name, kindId, heightM, zones, { tileId: tile ?? 'medium', layoutId: oneOf(raw.layout, LAYOUT_IDS) ?? 'straight' })
    room.clientSupplies = raw.clientSupplies === true
    room.tilePriceM2 = room.clientSupplies ? null : between(raw.tilePriceM2, 0, 1000)
    room.groutId = oneOf(raw.grout, GROUT_IDS) ?? 'cement'
    room.sealed = raw.sealed === true
    room.niches = whole(raw.niches, 0, 10) ?? 0
    room.externalCornerLm = between(raw.externalCornerLm, 0, 100) ?? 0
    rooms.push(room)
  }
  if (rooms.length === 0) return null
  if (unnamedTile.length > 0) assumed.push(`no tile was named for ${unnamedTile.join(', ')}, so 300 x 600 tiles at a sample allowance were used`)
  if (usualAreas.length > 0) assumed.push(`no wall areas were stated for ${usualAreas.join(', ')}, so the usual tiled areas for that kind of room were used`)
  return { rooms, jobSituationId: situationOf(spec.situation), assumed }
}

// ── Tiling preparation, by room ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiTilePrep { rooms: TilePrepRoom[]; jobSituationId: string; typicalRooms: string[]; assumed: string[] }

export function tilePrepFromScope(spec: unknown): AiTilePrep | null {
  if (!isObj(spec)) return null
  const rooms: TilePrepRoom[] = []
  const typicalRooms: string[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name || seen(rooms, name)) continue
    const { id: kindId, info: k } = kindOf(raw, name)
    // wet areas: the usual ones for this kind of room, boarded and tanked, when the scope says so without sizing them
    const zones: PrepZone[] = []
    const heightM = between(raw.heightM, 1.8, 8) ?? k.heightM
    const walls = Array.isArray(raw.walls) ? raw.walls.slice(0, 12) : []
    for (const a of walls) {
      if (!isObj(a)) continue
      const len = between(a.lengthM, 0, 100), h = between(a.heightM, 0, 8), m2 = between(a.areaM2, 0, 500)
      let z: TilingZone | null = null
      if (len !== null && h !== null) z = { id: newZoneId(), label: str(a.name, 60) || 'Wall area', lengthM: len, heightM: h, deductM2: between(a.lessM2, 0, 100) ?? 0 }
      else if (m2 !== null) z = { id: newZoneId(), label: str(a.name, 60) || 'Wall area', lengthM: +(m2 / heightM).toFixed(2), heightM, deductM2: 0 }
      if (!z) continue
      const pz = newPrepZone(z)
      const board = a.board === 'none' ? 'none' : oneOf(a.board, BACKER_IDS)
      pz.boardId = board ?? 'foam-10'
      pz.base = oneOf(a.base, Object.keys(WALL_BASE_LABEL) as WallBase[]) ?? 'studs'
      pz.tanked = a.tanked === true
      zones.push(pz)
    }
    const wetRequested = raw.usualWetAreas === true
    const usualWet = wetRequested && zones.length === 0
    const base = zones.length > 0 ? zones : usualWet ? zonesFromKind(kindId).map(newPrepZone) : []
    const room = newTilePrepRoom('ai-room-' + ++seq, name, kindId, { lengthM: k.lengthM, widthM: k.widthM, heightM, collars: k.collars }, base)
    const l = between(raw.lengthM, 0, 40), w = between(raw.widthM, 0, 40), area = between(raw.areaM2, 0, 500)
    if (area !== null) room.floorAreaOverrideM2 = area
    else {
      if (l !== null) room.lengthM = l
      if (w !== null) room.widthM = w
      if (l === null || w === null) typicalRooms.push(sizeNote(name, l, w, k))
    }
    if (usualWet) assumed.push(`${name}: the usual wet areas for that kind of room were boarded and waterproofed`)
    if (raw.inheritedFromWallTiling === true) assumed.push(`${name}: the wall areas are the ones in the Wall Tiling line (the wet ones boarded and waterproofed)`)
    const f = isObj(raw.floor) ? raw.floor : {}
    const levelMm = whole(f.levelMm, 0, 40) ?? 0
    const cover = oneOf(f.cover, Object.keys(FLOOR_COVER_LABEL) as FloorCover[]) ?? 'none'
    room.floor = {
      primer: f.primer === true || levelMm > 0 || cover !== 'none', levelMm, cover, coverBoardId: oneOf(f.board, BACKER_IDS) ?? 'cement-12',
      tanked: f.tanked === true || (wetRequested && kindId === 'shower'),
    }
    room.tankSystem = oneOf(raw.tankSystem, Object.keys(TANK_LABEL) as TankSystem[]) ?? 'liquid'
    room.cuffs = whole(raw.cuffs, 0, 10) ?? (room.floor.tanked && kindId === 'shower' ? 1 : 0)
    const ceil = oneOf(raw.ceiling, Object.keys(CEILING_LABEL) as CeilingKind[]) ?? 'none'
    room.ceiling = { kind: ceil, areaOverrideM2: null, boardId: oneOf(raw.ceilingBoard, BACKER_IDS) ?? 'foam-10' }
    const anything = room.zones.some(z => z.boardId !== 'none' || z.tanked) || room.floor.primer || room.floor.tanked || room.ceiling.kind !== 'none'
    if (!anything) continue   // the scope named the room but nothing to prepare
    rooms.push(room)
  }
  if (rooms.length === 0) return null
  return { rooms, jobSituationId: situationOf(spec.situation), typicalRooms, assumed }
}

/** The wall tiling line's tiled areas, handed to the preparation line: a preparation room that asks for the wet areas to be boarded and waterproofed (without sizing them) takes the areas the Wall Tiling line
 * states for the same room, instead of the kind's usual ones, so the same bath surround or shower walls are not typed (or guessed) twice. Only the areas with a stated size move across; the wet ones (a shower, a bath
 * surround) get backer board and waterproofing, a splashback does not. Anything else in the preparation spec is untouched. Pure. */
export function prepSpecWithWallTilingAreas(prepSpec: unknown, wallSpec: unknown): unknown {
  if (!isObj(prepSpec) || !isObj(wallSpec) || !Array.isArray(prepSpec.rooms) || !Array.isArray(wallSpec.rooms)) return prepSpec
  const wallRooms = wallSpec.rooms.filter(isObj)
  const wet = (n: string) => /shower|bath|wet/i.test(n)
  const rooms = prepSpec.rooms.map(raw => {
    if (!isObj(raw) || raw.usualWetAreas !== true || (Array.isArray(raw.walls) && raw.walls.length > 0)) return raw
    const name = str(raw.name, 60).toLowerCase()
    const match = name ? wallRooms.find(w => str(w.name, 60).toLowerCase() === name) : undefined
    const areas = match && Array.isArray(match.areas) ? match.areas.filter(isObj) : []
    const walls = areas.flatMap(a => {
      const aName = str(a.name, 60) || 'Wall area'
      const len = between(a.lengthM, 0, 100), h = between(a.heightM, 0, 8), m2 = between(a.areaM2, 0, 500)
      if (!((len !== null && h !== null) || m2 !== null)) return []
      const isWet = wet(aName)
      return [{ name: aName, ...(len !== null && h !== null ? { lengthM: len, heightM: h } : { areaM2: m2 }), ...(between(a.lessM2, 0, 100) !== null && { lessM2: a.lessM2 }), board: isWet ? 'foam-10' : 'none', tanked: isWet }]
    })
    if (walls.length === 0) return raw
    return { ...raw, walls, heightM: raw.heightM ?? match?.heightM, inheritedFromWallTiling: true }
  })
  return { ...prepSpec, rooms }
}

// ── Electric underfloor heating, by room ───────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiTileUfh { rooms: TileUfhRoom[]; jobSituationId: string; electricianIncluded: boolean; typicalRooms: string[]; assumed: string[] }

export function tileUfhFromScope(spec: unknown): AiTileUfh | null {
  if (!isObj(spec)) return null
  const rooms: TileUfhRoom[] = []
  const typicalRooms: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name || seen(rooms, name)) continue
    const { id: kindId, info: k } = kindOf(raw, name)
    const room = newTileUfhRoom('ai-room-' + ++seq, name, kindId, k, { kit: oneOf(raw.kit, UFH_KITS.map(x => x.id) as UfhKit[]) ?? 'mat150', insulation: oneOf(raw.insulation, Object.keys(INSULATION_INFO) as UfhInsulation[]) ?? '6mm' })
    const heated = between(raw.heatedAreaM2, 0, 300)
    const l = between(raw.lengthM, 0, 40), w = between(raw.widthM, 0, 40)
    if (heated !== null) room.heatedAreaOverrideM2 = heated
    else {
      if (l !== null) room.lengthM = l
      if (w !== null) room.widthM = w
      if (l === null || w === null) typicalRooms.push(sizeNote(name, l, w, k))
      const fx = between(raw.fixedM2, 0, 100)
      if (fx !== null) room.fixedM2 = fx
    }
    room.thermostat = oneOf(raw.thermostat, Object.keys(THERMOSTAT_INFO) as UfhThermostat[]) ?? 'digital'
    room.coverMm = whole(raw.coverMm, 0, 20) ?? 0
    rooms.push(room)
  }
  if (rooms.length === 0) return null
  return { rooms, jobSituationId: situationOf(spec.situation), electricianIncluded: spec.electricianByOthers !== true, typicalRooms, assumed: [] }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for each Tiling & Finishes calculator line, with the exact ids it may use. */
export function tilingPromptGuide(): string {
  const kinds = TILING_ROOM_KINDS.filter(k => k.id !== 'other').map(k => k.id).join(', ')
  const tiles = TILE_SIZES.map(t => `${t.id} = ${t.label.split(' (')[0].toLowerCase()}`).join('; ')
  const layouts = TILE_LAYOUTS.map(l => l.id).join('/')
  const grouts = GROUT_KINDS.map(g => g.id).join('/')
  const boards = BACKER_BOARDS.map(b => `${b.id} = ${b.label.split(' (')[0].toLowerCase()}`).join('; ')
  const covers = Object.keys(FLOOR_COVER_LABEL).filter(c => c !== 'none').join('/')
  const ceilings = Object.keys(CEILING_LABEL).filter(c => c !== 'none').map(c => `${c} = ${CEILING_LABEL[c as CeilingKind].toLowerCase()}`).join('; ')
  const kits = UFH_KITS.map(k => `${k.id} = ${k.short}`).join('; ')
  return `For a Tiling & Finishes calculator line, add "calc": {…} with the shape for THAT line only, describing ONLY the work the scope mentions (never invent a size or area; if the scope has nothing for that line, leave "calc" out). "kind" is one of: ${kinds}. "situation" is "empty"|"occupied"|"hard" ("occupied" only if the scope says the house is lived in). Leave out any size, tile or option the scope does not state.
  - "Floor Tiling (by room)": "calc": {"situation": "empty", "rooms": [{"name": "Kitchen", "kind": "<room kind>", "lengthM": <m>, "widthM": <m>, "areaM2": <m², instead of length and width>, "notTiledM2": <m² under units>, "tile": "<tile>", "layout": "${layouts}", "clientSupplies": true, "tilePriceM2": <£/m²>, "grout": "${grouts}", "sealed": true, "skirtingLm": <m>, "movementJointLm": <m>}]}. One entry per room whose FLOOR is tiled. Tiles: ${tiles}. "clientSupplies" true only if the scope says the client supplies the tiles. "tilePriceM2" only if the scope gives a tile price or allowance. "sealed" for natural stone or unglazed tile. Use this line for floor tiling instead of the general floor tile task lines.
  - "Wall Tiling (by room)": "calc": {"situation": "empty", "rooms": [{"name": "Bathroom", "kind": "<room kind>", "areas": [{"name": "Bath surround", "lengthM": <m>, "heightM": <m>, "areaM2": <m², instead of length and height>, "lessM2": <m² window or niche>}], "fullHeight": true, "heightM": <room height>, "lengthM": <room length>, "widthM": <room width>, "doors": <nr>, "windows": <nr>, "tile": "<tile>", "layout": "${layouts}", "clientSupplies": true, "tilePriceM2": <£/m²>, "grout": "${grouts}", "niches": <nr>, "externalCornerLm": <m>, "sealed": true}]}. One entry per room with tiled WALLS. Give "areas" for the parts the scope tiles (a bath surround, shower walls, a splashback) with their sizes if stated; "fullHeight": true if the scope says all the walls are tiled floor to ceiling. If the scope gives no areas, leave "areas" out and the usual tiled areas for that kind of room are used. Tiles: ${tiles}. Use this line for wall tiling instead of the general wall tile task lines.
  - "Tiling Preparation (by room)": "calc": {"situation": "empty", "tankSystem": "liquid"|"sheet", "rooms": [{"name": "Shower room", "kind": "<room kind>", "lengthM": <m>, "widthM": <m>, "areaM2": <floor m²>, "heightM": <m>, "floor": {"primer": true, "levelMm": <mm of self-levelling compound>, "cover": "${covers}", "board": "<floor board>", "tanked": true}, "walls": [{"name": "Shower walls", "lengthM": <m>, "heightM": <m>, "areaM2": <m²>, "board": "<board>"|"none", "base": "studs"|"masonry", "tanked": true}], "usualWetAreas": true, "cuffs": <floor waste nr>, "ceiling": "<ceiling>", "ceilingBoard": "<board>"}]}. One entry per room with preparation work (tile backer board, waterproofing or tanking, levelling, primer, decoupling mat, moisture-resistant or backer ceiling board). Boards: ${boards}. Ceilings: ${ceilings}. "usualWetAreas": true when the scope says to board and tank the wet areas of a bathroom or shower room without sizing them (if the Wall Tiling line has tiled areas for the same room, they are used for it). "tanked" true only where the scope says to waterproof it. Use this line for tiling preparation instead of the general surface preparation task lines.
  - "Electric Underfloor Heating": "calc": {"situation": "empty", "electricianByOthers": true, "rooms": [{"name": "Bathroom", "kind": "<room kind>", "lengthM": <m>, "widthM": <m>, "heatedAreaM2": <m²>, "fixedM2": <m² under a bath or units>, "kit": "<kit>", "thermostat": "digital"|"wifi", "insulation": "none"|"6mm"|"10mm"|"20mm", "coverMm": <mm of levelling over the mat>}]}. One entry per room with ELECTRIC underfloor heating (mats or cable under tiles). Kits: ${kits}. "electricianByOthers": true only if the scope says someone else (the client's electrician) connects it. WATER underfloor heating is NOT this line: it is the Underfloor Heating line under Plumbing & Heating.
  - Tiles themselves are priced at a sample allowance per m² in the floor and wall lines unless the scope gives a price or says the client supplies them.`
}
