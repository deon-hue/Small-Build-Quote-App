'use client'

/**
 * ProductPicker — searchable modal to select products from Back Office.
 * Includes an inline "+ New Product" form that saves to BO and adds to the quote.
 */

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BOProduct } from '@/lib/back-office-types'
import type { QuoteProduct } from '@/lib/types'
import { PRODUCT_CATEGORIES, TASK_UNITS } from '@/lib/back-office-types'

function uid() { return Math.random().toString(36).slice(2, 10) }

interface Props {
  products:   BOProduct[]
  onAdd:      (product: QuoteProduct) => void
  onClose:    () => void
}

export default function ProductPicker({ products, onAdd, onClose }: Props) {
  const [search,     setSearch]     = useState('')
  const [catFilter,  setCatFilter]  = useState('All')
  const [qty,        setQty]        = useState<Record<string, number>>({})
  const [localProds, setLocalProds] = useState<BOProduct[]>(products)

  // ── Quick-add form state ─────────────────────────────────────────────────────
  const [adding,     setAdding]     = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveErr,    setSaveErr]    = useState('')
  const [form, setForm] = useState({
    name: '', category: 'General', unit: 'm²',
    default_cost: 0, markup_pct: 20, waste_pct: 10, supplier: '',
  })

  const categories = useMemo(() => {
    const cats = [...new Set([...PRODUCT_CATEGORIES, ...localProds.map(p => p.category)].filter(Boolean))]
    return ['All', ...cats.sort()]
  }, [localProds])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return localProds.filter(p => {
      if (!p.active) return false
      if (catFilter !== 'All' && p.category !== catFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.supplier  ?? '').toLowerCase().includes(q)
      )
    })
  }, [localProds, search, catFilter])

  function handleAdd(p: BOProduct) {
    const itemQty   = qty[p.id] || 1
    const costPrice = p.default_cost
    const sellPrice = +(costPrice * (1 + (p.markup_pct ?? 0) / 100)).toFixed(2)
    onAdd({
      id: uid(), boProductId: p.id, name: p.name, unit: p.unit,
      qty: itemQty, costPrice, sellPrice,
      supplier: p.supplier || undefined, category: p.category || undefined,
      wastePercent: p.waste_pct || undefined, enabled: true,
    })
  }

  async function saveNew() {
    if (!form.name.trim()) return
    setSaving(true); setSaveErr('')
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setSaveErr('Not signed in'); return }

      const { id: _id, created_at: _c, updated_at: _u, ...payload } = {
        user_id: user.id, name: form.name.trim(), category: form.category,
        unit: form.unit, default_cost: form.default_cost, markup_pct: form.markup_pct,
        waste_pct: form.waste_pct, supplier: form.supplier,
        phase_id: null, active: true,
        id: '', created_at: '', updated_at: '',
      } as BOProduct
      void _id; void _c; void _u

      const { data, error } = await sb.from('bo_products')
        .insert({ ...payload, updated_at: new Date().toISOString() })
        .select().single()

      if (error || !data) { setSaveErr(error?.message ?? 'Save failed'); return }

      const newProd = data as BOProduct
      setLocalProds(prev => [...prev, newProd])
      handleAdd(newProd)
      setAdding(false)
      setForm({ name: '', category: 'General', unit: 'm²', default_cost: 0, markup_pct: 20, waste_pct: 10, supplier: '' })
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
  const fInp: React.CSSProperties = { padding: '5px 8px', border: '1px solid #bfdbfe', borderRadius: 5, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, width: '100%' }
  const fLbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>📦 Add Product</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setAdding(a => !a); setSaveErr('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: adding ? '#eff6ff' : '#f0fdf4', border: `1px solid ${adding ? '#bfdbfe' : '#86efac'}`, borderRadius: 6, color: adding ? '#1d4ed8' : '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {adding ? '✕ Cancel' : '+ New Product'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
          </div>
        </div>

        {/* Quick-add form */}
        {adding && (
          <div style={{ padding: '14px 18px', background: '#eff6ff', borderBottom: '2px solid #bfdbfe' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 10 }}>New Product — saves to Back Office and adds to quote</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={fLbl}>Product Name *</label>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveNew()}
                  placeholder="e.g. Dense concrete block 100mm" style={fInp} />
              </div>
              <div>
                <label style={fLbl}>Category</label>
                <input list="pp-cats" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={fInp} />
                <datalist id="pp-cats">{categories.filter(c => c !== 'All').map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label style={fLbl}>Unit</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={fInp}>
                  {TASK_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={fLbl}>Cost price (£)</label>
                <input type="number" min={0} step={0.01} value={form.default_cost} onChange={e => setForm(f => ({ ...f, default_cost: +e.target.value }))} style={fInp} />
              </div>
              <div>
                <label style={fLbl}>Markup %</label>
                <input type="number" min={0} max={200} step={1} value={form.markup_pct} onChange={e => setForm(f => ({ ...f, markup_pct: +e.target.value }))} style={fInp} />
              </div>
              <div>
                <label style={fLbl}>Waste %</label>
                <input type="number" min={0} max={50} step={1} value={form.waste_pct} onChange={e => setForm(f => ({ ...f, waste_pct: +e.target.value }))} style={fInp} />
              </div>
              <div>
                <label style={fLbl}>Supplier</label>
                <input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} placeholder="Optional" style={fInp} />
              </div>
            </div>
            {saveErr && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>⚠️ {saveErr}</div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={saveNew} disabled={saving || !form.name.trim()}
                style={{ padding: '7px 18px', background: saving ? '#94a3b8' : '#1d4ed8', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving…' : '💾 Save to Back Office & Add to Quote'}
              </button>
              <span style={{ fontSize: 11, color: '#64748b' }}>Sell: £{(form.default_cost * (1 + form.markup_pct / 100)).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              style={{ ...inp, width: '100%', paddingLeft: 30 }}
              autoFocus={!adding} />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ ...inp, minWidth: 140 }}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Product list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {localProds.filter(p => p.active).length === 0
                ? 'No products in Back Office yet — use "+ New Product" above to create one.'
                : 'No products match your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Product', 'Category', 'Supplier', 'Unit', 'Cost', 'Sell', 'Qty', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const sell    = +(p.default_cost * (1 + (p.markup_pct ?? 0) / 100)).toFixed(2)
                  const itemQty = qty[p.id] ?? 1
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b', maxWidth: 200 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</div>
                        {p.waste_pct > 0 && <div style={{ fontSize: 10, color: '#94a3b8' }}>+{p.waste_pct}% waste</div>}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#f1f5f9', color: '#64748b' }}>{p.category || '—'}</span>
                      </td>
                      <td style={{ padding: '8px 10px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{p.supplier || '—'}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{p.unit}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#374151', whiteSpace: 'nowrap' }}>£{p.default_cost.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#16a34a', whiteSpace: 'nowrap' }}>£{sell.toFixed(2)}</td>
                      <td style={{ padding: '8px 6px', width: 64 }}>
                        <input type="number" min={0} step={0.1} value={itemQty}
                          onChange={e => setQty(prev => ({ ...prev, [p.id]: Math.max(0, +e.target.value) }))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px 8px', whiteSpace: 'nowrap' }}>
                        <button onClick={() => handleAdd(p)}
                          style={{ padding: '5px 12px', background: '#4a90a4', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          + Add
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding: '10px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
          <span>{filtered.length} product{filtered.length !== 1 ? 's' : ''} shown</span>
          <span>Prices from Back Office · changes here only affect this quote</span>
        </div>
      </div>
    </div>
  )
}
