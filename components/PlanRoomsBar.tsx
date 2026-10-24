'use client'

/** The rooms found on the Take-off plan, shown at the top of a by-room calculator's rooms: press one to add it with its size from the drawing, or add them all. Nothing shows outside Take-off (no rooms are handed over). */

import React from 'react'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'

export default function PlanRoomsBar({ planRooms, isAdded, onAdd, onAddAll }: {
  planRooms?: PlanRoomInfo[]
  isAdded: (roomId: string) => boolean
  onAdd: (room: PlanRoomInfo) => void
  onAddAll: (rooms: PlanRoomInfo[]) => void
}) {
  if (!planRooms) return null
  if (planRooms.length === 0) {
    return <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>The plan has no rooms yet. Draw closed walls in Take-off (the Rooms tool shows what is found) and they can be added here with their sizes.</div>
  }
  const todo = planRooms.filter(r => !isAdded(r.id))
  return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 10px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms on the plan</span>
        <span style={{ flex: 1 }} />
        {todo.length > 1 && <button type="button" onClick={() => onAddAll(todo)} style={{ fontSize: 11, fontWeight: 600, background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>+ Add all {todo.length}</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {planRooms.map(r => {
          const added = isAdded(r.id)
          return (
            <button key={r.id} type="button" disabled={added} onClick={() => onAdd(r)} title={`${r.areaM2.toFixed(1)} m², walls ${r.perimeterM.toFixed(1)} m, ${r.doors} door${r.doors === 1 ? '' : 's'}, ${r.windows} window${r.windows === 1 ? '' : 's'}, ${r.heightM} m high`}
              style={{ fontSize: 11.5, padding: '3px 9px', borderRadius: 14, cursor: added ? 'default' : 'pointer', border: `1px solid ${added ? '#cbd5e1' : '#0369a1'}`, background: added ? '#f1f5f9' : '#fff', color: added ? '#94a3b8' : '#0369a1', fontFamily: 'inherit' }}>
              {added ? '✓ ' : '+ '}{r.name} · {r.areaM2.toFixed(1)} m²
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 5, lineHeight: 1.4 }}>A room added from the plan follows the drawing (its size, doors and windows) until you type over it; what you set on it stays.</div>
    </div>
  )
}
