// Sheets in a Take-off: each plan is a sheet with its own scale, and drawings belong to the sheet they were drawn on. These are the pure rules (which sheet is showing, which drawings belong to it, adding,
// switching, deleting) kept apart from the screen so they can be tested. Type imports only.
//
// The project's own `calibration` is always the ACTIVE sheet's scale, so every measurement already in the screen keeps working unchanged; switching sheets swaps it. A drawing with no sheetId (drawn
// before there were sheets) belongs to the first sheet. When the first plan is added, anything already drawn is stamped with that sheet's id, so deleting a sheet later never adopts another's drawings.

import type { TakeoffProject, TakeoffSheet, TakeoffLevel, DrawnElement, TakeoffItem, ScaleCalibration } from './takeoff-types'
import type { RoomLabel, DrawnRoomShape, RoomEdge } from './rooms-from-walls'
import type { Guide } from './guides'
import type { ElectricPoint } from './electric-points'
import type { PlumbPoint, PlumbPipe } from './plumb-points'

export const DEFAULT_SHEET_CALIBRATION: ScaleCalibration = { mpp: 0.0265, label: '1:100' }

export const firstSheetId = (p: Pick<TakeoffProject, 'sheets'>): string | undefined => p.sheets?.[0]?.id

/** The sheet that is showing: the chosen one if it exists, otherwise the first. Undefined when the take-off has no sheets (no plan loaded yet). */
export function activeSheetIdOf(p: Pick<TakeoffProject, 'sheets' | 'activeSheetId'>): string | undefined {
  if (!p.sheets?.length) return undefined
  return p.sheets.some(s => s.id === p.activeSheetId) ? p.activeSheetId : p.sheets[0].id
}

/** Which sheet a drawing (or an electrical point) belongs to. */
export function sheetOf(thing: { sheetId?: string }, p: Pick<TakeoffProject, 'sheets'>): string | undefined {
  if (thing.sheetId && p.sheets?.some(s => s.id === thing.sheetId)) return thing.sheetId
  return firstSheetId(p)
}

/** True when the thing is on the sheet that is showing. With no sheets at all, everything is. */
export function onActiveSheet(thing: { sheetId?: string }, p: Pick<TakeoffProject, 'sheets' | 'activeSheetId'>): boolean {
  const active = activeSheetIdOf(p)
  return !active || sheetOf(thing, p) === active
}

// ── Levels ──────────────────────────────────────────────────────────────────
// A take-off can be split into levels (Foundations, Ground floor, First floor, Loft...), named by the user and kept bottom to top. A drawing, an electrical point, a room name, a drawn room and a room edge each belong to
// ONE level (`levelId`; one with none, or one whose level was deleted, belongs to the FIRST level) and only the showing level's are shown, snapped to, joined, found as rooms and worked on. A level applies to every sheet.
// With no levels at all everything is on the one (invisible) level, exactly as before levels existed. When a level is added, whatever has no level yet is stamped with the level it already belonged to, so putting
// Foundations BELOW an existing Ground floor never moves the ground floor's drawings down onto it.

type OnLevel = { levelId?: string }
type LevelState = Pick<TakeoffProject, 'levels' | 'activeLevelId'>

export const levelsOf = (p: Pick<TakeoffProject, 'levels'>): TakeoffLevel[] => p.levels ?? []

/** The level that is showing: the chosen one if it exists, otherwise the first. Undefined when the take-off has no levels. */
export function activeLevelIdOf(p: LevelState): string | undefined {
  if (!p.levels?.length) return undefined
  return p.levels.some(l => l.id === p.activeLevelId) ? p.activeLevelId : p.levels[0].id
}

/** Which level a drawing, point, room name, drawn room or room edge belongs to. */
export function levelOf(thing: OnLevel, p: Pick<TakeoffProject, 'levels'>): string | undefined {
  if (!p.levels?.length) return undefined
  return thing.levelId && p.levels.some(l => l.id === thing.levelId) ? thing.levelId : p.levels[0].id
}

