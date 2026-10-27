'use client'

// Who a request for a price goes to: pick suppliers from Contacts, or type one that is not there. Used by a job's Orders window and by "ask for prices" on a calculator's materials list.

import React, { useState } from 'react'
import type { Supplier } from '@/lib/types'
import type { QuoteInvitee } from '@/lib/job-orders'
import { NewClientModal } from './NewClientModal'
import type { Client } from '@/lib/types'

export const blankWho = (): QuoteInvitee => ({ supplierName: '', supplierContact: '', supplierEmail: '', supplierPhone: '' })

/** Who a request goes to: pick suppliers from Contacts, or type one that is not there. */
export function Recipients({ suppliers, value, onChange, inp, lab, btn }: { suppliers: Supplier[]; value: QuoteInvitee[]; onChange: (v: QuoteInvitee[]) => void; inp: React.CSSProperties; lab: React.CSSProperties; btn: React.CSSProperties }) {
  const [one, setOne] = useState<QuoteInvitee>(blankWho())
  // the same pop-up as everywhere else a supplier is picked: saves a real supplier in Contacts and asks them for a price straight away
  const [adding, setAdding] = useState(false)
  const taken = new Set(value.map(v => v.supplierId).filter(Boolean))
  function addContact(id: string) {
    const s = suppliers.find(x => x.id === id)
    if (!s || taken.has(s.id)) return
    onChange([...value, { supplierId: s.id, supplierName: s.name, supplierContact: s.contactName || '', supplierEmail: s.email || '', supplierPhone: s.phone || '' }])
  }
  function addSaved(c: Client) {
    if (!taken.has(c.id)) onChange([...value, { supplierId: c.id, supplierName: c.name, supplierContact: [c.first, c.last].filter(Boolean).join(' '), supplierEmail: c.email || '', supplierPhone: c.phone || '' }])
    setOne(blankWho()); setAdding(false)
  }
  function addTyped() {
    if (!one.supplierName.trim()) return
    onChange([...value, { ...one, supplierName: one.supplierName.trim() }]); setOne(blankWho())
  }
  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, background: '#fff' }}>
      <label style={lab}>Who to ask for a price</label>
      {value.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Add one or more suppliers. Each is sent the request, and you compare the answers.</div>}
      {value.map((w, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0', flexWrap: 'wrap' }}>
          <strong>{w.supplierName}</strong>
          <span style={{ color: '#64748b', flex: 1 }}>{[w.supplierContact, w.supplierEmail, w.supplierPhone].filter(Boolean).join(' · ') || 'no email or mobile yet'}</span>
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ ...btn, padding: '2px 8px', color: '#dc2626', borderColor: '#fecaca' }}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 8 }}>
        <select style={inp} value="" onChange={e => addContact(e.target.value)}>
          <option value="">＋ Add from your Contacts…</option>
          {[...suppliers].filter(s => !taken.has(s.id)).sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button type="button" onClick={() => setAdding(true)} style={{ ...btn, color: '#15803d', borderColor: '#bbf7d0', background: '#f0fdf4' }}>＋ Add a new supplier</button>
      </div>
      {adding && <NewClientModal clientType="supplier" addedFrom="order" prefill={{ name: one.supplierName, email: one.supplierEmail, phone: one.supplierPhone }} onClose={() => setAdding(false)} onCreated={addSaved} />}
      <div style={{ fontSize: 11, color: '#94a3b8', margin: '8px 0 4px' }}>Not in Contacts? Type them in:</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        <input style={inp} placeholder="Supplier name" value={one.supplierName} onChange={e => setOne({ ...one, supplierName: e.target.value })} />
        <input style={inp} placeholder="Person there" value={one.supplierContact} onChange={e => setOne({ ...one, supplierContact: e.target.value })} />
        <input style={inp} type="email" placeholder="Email" value={one.supplierEmail} onChange={e => setOne({ ...one, supplierEmail: e.target.value })} />
        <input style={inp} placeholder="Mobile (WhatsApp)" value={one.supplierPhone} onChange={e => setOne({ ...one, supplierPhone: e.target.value })} />
        <button onClick={addTyped} disabled={!one.supplierName.trim()} style={btn}>Add</button>
      </div>
    </div>
  )
}
