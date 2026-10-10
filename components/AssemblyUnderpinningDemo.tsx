'use client'

/**
 * Assembly Calculator — Underpinning (traditional mass concrete in pins), drawn as a line (Foundations → Underpinning).
 *
 * A short section (pin) at a time under an existing wall: hand-dug under the old footing, the soil barrowed to skips, the open face shuttered, filled with
 * mass concrete to just below the old footing and the gap dry-packed. All by hand, so the dig is labour (no machine). Optional: props and needles holding
 * the wall above, and steel in the pins. Counts, areas and volumes only — the depth, width, pin sequence and temporary works are the engineer's design.
 * The engine is lib/underpinning.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculateUnderpinningGeometry, type UnderpinningInput, type UnderpinningGeometry } from '@/lib/underpinning'
import { describeUnderpinning, describeUnderpinningShort } from '@/lib/underpinning-description'
import { suggestUnderpinningLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'

// Sample rates, like every calculator here — editable per line in the breakdown until Back Office products and plant replace them.
// Small loads of ready-mix cost more per m³ than a big pour, so these are dearer than the other foundation calculators'.
const MIXES = { C20: { label: 'C20', cost: 128 }, C25: { label: 'C25 (usual for underpinning)', cost: 135 }, C30: { label: 'C30', cost: 145 } } as const
type Mix = keyof typeof MIXES
const SKIP_COST = 260
const DRY_PACK_PER_M3 = 210     // sand and cement, mixed dry
const FORMWORK_PER_M2 = 9
const REBAR_PER_KG = 0.95
const PROP_PER_WEEK = 10        // an Acrow prop or needle, per week

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** The length of the wall line drawn in Take-off, in mm. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
}

function buildUnderpinLayers(g: UnderpinningGeometry, o: { mix: Mix; wastePct: number }): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }

  L.push(fixed({ id: 'skips', name: 'Skips for the soil from the pins (8-yard, taken away full)', category: 'other', unit: 'skip', unitCost: SKIP_COST, roundToWhole: true, qty: g.skipCount }))
  L.push(fixed({ id: 'concrete', name: `Ready-mixed concrete ${o.mix} (mass concrete in the pins, small loads)`, category: 'materials', unit: 'm³', unitCost: MIXES[o.mix].cost, wastePct: Math.max(w, 5), qty: g.concreteM3 }))
  L.push(fixed({ id: 'dry_pack', name: 'Dry pack mortar (sand and cement) between the pin and the old footing', category: 'materials', unit: 'm³', unitCost: DRY_PACK_PER_M3, wastePct: w, qty: g.dryPackM3 }))
  L.push(fixed({ id: 'formwork', name: 'Shuttering to the open face of each pin (ply and timber, reused)', category: 'materials', unit: 'm²', unitCost: FORMWORK_PER_M2, qty: g.formworkM2 }))
  if (g.rebarKg > 0) L.push(fixed({ id: 'rebar', name: 'Reinforcement steel in the pins', category: 'materials', unit: 'kg', unitCost: REBAR_PER_KG, wastePct: 5, qty: g.rebarKg }))
  if (g.propWeeks > 0) L.push(fixed({ id: 'props', name: 'Props and needles holding the wall above (hire, per prop per week)', category: 'plant', unit: 'prop-week', unitCost: PROP_PER_WEEK, qty: g.propWeeks }))
  return L
}

export default function AssemblyUnderpinningDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName]         = useState('Underpinning')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 8000)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  const [pinLengthMm, setPinLengthMm] = useState(1000)
  const [pinWidthMm, setPinWidthMm]   = useState(600)
  const [depthMm, setDepthMm]   = useState(1200)
  const [dryPackMm, setDryPackMm] = useState(75)
  const [mix, setMix]           = useState<Mix>('C25')
  const [rebarOn, setRebarOn]   = useState(false)
  const [rebarKg, setRebarKg]   = useState(60)
  const [supportOn, setSupportOn] = useState(false)   // props and needles are an option, not in the starting price
  const [props, setProps]       = useState(4)
  const [weeks, setWeeks]       = useState(2)
  const [wastePct, setWastePct] = useState(10)
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const input: UnderpinningInput = { lengthMm, pinLengthMm, pinWidthMm, depthMm, dryPackMm, rebarKgPerM3: rebarOn ? rebarKg : 0, support: supportOn ? { props, weeks } : null }
  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateUnderpinningGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, pinLengthMm, pinWidthMm, depthMm, dryPackMm, rebarOn, rebarKg, supportOn, props, weeks])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildUnderpinLayers(g, { mix, wastePct }).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, mix, wastePct, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour — suggested from the pins, following them until edited
  const labourSuggestions: LabourSuggestion[] = g ? suggestUnderpinningLabour({
    digM3: g.digM3, pinCount: g.pinCount, formworkM2: g.formworkM2, concreteM3: g.concreteM3, rebarKg: g.rebarKg,
  }) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useState<LabourLine[] | null>(null)
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

  // The customer's description follows the pins until it's edited by hand
  const descInput = g ? { lengthM: g.lengthM, pinCount: g.pinCount, pinLengthMm, pinWidthMm, depthMm, dryPackMm, concreteMix: mix, rebar: rebarOn && rebarKg > 0, support: supportOn } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describeUnderpinningShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeUnderpinning(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the underpinning</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the underpinning — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the underpinning</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint?: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8' }}>{hint}</span>}</span>
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
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))} style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
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
            <UnderpinSectionSvg depthMm={depthMm} dryPackMm={dryPackMm} pinWidthMm={pinWidthMm} support={supportOn} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.lengthM.toFixed(2)}m of wall in {g.pinCount} pin{g.pinCount === 1 ? '' : 's'} (about {g.programmeDays} working days at a pin a day, the pins worked in sequence). Dug by hand {g.digM3.toFixed(2)} m³,
              soil away {g.spoilAwayM3.toFixed(2)} m³ bulked ({g.skipCount} skip{g.skipCount === 1 ? '' : 's'}). Concrete {g.concreteM3.toFixed(2)} m³, shuttering {g.formworkM2.toFixed(1)} m².
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Length of wall (mm) — from the line drawn">{numInput(lengthMm, setLengthMm, 1)}</PropRow>

          <CollapsibleSection title="The pins" borderColor="#bae6fd">
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Pin length (mm)">{numInput(pinLengthMm, setPinLengthMm, 1)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Pin width (mm)">{numInput(pinWidthMm, setPinWidthMm, 1)}</PropRow></div>
            </div>
            <PropRow label="Depth below the old footing (mm)">{numInput(depthMm, setDepthMm, 1)}</PropRow>
            <PropRow label="Dry-pack gap under the old footing (mm)">{numInput(dryPackMm, setDryPackMm, 0)}</PropRow>
            <PropRow label="Concrete mix">
              <select value={mix} onChange={e => setMix(e.target.value as Mix)} style={propInput}>
                {(Object.keys(MIXES) as Mix[]).map(k => <option key={k} value={k}>{MIXES[k].label}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Options" borderColor="#bae6fd">
            {check('Props and needles holding the wall above', supportOn, setSupportOn, 'Only if the engineer has specified temporary support')}
            {supportOn && (
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}><PropRow label="Props">{numInput(props, setProps, 0)}</PropRow></div>
                <div style={{ flex: 1 }}><PropRow label="Weeks on hire">{numInput(weeks, setWeeks, 0)}</PropRow></div>
              </div>
            )}
            {check('Reinforcement in the pins', rebarOn, setRebarOn, 'Only if the engineer has specified it')}
            {rebarOn && <PropRow label="Steel (kg per m³ of concrete)">{numInput(rebarKg, setRebarKg, 0)}</PropRow>}
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="underpinning"
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

// ── A section through a pin: the wall and its old footing above, the new concrete below it, and the dry pack between ──
function UnderpinSectionSvg({ depthMm, dryPackMm, pinWidthMm, support }: { depthMm: number; dryPackMm: number; pinWidthMm: number; support: boolean }) {
  const vbW = 430, vbH = 300
  const k = Math.min(150 / Math.max(depthMm, 300), 0.3)
  const cx = 215, groundY = 60
  const footW = Math.max(pinWidthMm * k * 0.8, 40), footH = 22, wallW = 36
  const pinW = Math.max(pinWidthMm * k, 56), pinH = Math.max(depthMm * k, 40), packH = Math.max(dryPackMm * k, 4)
  const footTop = groundY + 40, footBottom = footTop + footH
  const pinTop = footBottom, pinBottom = pinTop + pinH
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={groundY} width={vbW - 40} height={vbH - groundY - 10} fill="#e7e5e4" />
      <line x1={20} x2={vbW - 20} y1={groundY} y2={groundY} stroke="#78716c" strokeWidth={1.5} />
      <text x={vbW - 24} y={groundY - 5} fontSize={9} fill="#78716c" textAnchor="end">Ground level</text>
      <rect x={cx - wallW / 2} y={groundY - 38} width={wallW} height={footTop - groundY + 38} fill="#fca5a5" stroke="#57534e" />
      <text x={cx + wallW / 2 + 8} y={groundY - 20} fontSize={9} fill="#57534e">Existing wall</text>
      <rect x={cx - footW / 2} y={footTop} width={footW} height={footH} fill="#d6d3d1" stroke="#57534e" />
      <text x={cx + footW / 2 + 8} y={footTop + footH / 2 + 3} fontSize={9} fill="#57534e">Existing footing</text>
      <rect x={cx - pinW / 2} y={pinTop} width={pinW} height={pinH} fill="#f5f5f4" stroke="#78716c" />
      <rect x={cx - pinW / 2} y={pinTop + packH} width={pinW} height={pinH - packH} fill="#c7c4bf" stroke="#57534e" strokeWidth={1.4} />
      <rect x={cx - pinW / 2} y={pinTop} width={pinW} height={packH} fill="#fde68a" stroke="#ca8a04" />
      <text x={cx + pinW / 2 + 8} y={pinTop + packH + 2} fontSize={9} fill="#854d0e">Dry pack {dryPackMm}</text>
      <text x={cx} y={pinTop + pinH / 2 + 14} fontSize={10} fill="#292524" textAnchor="middle">New concrete pin</text>
      {support && <><line x1={cx - wallW / 2 - 40} x2={cx - wallW / 2} y1={footTop + 30} y2={footTop - 4} stroke="#b45309" strokeWidth={3} /><text x={cx - wallW / 2 - 44} y={footTop + 40} fontSize={9} fill="#b45309" textAnchor="end">Prop / needle</text></>}
      <line x1={cx - pinW / 2 - 24} x2={cx - pinW / 2 - 24} y1={pinTop} y2={pinBottom} stroke="#2563eb" />
      <text x={cx - pinW / 2 - 30} y={(pinTop + pinBottom) / 2 + 3} fontSize={10} fill="#2563eb" textAnchor="end">{depthMm}</text>
    </svg>
  )
}
