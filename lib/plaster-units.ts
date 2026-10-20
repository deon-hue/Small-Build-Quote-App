// Internal plastering and boarding priced room by room: what each wall and ceiling gets (a skim coat over sound board or old plaster, two-coat wet plaster to masonry, plasterboard dot-and-dabbed to
// masonry and skimmed, plasterboard fixed to studs or joists and skimmed, or board taped and jointed only), with the beads, coving and access hatches. Each room is sized (length, width, height,
// doors and windows) and the areas follow; the board, plaster, adhesive and sundries come from the area and the sample coverage of each product; the plasterer's time from the areas, lengths and
// numbers times a rate of hours per unit, with a labourer to carry the board and mix. Vaulted ceilings are NOT here: they have their own tasks in the Plastering & Boarding phase. Partitions
// themselves (the studs and the board either side) are priced in Internal Walls; this prices the surfaces of a room, whatever they are on.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no cross-file runtime imports), so it can be
// hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer.

export type WallSystem = 'none' | 'skim' | 'two-coat' | 'dot-dab' | 'board-stud' | 'tape-joint'
export type CeilingSystem = 'none' | 'board-skim' | 'skim' | 'overboard' | 'tape-joint'
/** What a skim goes onto: new plasterboard (needs no bonding), or an existing painted or old plaster surface (needs a bonding coat first) */
export type SkimBase = 'new-board' | 'existing'

export const WALL_SYSTEM_LABEL: Record<WallSystem, string> = {
  none: 'Nothing (not plastered)',
  skim: 'Skim coat over existing board or plaster',
  'two-coat': 'Two-coat wet plaster to masonry',
  'dot-dab': 'Plasterboard dot-and-dabbed to masonry, then skimmed',
  'board-stud': 'Plasterboard fixed to studs or battens, then skimmed',
  'tape-joint': 'Plasterboard taped and jointed only (to be painted)',
}
export const CEILING_SYSTEM_LABEL: Record<CeilingSystem, string> = {
  none: 'Nothing (not plastered)',
  'board-skim': 'Plasterboard fixed to the joists, then skimmed',
  skim: 'Skim coat over existing board or plaster',
  overboard: 'New plasterboard over the old ceiling, then skimmed',
  'tape-joint': 'Plasterboard to the joists, taped and jointed only',
}
export const BASE_LABEL: Record<SkimBase, string> = { 'new-board': 'New plasterboard', existing: 'Existing painted or old plaster (bonding coat first)' }

/** What an average door and window take out of a wall, m² */
export const DOOR_OPENING_M2 = 1.9
export const WINDOW_OPENING_M2 = 1.4
/** Metres of bead round each window's reveals by default (two sides, head and sill) */
export const WINDOW_BEAD_LM = 4.8

export interface PlasterSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_PLASTER_SITUATIONS: PlasterSituation[] = [
  { id: 'empty', label: 'Empty rooms (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (furniture to move and protect)', upliftPct: 15 },
  { id: 'hard', label: 'Hard to reach (high ceilings, stairwell)', upliftPct: 25 },
]

export interface PlasterRoomKind { id: string; label: string; lengthM: number; widthM: number; heightM: number; doors: number; windows: number }
export const PLASTER_ROOM_KINDS: PlasterRoomKind[] = [
  { id: 'living', label: 'Living room', lengthM: 5, widthM: 4, heightM: 2.5, doors: 1, windows: 2 },
  { id: 'kitchen', label: 'Kitchen', lengthM: 4, widthM: 3.5, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'dining', label: 'Dining room', lengthM: 4, widthM: 3.5, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'bedroom', label: 'Bedroom', lengthM: 4, widthM: 3.5, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'bathroom', label: 'Bathroom', lengthM: 2.5, widthM: 2, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'hall', label: 'Hall / landing / stairs', lengthM: 4, widthM: 1.5, heightM: 2.5, doors: 4, windows: 0 },
  { id: 'study', label: 'Study', lengthM: 3, widthM: 3, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'other', label: 'Other room', lengthM: 4, widthM: 3, heightM: 2.5, doors: 1, windows: 1 },
]
export const PLASTER_ROOM_KIND_BY_ID: Record<string, PlasterRoomKind> = Object.fromEntries(PLASTER_ROOM_KINDS.map(k => [k.id, k]))

