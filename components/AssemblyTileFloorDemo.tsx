'use client'

/**
 * Assembly Calculator — Floor tiling, by room (Tiling & Finishes → Floor Tiling (by room)).
 * Each room is sized (length, width, less the floor under a bath or units) and says what tile goes down: a size, a layout, our supply at an allowance or the client's own, the adhesive and grout, with trims,
 * tiled skirting and movement joints. The tile, adhesive and grout come from the area and the coverage of each product, the tiler's time from the area times a rate for that size of tile and layout (with a labourer
 * to carry and mix), and an occupied or awkward job adds time. The base (levelling, backer board, waterproofing, a decoupling mat) is Tiling Preparation; underfloor heating is its own calculator. The engine is
 * lib/tile-floor-units.ts; the body shared with the other three tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateTileFloor, newTileFloorRoom, floorAreaM2, FLOOR_ADHESIVE_LABEL, THRESHOLD_LM,
  type TileFloorRoom, type TileFloorResult, type FloorAdhesive,
} from '@/lib/tile-floor-units'
import { DEFAULT_TILING_SITUATIONS, TILING_ROOM_KINDS, TILING_ROOM_KIND_BY_ID, type TileSizeId, type TileLayoutId } from '@/lib/tiling-common'
import { describeTileFloor, describeTileFloorShort, type TilingDescriptionInput } from '@/lib/tiling-description'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TileSpecFields, TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const ADHESIVES = Object.keys(FLOOR_ADHESIVE_LABEL) as FloorAdhesive[]

export default function AssemblyTileFloorDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyTileFloorDemo'
  // The job starts with no rooms: you add the ones being tiled
  const [rooms, setRooms] = useCalcState<TileFloorRoom[]>(ID, 'rooms', [])
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'bathroom')
  const [startTile, setStartTile] = useCalcState<TileSizeId>(ID, 'startTile', 'large')
  const [startLayout, setStartLayout] = useCalcState<TileLayoutId>(ID, 'startLayout', 'straight')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')

  function addRoom() {
    setRooms(p => {
      const k = TILING_ROOM_KINDS.find(x => x.id === addKind) ?? TILING_ROOM_KINDS[0]
      const n = p.filter(x => x.kindId === addKind).length
      return [...p, newTileFloorRoom('room-' + uid(), n === 0 ? k.label.split(' (')[0] : `${k.label.split(' (')[0]} ${n + 1}`, addKind, k, { tileId: startTile, layoutId: startLayout })]
    })
  }
  function updateRoom(id: string, patch: Partial<TileFloorRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }

  const result = useMemo((): { ok: true; r: TileFloorResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateTileFloor({ rooms, jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {} }) } }
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
      id={ID} defaultName="Floor tiling" subject="floor tiling" lines={r?.lines ?? []} labourTasks={r?.labour ?? []}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeTileFloorShort(descInput) : ''} descFull={descInput ? describeTileFloor(descInput) : ''}
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
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
              A new room starts with
              {' '}<select value={startTile} onChange={e => setStartTile(e.target.value as TileSizeId)} style={{ ...tilingSmall, maxWidth: 210 }}>
                {Object.entries({ mosaic: 'mosaic', metro: 'metro tiles', small: 'small tiles', medium: 'medium tiles', large: 'large tiles (600 x 600)', xl: 'large format', plank: 'wood-effect planks' }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {' '}laid
              {' '}<select value={startLayout} onChange={e => setStartLayout(e.target.value as TileLayoutId)} style={{ ...tilingSmall, maxWidth: 140 }}>
                {Object.entries({ straight: 'straight', brick: 'brick bond', diagonal: 'diagonal', herringbone: 'herringbone' }).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>. Change any room afterwards.
            </div>

            {rooms.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>, then change its size and the tile it gets.
              </div>
            )}

            {rooms.map(rm => {
              const sum = r?.rooms.find(s => s.roomId === rm.id)
              const kind = TILING_ROOM_KIND_BY_ID[rm.kindId]
              const area = floorAreaM2(rm)
              return (
                <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.areaM2}m² of floor` : ''}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(rm.id) > 0 ? `£${roomCost(rm.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                    <PropRow label="Length (m)"><TilingNumInput v={rm.lengthM} set={n => updateRoom(rm.id, { lengthM: n })} step={0.1} /></PropRow>
                    <PropRow label="Width (m)"><TilingNumInput v={rm.widthM} set={n => updateRoom(rm.id, { widthM: n })} step={0.1} /></PropRow>
                    <PropRow label="Not tiled (m²)"><TilingNumInput v={rm.notTiledM2} set={n => updateRoom(rm.id, { notTiledM2: n })} step={0.1} /></PropRow>
                    <PropRow label="Doors (nr)"><TilingNumInput v={rm.doors} set={n => updateRoom(rm.id, { doors: Math.round(n) })} /></PropRow>
                    <PropRow label="Floor area (m²) — blank = from the room"><TilingAutoInput v={rm.areaOverrideM2} set={n => updateRoom(rm.id, { areaOverrideM2: n })} auto={area} /></PropRow>
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>Not tiled is the floor under a bath, units or anything fixed{kind && kind.fixedM2 > 0 ? ` (a ${kind.label.split(" (")[0].toLowerCase()} usually has about ${kind.fixedM2}m²)` : ''}.</div>
                  <TileSpecFields room={rm} onChange={patch => updateRoom(rm.id, patch)} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 4 }}>
                    <PropRow label="Adhesive">
                      <select value={rm.adhesive} onChange={e => updateRoom(rm.id, { adhesive: e.target.value as FloorAdhesive })} style={propInput}>
                        {ADHESIVES.map(a => <option key={a} value={a}>{FLOOR_ADHESIVE_LABEL[a].split(':')[0]}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label={`Trims & thresholds (lm) — blank = ${THRESHOLD_LM}m a door`}><TilingAutoInput v={rm.trimLm} set={n => updateRoom(rm.id, { trimLm: n })} auto={rm.doors * THRESHOLD_LM} /></PropRow>
                    <PropRow label="Tiled skirting (lm)"><TilingNumInput v={rm.skirtingLm} set={n => updateRoom(rm.id, { skirtingLm: n })} step={0.5} /></PropRow>
                    <PropRow label="Movement joints (lm)"><TilingNumInput v={rm.movementJointLm} set={n => updateRoom(rm.id, { movementJointLm: n })} step={0.5} /></PropRow>
                    <PropRow label="Situation">
                      <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_TILING_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    <TilingCheck label="Seal the tiles (natural stone, unglazed)" on={rm.sealed} set={b => updateRoom(rm.id, { sealed: b })} />
                    <TilingCheck label="Floor protection" on={rm.protect} set={b => updateRoom(rm.id, { protect: b })} />
                  </div>
                </div>
              )
            })}

            {r && rooms.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {rooms.length} room{rooms.length === 1 ? '' : 's'}: {r.totalAreaM2}m² of floor, {r.totalTileM2}m² of tile to buy, about {r.totalTilerHours} tiler hours.
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
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the tiler's hours. A single room can have its own. Levelling, backer board and waterproofing are in Tiling Preparation; underfloor heating is its own calculator.</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
