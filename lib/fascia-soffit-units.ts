// Fascia, soffit and barge boards along a roof's edges (Roof → Fascias, Soffits & Barge Boards). Sized the
// same way every Roof-phase calculator is — from the drawn shape's bounding box (lengthMm/widthMm) — with
// each of the four edges set to what it is: an eaves edge (fascia and soffit board; the gutter is fixed to
// the fascia, already priced under Gutters & Downpipes), a verge/gable edge (a barge board), or neither (an
// existing wall, or nothing there). Lengths, corners and joints only, in the same Stage-1-simplified way the
// other roof modules are: a corner count doesn't distinguish which two edge types meet, only that a board
// run stops there — good enough for pricing, not a fixing detail. Reuses costLayer.

export type FasciaEdgeRole = 'eaves' | 'verge' | 'none'
export type EdgeKey = 'high' | 'low' | 'left' | 'right'
export interface FasciaEdges { high: FasciaEdgeRole; low: FasciaEdgeRole; left: FasciaEdgeRole; right: FasciaEdgeRole }

export interface FasciaSoffitInput {
  lengthMm: number
  widthMm: number
  edges: FasciaEdges
}

const CORNERS: [EdgeKey, EdgeKey][] = [['high', 'left'], ['high', 'right'], ['low', 'left'], ['low', 'right']]
const BOARD_LENGTH_M = 5   // a standard board length, for counting joints along a run

export interface FasciaSoffitGeometry {
  eavesLm: number
  vergeLm: number
  /** Corners where a board of either kind meets another (eaves-eaves, eaves-verge, or verge-verge) — each
   * takes a corner trim, whichever kind it is. */
  cornerCount: number
  /** Ends of a run that meet an edge with no board (an existing wall, or nothing there) — each takes an end cap. */
  eaveStopEnds: number
  vergeStopEnds: number
  /** Joints along the runs, from a standard board length. */
  eaveJoints: number
  vergeJoints: number
  warnings: string[]
}

export function calculateFasciaSoffitGeometry(input: FasciaSoffitInput): FasciaSoffitGeometry {
  const { lengthMm: L, widthMm: S, edges } = input
  if (!(L > 0) || !(S > 0)) throw new Error('The roof length and width must be greater than zero.')

  const edgeMm: Record<EdgeKey, number> = { high: L, low: L, left: S, right: S }
  const sumRole = (role: FasciaEdgeRole) =>
    (Object.keys(edges) as EdgeKey[]).filter(k => edges[k] === role).reduce((s, k) => s + edgeMm[k], 0)
  const eavesMm = sumRole('eaves'), vergeMm = sumRole('verge')

  // Corners: where two boarded edges meet (of any combination) they share a corner trim; where a boarded
  // edge meets one with nothing there, that end takes a cap instead.
  let cornerCount = 0, eaveStopEnds = 0, vergeStopEnds = 0
  for (const [a, b] of CORNERS) {
    const ra = edges[a], rb = edges[b]
    if (ra !== 'none' && rb !== 'none') { cornerCount++; continue }
    if (ra === 'eaves') eaveStopEnds++
    if (ra === 'verge') vergeStopEnds++
    if (rb === 'eaves') eaveStopEnds++
    if (rb === 'verge') vergeStopEnds++
  }

  // Joints: each boarded edge run in standard board lengths, one joint fewer than the number of boards
  // (a run needs no joint at its own two ends — those are a corner or a stop end instead).
  let eaveJoints = 0, vergeJoints = 0
  for (const k of Object.keys(edges) as EdgeKey[]) {
    const role = edges[k]
    if (role === 'none') continue
    const runLm = edgeMm[k] / 1000
    const j = Math.max(0, Math.ceil(runLm / BOARD_LENGTH_M) - 1)
    if (role === 'eaves') eaveJoints += j
    else vergeJoints += j
  }

  const warnings: string[] = []
  if (eavesMm === 0 && vergeMm === 0) warnings.push('No edge is set to eaves or verge — nothing is priced yet.')

  return {
    eavesLm: +(eavesMm / 1000).toFixed(3),
    vergeLm: +(vergeMm / 1000).toFixed(3),
    cornerCount, eaveStopEnds, vergeStopEnds, eaveJoints, vergeJoints,
    warnings,
  }
}

