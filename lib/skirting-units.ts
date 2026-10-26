// Skirtings, architraves and trim, priced room by room (Joinery & Fixtures → Skirtings, Architraves & Trim (by room)). Each room has its skirting (a profile, the length of wall round the room less the doors, any fitted
// units and the like, plus anything added back), the mitred and scribed corners, and the extras the job may have: architraves to doors that are not on the Windows & Doors schedule and to windows, dado rail, picture rail
// and scotia or quadrant. The timber is priced per metre from a sample rate for its profile with a waste allowance (or left out when the client supplies it), the carpenter's time per metre of each profile plus a
// time for each corner, and an awkward or occupied job adds time. The door and window units themselves (and the architrave that goes with a door on that schedule) are Windows & Doors; taking OLD skirting or doors off is
// Demolition → Strip-Out by Room; painting is Decoration.
//
// Every rate here is a SAMPLE price or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node.

export type SkirtingProfileId = 'mdf-chamfer' | 'mdf-ogee' | 'mdf-victorian' | 'softwood-100' | 'softwood-150' | 'oak-125'
export interface SkirtingProfile {
  id: SkirtingProfileId; label: string; word: string
  /** sample £ per metre of timber */
  perLm: number
  /** the carpenter's hours per metre fixed (scribed to the floor and walls), straight runs only */
  hrsPerLm: number
  /** can be bought ready-primed: the paint is Decoration */
  primed: boolean
}
export const SKIRTING_PROFILES: SkirtingProfile[] = [
  { id: 'mdf-chamfer', label: 'MDF chamfered 120mm (primed)', word: '120mm primed MDF chamfered skirting', perLm: 2.8, hrsPerLm: 0.16, primed: true },
  { id: 'mdf-ogee', label: 'MDF ogee / torus 144mm (primed)', word: '144mm primed MDF ogee skirting', perLm: 4.2, hrsPerLm: 0.17, primed: true },
  { id: 'mdf-victorian', label: 'MDF Victorian 200mm (primed)', word: '200mm primed MDF Victorian skirting', perLm: 8.5, hrsPerLm: 0.21, primed: true },
  { id: 'softwood-100', label: 'Softwood 100 x 19mm', word: '100 x 19mm softwood skirting', perLm: 3.6, hrsPerLm: 0.17, primed: false },
  { id: 'softwood-150', label: 'Softwood 150 x 25mm', word: '150 x 25mm softwood skirting', perLm: 7.5, hrsPerLm: 0.21, primed: false },
  { id: 'oak-125', label: 'Oak 125 x 20mm', word: '125 x 20mm oak skirting', perLm: 13, hrsPerLm: 0.27, primed: false },
]
export const SKIRTING_PROFILE_BY_ID: Record<string, SkirtingProfile> = Object.fromEntries(SKIRTING_PROFILES.map(p => [p.id, p]))

export type ArchitraveId = 'mdf-chamfer' | 'mdf-ogee' | 'softwood' | 'victorian' | 'oak'
export interface ArchitraveProfile { id: ArchitraveId; label: string; word: string; perLm: number; hrsPerLm: number; primed: boolean }
export const ARCHITRAVE_PROFILES: ArchitraveProfile[] = [
  { id: 'mdf-chamfer', label: 'MDF chamfered 70mm (primed)', word: '70mm primed MDF chamfered architrave', perLm: 1.9, hrsPerLm: 0.09, primed: true },
  { id: 'mdf-ogee', label: 'MDF ogee 70mm (primed)', word: '70mm primed MDF ogee architrave', perLm: 2.3, hrsPerLm: 0.09, primed: true },
  { id: 'softwood', label: 'Softwood 70 x 19mm', word: '70 x 19mm softwood architrave', perLm: 2.6, hrsPerLm: 0.1, primed: false },
  { id: 'victorian', label: 'MDF Victorian 100mm (primed)', word: '100mm primed MDF Victorian architrave', perLm: 5.8, hrsPerLm: 0.11, primed: true },
  { id: 'oak', label: 'Oak 90 x 20mm', word: '90 x 20mm oak architrave', perLm: 8.5, hrsPerLm: 0.13, primed: false },
]
export const ARCHITRAVE_BY_ID: Record<string, ArchitraveProfile> = Object.fromEntries(ARCHITRAVE_PROFILES.map(p => [p.id, p]))