/** True when the thing is on the level that is showing. With no levels at all, everything is. */
export function onActiveLevel(thing: OnLevel, p: LevelState): boolean {
  const active = activeLevelIdOf(p)
  return !active || levelOf(thing, p) === active
}

export const levelName = (p: Pick<TakeoffProject, 'levels'>, id: string | undefined): string => p.levels?.find(l => l.id === id)?.name ?? ''

/** The level underneath the given one (the showing one by default), if any: it is shown faintly as a guide. */
export function levelBelow(p: LevelState, id: string | undefined = activeLevelIdOf(p)): TakeoffLevel | undefined {
  const i = p.levels?.findIndex(l => l.id === id) ?? -1
  return i > 0 ? p.levels![i - 1] : undefined
}

/** The level above the given one (the showing one by default), if any. */
export function levelAbove(p: LevelState, id: string | undefined = activeLevelIdOf(p)): TakeoffLevel | undefined {
  const i = p.levels?.findIndex(l => l.id === id) ?? -1
  return i >= 0 ? p.levels![i + 1] : undefined
}

/** The level shown faintly as a guide under the showing one: the level below, or for the lowest level (Foundations) the level above, so the walls that stand on the foundations can be seen and the foundations lined up under them. */
export function ghostLevel(p: LevelState): { level: TakeoffLevel; side: 'below' | 'above' } | undefined {
  const below = levelBelow(p)
  if (below) return { level: below, side: 'below' }
  const above = levelAbove(p)
  return above ? { level: above, side: 'above' } : undefined
}

/** The drawings of the ghost level (see ghostLevel) on the showing sheet. */
export function elementsOnGhostLevel(p: Pick<TakeoffProject, 'sheets' | 'activeSheetId' | 'elements' | 'levels' | 'activeLevelId'>): DrawnElement[] {
  const g = ghostLevel(p)
  return g ? p.elements.filter(el => onActiveSheet(el, p) && levelOf(el, p) === g.level.id) : []
}

/** Which sheet and level are showing, as one text: what a calculation of the showing view (rooms) is stamped with, so it is never taken for another view's. */
export const viewKey = (p: Pick<TakeoffProject, 'sheets' | 'activeSheetId' | 'levels' | 'activeLevelId'>): string => (activeSheetIdOf(p) ?? '') + '|' + (activeLevelIdOf(p) ?? '')

export const elementsOnActiveSheet = (p: Pick<TakeoffProject, 'sheets' | 'activeSheetId' | 'elements' | 'levels' | 'activeLevelId'>): DrawnElement[] => p.elements.filter(el => onActiveSheet(el, p) && onActiveLevel(el, p))

/** Every drawing on the showing sheet, whatever its level (the sheet's scale applies to all of them). */
export const sheetElements = (p: Pick<TakeoffProject, 'sheets' | 'activeSheetId' | 'elements'>): DrawnElement[] => p.elements.filter(el => onActiveSheet(el, p))

/** The ids of the drawings on the showing sheet, on ALL its levels: the only ones a scale change may remeasure (the scale belongs to the sheet, not the level). */
export const activeSheetElementIds = (p: Pick<TakeoffProject, 'sheets' | 'activeSheetId' | 'elements'>): Set<string> => new Set(sheetElements(p).map(e => e.id))

/** The sheet a priced item was drawn on (by its drawing), or undefined for an item with no drawing. */
export function itemSheetId(item: TakeoffItem, p: Pick<TakeoffProject, 'sheets' | 'elements'>): string | undefined {
  if (!item.elementId) return undefined
  const el = p.elements.find(e => e.id === item.elementId)
  return el ? sheetOf(el, p) : undefined
}

export const sheetName = (p: Pick<TakeoffProject, 'sheets'>, id: string | undefined): string => p.sheets?.find(s => s.id === id)?.name ?? ''

export function makeSheet(id: string, name: string, calibration: ScaleCalibration = DEFAULT_SHEET_CALIBRATION, scaleSet = false): TakeoffSheet {
  return { id, name: name.trim() || 'Plan', calibration: { ...calibration }, scaleSet }
}

