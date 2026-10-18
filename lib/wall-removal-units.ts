// Removing a wall, or knocking through to form an opening (Demolition → Wall Removal / Knock-Through). From the length of wall taken out, its height and thickness and what it is made of, this works out
// the rubble and the skips it fills, the demolition labour, and the making good (plaster to the ends and ceiling line, a patch to the floor). If the wall is load-bearing it adds what holds the building up
// meanwhile and after: temporary props and needles, the steel beam sized from the span (an indicative section: the engineer designs the real one), padstones, boxing in the steel, the structural engineer's fee
// and the Building Control notice. Services found in the wall can be added. Counts and prices only: a load-bearing wall must not be touched without an engineer's design and Building Control. Self-contained
// (no cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer with each layer's fixedQty set from the quantity. All rates are
// samples to be checked against real prices.

export type WallKind = 'stud' | 'block' | 'brick' | 'cavity'
export interface WallKindInfo { label: string; defaultThicknessMm: number; /** rubble (loose, in the skip) for each m³ of wall */ bulk: number; /** hours for a labourer to take out each m³ of wall and load it */ hoursPerM3: number; /** such a wall is usually load-bearing */ usuallyStructural: boolean }

export const WALL_KINDS: Record<WallKind, WallKindInfo> = {
  stud: { label: 'Timber or metal stud partition (plasterboard)', defaultThicknessMm: 100, bulk: 0.35, hoursPerM3: 4, usuallyStructural: false },
  block: { label: 'Block partition (100 or 140mm blockwork)', defaultThicknessMm: 100, bulk: 1.6, hoursPerM3: 5, usuallyStructural: false },
  brick: { label: 'Solid brick or block wall (one brick, 215mm)', defaultThicknessMm: 215, bulk: 1.6, hoursPerM3: 6, usuallyStructural: true },
  cavity: { label: 'Cavity or thick solid wall (300mm and over)', defaultThicknessMm: 300, bulk: 1.6, hoursPerM3: 7, usuallyStructural: true },
}

/** An indicative steel section for a clear span up to this length (m), and its weight (kg/m). The engineer's design replaces it. */
export const BEAM_SIZES: { upToM: number; kgPerM: number; label: string }[] = [
  { upToM: 2.4, kgPerM: 16, label: '152 × 89 UB 16' },
  { upToM: 3.0, kgPerM: 19, label: '178 × 102 UB 19' },
  { upToM: 3.6, kgPerM: 25, label: '203 × 133 UB 25' },
  { upToM: 4.2, kgPerM: 30, label: '203 × 133 UB 30' },
  { upToM: 4.8, kgPerM: 31, label: '254 × 146 UB 31' },
  { upToM: 5.4, kgPerM: 37, label: '254 × 146 UB 37' },
  { upToM: 6.0, kgPerM: 43, label: '254 × 146 UB 43' },
]
export const BEAM_BEARING_M = 0.15            // each end
export const STEEL_PER_KG = 2.4               // supplied, cut, drilled, primed and delivered
export const PADSTONE_EACH = 38
export const ENCASE_PER_LM = 24               // fire board and skim boxing the steel
export const PROPS_PER_LM_WEEK = 70           // needles and acrow props hired, per metre of opening
export const ENGINEER_FEE = 350
export const BUILDING_CONTROL_FEE = 280
export const SKIP_M3 = 4.6                    // a 6-yard skip
export const SKIP_EACH = 260
export const PLASTER_MAKE_GOOD_PER_M2 = 4
export const FLOOR_PATCH_PER_M2 = 18
export const DUST_PROTECTION = 60
export const SERVICE_EACH = 85

export interface WallRemovalInput {
  kind: WallKind
  /** the length of wall taken out, which is the width of the opening, m */
  lengthM: number
  heightM: number
  thicknessMm: number
  /** load-bearing: needs props, a steel beam and an engineer */
  structural: boolean
  /** weeks the props stay up */
  propWeeks: number
  engineer: boolean
  buildingControl: boolean
  makeGoodPlaster: boolean
  makeGoodFloor: boolean
  boxInSteel: boolean
  dustProtection: boolean
  /** services in the wall to move (sockets, pipes, cables), nr */
  services: number
}

export interface WallRemovalLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number }

