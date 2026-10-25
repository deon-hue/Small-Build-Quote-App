'use client'

/**
 * Assembly Calculator — Wall tiling, by room (Tiling & Finishes → Wall Tiling (by room)).
 * Each room has the wall areas that are tiled (a bath surround, shower walls, a splashback, or every wall), each sized by length and height less any window or niche, and says what tile goes on them: a size,
 * a layout, our supply at an allowance or the client's own, and the grout, with edge trims, external corners, niches and the silicone at the bath, tray and corners. The tile, adhesive and grout come from the area
 * and the coverage of each product, the tiler's time from the area times a rate for that size of tile and layout (with a labourer to carry and mix), and an occupied or awkward job adds time. The backer board and
 * waterproofing are Tiling Preparation. The engine is lib/tile-wall-units.ts; the body shared with the other three tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useEffect, useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import { calculateTileWall, newTileWallRoom, autoTrimLm, autoSiliconeLm, type TileWallRoom, type TileWallResult } from '@/lib/tile-wall-units'
import PlanRoomsBar from '@/components/PlanRoomsBar'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'
import { followPlanRooms, planRoomSig, tilingKindFor } from '@/lib/rooms-merge'
import {
  DEFAULT_TILING_SITUATIONS, TILING_ROOM_KINDS, TILING_ROOM_KIND_BY_ID, zonesFromKind, allWallsZone, zoneAreaM2, newZoneId, type TileSizeId, type TileLayoutId, type TilingZone,
} from '@/lib/tiling-common'
import { describeTileWall, describeTileWallShort, type TilingDescriptionInput } from '@/lib/tiling-description'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TileSpecFields, TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the rooms found on the Take-off plan: they can be added with their sizes, and follow the plan until typed over */
  planRooms?: PlanRoomInfo[]
  /** Take-off's drawn outline (area m², perimeter m) or line (length mm): the first room's first wall area is that length and follows it */
  externalAreaM2?: number
  externalPerimeterM?: number
  externalLengthMm?: number
  /** the name of the room the drawn shape sits in, when that room is named */
  externalName?: string
}

