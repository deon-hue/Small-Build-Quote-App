'use client'

/**
 * Assembly Calculator — Screeded floor (Floors & Screeds → Screeded Floor), priced per m² from the floor's area.
 *
 * A specialist screeding firm lays the screed: it is one subcontract rate per m², worked out from the thickness and the amount of screed, with the firm's materials, pump and machinery
 * included, and a minimum charge that tops a small floor up. Everything else is ours: the insulation and membrane under the screed, the edge strip and any mesh, with the labour to fit them.
 * The sums are in lib/screed-floor.ts. Every rate is a sample, editable per line in the breakdown.
 */

import React, { useMemo, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateScreedFloor, screedCharge, SCREED_TYPES, SCREED_MINIMUM_CHARGE, INSULATION_THICKNESSES_MM, INSULATION_PER_M2, DPM_PER_M2, EDGE_STRIP_PER_LM, MESH_PER_M2,
  type ScreedType, type ScreedFloorGeometry,
} from '@/lib/screed-floor'
import { describeScreedFloor, describeScreedFloorShort } from '@/lib/screed-floor-description'
import { suggestScreedFloorLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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

function buildScreedFloorLayers(g: ScreedFloorGeometry, o: { wastePct: number; screedRate: number; minimumCharge: number }): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }
  const info = SCREED_TYPES[g.screedType]

  // the screeding firm: one rate per m² for the thickness, with their materials, pump and machinery in it
  L.push(fixed({ id: 'screed', name: `${g.thicknessMm}mm ${info.label.toLowerCase()}, supplied and laid by the screeding firm (their materials, pump and machinery included)`, category: 'subcontractors', unit: 'm²', unitCost: o.screedRate, qty: g.areaM2 }))
  const { topUp } = screedCharge(g.areaM2, o.screedRate, o.minimumCharge)
  if (topUp > 0) L.push(fixed({ id: 'screed-min', name: `Screeding firm's minimum charge (tops the price up to £${o.minimumCharge})`, category: 'subcontractors', unit: 'sum', unitCost: topUp, qty: 1 }))

  if (g.insulationAreaM2 > 0) L.push(fixed({ id: 'insulation', name: `PIR insulation board ${g.insulationMm}mm under the screed`, category: 'materials', unit: 'm²', unitCost: INSULATION_PER_M2[g.insulationMm] ?? 0, wastePct: Math.max(w, 5), qty: g.insulationAreaM2 }))
  if (g.dpmAreaM2 > 0) L.push(fixed({ id: 'dpm', name: 'Damp-proof / separating membrane (1200g polythene), lapped and taped', category: 'materials', unit: 'm²', unitCost: DPM_PER_M2, wastePct: Math.max(w, 10), qty: g.dpmAreaM2 }))
  if (g.edgeStripLm > 0) L.push(fixed({ id: 'edge-strip', name: 'Edge insulation strip 10mm round the perimeter', category: 'materials', unit: 'lm', unitCost: EDGE_STRIP_PER_LM, wastePct: 5, qty: g.edgeStripLm }))
  if (g.meshAreaM2 > 0) L.push(fixed({ id: 'mesh', name: 'Reinforcing mesh (A142) in the screed', category: 'materials', unit: 'm²', unitCost: MESH_PER_M2, wastePct: Math.max(w, 10), qty: g.meshAreaM2 }))
  return L
}

