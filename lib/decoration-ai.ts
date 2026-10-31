// What the AI quote can hand to the Internal Decoration calculator (deco-internal-walls): the rooms the scope names to decorate, with the sizes it states (the AI chat reads them off the plans), checked here and
// turned into the calculator's own rooms. Only what the scope says: a room with no stated size gets the typical size for its kind and is reported, a surface with no stated condition is "painted before, in good
// order" (the calculator's own start) and is reported, and the woodwork, doors and window frames are only painted when the scope says so. Pure (apart from the calculator's own tables).

import {
  newDecoRoom, ROOM_KIND_BY_ID, ROOM_KINDS, DEFAULT_DECO_SITUATIONS, CONDITION_LABEL, PREP_LABEL, WOOD_CONDITION_LABEL,
  type DecoRoom, type SurfaceCondition, type PrepLevel, type WoodCondition,
} from './decoration-units'
import { isObj, whole, between, str } from './ai-spec'

let seq = 0

/** The kind of room a name looks like ("Bedroom 2" -> bedroom), for a room the AI named without a kind. */
export function guessDecoRoomKind(name: string): string {
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

const pick = <T extends string>(v: unknown, labels: Record<T, string>): T | null => (typeof v === 'string' && v in labels ? (v as T) : null)

export interface AiDecoration {
  rooms: DecoRoom[]
  jobSituationId: string
  /** rooms that had no size stated (or only part of one), so got the typical size for their kind */
  typicalRooms: string[]
  /** rooms where the scope did not say what condition the walls and ceiling are in, so "painted before, in good order" was used */
  usualCondition: string[]
  /** how many rooms have the woodwork, the doors and the window frames painted (only when the scope says so) */
  woodworkRooms: number
  doorRooms: number
  frameRooms: number
}

export function decorationFromScope(spec: unknown): AiDecoration | null {
  if (!isObj(spec)) return null
  const rooms: DecoRoom[] = []
  const typicalRooms: string[] = []
  const usualCondition: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 40) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name) continue
    if (rooms.some(r => r.name.toLowerCase() === name.toLowerCase())) continue   // the same room named twice is one room
    const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''
    const kind = ROOM_KIND_BY_ID[kindRaw] ? kindRaw : guessDecoRoomKind(name)
    const room = newDecoRoom('ai-deco-room-' + ++seq, name, kind)
    const l = between(raw.lengthM, 0, 40), w = between(raw.widthM, 0, 40)
    if (l !== null) room.lengthM = l
    if (w !== null) room.widthM = w
    if (l === null || w === null) typicalRooms.push(`${name} (${l === null && w === null ? 'a typical ' : 'part typical, '}${room.lengthM}m × ${room.widthM}m)`)
    const h = between(raw.heightM, 1.8, 8)
    if (h !== null) room.heightM = h
    const doors = whole(raw.doors, 0, 20), windows = whole(raw.windows, 0, 20)
    if (doors !== null) room.doors = doors
    if (windows !== null) room.windows = windows

    // what is painted: the walls and ceiling unless the scope says otherwise; the woodwork, doors and frames only when it says so
    room.walls.paint = raw.paintWalls !== false
    room.ceiling.paint = raw.paintCeiling !== false
    const wallCond = pick<SurfaceCondition>(raw.wallCondition, CONDITION_LABEL)
    // an unstated ceiling follows the walls, except that wallpapered walls do not make a wallpapered ceiling
    const ceilCond = pick<SurfaceCondition>(raw.ceilingCondition, CONDITION_LABEL) ?? (wallCond === 'wallpaper' ? null : wallCond)
    if ((room.walls.paint && wallCond === null) || (room.ceiling.paint && ceilCond === null)) usualCondition.push(name)
    if (wallCond) room.walls.condition = wallCond
    if (ceilCond) room.ceiling.condition = ceilCond
    const prep = pick<PrepLevel>(raw.prep, PREP_LABEL)
    if (prep) { room.walls.prep = prep; room.ceiling.prep = prep }
    const coats = whole(raw.coats, 1, 4)
    if (coats !== null) { room.walls.coats = coats; room.ceiling.coats = coats }
    if (raw.finish === 'silk') room.walls.finish = 'silk'
    room.protect = raw.protect !== false

    const woodCond = pick<WoodCondition>(raw.woodCondition, WOOD_CONDITION_LABEL)
    const woodFinish: 'satin' | 'gloss' = raw.woodFinish === 'gloss' ? 'gloss' : 'satin'
    if (raw.paintWoodwork === true) { room.woodwork.paint = true; room.woodwork.finish = woodFinish; if (woodCond) room.woodwork.condition = woodCond }
    if (raw.paintDoors === true) { room.doorWork.paint = true; if (woodCond) room.doorWork.condition = woodCond }
    if (raw.paintFrames === true) { room.frames.paint = true; if (woodCond) room.frames.condition = woodCond }
    rooms.push(room)
  }
  if (rooms.length === 0) return null
  const sit = typeof spec.situation === 'string' && DEFAULT_DECO_SITUATIONS.some(s => s.id === spec.situation) ? (spec.situation as string) : 'empty'
  return {
    rooms, jobSituationId: sit, typicalRooms, usualCondition,
    woodworkRooms: rooms.filter(r => r.woodwork.paint).length, doorRooms: rooms.filter(r => r.doorWork.paint).length, frameRooms: rooms.filter(r => r.frames.paint).length,
  }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for the Internal Decoration line, with the exact ids it may use. */
