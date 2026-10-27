'use client'

/**
 * Take-off: the Drainage & Services side panel for the chambers, manholes, rodding eyes, gullies and connections placed on the plan. Pick a kind, click the plan to place it (the 🕳 tool), and each is marked with its
 * symbol and reference (IC1, MH1 ...). They are listed in the Chambers, Gullies & Connections calculator below, which follows the plan until a value is typed over there. The pipe between them is a line drawn as
 * Underground Drainage (by run). The items live on the "Drainage chambers and gullies" Take-off item (so they save with the project); this component only shows and edits them.
 */

import React from 'react'
import AssemblyItemPanel from './AssemblyWindow'
import {
  DRAIN_ITEMS, DRAIN_ITEM_KINDS, DRAIN_ITEM_GROUP_LABEL, COVER_LABEL, IC_MAX_DEPTH_MM, icExtensions,
  type DrainItemGroup, type DrainItemKind, type CoverGrade, type PitDig,
} from '@/lib/drain-items-units'
import { DRAIN_GROUP_COLOUR } from '@/lib/drain-symbols'
import { drainCounts, type DrainPoint } from '@/lib/drain-points'
import type { CostedLine } from '@/lib/assembly-calc'

const GROUPS: DrainItemGroup[] = ['chamber', 'gully', 'connection']
const COVERS = Object.keys(COVER_LABEL) as CoverGrade[]

