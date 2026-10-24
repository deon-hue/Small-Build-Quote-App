// What the four Tiling & Finishes calculators (floor tiling, wall tiling, preparation, electric underfloor heating) have in common: the kinds of room they are added from, the job situations, the sizes of tile
// and how a layout changes the waste and the tiler's time, and a few small helpers. Pure and self-contained (no imports), so each engine can be hand-tested with plain Node.
//
// Every figure here is a SAMPLE rate or a ROUGH estimate, editable in the calculator, to be checked against real jobs.

export interface TilingSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_TILING_SITUATIONS: TilingSituation[] = [
  { id: 'empty', label: 'Empty rooms (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (floors and fittings to protect)', upliftPct: 15 },
  { id: 'hard', label: 'Awkward (upstairs, tight rooms, no lift)', upliftPct: 20 },
]

/** One wall area to be tiled or prepared: a bath surround, shower walls, a splashback, or every wall of the room */
export interface TilingZone { id: string; label: string; lengthM: number; heightM: number; /** window, niche or opening taken out of it, m² */ deductM2: number }

export interface TilingRoomKind {
  id: string; label: string; lengthM: number; widthM: number; heightM: number; doors: number; windows: number
  /** the wall areas usually tiled in this kind of room (a splashback, a bath surround...); empty for rooms that are only floors */
  zones: { label: string; lengthM: number; heightM: number }[]
  /** floor in the room that is under fixed things (bath, units, WC) and is not heated, m² (for the underfloor heating calculator) */
  fixedM2: number
  /** pipe collars and floor waste cuffs the waterproofing usually has to seal (for the preparation calculator) */
  collars: number
}
export const TILING_ROOM_KINDS: TilingRoomKind[] = [
  { id: 'bathroom', label: 'Bathroom (bath)', lengthM: 2.5, widthM: 2, heightM: 2.4, doors: 1, windows: 1, fixedM2: 1.3, collars: 3,
    zones: [{ label: 'Bath surround', lengthM: 3.1, heightM: 1.8 }, { label: 'Basin splashback', lengthM: 0.8, heightM: 0.6 }] },
  { id: 'shower', label: 'Shower room / wet room', lengthM: 2.2, widthM: 1.8, heightM: 2.4, doors: 1, windows: 1, fixedM2: 0.4, collars: 4,
    zones: [{ label: 'Shower walls', lengthM: 3, heightM: 2.4 }, { label: 'Basin splashback', lengthM: 0.8, heightM: 0.6 }] },
  { id: 'cloakroom', label: 'Cloakroom / WC', lengthM: 1.8, widthM: 1.2, heightM: 2.4, doors: 1, windows: 1, fixedM2: 0.3, collars: 2,
    zones: [{ label: 'Basin splashback', lengthM: 0.8, heightM: 0.6 }] },
  { id: 'kitchen', label: 'Kitchen', lengthM: 4, widthM: 3.5, heightM: 2.4, doors: 1, windows: 1, fixedM2: 4.5, collars: 2,
    zones: [{ label: 'Worktop splashback', lengthM: 3.5, heightM: 0.6 }] },
  { id: 'utility', label: 'Utility room', lengthM: 2.5, widthM: 2, heightM: 2.4, doors: 1, windows: 1, fixedM2: 1.5, collars: 2,
    zones: [{ label: 'Worktop splashback', lengthM: 1.8, heightM: 0.6 }] },
  { id: 'hall', label: 'Hall / porch', lengthM: 4, widthM: 1.5, heightM: 2.4, doors: 3, windows: 0, fixedM2: 0, collars: 0, zones: [] },
  { id: 'living', label: 'Living room', lengthM: 5, widthM: 4, heightM: 2.4, doors: 1, windows: 2, fixedM2: 0, collars: 0, zones: [] },
  { id: 'conservatory', label: 'Conservatory / orangery', lengthM: 4, widthM: 3.5, heightM: 2.4, doors: 1, windows: 0, fixedM2: 0, collars: 0, zones: [] },
  { id: 'other', label: 'Other room', lengthM: 4, widthM: 3, heightM: 2.4, doors: 1, windows: 1, fixedM2: 0, collars: 0, zones: [{ label: 'Wall area', lengthM: 3, heightM: 1.2 }] },
]
export const TILING_ROOM_KIND_BY_ID: Record<string, TilingRoomKind> = Object.fromEntries(TILING_ROOM_KINDS.map(k => [k.id, k]))

export const newZoneId = () => 'z-' + Math.random().toString(36).slice(2, 8)
export function zonesFromKind(kindId: string): TilingZone[] {
  const k = TILING_ROOM_KIND_BY_ID[kindId] ?? TILING_ROOM_KIND_BY_ID.other
  return k.zones.map(z => ({ id: newZoneId(), label: z.label, lengthM: z.lengthM, heightM: z.heightM, deductM2: 0 }))
}
/** What an average door and window take out of a wall, m² */
export const DOOR_OPENING_M2 = 1.9
export const WINDOW_OPENING_M2 = 1.4
/** Every wall of a room as one zone (the perimeter by the height, less the doors and windows put in as a deduction) */
export function allWallsZone(r: { lengthM: number; widthM: number; heightM: number; doors: number; windows: number }): TilingZone {
  return { id: newZoneId(), label: 'All the walls', lengthM: 2 * (r.lengthM + r.widthM), heightM: r.heightM, deductM2: +(r.doors * DOOR_OPENING_M2 + r.windows * WINDOW_OPENING_M2).toFixed(2) }
}
export const zoneAreaM2 = (z: TilingZone) => Math.max(0, z.lengthM * z.heightM - z.deductM2)

