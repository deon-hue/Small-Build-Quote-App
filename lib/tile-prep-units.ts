// Tiling preparation priced room by room: what the floor, the wet walls and the ceiling of each room need before a tile goes on. The floor can be primed, levelled with a self-levelling compound to a depth, and covered with
// tile backer board (over a timber floor) or a decoupling mat (over a screed that may move or crack), with the waterproofing (tanking) of a wet floor. Each wall area (a shower, a bath surround, a splashback) can have
// tile backer board, stud-fixed or bonded to masonry, and waterproofing: a liquid-applied membrane or a sheet membrane, with its tape to the corners and its collars and cuffs round the pipes and the waste. The ceiling
// can be boarded in moisture-resistant plasterboard (taped and jointed to be painted) or in tile backer board where it is to be tiled. The boards, compounds, membranes and fixings come from the areas and the sample coverage
// of each product; the tiler's time from the areas times a rate of hours per m² (the dryliner's for the ceiling board), with a labourer to carry the board and mix. The tiling itself is priced in Floor Tiling and Wall Tiling.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. The engine imports only the shared tiling module, so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer.

import {
  zoneAreaM2, roomFootprint, money, hoursOf, n1, nonNeg,
  type RoomShapeExtras, type TilingSituation, type TilingZone, type TilingLabourTask, type TilingLine, type TilingRoomSummary,
} from './tiling-common'

export type BackerId = 'foam-6' | 'foam-10' | 'cement-12'
export interface BackerBoard { id: BackerId; label: string; /** £ a sheet, sample */ sheetPrice: number; /** m² a sheet (1200 x 600) */ sheetM2: number; /** tiler's hours per m² to fix and seal the joints */ hoursM2: number }
export const BACKER_BOARDS: BackerBoard[] = [
  { id: 'foam-6', label: 'Foam-core backer board 6mm (1200 x 600)', sheetPrice: 21, sheetM2: 0.72, hoursM2: 0.34 },
  { id: 'foam-10', label: 'Foam-core backer board 10mm (1200 x 600)', sheetPrice: 25, sheetM2: 0.72, hoursM2: 0.34 },
  { id: 'cement-12', label: 'Cement board 12.5mm (1200 x 600)', sheetPrice: 19.5, sheetM2: 0.72, hoursM2: 0.46 },
]
export const BACKER_BY_ID: Record<string, BackerBoard> = Object.fromEntries(BACKER_BOARDS.map(b => [b.id, b]))

export type WallBase = 'studs' | 'masonry'
export const WALL_BASE_LABEL: Record<WallBase, string> = { studs: 'Timber or metal studs', masonry: 'Masonry, bonded and plugged' }
export type TankSystem = 'liquid' | 'sheet'
export const TANK_LABEL: Record<TankSystem, string> = { liquid: 'Liquid-applied membrane (two coats)', sheet: 'Sheet membrane bonded in adhesive' }
export type FloorCover = 'none' | 'backer' | 'decoupling'
export const FLOOR_COVER_LABEL: Record<FloorCover, string> = { none: 'Nothing', backer: 'Tile backer board (over a timber floor)', decoupling: 'Decoupling (uncoupling) membrane (over a floor that may move or crack)' }
/** What the floor under the board or membrane is: the membrane and its fixing do not change, but chipboard has its own warning (it swells and moves when it gets damp) */
export type FloorBase = 'screed' | 'timber' | 'chipboard'
export const FLOOR_BASE_LABEL: Record<FloorBase, string> = { screed: 'Screed or concrete', timber: 'Plywood, OSB or boarded timber floor', chipboard: 'Chipboard flooring' }
/** The decoupling membrane: a plain one for an unheated floor (or one with warm-water pipes in the screed), or a studded one with channels that take electric heating cable */
export type Membrane = 'plain' | 'heating'
export const MEMBRANE_LABEL: Record<Membrane, string> = { plain: 'Plain uncoupling membrane (unheated floor, or warm-water pipes in the screed)', heating: 'Electric-heating membrane (studded, takes the heating cable)' }
export type CeilingKind = 'none' | 'mr-board' | 'backer'
export const CEILING_LABEL: Record<CeilingKind, string> = { none: 'Nothing', 'mr-board': 'Moisture-resistant plasterboard, taped and jointed', backer: 'Tile backer board (ceiling to be tiled)' }

