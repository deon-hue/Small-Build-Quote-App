'use client'

// The builder dashboard as a grid of cards the builder can arrange: move earlier/later, make small/medium/wide, hide, and bring hidden ones back.
// The layout is remembered per login: on this device straight away (so it appears with no flicker) and in the database (so it follows them to every
// computer and phone). If the database table has not been created yet, the layout still works on this device. The rules (merging a saved layout with
// the app's cards, moving, sizing) are in lib/dashboard-layout.ts and are tested on their own.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, EyeOff, Maximize2, Plus, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cycleSize, defaultLayout, mergeLayout, moveCard, parseSaved, setOn, type CardDef, type CardSize, type SavedCard } from '@/lib/dashboard-layout'

export interface DashCard extends CardDef { node: ReactNode }

const LS_KEY = 'sbc-dash-layout-v1'
const SIZE_LABEL: Record<CardSize, string> = { small: 'Small', medium: 'Medium', large: 'Wide' }

// useLayoutEffect on the client (so the saved layout is applied before anything is painted), plain useEffect on the server (where it would only warn)
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function readLocal(): SavedCard[] | null {
  try { return parseSaved(window.localStorage.getItem(LS_KEY)) } catch { return null }
}

export default function DashboardCards({ cards }: { cards: DashCard[] }) {
  const defs: CardDef[] = cards.map(c => ({ id: c.id, title: c.title, size: c.size, on: c.on }))
  // starts as the standard layout (the same on the server and in the browser), then this device's saved layout is applied before the first paint
  const [layout, setLayout] = useState<SavedCard[]>(() => mergeLayout(defs, null))
  const [editing, setEditing] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedFromDb = useRef(false)

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
          try { window.localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, cards: merged })) } catch { /* storage blocked */ }
        }
      } catch { /* table not created yet, or offline: this device's copy is used */ }
      loadedFromDb.current = true
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function change(next: SavedCard[]) {
    setLayout(next)
    try { window.localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, cards: next })) } catch { /* storage blocked */ }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (user) await sb.from('dashboard_layouts').upsert({ user_id: user.id, layout: { v: 1, cards: next }, updated_at: new Date().toISOString() })
      } catch { /* not saved to the database this time; the device copy still works */ }
    }, 700)
  }
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])

  const byId = new Map(cards.map(c => [c.id, c]))
  const shown = layout.filter(c => c.on && byId.has(c.id))
  const hidden = layout.filter(c => !c.on && byId.has(c.id))
  const tool: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--card, #fff)', cursor: 'pointer', color: 'var(--ink)', padding: 0 }

  return (
    <div>
      <style>{`
        .dc-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: start; }
        .dc-small { grid-column: span 1; } .dc-medium { grid-column: span 2; } .dc-large { grid-column: span 4; }
        @media (max-width: 1100px) { .dc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dc-large { grid-column: span 2; } }
        @media (max-width: 640px) { .dc-grid { gap: 10px; } }
        .dc-item { position: relative; min-width: 0; }
        .dc-item .card { margin: 0; }
        .dc-editing .dc-item { outline: 2px dashed var(--border-strong, #c8d0d8); outline-offset: 2px; border-radius: 12px; }
        .dc-tools { position: absolute; top: -14px; right: 6px; z-index: 5; display: flex; gap: 4px; background: var(--card, #fff); padding: 2px 4px; border-radius: 9px; border: 1px solid var(--border); }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: editing ? 22 : 12 }}>
        {editing && (
          <button className="btn-sm btn-outline" onClick={() => change(defaultLayout(defs))} title="Put the cards back to the standard layout">
            <RotateCcw size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Reset
          </button>
        )}
        <button className={editing ? 'btn-sm btn-primary' : 'btn-sm btn-outline'} onClick={() => setEditing(e => !e)}>
          {editing ? 'Done' : 'Customise'}
        </button>
      </div>

      <div className={'dc-grid' + (editing ? ' dc-editing' : '')}>
        {shown.map((l, i) => {
          const c = byId.get(l.id)!
          return (
            <div key={l.id} className={'dc-item dc-' + l.size}>
              {editing && (
                <div className="dc-tools">
                  <button style={tool} onClick={() => change(moveCard(layout, l.id, -1))} disabled={i === 0} aria-label={'Move ' + c.title + ' earlier'} title="Move earlier"><ArrowUp size={14} /></button>
                  <button style={tool} onClick={() => change(moveCard(layout, l.id, 1))} disabled={i === shown.length - 1} aria-label={'Move ' + c.title + ' later'} title="Move later"><ArrowDown size={14} /></button>
                  <button style={{ ...tool, width: 'auto', padding: '0 8px', gap: 4, fontSize: 11, fontWeight: 600 }} onClick={() => change(cycleSize(layout, l.id))} title="Change the size"><Maximize2 size={12} />{SIZE_LABEL[l.size]}</button>
                  <button style={tool} onClick={() => change(setOn(layout, l.id, false))} aria-label={'Hide ' + c.title} title="Hide this card"><EyeOff size={14} /></button>
                </div>
              )}
              {c.node}
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
