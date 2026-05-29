'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchPlantItems, upsertPlantItem, deletePlantItem } from '@/lib/back-office-queries'
import type { BOPlantItem } from '@/lib/back-office-types'
import { PLANT_UNITS } from '@/lib/back-office-types'
import { Plus } from 'lucide-react'

interface Props { userId: string }

export default function SectionPlant({ userId }: Props) {
  const sb = createClient()
  const [items, setItems] = useState<BOPlantItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BOPlantItem | null>(null)
  const [isNew, setIsNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await fetchPlantItems(sb, userId))
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing({ id: '', user_id: userId, name: 'New Plant Item', unit: 'day', default_cost: 0, markup_pct: 20, phase_id: null, active: true, display_order: items.length } as BOPlantItem)
    setIsNew(true)
  }

  async function save() {
    if (!editing) return
    const saved = await upsertPlantItem(sb, { ...editing, user_id: userId })
    if (saved) {
      if (isNew) setItems(prev => [...prev, saved])
      else setItems(prev => prev.map(p => p.id === saved.id ? saved : p))
    }
    setEditing(null)
  }

  async function remove(id: string) {
    if (!confirm('Delete this plant item?')) return
    await deletePlantItem(sb, id)
    setItems(prev => prev.filter(p => p.id !== id))
  }

  async function duplicate(item: BOPlantItem) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _c, updated_at: _u, ...row } = item as BOPlantItem & { created_at?: string; updated_at?: string }
    const saved = await upsertPlantItem(sb, { ...row, user_id: userId, name: `${item.name} (copy)`, display_order: items.length })
    if (saved) setItems(prev => [...prev, saved])
  }

  async function toggleActive(item: BOPlantItem) {
    const updated = { ...item, active: !item.active }
    setItems(prev => prev.map(p => p.id === item.id ? updated : p))
    await upsertPlantItem(sb, updated)
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading plant items…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Plant & Equipment</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Default hire rates and markup for plant and equipment used across phases.</p>
        </div>
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Item
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            {['Plant / Equipment', 'Unit', 'Default Hire Cost', 'Markup %', 'Active', ''].map(h => (
              <th key={h} style={{ padding: '7px 8px', textAlign: h === 'Default Hire Cost' || h === 'Markup %' ? 'right' : 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '7px 8px', fontWeight: 500, color: '#1e293b' }}>{item.name}</td>
              <td style={{ padding: '7px 8px', color: '#64748b' }}>
                {PLANT_UNITS.find(u => u.value === item.unit)?.label ?? item.unit}
              </td>
              <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1e293b' }}>£{item.default_cost.toFixed(2)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{item.markup_pct}%</td>
              <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: item.active ? '#dcfce7' : '#f1f5f9', color: item.active ? '#166534' : '#64748b' }}>
                  {item.active ? 'Active' : 'Off'}
                </span>
              </td>
              <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button onClick={() => toggleActive(item)} title={item.active ? 'Deactivate' : 'Activate'} style={{ padding: '2px 5px', border: `1px solid ${item.active ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 4, background: item.active ? '#f0fdf4' : '#f8fafc', color: item.active ? '#16a34a' : '#94a3b8', fontSize: 10, cursor: 'pointer', marginRight: 2 }}>{item.active ? '●' : '○'}</button>
                <button onClick={() => duplicate(item)} title="Duplicate" style={{ padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>⧉</button>
                <button onClick={() => { setEditing({ ...item }); setIsNew(false) }} style={{ padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>✏️</button>
                <button onClick={() => remove(item.id)} style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8, marginTop: 8 }}>
          No plant items yet. Click <strong>Add Item</strong> to get started.
        </div>
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{isNew ? '+ New Plant Item' : '✏️ Edit Plant Item'}</div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
              <div>
                <label style={lbl}>Item Name</label>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={inp} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Unit</label>
                  <select value={editing.unit} onChange={e => setEditing({ ...editing, unit: e.target.value })} style={inp}>
                    {PLANT_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Default Cost (£)</label>
                  <input type="number" min={0} step={1} value={editing.default_cost} onChange={e => setEditing({ ...editing, default_cost: +e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Markup %</label>
                  <input type="number" min={0} max={200} step={1} value={editing.markup_pct} onChange={e => setEditing({ ...editing, markup_pct: +e.target.value })} style={inp} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} />
                Active
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button onClick={() => setEditing(null)} style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} style={{ padding: '8px 22px', background: '#4a90a4', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
