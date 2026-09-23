'use client'

/**
 * Assembly Calculator — Hip roof structure (Roof → Roof Structure → "Pitched roof — hipped"). All four
 * sides slope down to the eaves — no gable end walls. Common rafters along the ridge zone on the two long
 * sides, four hip rafters running diagonally from each corner up to a ridge end (or a single apex, for a
 * pyramid hip, when the span is at least as long as the building), and jack rafters filling each hip
 * triangle. Sized like every Roof-phase calculator from the drawn shape's bounding box, with the
 * ridge-direction length along one side and the overall span (eaves wall to eaves wall) along the other —
 * set which is which if the roof was drawn the other way round with the Swap button. The rafter section is
 * checked against the flat roof's own span chart (lib/flat-roof-joist-spans.ts), using this roof's true,
 * sloped common-rafter length as the span — the same span-chart module every flat, mono-pitch and gable
 * rafter already uses. See lib/hip-roof.ts for the geometry.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import { calculateHipRoofGeometry, type HipRoofGeometry } from '@/lib/hip-roof'
import { describeHipRoof, describeHipRoofShort } from '@/lib/hip-roof-description'
import { suggestHipRoofLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import {
  checkFlatRoofJoist, flatRoofSpanChart, DEFAULT_JOIST_SPAN_LOADS, SPAN_CHART_CENTRES_MM,
  type JoistSpanLoads, type SolidJoistGrade,
} from '@/lib/flat-roof-joist-spans'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
  externalWidthMm?: number
}

// Its own copy of rafter/timber pricing — every calculator screen here prices its own timber (see
// lib/rooflight-description.ts for why lib modules don't import each other's runtime code; screens keep the
// same self-contained habit for their sample rates).
const TIMBER_DEPTHS_MM = [100, 125, 150, 175, 200, 225, 250] as const
const C16_PER_LM: Record<number, number> = { 100: 1.90, 125: 2.40, 150: 2.95, 175: 3.55, 200: 4.20, 225: 4.85, 250: 5.60 }
const C24_FACTOR = 1.10
function timberRate(grade: SolidJoistGrade, depthMm: number): number {
  const c16 = C16_PER_LM[depthMm] ?? C16_PER_LM[175]
  return +(grade === 'c24' ? c16 * C24_FACTOR : c16).toFixed(2)
}

export default function AssemblyHipRoofDemo({ onClose, onSave, labourTrades = [], externalLengthMm, externalWidthMm }: Props) {
  const [name, setName]         = useState('Hip Roof Structure')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 10000)
  const [spanMm, setSpanMm]     = useState(externalWidthMm ?? 6000)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  useEffect(() => { if (externalWidthMm != null) setSpanMm(externalWidthMm) }, [externalWidthMm])
  function swapLengthSpan() { setLengthMm(spanMm); setSpanMm(lengthMm) }

  const [pitchDeg, setPitchDeg] = useState(30)
  const [rafterCentresMm, setRafterCentresMm] = useState(400)
  const [eavesOverhangMm, setEavesOverhangMm] = useState(300)

  const [rafterGrade, setRafterGrade] = useState<SolidJoistGrade>('c24')
  const [rafterDepthMm, setRafterDepthMm] = useState(150)
  const [spanLoads, setSpanLoads] = useState<JoistSpanLoads>(DEFAULT_JOIST_SPAN_LOADS)
  const [depthPicked, setDepthPicked] = useState(false)

  const [ceilingJoistDepthMm, setCeilingJoistDepthMm] = useState(100)

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateHipRoofGeometry({ lengthMm, spanMm, pitchDeg, rafterCentresMm, eavesOverhangMm }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [lengthMm, spanMm, pitchDeg, rafterCentresMm, eavesOverhangMm])
  const g: HipRoofGeometry | null = geometryResult.ok ? geometryResult.geometry : null

  const spanChart = useMemo(() => flatRoofSpanChart(rafterGrade, spanLoads), [rafterGrade, spanLoads])
  const rafterCheck = useMemo(
    () => checkFlatRoofJoist({ grade: rafterGrade, depthMm: rafterDepthMm, centresMm: rafterCentresMm, spanMm: g?.commonRafterRunMm ?? 0, loads: spanLoads }),
    [rafterGrade, rafterDepthMm, rafterCentresMm, g, spanLoads],
  )
  useEffect(() => {
    if (!depthPicked && rafterCheck.suggestedDepthMm != null) setRafterDepthMm(rafterCheck.suggestedDepthMm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rafterCheck.suggestedDepthMm, depthPicked])

  const rafterSectionLabel = `47×${rafterDepthMm} ${rafterGrade.toUpperCase()}`
  const rafterRate = timberRate(rafterGrade, rafterDepthMm)
  const hipDepthMm = TIMBER_DEPTHS_MM.find(d => d >= rafterDepthMm) ?? 250
  const hipRate = timberRate('c24', hipDepthMm)
  const ridgeRate = timberRate('c24', hipDepthMm)
  const ceilingJoistRate = timberRate('c16', ceilingJoistDepthMm)

  const [wastePct, setWastePct] = useState(5)
  const [profitPct, setProfitPct] = useState(20)
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const layers: AssemblyLayerDef[] = useMemo(() => {
    if (!g) return []
    const out: AssemblyLayerDef[] = []
    if (g.commonRafterLm > 0) out.push({ id: 'common_rafters', name: `${rafterSectionLabel} common rafters`, category: 'materials', source: 'fixed', fixedQty: g.commonRafterLm, unit: 'lm', unitCost: rafterRate, wastePct })
    out.push({ id: 'hip_rafters', name: `Hip rafters 47×${hipDepthMm} C24`, category: 'materials', source: 'fixed', fixedQty: g.hipRafterLm, unit: 'lm', unitCost: hipRate, wastePct })
    if (g.jackRafterLm > 0) out.push({ id: 'jack_rafters', name: `${rafterSectionLabel} jack rafters`, category: 'materials', source: 'fixed', fixedQty: g.jackRafterLm, unit: 'lm', unitCost: rafterRate, wastePct })
    if (g.ridgeLm > 0) out.push({ id: 'ridge', name: `Ridge board 47×${hipDepthMm} C24`, category: 'materials', source: 'fixed', fixedQty: g.ridgeLm, unit: 'lm', unitCost: ridgeRate, wastePct })
    out.push({ id: 'wall_plate', name: 'Wall plate 100×50 treated, full perimeter', category: 'materials', source: 'fixed', fixedQty: g.wallPlateLm, unit: 'lm', unitCost: 2.80, wastePct })
    if (g.strapCount > 0) out.push({ id: 'straps', name: 'Lateral restraint straps', category: 'materials', source: 'fixed', fixedQty: g.strapCount, unit: 'nr', unitCost: 4.20, roundToWhole: true })
    out.push({ id: 'ceiling_joists', name: `Ceiling joists 47×${ceilingJoistDepthMm} C16`, category: 'materials', source: 'fixed', fixedQty: g.ceilingJoistLm, unit: 'lm', unitCost: ceilingJoistRate, wastePct })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, rafterSectionLabel, rafterRate, hipDepthMm, hipRate, ridgeRate, ceilingJoistDepthMm, ceilingJoistRate, wastePct])

  const costedLines: CostedLine[] = useMemo(() => layers.map(l => {
    const withRate = rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l
    return costLayer(withRate, withRate.fixedQty ?? 0)
  }), [layers, rateOverrides])
  const enabledMaterialLines = costedLines.filter(l => !disabledLayerIds.has(l.layerId))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }
  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const allMaterialLines = [...costedLines, ...miscCostedLines]
  const enabledLines = [...enabledMaterialLines, ...miscCostedLines]

  // Labour — the carpenter fixing the wall plates/ridge, cutting the common, hip and jack rafters, and
  // fitting the ceiling joists, following the roof until edited by hand
  const labourSuggestions: LabourSuggestion[] = g ? suggestHipRoofLabour(g) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useState<LabourLine[] | null>(null)
  const suggestedRef = useRef<LabourLine[]>([])
  suggestedRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines
  const addLabour = () => setLabourOverride(prev => { const b = prev ?? suggestedRef.current; return [...b, { id: newLabourLineId(), tradeId: b[0]?.tradeId ?? '', task: '', hours: 0 }] })
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourOverride(prev => (prev ?? suggestedRef.current).map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourOverride(prev => (prev ?? suggestedRef.current).filter(l => l.id !== id))

  const labourCostedLines: CostedLine[] = labourLines
    .map(l => {
      const trade = labourTrades.find(t => t.id === l.tradeId)
      if (!trade || l.hours <= 0) return null
      const rate = hourlyRate(trade)
      return { layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour', source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr', unitCost: rate, cost: +(l.hours * rate).toFixed(2) } as CostedLine
    })
    .filter((l): l is CostedLine => l !== null)

  const costSubtotal = enabledLines.reduce((s, l) => s + l.cost, 0) + labourCostedLines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(costSubtotal * profitPct / 100).toFixed(2)
  const profitLine: CostedLine | null = profitPct > 0 ? { layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed', wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount } : null
  const totalCost = costSubtotal + profitAmount

  // The customer's description follows the roof until it's edited by hand
  const descInput = g ? {
    lengthM: g.lengthM, spanM: g.spanM, pitchDeg: g.pitchDeg, isPyramid: g.isPyramid, ridgeLm: g.ridgeLm, rafterSectionLabel,
    commonRafterCount: g.commonRafterCount, hipRafterCount: g.hipRafterCount, jackRafterCount: g.jackRafterCount,
    ceilingJoistCount: g.ceilingJoistCount, slopeAreaM2: g.slopeAreaM2,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describeHipRoofShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeHipRoof(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the roof</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the roof — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the roof</button>

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
        {geometryResult.ok && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {geometryResult.ok && <MaterialsListButtons lines={enabledLines} title={name} location={location} description={description} compact />}
        {onSave && geometryResult.ok && (
          <button onClick={() => onSave({ name, qty, location, description, detail, lines: [...enabledLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
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

      {!geometryResult.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {geometryResult.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Plan</div>
            <HipRoofPlanSvg lengthMm={lengthMm} spanMm={spanMm} centresMm={rafterCentresMm} isPyramid={g.isPyramid} ridgeLm={g.ridgeLm} />
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10, marginBottom: 3 }}>Section — through the {g.isPyramid ? 'apex' : 'ridge'}</div>
            <HipRoofSectionSvg g={g} eavesOverhangMm={eavesOverhangMm} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.commonRafterCount} common rafters, true length {(g.commonRafterRunMm / 1000).toFixed(2)}m each. 4 hip rafters, true length {(g.hipRafterRunMm / 1000).toFixed(2)}m each. {g.jackRafterCount} jack rafters. {g.isPyramid ? 'No ridge — a pyramid hip.' : `Ridge ${g.ridgeLm.toFixed(1)}m.`} Rise {(g.riseMm / 1000).toFixed(2)}m. Slope area {g.slopeAreaM2.toFixed(1)}m². {g.ceilingJoistCount} ceiling joists.
            </div>
            <RafterSpanPanel
              chart={spanChart} check={rafterCheck} grade={rafterGrade} spanMm={g.commonRafterRunMm} centresMm={rafterCentresMm} depthMm={rafterDepthMm}
              picked={depthPicked} loads={spanLoads} onLoads={setSpanLoads}
              onUse={() => { if (rafterCheck.suggestedDepthMm != null) { setRafterDepthMm(rafterCheck.suggestedDepthMm); setDepthPicked(true) } }}
              onPick={(d, c) => { setRafterDepthMm(d); setRafterCentresMm(c); setDepthPicked(true) }}
            />
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><PropRow label="Ridge-direction length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Overall span (mm)">{numInput(spanMm, setSpanMm, 1)}</PropRow></div>
            <button onClick={swapLengthSpan} title="Swap length and span — if the roof was drawn the other way round"
              style={{ fontSize: 11, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', color: '#64748b', cursor: 'pointer', marginBottom: 1 }}>⇄ Swap</button>
          </div>

          <CollapsibleSection title="Pitch and rafters" borderColor="#bae6fd">
            <PropRow label={`Pitch (${pitchDeg}°)`}>
              <input type="range" min={5} max={60} value={pitchDeg} onChange={e => setPitchDeg(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Rafter centres (mm)">
                <select value={rafterCentresMm} onChange={e => { setRafterCentresMm(+e.target.value); setDepthPicked(false) }} style={propInput}>
                  {SPAN_CHART_CENTRES_MM.map(c => <option key={c} value={c}>{c}mm</option>)}
                </select>
              </PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Eaves overhang (mm)">{numInput(eavesOverhangMm, setEavesOverhangMm, 0)}</PropRow></div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Rafter grade">
                <select value={rafterGrade} onChange={e => { setRafterGrade(e.target.value as SolidJoistGrade); setDepthPicked(false) }} style={propInput}>
                  <option value="c16">C16</option>
                  <option value="c24">C24</option>
                </select>
              </PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Rafter section">
                <select value={rafterDepthMm} onChange={e => { setRafterDepthMm(+e.target.value); setDepthPicked(true) }} style={propInput}>
                  {TIMBER_DEPTHS_MM.map(d => <option key={d} value={d}>47×{d}</option>)}
                </select>
              </PropRow></div>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>Common and jack rafters use this section. Hip rafters and the ridge board use the next size up.</div>
          </CollapsibleSection>

          <CollapsibleSection title="Ceiling joists" borderColor="#bae6fd">
            <PropRow label="Ceiling joist section">
              <select value={ceilingJoistDepthMm} onChange={e => setCeilingJoistDepthMm(+e.target.value)} style={propInput}>
                {TIMBER_DEPTHS_MM.map(d => <option key={d} value={d}>47×{d} C16</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>Tie the wall plates together across the full span, including under the hipped ends. Not checked against a span chart; a long span may need a binder or an engineer's design.</div>
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}>
            <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}>
            <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
        </div>

        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {geometryResult.ok && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={allMaterialLines} onRateChange={handleRate} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
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

// ── The rafter span check — the flat roof's own span chart, checked against this roof's true (sloped)
// common-rafter length. Same panel style as the mono-pitch and gable roofs' own copies. ──
function RafterSpanPanel({ chart, check, grade, spanMm, centresMm, depthMm, picked, loads, onLoads, onUse, onPick }: {
  chart: ReturnType<typeof flatRoofSpanChart>
  check: ReturnType<typeof checkFlatRoofJoist>
  grade: SolidJoistGrade
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
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: bad ? '#c0392b' : '#166534' }}>
        {check.status === 'ok' && <>✓ 47×{depthMm} {grade.toUpperCase()} works for the {span}m true common-rafter length at {centresMm}mm centres (up to {(check.maxSpanMm / 1000).toFixed(2)}m).</>}
        {check.status === 'under' && <>⚠ 47×{depthMm} {grade.toUpperCase()} is too small for the {span}m true common-rafter length at {centresMm}mm centres — it manages {(check.maxSpanMm / 1000).toFixed(2)}m. The chart says 47×{check.suggestedDepthMm}.</>}
        {check.status === 'beyond' && <>⚠ A {span}m true common-rafter length at {centresMm}mm centres is beyond solid timber.{check.closerCentres ? <> It works at {check.closerCentres.centresMm}mm centres in 47×{check.closerCentres.depthMm}.</> : <> Use an engineer's design.</>}</>}
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
        <summary style={{ fontSize: 11, color: '#0369a1', cursor: 'pointer' }}>Span chart — {grade.toUpperCase()} rafters, longest span in metres</summary>
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
          Green reaches the {span}m true common-rafter length (half the span plus the eaves overhang, along the slope). Click a cell to use that section and those centres. The hip rafters are checked separately — they take the next size up.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', fontSize: 10, color: '#64748b' }}>
          <label>Roof build-up load (kN/m²)
            <input type="number" step={0.05} min={0.2} value={loads.deadKnM2} onChange={e => onLoads({ ...loads, deadKnM2: Math.max(0.2, +e.target.value || 0.2) })}
              style={{ width: 56, marginLeft: 4, fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }} />
          </label>
          <label>Snow / access (kN/m²)
            <input type="number" step={0.05} min={0.25} value={loads.imposedKnM2} onChange={e => onLoads({ ...loads, imposedKnM2: Math.max(0.25, +e.target.value || 0.25) })}
              style={{ width: 56, marginLeft: 4, fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }} />
          </label>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
          Worked out cautiously from timber beam formulae (deflection to 0.003 × span, creep included) — a pricing guide, not a design. Check the span tables or an engineer.
        </div>
      </details>
    </div>
  )
}

// ── The roof in plan: common rafters in the ridge zone (centred), the ridge line itself (or, for a pyramid,
// nothing — the hips simply meet), and the four hip lines running diagonally from each corner up to a ridge
// end or the apex, with short jack-rafter ticks filling each hip triangle, getting longer toward the ridge.
// No roof-window openings yet — see the mono-pitch roof's own plan view for that pattern, ready to reuse
// when this one needs it. ──
function HipRoofPlanSvg({ lengthMm, spanMm, centresMm, isPyramid, ridgeLm }: { lengthMm: number; spanMm: number; centresMm: number; isPyramid: boolean; ridgeLm: number }) {
  const vbW = 430, vbH = 260
  const k = Math.min(340 / lengthMm, 170 / spanMm)
  const w = lengthMm * k, h = spanMm * k
  const x0 = (vbW - w) / 2, y0 = 40
  const halfSpanMm = spanMm / 2
  const ridgeMm = ridgeLm * 1000
  const xRidgeStart = x0 + halfSpanMm * k, xRidgeEnd = x0 + (halfSpanMm + ridgeMm) * k
  const yMid = y0 + h / 2

  const commonPositions: number[] = []
  if (!isPyramid) for (let x = 0; x <= ridgeMm; x += centresMm) commonPositions.push(x)
  if (commonPositions.length && commonPositions[commonPositions.length - 1] !== ridgeMm) commonPositions.push(ridgeMm)

  const jackPositions: number[] = []
  for (let d = 0; d <= halfSpanMm; d += centresMm) jackPositions.push(d)
  const interiorJacks = jackPositions.slice(1, -1)

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 220, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={x0} y={y0} width={w} height={h} fill="#fafaf9" stroke="#78716c" strokeWidth={1.2} />
      {/* Common rafters in the ridge zone */}
      {commonPositions.map((p, i) => (
        <line key={`c${i}`} x1={xRidgeStart + p * k} x2={xRidgeStart + p * k} y1={y0} y2={y0 + h} stroke="#b4b2a9" strokeWidth={1} />
      ))}
      {/* Hips, at each corner */}
      <line x1={x0} y1={y0} x2={xRidgeStart} y2={yMid} stroke="#b45309" strokeWidth={2} />
      <line x1={x0} y1={y0 + h} x2={xRidgeStart} y2={yMid} stroke="#b45309" strokeWidth={2} />
      <line x1={x0 + w} y1={y0} x2={xRidgeEnd} y2={yMid} stroke="#b45309" strokeWidth={2} />
      <line x1={x0 + w} y1={y0 + h} x2={xRidgeEnd} y2={yMid} stroke="#b45309" strokeWidth={2} />
      {/* Jacks, both hip ends, both sides — short ticks from the eave in to the hip line */}
      {interiorJacks.map((d, i) => {
        const t = d / halfSpanMm
        // Left end
        const xLeftTop = x0 + d * k, yLeftTop = y0 + d * (h / 2 / halfSpanMm)
        const xLeftBot = x0 + d * k, yLeftBot = y0 + h - d * (h / 2 / halfSpanMm)
        // Right end
        const xRightTop = x0 + w - d * k, yRightTop = y0 + d * (h / 2 / halfSpanMm)
        const xRightBot = x0 + w - d * k, yRightBot = y0 + h - d * (h / 2 / halfSpanMm)
        return (
          <React.Fragment key={`j${i}`}>
            <line x1={xLeftTop} x2={xLeftTop} y1={y0} y2={yLeftTop} stroke="#b4b2a9" strokeWidth={1} />
            <line x1={xLeftBot} x2={xLeftBot} y1={y0 + h} y2={yLeftBot} stroke="#b4b2a9" strokeWidth={1} />
            <line x1={xRightTop} x2={xRightTop} y1={y0} y2={yRightTop} stroke="#b4b2a9" strokeWidth={1} />
            <line x1={xRightBot} x2={xRightBot} y1={y0 + h} y2={yRightBot} stroke="#b4b2a9" strokeWidth={1} />
          </React.Fragment>
        )
      })}
      {/* Ridge */}
      {!isPyramid && <line x1={xRidgeStart} y1={yMid} x2={xRidgeEnd} y2={yMid} stroke="#0369a1" strokeWidth={2.5} />}
      <text x={x0 + w / 2} y={y0 - 8} fontSize={9} fill="#57534e" textAnchor="middle">Eaves wall</text>
      <text x={x0 + w / 2} y={y0 + h + 16} fontSize={9} fill="#57534e" textAnchor="middle">Eaves wall</text>
      <text x={x0 + w / 2} y={y0 + h + 30} fontSize={9} fill="#64748b" textAnchor="middle">
        {(lengthMm / 1000).toFixed(2)}m × {(spanMm / 1000).toFixed(2)}m plan · {isPyramid ? 'pyramid hip, no ridge' : `${ridgeLm.toFixed(1)}m ridge`}
      </text>
      <g transform={`translate(20, ${vbH - 6})`}>
        <line x1={0} x2={16} y1={-3} y2={-3} stroke="#b45309" strokeWidth={2} /><text x={21} y={0} fontSize={8} fill="#64748b">Hip</text>
        <line x1={70} x2={86} y1={-3} y2={-3} stroke="#0369a1" strokeWidth={2} /><text x={91} y={0} fontSize={8} fill="#64748b">Ridge</text>
      </g>
    </svg>
  )
}

