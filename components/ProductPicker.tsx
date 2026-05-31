'use client'

/**
 * ProductPicker — searchable modal to select products from Back Office.
 * Returns a QuoteProduct ready to be added to a sub-phase.
 */

import { useState, useMemo } from 'react'
import type { BOProduct } from '@/lib/back-office-types'
import type { QuoteProduct } from '@/lib/types'

function uid() { return Math.random().toString(36).slice(2, 10) }

interface Props {
  products:   BOProduct[]
  onAdd:      (product: QuoteProduct) => void
  onClose:    () => void
}

export default function ProductPicker({ products, onAdd, onClose }: Props) {
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('All')
  const [qty, setQty]               = useState<Record<string, number>>({})

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))]
    return ['All', ...cats.sort()]
  }, [products])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return products.filter(p => {
      if (!p.active) return false
      if (catFilter !== 'All' && p.category !== catFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q) ||
        (p.supplier  ?? '').toLowerCase().includes(q)
      )
    })
  }, [products, search, catFilter])

  function handleAdd(p: BOProduct) {
    const itemQty     = qty[p.id] || 1
    const costPrice   = p.default_cost
    const sellPrice   = +(costPrice * (1 + (p.markup_pct ?? 0) / 100)).toFixed(2)
    const product: QuoteProduct = {
      id:          uid(),
      boProductId: p.id,
      name:        p.name,
      unit:        p.unit,
      qty:         itemQty,
      costPrice,
      sellPrice,
      supplier:    p.supplier || undefined,
      category:    p.category || undefined,
      wastePercent:p.waste_pct || undefined,
      enabled:     true,
    }
    onAdd(product)
  }

  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 740, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>📦 Add Product</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products…"
              style={{ ...inp, width: '100%', paddingLeft: 30 }}
              autoFocus />
          </div>
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            style={{ ...inp, minWidth: 140 }}>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Product list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {products.filter(p => p.active).length === 0
                ? 'No products in Back Office yet. Add products in Back Office → Products.'
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
                  const sell = +(p.default_cost * (1 + (p.markup_pct ?? 0) / 100)).toFixed(2)
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
