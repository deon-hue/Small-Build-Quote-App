'use client'

/**
 * Assembly Calculator — Strip foundation (traditional) or trench fill, drawn as a line (Foundations → Strip Foundation / Trench Fill Foundation).
 * One screen serves both sub-phases: `variant` only changes the starting name, which concrete figure you give (the thickness in the bottom of a
 * strip, or how far below ground a trench fill stops) and the wording. They share lib/strip-foundation.ts.
 *
 * The trench along the wall (length from the line, width and depth chosen here), the concrete in the bottom of it (thickness and mix), the blockwork
 * built up from the concrete to the DPC just above ground (solid 215mm blocks laid flat, or two 100mm leaves with the cavity filled with concrete),
 * the DPC, the backfill, and the soil that has to leave site (the surplus the concrete and wall displace, or all of it). The digging is a machine
 * with its operator, priced in days, and the muck-away by the cubic metre. Counts and volumes only — the trench size, concrete strength and any
 * reinforcement or trench support are the designer's to confirm. The engine is lib/strip-foundation.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import ConcretePlacingSection from '@/components/ConcretePlacingSection'
import { planConcretePlacing, placingLayers, placingLabour, type PlacingMethod, type PlacingPlan } from '@/lib/concrete-placing'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculateStripFoundationGeometry, BRICK_COURSE_MM, BLOCK_COURSE_MM, type StripWallBuild, type StripFoundationInput, type StripFoundationGeometry } from '@/lib/strip-foundation'
import { describeStripFoundation, describeStripFoundationShort } from '@/lib/strip-foundation-description'
import { suggestStripFoundationLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import { costFromBasics, type PricedFromBasics } from '@/components/assembly-basics-pricing'
import type { AssemblyBasics } from '@/lib/assembly-basics'
import { CEMENT_M2_PER_BAG, SAND_M2_PER_TONNE } from '@/components/AssemblyMasonryWallDemo'

// Mortar as a volume — the same calibration as the dwarf, sleeper, parapet and flat roof calculators.
const CEMENT_M3_PER_BAG = +(CEMENT_M2_PER_BAG * 0.013).toFixed(4)
const SAND_M3_PER_TONNE = +(SAND_M2_PER_TONNE * 0.013).toFixed(3)

// Sample rates, like every calculator here — editable per line in the breakdown until Back Office products and plant replace them.
const CONCRETE_MIXES = { C20: { label: 'C20 (light, mass concrete)', cost: 98 }, C25: { label: 'C25 (usual strip / trench fill)', cost: 105 }, C30: { label: 'C30 (stronger)', cost: 112 } } as const
type Mix = keyof typeof CONCRETE_MIXES
const WALL_LABEL: Record<StripWallBuild, string> = {
  'solid-flat': 'Solid 215mm blocks laid flat',
  'cavity-filled': 'Two 100mm block leaves, cavity filled with concrete',
  'single-skin': 'Single skin of block (100, 140 or 215mm on edge)',
}
const MUCKAWAY_PER_M3 = 28      // grab lorry and tip, per m³ of bulked soil
const WACKER_PER_DAY = 40

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** The length of the foundation line drawn in Take-off, in mm. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
  /** 'strip' (default): a set thickness of concrete in the bottom. 'trench-fill': the trench filled with concrete up to a set distance below ground. */
  variant?: 'strip' | 'trench-fill'
  /** Sizes the AI quote heard (length, and the trench width and depth if stated): the calculator opens with them, so it matches what the AI priced. */
  initial?: AssemblyBasics
}

