// Internal wall insulation and backing priced wall by wall (the inside face of an external wall, or any wall that is being lined): what the wall gets (PIR insulated plasterboard fixed to the wall, PIR
// between timber battens with plasterboard over, or mineral wool between a stud lining with plasterboard over), the vapour control layer, insulated reveals round windows and doors, expanded metal
// lath to steelwork or soffits, and timber backing for heavy fixings. Each wall is sized (length, height, windows, doors) and the area follows; the materials come from the area, the thickness and the sample
// price of each product; the fixer's time from the area times a rate of hours per unit, with a labourer to carry the boards, and a carpenter for the backing. The SKIM over the board is the Internal Plastering &
// Boarding calculator (board, then skim or tape and joint), not this one. External wall insulation (boards outside, under the render) is not here.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no cross-file runtime imports), so it can be
// hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer.

export type InsulationSystem = 'pir-board' | 'batten-pir' | 'stud-wool'

export const SYSTEM_LABEL: Record<InsulationSystem, string> = {
  'pir-board': 'PIR insulated plasterboard fixed to the wall (the board is the lining)',
  'batten-pir': 'PIR between timber battens, with plasterboard over',
  'stud-wool': 'Mineral wool between a stud lining, with plasterboard over',
}

/** The thicknesses on offer for each system, mm of insulation, and the sample price of the insulation (£/m²). The board over it, the battens and the studs are priced separately. */
export const PIR_BOARD_MM: Record<number, number> = { 25: 13.5, 40: 16, 50: 18, 60: 21, 70: 24 }       // insulated plasterboard, with its 12.5mm board, £/m²
export const PIR_SHEET_MM: Record<number, number> = { 25: 7, 40: 9, 50: 11, 75: 14 }                     // PIR sheet between battens, £/m²
export const WOOL_MM: Record<number, number> = { 50: 4.5, 75: 6, 100: 7.5 }                              // mineral wool slab between studs, £/m²
export const THICKNESS_OPTIONS: Record<InsulationSystem, number[]> = { 'pir-board': [25, 40, 50, 60, 70], 'batten-pir': [25, 40, 50, 75], 'stud-wool': [50, 75, 100] }
export const DEFAULT_MM: Record<InsulationSystem, number> = { 'pir-board': 50, 'batten-pir': 40, 'stud-wool': 75 }

/** What an average door and window take out of a wall, m², and the area of reveal put back round each (insulated thinly) */
export const DOOR_OPENING_M2 = 1.9
export const WINDOW_OPENING_M2 = 1.4
export const WINDOW_REVEAL_M2 = 0.9
export const DOOR_REVEAL_M2 = 1.2
/** Thin insulated board in a reveal, mm */
export const REVEAL_MM = 25
export interface InsulationSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_INSULATION_SITUATIONS: InsulationSituation[] = [
  { id: 'empty', label: 'Empty rooms (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (furniture to move and protect)', upliftPct: 15 },
  { id: 'hard', label: 'Hard to reach (high walls, stairwell)', upliftPct: 25 },
]

export interface InsulationWall {
  id: string
  name: string
  lengthM: number
  heightM: number
  windows: number
  doors: number
  /** null = worked out from the wall (length x height, less the openings) */
  areaOverrideM2: number | null
  system: InsulationSystem
  /** mm of insulation (for the insulated plasterboard, the PIR thickness: the board is on top of that) */
  thicknessMm: number
  /** a vapour control layer, taped at the joints (always wanted behind the batten and stud systems; the foil on the PIR board does it when its joints are taped) */
  vcl: boolean
  /** insulate the reveals round windows and doors with thin board */
  reveals: boolean
  /** expanded metal lath to steelwork or soffits, m² (typed; not part of the wall area) */
  lathM2: number
  /** timber or plywood backing for heavy fixings (kitchen units, TVs, radiators, handrails), lm */
  backingLm: number
  /** null = the job's situation */
  situationId: string | null
}

/** What a new wall starts as: PIR insulated plasterboard 50mm to a wall, reveals insulated, no lath or backing until they are wanted. */
export function newInsulationWall(id: string, name: string, lengthM = 5): InsulationWall {
  return { id, name, lengthM, heightM: 2.5, windows: 1, doors: 0, areaOverrideM2: null, system: 'pir-board', thicknessMm: DEFAULT_MM['pir-board'], vcl: false, reveals: true, lathM2: 0, backingLm: 0, situationId: null }
}

