// The small carpentry jobs that are not a staircase, a kitchen, skirting or a fitted wardrobe, priced one item at a time (Joinery & Fixtures → Boxing-in, Shelving & Second Fix (by item)): boxing in pipework or a boiler's
// pipes (a timber frame and board with access panels), casing a steel beam in fire-resisting board, shelves (on brackets, floating on concealed brackets, or on battens in an alcove), bath panels, radiator covers, a loft
// hatch with or without its ladder, ironmongery and small fixings, and a day-rate item for any other second-fix carpentry. Boxing and shelves are priced from the length, girth and depth with a frame, board and supports; the
// carpenter's time follows the length and the number of supports. Plumbing and wiring are other trades, painting is Decoration, and making good plaster is Plastering & Boarding.
//
// Every rate here is a SAMPLE price or a ROUGH estimate of hours, editable in the calculator, to be checked against real jobs. Self-contained (no imports), so it can be hand-tested with plain Node.

export type SecondFixKind = 'box-pipe' | 'box-steel' | 'shelf' | 'bath-panel' | 'radiator-cover' | 'loft-hatch' | 'ironmongery' | 'day'
export type BoxBoard = 'mdf' | 'ply' | 'plasterboard'
export type ShelfStyle = 'bracket' | 'floating' | 'batten'
export type ShelfMaterial = 'pine' | 'mdf' | 'oak'

export interface SecondFixKindInfo { id: SecondFixKind; label: string; word: string; unitLabel: string }
export const SECOND_FIX_KINDS: SecondFixKindInfo[] = [
  { id: 'box-pipe', label: 'Boxing in pipes, a boiler or services', word: 'boxing in', unitLabel: 'lm' },
  { id: 'box-steel', label: 'Casing a steel beam in fire-resisting board', word: 'fire-resisting casing to steel', unitLabel: 'lm' },
  { id: 'shelf', label: 'Shelves (on brackets, floating or on battens)', word: 'shelf', unitLabel: 'nr' },
  { id: 'bath-panel', label: 'Bath panel and surround', word: 'bath panel', unitLabel: 'nr' },
  { id: 'radiator-cover', label: 'Radiator cover', word: 'radiator cover', unitLabel: 'nr' },
  { id: 'loft-hatch', label: 'Loft hatch (with or without a ladder)', word: 'loft hatch', unitLabel: 'nr' },
  { id: 'ironmongery', label: 'Ironmongery and small fixings', word: 'item of ironmongery', unitLabel: 'nr' },
  { id: 'day', label: 'Other second-fix carpentry (by the hour)', word: 'other second-fix carpentry', unitLabel: 'h' },
]
export const KIND_BY_ID: Record<string, SecondFixKindInfo> = Object.fromEntries(SECOND_FIX_KINDS.map(k => [k.id, k]))

export const BOARD_LABEL: Record<BoxBoard, string> = { mdf: '9mm moisture-resistant MDF (for painting)', ply: '9mm plywood', plasterboard: '12.5mm plasterboard (to be skimmed)' }
export const BOARD_WORD: Record<BoxBoard, string> = { mdf: 'moisture-resistant MDF', ply: 'plywood', plasterboard: 'plasterboard' }
export const STYLE_LABEL: Record<ShelfStyle, string> = { bracket: 'On brackets', floating: 'Floating (concealed brackets)', batten: 'On battens in an alcove' }
export const STYLE_WORD: Record<ShelfStyle, string> = { bracket: 'on brackets', floating: 'floating on concealed brackets', batten: 'on battens in an alcove' }
export const SHELF_MATERIAL_LABEL: Record<ShelfMaterial, string> = { pine: 'Pine', mdf: 'MDF (for painting)', oak: 'Oak' }

/** Sample rates, £ */
export const RATES = {
  boardMdf: 8, boardPly: 24, boardPlasterboard: 5, boardFire: 7.5, batten: 1.4, accessPanel: 16, boxSundries: 1.2,
  shelfPine: 11, shelfMdf: 13, shelfOak: 40, bracket: 6, floatingBracket: 9, shelfBatten: 1.4,
  bathPanel: 48, radiatorCover: 140, hatch: 55, ladder: 130,
} as const
export type SecondFixRateKey = keyof typeof RATES

