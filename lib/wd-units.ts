// Windows and doors priced as a schedule: one line per opening (a window, an external door, an internal door), each with its type, size, material, glazing, who supplies it and what goes with it (the cill or window board,
// the lining, architrave and ironmongery of an internal door, taking out the old one). The unit is priced from a sample price per type for its size (a fixed part plus a rate per m²) times the material, glazing and colour;
// it can be our price, a provisional sum for the client to choose, or supplied by the client (we fit only). The fitter's time comes from the type and size, with a labourer to help (and a second pair of hands for a big unit).
// The opening in the wall itself (the lintel, cavity closers, reveals) is priced by the wall calculator, NOT here.
//
// Every rate here is a SAMPLE price or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer.

export type OpeningKind =
  | 'win-casement' | 'win-tilt-turn' | 'win-fixed' | 'win-sash' | 'win-bay'
  | 'door-front' | 'door-back' | 'door-composite' | 'door-security' | 'door-french' | 'door-bifold' | 'door-sliding' | 'door-garage'
  | 'door-int-single' | 'door-int-fire' | 'door-int-double' | 'door-int-pocket'
export type OpeningGroup = 'Windows' | 'External doors' | 'Internal doors'
export type WdMaterial = 'upvc' | 'aluminium' | 'timber' | 'composite' | 'steel'
export type WdGlazing = 'single' | 'double' | 'triple'
export type WdSupply = 'we' | 'pc' | 'client'
/** Which way a door opens: in or out of the room, and which side it is hinged on, seen from the side you push it open from. */
export type WdSwing = 'in-left' | 'in-right' | 'out-left' | 'out-right'
export type CillChoice = 'none' | 'internal' | 'external' | 'both'

export interface KindInfo {
  id: OpeningKind; label: string; group: OpeningGroup
  stdW: number; stdH: number
  /** sample unit price: a fixed part plus a rate per m² of opening, £ */
  fixed: number; perM2: number
  /** the fitter's hours: a base plus a rate per m² */
  hrsBase: number; hrsPerM2: number
  /** a window or external door is fitted by the window fitter; an internal door by a carpenter */
  trade: 'fitter' | 'carpenter'
  /** has a door leaf that swings (drawn with its arc) */
  swings: boolean
  defaultMaterial: WdMaterial
}

