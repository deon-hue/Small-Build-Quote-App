'use client'

/**
 * Assembly Calculator — External Solid Blockwork (single leaf, no cavity).
 *
 * The 100mm blockwork calculator carried across to a 215mm wall, in one screen: the block is
 * laid either flat (a 215mm wall built up in 100mm courses) or on its side (the standard way —
 * a 100mm wall in 215mm courses), and both take piers, openings with lintels, an outside and an
 * inside finish (or none), coping, movement joints and bed-joint reinforcement. The 215mm
 * sub-phase opens on "laid flat"; nothing stops you switching.
 *
 * Counts and prices what's drawn — it doesn't design piers or check the wall's stability. See
 * calculateSolidBlockGeometry in lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  calculateSolidBlockGeometry, calculateSolidBlockWallCost,
  type SolidBlockWallInput, type BlockLaid, type AssemblyOpening, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  OpeningsEditor, newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'
import {
  FINISH_TYPE_CONFIG, EXTERNAL_FINISH_CONFIG, CEMENT_M2_PER_BAG, SAND_M2_PER_TONNE, MasonryElevationSvg,
  type FinishType, type FinishTypeConfig, type ExternalFinishType, type ExternalFinishTypeConfig,
} from '@/components/AssemblyMasonryWallDemo'

// Sample rates, like every calculator here — editable per line in the breakdown until Back
// Office products/plant replace them.
type BlockType = 'dense' | 'thermal'
const BLOCK: Record<BlockType, { label: string; cost: Record<number, number> }> = {
  dense:   { label: 'Dense concrete block',      cost: { 100: 1.35, 140: 1.95 } },
  thermal: { label: 'Thermal lightweight block', cost: { 100: 2.10, 140: 2.95 } },
}
const LINTEL_COST: Record<number, number> = { 100: 38.00, 140: 52.00, 215: 75.00 }
const DPC_COST_PER_M: Record<number, number> = { 100: 1.80, 140: 2.30, 215: 2.90 } // priced by roll width = wall thickness
const COPING_PER_M = 14.00
const PIER_CAP_EACH = 18.00
const MOVEMENT_JOINT_PER_M = 4.50
const REINFORCEMENT_PER_M = 0.95

type ExtFinish = ExternalFinishType | 'none'
type IntFinish = FinishType | 'none'

interface LayerOpts {
  wastePct: number
  blockType: BlockType
  blockWidthMm: number
  laid: BlockLaid
  thicknessMm: number
  mortarM3PerM2: number
  externalFinish: ExtFinish
  internalFinish: IntFinish
  coping: boolean
  counts: { lintels: number; pierCaps: number; movementJointLm: number; reinforcementLm: number }
}

function buildSolidBlockLayers(o: LayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  // Mortar coverage is scaled from the masonry calculator's 100mm-block figures by how much
  // mortar this coursing actually uses per m² (a 215mm wall in 100mm courses uses several times more).
  const scale = 0.013 / o.mortarM3PerM2
  const layers: AssemblyLayerDef[] = [
    { id: 'blocks', name: `${BLOCK[o.blockType].label} ${o.blockWidthMm}mm, laid ${o.laid === 'flat' ? 'flat' : 'on its side'}`, category: 'materials', source: 'blockCount', unit: 'nr', unitCost: BLOCK[o.blockType].cost[o.blockWidthMm] ?? BLOCK[o.blockType].cost[100], roundToWhole: true, wastePct: w },
    { id: 'cement', name: 'Cement (mortar mix)', category: 'materials', source: 'mortarAreaM2', unit: 'bag', unitCost: 6.50, coveragePerUnit: +(CEMENT_M2_PER_BAG * scale).toFixed(2), roundToWhole: true, wastePct: w },
    { id: 'sand', name: 'Building sand (mortar mix)', category: 'materials', source: 'mortarAreaM2', unit: 'tonne', unitCost: 32.00, coveragePerUnit: +(SAND_M2_PER_TONNE * scale).toFixed(1), wastePct: w },
  ]
  if (o.counts.lintels > 0) {
    layers.push({ id: 'lintel', name: `Precast concrete lintel ${o.thicknessMm}mm (opening)`, category: 'materials', source: 'lintelCount', unit: 'nr', unitCost: LINTEL_COST[o.thicknessMm] ?? 38.00, roundToWhole: true })
  }
  layers.push({ id: 'dpc', name: `DPC ${o.thicknessMm}mm wide (damp-proof course)`, category: 'materials', source: 'lengthM', unit: 'm', unitCost: DPC_COST_PER_M[o.thicknessMm] ?? 1.80, wastePct: w })
  if (o.coping) {
    layers.push({ id: 'coping', name: 'Concrete coping', category: 'materials', source: 'lengthM', unit: 'm', unitCost: COPING_PER_M, wastePct: w })
    if (o.counts.pierCaps > 0) layers.push({ id: 'pier_caps', name: 'Pier cap', category: 'materials', source: 'pierCapCount', unit: 'nr', unitCost: PIER_CAP_EACH, roundToWhole: true })
  }
  if (o.counts.movementJointLm > 0) {
    layers.push({ id: 'movement_joints', name: 'Movement joint (filler + sealant)', category: 'materials', source: 'movementJointLm', unit: 'm', unitCost: MOVEMENT_JOINT_PER_M, wastePct: w })
  }
  if (o.counts.reinforcementLm > 0) {
    layers.push({ id: 'bed_reinforcement', name: 'Bed-joint reinforcement', category: 'materials', source: 'reinforcementLm', unit: 'm', unitCost: REINFORCEMENT_PER_M, wastePct: w })
  }
  if (o.externalFinish !== 'none') {
    layers.push(...EXTERNAL_FINISH_CONFIG[o.externalFinish].buildLayers(w).map(l => ({ ...l, source: 'externalFaceAreaM2' as const })))
  }
  if (o.internalFinish !== 'none') {
    layers.push(...FINISH_TYPE_CONFIG[o.internalFinish].buildLayers(w).map(l => ({ ...l, source: 'internalFaceAreaM2' as const })))
  }
  return layers
}

interface Props {
  /** Which way the block is laid when the calculator opens — the 215mm sub-phase opens on 'flat'. */
  laidDefault?: BlockLaid
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

