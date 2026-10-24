'use client'

/**
 * Assembly Calculator — Strip-out by room (Demolition → Strip-Out by Room).
 * Each room has a kind, a floor area and a ceiling height, and a list of what comes out (floors, ceiling, wall linings and tiles, skirtings, doors, kitchen units, sanitaryware, radiators). A new room comes with
 * the usual set for its kind worked out from its size; every count can be changed, and the usual set can be brought back for a new size. The labourer's hours, the loose waste and the skips it fills are worked out
 * from the items; services to disconnect and dust protection are optional per room, an asbestos survey optional for the job. The engine is lib/strip-out-units.ts.
 */

import React, { useEffect, useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateStripOut, STRIP_ITEMS, STRIP_BY_ID, STRIP_GROUP_LABEL, STRIP_ROOM_TYPES, STRIP_ROOM_BY_ID, usualStripItems, SKIP_M3, SKIP_FILL,
  type StripRoom, type StripGroup, type StripResult,
} from '@/lib/strip-out-units'
import { describeStripOut, describeStripOutShort, type StripDescriptionInput } from '@/lib/strip-out-description'
import { suggestStripOutLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import PlanRoomsBar from '@/components/PlanRoomsBar'
import { followPlanRooms, planRoomSig, stripKindFor } from '@/lib/rooms-merge'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the rooms found on the Take-off plan: they can be added with their names and sizes */
  planRooms?: PlanRoomInfo[]
}

const GROUP_COLOUR: Record<StripGroup, string> = { floor: '#a16207', ceiling: '#64748b', walls: '#0891b2', joinery: '#7c3aed', kitchen: '#16a34a', sanitary: '#2563eb' }
const GROUPS = Object.keys(STRIP_GROUP_LABEL) as StripGroup[]
const uid = () => Math.random().toString(36).slice(2, 9)

function newRoom(kind: string, existing: number): StripRoom {
  const t = STRIP_ROOM_BY_ID[kind]
  const area = t.areaM2
  return {
    id: 'room-' + uid(), name: existing === 0 ? t.label : `${t.label} ${existing + 1}`, kind, areaM2: area, heightM: 2.4,
    items: usualStripItems(kind, area, 2.4), dust: true, disconnectPlumber: t.wetRoom && kind !== 'utility', disconnectElectrician: kind === 'kitchen',
  }
}

export const unitWord = (it: { unit: string }, n: number) => (it.unit === 'nr' ? '' : it.unit === 'lm' ? 'lm' : 'm²')

