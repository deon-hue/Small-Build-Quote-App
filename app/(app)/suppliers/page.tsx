'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Supplier } from '@/lib/types'

const BLANK = { name: '', contactName: '', email: '', phone: '', address: '', notes: '', accountNumber: '' }

export default function SuppliersPage() {
  const { suppliers, addSupplier, updateSupplier, deleteSupplier, loading } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const q = search.trim().toLowerCase()
  const filtered = !q ? suppliers : suppliers.filter(s =>
    s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.contactName.toLowerCase().includes(q))

  function openNew() { setEditId(null); setForm({ ...BLANK }); setShowModal(true) }
  function openEdit(s: Supplier) {
    setEditId(s.id)
    setForm({ name: s.name, contactName: s.contactName, email: s.email, phone: s.phone, address: s.address, notes: s.notes, accountNumber: s.accountNumber })
    setShowModal(true)
  }
  async function save() {
    if (!form.name.trim() && !confirm('No supplier name — save anyway?')) return
    setSaving(true)
    try {
      if (editId) {
        const ex = suppliers.find(s => s.id === editId)!
        await updateSupplier({ ...ex, ...form })
      } else {
        await addSupplier({ ...form, addedFrom: 'manual' })
      }
      setShowModal(false)
    } finally { setSaving(false) }
  }
  async function del(s: Supplier) {
    if (!confirm(`Delete supplier "${s.name}"? This cannot be undone.`)) return
    await deleteSupplier(s.id)
  }

  const fld = (key: keyof typeof BLANK) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [key]: e.target.value })),
  })

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <input placeholder="Search suppliers…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, minWidth: 240 }} />
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={openNew}>+ Add Supplier</button>
      </div>

      {!filtered.length ? (
        <div className="empty-dashed">
          <div style={{ fontSize: 14, marginBottom: 6 }}>No suppliers{q ? ' match your search' : ' yet'}</div>
          {!q && <div style={{ fontSize: 12 }}>Add merchants, plant hire firms and subcontractors here.</div>}
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--warm, #f8fafc)', borderBottom: '2px solid var(--border)' }}>
                {['Supplier', 'Contact', 'Email', 'Phone', 'Account #', ''].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{s.name || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{s.contactName || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{s.email || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{s.phone || '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted)' }}>{s.accountNumber || '—'}</td>
                  <td style={{ padding: '6px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn-sm btn-outline" onClick={() => openEdit(s)}>Edit</button>
                    <button className="btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => del(s)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 540, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{editId ? 'Edit Supplier' : 'Add Supplier'}</div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div className="row2">
                <div className="fg"><label>Supplier / Company Name</label><input {...fld('name')} placeholder="e.g. Travis Perkins" /></div>
                <div className="fg"><label>Contact Name</label><input {...fld('contactName')} placeholder="Person to contact" /></div>
              </div>
              <div className="row2">
                <div className="fg"><label>Email</label><input type="email" {...fld('email')} /></div>
                <div className="fg"><label>Phone</label><input {...fld('phone')} /></div>
              </div>
              <div className="row2">
                <div className="fg"><label>Account Number</label><input {...fld('accountNumber')} placeholder="Trade account ref" /></div>
                <div className="fg" />
              </div>
              <div className="fg"><label>Address</label><textarea rows={2} {...fld('address')} /></div>
              <div className="fg"><label>Notes</label><textarea rows={2} {...fld('notes')} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px', borderTop: '1px solid var(--border)', background: 'var(--warm, #f8fafc)' }}>
              <button className="btn-sm btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Supplier'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
