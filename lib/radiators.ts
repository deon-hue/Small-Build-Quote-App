// Radiators: a rough heat loss for a room from the Take-off drawing, and a radiator size to suit it. Pure (no imports) so it can be tested with plain Node.
//
// THESE ARE ESTIMATES TO PRICE FROM, NOT A HEATING DESIGN. The heat loss is the simple fabric-plus-ventilation sum (U-value x area x temperature difference, and air changes) with typical values,
// and the radiator outputs are typical manufacturers' figures at a 50 degree difference between water and room (check against the real catalogue). A heating engineer's room-by-room calculation
// replaces all of it; the sample figures here are meant to be edited in the calculator's own rates when needed.

export interface Pt { x: number; y: number }

// ── Radiator sizes ──────────────────────────────────────────────────────────────────────────────

export interface RadType { id: string; label: string; /** watts for a 1 m wide radiator 600 mm high, at 50 degrees above the room */ wPerM600: number }
export const RAD_TYPES: RadType[] = [
  { id: 'k1', label: 'Single panel (K1)', wPerM600: 1020 },
  { id: 'k2', label: 'Double panel (K2)', wPerM600: 1760 },
]
export const RAD_TYPE_BY_ID: Record<string, RadType> = Object.fromEntries(RAD_TYPES.map(t => [t.id, t]))
/** standard heights (mm) and what each gives compared with 600 high */
export const RAD_HEIGHTS: { mm: number; factor: number }[] = [{ mm: 300, factor: 0.52 }, { mm: 450, factor: 0.78 }, { mm: 600, factor: 1 }, { mm: 700, factor: 1.14 }]
/** standard widths, mm */
export const RAD_WIDTHS: number[] = [400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1400, 1600, 1800, 2000]

const heightFactor = (mm: number) => RAD_HEIGHTS.find(h => h.mm === mm)?.factor ?? mm / 600

/** The output (watts) of a radiator of a type, height and width. */
export function radiatorOutputW(typeId: string, heightMm: number, widthMm: number): number {
  const t = RAD_TYPE_BY_ID[typeId] ?? RAD_TYPES[1]
  return Math.round(t.wPerM600 * (widthMm / 1000) * heightFactor(heightMm))
}

export interface RadSuggestion { widthMm: number; outputW: number; /** the biggest standard radiator is still short of what the room needs */ short: boolean }

/** The smallest standard width of the type and height that gives at least the watts asked for (the biggest one, marked short, if none does). */
export function suggestRadiator(requiredW: number, typeId: string, heightMm: number): RadSuggestion {
  const need = Math.max(0, requiredW)
  for (const w of RAD_WIDTHS) { const out = radiatorOutputW(typeId, heightMm, w); if (out >= need) return { widthMm: w, outputW: out, short: false } }
  const w = RAD_WIDTHS[RAD_WIDTHS.length - 1]
  return { widthMm: w, outputW: radiatorOutputW(typeId, heightMm, w), short: true }
}

// ── Heat loss of a room ─────────────────────────────────────────────────────────────────────────

/** The age of the building: sets the U-values (W per m2 per degree) used. */
export type BuildingAge = 'new' | 'mid' | 'old'
export const AGE_LABEL: Record<BuildingAge, string> = { new: 'New build or well insulated', mid: '1980s to 2000s', old: 'Older, little insulation' }
const U: Record<BuildingAge, { wall: number; window: number; roof: number; floor: number; ach: number }> = {
  new: { wall: 0.30, window: 1.4, roof: 0.16, floor: 0.25, ach: 0.6 },
  mid: { wall: 0.60, window: 2.8, roof: 0.35, floor: 0.50, ach: 0.9 },
  old: { wall: 1.50, window: 4.8, roof: 0.60, floor: 0.80, ach: 1.4 },
}

/** The room temperature each kind of room is heated to, and extra air changes for the kinds with fans or doors opening outside. */
const ROOM_TEMP: Record<string, number> = { living: 21, dining: 21, study: 21, kitchen: 18, bedroom: 18, bathroom: 22, ensuite: 22, wc: 20, utility: 18, hall: 18, garage: 10, other: 20 }
const ROOM_ACH_EXTRA: Record<string, number> = { kitchen: 0.4, bathroom: 0.6, ensuite: 0.6, wc: 0.4, utility: 0.4 }
export const OUTSIDE_TEMP_C = -3

export interface RoomHeatInput {
  kind?: string
  areaM2: number
  heightM: number
  /** the length of the room's walls that are outside walls, m */
  externalWallLengthM: number
  /** the area of the windows, m2 (taken to be in the outside walls) */
  windowAreaM2: number
  /** the floor is over the ground (or an unheated space), the ceiling is under the roof (or an unheated space) */
  floorLoss: boolean
  roofLoss: boolean
  age: BuildingAge
}
export interface RoomHeatLoss { watts: number; fabricW: number; ventW: number; designC: number; deltaT: number; wallAreaM2: number; notes: string[] }