interface Props {
  points: DrainPoint[]
  placing: boolean
  onPlacing: (on: boolean) => void
  kind: DrainItemKind
  onKind: (k: DrainItemKind) => void
  /** where the next one is, in words, until it is changed on a placed item */
  where: string
  onWhere: (w: string) => void
  selectedPointId: string | null
  onSelectPoint: (id: string | null) => void
  onUpdatePoint: (id: string, patch: Partial<DrainPoint>) => void
  onDeletePoint: (id: string) => void
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

export default function DrainPointsPanel(p: Props) {
  const selected = p.points.find(x => x.id === p.selectedPointId) ?? null
  const counts = drainCounts(p.points)
  const sel = selected ? DRAIN_ITEMS[selected.kind] : null

  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--to-textb)', marginBottom: 2 }}>🕳 Chambers, manholes and gullies</div>
      <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 10, lineHeight: 1.45 }}>
        Pick a kind, then click where it goes on the plan. Each gets a reference (IC1, MH1 ...) and is listed in the calculator below. The drain pipe between them is a line drawn as Underground Drainage (by run).
      </div>

      <button type="button" onClick={() => p.onPlacing(!p.placing)}
        style={{ width: '100%', padding: '8px 10px', marginBottom: 10, borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          border: `1px solid ${p.placing ? '#92400e' : 'var(--to-border)'}`, background: p.placing ? '#92400e' : 'var(--to-alt)', color: p.placing ? '#fff' : 'var(--to-text)' }}>
        {p.placing ? '● Placing — click the plan (press again to stop)' : '🕳 Start placing chambers and gullies'}
      </button>

      <div style={box}>
        <div style={label}>Kind of item</div>
        {GROUPS.map(g => (
          <div key={g} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: DRAIN_GROUP_COLOUR[g], fontWeight: 700, marginBottom: 3 }}>{DRAIN_ITEM_GROUP_LABEL[g]}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {DRAIN_ITEM_KINDS.filter(k => DRAIN_ITEMS[k].group === g).map(k => {
                const on = p.kind === k
                return (
                  <button key={k} type="button" onClick={() => { p.onKind(k); p.onPlacing(true) }} title={DRAIN_ITEMS[k].label}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 7px', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${on ? DRAIN_GROUP_COLOUR[g] : 'var(--to-border)'}`, background: on ? DRAIN_GROUP_COLOUR[g] : 'transparent', color: on ? '#fff' : 'var(--to-text)' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, opacity: 0.85 }}>{DRAIN_ITEMS[k].ref}</span>{DRAIN_ITEMS[k].label.replace(/ \(.*\)$/, '')}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div style={{ fontSize: 10.5, color: 'var(--to-muted)', lineHeight: 1.4, marginTop: 2 }}>
          A new one starts at the kind's usual depth with a light cover and a pit dug by machine: change them on the placed item, or in the calculator.
        </div>
      </div>

      <div style={box}>
        <div style={label}>Where (for the next one placed)</div>
        <input value={p.where} onChange={e => p.onWhere(e.target.value)} placeholder="e.g. rear garden" style={input} />
      </div>

      <div style={box}>
        <div style={label}>Placed so far — {p.points.length} item{p.points.length === 1 ? '' : 's'}</div>
        {p.points.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--to-muted)' }}>None yet.</div>}
        {p.points.length > 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--to-muted)', lineHeight: 1.5, marginBottom: 4 }}>
            {Array.from(counts).map(([k, n]) => `${n} × ${DRAIN_ITEMS[k].word[n === 1 ? 0 : 1]}`).join(', ')}
          </div>
        )}
        {p.points.map(q => (
          <div key={q.id} onClick={() => p.onSelectPoint(q.id)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '3px 5px', borderRadius: 4, cursor: 'pointer', background: q.id === p.selectedPointId ? 'rgba(146,64,14,0.18)' : 'transparent', color: 'var(--to-text)' }}>
            <span><b style={{ color: DRAIN_GROUP_COLOUR[DRAIN_ITEMS[q.kind].group] }}>{q.ref}</b> {DRAIN_ITEMS[q.kind].word[0]}{q.where ? ` · ${q.where}` : ''}{DRAIN_ITEMS[q.kind].group !== 'connection' && DRAIN_ITEMS[q.kind].pitSide > 0 ? ` · ${(q.depthMm / 1000).toFixed(2)}m` : ''}</span>
            <button type="button" onClick={e => { e.stopPropagation(); p.onDeletePoint(q.id) }} title="Delete this item" style={{ border: 'none', background: 'transparent', color: '#c0392b', cursor: 'pointer', fontSize: 13 }}>✕</button>
          </div>
        ))}
      </div>

      {selected && sel && (
        <div style={{ ...box, borderColor: '#92400e' }}>
          <div style={label}>Selected item</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <select value={selected.kind} onChange={e => p.onUpdatePoint(selected.id, { kind: e.target.value as DrainItemKind })} style={input}>
              {GROUPS.map(g => (
                <optgroup key={g} label={DRAIN_ITEM_GROUP_LABEL[g]}>
                  {DRAIN_ITEM_KINDS.filter(k => DRAIN_ITEMS[k].group === g).map(k => <option key={k} value={k}>{DRAIN_ITEMS[k].label}</option>)}
                </optgroup>
              ))}
            </select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 6 }}>
              <input value={selected.ref} onChange={e => p.onUpdatePoint(selected.id, { ref: e.target.value })} title="Reference marked on the plan" style={input} />
              <input value={selected.where} onChange={e => p.onUpdatePoint(selected.id, { where: e.target.value })} placeholder="Where (rear garden)" style={input} />
            </div>
            {sel.pitSide > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--to-text)' }}>
                Depth to the bottom (mm)
                <input type="number" min={200} step={50} value={selected.depthMm} onChange={e => p.onUpdatePoint(selected.id, { depthMm: Math.max(0, +e.target.value || 0) })} style={{ ...input, width: 90 }} />
              </label>
            )}
            {selected.kind === 'ic' && (
              <div style={{ fontSize: 10.5, color: selected.depthMm > IC_MAX_DEPTH_MM ? '#d97706' : 'var(--to-muted)', lineHeight: 1.4 }}>
                {icExtensions(selected.depthMm) === 0 ? 'No extension sections at this depth.' : `${icExtensions(selected.depthMm)} extension section${icExtensions(selected.depthMm) === 1 ? '' : 's'} (300mm each) at this depth.`}
                {selected.depthMm > IC_MAX_DEPTH_MM ? ' A 450mm chamber is for shallow drains: deeper than about 1.2m needs a manhole.' : ''}
              </div>
            )}
            {sel.coverGrades && (
              <select value={selected.cover} onChange={e => p.onUpdatePoint(selected.id, { cover: e.target.value as CoverGrade })} style={input}>
                {COVERS.map(c => <option key={c} value={c}>{COVER_LABEL[c]}</option>)}
              </select>
            )}
            {sel.pitSide > 0 && (
              <select value={selected.dig} onChange={e => p.onUpdatePoint(selected.id, { dig: e.target.value as PitDig })} style={input}>
                <option value="machine">Pit dug by machine</option><option value="hand">Pit dug by hand</option>
              </select>
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
          ⚠ The chambers and gullies on the plan have changed since this was priced. Open the calculator and press Save &amp; Price again.
        </div>
      )}
      <AssemblyItemPanel
        name="Chambers, gullies and connections"
        lengthM={0}
        measureLabel="Items on the plan"
        measureText={`${p.points.length} placed`}
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
