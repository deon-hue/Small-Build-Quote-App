'use client'

/**
 * Take-off & Draw: the style picker for a window OR a door. Opens when a kind is clicked in the Windows & Doors panel (casement, tilt-and-turn, fixed, sash, bay; front, back, composite, security, French, bi-fold, sliding, garage and internal doors)
 * and from "Change style" on one already placed: a grid of the usual layouts drawn the standard way, the material, the colour (a window frame or an external door) or finish (an internal door), and glazing bars for a window.
 * The rules and the lists are in lib/opening-styles.ts (windows in lib/window-styles.ts, doors in lib/door-styles.ts); this is only the screen. It is drawn into the page body and does not use the page's theme colours, so it looks the same on any theme.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { KIND_BY_ID, type OpeningKind } from '@/lib/wd-units'
import { BARS_LABEL, type GlazingBars } from '@/lib/window-styles'
import type { DoorStyle } from '@/lib/door-styles'
import {
  barsAllowed, cleanOpeningChoice, colourLabelFor, materialLabelFor, materialsFor, styleCardOrDefault, styleCards, swatchOf, swatchesFor, MATERIAL_NAME,
  type LooseOpeningChoice, type OpeningChoice, type StyleCard,
} from '@/lib/opening-styles'
import type { WinStyle } from '@/lib/window-styles'

const GLASS = '#cfe3f5'
const LINE = 'rgba(0,0,0,.38)'

/** A small drawing of a window or door style (looking at it from outside) with the chosen material, colour and bars */
export function OpeningThumb({ kind, choice, height = 84 }: { kind: string; choice: LooseOpeningChoice; height?: number }) {
  const c = cleanOpeningChoice(kind, choice)
  const card = styleCardOrDefault(kind, c.style)
  if (!card) return null
  return <CardSvg kind={kind} card={card} choice={c} height={height} />
}

function CardSvg({ kind, card, choice, height }: { kind: string; card: StyleCard; choice: OpeningChoice; height: number }) {
  const hex = swatchOf(kind, choice.colour).hex
  const thin = choice.material === 'aluminium' || choice.material === 'steel'
  if (card.win) return <WindowSvg def={card.win} hex={hex} alu={thin} bars={choice.bars} height={height} />
  if (card.door) return <DoorSvg def={card.door} kind={kind} hex={hex} thin={thin} height={height} />
  return null
}