export default function AssemblyStripOutDemo({ onClose, onSave, labourTrades = [], planRooms }: Props) {
  const ID = 'AssemblyStripOutDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Strip-out')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no rooms: you add the ones being stripped out
  const [rooms, setRooms] = useCalcState<StripRoom[]>(ID, 'rooms', [])
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'kitchen')
  const [asbestosSurveys, setAsbestosSurveys] = useCalcState(ID, 'asbestosSurveys', 0)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  // a room from the Take-off plan: its floor area and height; what is taken out starts as the usual for that kind and size. When the plan's room changes, the items still at the usual for the old size move to the usual for the new; any count you typed stays.
  const fitToPlan = (r: StripRoom, pr: PlanRoomInfo): StripRoom => {
    const was = usualStripItems(r.kind, r.areaM2, r.heightM), now = usualStripItems(r.kind, pr.areaM2, pr.heightM)
    const items = { ...r.items }
    for (const k of Object.keys(now)) if (!(k in items) || items[k] === was[k]) items[k] = now[k]
    return { ...r, areaM2: pr.areaM2, heightM: pr.heightM, items }
  }
  function addPlanRooms(list: PlanRoomInfo[]) {
    setRooms(p => {
      const made = list.filter(pr => !p.some(r => r.planRoomId === pr.id)).map(pr => {
        const kind = stripKindFor(pr.kind)
        const t = STRIP_ROOM_BY_ID[kind]
        const room: StripRoom = { id: 'room-' + uid(), name: pr.name, kind, areaM2: pr.areaM2, heightM: pr.heightM, items: usualStripItems(kind, pr.areaM2, pr.heightM), dust: true, disconnectPlumber: t.wetRoom && kind !== 'utility', disconnectElectrician: kind === 'kitchen', planRoomId: pr.id, planRoomSig: planRoomSig(pr) }
        return room
      })
      return [...p, ...made]
    })
  }
  const planRoomsKey = planRooms ? planRooms.map(p => p.id + ':' + planRoomSig(p)).join(';') : null
  useEffect(() => {
    if (planRooms) setRooms(p => followPlanRooms(p, planRooms, fitToPlan))
  }, [planRoomsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateRoom(id: string, patch: Partial<StripRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function setCount(roomId: string, itemId: string, n: number) { setRooms(p => p.map(r => r.id === roomId ? { ...r, items: { ...r.items, [itemId]: Math.max(0, n) } } : r)) }
  function removeItem(roomId: string, itemId: string) { setRooms(p => p.map(r => { if (r.id !== roomId) return r; const it = { ...r.items }; delete it[itemId]; return { ...r, items: it } })) }

  const result = useMemo((): { ok: true; r: StripResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateStripOut({ rooms, asbestosSurveys }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, asbestosSurveys])
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

  // Labour, suggested from the rooms and following them until edited
  const labourSuggestions: LabourSuggestion[] = r ? suggestStripOutLabour(rooms.map(rm => ({
    id: rm.id, name: rm.name.trim() || 'the room',
    parts: STRIP_ITEMS.filter(it => (rm.items[it.id] ?? 0) > 0).map(it => ({ qty: rm.items[it.id], unit: it.unit, what: it.name.toLowerCase(), rate: it.hours })),
  }))) : []
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

  // The customer's description follows the rooms until it's edited by hand
  const descInput: StripDescriptionInput | null = r ? {
    rooms: rooms.map(rm => ({
      name: rm.name.trim() || 'Room',
      items: STRIP_ITEMS.filter(it => (rm.items[it.id] ?? 0) > 0).map(it => it.unit === 'nr' ? `${rm.items[it.id]} ${it.name.toLowerCase().replace(/ \(.*\)$/, '')}` : `${rm.items[it.id]}${unitWord(it, rm.items[it.id])} of ${it.name.toLowerCase().replace(/ \(.*\)$/, '')}`),
      dust: rm.dust,
      disconnects: [...(rm.disconnectPlumber ? ['a plumber disconnects and caps off the water and waste'] : []), ...(rm.disconnectElectrician ? ['an electrician disconnects and makes safe'] : [])],
    })),
    skips: r.skips, asbestosSurveys,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeStripOutShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeStripOut(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the rooms</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the rooms — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void) => (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#475569', cursor: 'pointer', marginRight: 12 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto' }} />{label}
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
          <PlanRoomsBar planRooms={planRooms} isAdded={id => rooms.some(r => r.planRoomId === id)} onAdd={r => addPlanRooms([r])} onAddAll={addPlanRooms} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
            <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...small, minWidth: 190 }}>
              {STRIP_ROOM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" onClick={() => setRooms(p => [...p, newRoom(addKind, p.filter(x => x.kind === addKind).length)])}
              style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>A new room comes with what is usually stripped out, for its size — change the numbers to suit.</span>
          </div>

          {rooms.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>.
            </div>
          )}

          {rooms.map(rm => {
            const sum = r?.roomSummaries.find(s => s.roomId === rm.id)
            const unused = STRIP_ITEMS.filter(it => rm.items[it.id] === undefined)
            return (
              <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.hours}h · ${sum.wasteM3}m³ waste` : ''}</span>
                  <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6, flexWrap: 'wrap' }}>
                  <div style={{ width: 110 }}><PropRow label="Floor area (m²)">{numInput(rm.areaM2, n => updateRoom(rm.id, { areaM2: n }), 0, 0.5)}</PropRow></div>
                  <div style={{ width: 110 }}><PropRow label="Ceiling height (m)">{numInput(rm.heightM, n => updateRoom(rm.id, { heightM: n }), 0, 0.1)}</PropRow></div>
                  <button type="button" onClick={() => updateRoom(rm.id, { items: usualStripItems(rm.kind, rm.areaM2, rm.heightM) })} title="Replace the list below with the usual set for this kind of room at this size"
                    style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, border: '1px solid #bae6fd', background: '#f5fbff', color: '#0369a1', cursor: 'pointer', marginBottom: 6 }}>↻ Usual items for this size</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 12px' }}>
                  {STRIP_ITEMS.filter(it => rm.items[it.id] !== undefined).map(it => (
                    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLOUR[it.group], flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, color: '#334155', flex: 1, minWidth: 0 }}>{it.name}{it.unit !== 'nr' ? ` (${it.unit})` : ''}</span>
                      <NumInput type="number" min={0} step={it.unit === 'nr' ? 1 : 0.5} value={rm.items[it.id]} onChange={e => setCount(rm.id, it.id, +e.target.value || 0)} style={{ ...small, width: 56, textAlign: 'right' }} />
                      <button type="button" onClick={() => removeItem(rm.id, it.id)} title="Take this out of the list" style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
                {unused.length > 0 && (
                  <select value="" onChange={e => { if (e.target.value) setCount(rm.id, e.target.value, 1) }} style={{ ...small, marginTop: 6, color: '#64748b' }}>
                    <option value="">+ Add something else to take out…</option>
                    {GROUPS.map(g => {
                      const opts = unused.filter(it => it.group === g)
                      return opts.length === 0 ? null : <optgroup key={g} label={STRIP_GROUP_LABEL[g]}>{opts.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}</optgroup>
                    })}
                  </select>
                )}
                <div style={{ marginTop: 8, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                  {check('Dust sheets', rm.dust, b => updateRoom(rm.id, { dust: b }))}
                  {check('Plumber disconnects', rm.disconnectPlumber, b => updateRoom(rm.id, { disconnectPlumber: b }))}
                  {check('Electrician disconnects', rm.disconnectElectrician, b => updateRoom(rm.id, { disconnectElectrician: b }))}
                </div>
              </div>
            )
          })}

          {r && rooms.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {rooms.length} room{rooms.length === 1 ? '' : 's'}: {r.totalHours} labour hours, {r.wasteM3} m³ of loose waste, {r.skips} skip{r.skips === 1 ? '' : 's'} (a 6-yard skip holds about {(SKIP_M3 * SKIP_FILL).toFixed(1)} m³ of this).
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="Asbestos" borderColor="#bae6fd">
            <PropRow label="Asbestos surveys (nr)">{numInput(asbestosSurveys, n => setAsbestosSurveys(Math.round(n)), 0, 1)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>For a building before 2000, a survey before anything is stripped. Removal itself is a specialist's job and not priced here.</div>
          </CollapsibleSection>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates and hours — change any single line in the cost breakdown below.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="strip-out"
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
