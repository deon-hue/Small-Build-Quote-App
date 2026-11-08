// Structural openings in walls, priced one opening at a time (Structural Frame → Structural Openings (by opening)): a new opening cut through an EXISTING wall, or one formed as a NEW wall is built, with the steelwork
// that carries what is above it. Each opening has its size (a door, a wide knock-through), the wall (cavity, solid brick, block) and its thickness, how much load is above it (roof only, one floor, heavy), and the steel:
// one or more beams (the section chosen from the span and the load above, or typed), steel posts with a base plate and a concrete pad under each, padstones under the beam ends, and the fire protection to the steel. For a cut
// in a standing wall it adds needles and Acrow props, the masonry cut out by hand, the rubble away and the jambs made good; the structural engineer's calculations (a design is always needed) and the Building Control
// notice. Steel is fitted by us (supply at a rate per kg, a bricklayer and labourer to set it, optional Hiab or crane) or by a steelwork contractor (supply and fit per kg, a subcontract line).
// It prices the STRUCTURE only: the door or window and its frame are Windows & Doors, plastering the reveals is Plastering & Boarding, decorating is Decoration, and taking out a whole wall is Demolition → Wall Removal.
//
// Every rate and hour here is a SAMPLE, and every steel section is INDICATIVE (the engineer designs the real one): editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node.

export type OpeningWallKind = 'cavity' | 'solid' | 'block'
export type OpeningFormed = 'cut-existing' | 'new-wall'
export type LoadAbove = 'light' | 'floor' | 'heavy'
export type SteelBy = 'us' | 'sub'
export type SteelFinish = 'board' | 'intumescent' | 'none'
export type PostRole = 'ends' | 'mid'

export const WALL_LABEL: Record<OpeningWallKind, string> = { cavity: 'Cavity wall (brick and block, about 300mm)', solid: 'Solid brick wall (215mm or more)', block: 'Solid block wall (100 to 215mm)' }
export const WALL_WORD: Record<OpeningWallKind, string> = { cavity: 'cavity wall', solid: 'solid brick wall', block: 'solid block wall' }
export const WALL_THICKNESS: Record<OpeningWallKind, number> = { cavity: 300, solid: 215, block: 140 }
export const FORMED_LABEL: Record<OpeningFormed, string> = { 'cut-existing': 'Cut a new opening in an existing wall', 'new-wall': 'Form the opening in a new wall as it is built' }
export const LOAD_LABEL: Record<LoadAbove, string> = { light: 'Light: a ceiling or roof only', floor: 'One floor (and the roof) above', heavy: 'Heavy: two floors, or a chimney or heavy roof' }
export const LOAD_WORD: Record<LoadAbove, string> = { light: 'a light load above', floor: 'a floor above', heavy: 'a heavy load above' }
export const FINISH_LABEL: Record<SteelFinish, string> = { board: 'Cased in fire-resisting board (two layers on a timber frame)', intumescent: 'Intumescent coating (a specialist applies it)', none: 'None priced (to be done elsewhere)' }
export const POST_ROLE_LABEL: Record<PostRole, string> = { ends: 'Carry the ends of the beam', mid: 'Stand under the beam, splitting its span' }

/** Indicative steel beams (universal beams): weight, the surface to coat, the girth of a casing round it, and the longest clear span in metres for each load above. The engineer's section replaces it. */
export interface BeamSection { label: string; kgPerM: number; surfaceM2PerM: number; boxGirthMm: number; maxSpanM: Record<LoadAbove, number> }
export const BEAM_SECTIONS: BeamSection[] = [
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
/** Steel posts (universal columns) */
export interface PostSection { label: string; kgPerM: number; surfaceM2PerM: number; boxGirthMm: number }
export const POST_SECTIONS: PostSection[] = [
  { label: '152 × 152 UC 23', kgPerM: 23, surfaceM2PerM: 0.92, boxGirthMm: 700 },
  { label: '203 × 203 UC 46', kgPerM: 46, surfaceM2PerM: 1.19, boxGirthMm: 900 },
]
export const BEAM_BY_LABEL: Record<string, BeamSection> = Object.fromEntries(BEAM_SECTIONS.map(b => [b.label, b]))
export const POST_BY_LABEL: Record<string, PostSection> = Object.fromEntries(POST_SECTIONS.map(p => [p.label, p]))

/** The section for a clear span and a load: the lightest in the table that spans it (flagged when the span is beyond the table: the largest is then used and the engineer must specify) */
export function beamFor(spanM: number, load: LoadAbove): { section: BeamSection; beyond: boolean } {
  for (const s of BEAM_SECTIONS) if (spanM <= s.maxSpanM[load]) return { section: s, beyond: false }
  return { section: BEAM_SECTIONS[BEAM_SECTIONS.length - 1], beyond: true }
}

export const BEARING_MM = 150

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
  dust: 60,               // £ per job: dust sheets and a temporary screen
} as const
export type StructuralRateKey = keyof typeof RATES

