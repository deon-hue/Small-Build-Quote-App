// The steel over an opening in a WALL calculator, set up and priced by the STEEL BEAMS, COLUMNS & POSTS engine (lib/structural-steel-units.ts), the calculator for structural steel on its own or inside a wall. (Structural Openings is the
// other one: knocking an opening through an EXISTING wall on the plan.) An opening's steel is a short list of members, exactly as that calculator has them: steel beams (universal beams, one or a pair), steel columns, box section
// (square hollow) posts, engineered timber beams and timber posts, each with its section, length, number, finish, how its ends are held, plate welded on, padstones or pad, and who supplies it. The wall prices the members with that
// engine, line for line, and keeps pricing only its own cavity tray and weep vents, so nothing is counted twice. The connections and fabrications list (end plates, cleats, splice plates, stiffeners, anchors, fabrication hours) is an
// extra kept per opening, priced at the Structural Openings rates. Pure: no screen, no wall geometry.

import {
  calculateSteelwork, sectionsFor, defaultSection, KIND_BY_ID, DEFAULT_STRUCTURAL_SITUATIONS, RATES as STEEL_RATES, STEEL_BEAMS, STEEL_COLUMNS,
  type SteelMember, type MemberKind, type MemberFinish, type MemberEnds, type MemberBy, type SteelLine, type CuttingGroup,
} from './structural-steel-units'
import { cleanProcesses, processWords, type MemberProcess } from './steel-processes'
import { isSteelGrade, type SteelGrade } from './steel-section-data'
import { beamFor, beamPlateFor, beamPlateWords, postPlateWords, DEFAULT_POST_PLATE_MM, CONNECTION_BY_ID, type LoadAbove, type OpeningConnection, type BeamPlate } from './structural-openings-units'

/** One piece of steel (or timber) over or beside a wall opening: the Steel Beams, Columns & Posts calculator's member, with a length that can follow the opening */
export interface WallMember {
  id: string
  kind: MemberKind
  /** a section from that calculator's list for the kind; for a beam, 'auto' picks one from the opening's span and what is above */
  section: string
  /** mm; null = the opening's own: a beam is the opening plus a bearing each end, a column or post the height of the opening */
  lengthMm: number | null
  qty: number
  finish: MemberFinish
  /** beams: bearing on padstones in masonry, or bolted to a column or another beam through end plates */
  ends: MemberEnds
  /** padstones under a beam's ends: null = two for each beam (masonry ends) */
  padstones: number | null
  /** posts and columns: a concrete pad under each, and its size, mm */
  pad: boolean
  padLengthMm: number
  padWidthMm: number
  padDepthMm: number
  by: MemberBy
  /** needles and Acrow props while a beam is fixed */
  propped: boolean
  /** a steel beam: a plate welded to it to spread its load over the wall; a steel column or box section post: a plate welded to its foot (a base plate) or head (a cap plate) */
  plate: BeamPlate | null
  /** fabrication processes on a steel member: holes, mitre cuts, notches, cleats, stiffeners, splices, shot blasting, other hours */
  processes: MemberProcess[]
  /** the grade of steel for the quote wording (S275 or S355); it does not change the price; none chosen says nothing */
  grade?: SteelGrade
}

/** What the steel over one wall opening is set up as */
export interface WallSteel {
  members: WallMember[]
  /** what is above the opening, for picking a beam section from the span */
  loadAbove: LoadAbove
  /** a Hiab or lorry crane lifts the steel in */
  hiab: boolean
  /** connections and fabrications that go with the steel (end plates, cleats, splices, stiffeners, anchors, fabrication hours) */
  connections: OpeningConnection[]
}

