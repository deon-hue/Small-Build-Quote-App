// Outbuildings and external demolition (Demolition → Outbuildings & External). Four kinds of thing come down outside: an outbuilding (a shed, a brick or prefab garage, a conservatory, a lean-to) from its
// footprint, with its concrete base if it is to be broken out; a concrete, tarmac, slab or block-paving surface, from its area and thickness; a garden or boundary wall, from its length, height and thickness; and
// fencing, by the metre. Each takes a labourer so many hours and makes inert waste (rubble, brick, concrete) and general waste (timber, glass, roofing), which fill skips or go by grab lorry. Breaking up concrete and
// bases can use a mini excavator with a breaker, priced in days on site by the screen. A prefab garage's asbestos cement roof is a provisional sum for a licensed contractor. Counts and prices only: services must be
// disconnected first, a boundary wall may be a party wall, and old buildings can hold bats and nesting birds. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen
// costs the lines it returns through the shared costLayer with each layer's fixedQty set from the quantity. All rates and hours are samples to be checked against real jobs.

export type ExtType = 'outbuilding' | 'hard' | 'wall' | 'fence'
export type OutKind = 'shed' | 'garage-brick' | 'garage-prefab' | 'conservatory' | 'lean-to'
export type HardKind = 'concrete' | 'slabs' | 'blocks' | 'tarmac'

export interface OutKindInfo { label: string; hoursPerM2: number; generalM3PerM2: number; inertM3PerM2: number; asbestosRoof?: boolean; note: string }
export const OUT_KINDS: Record<OutKind, OutKindInfo> = {
  shed: { label: 'Timber shed or summerhouse', hoursPerM2: 0.5, generalM3PerM2: 0.25, inertM3PerM2: 0, note: '' },
  'garage-brick': { label: 'Brick or block garage', hoursPerM2: 3.5, generalM3PerM2: 0.35, inertM3PerM2: 0.85, note: '' },
  'garage-prefab': { label: 'Prefab concrete-panel garage', hoursPerM2: 2, generalM3PerM2: 0.2, inertM3PerM2: 0.5, asbestosRoof: true, note: 'Prefab garages often have an asbestos cement roof: it must be removed by a licensed contractor before anything else is touched.' },
  conservatory: { label: 'Conservatory (uPVC and glass)', hoursPerM2: 1.5, generalM3PerM2: 0.4, inertM3PerM2: 0.2, note: 'The glass must come out carefully: it is a cutting hazard and is best taken out first.' },
  'lean-to': { label: 'Lean-to or carport', hoursPerM2: 1, generalM3PerM2: 0.3, inertM3PerM2: 0.3, note: '' },
}
export const OUT_KIND_LIST = Object.keys(OUT_KINDS) as OutKind[]

export interface HardKindInfo { label: string; defaultMm: number; /** loose volume made for each m³ in place */ bulk: number; handHoursPerM3: number }
export const HARD_KINDS: Record<HardKind, HardKindInfo> = {
  concrete: { label: 'Concrete (path, drive, patio base)', defaultMm: 100, bulk: 1.5, handHoursPerM3: 6 },
  slabs: { label: 'Paving slabs on a sand bed', defaultMm: 75, bulk: 1.3, handHoursPerM3: 3 },
  blocks: { label: 'Block paving on a sand bed', defaultMm: 80, bulk: 1.3, handHoursPerM3: 3 },
  tarmac: { label: 'Tarmac', defaultMm: 75, bulk: 1.4, handHoursPerM3: 4 },
}
export const HARD_KIND_LIST = Object.keys(HARD_KINDS) as HardKind[]

