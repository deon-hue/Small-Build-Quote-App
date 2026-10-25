'use client'

/**
 * Assembly Calculator — Plumbing installation, priced room by room (Plumbing & Heating → Plumbing Installation (by room)).
 * A plumber normally charges a price per fitting, all in (hot, cold and waste pipework, fittings, first and second fix), so each room is a list of fittings with a count and a rate. A "situation"
 * (new build, refurbishment, occupied house, hard to reach, listed building) adds a percentage you set to the fittings, for the whole job or one room. Each room says whether the client or
 * we supply the sanitaryware, taps and radiators (we supply = a provisional sum for each). A special fitting (a freestanding bath, a wet room, a boiling water tap...) is an extra install on
 * top of its fitting. A room where per-fitting doesn't fit can be priced by the day instead. Whole-house items (pressure test, stop tap, main, manifold) are at the bottom of the list.
 * Counts and prices only: pipe sizes, the system design, and the boiler, cylinder or heat pump (a Heating System calculator, to come) are not here. The engine is lib/plumbing-units.ts.
 */

import React, { useMemo, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculatePlumbing, FITTING_TYPES, GROUP_LABEL, ROOM_TYPES, ROOM_TYPE_BY_ID, DEFAULT_SITUATIONS, SPECIAL_TYPES, WHOLE_HOUSE_ITEMS,
  type PlumbingRoom, type PlumbingSpecial, type Situation, type FittingGroup, type PlumbingResult,
  PIPE_MATERIAL_LABEL, PIPE_SIZE_LIST, DEFAULT_PIPE_RATES, DEFAULT_PIPE_LABOUR_PER_M, DEFAULT_JOINT_LABOUR, type PipeMaterial,
} from '@/lib/plumbing-units'
import { FITTING_LABEL, type PipeSummary } from '@/lib/pipe-network'
import { describePlumbing, describePlumbingShort, type PlumbingDescriptionInput } from '@/lib/plumbing-description'
import { plumbingDescriptionInput } from '@/lib/plumbing-wording'
import { fmt } from '@/lib/utils'
import PlanRoomsBar from '@/components/PlanRoomsBar'
import { plumbingKindFor } from '@/lib/rooms-merge'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'
import type { PlacedRoom } from '@/lib/plumb-points'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the rooms found on the Take-off plan: they can be added with their names and sizes */
  planRooms?: PlanRoomInfo[]
  /** the fittings placed on the Take-off plan, room by room: their counts follow the plan until typed over, and radiators carry their sizes */
  placed?: PlacedRoom[]
  /** the heating pipe runs drawn on the Take-off plan (sized, with their fittings counted) */
  pipes?: PipeSummary
}

const GROUP_COLOUR: Record<FittingGroup, string> = { sanitaryware: '#0891b2', kitchen: '#7c3aed', heating: '#dc2626', outside: '#16a34a' }
const GROUPS = Object.keys(GROUP_LABEL) as FittingGroup[]

const uid = () => Math.random().toString(36).slice(2, 9)

function newRoom(typeId: string, existingOfType: number): PlumbingRoom {
  const t = ROOM_TYPE_BY_ID[typeId]
  return {
    id: 'room-' + uid(), name: existingOfType === 0 ? t.label : `${t.label} ${existingOfType + 1}`, typeId,
    fittings: { ...t.fittings }, situationId: null, mode: 'fittings', days: 1, dayRate: 280, supply: 'client', specials: [],
  }
}