export const HOURS = {
  boxSetup: 0.8, boxPerLm: 0.55, steelPerLm: 1.0, access: 0.4,
  shelfPerLm: 0.3, support: 0.3,
  bathPanel: 2, radiatorCover: 2, hatch: 1.5, ladder: 1.5, ironmongery: 0.3,
} as const
/** Frame spacing for boxing: a cross rail every 600mm; three battens along the run */
export const CROSS_RAIL_M = 0.6
export const BOX_RUNS = 3
/** Supports to a shelf: one about every 700mm, and one at each end */
export const SUPPORT_SPACING_M = 0.7
/** The labourer who helps lift beam casing into place: this share of the carpenter's hours for that item */
export const STEEL_LABOURER_SHARE = 0.25
export const WASTE = 1.1
/** A shelf deeper than this, or longer than this between supports, needs a stronger fixing */
export const DEEP_SHELF_MM = 300

export interface SecondFixSituation { id: string; label: string; upliftPct: number }
export const DEFAULT_SECOND_FIX_SITUATIONS: SecondFixSituation[] = [
  { id: 'empty', label: 'Empty rooms (clear to work in)', upliftPct: 0 },
  { id: 'occupied', label: 'Occupied house (floors and furniture to protect)', upliftPct: 15 },
  { id: 'hard', label: 'Awkward (high up, tight spaces, upper floor)', upliftPct: 20 },
]

export interface SecondFixItem {
  id: string
  ref: string
  location: string
  kind: SecondFixKind
  /** boxing and beam casing: the length, m, and the girth (the widths of the three faces added together, mm) */
  lengthM: number
  girthMm: number
  board: BoxBoard
  /** access panels to boxing */
  accessPanels: number
  /** shelves: how many, each this long (the length above) and this deep, how they are fixed and what they are made of */
  count: number
  depthMm: number
  shelfStyle: ShelfStyle
  shelfMaterial: ShelfMaterial
  /** a loft hatch with its ladder */
  ladder: boolean
  /** ironmongery: £ each */
  eachCost: number
  /** the hourly item: hours, and a materials allowance, £ */
  hours: number
  materialsAllowance: number
  /** the client supplies the materials (we fit only) */
  clientSupplies: boolean
  situationId?: string | null
}

export function newSecondFixItem(id: string, ref: string, kind: SecondFixKind = 'box-pipe'): SecondFixItem {
  const base: SecondFixItem = {
    id, ref, location: '', kind, lengthM: 3, girthMm: 450, board: 'mdf', accessPanels: 0, count: 1, depthMm: 250, shelfStyle: 'bracket', shelfMaterial: 'pine', ladder: false,
    eachCost: 6, hours: 4, materialsAllowance: 0, clientSupplies: false, situationId: null,
  }
  switch (kind) {
    case 'box-pipe': return { ...base, lengthM: 3, girthMm: 450, accessPanels: 1 }
    case 'box-steel': return { ...base, lengthM: 4, girthMm: 900 }
    case 'shelf': return { ...base, lengthM: 1, count: 3, depthMm: 250 }
    case 'bath-panel': return { ...base, count: 1, accessPanels: 1 }
    case 'radiator-cover': return { ...base, count: 1 }
    case 'loft-hatch': return { ...base, count: 1 }
    case 'ironmongery': return { ...base, count: 6 }
    default: return base
  }
}

export interface SecondFixLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors'; unit: string; unitCost: number; qty: number; roomId?: string }
export interface SecondFixLabourTask { key: string; roomId: string; trade: 'carpenter' | 'labourer'; task: string; hours: number; basis: string }
export interface SecondFixSummary { itemId: string; ref: string; name: string; parts: string[]; hours: number }
export interface SecondFixResult {
  lines: SecondFixLine[]
  labour: SecondFixLabourTask[]
  items: SecondFixSummary[]
  totalBoxingLm: number
  totalShelfLm: number
  totalHours: number
  warnings: string[]
}
export interface SecondFixInput {
  items: SecondFixItem[]
  jobSituationId: string
  situations: SecondFixSituation[]
  rates: Partial<Record<SecondFixRateKey, number>>
}

