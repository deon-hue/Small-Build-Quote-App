// Drainage for a flat roof — gutters, downpipes, and the outlets through a parapet — kept apart from the roof
// covering. Given the edges (which of them are set as a gutter or a parapet), the number of downpipes and
// their drop, it works out what is wanted (metres of gutter and downpipe, brackets, stop ends, running
// outlets, unions, angles, shoes, hopper heads, parapet outlets), offers the material for each part from a
// choice of generic systems (uPVC half-round, uPVC square-line, aluminium, cast-iron effect), and turns the
// choices into quantities the calculator prices. Pure, so it can be tested.
//
// The products are GENERIC, not a make, and every rate is a SAMPLE rate — editable in the calculator's
// breakdown like every calculator here. A supplier's own range can replace them.

import type { FlatRoofEdges } from './assembly-calc'

export type DrainSystem = 'upvc-hr' | 'upvc-sq' | 'alu' | 'cast'
export const DRAIN_SYSTEM_LABEL: Record<DrainSystem, string> = {
  'upvc-hr': 'uPVC half-round',
  'upvc-sq': 'uPVC square-line',
  'alu':     'Aluminium',
  'cast':    'Cast-iron effect (aluminium)',
}
/** How the gutter is named in the customer's description. */
export const DRAIN_SYSTEM_DESCRIPTION: Record<DrainSystem, string> = {
  'upvc-hr': 'uPVC half-round',
  'upvc-sq': 'uPVC square-line',
  'alu':     'aluminium',
  'cast':    'cast-iron-effect',
}
export const DRAIN_SYSTEMS = Object.keys(DRAIN_SYSTEM_LABEL) as DrainSystem[]

export type DrainSlotId =
  | 'gutter' | 'gutter_bracket' | 'stop_end' | 'running_outlet' | 'union' | 'angle'
  | 'downpipe' | 'pipe_clip' | 'shoe' | 'offset'
  | 'hopper' | 'parapet_outlet' | 'overflow_outlet'

export const NONE = 'none'

export interface DrainProduct {
  code: string
  slot: DrainSlotId
  /** The system it belongs to; none for the outlets through a parapet, which suit any system. */
  system?: DrainSystem
  name: string
  /** 'length' — sold in lengths of `packLm`; 'lm' — by the metre; 'nr' — each. */
  unit: 'length' | 'lm' | 'nr'
  packLm?: number
  /** Sample rate per length / metre / each, ex VAT. */
  rate: number
}

