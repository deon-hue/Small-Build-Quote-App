// What the AI quote can hand to the three Plastering & Boarding calculators (Internal Plastering & Boarding by room, External Render by wall, Wall Insulation & Backing by wall): the rooms, walls and
// finishes the scope describes, checked here and turned into each calculator's own inputs. Only what the scope says: a wall with no stated length is left out (never an invented one), a window or door that is
// not mentioned is not counted, and anything the calculator's standard filled in (a typical room size, what a wall gets, the render system, the insulation thickness...) is reported so the estimator checks it.
// Pure (apart from the calculators' own tables), so it can be tested with a loader that resolves the extension-less imports.

import {
  newPlasterRoom, PLASTER_ROOM_KIND_BY_ID, PLASTER_ROOM_KINDS, DEFAULT_PLASTER_SITUATIONS, WALL_SYSTEM_LABEL, CEILING_SYSTEM_LABEL, BASE_LABEL as PLASTER_BASE_LABEL,
  type PlasterRoom, type WallSystem, type CeilingSystem, type SkimBase,
} from './plaster-units'
import { newRenderWall, DEFAULT_RENDER_SITUATIONS, SYSTEM_LABEL as RENDER_SYSTEM_LABEL, BASE_LABEL as RENDER_BASE_LABEL, type RenderWall, type RenderSystem, type RenderBase } from './render-units'
import {
  newInsulationWall, DEFAULT_INSULATION_SITUATIONS, SYSTEM_LABEL as INSUL_SYSTEM_LABEL, THICKNESS_OPTIONS, DEFAULT_MM,
  type InsulationWall, type InsulationSystem,
} from './wall-insulation-units'
import { isObj, whole, between, str } from './ai-spec'

let seq = 0
const baseFor = (system: string): SkimBase => (system === 'skim' ? 'existing' : 'new-board')
const situationOf = (v: unknown, list: { id: string }[], fallback: string): string => (typeof v === 'string' && list.some(s => s.id === v) ? v : fallback)

/** The kind of room a name looks like ("Bedroom 2" -> bedroom), for a room the AI named without a kind. */
export function guessPlasterRoomKind(name: string): string {
  const n = name.toLowerCase()
  const has = (...w: string[]) => w.some(x => n.includes(x))
  if (has('bath', 'shower', 'wet room', 'en-suite', 'ensuite', 'en suite', 'wc', 'cloak', 'toilet')) return 'bathroom'
  if (has('kitchen', 'utility')) return 'kitchen'
  if (has('living', 'lounge', 'sitting', 'reception', 'family')) return 'living'
  if (has('dining')) return 'dining'
  if (has('bed')) return 'bedroom'
  if (has('hall', 'landing', 'stair', 'entrance')) return 'hall'
  if (has('study', 'office')) return 'study'
  return 'other'
}

// ── Internal plastering & boarding, by room ────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiPlasterRooms {
  rooms: PlasterRoom[]
  jobSituationId: string
  /** rooms that had no size stated, so got the typical size for their kind */
  typicalRooms: string[]
  /** rooms where the scope did not say what the walls or ceiling get, so the calculator's usual (dot-and-dab walls, board and skim ceiling) was used */
  usualFinish: string[]
}

export function plasterRoomsFromScope(spec: unknown): AiPlasterRooms | null {
  if (!isObj(spec)) return null
  const rooms: PlasterRoom[] = []
  const typicalRooms: string[] = []
  const usualFinish: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name) continue
    if (rooms.some(r => r.name.toLowerCase() === name.toLowerCase())) continue   // the same room named twice is one room
    const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''
    const kind = PLASTER_ROOM_KIND_BY_ID[kindRaw] ? kindRaw : guessPlasterRoomKind(name)
    const room = newPlasterRoom('ai-room-' + ++seq, name, kind)
    const l = between(raw.lengthM, 0, 40), w = between(raw.widthM, 0, 40)
    if (l !== null) room.lengthM = l
    if (w !== null) room.widthM = w
    if (l === null || w === null) typicalRooms.push(`${name} (${l === null && w === null ? 'a typical ' : 'part typical, '}${room.lengthM}m × ${room.widthM}m)`)
    const h = between(raw.heightM, 1.8, 8)
    if (h !== null) room.heightM = h
    const doors = whole(raw.doors, 0, 20), windows = whole(raw.windows, 0, 20)
    if (doors !== null) room.doors = doors
    if (windows !== null) room.windows = windows
    const wSys = typeof raw.walls === 'string' && raw.walls in WALL_SYSTEM_LABEL ? (raw.walls as WallSystem) : null
    const cSys = typeof raw.ceiling === 'string' && raw.ceiling in CEILING_SYSTEM_LABEL ? (raw.ceiling as CeilingSystem) : null
    if (wSys === null || cSys === null) usualFinish.push(name)
    const wallSystem = wSys ?? room.walls.system
    const ceilSystem = cSys ?? room.ceiling.system
    const wallBase = typeof raw.wallBase === 'string' && raw.wallBase in PLASTER_BASE_LABEL ? (raw.wallBase as SkimBase) : baseFor(wallSystem)
    const ceilBase = typeof raw.ceilingBase === 'string' && raw.ceilingBase in PLASTER_BASE_LABEL ? (raw.ceilingBase as SkimBase) : baseFor(ceilSystem)
    room.walls = { system: wallSystem, base: wallBase }
    room.ceiling = { system: ceilSystem, base: ceilBase }
    room.covingLm = between(raw.covingLm, 0, 200) ?? 0
    room.hatches = whole(raw.hatches, 0, 10) ?? 0
    rooms.push(room)
  }
  if (rooms.length === 0) return null
  return { rooms, jobSituationId: situationOf(spec.situation, DEFAULT_PLASTER_SITUATIONS, 'empty'), typicalRooms, usualFinish }
}

