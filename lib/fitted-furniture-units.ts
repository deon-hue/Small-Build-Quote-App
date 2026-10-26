// Fitted furniture priced one run at a time (Joinery & Fixtures → Fitted Furniture & Wardrobes (by run)): a fitted wardrobe with hinged or sliding doors, alcove shelving or a bookcase, an under-stair cupboard, a media unit or
// desk run. Each run has its width, height and depth, how it is made (BUILT ON SITE from sheet board that is worked out from the bays, a bought KIT system we fit, or supplied by the CLIENT and fitted by us), the carcass
// board, the doors (hinged, sliding, bi-fold or open) and their finish, the bays with their shelves, hanging rails and drawers, the plinth and ceiling filler, and handles. The carpenter's time follows the board, the doors and
// the bays, with a labourer to help. Painting or spraying is Decoration, taking out old fitted furniture is Demolition → Strip-Out by Room, and the wiring for lights or sockets is Electrics.
//
// Every rate here is a SAMPLE price or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node.

export type FurnKind = 'wardrobe-hinged' | 'wardrobe-sliding' | 'alcove' | 'under-stair' | 'other'
export type FurnBuild = 'site' | 'kit' | 'client'
export type BoardMaterial = 'mdf' | 'ply' | 'melamine'
export type DoorType = 'hinged' | 'sliding' | 'bifold' | 'none'
export type DoorStyle = 'flat' | 'shaker' | 'mirror'

export interface FurnKindInfo {
  id: FurnKind; label: string; word: string
  width: number; height: number; depth: number
  doors: DoorType; shelvesPerBay: number; railsPerBay: number; drawers: number
  /** the run is made to fit the awkward shape of the space (under the stairs): more board wasted, more time cutting */
  awkward: boolean
  /** a bought kit system price per metre of width, £ (for the height of 2400mm) */
  kitPerLm: number
}
export const FURN_KINDS: FurnKindInfo[] = [
  { id: 'wardrobe-hinged', label: 'Fitted wardrobe, hinged doors', word: 'fitted wardrobe with hinged doors', width: 2400, height: 2400, depth: 600, doors: 'hinged', shelvesPerBay: 2, railsPerBay: 1, drawers: 0, awkward: false, kitPerLm: 280 },
  { id: 'wardrobe-sliding', label: 'Fitted wardrobe, sliding doors', word: 'fitted wardrobe with sliding doors', width: 2400, height: 2400, depth: 600, doors: 'sliding', shelvesPerBay: 2, railsPerBay: 1, drawers: 0, awkward: false, kitPerLm: 340 },
  { id: 'alcove', label: 'Alcove shelving or bookcase', word: 'alcove shelving', width: 1200, height: 2400, depth: 300, doors: 'none', shelvesPerBay: 5, railsPerBay: 0, drawers: 0, awkward: false, kitPerLm: 160 },
  { id: 'under-stair', label: 'Under-stair cupboard', word: 'under-stair cupboard', width: 1500, height: 1200, depth: 900, doors: 'hinged', shelvesPerBay: 1, railsPerBay: 0, drawers: 0, awkward: true, kitPerLm: 220 },
  { id: 'other', label: 'Media unit, desk or other fitted unit', word: 'fitted unit', width: 2000, height: 2000, depth: 400, doors: 'none', shelvesPerBay: 3, railsPerBay: 0, drawers: 2, awkward: false, kitPerLm: 240 },
]
export const FURN_KIND_BY_ID: Record<string, FurnKindInfo> = Object.fromEntries(FURN_KINDS.map(k => [k.id, k]))

export const BUILD_LABEL: Record<FurnBuild, string> = { site: 'Built on site (carcass, doors and fittings from the sizes)', kit: 'A bought kit system, fitted by us', client: 'Client or supplier delivers it (we fit only)' }
export const BOARD_LABEL: Record<BoardMaterial, string> = { mdf: 'MDF (for painting)', ply: 'Birch plywood', melamine: 'White melamine board' }
export const BOARD_WORD: Record<BoardMaterial, string> = { mdf: 'MDF', ply: 'birch plywood', melamine: 'melamine-faced board' }
export const DOOR_LABEL: Record<DoorType, string> = { hinged: 'Hinged doors', sliding: 'Sliding doors on a track', bifold: 'Bi-fold doors', none: 'No doors (open shelves)' }
export const STYLE_LABEL: Record<DoorStyle, string> = { flat: 'Flat panel (for painting)', shaker: 'Shaker style (for painting)', mirror: 'Mirrored' }
export const STYLE_WORD: Record<DoorStyle, string> = { flat: 'flat-panel', shaker: 'shaker-style', mirror: 'mirrored' }

