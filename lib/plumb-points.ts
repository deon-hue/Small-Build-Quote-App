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
  /** a heated towel rail: its output in watts (500 if not given), which is the heat its pipes carry to it */
  watts?: number
  rad?: { typeId: string; heightMm: number; widthMm?: number; /** the width it was last sized to for its room (kept so a radiator on another level still has a size) */ autoW?: number }
}

/** The boiler or manifold the heating pipes start from: placed on the plan like a fitting but not a fitting (it is priced in the Heating plant calculator). */
export const HEAT_SOURCE = 'heat-source'

/** A run of heating pipe drawn on the plan: its points in the plan's own pixels. */
export interface PlumbPipe {
  id: string
  points: { x: number; y: number }[]
  sheetId?: string
  levelId?: string
}

/** The letters drawn on a fitting's marker. */
export const PLUMB_SHORT: Record<string, string> = {
  'heat-source': 'BO',
  bath: 'BA', 'shower-valve': 'SV', 'shower-tray': 'ST', basin: 'WB', wc: 'WC', bidet: 'BD', 'floor-drain': 'FD',
  'kitchen-sink': 'KS', 'utility-sink': 'US', 'washing-machine': 'WM', dishwasher: 'DW', 'fridge-supply': 'FR', softener: 'SF',
  radiator: 'R', 'towel-rail': 'TR', 'outside-tap': 'OT',
}

/** The kinds of fitting that are heating (shown in blue-red on the plan): the radiators and towel rails. */
export const isHeating = (typeId: string) => typeId === 'radiator' || typeId === 'towel-rail'

export const UNNAMED_ROOM = 'No room'
/** the output of a heated towel rail when none is typed: a sample */
export const TOWEL_RAIL_W = 500
const roomKey = (name: string) => (name.trim() || UNNAMED_ROOM)

export interface PlacedRadiator { pointId: string; label: string; watts: number; widthMm: number; heightMm: number; typeId: string }
export interface PlacedRoom {
  name: string
  counts: Record<string, number>
  /** each radiator in the room with its size, for pricing the ones we supply by size */
  radiators: PlacedRadiator[]
  /** each heated towel rail in the room, so one whose pipes are drawn is priced without its pipework */
  towelRails: { pointId: string; watts: number }[]
}

/**
 * The fittings room by room for the calculator, in the order rooms were first used. `size` gives the size of a radiator point (its type, height, width and watts: the width and watts are worked out for the room
 * when the point has no width of its own).
 */
export function placedRoomsFromPoints(points: PlumbPoint[], size: (p: PlumbPoint) => { widthMm: number; watts: number; label: string }): PlacedRoom[] {
  const rooms: PlacedRoom[] = []
  for (const p of points) {
    if (p.typeId === HEAT_SOURCE) continue
    const name = roomKey(p.roomName)
    let r = rooms.find(x => x.name.toLowerCase() === name.toLowerCase())
    if (!r) { r = { name, counts: {}, radiators: [], towelRails: [] }; rooms.push(r) }
    r.counts[p.typeId] = (r.counts[p.typeId] ?? 0) + 1
    if (p.typeId === 'towel-rail') r.towelRails.push({ pointId: p.id, watts: p.watts ?? TOWEL_RAIL_W })
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
