// A first draft of a quote's scope of works, written from a take-off: the phases in building order, and under each what is being built, with the sizes measured on the plan.
// No AI and no cost: it only re-words what the take-off already holds. A line priced by a calculator is the calculator's own plain-English description (so the scope and the quote say the same thing);
// anything else is its name, specification and quantity. It is a start for the estimator to edit, not a finished document.
//
// The text uses the scope format (lib/scope-format.ts): **bold** headings and "- " bullets.

import { TAKEOFF_PHASES } from './takeoff-types'

/** The part of a take-off item the scope needs. TakeoffItem satisfies it. */
export interface ScopeItem {
  id: string
  name: string
  phase: string
  subPhase?: string
  spec?: string
  roomName?: string
  qty: number
  unit: string
  length?: number
  area?: number
  wallHeight?: number
  floorMakeupId?: string
  notEstimated?: boolean
  /** items that only hold what was placed on the plan: with no price from a calculator there is nothing to say */
  plumbSummary?: boolean
  electricsSummary?: boolean
  boilerSummary?: boolean
  drainSummary?: boolean
  wdSummary?: boolean
  assemblyResult?: { name?: string; location?: string; description?: string }
}

export interface ScopeInput {
  items: ScopeItem[]
  jobType?: string
  address?: string
  /** the name of a build-up (wall, floor, roof type) from its id, when the caller can look it up */
  makeupName?: (id: string) => string | undefined
}

const isSummaryOnly = (it: ScopeItem) => !!(it.plumbSummary || it.electricsSummary || it.boilerSummary || it.drainSummary || it.wdSummary)

/** 12 → "12", 12.4 → "12.4", 3.456 → "3.46", 120.04 → "120": enough figures to read, no more */
export function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return ''
  const d = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : 2
  return String(parseFloat(n.toFixed(d)))
}

const sentence = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return !t ? '' : /[.!?]$/.test(t) ? t : t + '.' }
const UNIT_WORD: Record<string, string> = { 'm': 'm', 'lm': 'm', 'm2': 'm²', 'm²': 'm²', 'm3': 'm³', 'm³': 'm³' }

/** One line of the scope. Lines with the same `key` are joined into one, with their `sum`s added. */
interface Bullet {
  key: string
  text: string
  count: number
  sum?: number
  /** a calculator's own sentence: the first "N.NNm long" in it is the length to add up */
  calc?: boolean
  /** a plain line: its words without the size, and how to word the size for a total */
  head?: string
  sizeOf?: (total: number, many: boolean) => string
}

/** What one item contributes: its calculator description, or its name and specification with the size measured */
function bulletFor(it: ScopeItem, makeupName?: (id: string) => string | undefined): Bullet | null {
  const room = (it.assemblyResult?.location || it.roomName || '').trim()
  const desc = (it.assemblyResult?.description || '').trim()
  if (desc) {
    const text = sentence(room && !desc.toLowerCase().includes(room.toLowerCase()) ? `${room}: ${desc}` : desc)
    // two walls described the same way but for their length are one line with the lengths added
    const m = /(\d+(?:\.\d+)?)m long/.exec(text)
    return m
      ? { key: 'calc|' + text.replace(m[0], '#m long'), text, count: 1, sum: parseFloat(m[1]), calc: true }
      : { key: 'calc|' + text, text, count: 1, calc: true }
  }
  if (isSummaryOnly(it)) return null

  const label = ((it.floorMakeupId && makeupName?.(it.floorMakeupId)) || it.name || '').trim() || it.phase
  const spec = (it.spec || '').trim()
  const isWall = (it.phase === 'External Walls' || it.phase === 'Internal Walls & Partitions') && (it.length ?? 0) > 0
  const unit = UNIT_WORD[(it.unit || '').toLowerCase()]
  const h = (it.wallHeight ?? 0) > 0 ? it.wallHeight! : 0
  let sum: number | undefined
  let sizeOf: Bullet['sizeOf']
  if (isWall) {
    sum = it.length
    sizeOf = (t, many) => `about ${fmtQty(t)} m long${h ? ` × ${fmtQty(h)} m high` : ''}${many ? ' in total' : ''}`
  } else if (unit && it.qty > 0) {
    sum = it.qty
    sizeOf = (t, many) => `about ${fmtQty(t)} ${unit}${many ? ' in total' : ''}`
  } else if (it.qty > 0 && (it.unit === 'nr' || it.unit === 'no')) {
    sum = it.qty
    sizeOf = t => `${fmtQty(t)} no.`
  }
  const lead = room ? `${room}: ` : ''
  const head = lead + (spec && !label.toLowerCase().includes(spec.toLowerCase()) ? `${label}, ${spec}` : label)
  const text = sizeOf && sum !== undefined ? `${head} (${sizeOf(sum, false)})` : head
  return { key: `plain|${head}|${isWall ? 'wall' + h : unit || it.unit}`, text, count: 1, sum, head, sizeOf }
}

/** The lines of one phase with identical ones joined: a wall drawn as four sides becomes one line with the four lengths added */
function joined(bullets: Bullet[]): string[] {
  const byKey = new Map<string, Bullet>()
  const order: Bullet[] = []
  for (const b of bullets) {
    const have = byKey.get(b.key)
    if (!have) { const c = { ...b }; byKey.set(b.key, c); order.push(c); continue }
    have.count += 1
    if (have.sum !== undefined && b.sum !== undefined) have.sum += b.sum
  }
  return order.map(b => {
    if (b.count === 1) return b.text
    if (b.calc && b.sum !== undefined) return b.text.replace(/(\d+(?:\.\d+)?)m long/, `${b.sum.toFixed(2)}m long in total (${b.count} lengths)`)
    if (!b.calc && b.sum !== undefined && b.sizeOf && b.head) return `${b.head} (${b.sizeOf(b.sum, true)}, ${b.count} items)`
    return `${b.text} (× ${b.count})`
  })
}

/** The scope of works text, or '' when the take-off has nothing to describe. */
export function buildTakeoffScope(input: ScopeInput): string {
  const items = input.items.filter(it => !it.notEstimated)
  const order = (p: string) => { const i = (TAKEOFF_PHASES as readonly string[]).indexOf(p); return i === -1 ? TAKEOFF_PHASES.length : i }
  const phases: string[] = []
  for (const it of items) if (!phases.includes(it.phase)) phases.push(it.phase)
  phases.sort((a, b) => order(a) - order(b))   // phases that are not on the list keep the order they were drawn in, after the rest

  const sections: string[] = []
  for (const ph of phases) {
    const bullets = items.filter(it => it.phase === ph).map(it => bulletFor(it, input.makeupName)).filter((b): b is Bullet => !!b)
    const lines = joined(bullets).filter(Boolean)
    if (lines.length) sections.push([`**${ph}**`, ...lines.map(l => `- ${l}`)].join('\n'))
  }
  if (!sections.length) return ''

  const kind = (input.jobType || '').trim()
  const where = (input.address || '').trim()
  const overview = kind || where ? sentence(`${kind || 'Building works'}${where ? ` at ${where}` : ''}`) : 'Building works.'
  return [overview, ...sections].join('\n\n')
}
