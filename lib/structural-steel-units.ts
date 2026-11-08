// Structural steel and the other structural members, priced one member at a time (Structural Frame → Steel Beams, Columns & Posts (by member)): steel beams (universal beams), steel columns (universal columns),
// hollow section posts, engineered timber beams (laminated veneer lumber or glulam) and timber posts. Each member has its kind, its section, its length (the span of a beam with its bearings, or the height of a post),
// how many, who supplies and fits it (us, or a steelwork contractor by the kilo), its finish (shop primed, galvanised, an intumescent coating, cased in fire-resisting board, or none) and how it is held: a beam bears on
// padstones in masonry or is bolted to a column or another beam through end plates; a column or post stands on a base plate on a concrete pad. From that: the steel by weight, the plates, bolts, padstones, pads (dug,
// poured and the soil away), the fire protection and the Hiab to lift it, with the bricklayer, labourer and carpenter. The structural engineer's fee and the Building Control notice are once for the job.
// It prices the members you list: it does not design them (the section, the connections and the fire rating are the engineer's), so every section here is a SAMPLE to price from. The openings that need steel
// are Structural Openings (by opening), which prices the beam and posts of each opening; use this one for steel that is not over an opening (a floor beam, a ridge or purlin beam, a column or a post).
//
// Every rate and hour is a SAMPLE, editable in the calculator, to be checked against real jobs. The sections' weights and surfaces are rounded catalogue values.

import { BEAM_SECTIONS, POST_SECTIONS, RATES as OPEN_RATES, HOURS as OPEN_HOURS, LABOURER_ON_STEEL, LABOURER_ON_CASING, SPOIL_BULK, LIGHT_LIFT_KG, DEFAULT_STRUCTURAL_SITUATIONS, checkBeamPlate, beamPlateFor, beamPlateWords, DEFAULT_PLATE_WIDTH_MM, PLATE_RATE_NOTE, type BeamPlate, type StructuralSituation } from './structural-openings-units'

export type MemberKind = 'beam' | 'column' | 'hollow' | 'lvl' | 'timber-post'
export type MemberFinish = 'primed' | 'galvanised' | 'intumescent' | 'cased' | 'none'
export type MemberEnds = 'masonry' | 'steel'
export type MemberBy = 'us' | 'sub'

export interface MemberKindInfo { id: MemberKind; label: string; word: string; steel: boolean; post: boolean }
export const MEMBER_KINDS: MemberKindInfo[] = [
  { id: 'beam', label: 'Steel beam (universal beam)', word: 'steel beam', steel: true, post: false },
  { id: 'column', label: 'Steel column (universal column)', word: 'steel column', steel: true, post: true },
  { id: 'hollow', label: 'Hollow section steel post (SHS)', word: 'steel post', steel: true, post: true },
  { id: 'lvl', label: 'Engineered timber beam (LVL or glulam)', word: 'engineered timber beam', steel: false, post: false },
  { id: 'timber-post', label: 'Timber post (glulam or oak)', word: 'timber post', steel: false, post: true },
]
export const KIND_BY_ID: Record<string, MemberKindInfo> = Object.fromEntries(MEMBER_KINDS.map(k => [k.id, k]))

