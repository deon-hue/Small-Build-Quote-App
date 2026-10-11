'use client'

// Notes kept on a calculator sub-phase from the AI review ("you haven't got a door frame"): a calculator replaces all of its cost rows when it is saved, so a
// suggestion can't be added as a row. It is kept here instead, on the sub-phase and at the top of the calculator, to be added when you recalculate.
// Tick one off when it's done, or remove it.

import React from 'react'

export interface ReviewNote { id: string; text: string; done?: boolean }

export default function ReviewNotes({ notes, onChange, readOnly = false }: { notes: ReviewNote[]; onChange: (notes: ReviewNote[]) => void; readOnly?: boolean }) {
  if (notes.length === 0) return null
  const open = notes.filter(n => !n.done).length
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        📝 Notes for the next recalculation{open > 0 ? ` — ${open} to add` : ' — all done'}
      </div>
      {notes.map(n => (
        <div key={n.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0' }}>
          <input type="checkbox" checked={!!n.done} disabled={readOnly} title="Tick when you have added it"
            onChange={() => onChange(notes.map(x => x.id === n.id ? { ...x, done: !x.done } : x))} style={{ marginTop: 3, width: 'auto' }} />
          <span style={{ flex: 1, fontSize: 12.5, color: n.done ? '#a8a29e' : '#44403c', textDecoration: n.done ? 'line-through' : 'none', lineHeight: 1.45 }}>{n.text}</span>
          {!readOnly && (
            <button type="button" onClick={() => onChange(notes.filter(x => x.id !== n.id))} title="Remove this note"
              style={{ border: 'none', background: 'none', color: '#a8a29e', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
          )}
        </div>
      ))}
    </div>
  )
}