const money = (n: number) => +n.toFixed(2)
const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** The supports (brackets or battens' fixings) for a shelf of this length */
export const supportsFor = (lengthM: number) => Math.ceil(lengthM / SUPPORT_SPACING_M) + 1

export function calculateSecondFix(input: SecondFixInput): SecondFixResult {
  const job = input.situations.find(s => s.id === input.jobSituationId) ?? input.situations[0]
  const rate = (k: SecondFixRateKey): number => {
    const v = input.rates[k] ?? RATES[k]
    if (!(v >= 0)) throw new Error('A rate cannot be negative.')
    return v
  }
  const lines: SecondFixLine[] = []
  const labour: SecondFixLabourTask[] = []
  const items: SecondFixSummary[] = []
  const warnings: string[] = []
  let boxLm = 0, shelfLm = 0, sumHours = 0
  let anyShelf = false, anySteel = false, anyBoilerBox = false

  for (const it of input.items) {
    const k = KIND_BY_ID[it.kind]
    const name = it.ref.trim() || k?.label || 'Second fix'
    if (!k) throw new Error(`${name} has no type.`)
    const label = `${name}${it.location.trim() ? ` (${it.location.trim()})` : ''}`
    for (const [v, w] of [[it.lengthM, 'the length'], [it.girthMm, 'the girth'], [it.depthMm, 'the depth'], [it.count, 'the number'], [it.accessPanels, 'the access panels'], [it.eachCost, 'the price'], [it.hours, 'the hours'], [it.materialsAllowance, 'the allowance']] as [number, string][]) {
      if (!(v >= 0)) throw new Error(`${label}: ${w} cannot be negative.`)
    }
    const sit = input.situations.find(s => s.id === it.situationId) ?? job
    const uplift = 1 + (sit?.upliftPct ?? 0) / 100
    const parts: string[] = []
    const hrs: { what: string; h: number }[] = []
    const addH = (what: string, h: number) => { if (h > 0) hrs.push({ what, h }) }
    const add = (key: string, what: string, unit: string, unitCost: number, q: number) => {
      if (!it.clientSupplies && q > 0 && unitCost >= 0) lines.push({ id: `${key}|${it.id}`, name: `${label} — ${what}`, category: 'materials', unit, unitCost: money(unitCost), qty: +q.toFixed(3), roomId: it.id })
    }
    const nCount = Math.round(it.count)
    const clientBit = it.clientSupplies ? ' (the materials supplied by the client)' : ''
    let stairLabourer = 0

    if (it.kind === 'box-pipe' || it.kind === 'box-steel') {
      if (!(it.lengthM > 0) || !(it.girthMm > 0)) throw new Error(`${label}: the length and the girth must be above zero.`)
      const steel = it.kind === 'box-steel'
      const girthM = it.girthMm / 1000
      const faces = girthM * it.lengthM
      boxLm += it.lengthM
      const battenLm = (BOX_RUNS * it.lengthM + (it.lengthM / CROSS_RAIL_M + 1) * girthM) * WASTE
      add('battens', 'timber frame (battens)', 'lm', rate('batten'), battenLm)
      if (steel) {
        anySteel = true
        add('board', 'fire-resisting board, two layers (incl. waste)', 'm²', rate('boardFire'), faces * 2 * WASTE)
      } else {
        const boardRate = it.board === 'ply' ? rate('boardPly') : it.board === 'plasterboard' ? rate('boardPlasterboard') : rate('boardMdf')
        add('board', `${BOARD_WORD[it.board]} to the boxing (incl. waste)`, 'm²', boardRate, faces * WASTE)
      }
      add('sundries', 'screws, adhesive and filler', 'm²', rate('boxSundries'), faces * (steel ? 2 : 1))
      if (it.accessPanels > 0) add('access', 'access panels', 'nr', rate('accessPanel'), Math.round(it.accessPanels))
      addH(`${n1(it.lengthM)}m of ${steel ? 'beam casing' : 'boxing'} framed and boarded`, it.lengthM * (steel ? HOURS.steelPerLm : HOURS.boxPerLm) * (girthM > 0.9 && !steel ? 1.3 : 1))
      addH('setting out', HOURS.boxSetup)
      if (it.accessPanels > 0) addH(`${Math.round(it.accessPanels)} access panel${Math.round(it.accessPanels) === 1 ? '' : 's'}`, Math.round(it.accessPanels) * HOURS.access)
      parts.push(steel
        ? `${n1(it.lengthM)}m of steel beam cased in two layers of fire-resisting board on a timber frame, ${it.girthMm}mm girth${clientBit}`
        : `${n1(it.lengthM)}m of boxing in ${BOARD_WORD[it.board]} on a timber frame, ${it.girthMm}mm girth${it.accessPanels > 0 ? ` with ${plural(Math.round(it.accessPanels), 'access panel', 'access panels')}` : ''}${clientBit}`)
      if (steel) { stairLabourer = STEEL_LABOURER_SHARE }
      if (!steel && it.accessPanels === 0) warnings.push(`${label}: no access panel is counted: pipe joints, valves and stopcocks must stay reachable, so add one at each.`)
      if (!steel && it.girthMm >= 600) anyBoilerBox = true
    } else if (it.kind === 'shelf') {
      anyShelf = true
      if (!(it.lengthM > 0) || !(it.depthMm > 0) || !(nCount >= 1)) throw new Error(`${label}: the shelf length, the depth and the number must be above zero.`)
      const totalLm = it.lengthM * nCount
      shelfLm += totalLm
      const matRate = it.shelfMaterial === 'oak' ? rate('shelfOak') : it.shelfMaterial === 'mdf' ? rate('shelfMdf') : rate('shelfPine')
      const styleF = it.shelfStyle === 'floating' ? 1.6 : 1
      add('shelf', `${SHELF_MATERIAL_LABEL[it.shelfMaterial].split(' (')[0].toLowerCase()} shelf board ${it.depthMm}mm deep${it.shelfStyle === 'floating' ? ', thick for a floating shelf' : ''}`, 'lm', matRate * (it.depthMm / 250) * styleF, totalLm * 1.05)
      const supports = supportsFor(it.lengthM) * nCount
      if (it.shelfStyle === 'bracket') add('bracket', 'shelf brackets', 'nr', rate('bracket'), supports)
      else if (it.shelfStyle === 'floating') add('bracket', 'concealed floating shelf brackets', 'nr', rate('floatingBracket'), supports)
      else add('battens', 'support battens', 'lm', rate('shelfBatten'), (it.lengthM + 2 * it.depthMm / 1000) * nCount * WASTE)
      addH(`${n1(totalLm)}m of shelf`, totalLm * HOURS.shelfPerLm)
      addH(`${supports} support${supports === 1 ? '' : 's'} fixed`, supports * HOURS.support)
      parts.push(`${plural(nCount, 'shelf', 'shelves')} ${n1(it.lengthM)}m long and ${it.depthMm}mm deep in ${SHELF_MATERIAL_LABEL[it.shelfMaterial].split(' (')[0].toLowerCase()}, ${STYLE_WORD[it.shelfStyle]}${clientBit}`)
      if (it.depthMm > DEEP_SHELF_MM && it.shelfStyle === 'floating') warnings.push(`${label}: a floating shelf ${it.depthMm}mm deep will not carry much: use a bracketed shelf or a deeper bracket for heavy loads.`)
    } else if (it.kind === 'bath-panel') {
      if (!(nCount >= 1)) throw new Error(`${label}: the number must be 1 or more.`)
      add('panel', 'bath panel, frame and fixings', 'nr', rate('bathPanel'), nCount)
      if (it.accessPanels > 0) add('access', 'access panels', 'nr', rate('accessPanel'), Math.round(it.accessPanels) * nCount)
      addH(`${plural(nCount, 'bath panel', 'bath panels')}`, nCount * HOURS.bathPanel)
      if (it.accessPanels > 0) addH('access panel', Math.round(it.accessPanels) * nCount * HOURS.access)
      parts.push(`${plural(nCount, 'bath panel', 'bath panels')} framed and fitted${it.accessPanels > 0 ? ' with an access panel' : ''}${clientBit}`)
      if (it.accessPanels === 0) warnings.push(`${label}: a bath panel needs an access panel to the bath taps and waste.`)
    } else if (it.kind === 'radiator-cover') {
      if (!(nCount >= 1)) throw new Error(`${label}: the number must be 1 or more.`)
      add('cover', 'radiator cover (MDF cabinet)', 'nr', rate('radiatorCover'), nCount)
      addH(`${plural(nCount, 'radiator cover', 'radiator covers')}`, nCount * HOURS.radiatorCover)
      parts.push(`${plural(nCount, 'radiator cover', 'radiator covers')} supplied and fitted${clientBit}`)
    } else if (it.kind === 'loft-hatch') {
      if (!(nCount >= 1)) throw new Error(`${label}: the number must be 1 or more.`)
      add('hatch', 'loft hatch', 'nr', rate('hatch'), nCount)
      if (it.ladder) add('ladder', 'loft ladder', 'nr', rate('ladder'), nCount)
      addH(`${plural(nCount, 'loft hatch', 'loft hatches')} cut in and trimmed`, nCount * HOURS.hatch)
      if (it.ladder) addH('loft ladder', nCount * HOURS.ladder)
      parts.push(`${plural(nCount, 'loft hatch', 'loft hatches')}${it.ladder ? ' with a ladder' : ''} cut in, trimmed and fitted${clientBit}`)
    } else if (it.kind === 'ironmongery') {
      if (!(nCount >= 1)) throw new Error(`${label}: the number must be 1 or more.`)
      add('iron', 'ironmongery and small fixings', 'nr', it.eachCost, nCount)
      addH(`${plural(nCount, 'item', 'items')} fitted`, nCount * HOURS.ironmongery)
      parts.push(`${plural(nCount, 'item of ironmongery', 'items of ironmongery')} fitted${clientBit}`)
    } else {
      // other second-fix carpentry by the hour
      if (!(it.hours > 0)) throw new Error(`${label}: the hours must be above zero.`)
      addH(it.location.trim() ? `second-fix carpentry (${it.location.trim()})` : 'second-fix carpentry', it.hours)
      if (it.materialsAllowance > 0) add('allowance', 'materials allowance', 'item', it.materialsAllowance, 1)
      parts.push(`${n1(it.hours)} hours of second-fix carpentry${it.materialsAllowance > 0 ? ' with a materials allowance' : ''}`)
    }

    // ── the carpenter's time ─────────────────────────────────────────────────────
    const total = hrs.reduce((s, x) => s + x.h, 0) * uplift
    const hours = hoursOf(total)
    if (hours > 0) {
      labour.push({ key: `fit|${it.id}`, roomId: it.id, trade: 'carpenter', task: `${label} — ${k.word}`, hours,
        basis: hrs.map(x => `${x.what} ${n1(x.h)}h`).join(' + ') + (uplift !== 1 ? ` (+${sit.upliftPct}% ${sit.label.split(' (')[0].toLowerCase()})` : '') })
      if (stairLabourer > 0) labour.push({ key: `helper|${it.id}`, roomId: it.id, trade: 'labourer', task: `${label} — help lift the beam casing`, hours: hoursOf(total * stairLabourer), basis: `${Math.round(stairLabourer * 100)}% of the carpenter's hours` })
      sumHours += hours
    }
    items.push({ itemId: it.id, ref: name, name: k.label, parts, hours })
  }

  if (anySteel) warnings.push('Fire protection to structural steel has a rating set by the structural engineer or Building Control: confirm the board, the layers and the fixings before casing it in.')
  if (anyBoilerBox) warnings.push('Boxing round a boiler or flue needs the clearances and ventilation in the maker\'s instructions: do not close it in without checking them.')
  if (anyShelf) warnings.push('Shelves are fixed with the right plugs into masonry or into the studs of a stud wall: a loaded shelf on plasterboard alone will pull out.')
  if (input.items.some(i => i.clientSupplies)) warnings.push('Where the client supplies the materials, we fit only: check the sizes and the quantity before work starts.')
  if (input.items.length > 0) warnings.push('Plumbing and wiring behind the boxing are other trades, painting is Decoration, and making good plaster is Plastering & Boarding.')
  return { lines, labour, items, totalBoxingLm: money(boxLm), totalShelfLm: money(shelfLm), totalHours: money(sumHours), warnings: input.items.length === 0 ? [] : warnings }
}
