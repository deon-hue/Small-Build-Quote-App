'use client'

// The builder dashboard as a grid of cards the builder can arrange. On a computer: drag a card to move it, drag its right-hand edge to make it wider
// or narrower (it snaps to 1 to 4 columns of a four-column grid, so everything lines up), and cards in a row are the same height. On a tablet or
// phone: arrows and a size button, as before. Cards can be hidden and brought back from a tray.
// The layout is remembered per login: on this device straight away (so it appears with no flicker) and in the database (so it follows them to every
// computer and phone). If the database table has not been created yet, the layout still works on this device. The rules (merging a saved layout with
// the app's cards, moving, widths) are in lib/dashboard-layout.ts and are tested on their own.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, EyeOff, GripVertical, Maximize2, Plus, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cycleSize, defaultLayout, mergeLayout, moveCard, moveCardTo, parseSaved, setOn, setSpan, type CardDef, type SavedCard } from '@/lib/dashboard-layout'

export interface DashCard extends CardDef { node: ReactNode }

const LS_KEY = 'sbc-dash-layout-v1'
const GAP = 16
const WIDTH_LABEL = ['', 'Quarter width', 'Half width', 'Three-quarter width', 'Full width']

// useLayoutEffect on the client (so the saved layout is applied before anything is painted), plain useEffect on the server (where it would only warn)
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function readLocal(): SavedCard[] | null {
  try { return parseSaved(window.localStorage.getItem(LS_KEY)) } catch { return null }
}

