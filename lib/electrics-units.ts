// Electrical installation priced room by room. An electrician normally charges a price per point (a socket, a light, a switch...), all in: cable, back
// box, accessory and fitting off. This works out each room's points, a "situation" uplift (refurbishment, occupied house, hard to reach...), special
// fittings (a chandelier, breakfast bar pendants...) as an extra install charge on top of the point, whole-house items (consumer unit, testing and
// certificate, extra circuits), and an optional "by the day" price for a room where per-point doesn't fit. Counts and prices only: the circuit design,
// cable sizes and the certificate are the electrician's. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer with each layer's fixedQty set from the quantity.

export type PointGroup = 'sockets' | 'switches' | 'lighting' | 'appliances' | 'safety' | 'data'

export interface PointType {
  id: string
  name: string
  plural: string
  unit: 'nr' | 'm²'
  /** the all-in price per point or per m², £ — sample rates, editable in the calculator */
  rate: number
  group: PointGroup
}

export const GROUP_LABEL: Record<PointGroup, string> = {
  sockets: 'Sockets', switches: 'Switches', lighting: 'Lighting', appliances: 'Appliances & fans', safety: 'Alarms', data: 'TV & data',
}

export const POINT_TYPES: PointType[] = [
  { id: 'dbl-socket', name: 'Double socket', plural: 'double sockets', unit: 'nr', rate: 65, group: 'sockets' },
  { id: 'sgl-socket', name: 'Single socket', plural: 'single sockets', unit: 'nr', rate: 45, group: 'sockets' },
  { id: 'usb-socket', name: 'USB socket', plural: 'USB sockets', unit: 'nr', rate: 70, group: 'sockets' },
  { id: 'fused-spur', name: 'Fused spur', plural: 'fused spurs', unit: 'nr', rate: 65, group: 'sockets' },
  { id: 'outside-socket', name: 'Outside socket (weatherproof)', plural: 'outside sockets', unit: 'nr', rate: 85, group: 'sockets' },
  { id: '1g-switch', name: '1-gang light switch', plural: '1-gang light switches', unit: 'nr', rate: 50, group: 'switches' },
  { id: '2g-switch', name: '2-gang light switch', plural: '2-gang light switches', unit: 'nr', rate: 50, group: 'switches' },
  { id: '2way-switch', name: '2-way switch', plural: '2-way switches', unit: 'nr', rate: 55, group: 'switches' },
  { id: 'dimmer', name: 'Dimmer switch', plural: 'dimmer switches', unit: 'nr', rate: 60, group: 'switches' },
  { id: 'pull-cord', name: 'Switch / pull cord', plural: 'switches / pull cords', unit: 'nr', rate: 50, group: 'switches' },
  { id: 'downlight', name: 'Downlighter', plural: 'downlighters', unit: 'nr', rate: 70, group: 'lighting' },
  { id: 'pendant', name: 'Pendant light', plural: 'pendant lights', unit: 'nr', rate: 55, group: 'lighting' },
  { id: 'wall-light', name: 'Wall light', plural: 'wall lights', unit: 'nr', rate: 55, group: 'lighting' },
  { id: 'under-cab', name: 'Under-cabinet light strip', plural: 'under-cabinet light strips', unit: 'nr', rate: 55, group: 'lighting' },
  { id: 'led-batten', name: 'LED batten / ceiling fitting', plural: 'LED battens / ceiling fittings', unit: 'nr', rate: 65, group: 'lighting' },
  { id: 'outside-light', name: 'Outside / security light', plural: 'outside / security lights', unit: 'nr', rate: 75, group: 'lighting' },
  { id: 'cooker-switch', name: 'Cooker switch (45A)', plural: 'cooker switches (45A)', unit: 'nr', rate: 85, group: 'appliances' },
  { id: 'extractor', name: 'Extractor fan / hood connection', plural: 'extractor fans / hood connections', unit: 'nr', rate: 90, group: 'appliances' },
  { id: 'towel-rail', name: 'Heated towel rail connection', plural: 'heated towel rail connections', unit: 'nr', rate: 85, group: 'appliances' },
  { id: 'shaver', name: 'Shaver socket', plural: 'shaver sockets', unit: 'nr', rate: 75, group: 'appliances' },
  { id: 'ufh', name: 'Electric underfloor heating mat', plural: 'm² of electric underfloor heating', unit: 'm²', rate: 55, group: 'appliances' },
  { id: 'ev-charger', name: 'EV charge point (7kW)', plural: 'EV charge points (7kW)', unit: 'nr', rate: 650, group: 'appliances' },
  { id: 'smoke', name: 'Smoke detector', plural: 'smoke detectors', unit: 'nr', rate: 45, group: 'safety' },
  { id: 'heat', name: 'Heat detector', plural: 'heat detectors', unit: 'nr', rate: 45, group: 'safety' },
  { id: 'co-alarm', name: 'Carbon monoxide alarm', plural: 'carbon monoxide alarms', unit: 'nr', rate: 45, group: 'safety' },
  { id: 'tv-point', name: 'TV / satellite point', plural: 'TV / satellite points', unit: 'nr', rate: 55, group: 'data' },
  { id: 'data-point', name: 'Data / Ethernet point', plural: 'data / Ethernet points', unit: 'nr', rate: 45, group: 'data' },
]