// ── External render, by wall ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiRender { walls: RenderWall[]; jobSituationId: string; scaffold: boolean; assumed: string[] }

export function renderFromScope(spec: unknown): AiRender | null {
  if (!isObj(spec)) return null
  const walls: RenderWall[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.walls) ? spec.walls.slice(0, 20) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const len = between(raw.lengthM, 0, 200)
    if (len === null) continue   // never invent a length
    const name = str(raw.name, 60) || `Wall ${walls.length + 1}`
    const wall = newRenderWall('ai-wall-' + ++seq, name, len)
    const h = between(raw.heightM, 0, 15)
    if (h !== null) wall.heightM = h; else assumed.push(`${name}: 2.6m high`)
    wall.windows = whole(raw.windows, 0, 50) ?? 0
    wall.doors = whole(raw.doors, 0, 20) ?? 0
    wall.gableM2 = between(raw.gableM2, 0, 300) ?? 0
    const sys = typeof raw.system === 'string' && raw.system in RENDER_SYSTEM_LABEL ? (raw.system as RenderSystem) : null
    if (!sys) assumed.push(`${name}: monocouche render`)
    wall.system = sys ?? 'monocouche'
    wall.base = typeof raw.base === 'string' && raw.base in RENDER_BASE_LABEL ? (raw.base as RenderBase) : 'new-masonry'
    wall.paint = wall.system === 'sand-cement' && raw.paint === true
    wall.coats = whole(raw.coats, 1, 4) ?? 2
    wall.movementJointsLm = between(raw.movementJointsLm, 0, 200) ?? 0
    walls.push(wall)
  }
  if (walls.length === 0) return null
  return { walls, jobSituationId: situationOf(spec.situation, DEFAULT_RENDER_SITUATIONS, 'ground'), scaffold: spec.scaffold === true, assumed }
}

// ── Wall insulation & backing, by wall ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiInsulation { walls: InsulationWall[]; jobSituationId: string; assumed: string[] }

export function insulationFromScope(spec: unknown): AiInsulation | null {
  if (!isObj(spec)) return null
  const walls: InsulationWall[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.walls) ? spec.walls.slice(0, 20) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const len = between(raw.lengthM, 0, 200)
    const lath = between(raw.lathM2, 0, 500) ?? 0
    const backing = between(raw.backingLm, 0, 500) ?? 0
    if (len === null && lath === 0 && backing === 0) continue   // never invent a length
    const name = str(raw.name, 60) || `Wall ${walls.length + 1}`
    const wall = newInsulationWall('ai-wall-' + ++seq, name, len ?? 0)
    if (len !== null) {
      const h = between(raw.heightM, 0, 8)
      if (h !== null) wall.heightM = h; else assumed.push(`${name}: 2.5m high`)
    }
    wall.windows = whole(raw.windows, 0, 50) ?? 0
    wall.doors = whole(raw.doors, 0, 20) ?? 0
    const sys = typeof raw.system === 'string' && raw.system in INSUL_SYSTEM_LABEL ? (raw.system as InsulationSystem) : null
    if (!sys && len !== null) assumed.push(`${name}: PIR insulated plasterboard`)
    wall.system = sys ?? 'pir-board'
    const mm = whole(raw.thicknessMm, 10, 200)
    if (mm !== null && THICKNESS_OPTIONS[wall.system].includes(mm)) wall.thicknessMm = mm
    else { wall.thicknessMm = DEFAULT_MM[wall.system]; if (len !== null) assumed.push(`${name}: ${wall.thicknessMm}mm of insulation`) }
    wall.vcl = typeof raw.vcl === 'boolean' ? raw.vcl : wall.system !== 'pir-board'
    wall.reveals = raw.reveals !== false
    wall.lathM2 = lath
    wall.backingLm = backing
    walls.push(wall)
  }
  if (walls.length === 0) return null
  return { walls, jobSituationId: situationOf(spec.situation, DEFAULT_INSULATION_SITUATIONS, 'empty'), assumed }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for each plastering calculator line, with the exact ids it may use. */
