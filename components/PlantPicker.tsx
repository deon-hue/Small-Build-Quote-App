'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { BOPlantItem } from '@/lib/back-office-types'
import type { QuotePlantItem } from '@/lib/types'

function uid() { return Math.random().toString(36).slice(2, 10) }

interface Props {
  items:   BOPlantItem[]
  onAdd:   (item: QuotePlantItem) => void
  onClose: () => void
}

export default function PlantPicker({ items, onAdd, onClose }: Props) {
  const [search,      setSearch]      = useState('')
  const [qty,         setQty]         = useState<Record<string, number>>({})
  const [localItems,  setLocalItems]  = useState<BOPlantItem[]>(items)

  // ── Quick-add form state ─────────────────────────────────────────────────────
  const [adding,      setAdding]      = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveErr,     setSaveErr]     = useState('')
  const [form, setForm] = useState({ name: '', unit: 'day', default_cost: 0, markup_pct: 20 })

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return localItems.filter(i => i.active && (!q || i.name.toLowerCase().includes(q)))
  }, [localItems, search])

  function handleAdd(i: BOPlantItem) {
    const itemQty = qty[i.id] || 1
    const sell    = +(i.default_cost * (1 + (i.markup_pct ?? 0) / 100)).toFixed(2)
    onAdd({ id: uid(), boPlantId: i.id, name: i.name, unit: i.unit, qty: itemQty, costPrice: i.default_cost, sellPrice: sell, enabled: true })
  }

  async function saveNew() {
    if (!form.name.trim()) return
    setSaving(true); setSaveErr('')
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { setSaveErr('Not signed in'); return }

      const { data, error } = await sb.from('bo_plant_items').insert({
        user_id: user.id, name: form.name.trim(), unit: form.unit,
        default_cost: form.default_cost, markup_pct: form.markup_pct,
        phase_id: null, active: true, display_order: 999,
        updated_at: new Date().toISOString(),
      }).select().single()

      if (error || !data) { setSaveErr(error?.message ?? 'Save failed'); return }

      const newItem = data as BOPlantItem
      setLocalItems(prev => [...prev, newItem])
      handleAdd(newItem)
      setAdding(false)
      setForm({ name: '', unit: 'day', default_cost: 0, markup_pct: 20 })
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }
  const fInp: React.CSSProperties = { padding: '5px 8px', border: '1px solid #ddd6fe', borderRadius: 5, fontSize: 12, outline: 'none', boxSizing: 'border-box' as const, width: '100%' }
  const fLbl: React.CSSProperties = { display: 'block', fontSize: 10, fontWeight: 600, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🚜 Add Plant & Equipment</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setAdding(a => !a); setSaveErr('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: adding ? '#faf5ff' : '#f0fdf4', border: `1px solid ${adding ? '#ddd6fe' : '#86efac'}`, borderRadius: 6, color: adding ? '#7c3aed' : '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {adding ? '✕ Cancel' : '+ New Item'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
          </div>
        </div>

        {/* Quick-add form */}
        {adding && (
          <div style={{ padding: '14px 18px', background: '#faf5ff', borderBottom: '2px solid #ddd6fe' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 10 }}>New Plant Item — saves to Back Office and adds to quote</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={fLbl}>Item Name *</label>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && saveNew()}
                  placeholder="e.g. Concrete mixer, Skip hire" style={fInp} />
              </div>
              <div>
                <label style={fLbl}>Unit</label>
                <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={fInp}>
                  {['day', 'week', 'hr', 'item'].map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={fLbl}>Hire rate (£/unit)</label>
                <input type="number" min={0} step={1} value={form.default_cost} onChange={e => setForm(f => ({ ...f, default_cost: +e.target.value }))} style={fInp} />
              </div>
              <div>
                <label style={fLbl}>Markup %</label>
                <input type="number" min={0} max={200} step={1} value={form.markup_pct} onChange={e => setForm(f => ({ ...f, markup_pct: +e.target.value }))} style={fInp} />
              </div>
            </div>
            {saveErr && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>⚠️ {saveErr}</div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={saveNew} disabled={saving || !form.name.trim()}
                style={{ padding: '7px 18px', background: saving ? '#94a3b8' : '#7c3aed', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving…' : '💾 Save to Back Office & Add to Quote'}
              </button>
              <span style={{ fontSize: 11, color: '#64748b' }}>Sell: £{(form.default_cost * (1 + form.markup_pct / 100)).toFixed(2)}</span>
            </div>
          </div>
        )}

        {/* Search */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search plant items…" style={{ ...inp, width: '100%', paddingLeft: 30 }} autoFocus={!adding} />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {localItems.filter(i => i.active).length === 0
                ? 'No plant items in Back Office yet — use "+ New Item" above to create one.'
                : 'No items match your search.'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Item', 'Unit', 'Cost', 'Sell', 'Qty', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => {
                  const sell = +(i.default_cost * (1 + (i.markup_pct ?? 0) / 100)).toFixed(2)
                  const itemQty = qty[i.id] ?? 1
                  return (
                    <tr key={i.id} style={{ borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b' }}>{i.name}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{i.unit}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#374151' }}>£{i.default_cost.toFixed(2)}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#16a34a' }}>£{sell.toFixed(2)}</td>
                      <td style={{ padding: '8px 6px', width: 64 }}>
                        <input type="number" min={0} step={0.5} value={itemQty}
                          onChange={e => setQty(prev => ({ ...prev, [i.id]: Math.max(0, +e.target.value) }))}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12, textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '8px 8px' }}>
                        <button onClick={() => handleAdd(i)}
                          style={{ padding: '5px 12px', background: '#7c3aed', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
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
          <span>{filtered.length} item{filtered.length !== 1 ? 's' : ''} shown</span>
          <span>Rates from Back Office · changes here only affect this quote</span>
        </div>
      </div>
    </div>
  )
}
