// Staircases and their balustrades, priced one staircase at a time (Joinery & Fixtures → Staircase & Balustrade (by staircase)). Each staircase has its shape (straight, quarter or half turn with a landing or with
// winders, or a spiral), the floor-to-floor height (which gives the number of risers and the rise), the going, the width, closed or open risers, and how it is supplied: a MADE staircase (a factory-made kit, we fit it),
// BUILT ON SITE (strings, treads and risers priced from the geometry and cut by the carpenter), or supplied by the CLIENT (we fit only). The balustrade is priced from the length of the stair: timber spindles, glass or
// stainless rods, newel posts, handrails on the open sides or on the wall, and any guarding along a landing. The rise, going and pitch are checked against Part K. The stairwell opening and its trimming are priced
// with the floor (the suspended timber floor calculator), taking out an old staircase is Demolition → Strip-Out by Room, and painting is Decoration.
//
// Every rate here is a SAMPLE price or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node.

export type StairKind = 'straight' | 'quarter-landing' | 'quarter-winders' | 'half-landing' | 'half-winders' | 'spiral'
export type StairBuild = 'kit' | 'site'
export type StairMaterial = 'softwood' | 'mdf' | 'oak'
export type BalStyle = 'spindles' | 'glass' | 'rods'

export interface StairKindInfo {
  id: StairKind; label: string
  /** winders in the turn, and whether there is a landing platform */
  winders: number; landing: boolean
  /** newel posts for the balustrade (bottom, turn or landing, top) */
  newels: number
  /** extra on a made staircase for the turn, £ */
  kitExtra: number
}
export const STAIR_KINDS: StairKindInfo[] = [
  { id: 'straight', label: 'Straight flight', winders: 0, landing: false, newels: 2, kitExtra: 0 },
  { id: 'quarter-landing', label: 'Quarter turn with a landing', winders: 0, landing: true, newels: 3, kitExtra: 280 },
  { id: 'quarter-winders', label: 'Quarter turn with winders (3)', winders: 3, landing: false, newels: 3, kitExtra: 220 },
  { id: 'half-landing', label: 'Half turn with a landing (dog-leg)', winders: 0, landing: true, newels: 4, kitExtra: 520 },
  { id: 'half-winders', label: 'Half turn with winders (6)', winders: 6, landing: false, newels: 4, kitExtra: 420 },
  { id: 'spiral', label: 'Spiral staircase (kit, with its own handrail)', winders: 0, landing: false, newels: 0, kitExtra: 0 },
]
export const STAIR_KIND_BY_ID: Record<string, StairKindInfo> = Object.fromEntries(STAIR_KINDS.map(k => [k.id, k]))

export const BUILD_LABEL: Record<StairBuild, string> = { kit: 'A made staircase (factory-made, we fit it)', site: 'Built on site (strings, treads and risers cut by the carpenter)' }
export const MATERIAL_LABEL: Record<StairMaterial, string> = { softwood: 'Softwood (pine)', mdf: 'Primed MDF (for painting)', oak: 'Solid oak' }
export const MATERIAL_WORD: Record<StairMaterial, string> = { softwood: 'softwood', mdf: 'primed MDF', oak: 'solid oak' }
export const BAL_LABEL: Record<BalStyle, string> = { spindles: 'Timber spindles and handrail', glass: 'Glass panels with a handrail', rods: 'Stainless steel rods with a handrail' }
export const BAL_WORD: Record<BalStyle, string> = { spindles: 'timber spindle', glass: 'glass panel', rods: 'stainless steel rod' }

