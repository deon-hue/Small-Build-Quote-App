'use client'

/**
 * Assembly Calculator — Concrete slab floor (Floors & Screeds → Concrete Slab Floor), priced per m² from the floor's area.
 *
 * A ground-bearing slab built up in layers: the dig (optional), compacted hardcore, sand blinding, the membrane, insulation under the slab, mesh on spacers, the edge strip and the ready-mixed concrete
 * (placed by lorry, pump or barrow), power-floated if wanted. A screed on top is the Screeded Floor calculator's job. The sums are in lib/concrete-slab-floor.ts. Every rate is a sample, editable per line in the breakdown.
 */

import React, { useMemo, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import ConcretePlacingSection from '@/components/ConcretePlacingSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { planConcretePlacing, placingLayers, placingLabour, type PlacingMethod } from '@/lib/concrete-placing'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateConcreteSlabFloor, SLAB_MIXES, HARDCORE_PER_M3, HARDCORE_COMPACTION_WASTE_PCT, BLINDING_PER_M3, DPM_PER_M2, MESH_PER_M2, SPACERS_PER_M2, EDGE_STRIP_PER_LM,
  PLATE_PER_DAY, POWER_FLOAT_PER_DAY, MUCKAWAY_PER_M3, INSULATION_THICKNESSES_MM, INSULATION_PER_M2, type SlabMix, type ConcreteSlabGeometry,
} from '@/lib/concrete-slab-floor'
import { describeConcreteSlabFloor, describeConcreteSlabFloorShort } from '@/lib/concrete-slab-floor-description'
import { suggestConcreteSlabFloorLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** The area of the floor drawn in Take-off, m². Whenever it changes it overwrites the calculator's own. */
  externalAreaM2?: number
  /** The perimeter of the drawn floor, m (the edge strip). */
  externalPerimeterM?: number
}