/** One wall area to prepare, with what it gets */
export interface PrepZone extends TilingZone {
  base: WallBase
  boardId: BackerId | 'none'
  tanked: boolean
}

export interface TilePrepRoom extends RoomShapeExtras {
  id: string
  name: string
  kindId: string
  lengthM: number
  widthM: number
  heightM: number
  zones: PrepZone[]
  /** null = length x width */
  floorAreaOverrideM2: number | null
  floor: {
    primer: boolean
    /** depth of self-levelling compound, mm; 0 = none (a primer goes on anyway) */
    levelMm: number
    cover: FloorCover
    coverBoardId: BackerId
    tanked: boolean
    /** the floor underneath (screed when not given) and, for a decoupling membrane, which kind (plain when not given) */
    base?: FloorBase
    membrane?: Membrane
  }
  tankSystem: TankSystem
  /** metres of waterproof tape to corners and junctions; null = worked out from the areas */
  tapeLm: number | null
  /** pipe collars, shower-mixer seals and the like the membrane is sealed round, nr */
  collars: number
  /** floor waste and drain cuffs, nr */
  cuffs: number
  ceiling: { kind: CeilingKind; areaOverrideM2: number | null; boardId: BackerId }
  situationId: string | null
  protect: boolean
  /** the drawn area and perimeter (from Take-off) this room was last sized from: it follows them until they change */
  fromPlan?: { areaM2: number; perimeterM: number; /** the name the room was given from the plan: it follows the plan's room name while still that */ name?: string }
  /** the room on the Take-off plan this one was made from, and what the plan said when it was last fed (it follows the plan until the plan's room changes) */
  planRoomId?: string
  planRoomSig?: string
}

export function newTilePrepRoom(id: string, name: string, kindId: string, k: { lengthM: number; widthM: number; heightM: number; collars: number }, zones: PrepZone[]): TilePrepRoom {
  return {
    id, name, kindId, lengthM: k.lengthM, widthM: k.widthM, heightM: k.heightM, zones, floorAreaOverrideM2: null,
    floor: { primer: true, levelMm: 0, cover: 'none', coverBoardId: 'cement-12', tanked: false },
    tankSystem: 'liquid', tapeLm: null, collars: k.collars, cuffs: 0,
    ceiling: { kind: 'none', areaOverrideM2: null, boardId: 'foam-10' },
    situationId: null, protect: true,
  }
}
/** A wall area to prepare: boarded and waterproofed when it is a shower, bath or wet room wall; boarded only otherwise */
export function newPrepZone(z: TilingZone): PrepZone {
  const wet = /shower|bath|wet/i.test(z.label)
  return { ...z, base: 'studs', boardId: wet ? 'foam-10' : 'none', tanked: wet }
}

export const MATERIAL_RATES = {
  primerL: 4.8,              // £/L acrylic or epoxy tile primer
  levelBag: 18.5,            // £ per 20kg bag of self-levelling compound
  edgeStrip: 0.65,           // £/lm perimeter foam strip for a levelled floor
  decoupling: 11.5,          // £/m² plain uncoupling membrane
  heatingMembrane: 29,       // £/m² studded membrane with channels for electric heating cable
  adhesiveBag: 24,           // £ per 20kg bag of flexible adhesive (bonding board and mats)
  screws: 0.55,              // £/m² screws and washers for backer board to studs or joists
  plugs: 0.3,                // £/m² plugs for backer board bonded to masonry
  jointTape: 0.55,           // £/lm board joint tape and sealant
  tankLiquidKg: 6.5,         // £/kg liquid waterproofing membrane
  tankSheetM2: 14.5,         // £/m² sheet membrane
  tankTape: 2.2,             // £/lm waterproof tape to corners and junctions
  collar: 4.5,               // £ each: pre-formed collar or seal round a pipe or mixer
  cuff: 9,                   // £ each: floor waste or drain cuff
  mrBoardSheet: 11.5,        // £ per 2400 x 1200 sheet of moisture-resistant plasterboard
  ceilingScrews: 0.15,       // £/m² screws
  ceilingTape: 0.12,         // £/m² jointing tape
  ceilingFill: 0.4,          // £/m² jointing compound
  protectBase: 4,            // £ per room
  protectM2: 0.3,            // £ per m² of floor
} as const
export const COVERAGE = { levelKgM2PerMm: 1.7, bagKg: 20, primerM2L: 8, adhesiveKgM2Board: 3.5, adhesiveKgM2Mat: 3.0, tankLiquidKgM2: 1.4, boardWaste: 1.1, mrSheetM2: 2.88 } as const
/** The height the waterproofing is turned up the wall from the floor (the upstand), m */
export const UPSTAND_M = 0.15

