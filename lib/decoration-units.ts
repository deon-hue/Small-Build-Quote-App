// Internal decoration priced room by room: the preparation (protect, strip wallpaper, wash, fill and sand), painting the walls and ceiling, and painting the
// woodwork (skirting, architrave, picture rails), the doors and the window frames. Each room is sized (length, width, height, number of doors and
// windows), and each surface says what condition it is in (new plaster, painted and sound, painted and poor, wallpapered) and how much filling and
// sanding it needs, because that is what changes the price: new plaster wants a mist coat, wallpaper has to come off first, a poor wall needs filling
// and sealing. Paint comes from the area, the number of coats and the coverage of the paint; the painter's time from the areas, lengths and
// numbers times a rate of hours per unit.
//
// Every rate here is a SAMPLE rate or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no
// cross-file runtime imports), so it can be hand-tested with plain Node; the screen costs the lines it returns through the shared costLayer.

export type SurfaceCondition = 'new-plaster' | 'painted-good' | 'painted-poor' | 'wallpaper'
export type PrepLevel = 'light' | 'normal' | 'heavy'
export type WoodCondition = 'new' | 'painted-good' | 'painted-poor'
export type DoorKind = 'flush' | 'panelled' | 'glazed'
export type WallFinish = 'matt' | 'silk'
export type WoodFinish = 'satin' | 'gloss'

export const CONDITION_LABEL: Record<SurfaceCondition, string> = {
  'new-plaster': 'New plaster (not yet painted)',
  'painted-good': 'Painted before, in good order',
  'painted-poor': 'Painted before, flaking, cracked or patchy',
  wallpaper: 'Wallpapered (has to be stripped)',
}
export const PREP_LABEL: Record<PrepLevel, string> = { light: 'Light filling and sanding', normal: 'Normal filling and sanding', heavy: 'Heavy filling and sanding' }
export const WOOD_CONDITION_LABEL: Record<WoodCondition, string> = { new: 'New or bare timber', 'painted-good': 'Painted before, in good order', 'painted-poor': 'Painted before, poor' }
export const DOOR_KIND_LABEL: Record<DoorKind, string> = { flush: 'Flush door', panelled: 'Panelled door', glazed: 'Glazed door / French doors' }

/** What an average door and window take out of a wall, m² */
export const DOOR_OPENING_M2 = 1.9
export const WINDOW_OPENING_M2 = 1.4
/** Architrave on both sides of an internal door: two sides of (2.1 + 2.1 + 0.9) m */
export const ARCHITRAVE_PER_DOOR_LM = 10.2

export interface DecoSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_DECO_SITUATIONS: DecoSituation[] = [
  { id: 'empty', label: 'Empty rooms (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (furniture to move and protect)', upliftPct: 15 },
  { id: 'hard', label: 'Hard to reach (high ceilings, stairwell)', upliftPct: 25 },
]

export interface RoomKind { id: string; label: string; lengthM: number; widthM: number; heightM: number; doors: number; windows: number }
export const ROOM_KINDS: RoomKind[] = [
  { id: 'living', label: 'Living room', lengthM: 5, widthM: 4, heightM: 2.5, doors: 1, windows: 2 },
  { id: 'kitchen', label: 'Kitchen', lengthM: 4, widthM: 3.5, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'dining', label: 'Dining room', lengthM: 4, widthM: 3.5, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'bedroom', label: 'Bedroom', lengthM: 4, widthM: 3.5, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'bathroom', label: 'Bathroom', lengthM: 2.5, widthM: 2, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'hall', label: 'Hall / landing / stairs', lengthM: 4, widthM: 1.5, heightM: 2.5, doors: 4, windows: 0 },
  { id: 'study', label: 'Study', lengthM: 3, widthM: 3, heightM: 2.5, doors: 1, windows: 1 },
  { id: 'other', label: 'Other room', lengthM: 4, widthM: 3, heightM: 2.5, doors: 1, windows: 1 },
]
export const ROOM_KIND_BY_ID: Record<string, RoomKind> = Object.fromEntries(ROOM_KINDS.map(k => [k.id, k]))

