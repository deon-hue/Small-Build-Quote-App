// Structural openings in walls, priced one opening at a time (Structural Frame → Structural Openings (by opening)): a new opening cut through an EXISTING wall, or one formed as a NEW wall is built, with the steelwork
// that carries what is above it. Each opening has its size (a door, a wide knock-through), the wall (cavity, solid brick, block) and its thickness, how much load is above it (roof only, one floor, heavy), and the steel:
// one or more beams (the section chosen from the span and the load above, or typed), steel posts with a base plate and a concrete pad under each, padstones under the beam ends, and the fire protection to the steel. For a cut
// in a standing wall it adds needles and Acrow props, the masonry cut out by hand, the rubble away and the jambs made good; the structural engineer's calculations (a design is always needed) and the Building Control
// notice. Steel is fitted by us (supply at a rate per kg, a bricklayer and labourer to set it, optional Hiab or crane) or by a steelwork contractor (supply and fit per kg, a subcontract line).
// It prices the STRUCTURE only: the door or window and its frame are Windows & Doors, plastering the reveals is Plastering & Boarding, decorating is Decoration, and taking out a whole wall is Demolition → Wall Removal.
//
// Every rate and hour here is a SAMPLE, and every steel section is INDICATIVE (the engineer designs the real one): editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node.

import { UB_SECTIONS, UC_SECTIONS, SECTION_BY_LABEL, iProperties } from './steel-sections'

export type OpeningWallKind = 'cavity' | 'solid' | 'block'
export type OpeningFormed = 'cut-existing' | 'new-wall'
export type LoadAbove = 'light' | 'floor' | 'heavy'
export type SteelBy = 'us' | 'sub'
export type SteelFinish = 'board' | 'intumescent' | 'none'
export type PostRole = 'ends' | 'mid'
/** what goes over the opening: steel set up with the steel calculators' options, a lintel, or nothing priced */
export type OverKind = 'steel' | 'concrete' | 'steel-cavity' | 'steel-box' | 'none'
export const OVER_LABEL: Record<OverKind, string> = {
  steel: 'Steel (beams, columns, posts, plates: set up below)', concrete: 'Precast concrete lintel(s)', 'steel-cavity': 'Steel cavity lintel (one, spans both leaves)', 'steel-box': 'Steel box lintel', none: 'Nothing priced here (by others)',
}
/** the choices that make sense for each kind of wall */
export const OVER_FOR: Record<OpeningWallKind, OverKind[]> = {
  cavity: ['steel', 'steel-cavity', 'concrete', 'none'],
  solid: ['steel', 'concrete', 'steel-box', 'none'],
  block: ['steel', 'concrete', 'steel-box', 'none'],
}
/** the widest opening that starts on a lintel rather than steel */
export const LINTEL_UP_TO_MM = 1500
/** what a new opening starts with over it: a lintel for a small one (up to 1.5m, not under a heavy load), else steel */
export const defaultOver = (wall: OpeningWallKind, widthMm: number, load: LoadAbove): OverKind => (widthMm <= LINTEL_UP_TO_MM && load !== 'heavy' ? (wall === 'cavity' ? 'steel-cavity' : 'concrete') : 'steel')
/** how many precast concrete lintels sit side by side across a wall: one for each leaf */
export const usualLintels = (wall: OpeningWallKind, thicknessMm: number) => (wall === 'cavity' ? 2 : Math.max(1, Math.round(thicknessMm / 110)))
/** anything else an opening needs, typed in: its own line */
export interface OpeningExtra { name: string; qty: number; unitCost: number; category: 'materials' | 'plant' | 'subcontractors' }
/** what the steel calculators' engine made of one opening's steel (lib/structural-openings-steel.ts works it out and hands it in): for ONE of the opening */
export interface OpeningSteelPriced {
  lines: { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number }[]
  hours: { bricklayer: number; labourer: number; carpenter: number }
  words: string
  beamLabel: string
  steelKg: number
  warnings: string[]
}

export const WALL_LABEL: Record<OpeningWallKind, string> = { cavity: 'Cavity wall (brick and block, about 300mm)', solid: 'Solid brick wall (215mm or more)', block: 'Solid block wall (100 to 215mm)' }
export const WALL_WORD: Record<OpeningWallKind, string> = { cavity: 'cavity wall', solid: 'solid brick wall', block: 'solid block wall' }
export const WALL_THICKNESS: Record<OpeningWallKind, number> = { cavity: 300, solid: 215, block: 140 }
export const FORMED_LABEL: Record<OpeningFormed, string> = { 'cut-existing': 'Cut a new opening in an existing wall', 'new-wall': 'Form the opening in a new wall as it is built' }
export const LOAD_LABEL: Record<LoadAbove, string> = { light: 'Light: a ceiling or roof only', floor: 'One floor (and the roof) above', heavy: 'Heavy: two floors, or a chimney or heavy roof' }
export const LOAD_WORD: Record<LoadAbove, string> = { light: 'a light load above', floor: 'a floor above', heavy: 'a heavy load above' }
export const FINISH_LABEL: Record<SteelFinish, string> = { board: 'Cased in fire-resisting board (two layers on a timber frame)', intumescent: 'Intumescent coating (a specialist applies it)', none: 'None priced (to be done elsewhere)' }
export const POST_ROLE_LABEL: Record<PostRole, string> = { ends: 'Carry the ends of the beam', mid: 'Stand under the beam, splitting its span' }

