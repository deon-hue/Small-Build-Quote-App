// Plumbing priced room by room. A plumber normally charges a price per fitting, all in: the hot, cold and waste pipework to it, the fittings, and fixing it (first and second fix). This works out each room's
// fittings, a "situation" uplift (refurbishment, occupied house, solid floors...), special fittings (a freestanding bath, a wet room, a boiling water tap...) as an extra install charge on top of the fitting,
// whole-house items (pressure test and commissioning, stop tap, new main, manifold), an optional "by the day" price for a room where per-fitting doesn't fit, and whether we supply the sanitaryware
// and radiators (a provisional sum for each, per room) or the client does. Counts and prices only: the pipe sizes, the system design, the hot water and heating plant (boiler, cylinder, heat pump)
// and Gas Safe work are not here. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer with each
// layer's fixedQty set from the quantity.

import type { PipeSummary } from './pipe-network'

export type FittingGroup = 'sanitaryware' | 'kitchen' | 'heating' | 'outside'

export interface FittingType {
  id: string
  name: string
  plural: string
  /** the all-in price to install one (pipework, fittings, first and second fix), £ — sample rates, editable in the calculator */
  rate: number
  /** the provisional sum for the item itself when we supply it, £ each (0 = nothing to supply: an appliance connection) */
  pcSum: number
  group: FittingGroup
}

export const GROUP_LABEL: Record<FittingGroup, string> = {
  sanitaryware: 'Bathroom fittings', kitchen: 'Kitchen and utility', heating: 'Radiators and towel rails', outside: 'Outside',
}

export const FITTING_TYPES: FittingType[] = [
  { id: 'bath', name: 'Bath (with taps)', plural: 'baths', rate: 140, pcSum: 250, group: 'sanitaryware' },
  { id: 'shower-valve', name: 'Shower valve and kit', plural: 'shower valves', rate: 150, pcSum: 280, group: 'sanitaryware' },
  { id: 'shower-tray', name: 'Shower tray and enclosure', plural: 'shower trays and enclosures', rate: 120, pcSum: 380, group: 'sanitaryware' },
  { id: 'basin', name: 'Wash basin (with taps)', plural: 'wash basins', rate: 95, pcSum: 120, group: 'sanitaryware' },
  { id: 'wc', name: 'WC', plural: 'WCs', rate: 95, pcSum: 180, group: 'sanitaryware' },
  { id: 'bidet', name: 'Bidet', plural: 'bidets', rate: 95, pcSum: 150, group: 'sanitaryware' },
  { id: 'floor-drain', name: 'Floor drain / gully (wet room)', plural: 'floor drains', rate: 120, pcSum: 0, group: 'sanitaryware' },
  { id: 'kitchen-sink', name: 'Kitchen sink and taps', plural: 'kitchen sinks', rate: 110, pcSum: 220, group: 'kitchen' },
  { id: 'utility-sink', name: 'Utility sink and taps', plural: 'utility sinks', rate: 90, pcSum: 150, group: 'kitchen' },
  { id: 'washing-machine', name: 'Washing machine connection', plural: 'washing machine connections', rate: 55, pcSum: 0, group: 'kitchen' },
  { id: 'dishwasher', name: 'Dishwasher connection', plural: 'dishwasher connections', rate: 55, pcSum: 0, group: 'kitchen' },
  { id: 'fridge-supply', name: 'Water supply for a fridge / freezer', plural: 'fridge / freezer water supplies', rate: 60, pcSum: 0, group: 'kitchen' },
  { id: 'softener', name: 'Water softener (installation)', plural: 'water softeners', rate: 180, pcSum: 0, group: 'kitchen' },
  { id: 'radiator', name: 'Radiator (pipework, valves and TRV)', plural: 'radiators', rate: 85, pcSum: 95, group: 'heating' },
  { id: 'towel-rail', name: 'Heated towel rail (plumbed)', plural: 'heated towel rails', rate: 90, pcSum: 120, group: 'heating' },
  { id: 'outside-tap', name: 'Outside tap', plural: 'outside taps', rate: 75, pcSum: 25, group: 'outside' },
]