export function plasterPromptGuide(): string {
  const kinds = PLASTER_ROOM_KINDS.filter(k => k.id !== 'other').map(k => k.id).join(', ')
  const wallSys = (Object.keys(WALL_SYSTEM_LABEL) as WallSystem[]).filter(s => s !== 'none').map(s => `${s} = ${WALL_SYSTEM_LABEL[s].toLowerCase()}`).join('; ')
  const ceilSys = (Object.keys(CEILING_SYSTEM_LABEL) as CeilingSystem[]).filter(s => s !== 'none').map(s => `${s} = ${CEILING_SYSTEM_LABEL[s].toLowerCase()}`).join('; ')
  const rSys = (Object.keys(RENDER_SYSTEM_LABEL) as RenderSystem[]).map(s => `${s} = ${RENDER_SYSTEM_LABEL[s].split(':')[0].toLowerCase()}`).join('; ')
  const rBase = (Object.keys(RENDER_BASE_LABEL) as RenderBase[]).map(s => `${s} = ${RENDER_BASE_LABEL[s].split(' (')[0].toLowerCase()}`).join('; ')
  const iSys = (Object.keys(INSUL_SYSTEM_LABEL) as InsulationSystem[]).map(s => `${s} = ${INSUL_SYSTEM_LABEL[s].toLowerCase()} (insulation mm: ${THICKNESS_OPTIONS[s].join('/')})`).join('; ')
  return `For a plastering calculator line, add "calc": {…} with the shape for THAT line only, describing ONLY the work the scope mentions (never invent a length, area or size; if the scope has none for that line, leave "calc" out):
  - "Internal Plastering & Boarding (by room)": "calc": {"situation": "empty"|"occupied"|"hard", "rooms": [{"name": "Kitchen", "kind": "<room kind>", "lengthM": <m>, "widthM": <m>, "heightM": <m>, "doors": <nr>, "windows": <nr>, "walls": "<wall system>", "wallBase": "new-board"|"existing", "ceiling": "<ceiling system>", "ceilingBase": "new-board"|"existing", "covingLm": <m>, "hatches": <nr>}]}. One entry per room the scope names to plaster, using its own name. "kind" is one of: ${kinds}. Leave out the sizes unless stated, and leave out "walls" and "ceiling" unless the scope says what they get ("none" if a surface is not being plastered). Wall systems: ${wallSys}. Ceiling systems: ${ceilSys}. Use "skim" with "wallBase": "existing" for re-skimming old plaster. "situation" is "occupied" only if the scope says the house is lived in. Use this line for plastering and boarding rooms, instead of the general plastering task lines. Vaulted ceilings are NOT here: keep selecting the "Vaulted ceiling" tasks for those.
  - "External Render (by wall)": "calc": {"situation": "ground"|"scaffold"|"hard", "scaffold": true, "walls": [{"name": "Rear wall", "lengthM": <m>, "heightM": <m>, "windows": <nr>, "doors": <nr>, "gableM2": <m²>, "system": "<render system>", "base": "<base>", "paint": true, "coats": 2, "movementJointsLm": <m>}]}. A wall ONLY where the scope states its length; leave out the rest unless stated. Render systems: ${rSys}. "base" is what it goes onto: ${rBase}. "scaffold" true only if the scope says to include scaffold for the render. Use this line for rendering the outside of walls.
  - "Wall Insulation & Backing (by wall)": "calc": {"situation": "empty"|"occupied"|"hard", "walls": [{"name": "North wall", "lengthM": <m>, "heightM": <m>, "windows": <nr>, "doors": <nr>, "system": "<lining>", "thicknessMm": <mm>, "vcl": true, "reveals": true, "lathM2": <m²>, "backingLm": <m>}]}. A wall ONLY where the scope states its length (or metal lath or backing is stated); leave out the rest unless stated. Linings: ${iSys}. This is INTERNAL wall insulation only (insulated plasterboard, PIR or mineral wool behind new board): external wall insulation is not covered.
  - The skim over insulation board is part of the Internal Plastering & Boarding line, and partitions are in Internal Walls.`
}