export const POINT_BY_ID: Record<string, PointType> = Object.fromEntries(POINT_TYPES.map(p => [p.id, p]))

/** A typical set of points for each kind of room — a starting point to adjust, not a design. */
export interface RoomType { id: string; label: string; points: Record<string, number> }

export const ROOM_TYPES: RoomType[] = [
  { id: 'kitchen', label: 'Kitchen', points: { 'dbl-socket': 8, 'fused-spur': 4, 'cooker-switch': 1, downlight: 8, '1g-switch': 1, '2g-switch': 1, extractor: 1, 'data-point': 1, heat: 1 } },
  { id: 'kitchen-diner', label: 'Kitchen / diner / family room', points: { 'dbl-socket': 12, 'fused-spur': 4, 'cooker-switch': 1, downlight: 12, '2g-switch': 2, extractor: 1, 'tv-point': 1, 'data-point': 2, heat: 1 } },
  { id: 'utility', label: 'Utility room', points: { 'dbl-socket': 3, 'fused-spur': 3, downlight: 2, extractor: 1, '1g-switch': 1 } },
  { id: 'living', label: 'Living room', points: { 'dbl-socket': 6, 'usb-socket': 1, 'tv-point': 2, 'data-point': 2, downlight: 6, '2g-switch': 1, '2way-switch': 2 } },
  { id: 'dining', label: 'Dining room', points: { 'dbl-socket': 4, pendant: 1, '1g-switch': 1, 'data-point': 1 } },
  { id: 'study', label: 'Study / home office', points: { 'dbl-socket': 6, 'data-point': 2, downlight: 4, '1g-switch': 1 } },
  { id: 'bedroom', label: 'Bedroom', points: { 'dbl-socket': 4, 'usb-socket': 1, pendant: 1, '1g-switch': 1, '2way-switch': 2, 'tv-point': 1, 'data-point': 1 } },
  { id: 'bathroom', label: 'Bathroom', points: { downlight: 4, shaver: 1, extractor: 1, 'towel-rail': 1, 'pull-cord': 1 } },
  { id: 'ensuite', label: 'En-suite', points: { downlight: 3, shaver: 1, extractor: 1, 'towel-rail': 1, 'pull-cord': 1 } },
  { id: 'cloakroom', label: 'Cloakroom / WC', points: { downlight: 2, extractor: 1, 'pull-cord': 1 } },
  { id: 'hall', label: 'Hall / landing / stairs', points: { 'dbl-socket': 1, downlight: 4, '1g-switch': 1, '2way-switch': 2, smoke: 1 } },
  { id: 'garage', label: 'Garage', points: { 'dbl-socket': 3, 'fused-spur': 1, 'led-batten': 2, '1g-switch': 1 } },
  { id: 'garden-room', label: 'Garden room / outbuilding', points: { 'dbl-socket': 6, 'data-point': 1, downlight: 6, '2g-switch': 1 } },
  { id: 'outside', label: 'Outside', points: { 'outside-socket': 1, 'outside-light': 2 } },
  { id: 'other', label: 'Other room (empty)', points: {} },
]

export const ROOM_TYPE_BY_ID: Record<string, RoomType> = Object.fromEntries(ROOM_TYPES.map(r => [r.id, r]))

/** The job's situation: the uplift (%) added to every point price. Percentages are the estimator's to set. */
export interface Situation { id: string; label: string; upliftPct: number }

export const DEFAULT_SITUATIONS: Situation[] = [
  { id: 'new-build', label: 'New build or extension (open walls and floors)', upliftPct: 0 },
  { id: 'refurb', label: 'Refurbishment (existing walls and floors)', upliftPct: 10 },
  { id: 'occupied', label: 'Occupied house (working round the family)', upliftPct: 15 },
  { id: 'hard', label: 'Hard to reach (steel, vaulted ceilings, solid walls)', upliftPct: 25 },
  { id: 'listed', label: 'Listed building', upliftPct: 20 },
]

