// External rendering priced wall by wall (an elevation): what the wall gets (traditional sand and cement scratch and float coats, monocouche, or a thin-coat silicone system on a mesh-reinforced base coat),
// what it goes onto (new masonry, existing render, or painted masonry that needs a key), the beads, movement joints and an optional masonry paint. Each wall is sized (length, height, windows, doors, any gable above
// the eaves), the area follows (openings taken out, the reveals put back), and the materials come from the area, the thickness and the sample coverage of each product; the plasterer's time from the area
// times a rate of hours per unit, with a labourer to mix and carry. Scaffold is NOT included unless asked for (it is usually priced once for the job under Site Setup). External wall INSULATION systems
// (insulation boards under the render) are not here yet.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no cross-file runtime imports), so it can be
// hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer.

export type RenderSystem = 'sand-cement' | 'monocouche' | 'thin-coat'
/** What the render goes onto */
export type RenderBase = 'new-masonry' | 'existing-render' | 'painted-masonry'

export const SYSTEM_LABEL: Record<RenderSystem, string> = {
  'sand-cement': 'Sand and cement: scratch coat and float coat (to be painted)',
  monocouche: 'Monocouche: scratch coat and a through-colour coat, scraped',
  'thin-coat': 'Thin-coat silicone: base coat with mesh, primer and a silicone finish',
}
export const BASE_LABEL: Record<RenderBase, string> = {
  'new-masonry': 'New brick or block',
  'existing-render': 'Existing render (cleaned and keyed)',
  'painted-masonry': 'Painted or sealed masonry (bonding coat first)',
}

/** What an average door and window take out of a wall, m², and the area of render in the reveals put back round each */
export const DOOR_OPENING_M2 = 1.9
export const WINDOW_OPENING_M2 = 1.4
export const WINDOW_REVEAL_M2 = 0.9
export const DOOR_REVEAL_M2 = 1.2
/** Metres of bead round each window's and door's reveals */
export const WINDOW_BEAD_LM = 4.8
export const DOOR_BEAD_LM = 5

export interface RenderSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_RENDER_SITUATIONS: RenderSituation[] = [
  { id: 'ground', label: 'Ground level (easy to reach)', upliftPct: 0 },
  { id: 'scaffold', label: 'From scaffold (upper storeys)', upliftPct: 10 },
  { id: 'hard', label: 'Hard to reach (gables, tight access)', upliftPct: 25 },
]

export interface RenderWall {
  id: string
  name: string
  lengthM: number
  heightM: number
  windows: number
  doors: number
  /** extra area of a gable above the eaves, m² */
  gableM2: number
  /** null = worked out from the wall (length x height plus the gable, less the openings, plus the reveals) */
  areaOverrideM2: number | null
  system: RenderSystem
  base: RenderBase
  /** masonry paint over a sand and cement render (the other systems are finished in their own colour) */
  paint: boolean
  coats: number
  /** metres of corner, stop and drip bead; null = worked out (both corners, the base, and the reveals) */
  beadsLm: number | null
  movementJointsLm: number
  /** null = the job's situation */
  situationId: string | null
}

/** What a new wall starts as: monocouche to new masonry, with the beads worked out and no movement joints until they are wanted. */
export function newRenderWall(id: string, name: string, lengthM = 8): RenderWall {
  return { id, name, lengthM, heightM: 2.6, windows: 1, doors: 0, gableM2: 0, areaOverrideM2: null, system: 'monocouche', base: 'new-masonry', paint: false, coats: 2, beadsLm: null, movementJointsLm: 0, situationId: null }
}