const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyTileWallDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM, externalLengthMm, externalName, planRooms }: Props) {
  const ID = 'AssemblyTileWallDemo'
  // What is drawn in Take-off: an outline gives its perimeter (the walls round it), a line gives its length. It is the first wall area's length and follows the drawing.
  const planLength = externalAreaM2 && externalAreaM2 > 0 && externalPerimeterM && externalPerimeterM > 0 ? externalPerimeterM
    : externalLengthMm && externalLengthMm > 0 ? +(externalLengthMm / 1000).toFixed(2) : 0
  const planName = externalName?.trim() || 'Walls from the plan'
  const planIsOutline = !!(externalAreaM2 && externalAreaM2 > 0 && externalPerimeterM && externalPerimeterM > 0)
  const planRoom = (): TileWallRoom => {
    const room = newTileWallRoom('room-' + uid(), planName, 'other', 2.4,
      [{ id: newZoneId(), label: planIsOutline ? 'Walls round the drawn outline' : 'Wall from the drawn line', lengthM: planLength, heightM: 2.4, deductM2: 0 }], { tileId: 'medium', layoutId: 'straight' })
    return { ...room, fromPlan: { lengthM: planLength, name: planName } }
  }
  // The job starts with no rooms: you add the ones being tiled (or the drawn walls are the first)
  const [rooms, setRooms] = useCalcState<TileWallRoom[]>(ID, 'rooms', () => (planLength > 0 ? [planRoom()] : []))
  useEffect(() => {
    if (!(planLength > 0)) return
    setRooms(p => (p.length === 0 ? [planRoom()] : p.map(r => (r.fromPlan && (r.fromPlan.lengthM !== planLength || (r.fromPlan.name ?? 'Walls from the plan') !== planName)
      ? { ...r, name: r.name === (r.fromPlan.name ?? 'Walls from the plan') ? planName : r.name, zones: r.fromPlan.lengthM !== planLength ? r.zones.map((z, i) => (i === 0 ? { ...z, lengthM: planLength } : z)) : r.zones, fromPlan: { lengthM: planLength, name: planName } } : r))))
  }, [planLength, planName])
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'bathroom')
  const [startTile, setStartTile] = useCalcState<TileSizeId>(ID, 'startTile', 'medium')
  const [startLayout, setStartLayout] = useCalcState<TileLayoutId>(ID, 'startLayout', 'straight')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')

  // a room from the Take-off plan: its name, its true ceiling height (a tiled area lower than it gets an edge trim) and the kind's usual tiled areas; the plan cannot say which walls are tiled, so the areas are set here
  const fitToPlan = (r: TileWallRoom, pr: PlanRoomInfo): TileWallRoom => ({ ...r, heightM: pr.heightM })
  function addPlanRooms(list: PlanRoomInfo[]) {
    setRooms(p => {
      const made = list.filter(pr => !p.some(r => r.planRoomId === pr.id)).map(pr => {
        const kindId = tilingKindFor(pr.kind)
        const room = fitToPlan(newTileWallRoom('room-' + uid(), pr.name, kindId, pr.heightM, zonesFromKind(kindId), { tileId: startTile, layoutId: startLayout }), pr)
        return { ...room, planRoomId: pr.id, planRoomSig: planRoomSig(pr) }
      })
      return [...p, ...made]
    })
  }
  const planRoomsKey = planRooms ? planRooms.map(p => p.id + ':' + planRoomSig(p)).join(';') : null
  useEffect(() => {
    if (planRooms) setRooms(p => followPlanRooms(p, planRooms, fitToPlan))
  }, [planRoomsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function addRoom() {
    setRooms(p => {
      const k = TILING_ROOM_KINDS.find(x => x.id === addKind) ?? TILING_ROOM_KINDS[0]
      const n = p.filter(x => x.kindId === addKind).length
      return [...p, newTileWallRoom('room-' + uid(), n === 0 ? k.label.split(' (')[0] : `${k.label.split(' (')[0]} ${n + 1}`, addKind, k.heightM, zonesFromKind(addKind), { tileId: startTile, layoutId: startLayout })]
    })
  }
  function updateRoom(id: string, patch: Partial<TileWallRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function updateZone(roomId: string, zoneId: string, patch: Partial<TilingZone>) { setRooms(p => p.map(r => r.id === roomId ? { ...r, zones: r.zones.map(z => z.id === zoneId ? { ...z, ...patch } : z) } : r)) }
  function addZone(roomId: string, all: boolean) {
    setRooms(p => p.map(r => {
      if (r.id !== roomId) return r
      const k = TILING_ROOM_KIND_BY_ID[r.kindId] ?? TILING_ROOM_KIND_BY_ID.other
      const z: TilingZone = all ? allWallsZone({ ...k, heightM: r.heightM }) : { id: newZoneId(), label: 'Wall area', lengthM: 1, heightM: 1.2, deductM2: 0 }
      return { ...r, zones: [...r.zones, z] }
    }))
  }

  const result = useMemo((): { ok: true; r: TileWallResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateTileWall({ rooms, jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, jobSituationId])
  const r = result.ok ? result.r : null

  const descInput: TilingDescriptionInput | null = r ? {
    rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })),
    occupied: jobSituationId === 'occupied' || rooms.some(x => x.situationId === 'occupied'),
    clientTiles: rooms.length > 0 && rooms.every(x => x.clientSupplies),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Wall tiling" subject="wall tiling" lines={r?.lines ?? []} labourTasks={r?.labour ?? []}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeTileWallShort(descInput) : ''} descFull={descInput ? describeTileWall(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <PlanRoomsBar planRooms={planRooms} isAdded={id => rooms.some(r => r.planRoomId === id)} onAdd={r => addPlanRooms([r])} onAddAll={addPlanRooms} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...tilingSmall, minWidth: 150 }}>
                {TILING_ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addRoom} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
              {planLength > 0 && !rooms.some(x => x.fromPlan) && (
                <button type="button" onClick={() => setRooms(p => [...p, planRoom()])} title="Add the walls drawn on the plan as a room" style={{ ...tilingSmall, cursor: 'pointer', background: '#f1f5f9' }}>+ The drawn walls ({planLength.toFixed(1)}m)</button>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
              A new room starts with
              {' '}<select value={startTile} onChange={e => setStartTile(e.target.value as TileSizeId)} style={{ ...tilingSmall, maxWidth: 210 }}>
                {Object.entries({ mosaic: 'mosaic', metro: 'metro tiles', small: 'small tiles', medium: 'medium tiles (300 x 600)', large: 'large tiles (600 x 600)', xl: 'large format', plank: 'wood-effect planks' }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {' '}laid
              {' '}<select value={startLayout} onChange={e => setStartLayout(e.target.value as TileLayoutId)} style={{ ...tilingSmall, maxWidth: 140 }}>
                {Object.entries({ straight: 'straight', brick: 'brick bond', diagonal: 'diagonal', herringbone: 'herringbone' }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>, and the usual tiled areas for that kind of room. Change any room afterwards.
            </div>

            {rooms.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>, then change the wall areas and the tile.
              </div>
            )}

            {rooms.map(rm => {
              const sum = r?.rooms.find(s => s.roomId === rm.id)
              return (
                <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.areaM2}m² of wall` : ''}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(rm.id) > 0 ? `£${roomCost(rm.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Tiled areas</span>
                    <label style={{ fontSize: 10.5, color: '#64748b', marginLeft: 8 }}>Room height (m)</label>
                    <div style={{ width: 70 }}><TilingNumInput v={rm.heightM} set={n => updateRoom(rm.id, { heightM: n })} step={0.1} /></div>
                  </div>
                  {rm.zones.map(z => (
                    <div key={z.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1.6fr) repeat(3, minmax(60px, 1fr)) 60px 22px', gap: 6, alignItems: 'end', marginBottom: 4 }}>
                      <PropRow label="Area"><input value={z.label} onChange={e => updateZone(rm.id, z.id, { label: e.target.value })} style={propInput} /></PropRow>
                      <PropRow label={rm.fromPlan && rm.zones[0]?.id === z.id ? 'Length (m) — from the plan' : 'Length (m)'}><TilingNumInput v={z.lengthM} set={n => updateZone(rm.id, z.id, { lengthM: n })} step={0.1} /></PropRow>
                      <PropRow label="Height (m)"><TilingNumInput v={z.heightM} set={n => updateZone(rm.id, z.id, { heightM: n })} step={0.1} /></PropRow>
                      <PropRow label="Less (m²)"><TilingNumInput v={z.deductM2} set={n => updateZone(rm.id, z.id, { deductM2: n })} step={0.1} /></PropRow>
                      <div style={{ fontSize: 11, color: '#64748b', paddingBottom: 6, textAlign: 'right' }}>{zoneAreaM2(z).toFixed(1)}m²</div>
                      <button type="button" onClick={() => setRooms(p => p.map(x => x.id === rm.id ? { ...x, zones: x.zones.filter(q => q.id !== z.id) } : x))} title="Remove this area" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, lineHeight: 1, paddingBottom: 6 }}>×</button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, margin: '4px 0 8px' }}>
                    <button type="button" onClick={() => addZone(rm.id, false)} style={{ ...tilingSmall, cursor: 'pointer', background: '#f1f5f9' }}>+ Add a wall area</button>
                    <button type="button" onClick={() => addZone(rm.id, true)} title="Every wall of a typical room of this kind, less a door and the windows: change the lengths to suit" style={{ ...tilingSmall, cursor: 'pointer', background: '#f1f5f9' }}>+ All the walls</button>
                  </div>

                  <TileSpecFields room={rm} onChange={patch => updateRoom(rm.id, patch)} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 4 }}>
                    <PropRow label="Edge trim (lm) — blank = areas short of the ceiling"><TilingAutoInput v={rm.trimLm} set={n => updateRoom(rm.id, { trimLm: n })} auto={autoTrimLm(rm)} /></PropRow>
                    <PropRow label="External corners (lm)"><TilingNumInput v={rm.externalCornerLm} set={n => updateRoom(rm.id, { externalCornerLm: n })} step={0.5} /></PropRow>
                    <PropRow label="Niches (nr)"><TilingNumInput v={rm.niches} set={n => updateRoom(rm.id, { niches: Math.round(n) })} /></PropRow>
                    <PropRow label="Silicone (lm) — blank = from the areas"><TilingAutoInput v={rm.siliconeLm} set={n => updateRoom(rm.id, { siliconeLm: n })} auto={autoSiliconeLm(rm)} /></PropRow>
                    <PropRow label="Situation">
                      <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_TILING_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    <TilingCheck label="Seal the tiles (natural stone, unglazed)" on={rm.sealed} set={b => updateRoom(rm.id, { sealed: b })} />
                    <TilingCheck label="Dust sheets and protection" on={rm.protect} set={b => updateRoom(rm.id, { protect: b })} />
                  </div>
                </div>
              )
            })}

            {r && rooms.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {rooms.length} room{rooms.length === 1 ? '' : 's'}: {r.totalAreaM2}m² of wall, {r.totalTileM2}m² of tile to buy, about {r.totalTilerHours} tiler hours.
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
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the tiler's hours. A single room can have its own. The backer board and waterproofing behind the tiles are in Tiling Preparation.</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
