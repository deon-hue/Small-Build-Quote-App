'use client'

/**
 * Take-off: the Rooms side panel. The rooms are found by themselves from the walls drawn (the space between them): this lists each with its area, the length of wall round it and the doors and windows that open into it, lets you
 * name a room and say what kind it is (and its ceiling height), and is where the rooms are handed to the by-room calculators (tiling, plastering, decoration, electrics...).
 * The names are kept on the sheet (RoomLabel), anchored to a point inside the room, so a name follows its room if the walls are changed.
 */

import React, { useEffect, useState } from 'react'
import { ROOM_KINDS, DEFAULT_ROOM_HEIGHT_M, type PlanRoomInfo, type RoomLabel } from '@/lib/rooms-from-walls'

interface Props {
  rooms: PlanRoomInfo[]
  /** the label each room has (or undefined) */
  labels: (RoomLabel | undefined)[]
  selectedIdx: number
  onSelect: (idx: number) => void
  onUpdate: (idx: number, patch: Partial<RoomLabel>) => void
  onKind: (idx: number, kind: string) => void
  onRemoveName: (idx: number) => void
  /** draw a room as a rectangle or a polygon */
  onDraw: (kind: 'rect' | 'polygon' | 'edge') => void
  /** the room edges drawn on this sheet (lines that close a room where there is no wall) */
  edges: { id: string; lengthM: number }[]
  selectedEdgeId: string | null
  onSelectEdge: (id: string | null) => void
  onDeleteEdge: (id: string) => void
  /** this room was drawn as a shape (it can be deleted here) rather than found from walls */
  isDrawn: (idx: number) => boolean
  onDeleteDrawn: (idx: number) => void
  /** the selected drawn rectangle's width and depth, m (null for any other room) and a way to change them (its top-left corner stays) */
  drawnSize: { widthM: number; depthM: number } | null
  onResizeDrawn: (idx: number, widthM: number, depthM: number) => void
  /** the plan has walls but no closed room was found among them */
  wallsButNoRooms: boolean
  hasWalls: boolean
  cellMm: number
}

const box: React.CSSProperties = { background: 'var(--to-alt)', border: '1px solid var(--to-border)', borderRadius: 8, padding: 10, marginBottom: 10 }
const label: React.CSSProperties = { fontSize: 10, color: 'var(--to-dim, #8aa08a)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 7px', background: 'var(--to-bg)', color: 'var(--to-text)', border: '1px solid var(--to-border)', borderRadius: 5, fontFamily: 'inherit' }
const tiny: React.CSSProperties = { fontSize: 10.5, color: 'var(--to-muted)', marginBottom: 2 }

