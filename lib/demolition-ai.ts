// What the AI quote can hand to the four Demolition calculators (Wall Removal / Knock-Through, Strip-Out by Room, Waste & Skips, Outbuildings & External): the walls, rooms, waste and
// buildings the scope describes, checked here and turned into each calculator's own inputs. Only what the scope says: a wall with no stated length, a waste item with no volume or an outbuilding
// with no area is left out (never invented); a room named with nothing stated gets the usual items for that kind of room at its typical size (what the calculator itself does when you add one)
// and is reported, so the estimator checks it. Pure (apart from the calculators' own tables), so it can be tested with a loader that resolves the extension-less imports.

import { WALL_KINDS, type WallKind } from './wall-removal-units'
import { STRIP_BY_ID, STRIP_ROOM_BY_ID, STRIP_ITEMS, usualStripItems, type StripRoom } from './strip-out-units'
import { WASTE_KINDS, type WasteItem, type WasteKind } from './waste-units'
import { OUT_KINDS, HARD_KINDS, type ExtItem, type ExtType, type OutKind, type HardKind } from './external-demo-units'
import { HACK_KINDS, newHackWall, type HackWall, type HackKind } from './render-hackoff-units'
import { isObj, whole, between, str } from './ai-spec'

let seq = 0

// ── Wall removal / knock-through ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiWallRemoval {
  kind: WallKind
  lengthM: number
  heightM: number
  thicknessMm: number
  structural: boolean
  services: number
  /** what the scope did not say, so the calculator's standard was used: for the review note */
  assumed: string[]
}

export function wallRemovalFromScope(spec: unknown): AiWallRemoval | null {
  if (!isObj(spec)) return null
  const lengthM = between(spec.lengthM, 0, 30)
  if (lengthM === null) return null   // never invent the width of the opening
  const assumed: string[] = []
  const kindRaw = typeof spec.kind === 'string' && spec.kind in WALL_KINDS ? (spec.kind as WallKind) : null
  const kind: WallKind = kindRaw ?? 'brick'
  if (!kindRaw) assumed.push('the kind of wall (taken as solid brick)')
  const h = between(spec.heightM, 0, 8)
  if (h === null) assumed.push('the wall height (taken as 2.4m)')
  const thicknessMm = between(spec.thicknessMm, 0, 1500) ?? WALL_KINDS[kind].defaultThicknessMm
  let structural: boolean
  if (typeof spec.structural === 'boolean') structural = spec.structural
  else {
    structural = WALL_KINDS[kind].usuallyStructural
    if (structural) assumed.push('whether it is load-bearing (taken as load-bearing, as a wall of that kind usually is)')
  }
  const services = whole(spec.services, 0, 30) ?? 0
  return { kind, lengthM, heightM: h ?? 2.4, thicknessMm, structural, services, assumed }
}

// ── Strip-out by room ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The kind of room a name looks like ("Bathroom 2" -> bathroom), for a room the AI named without a kind. */
export function guessStripRoomKind(name: string): string {
  const n = name.toLowerCase()
  const has = (...w: string[]) => w.some(x => n.includes(x))
  if (has('en-suite', 'ensuite', 'en suite')) return 'ensuite'
  if (has('cloak', 'wc', 'toilet')) return 'cloakroom'
  if (has('bath', 'shower', 'wet room')) return 'bathroom'
  if (has('kitchen')) return 'kitchen'
  if (has('utility', 'laundry')) return 'utility'
  if (has('living', 'lounge', 'sitting', 'reception', 'dining')) return 'living'
  if (has('bed')) return 'bedroom'
  if (has('hall', 'landing', 'stair', 'entrance')) return 'hall'
  return 'other'
}

export interface AiStripOut {
  rooms: StripRoom[]
  asbestosSurveys: number
  /** rooms that had no items stated, so got the usual items for their kind at a typical size */
  usualRooms: string[]
}

