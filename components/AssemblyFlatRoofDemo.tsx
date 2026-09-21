'use client'

/**
 * Assembly Calculator — Flat Roof, from the joists to the covering, with openings for rooflights.
 *
 * Joists span the roof's width and are spaced along its length; the roof falls along them, on firrings,
 * to the low edge. Warm roof (PIR above the deck) or cold roof (insulation between the joists, with a
 * ventilated gap), covered in EPDM, GRP or single-ply.
 *
 * Each of the four edges is an existing wall (upstand and flashing, and the joists are fixed to it),
 * a gutter, a parapet wall (masonry, coping, cavity tray, rainwater outlets through it and an
 * overflow) or a free edge. Where the joists meet an existing wall square-on they are hung from a
 * ledger plate bolted to it, or bear on a wall plate strapped to it; along a wall they run parallel to,
 * the first joist is strapped. The calculator counts the ledger, bolts, hangers and straps and shows them.
 *
 * Lanterns, roof windows, domes and access hatches are OPENINGS only — this makes the opening (the
 * trimmers, kerb and dressed membrane, and the area taken out); the rooflight itself is supplied and
 * priced elsewhere. Each opening's trimmers are doubled or tripled up, and drawn on the plan that way.
 * Drag an opening on the plan to position it.
 *
 * The joist can be solid timber (C24 or C16) or a Posi-joist. A rough guide to the joist depth for the
 * span is shown, but it's only a starting point for pricing — the joist size, trimmers, kerbs, the fixing
 * to the wall and the parapet stay with the designer/engineer. See calculateFlatRoofGeometry in
 * lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react'
import {
  calculateFlatRoofGeometry, calculateFlatRoofCost, studPositionsMm, flatRoofJoistLayout, openingTrimZoneMm, JOIST_THICKNESS_MM,
  type FlatRoofInput, type FlatRoofGeometry, type FlatRoofOpening, type FlatRoofBuildUp, type RoofOpeningKind,
  type FlatRoofEdge, type FlatRoofEdges, type FlatRoofWallConnection, type ParapetType,
  type FlatRoofOutlet, type FlatRoofOutletKind,
  type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import { suggestFlatRoofLabour, toLabourLines, LABOUR_TRADE_LABEL, type LabourSuggestion, type LabourTradeKind } from '@/lib/flat-roof-labour'
import {
  resolveDrainage, drainOptions, drainProduct, DRAIN_SLOTS, DRAIN_PRODUCTS, DRAIN_SYSTEMS, DRAIN_SYSTEM_LABEL, DRAIN_SYSTEM_DESCRIPTION,
  NONE as DRAIN_NONE, type DrainSystem, type DrainSlotId, type DrainExtra, type DrainLine, type DrainRoofInput,
} from '@/lib/flat-roof-drainage'
import {
  resolveTrimLines, cornerCounts, grpCoverage, trimSlotDefs, trimProduct, TRIM_CATALOGUE, CURE_IT, NONE,
  type SlotId, type ExtraTrim, type TrimLine, type TrimRoofInput, type TrimSlotDef,
} from '@/lib/flat-roof-covering-trims'
import {
  checkFlatRoofJoist, flatRoofSpanChart, DEFAULT_JOIST_SPAN_LOADS, SPAN_CHART_CENTRES_MM, type JoistSpanLoads,
} from '@/lib/flat-roof-joist-spans'
import { describeFlatRoof, describeFlatRoofShort, type FlatRoofDescriptionInput } from '@/lib/flat-roof-description'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, miniInput, PropRow, BreakdownTable,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'
import { EXTERNAL_FINISH_CONFIG, CEMENT_M2_PER_BAG, SAND_M2_PER_TONNE } from '@/components/AssemblyMasonryWallDemo'

// ── Joists ──────────────────────────────────────────────────────────────────────
// Sample rates, like every calculator here — editable per line in the breakdown until Back Office
// products/plant replace them. Solid timber is priced per metre by section; a Posi-joist per metre by
// depth (supplied to length, designed by the supplier).
type JoistSystem = 'c24' | 'c16' | 'posi'
const JOIST_SYSTEM_LABEL: Record<JoistSystem, string> = {
  c24:  'Solid timber C24',
  c16:  'Solid timber C16',
  posi: 'Posi-joist',
}
const TIMBER_DEPTHS = [100, 125, 150, 175, 200, 225, 250]
const POSI_DEPTHS = [200, 250, 300, 350]
const C16_PER_LM: Record<number, number> = { 100: 1.90, 125: 2.40, 150: 2.95, 175: 3.55, 200: 4.20, 225: 4.85, 250: 5.60 }
const C24_FACTOR = 1.10
const POSI_PER_LM: Record<number, number> = { 200: 8.50, 250: 9.60, 300: 10.90, 350: 12.30 }

function joistRate(system: JoistSystem, depth: number): number {
  if (system === 'posi') return POSI_PER_LM[depth] ?? POSI_PER_LM[200]
  const c16 = C16_PER_LM[depth] ?? C16_PER_LM[175]
  return +(system === 'c24' ? c16 * C24_FACTOR : c16).toFixed(2)
}
function joistLabel(system: JoistSystem, depth: number, plural = false): string {
  const s = plural ? 's' : ''
  return system === 'posi' ? `Posi-joist${s} ${depth}mm` : `47×${depth} ${system.toUpperCase()} joist${s}`
}

// ── Everything else ─────────────────────────────────────────────────────────────
type DeckType = 'ply' | 'osb'
const DECK: Record<DeckType, { label: string; perSheet: number }> = {
  ply: { label: '18mm WBP plywood', perSheet: 32.00 },
  osb: { label: '18mm OSB3',        perSheet: 21.00 },
}
type CoveringType = 'epdm' | 'grp' | 'tpo'
const COVERING_LABEL: Record<CoveringType, string> = {
  epdm: 'EPDM rubber — fully adhered',
  grp:  'GRP fibreglass — Cure It',
  tpo:  'Single-ply (TPO)',
}
const SHEET_M2 = 2.88
const PIR_PER_M2_PER_MM = 0.24
const WOOL_PER_M2_PER_MM = 0.11
const DECK_MM = 18
const COVERING_MM = 15
// Mortar as a volume — the same calibration as the dwarf and sleeper wall calculators.
const CEMENT_M3_PER_BAG = +(CEMENT_M2_PER_BAG * 0.013).toFixed(4)
const SAND_M3_PER_TONNE = +(SAND_M2_PER_TONNE * 0.013).toFixed(3)

const EDGE_LABEL: Record<FlatRoofEdge, string> = {
  abutment: 'Existing wall',
  gutter:   'Gutter',
  parapet:  'Parapet wall',
  free:     'Free edge',
}
const PARAPET_TYPE_LABEL: Record<ParapetType, string> = {
  'cavity-brick-block': 'Cavity — brick and block',
  'solid-block':        'Solid block, rendered',
}

const KIND_LABEL: Record<RoofOpeningKind, string> = {
  'lantern':     'Lantern',
  'roof-window': 'Roof window',
  'dome':        'Dome rooflight',
  'hatch':       'Access hatch',
}
// Starting size, trimmers and kerb for each kind — a lantern is the heaviest, so it starts tripled.
const KIND_DEFAULTS: Record<RoofOpeningKind, { widthMm: number; depthMm: number; trimmers: 2 | 3; kerbHeightMm: number }> = {
  'lantern':     { widthMm: 1500, depthMm: 1000, trimmers: 3, kerbHeightMm: 200 },
  'roof-window': { widthMm: 900,  depthMm: 900,  trimmers: 2, kerbHeightMm: 150 },
  'dome':        { widthMm: 900,  depthMm: 900,  trimmers: 2, kerbHeightMm: 150 },
  'hatch':       { widthMm: 600,  depthMm: 600,  trimmers: 2, kerbHeightMm: 150 },
}

/** A trim or a drainage part becomes a priced line: in lengths, by the metre, or each. */
function lineToLayer(l: { id: string; name: string; product: { unit: 'length' | 'lm' | 'nr'; packLm?: number; rate: number }; qty: number }): AssemblyLayerDef {
  const p = l.product
  const base = { id: l.id, name: l.name, category: 'materials' as const, source: 'fixed' as const, fixedQty: l.qty, unitCost: p.rate }
  if (p.unit === 'length') return { ...base, unit: `${p.packLm}m length`, coveragePerUnit: p.packLm, roundToWhole: true, wastePct: 5 }
  if (p.unit === 'lm') return { ...base, unit: 'lm', wastePct: 5 }
  return { ...base, unit: 'nr', roundToWhole: true }
}

interface LayerOpts {
  wastePct: number
  buildUp: FlatRoofBuildUp
  joistSystem: JoistSystem
  joistDepth: number
  insulationMm: number
  deck: DeckType
  covering: CoveringType
  fascia: boolean
  downpipes: number
  parapetType: ParapetType
  /** The trims and accessories chosen for the covering (GRP and EPDM); TPO keeps its single edge trim and flashing. */
  trimLines: TrimLine[]
  /** The gutters, downpipes and parapet outlets chosen under Drainage. */
  drainLines: DrainLine[]
  g: FlatRoofGeometry
}

