// Fabrication processes on a steel member, the way a steel merchant's beam calculator offers them: holes drilled in the web or flange, mitre cuts, notches, cleats, bearing stiffeners, splice plates, shot blasting and other
// fabrication by the hour. Each is priced as the fabricator's time at the fabrication rate (and a small amount of material where the process adds steel). Pure: no screen, no engine imports (the engine imports this).
// Every price and hour is a sample to check against a real fabricator's quote; the engineer approves the position and size of any hole, notch or splice.

export type ProcessKind = 'holes' | 'mitre' | 'notch' | 'cleat' | 'stiffener' | 'splice' | 'blast' | 'other'
export type ProcessSteel = 'beam' | 'column' | 'hollow'
export type HoleWhere = 'web' | 'flange'

/** One process on a member: how many (per member), and what it needs to be priced */
export interface MemberProcess {
  id: string
  kind: ProcessKind
  /** each: how many per member; holes: holes per member; other: hours per member; blast: ignored (the surface of the member) */
  count: number
  /** holes: the diameter, mm */
  diaMm?: number
  /** holes: in the web or the flange (a hollow section has neither: it is through the wall) */
  where?: HoleWhere
  /** mitre: the angle of the cut from square, degrees */
  angleDeg?: number
  /** other: a £ allowance for materials per member */
  material?: number
  /** a short note: what it is for (shown on the line and in the words) */
  note?: string
}

export interface ProcessInfo {
  id: ProcessKind
  label: string
  /** how it is counted */
  basis: 'each' | 'm2' | 'hours'
  unitWord: string
  /** the fabricator's hours for one (for a hole this is the web hole at 22mm; see holeHours) and the steel or fittings it adds, £ */
  hours: number
  material: number
  forKinds: ProcessSteel[]
  /** what it is, in a line */
  help: string
}

export const PROCESS_KINDS: ProcessInfo[] = [
  { id: 'holes', label: 'Holes drilled', basis: 'each', unitWord: 'hole', hours: 0.085, material: 0, forKinds: ['beam', 'column', 'hollow'], help: 'Holes for bolts or fixings, in the web or the flange.' },
  { id: 'mitre', label: 'Mitre cut', basis: 'each', unitWord: 'cut', hours: 0.3, material: 0, forKinds: ['beam', 'column', 'hollow'], help: 'An angled cut at an end, for a rafter or a corner joint. The length typed is the longest edge.' },
  { id: 'notch', label: 'Notch or cope', basis: 'each', unitWord: 'notch', hours: 0.6, material: 0, forKinds: ['beam'], help: 'The flange cut back so the beam sits into or against another beam.' },
  { id: 'cleat', label: 'Web cleat or fin plate (per end)', basis: 'each', unitWord: 'cleat', hours: 0.4, material: 22, forKinds: ['beam'], help: 'A small plate or angle welded on at a beam end to bolt it to a column or another beam.' },
  { id: 'stiffener', label: 'Bearing stiffener (a pair)', basis: 'each', unitWord: 'pair', hours: 0.5, material: 30, forKinds: ['beam'], help: 'Plates welded either side of the web where a heavy load or a post bears.' },
  { id: 'splice', label: 'Splice plate set (a bolted joint)', basis: 'each', unitWord: 'splice', hours: 0.8, material: 85, forKinds: ['beam', 'column'], help: 'Joins two lengths where a beam is longer than the bar or the lorry. Bolted plates each side of the web and flanges.' },
  { id: 'blast', label: 'Shot blast before painting', basis: 'm2', unitWord: 'm²', hours: 0.1, material: 2, forKinds: ['beam', 'column', 'hollow'], help: 'Cleaned to a bright finish before the primer or coating goes on. Priced by the surface of the member.' },
  { id: 'other', label: 'Other fabrication (by the hour)', basis: 'hours', unitWord: 'hour', hours: 1, material: 0, forKinds: ['beam', 'column', 'hollow'], help: 'Anything else the fabricator does: type the hours and, if there is steel or fittings, an allowance for them.' },
]
export const PROCESS_BY_ID: Record<string, ProcessInfo> = Object.fromEntries(PROCESS_KINDS.map(p => [p.id, p]))

export const HOLE_DIAMETERS = [14, 18, 22, 26, 33]
export const DEFAULT_HOLE_MM = 22
export const DEFAULT_MITRE_DEG = 45