export const MACHINE_HOURS_PER_M3 = 1.2          // a labourer working with the machine, for each m³ broken out
export const MACHINE_M3_PER_DAY = 8              // what a mini excavator with a breaker breaks out and loads in a day
export const BREAKER_PER_DAY = 90                // the hydraulic breaker attachment, on top of the digger
export const WALL_HOURS_PER_M3 = 5
export const WALL_BULK = 1.6
export const FENCE_HOURS_PER_LM = 0.15
export const FENCE_GENERAL_M3_PER_LM = 0.03
export const FENCE_INERT_M3_PER_LM = 0.02
export const ASBESTOS_ROOF_PER_M2 = 38           // licensed removal of cement sheet roofing, provisional
export const SKIP_M3 = 4.6
export const GENERAL_SKIP = { usable: SKIP_M3 * 0.85, each: 260 }
export const INERT_SKIP = { usable: SKIP_M3 * 0.6, each: 290 }
export const GRAB = { loadM3: 8, perLoad: 420 }

export interface ExtItem {
  id: string
  name: string
  type: ExtType
  outKind: OutKind
  hardKind: HardKind
  /** outbuilding footprint, or the area of a hard surface, m² */
  areaM2: number
  /** outbuilding height or wall height, m */
  heightM: number
  /** a hard surface's thickness or a wall's, mm */
  thicknessMm: number
  /** a wall's or a fence's length, m */
  lengthM: number
  /** an outbuilding's concrete base broken out too */
  breakBase: boolean
  baseMm: number
}

export interface ExtInput {
  items: ExtItem[]
  /** break out concrete and bases with a mini excavator and breaker (otherwise by hand) */
  machine: boolean
  /** inert waste goes by grab lorry instead of skips */
  useGrab: boolean
}

export interface ExtLine { id: string; name: string; category: 'plant' | 'other' | 'subcontractors'; unit: string; unitCost: number; qty: number }

export interface ExtItemSummary { id: string; name: string; hours: number; generalM3: number; inertM3: number }