function buildFlatRoofLayers(o: LayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const g = o.g
  const jr = joistRate(o.joistSystem, o.joistDepth)
  const jl = joistLabel(o.joistSystem, o.joistDepth, true)
  const layers: AssemblyLayerDef[] = []

  // Structure — and how it's fixed at the walls
  layers.push({ id: 'joists', name: jl, category: 'materials', source: 'joistLm', unit: 'lm', unitCost: jr, wastePct: 5 })
  if (g.trimLm > 0) {
    layers.push({ id: 'trimmers', name: `${jl} — trimmers and headers round the rooflight openings`, category: 'materials', source: 'trimLm', unit: 'lm', unitCost: jr, wastePct: 5 })
  }
  if (g.wallPlateLm > 0) layers.push({ id: 'wall_plate', name: 'Wall plate 100×50 treated', category: 'materials', source: 'wallPlateLm', unit: 'lm', unitCost: 2.80, wastePct: 5 })
  if (g.ledgerLm > 0) {
    // A ledger is solid timber whatever the joists are — the nearest timber section to the joist depth.
    const ledgerDepth = TIMBER_DEPTHS.find(d => d >= o.joistDepth) ?? 250
    layers.push({ id: 'ledger', name: `Ledger plate 47×${ledgerDepth} treated (bolted to the existing wall)`, category: 'materials', source: 'ledgerLm', unit: 'lm', unitCost: joistRate('c24', ledgerDepth), wastePct: 5 })
    layers.push({ id: 'ledger_bolts', name: 'M12 anchor bolts and washers (ledger to wall, 600 centres)', category: 'materials', source: 'ledgerBoltCount', unit: 'nr', unitCost: 3.80, roundToWhole: true })
  }
  if (g.hangerCount > 0) layers.push({ id: 'hangers', name: 'Joist hangers', category: 'materials', source: 'hangerCount', unit: 'nr', unitCost: 2.40, roundToWhole: true })
  if (g.strapCount > 0) layers.push({ id: 'straps', name: 'Lateral restraint straps (to the existing wall)', category: 'materials', source: 'strapCount', unit: 'nr', unitCost: 4.20, roundToWhole: true })
  // Posi-joists are braced by their own webs.
  if (o.joistSystem !== 'posi' && g.strutCount > 0) {
    layers.push({ id: 'strutting', name: 'Herringbone strutting (pair between joists)', category: 'materials', source: 'strutCount', unit: 'nr', unitCost: 1.20, roundToWhole: true })
  }
  layers.push({ id: 'firrings', name: `Tapered firrings for the fall (up to ${Math.round(g.fallMm)}mm)`, category: 'materials', source: 'firringLm', unit: 'lm', unitCost: 3.40, wastePct: 5 })
  layers.push({ id: 'deck', name: `Deck ${DECK[o.deck].label}`, category: 'materials', source: 'netAreaM2', unit: 'sheet', unitCost: DECK[o.deck].perSheet, wastePct: w, coveragePerUnit: SHEET_M2, roundToWhole: true })

  // Insulation
  if (o.buildUp === 'warm') {
    layers.push({ id: 'vcl', name: 'Vapour control layer', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 0.95, wastePct: w })
    if (o.insulationMm > 0) layers.push({ id: 'insulation', name: `PIR insulation ${o.insulationMm}mm`, category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: +(PIR_PER_M2_PER_MM * o.insulationMm).toFixed(2), wastePct: w })
    layers.push({ id: 'insulation_fix', name: 'Insulation adhesive and fixings', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 1.60 })
  } else {
    if (o.insulationMm > 0) layers.push({ id: 'insulation', name: `Mineral wool ${o.insulationMm}mm between the joists`, category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: +(WOOL_PER_M2_PER_MM * o.insulationMm).toFixed(2), wastePct: w })
    layers.push({ id: 'vcl', name: 'Vapour control layer (ceiling side)', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 0.95, wastePct: w })
    layers.push({ id: 'eaves_vents', name: 'Eaves ventilation strip (both ends)', category: 'materials', source: 'lengthM', unit: 'm', unitCost: 2.20, sidesMultiplier: 2, wastePct: w })
  }

  // Covering — its area includes the upstands, the parapet's face and the kerbs
  if (o.covering === 'epdm') {
    layers.push(
      { id: 'covering', name: 'EPDM membrane 1.2mm (incl. upstands, parapet face and kerbs)', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 10.50, wastePct: w },
      { id: 'covering_adhesive', name: 'EPDM bonding adhesive', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 3.20, wastePct: w },
      { id: 'covering_seams', name: 'Seam tape and corner patches', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 0.70 },
    )
  } else if (o.covering === 'grp') {
    // Cure It: a 20kg tin of resin laminates 13.5 m² with 450g mat, a 20kg tin of topcoat covers 40 m², and the
    // hardener is about 2% of the resin — so the tins are worked out from the covering area.
    layers.push(
      { id: 'covering_csm', name: 'Cure It reinforcement mat 450g', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 2.60, wastePct: w },
      { id: 'covering_resin', name: `Cure It roofing resin ${CURE_IT.resinTinKg}kg tin (${CURE_IT.resinTinM2} m² a tin)`, category: 'materials', source: 'membraneAreaM2', unit: 'tin', unitCost: 93.33, wastePct: w, coveragePerUnit: CURE_IT.resinTinM2, roundToWhole: true },
      { id: 'covering_hardener', name: 'Cure It catalyst hardener 1kg (about 2% of the resin)', category: 'materials', source: 'membraneAreaM2', unit: 'kg', unitCost: 13.29, wastePct: w, coveragePerUnit: CURE_IT.resinTinM2 / (CURE_IT.resinTinKg * CURE_IT.hardenerPctOfResin / 100), roundToWhole: true },
      { id: 'covering_topcoat', name: `Cure It roofing topcoat ${CURE_IT.topcoatTinKg}kg tin (${CURE_IT.topcoatTinM2} m² a tin)`, category: 'materials', source: 'membraneAreaM2', unit: 'tin', unitCost: 121.67, wastePct: w, coveragePerUnit: CURE_IT.topcoatTinM2, roundToWhole: true },
    )
    const trimLm = o.trimLines.filter(l => l.product.unit !== 'nr' && l.product.code !== 'LEAD4').reduce((sum, l) => sum + l.qty, 0)
    if (trimLm > 0) layers.push({ id: 'covering_bandage', name: 'Cure It reinforcement bandage 75mm × 75m (trim joints and details)', category: 'materials', source: 'fixed', fixedQty: +trimLm.toFixed(2), unit: 'roll', unitCost: 30.00, coveragePerUnit: 75, roundToWhole: true })
  } else {
    layers.push(
      { id: 'covering', name: 'Single-ply TPO membrane (incl. upstands, parapet face and kerbs)', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 12.50, wastePct: w },
      { id: 'covering_adhesive', name: 'Membrane bonding adhesive', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 2.80, wastePct: w },
    )
  }

  // Edges, wall junctions, parapet and kerb trims. GRP and EPDM take the trims chosen for them; TPO keeps a single
  // edge trim and a lead flashing.
  if (o.covering === 'tpo') {
    if (g.edgeTrimLm > 0) layers.push({ id: 'edge_trim', name: 'Aluminium drip trim (free and gutter edges)', category: 'materials', source: 'edgeTrimLm', unit: 'lm', unitCost: 6.50, wastePct: w })
    if (g.abutmentLm > 0) layers.push({ id: 'flashing', name: 'Lead flashing to the existing wall (Code 4)', category: 'materials', source: 'abutmentLm', unit: 'lm', unitCost: 32.00, wastePct: 5 })
  } else {
    for (const t of o.trimLines) layers.push(lineToLayer(t))
  }
  if (g.edgeTrimLm > 0 && o.fascia) layers.push({ id: 'fascia', name: 'uPVC fascia board 175mm (free and gutter edges)', category: 'materials', source: 'edgeTrimLm', unit: 'lm', unitCost: 10.00, wastePct: w })

  // Parapet wall — masonry, coping, cavity tray, and the outlets through it
  if (g.parapetLm > 0) {
    if (o.parapetType === 'cavity-brick-block') {
      layers.push(
        { id: 'parapet_bricks', name: 'Facing bricks (parapet outer leaf)', category: 'materials', source: 'parapetBrickCount', unit: 'nr', unitCost: 0.75, roundToWhole: true, wastePct: w },
        { id: 'parapet_blocks', name: 'Dense concrete blocks 100mm (parapet inner leaf)', category: 'materials', source: 'parapetBlockCount', unit: 'nr', unitCost: 1.35, roundToWhole: true, wastePct: w },
        { id: 'parapet_ties', name: 'Stainless steel wall ties (parapet)', category: 'materials', source: 'parapetTieCount', unit: 'nr', unitCost: 0.28, roundToWhole: true, wastePct: 5 },
      )
    } else {
      layers.push({ id: 'parapet_blocks', name: 'Dense concrete blocks laid flat, 215mm (parapet)', category: 'materials', source: 'parapetBlockCount', unit: 'nr', unitCost: 1.35, roundToWhole: true, wastePct: w })
    }
    layers.push(
      { id: 'parapet_cement', name: 'Cement (parapet mortar)', category: 'materials', source: 'parapetMortarM3', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M3_PER_BAG, roundToWhole: true, wastePct: w },
      { id: 'parapet_sand', name: 'Building sand (parapet mortar)', category: 'materials', source: 'parapetMortarM3', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M3_PER_TONNE, wastePct: w },
    )
    if (o.parapetType === 'solid-block') {
      layers.push(...EXTERNAL_FINISH_CONFIG.render.buildLayers(w).map(l => ({ ...l, source: 'parapetRenderAreaM2' as const })))
    }
    layers.push(
      { id: 'parapet_tray', name: 'DPC and cavity tray at the parapet base', category: 'materials', source: 'parapetLm', unit: 'lm', unitCost: 4.60, wastePct: w },
      { id: 'parapet_coping', name: 'Concrete coping (parapet)', category: 'materials', source: 'parapetLm', unit: 'lm', unitCost: 14.00, wastePct: w },
    )
  }

  // Rooflight openings — the kerbs only; the rooflights themselves are priced elsewhere
  if (g.kerbLm > 0) {
    layers.push(
      { id: 'kerb_timber', name: 'Kerb timber 47×150 (rooflight kerbs)', category: 'materials', source: 'kerbLm', unit: 'lm', unitCost: 3.60, wastePct: w },
      { id: 'kerb_cladding', name: 'Kerb cladding 18mm ply', category: 'materials', source: 'kerbFaceAreaM2', unit: 'm²', unitCost: 7.50, wastePct: w },
    )
  }

  // Drainage — the gutters, downpipes and outlets chosen for the edges set as a gutter or a parapet
  for (const d of o.drainLines) layers.push(lineToLayer(d))
  layers.push({ id: 'sundries', name: 'Fixings, tapes, sealant and sundries', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 1.10 })
  return layers
}

// ── Rainwater outlets ──────────────────────────────────────────────────────────
type EdgeKey = keyof FlatRoofEdges
// The order the low edge is preferred in: water falls to it, so that's where a parapet's outlets go first.
const EDGE_ORDER: EdgeKey[] = ['low', 'high', 'right', 'left']
const EDGE_NAME: Record<EdgeKey, string> = { high: 'High edge', low: 'Low edge', left: 'Left edge', right: 'Right edge' }
const OUTLET_LABEL: Record<FlatRoofOutletKind, string> = { gully: 'Rainwater outlet', overflow: 'Overflow outlet' }
let _outletId = 0
const newOutletId = () => `out-${++_outletId}`

/** What a parapet starts with: enough rainwater outlets for its length (about one to every 5m) and an overflow outlet,
 * spread evenly along its first parapet edge. From then on the outlets are the user's to change. */
function defaultOutlets(edges: FlatRoofEdges, lengthMm: number, widthMm: number): FlatRoofOutlet[] {
  const edgeLen: Record<EdgeKey, number> = { high: lengthMm, low: lengthMm, left: widthMm, right: widthMm }
  const parapetEdges = EDGE_ORDER.filter(e => edges[e] === 'parapet')
  if (parapetEdges.length === 0) return []
  const edge = parapetEdges[0]
  const gullyCount = Math.max(1, Math.ceil(parapetEdges.reduce((s, e) => s + edgeLen[e], 0) / 1000 / 5))
  const n = gullyCount + 1 // the last one is the overflow
  return Array.from({ length: n }, (_, i) => ({
    id: newOutletId(),
    kind: (i < gullyCount ? 'gully' : 'overflow') as FlatRoofOutletKind,
    edge,
    positionMm: Math.round((edgeLen[edge] * (i + 0.5)) / n / 50) * 50,
  }))
}

// A new opening goes in the first free spot: scanning along the roof from the left, then down from
// the high edge, for a gap that clears every opening already there by 300mm (room for the trimmers
// and kerbs). Its trimmers are put tight to its own sides, so it doesn't need to line up with the joists.
// If the roof is too full it just goes at the default spot — the overlap warning says so.
function newOpening(kind: RoofOpeningKind, existing: FlatRoofOpening[], lengthMm: number, widthMm: number): FlatRoofOpening {
  const d = KIND_DEFAULTS[kind]
  const gap = 300
  const room = openingTrimZoneMm({ trimmers: d.trimmers }) + 100   // the trimmers, and a little clearance from the roof edge
  const maxX = Math.max(0, lengthMm - d.widthMm - room)
  const maxY = Math.max(0, widthMm - d.depthMm - room)
  const clashes = (x: number, y: number) => existing.some(o =>
    x < o.offsetMm + o.widthMm + gap && o.offsetMm < x + d.widthMm + gap &&
    y < o.offsetSpanMm + o.depthMm + gap && o.offsetSpanMm < y + d.depthMm + gap)
  const startY = Math.max(room, Math.min(maxY, 800))
  let spot = { x: Math.min(maxX, 300), y: Math.min(maxY, startY) }
  search: for (let y = startY; y <= maxY; y += 200) {
    for (let x = 300; x <= maxX; x += 100) {
      if (!clashes(x, y)) { spot = { x, y }; break search }
    }
  }
  return {
    id: newOpeningId(), kind, widthMm: d.widthMm, depthMm: d.depthMm,
    offsetMm: spot.x, offsetSpanMm: spot.y, trimmers: d.trimmers, kerbHeightMm: d.kerbHeightMm,
  }
}

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** Take-off's drawn roof: its length (the longer side) and width (the shorter), in mm — the joists
   * span the width. Whenever they change they overwrite the calculator's own, still editable by hand. */
  externalLengthMm?: number
  externalWidthMm?: number
  /** Which build-up the calculator opens on — Take-off passes it from the Build-Up Type picked. */
  buildUpDefault?: FlatRoofBuildUp
}