/** The processes that can go on a kind of steel member */
export const processesFor = (kind: ProcessSteel): ProcessInfo[] => PROCESS_KINDS.filter(p => p.forKinds.includes(kind))

/** A new process of a kind with its usual values (4 holes of 22mm in the web, a 45 degree mitre at each end, one of anything else) */
export function newProcess(id: string, kind: ProcessKind, steel: ProcessSteel = 'beam'): MemberProcess {
  switch (kind) {
    case 'holes': return { id, kind, count: 4, diaMm: DEFAULT_HOLE_MM, where: steel === 'hollow' ? 'web' : 'web' }
    case 'mitre': return { id, kind, count: 1, angleDeg: DEFAULT_MITRE_DEG }
    case 'cleat': return { id, kind, count: 2 }
    case 'notch': return { id, kind, count: 1 }
    case 'blast': return { id, kind, count: 1 }
    case 'other': return { id, kind, count: 1, material: 0, note: '' }
    default: return { id, kind, count: 1 }
  }
}

/** The fabricator's hours for one hole: a bigger hole takes longer, and one through the flange (thicker steel) takes half as long again */
export const holeHours = (diaMm: number, where: HoleWhere): number => (0.03 + 0.0025 * diaMm) * (where === 'flange' ? 1.5 : 1)

/** Whole hours and halves only for the by-the-hour item; everything else is a whole count */
const whole = (n: number) => Math.round(n)

/**
 * Whatever was saved, made safe: unknown kinds, a kind that cannot go on this member, rubbish counts, sizes and angles are dropped or put back to the usual. `steel` is the kind of member the processes are on
 * (a timber member has none).
 */
export function cleanProcesses(raw: unknown, steel: ProcessSteel | null): MemberProcess[] {
  if (!Array.isArray(raw) || !steel) return []
  const out: MemberProcess[] = []
  const seen = new Set<string>()
  for (const x of raw.slice(0, 12)) {
    if (!x || typeof x !== 'object') continue
    const p = x as Partial<MemberProcess>
    const info = typeof p.kind === 'string' ? PROCESS_BY_ID[p.kind] : undefined
    if (!info || !info.forKinds.includes(steel)) continue
    if (seen.has(info.id)) continue   // one of each kind per member: change its count instead
    seen.add(info.id)
    const base = newProcess(typeof p.id === 'string' && p.id ? p.id : `p-${info.id}`, info.id, steel)
    const count = info.basis === 'hours'
      ? (typeof p.count === 'number' && Number.isFinite(p.count) && p.count > 0 && p.count <= 200 ? Math.round(p.count * 2) / 2 : base.count)
      : info.basis === 'm2' ? 1
      : (typeof p.count === 'number' && Number.isFinite(p.count) && p.count >= 1 && p.count <= 500 ? whole(p.count) : base.count)
    const next: MemberProcess = { ...base, count }
    if (info.id === 'holes') {
      next.diaMm = typeof p.diaMm === 'number' && Number.isFinite(p.diaMm) && p.diaMm >= 6 && p.diaMm <= 60 ? p.diaMm : DEFAULT_HOLE_MM
      next.where = p.where === 'flange' ? 'flange' : 'web'
    }
    if (info.id === 'mitre') next.angleDeg = typeof p.angleDeg === 'number' && Number.isFinite(p.angleDeg) && p.angleDeg > 0 && p.angleDeg < 90 ? p.angleDeg : DEFAULT_MITRE_DEG
    if (info.id === 'other') {
      next.material = typeof p.material === 'number' && Number.isFinite(p.material) && p.material >= 0 && p.material <= 10000 ? p.material : 0
      next.note = typeof p.note === 'string' ? p.note.trim().slice(0, 80) : ''
    }
    out.push(next)
  }
  return out
}