// ── Sample material rates (£, ex VAT) and coverage ──────────────────────────────────────────────────────────────────────────────────────────────
export const MATERIAL_RATES = {
  sandCementPerMm: 0.115,   // £ per m² for each mm of thickness: cement, sharp sand and waterproofer, mixed
  monoBag: 13.5,            // £ per 25kg bag of monocouche
  baseCoatBag: 12,          // £ per 25kg bag of thin-coat base coat
  silicone: 48,             // £ per 25kg tub of silicone finish
  mesh: 1.8,                // £/m² of glass-fibre mesh (with its overlaps)
  primer: 0.7,              // £/m² of key coat or primer under the thin coat
  bondCoat: 0.9,            // £/m² of bonding coat to painted masonry
  clean: 0.25,              // £/m² of cleaning and key to existing render (wash, fungicide)
  masonryPaint: 13,         // £/L masonry paint
  bead: 1.8,                // £/lm corner, stop or drip bead
  movementJoint: 4,         // £/lm movement joint bead
  sundries: 0.2,            // £/m²: buckets, masking, tape, water
  protectBase: 8,           // £ per wall: masking and sheeting to windows and ground
  protectPerM2: 0.3,        // £ per m² of wall
  scaffoldPerM2: 6.5,       // £/m² of wall: scaffold erected, hired for the job and struck (only when asked for)
} as const

export const WASTE = 1.1
/** thickness of each coat, mm */
export const THICKNESS = { scratch: 11, float: 6, monoScratch: 10 } as const
/** m² covered by one 25kg bag (monocouche at 15mm, the base coat at 4mm with mesh) or one tub (silicone, 1.5mm) */
export const COVERAGE = { mono: 1.15, baseCoat: 5, silicone: 12 } as const
/** m² per litre per coat of masonry paint */
export const PAINT_M2_PER_L = 6

// ── Rough hours per unit, one plasterer ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const HOURS = {
  protectWall: 0.5, protectPerM2: 0.01,
  cleanM2: 0.03, bondM2: 0.02,
  scratchM2: 0.22, floatM2: 0.28, monoM2: 0.3,
  baseCoatM2: 0.18, meshM2: 0.08, topCoatM2: 0.12,
  paintCoatM2: 0.05,
  beadLm: 0.08, jointLm: 0.15,
} as const
/** The labourer mixes and carries for the plasterer: this share of the plasterer's hours */
export const LABOURER_SHARE = 0.25

export interface RenderInput {
  walls: RenderWall[]
  jobSituationId: string
  situations: RenderSituation[]
  /** unit rates in use, keyed by the MATERIAL_RATES names; missing = the sample rate */
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
  /** price the scaffold for these walls (off by default: it is usually priced once for the job) */
  scaffold: boolean
}

export interface RenderLine { id: string; name: string; category: 'materials' | 'plant'; unit: string; unitCost: number; qty: number; wallId?: string }
export interface RenderLabourTask { key: string; roomId: string; trade: 'plasterer' | 'labourer'; task: string; hours: number; basis: string }
export interface RenderWallSummary {
  wallId: string; name: string; grossM2: number; areaM2: number; uplift: number
  /** plain phrases for the description: "monocouche render to 24.6m²" */
  parts: string[]
}
export interface RenderResult { lines: RenderLine[]; labour: RenderLabourTask[]; walls: RenderWallSummary[]; totalAreaM2: number; totalPlasterHours: number; warnings: string[] }

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const nonNeg = (v: number, what: string) => { if (!(v >= 0)) throw new Error(`${what} cannot be negative.`) }

export function wallAreas(w: RenderWall) {
  const gross = w.lengthM * w.heightM + w.gableM2
  const openings = w.windows * WINDOW_OPENING_M2 + w.doors * DOOR_OPENING_M2
  const reveals = w.windows * WINDOW_REVEAL_M2 + w.doors * DOOR_REVEAL_M2
  const net = Math.max(0, gross - openings + reveals)
  const autoBeadsLm = 2 * w.heightM + w.lengthM + w.windows * WINDOW_BEAD_LM + w.doors * DOOR_BEAD_LM
  return { gross, areaM2: w.areaOverrideM2 ?? net, autoBeadsLm }
}