export interface SteelSection { label: string; kgPerM: number; surfaceM2PerM: number; boxGirthMm: number }
/** Universal beams: the ones the openings calculator knows, and the bigger floor and ridge beams */
export const STEEL_BEAMS: SteelSection[] = [
  ...BEAM_SECTIONS.map(b => ({ label: b.label, kgPerM: b.kgPerM, surfaceM2PerM: b.surfaceM2PerM, boxGirthMm: b.boxGirthMm })),
  { label: '305 × 127 UB 37', kgPerM: 37, surfaceM2PerM: 1.09, boxGirthMm: 837 },
  { label: '356 × 171 UB 45', kgPerM: 45, surfaceM2PerM: 1.38, boxGirthMm: 975 },
  { label: '406 × 178 UB 54', kgPerM: 54, surfaceM2PerM: 1.5, boxGirthMm: 1083 },
  { label: '457 × 191 UB 67', kgPerM: 67, surfaceM2PerM: 1.65, boxGirthMm: 1197 },
  { label: '533 × 210 UB 82', kgPerM: 82, surfaceM2PerM: 1.87, boxGirthMm: 1366 },
]
/** Universal columns */
export const STEEL_COLUMNS: SteelSection[] = [
  ...POST_SECTIONS.map(p => ({ label: p.label, kgPerM: p.kgPerM, surfaceM2PerM: p.surfaceM2PerM, boxGirthMm: p.boxGirthMm })),
  { label: '254 × 254 UC 73', kgPerM: 73, surfaceM2PerM: 1.51, boxGirthMm: 1120 },
  { label: '305 × 305 UC 97', kgPerM: 97, surfaceM2PerM: 1.82, boxGirthMm: 1330 },
]
/** Square hollow sections */
export const STEEL_HOLLOW: SteelSection[] = [
  { label: '80 × 80 × 5 SHS', kgPerM: 11.3, surfaceM2PerM: 0.32, boxGirthMm: 620 },
  { label: '100 × 100 × 5 SHS', kgPerM: 14.7, surfaceM2PerM: 0.4, boxGirthMm: 700 },
  { label: '150 × 150 × 6.3 SHS', kgPerM: 27.4, surfaceM2PerM: 0.6, boxGirthMm: 900 },
  { label: '200 × 200 × 8 SHS', kgPerM: 47, surfaceM2PerM: 0.8, boxGirthMm: 1100 },
]
/** Engineered timber beams and posts: a sample £ per metre (no weight: they are not steel) */
export interface TimberSection { label: string; perLm: number }
export const LVL_BEAMS: TimberSection[] = [
  { label: 'LVL 2 × 45 × 200 (doubled)', perLm: 28 }, { label: 'LVL 3 × 45 × 240 (trebled)', perLm: 52 }, { label: 'Glulam GL24h 90 × 225', perLm: 38 }, { label: 'Glulam GL24h 115 × 315', perLm: 72 },
]
export const TIMBER_POSTS: TimberSection[] = [
  { label: 'Glulam post 140 × 140', perLm: 32 }, { label: 'Glulam post 190 × 190', perLm: 58 }, { label: 'Oak post 150 × 150', perLm: 85 },
]

/** The sections to choose from for a kind of member */
export function sectionsFor(kind: MemberKind): { label: string }[] {
  return kind === 'beam' ? STEEL_BEAMS : kind === 'column' ? STEEL_COLUMNS : kind === 'hollow' ? STEEL_HOLLOW : kind === 'lvl' ? LVL_BEAMS : TIMBER_POSTS
}
export const defaultSection = (kind: MemberKind) => (kind === 'beam' ? '203 × 133 UB 25' : kind === 'column' ? '152 × 152 UC 23' : kind === 'hollow' ? '100 × 100 × 5 SHS' : kind === 'lvl' ? 'LVL 2 × 45 × 200 (doubled)' : 'Glulam post 140 × 140')
const steelSection = (kind: MemberKind, label: string): SteelSection | undefined => (kind === 'beam' ? STEEL_BEAMS : kind === 'column' ? STEEL_COLUMNS : STEEL_HOLLOW).find(s => s.label === label)
const timberSection = (kind: MemberKind, label: string): TimberSection | undefined => (kind === 'lvl' ? LVL_BEAMS : TIMBER_POSTS).find(s => s.label === label)

export const FINISH_LABEL: Record<MemberFinish, string> = {
  primed: 'Shop primed (as supplied)', galvanised: 'Hot-dip galvanised', intumescent: 'Intumescent coating (a specialist applies it)', cased: 'Cased in fire-resisting board (two layers on a timber frame)', none: 'None priced (to be done elsewhere)',
}
export const ENDS_LABEL: Record<MemberEnds, string> = { masonry: 'Bearing on padstones in masonry', steel: 'Bolted to a column or another beam (end plates)' }
export const BY_LABEL: Record<MemberBy, string> = { us: 'We supply and fit it', sub: 'A steelwork contractor supplies and fits it' }

/** Sample rates, £ (on top of the openings calculator's: steel per kilo, plate sets, padstones, props, concrete, board, Hiab) */
export const RATES = {
  ...OPEN_RATES,
  galvanisedPerKg: 0.7,        // £ per kg extra for hot-dip galvanising
  endPlateSet: 28,             // £ per beam end: end plate, bolts and nuts
  timberFixings: 12,           // £ per timber member: hangers, bolts, straps and shoes
  sundries: 8,                 // £ per member: shims, grout, touch-up primer
  engineerJob: 350,            // £: the structural engineer's calculations, once for the job
} as const
export type SteelRateKey = keyof typeof RATES

