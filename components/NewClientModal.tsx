'use client'

/**
 * NewClientModal: the pop-up for adding a client from wherever a client's name is asked for (New Quote,
 * Quick Quote, Jobs, Invoices) when they are not in the list. It saves a real contact (the same `addClient`
 * the Contacts page uses) and hands the saved client back through `onCreated`, so the screen can fill its own
 * fields. It is drawn into the page body so it sits over any other pop-up it was opened from.
 */

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useApp } from '@/contexts/AppContext'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/types'
import type { Client } from '@/lib/types'

export interface NewClientPrefill {
  name?: string
  email?: string
  phone?: string
  address?: string
  postcode?: string
}

interface Props {
  prefill?: NewClientPrefill
  /** where the contact was added from, kept on the contact ('quote', 'job', 'invoice', ...) */
  addedFrom?: string
  onClose: () => void
  onCreated: (client: Client) => void
}

const SALUTATIONS = ['mr', 'mrs', 'ms', 'miss', 'dr']

/** First and last name from a full name ('Mr & Mrs Davies' has none to split, so the whole name is the first) */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  const kept = parts.filter(p => !SALUTATIONS.includes(p.replace(/[^a-z]/gi, '').toLowerCase()))
  const use = kept.length ? kept : parts
  if (use.length <= 1) return { first: use[0] || '', last: '' }
  return { first: use.slice(0, -1).join(' '), last: use[use.length - 1] }
}

/** The address as one block for a quote or invoice: the address, with the postcode added when it is not already in it */
export function clientAddressBlock(c: Pick<Client, 'address' | 'postcode'>): string {
  const addr = (c.address || '').trim()
  const pc = (c.postcode || '').trim()
  if (!pc) return addr
  const squash = (s: string) => s.toUpperCase().replace(/\s/g, '')
  if (squash(addr).includes(squash(pc))) return addr
  return addr ? `${addr}\n${pc}` : pc
}

export function NewClientModal({ prefill, addedFrom = 'manual', onClose, onCreated }: Props) {
  const { clients, addClient } = useApp()
  const [name, setName] = useState(prefill?.name || '')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState(prefill?.email || '')
  const [phone, setPhone] = useState(prefill?.phone || '')
  const [address, setAddress] = useState(prefill?.address || '')
  const [postcode, setPostcode] = useState(prefill?.postcode || '')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState<string>('Payment on receipt')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const nameKey = name.trim().toLowerCase()
  const emailKey = email.trim().toLowerCase()
  const clash = clients.find(c =>
    (!c.clientType || c.clientType === 'client') &&
    ((nameKey && (c.name || '').trim().toLowerCase() === nameKey) || (emailKey && (c.email || '').trim().toLowerCase() === emailKey)),
  )

  async function save() {
    if (!name.trim()) { setError('Please give the client a name.'); return }
    setSaving(true); setError('')
    try {
      // first and last names are worked out from the full name unless they were typed
      const auto = splitName(name)
      const created = await addClient({
        name: name.trim(),
        first: first.trim() || auto.first,
        last: last.trim() || auto.last,
        email: email.trim(), phone: phone.trim(), address: address.trim(), postcode: postcode.trim(),
        notes: notes.trim(), paymentTerms: terms,
        clientType: 'client', addedFrom,
      })
      onCreated(created)
    } catch (e) {
      setError(e instanceof Error && e.message ? `Could not save the client: ${e.message}` : 'Could not save the client. Please try again.')
      setSaving(false)
    }
  }

  const body = (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose() }}>
      <div className="form-modal" style={{ width: 'min(520px, 96vw)' }} role="dialog" aria-label="Add a new client">
        <div className="form-modal-hd">
          <div style={{ fontWeight: 700, fontSize: 17 }}>Add a new client</div>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>×</button>
        </div>
        <div className="form-modal-bd">
          <div className="fg">
            <label>Full Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Mr & Mrs Davies" autoFocus />
          </div>
          {clash && (
            <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, padding: '8px 10px', marginBottom: 12, lineHeight: 1.5 }}>
              ⚠ <strong>{clash.name || clash.email}</strong> is already in your contacts with the same {(clash.name || '').trim().toLowerCase() === nameKey ? 'name' : 'email address'}.{' '}
              <button type="button" className="btn-sm" onClick={() => onCreated(clash)} style={{ marginLeft: 4 }}>Use {clash.name || 'them'} instead</button>
            </div>
          )}
          <div className="row2">
            <div className="fg">
              <label>First Name</label>
              <input value={first} onChange={e => setFirst(e.target.value)} placeholder="John" />
            </div>
            <div className="fg">
              <label>Last Name</label>
              <input value={last} onChange={e => setLast(e.target.value)} placeholder="Davies" />
            </div>
          </div>
          <div className="row2">
            <div className="fg">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@email.com" />
            </div>
            <div className="fg">
              <label>Phone</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07700 900000" />
            </div>
          </div>
          <div className="fg">
            <label>Address</label>
            <textarea value={address} onChange={e => setAddress(e.target.value)} rows={2} placeholder="14 Thornton Road, London" />
          </div>
          <div className="fg">
            <label>Postcode</label>
            <input value={postcode} onChange={e => setPostcode(e.target.value.toUpperCase())} placeholder="SW17 0AB" maxLength={10} />
          </div>
          <div className="fg">
            <label>Payment Terms</label>
            <select value={terms} onChange={e => setTerms(e.target.value)}>
              {PAYMENT_TERMS_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="fg">
            <label>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any extra info…" />
          </div>
          {error && <div style={{ fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>{error}</div>}
        </div>
        <div className="form-modal-ft">
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Add client'}</button>
        </div>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(body, document.body)
}
