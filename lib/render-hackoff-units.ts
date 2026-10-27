// Hacking off existing external render, wall by wall (an elevation): Plastering & Boarding → Render Hack-Off (by wall) and Demolition → Render Hack-Off (by wall), the SAME calculator listed in both. Each wall is sized
// (length, height, windows, doors, any gable above the eaves), the area follows (openings taken out, the reveals put back, as the External Render calculator does) and says what kind of render comes off (sand and cement,
// pebbledash or roughcast, monocouche, a thin coat, or lime on an old building) and how thick it is, and whether it is hacked off with a power chisel or by hand. The labourer's hours come from the area times a rate of hours
// per m² for that kind of render (thicker takes longer, by hand takes longer), with the masking and protecting, brushing and washing down the bare masonry (on by default), and clearing up. Repointing the brickwork that is
// left can be added as a share of the wall (off by default). The render comes off as inert rubble, which fills skips (only part filled, as it is heavy) or goes by grab lorry. Scaffold is NOT included unless asked for (it is
// usually priced once for the job under Site Setup). New render, painting, repairs to the brickwork behind and taking off insulation boards are not here.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer.

export type HackKind = 'sand-cement' | 'pebbledash' | 'monocouche' | 'thin-coat' | 'lime'
/** a power chisel or SDS breaker (the start), or a lump hammer and bolster by hand */
export type HackTool = 'machine' | 'hand'

export interface HackKindInfo { label: string; /** the thickness it usually is, mm */ thicknessMm: number; /** a labourer with a power chisel, hours for each m² */ hoursPerM2: number; /** loose volume made for each m³ in place */ bulk: number; note: string }
export const HACK_KINDS: Record<HackKind, HackKindInfo> = {
  'sand-cement': { label: 'Sand and cement render (smooth or scraped)', thicknessMm: 18, hoursPerM2: 0.5, bulk: 1.5, note: '' },
  pebbledash: { label: 'Pebbledash or roughcast', thicknessMm: 22, hoursPerM2: 0.6, bulk: 1.5, note: 'Pebbledash is harder to hack and throws stones: sheet the ground and windows, and wear eye protection.' },
  monocouche: { label: 'Monocouche (through-colour render)', thicknessMm: 15, hoursPerM2: 0.4, bulk: 1.5, note: '' },
  'thin-coat': { label: 'Thin-coat silicone or acrylic render on a mesh base coat', thicknessMm: 8, hoursPerM2: 0.35, bulk: 1.4, note: 'If the thin coat is on insulation boards (a wall insulation system) the boards come off as well: taking off the insulation is not priced here.' },
  lime: { label: 'Lime render (old building)', thicknessMm: 20, hoursPerM2: 0.7, bulk: 1.5, note: 'Lime render on an old building is often best left or taken off by hand with care: hacking it hard can damage soft brick or stone, and the wall may need to breathe. Get advice before taking it off.' },
}
export const HACK_KIND_LIST = Object.keys(HACK_KINDS) as HackKind[]

export const TOOL_LABEL: Record<HackTool, string> = { machine: 'Power chisel or SDS breaker', hand: 'By hand (lump hammer and bolster)' }
/** by hand takes this many times as long as with a power chisel */
export const HAND_FACTOR = 1.5

export interface HackSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_HACK_SITUATIONS: HackSituation[] = [
  { id: 'ground', label: 'Ground level (easy to reach)', upliftPct: 0 },
  { id: 'scaffold', label: 'From scaffold (upper storeys)', upliftPct: 10 },
  { id: 'hard', label: 'Hard to reach (gables, tight access)', upliftPct: 25 },
]

export const DOOR_OPENING_M2 = 1.9
export const WINDOW_OPENING_M2 = 1.4
export const WINDOW_REVEAL_M2 = 0.9
export const DOOR_REVEAL_M2 = 1.2

export interface HackWall {
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
  kind: HackKind
  /** thickness of the render, mm */
  thicknessMm: number
  tool: HackTool
  /** wire-brush and wash down the bare masonry once the render is off */
  brushDown: boolean
  /** share of the wall's brickwork that needs repointing once the render is off, % (0 = none) */
  repointPct: number
  /** null = the job's situation */
  situationId: string | null
}