export interface ExtResult {
  lines: ExtLine[]
  items: ExtItemSummary[]
  totalHours: number
  generalM3: number
  inertM3: number
  skipsGeneral: number
  skipsInert: number
  grabLoads: number
  /** volume broken out with the machine, m³, and the days it takes (the screen turns the days into days on site) */
  machineM3: number
  excavatorDays: number
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateExternalDemo(i: ExtInput): ExtResult {
  const lines: ExtLine[] = []
  const warnings: string[] = []
  const items: ExtItemSummary[] = []
  const noted = new Set<string>()
  let hours = 0, general = 0, inert = 0, machineM3 = 0

  for (const x of i.items) {
    const xn = x.name.trim() || (x.type === 'outbuilding' ? OUT_KINDS[x.outKind].label : x.type === 'hard' ? HARD_KINDS[x.hardKind].label : x.type === 'wall' ? 'Wall' : 'Fencing')
    if (!(x.areaM2 >= 0) || !(x.heightM >= 0) || !(x.thicknessMm >= 0) || !(x.lengthM >= 0) || !(x.baseMm >= 0)) throw new Error(`The sizes of "${xn}" cannot be negative.`)
    let h = 0, g = 0, n = 0
    if (x.type === 'outbuilding') {
      const k = OUT_KINDS[x.outKind]
      h += x.areaM2 * k.hoursPerM2; g += x.areaM2 * k.generalM3PerM2; n += x.areaM2 * k.inertM3PerM2
      if (k.asbestosRoof && x.areaM2 > 0) lines.push({ id: `asbestos|${x.id}`, name: `${xn} — asbestos cement roof removed by a licensed contractor (provisional sum, about ${round2(x.areaM2 * 1.15)} m²)`, category: 'subcontractors', unit: 'm²', unitCost: ASBESTOS_ROOF_PER_M2, qty: round2(x.areaM2 * 1.15) })
      if (x.breakBase && x.areaM2 > 0 && x.baseMm > 0) {
        const vol = x.areaM2 * x.baseMm / 1000
        if (i.machine) { machineM3 += vol; h += vol * MACHINE_HOURS_PER_M3 } else h += vol * HARD_KINDS.concrete.handHoursPerM3
        n += vol * HARD_KINDS.concrete.bulk
      }
      if (k.note && !noted.has(x.outKind)) { noted.add(x.outKind); warnings.push(`${k.label}: ${k.note}`) }
    } else if (x.type === 'hard') {
      const k = HARD_KINDS[x.hardKind]
      const vol = x.areaM2 * x.thicknessMm / 1000
      const machineOk = i.machine && (x.hardKind === 'concrete' || x.hardKind === 'tarmac')
      if (machineOk) { machineM3 += vol; h += vol * MACHINE_HOURS_PER_M3 } else h += vol * k.handHoursPerM3
      n += vol * k.bulk
    } else if (x.type === 'wall') {
      const vol = x.lengthM * x.heightM * x.thicknessMm / 1000
      h += vol * WALL_HOURS_PER_M3; n += vol * WALL_BULK
      if (!noted.has('wall')) { noted.add('wall'); warnings.push('A boundary wall may be a party wall: the Party Wall Act needs notice to the neighbour, and a wall may need a replacement for privacy or security.') }
    } else {
      h += x.lengthM * FENCE_HOURS_PER_LM; g += x.lengthM * FENCE_GENERAL_M3_PER_LM; n += x.lengthM * FENCE_INERT_M3_PER_LM
    }
    hours += h; general += g; inert += n
    items.push({ id: x.id, name: xn, hours: round2(h), generalM3: round2(g), inertM3: round2(n) })
  }

  const excavatorDays = machineM3 > 0 ? Math.max(0.5, Math.round((machineM3 / MACHINE_M3_PER_DAY) * 2) / 2) : 0
  if (excavatorDays > 0) lines.push({ id: 'breaker', name: 'Hydraulic breaker attachment hire, with the digger (per day breaking out)', category: 'plant', unit: 'day', unitCost: BREAKER_PER_DAY, qty: excavatorDays })
  const skipsGeneral = general > 0 ? Math.max(1, Math.ceil(general / GENERAL_SKIP.usable)) : 0
  let skipsInert = 0, grabLoads = 0
  if (skipsGeneral > 0) lines.push({ id: 'skips-general', name: `Skip hire for the timber, glass, roofing and other mixed waste (6-yard skips, about ${round2(general)} m³ loose)`, category: 'other', unit: 'skip', unitCost: GENERAL_SKIP.each, qty: skipsGeneral })
  if (inert > 0) {
    if (i.useGrab) { grabLoads = Math.ceil(inert / GRAB.loadM3); lines.push({ id: 'grab-inert', name: `Rubble, brick and concrete taken away by grab lorry (about ${round2(inert)} m³ loose)`, category: 'other', unit: 'load', unitCost: GRAB.perLoad, qty: grabLoads }) }
    else { skipsInert = Math.max(1, Math.ceil(inert / INERT_SKIP.usable)); lines.push({ id: 'skips-inert', name: `Skip hire for the rubble, brick and concrete (6-yard skips, only part filled, about ${round2(inert)} m³ loose)`, category: 'other', unit: 'skip', unitCost: INERT_SKIP.each, qty: skipsInert }) }
  }

  if (i.items.length === 0) warnings.push('Nothing to demolish yet. Add an outbuilding, a surface, a wall or fencing.')
  if (i.items.some(x => x.type === 'outbuilding')) warnings.push('Disconnect and make safe any electric and water to the outbuilding first, and look for bats and nesting birds in an old building (March to August).')
  warnings.push('Check for drains and services under hard surfaces and bases before breaking them out.')
  return { lines, items, totalHours: round2(hours), generalM3: round2(general), inertM3: round2(inert), skipsGeneral, skipsInert, grabLoads, machineM3: round2(machineM3), excavatorDays, warnings }
}

export function externalDemoSubtotal(lines: ExtLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
