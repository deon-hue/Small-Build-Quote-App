'use client'

/**
 * The steel over an opening in a wall calculator, set up with the steel calculators' own options: the beam section (one of the same 14 universal beams, or picked from the span), one beam or a pair, what is above, posts on pads,
 * a plate welded on to spread the load, connections and fabrications, fire protection, and who supplies it. The sums are the Structural Openings engine's (lib/wall-steel.ts), so a beam here costs what it costs there.
 */

import React from 'react'
import { miniInput } from '@/components/assembly-ui'
import BeamPlateFields from '@/components/BeamPlateFields'
import {
  BEAM_CHOICES, POST_SECTIONS, CONNECTION_KINDS, CONNECTION_BY_ID, LOAD_LABEL, FINISH_LABEL, POST_ROLE_LABEL, beamFor, usualConnections,
  type LoadAbove, type SteelFinish, type SteelBy, type PostRole,
} from '@/lib/structural-openings-units'
import type { WallSteel } from '@/lib/wall-steel'

const lab: React.CSSProperties = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }
const cell: React.CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 120, flex: '1 1 140px' }

function Num({ v, set, min = 0, max = 99, step = 1 }: { v: number; set: (n: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" value={v} min={min} max={max} step={step} onChange={e => { const n = +e.target.value; if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n))) }} style={miniInput} />
}

export default function WallSteelFields({ steel, onChange, widthMm, wallMm, summary }: {
  steel: WallSteel
  onChange: (s: WallSteel) => void
  /** the opening's clear width, mm */
  widthMm: number
  /** the whole wall's thickness, mm (a plate is as wide as it by default) */
  wallMm: number
  /** what the engine made of it: the section chosen and the weight of steel */
  summary?: { beamLabel: string; steelKg: number }
}) {
  const set = (patch: Partial<WallSteel>) => onChange({ ...steel, ...patch })
  const spanM = steel.postRole === 'mid' && steel.posts > 0 ? widthMm / 1000 / (steel.posts + 1) : widthMm / 1000
  const sug = beamFor(spanM, steel.loadAbove)
  const beamLengthM = widthMm / 1000 + 0.3
  const free = CONNECTION_KINDS.filter(k => !steel.connections.some(c => c.kind === k.id))
  return (
    <div style={{ flexBasis: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 8px 10px', display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
        <b>Steel from the steel calculators.</b> The beam, its padstones, plate, connections and posts are priced the way Structural Openings prices them; the wall adds only its own cavity tray and weeps. The section is the designer&apos;s: these are samples to price from.
        {summary?.beamLabel ? <> Now: <b>{summary.beamLabel}</b>{steel.beams > 1 ? ` x ${steel.beams}` : ''}, about {summary.steelKg}kg of steel.</> : null}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <div style={cell}>
          <span style={lab}>Beam section</span>
          <select value={steel.section} onChange={e => set({ section: e.target.value })} style={miniInput}>
            <option value="auto">Pick from the span ({sug.section.label})</option>
            {BEAM_CHOICES.map(b => <option key={b.label} value={b.label}>{b.label} ({b.kgPerM} kg/m)</option>)}
          </select>
        </div>
        <div style={{ ...cell, minWidth: 80, flex: '0 1 90px' }}>
          <span style={lab}>Beams</span>
          <Num v={steel.beams} set={n => set({ beams: Math.round(n) })} min={0} max={4} />
        </div>
        <div style={cell}>
          <span style={lab}>What is above</span>
          <select value={steel.loadAbove} onChange={e => set({ loadAbove: e.target.value as LoadAbove })} style={miniInput}>
            {(Object.keys(LOAD_LABEL) as LoadAbove[]).map(k => <option key={k} value={k}>{LOAD_LABEL[k]}</option>)}
          </select>
        </div>
        <div style={cell}>
          <span style={lab}>Supplied and fixed by</span>
          <select value={steel.steelBy} onChange={e => set({ steelBy: e.target.value as SteelBy })} style={miniInput}>
            <option value="us">We supply and set it</option>
            <option value="sub">A steelwork contractor (subcontract)</option>
          </select>
        </div>
        <div style={cell}>
          <span style={lab}>Fire protection to the steel</span>
          <select value={steel.finish} onChange={e => set({ finish: e.target.value as SteelFinish })} style={miniInput}>
            {(Object.keys(FINISH_LABEL) as SteelFinish[]).map(k => <option key={k} value={k}>{FINISH_LABEL[k]}</option>)}
          </select>
        </div>
        <div style={{ ...cell, minWidth: 80, flex: '0 1 110px' }}>
          <span style={lab}>Padstones</span>
          <input type="number" min={0} max={20} value={steel.padstones ?? ''} placeholder="usual" onChange={e => set({ padstones: e.target.value === '' ? null : Math.max(0, Math.round(+e.target.value) || 0) })} style={miniInput} title="Blank = two for each beam, less one for each post that carries a beam end" />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
        <input type="checkbox" checked={steel.hiab} onChange={e => set({ hiab: e.target.checked })} style={{ width: 'auto' }} /> A Hiab or lorry crane lifts the steel in
      </label>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ ...cell, minWidth: 80, flex: '0 1 90px' }}>
          <span style={lab}>Steel posts</span>
          <Num v={steel.posts} set={n => set({ posts: Math.round(n) })} min={0} max={6} />
        </div>
        {steel.posts > 0 && (
          <>
            <div style={cell}>
              <span style={lab}>The posts</span>
              <select value={steel.postRole} onChange={e => set({ postRole: e.target.value as PostRole })} style={miniInput}>
                {(Object.keys(POST_ROLE_LABEL) as PostRole[]).map(k => <option key={k} value={k}>{POST_ROLE_LABEL[k]}</option>)}
              </select>
            </div>
            <div style={cell}>
              <span style={lab}>Post section</span>
              <select value={steel.postSection} onChange={e => set({ postSection: e.target.value })} style={miniInput}>
                {POST_SECTIONS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
              </select>
            </div>
            <div style={{ ...cell, minWidth: 90, flex: '0 1 110px' }}>
              <span style={lab}>Post height (mm)</span>
              <Num v={steel.postHeightMm} set={n => set({ postHeightMm: Math.max(300, n) })} min={300} max={6000} step={50} />
            </div>
          </>
        )}
      </div>

      <BeamPlateFields plate={steel.plate} onChange={plate => set({ plate })} wallMm={wallMm} beamLengthM={beamLengthM} beams={Math.max(1, steel.beams)} />

      <div>
        <span style={lab}>Connections and fabrications</span>
        {steel.connections.length === 0 && <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 4 }}>None. Add end plates, cleats, splices, stiffeners or fabrication hours.</div>}
        {steel.connections.map((c, i) => {
          const info = CONNECTION_BY_ID[c.kind]
          return (
            <div key={c.kind} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 12, flex: 1 }}>{info?.label ?? c.kind}</span>
              <div style={{ width: 70 }}><Num v={c.qty} set={n => set({ connections: steel.connections.map((q, j) => (j === i ? { ...q, qty: info?.unit === 'h' ? Math.round(n * 2) / 2 : Math.round(n) } : q)).filter(q => q.qty > 0) })} min={0} max={99} step={info?.unit === 'h' ? 0.5 : 1} /></div>
              <span style={{ fontSize: 11, color: '#64748b', width: 24 }}>{info?.unit === 'h' ? 'h' : 'nr'}</span>
              <button type="button" onClick={() => set({ connections: steel.connections.filter((_, j) => j !== i) })} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )
        })}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value="" onChange={e => { const k = e.target.value; if (k && !steel.connections.some(c => c.kind === k)) { const info = CONNECTION_BY_ID[k]; set({ connections: [...steel.connections, { kind: info.id, qty: info.unit === 'h' ? 2 : 2 * Math.max(1, steel.beams) }] }) } }} style={{ ...miniInput, width: 260 }}>
            <option value="">+ Add a connection or fabrication…</option>
            {free.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          {steel.beams > 0 && steel.posts > 0 && steel.postRole === 'ends' && steel.connections.length === 0 && (
            <button type="button" onClick={() => set({ connections: usualConnections(steel.beams, steel.posts, steel.postRole) })} style={{ ...miniInput, width: 'auto', cursor: 'pointer', padding: '3px 8px' }}>Add the usual: an end plate at each beam end</button>
          )}
        </div>
      </div>
    </div>
  )
}
