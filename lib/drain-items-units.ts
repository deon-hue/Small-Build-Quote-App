// Drainage chambers, manholes, gullies and connections, priced one item at a time (Drainage & Services → Chambers, Gullies & Connections (by item)). The pipework between them is its own calculator
// (Underground Drainage by run): the two are split so that each item here is a thing at a place, which can be put on the plan one by one. Each item has a kind (an inspection chamber, a manhole, a rodding eye,
// a trapped, yard or road gully, a connection to an existing drain or to the public sewer), a depth, a grade of cover (for chambers and manholes), how many there are, and how its pit is dug. From that it works
// out the chamber (an inspection chamber's base and the extension sections a deeper one needs, a manhole's base and its concrete rings by depth), the cover, the bed and the surround (gravel under a chamber,
// concrete under and round a manhole or gully), the pit (dug by machine or by hand, with the machine days), the backfill and the soil that cannot go back and is taken away. A connection is a subcontract
// charge, with no pit. Counts and prices only: where chambers go, their depths and the falls are the drainage designer's, and a connection to the public sewer is the water company's.
// Self-contained (no cross-file runtime imports), so it can be hand-tested with plain Node. All rates and hours are samples to be checked against real prices.

export type DrainItemKind = 'ic' | 'manhole' | 'rodding-eye' | 'gully-trapped' | 'gully-yard' | 'gully-road' | 'connect-existing' | 'connect-sewer'
export type DrainItemGroup = 'chamber' | 'gully' | 'connection'
export type CoverGrade = 'light' | 'medium' | 'heavy'
export type PitDig = 'machine' | 'hand'

export const COVER_LABEL: Record<CoverGrade, string> = {
  light: 'Light duty (gardens and paths)', medium: 'Medium duty (driveways and parking, B125)', heavy: 'Heavy duty (roads and yards, D400)',
}
export const COVER_WORD: Record<CoverGrade, string> = { light: 'light-duty', medium: 'medium-duty (B125)', heavy: 'heavy-duty (D400)' }
/** what a cover costs more than the light duty one that is in the price of a chamber or manhole, £ */
export const COVER_UPGRADE: Record<CoverGrade, number> = { light: 0, medium: 40, heavy: 150 }

export interface DrainItemInfo {
  id: DrainItemKind
  group: DrainItemGroup
  label: string
  /** singular and plural, for the words on the quote */
  word: [string, string]
  /** the reference prefix a new item starts with: IC1, MH2 ... */
  ref: string
  defaultDepthMm: number
  /** the side of the square pit, m (0 = no pit is dug for it) */
  pitSide: number
  /** what stands in the pit for each metre of depth, m³ */
  outerPerM: number
  /** the bed under the unit, m */
  bedM: number
  /** the cover can be chosen (chambers and manholes) */
  coverGrades: boolean
}

export const DRAIN_ITEMS: Record<DrainItemKind, DrainItemInfo> = {
  ic: { id: 'ic', group: 'chamber', label: 'Inspection chamber (450mm, with a light-duty cover)', word: ['inspection chamber', 'inspection chambers'], ref: 'IC', defaultDepthMm: 600, pitSide: 0.9, outerPerM: 0.2, bedM: 0.1, coverGrades: true },
  manhole: { id: 'manhole', group: 'chamber', label: 'Manhole (concrete rings, 1050mm, with a light-duty cover and steps)', word: ['manhole', 'manholes'], ref: 'MH', defaultDepthMm: 1500, pitSide: 1.7, outerPerM: 1.13, bedM: 0.2, coverGrades: true },
  'rodding-eye': { id: 'rodding-eye', group: 'chamber', label: 'Rodding eye (access point with a cap)', word: ['rodding eye', 'rodding eyes'], ref: 'RE', defaultDepthMm: 450, pitSide: 0, outerPerM: 0, bedM: 0, coverGrades: false },
  'gully-trapped': { id: 'gully-trapped', group: 'gully', label: 'Trapped gully (waste from a sink, washing machine or the like)', word: ['trapped gully', 'trapped gullies'], ref: 'TG', defaultDepthMm: 450, pitSide: 0.5, outerPerM: 0.05, bedM: 0.1, coverGrades: false },
  'gully-yard': { id: 'gully-yard', group: 'gully', label: 'Yard or rainwater gully (with a sump and grating)', word: ['yard gully', 'yard gullies'], ref: 'YG', defaultDepthMm: 450, pitSide: 0.6, outerPerM: 0.09, bedM: 0.1, coverGrades: false },
  'gully-road': { id: 'gully-road', group: 'gully', label: 'Road or drive gully (heavy duty, with a cast iron grating)', word: ['road gully', 'road gullies'], ref: 'RG', defaultDepthMm: 600, pitSide: 0.8, outerPerM: 0.2, bedM: 0.1, coverGrades: false },
  'connect-existing': { id: 'connect-existing', group: 'connection', label: 'Connection to an existing drain (a junction cut in and made good)', word: ['connection to the existing drain', 'connections to the existing drain'], ref: 'CE', defaultDepthMm: 900, pitSide: 0, outerPerM: 0, bedM: 0, coverGrades: false },
  'connect-sewer': { id: 'connect-sewer', group: 'connection', label: 'Connection to the public sewer (a provisional sum)', word: ['connection to the public sewer', 'connections to the public sewer'], ref: 'CS', defaultDepthMm: 1500, pitSide: 0, outerPerM: 0, bedM: 0, coverGrades: false },
}
export const DRAIN_ITEM_KINDS = Object.keys(DRAIN_ITEMS) as DrainItemKind[]
export const DRAIN_ITEM_GROUP_LABEL: Record<DrainItemGroup, string> = { chamber: 'Chambers and manholes', gully: 'Gullies', connection: 'Connections' }

