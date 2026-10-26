// What the AI quote can hand to the Joinery & Fixtures calculators (skirtings and trim, staircases, kitchen installation, fitted furniture, boxing-in and shelving) and to the Windows and Doors calculators:
// the rooms, staircases, kitchens, runs, items or openings the scope describes, checked here and turned into the values each calculator is opened with. Only what the scope says: a run of furniture with no
// stated width, a box with no length or an opening of a kind that belongs to the other calculator is left out (never invented); anything else not stated takes the calculator's own starting value and is
// reported, so the estimator checks it. Whatever the AI sends back is untrusted, so every value is checked and anything that does not check out is treated as "not stated". Pure (apart from the engines'
// own tables, which have no imports), so it can be tested.

import { isObj, between, whole, str } from './ai-spec'
import * as TRIM from './skirting-units'
import * as STAIR from './stairs-units'
import * as KITCHEN from './kitchen-fit-units'
import * as FURN from './fitted-furniture-units'
import * as SECOND from './boxing-shelving-units'
import * as WD from './wd-units'

export const JOINERY_AI_IDS = ['join-skirting-rooms', 'join-stairs-calc', 'join-kitchen-fit', 'join-furniture-calc', 'join-secondfix-calc', 'wd-windows', 'wd-doors'] as const
export const JOINERY_AI_SET: ReadonlySet<string> = new Set<string>(JOINERY_AI_IDS)

export interface AiJoinery {
  /** the calculator's own saved values by the name each screen keeps its state under */
  values: Record<string, Record<string, unknown>>
  /** plain words for what was priced, for the review note ("2 rooms of skirting") */
  what: string
  /** what the scope did not say and the calculator's standard was used: for the review note */
  assumed: string[]
}

