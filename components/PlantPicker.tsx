'use client'

import { useState, useMemo } from 'react'
import type { BOPlantItem } from '@/lib/back-office-types'
import type { QuotePlantItem } from '@/lib/types'

function uid() { return Math.random().toString(36).slice(2, 10) }

interface Props {
  items:   BOPlantItem[]
  onAdd:   (item: QuotePlantItem) => void
  onClose: () => void
}

export default function PlantPicker({ items, onAdd, onClose }: Props) {
  const [search, setSearch] = useState('')
  const [qty, setQty]       = useState<Record<string, number>>({})

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return items.filter(i => i.active && (!q || i.name.toLowerCase().includes(q)))
  }, [items, search])

  function handleAdd(i: BOPlantItem) {
    const itemQty  = qty[i.id] || 1
    const sell     = +(i.default_cost * (1 + (i.markup_pct ?? 0) / 100)).toFixed(2)
    onAdd({ id: uid(), boPlantId: i.id, name: i.name, unit: i.unit, qty: itemQty, costPrice: i.default_cost, sellPrice: sell, enabled: true })
  }

  const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 620, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>🚜 Add Plant & Equipment</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8' }}>×</button>
        </div>

        <div style={{ padding: '10px 18px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13 }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search plant items…" style={{ ...inp, width: '100%', paddingLeft: 30 }} autoFocus />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 18px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              {items.filter(i => i.active).length === 0
                ? 'No plant items in Back Office yet. Add items in Back Office → Plant & Equipment.'
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