// ── Tiles ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type TileSizeId = 'mosaic' | 'metro' | 'small' | 'medium' | 'large' | 'xl' | 'plank'
export interface TileSize {
  id: TileSizeId; label: string
  /** tile face, mm */
  wMm: number; hMm: number; thicknessMm: number; jointMm: number
  /** kg of powder adhesive per m² laid, with the notch of trowel it needs (and back-buttering for the big sizes) */
  adhesiveKgM2: number; trowel: string
  /** the tiler's hours per m² on a floor and on a wall, plain straight layout */
  floorHoursM2: number; wallHoursM2: number
  /** sample price of the tile, £/m² */
  priceM2: number
}
export const TILE_SIZES: TileSize[] = [
  { id: 'mosaic', label: 'Mosaic sheets (small tiles on a 300 x 300 sheet)', wMm: 300, hMm: 300, thicknessMm: 6, jointMm: 3, adhesiveKgM2: 3.0, trowel: '6mm notch', floorHoursM2: 1.4, wallHoursM2: 1.5, priceM2: 48 },
  { id: 'metro', label: 'Metro / brick tiles (75 x 150, 100 x 200)', wMm: 100, hMm: 200, thicknessMm: 8, jointMm: 2, adhesiveKgM2: 3.0, trowel: '6mm notch', floorHoursM2: 1.2, wallHoursM2: 1.1, priceM2: 28 },
  { id: 'small', label: 'Small tiles (up to 300 x 300)', wMm: 300, hMm: 300, thicknessMm: 8, jointMm: 3, adhesiveKgM2: 3.5, trowel: '8mm notch', floorHoursM2: 0.85, wallHoursM2: 0.85, priceM2: 22 },
  { id: 'medium', label: 'Medium tiles (300 x 600, 450 x 450)', wMm: 300, hMm: 600, thicknessMm: 9, jointMm: 3, adhesiveKgM2: 4.5, trowel: '10mm notch', floorHoursM2: 0.8, wallHoursM2: 0.8, priceM2: 30 },
  { id: 'large', label: 'Large tiles (600 x 600)', wMm: 600, hMm: 600, thicknessMm: 10, jointMm: 3, adhesiveKgM2: 5.5, trowel: '12mm notch', floorHoursM2: 0.9, wallHoursM2: 0.95, priceM2: 34 },
  { id: 'xl', label: 'Large format (600 x 1200, 1200 x 1200)', wMm: 600, hMm: 1200, thicknessMm: 10, jointMm: 3, adhesiveKgM2: 7.0, trowel: '12mm notch and back-buttering', floorHoursM2: 1.35, wallHoursM2: 1.5, priceM2: 48 },
  { id: 'plank', label: 'Wood-effect planks (200 x 1200)', wMm: 200, hMm: 1200, thicknessMm: 10, jointMm: 3, adhesiveKgM2: 6.0, trowel: '12mm notch and back-buttering', floorHoursM2: 1.15, wallHoursM2: 1.2, priceM2: 36 },
]
export const TILE_SIZE_BY_ID: Record<string, TileSize> = Object.fromEntries(TILE_SIZES.map(t => [t.id, t]))
/** Tiles that need a flat base: laid on an uneven floor they rock and lip at the joints */
export const FLAT_BASE_TILES: TileSizeId[] = ['large', 'xl', 'plank']

export type TileLayoutId = 'straight' | 'brick' | 'diagonal' | 'herringbone'
export interface TileLayout { id: TileLayoutId; label: string; /** extra tile to buy for cuts and breakage, as a fraction */ waste: number; /** how much longer the tiler takes, a multiple */ labourFactor: number }
export const TILE_LAYOUTS: TileLayout[] = [
  { id: 'straight', label: 'Straight (grid)', waste: 0.1, labourFactor: 1 },
  { id: 'brick', label: 'Brick bond (half or third offset)', waste: 0.12, labourFactor: 1.05 },
  { id: 'diagonal', label: 'Diagonal', waste: 0.15, labourFactor: 1.3 },
  { id: 'herringbone', label: 'Herringbone', waste: 0.18, labourFactor: 1.6 },
]
export const TILE_LAYOUT_BY_ID: Record<string, TileLayout> = Object.fromEntries(TILE_LAYOUTS.map(l => [l.id, l]))