/** The other lengths of trim a room may have: typed in metres */
export type RailKind = 'dado' | 'picture' | 'scotia'
export const RAILS: { id: RailKind; label: string; word: string; perLm: number; hrsPerLm: number }[] = [
  { id: 'dado', label: 'Dado rail', word: 'dado rail', perLm: 3.8, hrsPerLm: 0.14 },
  { id: 'picture', label: 'Picture rail', word: 'picture rail', perLm: 3.4, hrsPerLm: 0.12 },
  { id: 'scotia', label: 'Scotia or quadrant', word: 'scotia or quadrant', perLm: 1.2, hrsPerLm: 0.08 },
]
export const RAIL_BY_ID: Record<string, (typeof RAILS)[number]> = Object.fromEntries(RAILS.map(r => [r.id, r]))

/** Hours for a corner: a scribed (cut to fit) internal corner and a mitred external one */
export const HOURS = { internalCorner: 0.12, externalCorner: 0.2, plinthBlock: 0.1 }
/** Opening lengths of trim used for one of each: a door set both sides (2 x (2 x 2.04 + 0.83)), a window set round (1200 x 1200) */
export const DOOR_SET_LM = 9.8
export const WINDOW_SET_LM = 4.8
/** Sample rates, £: sundries per metre of trim (adhesive, pins, filler, caulk), a plinth block each */
export const RATES = { sundriesPerLm: 0.4, plinthBlock: 2.2 }
/** The width taken off the skirting for each door: the opening plus the architrave on both sides */
export const DOOR_DEDUCT_M = 0.9

export interface TrimSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_TRIM_SITUATIONS: TrimSituation[] = [
  { id: 'empty', label: 'Empty rooms (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (floors and furniture to protect)', upliftPct: 15 },
  { id: 'hard', label: 'Awkward (upstairs, tight rooms, no lift)', upliftPct: 20 },
]

export interface TrimRoomKind {
  id: string; label: string; lengthM: number; widthM: number; doors: number; windows: number
  /** has skirting in the usual house (wet rooms are tiled to the floor) */
  skirting: boolean
}
export const TRIM_ROOM_KINDS: TrimRoomKind[] = [
  { id: 'hall', label: 'Hall / landing', lengthM: 4, widthM: 1.5, doors: 3, windows: 0, skirting: true },
  { id: 'living', label: 'Living room', lengthM: 5, widthM: 4, doors: 1, windows: 2, skirting: true },
  { id: 'dining', label: 'Dining room', lengthM: 4, widthM: 3.5, doors: 1, windows: 1, skirting: true },
  { id: 'kitchen', label: 'Kitchen', lengthM: 4, widthM: 3.5, doors: 1, windows: 1, skirting: true },
  { id: 'utility', label: 'Utility room', lengthM: 2.5, widthM: 2, doors: 1, windows: 1, skirting: true },
  { id: 'bedroom', label: 'Bedroom', lengthM: 4, widthM: 3.5, doors: 1, windows: 1, skirting: true },
  { id: 'study', label: 'Study / small bedroom', lengthM: 3, widthM: 2.5, doors: 1, windows: 1, skirting: true },
  { id: 'bathroom', label: 'Bathroom / WC (tiled)', lengthM: 2.5, widthM: 2, doors: 1, windows: 1, skirting: false },
  { id: 'other', label: 'Other room', lengthM: 4, widthM: 3, doors: 1, windows: 1, skirting: true },
]
export const TRIM_ROOM_KIND_BY_ID: Record<string, TrimRoomKind> = Object.fromEntries(TRIM_ROOM_KINDS.map(k => [k.id, k]))

