// Electrical points placed on a Take-off plan: each is a point type in a room, at a place on the drawing, optionally marked as a special fitting
// (a chandelier, breakfast bar pendants...). They are kept on one "Electrical installation" Take-off item, and turned into room counts for the
// electrics calculator. Pure (no runtime imports), so it can be tested with plain Node.

export interface ElectricPoint {
  id: string
  typeId: string
  roomName: string
  /** where on the drawing (the plan's own pixel coordinates) */
  x: number
  y: number
  /** a special fitting on this point: the fitting kind and what it is called */
  fitting?: { typeId: string; name: string }
}

export interface PlanRoomLike {
  name: string
  counts: Record<string, number>
  fittings: { pointId: string; typeId: string; name: string }[]
}

/** The short letters drawn on a point's marker. */
export const POINT_SHORT: Record<string, string> = {
  'dbl-socket': 'DS', 'sgl-socket': 'S', 'usb-socket': 'US', 'fused-spur': 'FS', 'outside-socket': 'OS',
  '1g-switch': '1G', '2g-switch': '2G', '2way-switch': '2W', dimmer: 'DM', 'pull-cord': 'PC',
  downlight: 'DL', pendant: 'P', 'wall-light': 'WL', 'under-cab': 'UC', 'led-batten': 'LB', 'outside-light': 'OL',
  'cooker-switch': 'CK', extractor: 'EX', 'towel-rail': 'TR', shaver: 'SH', ufh: 'UF', 'ev-charger': 'EV',
  smoke: 'SD', heat: 'HD', 'co-alarm': 'CO', 'tv-point': 'TV', 'data-point': 'DT',
}

export const UNNAMED_ROOM = 'No room'

const roomKey = (name: string) => (name.trim() || UNNAMED_ROOM)

/** Room counts for the calculator, in the order rooms were first used. Underfloor heating can't be clicked as a point (it is an area), so it is not here. */
export function planRoomsFromPoints(points: ElectricPoint[]): PlanRoomLike[] {
  const rooms: PlanRoomLike[] = []
  for (const p of points) {
    const name = roomKey(p.roomName)
    let r = rooms.find(x => x.name.toLowerCase() === name.toLowerCase())
    if (!r) { r = { name, counts: {}, fittings: [] }; rooms.push(r) }
    r.counts[p.typeId] = (r.counts[p.typeId] ?? 0) + 1
    if (p.fitting) r.fittings.push({ pointId: p.id, typeId: p.fitting.typeId, name: p.fitting.name })
  }
  return rooms
}

/** Whether a point is inside a polygon (ray casting). */
export function pointInPolygon(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  if (poly.length < 3) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The room a point falls in, from named room shapes (the smallest one it is inside, so a room inside a bigger floor area wins); null if none. */
export function roomAtPoint(pt: { x: number; y: number }, rooms: { name: string; points: { x: number; y: number }[] }[]): string | null {
  const area = (poly: { x: number; y: number }[]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p.x * q.y - q.x * p.y) }, 0)) / 2
  const inside = rooms.filter(r => r.name.trim() && pointInPolygon(pt, r.points)).sort((a, b) => area(a.points) - area(b.points))
  return inside[0]?.name ?? null
}

/** A rectangle's two corners as a polygon, since Take-off stores a rectangle as two points. */
export function rectToPolygon(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length < 2) return pts
  const [a, b] = pts
  return [{ x: a.x, y: a.y }, { x: b.x, y: a.y }, { x: b.x, y: b.y }, { x: a.x, y: b.y }]
}

export function totalPoints(points: ElectricPoint[]): number { return points.length }