export const KINDS: KindInfo[] = [
  { id: 'win-casement', label: 'Casement window', group: 'Windows', stdW: 1200, stdH: 1200, fixed: 120, perM2: 330, hrsBase: 2, hrsPerM2: 1, trade: 'fitter', swings: false, defaultMaterial: 'upvc' },
  { id: 'win-tilt-turn', label: 'Tilt-and-turn window', group: 'Windows', stdW: 1200, stdH: 1200, fixed: 160, perM2: 380, hrsBase: 2.5, hrsPerM2: 1, trade: 'fitter', swings: false, defaultMaterial: 'upvc' },
  { id: 'win-fixed', label: 'Fixed window / picture window', group: 'Windows', stdW: 1200, stdH: 900, fixed: 60, perM2: 230, hrsBase: 1.5, hrsPerM2: 0.8, trade: 'fitter', swings: false, defaultMaterial: 'upvc' },
  { id: 'win-sash', label: 'Sash window', group: 'Windows', stdW: 900, stdH: 1500, fixed: 250, perM2: 750, hrsBase: 4, hrsPerM2: 2, trade: 'fitter', swings: false, defaultMaterial: 'timber' },
  { id: 'win-bay', label: 'Bay window', group: 'Windows', stdW: 2400, stdH: 1350, fixed: 500, perM2: 520, hrsBase: 6, hrsPerM2: 2, trade: 'fitter', swings: false, defaultMaterial: 'upvc' },
  { id: 'door-front', label: 'Front door', group: 'External doors', stdW: 900, stdH: 2100, fixed: 520, perM2: 220, hrsBase: 4, hrsPerM2: 0.5, trade: 'fitter', swings: true, defaultMaterial: 'composite' },
  { id: 'door-composite', label: 'Composite door', group: 'External doors', stdW: 920, stdH: 2100, fixed: 640, perM2: 260, hrsBase: 4, hrsPerM2: 0.5, trade: 'fitter', swings: true, defaultMaterial: 'composite' },
  { id: 'door-security', label: 'Security door (PAS 24 or steel)', group: 'External doors', stdW: 926, stdH: 2057, fixed: 850, perM2: 320, hrsBase: 5, hrsPerM2: 0.6, trade: 'fitter', swings: true, defaultMaterial: 'steel' },
  { id: 'door-back', label: 'Back door', group: 'External doors', stdW: 900, stdH: 2100, fixed: 300, perM2: 150, hrsBase: 3, hrsPerM2: 0.5, trade: 'fitter', swings: true, defaultMaterial: 'upvc' },
  { id: 'door-french', label: 'French doors (pair)', group: 'External doors', stdW: 1500, stdH: 2100, fixed: 250, perM2: 160, hrsBase: 4, hrsPerM2: 0.8, trade: 'fitter', swings: true, defaultMaterial: 'upvc' },
  { id: 'door-bifold', label: 'Bi-fold doors', group: 'External doors', stdW: 3000, stdH: 2100, fixed: 300, perM2: 560, hrsBase: 6, hrsPerM2: 1.6, trade: 'fitter', swings: false, defaultMaterial: 'aluminium' },
  { id: 'door-sliding', label: 'Sliding patio doors', group: 'External doors', stdW: 1800, stdH: 2100, fixed: 250, perM2: 190, hrsBase: 4, hrsPerM2: 1, trade: 'fitter', swings: false, defaultMaterial: 'upvc' },
  { id: 'door-garage', label: 'Garage door', group: 'External doors', stdW: 2400, stdH: 2100, fixed: 300, perM2: 110, hrsBase: 6, hrsPerM2: 0.8, trade: 'fitter', swings: false, defaultMaterial: 'aluminium' },
  { id: 'door-int-single', label: 'Internal door', group: 'Internal doors', stdW: 826, stdH: 2040, fixed: 45, perM2: 20, hrsBase: 1.5, hrsPerM2: 0, trade: 'carpenter', swings: true, defaultMaterial: 'timber' },
  { id: 'door-int-fire', label: 'Fire door (FD30)', group: 'Internal doors', stdW: 826, stdH: 2040, fixed: 100, perM2: 30, hrsBase: 2, hrsPerM2: 0, trade: 'carpenter', swings: true, defaultMaterial: 'timber' },
  { id: 'door-int-double', label: 'Internal double doors', group: 'Internal doors', stdW: 1450, stdH: 2040, fixed: 120, perM2: 50, hrsBase: 2.5, hrsPerM2: 0, trade: 'carpenter', swings: true, defaultMaterial: 'timber' },
  { id: 'door-int-pocket', label: 'Pocket (sliding) door', group: 'Internal doors', stdW: 826, stdH: 2040, fixed: 330, perM2: 30, hrsBase: 6, hrsPerM2: 0, trade: 'carpenter', swings: false, defaultMaterial: 'timber' },
]
export const KIND_BY_ID: Record<string, KindInfo> = Object.fromEntries(KINDS.map(k => [k.id, k]))
export const isInternalDoor = (k: OpeningKind) => KIND_BY_ID[k]?.group === 'Internal doors'
export const isWindow = (k: OpeningKind) => KIND_BY_ID[k]?.group === 'Windows'

/** The two calculators the schedule is split into (the older one with both stays for saved quotes): WINDOWS take the windows and the big glazed bi-fold and sliding door systems a window fitter installs; DOORS take every other door */
export type WdScope = 'all' | 'windows' | 'doors'
export const WINDOWS_SCOPE_KINDS: OpeningKind[] = ['win-casement', 'win-tilt-turn', 'win-fixed', 'win-sash', 'win-bay', 'door-bifold', 'door-sliding']
export const kindInScope = (kind: OpeningKind, scope: WdScope): boolean => scope === 'all' || WINDOWS_SCOPE_KINDS.includes(kind) === (scope === 'windows')

