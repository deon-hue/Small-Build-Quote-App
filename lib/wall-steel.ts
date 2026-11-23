// The steel over an opening in a WALL calculator, priced by the Structural Openings engine. A cavity wall's opening can have a steel beam over it; this lets that beam be set up the way the steel calculators
// do it (a section from the same 14 universal beams or picked from the span, one beam or a pair, posts on pads, a plate welded on to spread the load, connections and fabrications, fire protection, who supplies it)
// and priced the same way, line for line, by `calculateStructuralOpenings`. The wall keeps pricing its own cavity tray and weep vents; the beam, its padstones and everything on the steel come from here, so nothing is counted twice.
// Pure: no screen, no wall geometry. (Type and engine imports only from the steel engine, which has none of its own.)

import {
  calculateStructuralOpenings, newStructuralOpening, POST_SECTIONS, DEFAULT_STRUCTURAL_SITUATIONS, BEAM_CHOICE_BY_LABEL, POST_BY_LABEL, CONNECTION_BY_ID, beamPlateFor, beamPlateWords,
  type StructuralLine, type LoadAbove, type SteelFinish, type SteelBy, type PostRole, type OpeningConnection, type BeamPlate,
} from './structural-openings-units'

/** What the steel over one wall opening is set up as (the steel calculators' own choices) */
export interface WallSteel {
  /** a section label from the steel calculators ('203 × 133 UB 25') or 'auto' to pick one from the span and the load above */
  section: string
  /** one beam, or a pair side by side */
  beams: number
  loadAbove: LoadAbove
  posts: number
  postSection: string
  postRole: PostRole
  postHeightMm: number
  steelBy: SteelBy
  finish: SteelFinish
  hiab: boolean
  connections: OpeningConnection[]
  /** a steel plate welded to the beam to spread its load over the wall */
  plate: BeamPlate | null
  /** padstones under the beam ends: null = two for each beam, less one for each post that carries a beam end */
  padstones: number | null
}

/** The steel a wall opening starts with: one beam picked from the span (one floor above), supplied by us, no posts, plate or connections, and no casing (a lintel is built into the wall) */
export function newWallSteel(section = 'auto'): WallSteel {
  return { section, beams: 1, loadAbove: 'floor', posts: 0, postSection: POST_SECTIONS[0].label, postRole: 'ends', postHeightMm: 2400, steelBy: 'us', finish: 'none', hiab: false, connections: [], plate: null, padstones: null }
}

const num = (n: unknown, lo: number, hi: number, d: number): number => (typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : d)

/** Whatever was saved, made safe: unknown sections and kinds are dropped, counts held in range, so the engine is never handed rubbish */
export function cleanWallSteel(x: unknown): WallSteel {
  const d = newWallSteel()
  const s = (x && typeof x === 'object' ? x : {}) as Partial<WallSteel>
  const plate = s.plate && typeof s.plate === 'object'
    && (s.plate.position === 'bottom' || s.plate.position === 'top' || s.plate.position === 'both')
    && typeof s.plate.thicknessMm === 'number' && s.plate.thicknessMm > 0 && s.plate.thicknessMm <= 60
    && (s.plate.widthMm === null || (typeof s.plate.widthMm === 'number' && s.plate.widthMm > 0 && s.plate.widthMm <= 1000))
    && (s.plate.lengthMm === null || (typeof s.plate.lengthMm === 'number' && s.plate.lengthMm > 0 && s.plate.lengthMm <= 20000))
    ? { position: s.plate.position, thicknessMm: s.plate.thicknessMm, widthMm: s.plate.widthMm, lengthMm: s.plate.lengthMm } as BeamPlate : null
  return {
    section: typeof s.section === 'string' && (s.section === 'auto' || BEAM_CHOICE_BY_LABEL[s.section]) ? s.section : d.section,
    beams: Math.round(num(s.beams, 0, 4, d.beams)),
    loadAbove: s.loadAbove === 'light' || s.loadAbove === 'floor' || s.loadAbove === 'heavy' ? s.loadAbove : d.loadAbove,
    posts: Math.round(num(s.posts, 0, 6, d.posts)),
    postSection: typeof s.postSection === 'string' && POST_BY_LABEL[s.postSection] ? s.postSection : d.postSection,
    postRole: s.postRole === 'mid' ? 'mid' : 'ends',
    postHeightMm: num(s.postHeightMm, 300, 6000, d.postHeightMm),
    steelBy: s.steelBy === 'sub' ? 'sub' : 'us',
    finish: s.finish === 'board' || s.finish === 'intumescent' || s.finish === 'none' ? s.finish : d.finish,
    hiab: s.hiab === true,
    connections: Array.isArray(s.connections)
      ? s.connections.filter(c => c && typeof c.kind === 'string' && CONNECTION_BY_ID[c.kind] && typeof c.qty === 'number' && Number.isFinite(c.qty) && c.qty > 0 && c.qty <= 99)
        .map(c => ({ kind: c.kind, qty: CONNECTION_BY_ID[c.kind].unit === 'h' ? Math.round(c.qty * 2) / 2 : Math.round(c.qty) }))
      : [],
    plate,
    padstones: typeof s.padstones === 'number' && Number.isFinite(s.padstones) ? Math.round(Math.min(20, Math.max(0, s.padstones))) : null,
  }
}