export type GroutId = 'cement' | 'flexible' | 'epoxy'
export interface GroutKind { id: GroutId; label: string; /** £/kg, sample */ priceKg: number; /** the grouter's extra time over cement grout, a multiple */ labourFactor: number }
export const GROUT_KINDS: GroutKind[] = [
  { id: 'cement', label: 'Cement grout', priceKg: 1.6, labourFactor: 1 },
  { id: 'flexible', label: 'Flexible (polymer) grout', priceKg: 2.6, labourFactor: 1 },
  { id: 'epoxy', label: 'Epoxy grout (wet areas, kitchens)', priceKg: 9, labourFactor: 1.8 },
]
export const GROUT_KIND_BY_ID: Record<string, GroutKind> = Object.fromEntries(GROUT_KINDS.map(g => [g.id, g]))

/** kg of grout to fill the joints of one m² of tile: the joint length per m² times the width and depth of a joint times the weight of grout (1.6kg a litre), with 15% extra for waste */
export function groutKgM2(wMm: number, hMm: number, jointMm: number, thicknessMm: number): number {
  if (!(wMm > 0) || !(hMm > 0)) return 0
  return ((wMm + hMm) / (wMm * hMm)) * jointMm * thicknessMm * 1.6 * 1.15
}

export const SAMPLE_SPECIAL = {
  /** m² of tile under each metre of tiled skirting is the tile cut into strips: this is the height of the strip, m */
  skirtingHeightM: 0.1,
} as const

/** The two sides of a rectangle with this area and perimeter (a drawn room outline), long and short; a square when the perimeter is too short to hold the area or is missing */
export function sidesFromAreaPerimeter(areaM2: number, perimeterM: number): { long: number; short: number } {
  const A = Math.max(0, areaM2)
  const s = Math.max(0, perimeterM) / 2
  const disc = s * s - 4 * A
  const r2 = (x: number) => +x.toFixed(2)
  if (disc >= 0 && s > 0) { const r = Math.sqrt(disc); return { long: r2((s + r) / 2), short: r2((s - r) / 2) } }
  const side = Math.sqrt(A)
  return { long: r2(side), short: r2(side) }
}

// ── The shape of a room's floor ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A rectangle is length x width. The other shapes are the overall length and width (the box the room fits in) less a cut-out of cut length x cut width (a is along the length, b along the width):
//   L-shape  one corner cut out          T-shape  two equal corner cut-outs, one at each end of a side          U-shape  one notch in the middle of a side (the walls run in and out: two more cut-out depths of wall)
//   Square   one side                    Other    the area and the walls' total length typed (an angled or curved room, or one taken off a drawing)
export type RoomShape = 'rectangle' | 'square' | 'l' | 't' | 'u' | 'other'
export const ROOM_SHAPE_LABEL: Record<RoomShape, string> = {
  rectangle: 'Rectangle', square: 'Square', l: 'L-shape', t: 'T-shape', u: 'U-shape (a notch in one side)', other: 'Other shape (type the area and perimeter)',
}
export interface RoomShapeExtras {
  /** undefined = a rectangle (rooms saved before shapes existed) */
  shape?: RoomShape
  /** the cut-out of an L, T or U shape: along the length, and along the width, m */
  cutLengthM?: number
  cutWidthM?: number
  /** for 'other': the floor area, m², and the walls' total length, m */
  otherAreaM2?: number
  otherPerimeterM?: number
}
export function roomFootprint(r: { lengthM: number; widthM: number } & RoomShapeExtras): { areaM2: number; perimeterM: number; error?: string } {
  const L = Math.max(0, r.lengthM), W = Math.max(0, r.widthM)
  const a = Math.max(0, r.cutLengthM ?? 0), b = Math.max(0, r.cutWidthM ?? 0)
  const box = 2 * (L + W)
  switch (r.shape) {
    case 'square': return { areaM2: L * L, perimeterM: 4 * L }
    case 'l': return { areaM2: Math.max(0, L * W - a * b), perimeterM: box, ...(a >= L || b >= W ? { error: 'the corner cut-out has to be smaller than the room.' } : {}) }
    case 't': return { areaM2: Math.max(0, L * W - 2 * a * b), perimeterM: box, ...(2 * a >= L || b >= W ? { error: 'the two cut-outs have to be smaller than the room (together shorter than its length).' } : {}) }
    case 'u': return { areaM2: Math.max(0, L * W - a * b), perimeterM: box + 2 * b, ...(a >= L || b >= W ? { error: 'the notch has to be smaller than the room.' } : {}) }
    case 'other': { const area = Math.max(0, r.otherAreaM2 ?? 0); return { areaM2: area, perimeterM: Math.max(0, r.otherPerimeterM ?? (area > 0 ? 4 * Math.sqrt(area) : 0)) } }
    default: return { areaM2: L * W, perimeterM: box }
  }
}

export const money = (n: number) => +n.toFixed(2)
export const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
export const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
export const nonNeg = (v: number, what: string) => { if (!(v >= 0)) throw new Error(`${what} cannot be negative.`) }

export interface TilingLabourTask { key: string; roomId: string; trade: 'tiler' | 'plasterer' | 'labourer'; task: string; hours: number; basis: string }
export interface TilingLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface TilingRoomSummary {
  roomId: string; name: string; areaM2: number; uplift: number
  /** plain phrases for the description: "porcelain tiles laid straight to 8.4m² of floor" */
  parts: string[]
}