/** A rough heat loss for a room, in watts, with a 10% allowance for warming up. */
export function roomHeatLoss(i: RoomHeatInput): RoomHeatLoss {
  const k = i.kind && ROOM_TEMP[i.kind] !== undefined ? i.kind : 'other'
  const designC = ROOM_TEMP[k]
  const dT = designC - OUTSIDE_TEMP_C
  const u = U[i.age]
  const wallArea = Math.max(0, i.externalWallLengthM * i.heightM - i.windowAreaM2)
  const fabric = (wallArea * u.wall + i.windowAreaM2 * u.window + (i.roofLoss ? i.areaM2 * u.roof : 0) + (i.floorLoss ? i.areaM2 * u.floor : 0)) * dT
  const vol = i.areaM2 * i.heightM
  const vent = 0.33 * (u.ach + (ROOM_ACH_EXTRA[k] ?? 0)) * vol * dT
  const watts = Math.round((fabric + vent) * 1.1)
  const notes: string[] = []
  if (!(i.externalWallLengthM > 0) && !i.roofLoss && !i.floorLoss) notes.push('No outside wall, floor or roof loss found: the room only loses heat by ventilation.')
  return { watts, fabricW: Math.round(fabric), ventW: Math.round(vent), designC, deltaT: dT, wallAreaM2: +wallArea.toFixed(2), notes }
}

// ── Which of a room's edges are outside walls ───────────────────────────────────────────────────

/**
 * The length (plan pixels) of a room's outline that runs along an outside wall: an edge counts when its middle is within `tol` of one of the outside wall lines and it points the same way (within about 15 degrees).
 * `outside` are the drawn lines of the outside walls (their outside faces); the room's edge is the inside face, one wall thickness in from the line, so `tol` should be a little over the thickest outside wall.
 */
export function externalEdgeLengthPx(polygon: Pt[], outside: [Pt, Pt][], tol: number): number {
  let total = 0
  const n = polygon.length
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (!(len > 0)) continue
    const ex = (b.x - a.x) / len, ey = (b.y - a.y) / len
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
    let hit = false
    for (const [p, q] of outside) {
      const wl = Math.hypot(q.x - p.x, q.y - p.y)
      if (!(wl > 0)) continue
      const wx = (q.x - p.x) / wl, wy = (q.y - p.y) / wl
      if (Math.abs(ex * wy - ey * wx) > 0.26) continue                      // not along it
      const along = (mx - p.x) * wx + (my - p.y) * wy
      if (along < -tol || along > wl + tol) continue
      const across = Math.abs(-(mx - p.x) * wy + (my - p.y) * wx)
      if (across <= tol) { hit = true; break }
    }
    if (hit) total += len
  }
  return total
}

/** A combi boiler size (kW) to suggest from the heat of all the radiators and towel rails: a GUIDE only, the heating engineer sizes the boiler (hot water demand counts for a combi as much as the radiators). */
export function suggestCombiKw(totalW: number): number {
  if (totalW <= 12000) return 24
  if (totalW <= 16000) return 28
  if (totalW <= 20000) return 30
  return 35
}

// ── Sizing every radiator on a plan ─────────────────────────────────────────────────────────────

export interface RadReq {
  id: string
  typeId: string
  heightMm: number
  /** a width chosen by hand; missing = sized for the room */
  widthMm?: number
  /** which room it is in (any text that is the same for the same room), or null when it is not inside a room */
  roomKey: string | null
}
export interface RadSizing {
  widthMm: number
  outputW: number
  /** the heat this radiator was sized to give, or null when its room is not known (a standard width is used) */
  requiredW: number | null
  /** the biggest standard radiator is still short of what it needs */
  short: boolean
  /** sized for the room, not typed */
  auto: boolean
  /** e.g. "K2 600 x 900 (1584 W)" */
  label: string
}

const DEFAULT_WIDTH_MM = 800

export const radiatorLabel = (typeId: string, heightMm: number, widthMm: number, outputW: number) => `${typeId.toUpperCase()} ${heightMm} x ${widthMm} (${outputW} W)`

/**
 * The size of every radiator. A room's heat loss is shared between its radiators: the ones with a width typed by hand give what they give, and what is left is shared between the others
 * (each rounded up to the next standard width). A radiator that is not in a room, or whose room has no heat loss, gets a standard 800 wide.
 */
export function sizeRadiators(reqs: RadReq[], roomWatts: (roomKey: string) => number | null): Map<string, RadSizing> {
  const out = new Map<string, RadSizing>()
  const byRoom = new Map<string, RadReq[]>()
  for (const r of reqs) {
    if (r.widthMm) {
      const w = radiatorOutputW(r.typeId, r.heightMm, r.widthMm)
      out.set(r.id, { widthMm: r.widthMm, outputW: w, requiredW: null, short: false, auto: false, label: radiatorLabel(r.typeId, r.heightMm, r.widthMm, w) })
    }
    if (r.roomKey !== null) byRoom.set(r.roomKey, [...(byRoom.get(r.roomKey) ?? []), r])
  }
  for (const r of reqs) {
    if (r.widthMm) continue
    const watts = r.roomKey === null ? null : roomWatts(r.roomKey)
    if (watts === null) {
      const w = radiatorOutputW(r.typeId, r.heightMm, DEFAULT_WIDTH_MM)
      out.set(r.id, { widthMm: DEFAULT_WIDTH_MM, outputW: w, requiredW: null, short: false, auto: true, label: radiatorLabel(r.typeId, r.heightMm, DEFAULT_WIDTH_MM, w) })
      continue
    }
    const inRoom = byRoom.get(r.roomKey!) ?? []
    const manual = inRoom.filter(x => x.widthMm).reduce((s, x) => s + radiatorOutputW(x.typeId, x.heightMm, x.widthMm!), 0)
    const autos = inRoom.filter(x => !x.widthMm).length
    const need = Math.max(0, watts - manual) / Math.max(1, autos)
    const s = suggestRadiator(need, r.typeId, r.heightMm)
    out.set(r.id, { widthMm: s.widthMm, outputW: s.outputW, requiredW: Math.round(need), short: s.short, auto: true, label: radiatorLabel(r.typeId, r.heightMm, s.widthMm, s.outputW) })
  }
  return out
}