export const FITTING_BY_ID: Record<string, FittingType> = Object.fromEntries(FITTING_TYPES.map(f => [f.id, f]))

/** A typical set of fittings for each kind of room — a starting point to adjust, not a design. */
export interface RoomType { id: string; label: string; fittings: Record<string, number> }

export const ROOM_TYPES: RoomType[] = [
  { id: 'kitchen', label: 'Kitchen', fittings: { 'kitchen-sink': 1, 'washing-machine': 1, dishwasher: 1, 'fridge-supply': 1, radiator: 1 } },
  { id: 'kitchen-diner', label: 'Kitchen / diner / family room', fittings: { 'kitchen-sink': 1, 'washing-machine': 1, dishwasher: 1, 'fridge-supply': 1, radiator: 2 } },
  { id: 'utility', label: 'Utility room', fittings: { 'utility-sink': 1, 'washing-machine': 1, radiator: 1 } },
  { id: 'bathroom', label: 'Bathroom', fittings: { bath: 1, 'shower-valve': 1, 'shower-tray': 1, basin: 1, wc: 1, 'towel-rail': 1 } },
  { id: 'ensuite', label: 'En-suite', fittings: { 'shower-valve': 1, 'shower-tray': 1, basin: 1, wc: 1, 'towel-rail': 1 } },
  { id: 'cloakroom', label: 'Cloakroom / WC', fittings: { basin: 1, wc: 1 } },
  { id: 'living', label: 'Living room', fittings: { radiator: 2 } },
  { id: 'dining', label: 'Dining room', fittings: { radiator: 1 } },
  { id: 'study', label: 'Study / home office', fittings: { radiator: 1 } },
  { id: 'bedroom', label: 'Bedroom', fittings: { radiator: 1 } },
  { id: 'hall', label: 'Hall / landing', fittings: { radiator: 1 } },
  { id: 'garage', label: 'Garage', fittings: { 'utility-sink': 1 } },
  { id: 'outside', label: 'Outside', fittings: { 'outside-tap': 1 } },
  { id: 'other', label: 'Other room (empty)', fittings: {} },
]

export const ROOM_TYPE_BY_ID: Record<string, RoomType> = Object.fromEntries(ROOM_TYPES.map(r => [r.id, r]))

/** The job's situation: the uplift (%) added to every fitting price. Percentages are the estimator's to set. */
export interface Situation { id: string; label: string; upliftPct: number }

export const DEFAULT_SITUATIONS: Situation[] = [
  { id: 'new-build', label: 'New build or extension (open walls and floors)', upliftPct: 0 },
  { id: 'refurb', label: 'Refurbishment (existing walls and floors)', upliftPct: 10 },
  { id: 'occupied', label: 'Occupied house (working round the family)', upliftPct: 15 },
  { id: 'hard', label: 'Hard to reach (solid floors, long pipe runs, no void)', upliftPct: 25 },
  { id: 'listed', label: 'Listed building', upliftPct: 20 },
]

/** Special fittings: the fitting is charged as normal, and a freestanding bath or similar is an extra install charge on top. */
export interface SpecialType { id: string; name: string; plural: string; installRate: number }

export const SPECIAL_TYPES: SpecialType[] = [
  { id: 'freestanding-bath', name: 'Freestanding bath (floor-standing filler)', plural: 'freestanding baths', installRate: 120 },
  { id: 'wet-room', name: 'Wet room (former, drain and tanking connections)', plural: 'wet rooms', installRate: 220 },
  { id: 'rainfall-shower', name: 'Large rainfall or body-jet shower', plural: 'large showers', installRate: 150 },
  { id: 'wall-hung-wc', name: 'Wall-hung WC with concealed frame', plural: 'wall-hung WCs', installRate: 90 },
  { id: 'boiling-tap', name: 'Boiling water tap', plural: 'boiling water taps', installRate: 150 },
  { id: 'macerator', name: 'Macerator (WC without a soil pipe)', plural: 'macerators', installRate: 160 },
  { id: 'designer-radiator', name: 'Designer or column radiator', plural: 'designer radiators', installRate: 40 },
  { id: 'other-fitting', name: 'Other special fitting', plural: 'other special fittings', installRate: 60 },
]

