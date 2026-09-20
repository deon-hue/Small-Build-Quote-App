'use client'

/**
 * Assembly Calculator — Flat Roof, from the joists to the covering, with rooflights.
 *
 * Joists span the roof's width and are spaced along its length; the roof falls along them, on firrings,
 * to the low edge where the gutter is. Warm roof (PIR above the deck) or cold roof (insulation between
 * the joists, with a ventilated gap), covered in EPDM, GRP or single-ply, with an abutment against the
 * house wall (upstand and flashing), free edges (trim, fascia) and a gutter.
 *
 * Lanterns, roof windows, domes and access hatches are openings in the plan. Each takes its area out of
 * the deck, insulation and membrane, cuts the joists it crosses short, needs its headers and side
 * trimmers doubled or tripled up, and sits on a kerb the membrane is dressed up. Drag one on the plan to
 * position it.
 *
 * The joist can be solid timber (C24 or C16) or a Posi-joist. A rough guide to the joist depth for the
 * span is shown, but it's only a starting point for pricing — the joist size, trimmers and kerbs stay
 * with the designer/engineer. See calculateFlatRoofGeometry in lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect, useRef } from 'react'
import {
  calculateFlatRoofGeometry, calculateFlatRoofCost, studPositionsMm,
  type FlatRoofInput, type FlatRoofGeometry, type FlatRoofOpening, type FlatRoofBuildUp, type RoofOpeningKind,
  type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, miniInput, PropRow, BreakdownTable,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'

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

// A ROUGH guide to the longest span (mm) each solid timber section manages in a flat roof at 400
// centres. It's only there to help pick a starting size for pricing — it is not a design, and the
// real answer comes from the span tables or an engineer. Wider centres take a little off.
const INDICATIVE_MAX_SPAN_400: Record<'c16' | 'c24', Record<number, number>> = {
  c16: { 100: 1600, 125: 2100, 150: 2600, 175: 3000, 200: 3500, 225: 3900, 250: 4300 },
  c24: { 100: 1700, 125: 2250, 150: 2800, 175: 3300, 200: 3800, 225: 4200, 250: 4600 },
}
function indicativeMaxSpan(system: 'c16' | 'c24', depth: number, centres: number): number | undefined {
  const base = INDICATIVE_MAX_SPAN_400[system][depth]
  return base == null ? undefined : Math.round(base * (centres >= 600 ? 0.85 : 1))
}
function suggestedDepth(system: JoistSystem, span: number, centres: number): number | null {
  if (system === 'posi') return null
  return TIMBER_DEPTHS.find(d => (indicativeMaxSpan(system, d, centres) ?? 0) >= span) ?? null
}
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
  grp:  'GRP fibreglass',
  tpo:  'Single-ply (TPO)',
}
const SHEET_M2 = 2.88
const PIR_PER_M2_PER_MM = 0.24
const WOOL_PER_M2_PER_MM = 0.11

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
// Supply price: per m² of the rooflight for the glazed kinds, per unit for a hatch.
const OPENING_RATE = { lantern: 1450.00, roofWindow: 900.00, dome: 550.00, hatch: 480.00 }

interface LayerOpts {
  wastePct: number
  buildUp: FlatRoofBuildUp
  joistSystem: JoistSystem
  joistDepth: number
  insulationMm: number
  deck: DeckType
  covering: CoveringType
  ledger: boolean
  fascia: boolean
  downpipes: number
  g: FlatRoofGeometry
}

function buildFlatRoofLayers(o: LayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const g = o.g
  const jr = joistRate(o.joistSystem, o.joistDepth)
  const jl = joistLabel(o.joistSystem, o.joistDepth, true)
  const layers: AssemblyLayerDef[] = []

  // Structure
  layers.push({ id: 'joists', name: jl, category: 'materials', source: 'joistLm', unit: 'lm', unitCost: jr, wastePct: 5 })
  if (g.trimLm > 0) {
    layers.push({ id: 'trimmers', name: `${jl} — trimmers and headers round the rooflights`, category: 'materials', source: 'trimLm', unit: 'lm', unitCost: jr, wastePct: 5 })
  }
  layers.push({ id: 'wall_plate', name: 'Wall plate 100×50 treated', category: 'materials', source: 'wallPlateLm', unit: 'lm', unitCost: 2.80, wastePct: 5 })
  if (o.ledger) layers.push({ id: 'ledger', name: `Ledger (bolted to the house wall) and fixings`, category: 'materials', source: 'ledgerLm', unit: 'lm', unitCost: 6.50, wastePct: 5 })
  if (g.hangerCount > 0) layers.push({ id: 'hangers', name: 'Joist hangers', category: 'materials', source: 'hangerCount', unit: 'nr', unitCost: 1.85, roundToWhole: true })
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

  // Covering
  if (o.covering === 'epdm') {
    layers.push(
      { id: 'covering', name: 'EPDM membrane 1.2mm (incl. upstands and kerbs)', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 10.50, wastePct: w },
      { id: 'covering_adhesive', name: 'EPDM bonding adhesive', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 3.20, wastePct: w },
      { id: 'covering_seams', name: 'Seam tape and corner patches', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 0.70 },
    )
  } else if (o.covering === 'grp') {
    layers.push(
      { id: 'covering_csm', name: 'GRP chopped strand mat 450g', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 2.60, wastePct: w },
      { id: 'covering_resin', name: 'GRP laminating resin and catalyst', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 8.50, wastePct: w },
      { id: 'covering_topcoat', name: 'GRP topcoat', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 5.40, wastePct: w },
    )
  } else {
    layers.push(
      { id: 'covering', name: 'Single-ply TPO membrane (incl. upstands and kerbs)', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 12.50, wastePct: w },
      { id: 'covering_adhesive', name: 'Membrane bonding adhesive', category: 'materials', source: 'membraneAreaM2', unit: 'm²', unitCost: 2.80, wastePct: w },
    )
  }

  // Edges
  layers.push(o.covering === 'grp'
    ? { id: 'edge_trim', name: 'GRP edge trim (free edges)', category: 'materials', source: 'edgeTrimLm', unit: 'lm', unitCost: 5.20, wastePct: w }
    : { id: 'edge_trim', name: 'Aluminium drip trim (free edges)', category: 'materials', source: 'edgeTrimLm', unit: 'lm', unitCost: 6.50, wastePct: w })
  if (g.abutmentLm > 0) layers.push({ id: 'flashing', name: 'Lead flashing to the house wall (Code 4)', category: 'materials', source: 'abutmentLm', unit: 'lm', unitCost: 32.00, wastePct: 5 })
  if (o.fascia) layers.push({ id: 'fascia', name: 'uPVC fascia board 175mm (free edges)', category: 'materials', source: 'edgeTrimLm', unit: 'lm', unitCost: 10.00, wastePct: w })

  // Rooflights
  if (g.kerbLm > 0) {
    layers.push(
      { id: 'kerb_timber', name: 'Kerb timber 47×150 (rooflight kerbs)', category: 'materials', source: 'kerbLm', unit: 'lm', unitCost: 3.60, wastePct: w },
      { id: 'kerb_cladding', name: 'Kerb cladding 18mm ply', category: 'materials', source: 'kerbFaceAreaM2', unit: 'm²', unitCost: 7.50, wastePct: w },
    )
  }
  if (g.lanternAreaM2 > 0)    layers.push({ id: 'lanterns', name: 'Roof lantern (supply)', category: 'materials', source: 'lanternAreaM2', unit: 'm²', unitCost: OPENING_RATE.lantern })
  if (g.roofWindowAreaM2 > 0) layers.push({ id: 'roof_windows', name: 'Roof window (supply)', category: 'materials', source: 'roofWindowAreaM2', unit: 'm²', unitCost: OPENING_RATE.roofWindow })
  if (g.domeAreaM2 > 0)       layers.push({ id: 'domes', name: 'Dome rooflight (supply)', category: 'materials', source: 'domeAreaM2', unit: 'm²', unitCost: OPENING_RATE.dome })
  if (g.hatchCount > 0)       layers.push({ id: 'hatches', name: 'Roof access hatch (supply)', category: 'materials', source: 'hatchCount', unit: 'nr', unitCost: OPENING_RATE.hatch, roundToWhole: true })

  // Drainage
  if (g.gutterLm > 0) {
    layers.push({ id: 'gutter', name: 'uPVC gutter 112mm half-round', category: 'materials', source: 'gutterLm', unit: 'lm', unitCost: 8.00, wastePct: w })
    if (o.downpipes > 0) layers.push({ id: 'downpipes', name: 'uPVC downpipe run and fittings', category: 'materials', source: 'fixed', fixedQty: o.downpipes, unit: 'nr', unitCost: 55.00 })
  }
  layers.push({ id: 'sundries', name: 'Fixings, tapes, sealant and sundries', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 1.10 })
  return layers
}

// A new rooflight goes in the first free spot: scanning along the roof from the left, then down from
// the high edge, for a gap that clears every rooflight already there by 300mm (room for the trimmers
// and kerbs). If the roof is too full it just goes at the default spot — the overlap warning says so.
function newOpening(kind: RoofOpeningKind, existing: FlatRoofOpening[], lengthMm: number, widthMm: number): FlatRoofOpening {
  const d = KIND_DEFAULTS[kind]
  const gap = 300
  const maxX = Math.max(0, lengthMm - d.widthMm)
  const maxY = Math.max(0, widthMm - d.depthMm)
  const clashes = (x: number, y: number) => existing.some(o =>
    x < o.offsetMm + o.widthMm + gap && o.offsetMm < x + d.widthMm + gap &&
    y < o.offsetSpanMm + o.depthMm + gap && o.offsetSpanMm < y + d.depthMm + gap)
  let spot = { x: Math.min(maxX, 300), y: Math.min(maxY, 800) }
  search: for (let y = Math.min(maxY, 800); y <= maxY; y += 200) {
    for (let x = Math.min(maxX, 300); x <= maxX; x += 100) {
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
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
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
  const [centresMm, setCentresMm] = useState(400)
  const [fallRatio, setFallRatio] = useState(80)
  // Warm roof: a PIR board on the deck. Cold roof: insulation between the joists, leaving a 50mm gap.
  const [insulationMm, setInsulationMm] = useState(buildUpDefault === 'cold' ? 125 : 120)
  const [deck, setDeck] = useState<DeckType>('ply')
  const [covering, setCovering] = useState<CoveringType>('epdm')
  const [ledger, setLedger] = useState(false)
  const [fascia, setFascia] = useState(false)
  const [downpipes, setDownpipes] = useState(1)
  const [wastePct, setWastePct] = useState(10)
  const [location, setLocation] = useState('')

  // The abutment (against the house wall) and the gutter edge both start as the roof's full length,
  // and follow it until either is typed over.
  const [abutmentMm, setAbutmentMm] = useState(externalLengthMm ?? 5000)
  const [gutterMm, setGutterMm] = useState(externalLengthMm ?? 5000)
  const abutmentTouched = useRef(false)
  const gutterTouched = useRef(false)
  useEffect(() => { if (!abutmentTouched.current) setAbutmentMm(lengthMm) }, [lengthMm])
  useEffect(() => { if (!gutterTouched.current) setGutterMm(lengthMm) }, [lengthMm])

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
      setJoistDepth(next === 'posi' ? 250 : (suggestedDepth(next, widthMm, centresMm) ?? 175))
    }
  }
  function changeBuildUp(next: FlatRoofBuildUp) {
    setBuildUp(next)
    // Warm roof: a PIR board on the deck. Cold roof: insulation between the joists, leaving a 50mm gap.
    setInsulationMm(next === 'warm' ? 120 : Math.max(50, joistDepth - 50))
  }

  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Form deck, insulate and lay the covering', hours: 24 },
  ])
  function addLabourLine() {
    setLabourLines(prev => [...prev, { id: newLabourLineId(), tradeId: prev[0]?.tradeId ?? '', task: '', hours: 0 }])
  }
  function updateLabourLine(id: string, patch: Partial<LabourLine>) {
    setLabourLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }
  function removeLabourLine(id: string) {
    setLabourLines(prev => prev.filter(l => l.id !== id))
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

  const input: FlatRoofInput = {
    lengthMm, widthMm, joistCentresMm: centresMm, buildUp, fallRatio,
    abutmentLengthMm: abutmentMm, gutterLengthMm: gutterMm, ledger, openings,
  }
  const openingsKey = JSON.stringify(openings)

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateFlatRoofGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, widthMm, centresMm, buildUp, fallRatio, abutmentMm, gutterMm, ledger, openingsKey])

  const g = geometryResult.ok ? geometryResult.geometry : null

  // A rough check of the chosen solid timber against the span — advice, not a design.
  const suggested = suggestedDepth(joistSystem, widthMm, centresMm)
  const chosenMax = joistSystem === 'posi' ? undefined : indicativeMaxSpan(joistSystem, joistDepth, centresMm)
  const underSized = joistSystem !== 'posi' && chosenMax != null && chosenMax < widthMm
  const extraWarnings: string[] = []
  if (joistSystem === 'posi') {
    extraWarnings.push('Posi-joists are designed by the supplier to your span and loads, and so is the trimming round the rooflights — the trimmers here are an estimate to confirm with them.')
  } else if (underSized) {
    extraWarnings.push(suggested
      ? `${joistLabel(joistSystem, joistDepth)} is under the rough guide for a ${(widthMm / 1000).toFixed(2)}m span at ${centresMm}mm centres (about 47×${suggested}) — check the span tables or an engineer.`
      : `A ${(widthMm / 1000).toFixed(2)}m span is beyond what solid timber usually manages in a flat roof — consider Posi-joists or an engineer's design.`)
  }

  function buildAutoDescription(): string {
    const cover = covering === 'epdm' ? 'EPDM' : covering === 'grp' ? 'GRP fibreglass' : 'single-ply TPO'
    const insulation = buildUp === 'warm' ? `${insulationMm}mm PIR above the deck` : `${insulationMm}mm mineral wool between the joists`
    let text = `${(lengthMm / 1000).toFixed(2)} × ${(widthMm / 1000).toFixed(2)}m ${buildUp} flat roof, ${joistLabel(joistSystem, joistDepth, true)} at ${centresMm}mm centres spanning ${(widthMm / 1000).toFixed(2)}m, ${DECK[deck].label} deck, ${insulation}, ${cover} covering, fall 1:${fallRatio}.`
    if (openings.length) {
      text += ` Includes ${openings.map(o => `${KIND_LABEL[o.kind].toLowerCase()} ${o.widthMm}×${o.depthMm}mm (${o.trimmers === 3 ? 'tripled' : 'doubled'} trimmers)`).join(', ')}.`
    }
    return text
  }
  const [description, setDescription] = useState(buildAutoDescription)

  const layers = useMemo(() => {
    if (!geometryResult.ok) return []
    const base = buildFlatRoofLayers({
      wastePct, buildUp, joistSystem, joistDepth, insulationMm, deck, covering, ledger, fascia, downpipes, g: geometryResult.geometry,
    })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, buildUp, joistSystem, joistDepth, insulationMm, deck, covering, ledger, fascia, downpipes, rateOverrides])

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
            onClick={() => onSave({ name, qty, location, description, lines: [...enabledMaterialLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>
            💾 Save &amp; Price
          </button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Description (for the quote)</label>
          <button onClick={() => setDescription(buildAutoDescription())}
            title="Regenerate from the current sizing — overwrites any edits below"
            style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ↻ Regenerate
          </button>
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          style={{ width: '100%', fontSize: 12, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
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
              abutmentMm={abutmentMm} gutterMm={gutterMm} openings={openings}
              onMoveOpening={(id, offsetMm, offsetSpanMm) => updateOpening(id, { offsetMm, offsetSpanMm })}
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
              {(lengthMm / 1000).toFixed(2)} × {(widthMm / 1000).toFixed(2)}m roof, {g.netAreaM2.toFixed(2)} m² of covering after {g.openingAreaM2.toFixed(2)} m² of rooflights.
              {' '}{g.joistCount} joists ({g.joistLm.toFixed(1)}m of timber after the rooflights cut some short) plus {g.trimLm.toFixed(1)}m of trimmers.
              {' '}Firrings up to {Math.round(g.fallMm)}mm at the high end. Drag a rooflight on the plan to move it.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Width — joist span (mm)">{numInput(widthMm, setWidthMm, 1)}</PropRow></div>
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8, marginTop: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Build-up</div>
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
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Joists</div>
            <PropRow label="Joist type">
              <select value={joistSystem} onChange={e => changeSystem(e.target.value as JoistSystem)} style={propInput}>
                {(Object.entries(JOIST_SYSTEM_LABEL) as [JoistSystem, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <PropRow label={joistSystem === 'posi' ? 'Depth' : 'Section'}>
                  <select value={joistDepth} onChange={e => setJoistDepth(+e.target.value)} style={propInput}>
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
              <div style={{ fontSize: 11, color: underSized ? '#c0392b' : '#64748b', marginTop: 4, lineHeight: 1.4 }}>
                Rough guide for a {(widthMm / 1000).toFixed(2)}m span at {centresMm}mm centres: {suggested ? `47×${suggested} ${joistSystem.toUpperCase()}` : 'beyond solid timber'}.
                {suggested && suggested !== joistDepth && (
                  <button onClick={() => setJoistDepth(suggested)}
                    style={{ marginLeft: 6, fontSize: 11, background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                    Use it
                  </button>
                )}
                <span style={{ color: '#94a3b8' }}> A pricing guide only — check the span tables or an engineer.</span>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', marginTop: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={ledger} onChange={e => setLedger(e.target.checked)} style={{ width: 'auto' }} />
              High end hangs off a ledger on the house wall
            </label>
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Covering and edges</div>
            <PropRow label="Covering">
              <select value={covering} onChange={e => setCovering(e.target.value as CoveringType)} style={propInput}>
                {(Object.entries(COVERING_LABEL) as [CoveringType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <PropRow label="Abutment (mm)">
                  <input type="number" min={0} value={abutmentMm} onChange={e => { abutmentTouched.current = true; setAbutmentMm(Math.max(0, +e.target.value || 0)) }} style={propInput} />
                </PropRow>
              </div>
              <div style={{ flex: 1 }}>
                <PropRow label="Gutter (mm)">
                  <input type="number" min={0} value={gutterMm} onChange={e => { gutterTouched.current = true; setGutterMm(Math.max(0, +e.target.value || 0)) }} style={propInput} />
                </PropRow>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={fascia} onChange={e => setFascia(e.target.checked)} style={{ width: 'auto' }} />
                Fascia
              </label>
              {gutterMm > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569' }}>
                  Downpipes
                  <input type="number" min={0} value={downpipes} onChange={e => setDownpipes(Math.max(0, +e.target.value || 0))} style={{ ...miniInput, width: 48 }} />
                </label>
              )}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #bae6fd', paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Rooflights</div>
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
                  <button onClick={() => removeOpening(o.id)} aria-label={`Remove rooflight ${i + 1}`}
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

// ── Plan view of the roof — joists at their centres (cut short where a rooflight crosses them), the
// abutment along the high edge and the gutter along the low edge, and each rooflight with its trimmers
// drawn heavier the more they are doubled up. Drag a rooflight to position it (snaps to 50mm). Visual
// only: the numbers in the breakdown come from the geometry, not from this drawing.
// Short names for the labels inside the drawn boxes, which can be small.
const KIND_SHORT: Record<RoofOpeningKind, string> = { 'lantern': 'Lantern', 'roof-window': 'Window', 'dome': 'Dome', 'hatch': 'Hatch' }
const KIND_STYLE: Record<RoofOpeningKind, { fill: string; stroke: string }> = {
  'lantern':     { fill: '#ccfbf1', stroke: '#0f766e' },
  'roof-window': { fill: '#dbeafe', stroke: '#1d4ed8' },
  'dome':        { fill: '#fef3c7', stroke: '#b45309' },
  'hatch':       { fill: '#e5e7eb', stroke: '#4b5563' },
}

function FlatRoofPlanSvg({ g, lengthMm, widthMm, centresMm, fallRatio, abutmentMm, gutterMm, openings, onMoveOpening }: {
  g: FlatRoofGeometry
  lengthMm: number
  widthMm: number
  centresMm: number
  fallRatio: number
  abutmentMm: number
  gutterMm: number
  openings: FlatRoofOpening[]
  onMoveOpening: (id: string, offsetMm: number, offsetSpanMm: number) => void
}) {
  const vbW = 380, vbH = 280
  const k = Math.min(320 / lengthMm, 176 / widthMm)
  const w = lengthMm * k, h = widthMm * k
  const x0 = 20 + (320 - w) / 2, y0 = 40
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)

  function pointerMm(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    return { x: (p.x - x0) / k, y: (p.y - y0) / k }
  }
  function onDown(e: React.PointerEvent, o: FlatRoofOpening) {
    const p = pointerMm(e)
    if (!p) return
    // Capturing keeps the drag going if the pointer slips off the box; not every input device allows it.
    try { (e.target as Element).setPointerCapture(e.pointerId) } catch { /* the drag still works without it */ }
    setDrag({ id: o.id, dx: p.x - o.offsetMm, dy: p.y - o.offsetSpanMm })
  }
  function onMove(e: React.PointerEvent) {
    if (!drag) return
    const o = openings.find(op => op.id === drag.id)
    const p = pointerMm(e)
    if (!o || !p) return
    const snap = (n: number) => Math.round(n / 50) * 50
    onMoveOpening(o.id,
      Math.max(0, Math.min(Math.max(0, lengthMm - o.widthMm), snap(p.x - drag.dx))),
      Math.max(0, Math.min(Math.max(0, widthMm - o.depthMm), snap(p.y - drag.dy))))
  }

  const positions = studPositionsMm(lengthMm, centresMm)
  const joistLines: React.ReactNode[] = []
  for (const p of positions) {
    // Where a rooflight crosses this joist it's cut — draw the joist only in the gaps.
    const cuts = openings
      .filter(o => p > o.offsetMm && p < o.offsetMm + o.widthMm)
      .map(o => [o.offsetSpanMm, o.offsetSpanMm + o.depthMm] as const)
      .sort((a, b) => a[0] - b[0])
    let from = 0
    const segments: [number, number][] = []
    for (const [a, b] of cuts) { if (a > from) segments.push([from, a]); from = Math.max(from, b) }
    if (from < widthMm) segments.push([from, widthMm])
    segments.forEach(([a, b], i) => joistLines.push(
      <line key={`${p}-${i}`} x1={x0 + p * k} x2={x0 + p * k} y1={y0 + a * k} y2={y0 + b * k} stroke="#b4b2a9" strokeWidth={1} />,
    ))
  }

  const abut = Math.min(abutmentMm, lengthMm) * k
  const gut = Math.min(gutterMm, lengthMm) * k
  return (
    <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}
      style={{ width: '100%', height: 290, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, touchAction: 'none' }}>
      <rect x={x0} y={y0} width={w} height={h} fill="#fafaf9" stroke="#78716c" strokeWidth={1.5} />
      {joistLines}

      {/* Abutment — the high edge, against the house wall */}
      {abut > 0 && <rect x={x0} y={y0 - 8} width={abut} height={8} fill="#57534e" />}
      <text x={x0} y={y0 - 14} fontSize={9} fill="#57534e">
        {abut > 0 ? `House wall — abutment ${(Math.min(abutmentMm, lengthMm) / 1000).toFixed(2)}m (upstand and flashing)` : 'High edge'}
      </text>
      {/* Gutter — the low edge */}
      {gut > 0 && <line x1={x0} x2={x0 + gut} y1={y0 + h + 4} y2={y0 + h + 4} stroke="#2563eb" strokeWidth={3} />}
      <text x={x0} y={y0 + h + 18} fontSize={9} fill="#2563eb">
        {gut > 0 ? `Low edge — gutter ${(Math.min(gutterMm, lengthMm) / 1000).toFixed(2)}m` : 'Low edge'}
      </text>
      {/* Fall */}
      <line x1={x0 + w + 14} x2={x0 + w + 14} y1={y0 + 8} y2={y0 + h - 12} stroke="#2563eb" strokeWidth={1.2} />
      <polygon points={`${x0 + w + 14},${y0 + h - 4} ${x0 + w + 9},${y0 + h - 14} ${x0 + w + 19},${y0 + h - 14}`} fill="#2563eb" />
      <text x={x0 + w + 14} y={y0 - 2} fontSize={9} fill="#2563eb" textAnchor="middle">1:{fallRatio}</text>

      {/* Rooflights — trimmers drawn heavier the more they're doubled up */}
      {openings.map((o, i) => {
        const st = KIND_STYLE[o.kind]
        const rx = x0 + o.offsetMm * k, ry = y0 + o.offsetSpanMm * k
        const rw = o.widthMm * k, rh = o.depthMm * k
        const dragging = drag?.id === o.id
        const trimW = (o.trimmers ?? 2) === 3 ? 4 : 2
        return (
          <g key={o.id}>
            <rect x={rx - trimW / 2} y={ry - trimW / 2} width={rw + trimW} height={rh + trimW} fill="none" stroke="#44403c" strokeWidth={trimW} />
            {o.kind === 'dome'
              ? <ellipse cx={rx + rw / 2} cy={ry + rh / 2} rx={rw / 2} ry={rh / 2} fill={st.fill} stroke={dragging ? '#0369a1' : st.stroke} strokeWidth={dragging ? 2.5 : 1.5} cursor="grab" onPointerDown={e => onDown(e, o)} />
              : <rect x={rx} y={ry} width={rw} height={rh} fill={st.fill} stroke={dragging ? '#0369a1' : st.stroke} strokeWidth={dragging ? 2.5 : 1.5} cursor="grab" onPointerDown={e => onDown(e, o)} />}
            {o.kind === 'lantern' && <>
              <line x1={rx} y1={ry} x2={rx + rw} y2={ry + rh} stroke={st.stroke} strokeWidth={0.8} pointerEvents="none" />
              <line x1={rx + rw} y1={ry} x2={rx} y2={ry + rh} stroke={st.stroke} strokeWidth={0.8} pointerEvents="none" />
            </>}
            {o.kind === 'hatch' && <line x1={rx} y1={ry} x2={rx + rw} y2={ry + rh} stroke={st.stroke} strokeWidth={0.8} pointerEvents="none" />}
            <text x={rx + rw / 2} y={ry + rh / 2 + 3} fontSize={9} textAnchor="middle" fill={st.stroke} pointerEvents="none">{i + 1} {KIND_SHORT[o.kind]}</text>
            <text x={rx + rw / 2} y={ry + rh + 11} fontSize={8} textAnchor="middle" fill="#78716c" pointerEvents="none">
              {o.widthMm}×{o.depthMm} · {(o.trimmers ?? 2) === 3 ? 'tripled' : 'doubled'}
            </text>
          </g>
        )
      })}

      {/* Overall dimensions */}
      <text x={x0 + w / 2} y={vbH - 6} fontSize={9} fill="#64748b" textAnchor="middle">{(lengthMm / 1000).toFixed(2)}m</text>
      <text x={x0 - 8} y={y0 + h / 2} fontSize={9} fill="#64748b" textAnchor="middle" transform={`rotate(-90 ${x0 - 8} ${y0 + h / 2})`}>{(widthMm / 1000).toFixed(2)}m span</text>
      <text x={x0 + w - 2} y={y0 + h - 4} fontSize={8} fill="#94a3b8" textAnchor="end">{g.joistCount} joists at {centresMm}mm</text>
    </svg>
  )
}
