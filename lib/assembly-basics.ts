// What the AI quote can hand to an assembly calculator: the few sizes the scope states (in metres, as the AI heard them), checked here and turned
// into millimetres. Each calculator that can be priced from its basics says which sizes it must have; with fewer, it stays "Not yet calculated" and
// the estimator opens the calculator to size it. Never guessed: a size the scope doesn't state is simply left out and the calculator's own standard
// figure (the one its screen opens with) is used. Pure, so it can be tested; no runtime imports from components.

export interface AssemblyBasics {
  lengthMm?: number
  widthMm?: number
  heightMm?: number
  depthMm?: number
  count?: number
}

export type BasicsKey = keyof AssemblyBasics

/** Sane limits, so a mis-heard "2400" for "2.4" or a negative size doesn't become a price. Metres (count: a whole number). */
const LIMITS: Record<Exclude<BasicsKey, 'count'>, { json: string; min: number; max: number }> = {
  lengthMm: { json: 'lengthM', min: 0.3, max: 200 },
  widthMm: { json: 'widthM', min: 0.2, max: 100 },
  heightMm: { json: 'heightM', min: 0.3, max: 12 },
  depthMm: { json: 'depthM', min: 0.2, max: 30 },
}

/** The sizes the AI gave, each one validated; a size that is missing or doesn't make sense is left out. */
export function parseAiMeasurements(m: unknown): AssemblyBasics {
  const out: AssemblyBasics = {}
  if (!m || typeof m !== 'object') return out
  const o = m as Record<string, unknown>
  for (const key of Object.keys(LIMITS) as Exclude<BasicsKey, 'count'>[]) {
    const lim = LIMITS[key]
    const raw = o[lim.json]
    if (raw === null || raw === undefined || raw === '') continue
    const v = Number(raw)
    if (Number.isFinite(v) && v >= lim.min && v <= lim.max) out[key] = Math.round(v * 1000)
  }
  const c = Number(o.count)
  if (o.count !== null && o.count !== undefined && o.count !== '' && Number.isFinite(c) && c >= 1 && c <= 500) out.count = Math.round(c)
  return out
}

interface BasicsNeed {
  /** every one of these must be stated for the calculator to be priced */
  required: BasicsKey[]
  /** what the AI is told to look for in the scope, for the prompt */
  ask: string
}

/** By Back Office canonical id. A calculator not listed here is never priced by the AI quote (it is opened and sized by hand). */
export const BASICS_NEEDS: Record<string, BasicsNeed> = {
  'ew-cav-partial': { required: ['lengthMm', 'heightMm'], ask: 'the wall length and height: "measurements": {"lengthM": ..., "heightM": ...}' },
  'ew-cav-full': { required: ['lengthMm', 'heightMm'], ask: 'the wall length and height: "measurements": {"lengthM": ..., "heightM": ...}' },
  'fnd-strip': { required: ['lengthMm'], ask: 'the total length of foundation: "measurements": {"lengthM": ...}, and the trench "widthM" and "depthM" only if stated' },
  'fnd-trench-fill': { required: ['lengthMm'], ask: 'the total length of foundation: "measurements": {"lengthM": ...}, and the trench "widthM" and "depthM" only if stated' },
  'fnd-raft': { required: ['lengthMm', 'widthMm'], ask: 'the raft length and width: "measurements": {"lengthM": ..., "widthM": ...}' },
  'fnd-pad': { required: ['count'], ask: 'how many pads: "measurements": {"count": ...}, and the pad "lengthM", "widthM" (plan size) and "depthM" (thickness) only if stated' },
  'fnd-piled': { required: ['lengthMm'], ask: 'the length of ground beam on piles: "measurements": {"lengthM": ...}, and the number of piles "count" and pile "depthM" only if stated' },
  'fnd-underpin': { required: ['lengthMm'], ask: 'the length of wall to underpin: "measurements": {"lengthM": ...}, and how much deeper "depthM" only if stated' },
}

/** The checked sizes for a calculator, or null when it cannot be priced from basics or a required size is missing. */
export function basicsFor(canonicalId: string | null | undefined, measurements: unknown): AssemblyBasics | null {
  const need = canonicalId ? BASICS_NEEDS[canonicalId] : undefined
  if (!need) return null
  const b = parseAiMeasurements(measurements)
  return need.required.every(k => b[k] !== undefined) ? b : null
}

/** "10.0 m long, 0.9 m deep" — the sizes used, for the note on the quote. */
export function describeBasics(b: AssemblyBasics): string {
  const m = (mm: number) => `${(mm / 1000).toFixed(2).replace(/\.?0+$/, '')} m`
  const parts: string[] = []
  if (b.count !== undefined) parts.push(`${b.count} ${b.count === 1 ? 'item' : 'items'}`)
  if (b.lengthMm !== undefined) parts.push(`${m(b.lengthMm)} long`)
  if (b.widthMm !== undefined) parts.push(`${m(b.widthMm)} wide`)
  if (b.heightMm !== undefined) parts.push(`${m(b.heightMm)} high`)
  if (b.depthMm !== undefined) parts.push(`${m(b.depthMm)} deep`)
  return parts.join(', ')
}
