'use client'

/**
 * Assembly Calculator — Existing floor overlay (Floors & Screeds → Existing Floor Overlay), priced per m² from the floor's area.
 *
 * A new surface laid over the floor that is already there: self-levelling compound (bags from the area and the depth, with primer and edge strip) or a plywood overlay (sheets and fixings). Everything is ours,
 * the materials and the labour to lay them. The sums are in lib/floor-overlay.ts. Every rate is a sample, editable per line in the breakdown.
 */

import React, { useMemo, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateFloorOverlay, OVERLAY_KINDS, SLC_PER_BAG, SLC_BAG_KG, PRIMER_PER_L, PLY_PER_SHEET, PLY_FIXINGS_PER_M2, EDGE_STRIP_PER_LM, type OverlayKind, type FloorOverlayGeometry,
} from '@/lib/floor-overlay'
import { describeFloorOverlay, describeFloorOverlayShort } from '@/lib/floor-overlay-description'
import { suggestFloorOverlayLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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

function buildFloorOverlayLayers(g: FloorOverlayGeometry, wastePct: number): AssemblyLayerDef[] {
  const w = wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }
  if (g.kind === 'self-levelling') {
    L.push(fixed({ id: 'compound', name: `Self-levelling compound, ${g.thicknessMm}mm deep (${SLC_BAG_KG}kg bags)`, category: 'materials', unit: 'bag', unitCost: SLC_PER_BAG, roundToWhole: true, wastePct: Math.max(w, 10), qty: g.compoundBags }))
    if (g.primerLitres > 0) L.push(fixed({ id: 'primer', name: 'Primer for the floor under the compound', category: 'materials', unit: 'l', unitCost: PRIMER_PER_L, wastePct: 5, qty: g.primerLitres }))
    if (g.edgeStripLm > 0) L.push(fixed({ id: 'edge-strip', name: 'Edge foam strip round the perimeter', category: 'materials', unit: 'lm', unitCost: EDGE_STRIP_PER_LM, wastePct: 5, qty: g.edgeStripLm }))
  } else {
    L.push(fixed({ id: 'ply', name: `${g.thicknessMm}mm plywood sheets, 2440 × 1220mm`, category: 'materials', unit: 'nr', unitCost: PLY_PER_SHEET[g.thicknessMm] ?? PLY_PER_SHEET[18], roundToWhole: true, wastePct: Math.max(w, 10), qty: g.plySheets }))
    L.push(fixed({ id: 'ply-fixings', name: 'Screws and fixings for the plywood', category: 'materials', unit: 'm²', unitCost: PLY_FIXINGS_PER_M2, qty: g.plyFixingsM2 }))
  }
  return L
}

export default function AssemblyFloorOverlayDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM }: Props) {
  const ID = 'AssemblyFloorOverlayDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Existing floor overlay')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [areaM2, setAreaM2] = useCalcState(ID, 'areaM2', externalAreaM2 && externalAreaM2 > 0 ? +externalAreaM2.toFixed(2) : 20)
  useEffect(() => { if (externalAreaM2 != null && externalAreaM2 > 0) setAreaM2(+externalAreaM2.toFixed(2)) }, [externalAreaM2])
  const [perimeterLm, setPerimeterLm] = useCalcState(ID, 'perimeterLm', externalPerimeterM && externalPerimeterM > 0 ? +externalPerimeterM.toFixed(2) : 18)
  useEffect(() => { if (externalPerimeterM != null && externalPerimeterM > 0) setPerimeterLm(+externalPerimeterM.toFixed(2)) }, [externalPerimeterM])
  const [kind, setKind] = useCalcState<OverlayKind>(ID, 'kind', 'self-levelling')
  const [thicknessMm, setThicknessMm] = useCalcState(ID, 'thicknessMm', 5)
  const [primer, setPrimer] = useCalcState(ID, 'primer', true)
  const [edgeStrip, setEdgeStrip] = useCalcState(ID, 'edgeStrip', true)
  const [wastePct, setWastePct] = useCalcState(ID, 'wastePct', 10)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateFloorOverlay({ areaM2, perimeterLm, kind, thicknessMm, primer, edgeStrip }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [areaM2, perimeterLm, kind, thicknessMm, primer, edgeStrip])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildFloorOverlayLayers(g, wastePct).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, wastePct, rateOverrides])
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
  const labourSuggestions: LabourSuggestion[] = g ? suggestFloorOverlayLabour({ kind: g.kind, areaM2: g.areaM2, primerLitres: g.primerLitres, edgeStripLm: g.edgeStripLm }) : []
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
  const descInput = g ? { areaM2: g.areaM2, kind, thicknessMm, primer: g.primerLitres > 0, edgeStrip: g.edgeStripLm > 0 } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeFloorOverlayShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeFloorOverlay(descInput) : '')

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
  const info = OVERLAY_KINDS[kind]

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
        <textarea value={detail} onChange={e => setDetailOverride(e.target.value)} rows={5} style={box} />
      </div>

      {/* An engine error is a banner above the controls, never instead of them: typing a value digit by digit passes through invalid ones. */}
      {!geometryResult.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {geometryResult.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <OverlaySectionSvg thicknessMm={thicknessMm} kind={kind} edgeStrip={g.edgeStripLm > 0} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {kind === 'self-levelling'
                ? <>{g.areaM2.toFixed(1)} m² at {g.thicknessMm}mm = {g.compoundKg.toFixed(0)}kg of compound, about {g.compoundBags.toFixed(1)} bags of {SLC_BAG_KG}kg before waste.</>
                : <>{g.areaM2.toFixed(1)} m² of {g.thicknessMm}mm ply = {g.plySheets.toFixed(1)} sheets before waste.</>}
              {' '}The floor rises by {g.raisesFloorMm}mm.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Floor area (m²) — from the drawing">{numInput(areaM2, setAreaM2, 0, 0.5)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Perimeter (m)">{numInput(perimeterLm, setPerimeterLm, 0, 0.5)}</PropRow></div>
          </div>

          <CollapsibleSection title="The overlay" borderColor="#bae6fd">
            <PropRow label="Kind of overlay">
              <select value={kind} onChange={e => { const k = e.target.value as OverlayKind; setKind(k); setThicknessMm(OVERLAY_KINDS[k].defaultMm) }} style={propInput}>
                {(Object.keys(OVERLAY_KINDS) as OverlayKind[]).map(k => <option key={k} value={k}>{OVERLAY_KINDS[k].label}</option>)}
              </select>
            </PropRow>
            <PropRow label={kind === 'plywood' ? 'Ply thickness (mm)' : 'Depth of compound (mm)'}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 90 }}>{numInput(thicknessMm, setThicknessMm, 1, 1)}</div>
                {info.thicknessesMm.map(t => (
                  <button key={t} onClick={() => setThicknessMm(t)}
                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: '1px solid #bae6fd', background: thicknessMm === t ? '#0369a1' : '#fff', color: thicknessMm === t ? '#fff' : '#0369a1', cursor: 'pointer' }}>{t}</button>
                ))}
              </div>
            </PropRow>
          </CollapsibleSection>

          {kind === 'self-levelling' && (
            <CollapsibleSection title="Preparation" borderColor="#bae6fd">
              {check('Primer', primer, setPrimer, 'Painted on the floor first so the compound bonds')}
              {check('Edge foam strip', edgeStrip, setEdgeStrip, 'Round the perimeter, so the compound can move')}
            </CollapsibleSection>
          )}

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

// ── A section through the floor: the existing floor with the new overlay on top, and the edge strip against the wall ──
function OverlaySectionSvg({ thicknessMm, kind, edgeStrip }: { thicknessMm: number; kind: OverlayKind; edgeStrip: boolean }) {
  const vbW = 430, vbH = 190
  const x0 = 60, x1 = vbW - 40
  const baseY = 150
  const oldH = 60
  const overH = Math.max(Math.min(thicknessMm * 1.6, 40), 6)
  const oldTop = baseY - oldH
  const overTop = oldTop - overH
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 190, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={overTop - 30} width={x0 - 20} height={baseY - overTop + 30} fill="#d6d3d1" stroke="#57534e" />
      <text x={40} y={overTop - 36} fontSize={9} fill="#57534e" textAnchor="middle">Wall</text>
      <rect x={x0} y={oldTop} width={x1 - x0} height={oldH} fill="#a8a29e" stroke="#57534e" />
      <text x={(x0 + x1) / 2} y={oldTop + oldH / 2 + 3} fontSize={10} fill="#292524" textAnchor="middle">{kind === 'plywood' ? 'Existing timber floor' : 'Existing floor'}</text>
      <rect x={x0} y={overTop} width={x1 - x0} height={overH} fill={kind === 'plywood' ? '#e7d3b0' : '#bae6fd'} stroke="#78716c" />
      <text x={(x0 + x1) / 2} y={overTop + overH / 2 + 3} fontSize={10} fill="#44403c" textAnchor="middle">{kind === 'plywood' ? `Plywood ${thicknessMm}mm` : `Self-levelling compound ${thicknessMm}mm`}</text>
      {edgeStrip && <rect x={x0 - 4} y={overTop} width={4} height={overH} fill="#f59e0b" />}
      <line x1={x1 + 14} x2={x1 + 14} y1={overTop} y2={overTop + overH} stroke="#2563eb" />
      <text x={x1 + 18} y={overTop + overH / 2 + 3} fontSize={10} fill="#2563eb">{thicknessMm}</text>
    </svg>
  )
}
