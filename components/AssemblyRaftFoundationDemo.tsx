'use client'

/**
 * Assembly Calculator — Raft foundation, drawn as a shape (Foundations → Raft Foundation); sized from the box the shape sits in.
 *
 * One reinforced concrete slab under the whole building: the bulk dig and the soil taken away, compacted hardcore, a sand blind, the DPM, optional
 * insulation under the slab and round its edge, the edge formwork, mesh on chairs, and the concrete (optionally pumped, optionally thickened into
 * an edge beam). The digging is a machine with its operator, priced in days; the concrete mix is chosen here. Counts and volumes only — the slab
 * thickness, mesh, edge beams and concrete strength are the engineer's design to confirm. The engine is lib/raft-foundation.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculateRaftFoundationGeometry, type RaftFoundationInput, type RaftFoundationGeometry } from '@/lib/raft-foundation'
import { describeRaftFoundation, describeRaftFoundationShort } from '@/lib/raft-foundation-description'
import { suggestRaftFoundationLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'

// Sample rates, like every calculator here — editable per line in the breakdown until Back Office products and plant replace them.
const MIXES = { C25: { label: 'C25', cost: 105 }, C30: { label: 'C30 (usual for a raft)', cost: 112 }, C35: { label: 'C35', cost: 120 } } as const
type Mix = keyof typeof MIXES
const EXCAVATOR_PER_DAY = 260   // a mini or midi excavator and its operator
const MUCKAWAY_PER_M3 = 28      // grab lorry and tip, per m³ of bulked soil
const PLATE_PER_DAY = 40
const PUMP_PER_VISIT = 450

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** The longer and the shorter side of the box the drawn shape sits in, in mm. Whenever they change they overwrite the calculator's own. */
  externalLengthMm?: number
  externalWidthMm?: number
}

