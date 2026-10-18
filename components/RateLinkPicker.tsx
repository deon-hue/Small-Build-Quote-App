'use client'

// The pop-up for linking a calculator cost line to a Back Office product or plant item. Search by name, category or supplier; items sold in the line's own unit
// link as they stand; an item sold in another unit (a roll of membrane) asks how much of the line's unit one covers, and the line then pays for WHOLE packs: 20 m
// from a 50 m roll costs the whole roll, but a 20 m roll costs just that. Each row shows what this line would cost from it, and the cheapest is marked.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import NumInput from '@/components/NumInput'
import { searchRateItems, guessPackSize, costForQty, packsFor, type RateItem, type RateLink } from '@/lib/rate-links'

export interface PickerLine { name: string; unit: string; category: string; /** how much of the line's unit the line buys (after waste) */ purchaseQty: number }

const money = (n: number) => `£${n.toFixed(2)}`

export default function RateLinkPicker({ line, items, supportsPack, onPick, onClose }: {
  line: PickerLine
  items: RateItem[]
  supportsPack: boolean
  onPick: (link: RateLink) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<RateItem | null>(null)
  const [per, setPer] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => { searchRef.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const qty = line.purchaseQty
  const rows = useMemo(() => searchRateItems(line, items, query).map(m => {
    const guess = m.sameUnit ? null : guessPackSize(m.item.name, line.unit)
    // what this line would cost from the item: its quantity at the price, or the whole packs a guessed pack size needs
    const total = m.sameUnit ? costForQty(m.item.cost, qty) : guess ? costForQty(m.item.cost, qty, guess) : null
    return { ...m, guess, total }
  }), [line, items, query, qty])
  // The cheapest of the products that look like what the line is (at least half its words in their name), so an unrelated cheap item is not marked
  const likeLine = rows.filter(r => r.total !== null && qty > 0 && r.score >= 0.5)
  const cheapest = likeLine.length > 1 ? Math.min(...likeLine.map(r => r.total as number)) : null

  const perNum = parseFloat(per)
  const perOk = perNum > 0
  const packs = chosen && perOk ? packsFor(qty, perNum) : 0
  const packTotal = chosen && perOk ? costForQty(chosen.cost, qty, perNum) : 0

  function choose(r: (typeof rows)[number]) {
    if (r.sameUnit) { onPick({ kind: r.item.kind, refId: r.item.id }); return }
    if (!supportsPack) return
    setChosen(r.item)
    setPer(r.guess ? String(r.guess) : '')
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Link to a product" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Link “{line.name}” to {line.category === 'plant' ? 'a plant item' : 'a product'}</div>
            <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', margin: '2px 0 8px' }}>
            This line needs <strong>{qty > 0 ? Math.round(qty * 100) / 100 : 0} {line.unit}</strong>. A product sold in rolls or packs is bought whole, so a short length from a long roll still costs the whole roll.
          </div>
          <input ref={searchRef} value={query} onChange={e => { setQuery(e.target.value); setChosen(null) }} placeholder="Search by name, category or supplier…"
            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }} />
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {rows.length === 0 && (
            <div style={{ padding: '16px', fontSize: 13, color: '#94a3b8' }}>
              {items.length === 0 ? 'Nothing in your Back Office list yet. Add products under Back Office → Products.' : 'No match. Try fewer words.'}
            </div>
          )}
          {rows.map(r => {
            const open = chosen?.id === r.item.id
            const blocked = !r.sameUnit && !supportsPack
            return (
              <div key={r.item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <button type="button" onClick={() => choose(r)} disabled={blocked}
                  title={blocked ? 'To link a product sold in another unit, the pack-size SQL (supabase/calculator-rate-links-pack.sql) has to be run first' : undefined}
                  style={{ display: 'flex', width: '100%', textAlign: 'left', gap: 10, padding: '9px 16px', background: open ? '#f0f9ff' : 'none', border: 'none', cursor: blocked ? 'default' : 'pointer', opacity: blocked ? 0.5 : 1 }}
                  onMouseEnter={e => { if (!open && !blocked) e.currentTarget.style.background = '#f8fafc' }} onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 600 }}>{r.item.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{[r.item.category, r.item.supplier].filter(Boolean).join(' · ') || ' '}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#1e293b' }}>{money(r.item.cost)}<span style={{ color: '#94a3b8' }}>/{r.item.unit}</span></div>
                    {r.sameUnit
                      ? <div style={{ fontSize: 11, color: '#15803d' }}>same unit{r.total !== null && qty > 0 ? ` · this line ${money(r.total)}` : ''}</div>
                      : <div style={{ fontSize: 11, color: '#b45309' }}>sold per {r.item.unit}{r.guess && r.total !== null && qty > 0 ? ` · ${packsFor(qty, r.guess)} × ${r.guess} ${line.unit} = ${money(r.total)}` : ' · set the pack size'}</div>}
                    {r.total !== null && r.score >= 0.5 && cheapest !== null && r.total === cheapest && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#15803d' }}>CHEAPEST FOR THIS AMOUNT</div>
                    )}
                  </div>
                </button>
                {open && (
                  <div style={{ padding: '4px 16px 12px', background: '#f0f9ff', fontSize: 12.5, color: '#334155' }}>
                    <div style={{ marginBottom: 6 }}>
                      1 {r.item.unit} of <strong>{r.item.name}</strong> covers{' '}
                      <NumInput type="number" min={0} step="any" value={per} onChange={e => setPer(e.target.value)} autoFocus
                        style={{ width: 80, padding: '3px 6px', border: '1px solid #bae6fd', borderRadius: 5, fontSize: 13, textAlign: 'right' }} /> {line.unit}
                      {r.guess ? <span style={{ fontSize: 11, color: '#94a3b8' }}> (read from the name — change it if wrong)</span> : null}
                    </div>
                    {perOk && qty > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        To cover {Math.round(qty * 100) / 100} {line.unit} you buy <strong>{packs} × {r.item.unit}</strong> = <strong>{money(packTotal)}</strong>
                        {packs * perNum > qty + 1e-9 && <span style={{ color: '#b45309' }}> ({Math.round((packs * perNum - qty) * 100) / 100} {line.unit} left over, still paid for)</span>}.
                      </div>
                    )}
                    <button type="button" disabled={!perOk} onClick={() => onPick({ kind: r.item.kind, refId: r.item.id, per: perNum })}
                      style={{ background: perOk ? '#0369a1' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: perOk ? 'pointer' : 'default' }}>
                      Link it
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#94a3b8' }}>
          {supportsPack ? 'Products in other units (rolls, packs) can be linked by saying how much one covers.' : 'Only products in this line’s own unit can be linked until the pack-size SQL is run.'}
        </div>
      </div>
    </div>
  )
}