/** Indicative steel beams (universal beams): weight, the surface to coat, the girth of a casing round it, and the longest clear span in metres for each load above. The engineer's section replaces it. */
export interface BeamSection { label: string; kgPerM: number; surfaceM2PerM: number; boxGirthMm: number; /** only the sizes in the sample span chart carry one */ maxSpanM?: Record<LoadAbove, number> }
export const BEAM_SECTIONS: (BeamSection & { maxSpanM: Record<LoadAbove, number> })[] = [
  { label: '152 × 89 UB 16', kgPerM: 16, surfaceM2PerM: 0.53, boxGirthMm: 493, maxSpanM: { light: 2.4, floor: 1.8, heavy: 1.2 } },
  { label: '178 × 102 UB 19', kgPerM: 19, surfaceM2PerM: 0.6, boxGirthMm: 558, maxSpanM: { light: 3.0, floor: 2.3, heavy: 1.7 } },
  { label: '203 × 133 UB 25', kgPerM: 25, surfaceM2PerM: 0.78, boxGirthMm: 639, maxSpanM: { light: 3.6, floor: 2.9, heavy: 2.2 } },
  { label: '203 × 133 UB 30', kgPerM: 30, surfaceM2PerM: 0.78, boxGirthMm: 639, maxSpanM: { light: 4.0, floor: 3.2, heavy: 2.6 } },
  { label: '254 × 146 UB 31', kgPerM: 31, surfaceM2PerM: 0.9, boxGirthMm: 754, maxSpanM: { light: 4.6, floor: 3.8, heavy: 3.0 } },
  { label: '254 × 146 UB 37', kgPerM: 37, surfaceM2PerM: 0.91, boxGirthMm: 754, maxSpanM: { light: 5.2, floor: 4.3, heavy: 3.5 } },
  { label: '254 × 146 UB 43', kgPerM: 43, surfaceM2PerM: 0.92, boxGirthMm: 754, maxSpanM: { light: 5.8, floor: 4.8, heavy: 4.0 } },
  { label: '305 × 165 UB 40', kgPerM: 40, surfaceM2PerM: 1.19, boxGirthMm: 871, maxSpanM: { light: 6.4, floor: 5.4, heavy: 4.5 } },
  { label: '305 × 165 UB 54', kgPerM: 54, surfaceM2PerM: 1.22, boxGirthMm: 886, maxSpanM: { light: 7.4, floor: 6.4, heavy: 5.4 } },
]
/** Steel posts (universal columns): every column in the shared list (the 152 × 152 × 23 first, which a new post starts as) */
export interface PostSection { label: string; kgPerM: number; surfaceM2PerM: number; boxGirthMm: number }
export const POST_SECTIONS: PostSection[] = UC_SECTIONS.map(s => ({ label: s.label, kgPerM: s.kgPerM, surfaceM2PerM: s.surfaceM2PerM, boxGirthMm: s.boxGirthMm }))
export const BEAM_BY_LABEL: Record<string, BeamSection> = Object.fromEntries(BEAM_SECTIONS.map(b => [b.label, b]))
/** a few sizes outside the chart that do carry a sample span, for the warning when one is chosen by hand */
const HAND_SPANS: Record<string, Record<LoadAbove, number>> = {
  '305 × 127 UB 37': { light: 6.0, floor: 5.0, heavy: 4.2 },
  '356 × 171 UB 45': { light: 8.0, floor: 6.8, heavy: 5.8 },
  '406 × 178 UB 54': { light: 9.2, floor: 8.0, heavy: 6.8 },
  '457 × 191 UB 67': { light: 10.6, floor: 9.2, heavy: 7.8 },
  '533 × 210 UB 82': { light: 12.0, floor: 10.6, heavy: 9.0 },
}
/** every universal beam that can be chosen by hand, smallest first (the shared list). The span chart above never picks anything outside itself, so a span beyond it still says the engineer must specify. */
export const BEAM_CHOICES: BeamSection[] = UB_SECTIONS.map(s => BEAM_SECTIONS.find(b => b.label === s.label) ?? { label: s.label, kgPerM: s.kgPerM, surfaceM2PerM: s.surfaceM2PerM, boxGirthMm: s.boxGirthMm, maxSpanM: HAND_SPANS[s.label] })
export const BEAM_CHOICE_BY_LABEL: Record<string, BeamSection> = Object.fromEntries(BEAM_CHOICES.map(b => [b.label, b]))
export const POST_BY_LABEL: Record<string, PostSection> = Object.fromEntries(POST_SECTIONS.map(p => [p.label, p]))

/** The section for a clear span and a load: the lightest in the table that spans it (flagged when the span is beyond the table: the largest is then used and the engineer must specify) */
export function beamFor(spanM: number, load: LoadAbove): { section: BeamSection; beyond: boolean } {
  for (const s of BEAM_SECTIONS) if (spanM <= s.maxSpanM[load]) return { section: s, beyond: false }
  return { section: BEAM_SECTIONS[BEAM_SECTIONS.length - 1], beyond: true }
}

export const BEARING_MM = 150

/** Is a beam chosen by hand lighter than the sample chart suggests for this span and load? Its own sample span where it has one, else its plastic modulus against that of the size the chart picks. */
export function lighterThanChart(sec: BeamSection, spanM: number, load: LoadAbove): boolean {
  if (sec.maxSpanM) return spanM > sec.maxSpanM[load]
  const wpl = (label: string) => { const s = SECTION_BY_LABEL[label]; return s ? iProperties(s).wplCm3 : 0 }
  return wpl(sec.label) < wpl(beamFor(spanM, load).section.label)
}

/** Sample rates, £ */
export const RATES = {
  steelPerKg: 2.4,        // beams and posts supplied, cut, drilled, primed and delivered
  steelSubPerKg: 4.6,     // a steelwork contractor supplying and fixing
  plateSet: 55,           // £ per post: base plate, cap plate, holding-down bolts and grout
  padstone: 38,           // £ each: engineering brick or precast concrete padstone
  hiab: 180,              // £ per visit: Hiab or lorry crane to lift the steel in
  propsHire: 90,          // £ per opening per week: needles and Acrow props for a span up to 1.5m
  propsPerExtraM: 30,     // £ per metre of span over 1.5m, per week
  rubblePerM3: 60,        // £ per m³ of loose rubble or spoil: skip share
  makeGoodMaterials: 25,  // £ per opening: bricks, mortar and DPC to form the jambs and make good the reveals
  concretePerM3: 135,     // £ per m³: concrete for a pad
  boardFire: 7.5,         // £ per m²: fire-resisting board
  batten: 1.4,            // £ per lm: casing frame
  intumescentPerM2: 28,   // £ per m²: intumescent coating applied by a specialist
  engineer: 175,          // £ per opening: the structural engineer's calculations
  buildingControl: 280,   // £ per job: the Building Control notice and inspections
  lintelConcrete: 38,     // £ each: a precast concrete lintel up to 1.5m with its bearings, then in proportion
  lintelSteelCavity: 68,  // £ each: a steel cavity lintel, the same way
  lintelSteelBox: 85,     // £ each: a steel box lintel, the same way
  cavityTray: 9.5,        // £ per opening: cavity tray over a separate lintel or beam
  weep: 0.85,             // £ each: weep vent
  closerPerM: 3.2,        // £ per metre: cavity closer down the jambs
  dust: 60,               // £ per job: dust sheets and a temporary screen
  fabPerHour: 55,         // £ per hour: a fabricator or welder for other fabrication
} as const
export type StructuralRateKey = keyof typeof RATES

export const HOURS = {
  cutPerM3: { cavity: 8, solid: 9, block: 6 } as Record<OpeningWallKind, number>, cutMin: 2, // cutting out by hand, hours per m³ of masonry
  props: 2, propsPerM: 0.8, makeGoodBase: 1, makeGoodPerJambM: 0.5,
  formBase: 1.5, formPerPerimM: 0.35,           // a bricklayer forms the opening in a new wall
  setBeamBase: 1.5, setBeamPerM: 0.6, padstone: 0.3, post: 1.5,
  padDigPerM3: 5, padPourPerM3: 1.5, padMin: 0.5,
  casePerLm: 1.0, caseSetup: 0.8,
  lintelConcrete: 0.5, lintelSteelCavity: 0.5, lintelSteelBox: 0.75, cavityWork: 0.5,
} as const
export const LABOURER_ON_STEEL = 0.5     // a labourer helps set steel: this share of the bricklayer's hours
export const LABOURER_ON_CASING = 0.25
export const RUBBLE_BULK = 1.6           // loose rubble for each m³ of wall
export const SPOIL_BULK = 1.3
export const LIGHT_LIFT_KG = 150         // beams heavier than this want a Hiab, a crane or a big team

