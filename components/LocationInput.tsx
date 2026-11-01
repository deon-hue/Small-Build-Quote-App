'use client'

/**
 * The "Room / location" box at the top of every calculator: a text box you can still type in, with a list of the usual rooms of a house to pick from, floor by floor (ground floor, first floor, loft), plus the whole job,
 * the cellar and outside. A click on the box or the arrow opens the list, typing narrows it. A room typed in that is not in the list is remembered on this computer and offered next time. The list is drawn into the page body
 * at a fixed position so a calculator window that scrolls or clips never cuts it off; scrolling the LIST itself must not close it (only the page or the calculator behind it moving does).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const HOUSE_ROOMS: { group: string; rooms: string[] }[] = [
  { group: 'Whole job', rooms: ['Whole house', 'Rear extension', 'Side extension', 'Loft conversion', 'Whole ground floor', 'Whole first floor'] },
  { group: 'Ground floor', rooms: [
    'Kitchen', 'Kitchen / diner', 'Living room', 'Lounge', 'Dining room', 'Sitting room', 'Family room', 'Snug', 'Playroom', 'Study', 'Home office', 'Conservatory', 'Garden room',
    'Utility room', 'Cloakroom / WC', 'Ground floor shower room', 'Ground floor bedroom', 'Entrance hall', 'Hallway', 'Porch', 'Pantry', 'Boot room', 'Under-stairs cupboard', 'Integral garage',
  ] },
  { group: 'First floor', rooms: [
    'Landing', 'Master bedroom', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4', 'Bedroom 5', 'Guest bedroom', 'Nursery', 'Dressing room', 'Family bathroom', 'En-suite', 'First floor shower room', 'First floor WC',
    'Airing cupboard', 'First floor study', 'Stairs',
  ] },
  { group: 'Loft', rooms: [
    'Loft bedroom', 'Loft bedroom 2', 'Loft en-suite', 'Loft shower room', 'Loft landing', 'Loft stairs', 'Loft study', 'Loft living room', 'Loft dressing room', 'Loft storage', 'Eaves storage', 'Loft hatch and access',
  ] },
  { group: 'Cellar and outside', rooms: ['Cellar / basement', 'Detached garage', 'Garden', 'Driveway', 'Patio', 'Front elevation', 'Rear elevation', 'Side elevation', 'Roof'] },
]

const STORE = 'sbc_custom_rooms'
const known = new Set(HOUSE_ROOMS.flatMap(g => g.rooms.map(r => r.toLowerCase())))

function readCustom(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '[]')
    return Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 30) : []
  } catch { return [] }
}
function rememberCustom(value: string) {
  const v = value.trim()
  if (!v || v.length > 60 || known.has(v.toLowerCase())) return
  try {
    const list = readCustom().filter(x => x.toLowerCase() !== v.toLowerCase())
    localStorage.setItem(STORE, JSON.stringify([v, ...list].slice(0, 30)))
  } catch { /* storage can be blocked: the list just does not remember */ }
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  title?: string
  /** the style the plain box had: its width and flex go on the wrapper, the rest on the box */
  style?: React.CSSProperties
}

export default function LocationInput({ value, onChange, placeholder, title, style }: Props) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const [custom, setCustom] = useState<string[]>([])
  const [rect, setRect] = useState<{ left: number; top: number; width: number; maxH: number; flip: boolean } | null>(null)
  const boxRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { width, flex, minWidth, maxWidth, ...inputStyle } = (style ?? {}) as React.CSSProperties & { width?: React.CSSProperties['width'] }

  const typed = value.trim().toLowerCase()
  // the whole list when the box is empty or already holds a room from the list, otherwise only what matches what is typed
  const showAll = typed === '' || known.has(typed) || custom.some(c => c.toLowerCase() === typed)
  const groups = useMemo(() => {
    const match = (r: string) => showAll || r.toLowerCase().includes(typed)
    const out: { group: string; rooms: string[] }[] = []
    const mine = custom.filter(match)
    if (mine.length) out.push({ group: 'Used before', rooms: mine })
    for (const g of HOUSE_ROOMS) { const rooms = g.rooms.filter(match); if (rooms.length) out.push({ group: g.group, rooms }) }
    return out
  }, [typed, showAll, custom])
  const flat = groups.flatMap(g => g.rooms)

  function openList() {
    setCustom(readCustom())
    const r = boxRef.current?.getBoundingClientRect()
    if (r) {
      // below the box when there is room for a useful list, else above it; never taller than the space it has
      const below = window.innerHeight - r.bottom - 12, above = r.top - 12
      const flip = below < 220 && above > below
      setRect({ left: Math.max(4, Math.min(r.left, window.innerWidth - 224)), top: flip ? r.top : r.bottom, width: Math.max(r.width, 210), maxH: Math.max(140, Math.min(360, flip ? above : below)), flip })
    }
    setHi(-1)
    setOpen(true)
  }
  const close = () => { setOpen(false); rememberCustom(boxRef.current?.value ?? value) }
  function pick(room: string) { onChange(room); setOpen(false); rememberCustom(room) }

  // the list is fixed to the screen, so the page or the calculator behind it moving, or a resize, closes it rather than leaving it floating. Scrolling the list itself does not.
  useEffect(() => {
    if (!open) return
    const shut = () => setOpen(false)
    const onScroll = (e: Event) => { if (listRef.current && e.target instanceof Node && listRef.current.contains(e.target)) return; setOpen(false) }
    window.addEventListener('resize', shut)
    window.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('resize', shut); window.removeEventListener('scroll', onScroll, true) }
  }, [open])

  // keep the highlighted room in view when moving with the arrow keys
  useEffect(() => {
    if (!open || hi < 0) return
    listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  let n = -1
  return (
    <div style={{ position: 'relative', display: 'inline-block', width, flex, minWidth, maxWidth }}>
      <input
        ref={boxRef}
        value={value}
        placeholder={placeholder}
        title={title}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); if (!open) openList(); setHi(-1) }}
        onFocus={openList}
        onClick={() => { if (!open) openList() }}
        onBlur={close}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) openList(); else setHi(h => Math.min(flat.length - 1, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) }
          else if (e.key === 'Enter' && open && hi >= 0 && flat[hi]) { e.preventDefault(); pick(flat[hi]) }
          else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
        }}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', paddingRight: 20 }}
      />
      <span aria-hidden style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 9, color: '#64748b', pointerEvents: 'none' }}>▾</span>
      {open && rect && flat.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          ref={listRef}
          // pressing in the list (a room, or its scroll bar) must not take the focus off the box first, or the list would close before the press lands
          onMouseDown={e => e.preventDefault()}
          style={{ position: 'fixed', left: rect.left, top: rect.flip ? undefined : rect.top + 2, bottom: rect.flip ? window.innerHeight - rect.top + 2 : undefined, width: rect.width, maxHeight: rect.maxH, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', zIndex: 99999, background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.22)', fontSize: 12.5, padding: '4px 0' }}>
          {groups.map(g => (
            <div key={g.group}>
              <div style={{ position: 'sticky', top: -4, background: '#f1f5f9', padding: '4px 10px 3px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#475569', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>{g.group}</div>
              {g.rooms.map(r => {
                const i = ++n
                const on = i === hi
                return (
                  <div key={g.group + '|' + r} data-i={i} onClick={() => pick(r)} onMouseEnter={() => setHi(i)}
                    style={{ padding: '5px 10px', cursor: 'pointer', background: on ? '#e0f2fe' : 'transparent', fontWeight: r.toLowerCase() === typed ? 700 : 400 }}>{r}</div>
                )
              })}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
