'use client'

// Pick one or more subcontractors / workers for a task. A tap toggles a person on or off; everyone selected is booked on the task.
// Used in the job schedule's edit panel and the Calendar's task panel. A person whose Contact has since been deleted is kept by name
// and can be removed with ✕ (they can't be re-added once removed).

import type { AssigneePick } from '@/lib/task-assignments'

export interface PickerContact { id: string; name: string }
export interface PickerExtra { key: string; name: string }

/** Turns the selected keys back into the people to save */
export function picksFromKeys(keys: string[], contacts: PickerContact[], extras: PickerExtra[]): AssigneePick[] {
  const out: AssigneePick[] = []
  for (const k of keys) {
    const c = contacts.find(x => x.id === k)
    if (c) { out.push({ id: c.id, name: c.name }); continue }
    const e = extras.find(x => x.key === k)
    if (e) out.push({ id: null, name: e.name })
  }
  return out
}

export default function AssigneePicker({ contacts, extras, selected, onChange, label = 'Booked on this task' }: {
  contacts: PickerContact[]
  /** people already booked whose Contact no longer exists */
  extras: PickerExtra[]
  /** selected keys: a Contact's id, or "name:..." for an extra */
  selected: string[]
  onChange: (keys: string[]) => void
  label?: string
}) {
  const has = (k: string) => selected.includes(k)
  const toggle = (k: string) => onChange(has(k) ? selected.filter(x => x !== k) : [...selected, k])
  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: 12, padding: '4px 10px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
    border: `1.5px solid ${on ? '#7ab533' : '#c8d0d8'}`, background: on ? '#7ab533' : '#fff', color: on ? '#fff' : '#334155',
  })
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
    </div>
  )
}
