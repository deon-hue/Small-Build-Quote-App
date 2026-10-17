'use client'

// The list of items a request for a price asks suppliers to price one by one: what and how many. Items are added from the Back Office products list (with a quantity, and a new
// product can be created there and then, which saves it to Back Office), or typed in by hand. It never carries a price of ours.

import React, { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchProducts } from '@/lib/back-office-queries'
import type { BOProduct } from '@/lib/back-office-types'
import ProductPicker from './ProductPicker'
import type { OrderItem } from '@/lib/job-orders'

let counter = 0
export const newItemId = () => `it-${Date.now().toString(36)}-${++counter}`

export default function PriceRequestItems({ ownerId, items, onChange }: { ownerId: string | null; items: OrderItem[]; onChange: (items: OrderItem[]) => void }) {
  const [products, setProducts] = useState<BOProduct[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(false)

  const inp: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  const btn: React.CSSProperties = { padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer' }
  const lab: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }

  async function openPicker() {
    if (!ownerId) return
    setLoading(true)
    try { if (!products) setProducts(await fetchProducts(createClient(), ownerId)) } finally { setLoading(false) }
    setPicking(true)
  }

  const update = (id: string, patch: Partial<OrderItem>) => onChange(items.map(i => (i.id === id ? { ...i, ...patch } : i)))

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, background: '#fff' }}>
      <label style={lab}>Items to be priced ({items.filter(i => i.name.trim() && i.qty > 0).length})</label>
      {items.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Add what you need priced, with the quantity. The supplier is sent them as a list to quote from.</div>}
      {items.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 80px 70px 28px', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>What</div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>How many</div>
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Unit</div>
          <div />
          {items.map(it => (
            <React.Fragment key={it.id}>
              <input style={inp} value={it.name} onChange={e => update(it.id, { name: e.target.value })} placeholder="e.g. Dense concrete block 100mm" />
              <input style={inp} type="number" min={0} step="any" value={it.qty || ''} onChange={e => update(it.id, { qty: Math.max(0, +e.target.value || 0) })} />
              <input style={inp} value={it.unit} onChange={e => update(it.id, { unit: e.target.value })} placeholder="no, m, m²…" />
              <button onClick={() => onChange(items.filter(i => i.id !== it.id))} aria-label="Remove this item" style={{ ...btn, padding: '4px 0', color: '#dc2626', borderColor: '#fecaca' }}>×</button>
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={openPicker} disabled={!ownerId || loading} style={btn}>{loading ? 'Loading products…' : '＋ Add from your products'}</button>
        <button onClick={() => onChange([...items, { id: newItemId(), name: '', qty: 1, unit: '' }])} style={btn}>＋ Add a line by hand</button>
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>Not in your products? In the product list press &quot;+ New Product&quot; and it is saved to Back Office and added here.</div>
      {picking && products && (
        <ProductPicker
          products={products}
          purpose="request"
          onAdd={p => {
            // a product added a second time just adds to the quantity
            const existing = items.find(i => i.name === p.name && i.unit === p.unit)
            if (existing) onChange(items.map(i => (i.id === existing.id ? { ...i, qty: +(i.qty + p.qty).toFixed(2) } : i)))
            else onChange([...items, { id: newItemId(), name: p.name, qty: p.qty, unit: p.unit }])
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