export const BEARING_EACH_END_MM = 150
let counter = 0
const newId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`

/** A new member of a kind: a beam picked from the span (shop primed, on padstones), a column or post as tall as the opening on a pad, a timber beam or post */
export function newWallMember(kind: MemberKind = 'beam', section?: string): WallMember {
  const k = KIND_BY_ID[kind]
  return {
    id: newId(), kind, section: section ?? (kind === 'beam' ? 'auto' : defaultSection(kind)), lengthMm: null, qty: 1, finish: k.steel ? 'primed' : 'none', ends: 'masonry', padstones: null,
    pad: k.post, padLengthMm: 600, padWidthMm: 600, padDepthMm: 300, by: 'us', propped: false, plate: null, processes: [],
  }
}

/** The steel a wall opening starts with: one steel beam picked from the span with one floor above, shop primed, on padstones, supplied by us */
export function newWallSteel(section = 'auto'): WallSteel {
  return { members: [newWallMember('beam', section)], loadAbove: 'floor', hiab: false, connections: [] }
}

const num = (n: unknown, lo: number, hi: number, d: number): number => (typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi ? n : d)
const KINDS = ['beam', 'column', 'hollow', 'lvl', 'timber-post'] as const
const FINISHES = ['primed', 'galvanised', 'intumescent', 'cased', 'none'] as const

function cleanPlate(p: unknown): BeamPlate | null {
  const q = p as BeamPlate | null | undefined
  if (!q || typeof q !== 'object') return null
  if (!(q.position === 'bottom' || q.position === 'top' || q.position === 'both')) return null
  if (!(typeof q.thicknessMm === 'number' && q.thicknessMm > 0 && q.thicknessMm <= 60)) return null
  if (!(q.widthMm === null || (typeof q.widthMm === 'number' && q.widthMm > 0 && q.widthMm <= 1000))) return null
  if (!(q.lengthMm === null || (typeof q.lengthMm === 'number' && q.lengthMm > 0 && q.lengthMm <= 20000))) return null
  return { position: q.position, thicknessMm: q.thicknessMm, widthMm: q.widthMm, lengthMm: q.lengthMm }
}
function cleanConnections(c: unknown): OpeningConnection[] {
  return Array.isArray(c)
    ? c.filter(x => x && typeof x.kind === 'string' && CONNECTION_BY_ID[x.kind] && typeof x.qty === 'number' && Number.isFinite(x.qty) && x.qty > 0 && x.qty <= 99)
      .map(x => ({ kind: x.kind, qty: CONNECTION_BY_ID[x.kind].unit === 'h' ? Math.round(x.qty * 2) / 2 : Math.round(x.qty) }))
    : []
}
function cleanMember(x: unknown): WallMember {
  const s = (x && typeof x === 'object' ? x : {}) as Partial<WallMember>
  const kind: MemberKind = (KINDS as readonly string[]).includes(s.kind as string) ? (s.kind as MemberKind) : 'beam'
  const d = newWallMember(kind)
  const secOk = typeof s.section === 'string' && ((kind === 'beam' && s.section === 'auto') || sectionsFor(kind).some(c => c.label === s.section))
  const post = KIND_BY_ID[kind].post
  return {
    id: typeof s.id === 'string' && s.id ? s.id : d.id,
    kind,
    section: secOk ? (s.section as string) : d.section,
    lengthMm: s.lengthMm === null || s.lengthMm === undefined ? null : num(s.lengthMm, 100, 20000, 0) || null,
    qty: Math.round(num(s.qty, 1, 20, 1)),
    finish: (FINISHES as readonly string[]).includes(s.finish as string) ? (s.finish as MemberFinish) : d.finish,
    ends: s.ends === 'steel' ? 'steel' : 'masonry',
    padstones: typeof s.padstones === 'number' && Number.isFinite(s.padstones) ? Math.round(Math.min(20, Math.max(0, s.padstones))) : null,
    pad: post ? s.pad !== false : false,
    padLengthMm: num(s.padLengthMm, 100, 3000, d.padLengthMm), padWidthMm: num(s.padWidthMm, 100, 3000, d.padWidthMm), padDepthMm: num(s.padDepthMm, 100, 2000, d.padDepthMm),
    by: s.by === 'sub' ? 'sub' : 'us',
    propped: s.propped === true,
    plate: KIND_BY_ID[kind].steel ? cleanPlate(s.plate) : null,
    processes: KIND_BY_ID[kind].steel ? cleanProcesses(s.processes, kind === 'beam' ? 'beam' : kind === 'column' ? 'column' : 'hollow') : [],
    grade: KIND_BY_ID[kind].steel && isSteelGrade(s.grade) ? s.grade : undefined,
  }
}

/**
 * Whatever was saved, made safe. The first version of this (a single beam count, section, posts, plate and so on) is read as the same steel in members: its beams as one steel beam (the number as the quantity, its padstones made
 * explicit), its posts as steel columns on pads, its plate on the beam, so a price already set up does not move.
 */
export function cleanWallSteel(x: unknown): WallSteel {
  const s = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const loadAbove: LoadAbove = s.loadAbove === 'light' || s.loadAbove === 'floor' || s.loadAbove === 'heavy' ? s.loadAbove : 'floor'
  const base = { loadAbove, hiab: s.hiab === true, connections: cleanConnections(s.connections) }
  if (Array.isArray(s.members)) return { members: (s.members as unknown[]).slice(0, 8).map(cleanMember), ...base }
  if (typeof s.beams === 'number' || typeof s.posts === 'number' || typeof s.section === 'string') {
    // the first version
    const beams = Math.round(num(s.beams, 0, 4, 1)), posts = Math.round(num(s.posts, 0, 6, 0))
    const finish: MemberFinish = s.finish === 'board' ? 'cased' : s.finish === 'intumescent' ? 'intumescent' : 'none'
    const by: MemberBy = s.steelBy === 'sub' ? 'sub' : 'us'
    const members: WallMember[] = []
    if (beams > 0) {
      const sec = typeof s.section === 'string' && (s.section === 'auto' || STEEL_BEAMS.some(b => b.label === s.section)) ? s.section : 'auto'
      const pads = typeof s.padstones === 'number' && Number.isFinite(s.padstones) ? Math.round(s.padstones) : Math.max(0, 2 * beams - (s.postRole === 'mid' ? 0 : posts))
      members.push(cleanMember({ ...newWallMember('beam'), kind: 'beam', section: sec, qty: beams, finish, by, padstones: pads, plate: cleanPlate(s.plate) }))
    }
    if (posts > 0) {
      const sec = typeof s.postSection === 'string' && STEEL_COLUMNS.some(c => c.label === s.postSection) ? s.postSection : defaultSection('column')
      members.push(cleanMember({ ...newWallMember('column'), kind: 'column', section: sec, qty: posts, lengthMm: num(s.postHeightMm, 300, 6000, 2400), finish, by }))
    }
    return { members, ...base }
  }
  return newWallSteel()
}

export interface WallSteelItem { id: string; ref: string; widthMm: number; heightMm: number; steel: WallSteel; /** the span a beam picked from the span works across, when posts stand under it (else the opening's width) */ spanMm?: number }
export interface WallSteelLine { id: string; name: string; category: SteelLine['category']; unit: string; unitCost: number; qty: number; roomId?: string }
export interface WallSteelResult {
  /** the priced lines, ready to become the wall's cost lines (materials, plant, subcontractors) */
  lines: WallSteelLine[]
  /** the hours the steel needs that the wall's own labour does not include: setting the steel and padstones, digging pads, casing it */
  hours: { bricklayer: number; labourer: number; carpenter: number }
  warnings: string[]
  byOpening: Record<string, { beamLabel: string; steelKg: number; parts: string[]; /** the steel in words for the quote */ words: string }>
  totalSteelKg: number
  /** when the steel is bought in stock lengths: the bars to order for the whole wall (cuts of the same section share bars across its openings) */
  cutting: CuttingGroup[]
}

const NUMBER_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six']
const countWords = (n: number): string => NUMBER_WORD[n] ?? String(n)
const joinList = (a: string[]): string => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)

/** the section a member is priced at: a beam set to 'auto' is the lightest in the span table for the opening's span and what is above */
const resolvedSection = (m: WallMember, spanM: number, load: LoadAbove): string => (m.kind === 'beam' && m.section === 'auto' ? beamFor(spanM, load).section.label : m.section)

/**
 * The steel over an opening in words, for the quote: 'two 203 × 133 UB 25 steel beams over, on two padstones, with a 10mm x 328mm steel plate welded to the underside of each beam to spread the load over the wall, 4 end plates,
 * two 152 × 152 UC 23 steel columns on concrete pads, the steel cased in two layers of fire-resisting board, supplied and fixed by a steelwork contractor'.
 */
export function wallSteelWords(steel: WallSteel, widthMm: number, wallThicknessMm: number, spanMm?: number): string {
  const span = (spanMm ?? widthMm) / 1000
  const bits: string[] = []
  const beams = steel.members.filter(m => KIND_BY_ID[m.kind] && !KIND_BY_ID[m.kind].post)
  const posts = steel.members.filter(m => KIND_BY_ID[m.kind]?.post)
  const finishWord = (m: WallMember): string | null => (!KIND_BY_ID[m.kind].steel ? null : m.finish === 'cased' ? 'the steel cased in two layers of fire-resisting board' : m.finish === 'intumescent' ? 'an intumescent coating to the steel' : m.finish === 'galvanised' ? 'hot-dip galvanised' : null)
  const finishes = new Set<string>()
  let head = ''
  beams.forEach((m, i) => {
    const k = KIND_BY_ID[m.kind]
    const sec = resolvedSection(m, span, steel.loadAbove)
    const phrase = `${countWords(m.qty)} ${sec}${m.grade ? ' ' + m.grade : ''} ${k.word}${m.qty === 1 ? '' : 's'} over`
    if (i === 0) head = phrase; else bits.push(phrase)
    if (m.ends === 'masonry') { const pads = m.padstones ?? 2 * m.qty; if (pads > 0) bits.push(`on ${countWords(pads)} padstone${pads === 1 ? '' : 's'}`) } else bits.push('bolted through end plates')
    if (m.plate) bits.push('with ' + beamPlateWords(m.plate, beamPlateFor(m.plate, (m.lengthMm ?? widthMm + 2 * BEARING_EACH_END_MM) / 1000, wallThicknessMm).widthMm, m.qty))
    const pw = processWords(m.processes, m.qty, k.word, 'beam'); if (pw) bits.push('with ' + pw)
    const f = finishWord(m); if (f) finishes.add(f)
  })
  const conns = steel.connections.filter(c => CONNECTION_BY_ID[c.kind] && c.qty > 0)
  if (conns.length) bits.push(joinList(conns.map(c => { const i = CONNECTION_BY_ID[c.kind]; return i.unit === 'h' ? `${c.qty} hour${c.qty === 1 ? '' : 's'} of fabrication` : `${c.qty} ${i.short}${c.qty === 1 ? '' : 's'}` })))
  posts.forEach(m => {
    const k = KIND_BY_ID[m.kind]
    const sec = resolvedSection(m, span, steel.loadAbove)
    bits.push(`${countWords(m.qty)} ${sec}${m.grade ? ' ' + m.grade : ''} ${k.word}${m.qty === 1 ? '' : 's'}${m.pad ? ' on concrete pads' : ''}`)
    if (m.plate && k.steel) { const pl = beamPlateFor(m.plate, DEFAULT_POST_PLATE_MM / 1000, DEFAULT_POST_PLATE_MM); bits.push('with ' + postPlateWords(m.plate, pl.widthMm, pl.lengthM * 1000, m.qty, k.word)) }
    if (k.steel) { const pw = processWords(m.processes, m.qty, k.word, m.kind === 'hollow' ? 'hollow' : 'column'); if (pw) bits.push('with ' + pw) }
    const f = finishWord(m); if (f) finishes.add(f)
  })
  for (const f of finishes) bits.push(f)
  if (steel.members.some(m => m.by === 'sub' && KIND_BY_ID[m.kind]?.steel)) bits.push('supplied and fixed by a steelwork contractor')
  if (steel.hiab && steel.members.length) bits.push('lifted in by Hiab')
  if (!head) return bits.length ? `steel: ${bits.join(', ')}` : ''
  return bits.length ? `${head}, ${bits.join(', ')}` : head
}

/** warnings from the steel engine that make no sense inside a wall calculator: the steel here IS over an opening in the wall, and the foundation is not this calculator's */
const NOT_FOR_A_WALL = ['Steel over an opening in a wall is priced with', 'Beams over an opening in a wall are priced with the opening', 'Not included: the foundation under a column']

/** Prices the steel over each of these wall openings with the Steel Beams, Columns & Posts engine, then adds the connections list. `wallThicknessMm` is the whole wall (a welded plate is as wide as it unless a width is typed). */
export function priceWallSteel(items: WallSteelItem[], wallThicknessMm: number, stock?: { barsMm: number[]; offcutPct: number }): WallSteelResult {
  const out: WallSteelResult = { lines: [], hours: { bricklayer: 0, labourer: 0, carpenter: 0 }, warnings: [], byOpening: {}, totalSteelKg: 0, cutting: [] }
  if (items.length === 0) return out
  const cleaned = items.map(it => ({ it, steel: cleanWallSteel(it.steel) }))
  const members: SteelMember[] = []
  const owner = new Map<string, string>()
  const resolved = new Map<string, string>()
  for (const { it, steel } of cleaned) {
    const span = (it.spanMm ?? it.widthMm) / 1000
    for (const m of steel.members) {
      const id = `${it.id}~${m.id}`
      const post = KIND_BY_ID[m.kind].post
      const section = resolvedSection(m, span, steel.loadAbove)
      owner.set(id, it.id); resolved.set(id, section)
      members.push({
        id, ref: it.ref, location: '', kind: m.kind, section, lengthMm: m.lengthMm ?? (post ? it.heightMm : it.widthMm + 2 * BEARING_EACH_END_MM), qty: m.qty, finish: m.finish, ends: m.ends, padstones: m.padstones,
        pad: m.pad, padLengthMm: m.padLengthMm, padWidthMm: m.padWidthMm, padDepthMm: m.padDepthMm, by: m.by, propped: m.propped,
        plate: m.plate ? (post ? m.plate : { ...m.plate, widthMm: m.plate.widthMm ?? wallThicknessMm }) : null,
        processes: m.processes,
        grade: m.grade,
      })
    }
  }
  const hiabVisits = cleaned.filter(c => c.steel.hiab && c.steel.members.length > 0).length
  const r = members.length === 0
    ? { lines: [] as SteelLine[], labour: [] as { trade: 'bricklayer' | 'labourer' | 'carpenter'; hours: number }[], members: [] as { memberId: string; steelKg: number; parts: string[] }[], totalSteelKg: 0, warnings: [] as string[], cutting: [] as CuttingGroup[] }
    : calculateSteelwork({ members, jobSituationId: DEFAULT_STRUCTURAL_SITUATIONS[0].id, situations: DEFAULT_STRUCTURAL_SITUATIONS, engineer: false, buildingControl: false, hiabVisits, rates: {}, stock })
  out.lines = r.lines.map(l => ({ ...l }))
  for (const t of r.labour) out.hours[t.trade] += t.hours
  out.warnings = r.warnings.filter(w => !NOT_FOR_A_WALL.some(n => w.includes(n)))
  out.totalSteelKg = r.totalSteelKg
  out.cutting = r.cutting
  const kgBy = new Map<string, number>()
  for (const s of r.members) { const o = owner.get(s.memberId); if (o) kgBy.set(o, (kgBy.get(o) ?? 0) + s.steelKg) }

  // connections and fabrications: priced at the Structural Openings rates, as materials (or subcontract when all the steel is supplied by a contractor)
  let anyConn = false
  for (const { it, steel } of cleaned) {
    const allSub = steel.members.length > 0 && steel.members.filter(m => KIND_BY_ID[m.kind].steel).every(m => m.by === 'sub')
    for (const c of steel.connections) {
      const info = CONNECTION_BY_ID[c.kind]
      if (!info || !(c.qty > 0)) continue
      anyConn = true
      if (info.unit === 'h') out.lines.push({ id: `conn-fabrication|${it.id}`, name: `${it.ref} — other fabrication: welding, cutting and drilling`, category: 'subcontractors', unit: 'h', unitCost: STEEL_RATES.fabPerHour, qty: c.qty, roomId: it.id })
      else {
        out.lines.push({ id: `conn-${c.kind}|${it.id}`, name: `${it.ref} — ${info.label.split(' (')[0].replace(/^./, ch => ch.toLowerCase())}`, category: allSub ? 'subcontractors' : 'materials', unit: 'nr', unitCost: info.cost, qty: c.qty, roomId: it.id })
        if (!allSub) out.hours.bricklayer += info.hours * c.qty
      }
    }
  }
  if (anyConn) out.warnings.push('Connections and fabrications (end plates, cleats, splice plates, stiffeners, anchors) are sample prices: the engineer specifies the real ones.')

  for (const { it, steel } of cleaned) {
    const firstBeam = steel.members.find(m => m.kind === 'beam')
    const beamLabel = firstBeam ? resolved.get(`${it.id}~${firstBeam.id}`) ?? '' : ''
    out.byOpening[it.id] = { beamLabel, steelKg: kgBy.get(it.id) ?? 0, parts: r.members.filter(s => owner.get(s.memberId) === it.id).flatMap(s => s.parts), words: wallSteelWords(steel, it.widthMm, wallThicknessMm, it.spanMm) }
  }
  return out
}