export const HOURS = {
  cutPerM3: { cavity: 8, solid: 9, block: 6 } as Record<OpeningWallKind, number>, cutMin: 2, // cutting out by hand, hours per m³ of masonry
  props: 2, propsPerM: 0.8, makeGoodBase: 1, makeGoodPerJambM: 0.5,
  formBase: 1.5, formPerPerimM: 0.35,           // a bricklayer forms the opening in a new wall
  setBeamBase: 1.5, setBeamPerM: 0.6, padstone: 0.3, post: 1.5,
  padDigPerM3: 5, padPourPerM3: 1.5, padMin: 0.5,
  casePerLm: 1.0, caseSetup: 0.8,
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
  let anyLoad = false, anyBoard = false, anyCut = false, anyNew = false, anyPost = false, anySub = false

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
    const auto = o.section === 'auto' || !BEAM_BY_LABEL[o.section]
    if (o.beams > 0) {
      const picked = auto ? beamFor(spanM, o.loadAbove) : { section: BEAM_BY_LABEL[o.section], beyond: false }
      const sec = picked.section
      beamLabel = sec.label
      if (auto && picked.beyond) { warnings.push(`${label}: a ${n2(spanM)}m span with ${LOAD_WORD[o.loadAbove]} is beyond the sample table: the largest section is priced, and the engineer must specify the real one.`) }
      if (!auto && spanM > sec.maxSpanM[o.loadAbove]) warnings.push(`${label}: ${sec.label} is lighter than the sample table suggests for ${n2(spanM)}m with ${LOAD_WORD[o.loadAbove]}: check it with the engineer.`)
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
    }
    let postKg = 0
    if (o.posts > 0) {
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
      labourHours += (padM3 * o.posts * HOURS.padDigPerM3 + padM3 * o.posts * HOURS.padPourPerM3 + HOURS.padMin * o.posts)
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
    if (o.beams > 0) {
      const defaultPads = Math.max(0, 2 * o.beams - (o.postRole === 'ends' ? o.posts : 0))
      const pads = o.padstones ?? defaultPads
      if (pads > 0) { add('padstone', 'padstones under the beam ends', 'nr', rate('padstone'), pads * qty); brickHours += pads * HOURS.padstone }
      if (o.steelBy === 'us') {
        brickHours += (HOURS.setBeamBase + HOURS.setBeamPerM * lengthM) * o.beams
        labourHours += (HOURS.setBeamBase + HOURS.setBeamPerM * lengthM) * o.beams * LABOURER_ON_STEEL
      }
      if (pads > 0) bits.push(`${countWord(pads)} padstone${pads === 1 ? '' : 's'}`)
    }
    if (o.posts > 0 && o.steelBy === 'us') { brickHours += HOURS.post * o.posts; labourHours += HOURS.post * o.posts * LABOURER_ON_STEEL }
    if (o.hiab && openingKg > 0) { add('hiab', 'Hiab or lorry crane to lift the steel in', 'visit', rate('hiab'), qty, 'plant') }

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
    } else if (openingKg > 0) {
      warnings.push(`${label}: no fire protection is priced to the steel: confirm with the engineer and Building Control whether it needs any (a floor above usually does).`)
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
    if (o.beams === 0 && o.posts === 0 && o.loadBearing) warnings.push(`${label}: it is marked as load-bearing but no beam or post is priced over it: check with the engineer.`)

    // ── hours ────────────────────────────────────────────────────────────────────
    const mult = uplift
    const upNote = uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : ''
    let hrsOpening = 0
    if (brickHours > 0) {
      const h = hoursOf(brickHours * mult)
      labour.push({ key: `bricks|${o.id}`, roomId: o.id, trade: 'bricklayer', task: `${label} — ${cut ? 'cut the opening, set the steel and make good' : 'form the opening and set the steel'}`, hours: h, basis: `${n1(brickHours / qty)}h each${qty > 1 ? ` x ${qty}` : ''}${upNote}` }); hrsOpening += h
    }
    if (labourHours > 0) {
      const h = hoursOf(labourHours * mult)
      labour.push({ key: `labour|${o.id}`, roomId: o.id, trade: 'labourer', task: `${label} — ${cut ? 'props, break out, dig the pads and clear the rubble' : 'help form the opening, set the steel and dig the pads'}`, hours: h, basis: 'labourer with the bricklayer' }); hrsOpening += h
    }
    if (carpHours > 0) {
      const h = hoursOf(carpHours * qty * mult)
      labour.push({ key: `carp|${o.id}`, roomId: o.id, trade: 'carpenter', task: `${label} — frame and board the steel casing`, hours: h, basis: `${n1(carpHours)}h each${qty > 1 ? ` x ${qty}` : ''}${upNote}` }); hrsOpening += h
      const hl = hoursOf(carpHours * qty * mult * LABOURER_ON_CASING)
      labour.push({ key: `casehelp|${o.id}`, roomId: o.id, trade: 'labourer', task: `${label} — help lift the casing board`, hours: hl, basis: `${Math.round(LABOURER_ON_CASING * 100)}% of the carpenter's hours` }); hrsOpening += hl
    }
    totalHours += hrsOpening
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
    if (anyPost) warnings.push('A post stands on a concrete pad sized by the engineer for the ground and the load: the pad here is a sample size, and the ground must be checked.')
    if (anySub) warnings.push('A steelwork contractor\'s price covers supplying, delivering and fixing the steel: the cutting, props, make good and fire protection stay here.')
    warnings.push('Not included: the door or window and its frame (Windows & Doors), plastering the reveals, decorating, or making good the floor and ceiling.')
  }
  return { lines, labour, openings: summaries, totalOpenings, totalSteelKg: Math.round(totalSteelKg), totalHours: money(totalHours), warnings }
}