/** The names given to the rooms on the showing sheet. */
export function roomLabelsOf(p: TakeoffProject): RoomLabel[] {
  const id = activeSheetIdOf(p)
  // (a take-off with no plan loaded yet keeps them on the project itself, and they move onto the first sheet when one is added)
  return onLevelOnly((id ? p.sheets?.find(s => s.id === id)?.roomLabels : p.roomLabels) ?? [], p)
}

/** Of a sheet's list (room names, drawn rooms, room edges), the entries on the showing level. The list itself when there are no levels or all of it is on the level. */
function onLevelOnly<T extends OnLevel>(list: T[], p: LevelState & Pick<TakeoffProject, 'levels'>): T[] {
  if (!activeLevelIdOf(p)) return list
  return list.every(x => onActiveLevel(x, p)) ? list : list.filter(x => onActiveLevel(x, p))
}

/** The sheet's list with the showing level's entries replaced by the new ones (stamped with the level); the other levels' entries are kept. */
function replaceOnLevel<T extends OnLevel>(old: T[] | undefined, next: T[], p: LevelState & Pick<TakeoffProject, 'levels'>): T[] {
  const a = activeLevelIdOf(p)
  if (!a) return next
  return [...(old ?? []).filter(x => !onActiveLevel(x, p)), ...next.map(x => (x.levelId === a ? x : { ...x, levelId: a }))]
}

/** Sets the room names of the showing sheet. */
export function setRoomLabels(p: TakeoffProject, labels: RoomLabel[]): TakeoffProject {
  const id = activeSheetIdOf(p)
  if (!id) return { ...p, roomLabels: replaceOnLevel(p.roomLabels, labels, p) }
  return { ...p, sheets: p.sheets?.map(s => (s.id === id ? { ...s, roomLabels: replaceOnLevel(s.roomLabels, labels, p) } : s)) }
}

/** The rooms drawn as shapes on the showing sheet (or on the project, before there is a sheet). */
export function roomShapesOf(p: TakeoffProject): DrawnRoomShape[] {
  const id = activeSheetIdOf(p)
  return onLevelOnly((id ? p.sheets?.find(s => s.id === id)?.roomShapes : p.roomShapes) ?? [], p)
}

export function setRoomShapes(p: TakeoffProject, shapes: DrawnRoomShape[]): TakeoffProject {
  const id = activeSheetIdOf(p)
  if (!id) return { ...p, roomShapes: replaceOnLevel(p.roomShapes, shapes, p) }
  return { ...p, sheets: p.sheets?.map(s => (s.id === id ? { ...s, roomShapes: replaceOnLevel(s.roomShapes, shapes, p) } : s)) }
}

export function roomEdgesOf(p: TakeoffProject): RoomEdge[] {
  const id = activeSheetIdOf(p)
  return onLevelOnly((id ? p.sheets?.find(s => s.id === id)?.roomEdges : p.roomEdges) ?? [], p)
}

export function setRoomEdges(p: TakeoffProject, edges: RoomEdge[]): TakeoffProject {
  const id = activeSheetIdOf(p)
  if (!id) return { ...p, roomEdges: replaceOnLevel(p.roomEdges, edges, p) }
  return { ...p, sheets: p.sheets?.map(s => (s.id === id ? { ...s, roomEdges: replaceOnLevel(s.roomEdges, edges, p) } : s)) }
}

/** The construction guides of the showing sheet. They are on EVERY level of it (the grid lines of a building are the same on the foundations and the floors above). */
export function guidesOf(p: TakeoffProject): Guide[] {
  const id = activeSheetIdOf(p)
  return (id ? p.sheets?.find(s => s.id === id)?.guides : p.guides) ?? []
}

export function setGuides(p: TakeoffProject, guides: Guide[]): TakeoffProject {
  const id = activeSheetIdOf(p)
  if (!id) return { ...p, guides }
  return { ...p, sheets: p.sheets?.map(s => (s.id === id ? { ...s, guides } : s)) }
}

