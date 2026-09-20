'use client'

/**
 * Assembly Calculator — Sleeper / Dwarf Wall for a block and beam floor.
 *
 * A single-skin blockwork wall that carries the ends of the beams: a 100/140mm block on its side, or
 * the block laid flat for a 215mm wall, built from a strip or trench-fill foundation up to the
 * underside of the beams, so it stays below the DPC. Ventilation holes through the wall let air
 * move across the underfloor void — a sleeved 100mm pipe or a formed 215 × 65 opening, at a set
 * spacing, each one taking its area out of the blockwork.
 *
 * Counts and prices what's drawn — the foundation, the wall's height and how far the beams can
 * span, and how much ventilation the void needs, stay with the designer/engineer. See
 * calculateSleeperWallGeometry in lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  calculateSleeperWallGeometry, calculateSleeperWallCost,
  type SleeperWallInput, type SleeperWallGeometry, type SleeperVentType, type DwarfFoundationType,
  type BlockLaid, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { CEMENT_M2_PER_BAG, SAND_M2_PER_TONNE } from '@/components/AssemblyMasonryWallDemo'

// Sample rates, like every calculator here — editable per line in the breakdown until Back
// Office products/plant replace them.
const BLOCK_COST: Record<number, number> = { 100: 1.35, 140: 1.95 }
const VENT_PIPE_EACH = 6.50
// Mortar is worked out as a volume, the same calibration as the dwarf wall calculator: 0.013 m³ per
// m² of blockwork at 8 m² per bag and 57.7 m² per tonne of sand.
const CEMENT_M3_PER_BAG = +(CEMENT_M2_PER_BAG * 0.013).toFixed(4)
const SAND_M3_PER_TONNE = +(SAND_M2_PER_TONNE * 0.013).toFixed(3)

const VENT_LABEL: Record<SleeperVentType, string> = {
  pipe:    '100mm pipe sleeve',
  opening: 'Formed opening 215 × 65',
}

interface LayerOpts {
  wastePct: number
  blockWidthMm: number
  laid: BlockLaid
  ventType: SleeperVentType
  g: SleeperWallGeometry
  hardcore: boolean
}

function buildSleeperLayers(o: LayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const layers: AssemblyLayerDef[] = [
    { id: 'excavation', name: 'Excavate foundation trench', category: 'plant', source: 'excavationM3', unit: 'm³', unitCost: 22.00 },
    { id: 'spoil', name: 'Remove excavated spoil (bulked)', category: 'plant', source: 'spoilM3', unit: 'm³', unitCost: 38.00 },
  ]
  if (o.hardcore) layers.push({ id: 'hardcore', name: 'Hardcore bed (MOT Type 1), compacted', category: 'materials', source: 'hardcoreM3', unit: 'm³', unitCost: 55.00, wastePct: w })
  layers.push(
    { id: 'concrete', name: 'Concrete C20/25 foundation', category: 'materials', source: 'concreteM3', unit: 'm³', unitCost: 125.00, wastePct: 5 },
    {
      id: 'blocks',
      name: `Dense concrete block ${o.blockWidthMm}mm, laid ${o.laid === 'flat' ? 'flat' : 'on its side'}`,
      category: 'materials', source: 'foundationBlockCount', unit: 'nr',
      unitCost: BLOCK_COST[o.blockWidthMm] ?? BLOCK_COST[100], roundToWhole: true, wastePct: w,
    },
    { id: 'cement', name: 'Cement (mortar mix)', category: 'materials', source: 'mortarM3', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M3_PER_BAG, roundToWhole: true, wastePct: w },
    { id: 'sand', name: 'Building sand (mortar mix)', category: 'materials', source: 'mortarM3', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M3_PER_TONNE, wastePct: w },
  )
  if (o.g.ventCount > 0 && o.ventType === 'pipe') {
    layers.push({ id: 'vent_pipes', name: 'Ventilation sleeve, 100mm pipe through the wall', category: 'materials', source: 'ventCount', unit: 'nr', unitCost: VENT_PIPE_EACH, roundToWhole: true })
  }
  return layers
}

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

export default function AssemblySleeperWallDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName]         = useState('Sleeper Wall — Block & Beam Floor')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
  }, [externalLengthMm])
  const [topAboveGroundMm, setTopAboveGroundMm] = useState(300)
  const [laid, setLaid] = useState<BlockLaid>('side')
  const [blockWidthMm, setBlockWidthMm] = useState(100)
  const [foundationType, setFoundationType] = useState<DwarfFoundationType>('strip')
  const [trenchWidthMm, setTrenchWidthMm] = useState(450)
  const [foundationDepthMm, setFoundationDepthMm] = useState(450)
  const [concreteThicknessMm, setConcreteThicknessMm] = useState(200)
  const [concreteTopBelowGroundMm, setConcreteTopBelowGroundMm] = useState(150)
  const [hardcoreThicknessMm, setHardcoreThicknessMm] = useState(0)
  const [ventSpacingMm, setVentSpacingMm] = useState(1500)
  const [ventType, setVentType] = useState<SleeperVentType>('pipe')
  const [wastePct, setWastePct] = useState(10)
  const [location, setLocation] = useState('')

  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Set out, dig, pour foundation and build sleeper wall', hours: 16 },
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

  const input: SleeperWallInput = {
    lengthMm, topAboveGroundMm, laid, blockWidthMm, foundationType, trenchWidthMm, foundationDepthMm,
    concreteThicknessMm, concreteTopBelowGroundMm, hardcoreThicknessMm, ventSpacingMm, ventType,
  }

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateSleeperWallGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, topAboveGroundMm, laid, blockWidthMm, foundationType, trenchWidthMm, foundationDepthMm, concreteThicknessMm, concreteTopBelowGroundMm, hardcoreThicknessMm, ventSpacingMm, ventType])

  function buildAutoDescription(): string {
    const g = geometryResult.ok ? geometryResult.geometry : null
    const thick = g ? g.thicknessMm : (laid === 'flat' ? 215 : blockWidthMm)
    const found = foundationType === 'strip'
      ? `${trenchWidthMm}mm wide strip foundation, ${concreteThicknessMm}mm concrete`
      : `${trenchWidthMm}mm wide trench-fill foundation`
    let text = `${(lengthMm / 1000).toFixed(2)}m long single-skin sleeper wall supporting block and beam flooring, ${blockWidthMm}mm dense concrete blocks laid ${laid === 'flat' ? 'flat' : 'on their side'} (${thick}mm thick), built up${g ? ` ${g.wallHeightMm}mm` : ''} from a ${found}, ${(foundationDepthMm / 1000).toFixed(2)}m deep, to the underside of the beams ${topAboveGroundMm}mm above ground.`
    if (ventSpacingMm > 0 && g && g.ventCount > 0) {
      text += ` ${g.ventCount} × ${VENT_LABEL[ventType].toLowerCase()} ventilation hole${g.ventCount !== 1 ? 's' : ''} through the wall at up to ${(ventSpacingMm / 1000).toFixed(2)}m centres.`
    }
    return text
  }
  const [description, setDescription] = useState(buildAutoDescription)

  const layers = useMemo(() => {
    if (!geometryResult.ok) return []
    const base = buildSleeperLayers({ wastePct, blockWidthMm, laid, ventType, g: geometryResult.geometry, hardcore: hardcoreThicknessMm > 0 })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, blockWidthMm, laid, ventType, hardcoreThicknessMm, rateOverrides])

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
    try { return { ok: true as const, value: calculateSleeperWallCost(input, layers) } }
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
    <div style={{ border: '2px dashed #0e7490', borderRadius: 10, background: '#f4fbfd', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#0e7490', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#0e7490', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #a5e3f0', borderRadius: 5, color: '#0e7490', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
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
          style={{ fontSize: 12, color: '#0e7490', width: 140, padding: '4px 8px', border: '1px solid #a5e3f0', borderRadius: 5, background: '#f4fbfd' }} />
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
            style={{ fontSize: 10, color: '#0e7490', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div>
          {g && (<>
            <SleeperElevationSvg g={g} lengthMm={lengthMm} topAboveGroundMm={topAboveGroundMm} ventType={ventType} />
            <SleeperSectionSvg
              g={g} trenchWidthMm={trenchWidthMm} depthMm={foundationDepthMm}
              topAboveGroundMm={topAboveGroundMm} hardcoreMm={hardcoreThicknessMm}
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
              {(lengthMm / 1000).toFixed(2)}m run, {g.thicknessMm}mm thick and {g.wallHeightMm}mm high from the concrete to the underside of the beams —
              {' '}{Math.ceil(g.foundationBlockCount)} blocks.
              {' '}{g.ventCount > 0
                ? `${g.ventCount} ventilation hole${g.ventCount !== 1 ? 's' : ''} (${g.ventOpeningAreaMm2.toLocaleString()} mm² of opening in total).`
                : 'No ventilation holes.'}
              {' '}Foundation: {g.concreteM3.toFixed(2)} m³ of concrete, {g.excavationM3.toFixed(2)} m³ dug, {g.spoilM3.toFixed(2)} m³ of spoil to remove.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
          <PropRow label="Underside of beams above ground (mm)">{numInput(topAboveGroundMm, setTopAboveGroundMm)}</PropRow>

          <div style={{ borderTop: '1px solid #a5e3f0', paddingTop: 8, marginTop: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Wall</div>
            <PropRow label="How the block is laid">
              <select value={laid} onChange={e => setLaid(e.target.value as BlockLaid)} style={propInput}>
                <option value="side">On its side — {blockWidthMm}mm single skin</option>
                <option value="flat">Laid flat — 215mm wall</option>
              </select>
            </PropRow>
            <div style={{ marginTop: 6 }}>
              <PropRow label="Block">
                <select value={blockWidthMm} onChange={e => setBlockWidthMm(+e.target.value)} style={propInput}>
                  <option value={100}>Dense concrete 100mm</option>
                  <option value={140}>Dense concrete 140mm</option>
                </select>
              </PropRow>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #a5e3f0', paddingTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Ventilation holes</div>
            <PropRow label="Spacing — up to (mm, 0 = none)">{numInput(ventSpacingMm, setVentSpacingMm)}</PropRow>
            {ventSpacingMm > 0 && (
              <div style={{ marginTop: 6 }}>
                <PropRow label="Formed as">
                  <select value={ventType} onChange={e => setVentType(e.target.value as SleeperVentType)} style={propInput}>
                    {(Object.entries(VENT_LABEL) as [SleeperVentType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </PropRow>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #a5e3f0', paddingTop: 8 }}>
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
              <div style={{ flex: 1 }}><PropRow label="Hardcore bed (mm, 0 = none)">{numInput(hardcoreThicknessMm, setHardcoreThicknessMm)}</PropRow></div>
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

// ── The wall in elevation — its length, ground level, and where the ventilation holes fall, drawn to
// one scale. Visual only: none of it feeds the quantities in the breakdown.
function SleeperElevationSvg({ g, lengthMm, topAboveGroundMm, ventType }: {
  g: SleeperWallGeometry
  lengthMm: number
  topAboveGroundMm: number
  ventType: SleeperVentType
}) {
  const vbW = 640, vbH = 130
  const k = Math.min(560 / lengthMm, 0.5)
  const w = lengthMm * k
  const wallMm = g.wallHeightMm
  const h = Math.min(wallMm * k, 70)
  const kv = h / wallMm                            // vertical scale — same as k unless the wall is very tall
  const x0 = (vbW - w) / 2, yBottom = 92
  const groundFromBottomMm = wallMm - topAboveGroundMm
  const holeW = ventType === 'pipe' ? 100 : 215
  const holeH = ventType === 'pipe' ? 100 : 65
  // Holes sit in the middle of the part of the wall that's above ground.
  const holeCentreFromBottomMm = groundFromBottomMm + topAboveGroundMm / 2
  const positions = Array.from({ length: g.ventCount }, (_, i) => ((i + 0.5) * lengthMm) / g.ventCount)
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 116, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <text x={x0} y={16} fontSize={9} fill="#94a3b8">Elevation — underside of the beams at the top</text>
      <rect x={x0} y={yBottom - h} width={w} height={h} fill="#e5e7eb" stroke="#64748b" strokeWidth={1} />
      {groundFromBottomMm > 0 && groundFromBottomMm < wallMm && (
        <line x1={x0 - 10} x2={x0 + w + 10} y1={yBottom - groundFromBottomMm * kv} y2={yBottom - groundFromBottomMm * kv} stroke="#78716c" strokeWidth={1.2} strokeDasharray="4 2" />
      )}
      {positions.map((p, i) => ventType === 'pipe'
        ? <ellipse key={i} cx={x0 + p * k} cy={yBottom - holeCentreFromBottomMm * kv} rx={Math.max(2, (holeW / 2) * k)} ry={Math.max(2, (holeH / 2) * kv)} fill="#fff" stroke="#0e7490" strokeWidth={1.2} />
        : <rect key={i} x={x0 + p * k - (holeW / 2) * k} y={yBottom - holeCentreFromBottomMm * kv - (holeH / 2) * kv} width={Math.max(3, holeW * k)} height={Math.max(2, holeH * kv)} fill="#fff" stroke="#0e7490" strokeWidth={1.2} />)}
      <line x1={x0} x2={x0 + w} y1={yBottom + 12} y2={yBottom + 12} stroke="#94a3b8" strokeWidth={0.8} />
      <text x={x0 + w / 2} y={yBottom + 24} fontSize={9} fill="#64748b" textAnchor="middle">{(lengthMm / 1000).toFixed(2)}m</text>
    </svg>
  )
}

// ── Section through the wall and its foundation, with the ends of the beams bearing on top. Drawn to
// one scale. Visual only.
function SleeperSectionSvg({ g, trenchWidthMm, depthMm, topAboveGroundMm, hardcoreMm }: {
  g: SleeperWallGeometry
  trenchWidthMm: number
  depthMm: number
  topAboveGroundMm: number
  hardcoreMm: number
}) {
  const vbW = 640, vbH = 250
  const beamMm = 150
  const totalMm = depthMm + hardcoreMm + topAboveGroundMm + beamMm + 40
  const k = Math.min(200 / totalMm, 0.5)
  const cx = 190
  const baseY = 225
  const Y = (mmAbove: number) => baseY - mmAbove * k
  const X = (mmFromCentre: number) => cx + mmFromCentre * k
  const groundMm = hardcoreMm + depthMm
  const topMm = groundMm + topAboveGroundMm
  const concreteTopMm = hardcoreMm + g.concreteThicknessMm
  const halfW = trenchWidthMm / 2, halfT = g.thicknessMm / 2

  const rect = (x0: number, x1: number, y0: number, y1: number, fill: string, key: string, stroke = '#64748b') => (
    <rect key={key} x={X(x0)} y={Y(y1)} width={Math.max(0.5, (x1 - x0) * k)} height={Math.max(0.5, (y1 - y0) * k)} fill={fill} stroke={stroke} strokeWidth={0.7} />
  )
  const label = (y: number, text: string, key: string, color = '#475569') => (
    <text key={key} x={330} y={y} fontSize={9} fill={color}>{text}</text>
  )
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 230, marginTop: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <text x={cx} y={14} fontSize={9} fill="#94a3b8" textAnchor="middle">Section through the wall</text>
      <rect x={X(-halfW - 130)} y={Y(groundMm)} width={130 * k} height={groundMm * k} fill="#efe6d4" />
      <rect x={X(halfW)} y={Y(groundMm)} width={130 * k} height={groundMm * k} fill="#efe6d4" />
      {hardcoreMm > 0 && rect(-halfW, halfW, 0, hardcoreMm, '#cbd5e1', 'hardcore', '#94a3b8')}
      {rect(-halfW, halfW, hardcoreMm, concreteTopMm, '#9ca3af', 'concrete')}
      {rect(-halfT, halfT, concreteTopMm, topMm, '#d1d5db', 'wall')}
      {/* The ends of two beams, bearing on the wall */}
      {rect(-halfT - 120, -1, topMm, topMm + beamMm, '#bae6fd', 'beam-l', '#0e7490')}
      {rect(1, halfT + 120, topMm, topMm + beamMm, '#bae6fd', 'beam-r', '#0e7490')}
      <line x1={X(-halfW - 130)} x2={X(halfW + 130)} y1={Y(groundMm)} y2={Y(groundMm)} stroke="#78716c" strokeWidth={1.4} strokeDasharray="4 2" />
      {label(Y(topMm + beamMm / 2) + 3, 'Beam ends bearing on the wall', 'l-beam', '#0e7490')}
      {label(Y(topMm) + 3, `Underside of the beams — ${topAboveGroundMm}mm above ground`, 'l-top')}
      {label(Y(groundMm) + 3, 'Ground level', 'l-ground', '#78716c')}
      {/* Halfway between the concrete and ground level, so it never lands on the ground-level label. */}
      {label(Y((groundMm + concreteTopMm) / 2) + 3, `Single-skin wall ${g.thicknessMm}mm thick, ${g.wallHeightMm}mm high`, 'l-wall')}
      {label(Y((concreteTopMm + hardcoreMm) / 2) + 3, `Concrete ${g.concreteThicknessMm}mm — ${trenchWidthMm}mm wide, ${(depthMm / 1000).toFixed(2)}m deep`, 'l-conc')}
    </svg>
  )
}