export interface SurfaceWork { paint: boolean; condition: SurfaceCondition; prep: PrepLevel; coats: number }
export interface WoodworkWork {
  paint: boolean; condition: WoodCondition
  /** null = worked out from the room (the perimeter less the doors) */
  skirtingLm: number | null
  skirtingHeightMm: number
  /** null = worked out from the doors (both sides) */
  architraveLm: number | null
  /** picture rails, dado rails */
  railsLm: number
  /** anything else that is painted by the metre */
  otherLm: number
  topcoats: number
  finish: WoodFinish
}
export interface DoorWork { paint: boolean; condition: WoodCondition; kind: DoorKind; /** null = the room's doors */ count: number | null; topcoats: number }
export interface FrameWork { paint: boolean; condition: WoodCondition; /** null = the room's windows */ count: number | null; topcoats: number }

export interface DecoRoom {
  id: string
  name: string
  kindId: string
  lengthM: number
  widthM: number
  heightM: number
  doors: number
  windows: number
  wallAreaOverrideM2: number | null
  ceilingAreaOverrideM2: number | null
  /** null = the job's situation */
  situationId: string | null
  protect: boolean
  walls: SurfaceWork & { finish: WallFinish }
  ceiling: SurfaceWork
  woodwork: WoodworkWork
  doorWork: DoorWork
  frames: FrameWork
}

/** What a new room starts as: walls and ceiling painted, the woodwork and doors off until they are wanted. */
export function newDecoRoom(id: string, name: string, kindId: string): DecoRoom {
  const k = ROOM_KIND_BY_ID[kindId] ?? ROOM_KIND_BY_ID.other
  return {
    id, name, kindId, lengthM: k.lengthM, widthM: k.widthM, heightM: k.heightM, doors: k.doors, windows: k.windows,
    wallAreaOverrideM2: null, ceilingAreaOverrideM2: null, situationId: null, protect: true,
    walls: { paint: true, condition: 'painted-good', prep: 'normal', coats: 2, finish: 'matt' },
    ceiling: { paint: true, condition: 'painted-good', prep: 'normal', coats: 2 },
    woodwork: { paint: false, condition: 'painted-good', skirtingLm: null, skirtingHeightMm: 120, architraveLm: null, railsLm: 0, otherLm: 0, topcoats: 2, finish: 'satin' },
    doorWork: { paint: false, condition: 'painted-good', kind: 'panelled', count: null, topcoats: 2 },
    frames: { paint: false, condition: 'painted-good', count: null, topcoats: 2 },
  }
}

// ── Sample material rates (£, ex VAT) and coverage ──────────────────────────────────────────────────────────────────────────────────────────────
export const MATERIAL_RATES = {
  wallMatt: 4.8,        // £/L trade vinyl matt emulsion
  wallSilk: 5.2,        // £/L
  ceiling: 4.0,         // £/L white ceiling emulsion
  mist: 4.8,            // £/L emulsion (thinned for the mist coat)
  sealer: 6.5,          // £/L primer / sealer
  woodPrimer: 10,       // £/L
  undercoat: 11,        // £/L
  satin: 14,            // £/L
  gloss: 13,            // £/L
  filler: 2.8,          // £/kg
  prepSundries: 0.2,    // £/m² of surface prepared, at 'normal' (light 0.5x, heavy 1.75x)
  strip: 0.4,           // £/m² stripper, sugar soap, sheets
  protectBase: 6,       // £ per room: dust sheets, tape, caulk
  protectPerM2: 0.5,    // £ per m² of floor
  steamerDay: 30,       // £/day wallpaper steamer
  towerWeek: 90,        // £/week access tower
} as const

/** m² covered by one litre of one coat */
export const COVERAGE = { wall: 12, ceiling: 12, mist: 20, sealer: 10, wood: 14 } as const
const FILLER_KG_PER_M2: Record<PrepLevel, number> = { light: 0.02, normal: 0.05, heavy: 0.12 }
const PREP_FACTOR: Record<PrepLevel, number> = { light: 0.5, normal: 1, heavy: 1.75 }