// ── Sample material rates (£, ex VAT) ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const MATERIAL_RATES = {
  board: 8.5,           // £ per 2400 x 1200 sheet of 12.5mm plasterboard (over battens or studs)
  adhesiveBag: 11,      // £ per 25kg bag of board adhesive (dabs)
  fixings: 0.25,        // £/m² plugs and screws
  tape: 0.15,           // £/m² of foil or jointing tape to the joints
  batten: 0.85,         // £/lm of treated batten
  stud: 1.1,            // £/lm of timber or metal stud
  vcl: 1.2,             // £/m² of vapour control layer with tape
  revealBoard: 8,       // £/m² of thin insulated board in the reveals
  lath: 5.5,            // £/m² of expanded metal lath with fixings
  backing: 4.5,         // £/lm of timber or plywood backing
  sundries: 0.15,       // £/m²: sealant, foam, tape, sundries
  protectBase: 5,       // £ per wall: dust sheets and tape
} as const

export const BOARD_SHEET_M2 = 2.88
export const WASTE = 1.1
/** m² covered by one bag of adhesive */
export const ADHESIVE_M2_PER_BAG = 4.5
/** lm of batten or stud for each m² of wall, at 400mm centres */
export const FRAME_LM_PER_M2 = 2.5

// ── Rough hours per unit ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const HOURS = {
  protectWall: 0.4,
  pirBoardM2: 0.28,       // the board dabbed and plugged to the wall
  battenM2: 0.12, pirSheetM2: 0.1, boardM2: 0.16,
  studM2: 0.14, woolM2: 0.07,
  vclM2: 0.04,
  revealM2: 0.3,
  lathM2: 0.15,
  backingLm: 0.2,          // a carpenter
} as const
/** The labourer carries the boards and clears up: this share of the fixers' hours */
export const LABOURER_SHARE = 0.2

export interface InsulationInput {
  walls: InsulationWall[]
  jobSituationId: string
  situations: InsulationSituation[]
  /** unit rates in use, keyed by the MATERIAL_RATES names; missing = the sample rate */
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
}

export interface InsulationLine { id: string; name: string; category: 'materials'; unit: string; unitCost: number; qty: number; wallId?: string }
export interface InsulationLabourTask { key: string; roomId: string; trade: 'plasterer' | 'carpenter' | 'labourer'; task: string; hours: number; basis: string }
export interface InsulationWallSummary {
  wallId: string; name: string; grossM2: number; areaM2: number; uplift: number
  /** how much the lining takes off the width of the room, mm */
  depthMm: number
  /** plain phrases for the description: "50mm PIR insulated plasterboard fixed to the wall, 24.3m²" */
  parts: string[]
}
export interface InsulationResult { lines: InsulationLine[]; labour: InsulationLabourTask[]; walls: InsulationWallSummary[]; totalAreaM2: number; warnings: string[] }

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const nonNeg = (v: number, what: string) => { if (!(v >= 0)) throw new Error(`${what} cannot be negative.`) }

export function insulationAreas(w: InsulationWall) {
  const gross = w.lengthM * w.heightM
  const openings = w.windows * WINDOW_OPENING_M2 + w.doors * DOOR_OPENING_M2
  const net = Math.max(0, gross - openings)
  const revealM2 = w.windows * WINDOW_REVEAL_M2 + w.doors * DOOR_REVEAL_M2
  return { gross, areaM2: w.areaOverrideM2 ?? net, revealM2 }
}