// One row per part; the four numbers are the rate for uPVC half-round, uPVC square-line, aluminium, cast-iron effect.
const SYSTEM_PARTS: {
  slot: DrainSlotId; label: string; unit: DrainProduct['unit']; packLm?: number[]
  names: [string, string, string, string]; rates: [number, number, number, number]
}[] = [
  { slot: 'gutter', label: 'gutter', unit: 'length', packLm: [4, 4, 3, 3],
    names: ['uPVC half-round gutter 112mm', 'uPVC square-line gutter 114mm', 'Aluminium half-round gutter 115mm', 'Cast-iron effect (aluminium) ogee gutter 125mm'],
    rates: [8.0, 10.5, 30.0, 45.0] },
  { slot: 'gutter_bracket', label: 'gutter bracket', unit: 'nr',
    names: ['uPVC half-round gutter bracket', 'uPVC square-line gutter bracket', 'Aluminium gutter bracket', 'Cast-iron effect gutter bracket'],
    rates: [1.1, 1.3, 3.5, 6.5] },
  { slot: 'stop_end', label: 'stop end', unit: 'nr',
    names: ['uPVC half-round stop end', 'uPVC square-line stop end', 'Aluminium stop end', 'Cast-iron effect stop end'],
    rates: [2.2, 2.6, 6.0, 9.0] },
  { slot: 'running_outlet', label: 'running outlet', unit: 'nr',
    names: ['uPVC half-round running outlet 68mm', 'uPVC square-line running outlet 65mm', 'Aluminium running outlet 63mm', 'Cast-iron effect running outlet 75mm'],
    rates: [4.5, 5.2, 14.0, 22.0] },
  { slot: 'union', label: 'union', unit: 'nr',
    names: ['uPVC half-round union bracket', 'uPVC square-line union bracket', 'Aluminium union bracket', 'Cast-iron effect union bracket'],
    rates: [3.2, 3.6, 8.0, 14.0] },
  { slot: 'angle', label: 'gutter angle', unit: 'nr',
    names: ['uPVC half-round 90° angle', 'uPVC square-line 90° angle', 'Aluminium 90° angle', 'Cast-iron effect 90° angle'],
    rates: [4.8, 5.5, 14.0, 22.0] },
  { slot: 'downpipe', label: 'downpipe', unit: 'length', packLm: [2.5, 2.5, 2.5, 2.5],
    names: ['uPVC round downpipe 68mm', 'uPVC square downpipe 65mm', 'Aluminium round downpipe 63mm', 'Cast-iron effect (aluminium) downpipe 75mm'],
    rates: [9.5, 11.0, 26.0, 38.0] },
  { slot: 'pipe_clip', label: 'downpipe clip', unit: 'nr',
    names: ['uPVC round pipe clip', 'uPVC square pipe clip', 'Aluminium pipe clip', 'Cast-iron effect pipe clip'],
    rates: [1.6, 1.9, 4.5, 7.0] },
  { slot: 'shoe', label: 'shoe', unit: 'nr',
    names: ['uPVC round shoe', 'uPVC square shoe', 'Aluminium shoe', 'Cast-iron effect shoe'],
    rates: [2.2, 2.5, 7.0, 12.0] },
  { slot: 'offset', label: 'offset', unit: 'nr',
    names: ['uPVC round offset (swan neck)', 'uPVC square offset', 'Aluminium offset', 'Cast-iron effect offset'],
    rates: [5.5, 6.5, 16.0, 24.0] },
  { slot: 'hopper', label: 'hopper head', unit: 'nr',
    names: ['uPVC rainwater hopper head', 'uPVC square rainwater hopper head', 'Aluminium rainwater hopper head', 'Cast-iron effect hopper head'],
    rates: [14.0, 16.0, 42.0, 65.0] },
]

const codeOf = (slot: DrainSlotId, system: DrainSystem) => `${slot.toUpperCase().replace(/_/g, '-')}-${system.toUpperCase()}`

export const DRAIN_PRODUCTS: DrainProduct[] = [
  ...SYSTEM_PARTS.flatMap(part => DRAIN_SYSTEMS.map((system, i): DrainProduct => ({
    code: codeOf(part.slot, system), slot: part.slot, system, name: part.names[i],
    unit: part.unit, packLm: part.packLm?.[i], rate: part.rates[i],
  }))),
  { code: 'OUTLET-FLANGED', slot: 'parapet_outlet', name: 'Rainwater outlet through the parapet (with membrane flange)', unit: 'nr', rate: 48.0 },
  { code: 'OUTLET-SCUPPER', slot: 'parapet_outlet', name: 'Aluminium scupper outlet through the parapet (with downpipe adaptor)', unit: 'nr', rate: 75.0 },
  { code: 'OVERFLOW-PIPE', slot: 'overflow_outlet', name: 'Overflow outlet through the parapet (pipe)', unit: 'nr', rate: 36.0 },
  { code: 'OVERFLOW-SCUPPER', slot: 'overflow_outlet', name: 'Aluminium scupper overflow through the parapet', unit: 'nr', rate: 60.0 },
]

export function drainProduct(code: string): DrainProduct | undefined {
  return DRAIN_PRODUCTS.find(p => p.code === code)
}

