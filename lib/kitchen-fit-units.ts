// A fitted kitchen priced one kitchen at a time (Joinery & Fixtures → Kitchen Installation (by kitchen)). Each kitchen has its units (base, wall, tall and the two corner kinds), who supplies them (the client or the
// supplier delivers them and we fit only, we supply them at a sample price for the range, or a provisional sum), whether they come flat-packed to be built on site, the worktops (laminate or timber cut and fitted by us,
// stone made and fitted by a specialist), the cut-outs, joints and upstand, plinth, cornice and end panels, handles, and the integrated appliances to be fitted into their housings. The kitchen fitter's time follows the
// units, the worktops and the appliances, with a labourer to help carry and lift. It is the JOINER's work: the sink, tap and appliance plumbing and wiring belong to Plumbing and Electrics, taking out the old kitchen is
// Demolition → Strip-Out by Room, tiling the splashback is Wall Tiling, and painting is Decoration.
//
// Every rate here is a SAMPLE price or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node.

export type UnitRange = 'budget' | 'mid' | 'high'
export type UnitSupply = 'client' | 'we' | 'pc'
export type WorktopMaterial = 'laminate' | 'timber' | 'stone'

export const RANGE_LABEL: Record<UnitRange, string> = { budget: 'Budget flat-pack range', mid: 'Mid-range (rigid or good flat-pack)', high: 'High-end / handmade' }
export const SUPPLY_LABEL: Record<UnitSupply, string> = { client: 'Client or supplier delivers the units (we fit only)', we: 'We supply the units (at the range below)', pc: 'Provisional sum for the units (typed)' }
export const WORKTOP_LABEL: Record<WorktopMaterial, string> = { laminate: 'Laminate (we cut and fit)', timber: 'Solid timber (we cut, fit and oil)', stone: 'Quartz or granite (made and fitted by a specialist)' }
export const WORKTOP_WORD: Record<WorktopMaterial, string> = { laminate: 'laminate', timber: 'solid timber', stone: 'quartz or granite' }

export type UnitKey = 'base' | 'wall' | 'tall' | 'cornerBase' | 'cornerWall'
export const UNIT_KINDS: { id: UnitKey; label: string; word: string; /** sample £ each by range: budget, mid, high */ price: [number, number, number]; /** fitter's hours to fit one (hang or stand, level, fix), and extra to build it from flat-pack */ fitHrs: number; packHrs: number }[] = [
  { id: 'base', label: 'Base units', word: 'base unit', price: [95, 210, 420], fitHrs: 0.9, packHrs: 0.5 },
  { id: 'wall', label: 'Wall units', word: 'wall unit', price: [70, 160, 320], fitHrs: 0.9, packHrs: 0.5 },
  { id: 'tall', label: 'Tall units (larder, oven housing)', word: 'tall unit', price: [180, 380, 700], fitHrs: 1.6, packHrs: 0.9 },
  { id: 'cornerBase', label: 'Corner base units', word: 'corner base unit', price: [140, 280, 520], fitHrs: 1.3, packHrs: 0.7 },
  { id: 'cornerWall', label: 'Corner wall units', word: 'corner wall unit', price: [110, 230, 420], fitHrs: 1.2, packHrs: 0.6 },
]
export const UNIT_BY_ID: Record<UnitKey, (typeof UNIT_KINDS)[number]> = Object.fromEntries(UNIT_KINDS.map(u => [u.id, u])) as Record<UnitKey, (typeof UNIT_KINDS)[number]>

