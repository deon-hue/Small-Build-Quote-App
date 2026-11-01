'use client'

/**
 * The "Room / location" box at the top of every calculator: a text box you can still type in, with a list of the usual rooms of a house to pick from (a click on the box or the arrow opens it, typing narrows it).
 * A room typed in that is not in the list is remembered on this computer and offered next time. The list is drawn into the page body at a fixed position so a calculator window that scrolls or clips never cuts it off.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export const HOUSE_ROOMS: { group: string; rooms: string[] }[] = [
  { group: 'Whole job', rooms: ['Whole house', 'Rear extension', 'Side extension', 'Loft conversion', 'Whole ground floor', 'Whole first floor'] },
  { group: 'Living', rooms: ['Kitchen', 'Kitchen / diner', 'Living room', 'Lounge', 'Dining room', 'Sitting room', 'Family room', 'Playroom', 'Snug', 'Conservatory', 'Garden room'] },
  { group: 'Bedrooms', rooms: ['Master bedroom', 'Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4', 'Bedroom 5', 'Guest bedroom', 'Nursery'] },
  { group: 'Bathrooms', rooms: ['Bathroom', 'Family bathroom', 'Shower room', 'En-suite', 'Cloakroom / WC', 'Wet room'] },
  { group: 'Circulation and other', rooms: ['Hallway', 'Entrance hall', 'Landing', 'Stairs', 'Porch', 'Utility room', 'Study', 'Home office', 'Pantry', 'Boot room', 'Cupboard', 'Cellar / basement', 'Loft / attic'] },
  { group: 'Outside', rooms: ['Garage', 'Garden', 'Driveway', 'Patio', 'Front elevation', 'Rear elevation', 'Side elevation', 'Roof'] },
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
  const [rect, setRect] = useState<{ left: number; top: number; width: number; flip: boolean } | null>(null)
  const boxRef = useRef<HTMLInputElement>(null)

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
      const below = window.innerHeight - r.bottom
      setRect({ left: r.left, top: below < 260 && r.top > below ? r.top : r.bottom, width: Math.max(r.width, 200), flip: below < 260 && r.top > below })
    }
    setHi(-1)
    setOpen(true)
  }
  const close = () => { setOpen(false); rememberCustom(boxRef.current?.value ?? value) }
  function pick(room: string) { onChange(room); setOpen(false); rememberCustom(room) }

  // the list is fixed to the screen, so a scroll or a resize closes it rather than leaving it floating
  useEffect(() => {
    if (!open) return
    const shut = () => setOpen(false)
    window.addEventListener('resize', shut)
    window.addEventListener('scroll', shut, true)
    return () => { window.removeEventListener('resize', shut); window.removeEventListener('scroll', shut, true) }
  }, [open])

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
          // pressing a room must not take the focus off the box first, or the list would close before the press lands
          onMouseDown={e => e.preventDefault()}
          style={{ position: 'fixed', left: rect.left, top: rect.flip ? undefined : rect.top + 2, bottom: rect.flip ? window.innerHeight - rect.top + 2 : undefined, width: rect.width, maxHeight: 250, overflowY: 'auto', zIndex: 99999, background: '#fff', color: '#1e293b', border: '1px solid #cbd5e1', borderRadius: 6, boxShadow: '0 6px 20px rgba(0,0,0,0.22)', fontSize: 12.5, padding: '4px 0' }}>
          {groups.map(g => (
            <div key={g.group}>
              <div style={{ padding: '4px 10px 2px', fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: '#64748b' }}>{g.group}</div>
              {g.rooms.map(r => {
                const on = flat[hi] === r
                return (
                  <div key={g.group + r} onClick={() => pick(r)} onMouseEnter={() => setHi(flat.indexOf(r))}
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