export interface StructuralSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_STRUCTURAL_SITUATIONS: StructuralSituation[] = [
  { id: 'clear', label: 'Clear to work in (rooms empty or easy to protect)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (dust and furniture to protect)', upliftPct: 15 },
  { id: 'hard', label: 'Awkward (upper floor, tight access, no room for steel)', upliftPct: 20 },
]

/** The connections and fabrications that go with the steel of an opening (sample prices: the engineer's drawings say which are really needed) */
export type ConnectionKind = 'end-plate' | 'cleat' | 'splice' | 'stiffener' | 'cap-plate' | 'anchors' | 'fabrication'
export interface ConnectionInfo { id: ConnectionKind; label: string; short: string; cost: number; hours: number; unit: 'nr' | 'h' }
export const CONNECTION_KINDS: ConnectionInfo[] = [
  { id: 'end-plate', label: 'End plates, bolts and nuts (a beam end bolted to a post or to steel)', short: 'end plate', cost: 28, hours: 0.5, unit: 'nr' },
  { id: 'cleat', label: 'Angle or web cleats (beam to beam, or to a post)', short: 'cleat connection', cost: 22, hours: 0.6, unit: 'nr' },
  { id: 'splice', label: 'Splice plates (a long beam made up from two)', short: 'splice', cost: 85, hours: 1.5, unit: 'nr' },
  { id: 'stiffener', label: 'Bearing stiffeners (web plates where the beam bears)', short: 'bearing stiffener', cost: 18, hours: 0.4, unit: 'nr' },
  { id: 'cap-plate', label: 'Extra cap plates on a post', short: 'cap plate', cost: 30, hours: 0.4, unit: 'nr' },
  { id: 'anchors', label: 'Resin or chemical anchors into masonry', short: 'resin anchor', cost: 14, hours: 0.25, unit: 'nr' },
  { id: 'fabrication', label: 'Other fabrication by the hour (welding, cutting, drilling)', short: 'hour of fabrication', cost: 0, hours: 0, unit: 'h' },
]
export const CONNECTION_BY_ID: Record<string, ConnectionInfo> = Object.fromEntries(CONNECTION_KINDS.map(c => [c.id, c]))
/**
 * A steel plate welded to the bottom, the top or both faces of a beam to spread its load over the wall it bears on (a flange plate: usually 6, 8, 10 or 12mm thick and as wide as the wall, or the cavity, needs).
 * widthMm null = as wide as the wall (for a beam over an opening; 215mm for a beam on its own); lengthMm null = the whole beam. Priced by weight at the steel rate plus the fabricator's cutting and welding by the hour.
 * The plate's size, steel grade and weld are the engineer's: these are samples to price from.
 */
export type PlatePosition = 'bottom' | 'top' | 'both'
export interface BeamPlate { position: PlatePosition; thicknessMm: number; widthMm: number | null; lengthMm: number | null }
export const PLATE_POSITION_LABEL: Record<PlatePosition, string> = { bottom: 'Welded to the bottom of the beam', top: 'Welded to the top of the beam', both: 'Welded to the top and the bottom' }
export const PLATE_THICKNESSES = [6, 8, 10, 12, 15, 20]
export const PLATE_WIDTHS = [100, 150, 215, 300, 330, 440]
export const STEEL_KG_PER_M2_PER_MM = 7.85      // a steel plate weighs about 7.85 kg per m² for each mm of thickness
export const PLATE_HOURS = { base: 0.5, perM: 0.6 }   // the fabricator's hours: cutting, drilling, and welding both edges, for each plate
export const DEFAULT_PLATE_WIDTH_MM = 215
export const newBeamPlate = (): BeamPlate => ({ position: 'bottom', thicknessMm: 10, widthMm: null, lengthMm: null })
export function checkBeamPlate(p: BeamPlate, name: string): void {
  if (!(p.thicknessMm > 0)) throw new Error(`${name}: the thickness of the welded plate must be above zero.`)
  if (p.widthMm !== null && !(p.widthMm > 0)) throw new Error(`${name}: the width of the welded plate must be above zero.`)
  if (p.lengthMm !== null && !(p.lengthMm > 0)) throw new Error(`${name}: the length of the welded plate must be above zero.`)
  if (p.position !== 'bottom' && p.position !== 'top' && p.position !== 'both') throw new Error(`${name}: the welded plate must go on the top, the bottom or both.`)
}
/** What a welded plate comes to for ONE beam: how many plates (two when on both faces), the size and the steel in them */
export function beamPlateFor(p: BeamPlate, beamLengthM: number, fallbackWidthMm: number): { plates: number; widthMm: number; lengthM: number; eachKg: number; kg: number; hours: number } {
  const widthMm = p.widthMm ?? fallbackWidthMm
  const lengthM = p.lengthMm != null ? p.lengthMm / 1000 : beamLengthM
  const plates = p.position === 'both' ? 2 : 1
  const eachKg = p.thicknessMm * STEEL_KG_PER_M2_PER_MM * (widthMm / 1000) * lengthM
  return { plates, widthMm, lengthM, eachKg, kg: eachKg * plates, hours: plates * (PLATE_HOURS.base + PLATE_HOURS.perM * lengthM) }
}
/** the words for a plate: 'a 10mm x 300mm steel plate welded to the underside of each beam' */
export function beamPlateWords(p: BeamPlate, widthMm: number, beams: number): string {
  const each = beams === 1 ? 'the beam' : 'each beam'
  const where = p.position === 'bottom' ? `to the underside of ${each}` : p.position === 'top' ? `to the top of ${each}` : `to the top and the underside of ${each}`
  const t = Math.round(p.thicknessMm * 10) / 10
  return `${/^(8|11|18)/.test(String(t)) ? 'an' : 'a'} ${t}mm x ${Math.round(widthMm)}mm steel plate welded ${where} to spread the load over the wall`
}
/** the size a plate on a column or post starts at, and its length when none is typed: a plate welded to the foot (a base plate) or the head (a cap plate) is square, 300 x 300 */
export const DEFAULT_POST_PLATE_MM = 300
/** the words for a plate welded to a column or post: 'a 15mm x 300mm x 300mm steel plate welded to the foot of each steel column (a base plate)' */
export function postPlateWords(p: BeamPlate, widthMm: number, lengthMm: number, count: number, word: string): string {
  const each = count === 1 ? `the ${word}` : `each ${word}`
  const where = p.position === 'bottom' ? `to the foot of ${each} (a base plate)` : p.position === 'top' ? `to the head of ${each} (a cap plate)` : `to the foot and the head of ${each}`
  const t = Math.round(p.thicknessMm * 10) / 10
  return `${/^(8|11|18)/.test(String(t)) ? 'an' : 'a'} ${t}mm x ${Math.round(widthMm)}mm x ${Math.round(lengthMm)}mm steel plate welded ${where}`
}
export const PLATE_RATE_NOTE = 'The welded plate (its size, steel grade and weld) is for the engineer to specify: the figures here are samples to price from.'

/** one kind of connection on an opening, and how many (for the fabrication: how many hours) */
export interface OpeningConnection { kind: ConnectionKind; qty: number }
/** The connections an opening usually has: an end plate at each end of each beam that is bolted to a post carrying it */
export const usualConnections = (beams: number, posts: number, postRole: PostRole): OpeningConnection[] =>
  beams > 0 && posts > 0 && postRole === 'ends' ? [{ kind: 'end-plate', qty: 2 * beams }] : []

