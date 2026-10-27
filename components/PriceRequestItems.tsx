'use client'

// The list of items a request for a price asks suppliers to price one by one: what and how many. Items are added from the Back Office products list (with a quantity, and a new
// product can be created there and then, which saves it to Back Office), or typed in by hand. It never carries a price of ours. Each item can also have a PICTURE so the supplier can see what is
// wanted: chosen from a file or the phone's camera, pasted (Ctrl+V on the item, or the Paste button) or dropped onto the item (lib/order-item-images.ts). The supplier sees it on their price page.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import NumInput from '@/components/NumInput'
import { createClient } from '@/lib/supabase/client'
import { fetchProducts } from '@/lib/back-office-queries'
import type { BOProduct } from '@/lib/back-office-types'
import ProductPicker from './ProductPicker'
import type { OrderItem } from '@/lib/job-orders'
import { uploadItemImage, itemImageUrl } from '@/lib/order-item-images'

let counter = 0
export const newItemId = () => `it-${Date.now().toString(36)}-${++counter}`

/** The small picture of an item, from a link signed for this screen. */
function ItemThumb({ path, size = 56 }: { path: string; size?: number }) {
  const sb = useMemo(() => createClient(), [])
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    setUrl(null); setFailed(false)
    itemImageUrl(sb, path).then(u => { if (!alive) return; if (u) setUrl(u); else setFailed(true) }).catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [sb, path])
  const box: React.CSSProperties = { width: size, height: size, borderRadius: 6, border: '1px solid #cbd5e1', background: '#f1f5f9', objectFit: 'cover', display: 'block', flexShrink: 0 }
  if (url) return (
    <a href={url} target="_blank" rel="noreferrer" title="Open the picture" style={{ flexShrink: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="The item" style={box} />
    </a>
  )
  return <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8', textAlign: 'center' }}>{failed ? 'no picture' : '…'}</div>
}

export default function PriceRequestItems({ ownerId, items, onChange }: { ownerId: string | null; items: OrderItem[]; onChange: (items: OrderItem[]) => void }) {
  const [products, setProducts] = useState<BOProduct[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [loading, setLoading] = useState(false)
  const sb = useMemo(() => createClient(), [])
  // the item a picture is being saved for, and anything that went wrong
  const [busyId, setBusyId] = useState<string | null>(null)
  const [imgError, setImgError] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  // the list as it is NOW, so a picture that finishes saving after another edit does not undo that edit
  const latest = useRef(items)
  latest.current = items

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

  async function attach(id: string, file: File) {
    setImgError(''); setBusyId(id)
    try {
      const r = await uploadItemImage(sb, file)
      if ('error' in r) { setImgError(r.error); return }
      if (!latest.current.some(i => i.id === id)) return   // the item was removed while the picture was saving
      onChange(latest.current.map(i => (i.id === id ? { ...i, image: r.path } : i)))
    } finally { setBusyId(null) }
  }

  const imageIn = (dt: DataTransfer | null): File | null => {
    if (!dt) return null
    const f = Array.from(dt.files ?? []).find(x => x.type.startsWith('image/'))
    if (f) return f
    for (const it of Array.from(dt.items ?? [])) { if (it.kind === 'file' && it.type.startsWith('image/')) { const g = it.getAsFile(); if (g) return g } }
    return null
  }

  // the Paste button: reads the clipboard (the browser asks permission once). Ctrl+V on the item works without it.
  async function pasteFor(id: string) {
    setImgError('')
    try {
      const entries = await navigator.clipboard.read()
      for (const e of entries) {
        const type = e.types.find(t => t.startsWith('image/'))
        if (type) { const blob = await e.getType(type); await attach(id, new File([blob], 'pasted.' + (type.split('/')[1] || 'png'), { type })); return }
      }
      setImgError('There is no picture on the clipboard. Copy one first (or take a screenshot), then press Paste.')
    } catch { setImgError('This browser would not let the button read the clipboard. Click in the item name and press Ctrl+V instead.') }
  }

  return (
    <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, background: '#fff' }}>
      <label style={lab}>Items to be priced ({items.filter(i => i.name.trim() && i.qty > 0).length})</label>
      {items.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>Add what you need priced, with the quantity. The supplier is sent them as a list to quote from.</div>}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 80px 70px 28px', gap: 6, alignItems: 'center' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>What</div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>How many</div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>Unit</div>
            <div />
          </div>
          {items.map(it => (
            <div
              key={it.id}
              onPaste={e => { const f = imageIn(e.clipboardData); if (f) { e.preventDefault(); attach(it.id, f) } }}
              onDragOver={e => { if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) { e.preventDefault(); setDragId(it.id) } }}
              onDragLeave={() => setDragId(d => (d === it.id ? null : d))}
              onDrop={e => { setDragId(null); const f = imageIn(e.dataTransfer); if (f) { e.preventDefault(); attach(it.id, f) } }}
              style={{ borderRadius: 8, padding: 4, margin: -4, background: dragId === it.id ? '#f0fdf4' : undefined, outline: dragId === it.id ? '2px dashed #7ab533' : undefined }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 80px 70px 28px', gap: 6, alignItems: 'center' }}>
                <input style={inp} value={it.name} onChange={e => update(it.id, { name: e.target.value })} placeholder="e.g. Dense concrete block 100mm" />
                <NumInput style={inp} type="number" min={0} step="any" value={it.qty || ''} onChange={e => update(it.id, { qty: Math.max(0, +e.target.value || 0) })} />
                <input style={inp} value={it.unit} onChange={e => update(it.id, { unit: e.target.value })} placeholder="no, m, m²…" />
                <button onClick={() => onChange(items.filter(i => i.id !== it.id))} aria-label="Remove this item" style={{ ...btn, padding: '4px 0', color: '#dc2626', borderColor: '#fecaca' }}>×</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
                {it.image && <ItemThumb path={it.image} />}
                {busyId === it.id && <span style={{ fontSize: 12, color: '#64748b' }}>Saving the picture…</span>}
                <label style={{ ...btn, padding: '4px 10px', fontWeight: 600, cursor: 'pointer', display: 'inline-block' }}>
                  {it.image ? '🖼 Change picture' : '🖼 Add a picture'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) attach(it.id, f) }} />
                </label>
                <button type="button" onClick={() => pasteFor(it.id)} style={{ ...btn, padding: '4px 10px' }} title="Paste a picture you have copied">📋 Paste</button>
                {it.image && <button type="button" onClick={() => update(it.id, { image: undefined })} style={{ ...btn, padding: '4px 10px', color: '#dc2626', borderColor: '#fecaca' }}>Remove picture</button>}
                {!it.image && <span style={{ fontSize: 11, color: '#94a3b8' }}>or drop one here, or click this item and press Ctrl+V</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={openPicker} disabled={!ownerId || loading} style={btn}>{loading ? 'Loading products…' : '＋ Add from your products'}</button>
        <button onClick={() => onChange([...items, { id: newItemId(), name: '', qty: 1, unit: '' }])} style={btn}>＋ Add a line by hand</button>
      </div>
      {imgError && <div style={{ fontSize: 12, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '6px 10px', marginTop: 8 }}>{imgError}</div>}
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