/** What a new wall starts as: sand and cement, 18mm, with a power chisel, brushed and washed down, and no repointing until it is wanted. */
export function newHackWall(id: string, name: string, lengthM = 8): HackWall {
  return { id, name, lengthM, heightM: 2.6, windows: 1, doors: 0, gableM2: 0, areaOverrideM2: null, kind: 'sand-cement', thicknessMm: HACK_KINDS['sand-cement'].thicknessMm, tool: 'machine', brushDown: true, repointPct: 0, situationId: null }
}

// ── Sample rates (£, ex VAT) ────────────────────────────────────────────────────────────────────────────────────
export const HACK_RATES = {
  protectBase: 8,           // £ per wall: masking and sheeting to windows and ground
  protectPerM2: 0.3,        // £ per m² of wall: dust sheeting and water suppression
  wash: 0.25,               // £/m² of fungicide and wash down to the bare masonry
  repointPerM2: 7,          // £/m² of repointed brickwork: mortar, sand and sundries
  skipInert: 290,           // £ per 6-yard skip of rubble
  grabLoad: 420,            // £ per grab lorry load
  scaffoldPerM2: 6.5,       // £/m² of wall: scaffold erected, hired for the job and struck (only when asked for)
  asbestosTest: 45,         // £ per sample sent for an asbestos test
} as const
export const SKIP_M3 = 4.6
/** rubble is heavy, so a skip is only part filled */
export const INERT_SKIP_USABLE = SKIP_M3 * 0.6
export const GRAB_LOAD_M3 = 8

// ── Rough hours per unit ────────────────────────────────────────────────────────────────────────────────────────
export const HOURS = { protectWall: 0.5, protectPerM2: 0.01, brushM2: 0.04, repointM2: 1.2, clearM2: 0.06 } as const

export interface HackInput {
  walls: HackWall[]
  jobSituationId: string
  situations: HackSituation[]
  /** unit rates in use, keyed by the HACK_RATES names; missing = the sample rate */
  rates: Partial<Record<keyof typeof HACK_RATES, number>>
  /** price the scaffold for these walls (off by default: it is usually priced once for the job) */
  scaffold: boolean
  /** the rubble goes by grab lorry instead of skips */
  useGrab: boolean
  /** samples of old coatings sent for an asbestos test */
  asbestosTests: number
}

export interface HackLine { id: string; name: string; category: 'materials' | 'plant' | 'other'; unit: string; unitCost: number; qty: number; wallId?: string }
export interface HackLabourTask { key: string; roomId: string; trade: 'labourer' | 'bricklayer'; task: string; hours: number; basis: string }
export interface HackWallSummary {
  wallId: string; name: string; grossM2: number; areaM2: number; uplift: number
  /** plain phrases for the description: "hack off the sand and cement render, 24.6m²" */
  parts: string[]
}
export interface HackResult {
  lines: HackLine[]; labour: HackLabourTask[]; walls: HackWallSummary[]
  totalAreaM2: number; totalHours: number
  /** rubble, m³ loose */
  wasteM3: number; skips: number; grabLoads: number
  warnings: string[]
}

const money = (n: number) => +n.toFixed(2)
const round2 = (n: number) => Math.round(n * 100) / 100
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const nonNeg = (v: number, what: string) => { if (!(v >= 0)) throw new Error(`${what} cannot be negative.`) }

export function hackWallAreas(w: HackWall) {
  const gross = w.lengthM * w.heightM + w.gableM2
  const openings = w.windows * WINDOW_OPENING_M2 + w.doors * DOOR_OPENING_M2
  const reveals = w.windows * WINDOW_REVEAL_M2 + w.doors * DOOR_REVEAL_M2
  const net = Math.max(0, gross - openings + reveals)
  return { gross, areaM2: w.areaOverrideM2 ?? net }
}