export const SPECIAL_BY_ID: Record<string, SpecialType> = Object.fromEntries(SPECIAL_TYPES.map(f => [f.id, f]))

/** Whole-house items, charged once (or as many as there are). Only the pressure test and commissioning is in the starting price. */
export interface WholeHouseItem { id: string; name: string; unit: string; rate: number; defaultQty: number }

export const WHOLE_HOUSE_ITEMS: WholeHouseItem[] = [
  { id: 'pressure-test', name: 'Pressure test and commissioning of the pipework', unit: 'item', rate: 150, defaultQty: 1 },
  { id: 'stop-tap', name: 'Stop tap and isolation valves', unit: 'item', rate: 180, defaultQty: 0 },
  { id: 'mains-supply', name: 'New water main to the house (excluding groundworks)', unit: 'item', rate: 900, defaultQty: 0 },
  { id: 'manifold', name: 'Plumbing manifold with isolation valves', unit: 'nr', rate: 420, defaultQty: 0 },
  { id: 'booster-pump', name: 'Pressure booster pump', unit: 'nr', rate: 650, defaultQty: 0 },
]

export const WHOLE_HOUSE_BY_ID: Record<string, WholeHouseItem> = Object.fromEntries(WHOLE_HOUSE_ITEMS.map(w => [w.id, w]))

export interface PlumbingSpecial {
  id: string
  typeId: string
  /** what it is, in the estimator's words, e.g. "Freestanding bath in the master en-suite" */
  name: string
  count: number
  /** 'client' = the client buys it and we only install it; 'us' = we supply it too */
  supply: 'client' | 'us'
  /** the price of the item itself when we supply it (a provisional sum), £ each */
  itemCost: number
}

export interface PlumbingRoom {
  id: string
  name: string
  typeId: string
  /** fitting type id -> how many. Only the types listed here are shown for the room. */
  fittings: Record<string, number>
  /** null = use the job's situation */
  situationId: string | null
  /** 'fittings' = priced per fitting; 'days' = one price of plumber days instead */
  mode: 'fittings' | 'days'
  days: number
  dayRate: number
  /** who buys the sanitaryware, taps and radiators in this room: 'us' adds a provisional sum for each, 'client' leaves them out */
  supply: 'client' | 'us'
  specials: PlumbingSpecial[]
  /** the room on the Take-off plan this one was made from (a room's fittings do not depend on its size, so it only remembers which) */
  planRoomId?: string
  /** the name the fittings placed on the plan are matched to this room by (lower case) */
  planName?: string
  /** the fittings placed on the plan for this room, by fitting type id, as they were last fed in: a count follows the plan until it is typed over */
  placedCounts?: Record<string, number>
  /** the radiators placed on the plan for this room with their sizes: the ones we supply are priced by size */
  radiators?: { id: string; label: string; watts: number }[]
  /** the heated towel rails placed on the plan for this room */
  towelRails?: { id: string; watts: number }[]
  /** every fitting placed on the plan in this room, one by one: who supplies it and which product, when those were chosen (a fitting with neither follows the room) */
  placedItems?: { id: string; typeId: string; supply?: 'us' | 'client'; name?: string; cost?: number }[]
}

