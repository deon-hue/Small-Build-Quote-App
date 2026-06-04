'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchPlantItems, upsertPlantItem, deletePlantItem, seedPlantLibrary } from '@/lib/back-office-queries'
import type { BOPlantItem } from '@/lib/back-office-types'
import { PLANT_UNITS, PLANT_CATEGORIES } from '@/lib/back-office-types'
import { Plus } from 'lucide-react'

interface Props { userId: string }

const NEW_ITEM = (userId: string, order: number, category: string): BOPlantItem => ({
  id: '', user_id: userId, category, name: 'New Plant Item', description: '',
  unit: 'day', default_cost: 0, charge_rate: 0, markup_pct: 25, supplier: '',
  operator_required: false, notes: '', ownership: 'hired', transport_cost: 0,
  fuel_cost_per_unit: 0, phase_id: null, active: true, display_order: order,
})

const unitLabel = (u: string) => PLANT_UNITS.find(x => x.value === u)?.label ?? u

export default function SectionPlant({ userId }: Props) {
  const sb = createClient()
  const [items, setItems] = useState<BOPlantItem[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [editing, setEditing] = useState<BOPlantItem | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('All')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())   // empty = all collapsed
  const toggleCat = (c: string) => setExpanded(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })

  const load = useCallback(async () => {
    setLoading(true)
    setItems(await fetchPlantItems(sb, userId))
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function openNew() {
    const cat = categoryFilter !== 'All' ? categoryFilter : PLANT_CATEGORIES[0]
    setEditing(NEW_ITEM(userId, items.length, cat))
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

  async function loadLibrary() {
    if (!confirm('Add the standard UK plant & equipment library? Items you already have (by name) are skipped — nothing is overwritten.')) return
    setSeeding(true)
    const inserted = await seedPlantLibrary(sb, userId, items)
    setSeeding(false)
    if (inserted.length) setItems(prev => [...prev, ...inserted])
    alert(inserted.length ? `Added ${inserted.length} plant item${inserted.length !== 1 ? 's' : ''}.` : 'Nothing to add — your library already has these items.')
  }

  // Group items by category, in PLANT_CATEGORIES order, then any unknown categories.
  const grouped = useMemo(() => {
    const visible = categoryFilter === 'All' ? items : items.filter(i => i.category === categoryFilter)
    const byCat = new Map<string, BOPlantItem[]>()
    for (const it of visible) {
      const c = it.category || 'General'
      if (!byCat.has(c)) byCat.set(c, [])
      byCat.get(c)!.push(it)
    }
    const ordered: Array<[string, BOPlantItem[]]> = []
    for (const c of PLANT_CATEGORIES) if (byCat.has(c)) { ordered.push([c, byCat.get(c)!]); byCat.delete(c) }
    for (const [c, list] of byCat) ordered.push([c, list])
    return ordered
  }, [items, categoryFilter])

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading plant items…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Plant & Equipment</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Master plant library — cost &amp; charge rates, suppliers and operators. The single source of truth for plant across Takeoff, Quotes, Jobs and AI Scope.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadLibrary} disabled={seeding} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#fff', border: '1px solid #4a90a4', borderRadius: 7, color: '#2a7090', fontSize: 13, fontWeight: 600, cursor: seeding ? 'wait' : 'pointer' }}>
            {seeding ? 'Loading…' : '⬇ Load Standard Library'}
          </button>
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      {/* Category filter + expand/collapse */}
      <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, color: '#374151', background: categoryFilter !== 'All' ? '#e8f4f8' : '#fff' }}>
          <option value="All">All categories ({items.length})</option>
          {PLANT_CATEGORIES.map(c => {
            const n = items.filter(i => (i.category || 'General') === c).length
            return <option key={c} value={c}>{c} ({n})</option>
          })}
        </select>
        {grouped.length > 0 && (
          <>
            <button onClick={() => setExpanded(new Set(grouped.map(([c]) => c)))}
              style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer' }}>
              ▾▾ Expand All
            </button>
            <button onClick={() => setExpanded(new Set())}
              style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer' }}>
              ▸▸ Collapse All
            </button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8 }}>
          No plant items yet. Click <strong>Load Standard Library</strong> to import the standard UK plant set, or <strong>Add Item</strong> to create your own.
        </div>
      ) : grouped.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13 }}>No plant items in this category.</div>
      ) : grouped.map(([category, list]) => {
        const isOpen = expanded.has(category)
        return (
        <div key={category} style={{ marginBottom: 18 }}>
          <div onClick={() => toggleCat(category)} title={isOpen ? 'Collapse' : 'Expand'} style={{ background: '#2c3e50', color: '#ecf0f1', padding: '7px 14px', borderRadius: isOpen ? '8px 8px 0 0' : 8, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <span style={{ width: 12, flexShrink: 0, lineHeight: 1 }}>{isOpen ? '▾' : '▸'}</span>
            <span style={{ flex: 1 }}>{category}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 400 }}>{list.length} item{list.length !== 1 ? 's' : ''}</span>
          </div>
          {isOpen && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, border: '1px solid #e2e8f0', borderTop: 'none' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Plant / Equipment', 'Unit', 'Cost Rate', 'Charge Rate', 'Markup', 'Supplier', 'Operator', 'Active', ''].map(h => (
                  <th key={h} style={{ padding: '6px 8px', textAlign: ['Cost Rate', 'Charge Rate', 'Markup'].includes(h) ? 'right' : 'left', fontWeight: 700, color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: item.active ? 1 : 0.5 }}>
                  <td style={{ padding: '7px 8px', color: '#1e293b' }}>
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.description}</div>}
                  </td>
                  <td style={{ padding: '7px 8px', color: '#64748b' }}>{unitLabel(item.unit)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1e293b' }}>£{item.default_cost.toFixed(2)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#0f766e', fontWeight: 600 }}>£{item.charge_rate.toFixed(2)}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{item.markup_pct}%</td>
                  <td style={{ padding: '7px 8px', color: '#64748b' }}>{item.supplier || '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'center' }}>{item.operator_required ? '👷 Yes' : '—'}</td>
                  <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: item.active ? '#dcfce7' : '#f1f5f9', color: item.active ? '#166534' : '#64748b' }}>{item.active ? 'Active' : 'Off'}</span>
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => toggleActive(item)} title={item.active ? 'Deactivate' : 'Activate'} style={{ padding: '2px 5px', border: `1px solid ${item.active ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 4, background: item.active ? '#f0fdf4' : '#f8fafc', color: item.active ? '#16a34a' : '#94a3b8', fontSize: 10, cursor: 'pointer', marginRight: 2 }}>{item.active ? '●' : '○'}</button>
                    <button onClick={() => duplicate(item)} title="Duplicate" style={{ padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>⧉</button>
                    <button onClick={() => { setEditing({ ...item }); setIsNew(false) }} title="Edit" style={{ padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>✏️</button>
                    <button onClick={() => remove(item.id)} title="Delete" style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          )}
        </div>
        )
      })}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{isNew ? '+ New Plant Item' : '✏️ Edit Plant Item'}</div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Category</label>
                  <select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} style={inp}>
                    {PLANT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Unit</label>
                  <select value={editing.unit} onChange={e => setEditing({ ...editing, unit: e.target.value })} style={inp}>
                    {PLANT_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Plant Name</label>
                <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={inp} />
              </div>
              <div>
                <label style={lbl}>Description</label>
                <input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} style={inp} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={lbl}>Cost Rate (£)</label>
                  <input type="number" min={0} step={1} value={editing.default_cost} onChange={e => setEditing({ ...editing, default_cost: +e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Markup %</label>
                  <input type="number" min={0} max={200} step={1} value={editing.markup_pct} onChange={e => setEditing({ ...editing, markup_pct: +e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Charge Rate (£)</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input type="number" min={0} step={1} value={editing.charge_rate} onChange={e => setEditing({ ...editing, charge_rate: +e.target.value })} style={inp} />
                    <button onClick={() => setEditing({ ...editing, charge_rate: Math.round(editing.default_cost * (1 + editing.markup_pct / 100)) })} title="Recalculate charge from cost + markup" style={{ flexShrink: 0, padding: '0 8px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', color: '#475569', fontSize: 14, cursor: 'pointer' }}>↻</button>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Supplier</label>
                  <input value={editing.supplier} onChange={e => setEditing({ ...editing, supplier: e.target.value })} placeholder="e.g. HSS, Speedy, owned" style={inp} />
                </div>
                <div>
                  <label style={lbl}>Ownership</label>
                  <select value={editing.ownership} onChange={e => setEditing({ ...editing, ownership: e.target.value })} style={inp}>
                    <option value="hired">Hired</option>
                    <option value="owned">Owned</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={lbl}>Notes</label>
                <textarea value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} style={{ ...inp, resize: 'vertical', minHeight: 52 }} />
              </div>
              <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.operator_required} onChange={e => setEditing({ ...editing, operator_required: e.target.checked })} /> Operator required by default
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={editing.active} onChange={e => setEditing({ ...editing, active: e.target.checked })} /> Active
                </label>
              </div>
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
