'use client'

/**
 * Assembly Calculator — Outbuildings and external demolition (Demolition → Outbuildings & External).
 * An outbuilding (shed, brick or prefab garage, conservatory, lean-to) from its footprint, with its concrete base if it comes out; a concrete, tarmac, slab or block-paving surface from its area and thickness; a garden or
 * boundary wall from its length, height and thickness; and fencing by the metre. The labourer's hours, the inert and general waste and the skips (or grab lorry loads) are worked out from them; breaking out concrete can
 * use a mini excavator with a breaker, with the digger priced in days on site. A prefab garage's asbestos roof is a provisional sum. The engine is lib/external-demo-units.ts.
 * It is on the Demolition list three ways, all this same screen and engine (as the Windows and Doors calculators are): Outbuildings & External (the older one, all four kinds), Outbuildings (sheds, garages,
 * conservatories, lean-tos) and External Works (surfaces, walls and fences). Each has its own saved state, so each is its own quote line.
 */

import React, { useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateExternalDemo, OUT_KINDS, OUT_KIND_LIST, HARD_KINDS, HARD_KIND_LIST, MACHINE_M3_PER_DAY, type ExtItem, type ExtType, type OutKind, type HardKind, type ExtResult,
} from '@/lib/external-demo-units'
import { describeExternalDemo, describeExternalDemoShort, type ExtDescriptionInput } from '@/lib/external-demo-description'
import { suggestExternalDemoLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
  /** which things this one lists: all four (the older Outbuildings & External), only outbuildings, or only the external works (surfaces, walls, fences) */
  scope?: ExtScope
}

export type ExtScope = 'all' | 'outbuildings' | 'external'
/** the kinds of thing each scope lists */
export const EXT_SCOPE_TYPES: Record<ExtScope, ExtType[]> = { all: ['outbuilding', 'hard', 'wall', 'fence'], outbuildings: ['outbuilding'], external: ['hard', 'wall', 'fence'] }
export const SCOPE_ID: Record<ExtScope, string> = { all: 'AssemblyExternalDemoDemo', outbuildings: 'AssemblyOutbuildingsDemo', external: 'AssemblyExternalWorksDemo' }
const SCOPE_NAME: Record<ExtScope, string> = { all: 'Outbuildings and external demolition', outbuildings: 'Outbuildings demolition', external: 'External demolition: surfaces, walls and fences' }