/** Records (or, with no value, forgets) how big a pixel of the sheet's picture is on paper. */
export function setSheetPaper(p: TakeoffProject, sheetId: string, paper: string | undefined, mmPerPx: number | undefined): TakeoffProject {
  return { ...p, sheets: p.sheets?.map(s => {
    if (s.id !== sheetId) return s
    const { paperMmPerPx: _a, paper: _b, ...rest } = s
    return mmPerPx ? { ...rest, paperMmPerPx: mmPerPx, ...(paper ? { paper } : {}) } : rest
  }) }
}

/** A sheet name from a file name ("Ground floor.pdf" -> "Ground floor"), with the page number for a PDF page. */
export function sheetNameFromFile(fileName: string, page?: number, pages?: number): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim() || 'Plan'
  return page && pages && pages > 1 ? `${base} p${page}` : base
}

/** Page numbers from text like "1-3, 5" or "all" (1..total), within 1..total, in order, no repeats. Null when it cannot be read. */
export function parsePageList(text: string, total: number): number[] | null {
  const t = text.trim().toLowerCase()
  if (!t || t === 'all') return Array.from({ length: total }, (_, i) => i + 1)
  const out = new Set<number>()
  for (const part of t.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) return null
    const a = +m[1], b = m[2] ? +m[2] : a
    if (a < 1 || b < a) return null
    for (let n = a; n <= Math.min(b, total); n++) out.add(n)
  }
  return out.size ? Array.from(out).sort((x, y) => x - y) : null
}

const stampPoints = (pts: ElectricPoint[] | undefined, id: string): ElectricPoint[] | undefined => (pts ? pts.map(pt => (pt.sheetId ? pt : { ...pt, sheetId: id })) : pts)
const stampPlumb = <T extends { sheetId?: string }>(pts: T[] | undefined, id: string): T[] | undefined => (pts ? pts.map(pt => (pt.sheetId ? pt : { ...pt, sheetId: id })) : pts)
type PlumbThings = { plumbPoints?: PlumbPoint[]; plumbPipes?: PlumbPipe[] }
const mapPlumb = <I extends PlumbThings>(it: I, f: <T extends { sheetId?: string; levelId?: string }>(l: T[]) => T[]): I => (it.plumbPoints || it.plumbPipes ? { ...it, ...(it.plumbPoints ? { plumbPoints: f(it.plumbPoints) } : {}), ...(it.plumbPipes ? { plumbPipes: f(it.plumbPipes) } : {}) } : it)

/** Adds sheets after any that exist. The first time (no sheets yet) the existing drawings and electrical points are stamped as the first sheet's, and the first new sheet takes the project's current
 *  scale (it was measured at that scale). The last added sheet becomes the one showing. */
export function addSheets(p: TakeoffProject, added: TakeoffSheet[]): TakeoffProject {
  if (added.length === 0) return p
  const hadNone = !p.sheets?.length
  let sheets = [...(p.sheets ?? []), ...added]
  let elements = p.elements
  let items = p.items
  if (hadNone) {
    const first = { ...sheets[0], calibration: { ...p.calibration }, scaleSet: sheets[0].scaleSet || p.calibration.label !== DEFAULT_SHEET_CALIBRATION.label || p.elements.length > 0 }
    if (p.roomLabels?.length) first.roomLabels = p.roomLabels
    if (p.roomShapes?.length) first.roomShapes = p.roomShapes
    if (p.roomEdges?.length) first.roomEdges = p.roomEdges
    if (p.guides?.length) first.guides = p.guides
    sheets = [first, ...sheets.slice(1)]
    elements = p.elements.map(e => (e.sheetId ? e : { ...e, sheetId: first.id }))
    items = p.items.map(it => (it.electricPoints ? { ...it, electricPoints: stampPoints(it.electricPoints, first.id) } : it.plumbPoints || it.plumbPipes ? mapPlumb(it, l => stampPlumb(l, first.id)!) : it))
  }
  const active = added[added.length - 1]
  const { roomLabels: _moved, roomShapes: _moved2, roomEdges: _moved3, guides: _moved4, ...rest } = p
  return { ...(hadNone ? rest : p), sheets, elements, items, activeSheetId: active.id, calibration: { ...(sheets.find(s => s.id === active.id)!.calibration) } }
}

