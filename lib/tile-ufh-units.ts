// Electric underfloor heating under tiles priced room by room: each room is sized (length, width, less the floor under a bath, units or anything fixed), the heated area follows (the floor less the fixed things and a
// margin round the walls, or typed), and the kit is chosen to cover it: loose-wire heating mats of standard sizes (150 W per m² for a tiled floor with another heat source, 200 W per m² when the floor is the main heat, or on
// stone) or loose cable for an awkward shape. Each room has a thermostat with its floor sensor, insulation board under the mat (so the heat goes up, not down into the slab), a primer, optionally a levelling coat over the mat,
// and the electrician's connection (priced as a subcontract line per thermostat: a dedicated circuit with a 30mA RCD, connected, tested and certified). The tiler lays the mat and chases the sensor; the tiles and their adhesive
// are priced in Floor Tiling, and the floor under all of it (levelling, screed) in Tiling Preparation and the Screeded Floor calculator. WATER underfloor heating is a different calculator, under Plumbing & Heating.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. The engine imports only the shared tiling module, so it can be hand-tested with plain Node;
// the screen costs the lines it returns through the shared costLayer.

import {
  money, hoursOf, n1, nonNeg, roomFootprint,
  type RoomShapeExtras, type TilingSituation, type TilingLabourTask, type TilingLine, type TilingRoomSummary,
} from './tiling-common'

export type UfhKit = 'mat150' | 'mat200' | 'cable'
export interface UfhKitInfo { id: UfhKit; label: string; /** the name in a sentence */ short: string; wattsM2: number; /** £ per m² of kit, sample */ priceM2: number; /** sold in these sizes (m²) and cannot be shortened by more than a turn; cable covers any area */ sizes: number[] | null }
export const UFH_KITS: UfhKitInfo[] = [
  { id: 'mat150', short: 'heating mat (150 W/m²)', label: 'Heating mat, 150 W/m² (tiled floor with other heating, or a bathroom)', wattsM2: 150, priceM2: 28, sizes: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10] },
  { id: 'mat200', short: 'heating mat (200 W/m²)', label: 'Heating mat, 200 W/m² (main heat, stone or a cold floor)', wattsM2: 200, priceM2: 32, sizes: [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 10] },
  { id: 'cable', short: 'loose heating cable (about 150 W/m²)', label: 'Loose heating cable, about 150 W/m² (an awkward shape)', wattsM2: 150, priceM2: 21, sizes: null },
]
export const UFH_KIT_BY_ID: Record<string, UfhKitInfo> = Object.fromEntries(UFH_KITS.map(k => [k.id, k]))

export type UfhThermostat = 'digital' | 'wifi'
export const THERMOSTAT_INFO: Record<UfhThermostat, { label: string; price: number }> = {
  digital: { label: 'Digital programmable thermostat with floor sensor', price: 62 },
  wifi: { label: 'Wi-Fi smart thermostat with floor sensor', price: 105 },
}
export type UfhInsulation = 'none' | '6mm' | '10mm' | '20mm'
export const INSULATION_INFO: Record<UfhInsulation, { label: string; priceM2: number }> = {
  none: { label: 'None', priceM2: 0 },
  '6mm': { label: 'Insulation board 6mm', priceM2: 17 },
  '10mm': { label: 'Insulation board 10mm', priceM2: 21 },
  '20mm': { label: 'Insulation board 20mm', priceM2: 29 },
}

