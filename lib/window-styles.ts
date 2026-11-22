// The styles (layouts) of window you can pick in Take-off & Draw for each kind of window: casement, tilt-and-turn, fixed (picture), sash and bay, with a frame material (uPVC or aluminium), a frame colour and glazing bars.
// Pure data and rules, no screen: the picker (components/WindowStylePicker.tsx) draws a thumbnail from the panes, the plan draws the mullions (`mullionFractions`), the Windows calculator is told the material, colour and the style in words.
// A style's panes are polygons in fractions of the frame (0 to 1 across and down); `t` says how a pane opens: F fixed, L / R side-hung (hinged on the left or right), T top-hung, TL / TR tilt-and-turn (hinged left or right), SU / SD sliding sash (moves up or down), S a solid infill panel (no glass, as under a door side panel's glazing).

import type { OpeningKind, WdMaterial } from './wd-units'

export type PaneType = 'F' | 'L' | 'R' | 'T' | 'TL' | 'TR' | 'SU' | 'SD' | 'S'
export interface WinPane { p: [number, number][]; t: PaneType }
export interface WinStyle {
  id: string
  name: string
  /** how it reads in a sentence on the quote: "two-pane, one opening" */
  words: string
  /** width over height of the frame, for drawing the thumbnail */
  ar: number
  /** the usual size of this layout, mm */
  w: number
  h: number
  panes: WinPane[]
  /** bars the style always has (sash windows): columns and rows of panes in each sash */
  bars?: [number, number]
}

export type WindowKind = 'win-casement' | 'win-tilt-turn' | 'win-fixed' | 'win-sash' | 'win-bay' | 'win-side-panel'
export const WINDOW_KINDS: WindowKind[] = ['win-casement', 'win-tilt-turn', 'win-fixed', 'win-sash', 'win-bay', 'win-side-panel']
export const isWindowKind = (k: string): k is WindowKind => (WINDOW_KINDS as string[]).includes(k)

const R = (x0: number, y0: number, x1: number, y1: number, t: PaneType): WinPane => ({ p: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], t })
const P = (p: [number, number][], t: PaneType): WinPane => ({ p, t })
// the faces of a bay: a left side, a right side, and the pieces of a bow
const bayL = (t: PaneType) => P([[0, 0.07], [0.27, 0], [0.27, 1], [0, 0.93]], t)
const bayR = (t: PaneType) => P([[0.73, 0], [1, 0.07], [1, 0.93], [0.73, 1]], t)