export type ApplianceKey = 'fridge' | 'dishwasher' | 'washer' | 'oven' | 'hob' | 'hood' | 'other'
export const APPLIANCES: { id: ApplianceKey; label: string; word: string; hrs: number }[] = [
  { id: 'fridge', label: 'Integrated fridge or freezer (door on door)', word: 'integrated fridge or freezer', hrs: 0.75 },
  { id: 'dishwasher', label: 'Integrated dishwasher (door fitted)', word: 'integrated dishwasher', hrs: 0.75 },
  { id: 'washer', label: 'Integrated washing machine (door fitted)', word: 'integrated washing machine', hrs: 0.75 },
  { id: 'oven', label: 'Built-in oven or microwave in its housing', word: 'built-in oven', hrs: 0.75 },
  { id: 'hob', label: 'Hob dropped into the worktop', word: 'hob', hrs: 0.5 },
  { id: 'hood', label: 'Extractor hood or canopy', word: 'extractor hood', hrs: 1.25 },
  { id: 'other', label: 'Other appliance to fit', word: 'other appliance', hrs: 0.5 },
]
export const APPLIANCE_BY_ID: Record<ApplianceKey, (typeof APPLIANCES)[number]> = Object.fromEntries(APPLIANCES.map(a => [a.id, a])) as Record<ApplianceKey, (typeof APPLIANCES)[number]>

/** Sample rates, £ */
export const RATES = {
  worktopLaminate: 55, worktopTimber: 165, worktopStone: 330,
  cutoutStone: 60, jointKit: 18, upstandPerLm: 8, plinthPerLm: 6.5, cornicePerLm: 9, endPanel: 38, handle: 3.5,
  unitSundries: 4.5, jobSundries: 25, siliconePerLm: 0.5, skipShare: 35,
} as const
export type KitchenRateKey = keyof typeof RATES

export const HOURS = {
  setOut: 4, worktopPerLm: 0.45, stoneSupportPerLm: 0.15, mitre: 0.9, cutout: 0.75, upstandPerLm: 0.2, plinthPerLm: 0.1, cornicePerLm: 0.25, endPanel: 0.5, handle: 0.08, sink: 1,
} as const
/** The labourer carries units and helps lift the worktops: this share of the fitter's hours */
export const LABOURER_SHARE = 0.2
/** Handles to a unit when not typed (a door or a drawer pack each) */
export const HANDLES_PER_UNIT = 1.5
/** Plinth to each base unit, m */
export const PLINTH_PER_BASE_M = 0.6

export interface KitchenSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_KITCHEN_SITUATIONS: KitchenSituation[] = [
  { id: 'empty', label: 'New or empty room (straight walls and floor)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (floors and furniture to protect)', upliftPct: 15 },
  { id: 'old', label: 'Old house (uneven walls and floor to scribe to)', upliftPct: 20 },
]

export interface KitchenFit {
  id: string
  name: string
  location: string
  units: Record<UnitKey, number>
  unitSupply: UnitSupply
  range: UnitRange
  /** the provisional sum for all the units, £, when supply is a provisional sum */
  unitsPc: number | null
  /** units come flat-packed and are built on site */
  flatPack: boolean
  worktopMaterial: WorktopMaterial
  worktopLm: number
  /** joints (corners where two lengths meet) and cut-outs (sink, hob, tap holes) in the worktop */
  worktopJoints: number
  cutouts: number
  worktopClientSupplies: boolean
  upstandLm: number
  /** blank = worked out from the base units */
  plinthLm: number | null
  corniceLm: number
  endPanels: number
  /** blank = worked out from the units; we supply the handles or the client does */
  handles: number | null
  weSupplyHandles: boolean
  appliances: Record<ApplianceKey, number>
  /** put the sink bowl in its cut-out and seal it (the plumber connects the tap and waste) */
  sinkFit: boolean
  situationId?: string | null
}

export const emptyUnits = (): Record<UnitKey, number> => ({ base: 0, wall: 0, tall: 0, cornerBase: 0, cornerWall: 0 })
export const emptyAppliances = (): Record<ApplianceKey, number> => ({ fridge: 0, dishwasher: 0, washer: 0, oven: 0, hob: 0, hood: 0, other: 0 })