function buildSlabLayers(g: ConcreteSlabGeometry, o: {
  wastePct: number; mix: SlabMix; hardcoreMm: number; blindingMm: number; pumpPlan: ReturnType<typeof planConcretePlacing>; diggerDays: number | null
}): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }
  if (g.digVolumeM3 > 0) {
    L.push(...diggerLayers(planDigger(g.excavatorDays, o.diggerDays), 'digging out the floor', 'Excavator with operator'))
    L.push(fixed({ id: 'spoil', name: 'Spoil carted away (grab lorry and tip, soil bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: g.spoilAwayM3 }))
  }
  if (g.hardcoreM3 > 0) {
    L.push(fixed({ id: 'hardcore', name: `Hardcore (MOT Type 1), ${o.hardcoreMm}mm compacted`, category: 'materials', unit: 'm³', unitCost: HARDCORE_PER_M3, wastePct: Math.max(w, HARDCORE_COMPACTION_WASTE_PCT), qty: g.hardcoreM3 }))
    L.push(fixed({ id: 'plate', name: 'Compaction plate hire — compacting the hardcore', category: 'plant', unit: 'day', unitCost: PLATE_PER_DAY, qty: g.plateDays }))
  }
  if (g.blindingM3 > 0) L.push(fixed({ id: 'blinding', name: `Sand blinding, ${o.blindingMm}mm`, category: 'materials', unit: 'm³', unitCost: BLINDING_PER_M3, wastePct: w, qty: g.blindingM3 }))
  if (g.dpmAreaM2 > 0) L.push(fixed({ id: 'dpm', name: 'Damp-proof membrane, 1200 gauge (laps and edge turn-ups in the waste)', category: 'materials', unit: 'm²', unitCost: DPM_PER_M2, wastePct: Math.max(w, 10), qty: g.dpmAreaM2 }))
  if (g.insulationAreaM2 > 0) L.push(fixed({ id: 'insulation', name: `${g.insulationMm}mm rigid insulation board under the slab`, category: 'materials', unit: 'm²', unitCost: INSULATION_PER_M2[g.insulationMm] ?? +(0.25 * g.insulationMm).toFixed(2), wastePct: w, qty: g.insulationAreaM2 }))
  if (g.edgeStripLm > 0) L.push(fixed({ id: 'edge-strip', name: 'Edge insulation strip round the slab', category: 'materials', unit: 'lm', unitCost: EDGE_STRIP_PER_LM, wastePct: 5, qty: g.edgeStripLm }))
  if (g.meshAreaM2 > 0) {
    L.push(fixed({ id: 'mesh', name: `A142 mesh, ${g.meshLayers} layer${g.meshLayers === 1 ? '' : 's'} (lapped)`, category: 'materials', unit: 'm²', unitCost: MESH_PER_M2, wastePct: Math.max(w, 10), qty: g.meshAreaM2 }))
    L.push(fixed({ id: 'spacers', name: 'Mesh spacers and chairs', category: 'materials', unit: 'm²', unitCost: SPACERS_PER_M2, qty: g.areaM2 }))
  }
  L.push(fixed({ id: 'concrete', name: `Ready-mixed concrete ${o.mix}, ${g.slabMm}mm slab`, category: 'materials', unit: 'm³', unitCost: SLAB_MIXES[o.mix].perM3, wastePct: Math.max(w, 5), qty: g.concreteM3 }))
  L.push(...placingLayers(o.pumpPlan))
  if (g.powerFloatDays > 0) L.push(fixed({ id: 'power-float', name: 'Power float hire — finishing the slab', category: 'plant', unit: 'day', unitCost: POWER_FLOAT_PER_DAY, qty: g.powerFloatDays }))
  return L
}

export default function AssemblyConcreteSlabFloorDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM }: Props) {
  const ID = 'AssemblyConcreteSlabFloorDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Concrete slab floor')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [areaM2, setAreaM2] = useCalcState(ID, 'areaM2', externalAreaM2 && externalAreaM2 > 0 ? +externalAreaM2.toFixed(2) : 30)
  useEffect(() => { if (externalAreaM2 != null && externalAreaM2 > 0) setAreaM2(+externalAreaM2.toFixed(2)) }, [externalAreaM2])
  const [perimeterLm, setPerimeterLm] = useCalcState(ID, 'perimeterLm', externalPerimeterM && externalPerimeterM > 0 ? +externalPerimeterM.toFixed(2) : 22)
  useEffect(() => { if (externalPerimeterM != null && externalPerimeterM > 0) setPerimeterLm(+externalPerimeterM.toFixed(2)) }, [externalPerimeterM])
  const [digDepthMm, setDigDepthMm] = useCalcState(ID, 'digDepthMm', 0)
  const [hardcoreMm, setHardcoreMm] = useCalcState(ID, 'hardcoreMm', 150)
  const [blindingMm, setBlindingMm] = useCalcState(ID, 'blindingMm', 50)
  const [dpm, setDpm] = useCalcState(ID, 'dpm', true)
  const [insulationMm, setInsulationMm] = useCalcState(ID, 'insulationMm', 100)
  const [slabMm, setSlabMm] = useCalcState(ID, 'slabMm', 150)
  const [mix, setMix] = useCalcState<SlabMix>(ID, 'mix', 'C25')
  const [meshLayers, setMeshLayers] = useCalcState(ID, 'meshLayers', 1)
  const [edgeStrip, setEdgeStrip] = useCalcState(ID, 'edgeStrip', true)
  const [powerFloat, setPowerFloat] = useCalcState(ID, 'powerFloat', false)
  const [placingMethod, setPlacingMethod] = useCalcState<PlacingMethod>(ID, 'placingMethod', 'direct')
  const [placingDistanceM, setPlacingDistanceM] = useCalcState(ID, 'placingDistanceM', 25)
  const [placingMen, setPlacingMen] = useCalcState(ID, 'placingMen', 2)
  const [diggerDays, setDiggerDays] = useCalcState<number | null>(ID, 'diggerDays', null)
  const [wastePct, setWastePct] = useCalcState(ID, 'wastePct', 10)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateConcreteSlabFloor({ areaM2, perimeterLm, digDepthMm, hardcoreMm, blindingMm, dpm, insulationMm, slabMm, mix, meshLayers, edgeStrip, powerFloat }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [areaM2, perimeterLm, digDepthMm, hardcoreMm, blindingMm, dpm, insulationMm, slabMm, mix, meshLayers, edgeStrip, powerFloat])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const placingVolumeM3 = g ? g.concreteM3 : 0
  const placing = useMemo(() => planConcretePlacing({ method: placingMethod, volumeM3: placingVolumeM3, distanceM: placingDistanceM, men: placingMen }), [placingMethod, placingVolumeM3, placingDistanceM, placingMen])

  const layers = useMemo(() => {
    if (!g) return []
    return buildSlabLayers(g, { wastePct, mix, hardcoreMm, blindingMm, pumpPlan: placing, diggerDays }).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, wastePct, mix, hardcoreMm, blindingMm, placing, diggerDays, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(ID, 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour, suggested from the floor and following it until edited
  const barrowing = placingLabour(placing)
  const labourSuggestions: LabourSuggestion[] = g ? [...suggestConcreteSlabFloorLabour({
    areaM2: g.areaM2, hardcoreM3: g.hardcoreM3, blindingM3: g.blindingM3, dpmAreaM2: g.dpmAreaM2, insulationAreaM2: g.insulationAreaM2, meshAreaM2: g.meshAreaM2,
    edgeStripLm: g.edgeStripLm, concreteM3: g.concreteM3, powerFloatAreaM2: g.powerFloatAreaM2,
  }), ...(barrowing ? [barrowing] : [])] : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useCalcState<LabourLine[] | null>(ID, 'labourOverride', null)
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

  // The customer's description follows the floor until it's edited by hand
  const descInput = g ? {
    areaM2: g.areaM2, digDepthMm, hardcoreMm, blindingMm, dpm: g.dpmAreaM2 > 0, insulationMm: g.insulationMm, slabMm, mix, meshLayers: g.meshLayers, edgeStrip: g.edgeStripLm > 0,
    powerFloat: g.powerFloatDays > 0, placing: placingMethod,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeConcreteSlabFloorShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeConcreteSlabFloor(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step?: number) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the floor</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the floor — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}<span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{hint}</span></span>
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
            <SlabSectionSvg hardcoreMm={hardcoreMm} blindingMm={blindingMm} dpm={g.dpmAreaM2 > 0} insulationMm={g.insulationMm} slabMm={slabMm} meshLayers={g.meshLayers} edgeStrip={g.edgeStripLm > 0} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.areaM2.toFixed(1)} m², perimeter {g.perimeterLm.toFixed(1)}m.
              {g.digVolumeM3 > 0 && <> Dig {g.digVolumeM3.toFixed(1)} m³ (soil away {g.spoilAwayM3.toFixed(1)} m³ bulked, machine {g.excavatorDays} day{g.excavatorDays === 1 ? '' : 's'}).</>}
              {g.hardcoreM3 > 0 && <> Hardcore {g.hardcoreM3.toFixed(1)} m³.</>} Concrete {g.concreteM3.toFixed(1)} m³ ({slabMm}mm).
              {' '}The screed on top, if any, is priced with the Screeded Floor calculator.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Floor area (m²) — from the drawing">{numInput(areaM2, setAreaM2, 0, 0.5)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Perimeter (m)">{numInput(perimeterLm, setPerimeterLm, 0, 0.5)}</PropRow></div>
          </div>

          <CollapsibleSection title="The slab" borderColor="#bae6fd">
            <PropRow label="Slab thickness (mm)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 90 }}>{numInput(slabMm, setSlabMm, 1, 5)}</div>
                {[100, 125, 150].map(t => (
                  <button key={t} onClick={() => setSlabMm(t)}
                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: '1px solid #bae6fd', background: slabMm === t ? '#0369a1' : '#fff', color: slabMm === t ? '#fff' : '#0369a1', cursor: 'pointer' }}>{t}</button>
                ))}
              </div>
            </PropRow>
            <PropRow label="Concrete mix">
              <select value={mix} onChange={e => setMix(e.target.value as SlabMix)} style={propInput}>
                {(Object.keys(SLAB_MIXES) as SlabMix[]).map(k => <option key={k} value={k}>{SLAB_MIXES[k].label}</option>)}
              </select>
            </PropRow>
            <PropRow label="Reinforcing mesh">
              <select value={meshLayers} onChange={e => setMeshLayers(+e.target.value)} style={propInput}>
                <option value={0}>None</option><option value={1}>1 layer (A142)</option><option value={2}>2 layers (A142)</option>
              </select>
            </PropRow>
            {check('Power-float the surface', powerFloat, setPowerFloat, 'A power float hired in; for a surface left as the finished floor')}
          </CollapsibleSection>

          <CollapsibleSection title="Sub-base and membrane" borderColor="#bae6fd">
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Hardcore (mm)">{numInput(hardcoreMm, setHardcoreMm, 0, 25)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Sand blinding (mm)">{numInput(blindingMm, setBlindingMm, 0, 5)}</PropRow></div>
            </div>
            {check('Damp-proof membrane', dpm, setDpm, 'Lapped and taped, over the blinding')}
            <PropRow label="Insulation under the slab">
              <select value={insulationMm} onChange={e => setInsulationMm(+e.target.value)} style={propInput}>
                {INSULATION_THICKNESSES_MM.map(t => <option key={t} value={t}>{t === 0 ? 'None' : `${t}mm`}</option>)}
              </select>
            </PropRow>
            {check('Edge insulation strip', edgeStrip, setEdgeStrip, 'Round the edges of the slab, against the walls')}
          </CollapsibleSection>

          <CollapsibleSection title="Digging out" borderColor="#bae6fd">
            <PropRow label="Dig depth below existing ground (mm)">{numInput(digDepthMm, setDigDepthMm, 0, 25)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>0 = no digging priced (the ground is already down to level). Otherwise a machine and the soil taken away are added.</div>
          </CollapsibleSection>

          <ConcretePlacingSection method={placingMethod} onMethod={setPlacingMethod} distanceM={placingDistanceM} onDistance={setPlacingDistanceM} men={placingMen} onMen={setPlacingMen} plan={placing} volumeM3={placingVolumeM3} />

          {g && g.digVolumeM3 > 0 && <DiggerOnSiteSection diggingDays={g.excavatorDays} daysOnSite={diggerDays} onDaysOnSite={setDiggerDays} />}

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="floor"
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

// ── A section through the floor: the ground, hardcore, blinding, membrane, insulation, then the slab with its mesh and the edge strip against the wall ──
function SlabSectionSvg({ hardcoreMm, blindingMm, dpm, insulationMm, slabMm, meshLayers, edgeStrip }: { hardcoreMm: number; blindingMm: number; dpm: boolean; insulationMm: number; slabMm: number; meshLayers: number; edgeStrip: boolean }) {
  const vbW = 430, vbH = 230
  const x0 = 60, x1 = vbW - 50
  const scale = 0.28
  const h = (mm: number, min: number) => (mm > 0 ? Math.max(mm * scale, min) : 0)
  const hHard = h(hardcoreMm, 8), hBlind = h(blindingMm, 4), hIns = h(insulationMm, 6), hSlab = h(slabMm, 14)
  const dpmH = dpm ? 2 : 0
  const ground = 24
  const bottom = vbH - 20
  const groundTop = bottom - ground
  const hardTop = groundTop - hHard
  const blindTop = hardTop - hBlind
  const dpmTop = blindTop - dpmH
  const insTop = dpmTop - hIns
  const slabTop = insTop - hSlab
  const rows: { y: number; h: number; fill: string; label: string }[] = []
  rows.push({ y: groundTop, h: ground, fill: '#a8a29e', label: 'Ground' })
  if (hHard) rows.push({ y: hardTop, h: hHard, fill: '#d6d3d1', label: `Hardcore ${hardcoreMm}` })
  if (hBlind) rows.push({ y: blindTop, h: hBlind, fill: '#f5e6b8', label: `Blinding ${blindingMm}` })
  if (dpmH) rows.push({ y: dpmTop, h: dpmH, fill: '#2563eb', label: '' })
  if (hIns) rows.push({ y: insTop, h: hIns, fill: '#fde68a', label: `Insulation ${insulationMm}` })
  rows.push({ y: slabTop, h: hSlab, fill: '#cbd5e1', label: `Concrete slab ${slabMm}` })
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 230, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={slabTop - 30} width={x0 - 20} height={bottom - slabTop - ground + 30} fill="#d6d3d1" stroke="#57534e" />
      <text x={40} y={slabTop - 36} fontSize={9} fill="#57534e" textAnchor="middle">Wall</text>
      {rows.map((r, i) => (
        <g key={i}>
          <rect x={x0} y={r.y} width={x1 - x0} height={r.h} fill={r.fill} stroke="#78716c" />
          {r.label && r.h >= 10 && <text x={(x0 + x1) / 2} y={r.y + r.h / 2 + 3} fontSize={10} fill="#292524" textAnchor="middle">{r.label}</text>}
        </g>
      ))}
      {meshLayers > 0 && Array.from({ length: meshLayers }).map((_, i) => {
        const y = meshLayers === 1 ? slabTop + hSlab * 0.8 : slabTop + hSlab * (i === 0 ? 0.25 : 0.75)
        return <line key={i} x1={x0 + 6} x2={x1 - 6} y1={y} y2={y} stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="4 3" />
      })}
      {edgeStrip && <rect x={x0 - 4} y={slabTop} width={4} height={hSlab + hIns} fill="#f59e0b" />}
      <line x1={x1 + 14} x2={x1 + 14} y1={slabTop} y2={slabTop + hSlab} stroke="#2563eb" />
      <text x={x1 + 18} y={slabTop + hSlab / 2 + 3} fontSize={10} fill="#2563eb">{slabMm}</text>
    </svg>
  )
}