export interface WallSteelItem { id: string; ref: string; widthMm: number; heightMm: number; steel: WallSteel }
export interface WallSteelResult {
  /** the priced lines, ready to become the wall's cost lines (materials, plant, subcontractors) */
  lines: StructuralLine[]
  /** the hours the steel needs that the wall's own labour does not include: setting the steel and padstones, digging pads, casing it */
  hours: { bricklayer: number; labourer: number; carpenter: number }
  warnings: string[]
  byOpening: Record<string, { beamLabel: string; steelKg: number; parts: string[]; /** the steel in words for the quote: X)' */ words: string }>
  totalSteelKg: number
}

const NUMBER_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six']
const countWords = (n: number): string => NUMBER_WORD[n] ?? String(n)
const joinList = (a: string[]): string => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

/**
 * The steel over a wall opening in words, for the quote: 'one 203 × 133 UB 25 steel beam over, on two padstones, with a 10mm x 328mm steel plate welded to the underside of the beam to spread the load over the wall, 2 end plates,
 * two 152 × 152 UC 23 steel posts on concrete pads, the steel cased in two layers of fire-resisting board, supplied and fixed by a steelwork contractor'. `beamLabel` is the section the engine chose (it picks one when the steel says 'auto').
 */
export function wallSteelWords(steel: WallSteel, beamLabel: string, widthMm: number, wallThicknessMm: number): string {
  if (steel.beams <= 0 && steel.posts <= 0) return ''
  const bits: string[] = []
  if (steel.beams > 0) {
    const pads = steel.padstones ?? Math.max(0, 2 * steel.beams - (steel.postRole === 'ends' ? steel.posts : 0))
    if (pads > 0) bits.push(`on ${countWords(pads)} padstone${pads === 1 ? '' : 's'}`)
    if (steel.plate) bits.push('with ' + beamPlateWords(steel.plate, beamPlateFor(steel.plate, widthMm / 1000 + 0.3, wallThicknessMm).widthMm, steel.beams))
  }
  const conns = steel.connections.filter(c => CONNECTION_BY_ID[c.kind] && c.qty > 0)
  if (conns.length) bits.push(joinList(conns.map(c => { const i = CONNECTION_BY_ID[c.kind]; return i.unit === 'h' ? `${c.qty} hour${c.qty === 1 ? '' : 's'} of fabrication` : `${c.qty} ${i.short}${c.qty === 1 ? '' : 's'}` })))
  if (steel.posts > 0) bits.push(`${countWords(steel.posts)} ${steel.postSection} steel post${steel.posts === 1 ? '' : 's'} on concrete pads`)
  if (steel.finish === 'board') bits.push('the steel cased in two layers of fire-resisting board')
  else if (steel.finish === 'intumescent') bits.push('an intumescent coating to the steel')
  if (steel.steelBy === 'sub') bits.push('supplied and fixed by a steelwork contractor')
  if (steel.hiab) bits.push('lifted in by Hiab')
  const head = steel.beams > 0 ? `${countWords(steel.beams)} ${beamLabel} steel beam${steel.beams === 1 ? '' : 's'} over` : 'steel posts'
  return bits.length ? `${head}, ${bits.join(", ")}` : head
}

/** warnings from the steel engine that make no sense inside a wall calculator: it IS the wall, the steel is built in as a lintel (no casing unless asked), and the door or window is not this calculator's */
const NOT_FOR_A_WALL = ["A new wall's own calculator", 'Not included: the door or window', 'no fire protection is priced']

/** Prices the steel over each of these wall openings with the Structural Openings engine: a NEW wall (no props, rubble or engineer), whatever each opening is set up as. `wallThicknessMm` is the whole wall (a plate is as wide as it by default). */
export function priceWallSteel(items: WallSteelItem[], wallThicknessMm: number): WallSteelResult {
  const out: WallSteelResult = { lines: [], hours: { bricklayer: 0, labourer: 0, carpenter: 0 }, warnings: [], byOpening: {}, totalSteelKg: 0 }
  if (items.length === 0) return out
  const openings = items.map(it => {
    const s = cleanWallSteel(it.steel)
    const o = newStructuralOpening(it.id, it.ref, 'new-wall')
    return { ...o, wall: 'cavity' as const, thicknessMm: Math.max(1, wallThicknessMm), widthMm: it.widthMm, heightMm: it.heightMm, qty: 1, loadBearing: false, engineer: false, makeGood: false, propWeeks: 0,
      loadAbove: s.loadAbove, beams: s.beams, section: s.section, posts: s.posts, postSection: s.postSection, postRole: s.postRole, postHeightMm: s.postHeightMm,
      padstones: s.padstones, steelBy: s.steelBy, finish: s.finish, hiab: s.hiab, connections: s.connections, plate: s.plate }
  })
  const r = calculateStructuralOpenings({ openings, jobSituationId: DEFAULT_STRUCTURAL_SITUATIONS[0].id, situations: DEFAULT_STRUCTURAL_SITUATIONS, buildingControl: false, dustProtection: false, rates: {} })
  out.lines = r.lines
  for (const t of r.labour) out.hours[t.trade] += t.hours
  out.warnings = r.warnings.filter(w => !NOT_FOR_A_WALL.some(n => w.includes(n)))
  for (const s of r.openings) { const it = items.find(i => i.id === s.openingId); out.byOpening[s.openingId] = { beamLabel: s.beamLabel, steelKg: s.steelKg, parts: s.parts, words: it ? wallSteelWords(cleanWallSteel(it.steel), s.beamLabel, it.widthMm, wallThicknessMm) : '' } }
  out.totalSteelKg = r.totalSteelKg
  return out
}
