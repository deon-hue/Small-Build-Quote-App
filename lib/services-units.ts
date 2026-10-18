// Services connections priced by the service (Drainage & Services → Services Connections): a new or diverted supply of water, gas, electricity or telecoms, and cap-offs. Each service is one line with the
// utility, the kind of work (a new connection, a diversion, or a cap-off), and for a new or diverted supply the length of trench from the street or the meter to the building. The utility company (or its approved
// contractor) does the work on its own network and its own side of the meter, and charges for it: that is a provisional sum here, editable. What the builder does is the trench, the duct or pipe laid in it, the sand
// bed and warning tape, backfilling, putting the surface back, and the meter box or chamber. Counts and prices only: the sizes, depths and positions are the utility's to set, and their charges and waiting times vary
// a great deal. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer with each layer's fixedQty set from the
// quantity. All rates are samples to be checked against real prices.

export type Utility = 'water' | 'gas' | 'electric' | 'telecoms'
export type ServiceWork = 'new' | 'divert' | 'cap-off'

export interface UtilityInfo {
  label: string
  /** trench width and depth, m */
  trench: { width: number; depth: number }
  /** what the builder lays in the trench, and its price per metre (£) */
  laid: string
  laidPerLm: number
  /** the meter box, chamber or cabinet the builder supplies and sets, £ */
  box: string
  boxEach: number
  /** the utility's provisional charge for each kind of work, £ */
  charge: Record<ServiceWork, number>
  note: string
}

export const UTILITIES: Record<Utility, UtilityInfo> = {
  water: {
    label: 'Water', trench: { width: 0.45, depth: 0.75 }, laid: '25mm MDPE blue water pipe', laidPerLm: 3.2, box: 'Boundary box or meter chamber with cover', boxEach: 65,
    charge: { new: 1800, divert: 1200, 'cap-off': 120 }, note: 'The water company makes the connection to the main and fits the meter.',
  },
  gas: {
    label: 'Gas', trench: { width: 0.45, depth: 0.75 }, laid: '90mm duct for the gas pipe', laidPerLm: 3.5, box: 'Gas meter box', boxEach: 95,
    charge: { new: 1500, divert: 1800, 'cap-off': 280 }, note: 'The gas network operator lays and connects the pipe, and a Gas Safe engineer must do the work on the building side.',
  },
  electric: {
    label: 'Electricity', trench: { width: 0.45, depth: 0.6 }, laid: '100mm cable duct', laidPerLm: 4.5, box: 'Electricity meter cabinet', boxEach: 140,
    charge: { new: 2500, divert: 2200, 'cap-off': 120 }, note: 'The network operator (or an approved connection contractor) pulls in the cable and connects it; an electrician does the building side.',
  },
  telecoms: {
    label: 'Telecoms and broadband', trench: { width: 0.3, depth: 0.45 }, laid: '50mm duct', laidPerLm: 2.8, box: 'Telecoms chamber', boxEach: 0,
    charge: { new: 600, divert: 400, 'cap-off': 0 }, note: 'The provider pulls in its own cable.',
  },
}

export const WORK_LABEL: Record<ServiceWork, string> = { new: 'New connection', divert: 'Diversion or move', 'cap-off': 'Cap-off' }

export type DigMethod = 'machine' | 'hand'
export type Surface = 'soft' | 'paving' | 'tarmac' | 'concrete'
export const SURFACE_LABEL: Record<Surface, string> = {
  soft: 'Soft ground (grass, soil, planting)', paving: 'Block paving or slabs (lifted and relaid)', tarmac: 'Tarmac', concrete: 'Concrete',
}
export const REINSTATE_PER_M2: Record<Surface, number> = { soft: 3, paving: 8, tarmac: 35, concrete: 48 }
export const SAND_PER_M3 = 34
export const SAND_M3_PER_LM = 0.09           // a 100mm bed and a 100mm cover over a 450mm trench
export const TAPE_PER_LM = 0.4
export const MACHINE_M3_PER_DAY = 35
export const MUCKAWAY_PER_M3 = 28
export const SPOIL_BULKING = 1.3

export interface ServiceItem {
  id: string
  name: string
  utility: Utility
  work: ServiceWork
  /** the trench from the street or meter to the building, m (a cap-off has none) */
  lengthM: number
  dig: DigMethod
  surface: Surface
  /** supply and set the meter box or chamber */
  box: boolean
  /** the utility's charge for this, £, when typed over (null = the sample figure) */
  chargeOverride: number | null
}

export interface ServicesInput { items: ServiceItem[] }

export interface ServiceLine { id: string; name: string; category: 'materials' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number; itemId?: string; wastePct?: number }