export const MATERIAL_LABEL: Record<WdMaterial, string> = { upvc: 'uPVC', aluminium: 'Aluminium', timber: 'Timber', composite: 'Composite', steel: 'Steel' }
/** the material as it reads in a sentence */
export const MATERIAL_WORD: Record<WdMaterial, string> = { upvc: 'uPVC', aluminium: 'aluminium', timber: 'timber', composite: 'composite', steel: 'steel' }
export const MATERIAL_FACTOR: Record<WdMaterial, number> = { upvc: 1, aluminium: 1.45, timber: 1.5, composite: 1, steel: 1 }
export const GLAZING_LABEL: Record<WdGlazing, string> = { single: 'Single glazed', double: 'Double glazed', triple: 'Triple glazed' }
export const GLAZING_FACTOR: Record<WdGlazing, number> = { single: 0.85, double: 1, triple: 1.15 }
export const COLOUR_FACTOR = 1.12
export const SUPPLY_LABEL: Record<WdSupply, string> = { we: 'We supply (our price)', pc: 'Provisional sum (client to choose)', client: 'Client supplies (we fit only)' }
export const SWING_LABEL: Record<WdSwing, string> = { 'in-left': 'Opens in, hinged left', 'in-right': 'Opens in, hinged right', 'out-left': 'Opens out, hinged left', 'out-right': 'Opens out, hinged right' }
export const CILL_LABEL: Record<CillChoice, string> = { none: 'No cill or board', internal: 'Window board inside', external: 'External cill', both: 'Window board and external cill' }

export interface WdSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_WD_SITUATIONS: WdSituation[] = [
  { id: 'ground', label: 'Ground floor, easy access', upliftPct: 0 },
  { id: 'upper', label: 'Upper floor or scaffold access', upliftPct: 10 },
  { id: 'hard', label: 'Hard to reach (high, tight, no access)', upliftPct: 20 },
]

export interface WdOpening {
  id: string
  /** W1, D1... as on the schedule */
  ref: string
  /** the room or wall it is in */
  location: string
  kind: OpeningKind
  widthMm: number
  heightMm: number
  qty: number
  material: WdMaterial
  glazing: WdGlazing
  coloured: boolean
  supply: WdSupply
  /** £ each for a provisional sum; null = the sample price */
  pcEach: number | null
  swing: WdSwing
  cill: CillChoice
  lining: boolean
  architrave: boolean
  ironmongery: boolean
  removeOld: boolean
  /** an internal door fitted to a frame (lining) that is already in the wall: no new lining, and the door is trimmed to fit it */
  existingFrame?: boolean
  /** the opening placed on the Take-off drawing this one follows (it keeps following until typed over), and what it was last fed from it */
  planId?: string
  fromPlan?: string
}

/** A new opening of a kind: its standard size and what usually goes with it (an internal door gets its lining, architrave and ironmongery; a window gets an inside board). */
export function newOpening(id: string, ref: string, kind: OpeningKind, location = ''): WdOpening {
  const k = KIND_BY_ID[kind]
  const internal = isInternalDoor(kind)
  return {
    id, ref, location, kind, widthMm: k.stdW, heightMm: k.stdH, qty: 1, material: k.defaultMaterial, glazing: 'double', coloured: false,
    supply: 'we', pcEach: null, swing: 'in-left', cill: isWindow(kind) ? 'internal' : 'none',
    lining: internal && kind !== 'door-int-pocket', architrave: internal, ironmongery: internal, removeOld: false,
  }
}

export const MATERIAL_RATES = {
  windowBoard: 65,       // £ each: window board, liners and fixing inside
  externalCill: 55,      // £ each: external cill (precast or GRP)
  liningSet: 65,         // £ per door: lining or frame set
  architraveSet: 30,     // £ per door: architrave set, both sides
  ironmongerySet: 35,    // £ per door: handles, hinges and latch
  sundriesWindow: 12,    // £ per window: foam, sealant, packers, fixings
  sundriesDoor: 25,      // £ per door
  wastePerOld: 8,        // £ per opening: skip share for the old window or door
} as const
export const HOURS = { existingFrame: 1, windowBoard: 0.75, externalCill: 0.5, lining: 1, architrave: 0.75, ironmongery: 0.5, removeOldWindow: 1, removeOldDoor: 1.5 } as const
/** The labourer helps: this share of the fitter's hours, and a second pair of hands (half the fitting hours again) on a unit this big (m²) */
export const LABOURER_SHARE = 0.15
export const BIG_UNIT_M2 = 3