export interface StructuralOpening {
  id: string
  ref: string
  location: string
  formed: OpeningFormed
  wall: OpeningWallKind
  thicknessMm: number
  /** the clear opening, mm: its width is the span */
  widthMm: number
  heightMm: number
  /** how many of this opening */
  qty: number
  /** carries load: needles and props, and the engineer */
  loadBearing: boolean
  loadAbove: LoadAbove
  /** steel beams over the opening (a pair, side by side, for a thick wall or a heavy load) */
  beams: number
  /** a section from BEAM_SECTIONS, or 'auto' to pick one from the span and the load above */
  section: string
  posts: number
  postSection: string
  postRole: PostRole
  /** the height of each post, mm */
  postHeightMm: number
  /** the concrete pad under each post, mm */
  padLengthMm: number
  padWidthMm: number
  padDepthMm: number
  /** padstones under the beam ends: null = two for each beam, less one for each post that carries a beam end */
  padstones: number | null
  steelBy: SteelBy
  finish: SteelFinish
  /** a Hiab or lorry crane to lift the steel in */
  hiab: boolean
  /** weeks the props stay up */
  propWeeks: number
  engineer: boolean
  /** bricks, mortar and DPC to form the jambs, and the bricklayer to make good (a cut opening) */
  makeGood: boolean
  situationId?: string | null
  /** the connections and fabrications that go with the steel (end plates, cleats, splices, stiffeners ...): none to start; an opening saved before this has none */
  connections?: OpeningConnection[]
  /** a steel plate welded to the beams to spread their load over the wall: none to start */
  plate?: BeamPlate | null
  /** the width last given to this opening by the line drawn in Take-off: it follows the line until a width is typed over it */
  planWidthMm?: number
  /** the structural opening placed on a wall in Take-off that this one follows (it keeps following until typed over), and what it was last fed from it */
  planId?: string
  fromPlan?: string
  /** what goes over the opening. An opening saved before this has none: it is priced from the beam and post fields above, as it was. */
  over?: OverKind
  /** the steel over it, as the steel calculators have it (lib/wall-steel.ts WallSteel), when `over` is 'steel' */
  steelSpec?: unknown
  /** precast concrete lintels side by side: null = one for each leaf of the wall */
  lintelQty?: number | null
  /** padstones under the ends of a lintel: none to start */
  lintelPads?: number
  /** a cavity wall: the tray, weep vents and cavity closers */
  cavityWork?: boolean
  extras?: OpeningExtra[]
}

export function newStructuralOpening(id: string, ref: string, formed: OpeningFormed = 'cut-existing'): StructuralOpening {
  return {
    id, ref, location: '', formed, wall: 'solid', thicknessMm: WALL_THICKNESS.solid, widthMm: 2400, heightMm: 2100, qty: 1,
    loadBearing: formed === 'cut-existing', loadAbove: 'floor', beams: 1, section: 'auto', posts: 0, postSection: POST_SECTIONS[0].label, postRole: 'ends', postHeightMm: 2400,
    padLengthMm: 600, padWidthMm: 600, padDepthMm: 300, padstones: null, steelBy: 'us', finish: 'board', hiab: false, propWeeks: 1, engineer: formed === 'cut-existing', makeGood: formed === 'cut-existing', situationId: null,
  }
}
/** The usual number of beams for a wall of this thickness: one for a thin wall, a pair across 300mm or more (the engineer decides) */
export const usualBeams = (thicknessMm: number) => (thicknessMm >= 300 ? 2 : 1)

// ── Openings placed on the Take-off drawing ───────────────────────────────────────────────────────────────────────────
/** A structural opening as the drawing knows it: placed on a wall, with the wall's thickness (read from how the wall is built) */
export interface PlanStructural {
  id: string; ref: string; location?: string; widthMm: number; heightMm: number; thicknessMm: number
  /** the steel chosen for it on the plan (anything not given is left as the calculator has it) */
  struct?: { section?: string; beams?: number; posts?: number; postRole?: PostRole; loadAbove?: LoadAbove; connections?: { kind: string; qty: number }[]; plate?: BeamPlate | null }
}
/** the kind of wall a thickness reads as: 280mm or more is a cavity wall, 190mm or more a solid brick wall, less a block wall */
export const wallKindFromThickness = (mm: number): OpeningWallKind => (mm >= 280 ? 'cavity' : mm >= 190 ? 'solid' : 'block')
export const planStructuralSig = (p: PlanStructural) => [p.widthMm, p.heightMm, p.ref, p.location ?? '', p.thicknessMm, p.struct ? JSON.stringify(p.struct) : ''].join('|')
const whole = (n: unknown, lo: number, hi: number): number | undefined => (typeof n === 'number' && Number.isFinite(n) && Math.round(n) === n && n >= lo && n <= hi ? n : undefined)
/** the steel chosen on the plan, made safe: a section that is not in the list, a count out of range or a connection of a kind that does not exist is left out */
export function steelFromPlan(s: PlanStructural['struct']): Partial<Pick<StructuralOpening, 'section' | 'beams' | 'posts' | 'postRole' | 'loadAbove' | 'connections' | 'plate'>> {
  if (!s) return {}
  const out: Partial<Pick<StructuralOpening, 'section' | 'beams' | 'posts' | 'postRole' | 'loadAbove' | 'connections' | 'plate'>> = {}
  if (s.plate === null) out.plate = null
  else if (s.plate && typeof s.plate === 'object') {
    const q = s.plate
    const t = typeof q.thicknessMm === 'number' && Number.isFinite(q.thicknessMm) && q.thicknessMm > 0 && q.thicknessMm <= 60 ? q.thicknessMm : undefined
    const w = q.widthMm === null ? null : typeof q.widthMm === 'number' && Number.isFinite(q.widthMm) && q.widthMm > 0 && q.widthMm <= 1000 ? q.widthMm : undefined
    const l = q.lengthMm === null ? null : typeof q.lengthMm === 'number' && Number.isFinite(q.lengthMm) && q.lengthMm > 0 && q.lengthMm <= 20000 ? q.lengthMm : undefined
    const pos = q.position === 'bottom' || q.position === 'top' || q.position === 'both' ? q.position : undefined
    if (t !== undefined && w !== undefined && l !== undefined && pos) out.plate = { position: pos, thicknessMm: t, widthMm: w, lengthMm: l }
  }
  if (typeof s.section === 'string' && (s.section === 'auto' || BEAM_CHOICE_BY_LABEL[s.section])) out.section = s.section
  const b = whole(s.beams, 0, 4); if (b !== undefined) out.beams = b
  const p = whole(s.posts, 0, 6); if (p !== undefined) out.posts = p
  if (s.postRole === 'ends' || s.postRole === 'mid') out.postRole = s.postRole
  if (s.loadAbove === 'light' || s.loadAbove === 'floor' || s.loadAbove === 'heavy') out.loadAbove = s.loadAbove
  if (Array.isArray(s.connections)) {
    out.connections = s.connections
      .filter(c => c && typeof c.kind === 'string' && CONNECTION_BY_ID[c.kind] && typeof c.qty === 'number' && Number.isFinite(c.qty) && c.qty > 0 && c.qty <= 99)
      .map(c => ({ kind: c.kind as ConnectionKind, qty: CONNECTION_BY_ID[c.kind].unit === 'h' ? Math.round(c.qty * 2) / 2 : Math.round(c.qty) }))
      .filter(c => c.qty > 0)
  }
  return out
}

