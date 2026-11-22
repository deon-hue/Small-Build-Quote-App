// The styles of DOOR you can pick in Take-off & Draw for each kind of door (front, composite, security, back, French, bi-fold, sliding patio, garage, and the internal doors), with the material and the colour or finish.
// Pure data, no screen: the picker (components/OpeningStylePicker.tsx) draws a thumbnail from the leaf's features. Windows are in lib/window-styles.ts; lib/opening-styles.ts puts both behind one set of functions.
// A door is drawn as one leaf (or two, for a pair) with FEATURES on it, in fractions of the leaf (0 to 1 across and down): a raised panel, a glazed light, an oval light, louvres, or a line (the split of a stable door).

import type { OpeningKind, WdMaterial } from './wd-units'

export type DoorKind =
  | 'door-front' | 'door-composite' | 'door-security' | 'door-back' | 'door-french' | 'door-bifold' | 'door-sliding' | 'door-garage'
  | 'door-int-single' | 'door-int-fire' | 'door-int-double' | 'door-int-pocket'
export const DOOR_KINDS: DoorKind[] = [
  'door-front', 'door-composite', 'door-security', 'door-back', 'door-french', 'door-bifold', 'door-sliding', 'door-garage',
  'door-int-single', 'door-int-fire', 'door-int-double', 'door-int-pocket',
]
export const isDoorKind = (k: string): k is DoorKind => (DOOR_KINDS as string[]).includes(k)
export const isInternalDoorKind = (k: string) => k.startsWith('door-int-')

export type FeatureType = 'panel' | 'glass' | 'oval' | 'louvre' | 'line'
export interface DoorFeature { x0: number; y0: number; x1: number; y1: number; t: FeatureType }
export interface DoorStyle {
  id: string
  name: string
  /** how it reads in a sentence on the quote: "six-panel", "half-glazed" */
  words: string
  /** width over height of the whole door, for drawing the thumbnail */
  ar: number
  /** the usual size of this layout when it differs from the kind's (bi-fold, sliding and garage doors); absent = the kind's own standard size */
  w?: number
  h?: number
  /** 1 leaf, or 2 for a pair (French, garage side-hinged, internal double): the features are drawn on each */
  leaves: 1 | 2
  features: DoorFeature[]
  /** how many panels a bi-fold folds into (drawn on the plan as that many panels) */
  panels?: number
}

const F = (x0: number, y0: number, x1: number, y1: number, t: FeatureType): DoorFeature => ({ x0, y0, x1, y1, t })
/** a grid of features: `cols` across, one row per [top, bottom] pair, inside a margin and with a gap between */
const grid = (cols: number, rows: [number, number][], t: FeatureType, m = 0.14, gap = 0.06): DoorFeature[] => {
  const cw = (1 - 2 * m - (cols - 1) * gap) / cols
  const out: DoorFeature[] = []
  for (const [y0, y1] of rows) for (let c = 0; c < cols; c++) out.push(F(m + c * (cw + gap), y0, m + c * (cw + gap) + cw, y1, t))
  return out
}
/** n equal panels across the whole width, each a glazed light with a narrow frame between (bi-fold and sliding doors) */
const panelsAcross = (n: number, overlap = 0): DoorFeature[] => {
  const w = 1 / n
  return Array.from({ length: n }, (_, i) => F(Math.max(0, i * w - overlap), 0.04, Math.min(1, (i + 1) * w + overlap), 0.96, 'glass'))
}
const bands = (n: number): DoorFeature[] => Array.from({ length: n }, (_, i) => F(0.05, 0.04 + (i * 0.92) / n, 0.95, 0.04 + ((i + 1) * 0.92) / n - 0.015, 'panel'))

const LEAF = 0.43   // a leaf door is about 900 wide and 2100 high