export interface WallRemovalResult {
  lines: WallRemovalLine[]
  wallVolumeM3: number
  rubbleM3: number
  skips: number
  beamLabel: string
  beamKg: number
  beamLengthM: number
  plasterM2: number
  floorM2: number
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function beamFor(spanM: number): { label: string; kgPerM: number; beyond: boolean } {
  const b = BEAM_SIZES.find(x => spanM <= x.upToM)
  if (b) return { label: b.label, kgPerM: b.kgPerM, beyond: false }
  const last = BEAM_SIZES[BEAM_SIZES.length - 1]
  return { label: `${last.label} or larger (designer's)`, kgPerM: 54, beyond: true }
}

export function calculateWallRemoval(i: WallRemovalInput): WallRemovalResult {
  if (!(i.lengthM > 0)) throw new Error('The length of wall to remove must be greater than 0.')
  if (!(i.heightM > 0)) throw new Error('The wall height must be greater than 0.')
  if (!(i.thicknessMm > 0)) throw new Error('The wall thickness must be greater than 0.')
  if (!(i.propWeeks >= 0) || !(i.services >= 0)) throw new Error('The weeks and services cannot be negative.')
  const info = WALL_KINDS[i.kind]
  const lines: WallRemovalLine[] = []
  const warnings: string[] = []
  const t = i.thicknessMm / 1000
  const volume = i.lengthM * i.heightM * t
  const rubble = volume * info.bulk
  const skips = Math.max(1, Math.ceil(rubble / SKIP_M3))
  const structural = i.structural && i.kind !== 'stud'
  if (i.structural && i.kind === 'stud') warnings.push('A stud partition is not load-bearing: no beam or props are priced. Check what is above it before you assume that.')

  let beamLabel = '', beamKg = 0, beamLengthM = 0
  if (structural) {
    const b = beamFor(i.lengthM)
    beamLabel = b.label
    beamLengthM = round2(i.lengthM + 2 * BEAM_BEARING_M)
    beamKg = round1(b.kgPerM * beamLengthM)
    lines.push({ id: 'props', name: 'Temporary needles and props hired while the wall is out (per metre of opening, for each week)', category: 'plant', unit: 'lm-week', unitCost: PROPS_PER_LM_WEEK, qty: round2(i.lengthM * Math.max(i.propWeeks, 0)) })
    lines.push({ id: 'beam', name: `Steel beam, indicative ${b.label}, ${beamLengthM}m long (cut, drilled, primed and delivered)`, category: 'materials', unit: 'kg', unitCost: STEEL_PER_KG, qty: beamKg })
    lines.push({ id: 'padstones', name: 'Padstones under the beam ends', category: 'materials', unit: 'nr', unitCost: PADSTONE_EACH, qty: 2 })
    if (i.boxInSteel) lines.push({ id: 'encase', name: 'Fire board and skim boxing in the steel', category: 'materials', unit: 'lm', unitCost: ENCASE_PER_LM, qty: i.lengthM })
    if (i.engineer) lines.push({ id: 'engineer', name: 'Structural engineer: design and calculations (allowance)', category: 'subcontractors', unit: 'item', unitCost: ENGINEER_FEE, qty: 1 })
    if (i.buildingControl) lines.push({ id: 'building-control', name: 'Building Control notice and inspection (provisional sum)', category: 'subcontractors', unit: 'item', unitCost: BUILDING_CONTROL_FEE, qty: 1 })
    if (b.beyond) warnings.push(`A ${round1(i.lengthM)}m opening is beyond the sizes shown: the beam is the engineer's to design, and the weight here is only a placeholder.`)
    warnings.push('A load-bearing wall must not be touched without a structural engineer\'s design and Building Control: the steel section shown is indicative only.')
    if (!i.engineer) warnings.push('No engineer is priced. A beam in a load-bearing wall needs one.')
  } else if (i.structural) {
    // stud marked structural: nothing structural is priced
  }

  lines.push({ id: 'skip', name: `Skip hire for the rubble (6-yard skips, about ${round1(rubble)} m³ loose)`, category: 'other', unit: 'skip', unitCost: SKIP_EACH, qty: skips })
  if (i.dustProtection) lines.push({ id: 'dust', name: 'Dust sheets and protection to floors and doorways', category: 'materials', unit: 'item', unitCost: DUST_PROTECTION, qty: 1 })
  if (i.services > 0) lines.push({ id: 'services', name: 'Services found in the wall moved or capped (provisional sum each)', category: 'subcontractors', unit: 'nr', unitCost: SERVICE_EACH, qty: Math.round(i.services) })

  const plasterM2 = i.makeGoodPlaster ? round2(2 * i.heightM * 0.3 + i.lengthM * 0.3 + (structural ? (2 * i.heightM + i.lengthM) * t : 0)) : 0
  const floorM2 = i.makeGoodFloor ? round2(i.lengthM * (t + 0.2)) : 0
  if (plasterM2 > 0) lines.push({ id: 'plaster', name: 'Plaster make-good to the ends of the opening, the ceiling line and the new reveals', category: 'materials', unit: 'm²', unitCost: PLASTER_MAKE_GOOD_PER_M2, qty: plasterM2 })
  if (floorM2 > 0) lines.push({ id: 'floor', name: 'Floor patch where the wall stood (boards or screed)', category: 'materials', unit: 'm²', unitCost: FLOOR_PATCH_PER_M2, qty: floorM2 })

  if (i.lengthM > 6) warnings.push('A wall removal over 6m is a design job: have it looked at before pricing it here.')
  warnings.push('Check for gas, electric and water services in the wall, and for asbestos in older buildings, before it is taken down.')
  return { lines, wallVolumeM3: round2(volume), rubbleM3: round2(rubble), skips, beamLabel, beamKg, beamLengthM, plasterM2, floorM2, warnings }
}

export function wallRemovalSubtotal(lines: WallRemovalLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
