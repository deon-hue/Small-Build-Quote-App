'use client'

/**
 * Assembly Calculator — Pipework runs (Plumbing & Heating → Pipework Runs): pipework priced by the run, for the lengths a fitting's all-in price in the Plumbing Installation calculator does not cover.
 * Each run has a kind of pipe (cold, hot, heating flow and return, gas, waste, soil), a size, a material, a length and how it is routed; the price per metre is the installer's all-in rate (pipe,
 * fittings, clips and fixing), multiplied for the route and with the job's situation uplift added, with optional lagging. Extras are isolation valves, pipe boxing and a pressure test.
 * Counts and prices only: pipe sizes and falls are the plumber's to confirm and gas pipework is a Gas Safe engineer's. The engine is lib/pipework-units.ts.
 */

import React, { useEffect, useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculatePipework, RUN_TYPES, ROUTE_LABEL, DEFAULT_SITUATIONS, RUN_RATES, ROUTE_FACTOR, LAGGING_RATE,
  type PipeRun, type RunType, type PipeMaterial, type Route, type Situation, type PipeworkResult,
} from '@/lib/pipework-units'
import { describePipework, describePipeworkShort, type PipeworkDescriptionInput } from '@/lib/pipework-description'
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
  /** The length of the pipe line drawn in Take-off, mm: the first run's length. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
}

const TYPE_COLOUR: Record<RunType, string> = { cold: '#2563eb', hot: '#dc2626', heating: '#ea580c', gas: '#ca8a04', waste: '#64748b', soil: '#57534e' }
export const ROUTED_WORDS: Record<Route, string> = {
  surface: 'clipped on the surface', void: 'run in the floor or ceiling void', chased: 'chased into the wall', screed: 'buried in the screed, sleeved', external: 'run outside, clipped to the wall',
}
const TYPES = Object.keys(RUN_TYPES) as RunType[]
const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyPipeworkDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const fromLine = externalLengthMm && externalLengthMm > 0 ? +(externalLengthMm / 1000).toFixed(2) : 0
  const firstRun = (lengthM: number): PipeRun => ({ id: 'run-' + uid(), name: 'Pipe run', type: 'cold', size: 15, material: 'copper', lengthM, route: 'surface', lagged: false })
  const ID = 'AssemblyPipeworkDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Pipework')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no runs: you add the ones it has
  // The job starts with no runs, unless it comes from a pipe drawn in Take-off: then that drawn line is the first run, and follows the drawing
  const [runs, setRuns] = useCalcState<PipeRun[]>(ID, 'runs', () => (fromLine > 0 ? [firstRun(fromLine)] : []))
  useEffect(() => {
    if (fromLine > 0) setRuns(p => (p.length === 0 ? [firstRun(fromLine)] : p.map((r, i) => (i === 0 ? { ...r, lengthM: fromLine } : r))))
  }, [fromLine]) // eslint-disable-line react-hooks/exhaustive-deps
  const [valves, setValves] = useCalcState(ID, 'valves', 0)
  const [boxingLm, setBoxingLm] = useCalcState(ID, 'boxingLm', 0)
  const [pressureTest, setPressureTest] = useCalcState(ID, 'pressureTest', true)
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'new-build')
  const [situations, setSituations] = useCalcState<Situation[]>(ID, 'situations', DEFAULT_SITUATIONS)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addRun() {
    setRuns(p => [...p, { id: 'run-' + uid(), name: '', type: p[p.length - 1]?.type ?? 'cold', size: p[p.length - 1]?.size ?? 15, material: p[p.length - 1]?.material ?? 'copper', lengthM: 10, route: 'surface', lagged: false }])
  }
  function updateRun(id: string, patch: Partial<PipeRun>) {
    setRuns(p => p.map(r => {
      if (r.id !== id) return r
      const next = { ...r, ...patch }
      // changing the kind of pipe moves the size and material to ones it comes in
      if (patch.type && patch.type !== r.type) {
        const info = RUN_TYPES[patch.type]
        if (!info.sizes.includes(next.size)) next.size = info.sizes[0]
        if (!info.materials.includes(next.material)) next.material = info.materials[0]
        if (!info.lagging) next.lagged = false
      }
      return next
    }))
  }

  const result = useMemo((): { ok: true; r: PipeworkResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculatePipework({ runs, valves, boxingLm, pressureTest, jobSituationId, situations }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [runs, valves, boxingLm, pressureTest, jobSituationId, situations])
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

  // Own labour — starts empty: the installer's work is in the per-metre prices
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

  // The customer's description follows the runs until it's edited by hand
  const priced = runs.filter(x => x.lengthM > 0)
  const descInput: PipeworkDescriptionInput | null = r ? {
    runs: priced.map(x => ({ name: x.name.trim() || RUN_TYPES[x.type].label, what: `${x.size}mm ${x.material} ${RUN_TYPES[x.type].short}`, lengthM: x.lengthM, routed: ROUTED_WORDS[x.route], lagged: x.lagged && RUN_TYPES[x.type].lagging })),
    totalLm: r.totalLm, valves, boxingLm, pressureTest, hasGas: r.lmByType.gas > 0,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describePipeworkShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describePipework(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the runs</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the runs — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
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
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Runs</span>
            <button type="button" onClick={addRun} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add run</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Lengths the room fittings do not cover: long hot and cold runs, heating circuits, gas, waste and soil.</span>
          </div>

          {runs.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No runs yet. Press <strong>+ Add run</strong>, pick the kind of pipe and give it a length.
            </div>
          )}

          {runs.map(x => {
            const info = RUN_TYPES[x.type]
            const base = RUN_RATES[x.type][x.material]?.[x.size]
            const perM = base === undefined ? 0 : base * ROUTE_FACTOR[x.route] * (1 + (situations.find(s => s.id === jobSituationId)?.upliftPct ?? 0) / 100)
            const runCost = (r?.lines ?? []).filter(l => l.runId === x.id).reduce((s, l) => s + l.qty * (rateOverrides[l.id] ?? l.unitCost), 0)
            return (
              <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE_COLOUR[x.type], flexShrink: 0 }} />
                  <input value={x.name} onChange={e => updateRun(x.id, { name: e.target.value })} placeholder={`What it is, e.g. ${info.label.toLowerCase()} to the loft bathroom`} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(runCost)}</span>
                  <button type="button" onClick={() => setRuns(p => p.filter(y => y.id !== x.id))} title="Remove this run" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  <PropRow label="Kind of pipe">
                    <select value={x.type} onChange={e => updateRun(x.id, { type: e.target.value as RunType })} style={propInput}>
                      {TYPES.map(t => <option key={t} value={t}>{RUN_TYPES[t].label}</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Size (mm)">
                    <select value={x.size} onChange={e => updateRun(x.id, { size: +e.target.value })} style={propInput}>
                      {info.sizes.map(s => <option key={s} value={s}>{s}mm</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Material">
                    <select value={x.material} onChange={e => updateRun(x.id, { material: e.target.value as PipeMaterial })} style={propInput}>
                      {info.materials.map(m => <option key={m} value={m}>{m === 'copper' ? 'Copper' : 'Plastic'}</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Length (m)">{numInput(x.lengthM, n => updateRun(x.id, { lengthM: n }), 0, 0.5)}</PropRow>
                </div>
                <PropRow label="How it is routed">
                  <select value={x.route} onChange={e => updateRun(x.id, { route: e.target.value as Route })} style={propInput}>
                    {(Object.keys(ROUTE_LABEL) as Route[]).map(k => <option key={k} value={k}>{ROUTE_LABEL[k]}{ROUTE_FACTOR[k] !== 1 ? ` (+${Math.round((ROUTE_FACTOR[k] - 1) * 100)}%)` : ''}</option>)}
                  </select>
                </PropRow>
                {info.lagging && check('Lagged', x.lagged, b => updateRun(x.id, { lagged: b }), `Pipe insulation, £${(LAGGING_RATE[x.size] ?? 3).toFixed(2)} a metre`)}
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>About £{perM.toFixed(2)} a metre, all in{info.note ? `. ${info.note}` : ''}</div>
              </div>
            )
          })}

          {r && r.totalLm > 0 && <RunsDrawing runs={priced} />}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Situation for the whole job">
            <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
              {situations.map(s => <option key={s.id} value={s.id}>{s.label} ({s.upliftPct >= 0 ? '+' : ''}{s.upliftPct}%)</option>)}
            </select>
          </PropRow>

          <CollapsibleSection title="Extras" borderColor="#bae6fd">
            <PropRow label="Isolation valves (nr)">{numInput(valves, n => setValves(Math.round(n)), 0, 1)}</PropRow>
            <PropRow label="Boxing in the pipework (m)">{numInput(boxingLm, setBoxingLm, 0, 0.5)}</PropRow>
            {check('Pressure test', pressureTest, setPressureTest, 'Test the pipework before it is covered')}
          </CollapsibleSection>

          <CollapsibleSection title="Situations (the % added to the pipe)" borderColor="#bae6fd">
            {situations.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{s.label}</span>
                <NumInput type="number" step={1} value={s.upliftPct} onChange={e => setSituations(p => p.map(y => y.id === s.id ? { ...y, upliftPct: +e.target.value || 0 } : y))} style={{ ...small, width: 54, textAlign: 'right' }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
              </div>
            ))}
          </CollapsibleSection>

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates — use your plumber's own prices. Change any single line in the cost breakdown below.</div>
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

// ── The drawing: each run as a bar of its length, coloured by kind of pipe ──
function RunsDrawing({ runs }: { runs: PipeRun[] }) {
  const rows = runs.length
  const max = Math.max(1, ...runs.map(x => x.lengthM))
  const rowH = 24, labelW = 150, barW = 220, vbW = labelW + barW + 70, vbH = rows * rowH + 14
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', maxHeight: 360, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4 }}>
      {runs.map((x, i) => {
        const y = 8 + i * rowH
        const w = (x.lengthM / max) * barW
        const label = x.name.trim() || RUN_TYPES[x.type].label
        return (
          <g key={x.id}>
            <text x={labelW - 6} y={y + 12} fontSize={10} fill="#334155" textAnchor="end">{label.length > 24 ? label.slice(0, 23) + '…' : label}</text>
            <rect x={labelW} y={y} width={Math.max(w, 1)} height={rowH - 8} fill={TYPE_COLOUR[x.type]} rx={2}><title>{RUN_TYPES[x.type].label} {x.size}mm: {x.lengthM}m</title></rect>
            <text x={labelW + w + 6} y={y + 12} fontSize={10} fill="#475569">{x.lengthM}m · {x.size}mm</text>
          </g>
        )
      })}
    </svg>
  )
}
