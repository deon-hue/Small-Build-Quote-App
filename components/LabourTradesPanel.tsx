'use client'
// ── Labour Trades Panel ──────────────────────────────────────────────────────
// Lets users price labour by trade (Builder, Carpenter, etc.) with per-trade
// day / hour rates, markup, and quoted price (ex VAT).
// Trade default rates pull from Back Office → lib/tradeRates → localStorage.

import { useState, useEffect } from 'react'
import { HardHat, X, Plus, ChevronDown } from 'lucide-react'
import {
  TRADE_TYPES,
  calcLabourTrade,
  labourTradesTotal,
  labourTradesCostTotal,
  getDefaultCostRate,
  type LabourTrade,
} from '@/lib/tradeRates'
import { fmt } from '@/lib/utils'

interface Props {
  trades: LabourTrade[]
  defaultMarkup?: number     // pre-fill markup from quote's global markup
  onChange: (trades: LabourTrade[]) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function newTrade(trade: string, markup: number): LabourTrade {
  const unit: 'day' | 'hr' = 'day'
  const costRate = getDefaultCostRate(trade, unit)
  return calcLabourTrade({
    id:       `trade-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    trade,
    qty:      1,
    unit,
    costRate,
    markup,
    cost: 0, markupAmount: 0, quotePrice: 0,
  })
}

// ── Single trade row ─────────────────────────────────────────────────────────
function TradeRow({
  trade,
  onChange,
  onRemove,
}: {
  trade:    LabourTrade
  onChange: (t: LabourTrade) => void
  onRemove: () => void
}) {
  function update(patch: Partial<LabourTrade>) {
    let next = { ...trade, ...patch }
    // Auto-update cost rate when trade or unit changes
    if (patch.trade !== undefined || patch.unit !== undefined) {
      next.costRate = getDefaultCostRate(next.trade, next.unit)
    }
    onChange(calcLabourTrade(next))
  }

  const inp: React.CSSProperties = {
    padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5,
    fontSize: 13, background: '#fff', width: '100%', textAlign: 'right',
    fontFamily: 'DM Mono, monospace',
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '160px 64px 72px 90px 72px 90px 90px 28px',
      gap: 6,
      alignItems: 'center',
      padding: '7px 12px',
      borderBottom: '1px solid #f5f3ef',
      background: '#fff',
    }}>
      {/* Trade select */}
      <div style={{ position: 'relative' }}>
        <select
          value={trade.trade}
          onChange={e => update({ trade: e.target.value })}
          style={{
            ...inp, textAlign: 'left',
            appearance: 'none', paddingRight: 22, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif',
          }}
        >
          {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <ChevronDown
          size={12} strokeWidth={2}
          style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }}
        />
      </div>

      {/* Quantity */}
      <input
        type="number" value={trade.qty} min={0.5} step={0.5}
        onChange={e => update({ qty: Math.max(0, Number(e.target.value)) })}
        style={inp}
      />

      {/* Unit day / hr */}
      <select
        value={trade.unit}
        onChange={e => update({ unit: e.target.value as 'day' | 'hr' })}
        style={{ ...inp, textAlign: 'left', fontFamily: 'DM Sans, sans-serif', appearance: 'none', paddingRight: 0 }}
      >
        <option value="day">day</option>
        <option value="hr">hour</option>
      </select>

      {/* Cost rate */}
      <input
        type="number" value={trade.costRate} min={0} step={5}
        title={`Cost £ per ${trade.unit}`}
        onChange={e => update({ costRate: Math.max(0, Number(e.target.value)) })}
        style={{ ...inp, borderColor: trade.costRate > 0 ? '#c7d7e0' : '#e2e8f0' }}
      />

      {/* Markup % */}
      <input
        type="number" value={trade.markup} min={0} step={1}
        title="Markup %"
        onChange={e => update({ markup: Math.max(0, Number(e.target.value)) })}
        style={inp}
      />

      {/* Cost total (read-only) */}
      <div style={{
        padding: '5px 8px', borderRadius: 5,
        background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)',
        fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#1e40af',
        textAlign: 'right', whiteSpace: 'nowrap',
      }}>
        {trade.cost > 0 ? fmt(trade.cost) : '—'}
      </div>

      {/* Quote price ex VAT (read-only) */}
      <div style={{
        padding: '5px 8px', borderRadius: 5,
        background: 'rgba(21,128,61,0.07)', border: '1px solid rgba(21,128,61,0.2)',
        fontSize: 12, fontFamily: 'DM Mono, monospace', color: '#15803d',
        textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700,
      }}>
        {trade.quotePrice > 0 ? fmt(trade.quotePrice) : '—'}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        title="Remove this trade"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d0d5db', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onMouseEnter={e => (e.currentTarget.style.color = '#c0392b')}
        onMouseLeave={e => (e.currentTarget.style.color = '#d0d5db')}
      >
        <X size={14} strokeWidth={2.2} />
      </button>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function LabourTradesPanel({ trades, defaultMarkup = 0, onChange }: Props) {
  const [open, setOpen] = useState(true)

  // Hydrate default cost rates from localStorage on first render
  useEffect(() => {
    if (trades.length > 0) {
      // No auto-update needed — rates are locked per-quote once the trade is added
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalCost  = labourTradesCostTotal(trades)
  const totalQuote = labourTradesTotal(trades)

  function handleAdd() {
    const existingTrades = new Set(trades.map(t => t.trade))
    const nextTrade = TRADE_TYPES.find(t => !existingTrades.has(t)) ?? TRADE_TYPES[0]
    onChange([...trades, newTrade(nextTrade, defaultMarkup)])
  }

  function handleChange(idx: number, updated: LabourTrade) {
    onChange(trades.map((t, i) => i === idx ? updated : t))
  }

  function handleRemove(idx: number) {
    onChange(trades.filter((_, i) => i !== idx))
  }

  return (
    <div style={{
      borderTop: '2px solid rgba(59,130,246,0.18)',
      background: 'rgba(59,130,246,0.015)',
    }}>

      {/* ── Panel header ─────────────────────────────────────────── */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 9, color: '#3b82f6', flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
        <HardHat size={13} strokeWidth={2.2} style={{ color: '#3b82f6', flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>Labour Trades</span>

        {/* Summary chips in header */}
        {trades.length > 0 && (
          <span style={{
            fontSize: 11, color: '#1e40af',
            background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.22)',
            borderRadius: 4, padding: '1px 7px',
            fontFamily: 'DM Mono, monospace', fontWeight: 600,
            flexShrink: 0,
          }}>
            {trades.length} trade{trades.length !== 1 ? 's' : ''}
          </span>
        )}

        {totalQuote > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 13, fontFamily: 'DM Mono, monospace',
            fontWeight: 700, color: '#15803d', flexShrink: 0,
          }}>
            {fmt(totalQuote)}
          </span>
        )}
      </div>

      {/* ── Expanded panel ─────────────────────────────────────────── */}
      {open && (
        <div onClick={e => e.stopPropagation()}>

          {/* Column headers */}
          {trades.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '160px 64px 72px 90px 72px 90px 90px 28px',
              gap: 6,
              padding: '4px 12px 4px',
              background: 'rgba(59,130,246,0.04)',
              borderBottom: '1px solid rgba(59,130,246,0.10)',
            }}>
              {[
                'Trade', 'Qty', 'Unit', '£ / unit', 'Markup %', 'Cost', 'Quote (ex VAT)', '',
              ].map((h, i) => (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.4px',
                  textAlign: i >= 5 ? 'right' : 'left',
                }}>
                  {h}
                </span>
              ))}
            </div>
          )}

          {/* Trade rows */}
          {trades.map((t, i) => (
            <TradeRow
              key={t.id}
              trade={t}
              onChange={u => handleChange(i, u)}
              onRemove={() => handleRemove(i)}
            />
          ))}

          {/* Empty state */}
          {trades.length === 0 && (
            <div style={{ padding: '16px 14px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No labour trades added yet.{' '}
              <button
                onClick={handleAdd}
                style={{ color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Add one now
              </button>
            </div>
          )}

          {/* Footer totals + add button */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px',
            background: trades.length > 0 ? '#f0f6fe' : 'transparent',
            borderTop: trades.length > 0 ? '1px solid rgba(59,130,246,0.12)' : 'none',
            flexWrap: 'wrap',
          }}>
            <button
              onClick={handleAdd}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', border: '1px solid #3b82f6',
                borderRadius: 5, background: 'transparent', color: '#3b82f6',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Plus size={11} strokeWidth={2.5} /> Add Trade
            </button>

            {trades.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Cost:{' '}
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 600, color: '#1e40af' }}>
                    {fmt(totalCost)}
                  </span>
                </span>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Quote ex VAT:{' '}
                  <span style={{ fontSize: 14, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#15803d' }}>
                    {fmt(totalQuote)}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