/** Sample rates, £ (a made staircase: per riser for a straight closed-riser flight in softwood; the rest are per unit as named) */
export const RATES = {
  kitPerRiserSoftwood: 52, kitPerRiserMdf: 64, kitPerRiserOak: 150,
  spiralFixed: 800, spiralPerRiser: 45,
  stringPerLm: 9.5, stringPerLmOak: 38,
  treadSoftwood: 12, treadMdf: 9.5, treadOak: 42,
  riserSoftwood: 5, riserMdf: 4.5, riserOak: 16,
  landingFrame: 160,
  sundriesPerRiser: 3, kitSundries: 25,
  newelSoftwood: 26, newelMdf: 30, newelOak: 85,
  handrailSoftwood: 9, handrailMdf: 8.5, handrailOak: 28,
  baserailSoftwood: 7, baserailMdf: 6.5, baserailOak: 22,
  spindleSoftwood: 2.1, spindleMdf: 2.4, spindleOak: 6.5,
  glassPerLm: 290, rodsPerLm: 95,
  wallBracket: 4.5,
  soffitBoardPerM2: 8,
} as const
export type StairRateKey = keyof typeof RATES

/** Target rise when the number of risers is worked out from the height, and the Part K limits */
export const TARGET_RISE_MM = 200
export const MAX_RISE_MM = 220
export const MIN_GOING_MM = 220
export const MAX_PITCH_DEG = 42
/** Spindles per metre of balustrade (41mm spindles, gaps under 100mm) */
export const SPINDLES_PER_M = 7.2

export const HOURS = {
  kitBase: 5, kitPerRiser: 0.7, kitWinder: 0.5, kitLanding: 4, spiralBase: 6, spiralPerRiser: 0.9,
  siteBase: 8, sitePerRiser: 2.2, siteWinder: 1.2, siteLanding: 6,
  newel: 1.2, handrailPerLm: 0.35, baserailPerLm: 0.2, spindle: 0.08, glassPerLm: 1.2, rodsPerLm: 0.9, wallHandrailPerLm: 0.4, soffitPerM2: 0.5,
} as const
/** The labourer who helps carry and lift a staircase into place: this share of the staircase fitting hours */
export const LABOURER_SHARE = 0.25

export interface StairSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_STAIR_SITUATIONS: StairSituation[] = [
  { id: 'empty', label: 'Empty house (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (floors and furniture to protect)', upliftPct: 15 },
  { id: 'hard', label: 'Awkward (tight stairwell, no easy way in)', upliftPct: 20 },
]

export interface Staircase {
  id: string
  /** S1, S2 ... */
  ref: string
  /** where it is: "main stairs", "loft" */
  location: string
  kind: StairKind
  build: StairBuild
  material: StairMaterial
  /** floor to floor, from the top of one floor finish to the top of the next, mm */
  heightMm: number
  /** blank = worked out from the height at a rise of about 200mm */
  risersOverride: number | null
  goingMm: number
  widthMm: number
  openRisers: boolean
  /** the client supplies the staircase itself (we fit only) */
  clientSupplies: boolean
  /** the balustrade: the sides that are open (0, 1 or 2), its style, handrails on the wall side, guarding along a landing (m) */
  balSides: 0 | 1 | 2
  balStyle: BalStyle
  wallHandrail: boolean
  landingBalLm: number
  balClientSupplies: boolean
  /** the underside boarded in (fire-resisting board on battens), m² */
  soffitM2: number
  situationId?: string | null
}

export function newStaircase(id: string, ref: string, location = ''): Staircase {
  return {
    id, ref, location, kind: 'straight', build: 'kit', material: 'softwood', heightMm: 2600, risersOverride: null, goingMm: 250, widthMm: 900, openRisers: false,
    clientSupplies: false, balSides: 1, balStyle: 'spindles', wallHandrail: false, landingBalLm: 0, balClientSupplies: false, soffitM2: 0, situationId: null,
  }
}

