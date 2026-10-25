// Plumbing fittings placed on a Take-off plan: each is a kind of fitting (the same list the plumbing calculator uses) in a room, at a place on the drawing; a radiator also has a size. They are kept on one
// "Plumbing installation" Take-off item and turned into room counts for the Plumbing Installation (by room) calculator. Pure (no runtime imports), so it can be tested with plain Node.

export interface PlumbPoint {
  id: string
  /** the fitting type id from lib/plumbing-units.ts FITTING_TYPES (bath, basin, wc, radiator, towel-rail...) */
  typeId: string
  roomName: string
  /** where on the drawing (the plan's own pixel coordinates) */
  x: number
  y: number
  sheetId?: string
  levelId?: string
  /** a radiator: its type (K1, K2) and height; widthMm is its width when the size was chosen by hand, and missing when it is sized for the room automatically */
  rad?: { typeId: string; heightMm: number; widthMm?: number; /** the width it was last sized to for its room (kept so a radiator on another level still has a size) */ autoW?: number }
}

/** The letters drawn on a fitting's marker. */
export const PLUMB_SHORT: Record<string, string> = {
  bath: 'BA', 'shower-valve': 'SV', 'shower-tray': 'ST', basin: 'WB', wc: 'WC', bidet: 'BD', 'floor-drain': 'FD',
  'kitchen-sink': 'KS', 'utility-sink': 'US', 'washing-machine': 'WM', dishwasher: 'DW', 'fridge-supply': 'FR', softener: 'SF',
  radiator: 'R', 'towel-rail': 'TR', 'outside-tap': 'OT',
}

/** The kinds of fitting that are heating (shown in blue-red on the plan): the radiators and towel rails. */
export const isHeating = (typeId: string) => typeId === 'radiator' || typeId === 'towel-rail'

export const UNNAMED_ROOM = 'No room'
const roomKey = (name: string) => (name.trim() || UNNAMED_ROOM)

export interface PlacedRadiator { pointId: string; label: string; watts: number; widthMm: number; heightMm: number; typeId: string }
export interface PlacedRoom {
  name: string
  counts: Record<string, number>
  /** each radiator in the room with its size, for pricing the ones we supply by size */
  radiators: PlacedRadiator[]
}

/**
 * The fittings room by room for the calculator, in the order rooms were first used. `size` gives the size of a radiator point (its type, height, width and watts: the width and watts are worked out for the room
 * when the point has no width of its own).
 */
export function placedRoomsFromPoints(points: PlumbPoint[], size: (p: PlumbPoint) => { widthMm: number; watts: number; label: string }): PlacedRoom[] {
  const rooms: PlacedRoom[] = []
  for (const p of points) {
    const name = roomKey(p.roomName)
    let r = rooms.find(x => x.name.toLowerCase() === name.toLowerCase())
    if (!r) { r = { name, counts: {}, radiators: [] }; rooms.push(r) }
    r.counts[p.typeId] = (r.counts[p.typeId] ?? 0) + 1
    if (p.typeId === 'radiator') {
      const s = size(p)
      r.radiators.push({ pointId: p.id, label: s.label, watts: s.watts, widthMm: s.widthMm, heightMm: p.rad?.heightMm ?? 600, typeId: p.rad?.typeId ?? 'k2' })
    }
  }
  return rooms
}

/** How many radiators of a room's are placed, by room name (lower case), for sharing the room's heat loss between them. */
export function radiatorCountByRoom(points: PlumbPoint[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of points) if (p.typeId === 'radiator') { const k = roomKey(p.roomName).toLowerCase(); m.set(k, (m.get(k) ?? 0) + 1) }
  return m
}