export interface KitchenKind { id: string; label: string; units: Record<UnitKey, number>; worktopLm: number; joints: number; cutouts: number }
/** The usual run for a size of kitchen: it is only a start, every count can be changed */
export const KITCHEN_KINDS: KitchenKind[] = [
  { id: 'small', label: 'Small kitchen (galley)', units: { base: 5, wall: 4, tall: 1, cornerBase: 0, cornerWall: 0 }, worktopLm: 4.5, joints: 0, cutouts: 2 },
  { id: 'medium', label: 'Medium kitchen (L-shaped)', units: { base: 8, wall: 5, tall: 2, cornerBase: 1, cornerWall: 1 }, worktopLm: 7, joints: 1, cutouts: 2 },
  { id: 'large', label: 'Large kitchen (with an island)', units: { base: 12, wall: 7, tall: 3, cornerBase: 2, cornerWall: 1 }, worktopLm: 12, joints: 2, cutouts: 3 },
  { id: 'utility', label: 'Utility room', units: { base: 3, wall: 2, tall: 1, cornerBase: 0, cornerWall: 0 }, worktopLm: 2.5, joints: 0, cutouts: 1 },
  { id: 'empty', label: 'Start with nothing (type the counts)', units: emptyUnits(), worktopLm: 0, joints: 0, cutouts: 0 },
]
export const KITCHEN_KIND_BY_ID: Record<string, KitchenKind> = Object.fromEntries(KITCHEN_KINDS.map(k => [k.id, k]))

export function newKitchen(id: string, name: string, kindId = 'medium'): KitchenFit {
  const k = KITCHEN_KIND_BY_ID[kindId] ?? KITCHEN_KINDS[1]
  return {
    id, name, location: '', units: { ...k.units }, unitSupply: 'client', range: 'mid', unitsPc: null, flatPack: true,
    worktopMaterial: 'laminate', worktopLm: k.worktopLm, worktopJoints: k.joints, cutouts: k.cutouts, worktopClientSupplies: true,
    upstandLm: 0, plinthLm: null, corniceLm: 0, endPanels: 0, handles: null, weSupplyHandles: false, appliances: emptyAppliances(), sinkFit: false, situationId: null,
  }
}

export const totalUnits = (k: Pick<KitchenFit, 'units'>) => UNIT_KINDS.reduce((s, u) => s + (k.units[u.id] || 0), 0)

export interface KitchenLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface KitchenLabourTask { key: string; roomId: string; trade: 'carpenter' | 'labourer'; task: string; hours: number; basis: string }
export interface KitchenSummary { kitchenId: string; name: string; units: number; worktopLm: number; parts: string[]; hours: number }
export interface KitchenResult {
  lines: KitchenLine[]
  labour: KitchenLabourTask[]
  kitchens: KitchenSummary[]
  totalUnits: number
  totalWorktopLm: number
  totalHours: number
  warnings: string[]
}
export interface KitchenInput {
  kitchens: KitchenFit[]
  jobSituationId: string
  situations: KitchenSituation[]
  rates: Partial<Record<KitchenRateKey, number>>
}

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const rangeIx = (r: UnitRange) => (r === 'budget' ? 0 : r === 'mid' ? 1 : 2)

