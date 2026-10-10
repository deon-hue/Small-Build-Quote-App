'use client'

/**
 * Assembly Calculator — Piled foundation, drawn as a line (Foundations → Piled Foundation): piles along the line, with a reinforced ground beam on top.
 *
 * The piles are a specialist subcontract (a price per metre of pile and a charge for bringing the rig); how many comes from the spacing along the
 * beam, or a count you type. The beam is cast in a shallow trench on a little blinding, shuttered both sides and reinforced with a cage priced per
 * metre; the digging is a machine with its operator. Counts, lengths and volumes only — the pile and beam sizes, spacing and reinforcement are the
 * engineer's design. The engine is lib/piled-foundation.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculatePiledFoundationGeometry, type PiledFoundationInput, type PiledFoundationGeometry } from '@/lib/piled-foundation'
import { describePiledFoundation, describePiledFoundationShort } from '@/lib/piled-foundation-description'
import { suggestPiledFoundationLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
const MIXES = { C25: { label: 'C25', cost: 105 }, C30: { label: 'C30 (usual for a ground beam)', cost: 112 }, C35: { label: 'C35', cost: 120 } } as const
type Mix = keyof typeof MIXES
const PILE_PER_M = 45           // a specialist piling subcontractor, per metre of pile (300mm)
const RIG_MOBILISATION = 1200   // bringing the piling rig to site and taking it away again
const EXCAVATOR_PER_DAY = 260
const MUCKAWAY_PER_M3 = 28
const PLATE_PER_DAY = 40
const BLINDING_PER_M3 = 95
const FORMWORK_PER_M2 = 9
const CAGE_PER_LM = 22          // a prefabricated reinforcement cage for a 450 × 450 beam
const VOID_FORMER_PER_M2 = 9

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** Sizes the AI quote heard: the calculator opens with them, so it matches what the AI priced. */
  initial?: AssemblyBasics
  /** The length of the foundation line drawn in Take-off, in mm. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
}

function buildPiledLayers(g: PiledFoundationGeometry, o: { mix: Mix; wastePct: number; pileDiameterMm: number; beamDepthMm: number }): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }

  L.push(fixed({ id: 'piles', name: `Piling by specialist subcontractor — ${g.pileCount} piles, ${o.pileDiameterMm}mm, per metre of pile`, category: 'subcontractors', unit: 'm', unitCost: PILE_PER_M, qty: g.pileLm }))
  L.push(fixed({ id: 'rig', name: 'Piling rig — bringing to site and taking away', category: 'subcontractors', unit: 'item', unitCost: RIG_MOBILISATION, qty: 1 }))
  L.push(fixed({ id: 'excavator', name: 'Mini excavator with operator — the beam trench', category: 'plant', unit: 'day', unitCost: EXCAVATOR_PER_DAY, qty: g.excavatorDays }))
  L.push(fixed({ id: 'spoil', name: 'Spoil carted away (piling arisings and beam trench, bulked up 30%)', category: 'other', unit: 'm³', unitCost: MUCKAWAY_PER_M3, qty: g.spoilAwayM3 }))
  if (g.blindingM3 > 0) L.push(fixed({ id: 'blinding', name: 'Blinding concrete C10 under the beam', category: 'materials', unit: 'm³', unitCost: BLINDING_PER_M3, wastePct: Math.max(w, 5), qty: g.blindingM3 }))
  if (g.voidFormerM2 > 0) L.push(fixed({ id: 'void', name: 'Void former under the beam', category: 'materials', unit: 'm²', unitCost: VOID_FORMER_PER_M2, wastePct: w, qty: g.voidFormerM2 }))
  L.push(fixed({ id: 'formwork', name: 'Shuttering to both faces of the beam (ply and timber, reused)', category: 'materials', unit: 'm²', unitCost: FORMWORK_PER_M2, qty: g.formworkM2 }))
  L.push(fixed({ id: 'cage', name: 'Reinforcement cage for the beam (prefabricated)', category: 'materials', unit: 'lm', unitCost: CAGE_PER_LM, wastePct: 5, qty: g.cageLm }))
  L.push(fixed({ id: 'concrete', name: `Ready-mixed concrete ${o.mix} (ground beam)`, category: 'materials', unit: 'm³', unitCost: MIXES[o.mix].cost, wastePct: Math.max(w, 5), qty: g.beamConcreteM3 }))
  if (g.plateDays > 0) L.push(fixed({ id: 'plate', name: 'Compaction plate hire — backfill round the beam', category: 'plant', unit: 'day', unitCost: PLATE_PER_DAY, qty: g.plateDays }))
  return L
}

/**
 * Prices piles with a ground beam on top from just the length of beam (and the number of piles and pile depth if known), with the calculator's own
 * standard settings (the ones its screen opens with: a pile every 3.0m, 300mm piles 8m deep, a 450 x 450mm beam on 50mm blinding, C30, no void
 * former, 10% waste, 20% profit). Used when the AI quote hears the length. Returns null when the sizes don't make a valid foundation.
 */
