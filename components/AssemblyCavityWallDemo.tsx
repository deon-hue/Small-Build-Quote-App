'use client'

/**
 * Assembly Calculator — External Cavity Wall, DPC up to the wall plate.
 *
 * One component serves both Back Office cavity sub-phases (Partial Fill and Full Fill); the
 * `insulationDefault` prop just sets which insulation and cavity it starts on. Everything is
 * adjustable on screen:
 *   - outer leaf: facing brick, or block (block/block walls take a finish — render, brick slip,
 *     painted block — priced from the same list the masonry calculator uses),
 *   - inner leaf: thermal or dense block, 100mm or 140mm,
 *   - cavity width, and the insulation in it: none, rigid board (partial fill) at a chosen
 *     thickness, or mineral wool (full fill, which always fills the cavity),
 *   - openings: window or door, each with its own lintel type.
 *
 * It counts and prices what's drawn — bricks/blocks, mortar, ties, insulation, lintels, cavity
 * trays and weep vents, cavity closers, DPC, and the wall plate and restraint straps at the
 * top. It doesn't size lintels or check the wall against Building Regulations. Everything
 * below the DPC is a separate calculator. See calculateCavityGeometry in lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  calculateCavityGeometry, calculateCavityWallCost,
  BRICK_OUTER_LEAF_MM, BLOCK_OUTER_LEAF_MM,
  type CavityWallInput, type CavityOpening, type CavityLeafType, type CavityInsulationType,
  type LintelType, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, miniInput, PropRow, BreakdownTable, HDim,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  OpeningsEditor, newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'
import {
  FINISH_TYPE_CONFIG, EXTERNAL_FINISH_CONFIG, CEMENT_M2_PER_BAG, SAND_M2_PER_TONNE, MasonryElevationSvg,
  type FinishType, type FinishTypeConfig, type ExternalFinishType, type ExternalFinishTypeConfig,
} from '@/components/AssemblyMasonryWallDemo'

// Brickwork takes about 0.03 m³ of mortar per m² against blockwork's 0.013 (see the mortar note
// in AssemblyMasonryWallDemo) — same 1:5 mix, so one bag / one tonne covers proportionally less.
const BRICK_MORTAR_SCALE = 0.013 / 0.03
const CEMENT_M2_PER_BAG_BRICK = +(CEMENT_M2_PER_BAG * BRICK_MORTAR_SCALE).toFixed(2)
const SAND_M2_PER_TONNE_BRICK = +(SAND_M2_PER_TONNE * BRICK_MORTAR_SCALE).toFixed(1)

// Sample rates, like every calculator here — editable per line in the breakdown until Back
// Office products/plant replace them.
type InnerBlockType = 'thermal' | 'dense'
const INNER_BLOCK: Record<InnerBlockType, { label: string; cost: Record<number, number> }> = {
  thermal: { label: 'Thermal lightweight block', cost: { 100: 2.10, 140: 2.95 } },
  dense:   { label: 'Dense concrete block',      cost: { 100: 1.35, 140: 1.95 } },
}
const OUTER_BLOCK_COST = 1.35  // dense concrete block, 100mm
const BRICK_COST = 0.75
const PIR_PER_M2_PER_MM = 0.21
const WOOL_PER_M2_PER_MM = 0.095
const BOARD_THICKNESSES = [25, 40, 50, 60, 75, 90, 100, 120, 150]

const LINTEL_LABEL: Record<LintelType, string> = {
  'steel-cavity': 'Steel cavity lintel (one, spans both leaves)',
  'concrete-pair': 'Two concrete lintels (one per leaf)',
  'concrete-steel-angle': 'Concrete inner lintel + steel angle for the outer leaf',
}
const INSULATION_LABEL: Record<CavityInsulationType, string> = {
  none: 'None (empty cavity)',
  pir: 'Partial fill — rigid board',
  wool: 'Full fill — mineral wool',
}

interface LayerOpts {
  wastePct: number
  outerLeaf: CavityLeafType
  innerType: InnerBlockType
  innerThicknessMm: number
  insulation: CavityInsulationType
  insulationThicknessMm: number
  tieLengthMm: number
  externalFinish: ExternalFinishType
  finishType: FinishType
  counts: { steelCavity: number; concrete: number; angles: number; trays: number; weeps: number; closerLm: number }
}

function buildCavityLayers(o: LayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const inner = INNER_BLOCK[o.innerType]
  const layers: AssemblyLayerDef[] = []

  // Inner leaf
  layers.push(
    { id: 'inner_blocks', name: `${inner.label} ${o.innerThicknessMm}mm (inner leaf)`, category: 'materials', source: 'innerBlockCount', unit: 'nr', unitCost: inner.cost[o.innerThicknessMm] ?? inner.cost[100], roundToWhole: true, wastePct: w },
    { id: 'inner_cement', name: 'Cement — inner leaf mortar', category: 'materials', source: 'netAreaM2', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M2_PER_BAG, roundToWhole: true, wastePct: w },
    { id: 'inner_sand', name: 'Building sand — inner leaf mortar', category: 'materials', source: 'netAreaM2', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M2_PER_TONNE, wastePct: w },
  )

  // The cavity — ties, clips, insulation
  layers.push(
    { id: 'ties', name: `Stainless steel wall tie ${o.tieLengthMm}mm`, category: 'materials', source: 'tieCount', unit: 'nr', unitCost: 0.28, roundToWhole: true, wastePct: 5 },
  )
  if (o.insulation === 'pir') {
    layers.push({ id: 'tie_clips', name: 'Insulation retaining clip', category: 'materials', source: 'tieCount', unit: 'nr', unitCost: 0.12, roundToWhole: true, wastePct: 5 })
  }
  if (o.insulation !== 'none') {
    const rate = o.insulation === 'pir' ? PIR_PER_M2_PER_MM : WOOL_PER_M2_PER_MM
    layers.push({
      id: 'insulation',
      name: o.insulation === 'pir' ? `Rigid PIR insulation board ${o.insulationThicknessMm}mm` : `Mineral wool full-fill batt ${o.insulationThicknessMm}mm`,
      category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: +(rate * o.insulationThicknessMm).toFixed(2), wastePct: w,
    })
  }

  // Outer leaf
  if (o.outerLeaf === 'brick') {
    layers.push(
      { id: 'outer_bricks', name: 'Facing bricks (outer leaf)', category: 'materials', source: 'brickCount', unit: 'nr', unitCost: BRICK_COST, roundToWhole: true, wastePct: w },
      { id: 'outer_cement', name: 'Cement — outer leaf mortar', category: 'materials', source: 'netAreaM2', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M2_PER_BAG_BRICK, roundToWhole: true, wastePct: w },
      { id: 'outer_sand', name: 'Building sand — outer leaf mortar', category: 'materials', source: 'netAreaM2', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M2_PER_TONNE_BRICK, wastePct: w },
    )
  } else {
    layers.push(
      { id: 'outer_blocks', name: `Dense concrete block ${BLOCK_OUTER_LEAF_MM}mm (outer leaf)`, category: 'materials', source: 'outerBlockCount', unit: 'nr', unitCost: OUTER_BLOCK_COST, roundToWhole: true, wastePct: w },
      { id: 'outer_cement', name: 'Cement — outer leaf mortar', category: 'materials', source: 'netAreaM2', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M2_PER_BAG, roundToWhole: true, wastePct: w },
      { id: 'outer_sand', name: 'Building sand — outer leaf mortar', category: 'materials', source: 'netAreaM2', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M2_PER_TONNE, wastePct: w },
      ...EXTERNAL_FINISH_CONFIG[o.externalFinish].buildLayers(w),
    )
  }

  // Openings
  const c = o.counts
  if (c.steelCavity > 0) layers.push({ id: 'lintel_steel', name: 'Steel cavity lintel', category: 'materials', source: 'steelCavityLintelCount', unit: 'nr', unitCost: 68.00, roundToWhole: true })
  if (c.concrete > 0)    layers.push({ id: 'lintel_concrete', name: 'Precast concrete lintel', category: 'materials', source: 'concreteLintelCount', unit: 'nr', unitCost: 38.00, roundToWhole: true })
  if (c.angles > 0)      layers.push({ id: 'lintel_angle', name: 'Steel support angle (outer leaf)', category: 'materials', source: 'steelAngleCount', unit: 'nr', unitCost: 24.00, roundToWhole: true })
  if (c.trays > 0)       layers.push({ id: 'cavity_tray', name: 'Cavity tray (over separate lintels)', category: 'materials', source: 'trayCount', unit: 'nr', unitCost: 9.50, roundToWhole: true })
  if (c.weeps > 0)       layers.push({ id: 'weeps', name: 'Weep vent (over openings)', category: 'materials', source: 'weepCount', unit: 'nr', unitCost: 0.85, roundToWhole: true })
  if (c.closerLm > 0)    layers.push({ id: 'closers', name: 'Cavity closer (opening reveals)', category: 'materials', source: 'closerLm', unit: 'm', unitCost: 3.20, wastePct: w })

  // Base and top of the wall
  layers.push(
    { id: 'dpc', name: 'DPC (damp-proof course), both leaves', category: 'materials', source: 'lengthM', unit: 'm', unitCost: 1.80, sidesMultiplier: 2, wastePct: w },
    { id: 'head_closure', name: 'Cavity closure at wall head', category: 'materials', source: 'headClosureLm', unit: 'm', unitCost: 3.20, wastePct: w },
    { id: 'wall_plate', name: 'Timber wall plate 100×50', category: 'materials', source: 'wallPlateLm', unit: 'm', unitCost: 2.80, wastePct: w },
    { id: 'straps', name: 'Roof restraint strap', category: 'materials', source: 'strapCount', unit: 'nr', unitCost: 3.40, roundToWhole: true },
  )

  // Inside face
  layers.push(...FINISH_TYPE_CONFIG[o.finishType].buildLayers(w))
  return layers
}

interface Props {
  /** Which insulation the calculator opens on — 'pir' for the Partial Fill sub-phase, 'wool' for Full Fill. */
  insulationDefault?: 'pir' | 'wool'
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