/**
 * The calculator's openings brought in step with the drawing: an opening placed on a wall is added (cut in an existing wall, load-bearing, with the usual steel for its wall), one already in the calculator follows the
 * drawing when the drawing's opening changes (its width, height, reference, room and the wall's thickness) and is otherwise left as typed, and one whose drawing opening has been deleted goes. Openings typed in the
 * calculator with no drawing opening are never touched.
 */
export function mergePlanStructural(existing: StructuralOpening[], plan: PlanStructural[]): StructuralOpening[] {
  const byPlan = new Map(plan.map(p => [p.id, p]))
  const out: StructuralOpening[] = []
  const seen = new Set<string>()
  const apply = (base: StructuralOpening, p: PlanStructural): StructuralOpening => {
    const wall = wallKindFromThickness(p.thicknessMm)
    return { ...base, ref: p.ref, location: p.location ?? base.location, widthMm: p.widthMm, heightMm: p.heightMm, wall, thicknessMm: Math.round(p.thicknessMm), ...steelFromPlan(p.struct), planId: p.id, fromPlan: planStructuralSig(p) }
  }
  for (const e of existing) {
    if (!e.planId) { out.push(e); continue }
    const p = byPlan.get(e.planId)
    if (!p) continue
    seen.add(p.id)
    out.push(e.fromPlan === planStructuralSig(p) ? e : apply(e, p))
  }
  for (const p of plan) {
    if (seen.has(p.id)) continue
    const base = newStructuralOpening('so-' + p.id, p.ref)
    out.push({ ...apply({ ...base, beams: usualBeams(Math.round(p.thicknessMm)) }, p) })
  }
  return out
}

export interface StructuralLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface StructuralLabourTask { key: string; roomId: string; trade: 'bricklayer' | 'labourer' | 'carpenter'; task: string; hours: number; basis: string }
export interface StructuralSummary { openingId: string; ref: string; name: string; parts: string[]; beamLabel: string; steelKg: number; hours: number }
export interface StructuralResult {
  lines: StructuralLine[]
  labour: StructuralLabourTask[]
  openings: StructuralSummary[]
  totalOpenings: number
  totalSteelKg: number
  totalHours: number
  warnings: string[]
}
export interface StructuralInput {
  openings: StructuralOpening[]
  jobSituationId: string
  situations: StructuralSituation[]
  /** the Building Control notice (once for the job, when any opening carries load) */
  buildingControl: boolean
  /** dust sheets and a temporary screen (once for the job) */
  dustProtection: boolean
  rates: Partial<Record<StructuralRateKey, number>>
  /** the steel of the openings set up with the steel calculators' options, by opening id */
  steel?: Record<string, OpeningSteelPriced>
}

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const n2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2)
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const countWord = (n: number) => (n === 1 ? 'a' : n === 2 ? 'two' : n === 3 ? 'three' : String(n))
const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

