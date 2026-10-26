// Sharing the Wall Tiling calculator's tiled areas with Tiling Preparation: the preparation screen has a "copy the wall areas from Wall Tiling" button, and this reads what the Wall Tiling line saved (its calculator state,
// kept with the quote phase or the Take-off item) into plain rooms and areas. Pure; whatever was saved is untrusted data, so every value is checked and an area that does not check out is left out.

import { isObj, num, str } from './ai-spec'

export interface SharedWallArea { label: string; lengthM: number; heightM: number; deductM2: number }
export interface SharedWallRoom { name: string; kindId: string; heightM: number; areas: SharedWallArea[] }

/** The Wall Tiling calculator's rooms and tiled areas from its saved state (a CalcStateSnapshot), or nothing when it is some other calculator's state. */
export function wallRoomsFromCalcState(snapshot: unknown): SharedWallRoom[] {
  if (!isObj(snapshot) || snapshot.id !== 'tile-wall-rooms' || !isObj(snapshot.values)) return []
  const ns = snapshot.values.AssemblyTileWallDemo
  if (!isObj(ns) || !Array.isArray(ns.rooms)) return []
  const rooms: SharedWallRoom[] = []
  for (const r of ns.rooms) {
    if (!isObj(r)) continue
    const name = str(r.name, 60)
    if (!name || !Array.isArray(r.zones)) continue
    const areas: SharedWallArea[] = []
    for (const z of r.zones) {
      if (!isObj(z)) continue
      const len = num(z.lengthM), h = num(z.heightM), less = num(z.deductM2) ?? 0
      if (len === null || h === null || !(len > 0) || !(h > 0) || less < 0 || len * h - less <= 0) continue
      areas.push({ label: str(z.label, 60) || 'Wall area', lengthM: len, heightM: h, deductM2: less })
    }
    if (areas.length === 0) continue
    rooms.push({ name, kindId: typeof r.kindId === 'string' ? r.kindId : 'other', heightM: num(r.heightM) ?? 2.4, areas })
  }
  return rooms
}

/** A room whose floor is covered with a decoupling membrane in Tiling Preparation, and which kind: the Electric Underfloor Heating calculator offers to lay its cable in a 'heating' one. */
export interface SharedPrepFloor { name: string; membrane: 'plain' | 'heating' }

/** The floors with a decoupling membrane from a saved Tiling Preparation state (a CalcStateSnapshot), or nothing when it is some other calculator's state. */
export function prepFloorsFromCalcState(snapshot: unknown): SharedPrepFloor[] {
  if (!isObj(snapshot) || snapshot.id !== 'tile-prep-rooms' || !isObj(snapshot.values)) return []
  const ns = snapshot.values.AssemblyTilePrepDemo
  if (!isObj(ns) || !Array.isArray(ns.rooms)) return []
  const out: SharedPrepFloor[] = []
  for (const r of ns.rooms) {
    if (!isObj(r) || !isObj(r.floor)) continue
    const name = str(r.name, 60)
    if (!name || r.floor.cover !== 'decoupling') continue
    out.push({ name, membrane: r.floor.membrane === 'heating' ? 'heating' : 'plain' })
  }
  return out
}

/** Every saved decoupling-membrane floor across a quote's phases or a take-off's items (a room named twice keeps the last). */
export function sharedPrepFloorsFrom(snapshots: unknown[]): SharedPrepFloor[] {
  const byName = new Map<string, SharedPrepFloor>()
  for (const s of snapshots) for (const f of prepFloorsFromCalcState(s)) byName.set(f.name.toLowerCase(), f)
  return Array.from(byName.values())
}

/** Every saved Wall Tiling room across a quote's phases or a take-off's items (a room named twice keeps the last). */
export function sharedWallRoomsFrom(snapshots: unknown[]): SharedWallRoom[] {
  const byName = new Map<string, SharedWallRoom>()
  for (const s of snapshots) for (const r of wallRoomsFromCalcState(s)) byName.set(r.name.toLowerCase(), r)
  return Array.from(byName.values())
}
