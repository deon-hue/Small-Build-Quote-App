// One set of functions for the style picker of ANY opening that has one: windows (lib/window-styles.ts) and doors (lib/door-styles.ts). The picker, the Take-off panel and the page ask this module, so a window and a door are handled the same way:
// the styles of a kind, the materials and colours it offers, a choice made safe, the words for the quote, and the size and bars a style gives on the plan. Pure, no screen.

import { KIND_BY_ID, type WdMaterial } from './wd-units'
import {
  isWindowKind, stylesFor as windowStyles, styleOrDefault as windowStyleOrDefault, cleanChoice as cleanWindowChoice, styleWords as windowStyleWords, mullionFractions, FRAME_COLOURS, DEFAULT_STYLE as WINDOW_DEFAULT_STYLE,
  type WinStyle, type GlazingBars,
} from './window-styles'
import {
  isDoorKind, isInternalDoorKind, doorStylesFor, doorStyleOrDefault, doorSwatches, DOOR_MATERIALS, DEFAULT_DOOR_STYLE, DOOR_COLOURS, type DoorStyle, type Swatch,
} from './door-styles'

/** a side panel stands beside a front door, so it is offered the door's materials and colours to match it */
export const isSidePanel = (k: string): boolean => k === 'win-side-panel'

export const isStyledKind = (k: string): boolean => isWindowKind(k) || isDoorKind(k)

/** What was chosen in the picker for a window or a door */
export interface OpeningChoice { style: string; material: WdMaterial; colour: string; bars: GlazingBars }
/** a choice as it comes from a saved drawing (plain text, not yet checked) */
export type LooseOpeningChoice = Partial<Record<keyof OpeningChoice, string>>

/** One style to pick, whichever kind of opening it is for */
export interface StyleCard { id: string; name: string; words: string; family: 'window' | 'door'; win?: WinStyle; door?: DoorStyle; w?: number; h?: number }

const cardOfWindow = (s: WinStyle): StyleCard => ({ id: s.id, name: s.name, words: s.words, family: 'window', win: s, w: s.w, h: s.h })
const cardOfDoor = (s: DoorStyle): StyleCard => ({ id: s.id, name: s.name, words: s.words, family: 'door', door: s, w: s.w, h: s.h })

export const styleCards = (kind: string): StyleCard[] => (isWindowKind(kind) ? windowStyles(kind).map(cardOfWindow) : isDoorKind(kind) ? doorStylesFor(kind).map(cardOfDoor) : [])
export const styleCardOrDefault = (kind: string, id: string | undefined): StyleCard | undefined => {
  if (isWindowKind(kind)) { const s = windowStyleOrDefault(kind, id); return s ? cardOfWindow(s) : undefined }
  if (isDoorKind(kind)) { const s = doorStyleOrDefault(kind, id); return s ? cardOfDoor(s) : undefined }
  return undefined
}
export const defaultStyleId = (kind: string): string => (isWindowKind(kind) ? WINDOW_DEFAULT_STYLE[kind] : isDoorKind(kind) ? DEFAULT_DOOR_STYLE[kind] : '')

export const MATERIAL_NAME: Record<WdMaterial, string> = { upvc: 'uPVC', aluminium: 'Aluminium', timber: 'Timber', composite: 'Composite', steel: 'Steel' }
/** the materials a kind offers in the picker, the first is the start (windows: uPVC or aluminium) */
export function materialsFor(kind: string): { id: WdMaterial; name: string }[] {
  const ids: WdMaterial[] = isSidePanel(kind) ? ['upvc', 'aluminium', 'timber', 'composite'] : isWindowKind(kind) ? ['upvc', 'aluminium'] : isDoorKind(kind) ? DOOR_MATERIALS[kind] : []
  return ids.map(id => ({ id, name: MATERIAL_NAME[id] }))
}
export const defaultMaterialFor = (kind: string): WdMaterial => materialsFor(kind)[0]?.id ?? (KIND_BY_ID[kind]?.defaultMaterial ?? 'upvc')