/** Sample rates, £ */
export const RATES = {
  icBase: 180,            // a 450mm chamber for a run up to about 0.6m deep, with its cover
  icExtension: 70,        // each 300mm section added to go deeper
  manholeBase: 500,       // base unit, cover frame and step irons
  manholePerM: 200,       // rings (and the cone or slab) for each metre of depth
  roddingEye: 35,
  gullyTrapped: 48, gullyYard: 75, gullyRoad: 165,
  connectExisting: 250,
  connectSewer: 1200,     // a provisional sum: the water company's charges and approval are separate
  gravelPerM3: 42,
  concretePerM3: 135,
  muckawayPerM3: 28,
} as const
export const IC_BASE_DEPTH_MM = 600
export const IC_EXTENSION_MM = 300
export const IC_MAX_DEPTH_MM = 1200
export const MANHOLE_MIN_DEPTH_MM = 1000
export const MANHOLE_MAX_DEPTH_MM = 3000
export const SPOIL_BULKING = 1.3
export const PIT_M3_PER_DAY = 20          // pits are slower to dig than a trench
export const SUPPORT_DEPTH_MM = 1200

/** Hours for a labourer (the groundworker's rates the other drainage calculators use) */
export const HOURS = {
  ic: 1.5, icExtension: 0.75,
  manholeBase: 4, manholePerM: 2,
  roddingEye: 0.5,
  gully: 1.2, gullyRoad: 2,
  handDigPerM3: 3,
  concretePerM3: 1.5,
  gravelPerM3: 0.8,
  backfillPerM3: 0.5,
} as const

export interface DrainItem {
  id: string
  kind: DrainItemKind
  /** IC1, MH1 ... */
  ref: string
  /** where it is, in words ("rear garden") */
  where: string
  depthMm: number
  cover: CoverGrade
  qty: number
  dig: PitDig
}

export interface DrainItemsInput {
  items: DrainItem[]
  /** the digger is already on site for the drain runs, so none is priced here for the pits */
  diggerWithRuns: boolean
}

export interface DrainItemsLine { id: string; name: string; category: 'materials' | 'plant' | 'subcontractors' | 'other'; unit: string; unitCost: number; qty: number }
export interface DrainItemsLabour { key: string; trade: 'labourer'; task: string; hours: number; basis: string }

