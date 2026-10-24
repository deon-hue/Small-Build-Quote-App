'use client'

/**
 * Take-off: the Windows & Doors side panel. Pick a kind of window or door, click a wall on the plan to put it in (the ⊞ tool: the wall is cut, the window or the door with its swing is drawn), and the openings are listed here and
 * fed into the Windows & Doors calculator, which keeps its openings in step with the plan until one is typed over. Here too: editing one selected opening (kind, size, which way it swings, where along the wall it is) and the
 * calculator's summary card with its full-size window (AssemblyItemPanel).
 * The openings themselves live on the "Windows and doors" Take-off item (so they save with the project); this component only shows and edits them.
 */

import React, { useEffect, useState } from 'react'
import AssemblyItemPanel from './AssemblyWindow'
import { KINDS, KIND_BY_ID, SWING_LABEL, type OpeningKind, type WdSwing } from '@/lib/wd-units'
import { hasSwing, type PlacedOpening } from '@/lib/wall-openings'
import type { CostedLine } from '@/lib/assembly-calc'

const GROUPS = ['Windows', 'External doors', 'Internal doors'] as const
const GROUP_COLOUR: Record<(typeof GROUPS)[number], string> = { Windows: '#2b6cb0', 'External doors': '#7c3aed', 'Internal doors': '#b45309' }
const SWINGS = Object.keys(SWING_LABEL) as WdSwing[]

interface Props {
  openings: PlacedOpening[]
  placing: boolean
  onPlacing: (on: boolean) => void
  kind: OpeningKind
  onKind: (k: OpeningKind) => void
  widthMm: number
  heightMm: number
  swing: WdSwing
  onNext: (patch: { widthMm?: number; heightMm?: number; swing?: WdSwing }) => void
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, patch: Partial<PlacedOpening>) => void
  onDelete: (id: string) => void
  /** where the selected opening's centre is along its wall, in mm, and how long that wall is */
  selectedAlong?: { mm: number; wallMm: number }
  onMoveAlong: (id: string, mm: number) => void
  saved?: { lines: CostedLine[]; location?: string }
  stale?: boolean
  calculatorOpen: boolean
  onOpenCalculator: () => void
  onCloseCalculator: () => void
  /** the calculator element (BUILT_ASSEMBLY_CANON_IDS['wd-schedule'].render(...)) */
  calculator: React.ReactNode
}

const box: React.CSSProperties = { background: 'var(--to-alt)', border: '1px solid var(--to-border)', borderRadius: 8, padding: 10, marginBottom: 10 }
const label: React.CSSProperties = { fontSize: 10, color: 'var(--to-dim, #8aa08a)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 7px', background: 'var(--to-bg)', color: 'var(--to-text)', border: '1px solid var(--to-border)', borderRadius: 5, fontFamily: 'inherit' }
const tiny: React.CSSProperties = { fontSize: 10.5, color: 'var(--to-muted)', marginBottom: 2 }

