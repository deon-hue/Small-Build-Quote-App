// Suggested labour for a flat roof: which trades the roof as chosen needs, and roughly how many hours each.
// A flat roof is several trades' work — the carpenter (joists, deck, trimmers, kerbs), the roofer
// (insulation, covering, trims), the bricklayer (a parapet), the plasterer (a rendered parapet), the
// plumber or gutter fitter (gutters and downpipes), a labourer, and — if it's fitted under this roof —
// whoever fits the rooflights. Each suggestion is a quantity from the roof times a rate of hours per unit,
// shown with its working so it can be judged and changed.
//
// The hours-per-unit rates are ROUGH ESTIMATES for a small, easily reached roof — a starting point for the
// estimator, not a measured productivity. The suggestions are editable hours in the calculator's labour
// section. Pure, so it can be tested.

import type { RoofOpeningKind } from './assembly-calc'

export type LabourTradeKind = 'carpenter' | 'roofer' | 'bricklayer' | 'renderer' | 'plumber' | 'labourer' | 'fitter'

export const LABOUR_TRADE_LABEL: Record<LabourTradeKind, string> = {
  carpenter:  'Carpenter',
  roofer:     'Roofer',
  bricklayer: 'Bricklayer',
  renderer:   'Plasterer / renderer',
  plumber:    'Plumber / gutter fitter',
  labourer:   'Labourer',
  fitter:     'Window / rooflight fitter',
}

/** Hours per unit — rough estimates, one operative. */
export const LABOUR_RATES = {
  carpenter: { joist: 0.4, posiJoist: 0.3, ledgerLm: 0.3, wallPlateLm: 0.15, strutPair: 0.1, firringLm: 0.12, deckM2: 0.3, trimmerLm: 0.25, kerbLm: 0.5, fasciaLm: 0.4 },
  roofer: { insulationM2: 0.2, coveringM2: { grp: 0.55, epdm: 0.4, tpo: 0.45 }, trimLm: 0.3, cornerNr: 0.2, leadLm: 0.5, outletNr: 0.75, overflowNr: 0.5 },
  bricklayer: { cavityM2: 1.4, solidM2: 1.0, solidBrickM2: 1.8, copingLm: 0.35, trayLm: 0.15, outletOpeningNr: 0.5 },
  renderer: { renderM2: 0.6 },
  plumber: { gutterLm: 0.3, fittingNr: 0.15, downpipeLm: 0.35, shoeNr: 0.15, hopperNr: 0.5, offsetNr: 0.3 },
  labourer: { carryM2: 0.15, bricklayerShare: 0.5 },
  fitter: { lantern: 4, 'roof-window': 3, dome: 2, hatch: 1.5 } as Record<RoofOpeningKind, number>,
} as const

export interface FlatRoofLabourInput {
  buildUp: 'warm' | 'cold'
  covering: 'epdm' | 'grp' | 'tpo'
  joistSystem: 'c24' | 'c16' | 'posi'
  netAreaM2: number
  membraneAreaM2: number
  joistCount: number
  ledgerLm: number
  wallPlateLm: number
  strutCount: number
  firringLm: number
  /** Trimmers and headers round the openings, and the rooflight kerbs. */
  trimmerLm: number
  kerbLm: number
  openings: { kind: RoofOpeningKind }[]
  fasciaLm: number
  /** Trims for the covering: metres of edge and detail trim, numbers of preformed corners, metres of lead flashing. */
  coveringTrimLm: number
  coveringCorners: number
  leadLm: number
  parapet?: { lm: number; masonryAreaM2: number; type: 'cavity-brick-block' | 'solid-block'; renderAreaM2: number; rainwaterOutlets: number; overflowOutlets: number }
  drainage: { gutterLm: number; gutterFittings: number; downpipeLm: number; shoes: number; hoppers: number; offsets: number }
}

/** Which part of a roof the suggestion is for, when the roof is priced in parts: the structure (carpenter), the covering
 * (roofer and labourer), the gutters (plumber and fascia), the parapet (bricklayer, renderer). 'complete' is all of it. */
export type LabourScope = 'complete' | 'structure' | 'covering' | 'gutters' | 'parapet'