/** Shows another sheet: the scale being used swaps to that sheet's. The scale of the sheet being left is kept on it first. */
export function switchActiveSheet(p: TakeoffProject, id: string): TakeoffProject {
  if (!p.sheets?.some(s => s.id === id)) return p
  const leaving = activeSheetIdOf(p)
  const sheets = p.sheets.map(s => (s.id === leaving ? { ...s, calibration: { ...p.calibration } } : s))
  const target = sheets.find(s => s.id === id)!
  return { ...p, sheets, activeSheetId: id, calibration: { ...target.calibration } }
}

/** Sets the showing sheet's scale (and the project's, which mirrors it), and marks that the scale has been set. */
export function setActiveSheetCalibration(p: TakeoffProject, cal: ScaleCalibration): TakeoffProject {
  const active = activeSheetIdOf(p)
  if (!active) return { ...p, calibration: { ...cal } }
  return { ...p, calibration: { ...cal }, sheets: p.sheets!.map(s => (s.id === active ? { ...s, calibration: { ...cal }, scaleSet: true } : s)) }
}

export const renameSheet = (p: TakeoffProject, id: string, name: string): TakeoffProject => ({ ...p, sheets: p.sheets?.map(s => (s.id === id ? { ...s, name: name.trim() || s.name } : s)) })

/** Removes a sheet with its drawings, the priced items drawn on it and its electrical points. If it was showing, the first remaining sheet shows. */
export function removeSheet(p: TakeoffProject, id: string): { project: TakeoffProject; removedElements: number; removedItems: number } {
  if (!p.sheets?.some(s => s.id === id)) return { project: p, removedElements: 0, removedItems: 0 }
  const onIt = (thing: { sheetId?: string }) => sheetOf(thing, p) === id
  const doomed = new Set(p.elements.filter(onIt).map(e => e.id))
  const items = p.items.filter(it => !(it.elementId && doomed.has(it.elementId))).map(it => (it.electricPoints ? { ...it, electricPoints: it.electricPoints.filter(pt => !onIt(pt)) } : it.plumbPoints || it.plumbPipes ? mapPlumb(it, l => l.filter(pt => !onIt(pt))) : it))
  const remaining = p.sheets.filter(s => s.id !== id)
  const elements = p.elements.filter(e => !doomed.has(e.id))
  const wasActive = activeSheetIdOf(p) === id
  let next: TakeoffProject = { ...p, sheets: remaining, elements, items }
  if (remaining.length === 0) { delete next.activeSheetId }
  else if (wasActive) next = { ...next, activeSheetId: remaining[0].id, calibration: { ...remaining[0].calibration } }
  return { project: next, removedElements: doomed.size, removedItems: p.items.length - items.length }
}

// ── Levels: adding, renaming, switching, deleting ────────────────────────────

/** The usual levels of a house, bottom to top. Picking one from the list puts it in its place among the levels already there. */
export const LEVEL_PRESETS: { name: string }[] = [
  { name: 'Foundations' },
  { name: 'Ground floor' },
  { name: 'First floor' },
  { name: 'Second floor' },
  { name: 'Loft' },
  { name: 'Roof' },
]

/** Where a new level goes among the existing ones: a usual level (Foundations, Ground floor...) goes before the first existing level that is usually higher, any other name goes on top. */
export function levelInsertIndex(levels: TakeoffLevel[], name: string): number {
  const rank = (n: string) => LEVEL_PRESETS.findIndex(x => x.name.toLowerCase() === n.trim().toLowerCase())
  const r = rank(name)
  if (r < 0) return levels.length
  const i = levels.findIndex(l => { const o = rank(l.name); return o > r })
  return i < 0 ? levels.length : i
}

const stampLevel = <T extends OnLevel>(x: T, known: TakeoffLevel[], target: string): T => (x.levelId && known.some(l => l.id === x.levelId) ? x : { ...x, levelId: target })

