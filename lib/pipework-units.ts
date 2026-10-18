// Pipework priced by the run, for the lengths a fitting's all-in price does not cover: long hot and cold runs, heating circuits (flow and return), gas, waste and soil pipework. Each run has a kind of pipe, a size,
// a material, a length and how it is routed (clipped on the surface, in a floor or ceiling void, chased into a wall, buried in a screed or outside). The price per metre is the installer's all-in rate (pipe, fittings,
// clips and fixing it), multiplied for the way it is routed, with an uplift for the job's situation, and optional lagging. Extras are isolation valves, pipe boxing and a pressure test. Counts and prices only: pipe
// sizes and falls are the plumber's to design, gas pipework must be installed and tested by a Gas Safe registered engineer. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer with each layer's fixedQty set from the quantity. All rates are samples to be checked against real prices.

export type RunType = 'cold' | 'hot' | 'heating' | 'gas' | 'waste' | 'soil'
export type PipeMaterial = 'copper' | 'plastic'

export interface RunTypeInfo { label: string; short: string; sizes: number[]; materials: PipeMaterial[]; lagging: boolean; note: string }

export const RUN_TYPES: Record<RunType, RunTypeInfo> = {
  cold: { label: 'Cold water', short: 'cold water', sizes: [15, 22, 28], materials: ['copper', 'plastic'], lagging: true, note: '' },
  hot: { label: 'Hot water', short: 'hot water', sizes: [15, 22, 28], materials: ['copper', 'plastic'], lagging: true, note: '' },
  heating: { label: 'Heating flow and return (a pair)', short: 'heating flow and return', sizes: [15, 22, 28], materials: ['copper', 'plastic'], lagging: true, note: 'Priced per metre of route for the pair of pipes.' },
  gas: { label: 'Gas', short: 'gas', sizes: [15, 22, 28], materials: ['copper'], lagging: false, note: 'Gas pipework is installed and tested by a Gas Safe registered engineer.' },
  waste: { label: 'Waste (basin, bath, sink, shower)', short: 'waste', sizes: [32, 40, 50], materials: ['plastic'], lagging: false, note: '' },
  soil: { label: 'Soil (WC and stack)', short: 'soil', sizes: [110], materials: ['plastic'], lagging: false, note: '' },
}

/** The installer's all-in price per metre (pipe, fittings, clips and fixing), £, by kind of run, material and size. */
export const RUN_RATES: Record<RunType, Partial<Record<PipeMaterial, Record<number, number>>>> = {
  cold: { copper: { 15: 12, 22: 17, 28: 23 }, plastic: { 15: 8, 22: 11, 28: 15 } },
  hot: { copper: { 15: 12, 22: 17, 28: 23 }, plastic: { 15: 8, 22: 11, 28: 15 } },
  heating: { copper: { 15: 22, 22: 31, 28: 42 }, plastic: { 15: 15, 22: 20, 28: 27 } },
  gas: { copper: { 15: 16, 22: 22, 28: 30 } },
  waste: { plastic: { 32: 6.5, 40: 7.5, 50: 9.5 } },
  soil: { plastic: { 110: 19 } },
}

export type Route = 'surface' | 'void' | 'chased' | 'screed' | 'external'
export const ROUTE_LABEL: Record<Route, string> = {
  surface: 'Clipped on the surface',
  void: 'In a floor or ceiling void',
  chased: 'Chased into a wall',
  screed: 'Buried in a screed or concrete (sleeved)',
  external: 'Outside, clipped to the wall',
}
/** how the route changes the price: chasing, sleeving and working outside all take longer */
export const ROUTE_FACTOR: Record<Route, number> = { surface: 1, void: 1, chased: 1.25, screed: 1.3, external: 1.15 }

/** Lagging, £ per metre, by pipe size (supplied and fitted). */
export const LAGGING_RATE: Record<number, number> = { 15: 2.2, 22: 3.0, 28: 3.8 }

export const VALVE_EACH = 18
export const BOXING_PER_LM = 14
export const PRESSURE_TEST = 120

export interface Situation { id: string; label: string; upliftPct: number }
export const DEFAULT_SITUATIONS: Situation[] = [
  { id: 'new-build', label: 'New build or extension (open walls and floors)', upliftPct: 0 },
  { id: 'refurb', label: 'Refurbishment (existing walls and floors)', upliftPct: 10 },
  { id: 'occupied', label: 'Occupied house (working round the family)', upliftPct: 15 },
  { id: 'hard', label: 'Hard to reach (solid floors, no void, long awkward runs)', upliftPct: 25 },
  { id: 'listed', label: 'Listed building', upliftPct: 20 },
]