function WindowSvg({ def, hex: F, alu, bars, height }: { def: WinStyle; hex: string; alu: boolean; bars: GlazingBars; height: number }) {
  const A = def.ar
  const W = A >= 1 ? 88 : 88 * A, H = A >= 1 ? 88 / A : 88
  const fx = (100 - W) / 2, fy = (100 - H) / 2
  const inset = alu ? 3 : 4.2
  const gScale = alu ? 0.88 : 0.8, gFixed = alu ? 0.92 : 0.86
  const els: React.ReactNode[] = []
  def.panes.forEach((pn, pi) => {
    const pts = pn.p.map(([x, y]) => [fx + inset + x * (W - 2 * inset), fy + inset + y * (H - 2 * inset)] as [number, number])
    const cx = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length
    const sc = (k: number) => pts.map(q => [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k] as [number, number])
    const str = (a: [number, number][]) => a.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ')
    const solid = pn.t === 'S'
    const opens = pn.t !== 'F' && !solid
    const g = sc(opens ? gScale : gFixed)
    const xs = g.map(q => q[0]), ys = g.map(q => q[1])
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), mx = (x0 + x1) / 2, my = (y0 + y1) / 2
    const ln = (k: string, a: number, b: number, c2: number, d: number, stroke = 'rgba(40,40,40,.75)', w = 0.9) => <line key={k} x1={a} y1={b} x2={c2} y2={d} stroke={stroke} strokeWidth={w} />
    const t = pn.t
    const marks: React.ReactNode[] = []
    if (t === 'L' || t === 'TL') marks.push(ln('l1', x0, my, x1, y0), ln('l2', x0, my, x1, y1))
    if (t === 'R' || t === 'TR') marks.push(ln('r1', x1, my, x0, y0), ln('r2', x1, my, x0, y1))
    if (t === 'T' || t === 'TL' || t === 'TR') marks.push(ln('t1', mx, y0, x0, y1), ln('t2', mx, y0, x1, y1))
    if (t === 'SU' || t === 'SD') {
      const d = t === 'SU' ? -1 : 1, ay = my + d * 3
      marks.push(ln('s1', mx, my - d * 3, mx, my + d * 3), ln('s2', mx, ay, mx - 3, ay - d * 3), ln('s3', mx, ay, mx + 3, ay - d * 3))
    }
    let grid = def.bars, bw = alu ? 0.5 : 0.7
    if (bars === 'georgian') { grid = [2, 2]; bw = 1.4 } else if (bars === 'astragal') { grid = [3, 3]; bw = 0.6 }
    const barEls: React.ReactNode[] = []
    if (grid) {
      const [cn, rn] = [grid[0], grid[1] || 1]
      for (let k = 1; k < cn; k++) { const bx = x0 + (x1 - x0) * k / cn; barEls.push(<line key={'bv' + k} x1={bx} y1={y0} x2={bx} y2={y1} stroke={F} strokeWidth={bw} />, <line key={'bvo' + k} x1={bx} y1={y0} x2={bx} y2={y1} stroke="rgba(0,0,0,.25)" strokeWidth={0.2} />) }
      for (let k = 1; k < rn; k++) { const by = y0 + (y1 - y0) * k / rn; barEls.push(<line key={'bh' + k} x1={x0} y1={by} x2={x1} y2={by} stroke={F} strokeWidth={bw} />) }
    }
    els.push(
      <g key={pi}>
        <polygon points={str(sc(0.97))} fill={F} stroke={LINE} strokeWidth={0.5} />
        <polygon points={str(g)} fill={solid ? 'rgba(255,255,255,.14)' : GLASS} stroke="rgba(0,0,0,.4)" strokeWidth={0.5} />
        {!solid && barEls}{marks}
      </g>,
    )
  })
  return (
    <svg viewBox="0 0 100 100" width="100%" height={height} role="img" aria-label={def.name} style={{ display: 'block' }}>
      <rect x={fx} y={fy} width={W} height={H} rx={1.5} fill={F} stroke={LINE} strokeWidth={0.7} />
      {els}
    </svg>
  )
}