export interface TrimRoom {
  id: string
  name: string
  kindId: string
  lengthM: number
  widthM: number
  /** the length of wall round the room when it is not a plain rectangle (from the plan or typed): blank = 2 x (length + width) */
  perimeterOverrideM: number | null
  /** the doors in the room (each takes a gap out of the skirting) */
  doors: number
  /** the total width of the doors when known (from the plan), m: blank = doors x the usual */
  doorWidthM: number | null
  /** wide openings with no skirting (patio, bi-fold or arch), m, and the run of fitted units, bath or the like, m */
  deductLm: number
  /** added back: chimney breasts, alcoves, returns, m */
  addLm: number
  skirting: boolean
  skirtingId: SkirtingProfileId
  internalCorners: number
  externalCorners: number
  plinthBlocks: number
  /** architraves to doors NOT on the Windows & Doors schedule (sets, both sides), and to windows (sets) */
  doorArchSets: number
  windowArchSets: number
  architraveId: ArchitraveId
  /** the other trim, m */
  railsLm: Record<RailKind, number>
  /** who supplies the timber: us, or the client (we fit only) */
  clientSupplies: boolean
  /** this room's own situation, if not the job's */
  situationId?: string | null
  /** made from a plan room, and when the plan's size was last fed in */
  planRoomId?: string
  planRoomSig?: string
  /** fed from the Take-off drawing */
  fromPlan?: { areaM2: number; perimeterM: number; name?: string }
}

export function newTrimRoom(id: string, name: string, kindId: string, kind: TrimRoomKind, opts?: { skirtingId?: SkirtingProfileId; architraveId?: ArchitraveId }): TrimRoom {
  return {
    id, name, kindId, lengthM: kind.lengthM, widthM: kind.widthM, perimeterOverrideM: null, doors: kind.doors, doorWidthM: null, deductLm: 0, addLm: 0,
    skirting: kind.skirting, skirtingId: opts?.skirtingId ?? 'mdf-chamfer', internalCorners: 4, externalCorners: 0, plinthBlocks: 0,
    doorArchSets: 0, windowArchSets: 0, architraveId: opts?.architraveId ?? 'mdf-chamfer', railsLm: { dado: 0, picture: 0, scotia: 0 }, clientSupplies: false,
  }
}

export const roomPerimeterM = (r: Pick<TrimRoom, 'lengthM' | 'widthM' | 'perimeterOverrideM'>) => (r.perimeterOverrideM != null && r.perimeterOverrideM > 0 ? r.perimeterOverrideM : 2 * (r.lengthM + r.widthM))
/** The length of skirting to fit: the wall round the room less the doors and other gaps, plus anything added back */
export function skirtingLmOf(r: TrimRoom): number {
  const doors = r.doorWidthM != null ? r.doorWidthM : r.doors * DOOR_DEDUCT_M
  return Math.max(0, roomPerimeterM(r) - doors - r.deductLm + r.addLm)
}

export interface TrimLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface TrimLabourTask { key: string; roomId: string; trade: 'carpenter'; task: string; hours: number; basis: string }
export interface TrimRoomSummary { roomId: string; name: string; skirtingLm: number; trimLm: number; parts: string[]; hours: number }
export interface TrimResult {
  lines: TrimLine[]
  labour: TrimLabourTask[]
  rooms: TrimRoomSummary[]
  totalSkirtingLm: number
  totalTrimLm: number
  totalHours: number
  warnings: string[]
}

export interface TrimInput {
  rooms: TrimRoom[]
  /** the job's situation; a room can have its own */
  jobSituationId: string
  situations: TrimSituation[]
  /** extra timber bought for cuts and offcuts, % */
  wastePct: number
  /** sample rates typed over: skirting and architrave per metre by profile id, and the other rates */
  rates: Record<string, number>
}

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const nonNeg = (v: number, what: string) => { if (!(v >= 0)) throw new Error(`${what} cannot be negative.`) }

