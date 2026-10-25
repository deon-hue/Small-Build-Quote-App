'use client'

/**
 * Take-off: the Plumbing & Heating side panel for fittings placed on the plan. Pick a kind of fitting (the same list the Plumbing Installation calculator uses), click the plan to place it (the 🚿 tool),
 * and the fittings are counted room by room and fed into the calculator, whose counts follow the plan until typed over. Radiators are placed one by one and sized for the room they are in from a rough
 * heat loss worked out from the drawing (room size, height, outside walls, windows) and the age of the building: an estimate to price from, not a heating design.
 * The fittings live on the "Plumbing installation" Take-off item (so they save with the project); this component only shows and edits them.
 */

import React from 'react'
import AssemblyItemPanel from './AssemblyWindow'
import { FITTING_TYPES, FITTING_BY_ID } from '@/lib/plumbing-units'
import { PLUMB_SHORT, UNNAMED_ROOM, type PlumbPoint } from '@/lib/plumb-points'
import { RAD_TYPES, RAD_HEIGHTS, RAD_WIDTHS, AGE_LABEL, type BuildingAge, type RadSizing } from '@/lib/radiators'
import type { CostedLine } from '@/lib/assembly-calc'

export const PLUMB_GROUP_COLOUR: Record<string, string> = { sanitaryware: '#0ea5e9', kitchen: '#14b8a6', heating: '#ef4444', outside: '#84cc16' }
const GROUP_LABEL: Record<string, string> = { sanitaryware: 'Bathroom', kitchen: 'Kitchen and utility', heating: 'Heating', outside: 'Outside' }
const GROUPS = ['sanitaryware', 'kitchen', 'heating', 'outside']

export interface RoomHeatSummary { watts: number; notes: string[]; designC: number; externalWallLengthM: number; windowAreaM2: number; floorLoss: boolean; roofLoss: boolean }

interface Props {
  points: PlumbPoint[]
  placing: boolean
  onPlacing: (on: boolean) => void
  typeId: string
  onTypeId: (id: string) => void
  /** the radiator type and height the next radiator is placed with */
  radType: string
  onRadType: (id: string) => void
  radHeight: number
  onRadHeight: (mm: number) => void
  age: BuildingAge
  onAge: (a: BuildingAge) => void
  roomName: string
  onRoomName: (name: string) => void
  roomSuggestions: string[]
  selectedPointId: string | null
  onSelectPoint: (id: string | null) => void
  onUpdatePoint: (id: string, patch: Partial<PlumbPoint>) => void
  onDeletePoint: (id: string) => void
  /** the room each point is in (from where it sits on the plan), by point id */
  roomOf: (p: PlumbPoint) => string
  /** each radiator's size, by point id */
  sizes: Map<string, RadSizing>
  /** the heat loss behind a point's room, when it is inside a room */
  heatOf: (p: PlumbPoint) => RoomHeatSummary | null
  saved?: { lines: CostedLine[]; location?: string }
  stale?: boolean
  calculatorOpen: boolean
  onOpenCalculator: () => void
  onCloseCalculator: () => void
  calculator: React.ReactNode
}

const box: React.CSSProperties = { background: 'var(--to-alt)', border: '1px solid var(--to-border)', borderRadius: 8, padding: 10, marginBottom: 10 }
const label: React.CSSProperties = { fontSize: 10, color: 'var(--to-dim, #8aa08a)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 7px', background: 'var(--to-bg)', color: 'var(--to-text)', border: '1px solid var(--to-border)', borderRadius: 5, fontFamily: 'inherit' }