export default function DashboardCards({ cards }: { cards: DashCard[] }) {
  const defs: CardDef[] = cards.map(c => ({ id: c.id, title: c.title, span: c.span, on: c.on }))
  // starts as the standard layout (the same on the server and in the browser), then this device's saved layout is applied before the first paint
  const [layout, setLayout] = useState<SavedCard[]>(() => mergeLayout(defs, null))
  const [editing, setEditing] = useState(false)
  const [desktop, setDesktop] = useState(false)           // a computer with a mouse: drag and edge-resize; otherwise arrows
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const layoutRef = useRef(layout)
  useEffect(() => { layoutRef.current = layout }, [layout])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1101px) and (pointer: fine)')
    const on = () => setDesktop(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useIsoLayoutEffect(() => {
    const local = readLocal()
    if (local) setLayout(mergeLayout(defs, local))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The saved copy in the database (follows the builder between devices). Ignored quietly if it can't be read.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const sb = createClient()
        const { data } = await sb.from('dashboard_layouts').select('layout').maybeSingle()
        const saved = parseSaved(data?.layout)
        if (alive && saved) {
          const merged = mergeLayout(defs, saved)
          setLayout(merged)
          try { window.localStorage.setItem(LS_KEY, JSON.stringify({ v: 2, cards: merged })) } catch { /* storage blocked */ }
        }
      } catch { /* table not created yet, or offline: this device's copy is used */ }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the layout on screen, on this device and in the database
  const persist = useCallback((next: SavedCard[]) => {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify({ v: 2, cards: next })) } catch { /* storage blocked */ }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) await sb.from('dashboard_layouts').upsert({ user_id: user.id, layout: { v: 2, cards: next }, updated_at: new Date().toISOString() })
      } catch { /* not saved to the database this time; the device copy still works */ }
    }, 700)
  }, [])
  function change(next: SavedCard[]) { setLayout(next); persist(next) }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  // ── Drag a card to move it ──────────────────────────────────────────────
  function onDragOver(e: React.DragEvent<HTMLDivElement>, id: string) {
    if (!dragId) return
    e.preventDefault()
    if (id === dragId) { setOver(null); return }
    const r = e.currentTarget.getBoundingClientRect()
    const gridW = gridRef.current?.getBoundingClientRect().width ?? r.width
    // a full-width card is dropped above or below; a narrower one to its left or right
    const after = r.width > gridW * 0.7 ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2
    setOver(o => (o && o.id === id && o.after === after ? o : { id, after }))
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (dragId && over) change(moveCardTo(layout, dragId, over.id, over.after))
    setDragId(null); setOver(null)
  }

  // ── Drag a card's right-hand edge to resize it (snaps to whole columns) ───────
  function startResize(e: React.PointerEvent, id: string) {
    e.preventDefault(); e.stopPropagation()
    const grid = gridRef.current
    if (!grid) return
    const gridW = grid.getBoundingClientRect().width
    const step = (gridW - GAP * 3) / 4 + GAP            // one column plus the gap after it
    const startX = e.clientX
    const startSpan = layoutRef.current.find(c => c.id === id)?.span ?? 1
    setResizing(id)
    const move = (ev: PointerEvent) => {
      const next = Math.max(1, Math.min(4, Math.round(startSpan + (ev.clientX - startX) / step)))
      setLayout(prev => setSpan(prev, id, next))
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setResizing(null)
      persist(layoutRef.current)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const byId = new Map(cards.map(c => [c.id, c]))
  const shown = layout.filter(c => c.on && byId.has(c.id))
  const hidden = layout.filter(c => !c.on && byId.has(c.id))
  const tool: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card, #fff)', cursor: 'pointer', color: 'var(--ink)', padding: 0 }
  const canDrag = editing && desktop

  return (
    <div>
      <style>{`
        .dc-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: ${GAP}px; align-items: stretch; grid-auto-flow: row dense; }
        .dc-s1 { grid-column: span 1; } .dc-s2 { grid-column: span 2; } .dc-s3 { grid-column: span 3; } .dc-s4 { grid-column: span 4; }
        @media (max-width: 1100px) { .dc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dc-s3, .dc-s4 { grid-column: span 2; } }
        @media (max-width: 640px) { .dc-grid { gap: 10px; } }
        /* each card fills its slot, so cards in a row are the same height */
        .dc-item { position: relative; min-width: 0; display: flex; }
        .dc-item > .dc-body { flex: 1; min-width: 0; display: flex; }
        .dc-item > .dc-body > * { flex: 1; min-width: 0; margin: 0 !important; }
        .dc-editing .dc-item { outline: 2px dashed var(--border-strong, #c8d0d8); outline-offset: 2px; border-radius: 12px; }
        .dc-candrag .dc-item { cursor: grab; }
        .dc-candrag .dc-body { pointer-events: none; }
        .dc-dragging { opacity: 0.35; }
        .dc-over-before { box-shadow: -8px 0 0 0 #7ab533; } .dc-over-after { box-shadow: 8px 0 0 0 #7ab533; }
        .dc-s4.dc-over-before { box-shadow: 0 -8px 0 0 #7ab533; } .dc-s4.dc-over-after { box-shadow: 0 8px 0 0 #7ab533; }
        .dc-tools { position: absolute; top: -15px; right: 8px; z-index: 5; display: flex; gap: 4px; align-items: center; background: var(--card, #fff); padding: 2px 4px; border-radius: 9px; border: 1px solid var(--border); font-size: 11px; font-weight: 600; color: var(--muted); }
        .dc-resize { position: absolute; top: 12%; bottom: 12%; right: -9px; width: 14px; cursor: ew-resize; z-index: 6; display: flex; align-items: center; justify-content: center; touch-action: none; }
        .dc-resize::after { content: ''; width: 5px; height: 100%; max-height: 56px; border-radius: 3px; background: var(--border-strong, #c8d0d8); transition: background 0.1s; }
        .dc-resize:hover::after, .dc-resizing .dc-resize::after { background: #7ab533; }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: editing ? 8 : 12 }}>
        {editing && (
          <button className="btn-sm btn-outline" onClick={() => change(defaultLayout(defs))} title="Put the cards back to the standard layout">
            <RotateCcw size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reset
          </button>
        )}
        <button className={editing ? 'btn-sm btn-primary' : 'btn-sm btn-outline'} onClick={() => { setEditing(e => !e); setDragId(null); setOver(null) }}>
          {editing ? 'Done' : 'Customise'}
        </button>
      </div>
      {editing && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'right', marginBottom: 22 }}>
          {desktop
            ? 'Drag a card to move it. Drag its right-hand edge to make it wider or narrower.'
            : 'Use the arrows to move a card, and the size button to change how wide it is.'}
        </div>
      )}

      <div ref={gridRef} className={'dc-grid' + (editing ? ' dc-editing' : '') + (canDrag ? ' dc-candrag' : '')}>
        {shown.map((l, i) => {
          const c = byId.get(l.id)!
          const cls = ['dc-item', 'dc-s' + l.span,
            dragId === l.id ? 'dc-dragging' : '',
            over?.id === l.id ? (over.after ? 'dc-over-after' : 'dc-over-before') : '',
            resizing === l.id ? 'dc-resizing' : ''].filter(Boolean).join(' ')
          return (
            <div key={l.id} className={cls}
              draggable={canDrag}
              onDragStart={canDrag ? (e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; setDragId(l.id) } : undefined}
              onDragOver={canDrag ? (e) => onDragOver(e, l.id) : undefined}
              onDrop={canDrag ? onDrop : undefined}
              onDragEnd={canDrag ? () => { setDragId(null); setOver(null) } : undefined}>
              {editing && (
                <div className="dc-tools">
                  {desktop ? (
                    <>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: '0 4px', cursor: 'grab' }} title="Drag to move"><GripVertical size={14} />Drag</span>
                      <span style={{ padding: '0 4px', whiteSpace: 'nowrap' }}>{WIDTH_LABEL[l.span]}</span>
                    </>
                  ) : (
                    <>
                      <button style={tool} onClick={() => change(moveCard(layout, l.id, -1))} disabled={i === 0} aria-label={'Move ' + c.title + ' earlier'} title="Move earlier"><ArrowUp size={14} /></button>
                      <button style={tool} onClick={() => change(moveCard(layout, l.id, 1))} disabled={i === shown.length - 1} aria-label={'Move ' + c.title + ' later'} title="Move later"><ArrowDown size={14} /></button>
                      <button style={{ ...tool, width: 'auto', padding: '0 8px', gap: 4, fontSize: 11, fontWeight: 600 }} onClick={() => change(cycleSize(layout, l.id))} title="Change the size"><Maximize2 size={12} />{l.span === 1 ? 'Small' : l.span === 2 ? 'Medium' : 'Wide'}</button>
                    </>
                  )}
                  <button style={tool} onClick={() => change(setOn(layout, l.id, false))} aria-label={'Hide ' + c.title} title="Hide this card"><EyeOff size={14} /></button>
                </div>
              )}
              <div className="dc-body">{c.node}</div>
              {canDrag && <div className="dc-resize" onPointerDown={(e) => startResize(e, l.id)} role="separator" aria-label={'Resize ' + c.title} title="Drag to resize" />}
            </div>
          )
        })}
      </div>

      {editing && (
        <div style={{ marginTop: 20, padding: '12px 14px', border: '1px dashed var(--border-strong, #c8d0d8)', borderRadius: 10, fontSize: 12.5, color: 'var(--muted)' }}>
          {hidden.length === 0
            ? 'No hidden cards.'
            : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span>Hidden cards, tap to add one back:</span>
                {hidden.map(h => (
                  <button key={h.id} className="btn-sm btn-outline" onClick={() => change(setOn(layout, h.id, true))}><Plus size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />{byId.get(h.id)!.title}</button>
                ))}
              </div>
            )}
        </div>
      )}
    </div>
  )
}
