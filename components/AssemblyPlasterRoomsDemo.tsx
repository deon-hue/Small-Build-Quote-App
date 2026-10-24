'use client'

/**
 * Assembly Calculator — Internal plastering and boarding, by room (Plastering & Boarding → Internal Plastering & Boarding (by room)).
 * Each room is sized (length, width, height, doors and windows) and each wall and ceiling says what it gets: a skim over existing board or plaster, two-coat wet plaster to masonry, plasterboard dabbed to masonry or fixed to
 * studs or joists and skimmed, or board taped and jointed only. Beads, coving and access hatches are optional per room. The board, plaster, adhesive and sundries are worked out from the areas and the coverage of each product,
 * the plasterer's time from the areas times a rate of hours per unit (with a labourer to carry the board and mix), and an occupied or hard-to-reach job adds time. The engine is lib/plaster-units.ts.
 * Vaulted ceilings are not here: they have their own tasks in the Plastering & Boarding phase.
 */

import React, { useEffect, useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculatePlaster, newPlasterRoom, roomAreas, PLASTER_ROOM_KINDS, DEFAULT_PLASTER_SITUATIONS, WALL_SYSTEM_LABEL, CEILING_SYSTEM_LABEL, BASE_LABEL, WINDOW_BEAD_LM,
  type PlasterRoom, type PlasterResult, type WallSystem, type CeilingSystem, type SkimBase,
} from '@/lib/plaster-units'
import { describePlaster, describePlasterShort, type PlasterDescriptionInput } from '@/lib/plaster-description'
import { suggestPlasterLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
import { followPlanRooms, planRoomSig, plasterKindFor, planWallAreaM2 } from '@/lib/rooms-merge'
import { sidesFromAreaPerimeter } from '@/lib/tiling-common'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the rooms found on the Take-off plan: they can be added with their sizes, and follow the plan until typed over */
  planRooms?: PlanRoomInfo[]
}

const WALL_SYSTEMS = Object.keys(WALL_SYSTEM_LABEL) as WallSystem[]
const CEILING_SYSTEMS = Object.keys(CEILING_SYSTEM_LABEL) as CeilingSystem[]
const BASES = Object.keys(BASE_LABEL) as SkimBase[]
const uid = () => Math.random().toString(36).slice(2, 9)
const baseFor = (system: string): SkimBase => (system === 'skim' ? 'existing' : 'new-board')