/** Special fittings: the point is charged as normal, and fitting a chandelier or similar is an extra install charge on top. */
export interface FittingType { id: string; name: string; plural: string; installRate: number }

export const FITTING_TYPES: FittingType[] = [
  { id: 'chandelier', name: 'Chandelier', plural: 'chandeliers', installRate: 120 },
  { id: 'pendant-cluster', name: 'Pendant cluster / breakfast bar pendants', plural: 'pendant clusters', installRate: 80 },
  { id: 'feature-wall-light', name: 'Feature wall light', plural: 'feature wall lights', installRate: 35 },
  { id: 'picture-light', name: 'Picture light', plural: 'picture lights', installRate: 30 },
  { id: 'led-strip', name: 'LED strip run', plural: 'LED strip runs', installRate: 45 },
  { id: 'feature-fan', name: 'Feature ceiling fan', plural: 'feature ceiling fans', installRate: 90 },
  { id: 'other-fitting', name: 'Other special fitting', plural: 'other special fittings', installRate: 60 },
]

export const FITTING_BY_ID: Record<string, FittingType> = Object.fromEntries(FITTING_TYPES.map(f => [f.id, f]))

/** Whole-house items, charged once (or as many as there are). Only the testing and certificate is in the starting price. */
export interface WholeHouseItem { id: string; name: string; unit: string; rate: number; defaultQty: number }

export const WHOLE_HOUSE_ITEMS: WholeHouseItem[] = [
  { id: 'certificate', name: 'Testing, electrical certificate and Part P notification', unit: 'item', rate: 250, defaultQty: 1 },
  { id: 'consumer-unit', name: 'Consumer unit (new or upgraded, with RCBOs)', unit: 'nr', rate: 550, defaultQty: 0 },
  { id: 'earthing', name: 'Earthing and bonding upgrade', unit: 'item', rate: 120, defaultQty: 0 },
  { id: 'circuit', name: 'New circuit (radial or ring, from the consumer unit)', unit: 'nr', rate: 120, defaultQty: 0 },
  { id: 'shower-circuit', name: 'Shower circuit', unit: 'nr', rate: 180, defaultQty: 0 },
  { id: 'cooker-circuit', name: 'Cooker circuit', unit: 'nr', rate: 150, defaultQty: 0 },
  { id: 'outbuilding', name: 'Supply to an outbuilding or garden room', unit: 'item', rate: 450, defaultQty: 0 },
]

export const WHOLE_HOUSE_BY_ID: Record<string, WholeHouseItem> = Object.fromEntries(WHOLE_HOUSE_ITEMS.map(w => [w.id, w]))

export interface ElectricsFitting {
  id: string
  typeId: string
  /** what it is, in the estimator's words, e.g. "Breakfast bar pendants" */
  name: string
  count: number
  /** 'client' = the client buys the fitting and we only install it; 'us' = we supply it too */
  supply: 'client' | 'us'
  /** the price of the fitting itself when we supply it (a provisional sum), £ each */
  fittingCost: number
}

export interface ElectricsRoom {
  id: string
  name: string
  typeId: string
  /** point type id -> how many (m² for underfloor heating). Only the types listed here are shown for the room. */
  points: Record<string, number>
  /** null = use the job's situation */
  situationId: string | null
  /** 'points' = priced per point; 'days' = one price of electrician days instead */
  mode: 'points' | 'days'
  days: number
  dayRate: number
  fittings: ElectricsFitting[]
}

export interface ElectricsInput {
  rooms: ElectricsRoom[]
  wholeHouse: Record<string, number>
  jobSituationId: string
  situations: Situation[]
  /** the all-in rates in use (point type id, fitting type id, whole-house item id -> £) */
  pointRates: Record<string, number>
  fittingRates: Record<string, number>
  wholeHouseRates: Record<string, number>
}

export interface ElectricsLine {
  id: string
  name: string
  category: 'subcontractors' | 'materials'
  unit: string
  unitCost: number
  qty: number
  roomId?: string
}

export interface ElectricsResult {
  lines: ElectricsLine[]
  roomCount: number
  /** all the points priced per point (underfloor heating counted once per mat) */
  totalPoints: number
  fittingCount: number
  /** per room: points by group, for the drawing */
  roomSummaries: { roomId: string; name: string; points: number; byGroup: Record<PointGroup, number>; fittings: number; uplift: number; mode: 'points' | 'days' }[]
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)

