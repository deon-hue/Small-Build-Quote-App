'use client'

/**
 * Assembly Calculator — Internal decoration, room by room (Decoration → Internal Wall & Ceiling Painting).
 * One calculator for the whole inside of the job: each room is sized, then says what condition its walls and ceiling are in (new plaster, painted and
 * sound, painted and poor, wallpapered) and how much filling and sanding they need, and whether the woodwork (skirting, architrave, rails), the doors
 * and the window frames are painted too. Preparation, painting walls and ceilings, and painting woodwork and doors are each priced for the room, so the
 * cost and the paint are shown room by room. Rates and hours are samples to be checked against real jobs. The engine is lib/decoration-units.ts.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import PlanRoomsBar from '@/components/PlanRoomsBar'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'
import { followPlanRooms, planRoomSig, plasterKindFor, planWallAreaM2 } from '@/lib/rooms-merge'
import { sidesFromAreaPerimeter } from '@/lib/tiling-common'
import { fmt } from '@/lib/utils'
import {
  calculateDecoration, newDecoRoom, ROOM_KINDS, ROOM_KIND_BY_ID, DEFAULT_DECO_SITUATIONS, MATERIAL_RATES,
  CONDITION_LABEL, PREP_LABEL, WOOD_CONDITION_LABEL, DOOR_KIND_LABEL,
  type DecoRoom, type DecoSituation, type DecoResult, type SurfaceCondition, type PrepLevel, type WoodCondition, type DoorKind,
} from '@/lib/decoration-units'
import { describeDecoration, describeDecorationShort, type DecorationDescribed } from '@/lib/decoration-description'
import { toLabourLines, matchTrade, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, miniInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the rooms found on the Take-off plan: they can be added with their sizes, and follow the plan until typed over */
  planRooms?: PlanRoomInfo[]
}

const NS = 'AssemblyDecorationDemo'
let _roomSeq = 0
const newRoomId = () => `deco-room-${Date.now().toString(36)}-${++_roomSeq}`

const RATE_LABELS: [keyof typeof MATERIAL_RATES, string, string][] = [
  ['wallMatt', 'Matt emulsion', '£/L'], ['wallSilk', 'Silk emulsion', '£/L'], ['ceiling', 'Ceiling paint', '£/L'], ['mist', 'Mist coat', '£/L'], ['sealer', 'Primer / sealer', '£/L'],
  ['woodPrimer', 'Wood primer', '£/L'], ['undercoat', 'Undercoat', '£/L'], ['satin', 'Satin topcoat', '£/L'], ['gloss', 'Gloss topcoat', '£/L'],
  ['filler', 'Filler', '£/kg'], ['prepSundries', 'Sandpaper and prep sundries', '£/m²'], ['strip', 'Wallpaper stripper and sugar soap', '£/m²'],
  ['protectBase', 'Dust sheets, tape and caulk (per room)', '£'], ['protectPerM2', '… plus per m² of floor', '£/m²'],
  ['steamerDay', 'Wallpaper steamer hire', '£/day'], ['towerWeek', 'Access tower hire', '£/week'],
]