export const HOURS = {
  ...OPEN_HOURS,
  endPlate: 0.5,               // fixing a bolted end plate
  timberBase: 1, timberPerM: 0.5, timberPost: 1,
} as const

export interface SteelMember {
  id: string
  ref: string
  location: string
  kind: MemberKind
  section: string
  /** a beam's length (with its bearings), or a post's height, mm */
  lengthMm: number
  qty: number
  finish: MemberFinish
  /** beams: how each end is held */
  ends: MemberEnds
  /** padstones under a beam's ends: null = two for each beam (masonry ends only) */
  padstones: number | null
  /** posts and columns: a concrete pad under each, and its size, mm */
  pad: boolean
  padLengthMm: number
  padWidthMm: number
  padDepthMm: number
  by: MemberBy
  /** needles and Acrow props while a beam is fixed */
  propped: boolean
  /** a beam: a steel plate welded to the bottom, the top or both to spread its load over the wall it bears on (none to start) */
  plate?: BeamPlate | null
  situationId?: string | null
  /** the length last given to this member by the line drawn in Take-off: it follows the line until a length is typed over it */
  planLengthMm?: number
}

export function newMember(id: string, ref: string, kind: MemberKind = 'beam'): SteelMember {
  const post = KIND_BY_ID[kind].post
  return {
    id, ref, location: '', kind, section: defaultSection(kind), lengthMm: post ? 2700 : 3600, qty: 1, finish: KIND_BY_ID[kind].steel ? 'primed' : 'none', ends: 'masonry', padstones: null,
    pad: post, padLengthMm: 600, padWidthMm: 600, padDepthMm: 300, by: 'us', propped: false, situationId: null,
  }
}

export interface SteelLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface SteelLabourTask { key: string; roomId: string; trade: 'bricklayer' | 'labourer' | 'carpenter'; task: string; hours: number; basis: string }
export interface SteelSummary { memberId: string; ref: string; name: string; parts: string[]; steelKg: number; hours: number }
export interface SteelResult {
  lines: SteelLine[]
  labour: SteelLabourTask[]
  members: SteelSummary[]
  totalMembers: number
  totalSteelKg: number
  totalHours: number
  warnings: string[]
}
export interface SteelInput {
  members: SteelMember[]
  jobSituationId: string
  situations: StructuralSituation[]
  /** the structural engineer's calculations, once for the job */
  engineer: boolean
  /** the Building Control notice, once for the job */
  buildingControl: boolean
  /** Hiab or lorry crane visits to lift the steel in */
  hiabVisits: number
  rates: Partial<Record<SteelRateKey, number>>
}

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const n2 = (x: number) => (Math.round(x * 100) / 100).toFixed(2)

