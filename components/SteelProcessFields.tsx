'use client'

/**
 * Fabrication processes on a steel member, the way a steel merchant's beam calculator offers them: holes in the web or flange, mitre cuts, notches, cleats, bearing stiffeners, splice plates, shot blasting and other
 * fabrication by the hour. Pick one from the list to add it; each says how many and, where it matters, the size or angle. Used by the Steel Beams, Columns & Posts calculator and the steel inside a wall calculator; the sums
 * are in lib/steel-processes.ts and the engine (lib/structural-steel-units.ts).
 */

import React from 'react'
import { miniInput } from '@/components/assembly-ui'
import { PROCESS_BY_ID, HOLE_DIAMETERS, processesFor, newProcess, type MemberProcess, type ProcessSteel, type ProcessKind } from '@/lib/steel-processes'

const lab: React.CSSProperties = { fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 }
const box: React.CSSProperties = { display: 'flex', flexDirection: 'column' }
const uid = () => Math.random().toString(36).slice(2, 8)

function Num({ v, set, min, max, step = 1, width }: { v: number; set: (n: number) => void; min: number; max: number; step?: number; width: number }) {
  return <input type="number" value={v} min={min} max={max} step={step} onChange={e => { const n = +e.target.value; if (e.target.value !== '' && Number.isFinite(n)) set(Math.min(max, Math.max(min, n))) }} style={{ ...miniInput, width }} />
}

export default function SteelProcessFields({ processes, onChange, steel }: {
  processes: MemberProcess[]
  onChange: (p: MemberProcess[]) => void
  /** the kind of steel member: some processes only go on a beam, or make no sense on a hollow section */
  steel: ProcessSteel
}) {
  const free = processesFor(steel).filter(i => !processes.some(p => p.kind === i.id))
  const setOne = (id: string, patch: Partial<MemberProcess>) => onChange(processes.map(p => (p.id === id ? { ...p, ...patch } : p)))
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 8px', marginTop: 6 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Processes (fabrication)</div>
      {processes.length === 0 && <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 4 }}>None. Add drilled holes, mitre cuts, notches, cleats, stiffeners, splices, shot blasting or other work by the fabricator.</div>}
      {processes.map(p => {
        const info = PROCESS_BY_ID[p.kind]
        if (!info) return null
        return (
          <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 6, paddingBottom: 6, borderBottom: '1px dashed #e2e8f0' }}>
            <div style={{ ...box, flex: '1 1 170px', minWidth: 150 }}>
              <span style={lab}>{info.label}</span>
              <span style={{ fontSize: 10.5, color: '#64748b', lineHeight: 1.35 }}>{info.help}</span>
            </div>
            {p.kind === 'holes' && (
              <>
                <div style={box}><span style={lab}>Holes each</span><Num v={p.count} set={n => setOne(p.id, { count: Math.round(n) })} min={1} max={500} width={64} /></div>
                <div style={box}>
                  <span style={lab}>Diameter (mm)</span>
                  <select value={p.diaMm ?? 22} onChange={e => setOne(p.id, { diaMm: +e.target.value })} style={{ ...miniInput, width: 80 }}>
                    {!HOLE_DIAMETERS.includes(p.diaMm ?? 22) && <option value={p.diaMm}>{p.diaMm}</option>}
                    {HOLE_DIAMETERS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                {steel !== 'hollow' && (
                  <div style={box}>
                    <span style={lab}>In the</span>
                    <select value={p.where ?? 'web'} onChange={e => setOne(p.id, { where: e.target.value === 'flange' ? 'flange' : 'web' })} style={{ ...miniInput, width: 90 }}>
                      <option value="web">Web</option><option value="flange">Flange</option>
                    </select>
                  </div>
                )}
              </>
            )}
            {p.kind === 'mitre' && (
              <>
                <div style={box}><span style={lab}>Cuts each</span><Num v={p.count} set={n => setOne(p.id, { count: Math.round(n) })} min={1} max={4} width={64} /></div>
                <div style={box}><span style={lab}>Angle (°)</span><Num v={p.angleDeg ?? 45} set={n => setOne(p.id, { angleDeg: n })} min={1} max={89} step={0.5} width={72} /></div>
              </>
            )}
            {(p.kind === 'notch' || p.kind === 'cleat' || p.kind === 'stiffener' || p.kind === 'splice') && (
              <div style={box}><span style={lab}>{info.unitWord === 'pair' ? 'Pairs each' : `${info.unitWord[0].toUpperCase()}${info.unitWord.slice(1)}s each`}</span><Num v={p.count} set={n => setOne(p.id, { count: Math.round(n) })} min={1} max={500} width={64} /></div>
            )}
            {p.kind === 'other' && (
              <>
                <div style={box}><span style={lab}>Hours each</span><Num v={p.count} set={n => setOne(p.id, { count: Math.round(n * 2) / 2 || 0.5 })} min={0.5} max={200} step={0.5} width={72} /></div>
                <div style={box}><span style={lab}>Steel / fittings £ each</span><Num v={p.material ?? 0} set={n => setOne(p.id, { material: n })} min={0} max={10000} step={5} width={90} /></div>
                <div style={{ ...box, flex: '1 1 140px' }}><span style={lab}>What it is</span><input value={p.note ?? ''} maxLength={80} onChange={e => setOne(p.id, { note: e.target.value })} placeholder="e.g. camber the beam" style={miniInput} /></div>
              </>
            )}
            <button type="button" onClick={() => onChange(processes.filter(x => x.id !== p.id))} title="Remove this process" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, paddingBottom: 4 }}>×</button>
          </div>
        )
      })}
      {free.length > 0 && (
        <select value="" onChange={e => { const kind = e.target.value as ProcessKind; if (kind) onChange([...processes, newProcess('p-' + uid(), kind, steel)]) }} style={{ ...miniInput, width: 280 }}>
          <option value="">+ Add a process…</option>
          {free.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>
      )}
      {processes.length > 0 && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>Priced as the fabricator&apos;s time (plus the steel or fittings where they add some): sample figures to check against a real quote. The engineer approves the position and size of holes, notches and splices.</div>}
    </div>
  )
}