const pick = <T extends string>(v: unknown, list: readonly T[]): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null)
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const list = (a: string[]) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`)
const uid = (p: string, i: number) => `${p}-ai${i + 1}`
const ids = (o: object) => Object.keys(o)
const items = (v: unknown, max: number): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObj).slice(0, max) : [])
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The situation the AI gave, if it is one of the calculator's own, else its start. */
const situation = (v: unknown, valid: string[], start: string): string => (typeof v === 'string' && valid.includes(v) ? v : start)

/** The sides of a room from its area when only that is stated: a rectangle about 4 to 3. */
function sidesFromArea(areaM2: number): { lengthM: number; widthM: number } {
  const w = Math.sqrt(areaM2 * 0.75)
  return { lengthM: Math.round((areaM2 / w) * 100) / 100, widthM: Math.round(w * 100) / 100 }
}

// ── Skirtings, architraves and trim ─────────────────────────────────────────────────

function skirting(spec: Record<string, unknown>): AiJoinery | null {
  const raws = items(spec.rooms, 20)
  if (raws.length === 0) return null
  const assumed: string[] = []
  const noSize: string[] = [], noDoors: string[] = [], noProfile: string[] = []
  const rooms = raws.map((raw, i) => {
    const kindId = pick(raw.kind, ids(TRIM.TRIM_ROOM_KIND_BY_ID)) ?? 'other'
    const kind = TRIM.TRIM_ROOM_KIND_BY_ID[kindId]
    const name = str(raw.name, 40) || kind.label.split(' / ')[0].split(' (')[0]
    const skirtingId = pick(raw.skirting, TRIM.SKIRTING_PROFILES.map(p => p.id))
    const architraveId = pick(raw.architrave, TRIM.ARCHITRAVE_PROFILES.map(p => p.id))
    const room = TRIM.newTrimRoom(uid('room', i), name, kindId, kind, { skirtingId: skirtingId ?? 'mdf-chamfer', architraveId: architraveId ?? 'mdf-chamfer' })
    const l = between(raw.lengthM, 0, 40), w = between(raw.widthM, 0, 40), a = between(raw.areaM2, 0, 400)
    if (l !== null && w !== null) { room.lengthM = l; room.widthM = w }
    else if (a !== null) { const s = sidesFromArea(a); room.lengthM = s.lengthM; room.widthM = s.widthM }
    else noSize.push(name)
    const per = between(raw.perimeterM, 0, 200); if (per !== null) room.perimeterOverrideM = per
    const doors = whole(raw.doors, 0, 12); if (doors !== null) room.doors = doors; else noDoors.push(name)
    if (!skirtingId) noProfile.push(name)
    if (raw.noSkirting === true) room.skirting = false
    const da = whole(raw.doorArchitraves, 0, 20), wa = whole(raw.windowArchitraves, 0, 20)
    if (da !== null) room.doorArchSets = da
    if (wa !== null) room.windowArchSets = wa
    const dado = between(raw.dadoRailM, 0, 100), pic = between(raw.pictureRailM, 0, 100), sco = between(raw.scotiaM, 0, 100)
    room.railsLm = { dado: dado ?? 0, picture: pic ?? 0, scotia: sco ?? 0 }
    if (bool(raw.clientSupplies) === true) room.clientSupplies = true
    return room
  })
  if (noSize.length) assumed.push(`the size of ${list(noSize)} (taken as the usual for that kind of room)`)
  if (noDoors.length) assumed.push(`the doors in ${list(noDoors)} (the usual for that kind of room)`)
  if (noProfile.length) assumed.push(`the skirting in ${list(noProfile)} (taken as 120mm primed MDF)`)
  return {
    values: { AssemblyTrimDemo: { rooms, jobSituationId: situation(spec.situation, TRIM.DEFAULT_TRIM_SITUATIONS.map(s => s.id), 'empty') } },
    what: `skirting and trim in ${plural(rooms.length, 'room', 'rooms')}`, assumed,
  }
}

// ── Staircases ───────────────────────────────────────────────────────────────────────

function stairs(spec: Record<string, unknown>): AiJoinery | null {
  const raws = items(spec.stairs, 6)
  if (raws.length === 0) return null
  const assumed: string[] = []
  const noHeight: string[] = [], noShape: string[] = [], noBuild: string[] = []
  const list2 = raws.map((raw, i) => {
    const st = STAIR.newStaircase(uid('st', i), `S${i + 1}`, str(raw.location, 40))
    const shape = pick(raw.shape, STAIR.STAIR_KINDS.map(k => k.id))
    if (shape) st.kind = shape; else noShape.push(st.ref)
    const h = between(raw.heightMm, 1500, 6000)
    if (h !== null) st.heightMm = Math.round(h); else noHeight.push(st.ref)
    const w = between(raw.widthMm, 500, 2500); if (w !== null) st.widthMm = Math.round(w)
    const mat = pick(raw.material, ids(STAIR.MATERIAL_LABEL) as STAIR.StairMaterial[]); if (mat) st.material = mat
    const build = pick(raw.build, ['kit', 'site'] as const); if (build) st.build = build; else noBuild.push(st.ref)
    if (bool(raw.clientSupplies) === true) st.clientSupplies = true
    const sides = whole(raw.balSides, 0, 2); if (sides !== null) st.balSides = sides as 0 | 1 | 2
    const style = pick(raw.balStyle, ids(STAIR.BAL_LABEL) as STAIR.BalStyle[]); if (style) st.balStyle = style
    if (bool(raw.wallHandrail) === true) st.wallHandrail = true
    if (bool(raw.openRisers) === true) st.openRisers = true
    const landing = between(raw.landingGuardingM, 0, 30); if (landing !== null) st.landingBalLm = landing
    return st
  })
  if (noShape.length) assumed.push(`the shape of ${list(noShape)} (taken as a straight flight)`)
  if (noHeight.length) assumed.push(`the floor-to-floor height of ${list(noHeight)} (taken as 2.6m)`)
  if (noBuild.length) assumed.push(`whether ${list(noBuild)} is a made staircase or built on site (taken as a made one)`)
  return { values: { AssemblyStairsDemo: { stairs: list2, jobSituationId: situation(spec.situation, STAIR.DEFAULT_STAIR_SITUATIONS.map(s => s.id), 'empty') } }, what: plural(list2.length, 'staircase', 'staircases'), assumed }
}

// ── Kitchens ─────────────────────────────────────────────────────────────────────────

function kitchens(spec: Record<string, unknown>): AiJoinery | null {
  const raws = items(spec.kitchens, 4)
  if (raws.length === 0) return null
  const assumed: string[] = []
  const usual: string[] = [], noWorktop: string[] = [], noSupply: string[] = []
  const list2 = raws.map((raw, i) => {
    const sizeId = pick(raw.size, KITCHEN.KITCHEN_KINDS.map(k => k.id)) ?? 'medium'
    const name = str(raw.name, 40) || (sizeId === 'utility' ? 'Utility room' : 'Kitchen')
    const k = KITCHEN.newKitchen(uid('k', i), name, sizeId)
    k.location = str(raw.location, 40)
    const u = isObj(raw.units) ? raw.units : null
    let any = false
    if (u) for (const kind of KITCHEN.UNIT_KINDS) { const n = whole(u[kind.id], 0, 60); if (n !== null) { if (!any) { k.units = KITCHEN.emptyUnits(); any = true } k.units[kind.id] = n } }
    if (!any) usual.push(name)
    const wm = pick(raw.worktop, ids(KITCHEN.WORKTOP_LABEL) as KITCHEN.WorktopMaterial[]); if (wm) k.worktopMaterial = wm
    const wl = between(raw.worktopLm, 0, 60)
    // units stated but no worktop: the worktop is left out (never the usual run's); no units stated at all: the usual run for the size, worktop included, and it is said
    if (wl !== null) k.worktopLm = wl
    else if (any) { k.worktopLm = 0; k.worktopJoints = 0; k.cutouts = 0 }
    else noWorktop.push(name)
    const co = whole(raw.cutouts, 0, 10); if (co !== null) k.cutouts = co
    const joints = whole(raw.worktopJoints, 0, 10); if (joints !== null) k.worktopJoints = joints
    const supply = pick(raw.unitSupply, ids(KITCHEN.SUPPLY_LABEL) as KITCHEN.UnitSupply[]); if (supply) k.unitSupply = supply; else noSupply.push(name)
    const range = pick(raw.range, ids(KITCHEN.RANGE_LABEL) as KITCHEN.UnitRange[]); if (range) k.range = range
    const pc = between(raw.unitsPc, 0, 200000); if (pc !== null) { k.unitsPc = pc; if (!supply) k.unitSupply = 'pc' }
    if (bool(raw.flatPack) !== null) k.flatPack = raw.flatPack as boolean
    if (bool(raw.worktopClientSupplies) !== null) k.worktopClientSupplies = raw.worktopClientSupplies as boolean
    const app = isObj(raw.appliances) ? raw.appliances : null
    if (app) for (const a of KITCHEN.APPLIANCES) { const n = whole(app[a.id], 0, 10); if (n !== null) k.appliances[a.id] = n }
    if (bool(raw.sinkFit) === true) k.sinkFit = true
    return k
  })
  if (usual.length) assumed.push(`the units in ${list(usual)} (taken as the usual run for a medium kitchen)`)
  if (noWorktop.length) assumed.push(`the worktop in ${list(noWorktop)} (the usual length for that size)`)
  if (noSupply.length) assumed.push(`who supplies the units in ${list(noSupply)} (taken as the client or the supplier, so only the fitting is priced)`)
  return { values: { AssemblyKitchenFitDemo: { kitchens: list2, jobSituationId: situation(spec.situation, KITCHEN.DEFAULT_KITCHEN_SITUATIONS.map(s => s.id), 'empty') } }, what: plural(list2.length, 'kitchen', 'kitchens'), assumed }
}

// ── Fitted furniture ───────────────────────────────────────────────────────────────

function furniture(spec: Record<string, unknown>): AiJoinery | null {
  const raws = items(spec.runs, 10)
  const assumed: string[] = []
  const noType: string[] = [], noBuild: string[] = []
  const list2: FURN.FurnRun[] = []
  raws.forEach((raw, i) => {
    const w = between(raw.widthMm, 300, 12000)
    if (w === null) return   // never invent the width of a run of furniture
    const kind = pick(raw.type, FURN.FURN_KINDS.map(k => k.id))
    const r = FURN.newFurnRun(uid('ff', i), `FF${list2.length + 1}`, kind ?? 'wardrobe-hinged')
    if (!kind) noType.push(r.ref)
    r.location = str(raw.location, 40)
    r.widthMm = Math.round(w)
    const h = between(raw.heightMm, 300, 3500); if (h !== null) { r.heightMm = Math.round(h); r.ceilingFiller = r.heightMm >= 2300 }
    const d = between(raw.depthMm, 100, 1500); if (d !== null) r.depthMm = Math.round(d)
    const build = pick(raw.build, ids(FURN.BUILD_LABEL) as FURN.FurnBuild[]); if (build) r.build = build; else noBuild.push(r.ref)
    const board = pick(raw.board, ids(FURN.BOARD_LABEL) as FURN.BoardMaterial[]); if (board) r.board = board
    const doors = pick(raw.doors, ids(FURN.DOOR_LABEL) as FURN.DoorType[]); if (doors) r.doors = doors
    const style = pick(raw.doorStyle, ids(FURN.STYLE_LABEL) as FURN.DoorStyle[]); if (style) r.doorStyle = style
    const dr = whole(raw.drawers, 0, 30); if (dr !== null) r.drawers = dr
    const kitPc = between(raw.kitPrice, 0, 100000); if (kitPc !== null) r.kitPc = kitPc
    list2.push(r)
  })
  if (list2.length === 0) return null
  if (noType.length) assumed.push(`the kind of furniture for ${list(noType)} (taken as a wardrobe with hinged doors)`)
  if (noBuild.length) assumed.push(`how ${list(noBuild)} is made (taken as built on site)`)
  return { values: { AssemblyFurnitureDemo: { runs: list2, jobSituationId: situation(spec.situation, FURN.DEFAULT_FURN_SITUATIONS.map(s => s.id), 'empty') } }, what: plural(list2.length, 'run of fitted furniture', 'runs of fitted furniture'), assumed }
}

// ── Boxing-in, shelving and second fix ─────────────────────────────────────────────

function secondFix(spec: Record<string, unknown>): AiJoinery | null {
  const raws = items(spec.items, 20)
  const assumed: string[] = []
  const noGirth: string[] = []
  const list2: SECOND.SecondFixItem[] = []
  raws.forEach((raw, i) => {
    const kind = pick(raw.kind, SECOND.SECOND_FIX_KINDS.map(k => k.id))
    if (!kind) return
    const it = SECOND.newSecondFixItem(uid('sf', i), `SF${list2.length + 1}`, kind)
    it.location = str(raw.location, 40)
    const len = between(raw.lengthM, 0, 100)
    const count = whole(raw.count, 1, 200)
    if (kind === 'box-pipe' || kind === 'box-steel') {
      if (len === null) return   // never invent the length of a box
      it.lengthM = len
      const g = between(raw.girthMm, 50, 3000); if (g !== null) it.girthMm = Math.round(g); else noGirth.push(it.ref)
      const ap = whole(raw.accessPanels, 0, 20); if (ap !== null) it.accessPanels = ap
      const bd = pick(raw.board, ids(SECOND.BOARD_LABEL) as SECOND.BoxBoard[]); if (bd) it.board = bd
    } else if (kind === 'shelf') {
      if (len === null) return
      it.lengthM = len
      if (count !== null) it.count = count
      const d = between(raw.depthMm, 50, 600); if (d !== null) it.depthMm = Math.round(d)
      const sty = pick(raw.shelfStyle, ids(SECOND.STYLE_LABEL) as SECOND.ShelfStyle[]); if (sty) it.shelfStyle = sty
      const mat = pick(raw.shelfMaterial, ids(SECOND.SHELF_MATERIAL_LABEL) as SECOND.ShelfMaterial[]); if (mat) it.shelfMaterial = mat
    } else if (kind === 'day') {
      const h = between(raw.hours, 0, 400)
      if (h === null) return   // never invent the hours
      it.hours = h
      const m = between(raw.materialsAllowance, 0, 100000); if (m !== null) it.materialsAllowance = m
    } else {
      if (count !== null) it.count = count
      if (kind === 'bath-panel') { const ap = whole(raw.accessPanels, 0, 5); if (ap !== null) it.accessPanels = ap }
      if (kind === 'loft-hatch' && bool(raw.ladder) === true) it.ladder = true
      if (kind === 'ironmongery') { const e = between(raw.eachCost, 0, 1000); if (e !== null) it.eachCost = e }
    }
    if (bool(raw.clientSupplies) === true) it.clientSupplies = true
    list2.push(it)
  })
  if (list2.length === 0) return null
  if (noGirth.length) assumed.push(`the girth of the boxing ${list(noGirth)} (taken as 450mm)`)
  return { values: { AssemblySecondFixDemo: { items: list2, jobSituationId: situation(spec.situation, SECOND.DEFAULT_SECOND_FIX_SITUATIONS.map(s => s.id), 'empty') } }, what: plural(list2.length, 'item', 'items'), assumed }
}

// ── Windows and doors ──────────────────────────────────────────────────────────────

function openings(canonicalId: 'wd-windows' | 'wd-doors', spec: Record<string, unknown>): AiJoinery | null {
  const scope = canonicalId === 'wd-windows' ? 'windows' : 'doors'
  const raws = items(spec.openings, 40)
  const assumed: string[] = []
  const noSize: string[] = []
  const out: WD.WdOpening[] = []
  const used = { W: 0, ID: 0, D: 0 }
  raws.forEach((raw, i) => {
    const kind = pick(raw.kind, WD.KINDS.map(k => k.id))
    if (!kind || !WD.kindInScope(kind, scope)) return   // a kind that belongs to the other calculator is not put in this one
    const prefix = WD.isWindow(kind) ? 'W' : WD.isInternalDoor(kind) ? 'ID' : 'D'
    used[prefix]++
    const o = WD.newOpening(uid('op', i), `${prefix}${used[prefix]}`, kind, str(raw.location, 40))
    const w = between(raw.widthMm, 200, 8000), h = between(raw.heightMm, 200, 4000)
    if (w !== null && h !== null) { o.widthMm = Math.round(w); o.heightMm = Math.round(h) } else noSize.push(WD.KIND_BY_ID[kind].label.toLowerCase())
    const q = whole(raw.qty, 1, 60); if (q !== null) o.qty = q
    const mat = pick(raw.material, ids(WD.MATERIAL_LABEL) as WD.WdMaterial[]); if (mat) o.material = mat
    const gl = pick(raw.glazing, ids(WD.GLAZING_LABEL) as WD.WdGlazing[]); if (gl) o.glazing = gl
    if (bool(raw.coloured) === true) o.coloured = true
    const sup = pick(raw.supply, ids(WD.SUPPLY_LABEL) as WD.WdSupply[]); if (sup) o.supply = sup
    const pc = between(raw.pcEach, 0, 100000); if (pc !== null) { o.pcEach = pc; if (!sup) o.supply = 'pc' }
    const sw = pick(raw.swing, ids(WD.SWING_LABEL) as WD.WdSwing[]); if (sw) o.swing = sw
    const cill = pick(raw.cill, ids(WD.CILL_LABEL) as WD.CillChoice[]); if (cill && WD.isWindow(kind)) o.cill = cill
    if (WD.isInternalDoor(kind)) {
      if (kind !== 'door-int-pocket' && bool(raw.existingFrame) === true) { o.existingFrame = true; o.lining = false }
      if (bool(raw.lining) !== null && !o.existingFrame && kind !== 'door-int-pocket') o.lining = raw.lining as boolean
      if (bool(raw.architrave) !== null) o.architrave = raw.architrave as boolean
      if (bool(raw.ironmongery) !== null) o.ironmongery = raw.ironmongery as boolean
    }
    out.push(o)
  })
  if (out.length === 0) return null
  const uniq = Array.from(new Set(noSize))
  if (uniq.length) assumed.push(`the size of the ${list(uniq)} (taken as the standard size)`)
  const total = out.reduce((s, o) => s + o.qty, 0)
  return {
    values: { [scope === 'windows' ? 'AssemblyWindowsDemo' : 'AssemblyDoorsDemo']: { openings: out, jobSituationId: situation(spec.situation, WD.DEFAULT_WD_SITUATIONS.map(s => s.id), 'ground') } },
    what: `${plural(total, scope === 'windows' ? 'window or glazed door' : 'door', scope === 'windows' ? 'windows and glazed doors' : 'doors')}`, assumed,
  }
}

/** Checks the "calc" object the AI gave for one of these calculator lines and returns what its calculator should be opened on, or null when the scope gave nothing usable for it. */
export function joineryFromScope(canonicalId: string, spec: unknown): AiJoinery | null {
  if (!JOINERY_AI_SET.has(canonicalId) || !isObj(spec)) return null
  switch (canonicalId) {
    case 'join-skirting-rooms': return skirting(spec)
    case 'join-stairs-calc': return stairs(spec)
    case 'join-kitchen-fit': return kitchens(spec)
    case 'join-furniture-calc': return furniture(spec)
    case 'join-secondfix-calc': return secondFix(spec)
    case 'wd-windows': return openings('wd-windows', spec)
    case 'wd-doors': return openings('wd-doors', spec)
    default: return null
  }
}

// ── What the AI is told ──────────────────────────────────────────────────────────────

/** The part of the AI's instructions that explains the "calc" object for the Joinery & Fixtures and the Windows and Doors calculator lines, with the exact words it may use. */
export function joineryPromptGuide(): string {
  const lists = {
    trimKinds: TRIM.TRIM_ROOM_KINDS.map(k => k.id).join('|'), skirts: TRIM.SKIRTING_PROFILES.map(p => p.id).join('|'), arch: TRIM.ARCHITRAVE_PROFILES.map(p => p.id).join('|'),
    stairKinds: STAIR.STAIR_KINDS.map(k => k.id).join('|'), kitchenSizes: KITCHEN.KITCHEN_KINDS.filter(k => k.id !== 'empty').map(k => k.id).join('|'),
    furn: FURN.FURN_KINDS.map(k => k.id).join('|'), sf: SECOND.SECOND_FIX_KINDS.map(k => k.id).join('|'),
    win: WD.KINDS.filter(k => WD.kindInScope(k.id, 'windows')).map(k => k.id).join('|'), door: WD.KINDS.filter(k => WD.kindInScope(k.id, 'doors')).map(k => k.id).join('|'),
  }
  return `For the Joinery & Fixtures and Windows & Doors calculator lines add a "calc" object with ONLY what the scope states (leave out anything not stated; never guess a size):
  - "Skirtings, Architraves & Trim (by room)": "calc": {"situation": "empty"|"occupied"|"hard", "rooms": [{"name": "Bedroom 1", "kind": "${lists.trimKinds}", "lengthM": <m>, "widthM": <m>, "areaM2": <m², instead of length and width>, "doors": <n>, "skirting": "${lists.skirts}", "architrave": "${lists.arch}", "doorArchitraves": <door sets, only for doors not in the windows and doors schedule>, "windowArchitraves": <n>, "dadoRailM": <m>, "pictureRailM": <m>, "scotiaM": <m>, "noSkirting": true if none, "clientSupplies": true if the client supplies the timber}]}
  - "Staircase & Balustrade (by staircase)": "calc": {"stairs": [{"location": "main stairs", "shape": "${lists.stairKinds}", "heightMm": <floor to floor>, "widthMm": <n>, "material": "softwood"|"mdf"|"oak", "build": "kit" (a made staircase)|"site" (built on site), "clientSupplies": true, "balSides": 0|1|2, "balStyle": "spindles"|"glass"|"rods", "wallHandrail": true, "openRisers": true, "landingGuardingM": <m>}]}
  - "Kitchen Installation (by kitchen)": "calc": {"kitchens": [{"name": "Kitchen", "size": "${lists.kitchenSizes}", "units": {"base": <n>, "wall": <n>, "tall": <n>, "cornerBase": <n>, "cornerWall": <n>}, "unitSupply": "client" (the client or the supplier delivers them)|"we"|"pc", "range": "budget"|"mid"|"high", "unitsPc": <£, for a provisional sum>, "flatPack": true|false, "worktop": "laminate"|"timber"|"stone", "worktopLm": <m>, "worktopClientSupplies": true|false, "cutouts": <n>, "worktopJoints": <n>, "appliances": {"fridge": <n>, "dishwasher": <n>, "washer": <n>, "oven": <n>, "hob": <n>, "hood": <n>}, "sinkFit": true}]}
  - "Fitted Furniture & Wardrobes (by run)": "calc": {"runs": [{"location": "bedroom 1", "type": "${lists.furn}", "widthMm": <n>, "heightMm": <n>, "depthMm": <n>, "build": "site"|"kit"|"client", "doors": "hinged"|"sliding"|"bifold"|"none", "doorStyle": "flat"|"shaker"|"mirror", "board": "mdf"|"ply"|"melamine", "drawers": <n>, "kitPrice": <£>}]} (a run with no stated width is left out)
  - "Boxing-in, Shelving & Second Fix (by item)": "calc": {"items": [{"kind": "${lists.sf}", "location": "bathroom", "lengthM": <m, for boxing and shelves>, "girthMm": <n, boxing>, "count": <n>, "depthMm": <n, shelves>, "shelfStyle": "bracket"|"floating"|"batten", "shelfMaterial": "pine"|"mdf"|"oak", "accessPanels": <n>, "ladder": true, "eachCost": <£, ironmongery>, "hours": <for kind day>, "materialsAllowance": <£>, "clientSupplies": true}]}
  - "Windows (by opening)" takes the windows (${lists.win}) and the glazed bi-fold and sliding patio doors; "Doors (by opening)" takes every other door (${lists.door}): "calc": {"situation": "ground"|"upper"|"hard", "openings": [{"kind": <one of those>, "location": "kitchen", "widthMm": <n>, "heightMm": <n>, "qty": <n>, "material": "upvc"|"aluminium"|"timber"|"composite"|"steel", "glazing": "single"|"double"|"triple", "coloured": true, "supply": "we"|"pc"|"client", "pcEach": <£>, "swing": "in-left"|"in-right"|"out-left"|"out-right", "cill": "none"|"internal"|"external"|"both", "existingFrame": true (an internal door fitted to a frame already in the wall), "lining": true|false, "architrave": true|false, "ironmongery": true|false}]}. A window or bi-fold goes on the Windows line and every other door on the Doors line, never both.`
}

