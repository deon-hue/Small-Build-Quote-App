'use client'

/**
 * Assembly Calculator — Heating plant (Plumbing & Heating → Heating Plant (by system)): so far a gas combi boiler, priced itemised.
 * The boiler by size, its flue, the Gas Safe engineer's fitting, controls, a magnetic filter, flushing the system, the pipework that moves with the boiler (gas, flow and return, condensate),
 * taking the old boiler away, and commissioning. Every part is its own line, editable in the breakdown. Radiators and towel rails are counted room by room in the Plumbing Installation calculator,
 * not here. Counts and prices only: the boiler size is the heating engineer's to confirm. The engine is lib/heating-units.ts.
 */

import React, { useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateHeating, HEAT_SOURCE_LABEL, BOILER_SIZES, FIT_LABEL, FLUE_LABEL, CONTROLS_LABEL, type FitMode, type FlueKind, type ControlsKind, type HeatingResult,
} from '@/lib/heating-units'
import { describeHeating, describeHeatingShort, type HeatingDescriptionInput } from '@/lib/heating-description'
import { fmt } from '@/lib/utils'
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
}

export default function AssemblyHeatingDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyHeatingDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Heating system')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [boilerKw, setBoilerKw] = useCalcState(ID, 'boilerKw', 28)
  const [fit, setFit] = useCalcState<FitMode>(ID, 'fit', 'replace')
  const [flue, setFlue] = useCalcState<FlueKind>(ID, 'flue', 'existing')
  const [coreDrill, setCoreDrill] = useCalcState(ID, 'coreDrill', false)
  const [plumeKit, setPlumeKit] = useCalcState(ID, 'plumeKit', false)
  const [controls, setControls] = useCalcState<ControlsKind>(ID, 'controls', 'none')
  const [magneticFilter, setMagneticFilter] = useCalcState(ID, 'magneticFilter', true)
  const [flush, setFlush] = useCalcState(ID, 'flush', true)
  const [radiators, setRadiators] = useCalcState(ID, 'radiators', 8)
  const [removeOld, setRemoveOld] = useCalcState(ID, 'removeOld', true)
  const [commission, setCommission] = useCalcState(ID, 'commission', true)
  const [condensatePump, setCondensatePump] = useCalcState(ID, 'condensatePump', false)
  const [gasPipeLm, setGasPipeLm] = useCalcState(ID, 'gasPipeLm', 0)
  const [heatingPipeLm, setHeatingPipeLm] = useCalcState(ID, 'heatingPipeLm', 0)
  const [condensateLm, setCondensateLm] = useCalcState(ID, 'condensateLm', 0)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const result = useMemo((): { ok: true; r: HeatingResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateHeating({ source: 'combi', boilerKw, fit, flue, coreDrill, plumeKit, controls, magneticFilter, flush, radiators, removeOld, commission, condensatePump, gasPipeLm, heatingPipeLm, condensateLm }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [boilerKw, fit, flue, coreDrill, plumeKit, controls, magneticFilter, flush, radiators, removeOld, commission, condensatePump, gasPipeLm, heatingPipeLm, condensateLm])
  const r = result.ok ? result.r : null

  const layers: AssemblyLayerDef[] = useMemo(() => (r?.lines ?? []).map(l => ({
    id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit,
    unitCost: rateOverrides[l.id] != null ? rateOverrides[l.id] : l.unitCost, fixedQty: l.qty, wastePct: 0,
  })), [r, rateOverrides])
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

  // Own labour (e.g. our own hands helping the engineer, making good) — starts empty: the Gas Safe engineer's work is in the fitting line
  const [labourLines, setLabourLines] = useCalcState<LabourLine[]>(ID, 'labourLines', [])
  const addLabour = () => setLabourLines(prev => [...prev, { id: newLabourLineId(), tradeId: prev[0]?.tradeId ?? '', task: '', hours: 0 }])
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourLines(prev => prev.filter(l => l.id !== id))

  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const materialLines = [...(r ? costedLines : []), ...miscCostedLines]
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

  // The customer's description follows the settings until it's edited by hand
  const descInput: HeatingDescriptionInput | null = r ? { boilerLabel: r.boilerLabel, fit, flue, coreDrill, plumeKit, controls, magneticFilter, flush, removeOld, commission, condensatePump, gasPipeLm, heatingPipeLm, condensateLm } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeHeatingShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeHeating(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the system</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the system — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}<span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{hint}</span></span>
    </label>
  )
  const size = BOILER_SIZES.find(b => b.kw === boilerKw)

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
        {r && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {r && <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />}
        {onSave && r && (
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
      {!result.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {result.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {r && <HeatingSketch flue={flue} fit={fit} filter={magneticFilter} controls={controls} kw={boilerKw} />}
          {r && r.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
          ))}
          {r && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.boilerLabel}{size ? ` — suits ${size.suits}` : ''}. Radiators and towel rails are priced in the Plumbing Installation rooms, not here.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Heat source">
            <select value="combi" onChange={() => {}} style={propInput}>
              <option value="combi">{HEAT_SOURCE_LABEL.combi}</option>
            </select>
          </PropRow>
          <div style={{ fontSize: 10, color: '#94a3b8', margin: '-4px 0 2px' }}>System boiler with a cylinder, and heat pumps, come next.</div>

          <CollapsibleSection title="Boiler and fitting" borderColor="#bae6fd">
            <PropRow label="Boiler size">
              <select value={boilerKw} onChange={e => setBoilerKw(+e.target.value)} style={propInput}>
                {BOILER_SIZES.map(b => <option key={b.kw} value={b.kw}>{b.label} — £{b.price}</option>)}
              </select>
            </PropRow>
            <PropRow label="Where it goes">
              <select value={fit} onChange={e => setFit(e.target.value as FitMode)} style={propInput}>
                {(Object.keys(FIT_LABEL) as FitMode[]).map(k => <option key={k} value={k}>{FIT_LABEL[k]}</option>)}
              </select>
            </PropRow>
            {check('Remove and dispose of the old boiler', removeOld, setRemoveOld, 'Drained down and taken away')}
            {check('Commissioning and benchmark certificate', commission, setCommission, 'And the Building Regulations notification, by the Gas Safe engineer')}
          </CollapsibleSection>

          <CollapsibleSection title="Flue" borderColor="#bae6fd">
            <PropRow label="Flue">
              <select value={flue} onChange={e => setFlue(e.target.value as FlueKind)} style={propInput}>
                {(Object.keys(FLUE_LABEL) as FlueKind[]).map(k => <option key={k} value={k}>{FLUE_LABEL[k]}</option>)}
              </select>
            </PropRow>
            {flue === 'horizontal' && check('Core drill the wall and make good', coreDrill, setCoreDrill, 'For a new hole through the wall')}
            {flue !== 'existing' && check('Plume management kit', plumeKit, setPlumeKit, 'When the flue ends close to a window or boundary')}
          </CollapsibleSection>

          <CollapsibleSection title="Controls, filter and flushing" borderColor="#bae6fd">
            <PropRow label="Controls">
              <select value={controls} onChange={e => setControls(e.target.value as ControlsKind)} style={propInput}>
                {(Object.keys(CONTROLS_LABEL) as ControlsKind[]).map(k => <option key={k} value={k}>{CONTROLS_LABEL[k]}</option>)}
              </select>
            </PropRow>
            {check('Magnetic system filter', magneticFilter, setMagneticFilter, 'Normally fitted with a new boiler')}
            {check('Chemical clean of the system', flush, setFlush, 'Cleaner and inhibitor, with a charge for each radiator')}
            {flush && <PropRow label="Radiators on the system (nr)">{numInput(radiators, n => setRadiators(Math.round(n)), 0, 1)}</PropRow>}
          </CollapsibleSection>

          <CollapsibleSection title="Pipework moved with the boiler" borderColor="#bae6fd">
            <PropRow label="Gas pipework (m)">{numInput(gasPipeLm, setGasPipeLm, 0, 0.5)}</PropRow>
            <PropRow label="Flow and return pipework (m)">{numInput(heatingPipeLm, setHeatingPipeLm, 0, 0.5)}</PropRow>
            <PropRow label="Condensate pipe (m)">{numInput(condensateLm, setCondensateLm, 0, 0.5)}</PropRow>
            {check('Condensate pump', condensatePump, setCondensatePump, 'When the condensate cannot run to a drain by gravity')}
          </CollapsibleSection>

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {r && (
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

// ── A sketch: the external wall on the left, the flue through it, the boiler on the wall, the filter and controls, and the flow and return to the radiators ──
function HeatingSketch({ flue, fit, filter, controls, kw }: { flue: FlueKind; fit: FitMode; filter: boolean; controls: ControlsKind; kw: number }) {
  return (
    <svg viewBox="0 0 430 200" style={{ width: '100%', height: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={20} width={34} height={160} fill="#d6d3d1" stroke="#57534e" />
      <text x={37} y={14} fontSize={9} fill="#57534e" textAnchor="middle">Wall</text>
      <rect x={110} y={50} width={90} height={90} rx={6} fill="#e0f2fe" stroke="#0369a1" strokeWidth={2} />
      <text x={155} y={92} fontSize={11} fill="#0369a1" textAnchor="middle" fontWeight={700}>{kw}kW</text>
      <text x={155} y={108} fontSize={9} fill="#0369a1" textAnchor="middle">combi boiler</text>
      {flue === 'horizontal' && <><rect x={54} y={64} width={56} height={12} fill="#cbd5e1" stroke="#64748b" /><text x={82} y={94} fontSize={8} fill="#64748b" textAnchor="middle">flue</text></>}
      {flue === 'vertical' && <><rect x={148} y={12} width={12} height={38} fill="#cbd5e1" stroke="#64748b" /><text x={178} y={30} fontSize={8} fill="#64748b">flue to roof</text></>}
      {flue === 'existing' && <text x={82} y={70} fontSize={8} fill="#94a3b8" textAnchor="middle">existing flue</text>}
      <line x1={200} y1={75} x2={330} y2={75} stroke="#dc2626" strokeWidth={2} />
      <line x1={200} y1={115} x2={330} y2={115} stroke="#2563eb" strokeWidth={2} />
      <rect x={330} y={60} width={50} height={70} rx={3} fill="#fff" stroke="#94a3b8" />
      <text x={355} y={99} fontSize={9} fill="#64748b" textAnchor="middle">radiators</text>
      <text x={265} y={70} fontSize={8} fill="#dc2626" textAnchor="middle">flow</text>
      <text x={265} y={130} fontSize={8} fill="#2563eb" textAnchor="middle">return</text>
      {filter && <><rect x={232} y={107} width={18} height={16} fill="#fde68a" stroke="#a16207" /><text x={241} y={146} fontSize={8} fill="#a16207" textAnchor="middle">filter</text></>}
      {controls !== 'none' && <><circle cx={235} cy={165} r={9} fill="#fff" stroke="#0369a1" /><text x={252} y={168} fontSize={8} fill="#0369a1">{controls === 'smart' ? 'smart thermostat' : 'room thermostat'}</text></>}
      {fit === 'relocate' && <text x={155} y={168} fontSize={8} fill="#92400e" textAnchor="middle">new position</text>}
    </svg>
  )
}