export const WINDOW_STYLES: Record<WindowKind, WinStyle[]> = {
  'win-casement': [
    { id: 'single-side', name: 'Single, side-hung', words: 'single side-hung opening light', ar: 0.7, w: 600, h: 1050, panes: [R(0, 0, 1, 1, 'L')] },
    { id: 'single-top', name: 'Single, top-hung', words: 'single top-hung opening light', ar: 1.3, w: 900, h: 600, panes: [R(0, 0, 1, 1, 'T')] },
    { id: 'two-one-opens', name: 'Two-pane, one opens', words: 'two-pane, one opening', ar: 1.1, w: 1200, h: 1200, panes: [R(0, 0, 0.5, 1, 'L'), R(0.5, 0, 1, 1, 'F')] },
    { id: 'two-both-open', name: 'Two-pane, both open', words: 'two-pane, both opening', ar: 1.1, w: 1200, h: 1200, panes: [R(0, 0, 0.5, 1, 'L'), R(0.5, 0, 1, 1, 'R')] },
    { id: 'three-side-openers', name: 'Three-pane, side openers', words: 'three-pane with opening side lights and a fixed centre', ar: 1.5, w: 1800, h: 1200, panes: [R(0, 0, 0.3, 1, 'L'), R(0.3, 0, 0.7, 1, 'F'), R(0.7, 0, 1, 1, 'R')] },
    { id: 'top-light-opener', name: 'Top light over opener', words: 'fixed top light over a side-hung opening light', ar: 0.8, w: 600, h: 1200, panes: [R(0, 0, 1, 0.28, 'F'), R(0, 0.28, 1, 1, 'L')] },
    { id: 'two-top-lights', name: 'Two-pane, top lights', words: 'two opening lights under fixed top lights', ar: 1.1, w: 1200, h: 1350, panes: [R(0, 0, 0.5, 0.28, 'F'), R(0.5, 0, 1, 0.28, 'F'), R(0, 0.28, 0.5, 1, 'L'), R(0.5, 0.28, 1, 1, 'R')] },
    { id: 'three-top-lights', name: 'Three-pane, top lights', words: 'three-pane with fixed top lights, opening side lights and a fixed centre', ar: 1.5, w: 1800, h: 1350, panes: [R(0, 0, 0.3, 0.26, 'F'), R(0.3, 0, 0.7, 0.26, 'F'), R(0.7, 0, 1, 0.26, 'F'), R(0, 0.26, 0.3, 1, 'L'), R(0.3, 0.26, 0.7, 1, 'F'), R(0.7, 0.26, 1, 1, 'R')] },
  ],
  'win-tilt-turn': [
    { id: 'tt-single', name: 'Single tilt-and-turn', words: 'single tilt-and-turn light', ar: 0.8, w: 750, h: 1200, panes: [R(0, 0, 1, 1, 'TL')] },
    { id: 'tt-fixed-side', name: 'Tilt-and-turn, fixed side', words: 'tilt-and-turn light with a fixed side light', ar: 1.2, w: 1200, h: 1200, panes: [R(0, 0, 0.6, 1, 'TL'), R(0.6, 0, 1, 1, 'F')] },
    { id: 'tt-pair', name: 'Pair of tilt-and-turns', words: 'pair of tilt-and-turn lights', ar: 1.2, w: 1500, h: 1200, panes: [R(0, 0, 0.5, 1, 'TL'), R(0.5, 0, 1, 1, 'TR')] },
    { id: 'tt-fixed-centre', name: 'Tilt-and-turn, fixed centre', words: 'tilt-and-turn side lights with a fixed centre', ar: 1.5, w: 1800, h: 1200, panes: [R(0, 0, 0.3, 1, 'TL'), R(0.3, 0, 0.7, 1, 'F'), R(0.7, 0, 1, 1, 'TR')] },
    { id: 'tt-top-light', name: 'Tilt-and-turn, top light', words: 'tilt-and-turn light under a fixed top light', ar: 0.8, w: 750, h: 1500, panes: [R(0, 0, 1, 0.25, 'F'), R(0, 0.25, 1, 1, 'TL')] },
  ],
  'win-fixed': [
    { id: 'fixed-single', name: 'Single fixed light', words: 'single fixed light', ar: 1, w: 900, h: 900, panes: [R(0, 0, 1, 1, 'F')] },
    { id: 'fixed-wide', name: 'Wide picture window', words: 'wide fixed picture window', ar: 1.8, w: 1800, h: 1050, panes: [R(0, 0, 1, 1, 'F')] },
    { id: 'fixed-top-light', name: 'Picture window, top light', words: 'fixed picture window with a fixed top light', ar: 1.5, w: 1800, h: 1200, panes: [R(0, 0, 1, 0.22, 'F'), R(0, 0.22, 1, 1, 'F')] },
    { id: 'fixed-side-openers', name: 'Picture window, side openers', words: 'fixed picture window with opening side lights', ar: 1.8, w: 2100, h: 1200, panes: [R(0, 0, 0.22, 1, 'L'), R(0.22, 0, 0.78, 1, 'F'), R(0.78, 0, 1, 1, 'R')] },
    { id: 'fixed-two', name: 'Two fixed lights', words: 'two fixed lights', ar: 1.3, w: 1500, h: 1200, panes: [R(0, 0, 0.5, 1, 'F'), R(0.5, 0, 1, 1, 'F')] },
    { id: 'fixed-tall', name: 'Tall narrow light', words: 'tall narrow fixed light', ar: 0.45, w: 450, h: 1500, panes: [R(0, 0, 1, 1, 'F')] },
  ],
  'win-sash': [
    { id: 'sash-1-1', name: 'Sliding sash, 1 over 1', words: 'vertical sliding sash, one over one', ar: 0.6, w: 900, h: 1500, panes: [R(0, 0, 1, 0.5, 'SD'), R(0, 0.5, 1, 1, 'SU')] },
    { id: 'sash-2-2', name: 'Sliding sash, 2 over 2', words: 'vertical sliding sash, two over two', ar: 0.6, w: 900, h: 1500, bars: [2, 1], panes: [R(0, 0, 1, 0.5, 'SD'), R(0, 0.5, 1, 1, 'SU')] },
    { id: 'sash-6-6', name: 'Box sash, 6 over 6', words: 'box sash window, six over six', ar: 0.7, w: 1000, h: 1500, bars: [3, 2], panes: [R(0, 0, 1, 0.5, 'SD'), R(0, 0.5, 1, 1, 'SU')] },
    { id: 'sash-pair', name: 'Pair of sliding sashes', words: 'pair of vertical sliding sashes, one over one', ar: 1.1, w: 1800, h: 1500, panes: [R(0, 0, 0.5, 0.5, 'SD'), R(0, 0.5, 0.5, 1, 'SU'), R(0.5, 0, 1, 0.5, 'SD'), R(0.5, 0.5, 1, 1, 'SU')] },
  ],
  'win-bay': [
    { id: 'bay-splay-3', name: 'Splayed bay, 3 panes', words: 'three-pane splayed bay with opening side lights', ar: 1.5, w: 2400, h: 1350, panes: [bayL('L'), R(0.27, 0, 0.73, 1, 'F'), bayR('R')] },
    { id: 'bay-splay-fixed', name: 'Splayed bay, all fixed', words: 'three-pane splayed bay, all fixed', ar: 1.5, w: 2400, h: 1350, panes: [bayL('F'), R(0.27, 0, 0.73, 1, 'F'), bayR('F')] },
    { id: 'bay-splay-tilt', name: 'Splayed bay, tilt centre', words: 'three-pane splayed bay with a tilt-and-turn centre', ar: 1.5, w: 2400, h: 1350, panes: [bayL('F'), R(0.27, 0, 0.73, 1, 'TL'), bayR('F')] },
    { id: 'bay-square-3', name: 'Square bay, 3 panes', words: 'three-pane square bay with opening side lights', ar: 1.5, w: 2400, h: 1350, panes: [R(0, 0, 0.24, 1, 'L'), R(0.24, 0, 0.76, 1, 'F'), R(0.76, 0, 1, 1, 'R')] },
    { id: 'bay-bow-5', name: 'Bow bay, 5 panes', words: 'five-pane bow bay with two opening lights', ar: 1.8, w: 3000, h: 1350, panes: [
      P([[0, 0.14], [0.15, 0.07], [0.15, 0.93], [0, 0.86]], 'F'), P([[0.15, 0.07], [0.32, 0], [0.32, 1], [0.15, 0.93]], 'L'), R(0.32, 0, 0.68, 1, 'F'),
      P([[0.68, 0], [0.85, 0.07], [0.85, 0.93], [0.68, 1]], 'R'), P([[0.85, 0.07], [1, 0.14], [1, 0.86], [0.85, 0.93]], 'F')] },
  ],
  // the fixed glazed panel that stands beside a front door (a sidelight): narrow and as tall as the door, all fixed
  'win-side-panel': [
    { id: 'sp-full-glass', name: 'Full-height glass', words: 'full-height fixed glazed side panel', ar: 0.3, w: 450, h: 2100, panes: [R(0, 0, 1, 1, 'F')] },
    { id: 'sp-glass-over-solid', name: 'Glass over solid panel', words: 'fixed glazed side panel over a solid lower panel', ar: 0.3, w: 450, h: 2100, panes: [R(0, 0, 1, 0.68, 'F'), R(0, 0.68, 1, 1, 'S')] },
    { id: 'sp-three-quarter', name: 'Three-quarter glass', words: 'three-quarter glazed side panel with a solid base', ar: 0.3, w: 450, h: 2100, panes: [R(0, 0, 1, 0.78, 'F'), R(0, 0.78, 1, 1, 'S')] },
    { id: 'sp-two-lights', name: 'Two stacked lights', words: 'side panel with two stacked fixed lights', ar: 0.3, w: 450, h: 2100, panes: [R(0, 0, 1, 0.5, 'F'), R(0, 0.5, 1, 1, 'F')] },
    { id: 'sp-top-light', name: 'Glass with top light', words: 'full-height glazed side panel with a fixed top light', ar: 0.3, w: 450, h: 2100, panes: [R(0, 0, 1, 0.2, 'F'), R(0, 0.2, 1, 1, 'F')] },
    { id: 'sp-wide', name: 'Wide full-height glass', words: 'wide full-height fixed glazed side panel', ar: 0.4, w: 650, h: 2100, panes: [R(0, 0, 1, 1, 'F')] },
  ],
}