/** Sample rates, £ */
export const RATES = {
  boardMdf: 11, boardPly: 38, boardMelamine: 14, backPanel: 4,
  doorHingedFlat: 70, doorHingedShaker: 105, doorHingedMirror: 130, doorSlidingFlat: 150, doorSlidingShaker: 195, doorSlidingMirror: 210, doorBifoldFlat: 95, doorBifoldShaker: 130, doorBifoldMirror: 150,
  rail: 7, drawer: 42, plinthPerLm: 6, fillerPerLm: 5, handle: 3.5, sundriesPerM2Board: 1.5, jobSundries: 20, bayFittings: 12,
} as const
export type FurnRateKey = keyof typeof RATES

export const HOURS = {
  setOut: 3, boardPerM2: 0.55, hingedDoor: 1, slidingBase: 3, slidingDoor: 0.8, bifoldBase: 2, bifoldDoor: 1.2, rail: 0.25, drawer: 1, plinthPerLm: 0.1, fillerPerLm: 0.15, handle: 0.08,
  kitPerBay: 1.8, kitDoor: 0.75,
} as const
/** The labourer who carries sheets and helps lift the carcass: this share of the carpenter's hours */
export const LABOURER_SHARE = 0.15
/** Board waste: sheets cut to size, and to an awkward shape under the stairs */
export const WASTE = 1.1
export const WASTE_AWKWARD = 1.3
/** The time cutting to an awkward shape takes this many times as long */
export const AWKWARD_HOURS_FACTOR = 1.4
export const HINGED_DOOR_WIDTH_MM = 450
export const SLIDING_DOOR_WIDTH_MM = 900
export const BIFOLD_LEAF_MM = 500
export const BAY_MM = 900
/** The plinth the carcass stands on, mm, and the shelf span that sags in 18mm board */
export const PLINTH_MM = 100
export const MAX_SHELF_SPAN_MM = 800

export interface FurnSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_FURN_SITUATIONS: FurnSituation[] = [
  { id: 'empty', label: 'Empty room (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (floors and furniture to protect)', upliftPct: 15 },
  { id: 'old', label: 'Old house (uneven walls, floor and ceiling to scribe to)', upliftPct: 20 },
]

export interface FurnRun {
  id: string
  ref: string
  location: string
  kind: FurnKind
  build: FurnBuild
  widthMm: number
  heightMm: number
  depthMm: number
  board: BoardMaterial
  doors: DoorType
  doorStyle: DoorStyle
  /** blank = one bay to every 900mm of width */
  bays: number | null
  shelvesPerBay: number
  railsPerBay: number
  drawers: number
  /** both ends of the run are against walls, so only the dividers between the bays are made */
  betweenWalls: boolean
  plinth: boolean
  /** a filler between the top and the ceiling, scribed to it (a floor-to-ceiling run) */
  ceilingFiller: boolean
  /** blank = the doors and drawers */
  handles: number | null
  weSupplyHandles: boolean
  /** a kit or client supply: the price of the kit, £, blank = the sample per metre */
  kitPc: number | null
  situationId?: string | null
}

export function newFurnRun(id: string, ref: string, kindId: FurnKind = 'wardrobe-hinged'): FurnRun {
  const k = FURN_KIND_BY_ID[kindId] ?? FURN_KINDS[0]
  return {
    id, ref, location: '', kind: k.id, build: 'site', widthMm: k.width, heightMm: k.height, depthMm: k.depth, board: k.id === 'alcove' || k.id === 'under-stair' ? 'mdf' : 'melamine',
    doors: k.doors, doorStyle: 'flat', bays: null, shelvesPerBay: k.shelvesPerBay, railsPerBay: k.railsPerBay, drawers: k.drawers, betweenWalls: true, plinth: true,
    ceilingFiller: k.height >= 2300, handles: null, weSupplyHandles: true, kitPc: null, situationId: null,
  }
}

export const baysOf = (r: Pick<FurnRun, 'widthMm' | 'bays'>) => Math.max(1, Math.round(r.bays ?? Math.ceil(r.widthMm / BAY_MM)))
export function doorCountOf(r: Pick<FurnRun, 'doors' | 'widthMm'>): number {
  if (r.doors === 'hinged') return Math.max(2, Math.ceil(r.widthMm / HINGED_DOOR_WIDTH_MM))
  if (r.doors === 'sliding') return Math.max(2, Math.ceil(r.widthMm / SLIDING_DOOR_WIDTH_MM))
  if (r.doors === 'bifold') return Math.max(2, Math.ceil(r.widthMm / BIFOLD_LEAF_MM))
  return 0
}

