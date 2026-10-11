'use client'

/**
 * Take-off: the Electrics side panel. Pick a kind of point, click the plan to place it (the ⚡ tool), and the points are counted room by room and fed
 * into the electrics calculator, whose counts follow the plan until typed over. Here too: the list of rooms with their counts, editing one selected
 * point (its kind, its room, a special fitting on it), and the calculator's summary card with its full-size window (AssemblyItemPanel).
 * The points themselves live on the "Electrical installation" Take-off item (so they save with the project); this component only shows and edits them.
 */

import React from 'react'
import AssemblyItemPanel from './AssemblyWindow'
import { POINT_TYPES, POINT_BY_ID, GROUP_LABEL, FITTING_TYPES, type PointGroup } from '@/lib/electrics-units'
import { POINT_SHORT, UNNAMED_ROOM, type ElectricPoint } from '@/lib/electric-points'
import type { CostedLine } from '@/lib/assembly-calc'

export const POINT_GROUP_COLOUR: Record<PointGroup, string> = { sockets: '#3b82f6', switches: '#8b5cf6', lighting: '#f59e0b', appliances: '#22c55e', safety: '#ef4444', data: '#06b6d4' }
const GROUPS = Object.keys(GROUP_LABEL) as PointGroup[]

interface Props {
  points: ElectricPoint[]
  placing: boolean
  onPlacing: (on: boolean) => void
  typeId: string
  onTypeId: (id: string) => void
  roomName: string
  onRoomName: (name: string) => void
  /** room names that could be offered: rooms drawn on the plan and rooms already used */
  roomSuggestions: string[]
  selectedPointId: string | null
  onSelectPoint: (id: string | null) => void
  onUpdatePoint: (id: string, patch: Partial<ElectricPoint>) => void
  onDeletePoint: (id: string) => void
  /** the calculator's saved result, once Save & Price has been used */
  saved?: { lines: CostedLine[]; location?: string }
  /** the points on the plan have changed since the calculator was last saved */
  stale?: boolean
  calculatorOpen: boolean
  onOpenCalculator: () => void
  onCloseCalculator: () => void
  /** the calculator element (BUILT_ASSEMBLY_CANON_IDS['elec-install'].render(...)) */
  calculator: React.ReactNode
}

const box: React.CSSProperties = { background: 'var(--to-alt)', border: '1px solid var(--to-border)', borderRadius: 8, padding: 10, marginBottom: 10 }
const label: React.CSSProperties = { fontSize: 10, color: 'var(--to-dim, #8aa08a)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 7px', background: 'var(--to-bg)', color: 'var(--to-text)', border: '1px solid var(--to-border)', borderRadius: 5, fontFamily: 'inherit' }