export function stripOutFromScope(spec: unknown): AiStripOut | null {
  if (!isObj(spec)) return null
  const rooms: StripRoom[] = []
  const usualRooms: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = str(raw.name, 60)
    if (!name) continue
    const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''
    const kind = STRIP_ROOM_BY_ID[kindRaw] ? kindRaw : guessStripRoomKind(name)
    const type = STRIP_ROOM_BY_ID[kind]
    const stated = between(raw.areaM2, 0, 300)
    const areaM2 = stated ?? type.areaM2
    const heightM = between(raw.heightM, 1.8, 6) ?? 2.4

    const items: Record<string, number> = {}
    if (isObj(raw.items)) {
      for (const [id, v] of Object.entries(raw.items)) {
        const n = between(v, 0, 1000)
        if (STRIP_BY_ID[id] && n !== null) items[id] = STRIP_BY_ID[id].unit === 'nr' ? Math.max(1, Math.round(n)) : Math.round(n * 10) / 10
      }
    }
    let usual = false
    let finalItems = items
    if (Object.keys(items).length === 0) {
      finalItems = usualStripItems(kind, areaM2, heightM)
      if (Object.keys(finalItems).length === 0) continue   // a room of no known kind with nothing stated: nothing to price
      usual = true
    }
    // the same room named twice is one room
    const existing = rooms.find(r => r.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      for (const [id, n] of Object.entries(finalItems)) existing.items[id] = (existing.items[id] ?? 0) + n
      continue
    }
    rooms.push({
      id: 'ai-room-' + ++seq, name, kind, areaM2, heightM, items: finalItems, dust: true,
      disconnectPlumber: type.wetRoom && kind !== 'utility', disconnectElectrician: kind === 'kitchen',
    })
    if (usual) usualRooms.push(stated === null ? `${name} (a typical ${type.areaM2}m²)` : name)
  }
  const asbestosSurveys = whole(spec.asbestosSurveys, 0, 10) ?? 0
  if (rooms.length === 0 && asbestosSurveys === 0) return null
  return { rooms, asbestosSurveys, usualRooms }
}

// ── Waste & skips ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiWaste {
  items: WasteItem[]
  useGrab: boolean
  hazardous: number
  roadSkips: number
  roadWeeks: number
}

export function wasteFromScope(spec: unknown): AiWaste | null {
  if (!isObj(spec)) return null
  const items: WasteItem[] = []
  const list = Array.isArray(spec.items) ? spec.items.slice(0, 20) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const vol = between(raw.volumeM3, 0, 500)
    if (vol === null) continue   // never invent a volume
    const kind: WasteKind = typeof raw.kind === 'string' && raw.kind in WASTE_KINDS ? (raw.kind as WasteKind) : 'general'
    items.push({ id: 'ai-waste-' + ++seq, name: str(raw.name, 60), kind, volumeM3: vol })
  }
  const hazardous = whole(spec.hazardous, 0, 20) ?? 0
  const roadSkips = whole(spec.roadSkips, 0, 20) ?? 0
  const roadWeeks = whole(spec.roadWeeks, 1, 26) ?? 2
  if (items.length === 0 && hazardous === 0) return null
  return { items, useGrab: spec.useGrab === true, hazardous, roadSkips, roadWeeks }
}

// ── Outbuildings & external demolition ─────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AiExternalDemo {
  items: ExtItem[]
  machine: boolean
  useGrab: boolean
  assumed: string[]
}

function guessOutKind(name: string): OutKind | null {
  const n = name.toLowerCase()
  if (/shed|summer ?house|log cabin/.test(n)) return 'shed'
  if (/prefab|concrete.?panel|sectional/.test(n)) return 'garage-prefab'
  if (/garage/.test(n)) return 'garage-brick'
  if (/conservator/.test(n)) return 'conservatory'
  if (/lean.?to|car ?port/.test(n)) return 'lean-to'
  return null
}

