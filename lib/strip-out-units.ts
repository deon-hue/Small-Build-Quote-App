// Strip-out priced room by room (Demolition → Strip-Out by Room). Each room has a kind, a floor area and a ceiling height, and a list of what comes out: floor coverings, the ceiling, wall linings and tiles,
// skirtings, doors, kitchen units and worktops, sanitaryware and radiators. A new room comes with the usual set for its kind, worked out from its size (a kitchen has units, tiles and a radiator; a bathroom a bath, basin
// and WC), and every count can be changed. Each item takes a labourer so many hours and makes so much loose waste, which fills skips. Services to disconnect (a plumber, an electrician) and dust protection are
// optional per room; an asbestos survey is an optional extra for older buildings. Counts and prices only. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen
// costs the lines it returns through the shared costLayer with each layer's fixedQty set from the quantity. All rates and hours are samples to be checked against real jobs.

export type StripGroup = 'floor' | 'ceiling' | 'walls' | 'joinery' | 'kitchen' | 'sanitary'
export const STRIP_GROUP_LABEL: Record<StripGroup, string> = {
  floor: 'Floors', ceiling: 'Ceilings', walls: 'Walls', joinery: 'Doors and woodwork', kitchen: 'Kitchen', sanitary: 'Bathroom and heating',
}

export interface StripItemType {
  id: string
  name: string
  /** the unit the count is in */
  unit: 'm²' | 'lm' | 'nr'
  /** labourer hours for each unit, taking it out and loading it */
  hours: number
  /** loose waste made by each unit, m³ */
  wasteM3: number
  group: StripGroup
  note?: string
}

export const STRIP_ITEMS: StripItemType[] = [
  { id: 'floor-carpet', name: 'Carpet and underlay', unit: 'm²', hours: 0.08, wasteM3: 0.02, group: 'floor' },
  { id: 'floor-vinyl', name: 'Vinyl or lino floor', unit: 'm²', hours: 0.12, wasteM3: 0.01, group: 'floor', note: 'Old vinyl and its adhesive can contain asbestos: check before it is lifted.' },
  { id: 'floor-laminate', name: 'Laminate or engineered floor', unit: 'm²', hours: 0.10, wasteM3: 0.02, group: 'floor' },
  { id: 'floor-tiles', name: 'Floor tiles (and adhesive)', unit: 'm²', hours: 0.6, wasteM3: 0.06, group: 'floor' },
  { id: 'floor-boards', name: 'Floorboards or chipboard (lifted)', unit: 'm²', hours: 0.3, wasteM3: 0.04, group: 'floor' },
  { id: 'ceiling-pb', name: 'Plasterboard ceiling', unit: 'm²', hours: 0.35, wasteM3: 0.04, group: 'ceiling' },
  { id: 'ceiling-lath', name: 'Lath and plaster ceiling', unit: 'm²', hours: 0.7, wasteM3: 0.07, group: 'ceiling', note: 'Very dusty: protect the rooms next to it.' },
  { id: 'ceiling-textured', name: 'Textured coating scraped off (Artex)', unit: 'm²', hours: 0.2, wasteM3: 0.01, group: 'ceiling', note: 'Textured coatings in buildings before 2000 can contain asbestos: test before scraping or sanding.' },
  { id: 'wall-plaster', name: 'Plaster hacked off the walls', unit: 'm²', hours: 0.45, wasteM3: 0.05, group: 'walls' },
  { id: 'wall-tiles', name: 'Wall tiles', unit: 'm²', hours: 0.55, wasteM3: 0.06, group: 'walls' },
  { id: 'wall-drylining', name: 'Dry-lining or plasterboard to walls', unit: 'm²', hours: 0.3, wasteM3: 0.04, group: 'walls' },
  { id: 'wall-paper', name: 'Wallpaper stripped', unit: 'm²', hours: 0.12, wasteM3: 0.003, group: 'walls' },
  { id: 'skirting', name: 'Skirting boards', unit: 'lm', hours: 0.08, wasteM3: 0.005, group: 'joinery' },
  { id: 'door', name: 'Internal door and lining', unit: 'nr', hours: 0.4, wasteM3: 0.15, group: 'joinery' },
  { id: 'window', name: 'Window taken out (with its board)', unit: 'nr', hours: 0.8, wasteM3: 0.12, group: 'joinery' },
  { id: 'door-ext', name: 'External door taken out (with its frame)', unit: 'nr', hours: 1.2, wasteM3: 0.25, group: 'joinery' },
  { id: 'door-patio', name: 'Patio, French or bi-fold doors taken out', unit: 'nr', hours: 2.5, wasteM3: 0.6, group: 'joinery', note: 'Large glazed units are heavy: two people, and a way to carry them out.' },
  { id: 'stairs', name: 'Staircase taken out (with its balustrade)', unit: 'nr', hours: 4, wasteM3: 1.2, group: 'joinery', note: 'Check what the stairs are holding up, and the stairwell opening before it is taken out.' },
  { id: 'fireplace', name: 'Fireplace and surround', unit: 'nr', hours: 2, wasteM3: 0.4, group: 'joinery' },
  { id: 'kitchen-units', name: 'Kitchen units', unit: 'lm', hours: 0.9, wasteM3: 0.35, group: 'kitchen' },
  { id: 'worktop', name: 'Worktop', unit: 'lm', hours: 0.5, wasteM3: 0.2, group: 'kitchen' },
  { id: 'bath', name: 'Bath', unit: 'nr', hours: 1.2, wasteM3: 0.5, group: 'sanitary' },
  { id: 'bath-cast', name: 'Cast iron bath', unit: 'nr', hours: 3.5, wasteM3: 0.5, group: 'sanitary', note: 'A cast iron bath weighs about 100kg: two people and a way out.' },
  { id: 'basin', name: 'Wash basin and pedestal', unit: 'nr', hours: 0.6, wasteM3: 0.15, group: 'sanitary' },
  { id: 'wc', name: 'WC and cistern', unit: 'nr', hours: 0.8, wasteM3: 0.2, group: 'sanitary' },
  { id: 'shower', name: 'Shower enclosure and tray', unit: 'nr', hours: 1.2, wasteM3: 0.4, group: 'sanitary' },
  { id: 'radiator', name: 'Radiator (drained down and taken off)', unit: 'nr', hours: 0.8, wasteM3: 0.1, group: 'sanitary' },
]
export const STRIP_BY_ID: Record<string, StripItemType> = Object.fromEntries(STRIP_ITEMS.map(s => [s.id, s]))