/** Heating pipework drawn on the Take-off plan, from the radiators and the boiler: pipe by size, elbows and tees, priced by the metre and each. Sample rates to check against your supplier and plumber. */
export type PipeMaterial = 'copper' | 'plastic'
export const PIPE_MATERIAL_LABEL: Record<PipeMaterial, string> = { copper: 'Copper', plastic: 'Plastic (multilayer, push-fit)' }
export const PIPE_SIZE_LIST = [15, 22, 28, 35]
/** materials: £ per metre of pipe, £ each for an elbow and for an equal tee, by material and size; a bend is priced as an elbow and a reducing tee at 25% more than the equal tee of its larger size */
export const DEFAULT_PIPE_RATES: Record<PipeMaterial, Record<string, { pipe: number; elbow: number; tee: number }>> = {
  copper: { '15': { pipe: 4.2, elbow: 0.9, tee: 1.6 }, '22': { pipe: 9.5, elbow: 2.6, tee: 4.2 }, '28': { pipe: 16, elbow: 6.5, tee: 10 }, '35': { pipe: 26, elbow: 14, tee: 22 } },
  plastic: { '15': { pipe: 2.4, elbow: 2.2, tee: 3.4 }, '22': { pipe: 5.2, elbow: 4.5, tee: 7 }, '28': { pipe: 9, elbow: 9, tee: 14 }, '35': { pipe: 14, elbow: 20, tee: 30 } },
}
/** the plumber: £ per metre of pipe laid and clipped, by size, and £ for each joint made (a copper joint is slower than a push-fit one) */
export const DEFAULT_PIPE_LABOUR_PER_M: Record<string, number> = { '15': 14, '22': 17, '28': 20, '35': 24 }
export const DEFAULT_JOINT_LABOUR: Record<PipeMaterial, number> = { copper: 6, plastic: 3.5 }
const JOINTS_PER: Record<string, number> = { elbow: 2, bend45: 2, tee: 3, 'reducing-tee': 3 }
const FITTING_NAME: Record<string, string> = { elbow: 'elbow', bend45: '45° bend', tee: 'equal tee', 'reducing-tee': 'reducing tee' }

export interface PipeCostInput {
  summary: PipeSummary
  material: PipeMaterial
  /** extra pipe over the straight lengths drawn (the real route, offcuts), % */
  allowancePct: number
  /** pipe up to or down to each radiator from the floor or ceiling: metres of EACH of flow and return, per radiator */
  risePerRadiatorM: number
  /** pipe that is not on the plan (risers between floors, boiler to the first run): metres of run, flow and return both laid, and its size */
  extraM: number
  extraSizeMm: number
  /** the part of a radiator's all-in price that is its pipework: taken off a radiator that is connected by pipes drawn on the plan, so it is not paid twice */
  radiatorPipeworkIn: number
  /** clips, solder or flux, insulation sleeves: % on the pipe and fittings */
  sundriesPct: number
  /** rates typed over the defaults: 'pipe|copper|22', 'elbow|copper|22', 'tee|copper|22', 'labm|22', 'joint|copper' */
  rates: Record<string, number>
}

export interface PlumbingInput {
  /** heating pipe runs drawn on the plan: priced in addition to the rooms (leave out for none) */
  pipes?: PipeCostInput
  rooms: PlumbingRoom[]
  wholeHouse: Record<string, number>
  jobSituationId: string
  situations: Situation[]
  /** the all-in rates in use (fitting type id, special type id, whole-house item id -> £) */
  fittingRates: Record<string, number>
  specialRates: Record<string, number>
  wholeHouseRates: Record<string, number>
  /** the provisional sums in use for items we supply (fitting type id -> £ each) */
  pcRates: Record<string, number>
  /** £ per kW of output for a radiator we supply that was placed on the plan with a size (55 if not given) */
  radiatorPcPerKw?: number
}

export interface PlumbingLine {
  id: string
  name: string
  category: 'subcontractors' | 'materials'
  unit: string
  unitCost: number
  qty: number
  roomId?: string
}

export interface PlumbingResult {
  lines: PlumbingLine[]
  roomCount: number
  /** all the fittings priced per fitting */
  totalFittings: number
  specialCount: number
  /** per room: fittings by group, for the drawing */
  roomSummaries: { roomId: string; name: string; fittings: number; byGroup: Record<FittingGroup, number>; specials: number; uplift: number; mode: 'fittings' | 'days'; supply: 'client' | 'us' }[]
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)