export function calculateKitchens(input: KitchenInput): KitchenResult {
  const job = input.situations.find(s => s.id === input.jobSituationId) ?? input.situations[0]
  const rate = (k: KitchenRateKey): number => {
    const v = input.rates[k] ?? RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const lines: KitchenLine[] = []
  const labour: KitchenLabourTask[] = []
  const kitchens: KitchenSummary[] = []
  const warnings: string[] = []
  let sumUnits = 0, sumWorktop = 0, sumHours = 0
  let anyClientUnits = false, anyStone = false, anyTimber = false, anyFlat = false, anyClientWorktop = false, anyHob = false, anyHood = false

  for (const k of input.kitchens) {
    const name = k.name.trim() || 'Kitchen'
    const label = `${name}${k.location.trim() ? ` (${k.location.trim()})` : ''}`
    for (const u of UNIT_KINDS) if (!(k.units[u.id] >= 0) || Math.round(k.units[u.id]) !== k.units[u.id]) throw new Error(`${label}: the number of ${u.word}s must be a whole number, 0 or more.`)
    for (const a of APPLIANCES) if (!(k.appliances[a.id] >= 0) || Math.round(k.appliances[a.id]) !== k.appliances[a.id]) throw new Error(`${label}: the number of appliances must be a whole number, 0 or more.`)
    for (const [v, w] of [[k.worktopLm, 'the worktop length'], [k.worktopJoints, 'the worktop joints'], [k.cutouts, 'the cut-outs'], [k.upstandLm, 'the upstand'], [k.corniceLm, 'the cornice'], [k.endPanels, 'the end panels']] as [number, string][]) if (!(v >= 0)) throw new Error(`${label}: ${w} cannot be negative.`)
    if (k.unitsPc !== null && !(k.unitsPc >= 0)) throw new Error(`${label}: the provisional sum cannot be negative.`)
    const sit = input.situations.find(s => s.id === k.situationId) ?? job
    const uplift = 1 + (sit?.upliftPct ?? 0) / 100
    const parts: string[] = []
    const hrs: { what: string; h: number }[] = []
    const addH = (what: string, h: number) => { if (h > 0) hrs.push({ what, h }) }
    const add = (key: string, what: string, unit: string, unitCost: number, q: number, category: KitchenLine['category'] = 'materials') => {
      if (q > 0 && unitCost >= 0) lines.push({ id: `${key}|${k.id}`, name: `${label} — ${what}`, category, unit, unitCost: money(unitCost), qty: +q.toFixed(3), roomId: k.id })
    }
    const nUnits = totalUnits(k)

    // ── the units ───────────────────────────────────────────────────────────────
    if (nUnits > 0) {
      const desc = UNIT_KINDS.filter(u => k.units[u.id] > 0).map(u => `${k.units[u.id]} ${u.word}${k.units[u.id] === 1 ? '' : 's'}`).join(', ')
      if (k.unitSupply === 'we') {
        for (const u of UNIT_KINDS) if (k.units[u.id] > 0) add('unit-' + u.id, `${u.word}s (${RANGE_LABEL[k.range].split(' (')[0].toLowerCase()})`, 'nr', u.price[rangeIx(k.range)], k.units[u.id])
        parts.push(`${desc}, supplied and fitted`)
      } else if (k.unitSupply === 'pc') {
        add('unitspc', 'provisional sum for the kitchen units', 'item', k.unitsPc ?? UNIT_KINDS.reduce((s, u) => s + u.price[1] * k.units[u.id], 0), 1)
        parts.push(`${desc}, fitted (the units are a provisional sum)`)
      } else {
        anyClientUnits = true
        parts.push(`${desc}, supplied by the client or the supplier and fitted by us`)
      }
      for (const u of UNIT_KINDS) addH(`${k.units[u.id]} ${u.word}${k.units[u.id] === 1 ? '' : 's'}`, k.units[u.id] * u.fitHrs)
      if (k.flatPack) {
        anyFlat = true
        for (const u of UNIT_KINDS) if (k.units[u.id] > 0) addH(`building ${k.units[u.id]} ${u.word}${k.units[u.id] === 1 ? '' : 's'} from flat-pack`, k.units[u.id] * u.packHrs)
      }
      addH('setting out, levelling and marking up', HOURS.setOut)
      add('unitsundries', 'brackets, legs, hanging rail, screws and fixings', 'nr', rate('unitSundries'), nUnits)
      add('jobsundries', 'silicone, filler and fixings for the kitchen', 'item', rate('jobSundries'), 1)
      add('skip', 'packaging and offcuts: skip share', 'item', rate('skipShare'), 1)
    }

    // ── the worktops ────────────────────────────────────────────────────────────
    if (k.worktopLm > 0) {
      sumWorktop += k.worktopLm
      const wm = k.worktopMaterial
      const w = WORKTOP_WORD[wm]
      if (wm === 'stone') {
        anyStone = true
        if (!k.worktopClientSupplies) {
          add('worktop', `${w} worktop, templated, made and fitted by a specialist`, 'lm', rate('worktopStone'), k.worktopLm, 'subcontractors')
          if (k.cutouts > 0) add('cutouts', `${w} cut-outs (sink, hob and tap holes)`, 'nr', rate('cutoutStone'), k.cutouts, 'subcontractors')
          add('siliconew', 'silicone to the worktop', 'lm', rate('siliconePerLm'), k.worktopLm)
        }
        addH(`${n1(k.worktopLm)}m of worktop support and checking the units are level`, k.worktopLm * HOURS.stoneSupportPerLm)
        parts.push(`${n1(k.worktopLm)}m of ${w} worktop${k.worktopClientSupplies ? ' (by others)' : ' templated, made and fitted by a specialist'}`)
      } else {
        if (wm === 'timber') anyTimber = true
        if (k.worktopClientSupplies) anyClientWorktop = true
        else {
          add('worktop', `${w} worktop (incl. cutting)`, 'lm', wm === 'laminate' ? rate('worktopLaminate') : rate('worktopTimber'), k.worktopLm * 1.05)
          if (k.worktopJoints > 0) add('jointkit', 'worktop jointing kits', 'nr', rate('jointKit'), k.worktopJoints)
          add('siliconew', 'silicone and sealer to the worktop', 'lm', rate('siliconePerLm'), k.worktopLm)
        }
        addH(`${n1(k.worktopLm)}m of worktop`, k.worktopLm * HOURS.worktopPerLm)
        if (k.worktopJoints > 0) addH(`${k.worktopJoints} worktop joint${k.worktopJoints === 1 ? '' : 's'}`, k.worktopJoints * HOURS.mitre)
        if (k.cutouts > 0) addH(`${k.cutouts} cut-out${k.cutouts === 1 ? '' : 's'}`, k.cutouts * HOURS.cutout)
        parts.push(`${n1(k.worktopLm)}m of ${w} worktop, cut and fitted${k.worktopJoints > 0 ? ` with ${k.worktopJoints} joint${k.worktopJoints === 1 ? '' : 's'}` : ''}${k.cutouts > 0 ? ` and ${k.cutouts} cut-out${k.cutouts === 1 ? '' : 's'}` : ''}${k.worktopClientSupplies ? ' (the worktop supplied by the client)' : ''}`)
      }
    }
    if (k.upstandLm > 0) {
      add('upstand', 'worktop upstand', 'lm', rate('upstandPerLm'), k.upstandLm * 1.05)
      addH(`${n1(k.upstandLm)}m of upstand`, k.upstandLm * HOURS.upstandPerLm)
      parts.push(`${n1(k.upstandLm)}m of upstand`)
    }

    // ── plinth, cornice, end panels, handles ────────────────────────────────────
    const plinth = k.plinthLm ?? (k.units.base + k.units.cornerBase) * PLINTH_PER_BASE_M
    if (plinth > 0) {
      add('plinth', 'plinth (kickboard)', 'lm', rate('plinthPerLm'), plinth * 1.05)
      addH(`${n1(plinth)}m of plinth`, plinth * HOURS.plinthPerLm)
      parts.push(`${n1(plinth)}m of plinth`)
    }
    if (k.corniceLm > 0) {
      add('cornice', 'cornice or pelmet', 'lm', rate('cornicePerLm'), k.corniceLm * 1.05)
      addH(`${n1(k.corniceLm)}m of cornice`, k.corniceLm * HOURS.cornicePerLm)
      parts.push(`${n1(k.corniceLm)}m of cornice and pelmet`)
    }
    if (k.endPanels > 0) {
      add('endpanel', 'end and cover panels', 'nr', rate('endPanel'), k.endPanels)
      addH(`${k.endPanels} end panel${k.endPanels === 1 ? '' : 's'}`, k.endPanels * HOURS.endPanel)
      parts.push(`${k.endPanels} end panel${k.endPanels === 1 ? '' : 's'}`)
    }
    const nHandles = Math.round(k.handles ?? (k.units.base + k.units.wall + k.units.tall + k.units.cornerBase + k.units.cornerWall) * HANDLES_PER_UNIT)
    if (nHandles > 0 && nUnits > 0) {
      if (k.weSupplyHandles) add('handles', 'handles', 'nr', rate('handle'), nHandles)
      addH(`${nHandles} handles`, nHandles * HOURS.handle)
      parts.push(`${nHandles} handles fitted${k.weSupplyHandles ? ' (supplied by us)' : ''}`)
    }

    // ── appliances and the sink ─────────────────────────────────────────────────
    const appBits: string[] = []
    for (const a of APPLIANCES) {
      const c = k.appliances[a.id]
      if (c > 0) { addH(`${c} ${a.word}${c === 1 ? '' : 's'}`, c * a.hrs); appBits.push(`${c} ${a.word}${c === 1 ? '' : 's'}`) }
    }
    if (k.appliances.hob > 0) anyHob = true
    if (k.appliances.hood > 0) anyHood = true
    if (appBits.length > 0) parts.push(`appliances fitted into their housings: ${appBits.join(', ')}`)
    if (k.sinkFit) { addH('setting the sink in its cut-out and sealing it', HOURS.sink); parts.push('the sink set in its cut-out and sealed') }

    // ── the fitter's time, and the labourer who helps ───────────────────────────
    const fitTotal = hrs.reduce((s, x) => s + x.h, 0) * uplift
    const hours = hoursOf(fitTotal)
    if (hours > 0 && (nUnits > 0 || k.worktopLm > 0)) {
      labour.push({ key: `fit|${k.id}`, roomId: k.id, trade: 'carpenter', task: `${label} — kitchen fitting`, hours,
        basis: hrs.map(x => `${x.what} ${n1(x.h)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
      labour.push({ key: `helper|${k.id}`, roomId: k.id, trade: 'labourer', task: `${label} — carry units and lift the worktops`, hours: hoursOf(fitTotal * LABOURER_SHARE), basis: `${Math.round(LABOURER_SHARE * 100)}% of the fitting hours` })
      sumHours += hours
    }
    sumUnits += nUnits
    kitchens.push({ kitchenId: k.id, name: label, units: nUnits, worktopLm: money(k.worktopLm), parts, hours })
    if (nUnits === 0 && k.worktopLm === 0 && appBits.length === 0) warnings.push(`${label}: nothing is set to be fitted yet: add the units or the worktop.`)
    if (k.unitSupply === 'pc' && k.unitsPc === null) warnings.push(`${label}: the provisional sum for the units is a sample worked out from the mid-range prices: type the sum the client has been given.`)
    if (k.worktopLm > 0 && k.worktopMaterial !== 'stone' && k.cutouts === 0) warnings.push(`${label}: no cut-outs are counted in the worktop: a sink and a hob each need one.`)
  }

  if (anyClientUnits) warnings.push('Where the units are delivered by the client or the supplier, check every part is there and undamaged before work starts, and who is responsible for a missing or damaged part.')
  if (anyFlat) warnings.push('Flat-pack units are built on site: the building time is included, and a missing part holds the whole job up.')
  if (anyStone) warnings.push('A stone worktop is templated after the units are fitted and levelled and fitted a week or two later: allow for that in the programme, and the sink and hob must be on site for the templater.')
  if (anyTimber) warnings.push('Solid timber worktops need to acclimatise in the room for about a week and be oiled on all sides and edges before they are fitted.')
  if (anyClientWorktop) warnings.push('Where the client supplies the worktop, check its length, depth and the number of joints before cutting.')
  if (anyHob) warnings.push('Fitting a hob only drops it into the worktop: a gas hob is connected by a Gas Safe engineer and an electric one by an electrician.')
  if (anyHood) warnings.push('An extractor hood needs its ducting and its electrical supply: those are not priced here.')
  if (input.kitchens.length > 0) warnings.push('The sink, tap and appliance plumbing is in Plumbing, the sockets and wiring in Electrics, the splashback in Wall Tiling and the old kitchen coming out in Strip-Out by Room.')
  return { lines, labour, kitchens, totalUnits: sumUnits, totalWorktopLm: money(sumWorktop), totalHours: money(sumHours), warnings: input.kitchens.length === 0 ? [] : warnings }
}
