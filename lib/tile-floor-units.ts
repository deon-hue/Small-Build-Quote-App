// Floor tiling priced room by room: each room is sized (length, width, less anything not tiled under a bath or units), and says what tile goes down (a size, a layout, our supply at an allowance or the client's own),
// how it is stuck and grouted, with the trims, tiled skirting and movement joints. The tile, adhesive and grout come from the area and the sample coverage of each product; the tiler's time from the area times a rate
// of hours per m² for that size of tile and layout, plus the cuts round the edge, the grouting, the skirting and the trims; a labourer carries and mixes. The base (screed, levelling, backer board, waterproofing, a decoupling
// mat) is priced in Tiling Preparation, and underfloor heating in Electric Underfloor Heating; this prices the tiling itself.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. The engine imports only the shared tiling module, so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer.

import {
  DEFAULT_TILING_SITUATIONS, TILE_SIZE_BY_ID, roomFootprint, TILE_LAYOUT_BY_ID, GROUT_KIND_BY_ID, FLAT_BASE_TILES, SAMPLE_SPECIAL, groutKgM2, money, hoursOf, n1, nonNeg,
  type TilingSituation, type TilingLabourTask, type TilingLine, type TilingRoomSummary, type TileSizeId, type TileLayoutId, type GroutId, type RoomShapeExtras,
} from './tiling-common'

export type FloorAdhesive = 'flexible' | 'standard'
export const FLOOR_ADHESIVE_LABEL: Record<FloorAdhesive, string> = { flexible: 'Flexible (S1) adhesive: timber floors, underfloor heating, large tiles', standard: 'Standard cement-based adhesive' }

export interface TileFloorRoom extends RoomShapeExtras {
  id: string
  name: string
  kindId: string
  lengthM: number
  widthM: number
  /** floor under a bath, units or anything fixed that is not tiled, m² */
  notTiledM2: number
  /** null = length x width less what is not tiled */
  areaOverrideM2: number | null
  doors: number
  tileId: TileSizeId
  layoutId: TileLayoutId
  /** true = the client supplies the tiles: we price fixing only */
  clientSupplies: boolean
  /** £ per m² allowed for the tile; null = the sample price for the size */
  tilePriceM2: number | null
  jointMm: number | null
  adhesive: FloorAdhesive
  groutId: GroutId
  /** edge trims and door thresholds, lm; null = a threshold in each doorway (0.9m each) */
  trimLm: number | null
  /** tiled skirting cut from the floor tile, lm */
  skirtingLm: number
  /** movement joints in the tiling (and their trim or sealant), lm */
  movementJointLm: number
  sealed: boolean
  /** null = the job's situation */
  situationId: string | null
  protect: boolean
  /** the drawn area and perimeter (from Take-off) this room was last sized from: it follows them until they change */
  fromPlan?: { areaM2: number; perimeterM: number; /** the name the room was given from the plan: it follows the plan's room name while still that */ name?: string }
  /** the room on the Take-off plan this one was made from, and what the plan said when it was last fed (it follows the plan until the plan's room changes) */
  planRoomId?: string
  planRoomSig?: string
}

export function newTileFloorRoom(id: string, name: string, kindId: string, k: { lengthM: number; widthM: number; doors: number; fixedM2: number }, start: { tileId: TileSizeId; layoutId: TileLayoutId }): TileFloorRoom {
  return {
    id, name, kindId, lengthM: k.lengthM, widthM: k.widthM, notTiledM2: k.fixedM2, areaOverrideM2: null, doors: k.doors,
    tileId: start.tileId, layoutId: start.layoutId, clientSupplies: false, tilePriceM2: null, jointMm: null,
    adhesive: 'flexible', groutId: 'cement', trimLm: null, skirtingLm: 0, movementJointLm: 0, sealed: false, situationId: null, protect: true,
  }
}

// ── Sample material rates (£, ex VAT) ────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const MATERIAL_RATES = {
  adhesiveBagFlexible: 24,   // £ per 20kg bag
  adhesiveBagStandard: 16,
  sealerL: 14,               // £/L penetrating sealer for natural stone and unglazed porcelain
  trimLm: 5.5,               // £/lm edge trim, threshold or movement-joint profile
  siliconeCartridge: 5.5,    // £ per cartridge, one per about 8 lm of joint
  sundriesM2: 0.4,           // £/m²: spacers, wedges, sponges, buckets, polythene
  protectBase: 6,            // £ per room: floor protection and masking tape
  protectM2: 0.5,            // £ per m² of floor protected
} as const
export const COVERAGE = { bagKg: 20, sealerM2L: 6, siliconeLm: 8 } as const
export const TILE_WASTE_MIN = 0.05
/** The metres of a doorway threshold */
export const THRESHOLD_LM = 0.9