// ── Rough hours per unit, one painter ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const HOURS = {
  protectRoom: 0.4, protectPerM2Floor: 0.015,
  stripM2: 0.3, washM2: 0.02,
  fillSandM2: { light: 0.03, normal: 0.07, heavy: 0.15 } as Record<PrepLevel, number>,
  mistM2: 0.04, sealerM2: 0.04,
  wallCoatM2: 0.055, ceilingCoatM2: 0.07,
  skirtingLm: { new: 0.35, 'painted-good': 0.2, 'painted-poor': 0.32 } as Record<WoodCondition, number>,
  architraveLm: { new: 0.3, 'painted-good': 0.18, 'painted-poor': 0.28 } as Record<WoodCondition, number>,
  railLm: { new: 0.25, 'painted-good': 0.15, 'painted-poor': 0.24 } as Record<WoodCondition, number>,
  frameEach: { new: 1.5, 'painted-good': 1, 'painted-poor': 1.6 } as Record<WoodCondition, number>,
  doorEach: { new: 2.5, 'painted-good': 1.75, 'painted-poor': 2.5 } as Record<WoodCondition, number>,
  doorKindFactor: { flush: 1, panelled: 1.4, glazed: 1.6 } as Record<DoorKind, number>,
} as const

/** Square metres of timber surface per door (both faces, edges and the lining) by kind, for the paint */
const DOOR_PAINT_M2: Record<DoorKind, number> = { flush: 4, panelled: 4.8, glazed: 3.6 }
const FRAME_PAINT_M2 = 2.5
/** Face width painted on each kind of run, m */
const ARCHITRAVE_FACE_M = 0.07
const RAIL_FACE_M = 0.07
const OTHER_FACE_M = 0.1

export interface DecoInput {
  rooms: DecoRoom[]
  jobSituationId: string
  situations: DecoSituation[]
  /** unit rates in use, keyed by the MATERIAL_RATES names; missing = the sample rate */
  rates: Partial<Record<keyof typeof MATERIAL_RATES, number>>
  /** weeks of access tower hire for the job (optional, off by default) */
  towerWeeks: number
}

export interface DecoLine { id: string; name: string; category: 'materials' | 'plant'; unit: string; unitCost: number; qty: number; roomId?: string; wasteApplies: boolean }
export interface DecoLabourTask { key: string; roomId: string; group: 'prep' | 'paint' | 'wood'; task: string; hours: number; basis: string }
export interface DecoRoomSummary {
  roomId: string; name: string; floorM2: number; wallM2: number; ceilingM2: number
  skirtingLm: number; architraveLm: number; doorCount: number; frameCount: number
  stripM2: number; uplift: number
  /** plain phrases for the description: "strip the wallpaper", "mist coat", "2 coats of matt emulsion to the walls" */
  parts: string[]
}
export interface DecoResult { lines: DecoLine[]; labour: DecoLabourTask[]; rooms: DecoRoomSummary[]; totalStripM2: number; warnings: string[] }

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const nonNeg = (v: number, what: string) => { if (!(v >= 0)) throw new Error(`${what} cannot be negative.`) }

function surfaceAreas(room: DecoRoom) {
  const perimeter = 2 * (room.lengthM + room.widthM)
  const floorM2 = room.lengthM * room.widthM
  const gross = perimeter * room.heightM
  const wallM2 = room.wallAreaOverrideM2 ?? Math.max(0, gross - room.doors * DOOR_OPENING_M2 - room.windows * WINDOW_OPENING_M2)
  const ceilingM2 = room.ceilingAreaOverrideM2 ?? floorM2
  return { perimeter, floorM2, wallM2, ceilingM2 }
}

