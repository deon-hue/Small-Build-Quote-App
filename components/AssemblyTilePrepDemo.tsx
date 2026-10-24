'use client'

/**
 * Assembly Calculator — Tiling preparation, by room (Tiling & Finishes → Tiling Preparation (by room)).
 * Each room says what its floor, its wet walls and its ceiling need before a tile goes on. The floor can be primed, levelled to a depth with self-levelling compound, and covered with tile backer board (over timber)
 * or a decoupling mat (over a screed that may move), with the waterproofing (tanking) of a wet floor. Each wall area (a shower, a bath surround, a splashback) can have backer board, fixed to studs or bonded to
 * masonry, and waterproofing: a liquid or a sheet membrane, with its tape, collars and cuffs. The ceiling can be moisture-resistant plasterboard or backer board to be tiled. Boards, compounds and membranes come from
 * the areas and the coverage of each product, the tiler's time from the areas times a rate (the dryliner's for the ceiling board), with a labourer; an occupied or awkward job adds time. The engine is
 * lib/tile-prep-units.ts; the body shared with the other three tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateTilePrep, newTilePrepRoom, newPrepZone, floorAreaM2, ceilingAreaM2, autoTapeLm, BACKER_BOARDS, WALL_BASE_LABEL, TANK_LABEL, FLOOR_COVER_LABEL, CEILING_LABEL,
  type TilePrepRoom, type TilePrepResult, type PrepZone, type WallBase, type TankSystem, type FloorCover, type CeilingKind, type BackerId,
} from '@/lib/tile-prep-units'
import { DEFAULT_TILING_SITUATIONS, TILING_ROOM_KINDS, TILING_ROOM_KIND_BY_ID, sidesFromAreaPerimeter, zonesFromKind, allWallsZone, zoneAreaM2, newZoneId } from '@/lib/tiling-common'
import { describeTilePrep, describeTilePrepShort, type TilingDescriptionInput } from '@/lib/tiling-description'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import { useSharedWallRooms } from '@/components/TilingShareContext'
import TilingCalcFrame, { TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** Take-off's drawn area (m²) and perimeter (m): the first room is sized from them and follows them */
  externalAreaM2?: number
  externalPerimeterM?: number
}

const uid = () => Math.random().toString(36).slice(2, 9)
const sub: React.CSSProperties = { fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, margin: '8px 0 4px' }