// ── Rough hours per unit, one tiler ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const HOURS = {
  protectRoom: 0.3, protectM2: 0.01,
  cutLm: 0.12,        // cuts round the walls and doorways, per metre of cut edge
  groutM2: 0.14, sealM2: 0.04, skirtingLm: 0.35, trimLm: 0.12, jointLm: 0.15,
} as const
/** The labourer carries the tile and adhesive, mixes and clears up: this share of the tiler's hours */
export const LABOURER_SHARE = 0.15

export interface TileFloorInput {
  rooms: TileFloorRoom[]
  jobSituationId: string
  situations: TilingSituation[]
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
}
export interface TileFloorResult { lines: TilingLine[]; labour: TilingLabourTask[]; rooms: TilingRoomSummary[]; totalAreaM2: number; totalTileM2: number; totalTilerHours: number; warnings: string[] }

export function floorAreaM2(r: TileFloorRoom): number {
  return r.areaOverrideM2 ?? Math.max(0, roomFootprint(r).areaM2 - r.notTiledM2)
}

export function calculateTileFloor(input: TileFloorInput): TileFloorResult {
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
  let totalAreaM2 = 0, totalTileM2 = 0, totalTilerHours = 0

  for (const room of input.rooms) {
    const rn = room.name.trim() || 'Room'
    for (const [v, w] of [[room.lengthM, 'length'], [room.widthM, 'width'], [room.notTiledM2, 'area not tiled'], [room.doors, 'number of doors'], [room.skirtingLm, 'skirting'], [room.movementJointLm, 'movement joints']] as [number, string][]) nonNeg(v, `The ${w} of ${rn}`)
    for (const o of [room.areaOverrideM2, room.trimLm, room.tilePriceM2, room.jointMm]) if (o !== null && !(o >= 0)) throw new Error(`A size or price in ${rn} cannot be negative.`)
    const sit = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${rn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const tile = TILE_SIZE_BY_ID[room.tileId] ?? TILE_SIZE_BY_ID.small
    const layout = TILE_LAYOUT_BY_ID[room.layoutId] ?? TILE_LAYOUT_BY_ID.straight
    const grout = GROUT_KIND_BY_ID[room.groutId] ?? GROUT_KIND_BY_ID.cement
    const fp = roomFootprint(room)
    if (fp.error) throw new Error(`${rn}: ${fp.error}`)
    const area = floorAreaM2(room)
    if (!(area > 0)) { warnings.push(`${rn} has no floor area to tile.`); continue }
    const perimeter = room.areaOverrideM2 === null ? fp.perimeterM : 4 * Math.sqrt(area)
    const joint = room.jointMm ?? tile.jointMm
    const trimLm = room.trimLm ?? room.doors * THRESHOLD_LM
    const skirtM2 = room.skirtingLm * SAMPLE_SPECIAL.skirtingHeightM
    const tileM2 = area + skirtM2

    if (FLAT_BASE_TILES.includes(room.tileId)) warnings.push(`${rn}: ${tile.label.split(' (')[0].toLowerCase()} need a floor flat to about 3mm over 2m. Price levelling in Tiling Preparation if the floor is not.`)
    if (Math.max(room.lengthM, room.widthM) > 8 && room.movementJointLm <= 0) warnings.push(`${rn} is over 8m long: tiling this size needs movement joints (BS 5385). Add their length.`)
    if (room.clientSupplies && room.tilePriceM2 !== null) warnings.push(`${rn}: the tiles are the client's, so the tile price is ignored.`)

    const parts: string[] = []
    const add = (key: string, name: string, category: 'materials' | 'plant', unit: string, unitCost: number, qty: number) => {
      if (qty > 0 && unitCost >= 0) lines.push({ id: `${key}|${room.id}`, name: `${rn} — ${name}`, category, unit, unitCost: money(unitCost), qty: +qty.toFixed(3), roomId: room.id })
    }
    const task = (key: string, what: string, parts2: { qty: number; unit: string; what: string; rate: number }[]) => {
      const used = parts2.filter(p => p.qty > 0 && p.rate > 0)
      if (used.length === 0) return
      const hours = hoursOf(used.reduce((s, p) => s + p.qty * p.rate, 0) * uplift)
      if (hours === 0) return
      totalTilerHours += hours
      labour.push({ key: `${key}|${room.id}`, roomId: room.id, trade: 'tiler', task: `${rn} — ${what}`, hours,
        basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${+p.rate.toFixed(3)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    }

    // ── Materials ────────────────────────────────────────────────────────────────
    const wasteF = 1 + Math.max(TILE_WASTE_MIN, layout.waste)
    const tilePrice = room.tilePriceM2 ?? tile.priceM2
    if (!room.clientSupplies) add('tile', `${tile.label.split(' (')[0]} (${tile.wMm} x ${tile.hMm}mm, with ${Math.round(layout.waste * 100)}% for cuts and breakage)`, 'materials', 'm²', tilePrice, tileM2 * wasteF)
    const adhBag = room.adhesive === 'flexible' ? rate('adhesiveBagFlexible') : rate('adhesiveBagStandard')
    add('adhesive', `${room.adhesive === 'flexible' ? 'flexible' : 'standard'} tile adhesive (${tile.trowel})`, 'materials', 'bag', adhBag, (tileM2 * tile.adhesiveKgM2 * 1.05) / COVERAGE.bagKg)
    add('grout', `${grout.label.toLowerCase()} (${joint}mm joint)`, 'materials', 'kg', grout.priceKg, tileM2 * groutKgM2(tile.wMm, tile.hMm, joint, tile.thicknessMm))
    add('trim', 'edge trims, thresholds and movement-joint profile', 'materials', 'lm', rate('trimLm'), trimLm + room.movementJointLm)
    const siliconeLm = perimeter + room.movementJointLm
    add('silicone', 'silicone to the edges and movement joints', 'materials', 'cartridge', rate('siliconeCartridge'), siliconeLm / COVERAGE.siliconeLm)
    if (room.sealed) add('sealer', 'penetrating sealer (stone and unglazed tile)', 'materials', 'L', rate('sealerL'), (tileM2 / COVERAGE.sealerM2L) * 2)
    add('sundries', 'spacers, wedges, sponges and sundries', 'materials', 'item', rate('sundriesM2') * tileM2, 1)
    if (room.protect) add('protect', 'floor protection and masking tape', 'materials', 'item', rate('protectBase') + rate('protectM2') * area, 1)

    // ── Labour ───────────────────────────────────────────────────────────────────
    const laying = tile.floorHoursM2 * layout.labourFactor
    task('lay', 'lay the floor tiles', [
      { qty: area, unit: 'm²', what: `${tile.label.split(' (')[0].toLowerCase()}${layout.labourFactor !== 1 ? `, ${layout.label.split(' (')[0].toLowerCase()}` : ''}`, rate: laying },
      { qty: perimeter, unit: 'lm', what: 'cut edge', rate: HOURS.cutLm * (tile.wMm >= 600 || tile.hMm >= 600 ? 1.4 : 1) },
    ])
    task('grout', 'grout and clean the floor', [{ qty: area, unit: 'm²', what: grout.id === 'epoxy' ? 'epoxy grouting' : 'grouting', rate: HOURS.groutM2 * grout.labourFactor }, { qty: room.sealed ? tileM2 : 0, unit: 'm²', what: 'sealing', rate: HOURS.sealM2 }])
    task('finish', 'skirting, trims and movement joints', [
      { qty: room.skirtingLm, unit: 'lm', what: 'tiled skirting', rate: HOURS.skirtingLm }, { qty: trimLm, unit: 'lm', what: 'trims', rate: HOURS.trimLm }, { qty: room.movementJointLm, unit: 'lm', what: 'movement joints', rate: HOURS.jointLm },
    ])
    if (room.protect) task('protect', 'protect the floors and fittings', [{ qty: 1, unit: 'room', what: '', rate: HOURS.protectRoom }, { qty: area, unit: 'm²', what: 'floor', rate: HOURS.protectM2 }])

    parts.push(`${room.clientSupplies ? 'tiles supplied by the client, ' : ''}${tile.label.split(' (')[0].toLowerCase()} laid ${layout.id === 'straight' ? 'straight' : layout.label.split(' (')[0].toLowerCase()} to ${n1(area)}m² of floor${!room.clientSupplies ? ` (tile allowance £${n1(tilePrice)} per m²)` : ''}`)
    parts.push(`${grout.label.toLowerCase()}`)
    if (room.skirtingLm > 0) parts.push(`${n1(room.skirtingLm)}m of tiled skirting`)
    if (trimLm > 0) parts.push(`${n1(trimLm)}m of trims and thresholds`)
    if (room.movementJointLm > 0) parts.push(`${n1(room.movementJointLm)}m of movement joints`)
    if (room.sealed) parts.push('the tiles sealed')
    totalAreaM2 += area; totalTileM2 += room.clientSupplies ? 0 : tileM2
    summaries.push({ roomId: room.id, name: rn, areaM2: money(area), uplift: sit.upliftPct, parts })
  }

  const labourerHours = totalTilerHours > 0 ? hoursOf(totalTilerHours * LABOURER_SHARE) : 0
  if (labourerHours > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Carry tile and adhesive, mix and clear up for the tiler', hours: labourerHours, basis: `${Math.round(LABOURER_SHARE * 100)}% of ${n1(totalTilerHours)} h of tiling` })
  return { lines, labour, rooms: summaries, totalAreaM2: money(totalAreaM2), totalTileM2: money(totalTileM2), totalTilerHours: money(totalTilerHours), warnings }
}

export { DEFAULT_TILING_SITUATIONS }
