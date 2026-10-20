'use client'

/**
 * Assembly Calculator — Services connections (Drainage & Services → Services Connections): new or diverted supplies of water, gas, electricity and telecoms, and cap-offs.
 * Each service is one line: the utility, the kind of work, and for a new or diverted supply the length of trench from the street or meter to the building. The utility company's own charge is a
 * provisional sum you can type over; the trench (by machine or by hand, the digger priced in days on site), the duct or pipe, sand bed, warning tape, backfill, reinstated surface and meter box are the builder's.
 * The engine is lib/services-units.ts.
 */

import React, { useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateServices, UTILITIES, WORK_LABEL, SURFACE_LABEL, type ServiceItem, type Utility, type ServiceWork, type DigMethod, type Surface, type ServicesResult,
} from '@/lib/services-units'
import { describeServices, describeServicesShort, type ServicesDescriptionInput } from '@/lib/services-description'
import { suggestServicesLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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

const UTILITY_COLOUR: Record<Utility, string> = { water: '#2563eb', gas: '#ca8a04', electric: '#dc2626', telecoms: '#7c3aed' }
export const UTILITY_WORDS: Record<Utility, string> = { water: 'water', gas: 'gas', electric: 'electricity', telecoms: 'telecoms and broadband' }
const UTILITIES_LIST = Object.keys(UTILITIES) as Utility[]
const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyServicesDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyServicesDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Services connections')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no services: you add the ones it has
  const [items, setItems] = useCalcState<ServiceItem[]>(ID, 'items', [])
  const [diggerDays, setDiggerDays] = useCalcState<number | null>(ID, 'diggerDays', null)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addItem() {
    setItems(p => {
      const last = p[p.length - 1]
      return [...p, { id: 'svc-' + uid(), name: '', utility: last ? last.utility : 'water', work: 'new', lengthM: 15, dig: last?.dig ?? 'machine', surface: last?.surface ?? 'soft', box: true, chargeOverride: null }]
    })
  }
  function updateItem(id: string, patch: Partial<ServiceItem>) { setItems(p => p.map(x => x.id === id ? { ...x, ...patch } : x)) }

  const result = useMemo((): { ok: true; r: ServicesResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateServices({ items }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [items])
  const r = result.ok ? result.r : null

  const layers: AssemblyLayerDef[] = useMemo(() => {
    if (!r) return []
    const L: AssemblyLayerDef[] = []
    if (r.excavatorDays > 0) L.push(...diggerLayers(planDigger(r.excavatorDays, diggerDays), 'digging the service trenches', 'Mini excavator with operator'))
    for (const l of r.lines) L.push({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: l.wastePct ?? 0 })
    return L.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [r, diggerDays, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  const itemCost = (id: string) => costedLines.filter(l => l.layerId.endsWith('|' + id)).reduce((s, l) => s + l.cost, 0)

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(ID, 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour, suggested from the trenches and following them until edited
  const labourSuggestions: LabourSuggestion[] = r ? suggestServicesLabour({
    layLm: r.totalLm, handDigM3: r.handM3, sandM3: r.sandM3, backfillM3: r.backfillM3, softM2: r.reinstateM2.soft, pavingM2: r.reinstateM2.paving, tarmacM2: r.reinstateM2.tarmac, concreteM2: r.reinstateM2.concrete, boxes: r.boxes,
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

  // The customer's description follows the services until it's edited by hand
  const descInput: ServicesDescriptionInput | null = r ? {
    items: items.map(x => ({
      name: x.name.trim() || `${UTILITIES[x.utility].label} ${WORK_LABEL[x.work].toLowerCase()}`, utility: UTILITY_WORDS[x.utility], work: x.work, lengthM: x.lengthM,
      dug: x.dig === 'machine' ? 'by machine' : 'by hand', crosses: SURFACE_LABEL[x.surface].split(' (')[0].toLowerCase(), box: x.box && UTILITIES[x.utility].boxEach > 0, laid: UTILITIES[x.utility].laid,
    })), totalLm: r.totalLm,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeServicesShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeServices(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the services</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the services — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>

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
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Services</span>
            <button type="button" onClick={addItem} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add service</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>One for each supply you connect, move or cap off.</span>
          </div>

          {items.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No services yet. Press <strong>+ Add service</strong>, pick the utility and the kind of work.
            </div>
          )}

          {items.map(x => {
            const u = UTILITIES[x.utility]
            const capOff = x.work === 'cap-off'
            return (
              <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: UTILITY_COLOUR[x.utility], flexShrink: 0 }} />
                  <input value={x.name} onChange={e => updateItem(x.id, { name: e.target.value })} placeholder={`What it is, e.g. new ${UTILITY_WORDS[x.utility]} supply to the extension`} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(itemCost(x.id))}</span>
                  <button type="button" onClick={() => setItems(p => p.filter(y => y.id !== x.id))} title="Remove this service" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  <PropRow label="Utility">
                    <select value={x.utility} onChange={e => updateItem(x.id, { utility: e.target.value as Utility })} style={propInput}>
                      {UTILITIES_LIST.map(k => <option key={k} value={k}>{UTILITIES[k].label}</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="Kind of work">
                    <select value={x.work} onChange={e => updateItem(x.id, { work: e.target.value as ServiceWork })} style={propInput}>
                      {(Object.keys(WORK_LABEL) as ServiceWork[]).map(k => <option key={k} value={k}>{WORK_LABEL[k]}</option>)}
                    </select>
                  </PropRow>
                  <PropRow label="The utility's charge (£)">
                    <NumInput type="number" min={0} step={50} value={x.chargeOverride ?? u.charge[x.work]} onChange={e => updateItem(x.id, { chargeOverride: Math.max(0, +e.target.value || 0) })} style={propInput} />
                  </PropRow>
                </div>
                {x.chargeOverride !== null && <button onClick={() => updateItem(x.id, { chargeOverride: null })} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Typed by you — use the sample figure (£{u.charge[x.work]}) again</button>}
                {!capOff && (<>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <PropRow label="Trench length (m)">{numInput(x.lengthM, n => updateItem(x.id, { lengthM: n }), 0, 0.5)}</PropRow>
                    <PropRow label="Dug">
                      <select value={x.dig} onChange={e => updateItem(x.id, { dig: e.target.value as DigMethod })} style={propInput}>
                        <option value="machine">By machine</option><option value="hand">By hand</option>
                      </select>
                    </PropRow>
                    <PropRow label="It crosses">
                      <select value={x.surface} onChange={e => updateItem(x.id, { surface: e.target.value as Surface })} style={propInput}>
                        {(Object.keys(SURFACE_LABEL) as Surface[]).map(s => <option key={s} value={s}>{SURFACE_LABEL[s]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  {u.boxEach > 0 && (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginTop: 4 }}>
                      <input type="checkbox" checked={x.box} onChange={e => updateItem(x.id, { box: e.target.checked })} style={{ width: 'auto', marginTop: 2 }} />
                      <span>{u.box}<span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>Supplied and set by us, £{u.boxEach}</span></span>
                    </label>
                  )}
                  <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>{(u.trench.width * 1000).toFixed(0)}mm wide and {(u.trench.depth * 1000).toFixed(0)}mm deep, with {u.laid} in it.</div>
                </>)}
              </div>
            )
          })}

          {r && r.totalLm > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.totalLm}m of trench: {r.machineM3} m³ dug by machine over {r.excavatorDays} day{r.excavatorDays === 1 ? '' : 's'} and {r.handM3} m³ by hand, {r.sandM3} m³ of sand, {r.spoilAwayM3} m³ of soil taken away.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {r && r.excavatorDays > 0 && <DiggerOnSiteSection diggingDays={r.excavatorDays} daysOnSite={diggerDays} onDaysOnSite={setDiggerDays} />}
          <CollapsibleSection title="About the utilities' charges" borderColor="#bae6fd">
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
              {UTILITIES_LIST.map(k => <div key={k} style={{ marginBottom: 4 }}><strong style={{ color: UTILITY_COLOUR[k] }}>{UTILITIES[k].label}:</strong> {UTILITIES[k].note}</div>)}
              <div>The charges are samples and vary a great deal by area and by job: replace each with the utility's quote.</div>
            </div>
          </CollapsibleSection>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="services"
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