export function externalDemoFromScope(spec: unknown): AiExternalDemo | null {
  if (!isObj(spec)) return null
  const items: ExtItem[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.items) ? spec.items.slice(0, 20) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const type: ExtType | null = raw.type === 'outbuilding' || raw.type === 'hard' || raw.type === 'wall' || raw.type === 'fence' ? raw.type : null
    if (!type) continue
    const name = str(raw.name, 60)
    const base = { id: 'ai-ext-' + ++seq, name, type, outKind: 'garage-brick' as OutKind, hardKind: 'concrete' as HardKind, areaM2: 15, heightM: 2.4, thicknessMm: 100, lengthM: 10, breakBase: false, baseMm: 100 }
    if (type === 'outbuilding') {
      const area = between(raw.areaM2, 0, 500)
      if (area === null) continue   // never invent a size
      const kindRaw = typeof raw.outKind === 'string' && raw.outKind in OUT_KINDS ? (raw.outKind as OutKind) : null
      const kind = kindRaw ?? guessOutKind(name)
      if (!kind) assumed.push(`${name || 'an outbuilding'}: priced as a timber shed`)
      items.push({ ...base, outKind: kind ?? 'shed', areaM2: area, heightM: between(raw.heightM, 0, 8) ?? 2.4, breakBase: raw.breakBase !== false, baseMm: between(raw.baseMm, 0, 500) ?? 100 })
    } else if (type === 'hard') {
      const area = between(raw.areaM2, 0, 5000)
      if (area === null) continue
      const hardRaw = typeof raw.hardKind === 'string' && raw.hardKind in HARD_KINDS ? (raw.hardKind as HardKind) : null
      if (!hardRaw) assumed.push(`${name || 'a hard surface'}: priced as concrete`)
      const hk = hardRaw ?? 'concrete'
      items.push({ ...base, hardKind: hk, areaM2: area, thicknessMm: between(raw.thicknessMm, 0, 600) ?? HARD_KINDS[hk].defaultMm })
    } else if (type === 'wall') {
      const len = between(raw.lengthM, 0, 500)
      if (len === null) continue
      const h = between(raw.heightM, 0, 6)
      if (h === null) assumed.push(`${name || 'a garden wall'}: 1.8m high`)
      items.push({ ...base, lengthM: len, heightM: h ?? 1.8, thicknessMm: between(raw.thicknessMm, 0, 600) ?? 215 })
    } else {
      const len = between(raw.lengthM, 0, 500)
      if (len === null) continue
      items.push({ ...base, lengthM: len })
    }
  }
  if (items.length === 0) return null
  return { items, machine: spec.machine !== false, useGrab: spec.useGrab === true, assumed }
}

// ── Hacking off existing render ─────────────────────────────────────────────────────────────────────────────────────────

export interface AiRenderHackoff {
  walls: HackWall[]
  scaffold: boolean
  useGrab: boolean
  asbestosTests: number
  /** what the scope did not say, so the calculator's standard was used: for the review note */
  assumed: string[]
}

export function renderHackoffFromScope(spec: unknown): AiRenderHackoff | null {
  if (!isObj(spec)) return null
  const walls: HackWall[] = []
  const assumed: string[] = []
  const list = Array.isArray(spec.walls) ? spec.walls.slice(0, 12) : []
  for (const raw of list) {
    if (!isObj(raw)) continue
    const length = between(raw.lengthM, 0, 300)
    if (length === null || length <= 0) continue   // never invent the length of a wall
    const name = str(raw.name, 60) || `Wall ${walls.length + 1}`
    const w = newHackWall('ai-hack-' + ++seq, name, length)
    // the height, when the scope does not give it, is the calculator's usual 2.6m, and the openings are left out (never invented)
    const h = between(raw.heightM, 0, 15)
    if (h === null) assumed.push(`the height of ${name} (taken as 2.6m)`); else w.heightM = h
    w.windows = whole(raw.windows, 0, 40) ?? 0
    w.doors = whole(raw.doors, 0, 20) ?? 0
    w.gableM2 = between(raw.gableM2, 0, 300) ?? 0
    const kindRaw = typeof raw.kind === 'string' && raw.kind in HACK_KINDS ? (raw.kind as HackKind) : null
    if (!kindRaw) assumed.push(`the kind of render on ${name} (taken as sand and cement)`)
    w.kind = kindRaw ?? 'sand-cement'
    w.thicknessMm = between(raw.thicknessMm, 0, 80) ?? HACK_KINDS[w.kind].thicknessMm
    w.tool = raw.tool === 'hand' ? 'hand' : 'machine'
    w.brushDown = raw.brushDown !== false
    w.repointPct = between(raw.repointPct, 0, 100) ?? 0
    walls.push(w)
  }
  if (walls.length === 0) return null
  return { walls, scaffold: spec.scaffold === true, useGrab: spec.useGrab === true, asbestosTests: whole(spec.asbestosTests, 0, 10) ?? 0, assumed }
}