/** A door: the frame, one leaf (or a pair) with its panels, glazed lights, louvres or split line, and a handle */
function DoorSvg({ def, kind, hex: F, thin, height }: { def: DoorStyle; kind: string; hex: string; thin: boolean; height: number }) {
  const A = def.ar
  const W = A >= 1 ? 88 : 88 * A, H = A >= 1 ? 88 / A : 88
  const fx = (100 - W) / 2, fy = (100 - H) / 2
  const inset = thin ? 2.6 : 3.6
  const ax = fx + inset, ay = fy + inset, aw = W - 2 * inset, ah = H - 2 * inset
  const gap = def.leaves === 2 ? 1.4 : 0
  const lw = (aw - (def.leaves - 1) * gap) / def.leaves
  const handle = !['door-bifold', 'door-sliding', 'door-garage', 'door-french'].includes(kind) || def.leaves === 2 && kind === 'door-french'
  const els: React.ReactNode[] = []
  for (let li = 0; li < def.leaves; li++) {
    const lx = ax + li * (lw + gap)
    const X = (f: number) => lx + f * lw, Y = (f: number) => ay + f * ah
    els.push(<rect key={'leaf' + li} x={lx} y={ay} width={lw} height={ah} fill={F} stroke={LINE} strokeWidth={0.5} />)
    def.features.forEach((ft, fi) => {
      const k = `${li}-${fi}`
      const x = X(ft.x0), y = Y(ft.y0), w = (ft.x1 - ft.x0) * lw, h = (ft.y1 - ft.y0) * ah
      if (ft.t === 'line') els.push(<line key={k} x1={x} y1={y} x2={x + w} y2={y} stroke="rgba(0,0,0,.6)" strokeWidth={1} />)
      else if (ft.t === 'glass') els.push(<rect key={k} x={x + 0.5} y={y + 0.5} width={Math.max(0, w - 1)} height={Math.max(0, h - 1)} fill={GLASS} stroke="rgba(0,0,0,.45)" strokeWidth={0.45} />)
      else if (ft.t === 'oval') els.push(<ellipse key={k} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={GLASS} stroke="rgba(0,0,0,.45)" strokeWidth={0.5} />)
      else if (ft.t === 'louvre') {
        const n = 9
        els.push(<rect key={k} x={x} y={y} width={w} height={h} fill="rgba(255,255,255,.1)" stroke="rgba(0,0,0,.4)" strokeWidth={0.45} />)
        for (let i = 1; i < n; i++) els.push(<line key={k + 'l' + i} x1={x} y1={y + (h * i) / n} x2={x + w} y2={y + (h * i) / n} stroke="rgba(0,0,0,.35)" strokeWidth={0.45} />)
      } else els.push(<rect key={k} x={x} y={y} width={w} height={h} rx={0.6} fill="rgba(255,255,255,.14)" stroke="rgba(0,0,0,.4)" strokeWidth={0.5} />)
    })
    if (handle) {
      const right = def.leaves === 1 || li === 0
      els.push(<circle key={'h' + li} cx={right ? lx + lw * 0.9 : lx + lw * 0.1} cy={ay + ah * 0.52} r={1.5} fill="#b9b3a5" stroke="rgba(0,0,0,.45)" strokeWidth={0.3} />)
    }
  }
  return (
    <svg viewBox="0 0 100 100" width="100%" height={height} role="img" aria-label={def.name} style={{ display: 'block' }}>
      <rect x={fx} y={fy} width={W} height={H} rx={1} fill={F} stroke={LINE} strokeWidth={0.7} />
      {els}
    </svg>
  )
}

