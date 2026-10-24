// Wall tiling priced room by room: each room has the wall areas that are tiled (a bath surround, shower walls, a splashback, or every wall), each sized by length and height less any window or niche, and says what
// tile goes on them (a size, a layout, our supply at an allowance or the client's own) and how it is grouted, with edge trims where a wall is not tiled to the ceiling, external corners, niches and the silicone at the
// bath, tray and corners. The tile, adhesive and grout come from the area and the sample coverage of each product; the tiler's time from the area times a rate of hours per m² for that size of tile and layout, plus the
// cuts round each area, the grouting and the extras; a labourer carries and mixes. The backer board, waterproofing and ceiling board are priced in Tiling Preparation; this prices the tiling itself.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. The engine imports only the shared tiling module, so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer.

import {
  TILE_SIZE_BY_ID, TILE_LAYOUT_BY_ID, GROUT_KIND_BY_ID, zoneAreaM2, groutKgM2, money, hoursOf, n1, nonNeg,
  type TilingSituation, type TilingZone, type TilingLabourTask, type TilingLine, type TilingRoomSummary, type TileSizeId, type TileLayoutId, type GroutId,
} from './tiling-common'

export interface TileWallRoom {
  id: string
  name: string
  kindId: string
  /** the room's height: a tiled area lower than this gets an edge trim along its top */
  heightM: number
  zones: TilingZone[]
  tileId: TileSizeId
  layoutId: TileLayoutId
  clientSupplies: boolean
  /** £ per m² allowed for the tile; null = the sample price for the size */
  tilePriceM2: number | null
  jointMm: number | null
  groutId: GroutId
  /** edge trim along the top of areas not tiled to the ceiling, lm; null = worked out from the areas */
  trimLm: number | null
  /** trim on external corners, lm */
  externalCornerLm: number
  /** niches (shower shelves) tiled into the wall, nr */
  niches: number
  /** silicone to the bath or tray and the internal corners, lm; null = worked out from the areas */
  siliconeLm: number | null
  sealed: boolean
  situationId: string | null
  protect: boolean
}

export function newTileWallRoom(id: string, name: string, kindId: string, heightM: number, zones: TilingZone[], start: { tileId: TileSizeId; layoutId: TileLayoutId }): TileWallRoom {
  return {
    id, name, kindId, heightM, zones, tileId: start.tileId, layoutId: start.layoutId, clientSupplies: false, tilePriceM2: null, jointMm: null,
    groutId: 'cement', trimLm: null, externalCornerLm: 0, niches: 0, siliconeLm: null, sealed: false, situationId: null, protect: true,
  }
}

export const MATERIAL_RATES = {
  adhesiveBag: 24,           // £ per 20kg bag of flexible powder adhesive
  trimLm: 6.5,               // £/lm edge or corner trim (chrome or satin)
  nicheEach: 18,             // £ each: niche trim, tile cuts and the fixing of its shelf
  siliconeCartridge: 5.5,    // £ per cartridge, one per about 8 lm of joint
  sealerL: 14,               // £/L penetrating sealer for natural stone and unglazed tile
  sundriesM2: 0.45,          // £/m²: spacers, wedges, sponges, buckets, polythene
  protectBase: 4,            // £ per room: dust sheets, masking tape
  protectM2: 0.3,            // £ per m² of tiled wall (the floor and bath are covered)
} as const
export const COVERAGE = { bagKg: 20, sealerM2L: 6, siliconeLm: 8 } as const
/** Walls tiled in a wet area get less waste than an ordinary room because rectified tiles cut cleanly, but never less than 5% */
export const TILE_WASTE_MIN = 0.05

export const HOURS = {
  protectRoom: 0.25, protectM2: 0.01,
  cutLm: 0.12,          // per metre of cut edge round a tiled area (its two sides and its top)
  groutM2: 0.16, sealM2: 0.04, trimLm: 0.14, cornerLm: 0.2, nicheEach: 1.5, siliconeLm: 0.06,
} as const
export const LABOURER_SHARE = 0.15