// ── What the AI is told ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for each demolition calculator line, with the exact ids it may use. */
export function demolitionPromptGuide(): string {
  const walls = (Object.keys(WALL_KINDS) as WallKind[]).map(k => `${k} = ${WALL_KINDS[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  const rooms = Object.keys(STRIP_ROOM_BY_ID).filter(k => k !== 'other').join(', ')
  const items = STRIP_ITEMS.map(s => `${s.id} = ${s.name.toLowerCase()} (${s.unit})`).join('; ')
  const wastes = (Object.keys(WASTE_KINDS) as WasteKind[]).map(k => `${k} = ${WASTE_KINDS[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  const outs = (Object.keys(OUT_KINDS) as OutKind[]).map(k => `${k} = ${OUT_KINDS[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  const hards = (Object.keys(HARD_KINDS) as HardKind[]).map(k => `${k} = ${HARD_KINDS[k].label.split(' (')[0].toLowerCase()}`).join('; ')
  return `For a demolition calculator line, add "calc": {…} with the shape for THAT line only, describing ONLY the work the scope mentions (never invent a length, area, volume or count; if the scope has none for that line, leave "calc" out):
  - "Wall Removal / Knock-Through (calculator)": "calc": {"kind": "<wall kind>", "lengthM": <width of the opening or length of wall taken out, m>, "heightM": <m>, "thicknessMm": <mm>, "structural": true|false, "services": <sockets, pipes or cables in the wall to move>}. ONE wall only (the main one). "lengthM" is required: if the scope states no length, leave "calc" out. Leave out "kind", "heightM", "thicknessMm" and "structural" unless stated ("structural" is true only if the scope says load-bearing or an RSJ/steel beam goes in, false only if it says it is not load-bearing). Kinds: ${walls}. Use this line for knocking through or removing a wall, instead of the general structural-demolition task lines.
  - "Strip-Out by Room (calculator)": "calc": {"rooms": [{"name": "Kitchen", "kind": "<room kind>", "areaM2": <m²>, "heightM": <m>, "items": {"<item id>": <count>}}], "asbestosSurveys": <count>}. One entry per room the scope names to strip out, using its own name. "kind" is one of: ${rooms}. "items": only what the scope states, with the quantity in the unit shown, using exactly these ids: ${items}. If the scope names a room but not what comes out, LEAVE "items" OUT and the calculator uses the usual items for that kind of room. Leave out "areaM2" unless stated. Use this line for stripping out rooms (kitchens, bathrooms, floors, ceilings, wall finishes), instead of the general strip-out task lines. It already includes the skips for those rooms.
  - "Waste & Skips (calculator)": "calc": {"items": [{"name": "Rubble", "kind": "<kind>", "volumeM3": <m³>}], "useGrab": true, "hazardous": <count>, "roadSkips": <count>, "roadWeeks": <weeks>}. An item ONLY where the scope states a volume of waste. Kinds: ${wastes}. Use this line only for waste the scope gives separately; do not add it for rooms already in the strip-out line. "hazardous" only if asbestos or similar is mentioned; "roadSkips" only if skips go on the road.
  - "Outbuildings & External (calculator)": "calc": {"machine": true, "useGrab": false, "items": [{"type": "outbuilding"|"hard"|"wall"|"fence", "name": "Garden shed", "outKind": "<kind>", "hardKind": "<kind>", "areaM2": <m²>, "lengthM": <m>, "heightM": <m>, "thicknessMm": <mm>, "breakBase": true|false}]}. Use "areaM2" for an outbuilding or hard surface and "lengthM" for a wall or fence; an item ONLY where the scope states its size. Outbuilding kinds: ${outs}. Hard surface kinds: ${hards}. "breakBase" is false only if the scope says the base stays.
  - "Outbuildings (calculator)" and "External Works: surfaces, walls and fences (calculator)": the same "calc" shape as "Outbuildings & External (calculator)" above, but the first takes ONLY items of type "outbuilding" and the second ONLY "hard", "wall" and "fence". Use these two instead of the older combined line.
  - "Render Hack-Off (by wall) (calculator)" (also "Render Hack-Off (by wall)" under Plastering & Boarding; use ONE of them, never both): "calc": {"walls": [{"name": "Front elevation", "lengthM": <m>, "heightM": <m>, "windows": <count>, "doors": <count>, "gableM2": <m²>, "kind": "sand-cement"|"pebbledash"|"monocouche"|"thin-coat"|"lime", "thicknessMm": <mm>, "tool": "machine"|"hand", "repointPct": <% of the brickwork to repoint>}], "scaffold": false, "useGrab": false, "asbestosTests": <count>}. One entry per wall or elevation the scope says has its render taken off, and a wall ONLY where the scope states its length; leave out anything not stated (the height, the kind of render and the thickness are then the calculator's usual). "tool" is "hand" only if the scope says by hand. "scaffold" is true only if the scope asks for scaffold to be included. Use this line for hacking off or removing existing render, not the new render (that is External Render).`
}