export interface FurnLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface FurnLabourTask { key: string; roomId: string; trade: 'carpenter' | 'labourer'; task: string; hours: number; basis: string }
export interface FurnSummary { runId: string; ref: string; name: string; bays: number; doors: number; boardM2: number; parts: string[]; hours: number }
export interface FurnResult {
  lines: FurnLine[]
  labour: FurnLabourTask[]
  runs: FurnSummary[]
  totalWidthM: number
  totalBoardM2: number
  totalHours: number
  warnings: string[]
}
export interface FurnInput {
  runs: FurnRun[]
  jobSituationId: string
  situations: FurnSituation[]
  rates: Partial<Record<FurnRateKey, number>>
}

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()

/** The sheet board a built-on-site run needs, m² (before waste): the dividers (and end panels), the top and the bottom, the shelves. The back is separate. */
export function boardAreaM2(r: FurnRun): { dividers: number; topBottom: number; shelves: number; total: number } {
  const bays = baysOf(r)
  const H = r.heightMm / 1000, D = r.depthMm / 1000, W = r.widthMm / 1000
  const panels = r.betweenWalls ? bays - 1 : bays + 1
  const dividers = Math.max(0, panels) * H * D
  const topBottom = 2 * W * D
  const shelves = bays * r.shelvesPerBay * (W / bays) * D
  return { dividers, topBottom, shelves, total: dividers + topBottom + shelves }
}