function Num({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  return (
    <div style={{ position: 'relative' }}>
      <input value={text} inputMode="decimal" onChange={e => { setText(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) onChange(n) }} style={{ ...input, paddingRight: suffix ? 24 : 7 }} />
      {suffix && <span style={{ position: 'absolute', right: 7, top: 6, fontSize: 10.5, color: 'var(--to-muted)', pointerEvents: 'none' }}>{suffix}</span>}
    </div>
  )
}

export default function RoomsPanel(p: Props) {
  const sel = p.selectedIdx >= 0 ? p.rooms[p.selectedIdx] : undefined
  const lab = p.selectedIdx >= 0 ? p.labels[p.selectedIdx] : undefined
  const totalM2 = p.rooms.reduce((s, r) => s + r.areaM2, 0)
  const wallArea = sel ? Math.max(0, sel.perimeterM * sel.heightM - sel.doorAreaM2 - sel.windowAreaM2) : 0

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--to-textb)', marginBottom: 2 }}>🏠 Rooms</div>
      <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 10, lineHeight: 1.45 }}>
        A room is either drawn here (a rectangle or any shape) or found from the walls you have drawn: each closed space between the walls (a door or window does not join two rooms). Click a room on the plan, name it and say what it is, and the by-room calculators (tiling, plastering) can add it with its size.
      </div>

      <div style={box}>
        <div style={label}>Draw a room</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => p.onDraw('rect')} style={{ flex: 1, padding: '7px', fontSize: 12, fontWeight: 600, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'var(--to-bg)', color: 'var(--to-text)', fontFamily: 'inherit' }}>▭ Rectangle</button>
          <button type="button" onClick={() => p.onDraw('polygon')} style={{ flex: 1, padding: '7px', fontSize: 12, fontWeight: 600, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'var(--to-bg)', color: 'var(--to-text)', fontFamily: 'inherit' }}>⬠ Any shape</button>
        </div>
        <button type="button" onClick={() => p.onDraw('edge')} style={{ width: '100%', marginTop: 6, padding: '7px', fontSize: 12, fontWeight: 600, borderRadius: 5, cursor: 'pointer', border: '1px solid #7c3aed', background: 'var(--to-bg)', color: '#7c3aed', fontFamily: 'inherit' }}>┆ Room edge (closes a room)</button>
        <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 5, lineHeight: 1.4 }}>A room edge is a line that closes a room where there is no wall: the open side of an extension, or the line between a kitchen and a dining space. It is not a wall, so nothing is painted or priced for it. Draw it from end to end of the open side.</div>
        {p.edges.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ ...label, marginBottom: 3 }}>Room edges ({p.edges.length})</div>
            {p.edges.map((e, i) => (
              <div key={e.id} onClick={() => p.onSelectEdge(e.id === p.selectedEdgeId ? null : e.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 11.5, cursor: 'pointer', background: e.id === p.selectedEdgeId ? 'rgba(124,58,237,0.14)' : 'transparent', color: 'var(--to-textb)' }}>
                <span style={{ flex: 1 }}>Edge {i + 1} · {e.lengthM.toFixed(2)} m</span>
                <button type="button" onClick={ev => { ev.stopPropagation(); p.onDeleteEdge(e.id) }} style={{ padding: '1px 7px', fontSize: 11, borderRadius: 4, cursor: 'pointer', border: '1px solid #c0392b', background: 'transparent', color: '#c0392b', fontFamily: 'inherit' }}>Delete</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 5, lineHeight: 1.4 }}>For a room with no walls drawn round it: its outline is the floor. Or draw the walls and the room is found by itself.</div>
      </div>

      {p.rooms.length === 0 && (
        <div style={{ ...box, fontSize: 11.5, color: 'var(--to-muted)', lineHeight: 1.5 }}>
          {!p.hasWalls
            ? 'No rooms yet. Draw one above, or draw the walls in External Walls and Internal Walls & Partitions and the rooms are found.'
            : p.wallsButNoRooms
              ? 'No closed room found. Check the walls make a closed shape with no gaps: their ends should meet (snap them together) and a partition should reach the walls on both sides. If one side has no wall (the open side of an extension), draw a Room edge across it.'
              : 'No rooms found.'}
        </div>
      )}

      {p.rooms.length > 0 && (
        <div style={box}>
          <div style={label}>{p.rooms.length} room{p.rooms.length === 1 ? '' : 's'}, {totalM2.toFixed(1)} m² of floor</div>
          {p.rooms.map((r, i) => (
            <div key={r.id} onClick={() => p.onSelect(i === p.selectedIdx ? -1 : i)}
              style={{ padding: '5px 4px', borderBottom: '1px solid var(--to-blt, var(--to-border))', cursor: 'pointer', background: i === p.selectedIdx ? 'rgba(22,163,74,0.14)' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--to-textb)' }}>
                <span>{r.name}</span><span style={{ fontFamily: 'monospace' }}>{r.areaM2.toFixed(2)} m²</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--to-muted)' }}>
                {r.lengthM.toFixed(2)} × {r.widthM.toFixed(2)} m · walls {r.perimeterM.toFixed(1)} m · {r.doors} door{r.doors === 1 ? '' : 's'}, {r.windows} window{r.windows === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      )}

      {sel && (
        <div style={{ ...box, borderColor: '#16a34a' }}>
          <div style={label}>Selected room</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div><div style={tiny}>Name</div><input value={lab?.name ?? ''} placeholder={sel.name} onChange={e => p.onUpdate(p.selectedIdx, { name: e.target.value })} style={input} /></div>
            <div>
              <div style={tiny}>What kind of room</div>
              <select value={lab?.kind ?? ''} onChange={e => { if (e.target.value) p.onKind(p.selectedIdx, e.target.value) }} style={input}>
                <option value="">Choose…</option>
                {ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </div>
            {p.drawnSize && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div><div style={tiny}>Width (left to right)</div><Num value={p.drawnSize.widthM} onChange={n => p.onResizeDrawn(p.selectedIdx, n, p.drawnSize!.depthM)} suffix="m" /></div>
                <div><div style={tiny}>Depth (up and down)</div><Num value={p.drawnSize.depthM} onChange={n => p.onResizeDrawn(p.selectedIdx, p.drawnSize!.widthM, n)} suffix="m" /></div>
              </div>
            )}
            {p.isDrawn(p.selectedIdx) && <div style={{ fontSize: 10.5, color: 'var(--to-muted)', lineHeight: 1.4 }}>Drag the room on the plan to move it, or a white corner to reshape it. Delete removes it.</div>}
            <div><div style={tiny}>Ceiling height</div><Num value={lab?.heightM ?? DEFAULT_ROOM_HEIGHT_M} onChange={n => p.onUpdate(p.selectedIdx, { heightM: n })} suffix="m" /></div>
            <div style={{ fontSize: 11.5, color: 'var(--to-text)', lineHeight: 1.6 }}>
              Floor <strong>{sel.areaM2.toFixed(2)} m²</strong> · {sel.lengthM.toFixed(2)} × {sel.widthM.toFixed(2)} m<br />
              Walls round it <strong>{sel.perimeterM.toFixed(2)} m</strong> · wall area {wallArea.toFixed(1)} m² (less {sel.doors} door{sel.doors === 1 ? '' : 's'} and {sel.windows} window{sel.windows === 1 ? '' : 's'})
            </div>
            {p.isDrawn(p.selectedIdx) && <button type="button" onClick={() => p.onDeleteDrawn(p.selectedIdx)} style={{ padding: '5px', fontSize: 11.5, borderRadius: 5, cursor: 'pointer', border: '1px solid #c0392b', background: '#c0392b', color: '#fff', fontFamily: 'inherit' }}>🗑 Delete this drawn room</button>}
            {lab && <button type="button" onClick={() => p.onRemoveName(p.selectedIdx)} style={{ padding: '5px', fontSize: 11.5, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'transparent', color: 'var(--to-text)', fontFamily: 'inherit' }}>Remove the name</button>}
          </div>
        </div>
      )}
      <div style={{ fontSize: 10.5, color: 'var(--to-muted)', lineHeight: 1.45 }}>
        Sizes are measured between the faces of the walls to {p.cellMm} mm. Rooms are found again whenever the walls change, and a name stays with the room it was given to.
      </div>
    </div>
  )
}
