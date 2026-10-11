// What the AI quote can hand to the electrics calculator: the rooms, points and special fittings the scope describes, checked here and turned into the
// calculator's own rooms. Only what the scope says: a room named with no points stated gets the usual points for that kind of room (what the calculator
// itself does when you add one), and is reported as such so the estimator checks it. Nothing the scope does not mention is added, except the testing and
// certificate that is in the starting price. Pure, so it can be tested with plain Node.

import {
  POINT_TYPES, POINT_BY_ID, ROOM_TYPE_BY_ID, ROOM_TYPES, FITTING_TYPES, FITTING_BY_ID, WHOLE_HOUSE_ITEMS, WHOLE_HOUSE_BY_ID, DEFAULT_SITUATIONS, guessRoomType,
  type ElectricsRoom, type ElectricsFitting,
} from './electrics-units'

export interface AiElectrics {
  rooms: ElectricsRoom[]
  wholeHouse: Record<string, number>
  jobSituationId: string
  /** rooms that had no points stated, so got the usual set for their kind */
  usualRooms: string[]
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const whole = (v: unknown, min: number, max: number): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  const r = Math.round(n)
  return r >= min && r <= max ? r : null
}

let seq = 0

/** The checked rooms from what the AI said, or null when it described no electrical work. */
export function electricsFromScope(spec: unknown): AiElectrics | null {
  if (!isObj(spec)) return null
  const rooms: ElectricsRoom[] = []
  const usualRooms: string[] = []
  const list = Array.isArray(spec.rooms) ? spec.rooms.slice(0, 30) : []

  for (const raw of list) {
    if (!isObj(raw)) continue
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : ''
    if (!name) continue
    const kindRaw = typeof raw.kind === 'string' ? raw.kind : ''
    const kind = ROOM_TYPE_BY_ID[kindRaw] ? kindRaw : guessRoomType(name)

    const points: Record<string, number> = {}
    if (isObj(raw.points)) {
      for (const [id, v] of Object.entries(raw.points)) {
        const p = POINT_BY_ID[id]
        const n = whole(v, 1, 80)
        if (p && n !== null) points[id] = n
      }
    }
    const fittings: ElectricsFitting[] = []
    if (Array.isArray(raw.fittings)) {
      for (const fr of raw.fittings.slice(0, 10)) {
        if (!isObj(fr)) continue
        const typeId = typeof fr.type === 'string' && FITTING_BY_ID[fr.type] ? fr.type : 'other-fitting'
        const count = whole(fr.count ?? 1, 1, 20)
        if (count === null) continue
        fittings.push({
          id: 'ai-fit-' + ++seq, typeId, name: typeof fr.name === 'string' ? fr.name.trim().slice(0, 60) : '', count,
          supply: fr.supply === 'us' ? 'us' : 'client', fittingCost: 0,
        })
      }
    }

    let usual = false
    let finalPoints = points
    if (Object.keys(points).length === 0 && fittings.length === 0) {
      const t = ROOM_TYPE_BY_ID[kind]
      if (!t || Object.keys(t.points).length === 0) continue   // a room of no known kind with nothing stated: nothing to price
      finalPoints = { ...t.points }
      usual = true
    }

    // the same room named twice is one room
    const existing = rooms.find(r => r.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      for (const [id, n] of Object.entries(finalPoints)) existing.points[id] = (existing.points[id] ?? 0) + n
      existing.fittings.push(...fittings)
      continue
    }
    rooms.push({
      id: 'ai-room-' + ++seq, name, typeId: kind, points: finalPoints, situationId: null, mode: 'points', days: 1, dayRate: 260, fittings,
    })
    if (usual) usualRooms.push(name)
  }

  const wholeHouse: Record<string, number> = Object.fromEntries(WHOLE_HOUSE_ITEMS.map(w => [w.id, w.defaultQty]))
  let anyWhole = false
  if (isObj(spec.wholeHouse)) {
    for (const [id, v] of Object.entries(spec.wholeHouse)) {
      if (!WHOLE_HOUSE_BY_ID[id]) continue
      const n = whole(v, 0, 20)
      if (n === null) continue
      wholeHouse[id] = n
      if (id !== 'certificate' && n > 0) anyWhole = true
    }
  }
  if (rooms.length === 0 && !anyWhole) return null

  const sit = typeof spec.situation === 'string' && DEFAULT_SITUATIONS.some(s => s.id === spec.situation) ? (spec.situation as string) : 'new-build'
  return { rooms, wholeHouse, jobSituationId: sit, usualRooms }
}

/** The part of the AI's instructions that explains the "electrics" object, with the exact ids it may use. */
export function electricsPromptGuide(): string {
  const points = POINT_TYPES.filter(p => p.unit === 'nr').map(p => `${p.id} = ${p.name}`).join('; ')
  const fittings = FITTING_TYPES.map(f => `${f.id} = ${f.name}`).join('; ')
  const whole = WHOLE_HOUSE_ITEMS.filter(w => w.id !== 'certificate').map(w => `${w.id} = ${w.name}`).join('; ')
  const kinds = ROOM_TYPES.filter(r => r.id !== 'other').map(r => r.id).join(', ')
  const sits = DEFAULT_SITUATIONS.map(s => `${s.id} = ${s.label.split(' (')[0]}`).join('; ')
  return `For the electrical installation calculator line, add "electrics": {"situation": "<id>", "rooms": [{"name": "Kitchen", "kind": "<room kind>", "points": {"<point id>": <count>}, "fittings": [{"type": "<fitting id>", "name": "Breakfast bar pendants", "count": 1, "supply": "client"}]}], "wholeHouse": {"<item id>": <count>}}. Describe ONLY the electrical work the scope mentions.
  - One entry in "rooms" for each room the scope names or clearly means to wire. Use the room's own name. "kind" is one of: ${kinds}.
  - "points": only the counts the scope states, using exactly these point ids: ${points}. If the scope names a room but not its points, LEAVE "points" OUT and the calculator uses the usual set for that kind of room.
  - A special light fitting such as a chandelier or breakfast bar pendants goes in "fittings", using one of these ids: ${fittings}. "supply" is "client" unless the scope says we supply it.
  - "wholeHouse" only for items the scope mentions (new consumer unit, extra circuits), using these ids: ${whole}. The testing and certificate is added automatically.
  - "situation" only if the scope says: ${sits}. Leave it out for new work.
  - Never invent a room or a count. If the scope has no electrical work, leave "electrics" out.`
}