const FRONT: DoorStyle[] = [
  { id: 'flush', name: 'Solid, plain', words: 'solid flush', ar: LEAF, leaves: 1, features: [] },
  { id: 'six-panel', name: 'Six-panel', words: 'six-panel', ar: LEAF, leaves: 1, features: grid(2, [[0.07, 0.28], [0.34, 0.58], [0.64, 0.93]], 'panel', 0.16) },
  { id: 'four-panel', name: 'Four-panel', words: 'four-panel', ar: LEAF, leaves: 1, features: grid(2, [[0.07, 0.42], [0.5, 0.93]], 'panel', 0.16) },
  { id: 'half-glazed', name: 'Half-glazed', words: 'half-glazed', ar: LEAF, leaves: 1, features: [F(0.16, 0.07, 0.84, 0.5, 'glass'), F(0.16, 0.57, 0.84, 0.93, 'panel')] },
  { id: 'cottage', name: 'Cottage, top lights', words: 'cottage-style with glazed top lights', ar: LEAF, leaves: 1, features: [...grid(3, [[0.07, 0.3]], 'glass', 0.12, 0.05), F(0.16, 0.37, 0.84, 0.93, 'panel')] },
  { id: 'glass-strip', name: 'Vertical glazed strip', words: 'with a vertical glazed strip', ar: LEAF, leaves: 1, features: [F(0.58, 0.08, 0.84, 0.92, 'glass'), F(0.16, 0.08, 0.5, 0.92, 'panel')] },
  { id: 'oval', name: 'Oval glazed panel', words: 'with an oval glazed panel', ar: LEAF, leaves: 1, features: [F(0.2, 0.1, 0.8, 0.5, 'oval'), F(0.16, 0.58, 0.84, 0.93, 'panel')] },
  { id: 'full-glass', name: 'Fully glazed', words: 'fully glazed', ar: LEAF, leaves: 1, features: [F(0.16, 0.06, 0.84, 0.94, 'glass')] },
]
const BACK: DoorStyle[] = [
  { id: 'flush', name: 'Solid, plain', words: 'solid flush', ar: LEAF, leaves: 1, features: [] },
  { id: 'half-glazed', name: 'Half-glazed', words: 'half-glazed', ar: LEAF, leaves: 1, features: [F(0.16, 0.07, 0.84, 0.5, 'glass'), F(0.16, 0.57, 0.84, 0.93, 'panel')] },
  { id: 'three-quarter', name: 'Three-quarter glazed', words: 'three-quarter glazed', ar: LEAF, leaves: 1, features: [F(0.16, 0.07, 0.84, 0.68, 'glass'), F(0.16, 0.75, 0.84, 0.93, 'panel')] },
  { id: 'full-glass', name: 'Fully glazed', words: 'fully glazed', ar: LEAF, leaves: 1, features: [F(0.16, 0.06, 0.84, 0.94, 'glass')] },
  { id: 'four-panel', name: 'Four-panel', words: 'four-panel', ar: LEAF, leaves: 1, features: grid(2, [[0.07, 0.42], [0.5, 0.93]], 'panel', 0.16) },
  { id: 'stable', name: 'Stable door (split)', words: 'stable (split) door', ar: LEAF, leaves: 1, features: [F(0.05, 0.5, 0.95, 0.5, 'line'), F(0.16, 0.08, 0.84, 0.44, 'glass'), F(0.16, 0.56, 0.84, 0.93, 'panel')] },
]
const SECURITY: DoorStyle[] = [
  { id: 'solid', name: 'Solid, plain', words: 'solid', ar: LEAF, leaves: 1, features: [] },
  { id: 'vision-strip', name: 'Slim vision strip', words: 'with a slim vision strip', ar: LEAF, leaves: 1, features: [F(0.6, 0.1, 0.78, 0.5, 'glass')] },
  { id: 'vision-panel', name: 'High vision panel', words: 'with a small high vision panel', ar: LEAF, leaves: 1, features: [F(0.3, 0.1, 0.7, 0.26, 'glass')] },
]
const FRENCH: DoorStyle[] = [
  { id: 'one-light', name: 'One light each', words: 'one light to each leaf', ar: 0.71, leaves: 2, features: [F(0.14, 0.06, 0.86, 0.94, 'glass')] },
  { id: 'six-lights', name: 'Six lights each', words: 'six lights to each leaf', ar: 0.71, leaves: 2, features: grid(2, [[0.06, 0.33], [0.36, 0.64], [0.67, 0.94]], 'glass', 0.14, 0.05) },
  { id: 'ten-lights', name: 'Ten lights each (cottage)', words: 'ten lights to each leaf', ar: 0.71, leaves: 2, features: grid(2, [[0.06, 0.2], [0.23, 0.37], [0.4, 0.54], [0.57, 0.71], [0.74, 0.88]], 'glass', 0.14, 0.05) },
  { id: 'glazed-top', name: 'Glazed top, solid panel below', words: 'glazed upper lights over solid lower panels', ar: 0.71, leaves: 2, features: [F(0.14, 0.06, 0.86, 0.62, 'glass'), F(0.14, 0.68, 0.86, 0.94, 'panel')] },
]
const BIFOLD: DoorStyle[] = [
  { id: 'bifold-2', name: '2 panels', words: 'two-panel', ar: 1800 / 2100, w: 1800, h: 2100, leaves: 1, panels: 2, features: panelsAcross(2) },
  { id: 'bifold-3', name: '3 panels', words: 'three-panel', ar: 2400 / 2100, w: 2400, h: 2100, leaves: 1, panels: 3, features: panelsAcross(3) },
  { id: 'bifold-4', name: '4 panels', words: 'four-panel', ar: 3000 / 2100, w: 3000, h: 2100, leaves: 1, panels: 4, features: panelsAcross(4) },
  { id: 'bifold-5', name: '5 panels', words: 'five-panel', ar: 3600 / 2100, w: 3600, h: 2100, leaves: 1, panels: 5, features: panelsAcross(5) },
  { id: 'bifold-6', name: '6 panels', words: 'six-panel', ar: 4200 / 2100, w: 4200, h: 2100, leaves: 1, panels: 6, features: panelsAcross(6) },
]
const SLIDING: DoorStyle[] = [
  { id: 'slide-2', name: 'Two panels', words: 'two-panel', ar: 1800 / 2100, w: 1800, h: 2100, leaves: 1, features: panelsAcross(2, 0.03) },
  { id: 'slide-2-wide', name: 'Two panels, wide', words: 'two-panel wide', ar: 2400 / 2100, w: 2400, h: 2100, leaves: 1, features: panelsAcross(2, 0.03) },
  { id: 'slide-3', name: 'Three panels', words: 'three-panel', ar: 3000 / 2100, w: 3000, h: 2100, leaves: 1, features: panelsAcross(3, 0.03) },
]
const GARAGE: DoorStyle[] = [
  { id: 'sectional', name: 'Sectional, 4 panels', words: 'sectional', ar: 1.14, w: 2400, h: 2100, leaves: 1, features: bands(4) },
  { id: 'sectional-glazed', name: 'Sectional, glazed top', words: 'sectional with a glazed top panel', ar: 1.14, w: 2400, h: 2100, leaves: 1, features: [...bands(4).slice(1), F(0.05, 0.04, 0.95, 0.225, 'glass')] },
  { id: 'up-and-over', name: 'Up-and-over, plain', words: 'up-and-over', ar: 1.14, w: 2400, h: 2100, leaves: 1, features: [F(0.06, 0.06, 0.94, 0.94, 'panel')] },
  { id: 'roller', name: 'Roller shutter', words: 'roller shutter', ar: 1.14, w: 2400, h: 2100, leaves: 1, features: [F(0.05, 0.05, 0.95, 0.95, 'louvre')] },
  { id: 'side-hinged', name: 'Side-hinged pair', words: 'side-hinged, two leaves', ar: 1.14, w: 2400, h: 2100, leaves: 2, features: [F(0.1, 0.07, 0.9, 0.93, 'panel')] },
]
const INT_SINGLE: DoorStyle[] = [
  { id: 'flush', name: 'Flush', words: 'flush', ar: 0.4, leaves: 1, features: [] },
  { id: 'shaker', name: 'Two-panel (shaker)', words: 'two-panel shaker', ar: 0.4, leaves: 1, features: [F(0.17, 0.08, 0.83, 0.46, 'panel'), F(0.17, 0.54, 0.83, 0.92, 'panel')] },
  { id: 'four-panel', name: 'Four-panel', words: 'four-panel', ar: 0.4, leaves: 1, features: grid(2, [[0.07, 0.4], [0.47, 0.93]], 'panel', 0.16) },
  { id: 'six-panel', name: 'Six-panel', words: 'six-panel', ar: 0.4, leaves: 1, features: grid(2, [[0.07, 0.28], [0.34, 0.58], [0.64, 0.93]], 'panel', 0.16) },
  { id: 'glazed-1', name: 'Glazed, one light', words: 'glazed with one light', ar: 0.4, leaves: 1, features: [F(0.17, 0.08, 0.83, 0.62, 'glass'), F(0.17, 0.68, 0.83, 0.92, 'panel')] },
  { id: 'glazed-15', name: 'Glazed, 15 lights', words: 'glazed with fifteen lights', ar: 0.4, leaves: 1, features: grid(3, [[0.07, 0.18], [0.21, 0.32], [0.35, 0.46], [0.49, 0.6], [0.63, 0.74]], 'glass', 0.15, 0.04) },
  { id: 'louvre', name: 'Louvred', words: 'louvred', ar: 0.4, leaves: 1, features: [F(0.17, 0.08, 0.83, 0.92, 'louvre')] },
]
const INT_FIRE: DoorStyle[] = [
  { id: 'flush', name: 'Flush', words: 'flush', ar: 0.4, leaves: 1, features: [] },
  { id: 'vision-panel', name: 'With a vision panel', words: 'with a fire-rated vision panel', ar: 0.4, leaves: 1, features: [F(0.3, 0.18, 0.7, 0.44, 'glass')] },
  { id: 'glazed', name: 'Glazed, fire-rated', words: 'with fire-rated glazing', ar: 0.4, leaves: 1, features: [F(0.17, 0.08, 0.83, 0.7, 'glass')] },
]
const INT_DOUBLE: DoorStyle[] = [
  { id: 'flush', name: 'Flush pair', words: 'flush leaves', ar: 0.7, leaves: 2, features: [] },
  { id: 'four-panel', name: 'Four-panel pair', words: 'four-panel leaves', ar: 0.7, leaves: 2, features: grid(1, [[0.07, 0.4], [0.47, 0.93]], 'panel', 0.16) },
  { id: 'glazed-1', name: 'Glazed pair, one light each', words: 'glazed, one light to each leaf', ar: 0.7, leaves: 2, features: [F(0.17, 0.08, 0.83, 0.62, 'glass'), F(0.17, 0.68, 0.83, 0.92, 'panel')] },
  { id: 'glazed-10', name: 'Glazed pair, ten lights', words: 'glazed, ten lights to each leaf', ar: 0.7, leaves: 2, features: grid(2, [[0.07, 0.2], [0.23, 0.36], [0.39, 0.52], [0.55, 0.68], [0.71, 0.84]], 'glass', 0.15, 0.05) },
]

