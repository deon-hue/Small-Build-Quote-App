'use client'

/**
 * Shared item-list editor for Quick Quote — used both when creating one
 * (app/(app)/quick-quote/page.tsx) and when editing a saved one
 * (app/(app)/new-quote/page.tsx, quoteSource === 'quick'). Each row is a
 * QuoteMiscItem: a free-text description with its own cost + markup %, sell
 * always derived as cost × (1 + markupPct/100) — never typed directly.
 */

import type { QuoteMiscItem } from '@/lib/types'
import { fmt, uid, VAT, calcMiscItemSell } from '@/lib/utils'

export function quickItemsTotals(items: QuoteMiscItem[]) {
  const totalCost = items.reduce((s, i) => s + (Number(i.cost) || 0), 0)
  const totalSell = items.reduce((s, i) => s + calcMiscItemSell(i), 0)
  const margin = totalSell - totalCost
  const marginPct = totalSell > 0 ? (margin / totalSell) * 100 : 0
  return { totalCost, totalSell, margin, marginPct }
}

interface Props {
  items: QuoteMiscItem[]
  onChange: (items: QuoteMiscItem[]) => void
  vatOn: boolean
  locked?: boolean
}

export default function QuickQuoteItemsEditor({ items, onChange, vatOn, locked = false }: Props) {
  const { totalCost, totalSell, margin, marginPct } = quickItemsTotals(items)
  const vatAmt = vatOn ? totalSell * VAT : 0
  const totalInc = totalSell + vatAmt

  function addItem() {
    onChange([...items, { id: uid(), desc: '', cost: 0, markupPct: 20 }])
  }
  function updateItem(mi: QuoteMiscItem) {
    onChange(items.map(x => x.id === mi.id ? mi : x))
  }
  function removeItem(id: string) {
    onChange(items.filter(x => x.id !== id))
  }

  return (
    <div>
      {items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 10 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '4px 6px', textAlign: 'left', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Description</th>
              <th style={{ padding: '4px 6px', width: 100, textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Cost</th>
              <th style={{ padding: '4px 6px', width: 80, textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Markup %</th>
              <th style={{ padding: '4px 6px', width: 100, textAlign: 'right', fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Sell</th>
              <th style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {items.map(mi => {
              const sell = calcMiscItemSell(mi)
              return (
                <tr key={mi.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '5px 6px' }}>
                    <input value={mi.desc} readOnly={locked} placeholder="Describe this item…"
                      onChange={e => updateItem({ ...mi, desc: e.target.value })}
                      style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', color: 'inherit' }} />
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--muted)' }}>£</span>
                      <input type="number" step={10} value={mi.cost} readOnly={locked}
                        onChange={e => updateItem({ ...mi, cost: +e.target.value })}
                        style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'DM Mono, monospace', fontSize: 13, textAlign: 'right', paddingLeft: 12 }} />
                    </div>
                  </td>
                  <td style={{ padding: '5px 6px' }}>
                    <input type="number" step={1} value={mi.markupPct} readOnly={locked}
                      onChange={e => updateItem({ ...mi, markupPct: +e.target.value })}
                      style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'DM Mono, monospace', fontSize: 13, textAlign: 'right' }} />
                  </td>
                  <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'DM Mono, monospace', fontWeight: 600, fontSize: 13 }}>
                    {fmt(sell)}
                  </td>
                  <td style={{ padding: '5px 2px', textAlign: 'right' }}>
                    {!locked && (
                      <button onClick={() => removeItem(mi.id)} title="Remove"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: 14, padding: '1px 5px', lineHeight: 1 }}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {!locked && (
        <button onClick={addItem} style={{ background: 'transparent', border: '1px dashed #94a3b8', borderRadius: 4, color: 'var(--muted)', fontSize: 12, cursor: 'pointer', padding: '5px 10px', marginBottom: items.length > 0 ? 14 : 0 }}>
          + Add Item
        </button>
      )}

      {items.length > 0 && (
        <div style={{ background: margin >= 0 ? '#f8faf2' : '#fff0ef', border: `1px solid ${margin >= 0 ? '#c8e89a' : '#ffb0b0'}`, borderRadius: 8, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 14 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Sell Price</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{fmt(totalSell)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Est. Cost</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{fmt(totalCost)}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Gross Margin</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: margin >= 0 ? '#4a7c1f' : '#c0392b' }}>
              {fmt(margin)} <span style={{ fontSize: 11, fontWeight: 400 }}>({marginPct.toFixed(1)}%)</span>
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Total inc. VAT</div>
            <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
              {vatOn ? fmt(totalInc) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No VAT</span>}
            </div>
          </div>
        </div>
      )}

      {totalCost > 0 && totalSell > 0 && totalCost >= totalSell && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#c0392b', fontWeight: 600 }}>
          ⚠ Estimated cost equals or exceeds the sell price — no profit margin.
        </div>
      )}
    </div>
  )
}
