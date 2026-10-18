'use client'

/**
 * Assembly Calculator — Soakaway and rainwater (Drainage & Services → Soakaway & Rainwater).
 * The soakaway is sized from the roof and paving that drain to it (all the roof, 80% of the paving, times the depth of rain it must hold), built from crates, a stone-filled pit or concrete rings,
 * with the hole, geotextile, silt chamber, soil taken away and the digger (priced in days on site, with fuel and delivery). Channel drains, yard gullies, downpipe connections and water butts are
 * counted alongside. The pipes between the downpipes and the soakaway are surface water runs in the Underground Drainage calculator. The engine is lib/soakaway-units.ts.
 */

import React, { useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculateSoakaway, SOAKAWAY_KINDS, CHANNELS, PAVING_RUNOFF, WORKING_ROOM, type SoakawayKind, type SoakawayResult } from '@/lib/soakaway-units'
import { describeSoakaway, describeSoakawayShort, type SoakawayDescriptionInput } from '@/lib/soakaway-description'
import { suggestSoakawayLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
}

const KIND_WORDS: Record<SoakawayKind, string> = { crates: 'soakaway crates', stone: 'a stone-filled pit', rings: 'perforated concrete rings' }

export default function AssemblySoakawayDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblySoakawayDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Soakaway and rainwater')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [roofAreaM2, setRoofAreaM2] = useCalcState(ID, 'roofAreaM2', 0)
  const [pavedAreaM2, setPavedAreaM2] = useCalcState(ID, 'pavedAreaM2', 0)
  const [storageDepthMm, setStorageDepthMm] = useCalcState(ID, 'storageDepthMm', 20)
  const [storageOverrideM3, setStorageOverrideM3] = useCalcState<number | null>(ID, 'storageOverrideM3', null)
  const [kind, setKind] = useCalcState<SoakawayKind>(ID, 'kind', 'crates')
  // optional extras the job may not have start empty: no soakaway, channel, gully, connection or butt until you add it
  const [count, setCount] = useCalcState(ID, 'count', 0)
  const [channelLightLm, setChannelLightLm] = useCalcState(ID, 'channelLightLm', 0)
  const [channelHeavyLm, setChannelHeavyLm] = useCalcState(ID, 'channelHeavyLm', 0)
  const [gullies, setGullies] = useCalcState(ID, 'gullies', 0)
  const [downpipeConnections, setDownpipeConnections] = useCalcState(ID, 'downpipeConnections', 0)
  const [waterButts, setWaterButts] = useCalcState(ID, 'waterButts', 0)
  const [diggerDays, setDiggerDays] = useCalcState<number | null>(ID, 'diggerDays', null)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const result = useMemo((): { ok: true; r: SoakawayResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateSoakaway({ roofAreaM2, pavedAreaM2, storageDepthMm, storageOverrideM3, kind, count, channelLightLm, channelHeavyLm, gullies, downpipeConnections, waterButts }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [roofAreaM2, pavedAreaM2, storageDepthMm, storageOverrideM3, kind, count, channelLightLm, channelHeavyLm, gullies, downpipeConnections, waterButts])
  const r = result.ok ? result.r : null

  const layers: AssemblyLayerDef[] = useMemo(() => {
    if (!r) return []
    const L: AssemblyLayerDef[] = []
    if (r.excavatorDays > 0) L.push(...diggerLayers(planDigger(r.excavatorDays, diggerDays), 'digging the soakaway', 'Mini excavator with operator'))
    for (const l of r.lines) L.push({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: l.wastePct ?? 0 })
    return L.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [r, diggerDays, rateOverrides])
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

  // Labour, suggested and following the sizes until edited
  const backfillM3 = r ? Math.max(r.holeM3 - r.installedM3, 0) : 0
  const labourSuggestions: LabourSuggestion[] = r ? suggestSoakawayLabour({
    kind, installedM3: r.installedM3, rings: r.rings, wrapM2: r.wrapM2, silts: count, backfillM3: Math.round(backfillM3 * 100) / 100,
    channelLm: channelLightLm + channelHeavyLm, gullies, downpipeConnections, waterButts,
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

  // The customer's description follows the settings until it's edited by hand
  const descInput: SoakawayDescriptionInput | null = r ? { count: r.storageM3 > 0 ? count : 0, kindWords: KIND_WORDS[kind], kind, roofAreaM2, pavedAreaM2, storageM3: r.storageM3, channelLightLm, channelHeavyLm, gullies, downpipeConnections, waterButts } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeSoakawayShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeSoakaway(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the sizes</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the sizes — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>

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
          {r && <SoakawaySketch kind={kind} count={count} storageM3={r.storageM3} holeM3={r.holeM3} installedM3={r.installedM3} />}
          {r && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.effectiveAreaM2 > 0 && <>{r.effectiveAreaM2}m² effective area ({roofAreaM2}m² of roof{pavedAreaM2 > 0 ? ` and ${pavedAreaM2}m² of paving at ${Math.round(PAVING_RUNOFF * 100)}%` : ''}) × {storageDepthMm}mm = {r.storageM3}m³ to hold. </>}
              {r.holeM3 > 0 && <>{SOAKAWAY_KINDS[kind].short} of {r.installedM3}m³ installed, a hole of about {r.holeM3}m³ (working room round it), {r.spoilAwayM3}m³ of soil away, {r.excavatorDays} day{r.excavatorDays === 1 ? '' : 's'} digging.</>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="What drains to the soakaway" borderColor="#bae6fd">
            <PropRow label="Roof area draining to it (m²)">{numInput(roofAreaM2, setRoofAreaM2, 0, 1)}</PropRow>
            <PropRow label="Paved area draining to it (m²)">{numInput(pavedAreaM2, setPavedAreaM2, 0, 1)}</PropRow>
            <PropRow label="Depth of rain to hold (mm)">{numInput(storageDepthMm, setStorageDepthMm, 0, 1)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>20mm is a starting point only: the real size comes from the infiltration test and the designer.</div>
            <PropRow label="Storage from the designer (m³)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 90 }}>{numInput(storageOverrideM3 ?? (r?.storageM3 ?? 0), n => setStorageOverrideM3(n), 0, 0.1)}</div>
                {storageOverrideM3 !== null && <button onClick={() => setStorageOverrideM3(null)} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Set by you — work it out again</button>}
              </div>
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="The soakaway" borderColor="#bae6fd">
            <PropRow label="Number of soakaways">{numInput(count, n => setCount(Math.round(n)), 0, 1)}</PropRow>
            <PropRow label="Built from">
              <select value={kind} onChange={e => setKind(e.target.value as SoakawayKind)} style={propInput}>
                {(Object.keys(SOAKAWAY_KINDS) as SoakawayKind[]).map(k => <option key={k} value={k}>{SOAKAWAY_KINDS[k].label}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The hole is {Math.round((WORKING_ROOM - 1) * 100)}% bigger than what goes in it, for working room. Leave at 0 if the water goes elsewhere.</div>
          </CollapsibleSection>

          <CollapsibleSection title="Channels, gullies, connections and butts" borderColor="#bae6fd">
            <PropRow label={`${CHANNELS.light.label} (m)`}>{numInput(channelLightLm, setChannelLightLm, 0, 0.5)}</PropRow>
            <PropRow label={`${CHANNELS.heavy.label} (m)`}>{numInput(channelHeavyLm, setChannelHeavyLm, 0, 0.5)}</PropRow>
            <PropRow label="Yard or rainwater gullies (nr)">{numInput(gullies, n => setGullies(Math.round(n)), 0, 1)}</PropRow>
            <PropRow label="Downpipe connections to the drain (nr)">{numInput(downpipeConnections, n => setDownpipeConnections(Math.round(n)), 0, 1)}</PropRow>
            <PropRow label="Water butts (nr)">{numInput(waterButts, n => setWaterButts(Math.round(n)), 0, 1)}</PropRow>
          </CollapsibleSection>

          {r && r.excavatorDays > 0 && <DiggerOnSiteSection diggingDays={r.excavatorDays} daysOnSite={diggerDays} onDaysOnSite={setDiggerDays} />}

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates — change any single line in the cost breakdown below.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="soakaway"
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

// ── A sketch: the roof and downpipe feeding a silt chamber, then the soakaway in its hole, with the water seeping out into the ground ──
function SoakawaySketch({ kind, count, storageM3, holeM3, installedM3 }: { kind: SoakawayKind; count: number; storageM3: number; holeM3: number; installedM3: number }) {
  const has = count > 0 && storageM3 > 0
  const fill = kind === 'crates' ? '#bae6fd' : kind === 'stone' ? '#d6d3d1' : '#e2e8f0'
  return (
    <svg viewBox="0 0 430 210" style={{ width: '100%', height: 210, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={0} y={90} width={430} height={120} fill="#e7e5e4" />
      <line x1={0} x2={430} y1={90} y2={90} stroke="#78716c" strokeWidth={1.5} />
      <path d="M30 40 L90 12 L150 40 L150 90 L30 90 Z" fill="#fde68a" stroke="#a16207" />
      <text x={90} y={72} fontSize={10} fill="#78350f" textAnchor="middle">roof</text>
      <rect x={152} y={40} width={5} height={50} fill="#64748b" />
      <text x={166} y={62} fontSize={9} fill="#475569">downpipe</text>
      <rect x={156} y={88} width={190} height={5} fill="#a8a29e" />
      <rect x={236} y={86} width={22} height={22} fill="#fff" stroke="#64748b" />
      <text x={247} y={124} fontSize={8} fill="#475569" textAnchor="middle">silt chamber</text>
      {has ? (
        <>
          <rect x={270} y={100} width={120} height={80} fill={fill} stroke="#0369a1" strokeWidth={2} rx={3} />
          <text x={330} y={138} fontSize={11} fill="#0369a1" textAnchor="middle" fontWeight={700}>{count > 1 ? `${count} × ` : ''}{storageM3 > 0 ? (storageM3 / Math.max(count, 1)).toFixed(1) : '0'}m³</text>
          <text x={330} y={154} fontSize={9} fill="#334155" textAnchor="middle">{SOAKAWAY_KINDS[kind].short}</text>
          <text x={330} y={196} fontSize={8} fill="#78716c" textAnchor="middle">hole about {holeM3}m³ · installed {installedM3}m³</text>
          {[290, 320, 350, 380].map(x => <path key={x} d={`M${x} 182 v8`} stroke="#0369a1" strokeWidth={1.4} strokeDasharray="2 2" />)}
        </>
      ) : <text x={330} y={146} fontSize={10} fill="#94a3b8" textAnchor="middle">no soakaway yet</text>}
    </svg>
  )
}