export const DOOR_STYLES: Record<DoorKind, DoorStyle[]> = {
  'door-front': FRONT, 'door-composite': FRONT, 'door-security': SECURITY, 'door-back': BACK, 'door-french': FRENCH, 'door-bifold': BIFOLD, 'door-sliding': SLIDING, 'door-garage': GARAGE,
  'door-int-single': INT_SINGLE, 'door-int-pocket': INT_SINGLE, 'door-int-fire': INT_FIRE, 'door-int-double': INT_DOUBLE,
}

/** the style each kind of door starts on */
export const DEFAULT_DOOR_STYLE: Record<DoorKind, string> = {
  'door-front': 'six-panel', 'door-composite': 'six-panel', 'door-security': 'solid', 'door-back': 'half-glazed', 'door-french': 'one-light', 'door-bifold': 'bifold-4', 'door-sliding': 'slide-2', 'door-garage': 'sectional',
  'door-int-single': 'flush', 'door-int-pocket': 'flush', 'door-int-fire': 'flush', 'door-int-double': 'flush',
}

/** the materials a door can be made in, first is the start (the calculator prices aluminium, timber and the rest by its sample factors) */
export const DOOR_MATERIALS: Record<DoorKind, WdMaterial[]> = {
  'door-front': ['composite', 'upvc', 'timber', 'aluminium'], 'door-composite': ['composite'], 'door-security': ['steel', 'composite'], 'door-back': ['upvc', 'composite', 'timber', 'aluminium'],
  'door-french': ['upvc', 'timber', 'aluminium'], 'door-bifold': ['aluminium', 'upvc', 'timber'], 'door-sliding': ['upvc', 'aluminium'], 'door-garage': ['aluminium', 'steel', 'timber'],
  'door-int-single': ['timber'], 'door-int-pocket': ['timber'], 'door-int-fire': ['timber'], 'door-int-double': ['timber'],
}

