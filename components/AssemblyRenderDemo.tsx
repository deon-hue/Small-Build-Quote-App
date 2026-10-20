'use client'

/**
 * Assembly Calculator — External rendering, wall by wall (Plastering & Boarding → External Render (by wall)).
 * Each wall is an elevation: its length and height, windows, doors and any gable above the eaves, and what it gets (sand and cement scratch and float coats, monocouche, or a thin-coat silicone system on a mesh base
 * coat), what it goes onto (new masonry, existing render, painted masonry), beads, movement joints and an optional masonry paint. The area is worked out (openings out, reveals back in) and the materials from the area,
 * the thickness and the coverage of each product; the plasterer's time from the area times a rate of hours per unit, with a labourer to mix and carry; a wall from scaffold or hard to reach adds time. Scaffold is only
 * priced when asked for. From Take-off, the drawn wall's length is the first wall's length. The engine is lib/render-units.ts. External wall INSULATION systems are not here yet.
 */

import React, { useEffect, useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateRender, newRenderWall, wallAreas, DEFAULT_RENDER_SITUATIONS, SYSTEM_LABEL, BASE_LABEL,
  type RenderWall, type RenderResult, type RenderSystem, type RenderBase,
} from '@/lib/render-units'
import { describeRender, describeRenderShort, type RenderDescriptionInput } from '@/lib/render-description'
import { suggestRenderLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
  /** The length of the wall line drawn in Take-off, mm: the first wall's length. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
}

const SYSTEMS = Object.keys(SYSTEM_LABEL) as RenderSystem[]
const BASES = Object.keys(BASE_LABEL) as RenderBase[]
const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyRenderDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const ID = 'AssemblyRenderDemo'
  const fromLine = externalLengthMm && externalLengthMm > 0 ? +(externalLengthMm / 1000).toFixed(2) : 0
  const [name, setName] = useCalcState(ID, 'name', 'External render')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no walls, unless it comes from a wall drawn in Take-off: then that wall is the first
  const [walls, setWalls] = useCalcState<RenderWall[]>(ID, 'walls', () => (fromLine > 0 ? [newRenderWall('wall-' + uid(), 'Wall', fromLine)] : []))
  useEffect(() => {
    if (fromLine > 0) setWalls(p => (p.length === 0 ? [newRenderWall('wall-' + uid(), 'Wall', fromLine)] : p.map((w, i) => (i === 0 ? { ...w, lengthM: fromLine } : w))))
  }, [fromLine])
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'ground')
  const [scaffold, setScaffold] = useCalcState(ID, 'scaffold', false)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addWall() {
    setWalls(p => {
      const last = p[p.length - 1]
      const w = newRenderWall('wall-' + uid(), `Wall ${p.length + 1}`, last?.lengthM ?? 8)
      if (last) { w.heightM = last.heightM; w.system = last.system; w.base = last.base; w.paint = last.paint; w.coats = last.coats }
      return [...p, w]
    })
  }
  function updateWall(id: string, patch: Partial<RenderWall>) { setWalls(p => p.map(w => w.id === id ? { ...w, ...patch } : w)) }

  const result = useMemo((): { ok: true; r: RenderResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateRender({ walls, jobSituationId, situations: DEFAULT_RENDER_SITUATIONS, rates: {}, scaffold }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [walls, jobSituationId, scaffold])
  const r = result.ok ? result.r : null

  const layers: AssemblyLayerDef[] = useMemo(() => (r?.lines ?? []).map(l => ({
    id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit,
    unitCost: rateOverrides[l.id] != null ? rateOverrides[l.id] : l.unitCost, fixedQty: l.qty, wastePct: 0,
  })), [r, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  const wallCost = (id: string) => costedLines.filter(l => l.layerId.endsWith('|' + id)).reduce((s, l) => s + l.cost, 0)

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(ID, 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour, suggested from the walls and following them until edited
  const labourSuggestions: LabourSuggestion[] = r ? suggestRenderLabour(r.labour) : []
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

  // The customer's description follows the walls until it's edited by hand
  const descInput: RenderDescriptionInput | null = r ? { walls: r.walls.map(x => ({ name: x.name, parts: x.parts })), scaffold, totalAreaM2: r.totalAreaM2 } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeRenderShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeRender(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  /** a number that can be left blank to mean "worked out from the wall" */
  const autoInput = (v: number | null, set: (n: number | null) => void, auto: number) => (
    <input type="number" min={0} step={0.5} value={v ?? ''} placeholder={String(+auto.toFixed(1))} onChange={e => set(e.target.value === '' ? null : Math.max(0, +e.target.value || 0))} style={propInput} />
  )
  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the walls</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the walls — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint?: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{hint}</span>}</span>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Walls</span>
            <button type="button" onClick={addWall} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add wall</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>One for each side of the building (elevation) that is rendered. A new wall copies the last one's height and render.</span>
          </div>

          {walls.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No walls yet. Press <strong>+ Add wall</strong>, then give it a length and height, and say what it gets.
            </div>
          )}

          {walls.map((w, idx) => {
            const sum = r?.walls.find(s => s.wallId === w.id)
            const a = wallAreas(w)
            return (
              <div key={w.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input value={w.name} onChange={e => updateWall(w.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.areaM2}m² rendered` : ''}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(wallCost(w.id))}</span>
                  <button type="button" onClick={() => setWalls(p => p.filter(x => x.id !== w.id))} title="Remove this wall" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: 8 }}>
                  <PropRow label={idx === 0 && fromLine > 0 ? 'Length (m) — from the line' : 'Length (m)'}>{numInput(w.lengthM, n => updateWall(w.id, { lengthM: n }), 0, 0.1)}</PropRow>
                  <PropRow label="Height (m)">{numInput(w.heightM, n => updateWall(w.id, { heightM: n }), 0, 0.1)}</PropRow>
                  <PropRow label="Windows (nr)">{numInput(w.windows, n => updateWall(w.id, { windows: Math.round(n) }), 0, 1)}</PropRow>
                  <PropRow label="Doors (nr)">{numInput(w.doors, n => updateWall(w.id, { doors: Math.round(n) }), 0, 1)}</PropRow>
                  <PropRow label="Gable above eaves (m²)">{numInput(w.gableM2, n => updateWall(w.id, { gableM2: n }), 0, 0.5)}</PropRow>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                  <PropRow label="Render">
                    <select value={w.system} onChange={e => updateWall(w.id, { system: e.target.value as RenderSystem })} style={propInput}>
                      {SYSTEMS.map(s => <option key={s} value={s}>{SYSTEM_LABEL[s]}</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Onto">
                    <select value={w.base} onChange={e => updateWall(w.id, { base: e.target.value as RenderBase })} style={propInput}>
                      {BASES.map(b => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
                    </select>
                  </PropRow>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  <PropRow label="Area (m²) — blank = from the wall">{autoInput(w.areaOverrideM2, n => updateWall(w.id, { areaOverrideM2: n }), a.areaM2)}</PropRow>
                  <PropRow label="Beads (lm) — blank = worked out">{autoInput(w.beadsLm, n => updateWall(w.id, { beadsLm: n }), a.autoBeadsLm)}</PropRow>
                  <PropRow label="Movement joints (lm)">{numInput(w.movementJointsLm, n => updateWall(w.id, { movementJointsLm: n }), 0, 0.5)}</PropRow>
                  <PropRow label="Situation">
                    <select value={w.situationId ?? ''} onChange={e => updateWall(w.id, { situationId: e.target.value || null })} style={propInput}>
                      <option value="">Same as the job</option>
                      {DEFAULT_RENDER_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]}</option>)}
                    </select>
                  </PropRow>
                </div>
                {w.system === 'sand-cement' && (
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#475569', cursor: 'pointer' }}>
                      <input type="checkbox" checked={w.paint} onChange={e => updateWall(w.id, { paint: e.target.checked })} style={{ width: 'auto' }} />Masonry paint over the render
                    </label>
                    {w.paint && <span style={{ fontSize: 11.5, color: '#475569' }}>coats <NumInput type="number" min={1} max={4} value={w.coats} onChange={e => updateWall(w.id, { coats: Math.min(4, Math.max(1, Math.round(+e.target.value || 1))) })} style={{ ...small, width: 44 }} /></span>}
                  </div>
                )}
              </div>
            )
          })}

          {r && walls.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {walls.length} wall{walls.length === 1 ? '' : 's'}: {r.totalAreaM2}m² to render, about {r.totalPlasterHours} plasterer hours.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="Walls are">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_RENDER_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label}{s.upliftPct ? ` +${s.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the plasterer's hours. A single wall can have its own.</div>
          </CollapsibleSection>
          <CollapsibleSection title="Scaffold" borderColor="#bae6fd">
            {check('Price the scaffold for these walls', scaffold, setScaffold, 'Off by default: scaffold is usually priced once for the whole job (Site Setup), so ticking this when it is already there counts it twice.')}
          </CollapsibleSection>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates and hours — change any single line in the cost breakdown below. External wall insulation under the render is not in this calculator yet.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="rendering"
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