export interface StripRoomType { id: string; label: string; areaM2: number; wetRoom: boolean }
export const STRIP_ROOM_TYPES: StripRoomType[] = [
  { id: 'kitchen', label: 'Kitchen', areaM2: 12, wetRoom: true },
  { id: 'bathroom', label: 'Bathroom', areaM2: 6, wetRoom: true },
  { id: 'ensuite', label: 'En-suite', areaM2: 4, wetRoom: true },
  { id: 'cloakroom', label: 'Cloakroom / WC', areaM2: 2, wetRoom: true },
  { id: 'utility', label: 'Utility room', areaM2: 6, wetRoom: true },
  { id: 'living', label: 'Living room', areaM2: 18, wetRoom: false },
  { id: 'bedroom', label: 'Bedroom', areaM2: 12, wetRoom: false },
  { id: 'hall', label: 'Hall / landing', areaM2: 8, wetRoom: false },
  { id: 'other', label: 'Other room (empty)', areaM2: 12, wetRoom: false },
]
export const STRIP_ROOM_BY_ID: Record<string, StripRoomType> = Object.fromEntries(STRIP_ROOM_TYPES.map(r => [r.id, r]))

const r1 = (n: number) => Math.round(n * 10) / 10

/** The usual things taken out of a kind of room, worked out from its floor area and height: a starting point to adjust, not a survey. */
export function usualStripItems(kind: string, areaM2: number, heightM: number): Record<string, number> {
  const A = Math.max(areaM2, 0)
  const perimeter = 4 * Math.sqrt(A)
  const walls = perimeter * heightM
  switch (kind) {
    case 'kitchen': return { 'floor-tiles': r1(A), 'ceiling-pb': r1(A), 'wall-tiles': r1(walls * 0.2), 'wall-plaster': r1(walls * 0.5), 'kitchen-units': r1(1.6 * Math.sqrt(A)), worktop: r1(1.6 * Math.sqrt(A)), skirting: r1(perimeter * 0.7), door: 1, radiator: 1 }
    case 'bathroom': return { 'floor-tiles': r1(A), 'ceiling-pb': r1(A), 'wall-tiles': r1(walls * 0.8), bath: 1, basin: 1, wc: 1, radiator: 1, door: 1 }
    case 'ensuite': return { 'floor-tiles': r1(A), 'ceiling-pb': r1(A), 'wall-tiles': r1(walls * 0.8), shower: 1, basin: 1, wc: 1, radiator: 1, door: 1 }
    case 'cloakroom': return { 'floor-tiles': r1(A), 'wall-tiles': r1(walls * 0.4), basin: 1, wc: 1, door: 1 }
    case 'utility': return { 'floor-tiles': r1(A), 'kitchen-units': r1(1.2 * Math.sqrt(A)), worktop: r1(1.2 * Math.sqrt(A)), skirting: r1(perimeter * 0.7), door: 1 }
    case 'living': return { 'floor-carpet': r1(A), 'wall-paper': r1(walls), skirting: r1(perimeter * 0.9), fireplace: 1, radiator: 2, door: 1 }
    case 'bedroom': return { 'floor-carpet': r1(A), 'wall-paper': r1(walls), skirting: r1(perimeter * 0.9), radiator: 1, door: 1 }
    case 'hall': return { 'floor-carpet': r1(A), 'wall-paper': r1(walls), skirting: r1(perimeter * 0.9), radiator: 1, door: 1 }
    default: return {}
  }
}

