'use client'

// Pick one or more subcontractors / workers for a task, and say which days of the task each one is on site. A tap toggles a person on or
// off; for everyone booked, "Days" lets you choose just the days they work (e.g. Wed, Thu and Fri of a five-day task), which is what the
// subcontractor sees in their own portal. A person whose Contact has since been deleted is kept by name and can be removed with ✕.
// Used in the job schedule's edit panel and the Calendar's task panel.

import { useState } from 'react'
import { bookedDays, describeDays, dayLabel, normaliseOffsets, type TaskDay } from '@/lib/task-days'
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

export default function AssigneePicker({ contacts, extras, selected, onChange, label = 'Booked on this task', taskDays, daysByKey, onDaysChange }: {
  contacts: PickerContact[]
  /** people already booked whose Contact no longer exists */
  extras: PickerExtra[]
  /** selected keys: a Contact's id, or "name:..." for an extra */
  selected: string[]
  onChange: (keys: string[]) => void
  label?: string
  /** the working days of this task; with more than one, each booked person gets a "which days" chooser */
  taskDays?: TaskDay[]
  /** each person's chosen days (offsets), null = every day */
  daysByKey?: Record<string, number[] | null>
  onDaysChange?: (key: string, offsets: number[] | null) => void
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const has = (k: string) => selected.includes(k)
  const toggle = (k: string) => onChange(has(k) ? selected.filter(x => x !== k) : [...selected, k])
  const nameOf = (k: string) => contacts.find(c => c.id === k)?.name ?? extras.find(e => e.key === k)?.name ?? ''
  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
    border: `1.5px solid ${on ? '#7ab533' : '#c8d0d8'}`, background: on ? '#7ab533' : '#fff', color: on ? '#fff' : '#334155',
  })
  const showDays = !!taskDays && taskDays.length > 1 && !!onDaysChange

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', maxHeight: 120, overflowY: 'auto' }}>
        {contacts.map(c => (
          <button key={c.id} type="button" onClick={() => toggle(c.id)} style={pill(has(c.id))} aria-pressed={has(c.id)}>
            {has(c.id) ? '✓ ' : ''}{c.name}
          </button>
        ))}
        {extras.filter(e => has(e.key)).map(e => (
          <button key={e.key} type="button" onClick={() => toggle(e.key)} style={{ ...pill(true), background: '#94a3b8', borderColor: '#94a3b8' }} title="This contact has been deleted. Click to remove them from the task.">
            {e.name} (contact removed) ✕
          </button>
        ))}
      </div>
      {contacts.length === 0 && extras.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>Save subcontractors in Contacts to book them here.</div>
      )}
      {selected.length === 0 && contacts.length > 0 && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>Tap a name to book them. You can book several.</div>}

      {/* Which days each booked person works */}
      {showDays && selected.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Days each person works (they see these in their portal)</div>
          {selected.map(k => {
            const offsets = daysByKey && k in daysByKey ? daysByKey[k] : null
            const mine = bookedDays(taskDays!, offsets)
            const isOpen = openKey === k
            return (
              <div key={k} style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
                  <strong style={{ minWidth: 90 }}>{nameOf(k)}</strong>
                  <span style={{ color: offsets ? '#3e6b12' : 'var(--muted)', fontWeight: offsets ? 700 : 400 }}>{describeDays(taskDays!, mine)}</span>
                  <button type="button" onClick={() => setOpenKey(isOpen ? null : k)}
                    style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #c8d0d8', borderRadius: 10, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {isOpen ? 'Done' : 'Change days'}
                  </button>
                </div>
                {isOpen && (
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                    <button type="button" onClick={() => onDaysChange!(k, null)}
                      style={{ ...pill(offsets === null), fontSize: 11, padding: '3px 9px' }}>Every day</button>
                    {taskDays!.map(d => {
                      const on = mine.some(m => m.offset === d.offset)
                      return (
                        <button key={d.offset} type="button" aria-pressed={on}
                          onClick={() => {
                            const cur = (offsets ?? taskDays!.map(x => x.offset))
                            const next = on ? cur.filter(o => o !== d.offset) : [...cur, d.offset]
                            // never leave a person with no days at all: that would just mean "every day" again
                            if (next.length === 0) return
                            onDaysChange!(k, normaliseOffsets(taskDays!, next))
                          }}
                          style={{ ...pill(offsets !== null && on), fontSize: 11, padding: '3px 9px', background: on ? (offsets === null ? '#e8f3d6' : '#7ab533') : '#fff', color: on ? (offsets === null ? '#3e6b12' : '#fff') : '#334155', borderColor: on ? '#7ab533' : '#c8d0d8' }}>
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
