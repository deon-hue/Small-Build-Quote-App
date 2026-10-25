'use client'

/**
 * Assembly Calculator — Block and beam floor (Floors & Screeds → Block and Beam Floor), priced per m² from the floor's area.
 *
 * Precast prestressed beams at set centres spanning between the walls, concrete blocks laid between them and grouted, with insulation and a membrane on top. The span of the beams comes from the drawn shape
 * (the shorter side of a rectangle with the drawn area and perimeter) until it is typed over. The walls the beams bear on (sleeper walls and their vents) and the screed are priced elsewhere. The sums are in
 * lib/block-beam-floor.ts. Every rate is a sample, editable per line in the breakdown.
 */

import React, { useMemo, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateBlockBeamFloor, sidesFromAreaPerimeter, BEAM_PER_LM, BLOCK_EACH, GROUT_PER_M2, DPC_PER_LM, CRANE_PER_DAY, MEMBRANE_PER_M2, BEAM_CENTRES_MM, type BlockBeamGeometry,
} from '@/lib/block-beam-floor'
import { HARDCORE_PER_M3, HARDCORE_COMPACTION_WASTE_PCT, BLINDING_PER_M3, EDGE_STRIP_PER_LM, PLATE_PER_DAY, MUCKAWAY_PER_M3, INSULATION_THICKNESSES_MM, INSULATION_PER_M2 } from '@/lib/concrete-slab-floor'
import { describeBlockBeamFloor, describeBlockBeamFloorShort } from '@/lib/block-beam-floor-description'
import { suggestBlockBeamFloorLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
  /** The perimeter of the drawn floor, m (the edge strip, and the span of the beams). */
  externalPerimeterM?: number
  /** the span of the beams when a direction was chosen on the Take-off plan, mm */
  externalSpanMm?: number
}

function buildBlockBeamLayers(g: BlockBeamGeometry, o: { wastePct: number; hardcoreMm: number; blindingMm: number; diggerDays: number | null }): AssemblyLayerDef[] {
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
  if (g.dpcLm > 0) L.push(fixed({ id: 'dpc', name: 'DPC strip under the beam ends', category: 'materials', unit: 'lm', unitCost: DPC_PER_LM, wastePct: Math.max(w, 10), qty: g.dpcLm }))
  L.push(fixed({ id: 'beams', name: `Precast prestressed beams, ${g.beamCount + g.extraBeams} nr × ${g.beamLengthM.toFixed(2)}m (span plus bearings)`, category: 'materials', unit: 'lm', unitCost: BEAM_PER_LM, qty: g.beamLm }))
  L.push(fixed({ id: 'blocks', name: 'Dense concrete infill blocks, 440 × 215 × 100', category: 'materials', unit: 'nr', unitCost: BLOCK_EACH, roundToWhole: true, wastePct: Math.max(w, 5), qty: g.blockCount }))
  L.push(fixed({ id: 'grout', name: 'Sand and cement grout to the block joints', category: 'materials', unit: 'm²', unitCost: GROUT_PER_M2, qty: g.groutAreaM2 }))
  if (g.insulationAreaM2 > 0) L.push(fixed({ id: 'insulation', name: `${g.insulationMm}mm rigid insulation board over the blocks`, category: 'materials', unit: 'm²', unitCost: INSULATION_PER_M2[g.insulationMm] ?? +(0.25 * g.insulationMm).toFixed(2), wastePct: w, qty: g.insulationAreaM2 }))
  if (g.dpmAreaM2 > 0) L.push(fixed({ id: 'dpm', name: 'Damp-proof membrane, 1200 gauge (laps and edge turn-ups in the waste)', category: 'materials', unit: 'm²', unitCost: MEMBRANE_PER_M2, wastePct: Math.max(w, 10), qty: g.dpmAreaM2 }))
  if (g.edgeStripLm > 0) L.push(fixed({ id: 'edge-strip', name: 'Edge insulation strip round the floor', category: 'materials', unit: 'lm', unitCost: EDGE_STRIP_PER_LM, wastePct: 5, qty: g.edgeStripLm }))
  if (g.craneDays > 0) L.push(fixed({ id: 'crane', name: 'Lorry crane or telehandler with operator — lifting the beams in', category: 'plant', unit: 'day', unitCost: CRANE_PER_DAY, qty: g.craneDays }))
  return L
}

export default function AssemblyBlockBeamFloorDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM, externalSpanMm }: Props) {
  const ID = 'AssemblyBlockBeamFloorDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Block and beam floor')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [areaM2, setAreaM2] = useCalcState(ID, 'areaM2', externalAreaM2 && externalAreaM2 > 0 ? +externalAreaM2.toFixed(2) : 30)
  useEffect(() => { if (externalAreaM2 != null && externalAreaM2 > 0) setAreaM2(+externalAreaM2.toFixed(2)) }, [externalAreaM2])
  const [perimeterLm, setPerimeterLm] = useCalcState(ID, 'perimeterLm', externalPerimeterM && externalPerimeterM > 0 ? +externalPerimeterM.toFixed(2) : 22)
  useEffect(() => { if (externalPerimeterM != null && externalPerimeterM > 0) setPerimeterLm(+externalPerimeterM.toFixed(2)) }, [externalPerimeterM])
  // the beam span follows the shorter side of the drawn floor until it is typed over
  const [spanOverride, setSpanOverride] = useCalcState<number | null>(ID, 'spanOverride', null)
  useEffect(() => { if (externalSpanMm != null && externalSpanMm > 0) setSpanOverride(Math.round(externalSpanMm)) }, [externalSpanMm]) // eslint-disable-line react-hooks/exhaustive-deps
  const sides = useMemo(() => sidesFromAreaPerimeter(areaM2, perimeterLm), [areaM2, perimeterLm])
  const spanMm = spanOverride ?? Math.round(sides.short * 1000)
  const [centresMm, setCentresMm] = useCalcState(ID, 'centresMm', 520)
  const [extraBeams, setExtraBeams] = useCalcState(ID, 'extraBeams', 0)
  const [digDepthMm, setDigDepthMm] = useCalcState(ID, 'digDepthMm', 0)
  const [hardcoreMm, setHardcoreMm] = useCalcState(ID, 'hardcoreMm', 200)
  const [blindingMm, setBlindingMm] = useCalcState(ID, 'blindingMm', 50)
  const [insulationMm, setInsulationMm] = useCalcState(ID, 'insulationMm', 100)
  const [dpm, setDpm] = useCalcState(ID, 'dpm', true)
  const [edgeStrip, setEdgeStrip] = useCalcState(ID, 'edgeStrip', true)
  const [dpcAtBearings, setDpcAtBearings] = useCalcState(ID, 'dpcAtBearings', true)
  const [crane, setCrane] = useCalcState(ID, 'crane', true)
  const [diggerDays, setDiggerDays] = useCalcState<number | null>(ID, 'diggerDays', null)
  const [wastePct, setWastePct] = useCalcState(ID, 'wastePct', 10)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateBlockBeamFloor({ areaM2, perimeterLm, spanMm, centresMm, extraBeams, digDepthMm, hardcoreMm, blindingMm, insulationMm, dpm, edgeStrip, dpcAtBearings, crane }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [areaM2, perimeterLm, spanMm, centresMm, extraBeams, digDepthMm, hardcoreMm, blindingMm, insulationMm, dpm, edgeStrip, dpcAtBearings, crane])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildBlockBeamLayers(g, { wastePct, hardcoreMm, blindingMm, diggerDays }).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, wastePct, hardcoreMm, blindingMm, diggerDays, rateOverrides])
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
  const labourSuggestions: LabourSuggestion[] = g ? suggestBlockBeamFloorLabour({
    areaM2: g.areaM2, beamNr: g.beamCount + g.extraBeams, blockNr: g.blockCount, groutAreaM2: g.groutAreaM2, dpcLm: g.dpcLm, hardcoreM3: g.hardcoreM3, blindingM3: g.blindingM3,
    insulationAreaM2: g.insulationAreaM2, dpmAreaM2: g.dpmAreaM2, edgeStripLm: g.edgeStripLm,
  }) : []
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
    areaM2: g.areaM2, spanM: g.spanM, beamCount: g.beamCount, extraBeams: g.extraBeams, centresMm, digDepthMm, hardcoreMm, blindingMm, insulationMm: g.insulationMm,
    dpm: g.dpmAreaM2 > 0, edgeStrip: g.edgeStripLm > 0, dpcAtBearings: g.dpcLm > 0, crane: g.craneDays > 0,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeBlockBeamFloorShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeBlockBeamFloor(descInput) : '')

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
            <BlockBeamSectionSvg hardcoreMm={hardcoreMm} blindingMm={blindingMm} insulationMm={g.insulationMm} dpm={g.dpmAreaM2 > 0} edgeStrip={g.edgeStripLm > 0} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.areaM2.toFixed(1)} m², perimeter {g.perimeterLm.toFixed(1)}m: beams span {g.spanM.toFixed(2)}m, the floor is {g.widthM.toFixed(2)}m across them.
              {' '}{g.beamCount + g.extraBeams} beams of {g.beamLengthM.toFixed(2)}m ({g.beamLm.toFixed(1)}lm), {g.blockCount} blocks.
              {g.digVolumeM3 > 0 && <> Dig {g.digVolumeM3.toFixed(1)} m³ (machine {g.excavatorDays} day{g.excavatorDays === 1 ? '' : 's'}).</>}
              {' '}The walls and sleeper walls the beams bear on, and the screed on top, are priced separately.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Floor area (m²) — from the drawing">{numInput(areaM2, setAreaM2, 0, 0.5)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Perimeter (m)">{numInput(perimeterLm, setPerimeterLm, 0, 0.5)}</PropRow></div>
          </div>

          <CollapsibleSection title="Beams and blocks" borderColor="#bae6fd">
            <PropRow label="Beam span between the walls (mm)">{numInput(spanMm, n => setSpanOverride(n), 1, 50)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>
              {spanOverride === null ? `Follows the shorter side of the drawn floor (${sides.short.toFixed(2)}m × ${sides.long.toFixed(2)}m). Type over it if the beams run the other way or the floor is not a rectangle.`
                : <button onClick={() => setSpanOverride(null)} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Set by you — follow the drawn shape again</button>}
            </div>
            <PropRow label="Beam centres (mm)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 90 }}>{numInput(centresMm, setCentresMm, 1, 10)}</div>
                {BEAM_CENTRES_MM.map(t => (
                  <button key={t} onClick={() => setCentresMm(t)}
                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: '1px solid #bae6fd', background: centresMm === t ? '#0369a1' : '#fff', color: centresMm === t ? '#fff' : '#0369a1', cursor: 'pointer' }}>{t}</button>
                ))}
              </div>
            </PropRow>
            <PropRow label="Extra beams under walls (nr)">{numInput(extraBeams, n => setExtraBeams(Math.round(n)), 0, 1)}</PropRow>
            {check('DPC under the beam ends', dpcAtBearings, setDpcAtBearings, 'A strip where the beams bear on the walls')}
            {check('Lorry crane to lift the beams in', crane, setCrane, 'A crane or telehandler hired for the day the beams go in')}
          </CollapsibleSection>

          <CollapsibleSection title="Ground under the floor" borderColor="#bae6fd">
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Hardcore (mm)">{numInput(hardcoreMm, setHardcoreMm, 0, 25)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Sand blinding (mm)">{numInput(blindingMm, setBlindingMm, 0, 5)}</PropRow></div>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>Set both to 0 if the ground under the void is left as it is.</div>
          </CollapsibleSection>

          <CollapsibleSection title="Insulation and membrane" borderColor="#bae6fd">
            <PropRow label="Insulation over the blocks">
              <select value={insulationMm} onChange={e => setInsulationMm(+e.target.value)} style={propInput}>
                {INSULATION_THICKNESSES_MM.map(t => <option key={t} value={t}>{t === 0 ? 'None' : `${t}mm`}</option>)}
              </select>
            </PropRow>
            {check('Damp-proof membrane', dpm, setDpm, 'Lapped and taped, over the insulation')}
            {check('Edge insulation strip', edgeStrip, setEdgeStrip, 'Round the edges of the floor, against the walls')}
          </CollapsibleSection>

          <CollapsibleSection title="Digging out" borderColor="#bae6fd">
            <PropRow label="Dig depth below existing ground (mm)">{numInput(digDepthMm, setDigDepthMm, 0, 25)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>0 = no digging priced. Otherwise a machine and the soil taken away are added.</div>
          </CollapsibleSection>

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

// ── A section across the beams: walls at each side, the ground and hardcore, the void, the beams with blocks between, then insulation and membrane ──
function BlockBeamSectionSvg({ hardcoreMm, blindingMm, insulationMm, dpm, edgeStrip }: { hardcoreMm: number; blindingMm: number; insulationMm: number; dpm: boolean; edgeStrip: boolean }) {
  const vbW = 430, vbH = 230
  const x0 = 60, x1 = vbW - 50
  const bottom = vbH - 18
  const ground = 14
  const hHard = hardcoreMm > 0 ? Math.max(hardcoreMm * 0.12, 6) : 0
  const hBlind = blindingMm > 0 ? Math.max(blindingMm * 0.12, 3) : 0
  const voidH = 50
  const beamH = 22, blockH = 18
  const hIns = insulationMm > 0 ? Math.max(insulationMm * 0.18, 5) : 0
  const groundTop = bottom - ground
  const hardTop = groundTop - hHard
  const blindTop = hardTop - hBlind
  const voidTop = blindTop - voidH
  const beamTop = voidTop - beamH
  const blockTop = beamTop - 0
  const insTop = beamTop - blockH + 6 - hIns
  const beamW = 14, flange = 34
  const n = 5
  const gap = (x1 - x0 - 2 * 8) / n
  const beams = Array.from({ length: n + 1 }).map((_, i) => x0 + 8 + i * gap)
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 230, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={beamTop - 28} width={x0 - 20} height={bottom - beamTop + 28 - ground} fill="#d6d3d1" stroke="#57534e" />
      <rect x={x1} y={beamTop - 28} width={30} height={bottom - beamTop + 28 - ground} fill="#d6d3d1" stroke="#57534e" />
      <text x={40} y={beamTop - 34} fontSize={9} fill="#57534e" textAnchor="middle">Wall</text>
      <rect x={x0} y={groundTop} width={x1 - x0} height={ground} fill="#a8a29e" stroke="#78716c" />
      {hHard > 0 && <rect x={x0} y={hardTop} width={x1 - x0} height={hHard} fill="#d6d3d1" stroke="#78716c" />}
      {hBlind > 0 && <rect x={x0} y={blindTop} width={x1 - x0} height={hBlind} fill="#f5e6b8" stroke="#78716c" />}
      <text x={(x0 + x1) / 2} y={voidTop + voidH / 2 + 3} fontSize={10} fill="#94a3b8" textAnchor="middle">Ventilated void</text>
      {/* the blocks sit between the beams, resting on the beam flanges */}
      <rect x={x0} y={beamTop - blockH + 6} width={x1 - x0} height={blockH} fill="#cbd5e1" stroke="#64748b" />
      {beams.map((bx, i) => (
        <g key={i}>
          <rect x={bx - beamW / 2} y={beamTop} width={beamW} height={beamH} fill="#94a3b8" stroke="#334155" />
          <rect x={bx - flange / 2} y={beamTop + beamH - 6} width={flange} height={6} fill="#94a3b8" stroke="#334155" />
        </g>
      ))}
      {hIns > 0 && <rect x={x0} y={insTop} width={x1 - x0} height={hIns} fill="#fde68a" stroke="#a16207" />}
      {dpm && <line x1={x0} x2={x1} y1={insTop - 1} y2={insTop - 1} stroke="#2563eb" strokeWidth={2} />}
      {edgeStrip && <rect x={x0 - 4} y={insTop - 6} width={4} height={hIns + blockH + 6} fill="#f59e0b" />}
      <text x={(x0 + x1) / 2} y={beamTop - blockH + 6 + blockH / 2 + 3} fontSize={10} fill="#334155" textAnchor="middle">Blocks between the beams</text>
      <text x={(x0 + x1) / 2} y={beamTop + beamH / 2 + 3} fontSize={9} fill="#f8fafc" textAnchor="middle">beams</text>
      {hIns > 0 && <text x={(x0 + x1) / 2} y={insTop + hIns / 2 + 3} fontSize={10} fill="#78350f" textAnchor="middle">Insulation {insulationMm}</text>}
    </svg>
  )
}
