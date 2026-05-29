'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchProducts, upsertProduct, deleteProduct } from '@/lib/back-office-queries'
import type { BOProduct } from '@/lib/back-office-types'
import { PRODUCT_CATEGORIES, TASK_UNITS } from '@/lib/back-office-types'
import { Plus, Trash2, Search } from 'lucide-react'

interface Props { userId: string }

const EMPTY: Omit<BOProduct, 'id' | 'created_at' | 'updated_at'> = {
  user_id: '', name: 'New Product', category: 'General', unit: 'item',
  default_cost: 0, supplier: '', waste_pct: 10, markup_pct: 20, phase_id: null, active: true,
}

export default function SectionProducts({ userId }: Props) {
  const sb = createClient()
  const [products, setProducts] = useState<BOProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BOProduct | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')

  const load = useCallback(async () => {
    setLoading(true)
    setProducts(await fetchProducts(sb, userId))
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing({ ...EMPTY, user_id: userId, id: '', created_at: '', updated_at: '' } as BOProduct)
    setIsNew(true)
  }

  function openEdit(p: BOProduct) { setEditing({ ...p }); setIsNew(false) }

  async function save() {
    if (!editing) return
    const saved = await upsertProduct(sb, { ...editing, user_id: userId })
    if (saved) {
      if (isNew) setProducts(prev => [...prev, saved])
      else setProducts(prev => prev.map(p => p.id === saved.id ? saved : p))
    }
    setEditing(null)
  }

  async function remove(id: string) {
    if (!confirm('Delete this product?')) return
    await deleteProduct(sb, id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  async function duplicate(product: BOProduct) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _c, updated_at: _u, ...row } = product as BOProduct & { created_at?: string; updated_at?: string }
    const saved = await upsertProduct(sb, { ...row, user_id: userId, name: `${product.name} (copy)` })
    if (saved) setProducts(prev => [...prev, saved])
  }

  async function toggleActive(product: BOProduct) {
    const updated = { ...product, active: !product.active }
    setProducts(prev => prev.map(p => p.id === product.id ? updated : p))
    await upsertProduct(sb, updated)
  }

  const categories = ['All', ...Array.from(new Set(products.map(p => p.category))).sort()]
  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'All' || p.category === filterCat
    return matchSearch && matchCat
  })

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading products…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Products / Materials</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Default material costs, waste allowances and markup for use in estimates.</p>
        </div>
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Add Product
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            style={{ width: '100%', padding: '7px 8px 7px 28px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}>
          {categories.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
            {['Product', 'Category', 'Unit', 'Cost', 'Waste %', 'Markup %', 'Supplier', 'Active', ''].map(h => (
              <th key={h} style={{ padding: '7px 8px', textAlign: h === 'Cost' || h === 'Waste %' || h === 'Markup %' ? 'right' : 'left', fontWeight: 700, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '7px 8px', fontWeight: 500, color: '#1e293b' }}>{p.name}</td>
              <td style={{ padding: '7px 8px', color: '#64748b' }}>
                <span style={{ fontSize: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 99, padding: '2px 8px' }}>{p.category}</span>
              </td>
              <td style={{ padding: '7px 8px', color: '#64748b' }}>{p.unit}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'monospace', color: '#1e293b' }}>£{p.default_cost.toFixed(2)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{p.waste_pct}%</td>
              <td style={{ padding: '7px 8px', textAlign: 'right', color: '#64748b' }}>{p.markup_pct}%</td>
              <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: 11 }}>{p.supplier || '—'}</td>
              <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: p.active ? '#dcfce7' : '#f1f5f9', color: p.active ? '#166534' : '#64748b' }}>
                  {p.active ? 'Active' : 'Off'}
                </span>
              </td>
              <td style={{ padding: '4px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button onClick={() => toggleActive(p)} title={p.active ? 'Deactivate' : 'Activate'} style={{ padding: '2px 5px', border: `1px solid ${p.active ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 4, background: p.active ? '#f0fdf4' : '#f8fafc', color: p.active ? '#16a34a' : '#94a3b8', fontSize: 10, cursor: 'pointer', marginRight: 2 }}>{p.active ? '●' : '○'}</button>
                <button onClick={() => duplicate(p)} title="Duplicate" style={{ padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>⧉</button>
                <button onClick={() => openEdit(p)} style={{ padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>✏️</button>
                <button onClick={() => remove(p.id)} style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8, marginTop: 8 }}>
          {products.length === 0 ? 'No products yet.' : 'No results match your filter.'}
        </div>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>{filtered.length} of {products.length} products</div>

      {/* Edit modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 600, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{isNew ? '+ New Product' : '✏️ Edit Product'}</div>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Product Name</label>
                  <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Category</label>
                  <select value={editing.category} onChange={e => setEditing({ ...editing, category: e.target.value })} style={inp}>
                    {PRODUCT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Unit</label>
                  <select value={editing.unit} onChange={e => setEditing({ ...editing, unit: e.target.value })} style={inp}>
                    {TASK_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Default Cost (£)</label>
                  <input type="number" min={0} step={0.01} value={editing.default_cost} onChange={e => setEditing({ ...editing, default_cost: +e.target.value })} style={inp} />
                </div>
                <div>
                  <label style={lbl}>Supplier</label>
                  <input value={editing.supplier} onChange={e => setEditing({ ...editing, supplier: e.target.value })} placeholder="Optional" style={inp} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lbl}>Waste % (order allowance)</label>
                  <input type="number" min={0} max={50} step={1} value={editing.waste_pct} onChange={e => setEditing({ ...editing, waste_pct: +e.target.value })} style={inp} />
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