export default function AssemblyPlumbingDemo({ onClose, onSave, labourTrades = [], planRooms, placed, pipes }: Props) {
  const ID = 'AssemblyPlumbingDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Plumbing installation')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no rooms: you add the ones it has. Only the pressure test and commissioning is in the starting price.
  const [rooms, setRooms] = useCalcState<PlumbingRoom[]>(ID, 'rooms', [])
  const [wholeHouse, setWholeHouse] = useCalcState<Record<string, number>>(ID, 'wholeHouse', () => Object.fromEntries(WHOLE_HOUSE_ITEMS.map(w => [w.id, w.defaultQty])))
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'new-build')
  const [situations, setSituations] = useCalcState<Situation[]>(ID, 'situations', DEFAULT_SITUATIONS)
  const [fittingRates, setFittingRates] = useCalcState<Record<string, number>>(ID, 'fittingRates', {})
  const [pcRates, setPcRates] = useCalcState<Record<string, number>>(ID, 'pcRates', {})
  const [specialRates, setSpecialRates] = useCalcState<Record<string, number>>(ID, 'specialRates', {})
  const [wholeHouseRates, setWholeHouseRates] = useCalcState<Record<string, number>>(ID, 'wholeHouseRates', {})
  const [addType, setAddType] = useCalcState(ID, 'addType', 'bathroom')
  const [radiatorPcPerKw, setRadiatorPcPerKw] = useCalcState(ID, 'radiatorPcPerKw', 55)   // £ per kW for a radiator we supply that was placed on the plan with a size
  // Heating pipework drawn on the plan: what was last handed in is kept, so the quote opens the calculator with the same pipes
  const [savedPipes, setSavedPipes] = useCalcState<PipeSummary | null>(ID, 'pipeSummary', null)
  const [pipeMaterial, setPipeMaterial] = useCalcState<PipeMaterial>(ID, 'pipeMaterial', 'copper')
  const [pipeAllowPct, setPipeAllowPct] = useCalcState(ID, 'pipeAllowPct', 10)
  const [pipeRiseM, setPipeRiseM] = useCalcState(ID, 'pipeRiseM', 0.5)
  const [pipeExtraM, setPipeExtraM] = useCalcState(ID, 'pipeExtraM', 0)
  const [pipeExtraSize, setPipeExtraSize] = useCalcState(ID, 'pipeExtraSize', 22)
  const [pipeworkIn, setPipeworkIn] = useCalcState(ID, 'pipeworkIn', 40)
  const [pipeSundries, setPipeSundries] = useCalcState(ID, 'pipeSundries', 10)
  const [pipeRates, setPipeRates] = useCalcState<Record<string, number>>(ID, 'pipeRates', {})
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  // a room from the Take-off plan: its name and kind, with the usual fittings for that kind (a room's fittings do not depend on its size, so there is nothing for it to follow)
  function addPlanRooms(list: PlanRoomInfo[]) {
    setRooms(p => {
      // a room that already has this name (made from fittings placed on the plan) is tied to the plan room instead of being added twice
      const byName = (pr: PlanRoomInfo) => p.find(r => !r.planRoomId && (r.planName ?? r.name.trim().toLowerCase()) === pr.name.trim().toLowerCase())
      const linked = new Map<string, string>()
      for (const pr of list) { const ex = byName(pr); if (ex && !p.some(r => r.planRoomId === pr.id)) linked.set(ex.id, pr.id) }
      const made = list.filter(pr => !p.some(r => r.planRoomId === pr.id) && !Array.from(linked.values()).includes(pr.id)).map(pr => ({ ...newRoom(plumbingKindFor(pr.kind), 0), name: pr.name, planRoomId: pr.id, planName: pr.name.trim().toLowerCase() }))
      return [...p.map(r => (linked.has(r.id) ? { ...r, planRoomId: linked.get(r.id) } : r)), ...made]
    })
  }

  // The fittings placed on the plan (the Take-off Plumbing tool) are counted room by room, matched to a room here by its name. A count that was typed over is left alone until the plan's count changes; a room
  // that is not here yet is made from them. Nothing placed in a room means its usual fittings are not touched.
  const placedKey = JSON.stringify(placed ?? [])
  const pipesKey = JSON.stringify(pipes ?? null)
  useEffect(() => { if (pipes && JSON.stringify(savedPipes) !== pipesKey) setSavedPipes(pipes) }, [pipesKey])   // eslint-disable-line react-hooks/exhaustive-deps
  const livePipes = pipes ?? savedPipes
  const pipesOn = !!livePipes && (livePipes.runCount > 0 || pipeExtraM > 0)
  const roomsKey = rooms.map(r => r.id + '|' + (r.planName ?? r.name)).join(',')
  useEffect(() => {
    if (!placed) return
    setRooms(prev => {
      let changed = false
      const next = prev.map(r => ({ ...r }))
      for (const pr of placed) {
        const key = pr.name.trim().toLowerCase()
        let r = next.find(x => (x.planName ?? x.name.trim().toLowerCase()) === key)
        if (!r) {
          r = { ...newRoom('other', 0), name: pr.name === 'No room' ? 'Fittings not in a named room' : pr.name, planName: key, fittings: {} }
          next.push(r); changed = true
        }
        const was = r.placedCounts ?? {}
        const now: Record<string, number> = {}
        const fit = { ...r.fittings }
        for (const t of new Set([...Object.keys(was), ...Object.keys(pr.counts)])) {
          const n = pr.counts[t] ?? 0, old = was[t]
          if (n > 0) now[t] = n
          if (old === undefined) { if (n > 0 && fit[t] !== n) { fit[t] = n; changed = true } }
          else if (n !== old && (fit[t] ?? 0) === old) { if (n > 0) fit[t] = n; else delete fit[t]; changed = true }
        }
        const radiators = pr.radiators.map(x => ({ id: x.pointId, label: x.label, watts: x.watts }))
        if (JSON.stringify(radiators) !== JSON.stringify(r.radiators ?? []) || JSON.stringify(now) !== JSON.stringify(was) || r.planName !== key) changed = true
        r.fittings = fit; r.placedCounts = now; r.radiators = radiators; r.planName = key
      }
      // a room whose fittings were all taken off the plan: their counts follow down to nothing
      for (const r of next) {
        if (!r.placedCounts || Object.keys(r.placedCounts).length === 0 || placed.some(pr => pr.name.trim().toLowerCase() === r.planName)) continue
        const fit = { ...r.fittings }
        for (const [t, old] of Object.entries(r.placedCounts)) if ((fit[t] ?? 0) === old) delete fit[t]
        r.fittings = fit; r.placedCounts = {}; r.radiators = []; changed = true
      }
      return changed ? next : prev
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placedKey, roomsKey])

  function updateRoom(id: string, patch: Partial<PlumbingRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function setCount(roomId: string, fid: string, n: number) { setRooms(p => p.map(r => r.id === roomId ? { ...r, fittings: { ...r.fittings, [fid]: Math.max(0, n) } } : r)) }
  function removeFitting(roomId: string, fid: string) { setRooms(p => p.map(r => { if (r.id !== roomId) return r; const f = { ...r.fittings }; delete f[fid]; return { ...r, fittings: f } })) }
  function addSpecial(roomId: string) {
    const s: PlumbingSpecial = { id: 'spec-' + uid(), typeId: 'freestanding-bath', name: '', count: 1, supply: 'client', itemCost: 0 }
    setRooms(p => p.map(r => r.id === roomId ? { ...r, specials: [...r.specials, s] } : r))
  }
  function updateSpecial(roomId: string, sid: string, patch: Partial<PlumbingSpecial>) {
    setRooms(p => p.map(r => r.id === roomId ? { ...r, specials: r.specials.map(s => s.id === sid ? { ...s, ...patch } : s) } : r))
  }
  function removeSpecial(roomId: string, sid: string) { setRooms(p => p.map(r => r.id === roomId ? { ...r, specials: r.specials.filter(s => s.id !== sid) } : r)) }

  const result = useMemo((): { ok: true; r: PlumbingResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculatePlumbing({ rooms, wholeHouse, jobSituationId, situations, fittingRates, specialRates, wholeHouseRates, pcRates, radiatorPcPerKw, ...(pipesOn && livePipes ? { pipes: { summary: livePipes, material: pipeMaterial, allowancePct: pipeAllowPct, risePerRadiatorM: pipeRiseM, extraM: pipeExtraM, extraSizeMm: pipeExtraSize, radiatorPipeworkIn: pipeworkIn, sundriesPct: pipeSundries, rates: pipeRates } } : {}) }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, wholeHouse, jobSituationId, situations, fittingRates, specialRates, wholeHouseRates, pcRates, radiatorPcPerKw, livePipes, pipesOn, pipeMaterial, pipeAllowPct, pipeRiseM, pipeExtraM, pipeExtraSize, pipeworkIn, pipeSundries, pipeRates])
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

  // Own labour (e.g. chasing and making good) — starts empty: the plumber's work is in the fitting prices
  const [labourLines, setLabourLines] = useCalcState<LabourLine[]>(ID, 'labourLines', [])
  const addLabour = () => setLabourLines(prev => [...prev, { id: newLabourLineId(), tradeId: prev[0]?.tradeId ?? '', task: '', hours: 0 }])
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourLines(prev => prev.filter(l => l.id !== id))

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
  const descInput: PlumbingDescriptionInput | null = r ? plumbingDescriptionInput(rooms, wholeHouse, r) : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describePlumbingShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describePlumbing(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
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
        {r && <MaterialsListButtons lines={enabledMaterialLines} title={`${name} — schedule of fittings`} location={location} description={description} compact />}
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
      {rooms.some(x => (x.radiators?.length ?? 0) > 0) && (
        <div style={{ fontSize: 11.5, color: '#475569', background: '#fff', border: '1px solid #bae6fd', borderRadius: 5, padding: '5px 9px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>Radiators placed on the plan and supplied by us are priced by size at £</span>
          <NumInput type="number" min={0} step={5} value={radiatorPcPerKw} onChange={e => setRadiatorPcPerKw(Math.max(0, +e.target.value || 0))} style={{ ...small, width: 64, textAlign: 'right' }} />
          <span>per kW of output (a sample rate: check it against your supplier).</span>
        </div>
      )}
      {r && r.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>⚠ {w}</div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {/* Add a room */}
          <PlanRoomsBar planRooms={planRooms} isAdded={id => rooms.some(r => r.planRoomId === id) || !!planRooms?.some(pr => pr.id === id && rooms.some(r => (r.planName ?? r.name.trim().toLowerCase()) === pr.name.trim().toLowerCase()))} onAdd={r => addPlanRooms([r])} onAddAll={addPlanRooms} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
            <select value={addType} onChange={e => setAddType(e.target.value)} style={{ ...small, minWidth: 190 }}>
              {ROOM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" onClick={() => setRooms(p => [...p, newRoom(addType, p.filter(x => x.typeId === addType).length)])}
              style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>A new room comes with its usual fittings — change the numbers to suit.</span>
          </div>

          {rooms.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>. The pressure test and commissioning is already in the price.
            </div>
          )}

          {rooms.map(rm => {
            const sum = r?.roomSummaries.find(s => s.roomId === rm.id)
            const roomCost = (r?.lines ?? []).filter(l => l.roomId === rm.id).reduce((s, l) => s + l.qty * (rateOverrides[l.id] ?? l.unitCost), 0)
            const unused = FITTING_TYPES.filter(f => rm.fittings[f.id] === undefined)
            return (
              <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  {rm.placedCounts && Object.keys(rm.placedCounts).length > 0 && <span title="These counts come from the fittings placed on the Take-off plan. Type a different number to override it until the plan changes." style={{ fontSize: 10.5, color: '#0369a1', background: '#e0f2fe', borderRadius: 4, padding: '2px 6px' }}>📍 {Object.values(rm.placedCounts).reduce((a, b) => a + b, 0)} placed on the plan</span>}
                  <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={small}
                    title="The situation for this room: the percentage added to its fittings. 'Job standard' follows the situation set for the whole job.">
                    <option value="">Job standard{jobSit ? ` (${jobSit.upliftPct >= 0 ? '+' : ''}${jobSit.upliftPct}%)` : ''}</option>
                    {situations.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]} ({s.upliftPct >= 0 ? '+' : ''}{s.upliftPct}%)</option>)}
                  </select>
                  <div style={{ display: 'inline-flex', gap: 2 }}>
                    {(['fittings', 'days'] as const).map(m => (
                      <button key={m} type="button" onClick={() => updateRoom(rm.id, { mode: m })}
                        title={m === 'fittings' ? 'Price this room per fitting' : 'Price this room as plumber days instead of per fitting'}
                        style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${rm.mode === m ? '#0369a1' : '#e2e8f0'}`, background: rm.mode === m ? '#0369a1' : '#fff', color: rm.mode === m ? '#fff' : '#64748b' }}>
                        {m === 'fittings' ? 'Per fitting' : 'By the day'}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(roomCost)}</span>
                  <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room"
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>

                {rm.mode === 'days' ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ width: 120 }}><PropRow label="Plumber days">{numInput(rm.days, n => updateRoom(rm.id, { days: n }), 0, 0.5)}</PropRow></div>
                    <div style={{ width: 120 }}><PropRow label="Day rate (£)">{numInput(rm.dayRate, n => updateRoom(rm.id, { dayRate: n }), 0, 5)}</PropRow></div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8', flex: 1 }}>This room's fittings above are not priced while it is by the day (they are kept if you switch back).</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '4px 12px' }}>
                      {FITTING_TYPES.filter(f => rm.fittings[f.id] !== undefined).map(f => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLOUR[f.group], flexShrink: 0 }} />
                          <span style={{ fontSize: 11.5, color: '#334155', flex: 1, minWidth: 0 }}>{f.name}</span>
                          <NumInput type="number" min={0} step={1} value={rm.fittings[f.id]} onChange={e => setCount(rm.id, f.id, +e.target.value || 0)} style={{ ...small, width: 54, textAlign: 'right' }} />
                          <button type="button" onClick={() => removeFitting(rm.id, f.id)} title="Take this fitting out of the room" style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                    {unused.length > 0 && (
                      <select value="" onChange={e => { if (e.target.value) setCount(rm.id, e.target.value, 1) }} style={{ ...small, marginTop: 6, color: '#64748b' }}>
                        <option value="">+ Add another fitting…</option>
                        {GROUPS.map(g => {
                          const opts = unused.filter(f => f.group === g)
                          return opts.length === 0 ? null : <optgroup key={g} label={GROUP_LABEL[g]}>{opts.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</optgroup>
                        })}
                      </select>
                    )}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#475569' }}>
                      <span>Sanitaryware, taps and radiators:</span>
                      <select value={rm.supply} onChange={e => updateRoom(rm.id, { supply: e.target.value as 'client' | 'us' })} style={small} title="Who buys the bath, basin, WC, taps and radiators in this room">
                        <option value="client">Client supplies (not priced)</option>
                        <option value="us">We supply (a PC sum for each)</option>
                      </select>
                    </div>
                  </>
                )}

                {/* Special fittings: an extra install charge on top of the fitting */}
                <div style={{ marginTop: 8, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                  {rm.specials.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span title="A special fitting" style={{ fontSize: 13 }}>✨</span>
                      <select value={f.typeId} onChange={e => updateSpecial(rm.id, f.id, { typeId: e.target.value })} style={small}>
                        {SPECIAL_TYPES.map(t => <option key={t.id} value={t.id}>{t.name} — £{(specialRates[t.id] ?? t.installRate)} install</option>)}
                      </select>
                      <input value={f.name} onChange={e => updateSpecial(rm.id, f.id, { name: e.target.value })} placeholder="What it is (optional), e.g. bath in the master en-suite" style={{ ...small, flex: 1, minWidth: 140 }} />
                      <NumInput type="number" min={0} value={f.count} onChange={e => updateSpecial(rm.id, f.id, { count: Math.max(0, +e.target.value || 0) })} style={{ ...small, width: 46, textAlign: 'right' }} title="How many" />
                      <select value={f.supply} onChange={e => updateSpecial(rm.id, f.id, { supply: e.target.value as 'client' | 'us' })} style={small} title="Who buys it">
                        <option value="client">Client supplies</option>
                        <option value="us">We supply</option>
                      </select>
                      {f.supply === 'us' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>£</span>
                          <NumInput type="number" min={0} step={10} value={f.itemCost} onChange={e => updateSpecial(rm.id, f.id, { itemCost: Math.max(0, +e.target.value || 0) })} style={{ ...small, width: 64, textAlign: 'right' }} title="Price of the item itself, each (a provisional sum)" />
                        </span>
                      )}
                      <button type="button" onClick={() => removeSpecial(rm.id, f.id)} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addSpecial(rm.id)} style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontSize: 11.5, padding: 0 }}>
                    + Special fitting (freestanding bath, wet room, boiling tap…)
                  </button>
                </div>
                {sum && sum.uplift !== 0 && rm.mode === 'fittings' && <div style={{ fontSize: 10.5, color: '#92400e', marginTop: 4 }}>Fittings in this room are priced {sum.uplift > 0 ? '+' : ''}{sum.uplift}% for the situation.</div>}
              </div>
            )
          })}

          {r && rooms.length > 0 && <FittingsDrawing summaries={r.roomSummaries} />}
          {r && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.roomCount} room{r.roomCount === 1 ? '' : 's'}, {r.totalFittings} fitting{r.totalFittings === 1 ? '' : 's'}{r.specialCount > 0 ? `, ${r.specialCount} special fitting${r.specialCount === 1 ? '' : 's'}` : ''}.
              Each fitting's price is all in (hot, cold and waste pipework to it, the fitting off, connected and tested). The boiler, cylinder or heat pump is priced separately.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Situation for the whole job">
            <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
              {situations.map(s => <option key={s.id} value={s.id}>{s.label} ({s.upliftPct >= 0 ? '+' : ''}{s.upliftPct}%)</option>)}
            </select>
          </PropRow>

          <CollapsibleSection title="Whole house" borderColor="#bae6fd">
            {WHOLE_HOUSE_ITEMS.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{w.name}</span>
                <NumInput type="number" min={0} value={wholeHouse[w.id] ?? 0} onChange={e => setWholeHouse(p => ({ ...p, [w.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 46, textAlign: 'right' }} />
                <span style={{ fontSize: 10.5, color: '#94a3b8' }}>£</span>
                <NumInput type="number" min={0} value={wholeHouseRates[w.id] ?? w.rate} onChange={e => setWholeHouseRates(p => ({ ...p, [w.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 58, textAlign: 'right' }} title="Price each" />
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title={`Heating pipework from the plan${livePipes && livePipes.runCount > 0 ? ` (${livePipes.totalLengthM.toFixed(1)} m drawn)` : ''}`} borderColor="#bae6fd">
            {!livePipes || livePipes.runCount === 0 ? (
              <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.45, marginBottom: 6 }}>
                Draw the heating pipes from the boiler to the radiators on the plan (Take-off, Plumbing &amp; Heating, the pipe tool). The pipe sizes, elbows and tees are worked out from what they carry and priced here. Nothing is drawn yet.
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: '#334155', lineHeight: 1.5, marginBottom: 8, background: '#fff', border: '1px solid #bae6fd', borderRadius: 5, padding: '6px 9px' }}>
                <div><b>{livePipes.runCount}</b> run{livePipes.runCount === 1 ? '' : 's'}, <b>{livePipes.totalLengthM.toFixed(1)} m</b> of drawn pipe (flow and return are both priced), carrying {(livePipes.totalLoadW / 1000).toFixed(1)} kW to {livePipes.connectedRadiatorIds.length} radiator{livePipes.connectedRadiatorIds.length === 1 ? '' : 's'}.</div>
                <div>{PIPE_SIZE_LIST.filter(s => (livePipes.lengthBySize[String(s)] ?? 0) > 0).map(s => `${s}mm: ${livePipes.lengthBySize[String(s)].toFixed(1)} m`).join(' · ') || 'No pipe'}</div>
                <div>{livePipes.fittings.length === 0 ? 'No elbows or tees.' : livePipes.fittings.map(f => `${f.count} × ${f.kind === 'reducing-tee' && f.branchMm ? `${f.sizeMm}x${f.branchMm}mm` : `${f.sizeMm}mm`} ${FITTING_LABEL[f.kind].toLowerCase()}`).join(', ')}.</div>
                {livePipes.warnings.map((w, i) => <div key={i} style={{ color: '#b45309' }}>⚠ {w}</div>)}
              </div>
            )}
            <PropRow label="Pipe material">
              <select value={pipeMaterial} onChange={e => setPipeMaterial(e.target.value as PipeMaterial)} style={propInput}>
                {(Object.keys(PIPE_MATERIAL_LABEL) as PipeMaterial[]).map(m => <option key={m} value={m}>{PIPE_MATERIAL_LABEL[m]}</option>)}
              </select>
            </PropRow>
            <PropRow label="Allowance over the drawn length (%)">{numInput(pipeAllowPct, setPipeAllowPct, 0, 1)}</PropRow>
            <PropRow label="Rise to each radiator (m of flow, and of return)">{numInput(pipeRiseM, setPipeRiseM, 0, 0.1)}</PropRow>
            <PropRow label="Pipe not on the plan: risers, boiler to the first run (m of run)">{numInput(pipeExtraM, setPipeExtraM, 0, 1)}</PropRow>
            {pipeExtraM > 0 && (
              <PropRow label="Size of that pipe">
                <select value={pipeExtraSize} onChange={e => setPipeExtraSize(+e.target.value)} style={propInput}>{PIPE_SIZE_LIST.map(s => <option key={s} value={s}>{s}mm</option>)}</select>
              </PropRow>
            )}
            <PropRow label="Pipework in a radiator's all-in price (£, taken off when its pipes are drawn)">{numInput(pipeworkIn, setPipeworkIn, 0, 5)}</PropRow>
            <PropRow label="Clips, flux or solder and sundries (%)">{numInput(pipeSundries, setPipeSundries, 0, 1)}</PropRow>
            <div style={{ fontSize: 10.5, color: '#64748b', margin: '6px 0 3px' }}>Rates for {PIPE_MATERIAL_LABEL[pipeMaterial].toLowerCase()} (samples: check them with your supplier and plumber)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '38px repeat(4, 1fr)', gap: 4, fontSize: 10.5, color: '#94a3b8', marginBottom: 2 }}>
              <span /><span>Pipe £/m</span><span>Elbow £</span><span>Tee £</span><span>Plumber £/m</span>
            </div>
            {PIPE_SIZE_LIST.map(s => {
              const d = DEFAULT_PIPE_RATES[pipeMaterial][String(s)]
              const set = (key: string) => (v: number) => setPipeRates(p => ({ ...p, [key]: Math.max(0, v) }))
              return (
                <div key={s} style={{ display: 'grid', gridTemplateColumns: '38px repeat(4, 1fr)', gap: 4, marginBottom: 3, alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, color: '#334155' }}>{s}mm</span>
                  <NumInput type="number" min={0} step={0.1} value={pipeRates[`pipe|${pipeMaterial}|${s}`] ?? d.pipe} onChange={e => set(`pipe|${pipeMaterial}|${s}`)(+e.target.value || 0)} style={{ ...small, width: '100%', textAlign: 'right' }} />
                  <NumInput type="number" min={0} step={0.1} value={pipeRates[`elbow|${pipeMaterial}|${s}`] ?? d.elbow} onChange={e => set(`elbow|${pipeMaterial}|${s}`)(+e.target.value || 0)} style={{ ...small, width: '100%', textAlign: 'right' }} />
                  <NumInput type="number" min={0} step={0.1} value={pipeRates[`tee|${pipeMaterial}|${s}`] ?? d.tee} onChange={e => set(`tee|${pipeMaterial}|${s}`)(+e.target.value || 0)} style={{ ...small, width: '100%', textAlign: 'right' }} />
                  <NumInput type="number" min={0} step={0.5} value={pipeRates[`labm|${s}`] ?? DEFAULT_PIPE_LABOUR_PER_M[String(s)]} onChange={e => set(`labm|${s}`)(+e.target.value || 0)} style={{ ...small, width: '100%', textAlign: 'right' }} />
                </div>
              )
            })}
            <PropRow label="Plumber £ for each joint made">
              <NumInput type="number" min={0} step={0.5} value={pipeRates[`joint|${pipeMaterial}`] ?? DEFAULT_JOINT_LABOUR[pipeMaterial]} onChange={e => setPipeRates(p => ({ ...p, [`joint|${pipeMaterial}`]: Math.max(0, +e.target.value || 0) }))} style={propInput} />
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Situations (the % added to fittings)" borderColor="#bae6fd">
            {situations.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{s.label}</span>
                <NumInput type="number" step={1} value={s.upliftPct} onChange={e => setSituations(p => p.map(x => x.id === s.id ? { ...x, upliftPct: +e.target.value || 0 } : x))} style={{ ...small, width: 54, textAlign: 'right' }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Fitting rates (£ each, all in)" borderColor="#bae6fd">
            {GROUPS.map(g => (
              <div key={g} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: GROUP_COLOUR[g], textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, marginBottom: 2 }}>{GROUP_LABEL[g]} — install, and PC sum if we supply</div>
                {FITTING_TYPES.filter(f => f.group === g).map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{f.name}</span>
                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>£</span>
                    <NumInput type="number" min={0} value={fittingRates[f.id] ?? f.rate} onChange={e => setFittingRates(prev => ({ ...prev, [f.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 56, textAlign: 'right' }} title="Install, all in" />
                    {f.pcSum > 0
                      ? <NumInput type="number" min={0} value={pcRates[f.id] ?? f.pcSum} onChange={e => setPcRates(prev => ({ ...prev, [f.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 56, textAlign: 'right', background: '#fffbeb' }} title="PC sum for the item itself, when we supply it" />
                      : <span style={{ width: 56 }} />}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, margin: '6px 0 2px' }}>Special fitting install</div>
            {SPECIAL_TYPES.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{t.name}</span>
                <span style={{ fontSize: 10.5, color: '#94a3b8' }}>£</span>
                <NumInput type="number" min={0} value={specialRates[t.id] ?? t.installRate} onChange={e => setSpecialRates(prev => ({ ...prev, [t.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 56, textAlign: 'right' }} />
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>Sample rates — use your plumber's own prices. The yellow box is the PC sum for the item itself, used when we supply it. You can also change any single line in the cost breakdown below.</div>
          </CollapsibleSection>

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

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

// ── The drawing: each room as a bar, one coloured part per kind of fitting ──
function FittingsDrawing({ summaries }: { summaries: PlumbingResult['roomSummaries'] }) {
  const rows = summaries.length
  const max = Math.max(1, ...summaries.map(s => s.fittings))
  const rowH = 24, labelW = 130, barW = 250, vbW = labelW + barW + 60, vbH = rows * rowH + 34
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', maxHeight: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4 }}>
      {summaries.map((s, i) => {
        const y = 8 + i * rowH
        let x = labelW
        return (
          <g key={s.roomId}>
            <text x={labelW - 6} y={y + 12} fontSize={10} fill="#334155" textAnchor="end">{s.name.length > 20 ? s.name.slice(0, 19) + '…' : s.name}</text>
            {s.mode === 'days'
              ? <text x={labelW} y={y + 12} fontSize={10} fill="#94a3b8">priced by the day</text>
              : GROUPS.map(g => {
                  const n = s.byGroup[g]
                  if (n <= 0) return null
                  const w = (n / max) * barW
                  const el = <rect key={g} x={x} y={y} width={Math.max(w, 1)} height={rowH - 8} fill={GROUP_COLOUR[g]} rx={2}><title>{GROUP_LABEL[g]}: {n}</title></rect>
                  x += w
                  return el
                })}
            <text x={labelW + barW + 6} y={y + 12} fontSize={10} fill="#475569">{s.mode === 'days' ? '' : s.fittings}{s.specials > 0 ? ` ✨${s.specials}` : ''}</text>
          </g>
        )
      })}
      {GROUPS.map((g, i) => (
        <g key={g} transform={`translate(${8 + i * 100}, ${vbH - 16})`}>
          <rect width={9} height={9} fill={GROUP_COLOUR[g]} rx={2} />
          <text x={13} y={8} fontSize={9} fill="#64748b">{GROUP_LABEL[g]}</text>
        </g>
      ))}
    </svg>
  )
}
