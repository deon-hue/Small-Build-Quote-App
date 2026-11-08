'use client'

/**
 * Take-off: the Structural Frame side panel for structural openings. Click a wall on the plan to put a structural opening in it (the ⊞ tool: the wall is cut, the opening is drawn with its steel beam and posts, and
 * the wall's area is reduced, as with a window or a door), then choose the beam from the steel sections and add its connections in the Structural Openings calculator (the card at the foot), which keeps its
 * openings in step with the plan until a value is typed over. Here too: editing one selected opening (reference, room, size, where along the wall it is).
 * The openings themselves live in the same list as the doors and windows (on the "Windows and doors" Take-off item, with kind 'structural'); the calculator's own item is the "Structural openings" one. This component only shows and edits them.
 */

import React, { useEffect, useState } from 'react'
import AssemblyItemPanel from './AssemblyWindow'
import LocationInput from '@/components/LocationInput'
import type { PlacedOpening, PlacedStruct } from '@/lib/wall-openings'
import { BEAM_CHOICES, POST_SECTIONS, PLATE_THICKNESSES, PLATE_WIDTHS, CONNECTION_KINDS, CONNECTION_BY_ID, LOAD_LABEL, POST_ROLE_LABEL, beamFor, usualConnections } from '@/lib/structural-openings-units'
import type { CostedLine } from '@/lib/assembly-calc'

interface Props {
  /** the structural openings on the plan */
  openings: PlacedOpening[]
  placing: boolean
  onPlacing: (on: boolean) => void
  widthMm: number
  heightMm: number
  onNext: (patch: { widthMm?: number; heightMm?: number }) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, patch: Partial<PlacedOpening>) => void
  onDelete: (id: string) => void
  /** where the selected opening's centre is along its wall, in mm, and how long that wall is */
  selectedAlong?: { mm: number; wallMm: number }
  onMoveAlong: (id: string, mm: number) => void
  onCentre: (id: string) => void
  /** the steel the calculator holds for an opening: the beam section, how many beams and posts, how many connections */
  steelOf: (id: string) => { section: string; beams: number; posts: number; postRole: 'ends' | 'mid'; connections: number; choice: string; load: 'light' | 'floor' | 'heavy'; conns: { kind: string; qty: number }[]; plate: NonNullable<PlacedStruct['plate']> | null } | undefined
  /** a change to the steel chosen for an opening: the beam section, how many beams and posts, what is above, the connections */
  onSteel: (id: string, patch: PlacedStruct) => void
  /** the calculator's card: what it measures, its saved price, whether the plan has changed since, and the calculator itself */
  card: { measureText: string; saved?: { lines: CostedLine[]; location?: string }; stale?: boolean; open: boolean; onOpen: () => void; onClose: () => void; calculator: React.ReactNode }
}

const STEEL = '#1d4ed8'
const box: React.CSSProperties = { background: 'var(--to-alt)', border: '1px solid var(--to-border)', borderRadius: 8, padding: 10, marginBottom: 10 }
const label: React.CSSProperties = { fontSize: 10, color: 'var(--to-dim, #8aa08a)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 7px', background: 'var(--to-bg)', color: 'var(--to-text)', border: '1px solid var(--to-border)', borderRadius: 5 }
const tiny: React.CSSProperties = { fontSize: 10.5, color: 'var(--to-muted)', marginBottom: 2 }