const SCOPE_OF_KEY: Record<string, Exclude<LabourScope, 'complete'>> = {
  'carp-joists': 'structure', 'carp-deck': 'structure', 'carp-openings': 'structure', 'fit-rooflights': 'structure',
  'roof-insulation': 'covering', 'roof-covering': 'covering', 'roof-trims': 'covering', 'lab-general': 'covering',
  'plumb-drainage': 'gutters', 'carp-fascia': 'gutters',
  'brick-parapet': 'parapet', 'render-parapet': 'parapet',
}

export interface LabourSuggestion {
  /** Stable, so an edited line can be told from a fresh suggestion. */
  key: string
  trade: LabourTradeKind
  task: string
  hours: number
  /** The working, e.g. "14 joists × 0.4h + 5.0 lm ledger × 0.3h". */
  basis: string
  /** A line only suggested when asked for (the rooflight fitter — often priced with the rooflights instead). */
  optional?: boolean
}

const hoursOf = (h: number) => (h <= 0 ? 0 : Math.max(0.5, Math.round(h * 2) / 2))
const n1 = (x: number) => (Math.round(x * 10) / 10).toString()

interface Part { qty: number; unit: string; what: string; rate: number }
/** One suggestion from its parts: only the parts with something in them, summed and rounded to the half hour. */
function line(key: string, trade: LabourTradeKind, task: string, parts: Part[], optional = false): LabourSuggestion | null {
  const used = parts.filter(p => p.qty > 0)
  if (used.length === 0) return null
  const total = used.reduce((s, p) => s + p.qty * p.rate, 0)
  const hours = hoursOf(total)
  if (hours === 0) return null
  return {
    key, trade, task, hours, optional: optional || undefined,
    basis: used.map(p => `${n1(p.qty)} ${p.unit}${p.what ? ` ${p.what}` : ''} × ${p.rate}h`).join(' + '),
  }
}

const COVERING_TASK = { grp: 'Lay the GRP covering (Cure It)', epdm: 'Lay the EPDM covering', tpo: 'Lay the TPO covering' } as const