/** A number typed digit by digit: what is typed stays as typed while it is not yet a sensible number, and a new value from outside replaces it */
function Num({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  const [text, setText] = useState(String(Math.round(value * 10) / 10))
  useEffect(() => { setText(String(Math.round(value * 10) / 10)) }, [value])
  return (
    <div style={{ position: 'relative' }}>
      <input value={text} inputMode="decimal" onChange={e => { setText(e.target.value); const n = parseFloat(e.target.value); if (Number.isFinite(n) && n > 0) onChange(n) }} style={{ ...input, paddingRight: suffix ? 26 : 7 }} />
      {suffix && <span style={{ position: 'absolute', right: 7, top: 6, fontSize: 10.5, color: 'var(--to-muted)', pointerEvents: 'none' }}>{suffix}</span>}
    </div>
  )
}

export default function OpeningsPanel(p: Props) {
  const selected = p.openings.find(o => o.id === p.selectedId) ?? null
  const counts = GROUPS.map(g => [g, p.openings.filter(o => KIND_BY_ID[o.kind]?.group === g).length] as const)

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--to-textb)', marginBottom: 2 }}>🪟 Windows &amp; doors</div>
      <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 10, lineHeight: 1.45 }}>
        Pick a kind of window or door, then click a wall on the plan to put it in. The wall is cut for it and a door shows which way it swings. They are listed here and feed the Windows &amp; Doors calculator below.
      </div>

      <button type="button" onClick={() => p.onPlacing(!p.placing)}
        style={{ width: '100%', padding: '8px 10px', marginBottom: 10, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          border: `1px solid ${p.placing ? '#16a34a' : 'var(--to-border)'}`, background: p.placing ? '#16a34a' : 'var(--to-alt)', color: p.placing ? '#fff' : 'var(--to-text)' }}>
        {p.placing ? '● Placing — click a wall (press again to stop)' : '🪟 Start placing windows and doors'}
      </button>

      <div style={box}>
        <div style={label}>Next one to place</div>
        {GROUPS.map(g => (
          <div key={g} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: GROUP_COLOUR[g], fontWeight: 700, marginBottom: 3 }}>{g}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {KINDS.filter(k => k.group === g).map(k => {
                const on = p.kind === k.id
                return (
                  <button key={k.id} type="button" onClick={() => { p.onKind(k.id); p.onPlacing(true) }} title={`${k.label}, ${k.stdW} x ${k.stdH}`}
                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${on ? GROUP_COLOUR[g] : 'var(--to-border)'}`, background: on ? GROUP_COLOUR[g] : 'transparent', color: on ? '#fff' : 'var(--to-text)' }}>
                    {k.label.replace(/ \(.*\)$/, '')}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
          <div><div style={tiny}>Width</div><Num value={p.widthMm} onChange={n => p.onNext({ widthMm: n })} suffix="mm" /></div>
          <div><div style={tiny}>Height</div><Num value={p.heightMm} onChange={n => p.onNext({ heightMm: n })} suffix="mm" /></div>
        </div>
        {hasSwing(p.kind) && (
          <div style={{ marginTop: 6 }}>
            <div style={tiny}>Which way it opens</div>
            <select value={p.swing} onChange={e => p.onNext({ swing: e.target.value as WdSwing })} style={input}>
              {SWINGS.map(s => <option key={s} value={s}>{SWING_LABEL[s]}</option>)}
            </select>
          </div>
        )}
        <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 6, lineHeight: 1.4 }}>
          "Inside" is the side an outside wall is built towards, and the right-hand side of an inside wall as you drew it. Hinged left or right is as you see the door from the side you push it open from.
        </div>
      </div>

      <div style={box}>
        <div style={label}>On the plan — {p.openings.length} opening{p.openings.length === 1 ? '' : 's'}</div>
        {p.openings.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--to-muted)' }}>None yet. Draw the walls first (External Walls, Internal Walls &amp; Partitions), then click one.</div>}
        {p.openings.length > 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginBottom: 4 }}>{counts.filter(([, n]) => n > 0).map(([g, n]) => `${n} ${g.toLowerCase()}`).join(', ')}</div>
        )}
        {p.openings.map(o => {
          const on = o.id === p.selectedId
          return (
            <div key={o.id} onClick={() => p.onSelect(on ? null : o.id)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '4px 4px', borderBottom: '1px solid var(--to-blt, var(--to-border))', cursor: 'pointer', fontSize: 11.5, background: on ? 'rgba(22,163,74,0.14)' : 'transparent', color: 'var(--to-textb)' }}>
              <span><strong>{o.ref}</strong> {KIND_BY_ID[o.kind]?.label ?? o.kind}{o.location ? ` · ${o.location}` : ''}</span>
              <span style={{ fontFamily: 'monospace', color: 'var(--to-muted)', whiteSpace: 'nowrap' }}>{o.widthMm}×{o.heightMm}</span>
            </div>
          )
        })}
      </div>

      {selected && (
        <div style={{ ...box, borderColor: '#16a34a' }}>
          <div style={label}>Selected: {selected.ref}</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <select value={selected.kind} onChange={e => { const k = KIND_BY_ID[e.target.value]; p.onUpdate(selected.id, { kind: k.id, widthMm: k.stdW, heightMm: k.stdH }) }} style={input}>
              {GROUPS.map(g => <optgroup key={g} label={g}>{KINDS.filter(k => k.group === g).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</optgroup>)}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <div><div style={tiny}>Reference</div><input value={selected.ref} onChange={e => p.onUpdate(selected.id, { ref: e.target.value })} style={input} /></div>
              <div><div style={tiny}>Room / wall</div><input value={selected.location ?? ''} onChange={e => p.onUpdate(selected.id, { location: e.target.value })} placeholder="e.g. Kitchen" style={input} /></div>
              <div><div style={tiny}>Width</div><Num value={selected.widthMm} onChange={n => p.onUpdate(selected.id, { widthMm: n })} suffix="mm" /></div>
              <div><div style={tiny}>Height</div><Num value={selected.heightMm} onChange={n => p.onUpdate(selected.id, { heightMm: n })} suffix="mm" /></div>
            </div>
            {hasSwing(selected.kind) && (
              <select value={selected.swing} onChange={e => p.onUpdate(selected.id, { swing: e.target.value as WdSwing })} style={input}>
                {SWINGS.map(s => <option key={s} value={s}>{SWING_LABEL[s]}</option>)}
              </select>
            )}
            {p.selectedAlong && (
              <div>
                <div style={tiny}>Centre of the opening, along its wall (the wall is {(p.selectedAlong.wallMm / 1000).toFixed(2)} m)</div>
                <Num value={p.selectedAlong.mm} onChange={n => p.onMoveAlong(selected.id, n)} suffix="mm" />
                <div style={{ fontSize: 10.5, color: 'var(--to-muted)', marginTop: 3 }}>Or drag it along the wall on the plan (Select tool).</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => p.onSelect(null)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid var(--to-border)', background: 'transparent', color: 'var(--to-text)', fontFamily: 'inherit' }}>Done</button>
              <button type="button" onClick={() => p.onDelete(selected.id)} style={{ flex: 1, padding: '6px', fontSize: 12, borderRadius: 5, cursor: 'pointer', border: '1px solid #c0392b', background: '#c0392b', color: '#fff', fontFamily: 'inherit' }}>🗑 Delete</button>
            </div>
          </div>
        </div>
      )}

      {p.saved && p.stale && (
        <div style={{ fontSize: 11.5, color: '#d97706', background: 'rgba(217,119,6,0.12)', border: '1px solid #d97706', borderRadius: 6, padding: '6px 9px', marginBottom: 8, lineHeight: 1.4 }}>
          ⚠ The openings on the plan have changed since this was priced. Open the calculator and press Save &amp; Price again.
        </div>
      )}
      <AssemblyItemPanel
        name="Windows and doors"
        lengthM={0}
        measureLabel="Openings on the plan"
        measureText={`${p.openings.length}`}
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