export interface DrainSlotDef {
  id: DrainSlotId
  label: string
  where: string
}
export const DRAIN_SLOTS: DrainSlotDef[] = [
  { id: 'gutter', label: 'Gutter', where: 'Along the edges set as a gutter' },
  { id: 'gutter_bracket', label: 'Gutter brackets', where: 'At 1m centres along each run' },
  { id: 'stop_end', label: 'Stop ends', where: 'Two to each run of gutter' },
  { id: 'running_outlet', label: 'Running outlets', where: 'Where a downpipe leaves the gutter' },
  { id: 'union', label: 'Union joints', where: 'Joining the gutter lengths' },
  { id: 'angle', label: 'Gutter angles', where: 'Where two gutter edges meet at a corner' },
  { id: 'hopper', label: 'Hopper heads', where: 'Under each rainwater outlet through a parapet' },
  { id: 'parapet_outlet', label: 'Rainwater outlets through the parapet', where: 'Placed on the plan' },
  { id: 'overflow_outlet', label: 'Overflow outlets through the parapet', where: 'Placed on the plan' },
  { id: 'downpipe', label: 'Downpipes', where: 'The number of downpipes, each dropping the height entered' },
  { id: 'pipe_clip', label: 'Downpipe clips', where: 'About every 1.8m down each pipe' },
  { id: 'shoe', label: 'Shoes', where: 'At the foot of each downpipe' },
  { id: 'offset', label: 'Offsets', where: 'Where a downpipe steps out round an overhang' },
]

/** Products offered for a part: every make of it, whichever system is chosen (so one part can differ). */
export function drainOptions(slot: DrainSlotId): DrainProduct[] {
  return DRAIN_PRODUCTS.filter(p => p.slot === slot)
}

/** What a part starts with for a system: that system's product. The outlets through a parapet have their own
 * default, and offsets start off (a plain drop needs none). */
export function defaultDrainPick(system: DrainSystem, slot: DrainSlotId): string {
  if (slot === 'offset') return NONE
  if (slot === 'parapet_outlet') return 'OUTLET-FLANGED'
  if (slot === 'overflow_outlet') return 'OVERFLOW-PIPE'
  return codeOf(slot, system)
}

// ── What the roof needs ─────────────────────────────────────────────────────────

export interface DrainRoofInput {
  edges: FlatRoofEdges
  lengthMm: number
  widthMm: number
  /** Downpipes in all — from the gutter and from parapet outlets. */
  downpipes: number
  /** How far each downpipe drops, metres. */
  dropM: number
  gullyCount: number
  overflowCount: number
}

const CORNERS: [keyof FlatRoofEdges, keyof FlatRoofEdges][] = [['high', 'left'], ['high', 'right'], ['low', 'left'], ['low', 'right']]
export const BRACKET_CENTRES_M = 1.0
export const CLIP_CENTRES_M = 1.8

export interface DrainQuantities {
  /** Length of each edge set as a gutter, metres. */
  gutterEdgesM: number[]
  gutterLm: number
  /** Continuous runs of gutter (edges that meet at a corner run on as one). */
  runs: number
  corners: number
  brackets: number
  stopEnds: number
  runningOutlets: number
  downpipeLm: number
  clips: number
  shoes: number
  hoppers: number
  parapetOutlets: number
  overflowOutlets: number
}

export function drainQuantities(r: DrainRoofInput): DrainQuantities {
  const len: Record<keyof FlatRoofEdges, number> = { high: r.lengthMm / 1000, low: r.lengthMm / 1000, left: r.widthMm / 1000, right: r.widthMm / 1000 }
  const gutterKeys = (Object.keys(len) as (keyof FlatRoofEdges)[]).filter(k => r.edges[k] === 'gutter')
  const gutterEdgesM = gutterKeys.map(k => len[k])
  const gutterLm = +gutterEdgesM.reduce((s, x) => s + x, 0).toFixed(3)
  const corners = CORNERS.filter(([a, b]) => r.edges[a] === 'gutter' && r.edges[b] === 'gutter').length
  const runs = Math.max(0, gutterKeys.length - corners)
  const T = Math.max(0, Math.floor(r.downpipes))
  const runningOutlets = gutterKeys.length > 0 ? Math.min(T, Math.max(1, T - r.gullyCount)) : 0
  const perPipeClips = Math.ceil(r.dropM / CLIP_CENTRES_M - 1e-9)
  return {
    gutterEdgesM, gutterLm, runs, corners,
    brackets: gutterEdgesM.reduce((s, m) => s + Math.ceil(m / BRACKET_CENTRES_M - 1e-9) + 1, 0),
    stopEnds: 2 * runs,
    runningOutlets,
    downpipeLm: +(T * r.dropM).toFixed(3),
    clips: T * perPipeClips,
    shoes: T,
    hoppers: r.gullyCount,
    parapetOutlets: r.gullyCount,
    overflowOutlets: r.overflowCount,
  }
}