export function calculateDecoration(input: DecoInput): DecoResult {
  const job = input.situations.find(s => s.id === input.jobSituationId)
  if (!job) throw new Error('Choose the job situation.')
  for (const s of input.situations) if (!(s.upliftPct >= -50 && s.upliftPct <= 200)) throw new Error(`The extra for "${s.label}" must be between -50% and 200%.`)
  nonNeg(input.towerWeeks, 'The weeks of access tower')
  const rate = <K extends keyof typeof MATERIAL_RATES>(k: K): number => {
    const v = input.rates[k] ?? MATERIAL_RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }

  const lines: DecoLine[] = []
  const labour: DecoLabourTask[] = []
  const summaries: DecoRoomSummary[] = []
  const warnings: string[] = []
  let totalStripM2 = 0

  for (const room of input.rooms) {
    const rn = room.name.trim() || 'Room'
    for (const [v, w] of [[room.lengthM, 'length'], [room.widthM, 'width'], [room.heightM, 'height'], [room.doors, 'number of doors'], [room.windows, 'number of windows']] as [number, string][]) nonNeg(v, `The ${w} of ${rn}`)
    const sit = input.situations.find(s => s.id === (room.situationId ?? input.jobSituationId))
    if (!sit) throw new Error(`Choose a situation for ${rn}.`)
    const uplift = 1 + sit.upliftPct / 100
    const { perimeter, floorM2, wallM2, ceilingM2 } = surfaceAreas(room)
    if (room.walls.coats < 0 || room.ceiling.coats < 0) throw new Error(`The number of coats in ${rn} cannot be negative.`)
    if (room.heightM > 3.5 && input.towerWeeks <= 0 && room.ceiling.paint) warnings.push(`${rn} is ${n1(room.heightM)}m high: you may need an access tower (add weeks under Access).`)

    const parts: string[] = []
    const add = (key: string, name: string, category: 'materials' | 'plant', unit: string, unitCost: number, qty: number, wasteApplies = true) => {
      if (qty > 0 && unitCost >= 0) lines.push({ id: `${key}|${room.id}`, name: `${rn} — ${name}`, category, unit, unitCost: money(unitCost), qty: +qty.toFixed(3), roomId: room.id, wasteApplies })
    }
    const task = (key: string, group: DecoLabourTask['group'], what: string, parts2: { qty: number; unit: string; what: string; rate: number }[]) => {
      const used = parts2.filter(p => p.qty > 0 && p.rate > 0)
      if (used.length === 0) return
      const hours = hoursOf(used.reduce((s, p) => s + p.qty * p.rate, 0) * uplift)
      if (hours === 0) return
      labour.push({ key: `${key}|${room.id}`, roomId: room.id, group, task: `${rn} — ${what}`, hours,
        basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${+p.rate.toFixed(3)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    }

    // ── Preparation and protection ─────────────────────────────────────────────
    const prepParts: { qty: number; unit: string; what: string; rate: number }[] = []
    if (room.protect) {
      prepParts.push({ qty: 1, unit: 'room', what: 'protect floors and fittings', rate: HOURS.protectRoom }, { qty: floorM2, unit: 'm²', what: 'floor', rate: HOURS.protectPerM2Floor })
      add('protect', 'dust sheets, masking tape and caulk', 'materials', 'item', rate('protectBase') + rate('protectPerM2') * floorM2, 1, false)
    }
    let stripM2 = 0, fillWallKg = 0, fillCeilKg = 0, sealerM2 = 0, mistM2 = 0, prepSundries = 0
    const surface = (label: 'walls' | 'ceiling', area: number, s: SurfaceWork) => {
      if (!s.paint || area <= 0) return
      if (s.condition === 'wallpaper') { stripM2 += area; prepParts.push({ qty: area, unit: 'm²', what: `${label} stripped`, rate: HOURS.stripM2 }) }
      if (s.condition !== 'new-plaster') prepParts.push({ qty: area, unit: 'm²', what: `${label} washed down`, rate: HOURS.washM2 })
      prepParts.push({ qty: area, unit: 'm²', what: `${label} filled and sanded (${s.prep})`, rate: HOURS.fillSandM2[s.prep] })
      const kg = area * FILLER_KG_PER_M2[s.prep]
      if (label === 'walls') fillWallKg += kg; else fillCeilKg += kg
      prepSundries += area * PREP_FACTOR[s.prep] * rate('prepSundries')
      if (s.condition === 'new-plaster') mistM2 += area
      if (s.condition === 'painted-poor' || s.condition === 'wallpaper') sealerM2 += area
    }
    surface('walls', wallM2, room.walls)
    surface('ceiling', ceilingM2, room.ceiling)
    totalStripM2 += stripM2
    add('strip', 'wallpaper stripper and sugar soap', 'materials', 'm²', rate('strip'), stripM2, false)
    add('filler', 'filler', 'materials', 'kg', rate('filler'), fillWallKg + fillCeilKg)
    add('prep-sundries', 'sandpaper and prep sundries', 'materials', 'item', prepSundries, prepSundries > 0 ? 1 : 0, false)
    task('prep', 'prep', 'preparation (protect, strip, wash, fill and sand)', prepParts)
    if (stripM2 > 0) parts.push('strip the wallpaper')
    if (fillWallKg + fillCeilKg > 0) parts.push('fill and sand')

    // ── Painting the walls and ceiling ─────────────────────────────────────────
    const paintParts: { qty: number; unit: string; what: string; rate: number }[] = []
    if (mistM2 > 0) { add('mist', 'mist coat on new plaster', 'materials', 'L', rate('mist'), mistM2 / COVERAGE.mist); paintParts.push({ qty: mistM2, unit: 'm²', what: 'mist coat', rate: HOURS.mistM2 }); parts.push('a mist coat on the new plaster') }
    if (sealerM2 > 0) { add('sealer', 'primer / sealer', 'materials', 'L', rate('sealer'), sealerM2 / COVERAGE.sealer); paintParts.push({ qty: sealerM2, unit: 'm²', what: 'sealer coat', rate: HOURS.sealerM2 }); parts.push('a sealer coat') }
    if (room.walls.paint && wallM2 > 0) {
      const coats = room.walls.coats
      add('wall-paint', `${room.walls.finish === 'silk' ? 'silk' : 'matt'} emulsion to the walls (${coats} coat${coats === 1 ? '' : 's'})`, 'materials', 'L', rate(room.walls.finish === 'silk' ? 'wallSilk' : 'wallMatt'), (wallM2 * coats) / COVERAGE.wall)
      paintParts.push({ qty: wallM2 * coats, unit: 'm²', what: 'wall coats', rate: HOURS.wallCoatM2 })
      if (coats > 0) parts.push(`${coats} coat${coats === 1 ? '' : 's'} of ${room.walls.finish} emulsion to the walls`)
    }
    if (room.ceiling.paint && ceilingM2 > 0) {
      const coats = room.ceiling.coats
      add('ceiling-paint', `white emulsion to the ceiling (${coats} coat${coats === 1 ? '' : 's'})`, 'materials', 'L', rate('ceiling'), (ceilingM2 * coats) / COVERAGE.ceiling)
      paintParts.push({ qty: ceilingM2 * coats, unit: 'm²', what: 'ceiling coats', rate: HOURS.ceilingCoatM2 })
      if (coats > 0) parts.push(`${coats} coat${coats === 1 ? '' : 's'} of white emulsion to the ceiling`)
    }
    task('paint', 'paint', 'paint the walls and ceiling', paintParts)

    // ── Woodwork, doors and window frames ──────────────────────────────────────
    const wood = room.woodwork
    const skirtingLm = wood.skirtingLm ?? Math.max(0, perimeter - room.doors * 0.9)
    const architraveLm = wood.architraveLm ?? room.doors * ARCHITRAVE_PER_DOOR_LM
    const doorCount = room.doorWork.count ?? room.doors
    const frameCount = room.frames.count ?? room.windows
    const woodParts: { qty: number; unit: string; what: string; rate: number }[] = []
    // paint area by condition: [primerM2, undercoatM2, topcoatM2 (all coats)]
    const need = { primer: 0, under: 0, top: 0 }
    const woodRun = (cond: WoodCondition, area: number, topcoats: number) => {
      if (area <= 0) return
      if (cond !== 'painted-good') { need.primer += area; need.under += area }
      need.top += area * topcoats
    }
    let satinM2 = 0, glossM2 = 0
    if (wood.paint) {
      const heightFactor = Math.min(1.8, Math.max(0.8, wood.skirtingHeightMm / 150))
      woodParts.push(
        { qty: skirtingLm * heightFactor, unit: 'lm', what: 'skirting', rate: HOURS.skirtingLm[wood.condition] },
        { qty: architraveLm, unit: 'lm', what: 'architrave', rate: HOURS.architraveLm[wood.condition] },
        { qty: wood.railsLm, unit: 'lm', what: 'rails', rate: HOURS.railLm[wood.condition] },
        { qty: wood.otherLm, unit: 'lm', what: 'other woodwork', rate: HOURS.railLm[wood.condition] },
      )
      const a = skirtingLm * (wood.skirtingHeightMm / 1000) + architraveLm * ARCHITRAVE_FACE_M + wood.railsLm * RAIL_FACE_M + wood.otherLm * OTHER_FACE_M
      woodRun(wood.condition, a, wood.topcoats)
      if (wood.finish === 'gloss') glossM2 += a * wood.topcoats; else satinM2 += a * wood.topcoats
      if (skirtingLm > 0) parts.push('paint the skirting boards')
      if (architraveLm > 0) parts.push('paint the architraves')
      if (wood.railsLm > 0) parts.push('paint the picture rails')
    }
    if (room.doorWork.paint && doorCount > 0) {
      woodParts.push({ qty: doorCount, unit: room.doorWork.kind === 'glazed' ? 'glazed doors' : room.doorWork.kind === 'panelled' ? 'panelled doors' : 'flush doors', what: '', rate: HOURS.doorEach[room.doorWork.condition] * HOURS.doorKindFactor[room.doorWork.kind] })
      const a = doorCount * DOOR_PAINT_M2[room.doorWork.kind]
      woodRun(room.doorWork.condition, a, room.doorWork.topcoats)
      satinM2 += a * room.doorWork.topcoats
      parts.push(`paint ${doorCount} door${doorCount === 1 ? '' : 's'}`)
    }
    if (room.frames.paint && frameCount > 0) {
      woodParts.push({ qty: frameCount, unit: 'window frames', what: '', rate: HOURS.frameEach[room.frames.condition] })
      const a = frameCount * FRAME_PAINT_M2
      woodRun(room.frames.condition, a, room.frames.topcoats)
      satinM2 += a * room.frames.topcoats
      parts.push(`paint ${frameCount} window frame${frameCount === 1 ? '' : 's'}`)
    }
    add('wood-primer', 'wood primer', 'materials', 'L', rate('woodPrimer'), need.primer / COVERAGE.wood)
    add('wood-undercoat', 'undercoat', 'materials', 'L', rate('undercoat'), need.under / COVERAGE.wood)
    add('wood-satin', 'satin topcoat to woodwork and doors', 'materials', 'L', rate('satin'), satinM2 / COVERAGE.wood)
    add('wood-gloss', 'gloss topcoat to woodwork', 'materials', 'L', rate('gloss'), glossM2 / COVERAGE.wood)
    task('wood', 'wood', 'paint the woodwork, doors and window frames', woodParts)

    summaries.push({
      roomId: room.id, name: rn, floorM2: money(floorM2), wallM2: money(room.walls.paint ? wallM2 : 0), ceilingM2: money(room.ceiling.paint ? ceilingM2 : 0),
      skirtingLm: money(wood.paint ? skirtingLm : 0), architraveLm: money(wood.paint ? architraveLm : 0),
      doorCount: room.doorWork.paint ? doorCount : 0, frameCount: room.frames.paint ? frameCount : 0, stripM2: money(stripM2), uplift: sit.upliftPct, parts,
    })
    if (parts.length === 0) warnings.push(`${rn} has nothing switched on to paint.`)
    if (wallM2 > 0 && room.walls.paint && room.walls.coats === 0 && room.walls.condition !== 'new-plaster') warnings.push(`${rn}: the walls are set to 0 coats.`)
  }

  // Job-level hire
  if (totalStripM2 > 0) lines.push({ id: 'steamer', name: 'Wallpaper steamer hire', category: 'plant', unit: 'day', unitCost: money(rate('steamerDay')), qty: Math.max(1, Math.ceil(totalStripM2 / 60)), wasteApplies: false })
  if (input.towerWeeks > 0) lines.push({ id: 'tower', name: 'Access tower hire', category: 'plant', unit: 'week', unitCost: money(rate('towerWeek')), qty: input.towerWeeks, wasteApplies: false })
  return { lines, labour, rooms: summaries, totalStripM2: money(totalStripM2), warnings }
}