export default function AssemblyFlatRoofDemo({ onClose, onSave, labourTrades = [], externalLengthMm, externalWidthMm, buildUpDefault = 'warm' }: Props) {
  const [name, setName]         = useState('Flat Roof')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  const [widthMm, setWidthMm]   = useState(externalWidthMm ?? 3200)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  useEffect(() => { if (externalWidthMm != null) setWidthMm(externalWidthMm) }, [externalWidthMm])

  const [buildUp, setBuildUp] = useState<FlatRoofBuildUp>(buildUpDefault)
  const [joistSystem, setJoistSystem] = useState<JoistSystem>('c24')
  const [joistDepth, setJoistDepth] = useState(175)
  // Until the section is picked by hand it follows the span chart: the smallest section that works for the span.
  const [depthPicked, setDepthPicked] = useState(false)
  const [centresMm, setCentresMm] = useState(400)
  const [spanLoads, setSpanLoads] = useState<JoistSpanLoads>(DEFAULT_JOIST_SPAN_LOADS)
  const [fallRatio, setFallRatio] = useState(80)
  // Warm roof: a PIR board on the deck. Cold roof: insulation between the joists, leaving a 50mm gap.
  const [insulationMm, setInsulationMm] = useState(buildUpDefault === 'cold' ? 125 : 120)
  const [deck, setDeck] = useState<DeckType>('ply')
  const [covering, setCovering] = useState<CoveringType>('grp')   // most of the roofs are Cure It GRP
  const [fascia, setFascia] = useState(false)
  // The trims chosen for each place, and any added by hand. Picks are per covering: changing the covering starts them afresh.
  const [trimPicks, setTrimPicks] = useState<Partial<Record<SlotId, string>>>({})
  const [extraTrims, setExtraTrims] = useState<ExtraTrim[]>([])
  const [downpipes, setDownpipes] = useState(1)
  // Drainage is separate from the covering: a system for the gutters and downpipes, with a part-by-part choice like the trims.
  const [dropM, setDropM] = useState(2.6)
  const [drainSystem, setDrainSystem] = useState<DrainSystem>('upvc-hr')
  const [drainPicks, setDrainPicks] = useState<Partial<Record<DrainSlotId, string>>>({})
  const [extraDrain, setExtraDrain] = useState<DrainExtra[]>([])
  const [wastePct, setWastePct] = useState(10)
  const [location, setLocation] = useState('')

  // The four edges, how the joists meet an existing wall, and the parapet.
  const [edges, setEdges] = useState<FlatRoofEdges>({ high: 'abutment', low: 'gutter', left: 'free', right: 'free' })
  const [wallConnection, setWallConnection] = useState<FlatRoofWallConnection>('ledger')
  const [parapetHeightMm, setParapetHeightMm] = useState(450)
  const [parapetType, setParapetType] = useState<ParapetType>('cavity-brick-block')
  // Rainwater outlets through the parapet — each one placed individually, so they can be added, deleted and
  // moved wherever, and there can be as many as are needed. A parapet starts with enough for its length;
  // once any is added, deleted or moved by hand they're left alone (until "Auto-place").
  const [outlets, setOutlets] = useState<FlatRoofOutlet[]>([])
  const outletsTouched = useRef(false)

  const edgeLenMm: Record<keyof FlatRoofEdges, number> = { high: lengthMm, low: lengthMm, left: widthMm, right: widthMm }
  const parapetEdgeList = EDGE_ORDER.filter(e => edges[e] === 'parapet')
  const parapetEdgeLm = parapetEdgeList.reduce((s, e) => s + edgeLenMm[e], 0) / 1000
  const parapetEdgesKey = parapetEdgeList.join(',')
  useEffect(() => {
    if (parapetEdgeList.length === 0) { outletsTouched.current = false; setOutlets([]); return }
    if (!outletsTouched.current) setOutlets(defaultOutlets(edges, lengthMm, widthMm))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parapetEdgesKey, lengthMm, widthMm])
  function addOutlet(kind: FlatRoofOutletKind) {
    const edge = parapetEdgeList[0]
    if (!edge) return
    outletsTouched.current = true
    // The middle of the widest gap between the ends of the edge and the outlets already on it.
    const len = edgeLenMm[edge]
    const marks = [0, ...outlets.filter(o => o.edge === edge).map(o => o.positionMm).sort((a, b) => a - b), len]
    let best = { gap: -1, mid: len / 2 }
    for (let i = 1; i < marks.length; i++) {
      const gap = marks[i] - marks[i - 1]
      if (gap > best.gap) best = { gap, mid: (marks[i] + marks[i - 1]) / 2 }
    }
    setOutlets(prev => [...prev, { id: newOutletId(), kind, edge, positionMm: Math.round(best.mid / 50) * 50 }])
  }
  function updateOutlet(id: string, patch: Partial<FlatRoofOutlet>) {
    outletsTouched.current = true
    setOutlets(prev => prev.map(o => {
      if (o.id !== id) return o
      const next = { ...o, ...patch }
      // Moving to another edge keeps it on that edge's length.
      return { ...next, positionMm: Math.max(0, Math.min(edgeLenMm[next.edge], next.positionMm)) }
    }))
  }
  function removeOutlet(id: string) {
    outletsTouched.current = true
    setOutlets(prev => prev.filter(o => o.id !== id))
  }
  function autoPlaceOutlets() {
    outletsTouched.current = false
    setOutlets(defaultOutlets(edges, lengthMm, widthMm))
  }
  function setEdge(which: keyof FlatRoofEdges, value: FlatRoofEdge) {
    setEdges(prev => ({ ...prev, [which]: value }))
  }

  const [openings, setOpenings] = useState<FlatRoofOpening[]>(() => {
    const L = externalLengthMm ?? 5000, S = externalWidthMm ?? 3200
    const lantern = newOpening('lantern', [], L, S)
    return [lantern, newOpening('roof-window', [lantern], L, S)]
  })
  function addOpening(kind: RoofOpeningKind) {
    setOpenings(prev => [...prev, newOpening(kind, prev, lengthMm, widthMm)])
  }
  function updateOpening(id: string, patch: Partial<FlatRoofOpening>) {
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  function removeOpening(id: string) {
    setOpenings(prev => prev.filter(o => o.id !== id))
  }
  const depthOptions = joistSystem === 'posi' ? POSI_DEPTHS : TIMBER_DEPTHS
  function changeSystem(next: JoistSystem) {
    setJoistSystem(next)
    // Keep a depth the new system actually offers.
    const options = next === 'posi' ? POSI_DEPTHS : TIMBER_DEPTHS
    if (!options.includes(joistDepth)) {
      setJoistDepth(next === 'posi' ? 250 : (checkFlatRoofJoist({ grade: next, depthMm: 175, centresMm, spanMm: widthMm, loads: spanLoads }).suggestedDepthMm ?? 175))
    }
  }
  function changeBuildUp(next: FlatRoofBuildUp) {
    setBuildUp(next)
    setInsulationMm(next === 'warm' ? 120 : Math.max(50, joistDepth - 50))
  }

  // Labour is suggested from the roof (lib/flat-roof-labour.ts) and follows it — the trades, the tasks and the hours —
  // until it is edited; then the estimator's own lines are kept, and "Suggest again" goes back to following the roof.
  const [labourOverride, setLabourOverride] = useState<LabourLine[] | null>(null)
  const [includeFitting, setIncludeFitting] = useState(false)
  const suggestedLinesRef = useRef<LabourLine[]>([])
  function addLabourLine() {
    setLabourOverride(prev => {
      const base = prev ?? suggestedLinesRef.current
      return [...base, { id: newLabourLineId(), tradeId: base[0]?.tradeId ?? '', task: '', hours: 0 }]
    })
  }
  function updateLabourLine(id: string, patch: Partial<LabourLine>) {
    setLabourOverride(prev => (prev ?? suggestedLinesRef.current).map(l => l.id === id ? { ...l, ...patch } : l))
  }
  function removeLabourLine(id: string) {
    setLabourOverride(prev => (prev ?? suggestedLinesRef.current).filter(l => l.id !== id))
  }

  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMiscMaterialLine() {
    setMiscMaterialLines(prev => [...prev, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }])
  }
  function updateMiscMaterialLine(id: string, patch: Partial<MiscMaterialLine>) {
    setMiscMaterialLines(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }
  function removeMiscMaterialLine(id: string) {
    setMiscMaterialLines(prev => prev.filter(m => m.id !== id))
  }

  const [profitPct, setProfitPct] = useState(0)
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(layerId: string) {
    setDisabledLayerIds(prev => {
      const next = new Set(prev)
      next.has(layerId) ? next.delete(layerId) : next.add(layerId)
      return next
    })
  }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  // The parapet's masonry runs from the top of the wall the roof sits on to the top of the parapet: the
  // roof's own build-up above the wall head, plus the parapet's height above the finished roof.
  const roofBuildUpMm = joistDepth + DECK_MM + (buildUp === 'warm' ? insulationMm : 0) + COVERING_MM
  const parapetMasonryHeightMm = roofBuildUpMm + parapetHeightMm

  const input: FlatRoofInput = {
    lengthMm, widthMm, joistCentresMm: centresMm, buildUp, fallRatio, edges, wallConnection,
    parapetHeightMm, parapetMasonryHeightMm, parapetType, outlets, openings,
  }
  const openingsKey = JSON.stringify(openings)
  const edgesKey = JSON.stringify(edges)
  const outletsKey = JSON.stringify(outlets)

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateFlatRoofGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, widthMm, centresMm, buildUp, fallRatio, edgesKey, wallConnection, parapetHeightMm, parapetMasonryHeightMm, parapetType, outletsKey, openingsKey])

  const g = geometryResult.ok ? geometryResult.geometry : null

  // The chosen solid timber against the span chart (lib/flat-roof-joist-spans.ts): the chart's suggestion is
  // used until a section is picked by hand, and a section that's too small for the span raises the warning —
  // which goes away as soon as the section (or the centres) is enough. Advice, not a design.
  const spanCheck = joistSystem === 'posi' ? null
    : checkFlatRoofJoist({ grade: joistSystem, depthMm: joistDepth, centresMm, spanMm: widthMm, loads: spanLoads })
  const suggested = spanCheck?.suggestedDepthMm ?? null
  const spanChart = useMemo(() => joistSystem === 'posi' ? [] : flatRoofSpanChart(joistSystem, spanLoads), [joistSystem, spanLoads])
  useEffect(() => {
    if (!depthPicked && suggested != null && suggested !== joistDepth) setJoistDepth(suggested)
  }, [depthPicked, suggested, joistDepth])
  const spanText = `${(widthMm / 1000).toFixed(2)}m span at ${centresMm}mm centres`
  const extraWarnings: string[] = []
  if (joistSystem === 'posi') {
    extraWarnings.push('Posi-joists are designed by the supplier to your span and loads, and so is the trimming round the rooflight openings — the trimmers here are an estimate to confirm with them.')
  } else if (spanCheck?.status === 'under') {
    extraWarnings.push(`${joistLabel(joistSystem, joistDepth)} is too small for a ${spanText}: the span chart gives it ${(spanCheck.maxSpanMm / 1000).toFixed(2)}m, so it needs 47×${suggested} or bigger — or check with the span tables or an engineer.`)
  } else if (spanCheck?.status === 'beyond') {
    extraWarnings.push(spanCheck.closerCentres
      ? `A ${spanText} is beyond what solid timber manages in the span chart — it works at ${spanCheck.closerCentres.centresMm}mm centres in 47×${spanCheck.closerCentres.depthMm}, or use Posi-joists or an engineer's design.`
      : `A ${spanText} is beyond what solid timber manages in the span chart — consider Posi-joists or an engineer's design.`)
  }

  // Which ends abut an existing wall square-on, and which sides run along one.
  const endAbuts = edges.high === 'abutment' || edges.low === 'abutment'
  const sideAbuts = edges.left === 'abutment' || edges.right === 'abutment'
  const hasParapet = parapetEdgeLm > 0

  // What goes at each edge and detail of the roof, from the covering's trim list (lib/flat-roof-covering-trims.ts).
  const trimRoof: TrimRoofInput = { edges, lengthMm, widthMm, kerbLm: g?.kerbLm ?? 0, openingCount: openings.length }
  const trims = resolveTrimLines(covering, trimRoof, trimPicks, extraTrims)
  const trimKey = JSON.stringify(trims.lines.map(l => [l.id, l.qty]))
  // ...and what the edges set as a gutter, and any parapet outlets, need for drainage.
  const drainRoof: DrainRoofInput = { edges, lengthMm, widthMm, downpipes, dropM, gullyCount: g?.gullyCount ?? 0, overflowCount: g?.overflowCount ?? 0 }
  const drain = resolveDrainage(drainRoof, drainSystem, drainPicks, extraDrain)
  const drainKey = JSON.stringify(drain.lines.map(l => [l.id, l.qty]))

  // The trades this roof needs and roughly how long each takes.
  const qtyOfLines = (lines: { product: { slot?: string; unit: string; code: string }; id: string; qty: number }[], test: (l: { product: { slot?: string; unit: string; code: string }; id: string; qty: number }) => boolean) =>
    lines.filter(test).reduce((sum, l) => sum + l.qty, 0)
  const labourSuggestions: LabourSuggestion[] = g ? suggestFlatRoofLabour({
    buildUp, covering, joistSystem,
    netAreaM2: g.netAreaM2, membraneAreaM2: g.membraneAreaM2, joistCount: g.joistCount, ledgerLm: g.ledgerLm, wallPlateLm: g.wallPlateLm,
    strutCount: g.strutCount, firringLm: g.firringLm, trimmerLm: g.trimLm, kerbLm: g.kerbLm,
    openings: openings.map(o => ({ kind: o.kind })),
    fasciaLm: fascia ? g.edgeTrimLm : 0,
    coveringTrimLm: covering === 'tpo' ? g.edgeTrimLm : qtyOfLines(trims.lines, l => l.product.unit !== 'nr' && l.product.code !== 'LEAD4'),
    coveringCorners: qtyOfLines(trims.lines, l => l.id.startsWith('trim_corner')),
    leadLm: covering === 'tpo' ? g.abutmentLm : qtyOfLines(trims.lines, l => l.product.code === 'LEAD4'),
    parapet: hasParapet ? { lm: g.parapetLm, masonryAreaM2: g.parapetMasonryAreaM2, type: parapetType, renderAreaM2: g.parapetRenderAreaM2, rainwaterOutlets: g.gullyCount, overflowOutlets: g.overflowCount } : undefined,
    drainage: {
      gutterLm: qtyOfLines(drain.lines, l => l.product.slot === 'gutter'),
      gutterFittings: qtyOfLines(drain.lines, l => ['running_outlet', 'angle', 'stop_end', 'union'].includes(l.product.slot ?? '')),
      downpipeLm: qtyOfLines(drain.lines, l => l.product.slot === 'downpipe'),
      shoes: qtyOfLines(drain.lines, l => l.product.slot === 'shoe'),
      hoppers: qtyOfLines(drain.lines, l => l.product.slot === 'hopper'),
      offsets: qtyOfLines(drain.lines, l => l.product.slot === 'offset'),
    },
  }) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, includeFitting)
  suggestedLinesRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines

  // The customer-facing description, written from the roof as it's set now (lib/flat-roof-description.ts) —
  // one short paragraph per part of the roof. It follows the roof as it changes, so what's saved to the
  // quote never describes a covering or a parapet the roof no longer has, until it's edited by hand
  // (then that text is kept, and "Regenerate" goes back to following the roof).
  const descriptionInput: FlatRoofDescriptionInput | null = g ? {
    buildUp, lengthMm, widthMm, fallRatio, joistSystem, joistDepth, centresMm,
    deckLabel: DECK[deck].label, strutting: joistSystem !== 'posi' && g.strutCount > 0,
    insulationMm, covering, fascia, downpipes, edges,
    brand: covering === 'grp' ? 'Cure It' : undefined,
    gutterLabel: DRAIN_SYSTEM_DESCRIPTION[drainSystem],
    wallFlashing: trims.picks.abutment_flashing === NONE ? 'none'
      : trims.picks.abutment_flashing === 'LEAD4' || trims.picks.abutment_flashing === undefined ? 'lead'
      : trims.picks.abutment_flashing === 'EPDM-COVER' ? 'cover' : 'simulated',
    // How many ends hang from a ledger and how many bear on a wall plate, from the lengths counted.
    ledgerEnds: g.lengthM > 0 ? Math.round(g.ledgerLm / g.lengthM) : 0,
    wallPlateEnds: g.lengthM > 0 ? Math.round(g.wallPlateLm / g.lengthM) : 0,
    endStraps: endAbuts && wallConnection === 'bearing',
    sideStrapped: sideAbuts,
    abutmentLm: g.abutmentLm, edgeTrimLm: g.edgeTrimLm, gutterLm: drain.picks.gutter === DRAIN_NONE ? 0 : g.gutterLm,
    parapet: hasParapet ? { lm: g.parapetLm, heightMm: parapetHeightMm, type: parapetType, rainwaterOutlets: g.gullyCount, overflowOutlets: g.overflowCount } : undefined,
    openings: openings.map(o => ({ kind: o.kind, widthMm: o.widthMm, depthMm: o.depthMm, trimmers: o.trimmers ?? 2 })),
  } : null
  // Two levels: a one-line description for the quote's phase line (`description`, printed everywhere) and the
  // full part-by-part text (`detail`, shown on the online quote behind a "What's included" toggle).
  const autoDescription = descriptionInput ? describeFlatRoofShort(descriptionInput) : ''
  const autoDetail = descriptionInput ? describeFlatRoof(descriptionInput) : ''
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? autoDescription
  const detail = detailOverride ?? autoDetail

  const layers = useMemo(() => {
    if (!geometryResult.ok) return []
    const base = buildFlatRoofLayers({
      wastePct, buildUp, joistSystem, joistDepth, insulationMm, deck, covering, fascia, downpipes, parapetType, trimLines: trims.lines, drainLines: drain.lines, g: geometryResult.geometry,
    })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryResult, wastePct, buildUp, joistSystem, joistDepth, insulationMm, deck, covering, fascia, downpipes, parapetType, trimKey, drainKey, rateOverrides])

  function setRate(layerId: string, unitCost: number) {
    setRateOverrides(prev => ({ ...prev, [layerId]: Math.max(0, unitCost) }))
  }
  function handleBreakdownRateChange(layerId: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === layerId)) {
      updateMiscMaterialLine(layerId, { unitCost: Math.max(0, unitCost) })
    } else {
      setRate(layerId, unitCost)
    }
  }

  const result = useMemo(() => {
    if (!geometryResult.ok) return { ok: false as const, error: geometryResult.error }
    try { return { ok: true as const, value: calculateFlatRoofCost(input, layers) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryResult, layers])

  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({
      layerId: m.id, name: m.name, category: 'materials', source: 'fixed',
      wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item',
      unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2),
    }))
  const materialLines = [...(result.ok ? result.value.lines : []), ...miscCostedLines]
  const enabledMaterialLines = materialLines.filter(l => !disabledLayerIds.has(l.layerId))

  const labourCostedLines: CostedLine[] = labourLines
    .map(l => {
      const trade = labourTrades.find(t => t.id === l.tradeId)
      if (!trade || l.hours <= 0) return null
      const rate = hourlyRate(trade)
      const line: CostedLine = {
        layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour',
        source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr',
        unitCost: rate, cost: +(l.hours * rate).toFixed(2),
      }
      return line
    })
    .filter((l): l is CostedLine => l !== null)

  const costSubtotal = enabledMaterialLines.reduce((s, l) => s + l.cost, 0) + labourCostedLines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(costSubtotal * profitPct / 100).toFixed(2)
  const profitLine: CostedLine | null = profitPct > 0 ? {
    layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed',
    wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount,
  } : null
  const totalCost = costSubtotal + profitAmount

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const miniNum = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={miniInput} />
  )
  const sectionHead = (text: string) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>{text}</div>
  )
  const edgeSelect = (which: keyof FlatRoofEdges, label: string) => (
    <div style={{ flex: 1 }}>
      <PropRow label={label}>
        <select value={edges[which]} onChange={e => setEdge(which, e.target.value as FlatRoofEdge)} style={propInput}>
          {(Object.entries(EDGE_LABEL) as [FlatRoofEdge, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </PropRow>
    </div>
  )

  return (
    <div style={{ border: '2px dashed #0369a1', borderRadius: 10, background: '#f5fbff', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#0369a1', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #bae6fd', borderRadius: 5, color: '#0369a1', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
            Close preview
          </button>
        )}
      </div>

      {/* Card header — mirrors a real sp-card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1, border: 'none', outline: 'none', background: 'transparent' }} />
        <input value={location} onChange={e => setLocation(e.target.value)}
          placeholder="Room / location"
          title="Which room or location this is — becomes the quote's room grouping when saved"
          style={{ fontSize: 12, color: '#0369a1', width: 140, padding: '4px 8px', border: '1px solid #bae6fd', borderRadius: 5, background: '#f5fbff' }} />
        <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))}
          style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        {result.ok && (
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>
            {fmt(totalCost * qty)}
          </span>
        )}
        {result.ok && (
          <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />
        )}
        {onSave && result.ok && (
          <button
            onClick={() => onSave({ name, qty, location, description, detail, lines: [...enabledMaterialLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>
            💾 Save &amp; Price
          </button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Quote line (short — printed on the quote)</label>
          {descriptionOverride === null
            ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the roof</span>
            : (
              <button onClick={() => setDescriptionOverride(null)}
                title="Go back to the line written from the roof — overwrites your edits below"
                style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                ↻ Edited by you — regenerate from the roof
              </button>
            )}
        </div>
        <textarea value={description} onChange={e => setDescriptionOverride(e.target.value)} rows={2}
          style={{ width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>What's included (full — shown on the online quote)</label>
          {detailOverride === null
            ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the roof</span>
            : (
              <button onClick={() => setDetailOverride(null)}
                title="Go back to the description written from the roof — overwrites your edits below"
                style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                ↻ Edited by you — regenerate from the roof
              </button>
            )}
        </div>
        <textarea value={detail} onChange={e => setDetailOverride(e.target.value)} rows={9}
          style={{ width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {/* An error is shown here with the controls still in place, so the value can be corrected. */}
      {!result.ok && (
        <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {result.error}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <FlatRoofPlanSvg
              g={g} lengthMm={lengthMm} widthMm={widthMm} centresMm={centresMm} fallRatio={fallRatio}
              edges={edges} wallConnection={wallConnection} openings={openings} outlets={outlets}
              onMoveOpening={(id, offsetMm, offsetSpanMm) => updateOpening(id, { offsetMm, offsetSpanMm })}
              onMoveOutlet={(id, positionMm) => updateOutlet(id, { positionMm })}
            />
            {[...g.warnings, ...extraWarnings].length > 0 && (
              <div style={{ marginTop: 6 }}>
                {[...g.warnings, ...extraWarnings].map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginBottom: 3 }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {(lengthMm / 1000).toFixed(2)} × {(widthMm / 1000).toFixed(2)}m roof, {g.netAreaM2.toFixed(2)} m² of covering after {g.openingAreaM2.toFixed(2)} m² of openings.
              {' '}{g.joistCount} joists ({g.joistLm.toFixed(1)}m of timber after the openings cut some short) plus {g.trimLm.toFixed(1)}m of trimmers.
              {' '}Firrings up to {Math.round(g.fallMm)}mm at the high end. Drag an opening on the plan to move it.
            </div>
            {/* What holds the joists to the walls — counted, so it can be checked */}
            <div style={{ fontSize: 11, color: '#475569', marginTop: 6, lineHeight: 1.5, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 5, padding: '6px 8px' }}>
              <strong style={{ fontWeight: 600 }}>Fixing to the walls:</strong>{' '}
              {g.ledgerLm > 0 && <>ledger plate {g.ledgerLm.toFixed(1)}m bolted with {g.ledgerBoltCount} anchors at 600 centres · </>}
              {g.wallPlateLm > 0 && <>wall plate {g.wallPlateLm.toFixed(1)}m · </>}
              {g.hangerCount} joist hangers{g.strapCount > 0 && <> · {g.strapCount} restraint straps</>}.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Width — joist span (mm)">{numInput(widthMm, setWidthMm, 1)}</PropRow></div>
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8, marginTop: 2 }}>
            {sectionHead('Build-up')}
            <PropRow label="Roof">
              <select value={buildUp} onChange={e => changeBuildUp(e.target.value as FlatRoofBuildUp)} style={propInput}>
                <option value="warm">Warm roof — PIR above the deck</option>
                <option value="cold">Cold roof — insulation between the joists</option>
              </select>
            </PropRow>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}><PropRow label={buildUp === 'warm' ? 'PIR (mm)' : 'Wool (mm)'}>{numInput(insulationMm, setInsulationMm)}</PropRow></div>
              <div style={{ flex: 1 }}>
                <PropRow label="Fall">
                  <select value={fallRatio} onChange={e => setFallRatio(+e.target.value)} style={propInput}>
                    <option value={40}>1 in 40</option>
                    <option value={60}>1 in 60</option>
                    <option value={80}>1 in 80</option>
                  </select>
                </PropRow>
              </div>
            </div>
            <div style={{ marginTop: 6 }}>
              <PropRow label="Deck">
                <select value={deck} onChange={e => setDeck(e.target.value as DeckType)} style={propInput}>
                  {(Object.entries(DECK) as [DeckType, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </PropRow>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8 }}>
            {sectionHead('Joists')}
            <PropRow label="Joist type">
              <select value={joistSystem} onChange={e => changeSystem(e.target.value as JoistSystem)} style={propInput}>
                {(Object.entries(JOIST_SYSTEM_LABEL) as [JoistSystem, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <PropRow label={joistSystem === 'posi' ? 'Depth' : 'Section'}>
                  <select value={joistDepth} onChange={e => { setJoistDepth(+e.target.value); setDepthPicked(true) }} style={propInput}>
                    {depthOptions.map(d => <option key={d} value={d}>{joistSystem === 'posi' ? `${d}mm` : `47 × ${d}`}</option>)}
                  </select>
                </PropRow>
              </div>
              <div style={{ flex: 1 }}>
                <PropRow label="Centres">
                  <select value={centresMm} onChange={e => setCentresMm(+e.target.value)} style={propInput}>
                    {[300, 400, 600].map(c => <option key={c} value={c}>{c}mm</option>)}
                  </select>
                </PropRow>
              </div>
            </div>
            {joistSystem === 'posi' ? (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>Posi-joists are sized by the supplier for the span — pick the depth they give you.</div>
            ) : (
              <>
                <SpanChartPanel
                  chart={spanChart} check={spanCheck!} grade={joistSystem} spanMm={widthMm} centresMm={centresMm} depthMm={joistDepth}
                  picked={depthPicked} loads={spanLoads} onLoads={setSpanLoads}
                  onUse={() => { if (suggested) { setJoistDepth(suggested); setDepthPicked(false) } }}
                  onPick={(depth, centres) => { setJoistDepth(depth); setDepthPicked(true); setCentresMm(centres) }}
                />
              </>
            )}
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8 }}>
            {sectionHead('Edges')}
            <div style={{ display: 'flex', gap: 6 }}>
              {edgeSelect('high', 'High edge (top)')}
              {edgeSelect('low', 'Low edge (bottom)')}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {edgeSelect('left', 'Left')}
              {edgeSelect('right', 'Right')}
            </div>
            {hasParapet && (
              <div style={{ marginTop: 8, padding: 6, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Parapet wall — {parapetEdgeLm.toFixed(1)}m</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}><PropRow label="Height above roof (mm)">{numInput(parapetHeightMm, setParapetHeightMm, 1)}</PropRow></div>
                  <div style={{ flex: 1 }}>
                    <PropRow label="Built as">
                      <select value={parapetType} onChange={e => setParapetType(e.target.value as ParapetType)} style={propInput}>
                        {(Object.entries(PARAPET_TYPE_LABEL) as [ParapetType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </PropRow>
                  </div>
                </div>
                {/* Each outlet on its own: change its edge and position, delete it, or drag it on the plan. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#64748b', flex: 1 }}>Outlets through the parapet — {g ? g.gullyCount : 0} rainwater, {g ? g.overflowCount : 0} overflow</span>
                  <button onClick={autoPlaceOutlets} title="Start again with an even spread of outlets for this parapet"
                    style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Auto-place</button>
                </div>
                {outlets.length === 0 && (
                  <div style={{ fontSize: 11, color: '#c0392b', marginBottom: 4 }}>No outlets — add a rainwater outlet below.</div>
                )}
                {outlets.map((o, i) => (
                  <div key={o.id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#64748b', width: 14 }}>{i + 1}</span>
                    <select value={o.kind} onChange={e => updateOutlet(o.id, { kind: e.target.value as FlatRoofOutletKind })} style={{ ...miniInput, flex: 1.1 }}>
                      {(Object.entries(OUTLET_LABEL) as [FlatRoofOutletKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={o.edge} onChange={e => updateOutlet(o.id, { edge: e.target.value as EdgeKey })} style={{ ...miniInput, flex: 1.1 }}>
                      {EDGE_ORDER.filter(e => edges[e] === 'parapet' || e === o.edge).map(e => <option key={e} value={e}>{EDGE_NAME[e]}</option>)}
                    </select>
                    <input type="number" min={0} value={o.positionMm} title={o.edge === 'left' || o.edge === 'right' ? 'mm from the high edge' : 'mm from the left'}
                      onChange={e => updateOutlet(o.id, { positionMm: Math.max(0, +e.target.value || 0) })} style={{ ...miniInput, flex: 0.9 }} />
                    <button onClick={() => removeOutlet(o.id)} aria-label={`Delete outlet ${i + 1}`}
                      style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
                  <button onClick={() => addOutlet('gully')}
                    style={{ fontSize: 11, padding: '3px 8px', border: '1px dashed #93c5fd', borderRadius: 999, background: 'none', color: '#1d4ed8', cursor: 'pointer' }}>+ Rainwater outlet</button>
                  <button onClick={() => addOutlet('overflow')}
                    style={{ fontSize: 11, padding: '3px 8px', border: '1px dashed #fcd34d', borderRadius: 999, background: 'none', color: '#b45309', cursor: 'pointer' }}>+ Overflow outlet</button>
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>Position is in mm along the edge — from the left, or from the high edge for the sides. Drag one on the plan to move it.</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Masonry from the wall head: {parapetMasonryHeightMm}mm ({roofBuildUpMm}mm of roof build-up + {parapetHeightMm}mm).</div>
              </div>
            )}
            {endAbuts && (
              <div style={{ marginTop: 8 }}>
                <PropRow label="Joists at the existing wall">
                  <select value={wallConnection} onChange={e => setWallConnection(e.target.value as FlatRoofWallConnection)} style={propInput}>
                    <option value="ledger">Ledger plate bolted to the wall, joists in hangers</option>
                    <option value="bearing">Joists bear on a wall plate, strapped</option>
                  </select>
                </PropRow>
              </div>
            )}
            {sideAbuts && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>The joists run parallel to the existing wall at the side, so the first joist is strapped to it.</div>
            )}
            {!endAbuts && !sideAbuts && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>No existing wall — the joists bear on a wall plate at each end.</div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8 }}>
            {sectionHead('Roof covering')}
            <PropRow label="Covering">
              <select value={covering} onChange={e => { setCovering(e.target.value as CoveringType); setTrimPicks({}); setExtraTrims([]) }} style={propInput}>
                {(Object.entries(COVERING_LABEL) as [CoveringType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>The trims below follow the edges set above.</div>
            {g && covering !== 'tpo' && (
              <CoveringTrimsPanel
                covering={covering} roof={trimRoof} trims={trims} areaM2={g.membraneAreaM2} wastePct={wastePct}
                onPick={(slot, code) => setTrimPicks(prev => ({ ...prev, [slot]: code }))}
                extras={extraTrims}
                onAddExtra={(code, qty) => setExtraTrims(prev => [...prev, { id: `x${Date.now().toString(36)}${prev.length}`, code, qty }])}
                onExtraQty={(id, qty) => setExtraTrims(prev => prev.map(x => x.id === id ? { ...x, qty } : x))}
                onRemoveExtra={id => setExtraTrims(prev => prev.filter(x => x.id !== id))}
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8 }}>
            {sectionHead('Drainage')}
            <PropRow label="Gutter and downpipe system">
              <select value={drainSystem} onChange={e => { setDrainSystem(e.target.value as DrainSystem); setDrainPicks({}) }} style={propInput}>
                {DRAIN_SYSTEMS.map(k => <option key={k} value={k}>{DRAIN_SYSTEM_LABEL[k]}</option>)}
              </select>
            </PropRow>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                Downpipes
                <input type="number" min={0} value={downpipes} onChange={e => setDownpipes(Math.max(0, +e.target.value || 0))} style={{ ...miniInput, width: 48 }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                Drop (m)
                <input type="number" min={0.5} step={0.1} value={dropM} onChange={e => setDropM(Math.max(0.5, +e.target.value || 0.5))} style={{ ...miniInput, width: 56 }} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={fascia} onChange={e => setFascia(e.target.checked)} style={{ width: 'auto' }} />
                Fascia board
              </label>
            </div>
            <DrainagePanel
              roof={drainRoof} drain={drain}
              onPick={(slot, code) => setDrainPicks(prev => ({ ...prev, [slot]: code }))}
              extras={extraDrain}
              onAddExtra={(code, qty) => setExtraDrain(prev => [...prev, { id: `d${Date.now().toString(36)}${prev.length}`, code, qty }])}
              onExtraQty={(id, qty) => setExtraDrain(prev => prev.map(x => x.id === id ? { ...x, qty } : x))}
              onRemoveExtra={id => setExtraDrain(prev => prev.filter(x => x.id !== id))}
            />
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8 }}>
            {sectionHead('Rooflight openings')}
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, lineHeight: 1.4 }}>
              This forms the opening — trimmers, kerb and upstand. The rooflight itself is priced separately.
            </div>
            {openings.map((o, i) => (
              <div key={o.id} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, marginBottom: 6, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: '#64748b', width: 14 }}>{i + 1}</span>
                  <select value={o.kind} onChange={e => {
                    const kind = e.target.value as RoofOpeningKind
                    updateOpening(o.id, { kind, trimmers: KIND_DEFAULTS[kind].trimmers, kerbHeightMm: KIND_DEFAULTS[kind].kerbHeightMm })
                  }} style={{ ...miniInput, flex: 1 }}>
                    {(Object.entries(KIND_LABEL) as [RoofOpeningKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button onClick={() => removeOpening(o.id)} aria-label={`Remove opening ${i + 1}`}
                    style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>Width</div>{miniNum(o.widthMm, n => updateOpening(o.id, { widthMm: n }), 1)}</div>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>Length</div>{miniNum(o.depthMm, n => updateOpening(o.id, { depthMm: n }), 1)}</div>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>From left</div>{miniNum(o.offsetMm, n => updateOpening(o.id, { offsetMm: n }))}</div>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>From high edge</div>{miniNum(o.offsetSpanMm, n => updateOpening(o.id, { offsetSpanMm: n }))}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>Trimmers and headers</div>
                    <select value={o.trimmers ?? 2} onChange={e => updateOpening(o.id, { trimmers: +e.target.value as 2 | 3 })} style={miniInput}>
                      <option value={2}>Doubled up</option>
                      <option value={3}>Tripled up</option>
                    </select>
                  </div>
                  <div style={{ width: 70 }}>
                    <div style={{ fontSize: 9, color: '#94a3b8' }}>Kerb (mm)</div>
                    {miniNum(o.kerbHeightMm ?? 200, n => updateOpening(o.id, { kerbHeightMm: n }))}
                  </div>
                </div>
                {/* How this opening is trimmed: at its own sides, so it doesn't matter where the joists fall */}
                {(() => {
                  const t = g?.openingTrims.find(tr => tr.openingId === o.id)
                  if (!t) return null
                  const word = t.members === 3 ? 'tripled' : 'doubled'
                  return (
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 5, lineHeight: 1.4 }}>
                      {word[0].toUpperCase() + word.slice(1)} trimmers tight to each side of the opening, full span, with {word} headers {(t.headerLengthMm / 1000).toFixed(2)}m long above and below it — so the opening is exactly {o.widthMm} × {o.depthMm}mm. The trimmers take {t.zoneMm}mm each side.
                      {t.joistsReplaced > 0 && <> {t.joistsReplaced} standard {t.joistsReplaced === 1 ? 'joist falls' : 'joists fall'} where a trimmer goes and {t.joistsReplaced === 1 ? 'is' : 'are'} left out.</>}
                      {t.joistsCut > 0 && <> {t.joistsCut} {t.joistsCut === 1 ? 'joist is' : 'joists are'} cut short by it.</>}
                    </div>
                  )
                })()}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(Object.keys(KIND_LABEL) as RoofOpeningKind[]).map(k => (
                <button key={k} onClick={() => addOpening(k)}
                  style={{ fontSize: 11, padding: '3px 8px', border: '1px dashed #7dd3fc', borderRadius: 999, background: 'none', color: '#0369a1', cursor: 'pointer' }}>
                  + {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>

          <PropRow label={`Waste % (${wastePct}%)`}>
            <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}>
            <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={includeFitting} onIncludeFitting={setIncludeFitting}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0}
        />

        <LabourSection labourLines={labourLines} labourTrades={labourTrades}
          onAdd={addLabourLine} onUpdate={updateLabourLine} onRemove={removeLabourLine} />

        <MiscMaterialsSection miscMaterialLines={miscMaterialLines}
          onAdd={addMiscMaterialLine} onUpdate={updateMiscMaterialLine} onRemove={removeMiscMaterialLine} />

        {result.ok && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={materialLines} onRateChange={handleBreakdownRateChange} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
              layerSides={{}} onSidesChange={() => {}} sidesEligibleLayerIds={noSidesLayers} />
            {profitPct > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>
                Cost: £{costSubtotal.toFixed(2)} + {profitPct}% profit (£{profitAmount.toFixed(2)}) ={' '}
                <strong style={{ color: '#7ab533' }}>£{totalCost.toFixed(2)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Plan view of the roof — joists at their centres (cut short where an opening crosses them), each of
// the four edges drawn as what it is (existing wall, gutter, parapet, free), the ledger's bolts and the
// joist hangers or wall-plate straps at an existing wall, the parapet's outlets, and each opening with
// its trimmers drawn as the two or three separate members they are. Drag an opening to position it
// (snaps to 50mm). Visual only: the numbers in the breakdown come from the geometry, not this drawing.
const KIND_STYLE: Record<RoofOpeningKind, { fill: string; stroke: string }> = {
  'lantern':     { fill: '#ccfbf1', stroke: '#0f766e' },
  'roof-window': { fill: '#dbeafe', stroke: '#1d4ed8' },
  'dome':        { fill: '#fef3c7', stroke: '#b45309' },
  'hatch':       { fill: '#e5e7eb', stroke: '#4b5563' },
}
// Short names for the labels inside the drawn boxes, which can be small.
const KIND_SHORT: Record<RoofOpeningKind, string> = { 'lantern': 'Lantern', 'roof-window': 'Window', 'dome': 'Dome', 'hatch': 'Hatch' }
// ── Covering trims and accessories ─────────────────────────────────────────────────
// For GRP (Cure It) and EPDM: what goes at each edge and detail of the roof, in metres or numbers worked out from
// the roof, with a choice of trim for each place, the covering's coverage (how many tins), and a way to add any other
// trim from the range by hand. The choices become priced lines in the breakdown below.
function trimOptionLabel(covering: CoveringType, code: string): string {
  if (code === NONE) return 'None'
  const p = trimProduct(covering, code)
  if (!p) return code
  return covering === 'grp' ? `${p.code} — ${p.use}` : p.name
}
function buyText(t: TrimLine, wastePct = 5): string {
  const p = t.product
  if (p.unit === 'length') return `${Math.ceil(t.qty * (1 + wastePct / 100) / (p.packLm ?? 3) - 1e-9)} × ${p.packLm}m lengths`
  if (p.unit === 'lm') return `${(t.qty * (1 + wastePct / 100)).toFixed(1)} m`
  return `${t.qty} nr`
}

function CoveringTrimsPanel({ covering, roof, trims, areaM2, wastePct, onPick, extras, onAddExtra, onExtraQty, onRemoveExtra }: {
  covering: CoveringType
  roof: TrimRoofInput
  trims: ReturnType<typeof resolveTrimLines>
  areaM2: number
  wastePct: number
  onPick: (slot: SlotId, code: string) => void
  extras: ExtraTrim[]
  onAddExtra: (code: string, qty: number) => void
  onExtraQty: (id: string, qty: number) => void
  onRemoveExtra: (id: string) => void
}) {
  const defs = trimSlotDefs(covering)
  // A place is listed when the roof has something there (a corner place when it has such corners at all).
  const possibleCorners = cornerCounts(roof, {})
  const qtyFor = (d: TrimSlotDef): number =>
    d.id in possibleCorners ? possibleCorners[d.id as keyof typeof possibleCorners] : trims.lengthsM[d.id as keyof typeof trims.lengthsM]
  const rows = defs.filter(d => qtyFor(d) > 0)
  const isCorner = (d: TrimSlotDef) => d.id in possibleCorners
  const catalogue = TRIM_CATALOGUE[covering]
  const [addCode, setAddCode] = useState('')
  const [addQty, setAddQty] = useState(1)
  const cov = covering === 'grp' ? grpCoverage(areaM2, wastePct) : null
  const title = covering === 'grp' ? 'GRP trims and accessories — Cure It' : 'EPDM trims and accessories'
  const line = (d: TrimSlotDef) => trims.lines.find(l => l.id.startsWith(`trim_${d.id}_`))
  const selectStyle: React.CSSProperties = { ...miniInput, width: '100%' }

  return (
    <div style={{ marginTop: 10, padding: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0c4a6e', textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
      {cov && (
        <div style={{ fontSize: 11, color: '#334155', marginTop: 4, lineHeight: 1.45 }}>
          Covering area <strong>{areaM2.toFixed(1)} m²</strong> (the roof, upstands, parapet face and kerbs; {cov.areaM2.toFixed(1)} m² with {wastePct}% waste):{' '}
          <strong>{cov.resinTins}</strong> resin {cov.resinTins === 1 ? 'tin' : 'tins'} ({CURE_IT.resinTinM2} m² a tin), <strong>{cov.topcoatTins}</strong> topcoat {cov.topcoatTins === 1 ? 'tin' : 'tins'} ({CURE_IT.topcoatTinM2} m² a tin) and {cov.hardenerKg}kg hardener.
        </div>
      )}
      {rows.length === 0 && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>This roof has no edges or details that take a trim.</div>
      )}
      {rows.map(d => {
        const chosen = trims.picks[d.id]
        const l = line(d)
        const qty = qtyFor(d)
        return (
          <div key={d.id} style={{ marginTop: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, color: '#334155' }}>
              <span><strong>{d.label}</strong> <span style={{ color: '#94a3b8' }}>— {d.where}</span></span>
              <span style={{ whiteSpace: 'nowrap', color: '#0369a1' }}>{isCorner(d) ? `${qty} nr` : `${qty.toFixed(1)} lm`}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <select value={chosen} onChange={e => onPick(d.id, e.target.value)} style={selectStyle}>
                {d.options.map(c => <option key={c} value={c}>{trimOptionLabel(covering, c)}</option>)}
                <option value={NONE}>None</option>
              </select>
              {l && <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>{buyText(l)}</span>}
            </div>
          </div>
        )
      })}
      <div style={{ marginTop: 9, paddingTop: 7, borderTop: '1px solid #bae6fd' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Add another trim or accessory</div>
        {extras.map(x => {
          const p = trimProduct(covering, x.code)
          if (!p) return null
          return (
            <div key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 11, color: '#334155' }}>
              <span style={{ flex: 1 }}>{trimOptionLabel(covering, x.code)}</span>
              <input type="number" min={0} step={p.unit === 'nr' ? 1 : 0.5} value={x.qty} onChange={e => onExtraQty(x.id, Math.max(0, +e.target.value || 0))} style={{ ...miniInput, width: 56 }} />
              <span style={{ width: 18 }}>{p.unit === 'nr' ? 'nr' : 'lm'}</span>
              <button onClick={() => onRemoveExtra(x.id)} aria-label="Remove" style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <select value={addCode} onChange={e => setAddCode(e.target.value)} style={selectStyle}>
            <option value="">Choose a trim…</option>
            {catalogue.map(p => <option key={p.code} value={p.code}>{trimOptionLabel(covering, p.code)}</option>)}
          </select>
          <input type="number" min={0} value={addQty} onChange={e => setAddQty(Math.max(0, +e.target.value || 0))} style={{ ...miniInput, width: 56 }} />
          <button disabled={!addCode || !(addQty > 0)} onClick={() => { onAddExtra(addCode, addQty); setAddCode('') }}
            style={{ fontSize: 11, padding: '3px 8px', border: '1px dashed #7dd3fc', borderRadius: 999, background: 'none', color: '#0369a1', cursor: addCode && addQty > 0 ? 'pointer' : 'default', opacity: addCode && addQty > 0 ? 1 : 0.5 }}>+ Add</button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>
        Lengths and corners are worked out from the roof; each trim is priced in the breakdown with a sample rate you can change.
        {covering === 'grp' ? ' Check each trim against the Cure It details for the build-up.' : ' EPDM trims are generic — say which supplier you use and their range can go in.'}
      </div>
    </div>
  )
}

// ── Suggested labour ───────────────────────────────────────────────────────────────
// Which trades the roof as chosen needs, and roughly how long each takes, with the working for each. The hours go
// straight into the labour section below (where they can be changed) and follow the roof until they are.
function LabourSuggestionPanel({ suggestions, includeFitting, onIncludeFitting, unmatched, edited, onSuggestAgain, tradesFound }: {
  suggestions: LabourSuggestion[]
  includeFitting: boolean
  onIncludeFitting: (on: boolean) => void
  unmatched: LabourTradeKind[]
  edited: boolean
  onSuggestAgain: () => void
  tradesFound: boolean
}) {
  const shown = suggestions.filter(x => !x.optional || includeFitting)
  const fitting = suggestions.find(x => x.optional)
  const total = shown.reduce((sum, x) => sum + x.hours, 0)
  const byTrade = (Object.keys(LABOUR_TRADE_LABEL) as LabourTradeKind[])
    .map(k => ({ k, hours: shown.filter(x => x.trade === k).reduce((sum, x) => sum + x.hours, 0) }))
    .filter(t => t.hours > 0)
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0c4a6e', textTransform: 'uppercase', letterSpacing: 0.4 }}>Suggested labour for this roof</div>
        {edited
          ? <button onClick={onSuggestAgain} title="Go back to the labour suggested from the roof — replaces the labour lines below"
              style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — suggest again from the roof</button>
          : <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the roof</span>}
      </div>
      <div style={{ fontSize: 12, color: '#334155', marginTop: 4, lineHeight: 1.5 }}>
        <strong>{total} hours</strong> in all:{' '}
        {byTrade.map((t, i) => <span key={t.k}>{i > 0 ? ', ' : ''}{LABOUR_TRADE_LABEL[t.k].toLowerCase()} {t.hours}h</span>)}.
      </div>
      {unmatched.length > 0 && (
        <div style={{ fontSize: 11, color: '#b45309', marginTop: 4, lineHeight: 1.45 }}>
          {tradesFound
            ? <>Back Office has no trade that looks like {unmatched.map(k => LABOUR_TRADE_LABEL[k].toLowerCase()).join(', ')} — those lines are left without a trade. Pick one from the list, or add it under Back Office → Labour &amp; Trades.</>
            : <>Add your trades under Back Office → Labour &amp; Trades and these hours will be priced.</>}
        </div>
      )}
      {fitting && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: '#475569', marginTop: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={includeFitting} onChange={e => onIncludeFitting(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
          <span>Include fitting the rooflights ({fitting.hours}h). Leave it off if they're priced fitted with the rooflights themselves.{edited ? ' Applies when you suggest again.' : ''}</span>
        </label>
      )}
      <details style={{ marginTop: 6 }}>
        <summary style={{ fontSize: 11, color: '#0369a1', cursor: 'pointer' }}>How the hours are worked out</summary>
        <div style={{ marginTop: 4 }}>
          {shown.map(x => (
            <div key={x.key} style={{ fontSize: 11, color: '#334155', padding: '3px 0', borderTop: '1px solid #e0f2fe', lineHeight: 1.45 }}>
              <strong>{LABOUR_TRADE_LABEL[x.trade]}</strong> — {x.task}: <strong>{x.hours}h</strong>
              <div style={{ color: '#64748b' }}>{x.basis}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
          Rough hours per unit for a small, easily reached roof — one operative. Change any line in the labour section below. Allow more for difficult access, height or weather.
        </div>
      </details>
    </div>
  )
}

// ── Drainage ───────────────────────────────────────────────────────────────────────
// What the edges set as a gutter, and any outlets through a parapet, need: the gutter, its brackets, stop ends,
// running outlets, unions and angles, the downpipes and their clips and shoes, hopper heads and the parapet outlets —
// each with a choice of material (uPVC, aluminium, cast-iron effect) and a length or count worked out from the roof.
function drainBuyText(l: DrainLine, wastePct = 5): string {
  const p = l.product
  if (p.unit === 'length') return `${Math.ceil(l.qty * (1 + wastePct / 100) / (p.packLm ?? 3) - 1e-9)} × ${p.packLm}m lengths`
  if (p.unit === 'lm') return `${(l.qty * (1 + wastePct / 100)).toFixed(1)} m`
  return `${l.qty} nr`
}

function DrainagePanel({ roof, drain, onPick, extras, onAddExtra, onExtraQty, onRemoveExtra }: {
  roof: DrainRoofInput
  drain: ReturnType<typeof resolveDrainage>
  onPick: (slot: DrainSlotId, code: string) => void
  extras: DrainExtra[]
  onAddExtra: (code: string, qty: number) => void
  onExtraQty: (id: string, qty: number) => void
  onRemoveExtra: (id: string) => void
}) {
  const q = drain.quantities
  const nothing = q.gutterLm === 0 && roof.gullyCount === 0
  const qtyOf: Record<DrainSlotId, number> = {
    gutter: q.gutterLm, gutter_bracket: q.brackets, stop_end: q.stopEnds, running_outlet: q.runningOutlets,
    union: drain.lines.find(l => l.product.slot === 'union')?.qty ?? 0, angle: q.corners,
    hopper: q.hoppers, parapet_outlet: q.parapetOutlets, overflow_outlet: q.overflowOutlets,
    downpipe: q.downpipeLm, pipe_clip: q.clips, shoe: q.shoes, offset: Math.floor(roof.downpipes),
  }
  const isLm = (id: DrainSlotId) => id === 'gutter' || id === 'downpipe'
  // A part is listed when the roof has something for it; offsets are listed whenever there are downpipes, so they can be switched on.
  const rows = nothing ? [] : DRAIN_SLOTS.filter(d => qtyOf[d.id] > 0)
  const [addCode, setAddCode] = useState('')
  const [addQty, setAddQty] = useState(1)
  const selectStyle: React.CSSProperties = { ...miniInput, width: '100%' }
  const edgeNames = (Object.keys(roof.edges) as (keyof FlatRoofEdges)[]).filter(k => roof.edges[k] === 'gutter').map(k => EDGE_NAME[k].toLowerCase())

  return (
    <div style={{ marginTop: 10, padding: 8, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0c4a6e', textTransform: 'uppercase', letterSpacing: 0.4 }}>Gutters, downpipes and outlets</div>
      {nothing ? (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>
          No edge is set as a gutter and there are no rainwater outlets through a parapet. Set an edge to Gutter, or a parapet edge with outlets, above and the parts to drain it appear here.
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#334155', marginTop: 4, lineHeight: 1.45 }}>
          {q.gutterLm > 0 && <>Gutter on the <strong>{edgeNames.join(' and ')}</strong> ({q.gutterLm.toFixed(1)}m). </>}
          {roof.gullyCount > 0 && <>{roof.gullyCount} rainwater and {roof.overflowCount} overflow outlet{roof.gullyCount + roof.overflowCount === 1 ? '' : 's'} through the parapet. </>}
          {Math.floor(roof.downpipes)} downpipe{Math.floor(roof.downpipes) === 1 ? '' : 's'}, each dropping {roof.dropM}m.
        </div>
      )}
      {drain.warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: '#c0392b', marginTop: 4 }}>⚠ {w}</div>)}
      {rows.map(d => {
        const l = drain.lines.find(x => x.product.slot === d.id)
        return (
          <div key={d.id} style={{ marginTop: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11, color: '#334155' }}>
              <span><strong>{d.label}</strong> <span style={{ color: '#94a3b8' }}>— {d.where}</span></span>
              <span style={{ whiteSpace: 'nowrap', color: '#0369a1' }}>{isLm(d.id) ? `${qtyOf[d.id].toFixed(1)} lm` : `${qtyOf[d.id]} nr`}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <select value={drain.picks[d.id]} onChange={e => onPick(d.id, e.target.value)} style={selectStyle}>
                {drainOptions(d.id).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
                <option value={DRAIN_NONE}>None</option>
              </select>
              {l && <span style={{ fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>{drainBuyText(l)}</span>}
            </div>
          </div>
        )
      })}
      <div style={{ marginTop: 9, paddingTop: 7, borderTop: '1px solid #bae6fd' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>Add another part</div>
        {extras.map(x => {
          const p = drainProduct(x.code)
          if (!p) return null
          return (
            <div key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, fontSize: 11, color: '#334155' }}>
              <span style={{ flex: 1 }}>{p.name}</span>
              <input type="number" min={0} step={p.unit === 'nr' ? 1 : 0.5} value={x.qty} onChange={e => onExtraQty(x.id, Math.max(0, +e.target.value || 0))} style={{ ...miniInput, width: 56 }} />
              <span style={{ width: 18 }}>{p.unit === 'nr' ? 'nr' : 'lm'}</span>
              <button onClick={() => onRemoveExtra(x.id)} aria-label="Remove" style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <select value={addCode} onChange={e => setAddCode(e.target.value)} style={selectStyle}>
            <option value="">Choose a part…</option>
            {DRAIN_PRODUCTS.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
          <input type="number" min={0} value={addQty} onChange={e => setAddQty(Math.max(0, +e.target.value || 0))} style={{ ...miniInput, width: 56 }} />
          <button disabled={!addCode || !(addQty > 0)} onClick={() => { onAddExtra(addCode, addQty); setAddCode('') }}
            style={{ fontSize: 11, padding: '3px 8px', border: '1px dashed #7dd3fc', borderRadius: 999, background: 'none', color: '#0369a1', cursor: addCode && addQty > 0 ? 'pointer' : 'default', opacity: addCode && addQty > 0 ? 1 : 0.5 }}>+ Add</button>
        </div>
      </div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 6, lineHeight: 1.4 }}>
        Generic parts, not a make — each is priced in the breakdown with a sample rate you can change. Say which supplier you use and their range can go in.
      </div>
    </div>
  )
}

// ── The span chart: for the roof's joist span, which sections work at each centres. The chosen section's
// row is marked, and cells that reach the span are green, so the answer reads straight off the chart.
function SpanChartPanel({ chart, check, grade, spanMm, centresMm, depthMm, picked, loads, onLoads, onUse, onPick }: {
  chart: ReturnType<typeof flatRoofSpanChart>
  check: ReturnType<typeof checkFlatRoofJoist>
  grade: 'c16' | 'c24'
  spanMm: number
  centresMm: number
  depthMm: number
  picked: boolean
  loads: JoistSpanLoads
  onLoads: (l: JoistSpanLoads) => void
  onUse: () => void
  onPick: (depthMm: number, centresMm: number) => void
}) {
  const span = (spanMm / 1000).toFixed(2)
  const bad = check.status !== 'ok'
  const cell = (spanOfCell: number, isChosen: boolean): React.CSSProperties => ({
    padding: '2px 4px', textAlign: 'center', cursor: 'pointer',
    background: spanOfCell >= spanMm ? '#dcfce7' : '#f8fafc',
    color: spanOfCell >= spanMm ? '#166534' : '#94a3b8',
    outline: isChosen ? '2px solid #0369a1' : 'none', outlineOffset: -2,
    fontWeight: isChosen ? 700 : 400,
  })
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: bad ? '#c0392b' : '#166534' }}>
        {check.status === 'ok' && <>✓ 47×{depthMm} {grade.toUpperCase()} works for a {span}m span at {centresMm}mm centres (up to {(check.maxSpanMm / 1000).toFixed(2)}m).</>}
        {check.status === 'under' && <>⚠ 47×{depthMm} {grade.toUpperCase()} is too small for a {span}m span at {centresMm}mm centres — it manages {(check.maxSpanMm / 1000).toFixed(2)}m. The chart says 47×{check.suggestedDepthMm}.</>}
        {check.status === 'beyond' && <>⚠ A {span}m span at {centresMm}mm centres is beyond solid timber.{check.closerCentres ? <> It works at {check.closerCentres.centresMm}mm centres in 47×{check.closerCentres.depthMm}.</> : <> Use Posi-joists or an engineer's design.</>}</>}
        {check.suggestedDepthMm != null && check.suggestedDepthMm !== depthMm && (
          <button onClick={onUse}
            style={{ marginLeft: 6, fontSize: 11, background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
            Use 47×{check.suggestedDepthMm}
          </button>
        )}
      </div>
      {!picked && check.suggestedDepthMm != null && (
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>The section follows the span chart until you pick one yourself.</div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary style={{ fontSize: 11, color: '#0369a1', cursor: 'pointer' }}>Span chart — {grade.toUpperCase()} joists, longest span in metres</summary>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 4 }}>
          <thead>
            <tr style={{ color: '#64748b' }}>
              <th style={{ textAlign: 'left', fontWeight: 600, padding: '2px 4px' }}>Section</th>
              {SPAN_CHART_CENTRES_MM.map(c => <th key={c} style={{ fontWeight: 600, padding: '2px 4px', background: c === centresMm ? '#e0f2fe' : 'none' }}>{c}mm</th>)}
            </tr>
          </thead>
          <tbody>
            {chart.map(row => (
              <tr key={row.depthMm}>
                <td style={{ padding: '2px 4px', fontWeight: row.depthMm === depthMm ? 700 : 400 }}>47×{row.depthMm}</td>
                {SPAN_CHART_CENTRES_MM.map(c => (
                  <td key={c} onClick={() => onPick(row.depthMm, c)} title={`Use 47×${row.depthMm} at ${c}mm centres`}
                    style={cell(row.spansMm[c], row.depthMm === depthMm && c === centresMm)}>
                    {(row.spansMm[c] / 1000).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
          Green reaches your {span}m span. Click a cell to use that section and those centres. Span is between bearings.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', fontSize: 10, color: '#64748b' }}>
          <label>Roof build-up load (kN/m²)
            <input type="number" step={0.05} min={0.2} value={loads.deadKnM2} onChange={e => onLoads({ ...loads, deadKnM2: Math.max(0.2, +e.target.value || 0.2) })}
              style={{ ...miniInput, width: 56, marginLeft: 4 }} />
          </label>
          <label>Snow / access (kN/m²)
            <input type="number" step={0.05} min={0.25} value={loads.imposedKnM2} onChange={e => onLoads({ ...loads, imposedKnM2: Math.max(0.25, +e.target.value || 0.25) })}
              style={{ ...miniInput, width: 56, marginLeft: 4 }} />
          </label>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
          Worked out cautiously from timber beam formulae (deflection to 0.003 × span, creep included) — a pricing guide, not a design. Check the span tables or an engineer.
        </div>
      </details>
    </div>
  )
}

const TRIMMER_COLOUR = '#b45309'
const EDGE_BAR = 9

function FlatRoofPlanSvg({ g, lengthMm, widthMm, centresMm, fallRatio, edges, wallConnection, openings, outlets, onMoveOpening, onMoveOutlet }: {
  g: FlatRoofGeometry
  lengthMm: number
  widthMm: number
  centresMm: number
  fallRatio: number
  edges: FlatRoofEdges
  wallConnection: FlatRoofWallConnection
  openings: FlatRoofOpening[]
  outlets: FlatRoofOutlet[]
  onMoveOpening: (id: string, offsetMm: number, offsetSpanMm: number) => void
  onMoveOutlet: (id: string, positionMm: number) => void
}) {
  const vbW = 430, vbH = 372
  const k = Math.min(310 / lengthMm, 180 / widthMm)
  const w = lengthMm * k, h = widthMm * k
  const x0 = 62 + (310 - w) / 2, y0 = 52
  const svgRef = useRef<SVGSVGElement>(null)
  // Either an opening (grabbed at an offset from its corner) or an outlet is being dragged.
  const [drag, setDrag] = useState<{ type: 'opening'; id: string; dx: number; dy: number } | { type: 'outlet'; id: string } | null>(null)
  const positions = studPositionsMm(lengthMm, centresMm)

  function pointerMm(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    return { x: (p.x - x0) / k, y: (p.y - y0) / k }
  }
  // Capturing keeps the drag going if the pointer slips off the shape; not every input device allows it.
  const capture = (e: React.PointerEvent) => { try { (e.target as Element).setPointerCapture(e.pointerId) } catch { /* the drag still works without it */ } }
  function onDown(e: React.PointerEvent, o: FlatRoofOpening) {
    const p = pointerMm(e)
    if (!p) return
    capture(e)
    setDrag({ type: 'opening', id: o.id, dx: p.x - o.offsetMm, dy: p.y - o.offsetSpanMm })
  }
  function onDownOutlet(e: React.PointerEvent, o: FlatRoofOutlet) {
    capture(e)
    setDrag({ type: 'outlet', id: o.id })
  }
  function onMove(e: React.PointerEvent) {
    if (!drag) return
    const p = pointerMm(e)
    if (!p) return
    const snap50 = (n: number) => Math.round(n / 50) * 50
    if (drag.type === 'outlet') {
      // Along its own edge only: from the left for the high and low edges, from the high edge for the sides.
      const o = outlets.find(op => op.id === drag.id)
      if (!o) return
      const horizontal = o.edge === 'high' || o.edge === 'low'
      const len = horizontal ? lengthMm : widthMm
      onMoveOutlet(o.id, Math.max(0, Math.min(len, snap50(horizontal ? p.x : p.y))))
      return
    }
    const o = openings.find(op => op.id === drag.id)
    if (!o) return
    onMoveOpening(o.id,
      Math.max(0, Math.min(Math.max(0, lengthMm - o.widthMm), snap50(p.x - drag.dx))),
      Math.max(0, Math.min(Math.max(0, widthMm - o.depthMm), snap50(p.y - drag.dy))))
  }

  // The standard joists: one that falls where an opening's trimmer goes is left out (the trimmer takes its
  // place), and one the opening crosses is drawn only where it's there — stopping at the headers.
  const joistLines: React.ReactNode[] = []
  for (const j of flatRoofJoistLayout(lengthMm, widthMm, centresMm, openings)) {
    if (j.replaced) continue
    const segments: [number, number][] = []
    let from = 0
    for (const [a, b] of j.cuts) { if (a > from) segments.push([from, a]); from = Math.max(from, b) }
    if (from < widthMm) segments.push([from, widthMm])
    segments.forEach(([a, b], i) => joistLines.push(
      <line key={`${j.positionMm}-${i}`} x1={x0 + j.positionMm * k} x2={x0 + j.positionMm * k} y1={y0 + a * k} y2={y0 + b * k} stroke="#b4b2a9" strokeWidth={1} />,
    ))
  }

  // ── Edges: a bar outside each one, styled by what it is.
  const bars: React.ReactNode[] = []
  const labels: React.ReactNode[] = []
  const edgeText = (which: keyof FlatRoofEdges): string => {
    const t = edges[which]
    const perpendicular = which === 'high' || which === 'low'
    if (t === 'abutment') {
      if (!perpendicular) return 'Existing wall — first joist strapped'
      return wallConnection === 'ledger' ? 'Existing wall — ledger bolted on, joists in hangers' : 'Existing wall — joists on a wall plate, strapped'
    }
    if (t === 'gutter') return 'Gutter'
    if (t === 'parapet') return 'Parapet wall'
    return 'Free edge — drip trim'
  }
  const rects: Record<keyof FlatRoofEdges, { x: number; y: number; w: number; h: number }> = {
    high:  { x: x0, y: y0 - EDGE_BAR, w, h: EDGE_BAR },
    low:   { x: x0, y: y0 + h, w, h: EDGE_BAR },
    left:  { x: x0 - EDGE_BAR, y: y0, w: EDGE_BAR, h },
    right: { x: x0 + w, y: y0, w: EDGE_BAR, h },
  }
  ;(['high', 'low', 'left', 'right'] as const).forEach(which => {
    const r = rects[which], t = edges[which]
    if (t === 'abutment') bars.push(<rect key={`b-${which}`} {...r} fill="#57534e" />)
    else if (t === 'parapet') bars.push(<rect key={`b-${which}`} {...r} fill="#d6d3d1" stroke="#57534e" strokeWidth={1} />)
    else if (t === 'gutter') {
      const horiz = which === 'high' || which === 'low'
      bars.push(<line key={`b-${which}`}
        x1={horiz ? r.x : (which === 'left' ? r.x + r.w - 2 : r.x + 2)} x2={horiz ? r.x + r.w : (which === 'left' ? r.x + r.w - 2 : r.x + 2)}
        y1={horiz ? (which === 'high' ? r.y + r.h - 2 : r.y + 2) : r.y} y2={horiz ? (which === 'high' ? r.y + r.h - 2 : r.y + 2) : r.y + r.h}
        stroke="#2563eb" strokeWidth={3.5} />)
    } else {
      const horiz = which === 'high' || which === 'low'
      bars.push(<line key={`b-${which}`}
        x1={horiz ? r.x : (which === 'left' ? r.x + r.w : r.x)} x2={horiz ? r.x + r.w : (which === 'left' ? r.x + r.w : r.x)}
        y1={horiz ? (which === 'high' ? r.y + r.h : r.y) : r.y} y2={horiz ? (which === 'high' ? r.y + r.h : r.y) : r.y + r.h}
        stroke="#a8a29e" strokeWidth={1.4} strokeDasharray="4 3" />)
    }
  })
  labels.push(<text key="l-high" x={x0} y={y0 - EDGE_BAR - 4} fontSize={9} fill="#57534e">{edgeText('high')}</text>)
  // Below the low edge, clear of the arrows a parapet's outlets draw there (they run about 20 down).
  labels.push(<text key="l-low" x={x0} y={y0 + h + EDGE_BAR + 36} fontSize={9} fill="#57534e">Low edge — {edgeText('low').toLowerCase()}</text>)
  labels.push(<text key="l-left" x={x0 - EDGE_BAR - 5} y={y0 + h / 2} fontSize={9} fill="#57534e" textAnchor="middle" transform={`rotate(-90 ${x0 - EDGE_BAR - 5} ${y0 + h / 2})`}>{`Left — ${edgeText('left').toLowerCase()}`}</text>)
  labels.push(<text key="l-right" x={x0 + w + EDGE_BAR + 12} y={y0 + h / 2} fontSize={9} fill="#57534e" textAnchor="middle" transform={`rotate(90 ${x0 + w + EDGE_BAR + 12} ${y0 + h / 2})`}>{`Right — ${edgeText('right').toLowerCase()}`}</text>)

  // ── Fixings at an existing wall: ledger bolts and joist hangers, or restraint straps.
  const fixings: React.ReactNode[] = []
  for (const end of ['high', 'low'] as const) {
    if (edges[end] !== 'abutment') continue
    const y = end === 'high' ? y0 : y0 + h
    if (wallConnection === 'ledger') {
      studPositionsMm(lengthMm, 600).forEach((p, i) => fixings.push(
        <circle key={`bolt-${end}-${i}`} cx={x0 + p * k} cy={end === 'high' ? y - EDGE_BAR / 2 : y + EDGE_BAR / 2} r={1.7} fill="#93c5fd" />))
      positions.forEach((p, i) => fixings.push(
        <rect key={`hg-${end}-${i}`} x={x0 + p * k - 2} y={end === 'high' ? y : y - 4} width={4} height={4} fill="#0f766e" />))
    } else {
      studPositionsMm(lengthMm, 2000).forEach((p, i) => fixings.push(
        <line key={`st-${end}-${i}`} x1={x0 + p * k} x2={x0 + p * k} y1={end === 'high' ? y : y - 9} y2={end === 'high' ? y + 9 : y} stroke="#b45309" strokeWidth={2} />))
    }
  }
  for (const side of ['left', 'right'] as const) {
    if (edges[side] !== 'abutment') continue
    const x = side === 'left' ? x0 : x0 + w
    studPositionsMm(widthMm, 2000).forEach((p, i) => fixings.push(
      <line key={`sst-${side}-${i}`} x1={side === 'left' ? x : x - 9} x2={side === 'left' ? x + 9 : x} y1={y0 + p * k} y2={y0 + p * k} stroke="#b45309" strokeWidth={2} />))
  }

  // ── Rainwater outlets and overflow outlets on their parapet edges — each drawn where it's been
  // placed and draggable along its own edge. One that isn't on a parapet edge is drawn faded.
  const gullyMarks: React.ReactNode[] = []
  outlets.forEach((o, i) => {
    const r = rects[o.edge]
    const horiz = o.edge === 'high' || o.edge === 'low'
    const t = Math.max(0, Math.min(1, o.positionMm / (horiz ? lengthMm : widthMm)))
    const colour = o.kind === 'gully' ? '#2563eb' : '#d97706'
    const cx = horiz ? r.x + r.w * t : r.x + r.w / 2
    const cy = horiz ? r.y + r.h / 2 : r.y + r.h * t
    const out = o.edge === 'low' ? [0, 1] : o.edge === 'high' ? [0, -1] : o.edge === 'right' ? [1, 0] : [-1, 0]
    const dragging = drag?.type === 'outlet' && drag.id === o.id
    gullyMarks.push(
      <g key={`out-${o.id}`} cursor="grab" onPointerDown={e => onDownOutlet(e, o)} opacity={edges[o.edge] === 'parapet' ? 1 : 0.45}>
        <line x1={cx} y1={cy} x2={cx + out[0] * 20} y2={cy + out[1] * 20} stroke={colour} strokeWidth={1.6} markerEnd="url(#roofArrow)" pointerEvents="none" />
        <rect x={cx - 7} y={cy - 5} width={14} height={10} fill={colour} stroke={dragging ? '#0369a1' : 'none'} strokeWidth={2} />
        <text x={cx} y={cy + 3} fontSize={7} textAnchor="middle" fill="#fff" pointerEvents="none">{i + 1}</text>
      </g>,
    )
  })

  // ── Trimmers. They go tight to the opening's own sides, whatever the joist centres: `members` joists side by
  // side (each 47mm, drawn to scale) over the full span, with the headers between them against the opening's
  // near and far edges — two members doubled, three tripled.
  const trimmerLines: React.ReactNode[] = []
  const T = JOIST_THICKNESS_MM
  const member = (key: string, x: number, y: number, wd: number, ht: number) =>
    <rect key={key} x={x} y={y} width={Math.max(0.8, wd)} height={Math.max(0.8, ht)} fill={TRIMMER_COLOUR} stroke="#fff" strokeWidth={0.4} />
  for (const o of openings) {
    const n = o.trimmers ?? 2
    const right = o.offsetMm + o.widthMm, bottom = o.offsetSpanMm + o.depthMm
    for (let i = 0; i < n; i++) {
      trimmerLines.push(
        member(`${o.id}-tl-${i}`, x0 + (o.offsetMm - (i + 1) * T) * k, y0, T * k, h),
        member(`${o.id}-tr-${i}`, x0 + (right + i * T) * k, y0, T * k, h),
        member(`${o.id}-ht-${i}`, x0 + o.offsetMm * k, y0 + (o.offsetSpanMm - (i + 1) * T) * k, o.widthMm * k, T * k),
        member(`${o.id}-hb-${i}`, x0 + o.offsetMm * k, y0 + (bottom + i * T) * k, o.widthMm * k, T * k),
      )
    }
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}
      style={{ width: '100%', height: 340, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, touchAction: 'none' }}>
      <defs>
        <marker id="roofArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="context-stroke" /></marker>
      </defs>
      <rect x={x0} y={y0} width={w} height={h} fill="#fafaf9" stroke="#78716c" strokeWidth={1.2} />
      {joistLines}
      {bars}
      {labels}
      {fixings}
      {gullyMarks}

      {/* Fall */}
      <line x1={x0 + w - 10} x2={x0 + w - 10} y1={y0 + 14} y2={y0 + h - 16} stroke="#2563eb" strokeWidth={1.2} />
      <polygon points={`${x0 + w - 10},${y0 + h - 6} ${x0 + w - 15},${y0 + h - 17} ${x0 + w - 5},${y0 + h - 17}`} fill="#2563eb" />
      <text x={x0 + w - 10} y={y0 + 10} fontSize={9} fill="#2563eb" textAnchor="middle">1:{fallRatio}</text>

      {trimmerLines}

      {/* Openings, drawn over their trimmers */}
      {openings.map((o, i) => {
        const st = KIND_STYLE[o.kind]
        const rx = x0 + o.offsetMm * k, ry = y0 + o.offsetSpanMm * k
        const rw = o.widthMm * k, rh = o.depthMm * k
        const dragging = drag?.type === 'opening' && drag.id === o.id
        return (
          <g key={o.id}>
            {o.kind === 'dome'
              ? <ellipse cx={rx + rw / 2} cy={ry + rh / 2} rx={rw / 2} ry={rh / 2} fill={st.fill} stroke={dragging ? '#0369a1' : st.stroke} strokeWidth={dragging ? 2.5 : 1.5} cursor="grab" onPointerDown={e => onDown(e, o)} />
              : <rect x={rx} y={ry} width={rw} height={rh} fill={st.fill} stroke={dragging ? '#0369a1' : st.stroke} strokeWidth={dragging ? 2.5 : 1.5} cursor="grab" onPointerDown={e => onDown(e, o)} />}
            {o.kind === 'lantern' && <>
              <line x1={rx} y1={ry} x2={rx + rw} y2={ry + rh} stroke={st.stroke} strokeWidth={0.8} pointerEvents="none" />
              <line x1={rx + rw} y1={ry} x2={rx} y2={ry + rh} stroke={st.stroke} strokeWidth={0.8} pointerEvents="none" />
            </>}
            {o.kind === 'hatch' && <line x1={rx} y1={ry} x2={rx + rw} y2={ry + rh} stroke={st.stroke} strokeWidth={0.8} pointerEvents="none" />}
            <text x={rx + rw / 2} y={ry + rh / 2 + 3} fontSize={9} textAnchor="middle" fill={st.stroke} pointerEvents="none">{i + 1} {KIND_SHORT[o.kind]}</text>
            <text x={rx + rw / 2} y={ry + rh + 18} fontSize={8} textAnchor="middle" fill="#78716c" stroke="#fff" strokeWidth={3} paintOrder="stroke" pointerEvents="none">
              {o.widthMm}×{o.depthMm} · {(o.trimmers ?? 2) === 3 ? 'tripled' : 'doubled'}
            </text>
          </g>
        )
      })}

      {/* Overall dimensions and key */}
      <text x={x0 + w / 2} y={y0 + h + EDGE_BAR + 50} fontSize={9} fill="#64748b" textAnchor="middle">{(lengthMm / 1000).toFixed(2)}m × {(widthMm / 1000).toFixed(2)}m span · {g.joistCount} joists at {centresMm}mm</text>
      <g transform={`translate(${x0}, ${vbH - 8})`}>
        <line x1={0} x2={16} y1={-3} y2={-3} stroke={TRIMMER_COLOUR} strokeWidth={1.5} /><line x1={0} x2={16} y1={0} y2={0} stroke={TRIMMER_COLOUR} strokeWidth={1.5} />
        <text x={21} y={0} fontSize={8} fill="#64748b">Trimmer joists</text>
        <circle cx={92} cy={-2} r={1.9} fill="#93c5fd" /><text x={98} y={0} fontSize={8} fill="#64748b">Ledger bolt</text>
        <rect x={148} y={-5} width={4} height={4} fill="#0f766e" /><text x={156} y={0} fontSize={8} fill="#64748b">Hanger</text>
        <line x1={190} x2={190} y1={-6} y2={1} stroke="#b45309" strokeWidth={2} /><text x={195} y={0} fontSize={8} fill="#64748b">Strap</text>
        <rect x={224} y={-6} width={8} height={6} fill="#2563eb" /><text x={236} y={0} fontSize={8} fill="#64748b">Rainwater</text>
        <rect x={284} y={-6} width={8} height={6} fill="#d97706" /><text x={296} y={0} fontSize={8} fill="#64748b">Overflow</text>
      </g>
    </svg>
  )
}