export const HOURS = {
  protectRoom: 0.25, protectM2: 0.01,
  cleanM2: 0.03,                       // sweep, vacuum, scrape and wipe a floor ready
  primerM2: 0.03, levelM2: 0.12, levelPerMmM2: 0.004, edgeLm: 0.04,
  decouplingM2: 0.32,
  heatingMembraneM2: 0.42,             // the studded membrane takes longer to lay and bond (the cable itself is laid in Electric Underfloor Heating)
  tankLiquidM2: 0.28, tankSheetM2: 0.36, tapeLm: 0.08, collarEach: 0.25, cuffEach: 0.4,
  ceilingBoardM2: 0.24, ceilingTapeM2: 0.16,
} as const
export const TILER_LABOURER_SHARE = 0.15

export interface TilePrepInput {
  rooms: TilePrepRoom[]
  jobSituationId: string
  situations: TilingSituation[]
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
}
export interface TilePrepResult { lines: TilingLine[]; labour: TilingLabourTask[]; rooms: TilingRoomSummary[]; totalFloorM2: number; totalWallM2: number; totalTankedM2: number; totalCeilingM2: number; totalTilerHours: number; warnings: string[] }

export const floorAreaM2 = (r: TilePrepRoom) => r.floorAreaOverrideM2 ?? roomFootprint(r).areaM2
export const ceilingAreaM2 = (r: TilePrepRoom) => r.ceiling.areaOverrideM2 ?? floorAreaM2(r)
/** The metres of waterproof tape: the corners up each tanked wall area, the joint where it meets the floor, and the floor's own perimeter when the floor is tanked */
export function autoTapeLm(r: TilePrepRoom): number {
  const walls = r.zones.filter(z => z.tanked && zoneAreaM2(z) > 0).reduce((s, z) => s + z.lengthM + 2 * z.heightM, 0)
  const floor = r.floor.tanked ? roomFootprint(r).perimeterM : 0
  return walls + floor
}