// ── The choices, turned into what to buy ────────────────────────────────────────

export interface DrainExtra { id: string; code: string; qty: number }

export interface DrainLine {
  /** A stable id for the priced line, so its rate can be edited. */
  id: string
  name: string
  where: string
  product: DrainProduct
  /** Metres or numbers needed, before waste. */
  qty: number
}

/** The drainage the choices come to: one line per part that has something chosen and something to supply, plus the
 * extras added by hand. A pick that isn't offered for the part falls back to the system's product. */
export function resolveDrainage(
  r: DrainRoofInput, system: DrainSystem, picks: Partial<Record<DrainSlotId, string>>, extras: DrainExtra[],
): { lines: DrainLine[]; picks: Record<DrainSlotId, string>; quantities: DrainQuantities; warnings: string[] } {
  const q = drainQuantities(r)
  const resolved = {} as Record<DrainSlotId, string>
  for (const slot of DRAIN_SLOTS) {
    const p = picks[slot.id]
    resolved[slot.id] = p === NONE || (p !== undefined && drainOptions(slot.id).some(o => o.code === p)) ? p : defaultDrainPick(system, slot.id)
  }
  // Unions depend on how long a length of the chosen gutter is.
  const gutterProduct = drainProduct(resolved.gutter)
  const pack = gutterProduct?.packLm ?? 4
  const unions = q.gutterEdgesM.reduce((s, m) => s + Math.max(0, Math.ceil(m / pack - 1e-9) - 1), 0)
  const qty: Record<DrainSlotId, number> = {
    gutter: q.gutterLm, gutter_bracket: q.brackets, stop_end: q.stopEnds, running_outlet: q.runningOutlets, union: unions,
    angle: q.corners, hopper: q.hoppers, parapet_outlet: q.parapetOutlets, overflow_outlet: q.overflowOutlets,
    downpipe: q.downpipeLm, pipe_clip: q.clips, shoe: q.shoes, offset: Math.max(0, Math.floor(r.downpipes)),
  }
  const lines: DrainLine[] = []
  // Downpipes and their fittings only mean something when there's a gutter or a parapet outlet to feed them.
  const somethingToDrain = q.gutterLm > 0 || r.gullyCount > 0
  for (const slot of DRAIN_SLOTS) {
    const code = resolved[slot.id]
    if (code === NONE || !somethingToDrain) continue
    const product = drainProduct(code)
    if (!product || !(qty[slot.id] > 0)) continue
    lines.push({ id: `drain_${slot.id}_${code}`, name: `${product.name}`, where: slot.where, product, qty: qty[slot.id] })
  }
  for (const e of extras) {
    const product = drainProduct(e.code)
    if (!product || !(e.qty > 0)) continue
    lines.push({ id: `drain_extra_${e.id}`, name: `${product.name} — added by hand`, where: 'Added by hand', product, qty: e.qty })
  }
  const warnings: string[] = []
  if (q.gutterLm > 0 && Math.floor(r.downpipes) < 1) warnings.push('A gutter needs at least one downpipe to take the water away.')
  if (q.gutterLm > 0 && resolved.gutter === NONE) warnings.push('An edge is set as a gutter but no gutter is chosen.')
  return { lines, picks: resolved, quantities: q, warnings }
}