export function pricePiledFoundationFromBasics(o: { basics: AssemblyBasics; labourTrades: BOLabourTrade[] }): PricedFromBasics | null {
  const spacingMm = 3000, pileDiaMm = 300, pileDepthMm = o.basics.depthMm ?? 8000, beamW = 450, beamD = 450, blindingMm = 50, voidFormer = false
  const mix: Mix = 'C30', wastePct = 10
  if (!o.basics.lengthMm) return null
  let g: PiledFoundationGeometry
  try { g = calculatePiledFoundationGeometry({ lengthMm: o.basics.lengthMm, pileSpacingMm: spacingMm, pileCountOverride: o.basics.count ?? null, pileDiameterMm: pileDiaMm, pileDepthMm, beamWidthMm: beamW, beamDepthMm: beamD, blindingMm, workingSpaceMm: 150, voidFormer }) } catch { return null }
  const suggestions = suggestPiledFoundationLabour({ lm: g.lengthM, pileCount: g.pileCount, beamConcreteM3: g.beamConcreteM3, formworkM2: g.formworkM2, backfillM3: g.backfillM3 })
  const lines = costFromBasics({ layers: buildPiledLayers(g, { mix, wastePct, pileDiameterMm: pileDiaMm, beamDepthMm: beamD }), suggestions, labourTrades: o.labourTrades })
  const d = { lengthM: g.lengthM, pileCount: g.pileCount, pileDiameterMm: pileDiaMm, pileDepthMm, beamWidthMm: beamW, beamDepthMm: beamD, concreteMix: mix, voidFormer, blindingMm }
  return { name: 'Piled foundation', qty: 1, location: '', description: describePiledFoundationShort(d), detail: describePiledFoundation(d), lines }
}

