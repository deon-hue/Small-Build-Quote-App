'use client'

/**
 * Assembly Calculator — Underfloor heating (Plumbing & Heating → Underfloor Heating): warm water underfloor heating priced zone by zone.
 * Each zone is a room (or part of one) with an area, how the pipe is laid (in a screed, in overlay panels, or between joists), the pipe spacing and its distance from the manifold. The pipe, loops
 * (kept to about 100m), floor fixing, manifold, actuators, thermostats, mixing group, installer's fitting and commissioning are worked out and each is its own editable line. The floor insulation, edge strip
 * and the screed over the pipes are priced in the Screeded Floor calculator, not here, and the heat source in the Heating Plant calculator. The engine is lib/ufh-units.ts.
 */

import React, { useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculateUfh, UFH_FLOORS, SPACINGS_MM, MAX_LOOP_M, type UfhFloor, type UfhZone, type UfhResult } from '@/lib/ufh-units'
import { describeUfh, describeUfhShort, type UfhDescriptionInput } from '@/lib/ufh-description'
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

const LAID: Record<UfhFloor, string> = {
  screed: 'clipped to insulation in the screed',
  overlay: 'in low-profile overlay panels',
  joisted: 'between the joists on spreader plates',
}

const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyUfhDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyUfhDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Underfloor heating')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no zones: you add the rooms it has
  const [zones, setZones] = useCalcState<UfhZone[]>(ID, 'zones', [])
  const [mixingGroup, setMixingGroup] = useCalcState(ID, 'mixingGroup', true)
  const [manifoldsOverride, setManifoldsOverride] = useCalcState<number | null>(ID, 'manifoldsOverride', null)
  const [commission, setCommission] = useCalcState(ID, 'commission', true)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addZone() {
    setZones(p => [...p, { id: 'zone-' + uid(), name: p.length === 0 ? 'Kitchen / diner' : `Zone ${p.length + 1}`, areaM2: 20, floor: p[p.length - 1]?.floor ?? 'screed', spacingMm: 150, distanceM: 5 }])
  }
  function updateZone(id: string, patch: Partial<UfhZone>) { setZones(p => p.map(z => z.id === id ? { ...z, ...patch } : z)) }

  const result = useMemo((): { ok: true; r: UfhResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateUfh({ zones, mixingGroup, manifoldsOverride, commission }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [zones, mixingGroup, manifoldsOverride, commission])
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

  // Own labour — starts empty: the installer's work is in the fitting lines
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

  // The customer's description follows the zones until it's edited by hand
  const descInput: UfhDescriptionInput | null = r ? {
    zones: r.zoneSummaries.map(s => { const z = zones.find(x => x.id === s.zoneId)!; return { name: s.name, areaM2: s.areaM2, laid: LAID[z.floor], spacingMm: z.spacingMm, loops: s.loops } }),
    totalAreaM2: r.totalAreaM2, manifolds: r.manifolds, mixingGroup, commission,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeUfhShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeUfh(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the zones</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the zones — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
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
      {r && r.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>⚠ {w}</div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Zones</span>
            <button type="button" onClick={addZone} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add zone</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>One for each room (or part of a room) with its own thermostat.</span>
          </div>

          {zones.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No zones yet. Press <strong>+ Add zone</strong> and give it an area.
            </div>
          )}

          {zones.map(z => {
            const s = r?.zoneSummaries.find(x => x.zoneId === z.id)
            const zoneCost = (r?.lines ?? []).filter(l => l.roomId === z.id).reduce((sum, l) => sum + l.qty * (rateOverrides[l.id] ?? l.unitCost), 0)
            return (
              <div key={z.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input value={z.name} onChange={e => updateZone(z.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(zoneCost)}</span>
                  <button type="button" onClick={() => setZones(p => p.filter(x => x.id !== z.id))} title="Remove this zone" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  <PropRow label="Area (m²)">{numInput(z.areaM2, n => updateZone(z.id, { areaM2: n }), 0, 0.5)}</PropRow>
                  <PropRow label="Pipe spacing (mm)">
                    <select value={z.spacingMm} onChange={e => updateZone(z.id, { spacingMm: +e.target.value })} style={propInput}>
                      {SPACINGS_MM.map(sp => <option key={sp} value={sp}>{sp}mm</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Distance to manifold (m)">{numInput(z.distanceM, n => updateZone(z.id, { distanceM: n }), 0, 0.5)}</PropRow>
                </div>
                <PropRow label="How the pipe is laid">
                  <select value={z.floor} onChange={e => updateZone(z.id, { floor: e.target.value as UfhFloor })} style={propInput}>
                    {(Object.keys(UFH_FLOORS) as UfhFloor[]).map(k => <option key={k} value={k}>{UFH_FLOORS[k].label}</option>)}
                  </select>
                </PropRow>
                {s && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>{s.pipeM}m of pipe in {s.loops} loop{s.loops === 1 ? '' : 's'} of about {s.loopM}m (kept to {MAX_LOOP_M}m): about {s.outputWM2}W/m² at this spacing.</div>}
              </div>
            )
          })}

          {r && zones.length > 0 && <ZonesDrawing zones={r.zoneSummaries} />}
          {r && r.totalAreaM2 > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.totalAreaM2}m² in {r.zoneSummaries.length} zone{r.zoneSummaries.length === 1 ? '' : 's'}: {r.totalPipeM}m of pipe in {r.totalLoops} loop{r.totalLoops === 1 ? '' : 's'}, {r.manifolds} manifold{r.manifolds === 1 ? '' : 's'}.
              The floor insulation, edge strip and screed are priced with the Screeded Floor calculator (a liquid screed is the usual one over underfloor heating).
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="Manifold, mixing and commissioning" borderColor="#bae6fd">
            <PropRow label="Manifolds">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 80 }}>{numInput(manifoldsOverride ?? (r?.manifolds ?? 0), n => setManifoldsOverride(Math.round(n)), 0, 1)}</div>
                {manifoldsOverride !== null
                  ? <button onClick={() => setManifoldsOverride(null)} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Set by you — work it out again</button>
                  : <span style={{ fontSize: 10, color: '#94a3b8' }}>from the loops (12 ports a manifold)</span>}
              </div>
            </PropRow>
            {check('Mixing group (blending valve and pump)', mixingGroup, setMixingGroup, 'Needed when a boiler runs hotter than the floor; a heat pump may not need one')}
            {check('Pressure test, balance and first heat-up', commission, setCommission, 'The pipe is tested before the screed goes over it')}
          </CollapsibleSection>

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4, ...small, border: 'none', padding: 0 }}>
            Sample rates — use your installer's own prices. Change any single line in the cost breakdown below.
          </div>
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

// ── The drawing: each zone as a bar of its area, split into its loops ──
function ZonesDrawing({ zones }: { zones: UfhResult['zoneSummaries'] }) {
  const rows = zones.length
  const max = Math.max(1, ...zones.map(z => z.areaM2))
  const rowH = 24, labelW = 130, barW = 230, vbW = labelW + barW + 90, vbH = rows * rowH + 14
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', maxHeight: 360, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4 }}>
      {zones.map((z, i) => {
        const y = 8 + i * rowH
        const w = (z.areaM2 / max) * barW
        return (
          <g key={z.zoneId}>
            <text x={labelW - 6} y={y + 12} fontSize={10} fill="#334155" textAnchor="end">{z.name.length > 20 ? z.name.slice(0, 19) + '…' : z.name}</text>
            {Array.from({ length: z.loops }).map((_, k) => (
              <rect key={k} x={labelW + (k * w) / z.loops} y={y} width={Math.max(w / z.loops - 1, 1)} height={rowH - 8} fill={['#dc2626', '#ea580c', '#d97706', '#b91c1c'][k % 4]} rx={2}><title>{z.name}: loop {k + 1} of {z.loops}</title></rect>
            ))}
            <text x={labelW + w + 6} y={y + 12} fontSize={10} fill="#475569">{z.areaM2}m² · {z.loops} loop{z.loops === 1 ? '' : 's'}</text>
          </g>
        )
      })}
    </svg>
  )
}
