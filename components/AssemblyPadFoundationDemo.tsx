'use client'

/**
 * Assembly Calculator — Pad foundations (Foundations → Pad Foundations). No drawn geometry: how many pads there are and their size are typed here
 * (Take-off's shape for it is only a placemarker, as for rooflights).
 *
 * All the pads start the same size; further groups of a different size can be added. For each: the pit, the blinding under it, optional formwork to
 * the sides, optional reinforcement (steel per m³ of concrete) and column starters, the concrete and the soil. The digging is a machine with its
 * operator. Counts and volumes only — pad size, depth and reinforcement are the engineer's design. The engine is lib/pad-foundation.ts.
 */

import React, { useMemo, useState } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculatePadFoundationGeometry, type PadFoundationInput, type PadFoundationGeometry, type PadGroup } from '@/lib/pad-foundation'
import { describePadFoundation, describePadFoundationShort } from '@/lib/pad-foundation-description'
import { suggestPadFoundationLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import { costFromBasics, type PricedFromBasics } from '@/components/assembly-basics-pricing'
import type { AssemblyBasics } from '@/lib/assembly-basics'

// Sample rates, like every calculator here — editable per line in the breakdown until Back Office products and plant replace them.
const MIXES = { C25: { label: 'C25', cost: 105 }, C30: { label: 'C30 (usual for pads)', cost: 112 }, C35: { label: 'C35', cost: 120 } } as const
type Mix = keyof typeof MIXES
const EXCAVATOR_PER_DAY = 260   // a mini excavator and its operator
const MUCKAWAY_PER_M3 = 28      // grab lorry and tip, per m³ of bulked soil
const PLATE_PER_DAY = 40
const BLINDING_PER_M3 = 95      // C10 blinding concrete
const FORMWORK_PER_M2 = 9
const REBAR_PER_KG = 0.95
const STARTER_PER_PAD = 22

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** Sizes the AI quote heard: the calculator opens with them, so it matches what the AI priced. */
  initial?: AssemblyBasics
}

let groupSeq = 0
const newGroup = (count: number, l: number, w: number, d: number): PadGroup => ({ id: 'pad-g-' + ++groupSeq, count, lengthMm: l, widthMm: w, depthMm: d })

