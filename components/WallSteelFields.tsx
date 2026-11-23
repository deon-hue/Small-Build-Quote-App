'use client'

/**
 * The steel over an opening in a wall calculator, set up with the Steel Beams, Columns & Posts calculator's own options: a short list of members (steel beams, steel columns, box section posts, engineered timber beams, timber posts),
 * each with its section, length, number, finish, how its ends are held, plate welded on, padstones or pad and who supplies it. The sums are that calculator's engine's (lib/wall-steel.ts), so a member costs what it costs there.
 */

import React from 'react'
import { miniInput } from '@/components/assembly-ui'
import BeamPlateFields from '@/components/BeamPlateFields'
import { MEMBER_KINDS, KIND_BY_ID, sectionsFor, FINISH_LABEL, ENDS_LABEL, BY_LABEL, type MemberKind, type MemberFinish, type MemberEnds, type MemberBy } from '@/lib/structural-steel-units'
import { CONNECTION_KINDS, CONNECTION_BY_ID, LOAD_LABEL, beamFor, type LoadAbove } from '@/lib/structural-openings-units'
import { newWallMember, BEARING_EACH_END_MM, type WallSteel, type WallMember } from '@/lib/wall-steel'

const lab: React.CSSProperties = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }
const cell: React.CSSProperties = { display: 'flex', flexDirection: 'column', minWidth: 120, flex: '1 1 140px' }
const small: React.CSSProperties = { ...miniInput, width: 'auto', cursor: 'pointer', padding: '3px 8px' }