const btn: React.CSSProperties = { fontSize: 13, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #c9ccd1', background: '#fff', color: '#1a1a1a' }
const label: React.CSSProperties = { fontSize: 13, color: '#5b6068', width: 100, flexShrink: 0 }

export default function OpeningStylePicker({ kind, initial, confirmLabel = 'Use this style', onConfirm, onCancel }: {
  kind: OpeningKind
  initial?: LooseOpeningChoice
  confirmLabel?: string
  onConfirm: (choice: OpeningChoice, style: StyleCard) => void
  onCancel: () => void
}) {
  const cards = useMemo(() => styleCards(kind), [kind])
  const materials = materialsFor(kind)
  const swatches = swatchesFor(kind)
  const [choice, setChoice] = useState<OpeningChoice>(() => cleanOpeningChoice(kind, initial))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])
  const picked = cards.find(s => s.id === choice.style) ?? cards[0]
  if (typeof document === 'undefined' || !picked) return null
  const info = KIND_BY_ID[kind]
  const label0 = info?.label ?? 'Opening'
  const set = (patch: Partial<OpeningChoice>) => setChoice(c => ({ ...c, ...patch }))
  const seg = (on: boolean): React.CSSProperties => ({ ...btn, borderRadius: 0, border: 'none', background: on ? '#1a1a1a' : '#fff', color: on ? '#fff' : '#1a1a1a' })
  const sizeOf = (s: StyleCard) => (s.w && s.h ? `${s.w} × ${s.h} mm` : info ? `${info.stdW} × ${info.stdH} mm` : '')
  const matName = MATERIAL_NAME[choice.material]
  const colourName = swatchOf(kind, choice.colour).name
  return createPortal(
    <div data-opening-picker data-window-picker role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, overflowY: 'auto' }}>
      <div role="dialog" aria-modal="true" aria-label={`${label0}: choose a style`} onMouseDown={e => e.stopPropagation()}
        style={{ background: '#fff', color: '#1a1a1a', borderRadius: 14, width: '100%', maxWidth: 660, maxHeight: '96vh', overflowY: 'auto', padding: '16px 18px', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', boxShadow: '0 12px 40px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>{label0}: choose a style</div>
          <button type="button" onClick={onCancel} aria-label="Close" style={{ ...btn, border: 'none', fontSize: 18, padding: '0 4px', background: 'transparent' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: '#5b6068', marginBottom: 12 }}>
          Pick the layout. The size, glazing and price still come from the {kind.startsWith('win-') ? 'Windows' : 'Doors'} calculator.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
          {cards.map(s => {
            const on = s.id === picked.id
            return (
              <div key={s.id} data-style-card={s.id} role="button" tabIndex={0} aria-pressed={on} onClick={() => set({ style: s.id })} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set({ style: s.id }) } }}
                style={{ border: on ? '2px solid #2563eb' : '1px solid #d9dce0', borderRadius: 10, padding: on ? '7px 5px' : '8px 6px', cursor: 'pointer', textAlign: 'center', background: on ? '#eef4ff' : '#fff' }}>
                <CardSvg kind={kind} card={s} choice={choice} height={84} />
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, lineHeight: 1.3 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: '#7a7f87' }}>{sizeOf(s)}</div>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'grid', gap: 12, marginTop: 14, borderTop: '1px solid #e4e6e9', paddingTop: 12 }}>
          {materials.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={label}>{materialLabelFor(kind)}</span>
              {materials.length > 1 ? (
                <span style={{ display: 'inline-flex', border: '1px solid #c9ccd1', borderRadius: 7, overflow: 'hidden' }}>
                  {materials.map(m => <button key={m.id} type="button" data-material={m.id} onClick={() => set({ material: m.id })} style={seg(choice.material === m.id)}>{m.name}</button>)}
                </span>
              ) : <span data-material-fixed style={{ fontSize: 13, fontWeight: 600 }}>{materials[0].name}</span>}
              <span style={{ fontSize: 12, color: '#7a7f87' }}>
                {materials.length === 1 ? 'The only one for this kind of door.' : choice.material === materials[0].id ? 'The usual choice. Starts selected.' : choice.material === 'aluminium' ? 'A slimmer frame, and a higher price.' : choice.material === 'timber' ? 'A higher price.' : ''}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={label}>{colourLabelFor(kind)}</span>
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {swatches.map(c => (
                <button key={c.id} type="button" data-colour={c.id} title={c.name} aria-label={c.name} aria-pressed={choice.colour === c.id} onClick={() => set({ colour: c.id })}
                  style={{ width: 26, height: 26, borderRadius: '50%', padding: 0, cursor: 'pointer', background: c.hex, border: '1px solid #b7bbc1', outline: choice.colour === c.id ? '2px solid #2563eb' : 'none', outlineOffset: 2 }} />
              ))}
            </span>
            <span style={{ fontSize: 12, color: '#7a7f87' }}>{colourName}{choice.colour !== swatches[0]?.id && !kind.startsWith('door-int-') ? (kind.startsWith('win-') ? ' (priced as a coloured frame)' : ' (priced as a coloured door)') : ''}</span>
          </div>
          {barsAllowed(kind) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={label}>Glazing bars</span>
              <span style={{ display: 'inline-flex', border: '1px solid #c9ccd1', borderRadius: 7, overflow: 'hidden' }}>
                {(Object.keys(BARS_LABEL) as GlazingBars[]).map(b => <button key={b} type="button" data-bars={b} onClick={() => set({ bars: b })} style={seg(choice.bars === b)}>{BARS_LABEL[b]}</button>)}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: '#5b6068' }}>
            <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{picked.name}</span> · {matName}, {colourName.toLowerCase()}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onCancel} style={btn}>Cancel</button>
            <button type="button" data-window-picker-ok data-picker-ok onClick={() => onConfirm(choice, picked)} style={{ ...btn, background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a', fontWeight: 600 }}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