function buildPadLayers(g: PadFoundationGeometry, o: { mix: Mix; wastePct: number; formwork: boolean }): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }

  L.push(fixed({ id: 'excavator', name: 'Mini excavator with operator — digging the pits', category: 'plant', unit: 'day', unitCost: EXCAVATOR_PER_DAY, qty: g.excavatorDays }))
  L.push(fixed({ id: 'spoil', name: 'Spoil carted away (grab lorry and tip, soil bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: g.spoilAwayM3 }))
  if (g.blindingM3 > 0) L.push(fixed({ id: 'blinding', name: 'Blinding concrete C10 under each pad', category: 'materials', unit: 'm³', unitCost: BLINDING_PER_M3, wastePct: Math.max(w, 5), qty: g.blindingM3 }))
  if (o.formwork && g.formworkM2 > 0) L.push(fixed({ id: 'formwork', name: 'Formwork to the pad sides (ply and timber, reused)', category: 'materials', unit: 'm²', unitCost: FORMWORK_PER_M2, qty: g.formworkM2 }))
  if (g.rebarKg > 0) L.push(fixed({ id: 'rebar', name: 'Reinforcement steel, cut and bent', category: 'materials', unit: 'kg', unitCost: REBAR_PER_KG, wastePct: 5, qty: g.rebarKg }))
  if (g.starterCount > 0) L.push(fixed({ id: 'starters', name: 'Holding-down bolts / column starter bars, one set per pad', category: 'materials', unit: 'nr', unitCost: STARTER_PER_PAD, roundToWhole: true, qty: g.starterCount }))
  L.push(fixed({ id: 'concrete', name: `Ready-mixed concrete ${o.mix} (the pads)`, category: 'materials', unit: 'm³', unitCost: MIXES[o.mix].cost, wastePct: Math.max(w, 5), qty: g.concreteM3 }))
  if (g.plateDays > 0) L.push(fixed({ id: 'plate', name: 'Compaction plate hire — backfill round the pads', category: 'plant', unit: 'day', unitCost: PLATE_PER_DAY, qty: g.plateDays }))
  return L
}

/**
 * Prices pad foundations from just how many there are (and the pad size and thickness if known), with the calculator's own standard settings
 * (the ones its screen opens with: 900 x 900 x 600mm pads, 75mm blinding, C30, no formwork, reinforcement or starters, 10% waste, 20% profit).
 * Used when the AI quote hears the number of pads. Returns null when the sizes don't make a valid set of pads.
 */
export function pricePadFoundationFromBasics(o: { basics: AssemblyBasics; labourTrades: BOLabourTrade[] }): PricedFromBasics | null {
  const blindingMm = 75, formwork = false, starters = false, mix: Mix = 'C30', wastePct = 10
  if (!o.basics.count) return null
  const groups: PadGroup[] = [newGroup(o.basics.count, o.basics.lengthMm ?? 900, o.basics.widthMm ?? 900, o.basics.depthMm ?? 600)]
  let g: PadFoundationGeometry
  try { g = calculatePadFoundationGeometry({ pads: groups, blindingMm, formwork, workingSpaceMm: 200, rebarKgPerM3: 0, starters }) } catch { return null }
  const suggestions = suggestPadFoundationLabour({ padCount: g.padCount, concreteM3: g.concreteM3, formworkM2: g.formworkM2, rebarKg: g.rebarKg, backfillM3: g.backfillM3 })
  const lines = costFromBasics({ layers: buildPadLayers(g, { mix, wastePct, formwork }), suggestions, labourTrades: o.labourTrades })
  const d = { groups: groups.map(x => ({ count: x.count, lengthMm: x.lengthMm, widthMm: x.widthMm, depthMm: x.depthMm })), blindingMm, concreteMix: mix, formwork, rebar: false, starters }
  return { name: 'Pad foundations', qty: 1, location: '', description: describePadFoundationShort(d), detail: describePadFoundation(d), lines }
}

export default function AssemblyPadFoundationDemo({ onClose, onSave, labourTrades = [], initial }: Props) {
  const [name, setName]         = useState('Pad foundations')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  // One group to start with (all the pads the same); more groups are for pads of a different size
  const [groups, setGroups]     = useState<PadGroup[]>(() => [newGroup(initial?.count ?? 4, initial?.lengthMm ?? 900, initial?.widthMm ?? 900, initial?.depthMm ?? 600)])
  const [blindingMm, setBlindingMm] = useState(75)
  const [formwork, setFormwork] = useState(false)
  const [rebarOn, setRebarOn]   = useState(false)   // reinforcement is an option, not in the starting price
  const [rebarKg, setRebarKg]   = useState(80)
  const [starters, setStarters] = useState(false)
  const [mix, setMix]           = useState<Mix>('C30')
  const [wastePct, setWastePct] = useState(10)
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])
  function updateGroup(id: string, patch: Partial<PadGroup>) { setGroups(p => p.map(g => g.id === id ? { ...g, ...patch } : g)) }

  const input: PadFoundationInput = { pads: groups, blindingMm, formwork, workingSpaceMm: 200, rebarKgPerM3: rebarOn ? rebarKg : 0, starters }
  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculatePadFoundationGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, blindingMm, formwork, rebarOn, rebarKg, starters])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildPadLayers(g, { mix, wastePct, formwork }).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, mix, wastePct, formwork, rateOverrides])
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

  // Labour — suggested from the pads, following them until edited
  const labourSuggestions: LabourSuggestion[] = g ? suggestPadFoundationLabour({
    padCount: g.padCount, concreteM3: g.concreteM3, formworkM2: g.formworkM2, rebarKg: g.rebarKg, backfillM3: g.backfillM3,
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

  // The customer's description follows the pads until it's edited by hand
  const descInput = g ? { groups: groups.map(x => ({ count: x.count, lengthMm: x.lengthMm, widthMm: x.widthMm, depthMm: x.depthMm })), blindingMm, concreteMix: mix, formwork, rebar: rebarOn && rebarKg > 0, starters } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describePadFoundationShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describePadFoundation(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the pads</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the pads — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the pads</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint?: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}{hint && <span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8' }}>{hint}</span>}</span>
    </label>
  )

  const first = groups[0]
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
            <PadSectionSvg lengthMm={first.lengthMm} depthMm={first.depthMm} blindingMm={blindingMm} formwork={formwork} rebar={rebarOn && rebarKg > 0} starters={starters} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.padCount} pad{g.padCount === 1 ? '' : 's'}: {g.concreteM3.toFixed(2)} m³ of concrete, {g.blindingM3.toFixed(2)} m³ of blinding. Pits {g.pitDigM3.toFixed(2)} m³ dug,
              soil away {g.spoilAwayM3.toFixed(2)} m³ (bulked){g.backfillM3 > 0 ? `, backfill ${g.backfillM3.toFixed(2)} m³` : ''}. Machine {g.excavatorDays} day{g.excavatorDays === 1 ? '' : 's'}.
              {g.formworkM2 > 0 && <> Formwork {g.formworkM2.toFixed(1)} m².</>}{g.rebarKg > 0 && <> Steel {g.rebarKg.toFixed(0)} kg.</>}
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="The pads" borderColor="#bae6fd">
            {groups.map((gr, i) => (
              <div key={gr.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: i < groups.length - 1 ? '1px solid #e0f2fe' : 'none' }}>
                {i > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                  <span>Another size</span>
                  <button onClick={() => setGroups(p => p.filter(x => x.id !== gr.id))} style={{ fontSize: 11, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                </div>}
                <PropRow label={i === 0 ? 'How many pads' : 'How many of this size'}>{numInput(gr.count, n => updateGroup(gr.id, { count: Math.round(n) }), 0)}</PropRow>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}><PropRow label="Length (mm)">{numInput(gr.lengthMm, n => updateGroup(gr.id, { lengthMm: n }), 1)}</PropRow></div>
                  <div style={{ flex: 1 }}><PropRow label="Width (mm)">{numInput(gr.widthMm, n => updateGroup(gr.id, { widthMm: n }), 1)}</PropRow></div>
                  <div style={{ flex: 1 }}><PropRow label="Depth (mm)">{numInput(gr.depthMm, n => updateGroup(gr.id, { depthMm: n }), 1)}</PropRow></div>
                </div>
              </div>
            ))}
            <button onClick={() => setGroups(p => [...p, newGroup(1, p[0].lengthMm, p[0].widthMm, p[0].depthMm)])}
              style={{ fontSize: 12, color: '#0369a1', background: 'none', border: '1px dashed #7dd3fc', borderRadius: 5, cursor: 'pointer', padding: '4px 10px' }}>+ Pads of a different size</button>
            <PropRow label="Blinding under each pad (mm)">{numInput(blindingMm, setBlindingMm, 0)}</PropRow>
            <PropRow label="Concrete mix">
              <select value={mix} onChange={e => setMix(e.target.value as Mix)} style={propInput}>
                {(Object.keys(MIXES) as Mix[]).map(k => <option key={k} value={k}>{MIXES[k].label}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Options" borderColor="#bae6fd">
            {check('Formwork to the pad sides', formwork, setFormwork, 'Off: the concrete is poured against the sides of the pit. On: the pit is 200mm bigger each side and backfilled afterwards.')}
            {check('Reinforcement (steel)', rebarOn, setRebarOn, 'Only if the engineer has specified it')}
            {rebarOn && <PropRow label="Steel (kg per m³ of concrete)">{numInput(rebarKg, setRebarKg, 0)}</PropRow>}
            {check('Holding-down bolts / column starters', starters, setStarters, 'One set per pad')}
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="pad foundations"
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

// ── A section through one pad: the pit, the blinding, the pad with its steel, and a starter bar ──
function PadSectionSvg({ lengthMm, depthMm, blindingMm, formwork, rebar, starters }: { lengthMm: number; depthMm: number; blindingMm: number; formwork: boolean; rebar: boolean; starters: boolean }) {
  const vbW = 430, vbH = 300
  const totalMm = depthMm + blindingMm + 200
  const k = Math.min(190 / totalMm, 190 / Math.max(lengthMm, 300), 0.5)
  const cx = 215, groundY = 70
  const padW = Math.max(lengthMm * k, 40), padH = Math.max(depthMm * k, 20), blindH = Math.max(blindingMm * k, 4)
  const padTop = groundY + 6, padBottom = padTop + padH, blindBottom = padBottom + blindH
  const side = formwork ? 18 : 0
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={groundY} width={vbW - 40} height={blindBottom - groundY + 40} fill="#e7e5e4" />
      <rect x={cx - padW / 2 - side} y={groundY} width={padW + side * 2} height={blindBottom - groundY} fill="#fff" />
      <line x1={20} x2={vbW - 20} y1={groundY} y2={groundY} stroke="#78716c" strokeWidth={1.5} />
      <text x={vbW - 24} y={groundY - 5} fontSize={9} fill="#78716c" textAnchor="end">Ground level</text>
      <rect x={cx - padW / 2 - 6} y={padBottom} width={padW + 12} height={blindH} fill="#fde68a" stroke="#ca8a04" />
      <text x={cx + padW / 2 + 12} y={padBottom + blindH + 8} fontSize={9} fill="#854d0e">Blinding {blindingMm}</text>
      {formwork && <><rect x={cx - padW / 2 - 8} y={padTop} width={6} height={padH} fill="#d6a679" stroke="#92400e" /><rect x={cx + padW / 2 + 2} y={padTop} width={6} height={padH} fill="#d6a679" stroke="#92400e" /></>}
      <rect x={cx - padW / 2} y={padTop} width={padW} height={padH} fill="#d6d3d1" stroke="#57534e" strokeWidth={1.4} />
      {rebar && <path d={`M${cx - padW / 2 + 8},${padBottom - 8} L${cx + padW / 2 - 8},${padBottom - 8} M${cx - padW / 2 + 8},${padBottom - 8} L${cx - padW / 2 + 8},${padBottom - 20} M${cx + padW / 2 - 8},${padBottom - 8} L${cx + padW / 2 - 8},${padBottom - 20}`} stroke="#b91c1c" strokeWidth={2} fill="none" />}
      {starters && <><line x1={cx - 8} x2={cx - 8} y1={padTop - 14} y2={padTop + padH * 0.6} stroke="#0f766e" strokeWidth={2.5} /><line x1={cx + 8} x2={cx + 8} y1={padTop - 14} y2={padTop + padH * 0.6} stroke="#0f766e" strokeWidth={2.5} /></>}
      <text x={cx} y={padTop + padH / 2 + 3} fontSize={10} fill="#292524" textAnchor="middle">Pad {lengthMm} × {depthMm}</text>
      <line x1={cx - padW / 2 - 34} x2={cx - padW / 2 - 34} y1={padTop} y2={padBottom} stroke="#2563eb" />
      <text x={cx - padW / 2 - 40} y={(padTop + padBottom) / 2 + 3} fontSize={10} fill="#2563eb" textAnchor="end">{depthMm}</text>
      <line x1={cx - padW / 2} x2={cx + padW / 2} y1={blindBottom + 16} y2={blindBottom + 16} stroke="#2563eb" />
      <text x={cx} y={blindBottom + 28} fontSize={10} fill="#2563eb" textAnchor="middle">{lengthMm}</text>
    </svg>
  )
}
