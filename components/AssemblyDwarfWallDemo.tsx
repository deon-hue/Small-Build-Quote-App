'use client'

/**
 * Assembly Calculator — External Dwarf Wall.
 *
 * A short masonry wall that carries a conservatory, garden room, timber frame or glazed system,
 * priced by the metre from the foundation up to the top of the wall — everything in the Dwarf
 * Load-Bearing Wall sub-phase's task list: excavation and spoil, concrete (a strip or trench
 * fill), blockwork up to the DPC, the wall above it (brick-and-block or block-and-block cavity,
 * solid block laid flat or on its side, or solid engineering brick), DPC, closing the cavity,
 * an optional wall plate and coping.
 *
 * Counts and prices what's drawn — the foundation size and the wall's design stay with the
 * engineer. See calculateDwarfWallGeometry in lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  calculateDwarfWallGeometry, calculateDwarfWallCost,
  type DwarfWallInput, type DwarfWallType, type DwarfFoundationType, type DwarfWallGeometry,
  type BlockLaid, type CavityInsulationType, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import {
  EXTERNAL_FINISH_CONFIG, CEMENT_M2_PER_BAG, SAND_M2_PER_TONNE,
  type ExternalFinishType, type ExternalFinishTypeConfig,
} from '@/components/AssemblyMasonryWallDemo'

// Sample rates, like every calculator here — editable per line in the breakdown until Back
// Office products/plant replace them.
const WALL_TYPE_LABEL: Record<DwarfWallType, string> = {
  'cavity-brick-block': 'Cavity — brick outside, block inside',
  'cavity-block-block': 'Cavity — block outside, block inside',
  'solid-block':        'Solid blockwork',
  'solid-brick':        'Solid engineering brick (215mm)',
}
const BLOCK_COST: Record<number, number> = { 100: 1.35, 140: 1.95 }
const FACING_BRICK = 0.75
const ENGINEERING_BRICK = 0.95
const PIR_PER_M2_PER_MM = 0.21
const WOOL_PER_M2_PER_MM = 0.095
const BOARD_THICKNESSES = [25, 40, 50, 60, 75, 90, 100]
// Mortar is worked out as a volume, so a bag and a tonne cover the same amount whatever mix of
// blocks and bricks: the masonry calculator is calibrated to 0.013 m³ per m² at 8 m² per bag and
// 57.7 m² per tonne of sand.
const CEMENT_M3_PER_BAG = +(CEMENT_M2_PER_BAG * 0.013).toFixed(4)
const SAND_M3_PER_TONNE = +(SAND_M2_PER_TONNE * 0.013).toFixed(3)

type ExtFinish = ExternalFinishType | 'none'

interface LayerOpts {
  wastePct: number
  type: DwarfWallType
  blockWidthMm: number
  insulation: CavityInsulationType
  insulationThicknessMm: number
  tieLengthMm: number
  externalFinish: ExtFinish
  g: DwarfWallGeometry
  hardcore: boolean
  wallPlate: boolean
  coping: boolean
}

function buildDwarfLayers(o: LayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const g = o.g
  const isCavity = o.type === 'cavity-brick-block' || o.type === 'cavity-block-block'
  const layers: AssemblyLayerDef[] = []

  // Ground works and foundation
  layers.push({ id: 'excavation', name: 'Excavate foundation trench', category: 'plant', source: 'excavationM3', unit: 'm³', unitCost: 22.00 })
  layers.push({ id: 'spoil', name: 'Remove excavated spoil (bulked)', category: 'plant', source: 'spoilM3', unit: 'm³', unitCost: 38.00 })
  if (o.hardcore) layers.push({ id: 'hardcore', name: 'Hardcore bed (MOT Type 1), compacted', category: 'materials', source: 'hardcoreM3', unit: 'm³', unitCost: 55.00, wastePct: w })
  layers.push({ id: 'concrete', name: 'Concrete C20/25 foundation', category: 'materials', source: 'concreteM3', unit: 'm³', unitCost: 125.00, wastePct: 5 })

  // Blockwork from the concrete to the DPC
  layers.push({
    id: 'foundation_blocks',
    name: `Dense concrete block ${g.foundationBlockWidthMm}mm — foundation to DPC${isCavity ? ' (two leaves)' : ''}`,
    category: 'materials', source: 'foundationBlockCount', unit: 'nr',
    unitCost: BLOCK_COST[g.foundationBlockWidthMm] ?? BLOCK_COST[100], roundToWhole: true, wastePct: w,
  })
  if (g.cavityFillM3 > 0) {
    layers.push({ id: 'cavity_fill', name: 'Lean-mix concrete filling the cavity below the DPC', category: 'materials', source: 'cavityFillM3', unit: 'm³', unitCost: 105.00, wastePct: 5 })
  }

  // The wall above the DPC
  if (isCavity) {
    layers.push({ id: 'inner_blocks', name: `Dense concrete block ${o.blockWidthMm}mm (inner leaf)`, category: 'materials', source: 'innerBlockCount', unit: 'nr', unitCost: BLOCK_COST[o.blockWidthMm] ?? BLOCK_COST[100], roundToWhole: true, wastePct: w })
    if (o.type === 'cavity-brick-block') {
      layers.push({ id: 'outer_bricks', name: 'Facing bricks (outer leaf)', category: 'materials', source: 'brickCount', unit: 'nr', unitCost: FACING_BRICK, roundToWhole: true, wastePct: w })
    } else {
      layers.push({ id: 'outer_blocks', name: 'Dense concrete block 100mm (outer leaf)', category: 'materials', source: 'outerBlockCount', unit: 'nr', unitCost: BLOCK_COST[100], roundToWhole: true, wastePct: w })
    }
    layers.push({ id: 'ties', name: `Stainless steel wall tie ${g.tieLengthMm}mm`, category: 'materials', source: 'tieCount', unit: 'nr', unitCost: 0.28, roundToWhole: true, wastePct: 5 })
    if (o.insulation === 'pir') {
      layers.push({ id: 'tie_clips', name: 'Insulation retaining clip', category: 'materials', source: 'tieCount', unit: 'nr', unitCost: 0.12, roundToWhole: true, wastePct: 5 })
    }
    if (o.insulation !== 'none' && o.insulationThicknessMm > 0) {
      const rate = o.insulation === 'pir' ? PIR_PER_M2_PER_MM : WOOL_PER_M2_PER_MM
      layers.push({
        id: 'insulation',
        name: o.insulation === 'pir' ? `Rigid PIR insulation board ${o.insulationThicknessMm}mm` : `Mineral wool full-fill batt ${o.insulationThicknessMm}mm`,
        category: 'materials', source: 'aboveAreaM2', unit: 'm²', unitCost: +(rate * o.insulationThicknessMm).toFixed(2), wastePct: w,
      })
    }
  } else if (o.type === 'solid-block') {
    layers.push({ id: 'solid_blocks', name: `Dense concrete block ${o.blockWidthMm}mm — wall above the DPC`, category: 'materials', source: 'solidBlockCount', unit: 'nr', unitCost: BLOCK_COST[o.blockWidthMm] ?? BLOCK_COST[100], roundToWhole: true, wastePct: w })
  } else {
    layers.push({ id: 'eng_bricks', name: 'Engineering bricks (Class B) — wall above the DPC', category: 'materials', source: 'brickCount', unit: 'nr', unitCost: ENGINEERING_BRICK, roundToWhole: true, wastePct: w })
  }

  // One mortar line for all the blockwork and brickwork, foundation included.
  layers.push({ id: 'cement', name: 'Cement (mortar mix)', category: 'materials', source: 'mortarM3', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M3_PER_BAG, roundToWhole: true, wastePct: w })
  layers.push({ id: 'sand', name: 'Building sand (mortar mix)', category: 'materials', source: 'mortarM3', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M3_PER_TONNE, wastePct: w })

  layers.push({ id: 'dpc', name: isCavity ? 'DPC (damp-proof course), both leaves' : 'DPC (damp-proof course)', category: 'materials', source: 'dpcLm', unit: 'm', unitCost: 1.80, wastePct: w })
  if (isCavity) layers.push({ id: 'head_closure', name: 'Cavity closure at the top of the wall', category: 'materials', source: 'headClosureLm', unit: 'm', unitCost: 3.20, wastePct: w })
  if (o.wallPlate) layers.push({ id: 'wall_plate', name: 'Timber wall plate 100×50', category: 'materials', source: 'wallPlateLm', unit: 'm', unitCost: 2.80, wastePct: w })
  if (o.coping) layers.push({ id: 'coping', name: 'Coping / capping', category: 'materials', source: 'copingLm', unit: 'm', unitCost: 14.00, wastePct: w })

  // Outside finish — only where the face is block; brick is the finish already.
  if (o.externalFinish !== 'none' && (o.type === 'cavity-block-block' || o.type === 'solid-block')) {
    layers.push(...EXTERNAL_FINISH_CONFIG[o.externalFinish].buildLayers(w).map(l => ({ ...l, source: 'aboveAreaM2' as const })))
  }
  return layers
}

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

export default function AssemblyDwarfWallDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName]         = useState('Dwarf Wall')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useState(600)
  const [type, setType] = useState<DwarfWallType>('cavity-brick-block')
  const [laid, setLaid] = useState<BlockLaid>('flat')
  const [blockWidthMm, setBlockWidthMm] = useState(100)
  const [cavityWidthMm, setCavityWidthMm] = useState(100)
  const [insulation, setInsulation] = useState<CavityInsulationType>('none')
  const [insulationThicknessMm, setInsulationThicknessMm] = useState(50)
  const [externalFinish, setExternalFinish] = useState<ExtFinish>('render')
  const [foundationType, setFoundationType] = useState<DwarfFoundationType>('strip')
  const [trenchWidthMm, setTrenchWidthMm] = useState(450)
  const [foundationDepthMm, setFoundationDepthMm] = useState(750)
  const [concreteThicknessMm, setConcreteThicknessMm] = useState(200)
  const [concreteTopBelowGroundMm, setConcreteTopBelowGroundMm] = useState(150)
  const [hardcoreThicknessMm, setHardcoreThicknessMm] = useState(0)
  const [dpcAboveGroundMm, setDpcAboveGroundMm] = useState(150)
  const [wallPlate, setWallPlate] = useState(false)
  const [coping, setCoping] = useState(false)
  const [wastePct, setWastePct] = useState(10)
  const [location, setLocation] = useState('')

  const isCavity = type === 'cavity-brick-block' || type === 'cavity-block-block'

  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Set out, dig, pour foundation and build dwarf wall', hours: 40 },
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
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const input: DwarfWallInput = {
    lengthMm, heightMm, type, laid, blockWidthMm, cavityWidthMm, insulation, insulationThicknessMm,
    foundationType, trenchWidthMm, foundationDepthMm, concreteThicknessMm, concreteTopBelowGroundMm,
    hardcoreThicknessMm, dpcAboveGroundMm, wallPlate, coping,
  }

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateDwarfWallGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, type, laid, blockWidthMm, cavityWidthMm, insulation, insulationThicknessMm, foundationType, trenchWidthMm, foundationDepthMm, concreteThicknessMm, concreteTopBelowGroundMm, hardcoreThicknessMm, dpcAboveGroundMm, wallPlate, coping])

  function buildAutoDescription(): string {
    const g = geometryResult.ok ? geometryResult.geometry : null
    const wall = type === 'cavity-brick-block' ? `cavity dwarf wall, facing brick outside and ${blockWidthMm}mm block inside, ${cavityWidthMm}mm cavity${insulation === 'wool' ? ' fully filled with mineral wool' : insulation === 'pir' ? ` with ${insulationThicknessMm}mm rigid insulation` : ''}`
      : type === 'cavity-block-block' ? `cavity dwarf wall, block outside and ${blockWidthMm}mm block inside, ${cavityWidthMm}mm cavity${insulation === 'wool' ? ' fully filled with mineral wool' : insulation === 'pir' ? ` with ${insulationThicknessMm}mm rigid insulation` : ''}`
      : type === 'solid-block' ? `solid blockwork dwarf wall, ${g ? g.thicknessMm : 215}mm thick`
      : 'solid engineering brick dwarf wall, 215mm thick'
    const found = foundationType === 'strip'
      ? `${trenchWidthMm}mm wide strip foundation, ${concreteThicknessMm}mm concrete`
      : `${trenchWidthMm}mm wide trench-fill foundation`
    const parts = [`${(lengthMm / 1000).toFixed(2)}m long × ${(heightMm / 1000).toFixed(2)}m high above DPC ${wall}`,
      `${found}, ${(foundationDepthMm / 1000).toFixed(2)}m deep, blockwork up to a DPC ${dpcAboveGroundMm}mm above ground`]
    if (wallPlate) parts.push('timber wall plate')
    if (coping) parts.push('coping')
    return parts.join(', ') + '.'
  }
  const [description, setDescription] = useState(buildAutoDescription)

  const layers = useMemo(() => {
    if (!geometryResult.ok) return []
    const base = buildDwarfLayers({
      wastePct, type, blockWidthMm, insulation, insulationThicknessMm: geometryResult.geometry.insulationThicknessMm,
      tieLengthMm: geometryResult.geometry.tieLengthMm, externalFinish, g: geometryResult.geometry,
      hardcore: hardcoreThicknessMm > 0, wallPlate, coping,
    })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, type, blockWidthMm, insulation, externalFinish, hardcoreThicknessMm, wallPlate, coping, rateOverrides])

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
    try { return { ok: true as const, value: calculateDwarfWallCost(input, layers) } }
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

  const g = geometryResult.ok ? geometryResult.geometry : null
  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )

  return (
    <div style={{ border: '2px dashed #a16207', borderRadius: 10, background: '#fefce8', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#a16207', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#a16207', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #fde68a', borderRadius: 5, color: '#a16207', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
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
          style={{ fontSize: 12, color: '#a16207', width: 140, padding: '4px 8px', border: '1px solid #fde68a', borderRadius: 5, background: '#fefce8' }} />
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
            style={{ fontSize: 10, color: '#a16207', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ↻ Regenerate
          </button>
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          style={{ width: '100%', fontSize: 12, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {/* An error (e.g. concrete thicker than the foundation is deep, which typing a depth digit by
          digit passes through) is shown here with the controls still in place, so the value can be
          corrected — never in place of them. */}
      {!result.ok && (
        <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {result.error}</div>
      )}
      {(
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            {g && (<>
            <DwarfSectionSvg
              g={g} type={type} cavityWidthMm={cavityWidthMm} blockWidthMm={blockWidthMm}
              insulation={insulation} insulationMm={g.insulationThicknessMm}
              trenchWidthMm={trenchWidthMm} depthMm={foundationDepthMm} dpcAboveGroundMm={dpcAboveGroundMm}
              heightMm={heightMm} wallPlate={wallPlate} coping={coping} hardcoreMm={hardcoreThicknessMm}
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
              {(lengthMm / 1000).toFixed(2)}m run, wall {g.thicknessMm}mm thick and {(heightMm / 1000).toFixed(2)}m high above the DPC.
              Foundation: {g.concreteM3.toFixed(2)} m³ of concrete, {g.excavationM3.toFixed(2)} m³ dug, {g.spoilM3.toFixed(2)} m³ of spoil to remove.
              {' '}{Math.ceil(g.foundationBlockCount)} blocks to the DPC, then {g.aboveAreaM2.toFixed(2)} m² of wall above it.
            </div>
            </>)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
            <PropRow label="Height above the DPC (mm)">{numInput(heightMm, setHeightMm, 1)}</PropRow>

            <div style={{ borderTop: '1px solid #fde68a', paddingTop: 8, marginTop: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Wall above the DPC</div>
              <PropRow label="Construction">
                <select value={type} onChange={e => setType(e.target.value as DwarfWallType)} style={propInput}>
                  {(Object.entries(WALL_TYPE_LABEL) as [DwarfWallType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </PropRow>
              {type === 'solid-block' && (
                <div style={{ marginTop: 6 }}>
                  <PropRow label="How the block is laid">
                    <select value={laid} onChange={e => setLaid(e.target.value as BlockLaid)} style={propInput}>
                      <option value="flat">Laid flat — 215mm wall</option>
                      <option value="side">On its side — {blockWidthMm}mm wall</option>
                    </select>
                  </PropRow>
                </div>
              )}
              {(isCavity || type === 'solid-block') && (
                <div style={{ marginTop: 6 }}>
                  <PropRow label={isCavity ? 'Inner leaf block' : 'Block'}>
                    <select value={blockWidthMm} onChange={e => setBlockWidthMm(+e.target.value)} style={propInput}>
                      <option value={100}>100mm</option>
                      <option value={140}>140mm</option>
                    </select>
                  </PropRow>
                </div>
              )}
              {isCavity && (
                <>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <div style={{ flex: 1 }}><PropRow label="Cavity (mm)">{numInput(cavityWidthMm, setCavityWidthMm, 1)}</PropRow></div>
                    <div style={{ flex: 1 }}>
                      <PropRow label="Insulation">
                        <select value={insulation} onChange={e => setInsulation(e.target.value as CavityInsulationType)} style={propInput}>
                          <option value="none">None</option>
                          <option value="pir">Rigid board</option>
                          <option value="wool">Full-fill wool</option>
                        </select>
                      </PropRow>
                    </div>
                  </div>
                  {insulation === 'pir' && (
                    <div style={{ marginTop: 6 }}>
                      <PropRow label="Board thickness">
                        <select value={insulationThicknessMm} onChange={e => setInsulationThicknessMm(+e.target.value)} style={propInput}>
                          {BOARD_THICKNESSES.map(t => <option key={t} value={t}>{t}mm</option>)}
                        </select>
                      </PropRow>
                    </div>
                  )}
                </>
              )}
              {(type === 'cavity-block-block' || type === 'solid-block') && (
                <div style={{ marginTop: 6 }}>
                  <PropRow label="Outside finish">
                    <select value={externalFinish} onChange={e => setExternalFinish(e.target.value as ExtFinish)} style={propInput}>
                      <option value="none">None</option>
                      {(Object.entries(EXTERNAL_FINISH_CONFIG) as [ExternalFinishType, ExternalFinishTypeConfig][]).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                      ))}
                    </select>
                  </PropRow>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={wallPlate} onChange={e => setWallPlate(e.target.checked)} style={{ width: 'auto' }} />
                  Wall plate
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={coping} onChange={e => setCoping(e.target.checked)} style={{ width: 'auto' }} />
                  Coping
                </label>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #fde68a', paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Foundation</div>
              <PropRow label="Type">
                <select value={foundationType} onChange={e => setFoundationType(e.target.value as DwarfFoundationType)} style={propInput}>
                  <option value="strip">Strip — concrete, then blockwork</option>
                  <option value="trench-fill">Trench fill — concrete to near ground level</option>
                </select>
              </PropRow>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <div style={{ flex: 1 }}><PropRow label="Width (mm)">{numInput(trenchWidthMm, setTrenchWidthMm, 1)}</PropRow></div>
                <div style={{ flex: 1 }}><PropRow label="Depth (mm)">{numInput(foundationDepthMm, setFoundationDepthMm, 1)}</PropRow></div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <div style={{ flex: 1 }}>
                  {foundationType === 'strip'
                    ? <PropRow label="Concrete thickness (mm)">{numInput(concreteThicknessMm, setConcreteThicknessMm, 1)}</PropRow>
                    : <PropRow label="Concrete stops below ground (mm)">{numInput(concreteTopBelowGroundMm, setConcreteTopBelowGroundMm)}</PropRow>}
                </div>
                <div style={{ flex: 1 }}><PropRow label="DPC above ground (mm)">{numInput(dpcAboveGroundMm, setDpcAboveGroundMm)}</PropRow></div>
              </div>
              <div style={{ marginTop: 6 }}>
                <PropRow label="Hardcore bed (mm, 0 = none)">{numInput(hardcoreThicknessMm, setHardcoreThicknessMm)}</PropRow>
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
      )}
    </div>
  )
}

// ── Section through the wall and its foundation, drawn to one scale: the concrete, the blockwork
// up to the DPC, the wall above it, and where ground level falls. Outside is on the left. Visual
// only — none of it feeds the quantities in the breakdown.
function DwarfSectionSvg({ g, type, cavityWidthMm, blockWidthMm, insulation, insulationMm, trenchWidthMm, depthMm, dpcAboveGroundMm, heightMm, wallPlate, coping, hardcoreMm }: {
  g: DwarfWallGeometry
  type: DwarfWallType
  cavityWidthMm: number
  blockWidthMm: number
  insulation: CavityInsulationType
  insulationMm: number
  trenchWidthMm: number
  depthMm: number
  dpcAboveGroundMm: number
  heightMm: number
  wallPlate: boolean
  coping: boolean
  hardcoreMm: number
}) {
  const isCavity = type === 'cavity-brick-block' || type === 'cavity-block-block'
  const vbW = 640, vbH = 330
  const topExtra = 50 // room for a plate or coping above the wall
  const totalMm = depthMm + hardcoreMm + dpcAboveGroundMm + heightMm + topExtra
  const k = Math.min(280 / totalMm, 0.5)
  const cx = 190
  const baseY = 300                                  // the bottom of the hardcore/concrete
  const Y = (mmAbove: number) => baseY - mmAbove * k // height above the underside of the foundation
  const X = (mmFromCentre: number) => cx + mmFromCentre * k
  const bottom = hardcoreMm                          // concrete underside sits on the hardcore
  const groundMm = hardcoreMm + depthMm
  const dpcMm = groundMm + dpcAboveGroundMm
  const topMm = dpcMm + heightMm
  const concreteTopMm = bottom + g.concreteThicknessMm

  const rect = (x0: number, x1: number, y0: number, y1: number, fill: string, key: string, stroke = '#64748b') => (
    <rect key={key} x={X(x0)} y={Y(y1)} width={Math.max(0.5, (x1 - x0) * k)} height={Math.max(0.5, (y1 - y0) * k)} fill={fill} stroke={stroke} strokeWidth={0.7} />
  )

  const els: React.ReactNode[] = []
  const halfT = g.thicknessMm / 2, halfF = g.foundationWallThicknessMm / 2, halfW = trenchWidthMm / 2
  const outerL = type === 'cavity-brick-block' ? 102.5 : 100
  const cavityFillTopMm = dpcMm - 225

  // Ground either side of the trench
  els.push(<rect key="soil-l" x={X(-halfW - 130)} y={Y(groundMm)} width={130 * k} height={groundMm * k} fill="#efe6d4" />)
  els.push(<rect key="soil-r" x={X(halfW)} y={Y(groundMm)} width={130 * k} height={groundMm * k} fill="#efe6d4" />)
  if (hardcoreMm > 0) els.push(rect(-halfW, halfW, 0, hardcoreMm, '#cbd5e1', 'hardcore', '#94a3b8'))
  els.push(rect(-halfW, halfW, bottom, concreteTopMm, '#9ca3af', 'concrete'))

  // Blockwork from the concrete to the DPC
  if (isCavity) {
    els.push(rect(-halfF, -halfF + 100, concreteTopMm, dpcMm, '#d1d5db', 'f-outer'))
    els.push(rect(halfF - 100, halfF, concreteTopMm, dpcMm, '#d1d5db', 'f-inner'))
    if (cavityFillTopMm > concreteTopMm) els.push(rect(-halfF + 100, halfF - 100, concreteTopMm, cavityFillTopMm, '#9ca3af', 'f-fill'))
  } else {
    els.push(rect(-halfF, halfF, concreteTopMm, dpcMm, '#d1d5db', 'f-solid'))
  }

  // The wall above the DPC
  if (isCavity) {
    const innerL = halfT - blockWidthMm
    els.push(rect(-halfT, -halfT + outerL, dpcMm, topMm, type === 'cavity-brick-block' ? '#c2703d' : '#d1d5db', 'outer'))
    els.push(rect(innerL, halfT, dpcMm, topMm, '#d1d5db', 'inner'))
    if (insulation !== 'none' && insulationMm > 0) {
      els.push(rect(innerL - insulationMm, innerL, dpcMm, topMm, insulation === 'wool' ? '#fde68a' : '#fbcfe8', 'insulation'))
    }
  } else {
    els.push(rect(-halfT, halfT, dpcMm, topMm, type === 'solid-brick' ? '#c2703d' : '#d1d5db', 'wall'))
  }
  // DPC
  if (isCavity) {
    els.push(<line key="dpc-o" x1={X(-halfT)} x2={X(-halfT + outerL)} y1={Y(dpcMm)} y2={Y(dpcMm)} stroke="#111827" strokeWidth={2} />)
    els.push(<line key="dpc-i" x1={X(halfT - blockWidthMm)} x2={X(halfT)} y1={Y(dpcMm)} y2={Y(dpcMm)} stroke="#111827" strokeWidth={2} />)
  } else {
    els.push(<line key="dpc" x1={X(-halfT)} x2={X(halfT)} y1={Y(dpcMm)} y2={Y(dpcMm)} stroke="#111827" strokeWidth={2} />)
  }
  if (wallPlate) els.push(rect(-50, 50, topMm, topMm + 50, '#e0b878', 'plate'))
  if (coping) els.push(rect(-halfT - 25, halfT + 25, topMm, topMm + 40, '#a8a29e', 'coping'))

  const label = (y: number, text: string, key: string, color = '#475569') => (
    <text key={key} x={330} y={y} fontSize={9} fill={color}>{text}</text>
  )
  return (
    <div>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={cx} y={16} fontSize={9} fill="#94a3b8" textAnchor="middle">Section through the wall — outside on the left</text>
        {els}
        {/* Ground level */}
        <line x1={X(-halfW - 130)} x2={X(halfW + 130)} y1={Y(groundMm)} y2={Y(groundMm)} stroke="#78716c" strokeWidth={1.4} strokeDasharray="4 2" />
        {label(Y(topMm) + 3, `Top of wall — ${(heightMm / 1000).toFixed(2)}m above the DPC`, 'l-top')}
        {label(Y(dpcMm) + 3, `DPC — ${dpcAboveGroundMm}mm above ground`, 'l-dpc', '#111827')}
        {label(Y(groundMm) + 3, 'Ground level', 'l-ground', '#78716c')}
        {label(Y(concreteTopMm) + 3, `Concrete ${g.concreteThicknessMm}mm — ${trenchWidthMm}mm wide, ${(depthMm / 1000).toFixed(2)}m deep`, 'l-conc')}
        {label(Y((dpcMm + concreteTopMm) / 2) + 3, `Blockwork ${g.foundationBlockHeightMm}mm to the DPC${g.cavityFillM3 > 0 ? ' (cavity filled below)' : ''}`, 'l-fnd')}
        {label(Y((dpcMm + topMm) / 2) + 3, `Wall ${g.thicknessMm}mm thick`, 'l-wall')}
        <line x1={318} x2={326} y1={Y(topMm)} y2={Y(topMm)} stroke="#94a3b8" strokeWidth={0.7} />
        <line x1={318} x2={326} y1={Y(dpcMm)} y2={Y(dpcMm)} stroke="#94a3b8" strokeWidth={0.7} />
        <line x1={318} x2={326} y1={Y(groundMm)} y2={Y(groundMm)} stroke="#94a3b8" strokeWidth={0.7} />
      </svg>
    </div>
  )
}
