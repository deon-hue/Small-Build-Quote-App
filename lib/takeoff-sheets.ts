// Sheets in a Take-off: each plan is a sheet with its own scale, and drawings belong to the sheet they were drawn on. These are the pure rules (which sheet is showing, which drawings belong to it, adding,
// switching, deleting) kept apart from the screen so they can be tested. Type imports only.
//
// The project's own `calibration` is always the ACTIVE sheet's scale, so every measurement already in the screen keeps working unchanged; switching sheets swaps it. A drawing with no sheetId (drawn
// before there were sheets) belongs to the first sheet. When the first plan is added, anything already drawn is stamped with that sheet's id, so deleting a sheet later never adopts another's drawings.

import type { TakeoffProject, TakeoffSheet, DrawnElement, TakeoffItem, ScaleCalibration } from './takeoff-types'
import type { ElectricPoint } from './electric-points'

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

export const elementsOnActiveSheet = (p: Pick<TakeoffProject, 'sheets' | 'activeSheetId' | 'elements'>): DrawnElement[] => p.elements.filter(el => onActiveSheet(el, p))

/** The ids of the drawings on the showing sheet: the only ones a scale change may remeasure. */
export const activeSheetElementIds = (p: Pick<TakeoffProject, 'sheets' | 'activeSheetId' | 'elements'>): Set<string> => new Set(elementsOnActiveSheet(p).map(e => e.id))

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
    sheets = [first, ...sheets.slice(1)]
    elements = p.elements.map(e => (e.sheetId ? e : { ...e, sheetId: first.id }))
    items = p.items.map(it => (it.electricPoints ? { ...it, electricPoints: stampPoints(it.electricPoints, first.id) } : it))
  }
  const active = added[added.length - 1]
  return { ...p, sheets, elements, items, activeSheetId: active.id, calibration: { ...(sheets.find(s => s.id === active.id)!.calibration) } }
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
  const items = p.items.filter(it => !(it.elementId && doomed.has(it.elementId))).map(it => (it.electricPoints ? { ...it, electricPoints: it.electricPoints.filter(pt => !onIt(pt)) } : it))
  const remaining = p.sheets.filter(s => s.id !== id)
  const elements = p.elements.filter(e => !doomed.has(e.id))
  const wasActive = activeSheetIdOf(p) === id
  let next: TakeoffProject = { ...p, sheets: remaining, elements, items }
  if (remaining.length === 0) { delete next.activeSheetId }
  else if (wasActive) next = { ...next, activeSheetId: remaining[0].id, calibration: { ...remaining[0].calibration } }
  return { project: next, removedElements: doomed.size, removedItems: p.items.length - items.length }
}