export function calculateTrim(input: TrimInput): TrimResult {
  if (!(input.wastePct >= 0) || input.wastePct > 50) throw new Error('The waste allowance must be between 0 and 50%.')
  const waste = 1 + input.wastePct / 100
  const lines: TrimLine[] = []
  const labour: TrimLabourTask[] = []
  const rooms: TrimRoomSummary[] = []
  const warnings: string[] = []
  let totalSkirtingLm = 0, totalTrimLm = 0, totalHours = 0
  const rate = (key: string, fallback: number) => (input.rates[key] != null ? input.rates[key] : fallback)
  const jobSit = input.situations.find(s => s.id === input.jobSituationId) ?? input.situations[0]
  let anyClient = false, anyArch = false

  for (const r of input.rooms) {
    const label = r.name.trim() || 'Room'
    nonNeg(r.lengthM, `${label}: the length`); nonNeg(r.widthM, `${label}: the width`)
    nonNeg(r.deductLm, `${label}: the length taken off`); nonNeg(r.addLm, `${label}: the length added`)
    nonNeg(r.doors, `${label}: the doors`); nonNeg(r.internalCorners, `${label}: the internal corners`); nonNeg(r.externalCorners, `${label}: the external corners`)
    nonNeg(r.plinthBlocks, `${label}: the plinth blocks`); nonNeg(r.doorArchSets, `${label}: the door architraves`); nonNeg(r.windowArchSets, `${label}: the window architraves`)
    for (const k of Object.keys(r.railsLm) as RailKind[]) nonNeg(r.railsLm[k] ?? 0, `${label}: the ${RAIL_BY_ID[k].label.toLowerCase()}`)
    if (r.perimeterOverrideM != null && r.perimeterOverrideM < 0) throw new Error(`${label}: the length of wall cannot be negative.`)

    const sit = input.situations.find(s => s.id === r.situationId) ?? jobSit
    const uplift = 1 + (sit?.upliftPct ?? 0) / 100
    const parts: string[] = []
    const hrs: { what: string; h: number }[] = []
    const addHours = (what: string, h: number) => { if (h > 0) hrs.push({ what, h }) }
    let trimLm = 0
    let skirtLm = 0

    // ── skirting ─────────────────────────────────────────────────────────────────
    if (r.skirting) {
      const prof = SKIRTING_PROFILE_BY_ID[r.skirtingId] ?? SKIRTING_PROFILES[0]
      const raw = roomPerimeterM(r) - (r.doorWidthM != null ? r.doorWidthM : r.doors * DOOR_DEDUCT_M) - r.deductLm + r.addLm
      if (raw < 0) warnings.push(`${label}: the doors and other gaps take off more skirting than there is wall: check the room size and the doors.`)
      skirtLm = Math.max(0, raw)
      if (skirtLm > 0) {
        const buy = skirtLm * waste
        if (!r.clientSupplies) lines.push({ id: `skirt|${r.id}`, name: `${prof.label} skirting (incl. ${input.wastePct}% waste)`, category: 'materials', unit: 'lm', unitCost: rate('skirt:' + prof.id, prof.perLm), qty: money(buy), roomId: r.id })
        addHours(`${n1(skirtLm)}m of skirting`, skirtLm * prof.hrsPerLm)
        addHours(`${r.internalCorners} internal and ${r.externalCorners} external corner${r.internalCorners + r.externalCorners === 1 ? '' : 's'}`, r.internalCorners * HOURS.internalCorner + r.externalCorners * HOURS.externalCorner)
        parts.push(`${n1(skirtLm)}m of ${prof.word}${r.clientSupplies ? ' (supplied by the client)' : ''}`)
        trimLm += skirtLm
        if (r.plinthBlocks > 0) {
          if (!r.clientSupplies) lines.push({ id: `plinth|${r.id}`, name: 'plinth blocks', category: 'materials', unit: 'nr', unitCost: rate('plinthBlock', RATES.plinthBlock), qty: r.plinthBlocks, roomId: r.id })
          addHours(`${r.plinthBlocks} plinth block${r.plinthBlocks === 1 ? '' : 's'}`, r.plinthBlocks * HOURS.plinthBlock)
          parts.push(`${r.plinthBlocks} plinth block${r.plinthBlocks === 1 ? '' : 's'}`)
        }
        if (!prof.primed && !r.clientSupplies) warnings.push(`${label}: ${prof.label.toLowerCase()} is bought raw: priming or sealing it is Decoration.`)
        if ((r.internalCorners + r.externalCorners) === 0) warnings.push(`${label}: no corners are counted for the skirting: a plain rectangle has 4 internal corners.`)
      }
    }

    // ── architraves ──────────────────────────────────────────────────────────────
    const arch = ARCHITRAVE_BY_ID[r.architraveId] ?? ARCHITRAVE_PROFILES[0]
    if (r.doorArchSets > 0 || r.windowArchSets > 0) {
      anyArch = true
      const lm = r.doorArchSets * DOOR_SET_LM + r.windowArchSets * WINDOW_SET_LM
      if (!r.clientSupplies) lines.push({ id: `arch|${r.id}`, name: `${arch.label} architrave (incl. ${input.wastePct}% waste)`, category: 'materials', unit: 'lm', unitCost: rate('arch:' + arch.id, arch.perLm), qty: money(lm * waste), roomId: r.id })
      addHours(`${n1(lm)}m of architrave`, lm * arch.hrsPerLm)
      const bits = [r.doorArchSets > 0 && `${r.doorArchSets} door${r.doorArchSets === 1 ? '' : 's'}`, r.windowArchSets > 0 && `${r.windowArchSets} window${r.windowArchSets === 1 ? '' : 's'}`].filter(Boolean) as string[]
      parts.push(`${arch.word} to ${bits.join(' and ')}${r.clientSupplies ? ' (supplied by the client)' : ''}`)
      trimLm += lm
      if (!arch.primed && !r.clientSupplies) warnings.push(`${label}: ${arch.label.toLowerCase()} is bought raw: priming or sealing it is Decoration.`)
    }

    // ── dado, picture rail, scotia ───────────────────────────────────────────────
    for (const rail of RAILS) {
      const lm = r.railsLm[rail.id] ?? 0
      if (!(lm > 0)) continue
      if (!r.clientSupplies) lines.push({ id: `rail-${rail.id}|${r.id}`, name: `${rail.label.toLowerCase()} (incl. ${input.wastePct}% waste)`, category: 'materials', unit: 'lm', unitCost: rate('rail:' + rail.id, rail.perLm), qty: money(lm * waste), roomId: r.id })
      addHours(`${n1(lm)}m of ${rail.word}`, lm * rail.hrsPerLm)
      parts.push(`${n1(lm)}m of ${rail.word}${r.clientSupplies ? ' (supplied by the client)' : ''}`)
      trimLm += lm
    }

    // ── the sundries, and the carpenter's time ───────────────────────────────────
    if (trimLm > 0) {
      lines.push({ id: `sundries|${r.id}`, name: 'adhesive, pins, filler and caulk', category: 'materials', unit: 'lm', unitCost: rate('sundriesPerLm', RATES.sundriesPerLm), qty: money(trimLm), roomId: r.id })
      if (r.clientSupplies) anyClient = true
    }
    const total = hrs.reduce((s, x) => s + x.h, 0) * uplift
    const hours = hoursOf(total)
    if (hours > 0) {
      labour.push({ key: `trim|${r.id}`, roomId: r.id, trade: 'carpenter', task: `${label} — skirting and trim`, hours,
        basis: hrs.map(x => `${x.what} ${n1(x.h)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
      totalHours += hours
    }
    totalSkirtingLm += skirtLm; totalTrimLm += trimLm
    rooms.push({ roomId: r.id, name: label, skirtingLm: money(skirtLm), trimLm: money(trimLm), parts, hours })
  }

  if (anyClient) warnings.push('Where the client supplies the timber, we fit only: check the profile and the quantity (with waste) before work starts.')
  if (anyArch) warnings.push('A door that is on the Windows & Doors schedule already has its architrave priced there: only add a door architrave here for a door that is not.')
  return { lines, labour, rooms, totalSkirtingLm: money(totalSkirtingLm), totalTrimLm: money(totalTrimLm), totalHours: money(totalHours), warnings }
}