function buildStripFoundationLayers(g: StripFoundationGeometry, o: { wall: StripWallBuild; mix: Mix; wastePct: number; placing?: PlacingPlan; diggerDays?: number | null }): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }

  // the digger: the days it is on site, its fuel, and delivery and collection
  L.push(...diggerLayers(planDigger(g.excavatorDays, o.diggerDays ?? null), 'digging the trench', 'Mini excavator with operator'))
  if (g.spoilAwayM3 > 0) L.push(fixed({ id: 'spoil', name: 'Spoil carted away (grab lorry and tip, soil bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: g.spoilAwayM3 }))
  L.push(fixed({ id: 'concrete', name: `Ready-mixed concrete ${o.mix} (in the trench)`, category: 'materials', unit: 'm³', unitCost: CONCRETE_MIXES[o.mix].cost, qty: g.concreteVolumeM3, wastePct: w }))

  if (o.wall === 'solid-flat') {
    L.push(fixed({ id: 'blocks', name: 'Dense concrete blocks 215mm laid flat (foundation blockwork)', category: 'materials', unit: 'nr', unitCost: 1.55, roundToWhole: true, wastePct: w, qty: g.blockCount }))
  } else if (o.wall === 'single-skin') {
    // one leaf of block on edge: the sample price follows the thickness of the block
    const t = g.wallThicknessMm
    L.push(fixed({ id: 'blocks', name: `Dense concrete blocks ${t}mm on edge (single skin, foundation blockwork)`, category: 'materials', unit: 'nr', unitCost: t <= 100 ? 1.35 : t <= 140 ? 1.90 : 2.90, roundToWhole: true, wastePct: w, qty: g.blockCount }))
  } else {
    if (g.courses && g.brickCount > 0) L.push(fixed({ id: 'bricks', name: `Facing bricks, ${g.courses.brickCourses} splash course${g.courses.brickCourses === 1 ? '' : 's'} on the outer leaf`, category: 'materials', unit: 'nr', unitCost: 0.65, roundToWhole: true, wastePct: w, qty: g.brickCount }))
    L.push(fixed({ id: 'blocks', name: g.courses ? 'Dense concrete blocks 100mm (outer leaf below the brick, and the inner leaf)' : 'Dense concrete blocks 100mm, two leaves (foundation blockwork)', category: 'materials', unit: 'nr', unitCost: 1.35, roundToWhole: true, wastePct: w, qty: g.blockCount }))
    L.push(fixed({ id: 'ties', name: 'Stainless steel wall ties (foundation cavity)', category: 'materials', unit: 'nr', unitCost: 0.28, roundToWhole: true, wastePct: 5, qty: g.tieCount }))
    L.push(fixed({ id: 'cavity_fill', name: `Concrete ${o.mix} filling the cavity`, category: 'materials', unit: 'm³', unitCost: CONCRETE_MIXES[o.mix].cost, wastePct: w, qty: g.cavityFillM3 }))
  }
  L.push(fixed({ id: 'cement', name: 'Cement (blockwork mortar)', category: 'materials', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M3_PER_BAG, roundToWhole: true, wastePct: w, qty: g.mortarM3 }))
  L.push(fixed({ id: 'sand', name: 'Building sand (blockwork mortar)', category: 'materials', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M3_PER_TONNE, wastePct: w, qty: g.mortarM3 }))
  L.push(fixed({ id: 'dpc', name: `DPC, ${g.wallThicknessMm}mm wide (on the top course)`, category: 'materials', unit: 'lm', unitCost: 2.40, wastePct: w, qty: g.dpcLm }))
  if (g.backfillM3 > 0) {
    const days = Math.max(0.5, Math.round((g.backfillM3 / 15) * 2) / 2)
    L.push(fixed({ id: 'wacker', name: 'Compaction plate hire — compacting the backfill', category: 'plant', unit: 'day', unitCost: WACKER_PER_DAY, qty: days }))
  }
  // the lorry cannot reach the trench: a pump, or barrows (nothing when it can)
  if (o.placing) L.push(...placingLayers(o.placing))
  return L
}

/**
 * Prices a strip foundation or trench fill from just its length (and the trench width and depth if they are known), with the calculator's own
 * standard settings (the ones its screen opens with: 600mm wide, 1.0m deep, 225mm of C25, a cavity wall of two 100mm leaves filled with concrete with 3 brick splash courses, to 150mm above ground, 10% waste,
 * 20% profit). Used when the AI quote hears a length, so the foundation arrives priced the way "Save & Price" would price it. Returns null when
 * the sizes don't make a valid foundation.
 */
export function priceStripFoundationFromBasics(o: { variant: 'strip' | 'trench-fill'; basics: AssemblyBasics; labourTrades: BOLabourTrade[] }): PricedFromBasics | null {
  const isFill = o.variant === 'trench-fill'
  const widthMm = o.basics.widthMm ?? 600, depthMm = o.basics.depthMm ?? 1000, fillBelowMm = 150, dpcAbove = 150
  const concreteMm = isFill ? Math.max(1, depthMm - fillBelowMm) : 225
  const wall: StripWallBuild = 'cavity-filled', mix: Mix = 'C25', wastePct = 10
  const coursing = { brickCourses: 3 }
  if (!o.basics.lengthMm) return null
  let g: StripFoundationGeometry
  try { g = calculateStripFoundationGeometry({ lengthMm: o.basics.lengthMm, widthMm, depthMm, concreteThicknessMm: concreteMm, dpcAboveGroundMm: dpcAbove, wall, coursing, takeAllSpoilAway: false }) } catch { return null }
  const suggestions = suggestStripFoundationLabour({ lm: g.lengthM, concreteM3: g.concreteVolumeM3, backfillM3: g.backfillM3, masonryAreaM2: g.masonryAreaM2, wall, cavityFillM3: g.cavityFillM3 })
  const lines = costFromBasics({ layers: buildStripFoundationLayers(g, { wall, mix, wastePct }), suggestions, labourTrades: o.labourTrades })
  const d = { lengthM: g.lengthM, widthMm, depthMm, concreteThicknessMm: g.concreteThicknessMm, dpcAboveGroundMm: g.dpcAboveGroundMm, wall, concreteMix: mix, takeAllSpoilAway: false, variant: o.variant, ...(g.courses ? { courses: { brickCourses: g.courses.brickCourses, blockCourses: g.courses.blockCourses } } : {}) }
  return { name: isFill ? 'Trench fill foundation' : 'Strip foundation (traditional)', qty: 1, location: '', description: describeStripFoundationShort(d), detail: describeStripFoundation(d), lines }
}

export default function AssemblyStripFoundationDemo({ onClose, onSave, labourTrades = [], externalLengthMm, variant = 'strip', initial }: Props) {
  const isFill = variant === 'trench-fill'
  const [name, setName] = useCalcState('AssemblyStripFoundationDemo', 'name', isFill ? 'Trench fill foundation' : 'Strip foundation (traditional)')
  const [location, setLocation] = useCalcState('AssemblyStripFoundationDemo', 'location', '')
  const [qty, setQty] = useCalcState('AssemblyStripFoundationDemo', 'qty', 1)
  const [lengthMm, setLengthMm] = useCalcState('AssemblyStripFoundationDemo', 'lengthMm', externalLengthMm ?? initial?.lengthMm ?? 10000)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  const [widthMm, setWidthMm] = useCalcState('AssemblyStripFoundationDemo', 'widthMm', initial?.widthMm ?? 600)
  const [depthMm, setDepthMm] = useCalcState('AssemblyStripFoundationDemo', 'depthMm', initial?.depthMm ?? 1000)
  const [stripConcreteMm, setConcreteMm] = useCalcState('AssemblyStripFoundationDemo', 'stripConcreteMm', 225)
  const [fillBelowMm, setFillBelowMm] = useCalcState('AssemblyStripFoundationDemo', 'fillBelowMm', 150)   // trench fill: the concrete stops this far below ground
  // The concrete's thickness: given for a strip, and for a trench fill the depth less what is left above the concrete
  const concreteMm = isFill ? Math.max(1, depthMm - fillBelowMm) : stripConcreteMm
  const [dpcAbove, setDpcAbove] = useCalcState('AssemblyStripFoundationDemo', 'dpcAbove', 150)
  const [wall, setWall] = useCalcState<StripWallBuild>('AssemblyStripFoundationDemo', 'wall', 'cavity-filled')
  // The wall in courses (a cavity wall): facing brick splash courses at the top of the outer leaf, block below, the inner leaf block to the DPC
  const [brickCourses, setBrickCourses] = useCalcState('AssemblyStripFoundationDemo', 'brickCourses', 3)
  const [blockAuto, setBlockAuto] = useCalcState('AssemblyStripFoundationDemo', 'blockAuto', true)
  // a single skin wall: how thick the block is (the courses above are its courses of block)
  const [skinMm, setSkinMm] = useCalcState('AssemblyStripFoundationDemo', 'skinMm', 215)
  const [blockCoursesManual, setBlockCoursesManual] = useCalcState('AssemblyStripFoundationDemo', 'blockCoursesManual', 3)
  const [mix, setMix] = useCalcState<Mix>('AssemblyStripFoundationDemo', 'mix', 'C25')
  const [allSpoil, setAllSpoil] = useCalcState('AssemblyStripFoundationDemo', 'allSpoil', false)
  const [placingMethod, setPlacingMethod] = useCalcState<PlacingMethod>('AssemblyStripFoundationDemo', 'placingMethod', 'direct')
  const [placingDistanceM, setPlacingDistanceM] = useCalcState('AssemblyStripFoundationDemo', 'placingDistanceM', 25)
  const [placingMen, setPlacingMen] = useCalcState('AssemblyStripFoundationDemo', 'placingMen', 2)
  const [wastePct, setWastePct] = useCalcState('AssemblyStripFoundationDemo', 'wastePct', 10)
  const [diggerDays, setDiggerDays] = useCalcState<number | null>('AssemblyStripFoundationDemo', 'diggerDays', null)
  const [profitPct, setProfitPct] = useCalcState('AssemblyStripFoundationDemo', 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>('AssemblyStripFoundationDemo', 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>('AssemblyStripFoundationDemo', 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const input: StripFoundationInput = { lengthMm, widthMm, depthMm, concreteThicknessMm: concreteMm, dpcAboveGroundMm: dpcAbove, wall, takeAllSpoilAway: allSpoil, ...(wall === 'cavity-filled' ? { coursing: { brickCourses, blockCourses: blockAuto ? null : blockCoursesManual } } : wall === 'single-skin' ? { skinThicknessMm: skinMm, coursing: { brickCourses: 0, blockCourses: blockAuto ? null : blockCoursesManual } } : {}) }
  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateStripFoundationGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, widthMm, depthMm, concreteMm, dpcAbove, wall, skinMm, allSpoil, brickCourses, blockAuto, blockCoursesManual])
  const g = geometryResult.ok ? geometryResult.geometry : null

  // all the concrete poured: the trench, and the cavity fill when the wall is built that way
  const placingVolumeM3 = g ? g.concreteVolumeM3 + g.cavityFillM3 : 0
  const placing = useMemo(() => planConcretePlacing({ method: placingMethod, volumeM3: placingVolumeM3, distanceM: placingDistanceM, men: placingMen }), [placingMethod, placingVolumeM3, placingDistanceM, placingMen])

  const layers = useMemo(() => {
    if (!g) return []
    return buildStripFoundationLayers(g, { wall, mix, wastePct, placing, diggerDays }).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, wall, mix, wastePct, placing, diggerDays, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>('AssemblyStripFoundationDemo', 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour — suggested from the foundation, following it until edited
  const barrowing = placingLabour(placing)
  const labourSuggestions: LabourSuggestion[] = g ? [...suggestStripFoundationLabour({
    lm: g.lengthM, concreteM3: g.concreteVolumeM3, backfillM3: g.backfillM3, masonryAreaM2: g.masonryAreaM2, wall, cavityFillM3: g.cavityFillM3,
  }), ...(barrowing ? [barrowing] : [])] : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useCalcState<LabourLine[] | null>('AssemblyStripFoundationDemo', 'labourOverride', null)
  const suggestedRef = React.useRef<LabourLine[]>([])
  suggestedRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines
  const addLabour = () => setLabourOverride(prev => { const b = prev ?? suggestedRef.current; return [...b, { id: newLabourLineId(), tradeId: b[0]?.tradeId ?? '', task: '', hours: 0 }] })
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourOverride(prev => (prev ?? suggestedRef.current).map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourOverride(prev => (prev ?? suggestedRef.current).filter(l => l.id !== id))

  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const materialLines = [...(g ? costedLines : []), ...miscCostedLines]
  const enabledMaterialLines = materialLines.filter(l => !disabledLayerIds.has(l.layerId))
  const labourCostedLines: CostedLine[] = labourLines
    .map(l => {
      const trade = labourTrades.find(t => t.id === l.tradeId)
      if (!trade || l.hours <= 0) return null
      const rate = hourlyRate(trade)
      return { layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour', source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr', unitCost: rate, cost: +(l.hours * rate).toFixed(2) } as CostedLine
    })
    .filter((l): l is CostedLine => l !== null)
  const costSubtotal = enabledMaterialLines.reduce((s, l) => s + l.cost, 0) + labourCostedLines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(costSubtotal * profitPct / 100).toFixed(2)
  const profitLine: CostedLine | null = profitPct > 0 ? { layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed', wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount } : null
  const totalCost = costSubtotal + profitAmount

  // The customer's description follows the foundation until it's edited by hand
  const descInput = g ? { lengthM: g.lengthM, widthMm, depthMm, concreteThicknessMm: g.concreteThicknessMm, dpcAboveGroundMm: g.dpcAboveGroundMm, wall, concreteMix: mix, takeAllSpoilAway: allSpoil, variant, placing: placingMethod, ...(wall === 'single-skin' ? { skinThicknessMm: skinMm } : {}), ...(g.courses ? { courses: { brickCourses: g.courses.brickCourses, blockCourses: g.courses.blockCourses } } : {}) } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>('AssemblyStripFoundationDemo', 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>('AssemblyStripFoundationDemo', 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeStripFoundationShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeStripFoundation(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <NumInput type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the foundation</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the foundation — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the foundation</button>

  return (
    <div style={{ border: '2px dashed #0369a1', borderRadius: 10, background: '#f5fbff', padding: 14, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#0369a1', color: '#fff' }}>🧪 PREVIEW</span>
        <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>Assembly Calculator — sample data and sample rates, nothing here is saved yet</span>
        <div style={{ flex: 1 }} />
        {onClose && <button onClick={onClose} style={{ background: 'none', border: '1px solid #bae6fd', borderRadius: 5, color: '#0369a1', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>Close preview</button>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1, border: 'none', outline: 'none', background: 'transparent' }} />
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room / location" title="Which room or location this is — becomes the quote's room grouping when saved"
          style={{ fontSize: 12, color: '#0369a1', width: 140, padding: '4px 8px', border: '1px solid #bae6fd', borderRadius: 5, background: '#f5fbff' }} />
        <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
        <NumInput type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))} style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        {g && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {g && <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />}
        {onSave && g && (
          <button onClick={() => onSave({ name, qty, location, description, detail, lines: [...enabledMaterialLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>💾 Save &amp; Price</button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Quote line (short — printed on the quote)</label>
          {following(descriptionOverride, () => setDescriptionOverride(null), 'line')}
        </div>
        <textarea value={description} onChange={e => setDescriptionOverride(e.target.value)} rows={2} style={box} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>What's included (full — shown on the online quote)</label>
          {following(detailOverride, () => setDetailOverride(null), 'description')}
        </div>
        <textarea value={detail} onChange={e => setDetailOverride(e.target.value)} rows={6} style={box} />
      </div>

      {/* An engine error is a banner above the controls, never instead of them: typing a value digit by digit passes through invalid ones. */}
      {!geometryResult.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {geometryResult.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <FoundationSectionSvg widthMm={widthMm} depthMm={depthMm} concreteMm={g.concreteThicknessMm} dpcAboveMm={g.dpcAboveGroundMm} wallThicknessMm={g.wallThicknessMm} wall={wall} courses={g.courses} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.lengthM.toFixed(2)}m of foundation: {g.trenchVolumeM3.toFixed(2)} m³ dug, {g.concreteVolumeM3.toFixed(2)} m³ of concrete, {g.masonryAreaM2.toFixed(2)} m² of blockwork {g.wallHeightMm}mm high
              ({Math.round(g.blockCount)} blocks{g.brickCount > 0 ? `, ${Math.round(g.brickCount)} facing bricks` : ''}). Soil away {g.spoilAwayM3.toFixed(2)} m³ (bulked), backfill {g.backfillM3.toFixed(2)} m³. Machine {g.excavatorDays} day{g.excavatorDays === 1 ? '' : 's'}.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Length (mm) — from the line drawn">{numInput(lengthMm, setLengthMm, 1)}</PropRow>

          <CollapsibleSection title="Trench and concrete" borderColor="#bae6fd">
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Width (mm)">{numInput(widthMm, setWidthMm, 1)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Depth (mm)">{numInput(depthMm, setDepthMm, 1)}</PropRow></div>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>Depth is from ground level to the underside of the concrete.</div>
            {isFill
              ? <PropRow label="Concrete stops this far below ground (mm)">{numInput(fillBelowMm, setFillBelowMm, 0)}</PropRow>
              : <PropRow label="Concrete thickness (mm)">{numInput(stripConcreteMm, setConcreteMm, 1)}</PropRow>}
            {isFill && <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>So the concrete is {concreteMm}mm deep. The wall is built up from it to the DPC.</div>}
            <PropRow label="Concrete mix">
              <select value={mix} onChange={e => setMix(e.target.value as Mix)} style={propInput}>
                {(Object.keys(CONCRETE_MIXES) as Mix[]).map(k => <option key={k} value={k}>{CONCRETE_MIXES[k].label}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

          <ConcretePlacingSection method={placingMethod} onMethod={setPlacingMethod} distanceM={placingDistanceM} onDistance={setPlacingDistanceM} men={placingMen} onMen={setPlacingMen} plan={placing} volumeM3={placingVolumeM3} />

          <CollapsibleSection title="Wall up to the DPC" borderColor="#bae6fd">
            <PropRow label="Built as">
              <select value={wall} onChange={e => setWall(e.target.value as StripWallBuild)} style={propInput}>
                {(Object.entries(WALL_LABEL) as [StripWallBuild, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <PropRow label="DPC above ground level (mm)">{numInput(dpcAbove, setDpcAbove, 0)}</PropRow>
            {wall === 'single-skin' && (<>
              <PropRow label="Block thickness (mm)">
                <select value={skinMm} onChange={e => setSkinMm(+e.target.value)} style={propInput}>
                  <option value={100}>100mm</option><option value={140}>140mm</option><option value={215}>215mm</option>
                </select>
              </PropRow>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', margin: '8px 0 4px' }}>Courses of block</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', margin: '4px 0' }}>
                <input type="checkbox" checked={blockAuto} onChange={e => { if (!e.target.checked && g?.courses) setBlockCoursesManual(g.courses.blockCourses); setBlockAuto(e.target.checked) }} style={{ width: 'auto' }} />
                Work out the courses from the trench
              </label>
              {!blockAuto && <PropRow label="Courses of block">{numInput(blockCoursesManual, setBlockCoursesManual, 0)}</PropRow>}
              {g?.courses && (
                <div style={{ fontSize: 11, color: '#334155', background: '#f1f5f9', borderRadius: 5, padding: '6px 8px', lineHeight: 1.5 }}>
                  {g.courses.blockCourses} block × {BLOCK_COURSE_MM} = {g.courses.blockMm}mm<br />
                  <strong>Wall {g.courses.builtHeightMm}mm</strong> from the concrete to the DPC · DPC {Math.round(g.dpcAboveGroundMm)}mm above ground · concrete {Math.round(g.concreteThicknessMm)}mm
                </div>
              )}
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>One skin of block, laid on edge in {BLOCK_COURSE_MM}mm courses, no cavity and no brick. If the courses fall short of the DPC level the concrete is made thicker to bring the wall up to it. The size of block and the wall thickness are the designer's to confirm.</div>
            </>)}
            {wall === 'cavity-filled' && (<>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#334155', margin: '8px 0 4px' }}>Courses (outer leaf)</div>
              <PropRow label="Courses of facing brick at the top (splash courses)">{numInput(brickCourses, setBrickCourses, 0)}</PropRow>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', margin: '4px 0' }}>
                <input type="checkbox" checked={blockAuto} onChange={e => { if (!e.target.checked && g?.courses) setBlockCoursesManual(g.courses.blockCourses); setBlockAuto(e.target.checked) }} style={{ width: 'auto' }} />
                Work out the courses of block under the brick
              </label>
              {!blockAuto && <PropRow label="Courses of block under the brick">{numInput(blockCoursesManual, setBlockCoursesManual, 0)}</PropRow>}
              {g?.courses && (
                <div style={{ fontSize: 11, color: '#334155', background: '#f1f5f9', borderRadius: 5, padding: '6px 8px', lineHeight: 1.5 }}>
                  {g.courses.brickCourses} brick × {BRICK_COURSE_MM} = {g.courses.brickMm}mm + {g.courses.blockCourses} block × {BLOCK_COURSE_MM} = {g.courses.blockMm}mm<br />
                  <strong>Wall {g.courses.builtHeightMm}mm</strong> from the concrete to the DPC · DPC {Math.round(g.dpcAboveGroundMm)}mm above ground · concrete {Math.round(g.concreteThicknessMm)}mm
                </div>
              )}
              <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>Three courses of brick are the same height as one course of block. The inner leaf is block all the way up. If the courses fall short of the DPC level the concrete is made thicker to bring the wall up to it.</div>
            </>)}
          </CollapsibleSection>

          <CollapsibleSection title="Soil" borderColor="#bae6fd">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={allSpoil} onChange={e => setAllSpoil(e.target.checked)} style={{ width: 'auto' }} />
              Take all the soil away (a tight site, or soil that can't be reused)
            </label>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>Otherwise only the surplus is taken away: what the concrete and the wall below ground displace. The rest goes back as backfill.</div>
          </CollapsibleSection>

          <DiggerOnSiteSection diggingDays={g ? g.excavatorDays : 0} daysOnSite={diggerDays} onDaysOnSite={setDiggerDays} />

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="foundation"
        />
        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {g && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={materialLines} onRateChange={handleRate} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
              layerSides={{}} onSidesChange={() => {}} sidesEligibleLayerIds={noSidesLayers} />
            {profitPct > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>
                Cost: £{costSubtotal.toFixed(2)} + {profitPct}% profit (£{profitAmount.toFixed(2)}) = <strong style={{ color: '#7ab533' }}>£{totalCost.toFixed(2)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── A section across the foundation: ground level, the trench, the concrete, the wall up to the DPC (in courses, when it is built that way) ──
function FoundationSectionSvg({ widthMm, depthMm, concreteMm, dpcAboveMm, wallThicknessMm, wall, courses }: {
  widthMm: number; depthMm: number; concreteMm: number; dpcAboveMm: number; wallThicknessMm: number; wall: StripWallBuild
  courses?: { brickCourses: number; blockCourses: number; brickMm: number; blockMm: number; builtHeightMm: number }
}) {
  const vbW = 430, vbH = 300
  const totalMm = depthMm + dpcAboveMm + 150
  const k = Math.min(210 / totalMm, 0.5)
  const trenchW = Math.max(widthMm * k, 24), cx = 150
  const groundY = 70 + dpcAboveMm * k
  const trenchBottom = groundY + depthMm * k
  const concH = Math.max(concreteMm * k, 4)
  const wallW = Math.min(wallThicknessMm * k, trenchW - 6)
  const dpcY = groundY - dpcAboveMm * k
  const wallBottom = trenchBottom - concH
  const leafW = wallW / 3
  const outerX = cx - wallW / 2, innerX = cx + wallW / 2 - leafW
  const dimX = cx + trenchW / 2 + 52
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {/* the soil either side, and ground level */}
      <rect x={20} y={groundY} width={cx - trenchW / 2 - 20} height={trenchBottom - groundY + 30} fill="#e7e5e4" />
      <rect x={cx + trenchW / 2} y={groundY} width={vbW - 20 - (cx + trenchW / 2)} height={trenchBottom - groundY + 30} fill="#e7e5e4" />
      <rect x={20} y={trenchBottom} width={vbW - 40} height={30} fill="#e7e5e4" />
      <line x1={20} x2={vbW - 20} y1={groundY} y2={groundY} stroke="#78716c" strokeWidth={1.5} />
      <text x={vbW - 24} y={groundY - 5} fontSize={9} fill="#78716c" textAnchor="end">Ground level</text>
      {/* backfill beside the wall */}
      <rect x={cx - trenchW / 2} y={groundY} width={trenchW} height={trenchBottom - groundY - concH} fill="#d6d3d1" />
      {/* the concrete */}
      <rect x={cx - trenchW / 2} y={trenchBottom - concH} width={trenchW} height={concH} fill="#a8a29e" stroke="#57534e" />
      <text x={cx} y={trenchBottom - concH / 2 + 3} fontSize={9} fill="#292524" textAnchor="middle">Concrete {Math.round(concreteMm)}</text>
      {/* the wall up to the DPC */}
      {courses && wall === 'single-skin' ? (<>
        {/* one leaf of block, in its courses counted from the concrete */}
        <rect x={cx - wallW / 2} y={dpcY} width={wallW} height={wallBottom - dpcY} fill="#d6d3d1" stroke="#57534e" strokeWidth={1.2} />
        {Array.from({ length: Math.floor(courses.builtHeightMm / BLOCK_COURSE_MM) }, (_, n) => <line key={'s' + n} x1={cx - wallW / 2} x2={cx + wallW / 2} y1={wallBottom - (n + 1) * BLOCK_COURSE_MM * k} y2={wallBottom - (n + 1) * BLOCK_COURSE_MM * k} stroke="#57534e" strokeWidth={0.8} />)}
        <line x1={dimX} x2={dimX} y1={dpcY} y2={wallBottom} stroke="#9a3412" />
        <line x1={dimX - 4} x2={dimX + 4} y1={dpcY} y2={dpcY} stroke="#9a3412" />
        <line x1={dimX - 4} x2={dimX + 4} y1={wallBottom} y2={wallBottom} stroke="#9a3412" />
        {courses.blockCourses > 0 && <text x={dimX + 8} y={dpcY + (courses.blockMm * k) / 2 + 3} fontSize={9} fill="#57534e">{courses.blockCourses} block × {BLOCK_COURSE_MM} = {courses.blockMm}</text>}
        <text x={dimX + 8} y={wallBottom + 11} fontSize={9} fontWeight={700} fill="#292524">Wall {courses.builtHeightMm}</text>
      </>) : courses && wall === 'cavity-filled' ? (<>
        {/* cavity, filled */}
        <rect x={outerX + leafW} y={dpcY} width={leafW} height={wallBottom - dpcY} fill="#a8a29e" />
        {/* outer leaf: brick on top, block below */}
        <rect x={outerX} y={dpcY} width={leafW} height={courses.brickMm * k} fill="#fdba74" stroke="#9a3412" strokeWidth={0.8} />
        {Array.from({ length: courses.brickCourses }, (_, n) => <line key={'b' + n} x1={outerX} x2={outerX + leafW} y1={dpcY + n * BRICK_COURSE_MM * k} y2={dpcY + n * BRICK_COURSE_MM * k} stroke="#9a3412" strokeWidth={0.8} />)}
        <rect x={outerX} y={dpcY + courses.brickMm * k} width={leafW} height={courses.blockMm * k} fill="#d6d3d1" stroke="#57534e" strokeWidth={0.8} />
        {Array.from({ length: courses.blockCourses }, (_, n) => <line key={'o' + n} x1={outerX} x2={outerX + leafW} y1={dpcY + courses.brickMm * k + n * BLOCK_COURSE_MM * k} y2={dpcY + courses.brickMm * k + n * BLOCK_COURSE_MM * k} stroke="#57534e" strokeWidth={0.8} />)}
        {/* inner leaf: block all the way up, courses counted from the concrete */}
        <rect x={innerX} y={dpcY} width={leafW} height={wallBottom - dpcY} fill="#d6d3d1" stroke="#57534e" strokeWidth={0.8} />
        {Array.from({ length: Math.floor(courses.builtHeightMm / BLOCK_COURSE_MM) }, (_, n) => <line key={'i' + n} x1={innerX} x2={innerX + leafW} y1={wallBottom - (n + 1) * BLOCK_COURSE_MM * k} y2={wallBottom - (n + 1) * BLOCK_COURSE_MM * k} stroke="#57534e" strokeWidth={0.8} />)}
        <text x={outerX + leafW / 2} y={wallBottom + 0} fontSize={0} />
        {/* the dimensions of the courses */}
        <line x1={dimX} x2={dimX} y1={dpcY} y2={wallBottom} stroke="#9a3412" />
        <line x1={dimX - 4} x2={dimX + 4} y1={dpcY} y2={dpcY} stroke="#9a3412" />
        <line x1={dimX - 4} x2={dimX + 4} y1={dpcY + courses.brickMm * k} y2={dpcY + courses.brickMm * k} stroke="#9a3412" />
        <line x1={dimX - 4} x2={dimX + 4} y1={wallBottom} y2={wallBottom} stroke="#9a3412" />
        {courses.brickCourses > 0 && <text x={dimX + 8} y={dpcY + (courses.brickMm * k) / 2 + 3} fontSize={9} fill="#9a3412">{courses.brickCourses} brick × {BRICK_COURSE_MM} = {courses.brickMm}</text>}
        {courses.blockCourses > 0 && <text x={dimX + 8} y={dpcY + courses.brickMm * k + (courses.blockMm * k) / 2 + 3} fontSize={9} fill="#57534e">{courses.blockCourses} block × {BLOCK_COURSE_MM} = {courses.blockMm}</text>}
        <text x={dimX + 8} y={wallBottom + 11} fontSize={9} fontWeight={700} fill="#292524">Wall {courses.builtHeightMm}</text>
        <rect x={cx - wallW / 2} y={dpcY} width={wallW} height={wallBottom - dpcY} fill="none" stroke="#57534e" strokeWidth={1.2} />
      </>) : (<>
        <rect x={cx - wallW / 2} y={dpcY} width={wallW} height={wallBottom - dpcY} fill={wall === 'solid-flat' ? '#d6d3d1' : '#fca5a5'} stroke="#57534e" strokeWidth={1.2} />
        {wall === 'cavity-filled' && <rect x={cx - wallW / 6} y={dpcY} width={wallW / 3} height={wallBottom - dpcY} fill="#a8a29e" />}
      </>)}
      <line x1={cx - wallW / 2 - 6} x2={cx + wallW / 2 + 6} y1={dpcY} y2={dpcY} stroke="#0f766e" strokeWidth={2.5} />
      <text x={cx + wallW / 2 + 10} y={dpcY - 4} fontSize={9} fill="#0f766e">DPC</text>
      {/* dimensions */}
      <line x1={cx - trenchW / 2 - 30} x2={cx - trenchW / 2 - 30} y1={groundY} y2={trenchBottom} stroke="#2563eb" />
      <text x={cx - trenchW / 2 - 36} y={(groundY + trenchBottom) / 2 + 3} fontSize={10} fill="#2563eb" textAnchor="end">{depthMm}</text>
      <line x1={cx - trenchW / 2} x2={cx + trenchW / 2} y1={trenchBottom + 18} y2={trenchBottom + 18} stroke="#2563eb" />
      <text x={cx} y={trenchBottom + 30} fontSize={10} fill="#2563eb" textAnchor="middle">{widthMm}</text>
      <line x1={cx + trenchW / 2 + 24} x2={cx + trenchW / 2 + 24} y1={dpcY} y2={groundY} stroke="#0f766e" />
      <text x={cx + trenchW / 2 + 28} y={(dpcY + groundY) / 2 + 3} fontSize={10} fill="#0f766e">{Math.round(dpcAboveMm)}</text>
      <text x={cx} y={dpcY - 22} fontSize={9} fill="#57534e" textAnchor="middle">{wallThicknessMm}mm {wall === 'solid-flat' ? 'solid blockwork' : wall === 'single-skin' ? 'single skin block' : 'cavity, filled'}</text>
    </svg>
  )
}