export function calculateInsulation(input: InsulationInput): InsulationResult {
  const job = input.situations.find(s => s.id === input.jobSituationId)
  if (!job) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  const rate = <K extends keyof typeof MATERIAL_RATES>(k: K): number => {
    const v = input.rates[k] ?? MATERIAL_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }

  const lines: InsulationLine[] = []
  const labour: InsulationLabourTask[] = []
  const summaries: InsulationWallSummary[] = []
  const warnings: string[] = []
  let totalAreaM2 = 0, fixerHours = 0

  for (const w of input.walls) {
    const wn = w.name.trim() || 'Wall'
    for (const [v, what] of [[w.lengthM, 'length'], [w.heightM, 'height'], [w.windows, 'number of windows'], [w.doors, 'number of doors'], [w.lathM2, 'metal lath'], [w.backingLm, 'backing']] as [number, string][]) nonNeg(v, `The ${what} of ${wn}`)
    if (w.areaOverrideM2 !== null && !(w.areaOverrideM2 >= 0)) throw new Error(`The area of ${wn} cannot be negative.`)
    const opts = THICKNESS_OPTIONS[w.system]
    if (!opts || !opts.includes(w.thicknessMm)) throw new Error(`${wn}: choose a thickness of ${opts ? opts.join(', ') : '—'}mm for that system.`)
    const sit = input.situations.find(s => s.id === (w.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${wn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const { gross, areaM2, revealM2 } = insulationAreas(w)
    const hasWall = areaM2 > 0
    if (!hasWall && w.lathM2 <= 0 && w.backingLm <= 0) { summaries.push({ wallId: w.id, name: wn, grossM2: money(gross), areaM2: 0, uplift: sit.upliftPct, depthMm: 0, parts: [] }); warnings.push(`${wn} has nothing to insulate.`); continue }
    totalAreaM2 += hasWall ? areaM2 : 0

    const parts: string[] = []
    const add = (key: string, name: string, unit: string, unitCost: number, qty: number) => {
      if (qty > 0 && unitCost >= 0) lines.push({ id: `${key}|${w.id}`, name: `${wn} — ${name}`, category: 'materials', unit, unitCost: money(unitCost), qty: +qty.toFixed(3), wallId: w.id })
    }
    const task = (key: string, trade: InsulationLabourTask['trade'], what: string, parts2: { qty: number; unit: string; what: string; rate: number }[]) => {
      const used = parts2.filter(p => p.qty > 0 && p.rate > 0)
      if (used.length === 0) return
      const hours = hoursOf(used.reduce((s, p) => s + p.qty * p.rate, 0) * uplift)
      if (hours === 0) return
      if (trade !== 'carpenter') fixerHours += hours
      labour.push({ key: `${key}|${w.id}`, roomId: w.id, trade, task: `${wn} — ${what}`, hours,
        basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${+p.rate.toFixed(3)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    }
    const A = areaM2
    let depthMm = 0

    if (hasWall) {
      add('protect', 'dust sheets and tape', 'item', rate('protectBase'), 1)
      const fixParts: { qty: number; unit: string; what: string; rate: number }[] = [{ qty: 1, unit: 'wall', what: 'protected', rate: HOURS.protectWall }]
      switch (w.system) {
        case 'pir-board':
          add('pir', `${w.thicknessMm}mm PIR insulated plasterboard (with cutting waste)`, 'm²', PIR_BOARD_MM[w.thicknessMm], A * WASTE)
          add('adhesive', 'board adhesive (dabs)', 'bag', rate('adhesiveBag'), A / ADHESIVE_M2_PER_BAG)
          add('fixings', 'plugs and screws', 'm²', rate('fixings'), A)
          add('tape', 'foil tape to the joints', 'm²', rate('tape'), A)
          fixParts.push({ qty: A, unit: 'm²', what: 'insulated board dabbed and plugged', rate: HOURS.pirBoardM2 })
          parts.push(`${w.thicknessMm}mm PIR insulated plasterboard fixed to the wall, ${n1(A)}m²`)
          depthMm = w.thicknessMm + 12.5
          break
        case 'batten-pir':
          add('batten', `${w.thicknessMm}mm treated battens at 400mm centres`, 'lm', rate('batten'), A * FRAME_LM_PER_M2 * WASTE)
          add('pir', `${w.thicknessMm}mm PIR insulation between the battens (with cutting waste)`, 'm²', PIR_SHEET_MM[w.thicknessMm], A * WASTE)
          add('board', '12.5mm plasterboard over the battens (with cutting waste)', 'm²', rate('board') / BOARD_SHEET_M2, A * WASTE)
          add('fixings', 'plugs and screws', 'm²', rate('fixings'), A)
          fixParts.push({ qty: A, unit: 'm²', what: 'battens fixed', rate: HOURS.battenM2 }, { qty: A, unit: 'm²', what: 'insulation between', rate: HOURS.pirSheetM2 }, { qty: A, unit: 'm²', what: 'board fixed', rate: HOURS.boardM2 })
          parts.push(`${w.thicknessMm}mm PIR between battens with plasterboard over, ${n1(A)}m²`)
          depthMm = w.thicknessMm + 12.5
          break
        case 'stud-wool':
          add('stud', 'stud lining at 400mm centres', 'lm', rate('stud'), A * FRAME_LM_PER_M2 * WASTE)
          add('wool', `${w.thicknessMm}mm mineral wool between the studs (with cutting waste)`, 'm²', WOOL_MM[w.thicknessMm], A * WASTE)
          add('board', '12.5mm plasterboard over the studs (with cutting waste)', 'm²', rate('board') / BOARD_SHEET_M2, A * WASTE)
          add('fixings', 'screws and fixings', 'm²', rate('fixings'), A)
          fixParts.push({ qty: A, unit: 'm²', what: 'stud lining fixed', rate: HOURS.studM2 }, { qty: A, unit: 'm²', what: 'mineral wool fitted', rate: HOURS.woolM2 }, { qty: A, unit: 'm²', what: 'board fixed', rate: HOURS.boardM2 })
          parts.push(`${w.thicknessMm}mm mineral wool between a stud lining with plasterboard over, ${n1(A)}m²`)
          depthMm = w.thicknessMm + 12.5
          break
      }
      if (w.vcl) {
        add('vcl', 'vapour control layer, taped', 'm²', rate('vcl'), A * 1.1)
        fixParts.push({ qty: A, unit: 'm²', what: 'vapour control layer taped', rate: HOURS.vclM2 })
        parts.push('a taped vapour control layer')
      }
      if (w.reveals && revealM2 > 0) {
        add('reveals', `${REVEAL_MM}mm insulated board to the reveals`, 'm²', rate('revealBoard'), revealM2 * WASTE)
        fixParts.push({ qty: revealM2, unit: 'm²', what: 'reveals insulated', rate: HOURS.revealM2 })
        parts.push(`insulated reveals, ${n1(revealM2)}m²`)
      }
      add('sundries', 'sealant, foam and sundries', 'item', rate('sundries') * A, 1)
      task('fix', 'plasterer', 'fix the insulation and lining', fixParts)
    }
    if (w.lathM2 > 0) {
      add('lath', 'expanded metal lath with fixings', 'm²', rate('lath'), w.lathM2 * WASTE)
      task('lath', 'plasterer', 'fix the metal lath to steelwork or soffits', [{ qty: w.lathM2, unit: 'm²', what: 'lath', rate: HOURS.lathM2 }])
      parts.push(`${n1(w.lathM2)}m² of expanded metal lath`)
    }
    if (w.backingLm > 0) {
      add('backing', 'timber or plywood backing for fixings', 'lm', rate('backing'), w.backingLm * WASTE)
      task('backing', 'carpenter', 'fix the backing for heavy fixings', [{ qty: w.backingLm, unit: 'lm', what: 'backing', rate: HOURS.backingLm }])
      parts.push(`${n1(w.backingLm)}m of timber backing for heavy fixings`)
    }
    summaries.push({ wallId: w.id, name: wn, grossM2: money(gross), areaM2: money(hasWall ? A : 0), uplift: sit.upliftPct, depthMm, parts })
    if (hasWall && w.system !== 'pir-board' && !w.vcl) warnings.push(`${wn}: a lining with insulation between battens or studs normally needs a vapour control layer: tick it unless the design says otherwise.`)
  }

  if (totalAreaM2 > 0) warnings.push('Internal wall insulation changes how the wall holds moisture: have the condensation risk assessed and the wall checked for damp first. The room gets smaller by the thickness shown for each wall.')
  const labourerHours = fixerHours > 0 ? hoursOf(fixerHours * LABOURER_SHARE) : 0
  if (labourerHours > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Carry the boards and clear up', hours: labourerHours, basis: `${Math.round(LABOURER_SHARE * 100)}% of ${n1(fixerHours)} h of fixing` })
  return { lines, labour, walls: summaries, totalAreaM2: money(totalAreaM2), warnings }
}