export default function PlumbingPointsPanel(p: Props) {
  const selected = p.points.find(x => x.id === p.selectedPointId) ?? null
  const rooms = Array.from(
    p.points.reduce((m, pt) => { const k = p.roomOf(pt).trim() || UNNAMED_ROOM; m.set(k, [...(m.get(k) ?? []), pt]); return m }, new Map<string, PlumbPoint[]>()),
  )
  const selSize = selected ? p.sizes.get(selected.id) : undefined
  const selHeat = selected && selected.typeId === 'radiator' ? p.heatOf(selected) : null
  const radCount = p.points.filter(x => x.typeId === 'radiator').length
  const radW = p.points.reduce((s, x) => s + (p.sizes.get(x.id)?.outputW ?? 0), 0)

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--to-textb)', marginBottom: 2 }}>🚿 Plumbing fittings and radiators</div>
      <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 10, lineHeight: 1.45 }}>
        Pick a kind of fitting, then click where it goes on the plan. They are counted room by room and feed the plumbing calculator below. Radiators are sized for the room they are in.
      </div>

      <button type="button" onClick={() => p.onPlacing(!p.placing)}
        style={{ width: '100%', padding: '8px 10px', marginBottom: 10, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          border: `1px solid ${p.placing ? '#0284c7' : 'var(--to-border)'}`, background: p.placing ? '#0284c7' : 'var(--to-alt)', color: p.placing ? '#fff' : 'var(--to-text)' }}>
        {p.placing ? '● Placing — click the plan (press again to stop)' : '🚿 Start placing fittings'}
      </button>

      <div style={box}>
        <div style={label}>Kind of fitting</div>
        {GROUPS.map(g => {
          const types = FITTING_TYPES.filter(t => t.group === g)
          if (types.length === 0) return null
          return (
            <div key={g} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: PLUMB_GROUP_COLOUR[g], fontWeight: 700, marginBottom: 3 }}>{GROUP_LABEL[g] ?? g}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {types.map(t => {
                  const on = p.typeId === t.id
                  return (
                    <button key={t.id} type="button" onClick={() => { p.onTypeId(t.id); p.onPlacing(true) }} title={t.name}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1px solid ${on ? PLUMB_GROUP_COLOUR[g] : 'var(--to-border)'}`, background: on ? PLUMB_GROUP_COLOUR[g] : 'transparent', color: on ? '#fff' : 'var(--to-text)' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.85 }}>{PLUMB_SHORT[t.id]}</span>{t.name.replace(/ \(.*\)$/, '')}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {p.typeId === 'radiator' && (
        <div style={box}>
          <div style={label}>Next radiator</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            <select value={p.radType} onChange={e => p.onRadType(e.target.value)} style={input}>
              {RAD_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <select value={p.radHeight} onChange={e => p.onRadHeight(+e.target.value)} style={input}>
              {RAD_HEIGHTS.map(h => <option key={h.mm} value={h.mm}>{h.mm} high</option>)}
            </select>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 4, lineHeight: 1.4 }}>The width is worked out from the room's heat loss. Change it on a placed radiator to choose your own.</div>
        </div>
      )}

      <div style={box}>
        <div style={label}>Age of the building (for radiator sizes)</div>
        <select value={p.age} onChange={e => p.onAge(e.target.value as BuildingAge)} style={input}>
          {(Object.keys(AGE_LABEL) as BuildingAge[]).map(a => <option key={a} value={a}>{AGE_LABEL[a]}</option>)}
        </select>
        <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 4, lineHeight: 1.4 }}>
          Sets how much heat the walls, windows, roof and floor lose. A rough estimate to price from: a heating engineer's room-by-room calculation replaces it.
        </div>
      </div>

      <div style={box}>
        <div style={label}>Room when a fitting is outside any room</div>
        <input list="plumb-rooms" value={p.roomName} onChange={e => p.onRoomName(e.target.value)} placeholder="e.g. Kitchen" style={input} />
        <datalist id="plumb-rooms">{p.roomSuggestions.map(r => <option key={r} value={r} />)}</datalist>
        <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 4, lineHeight: 1.4 }}>
          A fitting placed inside a room found from your walls (or drawn in Rooms) takes that room's name; otherwise it goes in this room.
        </div>
      </div>

      <div style={box}>
        <div style={label}>Placed so far — {p.points.length} fitting{p.points.length === 1 ? '' : 's'} in {rooms.length} room{rooms.length === 1 ? '' : 's'}</div>
        {rooms.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--to-muted)' }}>None yet.</div>}
        {rooms.map(([name, pts]) => {
          const counts = pts.reduce((m, pt) => m.set(pt.typeId, (m.get(pt.typeId) ?? 0) + 1), new Map<string, number>())
          const rads = pts.filter(pt => pt.typeId === 'radiator')
          return (
            <div key={name} onClick={() => p.onRoomName(name === UNNAMED_ROOM ? '' : name)} title="Use this room for fittings placed outside a room"
              style={{ padding: '5px 0', borderBottom: '1px solid var(--to-blt, var(--to-border))', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--to-textb)' }}>
                <span>{name}</span><span style={{ fontFamily: 'monospace' }}>{pts.length}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--to-muted)', lineHeight: 1.5 }}>
                {Array.from(counts).map(([tid, n]) => `${n} × ${FITTING_BY_ID[tid]?.name.replace(/ \(.*\)$/, '') ?? tid}`).join(', ')}
              </div>
              {rads.map(r => {
                const s = p.sizes.get(r.id)
                return s ? <div key={r.id} style={{ fontSize: 10.5, color: s.short ? '#d97706' : '#0369a1', lineHeight: 1.5 }}>🔥 {s.label}{s.auto ? '' : ' — chosen'}{s.short ? ' — too small for the room' : ''}</div> : null
              })}
            </div>
          )
        })}
        {radCount > 0 && <div style={{ fontSize: 11, color: 'var(--to-muted)', marginTop: 6 }}>{radCount} radiator{radCount === 1 ? '' : 's'}: {(radW / 1000).toFixed(1)} kW in all</div>}
      </div>

      {selected && (
        <div style={{ ...box, borderColor: '#0284c7' }}>
          <div style={label}>Selected fitting</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <select value={selected.typeId} onChange={e => p.onUpdatePoint(selected.id, { typeId: e.target.value, rad: e.target.value === 'radiator' ? (selected.rad ?? { typeId: p.radType, heightMm: p.radHeight }) : undefined })} style={input}>
              {FITTING_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <div style={{ fontSize: 11, color: 'var(--to-muted)' }}>In: <b style={{ color: 'var(--to-text)' }}>{p.roomOf(selected) || UNNAMED_ROOM}</b></div>
            <input list="plumb-rooms" value={selected.roomName} onChange={e => p.onUpdatePoint(selected.id, { roomName: e.target.value })} placeholder="Room (used when it is not inside a room)" style={input} />
            {selected.typeId === 'radiator' && selected.rad && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <select value={selected.rad.typeId} onChange={e => p.onUpdatePoint(selected.id, { rad: { ...selected.rad!, typeId: e.target.value } })} style={input}>
                    {RAD_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <select value={selected.rad.heightMm} onChange={e => p.onUpdatePoint(selected.id, { rad: { ...selected.rad!, heightMm: +e.target.value } })} style={input}>
                    {RAD_HEIGHTS.map(h => <option key={h.mm} value={h.mm}>{h.mm} high</option>)}
                  </select>
                </div>
                <select value={selected.rad.widthMm ?? ''} onChange={e => p.onUpdatePoint(selected.id, { rad: { ...selected.rad!, widthMm: e.target.value ? +e.target.value : undefined } })} style={input}>
                  <option value="">Width: sized for the room{selSize?.auto ? ` (${selSize.widthMm})` : ''}</option>
                  {RAD_WIDTHS.map(w => <option key={w} value={w}>{w} wide</option>)}
                </select>
                {selSize && <div style={{ fontSize: 11, color: selSize.short ? '#d97706' : 'var(--to-text)' }}>🔥 {selSize.label}{selSize.requiredW !== null ? ` — the room needs about ${selSize.requiredW} W from it` : ' — not in a room, so a standard width'}{selSize.short ? ' — the biggest standard radiator is still too small: add another' : ''}</div>}
                {selHeat && (
                  <div style={{ fontSize: 10.5, color: 'var(--to-muted)', lineHeight: 1.5 }}>
                    Room heat loss about {selHeat.watts} W at {selHeat.designC}°C: {selHeat.externalWallLengthM.toFixed(1)} m of outside wall, {selHeat.windowAreaM2.toFixed(1)} m² of windows
                    {selHeat.floorLoss ? ', floor over the ground' : ''}{selHeat.roofLoss ? ', ceiling under the roof' : ''}.
                    {selHeat.notes.map((n, i) => <div key={i}>{n}</div>)}
                  </div>
                )}
              </>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => p.onSelectPoint(null)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'transparent', color: 'var(--to-text)', fontFamily: 'inherit' }}>Done</button>
              <button type="button" onClick={() => p.onDeletePoint(selected.id)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid #c0392b', background: '#c0392b', color: '#fff', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {p.saved && p.stale && (
        <div style={{ fontSize: 11.5, color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid #d97706', borderRadius: 6, padding: '6px 9px', marginBottom: 8, lineHeight: 1.4 }}>
          ⚠ The fittings on the plan have changed since this was priced. Open the calculator and press Save &amp; Price again.
        </div>
      )}
      <AssemblyItemPanel
        name="Plumbing installation"
        lengthM={0}
        measureLabel="Fittings on the plan"
        measureText={`${p.points.length} in ${rooms.length} room${rooms.length === 1 ? '' : 's'}`}
        saved={p.saved}
        open={p.calculatorOpen}
        onOpen={p.onOpenCalculator}
        onClose={p.onCloseCalculator}
      >
        {p.calculator}
      </AssemblyItemPanel>
    </div>
  )
}