export interface TileWallInput {
  rooms: TileWallRoom[]
  jobSituationId: string
  situations: TilingSituation[]
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
}
export interface TileWallResult { lines: TilingLine[]; labour: TilingLabourTask[]; rooms: TilingRoomSummary[]; totalAreaM2: number; totalTileM2: number; totalTilerHours: number; warnings: string[] }

/** The metres of edge trim along the top of areas that stop short of the ceiling (more than 5cm short) */
export const autoTrimLm = (r: TileWallRoom) => r.zones.filter(z => z.heightM < r.heightM - 0.05).reduce((s, z) => s + z.lengthM, 0)
/** The metres of silicone: the length of each area (where it meets the bath, tray, worktop or floor) and two internal corners up its height */
export const autoSiliconeLm = (r: TileWallRoom) => r.zones.reduce((s, z) => s + z.lengthM + 2 * z.heightM, 0)

export function calculateTileWall(input: TileWallInput): TileWallResult {
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
    for (const [v, w] of [[room.heightM, 'height'], [room.externalCornerLm, 'external corners'], [room.niches, 'number of niches']] as [number, string][]) nonNeg(v, `The ${w} of ${rn}`)
    for (const o of [room.trimLm, room.siliconeLm, room.tilePriceM2, room.jointMm]) if (o !== null && !(o >= 0)) throw new Error(`A size or price in ${rn} cannot be negative.`)
    for (const z of room.zones) for (const [v, w] of [[z.lengthM, 'length'], [z.heightM, 'height'], [z.deductM2, 'deduction']] as [number, string][]) nonNeg(v, `The ${w} of "${z.label || 'a tiled area'}" in ${rn}`)
    const sit = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${rn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const tile = TILE_SIZE_BY_ID[room.tileId] ?? TILE_SIZE_BY_ID.small
    const layout = TILE_LAYOUT_BY_ID[room.layoutId] ?? TILE_LAYOUT_BY_ID.straight
    const grout = GROUT_KIND_BY_ID[room.groutId] ?? GROUT_KIND_BY_ID.cement
    const zones = room.zones.filter(z => zoneAreaM2(z) > 0)
    const area = zones.reduce((s, z) => s + zoneAreaM2(z), 0) + room.niches * 0.3
    if (!(area > 0)) { warnings.push(`${rn} has no wall area to tile.`); continue }
    const joint = room.jointMm ?? tile.jointMm
    const trimLm = room.trimLm ?? autoTrimLm({ ...room, zones })
    const siliconeLm = room.siliconeLm ?? autoSiliconeLm({ ...room, zones })
    const cutLm = zones.reduce((s, z) => s + z.lengthM + 2 * z.heightM, 0)
    for (const z of zones) if (z.deductM2 > z.lengthM * z.heightM) warnings.push(`${rn}: the deduction in "${z.label}" is bigger than the area.`)
    if (room.heightM > 3 && zones.some(z => z.heightM > 3)) warnings.push(`${rn} has tiling over 3m high: you may need scaffold or a tower.`)

    const parts: string[] = []
    const add = (key: string, name: string, category: 'materials', unit: string, unitCost: number, qty: number) => {
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
    if (!room.clientSupplies) add('tile', `${tile.label.split(' (')[0]} (${tile.wMm} x ${tile.hMm}mm, with ${Math.round(layout.waste * 100)}% for cuts and breakage)`, 'materials', 'm²', tilePrice, area * wasteF)
    add('adhesive', `tile adhesive (${tile.trowel})`, 'materials', 'bag', rate('adhesiveBag'), (area * tile.adhesiveKgM2 * 1.05) / COVERAGE.bagKg)
    add('grout', `${grout.label.toLowerCase()} (${joint}mm joint)`, 'materials', 'kg', grout.priceKg, area * groutKgM2(tile.wMm, tile.hMm, joint, tile.thicknessMm))
    add('trim', 'edge trim and external corner trim', 'materials', 'lm', rate('trimLm'), trimLm + room.externalCornerLm)
    add('niche', 'niche trim, cuts and shelf', 'materials', 'nr', rate('nicheEach'), room.niches)
    add('silicone', 'silicone to the bath or tray and the corners', 'materials', 'cartridge', rate('siliconeCartridge'), siliconeLm / COVERAGE.siliconeLm)
    if (room.sealed) add('sealer', 'penetrating sealer (stone and unglazed tile)', 'materials', 'L', rate('sealerL'), (area / COVERAGE.sealerM2L) * 2)
    add('sundries', 'spacers, wedges, sponges and sundries', 'materials', 'item', rate('sundriesM2') * area, 1)
    if (room.protect) add('protect', 'dust sheets and masking tape', 'materials', 'item', rate('protectBase') + rate('protectM2') * area, 1)

    // ── Labour ───────────────────────────────────────────────────────────────────
    task('lay', 'tile the walls', [
      { qty: area, unit: 'm²', what: `${tile.label.split(' (')[0].toLowerCase()}${layout.labourFactor !== 1 ? `, ${layout.label.split(' (')[0].toLowerCase()}` : ''}`, rate: tile.wallHoursM2 * layout.labourFactor },
      { qty: cutLm, unit: 'lm', what: 'cut edge', rate: HOURS.cutLm * (tile.wMm >= 600 || tile.hMm >= 600 ? 1.4 : 1) },
    ])
    task('grout', 'grout and clean the walls', [{ qty: area, unit: 'm²', what: grout.id === 'epoxy' ? 'epoxy grouting' : 'grouting', rate: HOURS.groutM2 * grout.labourFactor }, { qty: room.sealed ? area : 0, unit: 'm²', what: 'sealing', rate: HOURS.sealM2 }])
    task('finish', 'trims, niches and silicone', [
      { qty: trimLm, unit: 'lm', what: 'edge trim', rate: HOURS.trimLm }, { qty: room.externalCornerLm, unit: 'lm', what: 'corner trim', rate: HOURS.cornerLm },
      { qty: room.niches, unit: 'nr', what: 'niches', rate: HOURS.nicheEach }, { qty: siliconeLm, unit: 'lm', what: 'silicone', rate: HOURS.siliconeLm },
    ])
    if (room.protect) task('protect', 'protect the floor and fittings', [{ qty: 1, unit: 'room', what: '', rate: HOURS.protectRoom }, { qty: area, unit: 'm²', what: 'wall', rate: HOURS.protectM2 }])

    const areaNames = zones.map(z => z.label.trim()).filter(Boolean)
    parts.push(`${room.clientSupplies ? 'tiles supplied by the client, ' : ''}${tile.label.split(' (')[0].toLowerCase()} laid ${layout.id === 'straight' ? 'straight' : layout.label.split(' (')[0].toLowerCase()} to ${n1(area)}m² of wall${areaNames.length ? ` (${areaNames.join(', ').toLowerCase()})` : ''}${!room.clientSupplies ? `, tile allowance £${n1(tilePrice)} per m²` : ''}`)
    parts.push(grout.label.toLowerCase())
    if (trimLm + room.externalCornerLm > 0) parts.push(`${n1(trimLm + room.externalCornerLm)}m of edge and corner trim`)
    if (room.niches > 0) parts.push(`${room.niches} tiled niche${room.niches === 1 ? '' : 's'}`)
    if (room.sealed) parts.push('the tiles sealed')
    totalAreaM2 += area; totalTileM2 += room.clientSupplies ? 0 : area
    summaries.push({ roomId: room.id, name: rn, areaM2: money(area), uplift: sit.upliftPct, parts })
  }

  const labourerHours = totalTilerHours > 0 ? hoursOf(totalTilerHours * LABOURER_SHARE) : 0
  if (labourerHours > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Carry tile and adhesive, mix and clear up for the tiler', hours: labourerHours, basis: `${Math.round(LABOURER_SHARE * 100)}% of ${n1(totalTilerHours)} h of tiling` })
  return { lines, labour, rooms: summaries, totalAreaM2: money(totalAreaM2), totalTileM2: money(totalTileM2), totalTilerHours: money(totalTilerHours), warnings }
}