export function suggestFlatRoofLabour(i: FlatRoofLabourInput, scope: LabourScope = 'complete'): LabourSuggestion[] {
  const c = LABOUR_RATES.carpenter, r = LABOUR_RATES.roofer, b = LABOUR_RATES.bricklayer, p = LABOUR_RATES.plumber
  const out: (LabourSuggestion | null)[] = []

  // Carpenter
  out.push(line('carp-joists', 'carpenter', 'Fix the ledger or wall plates, hang the joists and strut them', [
    { qty: i.joistCount, unit: 'joists', what: '', rate: i.joistSystem === 'posi' ? c.posiJoist : c.joist },
    { qty: i.ledgerLm, unit: 'lm', what: 'ledger', rate: c.ledgerLm },
    { qty: i.wallPlateLm, unit: 'lm', what: 'wall plate', rate: c.wallPlateLm },
    { qty: i.joistSystem === 'posi' ? 0 : i.strutCount, unit: 'strutting pairs', what: '', rate: c.strutPair },
  ]))
  out.push(line('carp-deck', 'carpenter', 'Lay the firrings and the deck', [
    { qty: i.firringLm, unit: 'lm', what: 'firrings', rate: c.firringLm },
    { qty: i.netAreaM2, unit: 'm²', what: 'deck', rate: c.deckM2 },
  ]))
  out.push(line('carp-openings', 'carpenter', 'Trim the rooflight openings and build the kerbs', [
    { qty: i.trimmerLm, unit: 'lm', what: 'trimmers and headers', rate: c.trimmerLm },
    { qty: i.kerbLm, unit: 'lm', what: 'kerb', rate: c.kerbLm },
  ]))
  out.push(line('carp-fascia', 'carpenter', 'Fix the fascia board', [{ qty: i.fasciaLm, unit: 'lm', what: 'fascia', rate: c.fasciaLm }]))

  // Roofer
  out.push(line('roof-insulation', 'roofer', i.buildUp === 'warm' ? 'Lay the vapour control layer and the insulation' : 'Fit the insulation and vapour control layer',
    [{ qty: i.netAreaM2, unit: 'm²', what: '', rate: r.insulationM2 }]))
  out.push(line('roof-covering', 'roofer', COVERING_TASK[i.covering],
    [{ qty: i.membraneAreaM2, unit: 'm²', what: 'covering, upstands and kerbs', rate: r.coveringM2[i.covering] }]))
  const outlets = i.parapet ? i.parapet.rainwaterOutlets : 0
  const overflows = i.parapet ? i.parapet.overflowOutlets : 0
  out.push(line('roof-trims', 'roofer', 'Fit the edge trims, corners and flashings, and dress the outlets', [
    { qty: i.coveringTrimLm, unit: 'lm', what: 'trim', rate: r.trimLm },
    { qty: i.coveringCorners, unit: 'corners', what: '', rate: r.cornerNr },
    { qty: i.leadLm, unit: 'lm', what: 'lead flashing', rate: r.leadLm },
    { qty: outlets, unit: 'rainwater outlets', what: '', rate: r.outletNr },
    { qty: overflows, unit: 'overflow outlets', what: '', rate: r.overflowNr },
  ]))

  // Bricklayer, a labourer for them, and the renderer
  let bricklayerHours = 0
  if (i.parapet && i.parapet.lm > 0) {
    const pp = i.parapet
    const bl = line('brick-parapet', 'bricklayer', 'Build the parapet wall, the tray and the coping', [
      { qty: pp.masonryAreaM2, unit: 'm²', what: pp.type === 'cavity-brick-block' ? 'cavity wall' : 'solid block wall', rate: pp.type === 'cavity-brick-block' ? b.cavityM2 : b.solidM2 },
      { qty: pp.lm, unit: 'lm', what: 'coping', rate: b.copingLm },
      { qty: pp.lm, unit: 'lm', what: 'DPC and tray', rate: b.trayLm },
      { qty: pp.rainwaterOutlets + pp.overflowOutlets, unit: 'outlet openings', what: '', rate: b.outletOpeningNr },
    ])
    out.push(bl)
    bricklayerHours = bl?.hours ?? 0
    if (pp.type === 'solid-block') out.push(line('render-parapet', 'renderer', 'Render the parapet', [{ qty: pp.renderAreaM2, unit: 'm²', what: 'render', rate: LABOUR_RATES.renderer.renderM2 }]))
  }

  // Plumber or gutter fitter
  const d = i.drainage
  out.push(line('plumb-drainage', 'plumber', 'Fit the gutters, downpipes and hopper heads', [
    { qty: d.gutterLm, unit: 'lm', what: 'gutter', rate: p.gutterLm },
    { qty: d.gutterFittings, unit: 'gutter fittings', what: '', rate: p.fittingNr },
    { qty: d.downpipeLm, unit: 'lm', what: 'downpipe', rate: p.downpipeLm },
    { qty: d.shoes, unit: 'shoes', what: '', rate: p.shoeNr },
    { qty: d.hoppers, unit: 'hopper heads', what: '', rate: p.hopperNr },
    { qty: d.offsets, unit: 'offsets', what: '', rate: p.offsetNr },
  ]))

  // Labourer: carrying to the roof, and serving the bricklayer
  out.push(line('lab-general', 'labourer', 'Carry materials to the roof, mix and clear up', [
    { qty: i.netAreaM2, unit: 'm²', what: 'roof', rate: LABOUR_RATES.labourer.carryM2 },
    { qty: bricklayerHours, unit: 'h', what: 'bricklayer', rate: LABOUR_RATES.labourer.bricklayerShare },
  ]))

  // Fitting the rooflights — only if it's done under this roof
  const f = LABOUR_RATES.fitter
  const kinds = (['lantern', 'roof-window', 'dome', 'hatch'] as RoofOpeningKind[])
  out.push(line('fit-rooflights', 'fitter', 'Fit the rooflights (supplied separately)',
    kinds.map(k => ({ qty: i.openings.filter(o => o.kind === k).length, unit: k === 'roof-window' ? 'roof windows' : `${k}s`, what: '', rate: f[k] })), true))

  return out.filter((x): x is LabourSuggestion => x !== null && (scope === 'complete' || SCOPE_OF_KEY[x.key] === scope))
}

// ── Matching a trade to Back Office's own list ─────────────────────────────────

const TRADE_PATTERN: Record<LabourTradeKind, RegExp> = {
  carpenter:  /carpent|joiner/i,
  roofer:     /roof/i,
  bricklayer: /brick|mason|block ?lay/i,
  renderer:   /plaster|render/i,
  plumber:    /plumb|gutter|drain/i,
  labourer:   /labourer|general operative|site labour|^labour/i,
  fitter:     /glaz|window|fitter|rooflight/i,
}