export interface PlasterRoom {
  id: string
  name: string
  kindId: string
  lengthM: number
  widthM: number
  heightM: number
  doors: number
  windows: number
  /** null = worked out from the room (the perimeter and height, less the doors and windows) */
  wallAreaOverrideM2: number | null
  /** null = the floor area */
  ceilingAreaOverrideM2: number | null
  /** null = the job's situation */
  situationId: string | null
  protect: boolean
  walls: { system: WallSystem; base: SkimBase }
  ceiling: { system: CeilingSystem; base: SkimBase }
  /** metres of angle and stop bead; null = worked out from the windows */
  beadsLm: number | null
  /** plaster or gypsum coving where the walls meet the ceiling, m */
  covingLm: number
  /** access hatches framed and boarded into the ceiling, nr */
  hatches: number
}

/** What a new room starts as: dot-and-dab and skim to the walls, board and skim to the ceiling (a new or opened-up room), no extras until they are wanted. */
export function newPlasterRoom(id: string, name: string, kindId: string): PlasterRoom {
  const k = PLASTER_ROOM_KIND_BY_ID[kindId] ?? PLASTER_ROOM_KIND_BY_ID.other
  return {
    id, name, kindId, lengthM: k.lengthM, widthM: k.widthM, heightM: k.heightM, doors: k.doors, windows: k.windows,
    wallAreaOverrideM2: null, ceilingAreaOverrideM2: null, situationId: null, protect: true,
    walls: { system: 'dot-dab', base: 'new-board' },
    ceiling: { system: 'board-skim', base: 'new-board' },
    beadsLm: null, covingLm: 0, hatches: 0,
  }
}

// ── Sample material rates (£, ex VAT) and coverage ──────────────────────────────────────────────────────────────────────────────────────────────
export const MATERIAL_RATES = {
  board: 8.5,           // £ per 2400 x 1200 sheet of 12.5mm plasterboard
  skimBag: 9.5,         // £ per 25kg bag of multi-finish
  bondingBag: 8.5,      // £ per 25kg bag of bonding coat
  adhesiveBag: 11,      // £ per 25kg bag of board adhesive (dabs)
  fixings: 0.12,        // £/m² screws, plugs and fixings (board to studs or joists 0.15, dabbed 0.10)
  tape: 0.12,           // £/m² of board: scrim or jointing tape
  jointFill: 0.4,       // £/m² of board: jointing compound and finishing
  pva: 3.0,             // £/L bonding agent (PVA or SBR)
  bead: 1.8,            // £/lm angle or stop bead
  coving: 5.5,          // £/lm coving, with its adhesive
  hatch: 35,            // £ each: access hatch frame and board
  sundries: 0.15,       // £/m² plastered: buckets, water, polythene, sandpaper
  protectBase: 5,       // £ per room: dust sheets, tape
  protectPerM2: 0.4,    // £ per m² of floor
  towerWeek: 90,        // £/week access tower
} as const

export const BOARD_SHEET_M2 = 2.88
export const BOARD_WASTE = 1.1       // cutting waste on board
export const PLASTER_WASTE = 1.05    // waste on bagged plaster
/** m² covered by one 25kg bag */
export const COVERAGE = { skim: 10, bonding: 3, adhesive: 4.5 } as const
/** m² per litre of diluted bonding agent */
export const PVA_M2_PER_L = 8

// ── Rough hours per unit, one plasterer ─────────────────────────────────────────────────────────────────────────────────────────────────────────
export const HOURS = {
  protectRoom: 0.4, protectPerM2Floor: 0.015,
  skimWallM2: 0.2, skimCeilingM2: 0.26,
  twoCoatWallM2: 0.36,
  dotDabWallM2: 0.16, boardStudWallM2: 0.14,
  boardCeilingM2: 0.22, overboardCeilingM2: 0.26,
  tapeJointWallM2: 0.12, tapeJointCeilingM2: 0.16,
  pvaM2: 0.02,
  beadLm: 0.08, covingLm: 0.25, hatchEach: 1.5,
} as const
/** The labourer carries the board, mixes and clears up: this share of the plasterer's hours */
export const LABOURER_SHARE = 0.2

export interface PlasterInput {
  rooms: PlasterRoom[]
  jobSituationId: string
  situations: PlasterSituation[]
  /** unit rates in use, keyed by the MATERIAL_RATES names; missing = the sample rate */
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
  /** weeks of access tower hire for the job (optional, off by default) */
  towerWeeks: number
}