export default function AssemblySolidBlockWallDemo({ laidDefault = 'flat', onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName]         = useState(laidDefault === 'flat' ? 'Concrete Blockwork 215mm (laid flat)' : 'Solid Blockwork Wall')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useState(2400)
  const [blockType, setBlockType] = useState<BlockType>('dense')
  const [blockWidthMm, setBlockWidthMm] = useState(100)
  const [laid, setLaid] = useState<BlockLaid>(laidDefault)
  const [externalFinish, setExternalFinish] = useState<ExtFinish>('render')
  const [internalFinish, setInternalFinish] = useState<IntFinish>('none')
  const [coping, setCoping] = useState(false)
  const [pierSpacingMm, setPierSpacingMm] = useState(3000)
  const [pierWidthMm, setPierWidthMm] = useState(440)
  const [pierProjectionMm, setPierProjectionMm] = useState(215)
  const [pierFaces, setPierFaces] = useState<1 | 2>(1)
  const [pierAtEnds, setPierAtEnds] = useState(true)
  const [movementJointSpacingMm, setMovementJointSpacingMm] = useState(0)
  const [reinforceEveryNCourses, setReinforceEveryNCourses] = useState(0)
  const [wastePct, setWastePct] = useState(10)
  const [openings, setOpenings] = useState<AssemblyOpening[]>([])
  const [location, setLocation] = useState('')

  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Build blockwork wall', hours: 12 },
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

  function buildAutoDescription(): string {
    const thickness = laid === 'flat' ? 215 : blockWidthMm
    const parts = [
      `${(lengthMm / 1000).toFixed(2)}m long × ${(heightMm / 1000).toFixed(2)}m high external solid blockwork wall, ${thickness}mm thick`,
      `${BLOCK[blockType].label.toLowerCase()} ${blockWidthMm}mm laid ${laid === 'flat' ? 'flat' : 'on its side'}`,
      externalFinish === 'none' ? 'no outside finish' : `${EXTERNAL_FINISH_CONFIG[externalFinish].label.toLowerCase()} outside`,
      internalFinish === 'none' ? 'no inside finish' : `${FINISH_TYPE_CONFIG[internalFinish].label.toLowerCase()} inside`,
    ]
    if (coping) parts.push('concrete coping')
    let text = parts.join(', ') + '.'
    if (pierSpacingMm > 0) text += ` Piers ${pierWidthMm}×${pierProjectionMm}mm at up to ${(pierSpacingMm / 1000).toFixed(2)}m centres${pierAtEnds ? ', including the ends' : ''}, ${pierFaces === 2 ? 'both faces' : 'outside face'}.`
    if (openings.length) {
      const list = openings.map(o => `${o.kind} (${o.widthMm}×${o.heightMm}mm)`).join(', ')
      text += ` Includes ${openings.length} opening${openings.length !== 1 ? 's' : ''}: ${list}.`
    }
    return text
  }
  const [description, setDescription] = useState(buildAutoDescription)

  const input: SolidBlockWallInput = {
    lengthMm, heightMm, blockWidthMm, laid, openings,
    pierSpacingMm, pierWidthMm, pierProjectionMm, pierFaces, pierAtEnds,
    movementJointSpacingMm, reinforceEveryNCourses,
  }
  const openingsKey = JSON.stringify(openings)

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateSolidBlockGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, blockWidthMm, laid, openingsKey, pierSpacingMm, pierWidthMm, pierProjectionMm, pierFaces, pierAtEnds, movementJointSpacingMm, reinforceEveryNCourses])

  const layers = useMemo(() => {
    if (!geometryResult.ok) return []
    const g = geometryResult.geometry
    const base = buildSolidBlockLayers({
      wastePct, blockType, blockWidthMm, laid, thicknessMm: g.thicknessMm, mortarM3PerM2: g.mortarM3PerM2,
      externalFinish, internalFinish, coping,
      counts: { lintels: g.lintels.length, pierCaps: g.pierCapCount, movementJointLm: g.movementJointLm, reinforcementLm: g.reinforcementLm },
    })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, blockType, blockWidthMm, laid, externalFinish, internalFinish, coping, rateOverrides])

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
    try { return { ok: true as const, value: calculateSolidBlockWallCost(input, layers) } }
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

  function updateOpening(id: string, patch: Partial<AssemblyOpening>) {
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  function removeOpening(id: string) {
    setOpenings(prev => prev.filter(o => o.id !== id))
  }
  function addOpening() {
    setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 0, sillHeightMm: 900 }])
  }

  const g = geometryResult.ok ? geometryResult.geometry : null
  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )

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
              input={{ lengthMm, heightMm, openings, blockLengthMm: 450, blockHeightMm: g.courseHeightMm }}
              onOpeningOffsetChange={(id, offsetMm) => updateOpening(id, { offsetMm })}
            />
            <WallPlanSvg
              lengthMm={lengthMm} thicknessMm={g.thicknessMm} openings={openings}
              pierCount={g.pierCount} pierWidthMm={pierWidthMm} pierProjectionMm={pierProjectionMm}
              pierFaces={pierFaces} pierAtEnds={pierAtEnds}
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
              {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high, {g.thicknessMm}mm thick
              {' '}({g.courseCount} courses of {g.courseHeightMm - 10}mm), {openings.length} opening{openings.length !== 1 ? 's' : ''}.
              Net area {g.netAreaM2.toFixed(2)} m² · {Math.ceil(g.wallBlockCount)} wall blocks
              {g.pierCount > 0 && <> + {g.pierBlockCount} in {g.pierCount} pier{g.pierCount !== 1 ? 's' : ''}</>}
              {' '}= {Math.ceil(g.blockCount)} blocks.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
            <PropRow label="Height (mm)">{numInput(heightMm, setHeightMm, 1)}</PropRow>
            <PropRow label="Block">
              <div style={{ display: 'flex', gap: 6 }}>
                <select value={blockType} onChange={e => setBlockType(e.target.value as BlockType)} style={propInput}>
                  {(Object.entries(BLOCK) as [BlockType, { label: string }][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <select value={blockWidthMm} onChange={e => setBlockWidthMm(+e.target.value)} style={{ ...propInput, width: 84 }}>
                  <option value={100}>100mm</option>
                  <option value={140}>140mm</option>
                </select>
              </div>
            </PropRow>
            <PropRow label="How the block is laid">
              <select value={laid} onChange={e => setLaid(e.target.value as BlockLaid)} style={propInput}>
                <option value="flat">Laid flat — 215mm wall, {blockWidthMm}mm courses</option>
                <option value="side">On its side — {blockWidthMm}mm wall, 215mm courses</option>
              </select>
            </PropRow>
            <PropRow label="Outside finish">
              <select value={externalFinish} onChange={e => setExternalFinish(e.target.value as ExtFinish)} style={propInput}>
                <option value="none">None</option>
                {(Object.entries(EXTERNAL_FINISH_CONFIG) as [ExternalFinishType, ExternalFinishTypeConfig][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </PropRow>
            <PropRow label="Inside finish">
              <select value={internalFinish} onChange={e => setInternalFinish(e.target.value as IntFinish)} style={propInput}>
                <option value="none">None</option>
                {(Object.entries(FINISH_TYPE_CONFIG) as [FinishType, FinishTypeConfig][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </PropRow>
            <PropRow label="Top of wall">
              <select value={coping ? 'coping' : 'none'} onChange={e => setCoping(e.target.value === 'coping')} style={propInput}>
                <option value="none">Plain</option>
                <option value="coping">Concrete coping (+ a cap on each pier)</option>
              </select>
            </PropRow>

            <CollapsibleSection title="Piers" borderColor="#fde68a">
              <PropRow label="Spacing — up to (mm, 0 = no piers)">{numInput(pierSpacingMm, setPierSpacingMm)}</PropRow>
              {pierSpacingMm > 0 && (
                <>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <div style={{ flex: 1 }}><PropRow label="Width (mm)">{numInput(pierWidthMm, setPierWidthMm, 1)}</PropRow></div>
                    <div style={{ flex: 1 }}><PropRow label="Projects (mm)">{numInput(pierProjectionMm, setPierProjectionMm, 1)}</PropRow></div>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <PropRow label="On">
                      <select value={pierFaces} onChange={e => setPierFaces(+e.target.value as 1 | 2)} style={propInput}>
                        <option value={1}>Outside face only</option>
                        <option value={2}>Both faces</option>
                      </select>
                    </PropRow>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', marginTop: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={pierAtEnds} onChange={e => setPierAtEnds(e.target.checked)} style={{ width: 'auto' }} />
                    A pier at each end of the wall
                  </label>
                </>
              )}
            </CollapsibleSection>

            <PropRow label="Movement joint every (mm, 0 = none)">{numInput(movementJointSpacingMm, setMovementJointSpacingMm)}</PropRow>
            <PropRow label="Bed-joint reinforcement every (courses, 0 = none)">{numInput(reinforceEveryNCourses, setReinforceEveryNCourses)}</PropRow>
            <PropRow label={`Waste % (${wastePct}%)`}>
              <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>
            <PropRow label={`Profit % (${profitPct}%)`}>
              <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>

            <OpeningsEditor openings={openings} onAdd={addOpening} onUpdate={updateOpening} onRemove={removeOpening} />
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

// ── Plan view — the wall from above, with its piers, so where they fall (and on which face)
// is visible. Drawn to one scale, so the wall's thickness is realistic against its length.
// Visual only: none of it feeds the quantities in the breakdown.
function WallPlanSvg({ lengthMm, thicknessMm, openings, pierCount, pierWidthMm, pierProjectionMm, pierFaces, pierAtEnds }: {
  lengthMm: number
  thicknessMm: number
  openings: AssemblyOpening[]
  pierCount: number
  pierWidthMm: number
  pierProjectionMm: number
  pierFaces: 1 | 2
  pierAtEnds: boolean
}) {
  const vbW = 640, vbH = 120
  const k = Math.min(580 / lengthMm, 0.3)
  const w = lengthMm * k, t = thicknessMm * k
  const x0 = (vbW - w) / 2
  const yWall = 46
  const px = pierWidthMm * k, pp = pierProjectionMm * k
  const positions: number[] = []
  for (let i = 0; i < pierCount; i++) {
    const centre = pierAtEnds
      ? (pierCount > 1 ? (i * lengthMm) / (pierCount - 1) : lengthMm / 2)
      : ((i + 1) * lengthMm) / (pierCount + 1)
    positions.push(Math.max(0, Math.min(lengthMm - pierWidthMm, centre - pierWidthMm / 2)))
  }
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 104, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={x0} y={14} fontSize={9} fill="#94a3b8">Inside</text>
        <text x={x0} y={vbH - 6} fontSize={9} fill="#94a3b8">Outside</text>
        <rect x={x0} y={yWall} width={w} height={t} fill="#d1d5db" stroke="#64748b" strokeWidth={1} />
        {positions.map((p, i) => (
          <g key={i}>
            <rect x={x0 + p * k} y={yWall + t} width={px} height={pp} fill="#cbd5e1" stroke="#64748b" strokeWidth={1} />
            {pierFaces === 2 && <rect x={x0 + p * k} y={yWall - pp} width={px} height={pp} fill="#cbd5e1" stroke="#64748b" strokeWidth={1} />}
          </g>
        ))}
        {openings.map(o => (
          <rect key={o.id} x={x0 + o.offsetMm * k} y={yWall} width={o.widthMm * k} height={t} fill="#fffbeb" stroke="#4a90a4" strokeWidth={1} strokeDasharray="3 2" />
        ))}
        <text x={x0 + w + 6} y={yWall + t / 2 + 3} fontSize={9} fill="#64748b">{thicknessMm}mm</text>
      </svg>
    </div>
  )
}