export function calculateFurniture(input: FurnInput): FurnResult {
  const job = input.situations.find(s => s.id === input.jobSituationId) ?? input.situations[0]
  const rate = (k: FurnRateKey): number => {
    const v = input.rates[k] ?? RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const lines: FurnLine[] = []
  const labour: FurnLabourTask[] = []
  const runs: FurnSummary[] = []
  const warnings: string[] = []
  let sumWidth = 0, sumBoard = 0, sumHours = 0
  let anyClient = false, anySliding = false, anyMirror = false, anyKit = false

  for (const r of input.runs) {
    const k = FURN_KIND_BY_ID[r.kind]
    const name = r.ref.trim() || k?.label || 'Fitted furniture'
    if (!k) throw new Error(`${name} has no type.`)
    if (!(r.widthMm >= 300) || !(r.heightMm >= 300) || !(r.depthMm >= 100)) throw new Error(`${name}: the width and height must be at least 300mm and the depth at least 100mm.`)
    if (r.widthMm > 12000 || r.heightMm > 3500 || r.depthMm > 1500) throw new Error(`${name}: that size looks wrong: the width is up to 12m, the height up to 3.5m and the depth up to 1.5m.`)
    if (!(r.shelvesPerBay >= 0) || !(r.railsPerBay >= 0) || !(r.drawers >= 0)) throw new Error(`${name}: a count cannot be negative.`)
    if (r.bays !== null && !(r.bays >= 1)) throw new Error(`${name}: it needs at least one bay.`)
    if (r.kitPc !== null && !(r.kitPc >= 0)) throw new Error(`${name}: the price cannot be negative.`)
    const label = `${name}${r.location.trim() ? ` (${r.location.trim()})` : ''}`
    const sit = input.situations.find(s => s.id === r.situationId) ?? job
    const uplift = 1 + (sit?.upliftPct ?? 0) / 100
    const bays = baysOf(r)
    const W = r.widthMm / 1000
    const nDoors = doorCountOf(r)
    const parts: string[] = []
    const hrs: { what: string; h: number }[] = []
    const addH = (what: string, h: number) => { if (h > 0) hrs.push({ what, h }) }
    const add = (key: string, what: string, unit: string, unitCost: number, q: number) => {
      if (q > 0 && unitCost >= 0) lines.push({ id: `${key}|${r.id}`, name: `${label} — ${what}`, category: 'materials', unit, unitCost: money(unitCost), qty: +q.toFixed(3), roomId: r.id })
    }
    const size = `${(r.widthMm / 1000).toFixed(2)}m wide, ${(r.heightMm / 1000).toFixed(2)}m high and ${r.depthMm}mm deep`
    let boardM2 = 0
    const doorWord = r.doors === 'none' ? 'open shelves' : `${nDoors} ${STYLE_WORD[r.doorStyle]} ${r.doors === 'hinged' ? 'hinged' : r.doors === 'sliding' ? 'sliding' : 'bi-fold'} doors`

    if (r.build === 'site') {
      // ── built on site: board from the bays, doors from the opening ───────────────
      const b = boardAreaM2(r)
      const waste = k.awkward ? WASTE_AWKWARD : WASTE
      boardM2 = b.total
      const boardRate = r.board === 'ply' ? rate('boardPly') : r.board === 'mdf' ? rate('boardMdf') : rate('boardMelamine')
      add('board', `${BOARD_WORD[r.board]} for the carcass (incl. ${Math.round((waste - 1) * 100)}% waste)`, 'm²', boardRate, b.total * waste)
      add('back', 'back panel', 'm²', rate('backPanel'), W * (r.heightMm / 1000) * 1.05)
      add('sundries', 'screws, dowels, glue and shelf supports', 'm²', rate('sundriesPerM2Board'), b.total)
      add('bayfit', 'fittings per bay (cams, brackets and fixings)', 'nr', rate('bayFittings'), bays)
      addH(`${n1(b.total)}m² of board cut, built and fixed`, b.total * HOURS.boardPerM2 * (k.awkward ? AWKWARD_HOURS_FACTOR : 1))
      if (r.railsPerBay > 0) { add('rail', 'hanging rails and sockets', 'nr', rate('rail'), bays * r.railsPerBay); addH(`${bays * r.railsPerBay} hanging rail${bays * r.railsPerBay === 1 ? '' : 's'}`, bays * r.railsPerBay * HOURS.rail) }
      if (r.drawers > 0) { add('drawer', 'drawer boxes and runners', 'nr', rate('drawer'), r.drawers); addH(`${r.drawers} drawer${r.drawers === 1 ? '' : 's'}`, r.drawers * HOURS.drawer) }
      if (r.doors !== 'none') {
        const doorAreaM2 = W * (Math.max(0, r.heightMm - (r.plinth ? PLINTH_MM : 0))) / 1000
        const key = ('door' + (r.doors === 'hinged' ? 'Hinged' : r.doors === 'sliding' ? 'Sliding' : 'Bifold') + (r.doorStyle === 'flat' ? 'Flat' : r.doorStyle === 'shaker' ? 'Shaker' : 'Mirror')) as FurnRateKey
        add('doors', `${nDoors} ${STYLE_WORD[r.doorStyle]} ${r.doors === 'hinged' ? 'hinged' : r.doors === 'sliding' ? 'sliding (with track and rollers)' : 'bi-fold (with track and hinges)'} doors`, 'm²', rate(key), doorAreaM2)
        if (r.doors === 'hinged') addH(`hanging ${nDoors} doors`, nDoors * HOURS.hingedDoor)
        else if (r.doors === 'sliding') addH(`fitting a sliding track and ${nDoors} doors`, HOURS.slidingBase + nDoors * HOURS.slidingDoor)
        else addH(`fitting a bi-fold track and ${nDoors} leaves`, HOURS.bifoldBase + nDoors * HOURS.bifoldDoor)
      }
      parts.push(`${k.word}, ${size}, built on site in ${BOARD_WORD[r.board]} with ${bays} bay${bays === 1 ? '' : 's'}${r.shelvesPerBay > 0 ? ` and ${r.shelvesPerBay} ${r.shelvesPerBay === 1 ? 'shelf' : 'shelves'} to a bay` : ''}${r.railsPerBay > 0 ? `, a hanging rail in each` : ''}${r.drawers > 0 ? `, ${r.drawers} drawer${r.drawers === 1 ? '' : 's'}` : ''}, and ${doorWord}`)
      // shelves that sag
      const bayW = r.widthMm / bays
      if (r.shelvesPerBay > 0 && bayW > MAX_SHELF_SPAN_MM && r.board !== 'ply') warnings.push(`${label}: the shelves span ${Math.round(bayW)}mm: 18mm board sags over about ${MAX_SHELF_SPAN_MM}mm with a load on it, so add a bay, use thicker board or put a rail under the shelf.`)
    } else {
      // ── a bought kit, or delivered by the client or the supplier: we fit it ─────
      anyKit = anyKit || r.build === 'kit'
      if (r.build === 'kit') {
        const sample = k.kitPerLm * W * Math.max(0.5, r.heightMm / 2400)
        add('kit', `bought ${k.word} kit system`, 'item', r.kitPc ?? sample, 1)
        add('sundries', 'screws, fixings and filler', 'item', rate('jobSundries'), 1)
      } else anyClient = true
      addH(`${bays} bay${bays === 1 ? '' : 's'} built and fixed`, bays * HOURS.kitPerBay * (k.awkward ? AWKWARD_HOURS_FACTOR : 1))
      if (nDoors > 0) addH(`hanging ${nDoors} doors`, nDoors * HOURS.kitDoor)
      if (r.doors === 'sliding') addH('a sliding track set level', HOURS.slidingBase)
      parts.push(`${k.word}, ${size}, ${r.build === 'kit' ? 'a bought kit system' : 'supplied by the client or the supplier'} and fitted by us, ${bays} bay${bays === 1 ? '' : 's'} with ${doorWord}`)
    }

    // ── the plinth, the ceiling filler, the handles ──────────────────────────────
    if (r.plinth) { if (r.build === 'site') add('plinth', 'plinth (kickboard)', 'lm', rate('plinthPerLm'), W * 1.05); addH(`${n1(W)}m of plinth`, W * HOURS.plinthPerLm) }
    if (r.ceilingFiller) { if (r.build === 'site') add('filler', 'ceiling filler strip', 'lm', rate('fillerPerLm'), W * 1.05); addH(`${n1(W)}m of ceiling filler scribed in`, W * HOURS.fillerPerLm) }
    const handleDoors = r.doors === 'hinged' || r.doors === 'bifold' ? nDoors : 0
    const nHandles = Math.round(r.handles ?? handleDoors + r.drawers)
    if (nHandles > 0) {
      if (r.weSupplyHandles && r.build !== 'client') add('handles', 'handles', 'nr', rate('handle'), nHandles)
      addH(`${nHandles} handles`, nHandles * HOURS.handle)
    }
    if (r.plinth || r.ceilingFiller) parts.push([r.plinth && 'a plinth', r.ceilingFiller && 'a scribed filler to the ceiling'].filter(Boolean).join(' and '))

    // ── warnings ─────────────────────────────────────────────────────────────────
    if (r.kind === 'under-stair') { warnings.push(`${label}: a cupboard under the stairs in a flat or a house with a protected stairway escape route may need 30-minute fire protection (Part B): check with Building Control before closing it in.`) }
    if (r.doors === 'sliding') anySliding = true
    if (r.doorStyle === 'mirror' && r.doors !== 'none') anyMirror = true
    if (r.depthMm > 650 && (r.kind === 'wardrobe-hinged' || r.kind === 'wardrobe-sliding') && r.doors === 'hinged') warnings.push(`${label}: hinged doors on a wardrobe deeper than 650mm swing a long way: check there is room to open them.`)

    // ── the carpenter's time, and the labourer ───────────────────────────────────
    const total = hrs.reduce((s, x) => s + x.h, 0) + HOURS.setOut
    const hours = hoursOf(total * uplift)
    labour.push({ key: `fit|${r.id}`, roomId: r.id, trade: 'carpenter', task: `${label} — ${r.build === 'site' ? 'make and fit' : 'fit'} the ${k.word}`, hours,
      basis: `set out and scribe ${HOURS.setOut}h + ` + hrs.map(x => `${x.what} ${n1(x.h)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
    labour.push({ key: `helper|${r.id}`, roomId: r.id, trade: 'labourer', task: `${label} — carry sheets and help lift`, hours: hoursOf(total * uplift * LABOURER_SHARE), basis: `${Math.round(LABOURER_SHARE * 100)}% of the carpenter's hours` })
    sumWidth += W; sumBoard += boardM2; sumHours += hours
    runs.push({ runId: r.id, ref: name, name: k.label, bays, doors: nDoors, boardM2: money(boardM2), parts, hours })
  }

  if (anyClient) warnings.push('Where the client or the supplier delivers the furniture, check every part is there and undamaged, and the size of the space, before work starts.')
  if (anyKit) warnings.push('A bought kit system is priced at a sample per metre: type the real price of the kit once it is chosen.')
  if (anySliding) warnings.push('Sliding doors need a level floor and ceiling to run on: the track is set level and the filler scribes to the ceiling.')
  if (anyMirror) warnings.push('Mirrored doors are heavy and a fixing into the floor and ceiling track is needed: allow a second pair of hands on the day.')
  warnings.push('Painting or spraying is in Decoration, taking out old fitted furniture is in Strip-Out by Room, and lights or sockets inside are in Electrics.')
  return { lines, labour, runs, totalWidthM: money(sumWidth), totalBoardM2: money(sumBoard), totalHours: money(sumHours), warnings: input.runs.length === 0 ? [] : warnings }
}