/** A number typed digit by digit: what is typed stays as typed while it is not yet a sensible number, and a new value from outside replaces it */
function Num({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  const [text, setText] = useState(String(Math.round(value * 10) / 10))
  useEffect(() => { setText(String(Math.round(value * 10) / 10)) }, [value])
  return (
    <div style={{ position: 'relative' }}>
      <input value={text} inputMode="decimal" onChange={e => { setText(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) onChange(n) }} style={{ ...input, paddingRight: suffix ? 30 : 7 }} />
      {suffix && <span style={{ position: 'absolute', right: 7, top: 6, fontSize: 10.5, color: 'var(--to-muted)', pointerEvents: 'none' }}>{suffix}</span>}
    </div>
  )
}

export default function StructOpeningsPanel(p: Props) {
  const selected = p.openings.find(o => o.id === p.selectedId) ?? null
  const steel = selected ? p.steelOf(selected.id) : undefined
  return (
    <div style={{ padding: 10 }} data-testid="struct-openings-panel">
      <div style={box}>
        <div style={label}>Structural openings</div>
        <div style={{ fontSize: 11.5, color: 'var(--to-text)', lineHeight: 1.5, marginBottom: 8 }}>
          An opening cut in a wall with a steel beam over it. Click a wall on the plan to put one in it: the wall is cut and its area reduced, like a window or a door. Then choose the beam from the steel sections, and add its posts and connections, in the calculator below.
        </div>
        <button type="button" onClick={() => p.onPlacing(!p.placing)} style={{ width: '100%', padding: '7px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, cursor: 'pointer', border: `1px solid ${STEEL}`, background: p.placing ? STEEL : 'transparent', color: p.placing ? '#fff' : STEEL }}>
          {p.placing ? '✓ Placing: click a wall (press to stop)' : 'Place a structural opening'}
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
          <div><div style={tiny}>Next one, width</div><Num value={p.widthMm} onChange={n => p.onNext({ widthMm: n })} suffix="mm" /></div>
          <div><div style={tiny}>Next one, height</div><Num value={p.heightMm} onChange={n => p.onNext({ heightMm: n })} suffix="mm" /></div>
        </div>
      </div>

      <div style={box}>
        <div style={label}>On the plan — {p.openings.length}</div>
        {p.openings.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--to-muted)' }}>None yet. Draw the walls first (External Walls, Internal Walls &amp; Partitions), then click one.</div>}
        {p.openings.map(o => {
          const on = o.id === p.selectedId
          const st = p.steelOf(o.id)
          return (
            <div key={o.id} onClick={() => p.onSelect(on ? null : o.id)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '4px 4px', borderBottom: '1px solid var(--to-blt, var(--to-border))', cursor: 'pointer', fontSize: 11.5, background: on ? 'rgba(29,78,216,0.12)' : 'transparent', borderRadius: 4 }}>
              <span><strong style={{ color: STEEL }}>{o.ref}</strong>{o.location ? ` · ${o.location}` : ''}{st?.section ? ` · ${st.section}` : ''}</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--to-muted)', whiteSpace: 'nowrap' }}>{o.widthMm}×{o.heightMm}</span>
            </div>
          )
        })}
      </div>

      {selected && (
        <div style={{ ...box, borderColor: STEEL }}>
          <div style={label}>Selected: {selected.ref}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div><div style={tiny}>Reference</div><input value={selected.ref} onChange={e => p.onUpdate(selected.id, { ref: e.target.value })} style={input} /></div>
              <div><div style={tiny}>Room / wall</div><LocationInput value={selected.location ?? ''} onChange={v => p.onUpdate(selected.id, { location: v })} placeholder="e.g. Kitchen to dining" style={input} /></div>
              <div><div style={tiny}>Width (the span)</div><Num value={selected.widthMm} onChange={n => p.onUpdate(selected.id, { widthMm: n })} suffix="mm" /></div>
              <div><div style={tiny}>Height</div><Num value={selected.heightMm} onChange={n => p.onUpdate(selected.id, { heightMm: n })} suffix="mm" /></div>
            </div>
            {steel && (
              <div style={{ background: 'rgba(29,78,216,0.08)', border: `1px solid ${STEEL}`, borderRadius: 6, padding: '8px' }} data-testid="struct-steel">
                <div style={{ ...label, color: STEEL }}>The steel beam</div>
                <div style={tiny}>Beam section (from the steel beam sections)</div>
                <select value={steel.choice} onChange={e => p.onSteel(selected.id, { section: e.target.value })} style={input}>
                  <option value="auto">{`Pick from the span: ${beamFor(selected.widthMm / 1000 / (steel.postRole === 'mid' && steel.posts > 0 ? steel.posts + 1 : 1), steel.load).section.label}`}</option>
                  {BEAM_CHOICES.map(b => <option key={b.label} value={b.label}>{b.label} ({b.kgPerM} kg/m)</option>)}
                </select>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 6 }}>
                  <div><div style={tiny}>Beams (a pair for a thick wall)</div>
                    <select value={steel.beams} onChange={e => p.onSteel(selected.id, { beams: Number(e.target.value) })} style={input}>{[0, 1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                  <div><div style={tiny}>Steel posts</div>
                    <select value={steel.posts} onChange={e => p.onSteel(selected.id, { posts: Number(e.target.value) })} style={input}>{[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
                </div>
                <div style={{ marginTop: 6 }}><div style={tiny}>What is above it</div>
                  <select value={steel.load} onChange={e => p.onSteel(selected.id, { loadAbove: e.target.value as 'light' | 'floor' | 'heavy' })} style={input}>
                    {(Object.keys(LOAD_LABEL) as ('light' | 'floor' | 'heavy')[]).map(k => <option key={k} value={k}>{LOAD_LABEL[k]}</option>)}
                  </select></div>
                {steel.posts > 0 && steel.beams > 0 && (
                  <div style={{ marginTop: 6 }}><div style={tiny}>What the posts do</div>
                    <select value={steel.postRole} onChange={e => p.onSteel(selected.id, { postRole: e.target.value as 'ends' | 'mid' })} style={input}>
                      {(Object.keys(POST_ROLE_LABEL) as ('ends' | 'mid')[]).map(k => <option key={k} value={k}>{POST_ROLE_LABEL[k]}</option>)}
                    </select></div>
                )}
                {steel.posts > 0 && <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 4 }}>Post section ({POST_SECTIONS[0].label} to start), pads and the rest are in the calculator.</div>}

                {steel.beams > 0 && (
                  <>
                    <div style={{ ...label, color: STEEL, marginTop: 10 }}>Welded plate (spreads the load over the wall)</div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!steel.plate} onChange={e => p.onSteel(selected.id, { plate: e.target.checked ? { position: 'bottom', thicknessMm: 10, widthMm: null, lengthMm: null } : null })} />
                      Weld a plate to the beam
                    </label>
                    {steel.plate && (() => {
                      const pl = steel.plate
                      const setPl = (patch: Partial<typeof pl>) => p.onSteel(selected.id, { plate: { ...pl, ...patch } })
                      return (
                        <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                          <div><div style={tiny}>Where it is welded</div>
                            <select value={pl.position} onChange={e => setPl({ position: e.target.value as 'bottom' | 'top' | 'both' })} style={input}>
                              <option value="bottom">The bottom of the beam</option><option value="top">The top of the beam</option><option value="both">The top and the bottom</option>
                            </select></div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <div><div style={tiny}>Thickness (mm)</div>
                              <input type="number" min={1} list="plate-thk" value={pl.thicknessMm} onChange={e => { const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) setPl({ thicknessMm: n }) }} style={input} />
                              <datalist id="plate-thk">{PLATE_THICKNESSES.map(t => <option key={t} value={t} />)}</datalist></div>
                            <div><div style={tiny}>Width (mm)</div>
                              <input type="number" min={1} list="plate-wid" placeholder="the wall" value={pl.widthMm ?? ''} onChange={e => { const n = parseFloat(e.target.value); setPl({ widthMm: Number.isFinite(n) && n > 0 ? n : null }) }} style={input} />
                              <datalist id="plate-wid">{PLATE_WIDTHS.map(w => <option key={w} value={w} />)}</datalist></div>
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--to-muted)' }}>Leave the width empty for as wide as the wall; set it to suit the cavity (for example 300). Length: the whole beam (change it in the calculator).</div>
                        </div>
                      )
                    })()}
                  </>
                )}
                <div style={{ ...label, color: STEEL, marginTop: 10 }}>Connections and fabrications</div>
                {steel.conns.length === 0 && <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 4 }}>None added.</div>}
                {steel.conns.map((c, i) => {
                  const info = CONNECTION_BY_ID[c.kind]
                  return (
                    <div key={c.kind + i} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <span style={{ flex: 1, fontSize: 11.5 }}>{info ? info.label.split(' (')[0] : c.kind}</span>
                      <input type="number" min={0} step={info?.unit === 'h' ? 0.5 : 1} value={c.qty} onChange={e => { const n = parseFloat(e.target.value); if (Number.isFinite(n) && n >= 0) p.onSteel(selected.id, { connections: steel.conns.map((q, j) => (j === i ? { ...q, qty: n } : q)) }) }} style={{ ...input, width: 58 }} />
                      <span style={{ fontSize: 10.5, color: 'var(--to-muted)', width: 34 }}>{info?.unit === 'h' ? 'hours' : 'each'}</span>
                      <button type="button" onClick={() => p.onSteel(selected.id, { connections: steel.conns.filter((_, j) => j !== i) })} title="Remove" style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>×</button>
                    </div>
                  )
                })}
                <select value="" onChange={e => { const k = e.target.value; if (!k || steel.conns.some(c => c.kind === k)) return; p.onSteel(selected.id, { connections: [...steel.conns, { kind: k, qty: k === 'fabrication' ? 2 : Math.max(1, steel.beams * 2) }] }) }} style={input}>
                  <option value="">+ Add a connection or fabrication…</option>
                  {CONNECTION_KINDS.filter(k => !steel.conns.some(c => c.kind === k.id)).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                {steel.conns.length === 0 && steel.beams > 0 && steel.posts > 0 && steel.postRole === 'ends' && (
                  <button type="button" onClick={() => p.onSteel(selected.id, { connections: usualConnections(steel.beams, steel.posts, steel.postRole) })} style={{ marginTop: 5, width: '100%', padding: '5px', fontSize: 11.5, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'transparent', color: 'var(--to-text)' }}>Add the usual: an end plate at each beam end</button>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 6, lineHeight: 1.4 }}>Sections are indicative: the engineer designs the real steel and connections. The calculator below prices all of this and has the rest (pads, props, fire protection).</div>
                <button type="button" onClick={p.card.onOpen} style={{ marginTop: 6, padding: '5px 9px', fontSize: 12, fontWeight: 700, borderRadius: 5, cursor: 'pointer', border: `1px solid ${STEEL}`, background: STEEL, color: '#fff' }}>Open the calculator…</button>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--to-text)', cursor: 'pointer' }} title="It stays in the wall as a drawing (the wall still has the opening), but it is not given to the calculator, so it is not priced.">
              <input type="checkbox" checked={!!selected.notEstimated} onChange={e => p.onUpdate(selected.id, { notEstimated: e.target.checked || undefined })} />
              Not estimated (a drawing only)
            </label>
            {p.selectedAlong && (
              <div>
                <div style={tiny}>Centre of the opening, along its wall (the wall is {(p.selectedAlong.wallMm / 1000).toFixed(2)} m)</div>
                <Num value={p.selectedAlong.mm} onChange={n => p.onMoveAlong(selected.id, n)} suffix="mm" />
                <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 3 }}>Or drag it along the wall on the plan (Select tool).</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => p.onCentre(selected.id)} title="Put it in the middle of its side of the wall" style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'transparent', color: 'var(--to-text)' }}>↔ Centre on the wall</button>
              <button type="button" onClick={() => p.onSelect(null)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'transparent', color: 'var(--to-text)' }}>Done</button>
              <button type="button" onClick={() => p.onDelete(selected.id)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid #c0392b', background: '#c0392b', color: '#fff' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {p.card.saved && p.card.stale && (
        <div style={{ fontSize: 11.5, color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid #d97706', borderRadius: 6, padding: '6px 9px', marginBottom: 8, lineHeight: 1.4 }}>
          ⚠ The structural openings on the plan have changed since they were priced. Open the calculator and press Save &amp; Price again.
        </div>
      )}
      <AssemblyItemPanel name="Structural openings" lengthM={0} measureLabel="On the plan" measureText={p.card.measureText} saved={p.card.saved} open={p.card.open} onOpen={p.card.onOpen} onClose={p.card.onClose}>
        {p.card.calculator}
      </AssemblyItemPanel>
    </div>
  )
}