function buildRaftLayers(g: RaftFoundationGeometry, o: {
  mix: Mix; wastePct: number; slabMm: number; underSlabMm: number; edgeInsulation: boolean; pumped: boolean; hasEdgeBeam: boolean
}): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }

  L.push(fixed({ id: 'excavator', name: 'Excavator with operator — stripping and digging the formation', category: 'plant', unit: 'day', unitCost: EXCAVATOR_PER_DAY, qty: g.excavatorDays }))
  L.push(fixed({ id: 'spoil', name: 'Spoil carted away (grab lorry and tip, soil bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: g.spoilAwayM3 }))
  L.push(fixed({ id: 'hardcore', name: `Hardcore (MOT Type 1), ${Math.round(g.hardcoreVolumeM3 / Math.max(g.areaM2, 0.0001) * 1000)}mm compacted`, category: 'materials', unit: 'tonne', unitCost: 28, wastePct: w, qty: g.hardcoreTonnes }))
  L.push(fixed({ id: 'plate', name: 'Compaction plate hire — compacting the hardcore', category: 'plant', unit: 'day', unitCost: PLATE_PER_DAY, qty: g.plateDays }))
  if (g.blindingTonnes > 0) L.push(fixed({ id: 'blinding', name: 'Sand blinding', category: 'materials', unit: 'tonne', unitCost: 32, wastePct: w, qty: g.blindingTonnes }))
  L.push(fixed({ id: 'dpm', name: 'DPM, 1200 gauge (laps and edge turn-ups in the waste)', category: 'materials', unit: 'm²', unitCost: 1.20, wastePct: Math.max(w, 10), qty: g.dpmAreaM2 }))
  if (o.underSlabMm > 0) L.push(fixed({ id: 'under_ins', name: `Insulation board ${o.underSlabMm}mm under the slab`, category: 'materials', unit: 'm²', unitCost: +(0.095 * o.underSlabMm).toFixed(2), wastePct: w, qty: g.underSlabInsulationM2 }))
  if (o.edgeInsulation) L.push(fixed({ id: 'edge_ins', name: 'EPS edge insulation 100mm round the slab edge', category: 'materials', unit: 'lm', unitCost: 6.50, wastePct: w, qty: g.edgeInsulationLm }))
  L.push(fixed({ id: 'formwork', name: 'Edge formwork (timber shutter, reused)', category: 'materials', unit: 'lm', unitCost: 7.50, qty: g.edgeFormworkLm }))
  if (g.meshLayers > 0) {
    L.push(fixed({ id: 'mesh', name: `A393 mesh, ${g.meshLayers} layer${g.meshLayers === 1 ? '' : 's'} (4.8 × 2.2m sheets, lapped)`, category: 'materials', unit: 'sheet', unitCost: 68, roundToWhole: true, wastePct: 5, qty: g.meshSheetsPerLayer * g.meshLayers }))
    L.push(fixed({ id: 'chairs', name: 'Mesh chairs and spacers', category: 'materials', unit: 'nr', unitCost: 0.18, roundToWhole: true, qty: g.chairCount }))
  }
  L.push(fixed({ id: 'concrete', name: `Ready-mixed concrete ${o.mix} (${o.slabMm}mm slab${o.hasEdgeBeam ? ' and edge beam' : ''})`, category: 'materials', unit: 'm³', unitCost: MIXES[o.mix].cost, wastePct: Math.max(w, 5), qty: g.concreteVolumeM3 }))
  if (o.pumped) L.push(fixed({ id: 'pump', name: 'Concrete pump hire', category: 'plant', unit: 'visit', unitCost: PUMP_PER_VISIT, qty: 1 }))
  return L
}

export default function AssemblyRaftFoundationDemo({ onClose, onSave, labourTrades = [], externalLengthMm, externalWidthMm }: Props) {
  const [name, setName]         = useState('Raft foundation')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 10000)
  const [widthMm, setWidthMm]   = useState(externalWidthMm ?? 8000)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  useEffect(() => { if (externalWidthMm != null) setWidthMm(externalWidthMm) }, [externalWidthMm])
  const [slabMm, setSlabMm]     = useState(200)
  const [hardcoreMm, setHardcoreMm] = useState(150)
  const [blindingMm, setBlindingMm] = useState(50)
  const [digOverride, setDigOverride] = useState<number | null>(null)
  const digDepthMm = digOverride ?? (slabMm + hardcoreMm + blindingMm)   // follows the layers until it is typed over
  const [overdigMm, setOverdigMm] = useState(300)
  const [mix, setMix]           = useState<Mix>('C30')
  const [meshLayers, setMeshLayers] = useState(2)
  const [edgeBeamOn, setEdgeBeamOn] = useState(false)
  const [edgeW, setEdgeW]       = useState(500)
  const [edgeD, setEdgeD]       = useState(400)
  const [underSlabMm, setUnderSlabMm] = useState(0)
  const [edgeInsulation, setEdgeInsulation] = useState(true)
  const [pumped, setPumped]     = useState(false)
  const [wastePct, setWastePct] = useState(10)
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const edgeBeam = edgeBeamOn ? { widthMm: edgeW, depthMm: edgeD } : null
  const input: RaftFoundationInput = { lengthMm, widthMm, slabThicknessMm: slabMm, hardcoreMm, blindingMm, digDepthMm, overdigMm, edgeBeam, underSlabInsulationMm: underSlabMm, meshLayers }
  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateRaftFoundationGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, widthMm, slabMm, hardcoreMm, blindingMm, digDepthMm, overdigMm, edgeBeamOn, edgeW, edgeD, underSlabMm, meshLayers])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildRaftLayers(g, { mix, wastePct, slabMm, underSlabMm, edgeInsulation, pumped, hasEdgeBeam: !!edgeBeam && g.edgeExtraVolumeM3 > 0 })
      .map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, mix, wastePct, slabMm, underSlabMm, edgeInsulation, pumped, edgeBeamOn, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour — suggested from the raft, following it until edited
  const labourSuggestions: LabourSuggestion[] = g ? suggestRaftFoundationLabour({
    areaM2: g.areaM2, perimeterLm: g.perimeterLm, concreteM3: g.concreteVolumeM3, meshLayers: g.meshLayers, underSlabInsulation: underSlabMm > 0,
  }) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useState<LabourLine[] | null>(null)
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

  // The customer's description follows the raft until it's edited by hand
  const descInput = g ? {
    lengthM: g.lengthM, widthM: g.widthM, slabThicknessMm: slabMm, hardcoreMm, blindingMm, concreteMix: mix, meshLayers: g.meshLayers,
    edgeBeam: edgeBeam && g.edgeExtraVolumeM3 > 0 ? edgeBeam : null, underSlabInsulationMm: underSlabMm, edgeInsulation, pumped,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describeRaftFoundationShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeRaftFoundation(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the raft</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the raft — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the raft</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint?: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8' }}>{hint}</span>}</span>
    </label>
  )

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
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))} style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
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
        <textarea value={detail} onChange={e => setDetailOverride(e.target.value)} rows={7} style={box} />
      </div>

      {/* An engine error is a banner above the controls, never instead of them: typing a value digit by digit passes through invalid ones. */}
      {!geometryResult.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {geometryResult.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <RaftSectionSvg slabMm={slabMm} hardcoreMm={hardcoreMm} blindingMm={blindingMm} digDepthMm={digDepthMm} edgeBeam={edgeBeam && g.edgeExtraVolumeM3 > 0 ? edgeBeam : null} underSlabMm={underSlabMm} edgeInsulation={edgeInsulation} meshLayers={g.meshLayers} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.lengthM.toFixed(2)} × {g.widthM.toFixed(2)}m = {g.areaM2.toFixed(1)} m², perimeter {g.perimeterLm.toFixed(1)}m. Dig {g.digVolumeM3.toFixed(1)} m³ (soil away {g.spoilAwayM3.toFixed(1)} m³ bulked, machine {g.excavatorDays} day{g.excavatorDays === 1 ? '' : 's'}).
              Hardcore {g.hardcoreVolumeM3.toFixed(1)} m³ ({g.hardcoreTonnes.toFixed(1)} t). Concrete {g.concreteVolumeM3.toFixed(1)} m³. Mesh {g.meshSheetsPerLayer.toFixed(1)} sheets a layer.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Length (mm) — drawn">{numInput(lengthMm, setLengthMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Width (mm) — drawn">{numInput(widthMm, setWidthMm, 1)}</PropRow></div>
          </div>

          <CollapsibleSection title="Slab and sub-base" borderColor="#bae6fd">
            <PropRow label="Slab thickness (mm)">{numInput(slabMm, setSlabMm, 1)}</PropRow>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Hardcore (mm)">{numInput(hardcoreMm, setHardcoreMm, 0)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Sand blinding (mm)">{numInput(blindingMm, setBlindingMm, 0)}</PropRow></div>
            </div>
            <PropRow label="Concrete mix">
              <select value={mix} onChange={e => setMix(e.target.value as Mix)} style={propInput}>
                {(Object.keys(MIXES) as Mix[]).map(k => <option key={k} value={k}>{MIXES[k].label}</option>)}
              </select>
            </PropRow>
            <PropRow label="Mesh layers">
              <select value={meshLayers} onChange={e => setMeshLayers(+e.target.value)} style={propInput}>
                <option value={2}>2 layers (top and bottom)</option><option value={1}>1 layer</option><option value={0}>None</option>
              </select>
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Digging" borderColor="#bae6fd">
            <PropRow label="Dig depth below existing ground (mm)">{numInput(digDepthMm, n => setDigOverride(n), 1)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>
              {digOverride === null ? 'Follows the slab, hardcore and blinding. Type over it if the slab sits above or below ground.' : <button onClick={() => setDigOverride(null)} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Set by you — follow the layers again</button>}
            </div>
            <PropRow label="Dig this far beyond the edge each side (mm)">{numInput(overdigMm, setOverdigMm, 0)}</PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Edge and insulation" borderColor="#bae6fd">
            {check('Edge insulation (EPS 100mm round the slab edge)', edgeInsulation, setEdgeInsulation)}
            <PropRow label="Insulation under the whole slab">
              <select value={underSlabMm} onChange={e => setUnderSlabMm(+e.target.value)} style={propInput}>
                <option value={0}>None</option><option value={75}>75mm</option><option value={100}>100mm</option><option value={150}>150mm</option>
              </select>
            </PropRow>
            {check('Thickened edge beam round the perimeter', edgeBeamOn, setEdgeBeamOn, 'Only if the engineer has designed one')}
            {edgeBeamOn && (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}><PropRow label="Beam width (mm)">{numInput(edgeW, setEdgeW, 1)}</PropRow></div>
                <div style={{ flex: 1 }}><PropRow label="Total depth (mm)">{numInput(edgeD, setEdgeD, 1)}</PropRow></div>
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title="Pouring" borderColor="#bae6fd">
            {check('Pump the concrete', pumped, setPumped, 'A pump visit is added to the price')}
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="raft"
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

// ── A section through the raft edge: ground, the dig, hardcore, blinding and DPM, the slab with its mesh, the edge beam and the edge insulation ──
function RaftSectionSvg({ slabMm, hardcoreMm, blindingMm, digDepthMm, edgeBeam, underSlabMm, edgeInsulation, meshLayers }: {
  slabMm: number; hardcoreMm: number; blindingMm: number; digDepthMm: number; edgeBeam: { widthMm: number; depthMm: number } | null; underSlabMm: number; edgeInsulation: boolean; meshLayers: number
}) {
  const vbW = 430, vbH = 300
  const edgeExtra = edgeBeam ? Math.max(0, edgeBeam.depthMm - slabMm) : 0
  const totalMm = Math.max(digDepthMm, slabMm + hardcoreMm + blindingMm) + edgeExtra + 80
  const k = Math.min(200 / totalMm, 0.6)
  const groundY = 70, left = 70, right = 400
  const slabTopY = groundY + Math.max(0, (digDepthMm - slabMm - hardcoreMm - blindingMm)) * k * 0   // slab top at ground when the dig equals the layers
  const slabH = Math.max(slabMm * k, 8), blindH = Math.max(blindingMm * k, 3), hardH = Math.max(hardcoreMm * k, 6)
  const insH = underSlabMm > 0 ? Math.max(underSlabMm * k, 4) : 0
  const edgeW = edgeBeam ? Math.max(edgeBeam.widthMm * k, 20) : 0
  const slabBottom = slabTopY + slabH
  const insBottom = slabBottom + insH
  const dpmY = insBottom
  const blindBottom = dpmY + blindH
  const hardBottom = blindBottom + hardH
  const edgeBottom = slabBottom + edgeExtra * k
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={groundY} width={vbW - 40} height={Math.max(hardBottom, edgeBottom) - groundY + 40} fill="#e7e5e4" />
      <line x1={20} x2={vbW - 20} y1={groundY} y2={groundY} stroke="#78716c" strokeWidth={1.5} />
      <text x={vbW - 24} y={groundY - 5} fontSize={9} fill="#78716c" textAnchor="end">Existing ground level</text>
      <rect x={left} y={blindBottom} width={right - left} height={hardH} fill="#a8a29e" stroke="#78716c" />
      <text x={(left + right) / 2 + 40} y={blindBottom + hardH / 2 + 3} fontSize={9} fill="#292524" textAnchor="middle">Hardcore {hardcoreMm}</text>
      <rect x={left} y={dpmY} width={right - left} height={blindH} fill="#fde68a" stroke="#ca8a04" />
      <text x={right - 6} y={dpmY + blindH + 10} fontSize={9} fill="#854d0e" textAnchor="end">Blinding {blindingMm} + DPM</text>
      <line x1={left} x2={right} y1={dpmY} y2={dpmY} stroke="#0f766e" strokeWidth={2} />
      {insH > 0 && <rect x={left} y={slabBottom} width={right - left} height={insH} fill="#bfdbfe" stroke="#60a5fa" />}
      {insH > 0 && <text x={right - 6} y={slabBottom + insH / 2 + 3} fontSize={9} fill="#1e40af" textAnchor="end">Insulation {underSlabMm}</text>}
      <rect x={left} y={slabTopY} width={right - left} height={slabH} fill="#d6d3d1" stroke="#57534e" strokeWidth={1.4} />
      {edgeBeam && <rect x={left} y={slabBottom} width={edgeW} height={edgeExtra * k} fill="#d6d3d1" stroke="#57534e" strokeWidth={1.4} />}
      {meshLayers >= 1 && <line x1={left + 6} x2={right - 6} y1={slabTopY + slabH * 0.3} y2={slabTopY + slabH * 0.3} stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="5 3" />}
      {meshLayers >= 2 && <line x1={left + 6} x2={right - 6} y1={slabTopY + slabH * 0.75} y2={slabTopY + slabH * 0.75} stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="5 3" />}
      <text x={(left + right) / 2} y={slabTopY + slabH / 2 + 3} fontSize={10} fill="#292524" textAnchor="middle">Concrete slab {slabMm}</text>
      {edgeInsulation && <rect x={left - 8} y={slabTopY} width={8} height={Math.max(edgeBottom, slabBottom + insH) - slabTopY} fill="#bfdbfe" stroke="#60a5fa" />}
      {edgeBeam && <text x={left + edgeW + 4} y={edgeBottom - 3} fontSize={9} fill="#57534e">Edge beam {edgeBeam.widthMm} × {edgeBeam.depthMm}</text>}
      <line x1={left - 40} x2={left - 40} y1={groundY} y2={hardBottom} stroke="#2563eb" />
      <text x={left - 46} y={(groundY + hardBottom) / 2 + 3} fontSize={10} fill="#2563eb" textAnchor="end">{digDepthMm}</text>
    </svg>
  )
}