export function calculatePlumbing(input: PlumbingInput): PlumbingResult {
  const sit = input.situations.find(s => s.id === input.jobSituationId)
  if (!sit) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The uplift for "${s.label}" must be between -50% and 200%.`)

  const lines: PlumbingLine[] = []
  const roomSummaries: PlumbingResult['roomSummaries'] = []
  const warnings: string[] = []
  let totalFittings = 0, specialCount = 0
  const connectedIds = new Set(input.pipes?.summary.connectedRadiatorIds ?? [])

  for (const room of input.rooms) {
    const rs = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!rs) throw new Error(`Choose a situation for ${room.name || 'the room'}.`)
    const uplift = 1 + rs.upliftPct / 100
    const byGroup: Record<FittingGroup, number> = { sanitaryware: 0, kitchen: 0, heating: 0, outside: 0 }
    let roomFittings = 0, roomSpecials = 0
    const rn = room.name.trim() || 'Room'

    if (room.mode === 'days') {
      if (room.days < 0 || room.dayRate < 0) throw new Error(`The days and day rate for ${rn} cannot be negative.`)
      if (room.days > 0) lines.push({ id: `days|${room.id}`, name: `${rn} — plumber by the day`, category: 'subcontractors', unit: 'day', unitCost: money(room.dayRate), qty: room.days, roomId: room.id })
      else warnings.push(`${rn} is priced by the day but no days are entered.`)
    } else {
      for (const ft of FITTING_TYPES) {
        const n = room.fittings[ft.id]
        if (n === undefined) continue
        if (!(n >= 0)) throw new Error(`The number of ${ft.plural} in ${rn} cannot be negative.`)
        if (n === 0) continue
        const base = input.fittingRates[ft.id] ?? ft.rate
        if (base < 0) throw new Error(`The rate for ${ft.name} cannot be negative.`)
        // a radiator whose pipes are drawn on the plan is paid for without its pipework (that is priced by the metre and fitting below)
        const pipedList = ft.id === 'radiator' ? room.radiators : ft.id === 'towel-rail' ? room.towelRails : undefined
        const piped = pipedList && input.pipes ? pipedList.slice(0, n).filter(rad => connectedIds.has(rad.id)).length : 0
        if (n - piped > 0) lines.push({ id: `fit|${room.id}|${ft.id}`, name: `${rn} — ${ft.name}`, category: 'subcontractors', unit: 'nr', unitCost: money(base * uplift), qty: n - piped, roomId: room.id })
        if (piped > 0) lines.push({ id: `fitpiped|${room.id}|${ft.id}`, name: `${rn} — ${ft.id === 'towel-rail' ? 'heated towel rail' : 'radiator'}, fixing and connecting (pipework drawn on the plan)`, category: 'subcontractors', unit: 'nr', unitCost: money(Math.max(0, base - (input.pipes?.radiatorPipeworkIn ?? 0)) * uplift), qty: piped, roomId: room.id })
        const pc = input.pcRates[ft.id] ?? ft.pcSum
        const placed = (room.placedItems ?? []).filter(x => x.typeId === ft.id).slice(0, n)
        if (placed.length > 0) {
          // fittings placed on the plan one by one: each says who supplies it (else the room does) and, if we do, its product and cost; with no product it is the usual sum (a radiator by its size)
          for (const it of placed) {
            if ((it.supply ?? room.supply) !== 'us') continue
            const rad = ft.id === 'radiator' ? (room.radiators ?? []).find(r => r.id === it.id) : undefined
            const price = it.cost !== undefined && it.cost > 0 ? it.cost : rad && rad.watts > 0 ? (input.radiatorPcPerKw ?? 55) * rad.watts / 1000 : pc
            if (!(price > 0)) continue
            const what = it.name ? it.name : rad && rad.watts > 0 ? `radiator ${rad.label}` : ft.name.replace(/ \(.*\)$/, '')
            lines.push({ id: `pci|${room.id}|${it.id}`, name: `${rn} — ${what} (supplied by us${it.name ? '' : rad && rad.watts > 0 ? ' — PC sum by size' : ' — PC sum'})`, category: 'materials', unit: 'nr', unitCost: money(price), qty: 1, roomId: room.id })
          }
          if (n - placed.length > 0 && room.supply === 'us' && pc > 0) lines.push({ id: `pc|${room.id}|${ft.id}`, name: `${rn} — ${ft.name.replace(/ \(.*\)$/, '')} (supplied by us — PC sum)`, category: 'materials', unit: 'nr', unitCost: money(pc), qty: n - placed.length, roomId: room.id })
        } else if (room.supply === 'us' && pc > 0) {
          // a radiator placed on the plan has a size, so one we supply is priced by its output; the rest of the room's radiators are the usual provisional sum each
          const sized = ft.id === 'radiator' ? (room.radiators ?? []).slice(0, n).filter(rad => rad.watts > 0) : []   // (one with no size, as the AI quote makes, is just a radiator at the usual sum)
          if (n - sized.length > 0) lines.push({ id: `pc|${room.id}|${ft.id}`, name: `${rn} — ${ft.name.replace(/ \(.*\)$/, '')} (supplied by us — PC sum)`, category: 'materials', unit: 'nr', unitCost: money(pc), qty: n - sized.length, roomId: room.id })
          for (const rad of sized) lines.push({ id: `pcr|${room.id}|${rad.id}`, name: `${rn} — radiator ${rad.label} (supplied by us — PC sum by size)`, category: 'materials', unit: 'nr', unitCost: money((input.radiatorPcPerKw ?? 55) * Math.max(0, rad.watts) / 1000), qty: 1, roomId: room.id })
        }
        byGroup[ft.group] += n
        roomFittings += n
      }
      if (roomFittings > 60) warnings.push(`${rn} has ${roomFittings} fittings — check that is right.`)
    }

    for (const f of room.specials) {
      if (!(f.count >= 0) || !(f.itemCost >= 0)) throw new Error(`The count and price of "${f.name || 'a special fitting'}" in ${rn} cannot be negative.`)
      if (f.count === 0) continue
      const st = SPECIAL_BY_ID[f.typeId]
      const label = f.name.trim() || st?.name || 'special fitting'
      const rate = input.specialRates[f.typeId] ?? st?.installRate ?? 0
      lines.push({ id: `spec|${room.id}|${f.id}`, name: `${rn} — install ${label}${f.supply === 'client' ? ' (client-supplied)' : ''}`, category: 'subcontractors', unit: 'nr', unitCost: money(rate * uplift), qty: f.count, roomId: room.id })
      if (f.supply === 'us') {
        lines.push({ id: `specmat|${room.id}|${f.id}`, name: `${rn} — ${label} (supplied by us${f.itemCost > 0 ? '' : ' — price to be added'})`, category: 'materials', unit: 'nr', unitCost: money(f.itemCost), qty: f.count, roomId: room.id })
        if (!(f.itemCost > 0)) warnings.push(`The special fitting "${label}" in ${rn} is supplied by us but has no price yet.`)
      }
      roomSpecials += f.count
    }

    totalFittings += roomFittings
    specialCount += roomSpecials
    roomSummaries.push({ roomId: room.id, name: rn, fittings: roomFittings, byGroup, specials: roomSpecials, uplift: rs.upliftPct, mode: room.mode, supply: room.supply })
  }

  if (input.pipes && (input.pipes.summary.runCount > 0 || input.pipes.extraM > 0)) priceHeatingPipework(input.pipes, 1 + sit.upliftPct / 100, lines, warnings)

  for (const w of WHOLE_HOUSE_ITEMS) {
    const n = input.wholeHouse[w.id] ?? 0
    if (!(n >= 0)) throw new Error(`The number of "${w.name}" cannot be negative.`)
    if (n === 0) continue
    const rate = input.wholeHouseRates[w.id] ?? w.rate
    if (rate < 0) throw new Error(`The rate for "${w.name}" cannot be negative.`)
    lines.push({ id: `wh|${w.id}`, name: w.name, category: 'subcontractors', unit: w.unit, unitCost: money(rate), qty: n })
  }

  if ((input.wholeHouse['pressure-test'] ?? 0) === 0 && lines.length > 0) {
    warnings.push('No pressure test and commissioning is included. New pipework should be tested before it is covered — add it under Whole house.')
  }

  return { lines, roomCount: input.rooms.length, totalFittings, specialCount, roomSummaries, warnings }
}

/** The heating pipework drawn on the plan: pipe by size (flow and return), each elbow and tee, the plumber's time, and sundries. */
function priceHeatingPipework(p: PipeCostInput, uplift: number, lines: PlumbingLine[], warnings: string[]) {
  if (!(p.allowancePct >= 0) || !(p.risePerRadiatorM >= 0) || !(p.extraM >= 0) || !(p.sundriesPct >= 0)) throw new Error('The pipework allowance, rises, extra pipe and sundries cannot be negative.')
  const mat = p.material
  const rate = (kind: 'pipe' | 'elbow' | 'tee', size: number) => p.rates[`${kind}|${mat}|${size}`] ?? DEFAULT_PIPE_RATES[mat][String(size)]?.[kind] ?? 0
  const labm = (size: number) => p.rates[`labm|${size}`] ?? DEFAULT_PIPE_LABOUR_PER_M[String(size)] ?? 0
  const joint = p.rates[`joint|${mat}`] ?? DEFAULT_JOINT_LABOUR[mat]
  const label = PIPE_MATERIAL_LABEL[mat].replace(/ \(.*\)$/, '').toLowerCase()
  // metres of pipe laid, flow AND return, by size: the drawn length with its allowance, the rise to each radiator (15mm), and any pipe that is not on the plan
  const metres: Record<string, number> = {}
  for (const [k, v] of Object.entries(p.summary.lengthBySize)) metres[k] = (metres[k] ?? 0) + v * 2 * (1 + p.allowancePct / 100)
  metres['15'] = (metres['15'] ?? 0) + p.summary.connectedRadiatorIds.length * 2 * p.risePerRadiatorM
  if (p.extraM > 0) metres[String(p.extraSizeMm)] = (metres[String(p.extraSizeMm)] ?? 0) + p.extraM * 2
  let materials = 0
  for (const size of PIPE_SIZE_LIST) {
    const m = metres[String(size)] ?? 0
    if (!(m > 0)) continue
    const q = +m.toFixed(1)
    lines.push({ id: `pipe|${size}`, name: `Heating pipe ${size}mm ${label}, flow and return (from the plan)`, category: 'materials', unit: 'm', unitCost: money(rate('pipe', size)), qty: q })
    lines.push({ id: `pipelab|${size}`, name: `Plumber: lay and clip ${size}mm heating pipe`, category: 'subcontractors', unit: 'm', unitCost: money(labm(size) * uplift), qty: q })
    materials += q * rate('pipe', size)
  }
  let joints = 0
  for (const f of p.summary.fittings) {
    const each = f.kind === 'reducing-tee' ? rate('tee', f.sizeMm) * 1.25 : f.kind === 'tee' ? rate('tee', f.sizeMm) : rate('elbow', f.sizeMm)
    const qty = f.count * 2   // one in the flow, one in the return
    const size = f.kind === 'reducing-tee' && f.branchMm ? `${f.sizeMm}x${f.branchMm}mm` : `${f.sizeMm}mm`
    lines.push({ id: `pipefit|${f.kind}|${f.sizeMm}|${f.branchMm ?? 0}`, name: `${size} ${label} ${FITTING_NAME[f.kind]} (heating pipework)`, category: 'materials', unit: 'nr', unitCost: money(each), qty })
    materials += qty * each
    joints += qty * (JOINTS_PER[f.kind] ?? 2)
  }
  if (joints > 0) lines.push({ id: 'pipejoints', name: `Plumber: make ${joints} ${label} joints`, category: 'subcontractors', unit: 'nr', unitCost: money(joint * uplift), qty: joints })
  if (materials > 0 && p.sundriesPct > 0) lines.push({ id: 'pipesundries', name: 'Pipe clips, flux or solder, sleeves and sundries', category: 'materials', unit: 'item', unitCost: money(materials * p.sundriesPct / 100), qty: 1 })
  for (const w of p.summary.warnings) warnings.push('Heating pipework: ' + w)
  if (!(p.summary.totalLengthM > 0) && p.extraM <= 0) warnings.push('Heating pipework: no pipe is drawn on the plan yet.')
}

/** The £ for the lines (quantity x unit cost, no profit) — used by the hand tests and to show a subtotal. */
export function plumbingSubtotal(lines: PlumbingLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