export interface DrainItemsResult {
  lines: DrainItemsLine[]
  labour: DrainItemsLabour[]
  counts: Record<DrainItemKind, number>
  /** every unit counted, connections included */
  totalNr: number
  pitM3: number
  machineM3: number
  handM3: number
  /** days the machine is digging (the screen turns this into days on site) */
  excavatorDays: number
  gravelM3: number
  concreteM3: number
  backfillM3: number
  spoilAwayM3: number
  warnings: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100
const quarter = (n: number) => Math.round(n * 4) / 4
const money = (n: number) => +n.toFixed(2)

export function newDrainItem(id: string, kind: DrainItemKind, ref: string): DrainItem {
  return { id, kind, ref, where: '', depthMm: DRAIN_ITEMS[kind].defaultDepthMm, cover: 'light', qty: 1, dig: 'machine' }
}

/** The next free reference for a kind: IC1, IC2 ... (the lowest number not already used) */
export function nextRef(items: { kind: DrainItemKind; ref: string }[], kind: DrainItemKind): string {
  const prefix = DRAIN_ITEMS[kind].ref
  const used = new Set(items.map(i => i.ref.trim().toUpperCase()))
  let n = 1
  while (used.has(prefix + n)) n++
  return prefix + n
}

/** What one unit of a kind needs in the ground at a depth: the pit, what is put in it, and what goes back. m³. */
export function itemGeometry(kind: DrainItemKind, depthMm: number): { pitM3: number; gravelM3: number; concreteM3: number; occupiedM3: number; backfillM3: number } {
  const k = DRAIN_ITEMS[kind]
  if (k.pitSide === 0) return { pitM3: 0, gravelM3: 0, concreteM3: 0, occupiedM3: 0, backfillM3: 0 }
  const d = depthMm / 1000
  const plan = k.pitSide * k.pitSide
  const pit = plan * (d + k.bedM)
  const gravel = kind === 'ic' ? plan * k.bedM : 0
  const concrete = kind === 'manhole' ? 0.35 + 0.45 * d : k.group === 'gully' ? 0.1 : 0
  const occupied = Math.min(k.outerPerM * d + gravel + concrete, pit)
  return { pitM3: pit, gravelM3: gravel, concreteM3: concrete, occupiedM3: occupied, backfillM3: pit - occupied }
}

/** How many 300mm extension sections an inspection chamber needs at a depth */
export const icExtensions = (depthMm: number) => Math.max(0, Math.ceil((depthMm - IC_BASE_DEPTH_MM - 1e-9) / IC_EXTENSION_MM))

export function calculateDrainItems(i: DrainItemsInput): DrainItemsResult {
  const lines: DrainItemsLine[] = []
  const warnings: string[] = []
  const counts = Object.fromEntries(DRAIN_ITEM_KINDS.map(k => [k, 0])) as Record<DrainItemKind, number>
  let pitM3 = 0, machineM3 = 0, handM3 = 0, gravelM3 = 0, concreteM3 = 0, backfillM3 = 0, occupiedM3 = 0
  let icHours = 0, manholeHours = 0, gullyHours = 0, eyeHours = 0
  let icNr = 0, manholeNr = 0, gullyNr = 0, eyeNr = 0, extensionNr = 0
  let anySewer = false, anyYardGully = false, anyPit = false

  for (const it of i.items) {
    const k = DRAIN_ITEMS[it.kind]
    if (!k) throw new Error('One of the items is not a kind this calculator knows.')
    const tag = it.ref.trim() || k.word[0]
    if (!(it.qty >= 0) || !(it.depthMm >= 0)) throw new Error(`The number and depth of "${tag}" cannot be negative.`)
    const n = Math.round(it.qty)
    if (n === 0) continue
    if (k.pitSide > 0 || k.id === 'rodding-eye') {
      if (!(it.depthMm >= 200)) throw new Error(`The depth of "${tag}" must be at least 200mm.`)
    }
    const d = it.depthMm / 1000
    counts[it.kind] += n
    const id = it.id
    switch (it.kind) {
      case 'ic': {
        const ext = icExtensions(it.depthMm)
        icNr += n; extensionNr += ext * n
        icHours += n * (HOURS.ic + ext * HOURS.icExtension)
        lines.push({ id: `unit|${id}`, name: `${tag} — inspection chamber, 450mm, base and shaft with a light-duty cover`, category: 'materials', unit: 'nr', unitCost: RATES.icBase, qty: n })
        if (ext > 0) lines.push({ id: `ext|${id}`, name: `${tag} — extension shaft sections, 300mm each, to reach ${it.depthMm}mm`, category: 'materials', unit: 'nr', unitCost: RATES.icExtension, qty: ext * n })
        if (it.depthMm > IC_MAX_DEPTH_MM) warnings.push(`"${tag}" is ${it.depthMm}mm deep: a 450mm inspection chamber is for shallow drains (up to about ${IC_MAX_DEPTH_MM / 1000}m). Deeper than that a manhole you can get into is needed.`)
        break
      }
      case 'manhole': {
        manholeNr += n
        manholeHours += n * (HOURS.manholeBase + d * HOURS.manholePerM)
        lines.push({ id: `unit|${id}`, name: `${tag} — manhole base, cover frame and step irons (light-duty cover)`, category: 'materials', unit: 'nr', unitCost: RATES.manholeBase, qty: n })
        lines.push({ id: `rings|${id}`, name: `${tag} — concrete rings, 1050mm, with the cone or cover slab, for ${d.toFixed(2)}m of depth`, category: 'materials', unit: 'm', unitCost: RATES.manholePerM, qty: round2(d * n) })
        if (it.depthMm < MANHOLE_MIN_DEPTH_MM) warnings.push(`"${tag}" is only ${it.depthMm}mm deep: a manhole is for drains over about 1m deep, and an inspection chamber may do here.`)
        if (it.depthMm > MANHOLE_MAX_DEPTH_MM) warnings.push(`"${tag}" is ${it.depthMm}mm deep: a manhole over about 3m is a designed structure, not a standard ring manhole, and needs the designer and trench support.`)
        break
      }
      case 'rodding-eye':
        eyeNr += n; eyeHours += n * HOURS.roddingEye
        lines.push({ id: `unit|${id}`, name: `${tag} — rodding eye with an access cap`, category: 'materials', unit: 'nr', unitCost: RATES.roddingEye, qty: n })
        break
      case 'gully-trapped': case 'gully-yard': case 'gully-road': {
        gullyNr += n; gullyHours += n * (it.kind === 'gully-road' ? HOURS.gullyRoad : HOURS.gully)
        if (it.kind === 'gully-yard') anyYardGully = true
        const price = it.kind === 'gully-trapped' ? RATES.gullyTrapped : it.kind === 'gully-yard' ? RATES.gullyYard : RATES.gullyRoad
        lines.push({ id: `unit|${id}`, name: `${tag} — ${k.label.split(' (')[0].toLowerCase()} with grating`, category: 'materials', unit: 'nr', unitCost: price, qty: n })
        break
      }
      case 'connect-existing':
        lines.push({ id: `connect|${id}`, name: `${tag} — connection to an existing drain (junction cut in and made good)`, category: 'subcontractors', unit: 'nr', unitCost: RATES.connectExisting, qty: n })
        break
      case 'connect-sewer':
        anySewer = true
        lines.push({ id: `connect|${id}`, name: `${tag} — connection to the public sewer (provisional sum)`, category: 'subcontractors', unit: 'nr', unitCost: RATES.connectSewer, qty: n })
        break
    }

    if (k.coverGrades && it.cover !== 'light') {
      lines.push({ id: `cover|${id}`, name: `${tag} — ${COVER_WORD[it.cover]} cover and frame, in place of the light-duty one`, category: 'materials', unit: 'nr', unitCost: COVER_UPGRADE[it.cover], qty: n })
    }

    const g = itemGeometry(it.kind, it.depthMm)
    if (g.pitM3 > 0) {
      anyPit = true
      pitM3 += g.pitM3 * n; gravelM3 += g.gravelM3 * n; concreteM3 += g.concreteM3 * n; backfillM3 += g.backfillM3 * n; occupiedM3 += g.occupiedM3 * n
      if (it.dig === 'machine') machineM3 += g.pitM3 * n; else handM3 += g.pitM3 * n
      if (g.gravelM3 > 0) lines.push({ id: `gravel|${id}`, name: `${tag} — granular bed under the chamber (10mm gravel, 100mm)`, category: 'materials', unit: 'm³', unitCost: RATES.gravelPerM3, qty: round2(g.gravelM3 * n) })
      if (g.concreteM3 > 0) lines.push({ id: `conc|${id}`, name: `${tag} — concrete ${it.kind === 'manhole' ? 'base and 150mm surround' : 'bed and haunching'}`, category: 'materials', unit: 'm³', unitCost: RATES.concretePerM3, qty: round2(g.concreteM3 * n) })
      if (it.depthMm > SUPPORT_DEPTH_MM) warnings.push(`The pit for "${tag}" is more than ${SUPPORT_DEPTH_MM / 1000}m deep: it must be supported or battered back, with a risk assessment. Trench support is not priced here: add it if it is needed.`)
    }
  }

  const spoil = round2(occupiedM3 * SPOIL_BULKING)
  if (spoil > 0) lines.push({ id: 'spoil', name: 'Surplus soil carted away (what the chambers and gullies take up, grab lorry and tip, soil bulked up 30%)', category: 'other', unit: 'm³', unitCost: RATES.muckawayPerM3, qty: spoil })

  const excavatorDays = !i.diggerWithRuns && machineM3 > 0 ? Math.max(0.5, Math.round((machineM3 / PIT_M3_PER_DAY) * 2) / 2) : 0

  // Labour: a labourer builds in the units, fits the gullies and eyes, hand-digs the pits the machine does not, and places the concrete and backfill round them
  const labour: DrainItemsLabour[] = []
  const build = quarter(icHours + manholeHours)
  if (build > 0) {
    const parts: string[] = []
    if (icNr > 0) parts.push(`${icNr} inspection chamber${icNr === 1 ? '' : 's'}${extensionNr > 0 ? ` with ${extensionNr} extension${extensionNr === 1 ? '' : 's'}` : ''}`)
    if (manholeNr > 0) parts.push(`${manholeNr} manhole${manholeNr === 1 ? '' : 's'}, ${HOURS.manholeBase}h each and ${HOURS.manholePerM}h for each metre of depth`)
    labour.push({ key: 'build', trade: 'labourer', task: 'Build in the inspection chambers and manholes, set the covers', hours: build, basis: parts.join(', ') })
  }
  const fit = quarter(gullyHours + eyeHours)
  if (fit > 0) {
    const parts: string[] = []
    if (gullyNr > 0) parts.push(`${gullyNr} gull${gullyNr === 1 ? 'y' : 'ies'}`)
    if (eyeNr > 0) parts.push(`${eyeNr} rodding eye${eyeNr === 1 ? '' : 's'}`)
    labour.push({ key: 'fit', trade: 'labourer', task: 'Fit the gullies and rodding eyes', hours: fit, basis: parts.join(', ') })
  }
  const dig = quarter(handM3 * HOURS.handDigPerM3)
  if (dig > 0) labour.push({ key: 'dig', trade: 'labourer', task: 'Hand-dig the pits where the machine cannot reach', hours: dig, basis: `${round2(handM3)} m³ dug by hand at ${HOURS.handDigPerM3}h per m³` })
  const fill = quarter(concreteM3 * HOURS.concretePerM3 + gravelM3 * HOURS.gravelPerM3 + backfillM3 * HOURS.backfillPerM3)
  if (fill > 0) labour.push({ key: 'fill', trade: 'labourer', task: 'Place the beds and concrete and backfill round the chambers and gullies', hours: fill, basis: `${round2(concreteM3)} m³ concrete, ${round2(gravelM3)} m³ gravel, ${round2(backfillM3)} m³ backfill` })

  const totalNr = DRAIN_ITEM_KINDS.reduce((s, k) => s + counts[k], 0)
  if (totalNr === 0) warnings.push('No items yet. Pick a kind and add an inspection chamber, a manhole, a gully or a connection.')
  if (anySewer) warnings.push('A connection to the public sewer needs the water company\'s approval and charges, and is often done by them or an approved contractor: the figure is a provisional sum.')
  if (anyYardGully) warnings.push('A yard gully can also be counted in Soakaway & Rainwater (by area): count each gully in one calculator only, so it is not paid twice.')
  if (anyPit && i.diggerWithRuns) warnings.push('The digger is priced in the drain runs: make sure its days there cover digging these pits too.')
  if (totalNr > 0) warnings.push('Where the chambers go, how deep they are and the falls between them are the drainage designer\'s to confirm (access is needed at every change of direction, gradient or size and at junctions, within the spacing Part H allows). Building Control inspect before they are covered.')

  return {
    lines, labour, counts, totalNr, pitM3: round2(pitM3), machineM3: round2(machineM3), handM3: round2(handM3), excavatorDays,
    gravelM3: round2(gravelM3), concreteM3: round2(concreteM3), backfillM3: round2(backfillM3), spoilAwayM3: spoil, warnings,
  }
}

export function drainItemsSubtotal(lines: DrainItemsLine[]): number {
  return money(lines.reduce((s, l) => s + l.qty * l.unitCost, 0))
}

/** The words for each item, handed to the quote description (lib/drain-items-description.ts), so that the screen and the AI quote say the same thing */
export function drainItemWords(items: DrainItem[]): { ref: string; where: string; word: string; singular: string; plural: string; qty: number; group: DrainItemGroup; depthM: number | null; cover: string | null; dug: string | null }[] {
  return items.filter(x => Math.round(x.qty) > 0 && DRAIN_ITEMS[x.kind] && (!(DRAIN_ITEMS[x.kind].pitSide > 0 || x.kind === 'rodding-eye') || x.depthMm >= 200)).map(x => {
    const k = DRAIN_ITEMS[x.kind]
    const n = Math.round(x.qty)
    return {
      ref: x.ref.trim(), where: x.where.trim(), word: n === 1 ? k.word[0] : k.word[1], singular: k.word[0], plural: k.word[1], qty: n, group: k.group,
      depthM: k.group === 'connection' ? null : Math.round(x.depthMm / 100) / 10,
      cover: k.coverGrades ? COVER_WORD[x.cover] : null,
      dug: k.pitSide > 0 ? (x.dig === 'machine' ? 'by machine' : 'by hand') : null,
    }
  })
}