/** The Back Office trade that suits a kind of work, judged by its name; undefined when none does. */
export function matchTrade<T extends { id: string; name: string }>(kind: LabourTradeKind, trades: T[]): T | undefined {
  return trades.find(t => TRADE_PATTERN[kind].test(t.name))
}

export interface SuggestedLabourLine { id: string; tradeId: string; task: string; hours: number }

/** The suggestions as labour lines for the calculator: each with the matched trade, or — when Back Office has no
 * such trade — no trade and the trade's name in front of the task, so it's clear who it is for. */
export function toLabourLines(
  suggestions: LabourSuggestion[], trades: { id: string; name: string }[], includeOptional: boolean,
): { lines: SuggestedLabourLine[]; unmatched: LabourTradeKind[] } {
  const lines: SuggestedLabourLine[] = []
  const unmatched: LabourTradeKind[] = []
  for (const s of suggestions) {
    if (s.optional && !includeOptional) continue
    const trade = matchTrade(s.trade, trades)
    if (!trade && !unmatched.includes(s.trade)) unmatched.push(s.trade)
    lines.push({ id: `suggested-${s.key}`, tradeId: trade?.id ?? '', task: trade ? s.task : `${LABOUR_TRADE_LABEL[s.trade]} — ${s.task}`, hours: s.hours })
  }
  return { lines, unmatched }
}

/** The labour for a parapet wall priced on its own (External Walls → Parapet wall): the bricklayer, a labourer serving
 * them, and a renderer if it's rendered. */
export function suggestParapetLabour(p: {
  lm: number; masonryAreaM2: number; build: 'cavity-brick-block' | 'solid-block' | 'solid-brick'; renderAreaM2: number; outletOpenings: number
}): LabourSuggestion[] {
  const b = LABOUR_RATES.bricklayer
  const rate = p.build === 'cavity-brick-block' ? b.cavityM2 : p.build === 'solid-block' ? b.solidM2 : b.solidBrickM2
  const what = p.build === 'cavity-brick-block' ? 'cavity wall' : p.build === 'solid-block' ? 'solid block wall' : 'solid brick wall'
  const brick = line('brick-parapet', 'bricklayer', 'Build the parapet wall, the tray and the coping', [
    { qty: p.masonryAreaM2, unit: 'm²', what, rate },
    { qty: p.lm, unit: 'lm', what: 'coping', rate: b.copingLm },
    { qty: p.lm, unit: 'lm', what: 'DPC and tray', rate: b.trayLm },
    { qty: p.outletOpenings, unit: 'outlet openings', what: '', rate: b.outletOpeningNr },
  ])
  const out: (LabourSuggestion | null)[] = [brick]
  out.push(line('lab-parapet', 'labourer', 'Mix and carry for the bricklayer', [{ qty: brick?.hours ?? 0, unit: 'h', what: 'bricklayer', rate: LABOUR_RATES.labourer.bricklayerShare }]))
  if (p.build === 'solid-block') out.push(line('render-parapet', 'renderer', 'Render the parapet', [{ qty: p.renderAreaM2, unit: 'm²', what: 'render', rate: LABOUR_RATES.renderer.renderM2 }]))
  return out.filter((x): x is LabourSuggestion => x !== null)
}

/** The labour for the rooflight units themselves (Roof → Rooflights & Dormers): the fitter's time, from a
 * total already worked out per kind by the caller (so this file, like every `lib/*-labour.ts` module, stays
 * a type-only import away from the engine it's costing — see `priceRooflightItem` in `rooflight-units.ts`)
 * — grouped so the working reads plainly ("2 roof windows × 3.0h + 1 roof lantern × 4.0h"). */
export function suggestRooflightLabour(groups: { label: string; qty: number; hours: number }[]): LabourSuggestion[] {
  const used = groups.filter(g => g.qty > 0 && g.hours > 0)
  const totalHours = used.reduce((s, g) => s + g.hours, 0)
  if (totalHours <= 0) return []
  const basis = used.map(g => `${n1(g.qty)} ${g.label.toLowerCase()}${g.qty === 1 ? '' : 's'} × ${(g.hours / g.qty).toFixed(1)}h`).join(' + ')
  return [{ key: 'fit-rooflight-units', trade: 'fitter', task: 'Fit the rooflights and dress the flashings', hours: hoursOf(totalHours), basis }]
}
