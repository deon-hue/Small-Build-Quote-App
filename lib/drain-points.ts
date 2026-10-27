// Drainage chambers, manholes, gullies and connections placed on a Take-off plan: each is a kind of item (the same list the Chambers, Gullies & Connections calculator uses) at a place on the drawing, with a reference
// (IC1, MH1 ...), a depth, a cover and how its pit is dug. They are kept on one "Drainage chambers and gullies" Take-off item and turned into the calculator's items, which follow the plan until typed over.
// Pure apart from the calculator's own tables, so it can be tested with a loader that resolves the extension-less imports.

import { DRAIN_ITEMS, nextRef, type DrainItem, type DrainItemKind, type CoverGrade, type PitDig } from './drain-items-units'

export interface DrainPoint {
  id: string
  kind: DrainItemKind
  /** the reference marked on the plan: IC1, MH1 ... */
  ref: string
  /** where it is, in words ("rear garden") */
  where: string
  /** depth to the bottom, mm (not used for a connection) */
  depthMm: number
  cover: CoverGrade
  dig: PitDig
  /** where on the drawing (the plan's own pixel coordinates) */
  x: number
  y: number
  sheetId?: string
  levelId?: string
}

/** The values the plan hands the calculator for a point: what an item made from it follows */
export interface PlacedDrain { id: string; kind: DrainItemKind; ref: string; where: string; depthMm: number; cover: CoverGrade; dig: PitDig }

type Fed = Omit<PlacedDrain, 'id'>

export const placedDrainOf = (p: DrainPoint): PlacedDrain => ({ id: p.id, kind: p.kind, ref: p.ref, where: p.where, depthMm: p.depthMm, cover: p.cover, dig: p.dig })

/** A new point of a kind at a place: its usual depth, a light cover, dug by machine, and the next free reference across every point already placed */
export function newDrainPoint(id: string, kind: DrainItemKind, at: { x: number; y: number }, existing: { kind: DrainItemKind; ref: string }[], where = '', sheetId?: string, levelId?: string): DrainPoint {
  return {
    id, kind, ref: nextRef(existing, kind), where, depthMm: DRAIN_ITEMS[kind].defaultDepthMm, cover: 'light', dig: 'machine', x: at.x, y: at.y,
    ...(sheetId ? { sheetId } : {}), ...(levelId ? { levelId } : {}),
  }
}

/** The calculator's items brought in step with the plan. An item made from a point (`planId`) follows the point (kind, reference, where, depth, cover, how its pit is dug) until a value is typed over in the calculator,
 *  and goes when the point is deleted; a point with no item gets one (one of them); an item typed in the calculator with no point is never touched. */
export function mergePlacedDrainItems(items: DrainItem[], placed: PlacedDrain[]): DrainItem[] {
  const byId = new Map(placed.map(p => [p.id, p]))
  const seen = new Set<string>()
  const out: DrainItem[] = []
  for (const it of items) {
    if (!it.planId) { out.push(it); continue }
    const p = byId.get(it.planId)
    if (!p) continue   // deleted on the plan
    if (seen.has(p.id)) continue   // never two items for one point
    seen.add(p.id)
    const now: Fed = { kind: p.kind, ref: p.ref, where: p.where, depthMm: p.depthMm, cover: p.cover, dig: p.dig }
    const was = it.fromPlan
    // a value is typed over when it no longer matches what the plan last gave: it is kept; otherwise it follows the plan
    const pick = <K extends keyof Fed>(k: K): Fed[K] => (was && it[k] !== was[k] ? (it[k] as Fed[K]) : now[k])
    out.push({ ...it, kind: pick('kind'), ref: pick('ref'), where: pick('where'), depthMm: pick('depthMm'), cover: pick('cover'), dig: pick('dig'), fromPlan: now })
  }
  for (const p of placed) {
    if (seen.has(p.id)) continue
    out.push({ id: 'di-' + p.id, kind: p.kind, ref: p.ref, where: p.where, depthMm: p.depthMm, cover: p.cover, qty: 1, dig: p.dig, planId: p.id, fromPlan: { kind: p.kind, ref: p.ref, where: p.where, depthMm: p.depthMm, cover: p.cover, dig: p.dig } })
  }
  return out
}

/** How many of each kind are placed, for the panel's summary */
export function drainCounts(points: { kind: DrainItemKind }[]): Map<DrainItemKind, number> {
  const m = new Map<DrainItemKind, number>()
  for (const p of points) m.set(p.kind, (m.get(p.kind) ?? 0) + 1)
  return m
}

/** What the priced calculator depends on: when this changes after it was saved, the price is out of date (where a point sits on the plan does not matter) */
export function drainPricedKey(points: DrainPoint[]): string {
  return JSON.stringify(points.map(p => [p.id, p.kind, p.ref, p.where, p.depthMm, p.cover, p.dig]))
}