/** Adds a level (at index from the bottom, on top by default) and shows it. What had no level yet is first stamped with the level it already belonged to. */
export function addLevel(p: TakeoffProject, id: string, name: string, heightMm?: number, index?: number): TakeoffProject {
  const existing = p.levels ?? []
  const target = existing.length ? existing[0].id : id
  const st = <T extends OnLevel>(x: T) => stampLevel(x, existing, target)
  const stampList = <T extends OnLevel>(l: T[] | undefined): T[] | undefined => (l ? l.map(st) : l)
  const level: TakeoffLevel = { id, name: name.trim() || 'Level', ...(heightMm ? { heightMm } : {}) }
  const at = Math.max(0, Math.min(existing.length, index ?? existing.length))
  const levels = [...existing.slice(0, at), level, ...existing.slice(at)]
  const sheets = p.sheets?.map(s => ({ ...s, roomLabels: stampList(s.roomLabels), roomShapes: stampList(s.roomShapes), roomEdges: stampList(s.roomEdges) }))
  return {
    ...p,
    levels,
    activeLevelId: id,
    elements: p.elements.map(st),
    items: p.items.map(it => (it.electricPoints ? { ...it, electricPoints: it.electricPoints.map(st) } : it.plumbPoints || it.plumbPipes ? mapPlumb(it, l => l.map(st)) : it)),
    ...(sheets ? { sheets } : {}),
    ...(p.roomLabels ? { roomLabels: stampList(p.roomLabels) } : {}),
    ...(p.roomShapes ? { roomShapes: stampList(p.roomShapes) } : {}),
    ...(p.roomEdges ? { roomEdges: stampList(p.roomEdges) } : {}),
  }
}

/** Shows another level. */
export function switchActiveLevel(p: TakeoffProject, id: string): TakeoffProject {
  return p.levels?.some(l => l.id === id) ? { ...p, activeLevelId: id } : p
}

export const renameLevel = (p: TakeoffProject, id: string, name: string): TakeoffProject => ({ ...p, levels: p.levels?.map(l => (l.id === id ? { ...l, name: name.trim() || l.name } : l)) })

/** Sets (or, with no number, clears) a level's floor to floor height, mm. */
export const setLevelHeight = (p: TakeoffProject, id: string, heightMm: number | undefined): TakeoffProject => ({
  ...p,
  levels: p.levels?.map(l => {
    if (l.id !== id) return l
    const { heightMm: _old, ...rest } = l
    return heightMm && heightMm > 0 ? { ...rest, heightMm } : rest
  }),
})

/** Moves a drawing to another level (it stays on its sheet). */
export function moveElementToLevel(p: TakeoffProject, elementId: string, levelId: string): TakeoffProject {
  if (!p.levels?.some(l => l.id === levelId)) return p
  return { ...p, elements: p.elements.map(e => (e.id === elementId ? { ...e, levelId } : e)) }
}

/** The level a priced item was drawn on (by its drawing), or undefined for an item with no drawing or when there are no levels. */
export function itemLevelId(item: TakeoffItem, p: Pick<TakeoffProject, 'levels' | 'elements'>): string | undefined {
  if (!item.elementId) return undefined
  const el = p.elements.find(e => e.id === item.elementId)
  return el ? levelOf(el, p) : undefined
}