const TYPE_LABEL: Record<ExtType, string> = { outbuilding: 'An outbuilding', hard: 'A concrete, tarmac or paved surface', wall: 'A garden or boundary wall', fence: 'Fencing' }
const TYPE_COLOUR: Record<ExtType, string> = { outbuilding: '#a16207', hard: '#64748b', wall: '#92400e', fence: '#65a30d' }
const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyExternalDemoDemo({ onClose, onSave, labourTrades = [], scope = 'all' }: Props) {
  const ID = SCOPE_ID[scope]
  const scopeTypes = EXT_SCOPE_TYPES[scope]
  const [name, setName] = useCalcState(ID, 'name', SCOPE_NAME[scope])
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with nothing: you add what comes down
  const [items, setItems] = useCalcState<ExtItem[]>(ID, 'items', [])
  const [addTypeChosen, setAddType] = useCalcState<ExtType>(ID, 'addType', scopeTypes[0])
  const [machine, setMachine] = useCalcState(ID, 'machine', true)
  const [useGrab, setUseGrab] = useCalcState(ID, 'useGrab', false)
  const [diggerDays, setDiggerDays] = useCalcState<number | null>(ID, 'diggerDays', null)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addItem() {
    const addType = scopeTypes.includes(addTypeChosen) ? addTypeChosen : scopeTypes[0]
    setItems(p => [...p, {
      id: 'ext-' + uid(), name: '', type: addType, outKind: 'garage-brick', hardKind: 'concrete', areaM2: addType === 'outbuilding' ? 15 : 20, heightM: addType === 'wall' ? 1.8 : 2.4,
      thicknessMm: addType === 'wall' ? 215 : HARD_KINDS.concrete.defaultMm, lengthM: 10, breakBase: addType === 'outbuilding', baseMm: 100,
    }])
  }
  function updateItem(id: string, patch: Partial<ExtItem>) { setItems(p => p.map(x => x.id === id ? { ...x, ...patch } : x)) }

  const result = useMemo((): { ok: true; r: ExtResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateExternalDemo({ items, machine, useGrab }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [items, machine, useGrab])
  const r = result.ok ? result.r : null
  // the engine's own messages, less the ones that do not belong to this list (its empty message names every kind; the hard-surface one is for surfaces)
  const warnings = (r?.warnings ?? []).filter(w => !w.startsWith('Nothing to demolish yet') && !(scope === 'outbuildings' && w.startsWith('Check for drains and services')))

  const layers: AssemblyLayerDef[] = useMemo(() => {
    if (!r) return []
    const L: AssemblyLayerDef[] = []
    if (r.excavatorDays > 0) L.push(...diggerLayers(planDigger(r.excavatorDays, diggerDays), 'breaking out the concrete', 'Mini excavator with operator'))
    for (const l of r.lines) L.push({ id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit, unitCost: l.unitCost, fixedQty: l.qty, wastePct: 0 })
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

  // Labour, suggested from the items and following them until edited
  const labourSuggestions: LabourSuggestion[] = r ? suggestExternalDemoLabour(r.items.map(x => ({ id: x.id, name: x.name.toLowerCase(), hours: x.hours }))) : []
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

  // The customer's description follows the items until it's edited by hand
  const OUT_WORDS: Record<OutKind, string> = { shed: 'a timber shed', 'garage-brick': 'a brick or block garage', 'garage-prefab': 'a prefab concrete garage', conservatory: 'a conservatory', 'lean-to': 'a lean-to or carport' }
  const HARD_WORDS: Record<HardKind, string> = { concrete: 'concrete', slabs: 'paving slabs', blocks: 'block paving', tarmac: 'tarmac' }
  const wordsOf = (x: ExtItem): string => {
    if (x.type === 'outbuilding') return `${OUT_WORDS[x.outKind]}, ${x.areaM2}m²`
    if (x.type === 'hard') return `${x.areaM2}m² of ${HARD_WORDS[x.hardKind]}`
    if (x.type === 'wall') return `${x.lengthM}m of ${x.name.trim() || 'garden wall'}`
    return `${x.lengthM}m of fencing`
  }
  const descInput: ExtDescriptionInput | null = r ? {
    items: items.map(x => ({ words: wordsOf(x), base: x.type === 'outbuilding' && x.breakBase && x.areaM2 > 0, asbestos: x.type === 'outbuilding' && !!OUT_KINDS[x.outKind].asbestosRoof })),
    machine: machine && r.machineM3 > 0, skips: r.skipsGeneral + r.skipsInert, grabLoads: r.grabLoads,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeExternalDemoShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeExternalDemo(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the list</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the list — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
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
      {warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>⚠ {w}</div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>To demolish</span>
            {scopeTypes.length > 1 && (
              <select value={scopeTypes.includes(addTypeChosen) ? addTypeChosen : scopeTypes[0]} onChange={e => setAddType(e.target.value as ExtType)} style={{ ...small, minWidth: 200 }}>
                {scopeTypes.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            )}
            <button type="button" onClick={addItem} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add</button>
          </div>

          {items.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              Nothing yet. {scopeTypes.length > 1 ? 'Pick what is coming down above and press ' : 'Press '}<strong>+ Add</strong>{scopeTypes.length > 1 ? '' : scope === 'outbuildings' ? ' for each shed, garage, conservatory or lean-to coming down' : ''}.
            </div>
          )}

          {items.map(x => {
            const sum = r?.items.find(s => s.id === x.id)
            return (
              <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: TYPE_COLOUR[x.type], flexShrink: 0 }} />
                  <input value={x.name} onChange={e => updateItem(x.id, { name: e.target.value })} placeholder={`What it is, e.g. ${x.type === 'outbuilding' ? 'old garage at the back' : x.type === 'wall' ? 'wall to the neighbour' : x.type === 'hard' ? 'old drive' : 'fence along the side'}`}
                    style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.hours}h · ${(sum.generalM3 + sum.inertM3).toFixed(1)}m³ waste` : ''}</span>
                  <button type="button" onClick={() => setItems(p => p.filter(y => y.id !== x.id))} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                {x.type === 'outbuilding' && (<>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                    <PropRow label="Kind of building">
                      <select value={x.outKind} onChange={e => updateItem(x.id, { outKind: e.target.value as OutKind })} style={propInput}>
                        {OUT_KIND_LIST.map(k => <option key={k} value={k}>{OUT_KINDS[k].label}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Footprint (m²)">{numInput(x.areaM2, n => updateItem(x.id, { areaM2: n }), 0, 0.5)}</PropRow>
                  </div>
                  {check('Break out the concrete base too', x.breakBase, b => updateItem(x.id, { breakBase: b }), 'Taken up and carted away with the building')}
                  {x.breakBase && <PropRow label="Base thickness (mm)">{numInput(x.baseMm, n => updateItem(x.id, { baseMm: n }), 0, 10)}</PropRow>}
                </>)}
                {x.type === 'hard' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                    <PropRow label="What it is">
                      <select value={x.hardKind} onChange={e => updateItem(x.id, { hardKind: e.target.value as HardKind, thicknessMm: HARD_KINDS[e.target.value as HardKind].defaultMm })} style={propInput}>
                        {HARD_KIND_LIST.map(k => <option key={k} value={k}>{HARD_KINDS[k].label}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Area (m²)">{numInput(x.areaM2, n => updateItem(x.id, { areaM2: n }), 0, 0.5)}</PropRow>
                    <PropRow label="Thickness (mm)">{numInput(x.thicknessMm, n => updateItem(x.id, { thicknessMm: n }), 0, 5)}</PropRow>
                  </div>
                )}
                {x.type === 'wall' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <PropRow label="Length (m)">{numInput(x.lengthM, n => updateItem(x.id, { lengthM: n }), 0, 0.5)}</PropRow>
                    <PropRow label="Height (m)">{numInput(x.heightM, n => updateItem(x.id, { heightM: n }), 0, 0.1)}</PropRow>
                    <PropRow label="Thickness (mm)">{numInput(x.thicknessMm, n => updateItem(x.id, { thicknessMm: n }), 0, 5)}</PropRow>
                  </div>
                )}
                {x.type === 'fence' && <div style={{ width: 160 }}><PropRow label="Length (m)">{numInput(x.lengthM, n => updateItem(x.id, { lengthM: n }), 0, 0.5)}</PropRow></div>}
              </div>
            )
          })}

          {r && items.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.totalHours} labour hours; {r.inertM3} m³ of rubble and {r.generalM3} m³ of other waste: {r.skipsInert} rubble skip{r.skipsInert === 1 ? '' : 's'}{r.grabLoads > 0 ? ` (or ${r.grabLoads} grab lorry load${r.grabLoads === 1 ? '' : 's'})` : ''} and {r.skipsGeneral} general skip{r.skipsGeneral === 1 ? '' : 's'}.
              {r.machineM3 > 0 && <> {r.machineM3} m³ broken out by machine: about {r.excavatorDays} day{r.excavatorDays === 1 ? '' : 's'} at {MACHINE_M3_PER_DAY} m³ a day.</>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="How it comes down" borderColor="#bae6fd">
            {check('Mini excavator with a breaker for the concrete', machine, setMachine, 'For concrete, tarmac and bases: otherwise they are broken out by hand')}
            {check('Grab lorry for the rubble', useGrab, setUseGrab, 'Loads of about 8 m³ instead of skips')}
          </CollapsibleSection>
          {r && r.excavatorDays > 0 && <DiggerOnSiteSection diggingDays={r.excavatorDays} daysOnSite={diggerDays} onDaysOnSite={setDiggerDays} />}
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates and hours — change any single line in the cost breakdown below.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="demolition"
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