export function calculateSteelwork(input: SteelInput): SteelResult {
  const job = input.situations.find(s => s.id === input.jobSituationId) ?? input.situations[0]
  const rate = (k: SteelRateKey): number => {
    const v = input.rates[k] ?? RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  if (!(input.hiabVisits >= 0) || Math.round(input.hiabVisits) !== input.hiabVisits) throw new Error('The Hiab visits must be a whole number, 0 or more.')
  const lines: SteelLine[] = []
  const labour: SteelLabourTask[] = []
  const summaries: SteelSummary[] = []
  const warnings: string[] = []
  let totalKg = 0, totalHours = 0, totalMembers = 0
  let anyPlate = false
  let anyHeavy = false, anySteel = false, anyBoard = false, anySub = false, anyBareSteel = false, anyPostNoPad = false, anyTimber = false

  for (const m of input.members) {
    const k = KIND_BY_ID[m.kind]
    const name = m.ref.trim() || 'Member'
    if (!k) throw new Error(`${name} has no type.`)
    const label = `${name}${m.location.trim() ? ` (${m.location.trim()})` : ''}`
    if (!(m.lengthMm > 0)) throw new Error(`The length of ${name} must be above zero.`)
    if (!(m.qty >= 1) || Math.round(m.qty) !== m.qty) throw new Error(`The number of ${name} must be a whole number, 1 or more.`)
    if (m.pad && (!(m.padLengthMm > 0) || !(m.padWidthMm > 0) || !(m.padDepthMm > 0))) throw new Error(`${name}: the pad size must be above zero.`)
    if (m.padstones !== null && !(m.padstones >= 0)) throw new Error(`${name}: the padstones cannot be negative.`)
    const qty = m.qty
    const sit = input.situations.find(s => s.id === m.situationId) ?? job
    const uplift = 1 + (sit?.upliftPct ?? 0) / 100
    const lengthM = m.lengthMm / 1000
    const parts: string[] = []
    const add = (key: string, what: string, unit: string, unitCost: number, q: number, category: SteelLine['category'] = 'materials') => {
      if (q > 0 && unitCost >= 0) lines.push({ id: `${key}|${m.id}`, name: `${label} — ${what}`, category, unit, unitCost: money(unitCost), qty: +q.toFixed(3), roomId: m.id })
    }
    let brickHours = 0, labourHours = 0, carpHours = 0
    totalMembers += qty
    let kg = 0
    let sectionLabel = m.section
    const countText = `${qty === 1 ? '' : qty + ' × '}`

    if (k.steel) {
      anySteel = true
      const sec = steelSection(m.kind, m.section)
      if (!sec) throw new Error(`${name}: pick a section.`)
      sectionLabel = sec.label
      kg = sec.kgPerM * lengthM * qty
      totalKg += kg
      const eachKg = sec.kgPerM * lengthM
      if (m.by === 'sub') {
        anySub = true
        add('steel-sub', `steelwork contractor: supply and fix ${sec.label} (${n2(lengthM)}m)${m.finish === 'galvanised' ? ', galvanised' : ''}`, 'kg', rate('steelSubPerKg') + (m.finish === 'galvanised' ? rate('galvanisedPerKg') : 0), kg, 'subcontractors')
      } else {
        add('steel', `${sec.label} ${k.word}, ${n2(lengthM)}m (shop primed)`, 'm', sec.kgPerM * rate('steelPerKg'), lengthM * qty)
        if (m.finish === 'galvanised') add('galv', 'hot-dip galvanising', 'kg', rate('galvanisedPerKg'), kg)
        if (eachKg > LIGHT_LIFT_KG && input.hiabVisits === 0) anyHeavy = true
      }
      add('sundries', 'shims, grout and touch-up primer', 'nr', rate('sundries'), qty)

      if (!k.post) {
        // a beam: how each end is held
        if (m.ends === 'masonry') {
          const pads = m.padstones ?? 2 * qty
          if (pads > 0) { add('padstone', 'padstones under the beam ends', 'nr', rate('padstone'), pads); brickHours += pads * HOURS.padstone }
          parts.push(`${countText}${sec.label} steel ${m.qty === 1 ? 'beam' : 'beams'}, ${n2(lengthM)}m long, bearing on padstones`)
        } else {
          add('endplates', 'end plates, bolts and nuts', 'nr', rate('endPlateSet'), 2 * qty)
          brickHours += 2 * qty * HOURS.endPlate
          parts.push(`${countText}${sec.label} steel ${m.qty === 1 ? 'beam' : 'beams'}, ${n2(lengthM)}m long, bolted through end plates`)
        }
        if (m.by === 'us') { brickHours += (HOURS.setBeamBase + HOURS.setBeamPerM * lengthM) * qty; labourHours += (HOURS.setBeamBase + HOURS.setBeamPerM * lengthM) * qty * LABOURER_ON_STEEL }
        // a plate welded to the beam to spread its load over the wall it bears on
        if (m.plate) {
          checkBeamPlate(m.plate, name)
          const pl = beamPlateFor(m.plate, lengthM, DEFAULT_PLATE_WIDTH_MM)
          const nPlates = pl.plates * qty
          const plateKg = pl.kg * qty
          kg += plateKg; totalKg += plateKg
          if (m.by === 'us') add('plate', `${m.plate.thicknessMm}mm x ${Math.round(pl.widthMm)}mm steel plate, ${n2(pl.lengthM)}m, welded ${m.plate.position === 'bottom' ? 'to the underside' : m.plate.position === 'top' ? 'to the top' : 'top and underside'} (${nPlates} plate${nPlates === 1 ? '' : 's'}, ${Math.round(plateKg)}kg)`, 'kg', rate('steelPerKg'), plateKg)
          if (m.by === 'sub') add('plate-sub', `steelwork contractor: the ${m.plate.thicknessMm}mm x ${Math.round(pl.widthMm)}mm load-spreading plate steel (${Math.round(plateKg)}kg)`, 'kg', rate('steelSubPerKg'), plateKg, 'subcontractors')
          add('plate-weld', `cutting, drilling and welding the load-spreading plate${nPlates === 1 ? '' : 's'}`, 'h', rate('fabPerHour'), pl.hours * qty, 'subcontractors')
          parts.push(beamPlateWords(m.plate, pl.widthMm, m.qty))
          if (m.plate.thicknessMm < 5 || m.plate.thicknessMm > 25) warnings.push(`${label}: a ${m.plate.thicknessMm}mm welded plate is outside the usual 6 to 20mm: check it with the engineer.`)
          anyPlate = true
        }
        if (m.propped) { add('props', 'needles and Acrow props hired (a week)', 'nr', rate('propsHire') + rate('propsPerExtraM') * Math.max(0, lengthM - 1.5 - 0.3), qty, 'plant'); labourHours += (HOURS.props + HOURS.propsPerM * lengthM) * qty }
      } else {
        // a column or post: on a base plate, on a pad
        add('plates', 'base plate, cap plate, holding-down bolts and grout', 'nr', rate('plateSet'), qty)
        if (m.by === 'us') { brickHours += HOURS.post * qty; labourHours += HOURS.post * qty * LABOURER_ON_STEEL }
        parts.push(`${countText}${sec.label} ${m.qty === 1 ? k.word : k.word + 's'}, ${n2(lengthM)}m high, on base plates${m.pad ? ' on concrete pads' : ''}`)
      }
      // the finish
      const surface = sec.surfaceM2PerM * lengthM * qty
      if (m.finish === 'intumescent') { add('intumescent', 'intumescent coating (applied by a specialist)', 'm²', rate('intumescentPerM2'), surface, 'subcontractors'); parts.push('an intumescent coating') }
      else if (m.finish === 'cased') {
        anyBoard = true
        const girthM = sec.boxGirthMm / 1000
        add('case-batten', 'casing frame (battens)', 'lm', (4 + (1 / 0.6) * girthM) * rate('batten'), lengthM * qty)
        add('case-board', 'fire-resisting board, two layers (incl. waste)', 'm²', rate('boardFire') * 1.1, girthM * lengthM * 2 * qty)
        carpHours += (HOURS.caseSetup + lengthM * HOURS.casePerLm) * qty
        parts.push('cased in two layers of fire-resisting board')
      } else if (m.finish === 'galvanised') parts.push('hot-dip galvanised')
      else if (m.finish === 'primed') parts.push('shop primed')
      else anyBareSteel = true
    } else {
      // engineered timber: a beam or a post
      anyTimber = true
      const sec = timberSection(m.kind, m.section)
      if (!sec) throw new Error(`${name}: pick a section.`)
      sectionLabel = sec.label
      add('timber', `${sec.label}, ${n2(lengthM)}m`, 'm', sec.perLm, lengthM * qty * 1.05)
      add('fixings', 'hangers, bolts, straps and shoes', 'nr', rate('timberFixings'), qty)
      carpHours += k.post ? HOURS.timberPost * qty : (HOURS.timberBase + HOURS.timberPerM * lengthM) * qty
      parts.push(`${countText}${sec.label} ${m.qty === 1 ? k.word : k.word + 's'}, ${n2(lengthM)}m${k.post ? ' high' : ' long'}`)
      if (!k.post && m.ends === 'masonry') { const pads = m.padstones ?? 2 * qty; if (pads > 0) { add('padstone', 'padstones under the beam ends', 'nr', rate('padstone'), pads); brickHours += pads * HOURS.padstone } }
      if (m.propped && !k.post) { add('props', 'needles and Acrow props hired (a week)', 'nr', rate('propsHire') + rate('propsPerExtraM') * Math.max(0, lengthM - 1.8), qty, 'plant'); labourHours += (HOURS.props + HOURS.propsPerM * lengthM) * qty }
      if (m.finish === 'cased') parts.push('(fire casing is for steel: priced under the finish of a steel member)')
    }

    // a concrete pad under each post
    if (k.post && m.pad) {
      const padM3 = (m.padLengthMm / 1000) * (m.padWidthMm / 1000) * (m.padDepthMm / 1000)
      add('pad-concrete', `concrete pad ${m.padLengthMm} x ${m.padWidthMm} x ${m.padDepthMm}mm under each ${k.word}`, 'm³', rate('concretePerM3'), padM3 * qty)
      add('pad-spoil', 'soil from the pad holes: skip share', 'm³', rate('rubblePerM3'), padM3 * SPOIL_BULK * qty)
      labourHours += padM3 * qty * HOURS.padDigPerM3 + padM3 * qty * HOURS.padPourPerM3 + HOURS.padMin * qty
      if (m.padDepthMm < 300) warnings.push(`${label}: a pad under a post is not usually thinner than 300mm: the engineer sizes it for the ground and the load.`)
    } else if (k.post) anyPostNoPad = true

    // hours
    const mult = uplift
    const upNote = uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : ''
    let hrs = 0
    if (brickHours > 0) { const h = hoursOf(brickHours * mult); labour.push({ key: `bricks|${m.id}`, roomId: m.id, trade: 'bricklayer', task: `${label} — set the ${k.steel ? 'steel' : 'bearings'}`, hours: h, basis: `${n1(brickHours / qty)}h each${qty > 1 ? ` x ${qty}` : ''}${upNote}` }); hrs += h }
    if (labourHours > 0) { const h = hoursOf(labourHours * mult); labour.push({ key: `labour|${m.id}`, roomId: m.id, trade: 'labourer', task: `${label} — help lift, prop and dig the pads`, hours: h, basis: 'labourer with the bricklayer' }); hrs += h }
    if (carpHours > 0) {
      const h = hoursOf(carpHours * mult); labour.push({ key: `carp|${m.id}`, roomId: m.id, trade: 'carpenter', task: `${label} — ${k.steel ? 'frame and board the steel casing' : `fix the ${k.word}`}`, hours: h, basis: `${n1(carpHours / qty)}h each${qty > 1 ? ` x ${qty}` : ''}${upNote}` }); hrs += h
      const hl = hoursOf(carpHours * mult * LABOURER_ON_CASING); labour.push({ key: `carphelp|${m.id}`, roomId: m.id, trade: 'labourer', task: `${label} — help lift and hold`, hours: hl, basis: `${Math.round(LABOURER_ON_CASING * 100)}% of the carpenter's hours` }); hrs += hl
    }
    totalHours += hrs
    summaries.push({ memberId: m.id, ref: name, name: label, parts: parts.length > 0 ? [parts.join(', ')] : [], steelKg: Math.round(kg), hours: hrs })
  }

  // once for the job
  if (input.hiabVisits > 0) lines.push({ id: 'hiab|job', name: 'Hiab or lorry crane to lift the steel in', category: 'plant', unit: 'visit', unitCost: money(rate('hiab')), qty: input.hiabVisits })
  if (input.engineer && input.members.length > 0) lines.push({ id: 'engineer|job', name: "structural engineer: calculations for the steelwork", category: 'subcontractors', unit: 'sum', unitCost: money(rate('engineerJob')), qty: 1 })
  if (input.buildingControl && input.members.length > 0) lines.push({ id: 'buildingcontrol|job', name: 'Building Control notice and inspections for the structural work', category: 'other', unit: 'sum', unitCost: money(rate('buildingControl')), qty: 1 })

  if (input.members.length > 0) {
    warnings.push('Every structural member needs the structural engineer\'s design and calculations: the sections here are samples to price from, not a design.')
    if (anyHeavy) warnings.push(`A beam heavier than about ${LIGHT_LIFT_KG}kg needs a Hiab or crane, or a big team and needles to lift it: add a Hiab visit if one is coming.`)
    if (anyBoard) warnings.push('Fire protection to structural steel has a rating set by the engineer or Building Control: confirm the board, the layers and the fixings. If the Boxing-in calculator also cases a beam, count it in one place only.')
    if (anyPlate) warnings.push(PLATE_RATE_NOTE)
    if (anyBareSteel) warnings.push('No finish is priced to some of the steel: confirm with the engineer and Building Control whether it needs fire protection or a paint system.')
    if (anyPostNoPad) warnings.push('A post or column with no pad priced stands on a foundation priced elsewhere: it must not bear on the floor slab alone.')
    if (anySub) warnings.push('A steelwork contractor\'s price covers supplying, delivering and fixing the steel: the pads, fire protection and lifting stay here.')
    if (anySteel) warnings.push('Beams over an opening in a wall are priced with the opening in Structural Openings (by opening): use this list for steel that is not over one, so it is not counted twice.')
    if (anyTimber) warnings.push('Engineered timber beams and posts are sized by their maker\'s software or the engineer: check the span, the bearing and the fire rating.')
    warnings.push('Not included: the foundation under a column beyond the pad shown, floor or roof timbers carried by the beam, making good, plastering or decorating.')
  }
  return { lines, labour, members: summaries, totalMembers, totalSteelKg: Math.round(totalKg), totalHours: money(totalHours), warnings }
}

export { DEFAULT_STRUCTURAL_SITUATIONS }
