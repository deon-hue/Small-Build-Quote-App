'use client'

// Book subcontractors / workers on a task, and say which days of the task each one is on site. Kept compact: only the people already
// booked are listed (one tidy row each, with their days and a remove button); everyone else is behind one "+ Add person" search box, so a
// long list of subcontractors never fills the panel. Each person's days (e.g. Wed, Thu and Fri of a five-day task) is what they see in their
// own portal. A person whose Contact has since been deleted is kept by name and can be removed with ✕.
// Used in the job schedule's edit panel and the Calendar's task panel.

import { useEffect, useRef, useState } from 'react'
import { bookedDays, describeDays, dayLabel, toggleDay, type TaskDay } from '@/lib/task-days'
import type { AssigneePick } from '@/lib/task-assignments'

export interface PickerContact { id: string; name: string }
export interface PickerExtra { key: string; name: string }

/** Turns the selected keys (and each person's chosen days) back into the people to save */
export function picksFromKeys(
  keys: string[], contacts: PickerContact[], extras: PickerExtra[], daysByKey?: Record<string, number[] | null>,
): AssigneePick[] {
  const out: AssigneePick[] = []
  for (const k of keys) {
    const days = daysByKey ? (k in daysByKey ? daysByKey[k] : null) : undefined
    const c = contacts.find(x => x.id === k)
    if (c) { out.push({ id: c.id, name: c.name, dayOffsets: days }); continue }
    const e = extras.find(x => x.key === k)
    if (e) out.push({ id: null, name: e.name, dayOffsets: days })
  }
  return out
}

const initialOf = (n: string) => (n.trim().charAt(0) || '?').toUpperCase()

export default function AssigneePicker({ contacts, extras, selected, onChange, label = 'Booked on this task', taskDays, daysByKey, onDaysChange }: {
  contacts: PickerContact[]
  /** people already booked whose Contact no longer exists */
  extras: PickerExtra[]
  /** selected keys: a Contact's id, or "name:..." for an extra */
  selected: string[]
  onChange: (keys: string[]) => void
  label?: string
  /** the working days of this task; with more than one, each booked person gets a "Days" button */
  taskDays?: TaskDay[]
  /** each person's chosen days (offsets), null = every day */
  daysByKey?: Record<string, number[] | null>
  onDaysChange?: (key: string, offsets: number[] | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const addRef = useRef<HTMLDivElement>(null)
  const nameOf = (k: string) => contacts.find(c => c.id === k)?.name ?? extras.find(e => e.key === k)?.name ?? ''
  const showDays = !!taskDays && taskDays.length > 1 && !!onDaysChange

  // people who can still be added, filtered by what is typed
  const q = query.trim().toLowerCase()
  const available = contacts.filter(c => !selected.includes(c.id) && (!q || c.name.toLowerCase().includes(q)))

  // close the add box when clicking elsewhere
  useEffect(() => {
    if (!adding) return
    const onDown = (e: MouseEvent) => { if (addRef.current && !addRef.current.contains(e.target as Node)) { setAdding(false); setQuery('') } }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [adding])

  const add = (id: string) => { onChange([...selected, id]); setAdding(false); setQuery('') }
  const remove = (k: string) => { onChange(selected.filter(x => x !== k)); if (openKey === k) setOpenKey(null) }
  const chip = (on: boolean): React.CSSProperties => ({
    fontSize: 11, padding: '3px 9px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
    border: `1.5px solid ${on ? '#7ab533' : '#c8d0d8'}`, background: on ? '#7ab533' : '#fff', color: on ? '#fff' : '#334155',
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)' }}>{label}{selected.length > 0 ? ` (${selected.length})` : ''}</div>

        <div ref={addRef} style={{ position: 'relative' }}>
          <button type="button" onClick={() => { setAdding(a => !a); setQuery('') }}
            style={{ fontSize: 11.5, padding: '3px 10px', border: '1px solid #7ab533', borderRadius: 12, background: '#f4f9ea', color: '#3e6b12', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>
            + Add person
          </button>
          {adding && (
            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30, width: 230, background: '#fff', border: '1px solid #c8d0d8', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 6 }}>
              <input
                autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search subcontractors…"
                onKeyDown={e => { if (e.key === 'Enter' && available[0]) add(available[0].id); if (e.key === 'Escape') { setAdding(false); setQuery('') } }}
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '6px 8px', border: '1px solid #c8d0d8', borderRadius: 6, fontFamily: 'inherit' }}
              />
              <div style={{ maxHeight: 180, overflowY: 'auto', marginTop: 4 }}>
                {available.length === 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '8px 6px' }}>
                    {contacts.length === 0 ? 'Save subcontractors in Contacts to book them here.' : q ? 'No one matches that.' : 'Everyone is already on this task.'}
                  </div>
                )}
                {available.map(c => (
                  <button key={c.id} type="button" onClick={() => add(c.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12.5, padding: '6px 8px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 5 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f1f5f9' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {selected.length === 0 ? (
        <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>Nobody booked yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {selected.map(k => {
            const isExtra = !contacts.some(c => c.id === k)
            const offsets = daysByKey && k in daysByKey ? daysByKey[k] : null
            const isOpen = openKey === k
            return (
              <div key={k} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: isExtra ? '#94a3b8' : '#7ab533', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initialOf(nameOf(k))}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nameOf(k)}{isExtra ? ' (contact removed)' : ''}
                    </div>
                    {showDays && (
                      <div style={{ fontSize: 11, color: offsets ? '#3e6b12' : 'var(--muted)', fontWeight: offsets ? 700 : 400 }}>
                        {describeDays(taskDays!, bookedDays(taskDays!, offsets))}
                      </div>
                    )}
                  </div>
                  {showDays && (
                    <button type="button" onClick={() => setOpenKey(isOpen ? null : k)}
                      style={{ fontSize: 11, padding: '2px 9px', border: '1px solid #c8d0d8', borderRadius: 10, background: isOpen ? '#e8f3d6' : '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {isOpen ? 'Done' : 'Days'}
                    </button>
                  )}
                  <button type="button" onClick={() => remove(k)} title="Take off this task" aria-label={`Remove ${nameOf(k)}`}
                    style={{ fontSize: 13, lineHeight: 1, padding: '2px 6px', border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                </div>
                {showDays && isOpen && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6, paddingLeft: 30 }}>
                    <button type="button" onClick={() => onDaysChange!(k, null)} style={chip(offsets === null)}>Every day</button>
                    {taskDays!.map(d => {
                      // "Every day" is its own button; the single days are only lit when particular days have been picked, so a click clearly selects that day
                      const on = offsets !== null && offsets.includes(d.offset)
                      return (
                        <button key={d.offset} type="button" aria-pressed={on}
                          onClick={() => onDaysChange!(k, toggleDay(taskDays!, offsets, d.offset))}
                          style={chip(on)}>
                          {dayLabel(d.date)}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