export function calculateElectrics(input: ElectricsInput): ElectricsResult {
  const sit = input.situations.find(s => s.id === input.jobSituationId)
  if (!sit) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The uplift for "${s.label}" must be between -50% and 200%.`)

  const lines: ElectricsLine[] = []
  const roomSummaries: ElectricsResult['roomSummaries'] = []
  const warnings: string[] = []
  let totalPoints = 0, fittingCount = 0

  for (const room of input.rooms) {
    const rs = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!rs) throw new Error(`Choose a situation for ${room.name || 'the room'}.`)
    const uplift = 1 + rs.upliftPct / 100
    const byGroup: Record<PointGroup, number> = { sockets: 0, switches: 0, lighting: 0, appliances: 0, safety: 0, data: 0 }
    let roomPoints = 0, roomFittings = 0
    const rn = room.name.trim() || 'Room'

    if (room.mode === 'days') {
      if (room.days < 0 || room.dayRate < 0) throw new Error(`The days and day rate for ${rn} cannot be negative.`)
      if (room.days > 0) lines.push({ id: `days|${room.id}`, name: `${rn} — electrician by the day`, category: 'subcontractors', unit: 'day', unitCost: money(room.dayRate), qty: room.days, roomId: room.id })
      else warnings.push(`${rn} is priced by the day but no days are entered.`)
    } else {
      for (const pt of POINT_TYPES) {
        const n = room.points[pt.id]
        if (n === undefined) continue
        if (!(n >= 0)) throw new Error(`The number of ${pt.plural} in ${rn} cannot be negative.`)
        if (n === 0) continue
        const base = input.pointRates[pt.id] ?? pt.rate
        if (base < 0) throw new Error(`The rate for ${pt.name} cannot be negative.`)
        lines.push({ id: `pt|${room.id}|${pt.id}`, name: `${rn} — ${pt.name}`, category: 'subcontractors', unit: pt.unit, unitCost: money(base * uplift), qty: n, roomId: room.id })
        byGroup[pt.group] += n
        roomPoints += pt.unit === 'nr' ? n : 1
      }
      if (roomPoints > 80) warnings.push(`${rn} has ${roomPoints} points — check that is right.`)
    }

    for (const f of room.fittings) {
      if (!(f.count >= 0) || !(f.fittingCost >= 0)) throw new Error(`The count and price of "${f.name || 'a special fitting'}" in ${rn} cannot be negative.`)
      if (f.count === 0) continue
      const ft = FITTING_BY_ID[f.typeId]
      const label = f.name.trim() || ft?.name || 'special fitting'
      const rate = input.fittingRates[f.typeId] ?? ft?.installRate ?? 0
      lines.push({ id: `fit|${room.id}|${f.id}`, name: `${rn} — install ${label}${f.supply === 'client' ? ' (client-supplied)' : ''}`, category: 'subcontractors', unit: 'nr', unitCost: money(rate * uplift), qty: f.count, roomId: room.id })
      if (f.supply === 'us') {
        lines.push({ id: `fitmat|${room.id}|${f.id}`, name: `${rn} — ${label} (supplied by us${f.fittingCost > 0 ? '' : ' — price to be added'})`, category: 'materials', unit: 'nr', unitCost: money(f.fittingCost), qty: f.count, roomId: room.id })
        if (!(f.fittingCost > 0)) warnings.push(`The fitting "${label}" in ${rn} is supplied by us but has no price yet.`)
      }
      roomFittings += f.count
    }

    totalPoints += roomPoints
    fittingCount += roomFittings
    roomSummaries.push({ roomId: room.id, name: rn, points: roomPoints, byGroup, fittings: roomFittings, uplift: rs.upliftPct, mode: room.mode })
  }

  for (const w of WHOLE_HOUSE_ITEMS) {
    const n = input.wholeHouse[w.id] ?? 0
    if (!(n >= 0)) throw new Error(`The number of "${w.name}" cannot be negative.`)
    if (n === 0) continue
    const rate = input.wholeHouseRates[w.id] ?? w.rate
    if (rate < 0) throw new Error(`The rate for "${w.name}" cannot be negative.`)
    lines.push({ id: `wh|${w.id}`, name: w.name, category: 'subcontractors', unit: w.unit, unitCost: money(rate), qty: n })
  }

  if ((input.wholeHouse['certificate'] ?? 0) === 0 && lines.length > 0) {
    warnings.push('No testing and electrical certificate is included. Fixed electrical work needs one (Part P) — add it under Whole house.')
  }

  return { lines, roomCount: input.rooms.length, totalPoints, fittingCount, roomSummaries, warnings }
}

/** The £ for the lines (quantity x unit cost, no profit) — used by the hand tests and to show a subtotal. */
export function electricsSubtotal(lines: ElectricsLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