/** the style each kind starts on (the one nearest the kind's usual size) */
export const DEFAULT_STYLE: Record<WindowKind, string> = {
  'win-casement': 'two-one-opens', 'win-tilt-turn': 'tt-fixed-side', 'win-fixed': 'fixed-single', 'win-sash': 'sash-1-1', 'win-bay': 'bay-splay-3', 'win-side-panel': 'sp-full-glass',
}

export const stylesFor = (kind: string): WinStyle[] => (isWindowKind(kind) ? WINDOW_STYLES[kind] : [])
/** the style with this id for this kind, if there is one */
export const styleById = (kind: string, id: string | undefined): WinStyle | undefined => (id ? stylesFor(kind).find(s => s.id === id) : undefined)
/** the style to use: the one named if it belongs to this kind, otherwise the kind's usual one (undefined for a kind with no styles) */
export const styleOrDefault = (kind: string, id: string | undefined): WinStyle | undefined => styleById(kind, id) ?? styleById(kind, isWindowKind(kind) ? DEFAULT_STYLE[kind] : undefined)

export type FrameColourId = 'white' | 'cream' | 'anthracite' | 'black' | 'oak'
export const FRAME_COLOURS: { id: FrameColourId; name: string; hex: string }[] = [
  { id: 'white', name: 'White', hex: '#f3f2ee' },
  { id: 'cream', name: 'Cream', hex: '#e6dcc0' },
  { id: 'anthracite', name: 'Anthracite grey', hex: '#3d4247' },
  { id: 'black', name: 'Black', hex: '#1e1e1e' },
  { id: 'oak', name: 'Golden oak', hex: '#9a6a3c' },
]
export const colourById = (id: string | undefined) => FRAME_COLOURS.find(c => c.id === id) ?? FRAME_COLOURS[0]