export function calculateTilePrep(input: TilePrepInput): TilePrepResult {
  if (!input.situations.find(s => s.id === input.jobSituationId)) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  const rate = <K extends keyof typeof MATERIAL_RATES>(k: K): number => {
    const v = input.rates[k] ?? MATERIAL_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const lines: TilingLine[] = []
  const labour: TilingLabourTask[] = []
  const summaries: TilingRoomSummary[] = []
  const warnings: string[] = []
  let totalFloorM2 = 0, totalWallM2 = 0, totalTankedM2 = 0, totalCeilingM2 = 0, totalTilerHours = 0, totalCeilingHours = 0

  for (const room of input.rooms) {
    const rn = room.name.trim() || 'Room'
    for (const [v, w] of [[room.lengthM, 'length'], [room.widthM, 'width'], [room.heightM, 'height'], [room.collars, 'number of collars'], [room.cuffs, 'number of waste cuffs'], [room.floor.levelMm, 'levelling depth']] as [number, string][]) nonNeg(v, `The ${w} of ${rn}`)
    for (const o of [room.floorAreaOverrideM2, room.tapeLm, room.ceiling.areaOverrideM2]) if (o !== null && !(o >= 0)) throw new Error(`An area or length in ${rn} cannot be negative.`)
    for (const z of room.zones) for (const [v, w] of [[z.lengthM, 'length'], [z.heightM, 'height'], [z.deductM2, 'deduction']] as [number, string][]) nonNeg(v, `The ${w} of "${z.label || 'a wall area'}" in ${rn}`)
    const sit = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${rn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const fp = roomFootprint(room)
    if (fp.error) throw new Error(`${rn}: ${fp.error}`)
    const floorM2 = floorAreaM2(room)
    const perimeter = room.floorAreaOverrideM2 === null ? fp.perimeterM : 4 * Math.sqrt(floorM2)
    const f = room.floor
    const levelling = f.levelMm > 0
    const primerOn = f.primer || levelling
    if (f.levelMm > 30) warnings.push(`${rn}: ${f.levelMm}mm of levelling compound is deep for one pour. Check the product's maximum or build the floor up another way.`)

    const parts: string[] = []
    const add = (key: string, name: string, unit: string, unitCost: number, qty: number) => {
      if (qty > 0 && unitCost >= 0) lines.push({ id: `${key}|${room.id}`, name: `${rn} — ${name}`, category: 'materials', unit, unitCost: money(unitCost), qty: +qty.toFixed(3), roomId: room.id })
    }
    const task = (trade: 'tiler' | 'plasterer', key: string, what: string, parts2: { qty: number; unit: string; what: string; rate: number }[]) => {
      const used = parts2.filter(p => p.qty > 0 && p.rate > 0)
      if (used.length === 0) return
      const hours = hoursOf(used.reduce((s, p) => s + p.qty * p.rate, 0) * uplift)
      if (hours === 0) return
      if (trade === 'tiler') totalTilerHours += hours; else totalCeilingHours += hours
      labour.push({ key: `${key}|${room.id}`, roomId: room.id, trade, task: `${rn} — ${what}`, hours,
        basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${+p.rate.toFixed(3)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    }
    /** a backer board with its fixings, joints and (bonded to masonry) adhesive: returns the board m² that was bought for */
    const board = (key: string, label: string, boardId: BackerId, areaM2: number, fixing: 'screws' | 'bonded') => {
      const b = BACKER_BY_ID[boardId] ?? BACKER_BOARDS[1]
      add(`${key}-board`, `${b.label.split(' (')[0].toLowerCase()} to ${label}`, 'sheet', b.sheetPrice, (areaM2 * COVERAGE.boardWaste) / b.sheetM2)
      if (fixing === 'screws') add(`${key}-fix`, `screws and washers (${label})`, 'm²', rate('screws'), areaM2)
      else { add(`${key}-fix`, `plugs (${label})`, 'm²', rate('plugs'), areaM2); add(`${key}-adh`, `adhesive to bond the board (${label})`, 'bag', rate('adhesiveBag'), (areaM2 * COVERAGE.adhesiveKgM2Board * 1.05) / COVERAGE.bagKg) }
      add(`${key}-joint`, `joint tape and sealant (${label})`, 'lm', rate('jointTape'), areaM2 * 2.0)
      return b
    }

    // ── Floor ────────────────────────────────────────────────────────────────────
    const floorWork = floorM2 > 0 && (primerOn || levelling || f.cover !== 'none' || f.tanked)
    if (floorWork) {
      task('tiler', 'floorclean', 'clean and make the floor ready', [{ qty: floorM2, unit: 'm²', what: 'floor', rate: HOURS.cleanM2 }])
      if (primerOn) {
        add('primer', 'tile primer to the floor', 'L', rate('primerL'), (floorM2 / COVERAGE.primerM2L))
        task('tiler', 'primer', 'prime the floor', [{ qty: floorM2, unit: 'm²', what: 'primer', rate: HOURS.primerM2 }])
        parts.push(`primer to ${n1(floorM2)}m² of floor`)
      }
      if (levelling) {
        add('level', `self-levelling compound at ${f.levelMm}mm`, 'bag', rate('levelBag'), (floorM2 * f.levelMm * COVERAGE.levelKgM2PerMm * 1.05) / COVERAGE.bagKg)
        add('edge', 'perimeter edge strip', 'lm', rate('edgeStrip'), perimeter)
        task('tiler', 'level', 'level the floor', [{ qty: floorM2, unit: 'm²', what: 'levelling', rate: HOURS.levelM2 + f.levelMm * HOURS.levelPerMmM2 }, { qty: perimeter, unit: 'lm', what: 'edge strip', rate: HOURS.edgeLm }])
        parts.push(`${f.levelMm}mm of self-levelling compound to ${n1(floorM2)}m² of floor`)
      }
      if (f.cover === 'backer') {
        const b = board('floor', 'the floor', f.coverBoardId, floorM2, 'screws')
        add('floor-boardadh', 'flexible adhesive under the floor board', 'bag', rate('adhesiveBag'), (floorM2 * COVERAGE.adhesiveKgM2Board * 1.05) / COVERAGE.bagKg)
        task('tiler', 'floorboard', 'fix the backer board to the floor', [{ qty: floorM2, unit: 'm²', what: 'floor board', rate: b.hoursM2 }])
        parts.push(`${b.label.split(' (')[0].toLowerCase()} fixed to ${n1(floorM2)}m² of floor`)
      } else if (f.cover === 'decoupling') {
        const heated = f.membrane === 'heating'
        const baseWord = f.base === 'chipboard' ? 'chipboard floor' : f.base === 'timber' ? 'timber floor' : 'screed floor'
        add('decoupling', heated ? 'electric-heating (studded) decoupling membrane' : 'decoupling membrane', 'm²', rate(heated ? 'heatingMembrane' : 'decoupling'), floorM2 * 1.05)
        add('decoupling-adh', 'flexible adhesive to bond the membrane', 'bag', rate('adhesiveBag'), (floorM2 * COVERAGE.adhesiveKgM2Mat * 1.05) / COVERAGE.bagKg)
        task('tiler', 'decoupling', heated ? 'lay the electric-heating membrane' : 'lay the decoupling membrane', [{ qty: floorM2, unit: 'm²', what: 'membrane', rate: heated ? HOURS.heatingMembraneM2 : HOURS.decouplingM2 }])
        parts.push(`${heated ? 'an electric-heating decoupling membrane' : 'a decoupling membrane'} bonded to ${n1(floorM2)}m² of ${baseWord}`)
        if (heated) warnings.push(`${rn}: the heating cable, its thermostat and the electrician are priced in Electric Underfloor Heating. Use loose cable there (not mats) for a cable-channel membrane, and leave out its insulation board: the membrane carries the cable.`)
      }
      if (f.base === 'chipboard' && f.cover === 'none') warnings.push(`${rn}: tiles should not go straight onto chipboard flooring, which swells and moves if it gets damp. Overboard it with plywood or backer board, or use a decoupling membrane the maker approves for chipboard.`)
      if (f.base === 'chipboard' && f.cover === 'decoupling') warnings.push(`${rn}: check the membrane maker allows it over chipboard flooring (it must be sound, dry and screwed down firmly) or overboard the chipboard with plywood first.`)
    }

    // ── Walls: backer board ──────────────────────────────────────────────────────
    let boardedWallM2 = 0, tankedWallM2 = 0
    for (const z of room.zones) {
      const A = zoneAreaM2(z)
      if (A <= 0) continue
      const label = (z.label.trim() || 'the wall').toLowerCase()
      if (z.boardId !== 'none') {
        const b = board(`wb-${z.id}`, label, z.boardId, A, z.base === 'studs' ? 'screws' : 'bonded')
        task('tiler', `wallboard-${z.id}`, `fix backer board to ${label}`, [{ qty: A, unit: 'm²', what: z.base === 'masonry' ? 'bonded board' : 'stud board', rate: b.hoursM2 * (z.base === 'masonry' ? 1.2 : 1) }])
        parts.push(`${b.label.split(' (')[0].toLowerCase()} to ${n1(A)}m² of ${label}${z.base === 'masonry' ? ' (bonded to the masonry)' : ''}`)
        boardedWallM2 += A
      }
      if (z.tanked) tankedWallM2 += A
    }

    // ── Waterproofing: walls and floor in one go ─────────────────────────────────
    const tankedFloorM2 = f.tanked && floorM2 > 0 ? floorM2 + perimeter * UPSTAND_M : 0
    const tankedM2 = tankedWallM2 + tankedFloorM2
    if (tankedM2 > 0) {
      const sheet = room.tankSystem === 'sheet'
      if (sheet) {
        add('tank', 'sheet waterproofing membrane', 'm²', rate('tankSheetM2'), tankedM2 * 1.1)
        add('tank-adh', 'flexible adhesive to bond the membrane', 'bag', rate('adhesiveBag'), (tankedM2 * COVERAGE.adhesiveKgM2Mat * 1.05) / COVERAGE.bagKg)
      } else add('tank', 'liquid waterproofing membrane (two coats)', 'kg', rate('tankLiquidKg'), tankedM2 * COVERAGE.tankLiquidKgM2 * 1.1)
      const tape = room.tapeLm ?? autoTapeLm({ ...room, zones: room.zones })
      add('tank-tape', 'waterproof tape to corners and junctions', 'lm', rate('tankTape'), tape)
      add('tank-collar', 'collars and seals round pipes and mixers', 'nr', rate('collar'), room.collars)
      add('tank-cuff', 'floor waste and drain cuffs', 'nr', rate('cuff'), room.cuffs)
      task('tiler', 'tank', 'waterproof (tank) the wet areas', [
        { qty: tankedM2, unit: 'm²', what: sheet ? 'sheet membrane' : 'two-coat membrane', rate: sheet ? HOURS.tankSheetM2 : HOURS.tankLiquidM2 },
        { qty: tape, unit: 'lm', what: 'tape', rate: HOURS.tapeLm }, { qty: room.collars, unit: 'nr', what: 'collars', rate: HOURS.collarEach }, { qty: room.cuffs, unit: 'nr', what: 'cuffs', rate: HOURS.cuffEach },
      ])
      parts.push(`${sheet ? 'sheet' : 'liquid'} waterproofing to ${n1(tankedM2)}m² (${[tankedWallM2 > 0 ? 'walls' : '', tankedFloorM2 > 0 ? 'floor with an upstand' : ''].filter(Boolean).join(' and ')})`)
    }

    // ── Ceiling ──────────────────────────────────────────────────────────────────
    const c = room.ceiling
    const ceilM2 = c.kind === 'none' ? 0 : ceilingAreaM2(room)
    if (ceilM2 > 0) {
      if (c.kind === 'mr-board') {
        add('ceil-board', 'moisture-resistant plasterboard 12.5mm', 'm²', rate('mrBoardSheet') / COVERAGE.mrSheetM2, ceilM2 * COVERAGE.boardWaste)
        add('ceil-screws', 'screws', 'm²', rate('ceilingScrews'), ceilM2)
        add('ceil-tape', 'jointing tape', 'm²', rate('ceilingTape'), ceilM2)
        add('ceil-fill', 'jointing compound and finishing', 'm²', rate('ceilingFill'), ceilM2)
        task('plasterer', 'ceiling', 'board the ceiling in moisture-resistant plasterboard', [{ qty: ceilM2, unit: 'm²', what: 'ceiling board', rate: HOURS.ceilingBoardM2 }, { qty: ceilM2, unit: 'm²', what: 'taped and jointed', rate: HOURS.ceilingTapeM2 }])
        parts.push(`moisture-resistant plasterboard to ${n1(ceilM2)}m² of ceiling, taped and jointed ready to paint`)
      } else {
        const b = board('ceil', 'the ceiling', c.boardId, ceilM2, 'screws')
        task('tiler', 'ceiling', 'fix backer board to the ceiling', [{ qty: ceilM2, unit: 'm²', what: 'ceiling board', rate: b.hoursM2 * 1.3 }])
        parts.push(`${b.label.split(' (')[0].toLowerCase()} to ${n1(ceilM2)}m² of ceiling, ready to tile`)
      }
      totalCeilingM2 += ceilM2
    }

    // ── Protection ───────────────────────────────────────────────────────────────
    if (room.protect && (floorWork || boardedWallM2 > 0 || tankedM2 > 0 || ceilM2 > 0)) {
      add('protect', 'dust sheets and masking tape', 'item', rate('protectBase') + rate('protectM2') * floorM2, 1)
      task('tiler', 'protect', 'protect the floors and fittings', [{ qty: 1, unit: 'room', what: '', rate: HOURS.protectRoom }, { qty: floorM2, unit: 'm²', what: 'floor', rate: HOURS.protectM2 }])
    }

    if (tankedWallM2 > 0 && boardedWallM2 < tankedWallM2 - 0.01) warnings.push(`${rn}: some tanked wall has no backer board. Waterproofing goes onto a sound, water-resistant base: plaster or standard board will not do.`)
    if (parts.length === 0) warnings.push(`${rn} has nothing switched on to prepare.`)
    totalFloorM2 += floorWork ? floorM2 : 0; totalWallM2 += boardedWallM2; totalTankedM2 += tankedM2
    summaries.push({ roomId: room.id, name: rn, areaM2: money(floorM2), uplift: sit.upliftPct, parts })
  }

  const labourerHours = totalTilerHours + totalCeilingHours > 0 ? hoursOf((totalTilerHours + totalCeilingHours) * TILER_LABOURER_SHARE) : 0
  if (labourerHours > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Carry board and compound, mix and clear up', hours: labourerHours, basis: `${Math.round(TILER_LABOURER_SHARE * 100)}% of ${n1(totalTilerHours + totalCeilingHours)} h of preparation` })
  return { lines, labour, rooms: summaries, totalFloorM2: money(totalFloorM2), totalWallM2: money(totalWallM2), totalTankedM2: money(totalTankedM2), totalCeilingM2: money(totalCeilingM2), totalTilerHours: money(totalTilerHours), warnings }
}