export default function ElectricalPointsPanel(p: Props) {
  const selected = p.points.find(x => x.id === p.selectedPointId) ?? null
  const rooms = Array.from(
    p.points.reduce((m, pt) => { const k = pt.roomName.trim() || UNNAMED_ROOM; m.set(k, [...(m.get(k) ?? []), pt]); return m }, new Map<string, ElectricPoint[]>()),
  )
  const clickable = POINT_TYPES.filter(t => t.unit === 'nr')

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--to-textb)', marginBottom: 2 }}>⚡ Electrical points</div>
      <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 10, lineHeight: 1.45 }}>
        Pick a kind of point, then click where it goes on the plan. They are counted room by room and feed the electrical calculator below.
      </div>

      <button type="button" onClick={() => p.onPlacing(!p.placing)}
        style={{ width: '100%', padding: '8px 10px', marginBottom: 10, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          border: `1px solid ${p.placing ? '#16a34a' : 'var(--to-border)'}`, background: p.placing ? '#16a34a' : 'var(--to-alt)', color: p.placing ? '#fff' : 'var(--to-text)' }}>
        {p.placing ? '● Placing — click the plan (press again to stop)' : '⚡ Start placing points'}
      </button>

      <div style={box}>
        <div style={label}>Kind of point</div>
        {GROUPS.map(g => {
          const types = clickable.filter(t => t.group === g)
          if (types.length === 0) return null
          return (
            <div key={g} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: POINT_GROUP_COLOUR[g], fontWeight: 700, marginBottom: 3 }}>{GROUP_LABEL[g]}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {types.map(t => {
                  const on = p.typeId === t.id
                  return (
                    <button key={t.id} type="button" onClick={() => { p.onTypeId(t.id); p.onPlacing(true) }} title={t.name}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                        border: `1px solid ${on ? POINT_GROUP_COLOUR[g] : 'var(--to-border)'}`, background: on ? POINT_GROUP_COLOUR[g] : 'transparent', color: on ? '#fff' : 'var(--to-text)' }}>
                      <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.85 }}>{POINT_SHORT[t.id]}</span>{t.name.replace(/ \(.*\)$/, '')}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div style={box}>
        <div style={label}>Room for the next points</div>
        <input list="electric-rooms" value={p.roomName} onChange={e => p.onRoomName(e.target.value)} placeholder="e.g. Kitchen" style={input} />
        <datalist id="electric-rooms">{p.roomSuggestions.map(r => <option key={r} value={r} />)}</datalist>
        <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 4, lineHeight: 1.4 }}>
          A point placed inside a room you have drawn and named (in Floors) takes that room's name; otherwise it goes in this room.
        </div>
      </div>

      <div style={box}>
        <div style={label}>Placed so far — {p.points.length} point{p.points.length === 1 ? '' : 's'} in {rooms.length} room{rooms.length === 1 ? '' : 's'}</div>
        {rooms.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--to-muted)' }}>None yet.</div>}
        {rooms.map(([name, pts]) => {
          const counts = pts.reduce((m, pt) => m.set(pt.typeId, (m.get(pt.typeId) ?? 0) + 1), new Map<string, number>())
          return (
            <div key={name} onClick={() => p.onRoomName(name === UNNAMED_ROOM ? '' : name)} title="Use this room for the next points"
              style={{ padding: '5px 0', borderBottom: '1px solid var(--to-blt, var(--to-border))', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--to-textb)' }}>
                <span>{name}</span><span style={{ fontFamily: 'monospace' }}>{pts.length}</span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--to-muted)', lineHeight: 1.5 }}>
                {Array.from(counts).map(([tid, n]) => `${n} × ${POINT_BY_ID[tid]?.name ?? tid}`).join(', ')}
              </div>
            </div>
          )
        })}
      </div>

      {selected && (
        <div style={{ ...box, borderColor: '#16a34a' }}>
          <div style={label}>Selected point</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <select value={selected.typeId} onChange={e => p.onUpdatePoint(selected.id, { typeId: e.target.value })} style={input}>
              {clickable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input list="electric-rooms" value={selected.roomName} onChange={e => p.onUpdatePoint(selected.id, { roomName: e.target.value })} placeholder="Room" style={input} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--to-text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!selected.fitting}
                onChange={e => p.onUpdatePoint(selected.id, { fitting: e.target.checked ? { typeId: 'pendant-cluster', name: '' } : undefined })} />
              ✨ A special fitting goes on this point (chandelier, feature pendants…)
            </label>
            {selected.fitting && (
              <>
                <select value={selected.fitting.typeId} onChange={e => p.onUpdatePoint(selected.id, { fitting: { ...selected.fitting!, typeId: e.target.value } })} style={input}>
                  {FITTING_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input value={selected.fitting.name} onChange={e => p.onUpdatePoint(selected.id, { fitting: { ...selected.fitting!, name: e.target.value } })}
                  placeholder="What it is (optional), e.g. breakfast bar pendants" style={input} />
              </>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => p.onSelectPoint(null)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'transparent', color: 'var(--to-text)', fontFamily: 'inherit' }}>Done</button>
              <button type="button" onClick={() => p.onDeletePoint(selected.id)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid #c0392b', background: '#c0392b', color: '#fff', fontFamily: 'inherit' }}>🗑 Delete point</button>
            </div>
          </div>
        </div>
      )}

      {p.saved && p.stale && (
        <div style={{ fontSize: 11.5, color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid #d97706', borderRadius: 6, padding: '6px 9px', marginBottom: 8, lineHeight: 1.4 }}>
          ⚠ The points on the plan have changed since this was priced. Open the calculator and press Save &amp; Price again.
        </div>
      )}
      <AssemblyItemPanel
        name="Electrical installation"
        lengthM={0}
        measureLabel="Points on the plan"
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