export interface WdInput {
  openings: WdOpening[]
  jobSituationId: string
  situations: WdSituation[]
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
}
export interface WdLine { id: string; name: string; category: 'materials'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface WdLabourTask { key: string; roomId: string; trade: 'fitter' | 'carpenter' | 'labourer'; task: string; hours: number; basis: string }
export interface WdSummary { openingId: string; ref: string; name: string; qty: number; areaM2: number; unitPrice: number; parts: string[] }
export interface WdResult { lines: WdLine[]; labour: WdLabourTask[]; openings: WdSummary[]; totalUnits: number; totalAreaM2: number; totalFitterHours: number; warnings: string[] }

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()

/** The sample price of ONE unit, £: the type's fixed part plus its rate per m², times the material, glazing and colour (a window or external door; an internal door is by size only). */
export function unitPrice(o: Pick<WdOpening, 'kind' | 'widthMm' | 'heightMm' | 'material' | 'glazing' | 'coloured'>): number {
  const k = KIND_BY_ID[o.kind]
  if (!k) return 0
  const area = (o.widthMm * o.heightMm) / 1e6
  const base = k.fixed + k.perM2 * area
  if (isInternalDoor(o.kind)) return money(base)
  return money(base * (MATERIAL_FACTOR[o.material] ?? 1) * (GLAZING_FACTOR[o.glazing] ?? 1) * (o.coloured ? COLOUR_FACTOR : 1))
}

/** What the opening is called in words: "1200 x 1200 uPVC casement window, double glazed, white" / "826 x 2040 internal door with lining, architrave and ironmongery". */
export function openingWords(o: WdOpening): string {
  const k = KIND_BY_ID[o.kind]
  const size = `${o.widthMm} x ${o.heightMm}`
  if (isInternalDoor(o.kind)) {
    const frame = !!o.existingFrame && o.kind !== 'door-int-pocket'
    const set = [o.lining && !frame && 'lining', o.architrave && 'architrave', o.ironmongery && 'ironmongery'].filter(Boolean) as string[]
    return `${size} ${k.label.toLowerCase()}${frame ? ' fitted to the existing frame' : ''}${set.length ? ` with ${set.length === 1 ? set[0] : set.slice(0, -1).join(', ') + ' and ' + set[set.length - 1]}` : ''}`
  }
  return `${size} ${MATERIAL_WORD[o.material]} ${k.label.toLowerCase()}, ${GLAZING_LABEL[o.glazing].toLowerCase()}, ${o.coloured ? 'coloured' : 'white'}`
}

export function calculateWindowsDoors(input: WdInput): WdResult {
  const job = input.situations.find(s => s.id === input.jobSituationId)
  if (!job) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  const rate = <K extends keyof typeof MATERIAL_RATES>(k: K): number => {
    const v = input.rates[k] ?? MATERIAL_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const uplift = 1 + job.upliftPct / 100
  const lines: WdLine[] = []
  const labour: WdLabourTask[] = []
  const summaries: WdSummary[] = []
  const warnings: string[] = []
  let totalUnits = 0, totalAreaM2 = 0, totalFitterHours = 0, totalHelperHours = 0

  for (const o of input.openings) {
    const k = KIND_BY_ID[o.kind]
    const name = o.ref.trim() || k?.label || 'Opening'
    if (!k) throw new Error(`${name} has no type.`)
    if (!(o.widthMm > 0) || !(o.heightMm > 0)) throw new Error(`The size of ${name} must be above zero.`)
    if (!(o.qty >= 1) || Math.round(o.qty) !== o.qty) throw new Error(`The number of ${name} must be a whole number, 1 or more.`)
    if (o.pcEach !== null && !(o.pcEach >= 0)) throw new Error(`The price of ${name} cannot be negative.`)
    const qty = o.qty
    const area = (o.widthMm * o.heightMm) / 1e6
    const internal = isInternalDoor(o.kind), windowKind = isWindow(o.kind)
    const price = unitPrice(o)
    const label = `${name}${o.location.trim() ? ` (${o.location.trim()})` : ''}`
    const parts: string[] = []
    const add = (key: string, what: string, unit: string, unitCost: number, q: number) => {
      if (q > 0 && unitCost >= 0) lines.push({ id: `${key}|${o.id}`, name: `${label} — ${what}`, category: 'materials', unit, unitCost: money(unitCost), qty: +q.toFixed(3), roomId: o.id })
    }
    const fitHours: { what: string; h: number }[] = []
    const addHours = (what: string, h: number) => { if (h > 0) fitHours.push({ what, h }) }

    // ── the unit ─────────────────────────────────────────────────────────────────
    if (o.supply === 'we') add('unit', `${openingWords(o)}, supplied`, 'nr', price, qty)
    else if (o.supply === 'pc') add('unit', `PC sum: ${k.label.toLowerCase()} ${o.widthMm} x ${o.heightMm}`, 'nr', o.pcEach ?? price, qty)
    parts.push(`${qty > 1 ? qty + ' x ' : ''}${openingWords(o)}${o.supply === 'pc' ? ' (provisional sum)' : o.supply === 'client' ? ' (supplied by the client, fitted by us)' : ''}`)
    addHours(`fit the ${k.label.toLowerCase()}`, (k.hrsBase + k.hrsPerM2 * area) * qty)

    // ── what goes with it ────────────────────────────────────────────────────────
    if (windowKind) {
      if (o.cill === 'internal' || o.cill === 'both') { add('board', 'window board, liners and fixing', 'nr', rate('windowBoard'), qty); addHours('window board', HOURS.windowBoard * qty); parts.push('window board inside') }
      if (o.cill === 'external' || o.cill === 'both') { add('cill', 'external cill', 'nr', rate('externalCill'), qty); addHours('external cill', HOURS.externalCill * qty); parts.push('external cill') }
    }
    if (internal) {
      const frame = !!o.existingFrame && o.kind !== 'door-int-pocket'
      if (frame) { addHours('trim the door to the existing frame and re-cut the hinge recesses', HOURS.existingFrame * qty); parts.push('the door trimmed to fit the frame') }
      if (o.lining && !frame) { add('lining', 'door lining set', 'nr', rate('liningSet'), qty); addHours('door lining', HOURS.lining * qty) }
      if (o.architrave) { add('architrave', 'architrave set (both sides)', 'nr', rate('architraveSet'), qty); addHours('architrave', HOURS.architrave * qty) }
      if (o.ironmongery) { add('ironmongery', 'door ironmongery (handles, hinges, latch)', 'nr', rate('ironmongerySet'), qty); addHours('ironmongery', HOURS.ironmongery * qty) }
      if (o.kind === 'door-int-fire' && frame) warnings.push(`${label}: a fire door only works as one in a fire-rated frame: check the existing frame is, or fit a new lining.`)
      if (frame) warnings.push(`${label}: the existing frame may be slightly out of square or not plumb: the door is trimmed to suit it, and a frame that is badly out needs packing or a new lining.`)
      if (o.kind === 'door-int-fire' && !frame && (!o.lining || !o.ironmongery)) warnings.push(`${label}: a fire door needs a fire-rated lining and fire-rated hinges and latch to work as a fire door.`)
    }
    add('sundries', 'foam, sealant, packers and fixings', 'item', windowKind ? rate('sundriesWindow') : rate('sundriesDoor'), qty)
    if (o.removeOld) {
      add('waste', 'taking out the old one: skip share', 'nr', rate('wastePerOld'), qty)
      addHours('take out the old one', (windowKind ? HOURS.removeOldWindow : HOURS.removeOldDoor) * qty)
      parts.push('the old one taken out')
    }

    // ── warnings ─────────────────────────────────────────────────────────────────
    if (o.kind === 'door-bifold' && o.widthMm > 4500) warnings.push(`${label}: bi-fold doors over 4.5m wide are usually made as two sets with a post: check with the supplier.`)
    if (windowKind && o.heightMm * o.widthMm < 330000 && o.cill !== 'none') warnings.push(`${label}: this window is small. A bedroom window needs an openable area of at least 0.33m² (450 x 750mm clear) for escape.`)
    if (o.kind === 'door-security') warnings.push(`${label}: a security door is only PAS 24 or Secured by Design as a complete set (door, frame and locks): check the certificate and fit it to the maker's detail.`)
    if (o.supply === 'client' && k.group !== 'Internal doors') warnings.push(`${label}: with the client supplying it, check the size and the delivery date before the opening is closed up.`)

    // ── the fitter's time, and the labourer who helps ────────────────────────────
    const total = fitHours.reduce((s, x) => s + x.h, 0) * uplift
    const hours = hoursOf(total)
    if (hours > 0) {
      labour.push({ key: `fit|${o.id}`, roomId: o.id, trade: k.trade, task: `${label} — fit and finish`, hours,
        basis: fitHours.map(x => `${x.what} ${n1(x.h)}h`).join(' + ') + (uplift !== 1 ? ` (+${job.upliftPct}% ${job.label.split(',')[0].toLowerCase()})` : '') })
      totalFitterHours += hours
      const fitOnly = (k.hrsBase + k.hrsPerM2 * area) * qty * uplift
      totalHelperHours += hours * LABOURER_SHARE + (area > BIG_UNIT_M2 ? fitOnly * 0.5 : 0)
    }
    totalUnits += qty; totalAreaM2 += area * qty
    summaries.push({ openingId: o.id, ref: name, name: k.label, qty, areaM2: money(area * qty), unitPrice: price, parts })
  }

  const helper = totalHelperHours > 0 ? hoursOf(totalHelperHours) : 0
  if (helper > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Help to lift and fit, carry and clear up', hours: helper, basis: `${Math.round(LABOURER_SHARE * 100)}% of the fitting hours, and a second pair of hands on the big units (over ${BIG_UNIT_M2}m²)` })
  return { lines, labour, openings: summaries, totalUnits, totalAreaM2: money(totalAreaM2), totalFitterHours: money(totalFitterHours), warnings }
}

// ── Openings placed on the Take-off drawing ──────────────────────────────────────────────────────────────────────────
/** An opening as the drawing knows it (lib/wall-openings.ts PlacedOpening, without where on the wall it is) */
export interface PlanOpening { id: string; ref: string; location?: string; kind: OpeningKind; widthMm: number; heightMm: number; swing: WdSwing }
export const planOpeningSig = (p: PlanOpening) => [p.kind, p.widthMm, p.heightMm, p.swing, p.ref, p.location ?? ''].join('|')

/**
 * The calculator's openings brought in step with the drawing: an opening placed on the plan is added (with the usual trims for its kind), one that is already in the calculator follows the drawing when the drawing's opening
 * changes (a different size, kind, swing, reference) and is otherwise left as typed, and one whose drawing opening has been deleted goes. Openings typed in the calculator with no drawing opening are never touched.
 */
export function mergePlanOpenings(existing: WdOpening[], plan: PlanOpening[]): WdOpening[] {
  const byPlan = new Map(plan.map(p => [p.id, p]))
  const out: WdOpening[] = []
  const seen = new Set<string>()
  for (const e of existing) {
    if (!e.planId) { out.push(e); continue }
    const p = byPlan.get(e.planId)
    if (!p) continue
    seen.add(p.id)
    const sig = planOpeningSig(p)
    if (e.fromPlan === sig) { out.push(e); continue }
    const base = e.kind === p.kind ? e : { ...newOpening(e.id, p.ref, p.kind, e.location), qty: e.qty, supply: e.supply, pcEach: e.pcEach, removeOld: e.removeOld }
    out.push({ ...base, ref: p.ref, location: p.location ?? base.location, kind: p.kind, widthMm: p.widthMm, heightMm: p.heightMm, swing: p.swing, planId: p.id, fromPlan: sig })
  }
  for (const p of plan) {
    if (seen.has(p.id)) continue
    out.push({ ...newOpening('op-' + p.id, p.ref, p.kind, p.location ?? ''), widthMm: p.widthMm, heightMm: p.heightMm, swing: p.swing, planId: p.id, fromPlan: planOpeningSig(p) })
  }
  return out
}