export default function AssemblyDecorationDemo({ onClose, onSave, labourTrades = [], planRooms }: Props) {
  const [name, setName] = useCalcState(NS, 'name', 'Internal decoration')
  const [location, setLocation] = useCalcState(NS, 'location', '')
  const [qty, setQty] = useCalcState(NS, 'qty', 1)
  // The job starts with no rooms: add the ones it has. Nothing is pre-added.
  const [rooms, setRooms] = useCalcState<DecoRoom[]>(NS, 'rooms', [])
  const [addKind, setAddKind] = useState('bedroom')
  const [jobSituationId, setJobSituationId] = useCalcState(NS, 'jobSituationId', 'empty')
  const [situations, setSituations] = useCalcState<DecoSituation[]>(NS, 'situations', DEFAULT_DECO_SITUATIONS)
  const [towerWeeks, setTowerWeeks] = useCalcState(NS, 'towerWeeks', 0)
  // Drying time and return visits: % added to the painter's hours (a labour line of its own)
  const [dryingPct, setDryingPct] = useCalcState(NS, 'dryingPct', 10)
  const [rates, setRates] = useCalcState<Partial<Record<keyof typeof MATERIAL_RATES, number>>>(NS, 'rates', {})
  const [wastePct, setWastePct] = useCalcState(NS, 'wastePct', 10)
  const [profitPct, setProfitPct] = useCalcState(NS, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(NS, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(NS, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function updateRoom(id: string, patch: Partial<DecoRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function updateWalls(id: string, patch: Partial<DecoRoom['walls']>) { setRooms(p => p.map(r => r.id === id ? { ...r, walls: { ...r.walls, ...patch } } : r)) }
  function updateCeiling(id: string, patch: Partial<DecoRoom['ceiling']>) { setRooms(p => p.map(r => r.id === id ? { ...r, ceiling: { ...r.ceiling, ...patch } } : r)) }
  function updateWood(id: string, patch: Partial<DecoRoom['woodwork']>) { setRooms(p => p.map(r => r.id === id ? { ...r, woodwork: { ...r.woodwork, ...patch } } : r)) }
  function updateDoors(id: string, patch: Partial<DecoRoom['doorWork']>) { setRooms(p => p.map(r => r.id === id ? { ...r, doorWork: { ...r.doorWork, ...patch } } : r)) }
  function updateFrames(id: string, patch: Partial<DecoRoom['frames']>) { setRooms(p => p.map(r => r.id === id ? { ...r, frames: { ...r.frames, ...patch } } : r)) }
  // a room from the Take-off plan: its floor and wall length from the true area and perimeter, its height, doors and windows, and the wall and ceiling areas as drawn
  const fitToPlan = (r: DecoRoom, pr: PlanRoomInfo): DecoRoom => {
    const sides = sidesFromAreaPerimeter(pr.areaM2, pr.perimeterM)
    return { ...r, lengthM: sides.long, widthM: sides.short, heightM: pr.heightM, doors: pr.doors, windows: pr.windows, wallAreaOverrideM2: planWallAreaM2(pr), ceilingAreaOverrideM2: pr.areaM2 }
  }
  function addPlanRooms(list: PlanRoomInfo[]) {
    setRooms(p => {
      const made = list.filter(pr => !p.some(r => r.planRoomId === pr.id)).map(pr => ({ ...fitToPlan(newDecoRoom(newRoomId(), pr.name, plasterKindFor(pr.kind)), pr), planRoomId: pr.id, planRoomSig: planRoomSig(pr) }))
      return [...p, ...made]
    })
  }
  const planRoomsKey = planRooms ? planRooms.map(p => p.id + ':' + planRoomSig(p)).join(';') : null
  useEffect(() => {
    if (planRooms) setRooms(p => followPlanRooms(p, planRooms, fitToPlan))
  }, [planRoomsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function addRoom() {
    const k = ROOM_KIND_BY_ID[addKind]
    setRooms(p => {
      const n = p.filter(r => r.kindId === addKind).length
      return [...p, newDecoRoom(newRoomId(), n === 0 ? k.label : `${k.label} ${n + 1}`, addKind)]
    })
  }
  function copyRoom(id: string) {
    setRooms(p => {
      const i = p.findIndex(r => r.id === id)
      if (i < 0) return p
      const src = p[i]
      const copy: DecoRoom = JSON.parse(JSON.stringify(src))
      copy.id = newRoomId(); copy.name = `${src.name} (copy)`
      return [...p.slice(0, i + 1), copy, ...p.slice(i + 1)]
    })
  }
  const [allCondition, setAllCondition] = useState<SurfaceCondition>('painted-good')

  const result = useMemo((): { ok: true; r: DecoResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateDecoration({ rooms, jobSituationId, situations, rates, towerWeeks, dryingPct }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, jobSituationId, situations, rates, towerWeeks, dryingPct])
  const r = result.ok ? result.r : null

  const roomOfLayer = useMemo(() => new Map((r?.lines ?? []).map(l => [l.id, l.roomId])), [r])
  const layers: AssemblyLayerDef[] = useMemo(() => (r?.lines ?? []).map(l => ({
    id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit,
    unitCost: rateOverrides[l.id] != null ? rateOverrides[l.id] : l.unitCost, fixedQty: l.qty, wastePct: l.wasteApplies ? wastePct : 0,
  })), [r, rateOverrides, wastePct])
  const costedLines: CostedLine[] = useMemo(() => layers.map(l => costLayer(l, l.fixedQty ?? 0)), [layers])
  const enabledMaterialLines = costedLines.filter(l => !disabledLayerIds.has(l.layerId))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(NS, 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }
  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const allMaterialLines = [...costedLines, ...miscCostedLines]
  const enabledLines = [...enabledMaterialLines, ...miscCostedLines]

  // Labour — one task per room per kind of work, following the rooms until the labour is edited by hand
  const labourSuggestions: LabourSuggestion[] = useMemo(() => (r?.labour ?? []).map(t => ({ key: t.key, trade: 'painter' as const, task: t.task, hours: t.hours, basis: t.basis })), [r])
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useCalcState<LabourLine[] | null>(NS, 'labourOverride', null)
  const suggestedRef = useRef<LabourLine[]>([])
  suggestedRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines
  const addLabour = () => setLabourOverride(prev => { const b = prev ?? suggestedRef.current; return [...b, { id: newLabourLineId(), tradeId: b[0]?.tradeId ?? '', task: '', hours: 0 }] })
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourOverride(prev => (prev ?? suggestedRef.current).map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourOverride(prev => (prev ?? suggestedRef.current).filter(l => l.id !== id))
  const labourCostedLines: CostedLine[] = labourLines
    .map(l => {
      const trade = labourTrades.find(t => t.id === l.tradeId)
      if (!trade || l.hours <= 0) return null
      const rate = hourlyRate(trade)
      return { layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour', source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr', unitCost: rate, cost: +(l.hours * rate).toFixed(2) } as CostedLine
    })
    .filter((l): l is CostedLine => l !== null)

  const costSubtotal = enabledLines.reduce((s, l) => s + l.cost, 0) + labourCostedLines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(costSubtotal * profitPct / 100).toFixed(2)
  const profitLine: CostedLine | null = profitPct > 0 ? { layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed', wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount } : null
  const totalCost = costSubtotal + profitAmount

  // What each room costs (materials and the painter's time at the Back Office rate), before profit
  const painter = matchTrade('painter', labourTrades)
  const roomCost = (roomId: string) => {
    const mat = enabledMaterialLines.filter(l => roomOfLayer.get(l.layerId) === roomId).reduce((s, l) => s + l.cost, 0)
    const hrs = (r?.labour ?? []).filter(t => t.roomId === roomId).reduce((s, t) => s + t.hours, 0)
    return mat + (painter ? hrs * hourlyRate(painter) : 0)
  }

  // The customer's description follows the rooms until it's edited by hand
  const described: DecorationDescribed | null = r ? {
    rooms: r.rooms,
    walls: rooms.some(x => x.walls.paint), ceilings: rooms.some(x => x.ceiling.paint), woodwork: rooms.some(x => x.woodwork.paint),
    doors: rooms.some(x => x.doorWork.paint), frames: rooms.some(x => x.frames.paint), stripping: r.totalStripM2 > 0,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(NS, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(NS, 'detailOverride', null)
  const description = descriptionOverride ?? (described ? describeDecorationShort(described) : '')
  const detail = detailOverride ?? (described ? describeDecoration(described) : '')

  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const lbl: React.CSSProperties = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }
  const num = (v: number, set: (n: number) => void, min = 0, step = 0.1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={miniInput} />
  )
  /** a number that is worked out until typed over: empty means "use the sum", shown as the placeholder */
  const autoNum = (v: number | null, auto: number, set: (n: number | null) => void, step = 0.1) => (
    <NumInput type="number" min={0} step={step} value={v ?? ''} placeholder={`auto ${Math.round(auto * 10) / 10}`} title="Worked out from the room. Type a number to use your own; clear the box to go back to the sum."
      onChange={e => set(e.target.value === '' ? null : Math.max(0, +e.target.value || 0))} style={miniInput} />
  )
  const select = <T extends string>(v: T, set: (v: T) => void, opts: Record<string, string>) => (
    <select value={v} onChange={e => set(e.target.value as T)} style={miniInput}>{Object.entries(opts).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>
  )
  const check = (on: boolean, set: (b: boolean) => void, text: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto' }} />{text}
    </label>
  )
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the rooms</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the rooms — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the rooms</button>
  const jobSit = situations.find(s => s.id === jobSituationId)

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
        {r && <MaterialsListButtons lines={enabledMaterialLines} title={`${name} — paint and materials`} location={location} description={description} compact />}
        {onSave && r && (
          <button onClick={() => onSave({ name, qty, location, description, detail, lines: [...enabledLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>💾 Save &amp; Price</button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={lbl}>Quote line (short — printed on the quote)</label>
          {following(descriptionOverride, () => setDescriptionOverride(null), 'line')}
        </div>
        <textarea value={description} onChange={e => setDescriptionOverride(e.target.value)} rows={2} style={box} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={lbl}>What&apos;s included (full — shown on the online quote)</label>
          {following(detailOverride, () => setDetailOverride(null), 'description')}
        </div>
        <textarea value={detail} onChange={e => setDetailOverride(e.target.value)} rows={6} style={box} />
      </div>

      {/* An engine error is a banner above the controls, never instead of them: typing a value digit by digit passes through invalid ones. */}
      {!result.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {result.error}</div>}
      {r && r.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>⚠ {w}</div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div>
          <PlanRoomsBar planRooms={planRooms} isAdded={id => rooms.some(r => r.planRoomId === id)} onAdd={r => addPlanRooms([r])} onAddAll={addPlanRooms} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
            <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...small, minWidth: 170 }}>
              {ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <button type="button" onClick={addRoom}
              style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>A new room starts with its walls and ceiling switched on. Change its size, then what condition each surface is in.</span>
          </div>

          {r && r.days.rooms.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#334155', lineHeight: 1.5 }}>
              <div>
                <strong style={{ fontSize: 14, color: '#0369a1' }}>About {r.days.daysOnSite} day{r.days.daysOnSite === 1 ? '' : 's'} on site</strong>
                <span style={{ color: '#64748b' }}> — the painter&apos;s time is {r.days.totalHours} h{r.days.allowanceHours > 0 ? ` (including ${r.days.allowanceHours} h for drying and return visits)` : ''}, which is {r.days.workDays} day{r.days.workDays === 1 ? '' : 's'} of 8 hours.</span>
              </div>
              {r.days.longestChainDays > r.days.workDays
                ? <div style={{ color: '#92400e' }}>Drying sets the length: {r.days.longestRoom} needs at least {r.days.longestChainDays} days because each step has to dry before the next.</div>
                : <div style={{ color: '#64748b' }}>The painter can move to another room while one dries, so the painter&apos;s time sets the length.</div>}
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>An estimate for planning (working days, one painter): two coats in a day only where the room is small enough to fit both with the drying between.</div>
            </div>
          )}

          {rooms.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>. Add every room that is being decorated.
            </div>
          )}

          {rooms.map(rm => {
            const sum = r?.rooms.find(s => s.roomId === rm.id)
            const w = rm.walls, c = rm.ceiling
            return (
              <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                  <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }} title="Materials and the painter's time for this room, before profit">{fmt(roomCost(rm.id))}</span>
                  <button type="button" onClick={() => copyRoom(rm.id)} title="Copy this room (same sizes and finishes) — useful for matching bedrooms"
                    style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 4, color: '#0369a1', cursor: 'pointer', fontSize: 11, padding: '2px 8px' }}>Copy</button>
                  <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room"
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                {sum && (
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
                    Walls {sum.wallM2} m² · ceiling {sum.ceilingM2} m²{sum.skirtingLm > 0 ? ` · skirting ${sum.skirtingLm} lm` : ''}{sum.architraveLm > 0 ? ` · architrave ${sum.architraveLm} lm` : ''}{sum.doorCount > 0 ? ` · ${sum.doorCount} door${sum.doorCount === 1 ? '' : 's'}` : ''}{sum.frameCount > 0 ? ` · ${sum.frameCount} window frame${sum.frameCount === 1 ? '' : 's'}` : ''}
                    {sum.uplift !== 0 ? ` · +${sum.uplift}% time` : ''}
                    {(() => { const d = r?.days.rooms.find(x => x.roomId === rm.id); return d && d.chainDays > 0 ? <span title={d.why} style={{ color: '#0369a1' }}> · at least {d.chainDays} day{d.chainDays === 1 ? '' : 's'} to dry between steps</span> : null })()}
                  </div>
                )}

                <CollapsibleSection title="Size and openings">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6, marginBottom: 6 }}>
                    <div><div style={lbl}>Length (m)</div>{num(rm.lengthM, n => updateRoom(rm.id, { lengthM: n }))}</div>
                    <div><div style={lbl}>Width (m)</div>{num(rm.widthM, n => updateRoom(rm.id, { widthM: n }))}</div>
                    <div><div style={lbl}>Height (m)</div>{num(rm.heightM, n => updateRoom(rm.id, { heightM: n }))}</div>
                    <div><div style={lbl}>Doors</div>{num(rm.doors, n => updateRoom(rm.id, { doors: n }), 0, 1)}</div>
                    <div><div style={lbl}>Windows</div>{num(rm.windows, n => updateRoom(rm.id, { windows: n }), 0, 1)}</div>
                    <div><div style={lbl}>Wall area (m²)</div>{autoNum(rm.wallAreaOverrideM2, sum?.wallM2 ?? 0, n => updateRoom(rm.id, { wallAreaOverrideM2: n }))}</div>
                    <div><div style={lbl}>Ceiling (m²)</div>{autoNum(rm.ceilingAreaOverrideM2, sum?.ceilingM2 ?? 0, n => updateRoom(rm.id, { ceilingAreaOverrideM2: n }))}</div>
                  </div>
                  {check(rm.protect, b => updateRoom(rm.id, { protect: b }), 'Protect floors and fittings (dust sheets, masking)')}
                  <div style={{ maxWidth: 260 }}>
                    <div style={lbl}>Situation for this room</div>
                    <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={miniInput}>
                      <option value="">Job standard{jobSit ? ` (${jobSit.upliftPct >= 0 ? '+' : ''}${jobSit.upliftPct}%)` : ''}</option>
                      {situations.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]} ({s.upliftPct >= 0 ? '+' : ''}{s.upliftPct}%)</option>)}
                    </select>
                  </div>
                </CollapsibleSection>

                <CollapsibleSection title={`Walls — ${w.paint ? `${CONDITION_LABEL[w.condition].split(' (')[0].toLowerCase()}, ${w.prep} prep, ${w.coats} coat${w.coats === 1 ? '' : 's'}` : 'not painted'}`}>
                  {check(w.paint, b => updateWalls(rm.id, { paint: b }), 'Paint the walls')}
                  {w.paint && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                      <div><div style={lbl}>What state are they in?</div>{select<SurfaceCondition>(w.condition, v => updateWalls(rm.id, { condition: v }), CONDITION_LABEL)}</div>
                      <div><div style={lbl}>Filling and sanding</div>{select<PrepLevel>(w.prep, v => updateWalls(rm.id, { prep: v }), PREP_LABEL)}</div>
                      <div><div style={lbl}>Finish coats</div>{num(w.coats, n => updateWalls(rm.id, { coats: n }), 0, 1)}</div>
                      <div><div style={lbl}>Paint</div>{select<'matt' | 'silk'>(w.finish, v => updateWalls(rm.id, { finish: v }), { matt: 'Matt emulsion', silk: 'Silk emulsion' })}</div>
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection title={`Ceiling — ${c.paint ? `${CONDITION_LABEL[c.condition].split(' (')[0].toLowerCase()}, ${c.prep} prep, ${c.coats} coat${c.coats === 1 ? '' : 's'}` : 'not painted'}`}>
                  {check(c.paint, b => updateCeiling(rm.id, { paint: b }), 'Paint the ceiling')}
                  {c.paint && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
                      <div><div style={lbl}>What state is it in?</div>{select<SurfaceCondition>(c.condition, v => updateCeiling(rm.id, { condition: v }), CONDITION_LABEL)}</div>
                      <div><div style={lbl}>Filling and sanding</div>{select<PrepLevel>(c.prep, v => updateCeiling(rm.id, { prep: v }), PREP_LABEL)}</div>
                      <div><div style={lbl}>Finish coats</div>{num(c.coats, n => updateCeiling(rm.id, { coats: n }), 0, 1)}</div>
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection title={`Woodwork — ${rm.woodwork.paint ? 'skirting, architrave and rails' : 'not painted'}`}>
                  {check(rm.woodwork.paint, b => updateWood(rm.id, { paint: b }), 'Paint the skirting boards, architraves and rails')}
                  {rm.woodwork.paint && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                      <div><div style={lbl}>What state is it in?</div>{select<WoodCondition>(rm.woodwork.condition, v => updateWood(rm.id, { condition: v }), WOOD_CONDITION_LABEL)}</div>
                      <div><div style={lbl}>Finish</div>{select<'satin' | 'gloss'>(rm.woodwork.finish, v => updateWood(rm.id, { finish: v }), { satin: 'Satin', gloss: 'Gloss' })}</div>
                      <div><div style={lbl}>Topcoats</div>{num(rm.woodwork.topcoats, n => updateWood(rm.id, { topcoats: n }), 0, 1)}</div>
                      <div><div style={lbl}>Skirting (lm)</div>{autoNum(rm.woodwork.skirtingLm, sum?.skirtingLm || Math.max(0, 2 * (rm.lengthM + rm.widthM) - rm.doors * 0.9), n => updateWood(rm.id, { skirtingLm: n }))}</div>
                      <div><div style={lbl}>Skirting height (mm)</div>{num(rm.woodwork.skirtingHeightMm, n => updateWood(rm.id, { skirtingHeightMm: n }), 0, 10)}</div>
                      <div><div style={lbl}>Architrave (lm)</div>{autoNum(rm.woodwork.architraveLm, rm.doors * 10.2, n => updateWood(rm.id, { architraveLm: n }))}</div>
                      <div><div style={lbl}>Picture / dado rails (lm)</div>{num(rm.woodwork.railsLm, n => updateWood(rm.id, { railsLm: n }))}</div>
                      <div><div style={lbl}>Other woodwork (lm)</div>{num(rm.woodwork.otherLm, n => updateWood(rm.id, { otherLm: n }))}</div>
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection title={`Doors — ${rm.doorWork.paint ? `${rm.doorWork.count ?? rm.doors} ${DOOR_KIND_LABEL[rm.doorWork.kind].split(' /')[0].toLowerCase()}${(rm.doorWork.count ?? rm.doors) === 1 ? '' : 's'}` : 'not painted'}`}>
                  {check(rm.doorWork.paint, b => updateDoors(rm.id, { paint: b }), 'Paint the doors (both sides, edges and lining)')}
                  {rm.doorWork.paint && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                      <div><div style={lbl}>Kind of door</div>{select<DoorKind>(rm.doorWork.kind, v => updateDoors(rm.id, { kind: v }), DOOR_KIND_LABEL)}</div>
                      <div><div style={lbl}>What state are they in?</div>{select<WoodCondition>(rm.doorWork.condition, v => updateDoors(rm.id, { condition: v }), WOOD_CONDITION_LABEL)}</div>
                      <div><div style={lbl}>How many</div>{autoNum(rm.doorWork.count, rm.doors, n => updateDoors(rm.id, { count: n }), 1)}</div>
                      <div><div style={lbl}>Topcoats</div>{num(rm.doorWork.topcoats, n => updateDoors(rm.id, { topcoats: n }), 0, 1)}</div>
                    </div>
                  )}
                </CollapsibleSection>

                <CollapsibleSection title={`Window frames — ${rm.frames.paint ? `${rm.frames.count ?? rm.windows} to paint` : 'not painted'}`}>
                  {check(rm.frames.paint, b => updateFrames(rm.id, { paint: b }), 'Paint the inside of the window frames')}
                  {rm.frames.paint && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
                      <div><div style={lbl}>What state are they in?</div>{select<WoodCondition>(rm.frames.condition, v => updateFrames(rm.id, { condition: v }), WOOD_CONDITION_LABEL)}</div>
                      <div><div style={lbl}>How many</div>{autoNum(rm.frames.count, rm.windows, n => updateFrames(rm.id, { count: n }), 1)}</div>
                      <div><div style={lbl}>Topcoats</div>{num(rm.frames.topcoats, n => updateFrames(rm.id, { topcoats: n }), 0, 1)}</div>
                    </div>
                  )}
                </CollapsibleSection>
              </div>
            )
          })}

          {r && rooms.length > 0 && <DecorationDrawing rooms={r.rooms} />}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Situation for the whole job">
            <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
              {situations.map(s => <option key={s.id} value={s.id}>{s.label} ({s.upliftPct >= 0 ? '+' : ''}{s.upliftPct}%)</option>)}
            </select>
          </PropRow>
          <PropRow label="Set every room's surfaces to…">
            <div style={{ display: 'flex', gap: 4 }}>
              <select value={allCondition} onChange={e => setAllCondition(e.target.value as SurfaceCondition)} style={{ ...propInput, flex: 1 }}>
                {Object.entries(CONDITION_LABEL).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
              <button type="button" disabled={rooms.length === 0} onClick={() => setRooms(p => p.map(x => ({ ...x, walls: { ...x.walls, condition: allCondition }, ceiling: { ...x.ceiling, condition: allCondition === 'wallpaper' ? x.ceiling.condition : allCondition } })))}
                title="Sets the walls (and the ceilings, except for wallpaper) in every room to this state" style={{ fontSize: 11, padding: '3px 8px', border: '1px solid #bae6fd', borderRadius: 4, background: '#fff', color: '#0369a1', cursor: rooms.length === 0 ? 'default' : 'pointer' }}>Apply</button>
            </div>
          </PropRow>

          <CollapsibleSection title="Access">
            <PropRow label="Access tower hire (weeks)">{num(towerWeeks, setTowerWeeks, 0, 1)}</PropRow>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>Off unless you need it: high ceilings or a stairwell. A wallpaper steamer is added by itself when anything is stripped.</div>
          </CollapsibleSection>

          <CollapsibleSection title="Situations (the % added to the painter's time)">
            {situations.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{s.label}</span>
                <NumInput type="number" step={1} value={s.upliftPct} onChange={e => setSituations(p => p.map(x => x.id === s.id ? { ...x, upliftPct: +e.target.value || 0 } : x))} style={{ ...small, width: 54, textAlign: 'right' }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Material rates">
            {RATE_LABELS.map(([k, label, unit]) => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{label}</span>
                <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{unit}</span>
                <NumInput type="number" min={0} step={0.1} value={rates[k] ?? MATERIAL_RATES[k]} onChange={e => setRates(p => ({ ...p, [k]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 62, textAlign: 'right' }} />
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>Sample rates — use your own trade prices. You can also change any single line in the cost breakdown below.</div>
          </CollapsibleSection>

          <PropRow label={`Drying time and return visits (${dryingPct}%)`}>
            <input type="range" min={0} max={30} value={dryingPct} onChange={e => setDryingPct(+e.target.value)} style={{ width: '100%' }} />
            <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Added to the painter&apos;s hours as its own labour line, for waiting on filler, caulk and paint and coming back the next day. A single room or lots of filling needs more; several rooms less.</div>
          </PropRow>
          <PropRow label={`Waste % on paint and filler (${wastePct}%)`}>
            <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}>
            <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="decoration"
        />
        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {r && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={allMaterialLines} onRateChange={handleRate} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
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

// ── The drawing: each room as a bar of its surfaces, walls and ceiling in m², so big rooms stand out ──
function DecorationDrawing({ rooms }: { rooms: DecoResult['rooms'] }) {
  const rows = rooms.length
  const max = Math.max(1, ...rooms.map(s => s.wallM2 + s.ceilingM2))
  const rowH = 24, labelW = 130, barW = 250, vbW = labelW + barW + 90, vbH = rows * rowH + 34
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', maxHeight: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4 }}>
      {rooms.map((s, i) => {
        const y = 8 + i * rowH
        const ww = (s.wallM2 / max) * barW, cw = (s.ceilingM2 / max) * barW
        return (
          <g key={s.roomId}>
            <text x={labelW - 6} y={y + 12} fontSize={10} fill="#334155" textAnchor="end">{s.name.length > 20 ? s.name.slice(0, 19) + '…' : s.name}</text>
            {s.wallM2 > 0 && <rect x={labelW} y={y} width={Math.max(ww, 1)} height={rowH - 8} fill="#38bdf8" rx={2}><title>Walls: {s.wallM2} m²</title></rect>}
            {s.ceilingM2 > 0 && <rect x={labelW + ww} y={y} width={Math.max(cw, 1)} height={rowH - 8} fill="#a5b4fc" rx={2}><title>Ceiling: {s.ceilingM2} m²</title></rect>}
            <text x={labelW + ww + cw + 6} y={y + 12} fontSize={10} fill="#475569">{Math.round(s.wallM2 + s.ceilingM2)} m²{s.stripM2 > 0 ? ' · strip' : ''}</text>
          </g>
        )
      })}
      <g transform={`translate(8, ${vbH - 16})`}><rect width={9} height={9} fill="#38bdf8" rx={2} /><text x={13} y={8} fontSize={9} fill="#64748b">Walls</text></g>
      <g transform={`translate(64, ${vbH - 16})`}><rect width={9} height={9} fill="#a5b4fc" rx={2} /><text x={13} y={8} fontSize={9} fill="#64748b">Ceiling</text></g>
    </svg>
  )
}