export const SKIP_M3 = 4.6               // a 6-yard skip
export const SKIP_FILL = 0.85            // how much of it can really be filled
export const SKIP_EACH = 260
export const DUST_PER_ROOM = 60
export const PLUMBER_DISCONNECT = 95     // a plumber to disconnect and cap off, per room
export const ELECTRICIAN_DISCONNECT = 85 // an electrician to disconnect, per room
export const ASBESTOS_SURVEY = 350

export interface StripRoom {
  id: string
  name: string
  kind: string
  areaM2: number
  heightM: number
  /** item id -> how many (m², lm or nr). Only the items listed here are shown for the room. */
  items: Record<string, number>
  dust: boolean
  disconnectPlumber: boolean
  disconnectElectrician: boolean
  /** the room on the Take-off plan this one was made from, and what the plan said when it was last fed (it follows the plan's size until the plan's room changes) */
  planRoomId?: string
  planRoomSig?: string
}

export interface StripInput { rooms: StripRoom[]; asbestosSurveys: number }

export interface StripLine { id: string; name: string; category: 'materials' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number; roomId?: string }

export interface StripResult {
  lines: StripLine[]
  roomSummaries: { roomId: string; name: string; hours: number; wasteM3: number; byGroup: Record<StripGroup, number> }[]
  totalHours: number
  wasteM3: number
  skips: number
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round2 = (n: number) => Math.round(n * 100) / 100

export function calculateStripOut(i: StripInput): StripResult {
  const lines: StripLine[] = []
  const warnings: string[] = []
  const roomSummaries: StripResult['roomSummaries'] = []
  const noted = new Set<string>()
  let totalHours = 0, wasteM3 = 0

  for (const room of i.rooms) {
    const rn = room.name.trim() || 'Room'
    let hours = 0, waste = 0
    const byGroup: Record<StripGroup, number> = { floor: 0, ceiling: 0, walls: 0, joinery: 0, kitchen: 0, sanitary: 0 }
    for (const it of STRIP_ITEMS) {
      const n = room.items[it.id]
      if (n === undefined) continue
      if (!(n >= 0)) throw new Error(`The quantity of "${it.name}" in ${rn} cannot be negative.`)
      if (n === 0) continue
      hours += n * it.hours
      waste += n * it.wasteM3
      byGroup[it.group] += n
      if (it.note && !noted.has(it.id)) { noted.add(it.id); warnings.push(`${it.name}: ${it.note}`) }
    }
    totalHours += hours
    wasteM3 += waste
    roomSummaries.push({ roomId: room.id, name: rn, hours: round2(hours), wasteM3: round2(waste), byGroup })
    if (room.dust) lines.push({ id: `dust|${room.id}`, name: `${rn} — dust sheets and protection`, category: 'materials', unit: 'item', unitCost: DUST_PER_ROOM, qty: 1, roomId: room.id })
    if (room.disconnectPlumber) lines.push({ id: `plumber|${room.id}`, name: `${rn} — plumber to disconnect and cap off the water and waste (provisional sum)`, category: 'subcontractors', unit: 'item', unitCost: PLUMBER_DISCONNECT, qty: 1, roomId: room.id })
    if (room.disconnectElectrician) lines.push({ id: `electrician|${room.id}`, name: `${rn} — electrician to disconnect and make safe (provisional sum)`, category: 'subcontractors', unit: 'item', unitCost: ELECTRICIAN_DISCONNECT, qty: 1, roomId: room.id })
  }

  const skips = wasteM3 > 0 ? Math.max(1, Math.ceil(wasteM3 / (SKIP_M3 * SKIP_FILL))) : 0
  if (skips > 0) lines.push({ id: 'skips', name: `Skip hire for the strip-out waste (6-yard skips, about ${round2(wasteM3)} m³ loose)`, category: 'other', unit: 'skip', unitCost: SKIP_EACH, qty: skips })
  if (!(i.asbestosSurveys >= 0)) throw new Error('The number of asbestos surveys cannot be negative.')
  if (i.asbestosSurveys > 0) lines.push({ id: 'asbestos', name: 'Asbestos survey of the areas to be stripped (refurbishment survey)', category: 'subcontractors', unit: 'nr', unitCost: ASBESTOS_SURVEY, qty: Math.round(i.asbestosSurveys) })

  if (i.rooms.length === 0) warnings.push('No rooms yet. Add the rooms being stripped out.')
  warnings.push('Check for gas, electric and water services before anything is pulled out, and for asbestos in buildings before 2000. Strip-out waste is bulky: the skips here are for what these rooms make; add more under Waste & Skips if the job needs them.')
  return { lines, roomSummaries, totalHours: round2(totalHours), wasteM3: round2(wasteM3), skips, warnings }
}

export function stripOutSubtotal(lines: StripLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