export type GlazingBars = 'none' | 'georgian' | 'astragal'
export const BARS_LABEL: Record<GlazingBars, string> = { none: 'None', georgian: 'Georgian (cross)', astragal: 'Astragal (slim bars)' }
const BARS_WORDS: Record<GlazingBars, string> = { none: '', georgian: 'Georgian bars', astragal: 'astragal glazing bars' }

/** the frame materials a window can be given in the picker (the calculator has more, for typing over) */
export type FrameMaterial = Extract<WdMaterial, 'upvc' | 'aluminium'>
export const FRAME_MATERIALS: { id: FrameMaterial; name: string }[] = [{ id: 'upvc', name: 'uPVC' }, { id: 'aluminium', name: 'Aluminium' }]

/** What was chosen in the picker for a window */
export interface WindowChoice { style: string; material: FrameMaterial; colour: FrameColourId; bars: GlazingBars }
export const DEFAULT_CHOICE = (kind: string): WindowChoice => ({ style: isWindowKind(kind) ? DEFAULT_STYLE[kind] : '', material: 'upvc', colour: 'white', bars: 'none' })

/** A choice made safe: a style that does not belong to the kind becomes the kind's usual one, anything else unknown the plain start (uPVC, white, no bars) */
/** what a choice looks like when it comes from a saved drawing (plain text, not yet checked) */
export type LooseChoice = Partial<Record<keyof WindowChoice, string>>
export function cleanChoice(kind: string, c: LooseChoice | undefined): WindowChoice {
  const d = DEFAULT_CHOICE(kind)
  return {
    style: styleById(kind, c?.style)?.id ?? d.style,
    material: c?.material === 'aluminium' ? 'aluminium' : 'upvc',
    colour: FRAME_COLOURS.some(x => x.id === c?.colour) ? (c!.colour as FrameColourId) : 'white',
    bars: c?.bars === 'georgian' ? 'georgian' : c?.bars === 'astragal' ? 'astragal' : 'none',
  }
}

/** The style and bars in words for the quote: "two-pane, one opening, with Georgian bars" (empty for a kind with no styles) */
export function styleWords(kind: string, c: LooseChoice | undefined): string {
  const s = styleOrDefault(kind, c?.style)
  if (!s) return ''
  const bars = cleanChoice(kind, c).bars
  return bars === 'none' ? s.words : `${s.words}, with ${BARS_WORDS[bars]}`
}

/** Where the dividing bars (mullions and transoms' vertical edges) fall across the width of a style, as fractions of the frame (0 to 1, ends left out): what the plan draws across a window. */
export function mullionFractions(kind: string, styleId: string | undefined): number[] {
  const s = styleOrDefault(kind, styleId)
  if (!s) return []
  const xs = new Set<number>()
  for (const pane of s.panes) for (const [x] of pane.p) { const r = Math.round(x * 1000) / 1000; if (r > 0.001 && r < 0.999) xs.add(r) }
  return [...xs].sort((a, b) => a - b)
}

/** How the opening panes of a style are described for the calculator or a short label: how many open */
export const openingPaneCount = (s: WinStyle): number => s.panes.filter(p => p.t !== 'F' && p.t !== 'S').length