export function decorationPromptGuide(): string {
  const kinds = ROOM_KINDS.filter(k => k.id !== 'other').map(k => k.id).join(', ')
  const cond = (Object.keys(CONDITION_LABEL) as SurfaceCondition[]).map(c => `${c} = ${CONDITION_LABEL[c].toLowerCase()}`).join('; ')
  return `For the Internal Decoration calculator line ("Internal Wall & Ceiling Painting"), add "calc": {…} describing ONLY the decorating the scope mentions (if the scope has none, leave "calc" out):
  - "calc": {"situation": "empty"|"occupied"|"hard", "rooms": [{"name": "Bedroom 1", "kind": "<room kind>", "lengthM": <m>, "widthM": <m>, "heightM": <m>, "doors": <nr>, "windows": <nr>, "paintWalls": true, "paintCeiling": true, "wallCondition": "<condition>", "ceilingCondition": "<condition>", "prep": "light"|"normal"|"heavy", "coats": 2, "finish": "matt"|"silk", "paintWoodwork": true, "paintDoors": true, "paintFrames": true, "woodCondition": "new"|"painted-good"|"painted-poor", "woodFinish": "satin"|"gloss"}]}. ONE entry for EVERY room the scope says is decorated, each with its own name from the scope. When the scope says the whole house, or every room, is decorated or repainted, give every room the scope names or lists (read the room schedule or the room sizes in the scope); never invent a room that is not in the scope. "kind" is one of: ${kinds}. Give "lengthM", "widthM" and "heightM" ONLY from sizes the scope states for that room, and "doors" and "windows" only if stated; leave them out otherwise. "paintWalls" and "paintCeiling" are true unless the scope says a surface is not painted. "paintWoodwork" (skirting, architraves, rails), "paintDoors" and "paintFrames" (window frames) are true ONLY when the scope says the woodwork, doors or frames are painted (a full redecoration of a whole house usually says so: use true then); leave them out otherwise. Conditions: ${cond}. Leave "wallCondition" and "ceilingCondition" out unless the scope says (for example "new plaster" is new-plaster, "stripping wallpaper" is wallpaper, "flaking" or "poor" is painted-poor). "prep" is heavy only if the scope says heavy filling or poor surfaces. "situation" is "occupied" only if the scope says the house is lived in or furnished, "hard" for high ceilings or a stairwell. Use this line for painting and decorating the inside of the building, instead of the general decoration task lines. Wallpapering and feature finishes, external painting and floor finishes are not in it.`
}