// ── Materials ────────────────────────────────────────────────────────────────────

export type BoardMaterial = 'upvc' | 'timber' | 'composite'
export const BOARD_MATERIAL_LABEL: Record<BoardMaterial, string> = {
  upvc: 'uPVC',
  timber: 'Timber, painted',
  composite: 'Composite (fibre cement)',
}
export type FasciaDepth = 175 | 225
export type SoffitWidth = 200 | 300 | 405

export interface FasciaSoffitChoice {
  fasciaMaterial: BoardMaterial
  fasciaDepthMm: FasciaDepth
  soffitMaterial: BoardMaterial
  soffitVented: boolean
  soffitWidthMm: SoffitWidth
  bargeMaterial: BoardMaterial
}

const FASCIA_RATE: Record<BoardMaterial, Record<FasciaDepth, number>> = {
  upvc:      { 175: 6.50, 225: 8.50 },
  timber:    { 175: 9.00, 225: 11.50 },
  composite: { 175: 12.00, 225: 15.00 },
}
const SOFFIT_RATE: Record<BoardMaterial, number> = { upvc: 5.50, timber: 8.00, composite: 11.00 }
const SOFFIT_VENTED_UPLIFT = 1.15
const BARGE_RATE: Record<BoardMaterial, number> = { upvc: 8.50, timber: 12.00, composite: 16.00 }
const CORNER_RATE = 9.50
const STOP_END_RATE = 4.20
const JOINT_RATE = 3.80
const SOFFIT_VENT_STRIP_RATE = 2.80   // per lm, only when vented

export interface FasciaSoffitMaterialLine { id: string; name: string; qty: number; unit: string; rate: number }

/** The board choices turned into priced lines, from the geometry worked out above. Corners, stop ends and
 * joints are shared between fascia and barge (whichever runs happen to be there), priced once each. */
export function resolveFasciaSoffitMaterials(g: FasciaSoffitGeometry, choice: FasciaSoffitChoice): FasciaSoffitMaterialLine[] {
  const lines: FasciaSoffitMaterialLine[] = []
  if (g.eavesLm > 0) {
    lines.push({ id: 'fascia', name: `${BOARD_MATERIAL_LABEL[choice.fasciaMaterial]} fascia board, ${choice.fasciaDepthMm}mm`, qty: g.eavesLm, unit: 'lm', rate: FASCIA_RATE[choice.fasciaMaterial][choice.fasciaDepthMm] })
    const soffitRate = +(SOFFIT_RATE[choice.soffitMaterial] * (choice.soffitVented ? SOFFIT_VENTED_UPLIFT : 1)).toFixed(2)
    lines.push({ id: 'soffit', name: `${BOARD_MATERIAL_LABEL[choice.soffitMaterial]} soffit board, ${choice.soffitWidthMm}mm${choice.soffitVented ? ', vented' : ''}`, qty: g.eavesLm, unit: 'lm', rate: soffitRate })
    if (choice.soffitVented) lines.push({ id: 'soffit_vent', name: 'Continuous soffit vent strip', qty: g.eavesLm, unit: 'lm', rate: SOFFIT_VENT_STRIP_RATE })
  }
  if (g.vergeLm > 0) {
    lines.push({ id: 'barge', name: `${BOARD_MATERIAL_LABEL[choice.bargeMaterial]} barge board`, qty: g.vergeLm, unit: 'lm', rate: BARGE_RATE[choice.bargeMaterial] })
  }
  if (g.cornerCount > 0) lines.push({ id: 'corners', name: 'Corner trims', qty: g.cornerCount, unit: 'nr', rate: CORNER_RATE })
  const stopEnds = g.eaveStopEnds + g.vergeStopEnds
  if (stopEnds > 0) lines.push({ id: 'stop_ends', name: 'End caps', qty: stopEnds, unit: 'nr', rate: STOP_END_RATE })
  const joints = g.eaveJoints + g.vergeJoints
  if (joints > 0) lines.push({ id: 'joints', name: 'Joint trims', qty: joints, unit: 'nr', rate: JOINT_RATE })
  return lines
}