export interface PlasterLine { id: string; name: string; category: 'materials' | 'plant'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface PlasterLabourTask { key: string; roomId: string; trade: 'plasterer' | 'labourer'; task: string; hours: number; basis: string }
export interface PlasterRoomSummary {
  roomId: string; name: string; floorM2: number; wallM2: number; ceilingM2: number; boardM2: number; uplift: number
  /** plain phrases for the description: "dot-and-dab plasterboard and skim to 38m² of walls" */
  parts: string[]
}
export interface PlasterResult { lines: PlasterLine[]; labour: PlasterLabourTask[]; rooms: PlasterRoomSummary[]; totalWallM2: number; totalCeilingM2: number; totalBoardM2: number; totalPlasterHours: number; warnings: string[] }

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const nonNeg = (v: number, what: string) => { if (!(v >= 0)) throw new Error(`${what} cannot be negative.`) }

export function roomAreas(room: PlasterRoom) {
  const perimeter = 2 * (room.lengthM + room.widthM)
  const floorM2 = room.lengthM * room.widthM
  const gross = perimeter * room.heightM
  const wallM2 = room.wallAreaOverrideM2 ?? Math.max(0, gross - room.doors * DOOR_OPENING_M2 - room.windows * WINDOW_OPENING_M2)
  const ceilingM2 = room.ceilingAreaOverrideM2 ?? floorM2
  return { perimeter, floorM2, wallM2, ceilingM2 }
}

export function calculatePlaster(input: PlasterInput): PlasterResult {
  const job = input.situations.find(s => s.id === input.jobSituationId)
  if (!job) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  nonNeg(input.towerWeeks, 'The weeks of access tower')
  const rate = <K extends keyof typeof MATERIAL_RATES>(k: K): number => {
    const v = input.rates[k] ?? MATERIAL_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }

  const lines: PlasterLine[] = []
  const labour: PlasterLabourTask[] = []
  const summaries: PlasterRoomSummary[] = []
  const warnings: string[] = []
  let totalWallM2 = 0, totalCeilingM2 = 0, totalBoardM2 = 0, totalPlasterHours = 0

  for (const room of input.rooms) {
    const rn = room.name.trim() || 'Room'
    for (const [v, w] of [[room.lengthM, 'length'], [room.widthM, 'width'], [room.heightM, 'height'], [room.doors, 'number of doors'], [room.windows, 'number of windows'], [room.covingLm, 'coving'], [room.hatches, 'number of hatches']] as [number, string][]) nonNeg(v, `The ${w} of ${rn}`)
    for (const o of [room.wallAreaOverrideM2, room.ceilingAreaOverrideM2, room.beadsLm]) if (o !== null && !(o >= 0)) throw new Error(`An area or length in ${rn} cannot be negative.`)
    const sit = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${rn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const { floorM2, wallM2, ceilingM2 } = roomAreas(room)
    const wSys = room.walls.system, cSys = room.ceiling.system
    const wallsOn = wSys !== 'none' && wallM2 > 0
    const ceilOn = cSys !== 'none' && ceilingM2 > 0
    if (room.heightM > 3.5 && input.towerWeeks <= 0 && (wallsOn || ceilOn)) warnings.push(`${rn} is ${n1(room.heightM)}m high: you may need an access tower (add weeks under Access).`)

    const parts: string[] = []
    const add = (key: string, name: string, category: 'materials' | 'plant', unit: string, unitCost: number, qty: number) => {
      if (qty > 0 && unitCost >= 0) lines.push({ id: `${key}|${room.id}`, name: `${rn} — ${name}`, category, unit, unitCost: money(unitCost), qty: +qty.toFixed(3), roomId: room.id })
    }
    const task = (key: string, what: string, parts2: { qty: number; unit: string; what: string; rate: number }[]) => {
      const used = parts2.filter(p => p.qty > 0 && p.rate > 0)
      if (used.length === 0) return
      const hours = hoursOf(used.reduce((s, p) => s + p.qty * p.rate, 0) * uplift)
      if (hours === 0) return
      totalPlasterHours += hours
      labour.push({ key: `${key}|${room.id}`, roomId: room.id, trade: 'plasterer', task: `${rn} — ${what}`, hours,
        basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${+p.rate.toFixed(3)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    }

    // ── Protection ───────────────────────────────────────────────────────────────
    if ((wallsOn || ceilOn) && room.protect) {
      add('protect', 'dust sheets and masking tape', 'materials', 'item', rate('protectBase') + rate('protectPerM2') * floorM2, 1)
      task('protect', 'protect floors and fittings', [{ qty: 1, unit: 'room', what: '', rate: HOURS.protectRoom }, { qty: floorM2, unit: 'm²', what: 'floor', rate: HOURS.protectPerM2Floor }])
    }

    let boardM2 = 0, skimM2 = 0, bondingM2 = 0, dabM2 = 0, pvaM2 = 0, studFixM2 = 0, tapeM2 = 0, jointM2 = 0
    const wallParts: { qty: number; unit: string; what: string; rate: number }[] = []
    const ceilParts: { qty: number; unit: string; what: string; rate: number }[] = []

    // ── Walls ────────────────────────────────────────────────────────────────────
    if (wallsOn) {
      const A = wallM2
      switch (wSys) {
        case 'skim':
          skimM2 += A; wallParts.push({ qty: A, unit: 'm²', what: 'wall skim', rate: HOURS.skimWallM2 })
          if (room.walls.base === 'existing') { pvaM2 += A; wallParts.push({ qty: A, unit: 'm²', what: 'bonding coat', rate: HOURS.pvaM2 }) }
          parts.push(`a skim coat over the existing walls, ${n1(A)}m²`)
          break
        case 'two-coat':
          bondingM2 += A; skimM2 += A; wallParts.push({ qty: A, unit: 'm²', what: 'bonding and finish coats', rate: HOURS.twoCoatWallM2 })
          parts.push(`two-coat plaster to the masonry walls, ${n1(A)}m²`)
          break
        case 'dot-dab':
          boardM2 += A; dabM2 += A; skimM2 += A; tapeM2 += A
          wallParts.push({ qty: A, unit: 'm²', what: 'board dabbed to the wall', rate: HOURS.dotDabWallM2 }, { qty: A, unit: 'm²', what: 'wall skim', rate: HOURS.skimWallM2 })
          parts.push(`plasterboard dot-and-dabbed to the walls and skimmed, ${n1(A)}m²`)
          break
        case 'board-stud':
          boardM2 += A; studFixM2 += A; skimM2 += A; tapeM2 += A
          wallParts.push({ qty: A, unit: 'm²', what: 'board fixed to the frame', rate: HOURS.boardStudWallM2 }, { qty: A, unit: 'm²', what: 'wall skim', rate: HOURS.skimWallM2 })
          parts.push(`plasterboard fixed to the frame and skimmed, ${n1(A)}m² of walls`)
          break
        case 'tape-joint':
          boardM2 += A; studFixM2 += A; tapeM2 += A; jointM2 += A
          wallParts.push({ qty: A, unit: 'm²', what: 'board fixed to the frame', rate: HOURS.boardStudWallM2 }, { qty: A, unit: 'm²', what: 'taped and jointed', rate: HOURS.tapeJointWallM2 })
          parts.push(`plasterboard to the frame taped and jointed, ${n1(A)}m² of walls`)
          break
      }
      totalWallM2 += A
    }

    // ── Ceiling ──────────────────────────────────────────────────────────────────
    if (ceilOn) {
      const A = ceilingM2
      switch (cSys) {
        case 'board-skim':
          boardM2 += A; studFixM2 += A; skimM2 += A; tapeM2 += A
          ceilParts.push({ qty: A, unit: 'm²', what: 'board fixed to the joists', rate: HOURS.boardCeilingM2 }, { qty: A, unit: 'm²', what: 'ceiling skim', rate: HOURS.skimCeilingM2 })
          parts.push(`plasterboard fixed to the joists and skimmed, ${n1(A)}m² of ceiling`)
          break
        case 'skim':
          skimM2 += A; ceilParts.push({ qty: A, unit: 'm²', what: 'ceiling skim', rate: HOURS.skimCeilingM2 })
          if (room.ceiling.base === 'existing') { pvaM2 += A; ceilParts.push({ qty: A, unit: 'm²', what: 'bonding coat', rate: HOURS.pvaM2 }) }
          parts.push(`a skim coat over the existing ceiling, ${n1(A)}m²`)
          break
        case 'overboard':
          boardM2 += A; studFixM2 += A; skimM2 += A; tapeM2 += A
          ceilParts.push({ qty: A, unit: 'm²', what: 'new board over the old ceiling', rate: HOURS.overboardCeilingM2 }, { qty: A, unit: 'm²', what: 'ceiling skim', rate: HOURS.skimCeilingM2 })
          parts.push(`new plasterboard over the old ceiling and skimmed, ${n1(A)}m² of ceiling`)
          break
        case 'tape-joint':
          boardM2 += A; studFixM2 += A; tapeM2 += A; jointM2 += A
          ceilParts.push({ qty: A, unit: 'm²', what: 'board fixed to the joists', rate: HOURS.boardCeilingM2 }, { qty: A, unit: 'm²', what: 'taped and jointed', rate: HOURS.tapeJointCeilingM2 })
          parts.push(`plasterboard to the joists taped and jointed, ${n1(A)}m² of ceiling`)
          break
      }
      totalCeilingM2 += A
    }

    // ── Materials ────────────────────────────────────────────────────────────────
    add('board', '12.5mm plasterboard (with cutting waste)', 'materials', 'm²', rate('board') / BOARD_SHEET_M2, boardM2 * BOARD_WASTE)
    add('adhesive', 'board adhesive (dabs)', 'materials', 'bag', rate('adhesiveBag'), (dabM2 / COVERAGE.adhesive) * PLASTER_WASTE)
    add('bonding', 'bonding coat plaster', 'materials', 'bag', rate('bondingBag'), (bondingM2 / COVERAGE.bonding) * PLASTER_WASTE)
    add('skim', 'multi-finish plaster', 'materials', 'bag', rate('skimBag'), (skimM2 / COVERAGE.skim) * PLASTER_WASTE)
    add('pva', 'bonding agent (PVA / SBR)', 'materials', 'L', rate('pva'), pvaM2 / PVA_M2_PER_L)
    // board fixed to a frame or joists takes more screws than board dabbed to masonry (which takes a few plugs)
    add('fixings', 'screws, plugs and fixings', 'materials', 'm²', boardM2 > 0 ? rate('fixings') * (studFixM2 * 1.25 + dabM2 * 0.85) / boardM2 : 0, boardM2)
    add('tape', 'scrim or jointing tape', 'materials', 'm²', rate('tape'), tapeM2)
    add('joint', 'jointing compound and finishing', 'materials', 'm²', rate('jointFill'), jointM2)
    const plasteredM2 = (wallsOn && wSys !== 'tape-joint' ? wallM2 : 0) + (ceilOn && cSys !== 'tape-joint' ? ceilingM2 : 0)
    add('sundries', 'buckets, water, polythene and sundries', 'materials', 'item', rate('sundries') * plasteredM2, plasteredM2 > 0 ? 1 : 0)
    totalBoardM2 += boardM2

    // ── Beads, coving and hatches ────────────────────────────────────────────────
    const beadsLm = wallsOn ? (room.beadsLm ?? room.windows * WINDOW_BEAD_LM) : 0
    add('bead', 'angle and stop beads', 'materials', 'lm', rate('bead'), beadsLm)
    add('coving', 'coving and adhesive', 'materials', 'lm', rate('coving'), room.covingLm)
    add('hatch', 'access hatch frame and board', 'materials', 'nr', rate('hatch'), room.hatches)
    if (beadsLm > 0) parts.push(`${n1(beadsLm)}m of beads`)
    if (room.covingLm > 0) parts.push(`${n1(room.covingLm)}m of coving`)
    if (room.hatches > 0) parts.push(`${room.hatches} access hatch${room.hatches === 1 ? '' : 'es'}`)

    // ── Labour ───────────────────────────────────────────────────────────────────
    task('walls', 'plaster and board the walls', wallParts)
    task('ceiling', 'plaster and board the ceiling', ceilParts)
    task('finish', 'beads, coving and hatches', [
      { qty: beadsLm, unit: 'lm', what: 'beads', rate: HOURS.beadLm }, { qty: room.covingLm, unit: 'lm', what: 'coving', rate: HOURS.covingLm }, { qty: room.hatches, unit: 'nr', what: 'hatches', rate: HOURS.hatchEach },
    ])

    summaries.push({ roomId: room.id, name: rn, floorM2: money(floorM2), wallM2: money(wallsOn ? wallM2 : 0), ceilingM2: money(ceilOn ? ceilingM2 : 0), boardM2: money(boardM2), uplift: sit.upliftPct, parts })
    if (parts.length === 0) warnings.push(`${rn} has nothing switched on to plaster or board.`)
  }

  if (input.towerWeeks > 0) lines.push({ id: 'tower', name: 'Access tower hire', category: 'plant', unit: 'week', unitCost: money(rate('towerWeek')), qty: input.towerWeeks })
  // the labourer carries the board, mixes and clears up for the plasterer: a share of the plasterer's hours, as a line of its own
  const labourerHours = totalPlasterHours > 0 ? hoursOf(totalPlasterHours * LABOURER_SHARE) : 0
  if (labourerHours > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Carry board, mix and clear up for the plasterer', hours: labourerHours, basis: `${Math.round(LABOURER_SHARE * 100)}% of ${n1(totalPlasterHours)} h of plastering` })
  return { lines, labour, rooms: summaries, totalWallM2: money(totalWallM2), totalCeilingM2: money(totalCeilingM2), totalBoardM2: money(totalBoardM2), totalPlasterHours: money(totalPlasterHours), warnings }
}
