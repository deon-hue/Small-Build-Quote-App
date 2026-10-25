'use client'

/**
 * Picks a product from the Back Office product list (bo_products, the same list as Back Office > Products) for a plumbing item: a bath suite, a boiler, a radiator. Shows the products of the item's usual
 * category first (with the others one click away), a search, and a small "+ New product" form that saves to the same list, so the list can be built up as you go. Calls onPick with the name and our cost.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import type { BOProduct } from '@/lib/back-office-types'

export interface PickedProduct { id: string; name: string; cost: number; supplier?: string }

interface Props {
  /** the category this kind of item is usually kept under (Back Office > Products) */
  category: string
  /** what is being chosen, for the heading: "radiator", "boiler"... */
  what: string
  onPick: (p: PickedProduct) => void
  onClose: () => void
}

const inp: React.CSSProperties = { padding: '6px 9px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#fff', color: '#0f172a' }

export default function PlumbProductPicker({ category, what, onPick, onClose }: Props) {
  const [products, setProducts] = useState<BOProduct[] | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [allCats, setAllCats] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', cost: 0, supplier: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const sb = createClient()
        const { data: { user } } = await sb.auth.getUser()
        if (!user) { if (live) { setError('Sign in to see your product list.'); setProducts([]) } return }
        const { data, error: e } = await sb.from('bo_products').select('*').eq('user_id', user.id).eq('active', true).order('name')
        if (!live) return
        if (e) { setError(e.message); setProducts([]) } else setProducts((data ?? []) as BOProduct[])
      } catch (e) { if (live) { setError(e instanceof Error ? e.message : 'Could not load the product list'); setProducts([]) } }
    })()
    return () => { live = false }
  }, [])

  const shown = useMemo(() => {
    const q = search.toLowerCase().trim()
    return (products ?? []).filter(p => (allCats || p.category === category) && (!q || p.name.toLowerCase().includes(q) || (p.supplier ?? '').toLowerCase().includes(q)))
  }, [products, search, allCats, category])
  const inCategory = (products ?? []).filter(p => p.category === category).length

  async function saveNew() {
    if (!form.name.trim()) return
    setSaving(true); setError('')
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setError('Not signed in'); return }
      const { data, error: e } = await sb.from('bo_products').insert({
        user_id: user.id, name: form.name.trim(), category, unit: 'item', default_cost: form.cost, supplier: form.supplier, waste_pct: 0, markup_pct: 20, phase_id: null, active: true, updated_at: new Date().toISOString(),
      }).select().single()
      if (e || !data) { setError(e?.message ?? 'Save failed'); return }
      const p = data as BOProduct
      setProducts(prev => [...(prev ?? []), p])
      onPick({ id: p.id, name: p.name, cost: p.default_cost, supplier: p.supplier || undefined })
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') } finally { setSaving(false) }
  }

  // (drawn on the page itself, above any calculator window it was opened from)
  const picker = (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', color: '#0f172a', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>📦 Choose the {what}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={() => setAdding(a => !a)} style={{ ...inp, cursor: 'pointer', background: adding ? '#eff6ff' : '#f0fdf4', fontWeight: 600, fontSize: 12 }}>{adding ? '✕ Cancel' : '+ New product'}</button>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
          </div>
        </div>
        {adding && (
          <div style={{ padding: '12px 16px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8' }}>Name<input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={`e.g. ${what}`} style={{ ...inp, width: '100%' }} /></label>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8' }}>Our cost £<input type="number" min={0} step={1} value={form.cost} onChange={e => setForm(f => ({ ...f, cost: Math.max(0, +e.target.value || 0) }))} style={{ ...inp, width: '100%' }} /></label>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8' }}>Supplier<input value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} style={{ ...inp, width: '100%' }} /></label>
            <button type="button" disabled={saving || !form.name.trim()} onClick={saveNew} style={{ ...inp, cursor: 'pointer', background: '#16a34a', color: '#fff', fontWeight: 700, border: 'none' }}>{saving ? '…' : 'Save and use'}</button>
          </div>
        )}
        <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or supplier…" style={{ ...inp, flex: 1 }} />
          <label style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }}><input type="checkbox" checked={allCats} onChange={e => setAllCats(e.target.checked)} /> All categories</label>
        </div>
        {error && <div style={{ padding: '6px 16px', fontSize: 12, color: '#b91c1c' }}>{error}</div>}
        <div style={{ overflow: 'auto', padding: '4px 8px 10px' }}>
          {products === null && <div style={{ padding: 16, fontSize: 13, color: '#64748b' }}>Loading your product list…</div>}
          {products !== null && shown.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              {(products.length === 0) ? 'Your product list is empty.' : !allCats && inCategory === 0 ? `Nothing is filed under "${category}" yet.` : 'No product matches.'}
              {' '}Add one with "+ New product" above, or in Back Office &gt; Products (category "{category}").
            </div>
          )}
          {shown.map(p => (
            <button key={p.id} type="button" onClick={() => onPick({ id: p.id, name: p.name, cost: p.default_cost, supplier: p.supplier || undefined })}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, textAlign: 'left', padding: '8px 10px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: '#0f172a' }}>
              <span><span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span><br /><span style={{ fontSize: 11, color: '#94a3b8' }}>{p.category}{p.supplier ? ` · ${p.supplier}` : ''}</span></span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', whiteSpace: 'nowrap' }}>£{p.default_cost.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(picker, document.body)
}