/** Removes a level with its drawings, the priced items drawn on them, its electrical points, room names, drawn rooms and room edges. The showing level becomes the one below (or the first). */
export function removeLevel(p: TakeoffProject, id: string): { project: TakeoffProject; removedElements: number; removedItems: number } {
  if (!p.levels?.some(l => l.id === id)) return { project: p, removedElements: 0, removedItems: 0 }
  const onIt = (thing: OnLevel) => levelOf(thing, p) === id
  const doomed = new Set(p.elements.filter(onIt).map(e => e.id))
  const items = p.items.filter(it => !(it.elementId && doomed.has(it.elementId))).map(it => (it.electricPoints ? { ...it, electricPoints: it.electricPoints.filter(pt => !onIt(pt)) } : it.plumbPoints || it.plumbPipes ? mapPlumb(it, l => l.filter(pt => !onIt(pt))) : it))
  const keep = <T extends OnLevel>(l: T[] | undefined): T[] | undefined => (l ? l.filter(x => !onIt(x)) : l)
  const sheets = p.sheets?.map(s => ({ ...s, roomLabels: keep(s.roomLabels), roomShapes: keep(s.roomShapes), roomEdges: keep(s.roomEdges) }))
  const remaining = p.levels.filter(l => l.id !== id)
  const wasActive = activeLevelIdOf(p) === id
  const below = levelBelow(p, id)
  let next: TakeoffProject = {
    ...p,
    levels: remaining,
    elements: p.elements.filter(e => !doomed.has(e.id)),
    items,
    ...(sheets ? { sheets } : {}),
    ...(p.roomLabels ? { roomLabels: keep(p.roomLabels) } : {}),
    ...(p.roomShapes ? { roomShapes: keep(p.roomShapes) } : {}),
    ...(p.roomEdges ? { roomEdges: keep(p.roomEdges) } : {}),
  }
  if (remaining.length === 0) { delete next.levels; delete next.activeLevelId }
  else if (wasActive) next = { ...next, activeLevelId: (below ?? remaining[0]).id }
  return { project: next, removedElements: doomed.size, removedItems: p.items.length - items.length }
}

/** Copies what is drawn on one level (on the showing sheet) onto another level: the drawings of the chosen phases, their priced items, and the room edges and drawn rooms. The copies are exactly on top of the originals, so a ground floor copied
 *  onto the first floor has the same outline, and are then deleted or changed to suit the rooms upstairs. NOT copied: room names, electrical points, and the doors and windows placed on the walls (the screen copies those, its list lives on one item).
 *  Whatever is already on the other level stays. `phases` limits it to those phases (all when not given). `idMap` says which new drawing is a copy of which. */
export function copyLevelContents(p: TakeoffProject, fromId: string, toId: string, newId: () => string, phases?: Set<string>): { project: TakeoffProject; idMap: Map<string, string>; copiedElements: number; copiedItems: number } {
  const none = { project: p, idMap: new Map<string, string>(), copiedElements: 0, copiedItems: 0 }
  if (fromId === toId || !p.levels?.some(l => l.id === fromId) || !p.levels?.some(l => l.id === toId)) return none
  const sources = p.elements.filter(el => onActiveSheet(el, p) && levelOf(el, p) === fromId && (!phases || phases.has(el.phase)))
  const idMap = new Map<string, string>()
  const elements: DrawnElement[] = sources.map(el => {
    const id = newId()
    idMap.set(el.id, id)
    return { ...el, id, levelId: toId, points: el.points.map(pt => ({ ...pt })), tagDx: undefined, tagDy: undefined }
  })
  const items: TakeoffItem[] = p.items
    .filter(it => it.elementId && idMap.has(it.elementId) && !it.electricsSummary && !it.plumbSummary && !it.wdSummary)
    .map(it => ({ ...it, id: newId(), elementId: idMap.get(it.elementId!)!, drawnOpenings: undefined }))
  const sheetId = activeSheetIdOf(p)
  const copyList = <T extends OnLevel & { id: string; points: { x: number; y: number }[] }>(list: T[] | undefined): T[] =>
    (list ?? []).filter(x => levelOf(x, p) === fromId).map(x => ({ ...x, id: newId(), levelId: toId, points: x.points.map(pt => ({ ...pt })) }))
  const owner = sheetId ? p.sheets?.find(s => s.id === sheetId) : undefined
  const edges = copyList(owner ? owner.roomEdges : p.roomEdges)
  const shapes = copyList(owner ? owner.roomShapes : p.roomShapes)
  let project: TakeoffProject = { ...p, elements: [...p.elements, ...elements], items: [...p.items, ...items] }
  if (owner) project = { ...project, sheets: p.sheets!.map(s => (s.id === owner.id ? { ...s, roomEdges: [...(s.roomEdges ?? []), ...edges], roomShapes: [...(s.roomShapes ?? []), ...shapes] } : s)) }
  else project = { ...project, roomEdges: [...(p.roomEdges ?? []), ...edges], roomShapes: [...(p.roomShapes ?? []), ...shapes] }
  return { project, idMap, copiedElements: elements.length, copiedItems: items.length }
}
