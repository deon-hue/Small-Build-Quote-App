'use client'

/**
 * Assembly Calculator — Underground drainage, priced by the run (Drainage & Services → Underground Drainage (by run)).
 * Each run is a length of drain with a use, a pipe size, an average trench depth, how it is dug and what it crosses. The trench (by machine or by hand), the pipe, the granular bed and surround,
 * the backfill and soil taken away, trench support for the deeper runs, and putting the surface back are worked out from that; the digger is priced in days on site (with fuel and delivery), as in the
 * foundation calculators. Chambers and manholes, rodding eyes, connections to an existing drain or the sewer and a CCTV survey are counted for the job. The engine is lib/drain-units.ts.
 */

import React, { useEffect, useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateDrain, DRAIN_USE_LABEL, DRAIN_SIZES_MM, DRAIN_PIPE, SURFACE_LABEL, CHAMBERS,
  type DrainRun, type DrainUse, type DigMethod, type Surface, type ChamberKind, type DrainResult,
} from '@/lib/drain-units'
import { describeDrain, describeDrainShort, type DrainDescriptionInput } from '@/lib/drain-description'
import { suggestUndergroundDrainageLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
  /** The length of the drain line drawn in Take-off, mm: the first run's length. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
}

const USE_COLOUR: Record<DrainUse, string> = { foul: '#92400e', surface: '#2563eb', combined: '#7c3aed' }
export const CHAMBER_KINDS = Object.keys(CHAMBERS) as ChamberKind[]
export const CHAMBER_WORDS: Record<ChamberKind, [string, string]> = {
  'ic-shallow': ['shallow inspection chamber', 'shallow inspection chambers'], 'ic-deep': ['deeper inspection chamber', 'deeper inspection chambers'], manhole: ['manhole', 'manholes'], 'rodding-eye': ['rodding eye', 'rodding eyes'],
}
const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyDrainageDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const ID = 'AssemblyDrainageDemo'
  const fromLine = externalLengthMm && externalLengthMm > 0 ? +(externalLengthMm / 1000).toFixed(2) : 0
  const firstRun = (lengthM: number): DrainRun => ({ id: 'run-' + uid(), name: 'Drain run', use: 'foul', size: 110, lengthM, depthMm: 900, dig: 'machine', surface: 'soft' })
  const [name, setName] = useCalcState(ID, 'name', 'Underground drainage')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no runs: you add the ones it has
  // The job starts with no runs, unless it comes from a drain drawn in Take-off: then that drawn line is the first run, and follows the drawing
  const [runs, setRuns] = useCalcState<DrainRun[]>(ID, 'runs', () => (fromLine > 0 ? [firstRun(fromLine)] : []))
  useEffect(() => {
    if (fromLine > 0) setRuns(p => (p.length === 0 ? [firstRun(fromLine)] : p.map((r, i) => (i === 0 ? { ...r, lengthM: fromLine } : r))))
  }, [fromLine]) // eslint-disable-line react-hooks/exhaustive-deps
  const [chambers, setChambers] = useCalcState<Record<ChamberKind, number>>(ID, 'chambers', { 'ic-shallow': 0, 'ic-deep': 0, manhole: 0, 'rodding-eye': 0 })
  const [connectExisting, setConnectExisting] = useCalcState(ID, 'connectExisting', 0)
  const [connectSewer, setConnectSewer] = useCalcState(ID, 'connectSewer', 0)
  const [cctv, setCctv] = useCalcState(ID, 'cctv', false)
  const [importBackfill, setImportBackfill] = useCalcState(ID, 'importBackfill', false)
  const [diggerDays, setDiggerDays] = useCalcState<number | null>(ID, 'diggerDays', null)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addRun() {
    setRuns(p => {
      const last = p[p.length - 1]
      return [...p, { id: 'run-' + uid(), name: '', use: last?.use ?? 'foul', size: last?.size ?? 110, lengthM: 10, depthMm: last?.depthMm ?? 900, dig: last?.dig ?? 'machine', surface: last?.surface ?? 'soft' }]
    })
  }
  function updateRun(id: string, patch: Partial<DrainRun>) { setRuns(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }

  const result = useMemo((): { ok: true; r: DrainResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateDrain({ runs, chambers, connectExisting, connectSewer, cctv, importBackfill }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [runs, chambers, connectExisting, connectSewer, cctv, importBackfill])
  const r = result.ok ? result.r : null

  const layers: AssemblyLayerDef[] = useMemo(() => {
    if (!r) return []
    const L: AssemblyLayerDef[] = []
    if (r.excavatorDays > 0) L.push(...diggerLayers(planDigger(r.excavatorDays, diggerDays), 'digging the drain trenches', 'Mini excavator with operator'))
    for (const l of r.lines) L.push({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: l.wastePct ?? 0 })
    return L.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [r, diggerDays, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  const runCost = (id: string) => costedLines.filter(l => l.layerId.endsWith('|' + id)).reduce((s, l) => s + l.cost, 0)

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(ID, 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour, suggested from the runs and following them until edited
  const labourSuggestions: LabourSuggestion[] = r ? suggestUndergroundDrainageLabour({
    layLm: r.totalLm, handDigM3: r.handM3, gravelM3: r.gravelM3, backfillM3: r.backfillM3, softM2: r.reinstateM2.soft, pavingM2: r.reinstateM2.paving, tarmacM2: r.reinstateM2.tarmac, concreteM2: r.reinstateM2.concrete,
    shallowIc: chambers['ic-shallow'] ?? 0, deepIc: chambers['ic-deep'] ?? 0, manholes: chambers.manhole ?? 0, roddingEyes: chambers['rodding-eye'] ?? 0,
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
  const priced = runs.filter(x => x.lengthM > 0 && DRAIN_PIPE[x.size] && x.depthMm >= 300)
  const descInput: DrainDescriptionInput | null = r ? {
    runs: priced.map(x => ({ name: x.name.trim() || `${DRAIN_USE_LABEL[x.use]} drain`, what: `${x.size}mm ${DRAIN_USE_LABEL[x.use].toLowerCase()}`, lengthM: x.lengthM, depthMm: x.depthMm, dug: x.dig === 'machine' ? 'by machine' : 'by hand', crosses: SURFACE_LABEL[x.surface].split(' (')[0].toLowerCase() })),
    totalLm: r.totalLm, chambers: CHAMBER_KINDS.filter(k => (chambers[k] ?? 0) > 0).map(k => `${chambers[k]} ${chambers[k] === 1 ? CHAMBER_WORDS[k][0] : CHAMBER_WORDS[k][1]}`),
    connectExisting, connectSewer, cctv, importBackfill,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeDrainShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeDrain(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
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
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Drain runs</span>
            <button type="button" onClick={addRun} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add run</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>One for each length of drain with its own size, depth or surface.</span>
          </div>

          {runs.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No runs yet. Press <strong>+ Add run</strong>, then give it a length and the average depth of the trench.
            </div>
          )}

          {runs.map(x => {
            const pipe = DRAIN_PIPE[x.size]
            return (
              <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: USE_COLOUR[x.use], flexShrink: 0 }} />
                  <input value={x.name} onChange={e => updateRun(x.id, { name: e.target.value })} placeholder={`What it is, e.g. foul drain to the sewer`} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(runCost(x.id))}</span>
                  <button type="button" onClick={() => setRuns(p => p.filter(y => y.id !== x.id))} title="Remove this run" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  <PropRow label="Use">
                    <select value={x.use} onChange={e => updateRun(x.id, { use: e.target.value as DrainUse })} style={propInput}>
                      {(Object.keys(DRAIN_USE_LABEL) as DrainUse[]).map(u => <option key={u} value={u}>{DRAIN_USE_LABEL[u]}</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Pipe size">
                    <select value={x.size} onChange={e => updateRun(x.id, { size: +e.target.value })} style={propInput}>
                      {DRAIN_SIZES_MM.map(s => <option key={s} value={s}>{s}mm</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Length (m)">{numInput(x.lengthM, n => updateRun(x.id, { lengthM: n }), 0, 0.5)}</PropRow>
                  <PropRow label="Average trench depth (mm)">{numInput(x.depthMm, n => updateRun(x.id, { depthMm: n }), 0, 50)}</PropRow>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <PropRow label="Dug">
                    <select value={x.dig} onChange={e => updateRun(x.id, { dig: e.target.value as DigMethod })} style={propInput}>
                      <option value="machine">By machine</option><option value="hand">By hand</option>
                    </select>
                  </PropRow>
                  <PropRow label="It crosses">
                    <select value={x.surface} onChange={e => updateRun(x.id, { surface: e.target.value as Surface })} style={propInput}>
                      {(Object.keys(SURFACE_LABEL) as Surface[]).map(s => <option key={s} value={s}>{SURFACE_LABEL[s]}</option>)}
                    </select>
                  </PropRow>
                </div>
                {pipe && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>Trench {(pipe.trench * 1000).toFixed(0)}mm wide: about {(pipe.trench * x.depthMm / 1000).toFixed(2)} m³ dug for each metre.</div>}
              </div>
            )
          })}

          {r && r.totalLm > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.totalLm}m of drain: {r.machineM3 + r.handM3} m³ dug ({r.machineM3} m³ by machine over {r.excavatorDays} day{r.excavatorDays === 1 ? '' : 's'}, {r.handM3} m³ by hand), {r.gravelM3} m³ of bed and surround, {r.backfillM3} m³ of backfill, {r.spoilAwayM3} m³ of soil taken away{r.supportDays > 0 ? `, ${r.supportDays} day${r.supportDays === 1 ? '' : 's'} of trench support` : ''}.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="Chambers and manholes" borderColor="#bae6fd">
            {CHAMBER_KINDS.map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{CHAMBERS[k].label}</span>
                <NumInput type="number" min={0} value={chambers[k] ?? 0} onChange={e => setChambers(p => ({ ...p, [k]: Math.max(0, Math.round(+e.target.value || 0)) }))} style={{ fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, width: 46, textAlign: 'right', boxSizing: 'border-box' }} />
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Connections and survey" borderColor="#bae6fd">
            <PropRow label="Connections to an existing drain (nr)">{numInput(connectExisting, n => setConnectExisting(Math.round(n)), 0, 1)}</PropRow>
            <PropRow label="Connections to the public sewer (nr)">{numInput(connectSewer, n => setConnectSewer(Math.round(n)), 0, 1)}</PropRow>
            {check('CCTV survey of the new drain', cctv, setCctv, 'With a report, for Building Control or the water company')}
          </CollapsibleSection>

          <CollapsibleSection title="Backfill" borderColor="#bae6fd">
            {check('Take all the soil away and import granular backfill', importBackfill, setImportBackfill, 'Otherwise the trench is backfilled with what came out, and only the surplus goes')}
          </CollapsibleSection>

          {r && r.excavatorDays > 0 && <DiggerOnSiteSection diggingDays={r.excavatorDays} daysOnSite={diggerDays} onDaysOnSite={setDiggerDays} />}

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates — change any single line in the cost breakdown below.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="drainage"
        />
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