export interface ServicesResult {
  lines: ServiceLine[]
  totalLm: number
  machineM3: number
  handM3: number
  excavatorDays: number
  sandM3: number
  backfillM3: number
  spoilAwayM3: number
  reinstateM2: Record<Surface, number>
  boxes: number
  count: number
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateServices(i: ServicesInput): ServicesResult {
  const lines: ServiceLine[] = []
  const warnings: string[] = []
  const reinstateM2: Record<Surface, number> = { soft: 0, paving: 0, tarmac: 0, concrete: 0 }
  let totalLm = 0, machineM3 = 0, handM3 = 0, sandM3 = 0, backfillM3 = 0, spoilM3 = 0, boxes = 0, count = 0
  const noted = new Set<string>()

  for (const s of i.items) {
    const u = UTILITIES[s.utility]
    const sn = s.name.trim() || `${u.label} ${WORK_LABEL[s.work].toLowerCase()}`
    if (!(s.lengthM >= 0)) throw new Error(`The length of "${sn}" cannot be negative.`)
    if (s.chargeOverride !== null && !(s.chargeOverride >= 0)) throw new Error(`The utility charge for "${sn}" cannot be negative.`)
    count++
    const charge = s.chargeOverride ?? u.charge[s.work]
    if (charge > 0 || s.work !== 'cap-off') lines.push({ id: `charge|${s.id}`, name: `${sn} — the ${u.label.toLowerCase()} company's charge (provisional sum)`, category: 'subcontractors', unit: 'item', unitCost: money(charge), qty: 1, itemId: s.id })
    if (!noted.has(s.utility)) { noted.add(s.utility); warnings.push(`${u.label}: ${u.note}`) }
    if (s.work === 'cap-off') continue
    if (s.lengthM === 0) { warnings.push(`"${sn}" has no trench length: give the length from the street or the meter to the building.`); continue }
    const dugPerLm = u.trench.width * u.trench.depth
    const dig = dugPerLm * s.lengthM
    const sand = SAND_M3_PER_LM * s.lengthM * (u.trench.width / 0.45)
    if (s.dig === 'machine') machineM3 += dig; else handM3 += dig
    sandM3 += sand
    backfillM3 += Math.max(dig - sand, 0)
    spoilM3 += sand
    totalLm += s.lengthM
    reinstateM2[s.surface] += u.trench.width * s.lengthM
    lines.push({ id: `laid|${s.id}`, name: `${sn} — ${u.laid}`, category: 'materials', unit: 'lm', unitCost: u.laidPerLm, qty: s.lengthM, wastePct: 5, itemId: s.id })
    lines.push({ id: `sand|${s.id}`, name: `${sn} — sand bed and cover`, category: 'materials', unit: 'm³', unitCost: SAND_PER_M3, qty: round2(sand), wastePct: 5, itemId: s.id })
    lines.push({ id: `tape|${s.id}`, name: `${sn} — warning tape`, category: 'materials', unit: 'lm', unitCost: TAPE_PER_LM, qty: s.lengthM, itemId: s.id })
    lines.push({ id: `reinstate|${s.id}`, name: `${sn} — reinstate the surface: ${SURFACE_LABEL[s.surface].toLowerCase()}`, category: 'materials', unit: 'm²', unitCost: REINSTATE_PER_M2[s.surface], qty: round2(u.trench.width * s.lengthM), itemId: s.id })
    if (s.box && u.boxEach > 0) { boxes++; lines.push({ id: `box|${s.id}`, name: `${sn} — ${u.box.toLowerCase()}`, category: 'materials', unit: 'nr', unitCost: u.boxEach, qty: 1, itemId: s.id }) }
    if (u.trench.depth * 1000 < 450) warnings.push(`"${sn}" is laid shallow: it needs the depth the utility sets, and protection where it is driven over.`)
  }

  const excavatorDays = machineM3 > 0 ? Math.max(0.5, Math.round((machineM3 / MACHINE_M3_PER_DAY) * 2) / 2) : 0
  const spoilAway = round2(spoilM3 * SPOIL_BULKING)
  if (spoilAway > 0) lines.push({ id: 'spoil', name: 'Surplus spoil carted away (the volume the pipes and sand take up, bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: spoilAway })

  if (i.items.length === 0) warnings.push('No services yet. Add the supplies you are connecting, moving or capping off.')
  warnings.push('The utility companies set the positions, depths and sizes, and their charges and waiting times vary a great deal: get their quotes and replace the sample figures. Notice periods can be weeks.')
  return { lines, totalLm: round1(totalLm), machineM3: round1(machineM3), handM3: round1(handM3), excavatorDays, sandM3: round2(sandM3), backfillM3: round2(backfillM3), spoilAwayM3: spoilAway, reinstateM2, boxes, count, warnings }
}

export function servicesSubtotal(lines: ServiceLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost * (1 + (l.wastePct ?? 0) / 100), 0))
}