export function calculateRender(input: RenderInput): RenderResult {
  const job = input.situations.find(s => s.id === input.jobSituationId)
  if (!job) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  const rate = <K extends keyof typeof MATERIAL_RATES>(k: K): number => {
    const v = input.rates[k] ?? MATERIAL_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }

  const lines: RenderLine[] = []
  const labour: RenderLabourTask[] = []
  const summaries: RenderWallSummary[] = []
  const warnings: string[] = []
  let totalAreaM2 = 0, totalPlasterHours = 0

  for (const w of input.walls) {
    const wn = w.name.trim() || 'Wall'
    for (const [v, what] of [[w.lengthM, 'length'], [w.heightM, 'height'], [w.windows, 'number of windows'], [w.doors, 'number of doors'], [w.gableM2, 'gable area'], [w.movementJointsLm, 'movement joints'], [w.coats, 'number of coats']] as [number, string][]) nonNeg(v, `The ${what} of ${wn}`)
    for (const o of [w.areaOverrideM2, w.beadsLm]) if (o !== null && !(o >= 0)) throw new Error(`An area or length in ${wn} cannot be negative.`)
    const sit = input.situations.find(s => s.id === (w.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${wn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const { gross, areaM2, autoBeadsLm } = wallAreas(w)
    if (!(areaM2 > 0)) { summaries.push({ wallId: w.id, name: wn, grossM2: money(gross), areaM2: 0, uplift: sit.upliftPct, parts: [] }); warnings.push(`${wn} has no area to render.`); continue }
    if (w.heightM > 7 && !input.scaffold) warnings.push(`${wn} is ${n1(w.heightM)}m high: it needs scaffold (tick scaffold, or price it under Site Setup).`)
    totalAreaM2 += areaM2

    const parts: string[] = []
    const add = (key: string, name: string, category: 'materials' | 'plant', unit: string, unitCost: number, qty: number) => {
      if (qty > 0 && unitCost >= 0) lines.push({ id: `${key}|${w.id}`, name: `${wn} — ${name}`, category, unit, unitCost: money(unitCost), qty: +qty.toFixed(3), wallId: w.id })
    }
    const task = (key: string, what: string, parts2: { qty: number; unit: string; what: string; rate: number }[]) => {
      const used = parts2.filter(p => p.qty > 0 && p.rate > 0)
      if (used.length === 0) return
      const hours = hoursOf(used.reduce((s, p) => s + p.qty * p.rate, 0) * uplift)
      if (hours === 0) return
      totalPlasterHours += hours
      labour.push({ key: `${key}|${w.id}`, roomId: w.id, trade: 'plasterer', task: `${wn} — ${what}`, hours,
        basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${+p.rate.toFixed(3)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    }
    const A = areaM2

    // ── Protection and preparation ───────────────────────────────────────────────
    add('protect', 'masking and sheeting to windows and ground', 'materials', 'item', rate('protectBase') + rate('protectPerM2') * A, 1)
    const prepParts: { qty: number; unit: string; what: string; rate: number }[] = [{ qty: 1, unit: 'wall', what: 'masking and protection', rate: HOURS.protectWall }, { qty: A, unit: 'm²', what: 'protected', rate: HOURS.protectPerM2 }]
    if (w.base === 'existing-render') { add('clean', 'cleaning and keying the existing render', 'materials', 'm²', rate('clean'), A); prepParts.push({ qty: A, unit: 'm²', what: 'cleaned and keyed', rate: HOURS.cleanM2 }); parts.push('the existing render cleaned and keyed') }
    if (w.base === 'painted-masonry') { add('bond', 'bonding coat to the painted masonry', 'materials', 'm²', rate('bondCoat'), A); prepParts.push({ qty: A, unit: 'm²', what: 'bonding coat', rate: HOURS.bondM2 }); parts.push('a bonding coat to the painted masonry') }
    task('prep', 'mask up, clean and prepare', prepParts)

    // ── The render ───────────────────────────────────────────────────────────────
    const sc = (mm: number) => rate('sandCementPerMm') * mm
    const coatParts: { qty: number; unit: string; what: string; rate: number }[] = []
    switch (w.system) {
      case 'sand-cement':
        add('scratch', `sand and cement scratch coat (${THICKNESS.scratch}mm)`, 'materials', 'm²', sc(THICKNESS.scratch), A * WASTE)
        add('float', `sand and cement float coat (${THICKNESS.float}mm)`, 'materials', 'm²', sc(THICKNESS.float), A * WASTE)
        coatParts.push({ qty: A, unit: 'm²', what: 'scratch coat', rate: HOURS.scratchM2 }, { qty: A, unit: 'm²', what: 'float coat', rate: HOURS.floatM2 })
        parts.push(`sand and cement render, scratch and float coats, ${n1(A)}m²`)
        if (w.paint && w.coats > 0) {
          add('paint', `masonry paint (${w.coats} coat${w.coats === 1 ? '' : 's'})`, 'materials', 'L', rate('masonryPaint'), (A * w.coats) / PAINT_M2_PER_L)
          coatParts.push({ qty: A * w.coats, unit: 'm²', what: 'paint coats', rate: HOURS.paintCoatM2 })
          parts.push(`${w.coats} coat${w.coats === 1 ? '' : 's'} of masonry paint`)
        }
        break
      case 'monocouche':
        add('scratch', `sand and cement scratch coat (${THICKNESS.monoScratch}mm)`, 'materials', 'm²', sc(THICKNESS.monoScratch), A * WASTE)
        add('mono', 'monocouche render (15mm)', 'materials', 'bag', rate('monoBag'), (A / COVERAGE.mono) * WASTE)
        coatParts.push({ qty: A, unit: 'm²', what: 'scratch coat', rate: HOURS.scratchM2 }, { qty: A, unit: 'm²', what: 'monocouche applied and scraped', rate: HOURS.monoM2 })
        parts.push(`monocouche render on a scratch coat, ${n1(A)}m²`)
        break
      case 'thin-coat':
        add('basecoat', 'thin-coat base coat (4mm, with mesh)', 'materials', 'bag', rate('baseCoatBag'), (A / COVERAGE.baseCoat) * WASTE)
        add('mesh', 'glass-fibre mesh', 'materials', 'm²', rate('mesh'), A * 1.1)
        add('primer', 'key coat / primer', 'materials', 'm²', rate('primer'), A)
        add('silicone', 'silicone finish coat', 'materials', 'tub', rate('silicone'), (A / COVERAGE.silicone) * WASTE)
        coatParts.push({ qty: A, unit: 'm²', what: 'base coat', rate: HOURS.baseCoatM2 }, { qty: A, unit: 'm²', what: 'mesh embedded', rate: HOURS.meshM2 }, { qty: A, unit: 'm²', what: 'silicone finish', rate: HOURS.topCoatM2 })
        parts.push(`thin-coat silicone render on a mesh-reinforced base coat, ${n1(A)}m²`)
        break
    }
    add('sundries', 'buckets, tape, water and sundries', 'materials', 'item', rate('sundries') * A, 1)
    task('render', 'apply the render', coatParts)

    // ── Beads and joints ─────────────────────────────────────────────────────────
    const beadsLm = w.beadsLm ?? autoBeadsLm
    add('bead', 'corner, stop and drip beads', 'materials', 'lm', rate('bead'), beadsLm)
    add('joint', 'movement joint beads', 'materials', 'lm', rate('movementJoint'), w.movementJointsLm)
    task('beads', 'fix the beads and movement joints', [{ qty: beadsLm, unit: 'lm', what: 'beads', rate: HOURS.beadLm }, { qty: w.movementJointsLm, unit: 'lm', what: 'movement joints', rate: HOURS.jointLm }])
    if (beadsLm > 0) parts.push(`${n1(beadsLm)}m of beads`)
    if (w.movementJointsLm > 0) parts.push(`${n1(w.movementJointsLm)}m of movement joints`)

    // ── Scaffold (only when asked for) ───────────────────────────────────────────
    if (input.scaffold) add('scaffold', 'scaffold erected, hired and struck', 'plant', 'm²', rate('scaffoldPerM2'), A)

    summaries.push({ wallId: w.id, name: wn, grossM2: money(gross), areaM2: money(A), uplift: sit.upliftPct, parts })
  }

  const labourerHours = totalPlasterHours > 0 ? hoursOf(totalPlasterHours * LABOURER_SHARE) : 0
  if (labourerHours > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Mix and carry for the plasterer and clear up', hours: labourerHours, basis: `${Math.round(LABOURER_SHARE * 100)}% of ${n1(totalPlasterHours)} h of rendering` })
  return { lines, labour, walls: summaries, totalAreaM2: money(totalAreaM2), totalPlasterHours: money(totalPlasterHours), warnings }
}