export interface TileUfhRoom extends RoomShapeExtras {
  id: string
  name: string
  kindId: string
  lengthM: number
  widthM: number
  /** floor under a bath, units or anything fixed that is not heated, m² */
  fixedM2: number
  /** null = the floor less the fixed things and a margin of 5cm round the walls */
  heatedAreaOverrideM2: number | null
  kit: UfhKit
  thermostat: UfhThermostat
  insulation: UfhInsulation
  primer: boolean
  /** depth of levelling compound over the mat, mm; 0 = none (tile adhesive alone covers it) */
  coverMm: number
  situationId: string | null
  /** the drawn area and perimeter (from Take-off) this room was last sized from: it follows them until they change */
  fromPlan?: { areaM2: number; perimeterM: number; /** the name the room was given from the plan: it follows the plan's room name while still that */ name?: string }
  /** the room on the Take-off plan this one was made from, and what the plan said when it was last fed (it follows the plan until the plan's room changes) */
  planRoomId?: string
  planRoomSig?: string
}

export function newTileUfhRoom(id: string, name: string, kindId: string, k: { lengthM: number; widthM: number; fixedM2: number }, start: { kit: UfhKit; insulation: UfhInsulation }): TileUfhRoom {
  return {
    id, name, kindId, lengthM: k.lengthM, widthM: k.widthM, fixedM2: k.fixedM2, heatedAreaOverrideM2: null, kit: start.kit, thermostat: 'digital',
    insulation: start.insulation, primer: true, coverMm: 0, situationId: null,
  }
}

export const MATERIAL_RATES = {
  insulationAdhesiveBag: 24, // £ per 20kg bag of flexible adhesive to bed the insulation board
  primerL: 4.8,              // £/L primer
  levelBag: 18.5,            // £ per 20kg bag of self-levelling compound over the mat
  sensorKit: 12,             // £ each: conduit, back box and sensor tube
  electrician1: 185,         // £ the first thermostat: connected to a dedicated circuit, tested and certified (subcontract)
  electricianMore: 95,       // £ each further thermostat on the same visit
  protectBase: 3,            // £ per room: floor protection
} as const
export const COVERAGE = { bagKg: 20, primerM2L: 8, levelKgM2PerMm: 1.7, insulationAdhesiveKgM2: 3.5 } as const
/** The margin kept clear of the walls and fixed things, m */
export const WALL_MARGIN_M = 0.05

export const HOURS = {
  chaseRoom: 0.8,        // chase the wall for the cable and sensor, fix the back box
  insulationM2: 0.2, primerM2: 0.03, matM2: 0.4, cableM2: 0.55, testRoom: 0.3, levelM2: 0.12, levelPerMmM2: 0.004, protectRoom: 0.2,
} as const
export const LABOURER_SHARE = 0.1
/** A mat circuit is limited by the cable: over this many watts a room gets a dedicated 16A circuit checked against its supply */
export const CIRCUIT_WARN_W = 3000

export interface TileUfhInput {
  rooms: TileUfhRoom[]
  jobSituationId: string
  situations: TilingSituation[]
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
  /** false = the electrical connection is by others (client's own electrician): no subcontract line */
  electricianIncluded: boolean
}
export interface UfhRoomSummary extends TilingRoomSummary { heatedM2: number; coveredM2: number; watts: number; mats: number[] }
export interface TileUfhResult { lines: TilingLine[]; labour: TilingLabourTask[]; rooms: UfhRoomSummary[]; totalHeatedM2: number; totalWatts: number; totalTilerHours: number; thermostats: number; warnings: string[] }

export const heatedAreaM2 = (r: TileUfhRoom) => {
  const fp = roomFootprint(r)
  return r.heatedAreaOverrideM2 ?? Math.max(0, fp.areaM2 - r.fixedM2 - fp.perimeterM * WALL_MARGIN_M)
}

/** The mats that cover an area: the biggest standard size that fits, again and again; the part left over is returned (a mat can be cut between its runs and turned, but not made smaller than its smallest size).
 * An area under the smallest size gets the smallest mat. */
