'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchProducts, upsertProduct, deleteProduct } from '@/lib/back-office-queries'
import type { BOProduct } from '@/lib/back-office-types'
import { PRODUCT_CATEGORIES, TASK_UNITS } from '@/lib/back-office-types'
import { Plus, Search, ChevronDown, ChevronRight } from 'lucide-react'

interface Props { userId: string }

const EMPTY: Omit<BOProduct, 'id' | 'created_at' | 'updated_at'> = {
  user_id: '', name: 'New Product', category: 'General', unit: 'item',
  default_cost: 0, supplier: '', waste_pct: 10, markup_pct: 20, phase_id: null, active: true,
}

export default function SectionProducts({ userId }: Props) {
  const sb = createClient()
  const [products, setProducts] = useState<BOProduct[]>([])
  const [loading,         setLoading]         = useState(true)
  const [editing,         setEditing]         = useState<BOProduct | null>(null)
  const [isNew,           setIsNew]           = useState(false)
  const [saveError,       setSaveError]       = useState<string | null>(null)
  const [saving,          setSaving]          = useState(false)
  const [search,          setSearch]          = useState('')
  const [expandedCats,    setExpandedCats]    = useState<Set<string>>(new Set())
  const [customCategories,setCustomCategories]= useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('bo_product_categories') ?? '[]') } catch { return [] }
  })
  const [newCatInput,     setNewCatInput]     = useState('')
  const [addingCat,       setAddingCat]       = useState(false)

  // ── AI Import ──────────────────────────────────────────────────────────────
  const [showAIImport,    setShowAIImport]    = useState(false)
  const [aiCategory,      setAICategory]      = useState('')
  const [aiContext,       setAIContext]        = useState('')
  const [aiUrl,           setAIUrl]           = useState('')
  const [aiLoading,       setAILoading]       = useState(false)
  const [aiProducts,      setAIProducts]      = useState<BOProduct[]>([])
  const [aiSelected,      setAISelected]      = useState<Set<number>>(new Set())
  const [aiImporting,     setAIImporting]     = useState(false)
  const [aiError,         setAIError]         = useState('')

  // ── CSV Import ─────────────────────────────────────────────────────────────
  const [showCSV,         setShowCSV]         = useState(false)
  const [csvRows,         setCsvRows]         = useState<string[][]>([])
  const [csvHeaders,      setCsvHeaders]      = useState<string[]>([])
  const [csvMap,          setCsvMap]          = useState<Record<string, string>>({})
  const [csvSelected,     setCsvSelected]     = useState<Set<number>>(new Set())
  const [csvImporting,    setCSVImporting]    = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)

  function toggleCat(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat); else next.add(cat)
      return next
    })
  }

  function addCustomCategory() {
    const name = newCatInput.trim()
    if (!name) return
    const updated = [...customCategories.filter(c => c !== name), name]
    setCustomCategories(updated)
    localStorage.setItem('bo_product_categories', JSON.stringify(updated))
    setExpandedCats(prev => new Set([...prev, name]))
    setNewCatInput('')
    setAddingCat(false)
  }

  function removeCustomCategory(cat: string) {
    if (products.some(p => p.category === cat)) return  // has products — don't remove
    const updated = customCategories.filter(c => c !== cat)
    setCustomCategories(updated)
    localStorage.setItem('bo_product_categories', JSON.stringify(updated))
  }

  // ── AI Import ─────────────────────────────────────────────────────────────
  async function runAIImport() {
    if (!aiCategory.trim()) return
    setAILoading(true); setAIError(''); setAIProducts([])
    try {
      const res = await fetch('/api/import-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: aiCategory, context: aiContext, url: aiUrl }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setAIError(data.error ?? 'AI import failed'); return }
      const prods = (data.products ?? []).map((p: { name: string; category: string; unit: string; default_cost: number; waste_pct: number; markup_pct: number; supplier: string }) => ({
        ...EMPTY, user_id: userId, id: '', created_at: '', updated_at: '',
        name: p.name, category: p.category || aiCategory,
        unit: p.unit, default_cost: p.default_cost,
        waste_pct: p.waste_pct ?? 10, markup_pct: p.markup_pct ?? 20,
        supplier: p.supplier ?? '',
      })) as BOProduct[]
      setAIProducts(prods)
      setAISelected(new Set(prods.map((_, i) => i)))  // select all by default
    } catch (e) {
      setAIError(e instanceof Error ? e.message : 'AI import failed')
    } finally { setAILoading(false) }
  }

  async function importAISelected() {
    setAIImporting(true)
    let count = 0
    for (const i of Array.from(aiSelected)) {
      const p = aiProducts[i]
      if (!p) continue
      const { data: saved } = await upsertProduct(sb, { ...p, user_id: userId })
      if (saved) { setProducts(prev => [...prev, saved]); count++ }
    }
    setShowAIImport(false); setAIProducts([]); setAICategory(''); setAIContext('')
    alert(`✓ Imported ${count} product${count !== 1 ? 's' : ''} to Back Office.`)
    setAIImporting(false)
  }

  // ── CSV Import ─────────────────────────────────────────────────────────────
  function parseCSV(text: string): string[][] {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
    const delim = text.includes('\t') ? '\t' : text.split('\n')[0].includes(';') ? ';' : ','
    return lines.map(line => {
      const cells: string[] = []; let cur = ''; let inQ = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (c === '"') { inQ = !inQ }
        else if (c === delim && !inQ) { cells.push(cur.trim()); cur = '' }
        else cur += c
      }
      cells.push(cur.trim()); return cells
    })
  }

  function onCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      if (rows.length < 2) return
      setCsvHeaders(rows[0])
      setCsvRows(rows.slice(1).filter(r => r.some(c => c)))
      // Smart column auto-mapping
      const autoMap: Record<string, string> = {}
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
      rows[0].forEach(h => {
        const n = norm(h)
        if (['name','product','description','item'].some(k => n.includes(k))) autoMap.name = h
        else if (['unit','uom','measure'].some(k => n.includes(k))) autoMap.unit = h
        else if (['cost','price','rate','unitprice','tradeprice'].some(k => n.includes(k))) autoMap.default_cost = h
        else if (['waste'].some(k => n.includes(k))) autoMap.waste_pct = h
        else if (['markup','margin'].some(k => n.includes(k))) autoMap.markup_pct = h
        else if (['supplier','vendor','brand','manufacturer'].some(k => n.includes(k))) autoMap.supplier = h
        else if (['category','type','group'].some(k => n.includes(k))) autoMap.category = h
      })
      setCsvMap(autoMap)
      setCsvSelected(new Set(Array.from({ length: rows.slice(1).length }, (_, i) => i)))
      setShowCSV(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function importCSVSelected() {
    setCSVImporting(true)
    let count = 0
    for (const i of Array.from(csvSelected)) {
      const row = csvRows[i]; if (!row) continue
      const get = (field: string) => {
        const col = csvMap[field]; if (!col) return ''
        const idx = csvHeaders.indexOf(col); return idx >= 0 ? (row[idx] ?? '') : ''
      }
      const name = get('name'); if (!name) continue
      const prod: BOProduct = {
        ...EMPTY, user_id: userId, id: '', created_at: '', updated_at: '',
        name, category: get('category') || aiCategory || 'General', unit: get('unit') || 'item',
        default_cost: parseFloat(get('default_cost').replace(/[£,]/g, '')) || 0,
        waste_pct:    parseFloat(get('waste_pct'))   || 10,
        markup_pct:   parseFloat(get('markup_pct'))  || 20,
        supplier:     get('supplier') || '',
      }
      const { data: saved } = await upsertProduct(sb, prod)
      if (saved) { setProducts(prev => [...prev, saved]); count++ }
    }
    setShowCSV(false); setCsvRows([]); setCsvHeaders([])
    alert(`✓ Imported ${count} product${count !== 1 ? 's' : ''} from spreadsheet.`)
    setCSVImporting(false)
  }

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
    setSaving(true); setSaveError(null)
    try {
      const { data: saved, error } = await upsertProduct(sb, { ...editing, user_id: userId })
      if (error || !saved) {
        setSaveError(error ?? 'Save failed — please try again.')
        return
      }
      if (isNew) setProducts(prev => [...prev, saved])
      else setProducts(prev => prev.map(p => p.id === saved.id ? saved : p))
      setEditing(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this product?')) return
    await deleteProduct(sb, id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  async function duplicate(product: BOProduct) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, created_at: _c, updated_at: _u, ...row } = product as BOProduct & { created_at?: string; updated_at?: string }
    const { data: saved } = await upsertProduct(sb, { ...row, user_id: userId, name: `${product.name} (copy)` })
    if (saved) setProducts(prev => [...prev, saved])
  }

  async function toggleActive(product: BOProduct) {
    const updated = { ...product, active: !product.active }
    setProducts(prev => prev.map(p => p.id === product.id ? updated : p))
    await upsertProduct(sb, updated)
  }

  // All available categories: defaults + from existing products + user-added custom
  const searchLower = search.toLowerCase()
  const allCats = Array.from(new Set([
    ...PRODUCT_CATEGORIES,
    ...customCategories,
    ...products.map(p => p.category),
  ])).sort()

  const groupedCats = allCats
    .map(cat => ({
      cat,
      items: products.filter(p =>
        p.category === cat &&
        (!search || p.name.toLowerCase().includes(searchLower) || p.supplier?.toLowerCase().includes(searchLower))
      ),
      isEmpty: !products.some(p => p.category === cat),
    }))
    // Show all custom categories (even empty), hide empty defaults unless searching
    .filter(g => g.items.length > 0 || (customCategories.includes(g.cat) && !search))

  const totalFiltered = groupedCats.reduce((s, g) => s + g.items.length, 0)
  const totalProducts = products.length

  // Auto-expand all categories when searching
  const effectiveExpanded = search
    ? new Set(groupedCats.map(g => g.cat))
    : expandedCats

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading products…</div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Products / Materials</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Default material costs, waste allowances and markup for use in estimates.</p>
        </div>
        {/* Hidden CSV input */}
        <input ref={csvInputRef} type="file" accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={onCSVFile} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => setExpandedCats(new Set(allCats))}
            style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
            Expand All
          </button>
          <button
            onClick={() => setExpandedCats(new Set())}
            style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
            Collapse All
          </button>
          {/* New Category */}
          {addingCat ? (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                autoFocus
                value={newCatInput}
                onChange={e => setNewCatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustomCategory(); if (e.key === 'Escape') setAddingCat(false) }}
                placeholder="Category name…"
                style={{ padding: '6px 10px', border: '1px solid #93c5fd', borderRadius: 6, fontSize: 13, outline: 'none', width: 180 }}
              />
              <button onClick={addCustomCategory} style={{ padding: '6px 12px', background: '#2563eb', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Add</button>
              <button onClick={() => setAddingCat(false)} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingCat(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              <Plus size={13} /> New Category
            </button>
          )}
          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Add Product
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 320 }}>
        <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
          style={{ width: '100%', padding: '7px 8px 7px 28px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
      </div>

      {/* Collapsible categories */}
      {groupedCats.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px', color: '#94a3b8', fontSize: 13, border: '2px dashed #e2e8f0', borderRadius: 8 }}>
          {products.length === 0 ? 'No products yet — click Add Product to get started.' : 'No products match your search.'}
        </div>
      )}

      {groupedCats.map(({ cat, items, isEmpty }) => {
        const isOpen = effectiveExpanded.has(cat)
        return (
          <div key={cat} style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
            {/* Category header */}
            <div
              onClick={() => toggleCat(cat)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', cursor: 'pointer', userSelect: 'none' }}>
              {isOpen
                ? <ChevronDown size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
                : <ChevronRight size={15} style={{ color: '#94a3b8', flexShrink: 0 }} />
              }
              <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{cat}</span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {isEmpty ? 'empty' : `${items.length} product${items.length !== 1 ? 's' : ''}`}
              </span>
              {/* Per-category action buttons */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { setEditing({ ...EMPTY, user_id: userId, id: '', created_at: '', updated_at: '', category: cat } as BOProduct); setIsNew(true) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, color: '#1d4ed8', fontSize: 11, cursor: 'pointer' }}>
                  <Plus size={11} /> Add
                </button>
                <button
                  onClick={() => { setShowAIImport(true); setAIProducts([]); setAIError(''); setAIUrl(''); setAICategory(cat) }}
                  title={`AI Import into "${cat}"`}
                  style={{ padding: '3px 8px', background: '#faf5ff', border: '1px solid #ddd6fe', borderRadius: 4, color: '#7c3aed', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
                  ✦ AI
                </button>
                <button
                  onClick={() => { setAICategory(cat); csvInputRef.current?.click() }}
                  title={`Import CSV into "${cat}"`}
                  style={{ padding: '3px 8px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 4, color: '#166534', fontSize: 11, cursor: 'pointer' }}>
                  📊 CSV
                </button>
              </div>
              {isEmpty && customCategories.includes(cat) && (
                <button
                  onClick={e => { e.stopPropagation(); removeCustomCategory(cat) }}
                  title="Remove empty category"
                  style={{ padding: '3px 6px', background: 'none', border: '1px solid #fecaca', borderRadius: 4, color: '#dc2626', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                  ✕
                </button>
              )}
            </div>

            {/* Products table */}
            {isOpen && (
              <div style={{ padding: '6px 0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {['Product', 'Unit', 'Cost', 'Waste %', 'Markup %', 'Supplier', 'Active', ''].map(h => (
                        <th key={h} style={{ padding: '5px 12px', textAlign: h === 'Cost' || h === 'Waste %' || h === 'Markup %' ? 'right' : 'left', fontWeight: 600, color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                        <td style={{ padding: '7px 12px', fontWeight: 500, color: p.active ? '#1e293b' : '#94a3b8' }}>{p.name}</td>
                        <td style={{ padding: '7px 12px', color: '#64748b' }}>{p.unit}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#1e293b' }}>£{p.default_cost.toFixed(2)}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#64748b' }}>{p.waste_pct}%</td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', color: '#64748b' }}>{p.markup_pct}%</td>
                        <td style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 11 }}>{p.supplier || '—'}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: p.active ? '#dcfce7' : '#f1f5f9', color: p.active ? '#166534' : '#64748b' }}>
                            {p.active ? 'Active' : 'Off'}
                          </span>
                        </td>
                        <td style={{ padding: '4px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button onClick={() => toggleActive(p)} title={p.active ? 'Deactivate' : 'Activate'} style={{ padding: '2px 5px', border: `1px solid ${p.active ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 4, background: p.active ? '#f0fdf4' : '#f8fafc', color: p.active ? '#16a34a' : '#94a3b8', fontSize: 10, cursor: 'pointer', marginRight: 2 }}>{p.active ? '●' : '○'}</button>
                          <button onClick={() => duplicate(p)} title="Duplicate" style={{ padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>⧉</button>
                          <button onClick={() => openEdit(p)} style={{ padding: '2px 7px', border: '1px solid #e2e8f0', borderRadius: 4, background: '#fff', fontSize: 11, cursor: 'pointer', marginRight: 2 }}>✏️</button>
                          <button onClick={() => remove(p.id)} style={{ padding: '2px 7px', border: '1px solid #fecaca', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontSize: 11, cursor: 'pointer' }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>{totalFiltered} of {totalProducts} products · {groupedCats.length} categories</div>

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
                  <input
                    list="product-cat-list"
                    value={editing.category}
                    onChange={e => setEditing({ ...editing, category: e.target.value })}
                    placeholder="Select or type a category…"
                    style={inp}
                  />
                  <datalist id="product-cat-list">
                    {allCats.map(c => <option key={c} value={c} />)}
                  </datalist>
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                    Choose from the list or type a new category name
                  </div>
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
            {saveError && (
              <div style={{ margin: '0 22px 10px', padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: 12, color: '#dc2626' }}>
                ⚠️ {saveError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 22px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <button onClick={() => { setEditing(null); setSaveError(null) }} style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ padding: '8px 22px', background: saving ? '#94a3b8' : '#4a90a4', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Import Modal ── */}
      {showAIImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAIImport(false) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>✦ AI Product Import</div>
              <button onClick={() => setShowAIImport(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              {/* URL import row */}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Supplier Website URL (optional)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={aiUrl} onChange={e => setAIUrl(e.target.value)}
                    placeholder="Paste a supplier product page URL — e.g. https://www.travisperkins.co.uk/bricks"
                    style={{ ...inp, flex: 1 }} />
                  {aiUrl && <button onClick={() => setAIUrl('')} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#94a3b8', background: '#fff', flexShrink: 0 }}>✕ Clear</button>}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                  {aiUrl ? '✦ AI will read this page and extract products from it' : 'Or leave blank and AI generates a standard product list from the category below'}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>{aiUrl ? 'Category (for labelling)' : 'Product Category *'}</label>
                  <input value={aiCategory} onChange={e => setAICategory(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && runAIImport()}
                    placeholder={aiUrl ? 'e.g. Bricks and Blocks' : 'e.g. Bricks and Blocks, Timber, Roofing Materials'}
                    style={inp} autoFocus={!aiUrl} />
                </div>
                <div>
                  <label style={lbl}>Narrow it down (optional)</label>
                  <input value={aiContext} onChange={e => setAIContext(e.target.value)}
                    placeholder="e.g. facing bricks only, or lightweight blocks, or Forterra range"
                    style={inp} />
                  <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                    Focus on a specific product type, size or range
                  </div>
                </div>
              </div>
              {aiError && <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠️ {aiError}</div>}
              <button onClick={runAIImport} disabled={aiLoading || (!aiCategory.trim() && !aiUrl.trim())}
                style={{ padding: '8px 20px', background: aiLoading ? '#94a3b8' : '#7c3aed', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: aiLoading ? 'wait' : 'pointer' }}>
                {aiLoading ? (aiUrl ? '✦ Reading page…' : '✦ Generating…') : aiUrl ? '✦ Read Page & Import' : '✦ Generate Products'}
              </button>
            </div>
            {aiProducts.length > 0 && (
              <>
                <div style={{ padding: '8px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc' }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{aiProducts.length} products generated — {aiSelected.size} selected</span>
                  <button onClick={() => setAISelected(new Set(aiProducts.map((_, i) => i)))} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>Select All</button>
                  <button onClick={() => setAISelected(new Set())} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>None</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '7px 10px', width: 30 }}></th>
                        {['Product', 'Category', 'Unit', 'Cost £', 'Waste %', 'Markup %'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aiProducts.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: aiSelected.has(i) ? '#fff' : '#f8fafc', opacity: aiSelected.has(i) ? 1 : 0.5 }}>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <input type="checkbox" checked={aiSelected.has(i)} onChange={ev => setAISelected(prev => { const n = new Set(prev); ev.target.checked ? n.add(i) : n.delete(i); return n })} />
                          </td>
                          <td style={{ padding: '6px 10px', fontWeight: 500 }}>
                            <input value={p.name} onChange={e => setAIProducts(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} style={{ border: 'none', fontSize: 12, width: '100%', outline: 'none', background: 'transparent' }} />
                          </td>
                          <td style={{ padding: '6px 10px', color: '#64748b' }}>
                            <input value={p.category} onChange={e => setAIProducts(prev => prev.map((x, j) => j === i ? { ...x, category: e.target.value } : x))} style={{ border: 'none', fontSize: 11, width: '100%', outline: 'none', background: 'transparent', color: '#64748b' }} />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input value={p.unit} onChange={e => setAIProducts(prev => prev.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} style={{ border: 'none', fontSize: 12, width: 50, outline: 'none', background: 'transparent' }} />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input type="number" step="0.01" value={p.default_cost} onChange={e => setAIProducts(prev => prev.map((x, j) => j === i ? { ...x, default_cost: +e.target.value } : x))} style={{ border: 'none', fontSize: 12, width: 60, outline: 'none', background: 'transparent', textAlign: 'right' }} />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input type="number" value={p.waste_pct} onChange={e => setAIProducts(prev => prev.map((x, j) => j === i ? { ...x, waste_pct: +e.target.value } : x))} style={{ border: 'none', fontSize: 12, width: 40, outline: 'none', background: 'transparent', textAlign: 'right' }} />
                          </td>
                          <td style={{ padding: '6px 10px' }}>
                            <input type="number" value={p.markup_pct} onChange={e => setAIProducts(prev => prev.map((x, j) => j === i ? { ...x, markup_pct: +e.target.value } : x))} style={{ border: 'none', fontSize: 12, width: 40, outline: 'none', background: 'transparent', textAlign: 'right' }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowAIImport(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={importAISelected} disabled={aiImporting || aiSelected.size === 0}
                    style={{ padding: '8px 20px', background: aiImporting ? '#94a3b8' : '#7c3aed', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {aiImporting ? 'Importing…' : `Import ${aiSelected.size} Product${aiSelected.size !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── CSV Import Modal ── */}
      {showCSV && csvRows.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCSV(false) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>📊 Import from Spreadsheet</div>
              <button onClick={() => setShowCSV(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
            </div>
            {/* Column mapping */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Map Columns</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {([
                  { field: 'name',         label: 'Product Name *' },
                  { field: 'category',     label: 'Category' },
                  { field: 'unit',         label: 'Unit' },
                  { field: 'default_cost', label: 'Cost Price' },
                  { field: 'waste_pct',    label: 'Waste %' },
                  { field: 'markup_pct',   label: 'Markup %' },
                  { field: 'supplier',     label: 'Supplier' },
                ] as { field: string; label: string }[]).map(({ field, label }) => (
                  <div key={field}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</label>
                    <select value={csvMap[field] ?? ''} onChange={e => setCsvMap(m => ({ ...m, [field]: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12 }}>
                      <option value="">— not mapped —</option>
                      {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
            {/* Preview */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <div style={{ padding: '8px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 10, alignItems: 'center', background: '#f8fafc' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{csvRows.length} rows · {csvSelected.size} selected</span>
                <button onClick={() => setCsvSelected(new Set(csvRows.map((_, i) => i)))} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>Select All</button>
                <button onClick={() => setCsvSelected(new Set())} style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #e2e8f0', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>None</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '6px 10px', width: 30 }}></th>
                    {['Name', 'Category', 'Unit', 'Cost', 'Waste%', 'Markup%', 'Supplier'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 50).map((row, i) => {
                    const get = (field: string) => { const col = csvMap[field]; if (!col) return ''; const idx = csvHeaders.indexOf(col); return idx >= 0 ? (row[idx] ?? '') : '' }
                    const name = get('name')
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', opacity: (csvSelected.has(i) && name) ? 1 : 0.45 }}>
                        <td style={{ padding: '5px 10px' }}>
                          <input type="checkbox" checked={csvSelected.has(i)} onChange={ev => setCsvSelected(prev => { const n = new Set(prev); ev.target.checked ? n.add(i) : n.delete(i); return n })} />
                        </td>
                        <td style={{ padding: '5px 10px', fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || <span style={{ color: '#dc2626', fontSize: 10 }}>No name</span>}</td>
                        <td style={{ padding: '5px 10px', color: '#64748b' }}>{get('category')}</td>
                        <td style={{ padding: '5px 10px', color: '#64748b' }}>{get('unit')}</td>
                        <td style={{ padding: '5px 10px', fontFamily: 'monospace' }}>£{get('default_cost')}</td>
                        <td style={{ padding: '5px 10px', color: '#64748b' }}>{get('waste_pct')}</td>
                        <td style={{ padding: '5px 10px', color: '#64748b' }}>{get('markup_pct')}</td>
                        <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{get('supplier')}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {csvRows.length > 50 && <div style={{ padding: '8px 20px', fontSize: 11, color: '#94a3b8' }}>Showing first 50 of {csvRows.length} rows — all will be imported.</div>}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCSV(false)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff', cursor: 'pointer' }}>Cancel</button>
              <button onClick={importCSVSelected} disabled={csvImporting || csvSelected.size === 0 || !csvMap.name}
                style={{ padding: '8px 20px', background: csvImporting ? '#94a3b8' : '#166534', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {csvImporting ? 'Importing…' : `Import ${csvSelected.size} Row${csvSelected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }
const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