export interface StairGeometry {
  risers: number
  riseMm: number
  /** treads in the flight: one fewer than the risers, because the top floor is the last tread */
  treads: number
  runMm: number
  pitchDeg: number
  /** 2 x rise + going, which should be 550 to 700 */
  comfort: number
  /** the length of the stair along its slope, m (the balustrade and the strings follow it) */
  rakeM: number
}
export function stairGeometry(s: Pick<Staircase, 'heightMm' | 'risersOverride' | 'goingMm'>): StairGeometry {
  const risers = s.risersOverride && s.risersOverride >= 2 ? Math.round(s.risersOverride) : Math.max(2, Math.round(s.heightMm / TARGET_RISE_MM))
  const riseMm = s.heightMm / risers
  const treads = risers - 1
  const runMm = treads * s.goingMm
  const pitchDeg = (Math.atan2(riseMm, s.goingMm) * 180) / Math.PI
  const rakeM = Math.sqrt(runMm * runMm + s.heightMm * s.heightMm) / 1000
  return { risers, riseMm, treads, runMm, pitchDeg, comfort: 2 * riseMm + s.goingMm, rakeM }
}

export interface StairLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface StairLabourTask { key: string; roomId: string; trade: 'carpenter' | 'labourer'; task: string; hours: number; basis: string }
export interface StairSummary { stairId: string; ref: string; name: string; risers: number; riseMm: number; widthMm: number; parts: string[] }
export interface StairResult {
  lines: StairLine[]
  labour: StairLabourTask[]
  stairs: StairSummary[]
  totalRisers: number
  totalBalLm: number
  totalHours: number
  warnings: string[]
}
export interface StairInput {
  stairs: Staircase[]
  jobSituationId: string
  situations: StairSituation[]
  /** sample rates typed over, by key */
  rates: Partial<Record<StairRateKey, number>>
}

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const pick = <T,>(m: StairMaterial, soft: T, mdf: T, oak: T): T => (m === 'oak' ? oak : m === 'mdf' ? mdf : soft)