export function fitMats(areaM2: number, sizes: number[]): { mats: number[]; coveredM2: number; leftM2: number } {
  const sorted = [...sizes].sort((a, b) => b - a)
  const smallest = sorted[sorted.length - 1]
  const mats: number[] = []
  let left = areaM2
  if (!(areaM2 > 0)) return { mats, coveredM2: 0, leftM2: 0 }
  if (areaM2 < smallest) return { mats: [smallest], coveredM2: smallest, leftM2: 0 }
  while (left >= smallest - 1e-9) {
    const s = sorted.find(x => x <= left + 1e-9)
    if (s === undefined) break
    mats.push(s); left = +(left - s).toFixed(6)
  }
  const covered = mats.reduce((a, b) => a + b, 0)
  return { mats, coveredM2: +covered.toFixed(2), leftM2: +Math.max(0, left).toFixed(2) }
}

export function calculateTileUfh(input: TileUfhInput): TileUfhResult {
  if (!input.situations.find(s => s.id === input.jobSituationId)) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  const rate = <K extends keyof typeof MATERIAL_RATES>(k: K): number => {
    const v = input.rates[k] ?? MATERIAL_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const lines: TilingLine[] = []
  const labour: TilingLabourTask[] = []
  const summaries: UfhRoomSummary[] = []
  const warnings: string[] = []
  let totalHeatedM2 = 0, totalWatts = 0, totalTilerHours = 0, thermostats = 0

  for (const room of input.rooms) {
    const rn = room.name.trim() || 'Room'
    for (const [v, w] of [[room.lengthM, 'length'], [room.widthM, 'width'], [room.fixedM2, 'area under fixed things'], [room.coverMm, 'levelling depth']] as [number, string][]) nonNeg(v, `The ${w} of ${rn}`)
    if (room.heatedAreaOverrideM2 !== null && !(room.heatedAreaOverrideM2 >= 0)) throw new Error(`The heated area of ${rn} cannot be negative.`)
    const sit = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${rn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const fp = roomFootprint(room)
    if (fp.error) throw new Error(`${rn}: ${fp.error}`)
    const heated = heatedAreaM2(room)
    if (!(heated > 0)) { warnings.push(`${rn} has no heated area.`); continue }
    const kit = UFH_KIT_BY_ID[room.kit] ?? UFH_KITS[0]
    const floorNet = Math.max(0, fp.areaM2 - room.fixedM2)
    const fit = kit.sizes ? fitMats(heated, kit.sizes) : { mats: [] as number[], coveredM2: Math.ceil(heated * 2) / 2, leftM2: 0 }
    const watts = Math.round(fit.coveredM2 * kit.wattsM2)
    if (fit.leftM2 >= 0.5) warnings.push(`${rn}: the mats cover ${n1(fit.coveredM2)}m² of the ${n1(heated)}m² to heat: about ${n1(fit.leftM2)}m² is left unheated. Use cable for the odd corner or accept it.`)
    if (watts > CIRCUIT_WARN_W) warnings.push(`${rn} is ${(watts / 1000).toFixed(1)}kW: it needs its own circuit and the supply checking; over about 3.6kW it needs two circuits.`)
    if (room.insulation === 'none') warnings.push(`${rn} has no insulation under the mat: on a concrete or screed floor much of the heat goes down and it is slow to warm.`)

    const parts: string[] = []
    const add = (key: string, name: string, category: 'materials' | 'subcontractors', unit: string, unitCost: number, qty: number) => {
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
    const matLabel = kit.sizes ? `${kit.short}${fit.mats.length ? ` (${fit.mats.map(m => `${m}m²`).join(' + ')})` : ''}` : kit.short
    add('kit', matLabel, 'materials', 'm²', kit.priceM2, fit.coveredM2)
    add('thermostat', THERMOSTAT_INFO[room.thermostat].label.toLowerCase(), 'materials', 'nr', THERMOSTAT_INFO[room.thermostat].price, 1)
    add('sensor', 'conduit, back box and sensor tube', 'materials', 'nr', rate('sensorKit'), 1)
    if (room.insulation !== 'none') {
      const ins = INSULATION_INFO[room.insulation]
      add('insulation', ins.label.toLowerCase(), 'materials', 'm²', ins.priceM2, floorNet * 1.05)
      add('insulation-adh', 'flexible adhesive to bed the insulation board', 'materials', 'bag', rate('insulationAdhesiveBag'), (floorNet * COVERAGE.insulationAdhesiveKgM2 * 1.05) / COVERAGE.bagKg)
    }
    if (room.primer) add('primer', 'primer to the floor', 'materials', 'L', rate('primerL'), floorNet / COVERAGE.primerM2L)
    if (room.coverMm > 0) add('cover', `self-levelling compound over the mat at ${room.coverMm}mm`, 'materials', 'bag', rate('levelBag'), (heated * room.coverMm * COVERAGE.levelKgM2PerMm * 1.05) / COVERAGE.bagKg)
    add('protect', 'floor protection', 'materials', 'item', rate('protectBase'), 1)
    thermostats += 1
    if (input.electricianIncluded) add('electrician', 'electrician: connect to a dedicated circuit with a 30mA RCD, test and certificate', 'subcontractors', 'nr', thermostats === 1 ? rate('electrician1') : rate('electricianMore'), 1)

    // ── Labour ───────────────────────────────────────────────────────────────────
    task('prep', 'insulation board and primer', [
      { qty: room.insulation !== 'none' ? floorNet : 0, unit: 'm²', what: 'insulation board', rate: HOURS.insulationM2 }, { qty: room.primer ? floorNet : 0, unit: 'm²', what: 'primer', rate: HOURS.primerM2 },
    ])
    task('chase', 'chase the wall, fix the back box and sensor', [{ qty: 1, unit: 'room', what: '', rate: HOURS.chaseRoom }])
    task('lay', 'lay the heating mat and test it', [
      { qty: fit.coveredM2, unit: 'm²', what: kit.sizes ? 'mat' : 'cable', rate: kit.sizes ? HOURS.matM2 : HOURS.cableM2 }, { qty: 2, unit: 'test', what: 'resistance (before and after tiling)', rate: HOURS.testRoom },
    ])
    task('cover', 'cover the mat with levelling compound', [{ qty: room.coverMm > 0 ? heated : 0, unit: 'm²', what: 'levelling', rate: HOURS.levelM2 + room.coverMm * HOURS.levelPerMmM2 }])

    parts.push(`${n1(fit.coveredM2)}m² of ${kit.short}${fit.mats.length > 1 ? ` in ${fit.mats.length} mats` : ''} to ${n1(heated)}m² of floor, ${(watts / 1000).toFixed(2)}kW`)
    parts.push(THERMOSTAT_INFO[room.thermostat].label.toLowerCase())
    if (room.insulation !== 'none') parts.push(`${room.insulation} insulation board under the mat`)
    if (room.coverMm > 0) parts.push(`${room.coverMm}mm of levelling compound over the mat`)
    parts.push(input.electricianIncluded ? 'the electrical connection, test and certificate' : 'the electrical connection by others')
    totalHeatedM2 += fit.coveredM2; totalWatts += watts
    summaries.push({ roomId: room.id, name: rn, areaM2: money(heated), uplift: sit.upliftPct, parts, heatedM2: money(heated), coveredM2: fit.coveredM2, watts, mats: fit.mats })
  }

  const labourerHours = totalTilerHours > 0 ? hoursOf(totalTilerHours * LABOURER_SHARE) : 0
  if (labourerHours > 0) labour.push({ key: 'labourer|job', roomId: '', trade: 'labourer', task: 'Carry materials and clear up for the tiler', hours: labourerHours, basis: `${Math.round(LABOURER_SHARE * 100)}% of ${n1(totalTilerHours)} h of heating work` })
  return { lines, labour, rooms: summaries, totalHeatedM2: money(totalHeatedM2), totalWatts, totalTilerHours: money(totalTilerHours), thermostats, warnings }
}