/** the words for a kind of render in a sentence: "sand and cement render", "pebbledash" */
export const KIND_WORDS: Record<HackKind, string> = {
  'sand-cement': 'sand and cement render', pebbledash: 'pebbledash or roughcast', monocouche: 'monocouche render', 'thin-coat': 'thin-coat render', lime: 'lime render',
}

export function calculateRenderHackoff(input: HackInput): HackResult {
  const job = input.situations.find(s => s.id === input.jobSituationId)
  if (!job) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  const rate = <K extends keyof typeof HACK_RATES>(k: K): number => {
    const v = input.rates[k] ?? HACK_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  nonNeg(input.asbestosTests, 'The number of asbestos tests')

  const lines: HackLine[] = []
  const labour: HackLabourTask[] = []
  const summaries: HackWallSummary[] = []
  const warnings: string[] = []
  const noted = new Set<string>()
  let totalAreaM2 = 0, totalHours = 0, wasteM3 = 0, tallestNoScaffold = ''

  for (const w of input.walls) {
    const wn = w.name.trim() || 'Wall'
    for (const [v, what] of [[w.lengthM, 'length'], [w.heightM, 'height'], [w.windows, 'number of windows'], [w.doors, 'number of doors'], [w.gableM2, 'gable area'], [w.thicknessMm, 'render thickness'], [w.repointPct, 'repointing share']] as [number, string][]) nonNeg(v, `The ${what} of ${wn}`)
    if (w.areaOverrideM2 !== null && !(w.areaOverrideM2 >= 0)) throw new Error(`The area of ${wn} cannot be negative.`)
    if (w.repointPct > 100) throw new Error(`The repointing share of ${wn} cannot be more than 100%.`)
    const sit = input.situations.find(s => s.id === (w.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${wn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const { gross, areaM2 } = hackWallAreas(w)
    if (!(areaM2 > 0)) { summaries.push({ wallId: w.id, name: wn, grossM2: money(gross), areaM2: 0, uplift: sit.upliftPct, parts: [] }); warnings.push(`${wn} has no area to hack off.`); continue }
    if (w.heightM > 7 && !input.scaffold && !tallestNoScaffold) tallestNoScaffold = `${wn} is ${n1(w.heightM)}m high: it needs scaffold (tick scaffold, or price it under Site Setup).`
    totalAreaM2 += areaM2
    const A = areaM2
    const k = HACK_KINDS[w.kind]
    if (k.note && !noted.has(w.kind)) { noted.add(w.kind); warnings.push(`${k.label}: ${k.note}`) }

    const add = (key: string, name: string, category: HackLine['category'], unit: string, unitCost: number, qty: number) => {
      if (qty > 0 && unitCost >= 0) lines.push({ id: `${key}|${w.id}`, name: `${wn} — ${name}`, category, unit, unitCost: money(unitCost), qty: +qty.toFixed(3), wallId: w.id })
    }
    const task = (key: string, trade: HackLabourTask['trade'], what: string, parts2: { qty: number; unit: string; what: string; rate: number }[]) => {
      const used = parts2.filter(p => p.qty > 0 && p.rate > 0)
      if (used.length === 0) return
      const hours = hoursOf(used.reduce((s, p) => s + p.qty * p.rate, 0) * uplift)
      if (hours === 0) return
      totalHours += hours
      labour.push({ key: `${key}|${w.id}`, roomId: w.id, trade, task: `${wn} — ${what}`, hours,
        basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${+p.rate.toFixed(3)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    }

    // ── Protection ───────────────────────────────────────────────────────────────
    add('protect', 'dust sheeting, masking to windows and ground protection', 'materials', 'item', rate('protectBase') + rate('protectPerM2') * A, 1)
    task('protect', 'labourer', 'sheet up and protect', [{ qty: 1, unit: 'wall', what: 'sheeting and masking', rate: HOURS.protectWall }, { qty: A, unit: 'm²', what: 'protected', rate: HOURS.protectPerM2 }])

    // ── Hacking off ──────────────────────────────────────────────────────────────
    const thicknessFactor = Math.min(1.8, Math.max(0.6, w.thicknessMm > 0 ? w.thicknessMm / k.thicknessMm : 1))
    const toolFactor = w.tool === 'hand' ? HAND_FACTOR : 1
    task('hack', 'labourer', `hack off the ${KIND_WORDS[w.kind]}`, [{ qty: A, unit: 'm²', what: `${KIND_WORDS[w.kind]} ${w.thicknessMm}mm ${w.tool === 'hand' ? 'by hand' : 'with a power chisel'}`, rate: k.hoursPerM2 * thicknessFactor * toolFactor }])
    const parts: string[] = [`hack off the ${KIND_WORDS[w.kind]}${w.tool === 'hand' ? ' by hand' : ''}, ${n1(A)}m²`]

    // ── The bare masonry ─────────────────────────────────────────────────────────
    if (w.brushDown) {
      add('wash', 'fungicide and wash down to the bare masonry', 'materials', 'm²', rate('wash'), A)
      task('brush', 'labourer', 'wire-brush and wash down the bare masonry', [{ qty: A, unit: 'm²', what: 'brushed and washed', rate: HOURS.brushM2 }])
      parts.push('the bare masonry brushed down and washed')
    }
    if (w.repointPct > 0) {
      const rp = A * w.repointPct / 100
      add('repoint', `repointing (${w.repointPct}% of the wall, ${n1(rp)}m²)`, 'materials', 'm²', rate('repointPerM2'), rp)
      task('repoint', 'bricklayer', 'repoint the exposed brickwork', [{ qty: rp, unit: 'm²', what: 'repointed', rate: HOURS.repointM2 }])
      parts.push(`${w.repointPct}% of the brickwork repointed`)
    }

    // ── Clearing up and the rubble ───────────────────────────────────────────────
    task('clear', 'labourer', 'clear up and load the rubble', [{ qty: A, unit: 'm²', what: 'cleared', rate: HOURS.clearM2 }])
    wasteM3 += A * w.thicknessMm / 1000 * k.bulk
    if (input.scaffold) add('scaffold', 'scaffold erected, hired and struck', 'plant', 'm²', rate('scaffoldPerM2'), A)

    summaries.push({ wallId: w.id, name: wn, grossM2: money(gross), areaM2: round2(A), uplift: sit.upliftPct, parts })
  }

  // ── The rubble ───────────────────────────────────────────────────────────────
  let skips = 0, grabLoads = 0
  if (wasteM3 > 0) {
    if (input.useGrab) { grabLoads = Math.ceil(wasteM3 / GRAB_LOAD_M3); lines.push({ id: 'grab', name: `Render rubble taken away by grab lorry (about ${round2(wasteM3)} m³ loose)`, category: 'other', unit: 'load', unitCost: rate('grabLoad'), qty: grabLoads }) }
    else { skips = Math.max(1, Math.ceil(wasteM3 / INERT_SKIP_USABLE)); lines.push({ id: 'skips', name: `Skip hire for the render rubble (6-yard skips, only part filled, about ${round2(wasteM3)} m³ loose)`, category: 'other', unit: 'skip', unitCost: rate('skipInert'), qty: skips }) }
  }
  if (input.asbestosTests > 0) lines.push({ id: 'asbestos', name: 'Samples of the old coating sent for an asbestos test', category: 'other', unit: 'sample', unitCost: rate('asbestosTest'), qty: Math.round(input.asbestosTests) })

  if (input.walls.length === 0) warnings.push('No walls yet. Add a wall, give it a length and height, and say what render comes off.')
  if (tallestNoScaffold) warnings.push(tallestNoScaffold)
  if (input.walls.length > 0) {
    warnings.push('Old textured coatings (before about 2000) can contain asbestos: have a sample tested before anything is hacked off if there is any doubt.')
    warnings.push('Hacking off can show the brickwork behind to be damaged, patched or soft. Repairs to it, new render and painting are not included.')
  }
  return { lines, labour, walls: summaries, totalAreaM2: round2(totalAreaM2), totalHours: round2(totalHours), wasteM3: round2(wasteM3), skips, grabLoads, warnings }
}

export function renderHackoffSubtotal(lines: HackLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}