export default function AssemblyPlasterRoomsDemo({ onClose, onSave, labourTrades = [], planRooms }: Props) {
  const ID = 'AssemblyPlasterRoomsDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Internal plastering and boarding')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  // The job starts with no rooms: you add the ones being plastered
  const [rooms, setRooms] = useCalcState<PlasterRoom[]>(ID, 'rooms', [])
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'kitchen')
  const [startWalls, setStartWalls] = useCalcState<WallSystem>(ID, 'startWalls', 'dot-dab')
  const [startCeiling, setStartCeiling] = useCalcState<CeilingSystem>(ID, 'startCeiling', 'board-skim')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')
  const [towerWeeks, setTowerWeeks] = useCalcState(ID, 'towerWeeks', 0)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addRoom() {
    setRooms(p => {
      const k = PLASTER_ROOM_KINDS.find(x => x.id === addKind) ?? PLASTER_ROOM_KINDS[0]
      const n = p.filter(x => x.kindId === addKind).length
      const room = newPlasterRoom('room-' + uid(), n === 0 ? k.label : `${k.label} ${n + 1}`, addKind)
      room.walls = { system: startWalls, base: baseFor(startWalls) }
      room.ceiling = { system: startCeiling, base: baseFor(startCeiling) }
      return [...p, room]
    })
  }
  function updateRoom(id: string, patch: Partial<PlasterRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }

  // a room from the Take-off plan: its floor and wall length from the drawing (the long and short sides that give both), its height, doors and windows, and the wall and ceiling areas as drawn
  const fitToPlan = (r: PlasterRoom, p: PlanRoomInfo): PlasterRoom => {
    const sides = sidesFromAreaPerimeter(p.areaM2, p.perimeterM)
    return { ...r, lengthM: sides.long, widthM: sides.short, heightM: p.heightM, doors: p.doors, windows: p.windows, wallAreaOverrideM2: planWallAreaM2(p), ceilingAreaOverrideM2: p.areaM2 }
  }
  function addPlanRooms(list: PlanRoomInfo[]) {
    setRooms(p => {
      const made = list.filter(pr => !p.some(r => r.planRoomId === pr.id)).map(pr => {
        const room = fitToPlan(newPlasterRoom('room-' + uid(), pr.name, plasterKindFor(pr.kind)), pr)
        room.walls = { system: startWalls, base: baseFor(startWalls) }
        room.ceiling = { system: startCeiling, base: baseFor(startCeiling) }
        return { ...room, planRoomId: pr.id, planRoomSig: planRoomSig(pr) }
      })
      return [...p, ...made]
    })
  }
  const planKey = planRooms ? planRooms.map(p => p.id + ':' + planRoomSig(p)).join(';') : null
  useEffect(() => {
    if (planRooms) setRooms(p => followPlanRooms(p, planRooms, fitToPlan))
  }, [planKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo((): { ok: true; r: PlasterResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculatePlaster({ rooms, jobSituationId, situations: DEFAULT_PLASTER_SITUATIONS, rates: {}, towerWeeks }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, jobSituationId, towerWeeks])
  const r = result.ok ? result.r : null

  const layers: AssemblyLayerDef[] = useMemo(() => (r?.lines ?? []).map(l => ({
    id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit,
    unitCost: rateOverrides[l.id] != null ? rateOverrides[l.id] : l.unitCost, fixedQty: l.qty, wastePct: 0,
  })), [r, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  const roomCost = (id: string) => costedLines.filter(l => l.layerId.endsWith('|' + id)).reduce((s, l) => s + l.cost, 0)

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
  const labourSuggestions: LabourSuggestion[] = r ? suggestPlasterLabour(r.labour) : []
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
  const descInput: PlasterDescriptionInput | null = r ? {
    rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })),
    occupied: jobSituationId === 'occupied' || rooms.some(x => x.situationId === 'occupied'),
    towerWeeks,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describePlasterShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describePlaster(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  /** a number that can be left blank to mean "worked out from the room" */
  const autoInput = (v: number | null, set: (n: number | null) => void, auto: number) => (
    <input type="number" min={0} step={0.5} value={v ?? ''} placeholder={String(+auto.toFixed(1))} onChange={e => set(e.target.value === '' ? null : Math.max(0, +e.target.value || 0))} style={propInput} />
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
            <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...small, minWidth: 150 }}>
              {PLASTER_ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
            <button type="button" onClick={addRoom} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap', fontSize: 10.5, color: '#94a3b8' }}>
            <span>A new room starts with walls:</span>
            <select value={startWalls} onChange={e => setStartWalls(e.target.value as WallSystem)} style={{ ...small, maxWidth: 230 }}>
              {WALL_SYSTEMS.filter(s => s !== 'none').map(s => <option key={s} value={s}>{WALL_SYSTEM_LABEL[s]}</option>)}
            </select>
            <span>and ceiling:</span>
            <select value={startCeiling} onChange={e => setStartCeiling(e.target.value as CeilingSystem)} style={{ ...small, maxWidth: 230 }}>
              {CEILING_SYSTEMS.filter(s => s !== 'none').map(s => <option key={s} value={s}>{CEILING_SYSTEM_LABEL[s]}</option>)}
            </select>
          </div>

          {rooms.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>, then change its size and what each wall and the ceiling gets.
            </div>
          )}

          {rooms.map(rm => {
            const sum = r?.rooms.find(s => s.roomId === rm.id)
            const a = roomAreas(rm)
            return (
              <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.wallM2}m² walls · ${sum.ceilingM2}m² ceiling` : ''}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(roomCost(rm.id))}</span>
                  <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: 8 }}>
                  <PropRow label="Length (m)">{numInput(rm.lengthM, n => updateRoom(rm.id, { lengthM: n }), 0, 0.1)}</PropRow>
                  <PropRow label="Width (m)">{numInput(rm.widthM, n => updateRoom(rm.id, { widthM: n }), 0, 0.1)}</PropRow>
                  <PropRow label="Height (m)">{numInput(rm.heightM, n => updateRoom(rm.id, { heightM: n }), 0, 0.1)}</PropRow>
                  <PropRow label="Doors (nr)">{numInput(rm.doors, n => updateRoom(rm.id, { doors: Math.round(n) }), 0, 1)}</PropRow>
                  <PropRow label="Windows (nr)">{numInput(rm.windows, n => updateRoom(rm.id, { windows: Math.round(n) }), 0, 1)}</PropRow>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
                  <div>
                    <PropRow label="Walls get">
                      <select value={rm.walls.system} onChange={e => updateRoom(rm.id, { walls: { system: e.target.value as WallSystem, base: baseFor(e.target.value) } })} style={propInput}>
                        {WALL_SYSTEMS.map(s => <option key={s} value={s}>{WALL_SYSTEM_LABEL[s]}</option>)}
                      </select>
                    </PropRow>
                    {rm.walls.system === 'skim' && (
                      <PropRow label="Skimmed onto">
                        <select value={rm.walls.base} onChange={e => updateRoom(rm.id, { walls: { ...rm.walls, base: e.target.value as SkimBase } })} style={propInput}>
                          {BASES.map(b => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {rm.walls.system !== 'none' && <PropRow label="Wall area (m²) — blank = from the room">{autoInput(rm.wallAreaOverrideM2, n => updateRoom(rm.id, { wallAreaOverrideM2: n }), a.wallM2)}</PropRow>}
                  </div>
                  <div>
                    <PropRow label="Ceiling gets">
                      <select value={rm.ceiling.system} onChange={e => updateRoom(rm.id, { ceiling: { system: e.target.value as CeilingSystem, base: baseFor(e.target.value) } })} style={propInput}>
                        {CEILING_SYSTEMS.map(s => <option key={s} value={s}>{CEILING_SYSTEM_LABEL[s]}</option>)}
                      </select>
                    </PropRow>
                    {rm.ceiling.system === 'skim' && (
                      <PropRow label="Skimmed onto">
                        <select value={rm.ceiling.base} onChange={e => updateRoom(rm.id, { ceiling: { ...rm.ceiling, base: e.target.value as SkimBase } })} style={propInput}>
                          {BASES.map(b => <option key={b} value={b}>{BASE_LABEL[b]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {rm.ceiling.system !== 'none' && <PropRow label="Ceiling area (m²) — blank = the floor area">{autoInput(rm.ceilingAreaOverrideM2, n => updateRoom(rm.id, { ceilingAreaOverrideM2: n }), a.ceilingM2)}</PropRow>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  <PropRow label="Beads (lm) — blank = from the windows">{autoInput(rm.beadsLm, n => updateRoom(rm.id, { beadsLm: n }), rm.windows * WINDOW_BEAD_LM)}</PropRow>
                  <PropRow label="Coving (lm)">{numInput(rm.covingLm, n => updateRoom(rm.id, { covingLm: n }), 0, 0.5)}</PropRow>
                  <PropRow label="Access hatches (nr)">{numInput(rm.hatches, n => updateRoom(rm.id, { hatches: Math.round(n) }), 0, 1)}</PropRow>
                  <PropRow label="Situation">
                    <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={propInput}>
                      <option value="">Same as the job</option>
                      {DEFAULT_PLASTER_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]}</option>)}
                    </select>
                  </PropRow>
                </div>
                <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                  {check('Dust sheets and protection', rm.protect, b => updateRoom(rm.id, { protect: b }))}
                </div>
              </div>
            )
          })}

          {r && rooms.length > 0 && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {rooms.length} room{rooms.length === 1 ? '' : 's'}: {r.totalWallM2}m² of walls and {r.totalCeilingM2}m² of ceiling, {r.totalBoardM2}m² of plasterboard, about {r.totalPlasterHours} plasterer hours.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="Rooms are">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_PLASTER_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label}{s.upliftPct ? ` +${s.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the plasterer's hours. A single room can have its own.</div>
          </CollapsibleSection>
          <CollapsibleSection title="Access" borderColor="#bae6fd">
            <PropRow label="Weeks of access tower hire">{numInput(towerWeeks, n => setTowerWeeks(Math.round(n)), 0, 1)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>For a stairwell or rooms over 3.5m high.</div>
          </CollapsibleSection>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates and hours — change any single line in the cost breakdown below. Vaulted ceilings are priced with their own tasks, not here.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="plastering"
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