export function calculateStructuralOpenings(input: StructuralInput): StructuralResult {
  const job = input.situations.find(s => s.id === input.jobSituationId) ?? input.situations[0]
  const rate = (k: StructuralRateKey): number => {
    const v = input.rates[k] ?? RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const lines: StructuralLine[] = []
  const labour: StructuralLabourTask[] = []
  const summaries: StructuralSummary[] = []
  const warnings: string[] = []
  let totalSteelKg = 0, totalHours = 0, totalOpenings = 0
  let anyLoad = false, anyBoard = false, anyCut = false, anyNew = false, anyPost = false, anySub = false, anyPlate = false

  for (const o of input.openings) {
    const name = o.ref.trim() || 'Opening'
    const label = `${name}${o.location.trim() ? ` (${o.location.trim()})` : ''}`
    if (!(o.widthMm > 0) || !(o.heightMm > 0)) throw new Error(`The size of ${name} must be above zero.`)
    if (!(o.thicknessMm > 0)) throw new Error(`The wall thickness for ${name} must be above zero.`)
    if (!(o.qty >= 1) || Math.round(o.qty) !== o.qty) throw new Error(`The number of ${name} must be a whole number, 1 or more.`)
    if (!(o.beams >= 0) || Math.round(o.beams) !== o.beams) throw new Error(`${name}: the number of beams must be a whole number, 0 or more.`)
    if (!(o.posts >= 0) || Math.round(o.posts) !== o.posts) throw new Error(`${name}: the number of posts must be a whole number, 0 or more.`)
    if (o.posts > 0 && (!(o.postHeightMm > 0) || !(o.padLengthMm > 0) || !(o.padWidthMm > 0) || !(o.padDepthMm > 0))) throw new Error(`${name}: the post height and the pad size must be above zero.`)
    if (!(o.propWeeks >= 0)) throw new Error(`${name}: the weeks for the props cannot be negative.`)
    if (o.padstones !== null && !(o.padstones >= 0)) throw new Error(`${name}: the padstones cannot be negative.`)
    const qty = o.qty
    const cut = o.formed === 'cut-existing'
    const sit = input.situations.find(s => s.id === o.situationId) ?? job
    const uplift = 1 + (sit?.upliftPct ?? 0) / 100
    const wallWord = WALL_WORD[o.wall]
    const widthM = o.widthMm / 1000
    const heightM = o.heightMm / 1000
    const thickM = o.thicknessMm / 1000
    const parts: string[] = []
    const add = (key: string, what: string, unit: string, unitCost: number, q: number, category: StructuralLine['category'] = 'materials') => {
      if (q > 0 && unitCost >= 0) lines.push({ id: `${key}|${o.id}`, name: `${label} — ${what}`, category, unit, unitCost: money(unitCost), qty: +q.toFixed(3), roomId: o.id })
    }
    let brickHours = 0, labourHours = 0, carpHours = 0
    const bits: string[] = []
    totalOpenings += qty
    const full = o.over !== undefined                              // set up with "what goes over the opening"
    if (cut) anyCut = true; else anyNew = true
    if (o.loadBearing) anyLoad = true

    // ── the steel over the opening ───────────────────────────────────────────────
    // the span a beam works across: the opening, or the bay between posts when posts stand under it
    const bays = o.postRole === 'mid' && o.posts > 0 ? o.posts + 1 : 1
    const spanM = widthM / bays
    const lengthM = widthM + 2 * (BEARING_MM / 1000)           // the whole beam, with a bearing at each end
    let beamLabel = ''
    let openingKg = 0
    let beamLm = 0
    let boxGirthMm = 0, surfaceM2 = 0
    const auto = o.section === 'auto' || !BEAM_CHOICE_BY_LABEL[o.section]
    if (!full && o.beams > 0) {
      const picked = auto ? beamFor(spanM, o.loadAbove) : { section: BEAM_CHOICE_BY_LABEL[o.section], beyond: false }
      const sec = picked.section
      beamLabel = sec.label
      if (auto && picked.beyond) { warnings.push(`${label}: a ${n2(spanM)}m span with ${LOAD_WORD[o.loadAbove]} is beyond the sample table: the largest section is priced, and the engineer must specify the real one.`) }
      if (!auto && lighterThanChart(sec, spanM, o.loadAbove)) warnings.push(`${label}: ${sec.label} is lighter than the sample table suggests for ${n2(spanM)}m with ${LOAD_WORD[o.loadAbove]}: check it with the engineer.`)
      beamLm = lengthM * o.beams * qty
      const kg = sec.kgPerM * lengthM * o.beams
      openingKg += kg
      boxGirthMm = Math.max(boxGirthMm, sec.boxGirthMm)
      surfaceM2 += sec.surfaceM2PerM * lengthM * o.beams
      const eachKg = sec.kgPerM * lengthM
      if (eachKg > LIGHT_LIFT_KG && !o.hiab && o.steelBy === 'us') { warnings.push(`${label}: each beam is about ${Math.round(eachKg)}kg: it needs a Hiab or crane, or a big team and needles to lift it: tick the Hiab if it is coming.`) }
      if (o.steelBy === 'us') {
        add('beam', `${sec.label} steel beam, ${n2(lengthM)}m with bearings (the section is the designer's)`, 'm', sec.kgPerM * rate('steelPerKg'), lengthM * o.beams * qty)
      }
      bits.push(`${countWord(o.beams)} ${sec.label} steel ${o.beams === 1 ? 'beam' : 'beams'}`)
      // a plate welded to the beams to spread their load over the wall
      if (o.plate) {
        checkBeamPlate(o.plate, name)
        const pl = beamPlateFor(o.plate, lengthM, o.thicknessMm)
        const nPlates = pl.plates * o.beams
        const plateKg = pl.kg * o.beams
        openingKg += plateKg
        if (o.steelBy === 'us') add('plate', `${o.plate.thicknessMm}mm x ${Math.round(pl.widthMm)}mm steel plate, ${n2(pl.lengthM)}m, welded ${o.plate.position === 'bottom' ? 'to the underside' : o.plate.position === 'top' ? 'to the top' : 'top and underside'} of the ${o.beams === 1 ? 'beam' : 'beams'} (${nPlates} plate${nPlates === 1 ? '' : 's'}, ${Math.round(plateKg)}kg)`, 'kg', rate('steelPerKg'), plateKg * qty)
        add('plate-weld', `cutting, drilling and welding the load-spreading plate${nPlates === 1 ? '' : 's'}`, 'h', rate('fabPerHour'), pl.hours * o.beams * qty, 'subcontractors')
        bits.push(beamPlateWords(o.plate, pl.widthMm, o.beams))
        if (o.plate.thicknessMm < 5 || o.plate.thicknessMm > 25) warnings.push(`${label}: a ${o.plate.thicknessMm}mm welded plate is outside the usual 6 to 20mm: check it with the engineer.`)
        if (pl.widthMm < o.thicknessMm * 0.9) warnings.push(`${label}: the welded plate is ${Math.round(pl.widthMm)}mm wide but the wall is ${o.thicknessMm}mm thick: a plate usually spans the whole bearing so the load spreads across the wall (the cavity too, if the beam bears over it).`)
        anyPlate = true
      }
    }
    let postKg = 0
    if (!full && o.posts > 0) {
      anyPost = true
      const ps = POST_BY_LABEL[o.postSection] ?? POST_SECTIONS[0]
      const postM = o.postHeightMm / 1000
      postKg = ps.kgPerM * postM * o.posts
      openingKg += postKg
      surfaceM2 += ps.surfaceM2PerM * postM * o.posts
      boxGirthMm = Math.max(boxGirthMm, ps.boxGirthMm)
      if (o.steelBy === 'us') {
        add('post', `${ps.label} steel post, ${n2(postM)}m high`, 'nr', ps.kgPerM * postM * rate('steelPerKg'), o.posts * qty)
        add('plates', 'base plate, cap plate, holding-down bolts and grout to each post', 'nr', rate('plateSet'), o.posts * qty)
      }
      // a concrete pad under each post
      const padM3 = (o.padLengthMm / 1000) * (o.padWidthMm / 1000) * (o.padDepthMm / 1000)
      add('pad-concrete', `concrete pad ${o.padLengthMm} x ${o.padWidthMm} x ${o.padDepthMm}mm under each post`, 'm³', rate('concretePerM3'), padM3 * o.posts * qty)
      add('pad-spoil', 'soil from the pad holes: skip share', 'm³', rate('rubblePerM3'), padM3 * SPOIL_BULK * o.posts * qty)
      labourHours += (padM3 * o.posts * HOURS.padDigPerM3 + padM3 * o.posts * HOURS.padPourPerM3 + HOURS.padMin * o.posts) * qty
      bits.push(`${countWord(o.posts)} ${ps.label} steel ${o.posts === 1 ? 'post on a concrete pad' : 'posts on concrete pads'}`)
      if (o.padDepthMm < 300) warnings.push(`${label}: a pad under a post is not usually thinner than 300mm: the engineer sizes it for the ground and the load.`)
    }
    totalSteelKg += openingKg * qty

    // steelwork contractor: supply, delivery and fixing in one line
    if (o.steelBy === 'sub' && openingKg > 0) {
      anySub = true
      add('steel-sub', `steelwork contractor: supply and fix ${Math.round(openingKg)}kg of steel (${[o.beams > 0 ? plural(o.beams, 'beam', 'beams') : '', o.posts > 0 ? plural(o.posts, 'post', 'posts') : ''].filter(Boolean).join(' and ')})`, 'kg', rate('steelSubPerKg'), openingKg * qty, 'subcontractors')
      add('plates-sub', 'base plate, cap plate, holding-down bolts and grout to each post', 'nr', rate('plateSet'), o.posts * qty)
    }

    // padstones under the beam ends (a post that carries a beam end takes the place of one)
    if (!full && o.beams > 0) {
      const defaultPads = Math.max(0, 2 * o.beams - (o.postRole === 'ends' ? o.posts : 0))
      const pads = o.padstones ?? defaultPads
      if (pads > 0) { add('padstone', 'padstones under the beam ends', 'nr', rate('padstone'), pads * qty); brickHours += pads * HOURS.padstone * qty }
      if (o.steelBy === 'us') {
        brickHours += (HOURS.setBeamBase + HOURS.setBeamPerM * lengthM) * o.beams * qty
        labourHours += (HOURS.setBeamBase + HOURS.setBeamPerM * lengthM) * o.beams * LABOURER_ON_STEEL * qty
      }
      if (pads > 0) bits.push(`${countWord(pads)} padstone${pads === 1 ? '' : 's'}`)
    }
    if (!full && o.posts > 0 && o.steelBy === 'us') { brickHours += HOURS.post * o.posts * qty; labourHours += HOURS.post * o.posts * LABOURER_ON_STEEL * qty }
    if (o.hiab && openingKg > 0) { add('hiab', 'Hiab or lorry crane to lift the steel in', 'visit', rate('hiab'), qty, 'plant') }

    // connections and fabrications that go with the steel
    for (const c of full ? [] : o.connections ?? []) {
      const info = CONNECTION_BY_ID[c.kind]
      if (!info) continue
      if (!(c.qty >= 0) || !Number.isFinite(c.qty)) throw new Error(`${name}: the number of ${info.short}s cannot be negative.`)
      if (c.qty === 0) continue
      if (info.unit === 'h') {
        add('conn-fabrication', 'other fabrication: welding, cutting and drilling', 'h', rate('fabPerHour'), c.qty * qty, 'subcontractors')
        bits.push(`${n1(c.qty)} hour${c.qty === 1 ? '' : 's'} of fabrication`)
      } else {
        add(`conn-${c.kind}`, info.label.split(' (')[0].replace(/^./, ch => ch.toLowerCase()), 'nr', info.cost, c.qty * qty, o.steelBy === 'sub' ? 'subcontractors' : 'materials')
        if (o.steelBy === 'us') brickHours += info.hours * c.qty * qty
        bits.push(`${n1(c.qty)} ${info.short}${c.qty === 1 ? '' : 's'}`)
      }
    }

    // fire protection to the steel
    if (openingKg > 0 && o.finish === 'board') {
      anyBoard = true
      const runLm = (beamLm / qty) + (o.posts * o.postHeightMm / 1000)
      const girthM = boxGirthMm / 1000
      const faces = girthM * runLm
      add('case-batten', 'casing frame (battens)', 'lm', (4 + 1 / 0.6 * girthM) * rate('batten'), runLm * qty)
      add('case-board', 'fire-resisting board, two layers (incl. waste)', 'm²', rate('boardFire') * 1.1, faces * 2 * qty)
      carpHours += HOURS.caseSetup + runLm * HOURS.casePerLm
      bits.push('the steel cased in two layers of fire-resisting board')
    } else if (openingKg > 0 && o.finish === 'intumescent') {
      add('intumescent', 'intumescent coating to the steel (applied by a specialist)', 'm²', rate('intumescentPerM2'), surfaceM2 * qty, 'subcontractors')
      bits.push('an intumescent coating to the steel')
    } else if (!full && openingKg > 0) {
      warnings.push(`${label}: no fire protection is priced to the steel: confirm with the engineer and Building Control whether it needs any (a floor above usually does).`)
    }

    // ── set up with "what goes over the opening": the steel calculators' steel, or a lintel ────────
    let extraCarpHours = 0
    if (full && o.over === 'steel') {
      const st = input.steel?.[o.id]
      if (st) {
        for (const l of st.lines) lines.push({ ...l, id: `${l.id}|${o.id}`, qty: +(l.qty * qty).toFixed(3), category: l.category, roomId: o.id })
        brickHours += st.hours.bricklayer * qty; labourHours += st.hours.labourer * qty; extraCarpHours += st.hours.carpenter * qty
        openingKg += st.steelKg
        totalSteelKg += st.steelKg * qty
        beamLabel = st.beamLabel
        if (st.words) bits.push(st.words)
        for (const w of st.warnings) if (!warnings.includes(w)) warnings.push(w)
        if (st.lines.length === 0 && o.loadBearing) warnings.push(`${label}: it is marked as load-bearing but no beam or post is set up over it: check with the engineer.`)
      }
    } else if (full && o.over !== 'none') {
      const kind = o.over as 'concrete' | 'steel-cavity' | 'steel-box'
      const lintelM = widthM + 2 * (BEARING_MM / 1000)
      const factor = Math.max(1, lintelM / 1.5)
      const n = kind === 'concrete' ? Math.max(1, Math.round(o.lintelQty ?? usualLintels(o.wall, o.thicknessMm))) : 1
      const rk = kind === 'concrete' ? 'lintelConcrete' : kind === 'steel-cavity' ? 'lintelSteelCavity' : 'lintelSteelBox'
      const word = kind === 'concrete' ? 'precast concrete lintel' : kind === 'steel-cavity' ? 'steel cavity lintel' : 'steel box lintel'
      add('lintel', `${word}${n === 1 ? '' : 's'}, ${n2(lintelM)}m with bearings`, 'nr', rate(rk) * factor, n * qty)
      brickHours += HOURS[rk] * n * qty; labourHours += HOURS[rk] * n * LABOURER_ON_STEEL * qty
      const pads = Math.max(0, Math.round(o.lintelPads ?? 0))
      if (pads > 0) { add('lintelpads', 'padstones under the lintel ends', 'nr', rate('padstone'), pads * qty); brickHours += pads * HOURS.padstone * qty }
      beamLabel = word
      bits.push(`${n === 1 ? 'a' : countWord(n)} ${word}${n === 1 ? '' : 's'} over${pads > 0 ? `, on ${countWord(pads)} padstone${pads === 1 ? '' : 's'}` : ''}`)
      if (kind === 'steel-cavity' && o.wall !== 'cavity') warnings.push(`${label}: a steel cavity lintel is for a cavity wall: choose another lintel for a ${wallWord}.`)
      if (widthM > 2.4) warnings.push(`${label}: an opening ${n2(widthM)}m wide normally needs a steel beam specified by the engineer rather than a standard lintel.`)
      else if (o.loadAbove === 'heavy') warnings.push(`${label}: with a heavy load above, check with the engineer that a standard lintel is enough.`)
    } else if (full) {
      warnings.push(`${label}: nothing is priced over this opening: someone else is supplying it, or it is not a structural one.`)
    }
    // a cavity wall: the tray over a separate lintel or beam with its weeps, and the closers down the jambs
    if (full && o.cavityWork && o.wall === 'cavity') {
      if (o.over === 'steel' || o.over === 'concrete') {
        add('tray', 'cavity tray over the opening', 'nr', rate('cavityTray'), qty)
        add('weeps', 'weep vents', 'nr', rate('weep'), Math.max(2, Math.ceil((widthM + 0.3) / 0.9)) * qty)
      }
      add('closers', 'cavity closers down both jambs', 'm', rate('closerPerM'), 2 * heightM * qty)
      brickHours += HOURS.cavityWork * qty
      bits.push(o.over === 'steel' || o.over === 'concrete' ? 'a cavity tray, weep vents and cavity closers' : 'cavity closers')
    }
    // anything else typed in for this opening
    for (const [i, e] of (full ? o.extras ?? [] : []).entries()) {
      if (!e.name.trim() || !(e.qty > 0)) continue
      if (!(e.unitCost >= 0)) throw new Error(`${name}: the price of "${e.name.trim()}" cannot be negative.`)
      add(`extra${i}`, e.name.trim(), 'nr', e.unitCost, e.qty * qty, e.category)
      bits.push(e.name.trim())
    }

    // ── the wall itself ──────────────────────────────────────────────────────────
    const perimM = 2 * (widthM + heightM)
    const jambM = 2 * heightM
    if (cut) {
      // cut through a wall that is standing
      const bedM = 0.15 + 0.05                                   // the lintel and its bed above the opening
      const volM3 = widthM * (heightM + bedM) * (o.wall === 'cavity' ? 0.215 : thickM) * qty
      const cutHours = Math.max(HOURS.cutMin * qty, volM3 * HOURS.cutPerM3[o.wall])
      add('rubble', 'rubble from the opening: skip share', 'm³', rate('rubblePerM3'), volM3 * RUBBLE_BULK)
      if (o.loadBearing) {
        add('props', `needles and Acrow props hired (${o.propWeeks === 1 ? 'a week' : `${n1(o.propWeeks)} weeks`})`, 'nr', (rate('propsHire') + rate('propsPerExtraM') * Math.max(0, spanM - 1.5)) * Math.max(0, o.propWeeks), qty, 'plant')
        labourHours += (HOURS.props + HOURS.propsPerM * widthM) * qty
      }
      if (o.makeGood) {
        add('makegood', 'bricks, mortar and DPC to form the jambs and make good the reveals', 'item', rate('makeGoodMaterials'), qty)
        brickHours += (HOURS.makeGoodBase + HOURS.makeGoodPerJambM * jambM) * qty
      }
      brickHours += cutHours * 0.5
      labourHours += cutHours * 0.5
      if (o.loadBearing && o.engineer) add('engineer', 'structural engineer: calculations for the new opening', 'nr', rate('engineer'), qty, 'subcontractors')
      parts.push(`a new opening ${n2(widthM)} x ${n2(heightM)}m cut in the existing ${wallWord}${o.loadBearing ? ' (load-bearing)' : ''}, with ${list([...bits, ...(o.loadBearing ? ['needles and props'] : []), 'the rubble taken away', ...(o.makeGood ? ['the jambs made good'] : [])])}`)
      if (o.loadBearing) warnings.push(`${label}: cutting an opening in a load-bearing wall needs the engineer's design and a Building Control notice before work starts${o.engineer ? '' : ' (the engineer is not priced here)'}, and the props in before any cutting.`)
    } else {
      // formed as the new wall goes up: the bricklayer leaves and trims the opening
      brickHours += (HOURS.formBase + HOURS.formPerPerimM * perimM) * qty
      labourHours += (HOURS.formBase + HOURS.formPerPerimM * perimM) * qty * LABOURER_ON_STEEL
      if (o.engineer) add('engineer', 'structural engineer: calculations for the opening', 'nr', rate('engineer'), qty, 'subcontractors')
      parts.push(`an opening ${n2(widthM)} x ${n2(heightM)}m formed in the new ${wallWord}${bits.length ? ', with ' + list(bits) : ''}`)
    }
    if (!full && o.beams === 0 && o.posts === 0 && o.loadBearing) warnings.push(`${label}: it is marked as load-bearing but no beam or post is priced over it: check with the engineer.`)

    // ── hours ────────────────────────────────────────────────────────────────────
    const mult = uplift
    const upNote = uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : ''
    let hrsOpening = 0
    if (brickHours > 0) {
      const h = hoursOf(brickHours * mult)
      labour.push({ key: `bricks|${o.id}`, roomId: o.id, trade: 'bricklayer', task: `${label} — ${cut ? `cut the opening, set the ${full && o.over !== 'steel' ? 'lintel' : 'steel'} and make good` : `form the opening and set the ${full && o.over !== 'steel' ? 'lintel' : 'steel'}`}`, hours: h, basis: `${n1(brickHours / qty)}h each${qty > 1 ? ` x ${qty}` : ''}${upNote}` }); hrsOpening += h
    }
    if (labourHours > 0) {
      const h = hoursOf(labourHours * mult)
      labour.push({ key: `labour|${o.id}`, roomId: o.id, trade: 'labourer', task: `${label} — ${full && o.over !== 'steel' ? (cut ? 'props, break out and clear the rubble' : 'help form the opening and set the lintel') : cut ? 'props, break out, dig the pads and clear the rubble' : 'help form the opening, set the steel and dig the pads'}`, hours: h, basis: 'labourer with the bricklayer' }); hrsOpening += h
    }
    // (the casing hours of the older steel fields are for one opening; the steel calculators' carpentry already counts them all)
    const carpAll = carpHours * qty + extraCarpHours
    if (carpAll > 0) {
      const h = hoursOf(carpAll * mult)
      labour.push({ key: `carp|${o.id}`, roomId: o.id, trade: 'carpenter', task: `${label} — ${full ? 'case the steel and fix any timber' : 'frame and board the steel casing'}`, hours: h, basis: `${n1(carpAll / qty)}h each${qty > 1 ? ` x ${qty}` : ''}${upNote}` }); hrsOpening += h
      const hl = hoursOf(carpAll * mult * LABOURER_ON_CASING)
      labour.push({ key: `casehelp|${o.id}`, roomId: o.id, trade: 'labourer', task: `${label} — help lift the casing board`, hours: hl, basis: `${Math.round(LABOURER_ON_CASING * 100)}% of the carpenter's hours` }); hrsOpening += hl
    }
    totalHours += hrsOpening
    if (full && o.over === 'steel') anyPost = anyPost || (input.steel?.[o.id]?.lines.some(l => /pad-concrete/.test(l.id)) ?? false)
    summaries.push({ openingId: o.id, ref: name, name: label, parts, beamLabel, steelKg: Math.round(openingKg * qty), hours: hrsOpening })
  }

  // once for the job
  if (input.buildingControl && anyLoad) lines.push({ id: 'buildingcontrol|job', name: 'Building Control notice and inspections for the structural openings', category: 'other', unit: 'sum', unitCost: money(rate('buildingControl')), qty: 1 })
  if (input.dustProtection && input.openings.length > 0) lines.push({ id: 'dust|job', name: 'dust sheets and a temporary screen', category: 'materials', unit: 'sum', unitCost: money(rate('dust')), qty: 1 })

  if (input.openings.length > 0) {
    warnings.push('Every structural opening needs the structural engineer\'s design and calculations: the steel sections here are indicative samples to price from, not a design.')
    if (anyCut) warnings.push('If the wall is a party wall, a Party Wall Act notice is needed before work starts: it is not priced here.')
    if (anyNew) warnings.push('A new wall\'s own calculator already prices a lintel over each opening drawn on it: use this for the steel beam over a wide opening in place of that lintel, not as well.')
    if (anyBoard) warnings.push('Fire protection to structural steel has a rating set by the engineer or Building Control: confirm the board, the layers and the fixings. If the Boxing-in calculator also casts this beam, count it in one place only.')
    if (anyPlate) warnings.push(PLATE_RATE_NOTE)
    if (anyPost) warnings.push('A post stands on a concrete pad sized by the engineer for the ground and the load: the pad here is a sample size, and the ground must be checked.')
    if (anySub) warnings.push('A steelwork contractor\'s price covers supplying, delivering and fixing the steel: the cutting, props, make good and fire protection stay here.')
    warnings.push('Not included: the door or window and its frame (Windows & Doors), plastering the reveals, decorating, or making good the floor and ceiling.')
  }
  return { lines, labour, openings: summaries, totalOpenings, totalSteelKg: Math.round(totalSteelKg), totalHours: money(totalHours), warnings }
}