export default function AssemblyScreedFloorDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM }: Props) {
  const ID = 'AssemblyScreedFloorDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Screeded floor')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [areaM2, setAreaM2] = useCalcState(ID, 'areaM2', externalAreaM2 && externalAreaM2 > 0 ? +externalAreaM2.toFixed(2) : 20)
  useEffect(() => { if (externalAreaM2 != null && externalAreaM2 > 0) setAreaM2(+externalAreaM2.toFixed(2)) }, [externalAreaM2])
  const [perimeterLm, setPerimeterLm] = useCalcState(ID, 'perimeterLm', externalPerimeterM && externalPerimeterM > 0 ? +externalPerimeterM.toFixed(2) : 18)
  useEffect(() => { if (externalPerimeterM != null && externalPerimeterM > 0) setPerimeterLm(+externalPerimeterM.toFixed(2)) }, [externalPerimeterM])
  const [screedType, setScreedType] = useCalcState<ScreedType>(ID, 'screedType', 'sand-cement')
  const [thicknessMm, setThicknessMm] = useCalcState(ID, 'thicknessMm', 65)
  const [minimumCharge, setMinimumCharge] = useCalcState(ID, 'minimumCharge', SCREED_MINIMUM_CHARGE)
  const [insulationMm, setInsulationMm] = useCalcState(ID, 'insulationMm', 0)      // optional extras start off
  const [dpm, setDpm] = useCalcState(ID, 'dpm', false)
  const [edgeStrip, setEdgeStrip] = useCalcState(ID, 'edgeStrip', true)
  const [mesh, setMesh] = useCalcState(ID, 'mesh', false)
  const [wastePct, setWastePct] = useCalcState(ID, 'wastePct', 10)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateScreedFloor({ areaM2, perimeterLm, screedType, thicknessMm, insulationMm, dpm, edgeStrip, mesh }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [areaM2, perimeterLm, screedType, thicknessMm, insulationMm, dpm, edgeStrip, mesh])
  const g = geometryResult.ok ? geometryResult.geometry : null

  // the firm's rate follows the thickness until it is typed over in the breakdown
  const screedRate = g ? (rateOverrides['screed'] ?? g.screedRatePerM2) : 0
  const layers = useMemo(() => {
    if (!g) return []
    return buildScreedFloorLayers(g, { wastePct, screedRate, minimumCharge }).map(l => (l.id !== 'screed' && rateOverrides[l.id] != null) ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, wastePct, screedRate, minimumCharge, rateOverrides])
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

  // Labour: ours is only the work round the screed, suggested from the floor and following it until edited
  const labourSuggestions: LabourSuggestion[] = g ? suggestScreedFloorLabour({ areaM2: g.areaM2, perimeterLm: g.perimeterLm, insulationAreaM2: g.insulationAreaM2, dpmAreaM2: g.dpmAreaM2, edgeStripLm: g.edgeStripLm, meshAreaM2: g.meshAreaM2 }) : []
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
  const descInput = g ? { areaM2: g.areaM2, screedType, thicknessMm, insulationMm, dpm, edgeStrip, mesh } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeScreedFloorShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeScreedFloor(descInput) : '')

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
  const info = SCREED_TYPES[screedType]

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
            <ScreedSectionSvg thicknessMm={thicknessMm} insulationMm={insulationMm} dpm={dpm} edgeStrip={edgeStrip} mesh={mesh} liquid={screedType === 'liquid'} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.areaM2.toFixed(1)} m² of screed, {g.thicknessMm}mm deep = {g.screedVolumeM3.toFixed(2)} m³. The screeding firm's rate for this thickness is £{g.screedRatePerM2.toFixed(2)} per m²
              (£{info.layingPerM2.toFixed(2)} laying + £{info.perM3} per m³ of screed).
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Floor area (m²) — from the drawing">{numInput(areaM2, setAreaM2, 0, 0.5)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Perimeter (m)">{numInput(perimeterLm, setPerimeterLm, 0, 0.5)}</PropRow></div>
          </div>

          <CollapsibleSection title="The screed" borderColor="#bae6fd">
            <PropRow label="Type of screed">
              <select value={screedType} onChange={e => { const t = e.target.value as ScreedType; setScreedType(t); setThicknessMm(SCREED_TYPES[t].defaultMm); setRateOverrides(p => { const n = { ...p }; delete n['screed']; return n }) }} style={propInput}>
                {(Object.keys(SCREED_TYPES) as ScreedType[]).map(k => <option key={k} value={k}>{SCREED_TYPES[k].label}</option>)}
              </select>
            </PropRow>
            <PropRow label="Thickness (mm)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 90 }}>{numInput(thicknessMm, v => { setThicknessMm(v); setRateOverrides(p => { const n = { ...p }; delete n['screed']; return n }) }, 1, 5)}</div>
                {info.thicknessesMm.map(t => (
                  <button key={t} onClick={() => { setThicknessMm(t); setRateOverrides(p => { const n = { ...p }; delete n['screed']; return n }) }}
                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: '1px solid #bae6fd', background: thicknessMm === t ? '#0369a1' : '#fff', color: thicknessMm === t ? '#fff' : '#0369a1', cursor: 'pointer' }}>{t}</button>
                ))}
              </div>
            </PropRow>
            <PropRow label="Screeding firm's minimum charge (£, ex VAT)">{numInput(minimumCharge, setMinimumCharge, 0, 10)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 4px' }}>The firm lays and supplies the screed with their own pump and materials. Type their real rate over the sample one in the cost breakdown below.</div>
          </CollapsibleSection>

          <CollapsibleSection title="Under the screed" borderColor="#bae6fd">
            <PropRow label="Insulation board">
              <select value={insulationMm} onChange={e => setInsulationMm(+e.target.value)} style={propInput}>
                {INSULATION_THICKNESSES_MM.map(t => <option key={t} value={t}>{t === 0 ? 'None' : `PIR ${t}mm`}</option>)}
              </select>
            </PropRow>
            {check('Damp-proof / separating membrane', dpm, setDpm, 'Laid over the slab and the insulation, lapped and taped')}
            {check('Reinforcing mesh in the screed', mesh, setMesh, 'A142 mesh or fibres, where the firm asks for it')}
          </CollapsibleSection>

          <CollapsibleSection title="Edges" borderColor="#bae6fd">
            {check('Edge insulation strip', edgeStrip, setEdgeStrip, 'Round the perimeter, so the screed can move without cracking against the walls')}
          </CollapsibleSection>

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

// ── A section through the floor: the slab, the membrane, the insulation, the screed, and the edge strip against the wall ──
function ScreedSectionSvg({ thicknessMm, insulationMm, dpm, edgeStrip, mesh, liquid }: { thicknessMm: number; insulationMm: number; dpm: boolean; edgeStrip: boolean; mesh: boolean; liquid: boolean }) {
  const vbW = 430, vbH = 240
  const total = 150 + Math.max(insulationMm, 0) + thicknessMm + 60
  const k = Math.min(150 / total, 0.9)
  const x0 = 60, x1 = vbW - 40
  const slabH = 150 * k
  const insH = insulationMm * k
  const scrH = Math.max(thicknessMm * k, 6)
  const baseY = 175
  const slabTop = baseY - slabH
  const dpmY = slabTop - 1
  const insTop = slabTop - (dpm ? 2 : 0) - insH
  const scrTop = insTop - scrH
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 240, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {/* the wall on the left, and the slab */}
      <rect x={20} y={scrTop - 40} width={x0 - 20} height={baseY - scrTop + 40} fill="#d6d3d1" stroke="#57534e" />
      <text x={40} y={scrTop - 46} fontSize={9} fill="#57534e" textAnchor="middle">Wall</text>
      <rect x={x0} y={slabTop} width={x1 - x0} height={slabH} fill="#a8a29e" stroke="#57534e" />
      <text x={(x0 + x1) / 2} y={slabTop + slabH / 2 + 3} fontSize={10} fill="#292524" textAnchor="middle">Existing floor / slab</text>
      {dpm && <line x1={x0} x2={x1} y1={dpmY} y2={dpmY} stroke="#0f766e" strokeWidth={2.5} />}
      {dpm && <text x={x1 + 4} y={dpmY + 3} fontSize={9} fill="#0f766e">membrane</text>}
      {insulationMm > 0 && <rect x={x0} y={insTop} width={x1 - x0} height={insH} fill="#fde68a" stroke="#b45309" />}
      {insulationMm > 0 && <text x={(x0 + x1) / 2} y={insTop + insH / 2 + 3} fontSize={10} fill="#78350f" textAnchor="middle">PIR {insulationMm}mm</text>}
      <rect x={x0} y={scrTop} width={x1 - x0} height={scrH} fill={liquid ? '#bae6fd' : '#e7d3b0'} stroke="#78716c" />
      <text x={(x0 + x1) / 2} y={scrTop + scrH / 2 + 3} fontSize={10} fill="#44403c" textAnchor="middle">{liquid ? 'Liquid screed' : 'Sand:cement screed'} {thicknessMm}mm</text>
      {mesh && <line x1={x0 + 6} x2={x1 - 6} y1={scrTop + scrH * 0.55} y2={scrTop + scrH * 0.55} stroke="#6b7280" strokeDasharray="4 3" />}
      {edgeStrip && <rect x={x0 - 4} y={scrTop} width={4} height={insH + scrH} fill="#f59e0b" />}
      {edgeStrip && <text x={x0 - 6} y={scrTop - 4} fontSize={9} fill="#b45309" textAnchor="end">edge strip</text>}
      {/* the screed thickness */}
      <line x1={x1 + 14} x2={x1 + 14} y1={scrTop} y2={scrTop + scrH} stroke="#2563eb" />
      <text x={x1 + 18} y={scrTop + scrH / 2 + 3} fontSize={10} fill="#2563eb">{thicknessMm}</text>
    </svg>
  )
}