// ── The roof's cross-section, taken through the ridge (or the apex, for a pyramid) — the same shape as a
// gable's, since the span profile is identical either side of the hips. ──
function HipRoofSectionSvg({ g, eavesOverhangMm }: { g: HipRoofGeometry; eavesOverhangMm: number }) {
  const vbW = 380, vbH = 260
  const halfSpanPx = 130
  const k = halfSpanPx / (g.spanM * 500)
  const overhangPx = eavesOverhangMm * k
  const risePx = g.riseMm * k
  const wallH = 60
  const xLeft = 70, xRight = xLeft + halfSpanPx * 2, xRidge = xLeft + halfSpanPx
  const yBase = 210
  const yWallTop = yBase - wallH
  const yRidge = yWallTop - risePx
  const xEaveL = xLeft - overhangPx, xEaveR = xRight + overhangPx
  const yEave = yWallTop - overhangPx * (risePx / halfSpanPx)

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 220, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={xLeft - 6} y={yWallTop} width={12} height={wallH} fill="#e7e5e4" stroke="#78716c" strokeWidth={1} />
      <rect x={xRight - 6} y={yWallTop} width={12} height={wallH} fill="#e7e5e4" stroke="#78716c" strokeWidth={1} />
      <line x1={20} x2={vbW - 20} y1={yBase} y2={yBase} stroke="#d6d3d1" strokeWidth={1.5} />
      <line x1={xEaveL} y1={yEave} x2={xRidge} y2={yRidge} stroke="#0f766e" strokeWidth={3.5} strokeLinecap="round" />
      <line x1={xEaveR} y1={yEave} x2={xRidge} y2={yRidge} stroke="#0f766e" strokeWidth={3.5} strokeLinecap="round" />
      {g.isPyramid
        ? <circle cx={xRidge} cy={yRidge} r={3.5} fill="#0369a1" />
        : <rect x={xRidge - 5} y={yRidge - 5} width={10} height={7} fill="#0369a1" />}
      <rect x={xLeft - 9} y={yWallTop - 3} width={18} height={6} fill="#b45309" />
      <rect x={xRight - 9} y={yWallTop - 3} width={18} height={6} fill="#b45309" />
      <line x1={xLeft} y1={yWallTop} x2={xRight} y2={yWallTop} stroke="#78716c" strokeWidth={1.5} strokeDasharray="3 2" />
      <text x={(xLeft + xRight) / 2} y={yWallTop - 8} fontSize={9} fill="#57534e" textAnchor="middle">Ceiling joists</text>
      <text x={xLeft + 26} y={yWallTop - 4} fontSize={10} fill="#64748b">{g.pitchDeg}°</text>
      <text x={(xLeft + xRight) / 2} y={yBase + 18} fontSize={9} fill="#64748b" textAnchor="middle">Span {g.spanM.toFixed(2)}m</text>
      <text x={xRidge + 14} y={(yRidge + yBase) / 2} fontSize={9} fill="#64748b" textAnchor="start" transform={`rotate(90 ${xRidge + 14} ${(yRidge + yBase) / 2})`}>Rise {(g.riseMm / 1000).toFixed(2)}m</text>
      <text x={(xLeft + xRight) / 2} y={30} fontSize={10} fill="#57534e" textAnchor="middle">{g.isPyramid ? 'A pyramid hip — no ridge' : `Ridge ${g.ridgeLm.toFixed(2)}m`}</text>
      <text x={xLeft} y={yBase + 20} fontSize={9} fill="#57534e" textAnchor="middle">Eaves wall</text>
      <text x={xRight} y={yBase + 20} fontSize={9} fill="#57534e" textAnchor="middle">Eaves wall</text>
      <g transform={`translate(20, ${vbH - 12})`}>
        <rect x={0} y={-6} width={14} height={6} fill="#b45309" /><text x={19} y={0} fontSize={8} fill="#64748b">Wall plate</text>
        <rect x={90} y={-6} width={14} height={6} fill="#0369a1" /><text x={109} y={0} fontSize={8} fill="#64748b">Ridge / apex</text>
        <line x1={190} x2={204} y1={-3} y2={-3} stroke="#0f766e" strokeWidth={3} /><text x={210} y={0} fontSize={8} fill="#64748b">Rafter</text>
      </g>
    </svg>
  )
}