export function calculateStairs(input: StairInput): StairResult {
  const job = input.situations.find(s => s.id === input.jobSituationId) ?? input.situations[0]
  const rate = (k: StairRateKey): number => {
    const v = input.rates[k] ?? RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const lines: StairLine[] = []
  const labour: StairLabourTask[] = []
  const stairs: StairSummary[] = []
  const warnings: string[] = []
  let totalRisers = 0, totalBalLm = 0, totalHours = 0

  for (const s of input.stairs) {
    const k = STAIR_KIND_BY_ID[s.kind]
    const name = s.ref.trim() || 'Staircase'
    if (!k) throw new Error(`${name} has no shape.`)
    if (!(s.heightMm >= 500) || !(s.heightMm <= 6000)) throw new Error(`${name}: the floor-to-floor height must be between 500mm and 6000mm.`)
    if (!(s.goingMm > 0) || !(s.widthMm > 0)) throw new Error(`${name}: the going and the width must be above zero.`)
    if (s.risersOverride !== null && !(s.risersOverride >= 2)) throw new Error(`${name}: a staircase needs at least 2 risers.`)
    if (!(s.landingBalLm >= 0) || !(s.soffitM2 >= 0)) throw new Error(`${name}: a length or area cannot be negative.`)
    const label = `${name}${s.location.trim() ? ` (${s.location.trim()})` : ''}`
    const g = stairGeometry(s)
    const sit = input.situations.find(x => x.id === s.situationId) ?? job
    const uplift = 1 + (sit?.upliftPct ?? 0) / 100
    const spiral = s.kind === 'spiral'
    const widthF = Math.max(1, s.widthMm / 900)
    const parts: string[] = []
    const add = (key: string, what: string, unit: string, unitCost: number, q: number) => {
      if (q > 0 && unitCost >= 0) lines.push({ id: `${key}|${s.id}`, name: `${label} — ${what}`, category: 'materials', unit, unitCost: money(unitCost), qty: +q.toFixed(3), roomId: s.id })
    }
    const stairHrs: { what: string; h: number }[] = []
    const balHrs: { what: string; h: number }[] = []
    const addS = (what: string, h: number) => { if (h > 0) stairHrs.push({ what, h }) }
    const addB = (what: string, h: number) => { if (h > 0) balHrs.push({ what, h }) }

    // ── the staircase ───────────────────────────────────────────────────────────
    const shape = `${k.label.toLowerCase()}, ${g.risers} risers (rise ${Math.round(g.riseMm)}mm, going ${s.goingMm}mm), ${s.widthMm}mm wide`
    if (spiral) {
      if (!s.clientSupplies) add('kit', 'spiral staircase kit', 'item', rate('spiralFixed') + rate('spiralPerRiser') * g.risers * pick(s.material, 1, 1, 1.5), 1)
      addS('spiral staircase', HOURS.spiralBase + HOURS.spiralPerRiser * g.risers)
      parts.push(`${s.clientSupplies ? 'a spiral staircase supplied by the client, ' : 'a spiral staircase, '}${g.risers} risers, ${s.widthMm}mm diameter, with its own handrail, fitted by us`)
    } else if (s.clientSupplies || s.build === 'kit') {
      if (!s.clientSupplies) {
        const perRiser = pick(s.material, rate('kitPerRiserSoftwood'), rate('kitPerRiserMdf'), rate('kitPerRiserOak')) * (s.openRisers ? 0.88 : 1)
        add('kit', `made staircase, ${MATERIAL_WORD[s.material]}, ${k.label.toLowerCase()}`, 'item', (perRiser * g.risers + k.kitExtra) * (1 + Math.max(0, s.widthMm - 900) / 1000 * 0.5), 1)
        add('sundries', 'screws, adhesive and fixings', 'item', rate('kitSundries'), 1)
      }
      addS(`fit the ${g.risers}-riser staircase`, HOURS.kitBase + HOURS.kitPerRiser * g.risers + HOURS.kitWinder * k.winders + (k.landing ? HOURS.kitLanding : 0))
      parts.push(`${s.clientSupplies ? 'a ' : 'a made '}${MATERIAL_WORD[s.material]} ${shape}, ${s.openRisers ? 'open' : 'closed'} risers${s.clientSupplies ? ', supplied by the client and fitted by us' : ', supplied and fitted'}`)
    } else {
      // built on site: strings, treads, risers, a landing platform
      const stringLm = 2 * g.rakeM * 1.1
      add('string', `strings (${MATERIAL_WORD[s.material] === 'solid oak' ? 'oak' : 'softwood'}, cut to the stair)`, 'lm', s.material === 'oak' ? rate('stringPerLmOak') : rate('stringPerLm'), stringLm)
      const treadRate = pick(s.material, rate('treadSoftwood'), rate('treadMdf'), rate('treadOak')) * widthF
      const flat = g.treads - k.winders
      add('tread', `${MATERIAL_WORD[s.material]} treads`, 'nr', treadRate, flat)
      if (k.winders > 0) add('winder', `${MATERIAL_WORD[s.material]} winder treads`, 'nr', treadRate * 1.6, k.winders)
      if (!s.openRisers) add('riser', `${MATERIAL_WORD[s.material]} risers`, 'nr', pick(s.material, rate('riserSoftwood'), rate('riserMdf'), rate('riserOak')) * widthF, g.risers)
      if (k.landing) add('landing', 'landing frame and decking', 'nr', rate('landingFrame'), 1)
      add('sundries', 'glue blocks, wedges, screws and adhesive', 'riser', rate('sundriesPerRiser'), g.risers)
      addS(`cut and build the ${g.risers}-riser staircase`, HOURS.siteBase + HOURS.sitePerRiser * g.risers + HOURS.siteWinder * k.winders + (k.landing ? HOURS.siteLanding : 0))
      parts.push(`a ${MATERIAL_WORD[s.material]} ${shape}, built on site with ${s.openRisers ? 'open' : 'closed'} risers`)
    }

    // ── the balustrade ──────────────────────────────────────────────────────────
    const handrailLm = s.balSides * g.rakeM + s.landingBalLm
    if (spiral) {
      if (s.balSides > 0 || s.wallHandrail || s.landingBalLm > 0) warnings.push(`${label}: a spiral staircase kit has its own handrail, so no balustrade is priced for it. Guarding along the landing is not in the kit.`)
    } else {
      if (handrailLm > 0) {
        totalBalLm += handrailLm
        const sidesWord = s.balSides === 2 ? 'both sides' : s.balSides === 1 ? 'one side' : ''
        const balWhere = [sidesWord && `along ${sidesWord} of the stair`, s.landingBalLm > 0 && `${n1(s.landingBalLm)}m along the landing`].filter(Boolean).join(' and ')
        if (s.balStyle === 'spindles') {
          if (!s.balClientSupplies) {
            add('handrail', `handrail (${MATERIAL_WORD[s.material]})`, 'lm', pick(s.material, rate('handrailSoftwood'), rate('handrailMdf'), rate('handrailOak')), handrailLm * 1.1)
            add('baserail', `base rail (${MATERIAL_WORD[s.material]})`, 'lm', pick(s.material, rate('baserailSoftwood'), rate('baserailMdf'), rate('baserailOak')), handrailLm * 1.1)
            add('spindle', `${MATERIAL_WORD[s.material]} spindles`, 'nr', pick(s.material, rate('spindleSoftwood'), rate('spindleMdf'), rate('spindleOak')), Math.ceil(handrailLm * SPINDLES_PER_M))
          }
          addB(`${n1(handrailLm)}m of handrail and base rail`, handrailLm * (HOURS.handrailPerLm + HOURS.baserailPerLm))
          addB(`${Math.ceil(handrailLm * SPINDLES_PER_M)} spindles`, Math.ceil(handrailLm * SPINDLES_PER_M) * HOURS.spindle)
        } else {
          if (!s.balClientSupplies) add(s.balStyle, `${BAL_LABEL[s.balStyle].toLowerCase()}`, 'lm', s.balStyle === 'glass' ? rate('glassPerLm') : rate('rodsPerLm'), handrailLm)
          addB(`${n1(handrailLm)}m of ${s.balStyle === 'glass' ? 'glass balustrade' : 'rod balustrade'}`, handrailLm * (s.balStyle === 'glass' ? HOURS.glassPerLm : HOURS.rodsPerLm))
        }
        if (s.balStyle !== 'glass') {
          if (!s.balClientSupplies) add('newel', `newel posts (${MATERIAL_WORD[s.material]})`, 'nr', pick(s.material, rate('newelSoftwood'), rate('newelMdf'), rate('newelOak')), k.newels)
          addB(`${k.newels} newel posts`, k.newels * HOURS.newel)
        }
        parts.push(`${BAL_WORD[s.balStyle]} balustrade ${balWhere}${s.balClientSupplies ? ' (supplied by the client)' : ''}`)
      }
      if (s.wallHandrail) {
        const lm = g.rakeM
        totalBalLm += lm
        if (!s.balClientSupplies) {
          add('wallrail', `wall handrail (${MATERIAL_WORD[s.material]})`, 'lm', pick(s.material, rate('handrailSoftwood'), rate('handrailMdf'), rate('handrailOak')), lm * 1.1)
          add('bracket', 'handrail brackets', 'nr', rate('wallBracket'), Math.ceil(lm / 0.9) + 1)
        }
        addB(`${n1(lm)}m of wall handrail`, lm * HOURS.wallHandrailPerLm)
        parts.push(`a handrail on the wall side${s.balClientSupplies ? ' (supplied by the client)' : ''}`)
      }
    }

    // ── the underside ───────────────────────────────────────────────────────────
    if (s.soffitM2 > 0) {
      add('soffit', 'fire-resisting board and battens to the underside', 'm²', rate('soffitBoardPerM2'), s.soffitM2 * 1.1)
      addB(`boarding the underside, ${n1(s.soffitM2)}m²`, s.soffitM2 * HOURS.soffitPerM2)
      parts.push(`the underside boarded with fire-resisting board (${n1(s.soffitM2)}m², ready for plastering)`)
    }

    // ── warnings: Part K ─────────────────────────────────────────────────────────
    if (!spiral) {
      if (g.riseMm > MAX_RISE_MM) warnings.push(`${label}: the rise is ${Math.round(g.riseMm)}mm: Part K allows 220mm at most, so it needs more risers.`)
      if (s.goingMm < MIN_GOING_MM) warnings.push(`${label}: the going is ${s.goingMm}mm: Part K needs at least 220mm.`)
      if (g.pitchDeg > MAX_PITCH_DEG) warnings.push(`${label}: the pitch is ${n1(g.pitchDeg)} degrees: Part K allows 42 degrees at most.`)
      if (g.comfort < 550 || g.comfort > 700) warnings.push(`${label}: twice the rise plus the going is ${Math.round(g.comfort)}mm: it should be between 550 and 700mm to be comfortable to climb.`)
      const handrails = s.balSides + (s.wallHandrail ? 1 : 0)
      if (handrails === 0 && s.landingBalLm === 0) warnings.push(`${label}: there is no handrail or balustrade. A staircase needs a handrail on at least one side (both sides when it is 1000mm or wider), and guarding where the drop is over 600mm.`)
      else if (s.widthMm >= 1000 && handrails < 2) warnings.push(`${label}: a staircase 1000mm or wider needs a handrail on both sides.`)
      if (s.openRisers) warnings.push(`${label}: with open risers a 100mm sphere must not be able to pass through (Part K), and they are not allowed where children under 5 may use the stair.`)
      if (k.winders > 0) warnings.push(`${label}: winders need a going of at least 50mm at the narrow end: the designer or the Building Control officer confirms the turn.`)
    } else {
      warnings.push(`${label}: a spiral staircase is only allowed as a secondary stair (to a loft, say): Building Control approve it.`)
    }

    // ── the carpenter, and the labourer who helps with the staircase ────────────
    const stairTotal = stairHrs.reduce((a, x) => a + x.h, 0) * uplift
    const balTotal = balHrs.reduce((a, x) => a + x.h, 0) * uplift
    const upNote = uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : ''
    const sh = hoursOf(stairTotal), bh = hoursOf(balTotal)
    if (sh > 0) {
      labour.push({ key: `stair|${s.id}`, roomId: s.id, trade: 'carpenter', task: `${label} — ${s.clientSupplies || s.build === 'kit' || spiral ? 'fit the staircase' : 'build the staircase'}`, hours: sh, basis: stairHrs.map(x => `${x.what} ${n1(x.h)}h`).join(' + ') + upNote })
      labour.push({ key: `helper|${s.id}`, roomId: s.id, trade: 'labourer', task: `${label} — carry and lift the staircase into place`, hours: hoursOf(stairTotal * LABOURER_SHARE), basis: `${Math.round(LABOURER_SHARE * 100)}% of the staircase hours: a staircase takes two people` })
    }
    if (bh > 0) labour.push({ key: `bal|${s.id}`, roomId: s.id, trade: 'carpenter', task: `${label} — balustrade and handrail`, hours: bh, basis: balHrs.map(x => `${x.what} ${n1(x.h)}h`).join(' + ') + upNote })
    totalHours += sh + bh
    totalRisers += g.risers
    stairs.push({ stairId: s.id, ref: name, name: k.label, risers: g.risers, riseMm: Math.round(g.riseMm), widthMm: s.widthMm, parts })
  }

  if (input.stairs.some(s => s.clientSupplies || s.balClientSupplies)) warnings.push('Where the client supplies the staircase or balustrade, we fit only: check the size, the rise and the delivery before work starts.')
  warnings.push('The stairwell opening and its trimming are priced with the floor, and the top and bottom of the stair need 2.0m headroom (Part K).')
  return { lines, labour, stairs, totalRisers, totalBalLm: money(totalBalLm), totalHours: money(totalHours), warnings: input.stairs.length === 0 ? [] : warnings }
}