export interface Swatch { id: string; name: string; hex: string }
/** colours of an external door */
export const DOOR_COLOURS: Swatch[] = [
  { id: 'white', name: 'White', hex: '#f3f2ee' },
  { id: 'cream', name: 'Cream', hex: '#e6dcc0' },
  { id: 'black', name: 'Black', hex: '#1e1e1e' },
  { id: 'anthracite', name: 'Anthracite grey', hex: '#3d4247' },
  { id: 'green', name: 'Racing green', hex: '#1f4a35' },
  { id: 'blue', name: 'Midnight blue', hex: '#1f3555' },
  { id: 'red', name: 'Burgundy', hex: '#6a1f2a' },
  { id: 'oak', name: 'Golden oak', hex: '#9a6a3c' },
]
/** finishes of an internal door */
export const INTERNAL_FINISHES: Swatch[] = [
  { id: 'primed', name: 'White primed', hex: '#f3f2ee' },
  { id: 'oak', name: 'Natural oak', hex: '#c89f6b' },
  { id: 'walnut', name: 'Walnut', hex: '#6b4a32' },
  { id: 'black', name: 'Black', hex: '#1e1e1e' },
  { id: 'grey', name: 'Grey', hex: '#8a8f94' },
]

export const doorStylesFor = (kind: string): DoorStyle[] => (isDoorKind(kind) ? DOOR_STYLES[kind] : [])
export const doorStyleById = (kind: string, id: string | undefined): DoorStyle | undefined => (id ? doorStylesFor(kind).find(s => s.id === id) : undefined)
export const doorStyleOrDefault = (kind: string, id: string | undefined): DoorStyle | undefined =>
  doorStyleById(kind, id) ?? doorStyleById(kind, isDoorKind(kind) ? DEFAULT_DOOR_STYLE[kind] : undefined)
export const doorSwatches = (kind: string): Swatch[] => (isInternalDoorKind(kind) ? INTERNAL_FINISHES : DOOR_COLOURS)
export type { OpeningKind }