export default function AssemblyTilePrepDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM }: Props) {
  const ID = 'AssemblyTilePrepDemo'
  // The area drawn in Take-off (if any) sizes the first room, which follows it until the drawing changes
  const planArea = externalAreaM2 && externalAreaM2 > 0 ? externalAreaM2 : 0
  const planPerimeter = externalPerimeterM && externalPerimeterM > 0 ? externalPerimeterM : 0
  const planSides = planArea > 0 ? sidesFromAreaPerimeter(planArea, planPerimeter) : null
  const planRoom = (): TilePrepRoom => {
    const k = TILING_ROOM_KIND_BY_ID.other
    return { ...newTilePrepRoom('room-' + uid(), 'Room from the plan', 'other', { lengthM: planSides?.long ?? k.lengthM, widthM: planSides?.short ?? k.widthM, heightM: k.heightM, collars: 0 }, []), fromPlan: { areaM2: planArea, perimeterM: planPerimeter } }
  }
  // The job starts with no rooms: you add the ones being prepared (or the drawn area is the first)
  const [rooms, setRooms] = useCalcState<TilePrepRoom[]>(ID, 'rooms', () => (planSides ? [planRoom()] : []))
  useEffect(() => {
    if (!planSides) return
    setRooms(p => (p.length === 0 ? [planRoom()] : p.map(r => (r.fromPlan && (r.fromPlan.areaM2 !== planArea || r.fromPlan.perimeterM !== planPerimeter)
      ? { ...r, lengthM: planSides.long, widthM: planSides.short, floorAreaOverrideM2: null, fromPlan: { areaM2: planArea, perimeterM: planPerimeter } } : r))))
  }, [planArea, planPerimeter])
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'shower')
  // The Wall Tiling areas saved elsewhere in this quote or take-off (undefined where there is none to look in, e.g. the Back Office preview)
  const sharedWall = useSharedWallRooms()
  const [copyMsg, setCopyMsg] = useState('')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')

  function addRoom() {
    setRooms(p => {
      const k = TILING_ROOM_KINDS.find(x => x.id === addKind) ?? TILING_ROOM_KINDS[0]
      const n = p.filter(x => x.kindId === addKind).length
      const room = newTilePrepRoom('room-' + uid(), n === 0 ? k.label.split(' (')[0] : `${k.label.split(' (')[0]} ${n + 1}`, addKind, k, zonesFromKind(addKind).map(newPrepZone))
      // a wet room is tanked on the floor too
      if (addKind === 'shower') room.floor = { ...room.floor, tanked: true }
      return [...p, room]
    })
  }
  /** Copies the tiled areas of each saved Wall Tiling room onto the preparation room of the same name (or adds the room): the wet ones (a shower, a bath surround) boarded and waterproofed, the rest not. */
  function copyWallAreas() {
    if (!sharedWall || sharedWall.length === 0) return
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
    const clash = rooms.filter(r => r.zones.length > 0 && sharedWall.some(w => same(w.name, r.name)))
    if (clash.length > 0 && !window.confirm('This replaces the wall areas already set in ' + clash.map(r => r.name).join(', ') + ' with the ones from Wall Tiling. Carry on?')) return
    setRooms(p => {
      const next = [...p]
      for (const w of sharedWall) {
        const zones = w.areas.map(a => newPrepZone({ id: newZoneId(), label: a.label, lengthM: a.lengthM, heightM: a.heightM, deductM2: a.deductM2 }))
        const i = next.findIndex(r => same(r.name, w.name))
        if (i >= 0) next[i] = { ...next[i], zones }
        else {
          const kindId = TILING_ROOM_KIND_BY_ID[w.kindId] ? w.kindId : 'other'
          const room = newTilePrepRoom('room-' + uid(), w.name, kindId, { ...TILING_ROOM_KIND_BY_ID[kindId], heightM: w.heightM }, zones)
          if (kindId === 'shower') room.floor = { ...room.floor, tanked: true }
          next.push(room)
        }
      }
      return next
    })
    setCopyMsg(`Copied ${sharedWall.reduce((n, w) => n + w.areas.length, 0)} wall areas from Wall Tiling (${sharedWall.map(w => w.name).join(', ')}). Shower and bath areas are boarded and waterproofed: check each room below.`)
  }
  function updateRoom(id: string, patch: Partial<TilePrepRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function updateFloor(id: string, patch: Partial<TilePrepRoom['floor']>) { setRooms(p => p.map(r => r.id === id ? { ...r, floor: { ...r.floor, ...patch } } : r)) }
  function updateCeiling(id: string, patch: Partial<TilePrepRoom['ceiling']>) { setRooms(p => p.map(r => r.id === id ? { ...r, ceiling: { ...r.ceiling, ...patch } } : r)) }
  function updateZone(roomId: string, zoneId: string, patch: Partial<PrepZone>) { setRooms(p => p.map(r => r.id === roomId ? { ...r, zones: r.zones.map(z => z.id === zoneId ? { ...z, ...patch } : z) } : r)) }
  function addZone(roomId: string, all: boolean) {
    setRooms(p => p.map(r => {
      if (r.id !== roomId) return r
      const k = TILING_ROOM_KIND_BY_ID[r.kindId] ?? TILING_ROOM_KIND_BY_ID.other
      const z = all ? allWallsZone({ ...k, lengthM: r.lengthM, widthM: r.widthM, heightM: r.heightM }) : { id: newZoneId(), label: 'Wall area', lengthM: 1, heightM: 1.2, deductM2: 0 }
      return { ...r, zones: [...r.zones, { ...z, base: 'studs' as WallBase, boardId: 'foam-10' as BackerId, tanked: false }] }
    }))
  }

  const result = useMemo((): { ok: true; r: TilePrepResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateTilePrep({ rooms, jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, jobSituationId])
  const r = result.ok ? result.r : null

  const descInput: TilingDescriptionInput | null = r ? {
    rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })),
    occupied: jobSituationId === 'occupied' || rooms.some(x => x.situationId === 'occupied'),
  } : null

  const FLOOR_COVERS = Object.keys(FLOOR_COVER_LABEL) as FloorCover[]
  const CEILINGS = Object.keys(CEILING_LABEL) as CeilingKind[]
  const BASES = Object.keys(WALL_BASE_LABEL) as WallBase[]
  const TANKS = Object.keys(TANK_LABEL) as TankSystem[]
  const boardSelect = (value: string, set: (v: BackerId) => void, allowNone?: boolean, onNone?: () => void) => (
    <select value={value} onChange={e => (e.target.value === 'none' ? onNone?.() : set(e.target.value as BackerId))} style={propInput}>
      {allowNone && <option value="none">No board</option>}
      {BACKER_BOARDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
    </select>
  )

  return (
    <TilingCalcFrame
      id={ID} defaultName="Tiling preparation" subject="tiling preparation" lines={r?.lines ?? []} labourTasks={r?.labour ?? []}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeTilePrepShort(descInput) : ''} descFull={descInput ? describeTilePrep(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...tilingSmall, minWidth: 150 }}>
                {TILING_ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addRoom} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
              {planSides && !rooms.some(x => x.fromPlan) && (
                <button type="button" onClick={() => setRooms(p => [...p, planRoom()])} title="Add the area drawn on the plan as a room" style={{ ...tilingSmall, cursor: 'pointer', background: '#f1f5f9' }}>+ The drawn area ({planArea.toFixed(1)}m²)</button>
              )}
              {sharedWall !== undefined && (
                <button type="button" onClick={copyWallAreas} disabled={sharedWall.length === 0}
                  title={sharedWall.length === 0 ? 'There is no saved Wall Tiling calculator in this quote or take-off yet: save it first' : 'Copy the tiled wall areas from the Wall Tiling calculator into the rooms here'}
                  style={{ ...tilingSmall, cursor: sharedWall.length === 0 ? 'default' : 'pointer', background: '#f1f5f9', opacity: sharedWall.length === 0 ? 0.55 : 1 }}>↧ Copy the wall areas from Wall Tiling</button>
              )}
            </div>
            {copyMsg && <div style={{ fontSize: 11, color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '4px 8px', marginBottom: 8 }}>{copyMsg}</div>}
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
              A new room starts with a primed floor and the usual wall areas for that kind of room; shower and bath walls come with backer board and waterproofing, a wet room's floor is tanked too. Nothing else is switched on until you choose it.
            </div>

            {rooms.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>, then say what the floor, walls and ceiling need.
              </div>
            )}

            {rooms.map(rm => {
              const sum = r?.rooms.find(s => s.roomId === rm.id)
              const f = rm.floor
              const anyTank = f.tanked || rm.zones.some(z => z.tanked)
              return (
                <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.areaM2}m² floor` : ''}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(rm.id) > 0 ? `£${roomCost(rm.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                    <PropRow label={rm.fromPlan ? 'Length (m) — from the plan' : 'Length (m)'}><TilingNumInput v={rm.lengthM} set={n => updateRoom(rm.id, { lengthM: n })} step={0.1} /></PropRow>
                    <PropRow label="Width (m)"><TilingNumInput v={rm.widthM} set={n => updateRoom(rm.id, { widthM: n })} step={0.1} /></PropRow>
                    <PropRow label="Height (m)"><TilingNumInput v={rm.heightM} set={n => updateRoom(rm.id, { heightM: n })} step={0.1} /></PropRow>
                    <PropRow label="Floor area (m²) — blank = from the room"><TilingAutoInput v={rm.floorAreaOverrideM2} set={n => updateRoom(rm.id, { floorAreaOverrideM2: n })} auto={floorAreaM2(rm)} /></PropRow>
                  </div>

                  <div style={sub}>Floor</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                    <PropRow label="Levelling compound (mm) — 0 = none"><TilingNumInput v={f.levelMm} set={n => updateFloor(rm.id, { levelMm: n })} step={1} /></PropRow>
                    <PropRow label="Covered with">
                      <select value={f.cover} onChange={e => updateFloor(rm.id, { cover: e.target.value as FloorCover })} style={propInput}>
                        {FLOOR_COVERS.map(c => <option key={c} value={c}>{FLOOR_COVER_LABEL[c]}</option>)}
                      </select>
                    </PropRow>
                    {f.cover === 'backer' && <PropRow label="Floor board">{boardSelect(f.coverBoardId, v => updateFloor(rm.id, { coverBoardId: v }))}</PropRow>}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <TilingCheck label="Primer" on={f.primer || f.levelMm > 0} set={b => updateFloor(rm.id, { primer: b })} />
                    <TilingCheck label="Waterproof (tank) the floor, with an upstand" on={f.tanked} set={b => updateFloor(rm.id, { tanked: b })} />
                  </div>

                  <div style={sub}>Wall areas</div>
                  {rm.zones.length === 0 && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>No wall areas in this room.</div>}
                  {rm.zones.map(z => (
                    <div key={z.id} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, marginBottom: 6 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1.6fr) repeat(3, minmax(60px, 1fr)) 60px 22px', gap: 6, alignItems: 'end' }}>
                        <PropRow label="Area"><input value={z.label} onChange={e => updateZone(rm.id, z.id, { label: e.target.value })} style={propInput} /></PropRow>
                        <PropRow label="Length (m)"><TilingNumInput v={z.lengthM} set={n => updateZone(rm.id, z.id, { lengthM: n })} step={0.1} /></PropRow>
                        <PropRow label="Height (m)"><TilingNumInput v={z.heightM} set={n => updateZone(rm.id, z.id, { heightM: n })} step={0.1} /></PropRow>
                        <PropRow label="Less (m²)"><TilingNumInput v={z.deductM2} set={n => updateZone(rm.id, z.id, { deductM2: n })} step={0.1} /></PropRow>
                        <div style={{ fontSize: 11, color: '#64748b', paddingBottom: 6, textAlign: 'right' }}>{zoneAreaM2(z).toFixed(1)}m²</div>
                        <button type="button" onClick={() => setRooms(p => p.map(x => x.id === rm.id ? { ...x, zones: x.zones.filter(q => q.id !== z.id) } : x))} title="Remove this area" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, lineHeight: 1, paddingBottom: 6 }}>×</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginTop: 4 }}>
                        <PropRow label="Backer board">{boardSelect(z.boardId, v => updateZone(rm.id, z.id, { boardId: v }), true, () => updateZone(rm.id, z.id, { boardId: 'none' }))}</PropRow>
                        {z.boardId !== 'none' && (
                          <PropRow label="Fixed to">
                            <select value={z.base} onChange={e => updateZone(rm.id, z.id, { base: e.target.value as WallBase })} style={propInput}>
                              {BASES.map(b => <option key={b} value={b}>{WALL_BASE_LABEL[b]}</option>)}
                            </select>
                          </PropRow>
                        )}
                      </div>
                      <TilingCheck label="Waterproof (tank) this area" on={z.tanked} set={b => updateZone(rm.id, z.id, { tanked: b })} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, margin: '4px 0 6px' }}>
                    <button type="button" onClick={() => addZone(rm.id, false)} style={{ ...tilingSmall, cursor: 'pointer', background: '#f1f5f9' }}>+ Add a wall area</button>
                    <button type="button" onClick={() => addZone(rm.id, true)} title="Every wall of the room, less a door and the windows of a typical room of this kind" style={{ ...tilingSmall, cursor: 'pointer', background: '#f1f5f9' }}>+ All the walls</button>
                  </div>

                  {anyTank && (
                    <>
                      <div style={sub}>Waterproofing</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                        <PropRow label="System">
                          <select value={rm.tankSystem} onChange={e => updateRoom(rm.id, { tankSystem: e.target.value as TankSystem })} style={propInput}>
                            {TANKS.map(t => <option key={t} value={t}>{TANK_LABEL[t]}</option>)}
                          </select>
                        </PropRow>
                        <PropRow label="Tape (lm) — blank = from the areas"><TilingAutoInput v={rm.tapeLm} set={n => updateRoom(rm.id, { tapeLm: n })} auto={autoTapeLm(rm)} /></PropRow>
                        <PropRow label="Pipe collars and seals (nr)"><TilingNumInput v={rm.collars} set={n => updateRoom(rm.id, { collars: Math.round(n) })} /></PropRow>
                        <PropRow label="Floor waste cuffs (nr)"><TilingNumInput v={rm.cuffs} set={n => updateRoom(rm.id, { cuffs: Math.round(n) })} /></PropRow>
                      </div>
                    </>
                  )}

                  <div style={sub}>Ceiling</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                    <PropRow label="Ceiling gets">
                      <select value={rm.ceiling.kind} onChange={e => updateCeiling(rm.id, { kind: e.target.value as CeilingKind })} style={propInput}>
                        {CEILINGS.map(c => <option key={c} value={c}>{CEILING_LABEL[c]}</option>)}
                      </select>
                    </PropRow>
                    {rm.ceiling.kind === 'backer' && <PropRow label="Ceiling board">{boardSelect(rm.ceiling.boardId, v => updateCeiling(rm.id, { boardId: v }))}</PropRow>}
                    {rm.ceiling.kind !== 'none' && <PropRow label="Ceiling area (m²) — blank = the floor area"><TilingAutoInput v={rm.ceiling.areaOverrideM2} set={n => updateCeiling(rm.id, { areaOverrideM2: n })} auto={ceilingAreaM2(rm)} /></PropRow>}
                    <PropRow label="Situation">
                      <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_TILING_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    <TilingCheck label="Dust sheets and protection" on={rm.protect} set={b => updateRoom(rm.id, { protect: b })} />
                  </div>
                </div>
              )
            })}

            {r && rooms.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {rooms.length} room{rooms.length === 1 ? '' : 's'}: {r.totalFloorM2}m² of floor prepared, {r.totalWallM2}m² of wall board, {r.totalTankedM2}m² waterproofed, {r.totalCeilingM2}m² of ceiling board, about {r.totalTilerHours} tiler hours.
              </div>
            )}
          </>
        ),
        side: (
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="Rooms are">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_TILING_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label}{s.upliftPct ? ` +${s.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the tiler's hours. A single room can have its own. Waterproofing goes onto backer board or a sound water-resistant base, never onto plaster or standard board.</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