/** the colours (windows and external doors) or finishes (internal doors) to pick from */
export const swatchesFor = (kind: string): Swatch[] => (isSidePanel(kind) ? DOOR_COLOURS : isWindowKind(kind) ? FRAME_COLOURS : isDoorKind(kind) ? doorSwatches(kind) : [])
export const colourLabelFor = (kind: string): string => (isWindowKind(kind) ? 'Frame colour' : isInternalDoorKind(kind) ? 'Finish' : 'Door colour')
export const materialLabelFor = (kind: string): string => (isWindowKind(kind) ? 'Frame material' : 'Door material')
/** only windows have glazing bars to pick */
export const barsAllowed = (kind: string): boolean => isWindowKind(kind)
export const swatchOf = (kind: string, id: string | undefined): Swatch => { const l = swatchesFor(kind); return l.find(c => c.id === id) ?? l[0] }
/** the first colour is the plain one (white, or white primed): anything else is a coloured frame or door for the price */
export const isColoured = (kind: string, colourId: string | undefined): boolean => { const l = swatchesFor(kind); return l.length > 0 && !!colourId && colourId !== l[0].id }

export const defaultChoice = (kind: string): OpeningChoice => ({ style: defaultStyleId(kind), material: defaultMaterialFor(kind), colour: swatchesFor(kind)[0]?.id ?? 'white', bars: 'none' })

/** A choice made safe: a style that belongs to another kind becomes this kind's usual one, a material this kind does not offer its usual one, an unknown colour the plain one, unknown bars none (and none for a door) */
export function cleanOpeningChoice(kind: string, c: LooseOpeningChoice | undefined): OpeningChoice {
  const d = defaultChoice(kind)
  if (isWindowKind(kind)) {
    const w = cleanWindowChoice(kind, c)
    if (isSidePanel(kind)) return { style: w.style, material: materialsFor(kind).find(m => m.id === c?.material)?.id ?? d.material, colour: swatchesFor(kind).find(s => s.id === c?.colour)?.id ?? d.colour, bars: w.bars }
    return { style: w.style, material: w.material, colour: w.colour, bars: w.bars }
  }
  return {
    style: doorStyleOrDefault(kind, c?.style)?.id ?? d.style,
    material: materialsFor(kind).find(m => m.id === c?.material)?.id ?? d.material,
    colour: swatchesFor(kind).find(s => s.id === c?.colour)?.id ?? d.colour,
    bars: 'none',
  }
}

/** The style in words for the quote: a window "two-pane, one opening, with Georgian bars", an external door "six-panel", an internal door "four-panel, natural oak finish" (empty for a kind with no styles) */
export function openingStyleWords(kind: string, c: LooseOpeningChoice | undefined): string {
  if (isWindowKind(kind)) return windowStyleWords(kind, c)
  const s = doorStyleOrDefault(kind, c?.style)
  if (!s) return ''
  if (isInternalDoorKind(kind)) {
    const col = cleanOpeningChoice(kind, c).colour
    return `${s.words}, ${col === 'primed' ? 'white primed' : swatchOf(kind, col).name.toLowerCase() + ' finish'}`
  }
  return s.words
}

/** the size a style starts at, when it has its own (bi-fold, sliding and garage doors, and windows): absent for a style that takes the kind's standard size */
export const styleSize = (kind: string, styleId: string | undefined): { w: number; h: number } | undefined => {
  const s = styleCardOrDefault(kind, styleId)
  return s && s.w && s.h ? { w: s.w, h: s.h } : undefined
}
/** where the dividing bars of a WINDOW fall across its width (none for a door) */
export const mullionsFor = (kind: string, styleId: string | undefined): number[] => (isWindowKind(kind) ? mullionFractions(kind, styleId) : [])
/** how many panels a bi-fold door's style folds into (undefined for any other kind) */
export const panelsFor = (kind: string, styleId: string | undefined): number | undefined => (kind === 'door-bifold' ? doorStyleOrDefault(kind, styleId)?.panels : undefined)