function Num({ v, set, min = 0, max = 99, step = 1, placeholder }: { v: number | null; set: (n: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return <input type="number" value={v ?? ''} min={min} max={max} step={step} placeholder={placeholder} onChange={e => { if (e.target.value === '') return set(null); const n = +e.target.value; if (Number.isFinite(n)) set(Math.min(max, Math.max(min, n))) }} style={miniInput} />
}

export default function WallSteelFields({ steel, onChange, widthMm, heightMm, wallMm, summary }: {
  steel: WallSteel
  onChange: (s: WallSteel) => void
  /** the opening's clear width and height, mm */
  widthMm: number
  heightMm: number
  /** the whole wall's thickness, mm (a plate is as wide as it by default) */
  wallMm: number
  /** what the engine made of it: the first beam's section and the weight of steel */
  summary?: { beamLabel: string; steelKg: number }
}) {
  const set = (patch: Partial<WallSteel>) => onChange({ ...steel, ...patch })
  const setMember = (id: string, patch: Partial<WallMember>) => set({ members: steel.members.map(m => (m.id === id ? { ...m, ...patch } : m)) })
  const spanM = widthMm / 1000
  const sug = beamFor(spanM, steel.loadAbove)
  const free = CONNECTION_KINDS.filter(k => !steel.connections.some(c => c.kind === k.id))
  const addMember = (kind: MemberKind) => set({ members: [...steel.members, newWallMember(kind)].slice(0, 8) })
  return (
    <div style={{ flexBasis: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 8px 10px', display: 'grid', gap: 8 }}>
      <div style={{ fontSize: 11, color: '#475569', lineHeight: 1.5 }}>
        <b>Steel from the Steel Beams, Columns &amp; Posts calculator.</b> Add the beams, columns, box section posts or timber beams that go over and beside this opening; they are priced the way that calculator prices them, and the wall adds only its own cavity tray and weeps. The sections are the designer&apos;s: these are samples to price from.
        {summary?.steelKg ? <> Now: {summary.beamLabel ? <b>{summary.beamLabel}</b> : 'steel'}, about {summary.steelKg}kg of steel in all.</> : null}
      </div>

      {steel.members.length === 0 && <div style={{ fontSize: 11.5, color: '#64748b' }}>No steel yet. Add a beam, column or post below.</div>}
      {steel.members.map(m => {
        const k = KIND_BY_ID[m.kind]
        const ownLength = m.lengthMm ?? (k.post ? heightMm : widthMm + 2 * BEARING_EACH_END_MM)
        return (
          <div key={m.id} style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', padding: 8, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={cell}>
                <span style={lab}>Kind</span>
                <select value={m.kind} onChange={e => { const nk = e.target.value as MemberKind; const d = newWallMember(nk); onChange({ ...steel, members: steel.members.map(x => (x.id === m.id ? { ...d, id: m.id, qty: m.qty } : x)) }) }} style={miniInput}>
                  {MEMBER_KINDS.map(kk => <option key={kk.id} value={kk.id}>{kk.label}</option>)}
                </select>
              </div>
              <div style={cell}>
                <span style={lab}>Section</span>
                <select value={m.section} onChange={e => setMember(m.id, { section: e.target.value })} style={miniInput}>
                  {m.kind === 'beam' && <option value="auto">Pick from the span ({sug.section.label})</option>}
                  {sectionsFor(m.kind).map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                </select>
              </div>
              <div style={{ ...cell, minWidth: 70, flex: '0 1 80px' }}>
                <span style={lab}>Number</span>
                <Num v={m.qty} set={n => setMember(m.id, { qty: Math.max(1, Math.round(n ?? 1)) })} min={1} max={20} />
              </div>
              <div style={{ ...cell, minWidth: 110, flex: '0 1 130px' }}>
                <span style={lab}>{k.post ? 'Height (mm)' : 'Length (mm)'}</span>
                <Num v={m.lengthMm} set={n => setMember(m.id, { lengthMm: n })} min={100} max={20000} step={50} placeholder={`${ownLength} (the opening)`} />
              </div>
              <button type="button" onClick={() => set({ members: steel.members.filter(x => x.id !== m.id) })} title="Remove this member" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 18, lineHeight: 1, paddingBottom: 4 }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {k.steel && (
                <div style={cell}>
                  <span style={lab}>Finish</span>
                  <select value={m.finish} onChange={e => setMember(m.id, { finish: e.target.value as MemberFinish })} style={miniInput}>
                    {(Object.keys(FINISH_LABEL) as MemberFinish[]).map(f => <option key={f} value={f}>{FINISH_LABEL[f]}</option>)}
                  </select>
                </div>
              )}
              {k.steel && (
                <div style={cell}>
                  <span style={lab}>Supplied and fixed by</span>
                  <select value={m.by} onChange={e => setMember(m.id, { by: e.target.value as MemberBy })} style={miniInput}>
                    {(Object.keys(BY_LABEL) as MemberBy[]).map(b => <option key={b} value={b}>{BY_LABEL[b]}</option>)}
                  </select>
                </div>
              )}
              {!k.post && (
                <div style={cell}>
                  <span style={lab}>How the ends are held</span>
                  <select value={m.ends} onChange={e => setMember(m.id, { ends: e.target.value as MemberEnds })} style={miniInput}>
                    {(Object.keys(ENDS_LABEL) as MemberEnds[]).map(en => <option key={en} value={en}>{ENDS_LABEL[en]}</option>)}
                  </select>
                </div>
              )}
              {!k.post && m.ends === 'masonry' && (
                <div style={{ ...cell, minWidth: 80, flex: '0 1 110px' }}>
                  <span style={lab}>Padstones</span>
                  <Num v={m.padstones} set={n => setMember(m.id, { padstones: n === null ? null : Math.round(n) })} min={0} max={20} placeholder="usual" />
                </div>
              )}
            </div>
            {k.post && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                  <input type="checkbox" checked={m.pad} onChange={e => setMember(m.id, { pad: e.target.checked })} style={{ width: 'auto' }} /> On a concrete pad
                </label>
                {m.pad && (['padLengthMm', 'padWidthMm', 'padDepthMm'] as const).map((key, i) => (
                  <div key={key} style={{ ...cell, minWidth: 80, flex: '0 1 100px' }}>
                    <span style={lab}>Pad {['length', 'width', 'depth'][i]} (mm)</span>
                    <Num v={m[key]} set={n => setMember(m.id, { [key]: Math.max(100, n ?? 100) })} min={100} max={3000} step={50} />
                  </div>
                ))}
              </div>
            )}
            {k.steel && k.post && <BeamPlateFields plate={m.plate} onChange={plate => setMember(m.id, { plate })} post />}
            {m.kind === 'beam' && (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer' }}>
                  <input type="checkbox" checked={m.propped} onChange={e => setMember(m.id, { propped: e.target.checked })} style={{ width: 'auto' }} /> Needles and Acrow props while it is fixed
                </label>
                <BeamPlateFields plate={m.plate} onChange={plate => setMember(m.id, { plate })} wallMm={wallMm} beamLengthM={ownLength / 1000} beams={m.qty} />
              </>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" onClick={() => addMember('beam')} style={small}>+ Steel beam</button>
        <button type="button" onClick={() => addMember('column')} style={small}>+ Steel column</button>
        <button type="button" onClick={() => addMember('hollow')} style={small}>+ Box section post</button>
        <button type="button" onClick={() => addMember('lvl')} style={small}>+ Timber beam</button>
        <button type="button" onClick={() => addMember('timber-post')} style={small}>+ Timber post</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={cell}>
          <span style={lab}>What is above (for picking a beam from the span)</span>
          <select value={steel.loadAbove} onChange={e => set({ loadAbove: e.target.value as LoadAbove })} style={miniInput}>
            {(Object.keys(LOAD_LABEL) as LoadAbove[]).map(l => <option key={l} value={l}>{LOAD_LABEL[l]}</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', paddingBottom: 4 }}>
          <input type="checkbox" checked={steel.hiab} onChange={e => set({ hiab: e.target.checked })} style={{ width: 'auto' }} /> A Hiab or lorry crane lifts the steel in
        </label>
      </div>

      <div>
        <span style={lab}>Connections and fabrications (extra)</span>
        {steel.connections.length === 0 && <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 4 }}>None. Add end plates, cleats, splices, stiffeners or fabrication hours.</div>}
        {steel.connections.map((c, i) => {
          const info = CONNECTION_BY_ID[c.kind]
          return (
            <div key={c.kind} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 12, flex: 1 }}>{info?.label ?? c.kind}</span>
              <div style={{ width: 70 }}><Num v={c.qty} set={n => set({ connections: steel.connections.map((q, j) => (j === i ? { ...q, qty: info?.unit === 'h' ? Math.round((n ?? 0) * 2) / 2 : Math.round(n ?? 0) } : q)).filter(q => q.qty > 0) })} min={0} max={99} step={info?.unit === 'h' ? 0.5 : 1} /></div>
              <span style={{ fontSize: 11, color: '#64748b', width: 24 }}>{info?.unit === 'h' ? 'h' : 'nr'}</span>
              <button type="button" onClick={() => set({ connections: steel.connections.filter((_, j) => j !== i) })} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
          )
        })}
        <select value="" onChange={e => { const kk = e.target.value; if (kk && !steel.connections.some(c => c.kind === kk)) { const info = CONNECTION_BY_ID[kk]; set({ connections: [...steel.connections, { kind: info.id, qty: info.unit === 'h' ? 2 : 2 }] }) } }} style={{ ...miniInput, width: 260 }}>
          <option value="">+ Add a connection or fabrication…</option>
          {free.map(kk => <option key={kk.id} value={kk.id}>{kk.label}</option>)}
        </select>
      </div>
    </div>
  )
}