export interface ProcessPricing {
  /** the fabricator's hours for all of this process on this member (all the members of the line) */
  hours: number
  /** £ of steel or fittings it adds */
  material: number
  /** how many units were counted (holes, cuts, m², hours) */
  units: number
  /** the line's name part: '4 holes of 22mm in the web' */
  what: string
  /** for the quote: 'four 22mm holes drilled in the web' style words */
  words: string
  warnings: string[]
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const nw = (n: number) => NUM[n] ?? String(n)
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * Prices one process on a member. `qty` is how many of the member there are, `surfaceM2` the surface of ONE member (for shot blasting), `word` what the member is called ('beam', 'column', 'post'), `hollow` whether it is a
 * hollow section (no web or flange). Throws for a count or size that cannot be priced.
 */
export function priceProcess(p: MemberProcess, qty: number, surfaceM2: number, word: string, hollow: boolean): ProcessPricing {
  const info = PROCESS_BY_ID[p.kind]
  if (!info) throw new Error('Unknown fabrication process.')
  if (!(p.count > 0) || !Number.isFinite(p.count)) throw new Error(`${info.label}: the number must be above zero.`)
  const warnings: string[] = []
  const each = qty === 1 ? '' : ` on each of the ${qty} ${word}s`
  switch (p.kind) {
    case 'holes': {
      const d = p.diaMm ?? DEFAULT_HOLE_MM
      if (!(d > 0)) throw new Error('Holes: the diameter must be above zero.')
      const where: HoleWhere = p.where === 'flange' ? 'flange' : 'web'
      const n = p.count * qty
      const place = hollow ? 'through the wall of the section' : `in the ${where}`
      if (d < 9 || d > 40) warnings.push(`A ${d}mm hole is outside the usual 14 to 33mm for steel fixings: check it with the engineer.`)
      return { hours: holeHours(d, where) * n, material: 0, units: n, what: `${plural(p.count, 'hole')} of ${d}mm ${place}${each}`, words: `${nw(p.count)} ${d}mm hole${p.count === 1 ? '' : 's'} drilled ${place}`, warnings }
    }
    case 'mitre': {
      const a = p.angleDeg ?? DEFAULT_MITRE_DEG
      if (!(a > 0 && a < 90)) throw new Error('Mitre cut: the angle must be between 0 and 90 degrees.')
      if (a < 15 || a > 75) warnings.push(`A ${a}° mitre is a very sharp cut: check the end will have enough steel left to bolt or weld.`)
      const n = p.count * qty
      return { hours: info.hours * n, material: 0, units: n, what: `${plural(p.count, 'mitre cut')} at ${a}°${each}`, words: `${p.count === 1 ? 'a' : nw(p.count)} ${a}° mitre cut${p.count === 1 ? '' : 's'}`, warnings }
    }
    case 'blast': {
      const m2 = surfaceM2 * qty
      return { hours: info.hours * m2, material: info.material * m2, units: m2, what: `shot blasting the steel (${m2.toFixed(1)}m²)`, words: 'shot blasted before painting', warnings }
    }
    case 'other': {
      const h = p.count * qty
      const note = (p.note ?? '').trim()
      return { hours: h, material: (p.material ?? 0) * qty, units: h, what: `${note || 'other fabrication'}${each}`, words: note ? note : 'other fabrication', warnings }
    }
    default: {
      const n = p.count * qty
      const one = p.kind === 'cleat' ? 'web cleat or fin plate' : p.kind === 'stiffener' ? 'pair of bearing stiffeners' : p.kind === 'splice' ? 'splice plate set' : 'notch cut in the flange'
      const many = p.kind === 'cleat' ? 'web cleats or fin plates' : p.kind === 'stiffener' ? 'pairs of bearing stiffeners' : p.kind === 'splice' ? 'splice plate sets' : 'notches cut in the flange'
      const name = p.count === 1 ? one : many
      return { hours: info.hours * n, material: info.material * n, units: n, what: `${p.count} ${name}${each}`, words: `${nw(p.count)} ${name}`, warnings }
    }
  }
}

/** The flange width of a universal beam or column from its name: '203 × 133 UB 25' is 133mm, '152 × 152 UC 23' is 152mm. null for a section that is not one of these. */
export function flangeWidthMm(sectionLabel: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s+U[BC]\b/i.exec(sectionLabel)
  if (!m) return null
  const w = Number(m[2])
  return Number.isFinite(w) && w > 0 ? w : null
}

/** The processes in words for a member, for the quote: 'four 22mm holes drilled in the web, a 45° mitre cut and shot blasted before painting' */
export function processWords(procs: MemberProcess[], qty: number, word: string, steel: ProcessSteel, surfaceM2 = 0): string {
  const out: string[] = []
  for (const p of procs) {
    try { out.push(priceProcess(p, qty, surfaceM2, word, steel === 'hollow').words) } catch { /* a bad one is left out of the words; the pricing reports it */ }
  }
  if (out.length === 0) return ''
  const list = out.length === 1 ? out[0] : `${out.slice(0, -1).join(', ')} and ${out[out.length - 1]}`
  return list
}