export default function AssemblyPiledFoundationDemo({ onClose, onSave, labourTrades = [], externalLengthMm, initial }: Props) {
  const [name, setName]         = useState('Piled foundation')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? initial?.lengthMm ?? 10000)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  const [spacingMm, setSpacingMm] = useState(3000)
  const [countOverride, setCountOverride] = useState<number | null>(initial?.count ?? null)   // typed pile count, replacing the one from the spacing
  const [pileDiaMm, setPileDiaMm] = useState(300)
  const [pileDepthMm, setPileDepthMm] = useState(initial?.depthMm ?? 8000)
  const [beamW, setBeamW]       = useState(450)
  const [beamD, setBeamD]       = useState(450)
  const [blindingMm, setBlindingMm] = useState(50)
  const [voidFormer, setVoidFormer] = useState(false)
  const [mix, setMix]           = useState<Mix>('C30')
  const [wastePct, setWastePct] = useState(10)
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const input: PiledFoundationInput = {
    lengthMm, pileSpacingMm: spacingMm, pileCountOverride: countOverride, pileDiameterMm: pileDiaMm, pileDepthMm,
    beamWidthMm: beamW, beamDepthMm: beamD, blindingMm, workingSpaceMm: 150, voidFormer,
  }
  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculatePiledFoundationGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, spacingMm, countOverride, pileDiaMm, pileDepthMm, beamW, beamD, blindingMm, voidFormer])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildPiledLayers(g, { mix, wastePct, pileDiameterMm: pileDiaMm, beamDepthMm: beamD }).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, mix, wastePct, pileDiaMm, beamD, rateOverrides])
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

  // Labour — suggested from the foundation, following it until edited
  const labourSuggestions: LabourSuggestion[] = g ? suggestPiledFoundationLabour({
    lm: g.lengthM, pileCount: g.pileCount, beamConcreteM3: g.beamConcreteM3, formworkM2: g.formworkM2, backfillM3: g.backfillM3,
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

  // The customer's description follows the foundation until it's edited by hand
  const descInput = g ? { lengthM: g.lengthM, pileCount: g.pileCount, pileDiameterMm: pileDiaMm, pileDepthMm, beamWidthMm: beamW, beamDepthMm: beamD, concreteMix: mix, voidFormer, blindingMm } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describePiledFoundationShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describePiledFoundation(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the foundation</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the foundation — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the foundation</button>

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
            <PiledSectionSvg pileDiaMm={pileDiaMm} pileDepthMm={pileDepthMm} beamW={beamW} beamD={beamD} blindingMm={blindingMm} voidFormer={voidFormer} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.lengthM.toFixed(2)}m of beam on {g.pileCount} piles ({g.pileLm.toFixed(0)}m of piling). Beam {g.beamConcreteM3.toFixed(2)} m³ of concrete, {g.formworkM2.toFixed(1)} m² of shuttering,
              {' '}{g.cageLm.toFixed(1)}m of cage. Trench {g.trenchDigM3.toFixed(1)} m³; soil away {g.spoilAwayM3.toFixed(1)} m³ (bulked), including {g.pileArisingsM3.toFixed(1)} m³ from the piling.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Beam length (mm) — from the line drawn">{numInput(lengthMm, setLengthMm, 1)}</PropRow>

          <CollapsibleSection title="Piles" borderColor="#bae6fd">
            <PropRow label="A pile every (mm), at most">{numInput(spacingMm, setSpacingMm, 1)}</PropRow>
            <PropRow label={`Number of piles${countOverride === null ? ' (worked out from the spacing)' : ''}`}>
              <input type="number" min={0} value={countOverride ?? (g?.pileCount ?? 0)} onChange={e => setCountOverride(Math.max(0, Math.round(+e.target.value || 0)))} style={propInput} />
            </PropRow>
            {countOverride !== null && <button onClick={() => setCountOverride(null)} style={{ fontSize: 10.5, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6 }}>↻ Typed by you — use the spacing again</button>}
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Diameter (mm)">{numInput(pileDiaMm, setPileDiaMm, 1)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Depth (mm)">{numInput(pileDepthMm, setPileDepthMm, 1)}</PropRow></div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Ground beam" borderColor="#bae6fd">
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Width (mm)">{numInput(beamW, setBeamW, 1)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Depth (mm)">{numInput(beamD, setBeamD, 1)}</PropRow></div>
            </div>
            <PropRow label="Blinding under the beam (mm)">{numInput(blindingMm, setBlindingMm, 0)}</PropRow>
            <PropRow label="Concrete mix">
              <select value={mix} onChange={e => setMix(e.target.value as Mix)} style={propInput}>
                {(Object.keys(MIXES) as Mix[]).map(k => <option key={k} value={k}>{MIXES[k].label}</option>)}
              </select>
            </PropRow>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginTop: 4 }}>
              <input type="checkbox" checked={voidFormer} onChange={e => setVoidFormer(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
              <span>Void former under the beam<span style={{ display: 'block', fontSize: 10.5, color: '#94a3b8' }}>For clay, where the ground can swell</span></span>
            </label>
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="foundation"
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

// ── A section along the beam: ground, the beam with its cage on blinding, a pile below it, and the shuttering ──
function PiledSectionSvg({ pileDiaMm, pileDepthMm, beamW, beamD, blindingMm, voidFormer }: { pileDiaMm: number; pileDepthMm: number; beamW: number; beamD: number; blindingMm: number; voidFormer: boolean }) {
  const vbW = 430, vbH = 300
  const k = Math.min(110 / Math.max(beamD, 200), 0.35)
  const cx = 215, groundY = 60
  const bw = Math.max(beamW * k, 40), bd = Math.max(beamD * k, 30), bl = Math.max(blindingMm * k, 3)
  const beamTop = groundY - 10, beamBottom = beamTop + bd, blindBottom = beamBottom + bl
  const pw = Math.max(pileDiaMm * k, 14), pileH = Math.min(150, Math.max(70, pileDepthMm * 0.012))
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={groundY} width={vbW - 40} height={vbH - groundY - 10} fill="#e7e5e4" />
      <line x1={20} x2={vbW - 20} y1={groundY} y2={groundY} stroke="#78716c" strokeWidth={1.5} />
      <text x={vbW - 24} y={groundY - 5} fontSize={9} fill="#78716c" textAnchor="end">Ground level</text>
      <rect x={cx - bw / 2 - 14} y={beamTop} width={bw + 28} height={bd + bl} fill="#fff" />
      <rect x={cx - pw / 2} y={blindBottom} width={pw} height={pileH} fill="#a8a29e" stroke="#57534e" />
      <text x={cx + pw / 2 + 8} y={blindBottom + pileH / 2} fontSize={10} fill="#292524">Pile {pileDiaMm} × {(pileDepthMm / 1000).toFixed(1)}m</text>
      {voidFormer && <rect x={cx - bw / 2} y={blindBottom} width={bw} height={6} fill="#fcd34d" stroke="#b45309" />}
      <rect x={cx - bw / 2} y={beamBottom} width={bw} height={bl} fill="#fde68a" stroke="#ca8a04" />
      <rect x={cx - bw / 2 - 6} y={beamTop} width={5} height={bd} fill="#d6a679" stroke="#92400e" />
      <rect x={cx + bw / 2 + 1} y={beamTop} width={5} height={bd} fill="#d6a679" stroke="#92400e" />
      <rect x={cx - bw / 2} y={beamTop} width={bw} height={bd} fill="#d6d3d1" stroke="#57534e" strokeWidth={1.4} />
      <rect x={cx - bw / 2 + 7} y={beamTop + 7} width={bw - 14} height={bd - 14} fill="none" stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="4 2" />
      <text x={cx} y={beamTop + bd / 2 + 3} fontSize={10} fill="#292524" textAnchor="middle">Beam {beamW} × {beamD}</text>
      <line x1={cx - bw / 2 - 36} x2={cx - bw / 2 - 36} y1={beamTop} y2={beamBottom} stroke="#2563eb" />
      <text x={cx - bw / 2 - 42} y={(beamTop + beamBottom) / 2 + 3} fontSize={10} fill="#2563eb" textAnchor="end">{beamD}</text>
    </svg>
  )
}