function sampleOpenings(): CavityOpening[] {
  return [{ id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 2000, sillHeightMm: 900, lintelType: 'steel-cavity' }]
}

export default function AssemblyCavityWallDemo({ insulationDefault = 'pir', onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const isFullFill = insulationDefault === 'wool'
  const [name, setName]         = useState(isFullFill ? 'Cavity Wall — Full Fill' : 'Cavity Wall — Partial Fill')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useState(2400)
  const [outerLeaf, setOuterLeaf] = useState<CavityLeafType>('brick')
  const [externalFinish, setExternalFinish] = useState<ExternalFinishType>('render')
  const [innerType, setInnerType] = useState<InnerBlockType>('thermal')
  const [innerThicknessMm, setInnerThicknessMm] = useState(100)
  const [cavityWidthMm, setCavityWidthMm] = useState(isFullFill ? 100 : 125)
  const [insulation, setInsulation] = useState<CavityInsulationType>(insulationDefault)
  const [boardThicknessMm, setBoardThicknessMm] = useState(75)
  const [finishType, setFinishType] = useState<FinishType>('dot-dab')
  const [wastePct, setWastePct] = useState(10)
  const [openings, setOpenings] = useState<CavityOpening[]>(sampleOpenings)
  const [location, setLocation] = useState('')

  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Build cavity wall (brick & block)', hours: 12 },
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

  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(layerId: string) {
    setDisabledLayerIds(prev => {
      const next = new Set(prev)
      next.has(layerId) ? next.delete(layerId) : next.add(layerId)
      return next
    })
  }
  // No per-line "both faces" toggle — every layer here already accounts for its own faces.
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function buildAutoDescription(): string {
    const outer = outerLeaf === 'brick'
      ? 'facing brick outer leaf'
      : `block outer leaf, ${EXTERNAL_FINISH_CONFIG[externalFinish].label.toLowerCase()} outside`
    const fill = insulation === 'none' ? 'empty cavity'
      : insulation === 'pir' ? `${boardThicknessMm}mm rigid board (partial fill)`
      : 'mineral wool full fill'
    const parts = [
      `${(lengthMm / 1000).toFixed(2)}m long × ${(heightMm / 1000).toFixed(2)}m high external cavity wall, DPC to wall plate`,
      outer,
      `${cavityWidthMm}mm cavity, ${fill}`,
      `${innerThicknessMm}mm ${INNER_BLOCK[innerType].label.toLowerCase()} inner leaf`,
      `${FINISH_TYPE_CONFIG[finishType].label.toLowerCase()} inside`,
    ]
    let text = parts.join(', ') + '.'
    if (openings.length) {
      const list = openings.map(o => `${o.kind} (${o.widthMm}×${o.heightMm}mm, ${LINTEL_LABEL[o.lintelType].split(' (')[0].toLowerCase()})`).join(', ')
      text += ` Includes ${openings.length} opening${openings.length !== 1 ? 's' : ''}: ${list}.`
    }
    return text
  }
  const [description, setDescription] = useState(buildAutoDescription)

  const input: CavityWallInput = {
    lengthMm, heightMm, outerLeaf, innerLeafThicknessMm: innerThicknessMm, cavityWidthMm,
    insulation, insulationThicknessMm: boardThicknessMm, openings,
  }
  const openingsKey = JSON.stringify(openings)

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateCavityGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, outerLeaf, innerThicknessMm, cavityWidthMm, insulation, boardThicknessMm, openingsKey])

  const layers = useMemo(() => {
    if (!geometryResult.ok) return []
    const g = geometryResult.geometry
    const base = buildCavityLayers({
      wastePct, outerLeaf, innerType, innerThicknessMm, insulation,
      insulationThicknessMm: g.insulationThicknessMm, tieLengthMm: g.tieLengthMm,
      externalFinish, finishType,
      counts: { steelCavity: g.steelCavityLintels, concrete: g.concreteLintels, angles: g.steelAngles, trays: g.trayCount, weeps: g.weepCount, closerLm: g.closerLm },
    })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, outerLeaf, innerType, innerThicknessMm, insulation, externalFinish, finishType, rateOverrides])

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
    try { return { ok: true as const, value: calculateCavityWallCost(input, layers) } }
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

  function updateOpening(id: string, patch: Partial<CavityOpening>) {
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  function removeOpening(id: string) {
    setOpenings(prev => prev.filter(o => o.id !== id))
  }
  function addOpening() {
    setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 0, sillHeightMm: 900, lintelType: 'steel-cavity' }])
  }

  const g = geometryResult.ok ? geometryResult.geometry : null

  return (
    <div style={{ border: '2px dashed #b45309', borderRadius: 10, background: '#fffbeb', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#b45309', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #fde68a', borderRadius: 5, color: '#b45309', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
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
          style={{ fontSize: 12, color: '#b45309', width: 140, padding: '4px 8px', border: '1px solid #fde68a', borderRadius: 5, background: '#fffbeb' }} />
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
            title="Regenerate from the current sizing and openings — overwrites any edits below"
            style={{ fontSize: 10, color: '#b45309', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ↻ Regenerate
          </button>
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          style={{ width: '100%', fontSize: 12, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {!result.ok || !g ? (
        <div style={{ color: '#c0392b', fontSize: 12, padding: 8 }}>⚠ {result.ok ? 'Could not calculate' : result.error}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            <MasonryElevationSvg
              input={{
                lengthMm, heightMm, openings,
                blockLengthMm: outerLeaf === 'brick' ? 225 : 450,
                blockHeightMm: outerLeaf === 'brick' ? 75 : 225,
              }}
              onOpeningOffsetChange={(id, offsetMm) => updateOpening(id, { offsetMm })}
            />
            <CavitySectionSvg
              innerMm={innerThicknessMm} cavityMm={cavityWidthMm} insulationMm={g.insulationThicknessMm}
              retainedMm={g.retainedCavityMm} outerMm={g.outerLeafThicknessMm} outerLeaf={outerLeaf}
              insulation={insulation} overallMm={g.overallThicknessMm}
            />
            {g.warnings.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {g.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginBottom: 3 }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high (DPC to wall plate),
              {' '}{openings.length} opening{openings.length !== 1 ? 's' : ''}.
              Net area {g.netAreaM2.toFixed(2)} m² ·{' '}
              {outerLeaf === 'brick' ? `${Math.ceil(g.brickCount)} bricks` : `${Math.ceil(g.outerBlockCount)} outer blocks`} ·{' '}
              {Math.ceil(g.innerBlockCount)} inner blocks · {g.tieCount} ties ({g.tieLengthMm}mm) ·{' '}
              {g.weepCount} weep vents · overall thickness {+g.overallThicknessMm.toFixed(1)}mm.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PropRow label="Length (mm)">
              <input type="number" value={lengthMm} onChange={e => setLengthMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Height — DPC to wall plate (mm)">
              <input type="number" value={heightMm} onChange={e => setHeightMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Outer leaf">
              <select value={outerLeaf} onChange={e => setOuterLeaf(e.target.value as CavityLeafType)} style={propInput}>
                <option value="brick">Facing brick ({BRICK_OUTER_LEAF_MM}mm)</option>
                <option value="block">Block ({BLOCK_OUTER_LEAF_MM}mm) + external finish</option>
              </select>
            </PropRow>
            {outerLeaf === 'block' && (
              <PropRow label="External finish">
                <select value={externalFinish} onChange={e => setExternalFinish(e.target.value as ExternalFinishType)} style={propInput}>
                  {(Object.entries(EXTERNAL_FINISH_CONFIG) as [ExternalFinishType, ExternalFinishTypeConfig][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </PropRow>
            )}
            <PropRow label="Inner leaf">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={innerType} onChange={e => setInnerType(e.target.value as InnerBlockType)} style={propInput}>
                  {(Object.entries(INNER_BLOCK) as [InnerBlockType, { label: string }][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select value={innerThicknessMm} onChange={e => setInnerThicknessMm(+e.target.value)} style={{ ...propInput, width: 84 }}>
                  <option value={100}>100mm</option>
                  <option value={140}>140mm</option>
                </select>
              </div>
            </PropRow>
            <PropRow label="Cavity width (mm)">
              <input type="number" min={50} max={300} step={5} value={cavityWidthMm}
                onChange={e => setCavityWidthMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Cavity insulation">
              <select value={insulation} onChange={e => setInsulation(e.target.value as CavityInsulationType)} style={propInput}>
                {(Object.keys(INSULATION_LABEL) as CavityInsulationType[]).map(k => (
                  <option key={k} value={k}>{INSULATION_LABEL[k]}</option>
                ))}
              </select>
            </PropRow>
            {insulation === 'pir' && (
              <PropRow label="Board thickness">
                <select value={boardThicknessMm} onChange={e => setBoardThicknessMm(+e.target.value)} style={propInput}>
                  {BOARD_THICKNESSES.map(t => <option key={t} value={t}>{t}mm</option>)}
                </select>
              </PropRow>
            )}
            {insulation === 'wool' && (
              <div style={{ fontSize: 11, color: '#64748b' }}>Full fill: the insulation fills the whole cavity, so it follows the cavity width ({cavityWidthMm}mm).</div>
            )}
            <PropRow label="Internal finish">
              <select value={finishType} onChange={e => setFinishType(e.target.value as FinishType)} style={propInput}>
                {(Object.entries(FINISH_TYPE_CONFIG) as [FinishType, FinishTypeConfig][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </PropRow>
            <PropRow label={`Waste % (${wastePct}%)`}>
              <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>
            <PropRow label={`Profit % (${profitPct}%)`}>
              <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>

            <OpeningsEditor
              openings={openings} onAdd={addOpening} onUpdate={updateOpening} onRemove={removeOpening}
              extraRow={o => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 0 8px' }}>
                  <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3, width: 34 }}>Lintel</span>
                  <select value={(o as CavityOpening).lintelType}
                    onChange={e => updateOpening(o.id, { lintelType: e.target.value as LintelType })} style={miniInput}>
                    {(Object.keys(LINTEL_LABEL) as LintelType[]).map(k => <option key={k} value={k}>{LINTEL_LABEL[k]}</option>)}
                  </select>
                </div>
              )}
            />
          </div>

          <LabourSection labourLines={labourLines} labourTrades={labourTrades}
            onAdd={addLabourLine} onUpdate={updateLabourLine} onRemove={removeLabourLine} />

          <MiscMaterialsSection miscMaterialLines={miscMaterialLines}
            onAdd={addMiscMaterialLine} onUpdate={updateMiscMaterialLine} onRemove={removeMiscMaterialLine} />

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
        </div>
      )}
    </div>
  )
}

// ── Cross-section — a slice through the wall from the inside finish to the outer leaf, so the
// effect of the leaf choices, cavity width and insulation is visible at a glance. Visual only:
// none of it feeds the quantities in the breakdown.
function CavitySectionSvg({ innerMm, cavityMm, insulationMm, retainedMm, outerMm, outerLeaf, insulation, overallMm }: {
  innerMm: number
  cavityMm: number
  insulationMm: number
  retainedMm: number
  outerMm: number
  outerLeaf: CavityLeafType
  insulation: CavityInsulationType
  overallMm: number
}) {
  const FINISH_MM = 15
  const K = 1.35, x0 = 30, y0 = 26, h = 62
  const segs: { key: string; mm: number; fill: string; stroke: string; dash?: boolean; label: string }[] = [
    { key: 'finish', mm: FINISH_MM, fill: '#fef3c7', stroke: '#d6a86a', label: '' },
    { key: 'inner', mm: innerMm, fill: '#d1d5db', stroke: '#94a3b8', label: `${innerMm}` },
    ...(insulationMm > 0 ? [{ key: 'ins', mm: insulationMm, fill: '#99f6e4', stroke: '#2dd4bf', label: `${+insulationMm.toFixed(0)}` }] : []),
    ...(retainedMm > 0 ? [{ key: 'gap', mm: retainedMm, fill: 'none', stroke: '#94a3b8', dash: true, label: `${+retainedMm.toFixed(0)}` }] : []),
    { key: 'outer', mm: outerMm, fill: outerLeaf === 'brick' ? '#f0997b' : '#d1d5db', stroke: outerLeaf === 'brick' ? '#d85a30' : '#94a3b8', label: `${+outerMm.toFixed(1)}` },
  ]
  let x = x0
  const rects = segs.map(s => {
    const w = s.mm * K
    const r = { ...s, x, w }
    x += w
    return r
  })
  const tieX1 = x0 + (FINISH_MM + innerMm) * K - 10
  const tieX2 = x0 + (FINISH_MM + innerMm + cavityMm) * K + 14
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox="0 0 640 138" style={{ width: '100%', height: 116, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={x0} y={16} fontSize={9} fill="#94a3b8">Inside</text>
        <text x={x} y={16} fontSize={9} fill="#94a3b8" textAnchor="end">Outside</text>
        {rects.map(r => (
          <g key={r.key}>
            <rect x={r.x} y={y0} width={r.w} height={h} fill={r.fill} stroke={r.stroke} strokeWidth={1} strokeDasharray={r.dash ? '4 3' : undefined} />
            {r.w >= 26 && r.label && (
              <text x={r.x + r.w / 2} y={y0 + h / 2 + 4} fontSize={10} fill="#475569" textAnchor="middle">{r.label}</text>
            )}
          </g>
        ))}
        <line x1={tieX1} y1={y0 + h * 0.3} x2={tieX2} y2={y0 + h * 0.3} stroke="#475569" strokeWidth={1.6} />
        <line x1={tieX1} y1={y0 + h * 0.75} x2={tieX2} y2={y0 + h * 0.75} stroke="#475569" strokeWidth={1.6} />
        <text x={(tieX1 + tieX2) / 2} y={y0 - 5} fontSize={9} fill="#64748b" textAnchor="middle">wall ties</text>
        <HDim x1={x0} x2={x} y={y0 + h + 22} label={`${+overallMm.toFixed(1)}mm overall + 15mm inside finish`} />
        <g transform={`translate(${x0}, 128)`} fontSize={8} fill="#64748b">
          <rect x={0} y={-6} width={8} height={8} fill="#d1d5db" stroke="#94a3b8" />
          <text x={12} y={1}>Block</text>
          {outerLeaf === 'brick' && <><rect x={50} y={-6} width={8} height={8} fill="#f0997b" stroke="#d85a30" /><text x={62} y={1}>Facing brick</text></>}
          {insulation !== 'none' && <><rect x={120} y={-6} width={8} height={8} fill="#99f6e4" stroke="#2dd4bf" /><text x={132} y={1}>{insulation === 'pir' ? 'Rigid board' : 'Mineral wool'}</text></>}
          {retainedMm > 0 && <><rect x={200} y={-6} width={8} height={8} fill="none" stroke="#94a3b8" strokeDasharray="2 2" /><text x={212} y={1}>Clear cavity</text></>}
        </g>
      </svg>
    </div>
  )
}