export interface PipeRun {
  id: string
  /** what it is, in the estimator's words, e.g. "Hot water to the loft bathroom" */
  name: string
  type: RunType
  size: number
  material: PipeMaterial
  lengthM: number
  route: Route
  lagged: boolean
}

export interface PipeworkInput {
  runs: PipeRun[]
  valves: number
  boxingLm: number
  pressureTest: boolean
  jobSituationId: string
  situations: Situation[]
}

export interface PipeworkLine { id: string; name: string; category: 'subcontractors' | 'materials'; unit: string; unitCost: number; qty: number; runId?: string }

export interface PipeworkResult {
  lines: PipeworkLine[]
  totalLm: number
  lmByType: Record<RunType, number>
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)

export function calculatePipework(i: PipeworkInput): PipeworkResult {
  const sit = i.situations.find(s => s.id === i.jobSituationId)
  if (!sit) throw new Error('Choose the job situation.')
  for (const s of i.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The uplift for "${s.label}" must be between -50% and 200%.`)
  if (!(i.valves >= 0) || !(i.boxingLm >= 0)) throw new Error('The valves and boxing cannot be negative.')
  const uplift = 1 + sit.upliftPct / 100
  const lines: PipeworkLine[] = []
  const lmByType: Record<RunType, number> = { cold: 0, hot: 0, heating: 0, gas: 0, waste: 0, soil: 0 }
  const warnings: string[] = []
  let totalLm = 0

  for (const r of i.runs) {
    const rn = r.name.trim() || RUN_TYPES[r.type].label
    if (!(r.lengthM >= 0)) throw new Error(`The length of "${rn}" cannot be negative.`)
    if (r.lengthM === 0) continue
    const info = RUN_TYPES[r.type]
    if (!info.sizes.includes(r.size)) throw new Error(`${info.label} pipe does not come in ${r.size}mm here: choose ${info.sizes.join(', ')}mm.`)
    if (!info.materials.includes(r.material)) throw new Error(`${info.label} pipework is ${info.materials.join(' or ')} only.`)
    const base = RUN_RATES[r.type][r.material]?.[r.size]
    if (base === undefined) throw new Error(`There is no rate for ${r.size}mm ${r.material} ${info.short} pipe.`)
    lines.push({
      id: `run|${r.id}`, name: `${rn} — ${r.size}mm ${r.material} ${info.short}, ${ROUTE_LABEL[r.route].toLowerCase()}`, category: 'subcontractors',
      unit: 'lm', unitCost: money(base * ROUTE_FACTOR[r.route] * uplift), qty: r.lengthM, runId: r.id,
    })
    if (r.lagged && info.lagging) lines.push({ id: `lag|${r.id}`, name: `${rn} — pipe lagging, ${r.size}mm`, category: 'materials', unit: 'lm', unitCost: LAGGING_RATE[r.size] ?? 3, qty: r.lengthM, runId: r.id })
    lmByType[r.type] += r.lengthM
    totalLm += r.lengthM
    if (r.type === 'hot' && r.size === 15 && r.lengthM > 10) warnings.push(`"${rn}" is a ${r.lengthM}m run of 15mm hot water: a long wait for hot water and wasted water. Consider a shorter run, 10mm microbore, or a return loop.`)
    if (r.type === 'waste' && r.size === 32 && r.lengthM > 3) warnings.push(`"${rn}" is ${r.lengthM}m of 32mm waste: a long run needs a larger pipe or to be kept within the manufacturer's maximum length.`)
  }

  if (lmByType.gas > 0) warnings.push('Gas pipework must be installed, tested and signed off by a Gas Safe registered engineer.')
  if (i.valves > 0) lines.push({ id: 'valves', name: 'Isolation valves (supplied and fitted)', category: 'subcontractors', unit: 'nr', unitCost: VALVE_EACH, qty: i.valves })
  if (i.boxingLm > 0) lines.push({ id: 'boxing', name: 'Boxing in the pipework', category: 'materials', unit: 'lm', unitCost: BOXING_PER_LM, qty: i.boxingLm })
  if (i.pressureTest && lines.length > 0) lines.push({ id: 'ptest', name: 'Pressure test of the pipework', category: 'subcontractors', unit: 'item', unitCost: PRESSURE_TEST, qty: 1 })
  else if (!i.pressureTest && lines.length > 0) warnings.push('No pressure test is included: new pipework should be tested before it is covered.')
  if (i.runs.every(r => !(r.lengthM > 0))) warnings.push('No runs with a length yet. Add a run and give it a length.')
  warnings.push('For the runs your fitting prices do not cover (a fitting\'s price includes its own short pipe run). The pipe sizes and falls are the plumber\'s to confirm.')
  return { lines, totalLm: money(totalLm), lmByType, warnings }
}

export function pipeworkSubtotal(lines: PipeworkLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
