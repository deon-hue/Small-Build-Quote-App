'use client'
// ── Labour Trades Panel ──────────────────────────────────────────────────────
// Per-phase trade-by-trade labour pricing.
// Day rate is the master rate; hourly and half-day rates are derived from it.
//   Hourly   = Day ÷ 8
//   Half-Day = Day ÷ 2
// Per-quote overrides are supported — the Back Office default is never changed.

import { useState } from 'react'
import { HardHat, X, Plus, ChevronDown, RotateCcw } from 'lucide-react'
import {
  TRADE_TYPES,
  LABOUR_UNIT_OPTIONS,
  getHourlyRate,
  getHalfDayRate,
  calcLabourTrade,
  labourTradesTotal,
  labourTradesCostTotal,
  getDefaultTradeRate,
  type LabourTrade,
  type LabourUnit,
} from '@/lib/tradeRates'
import { fmt } from '@/lib/utils'

interface Props {
  trades:        LabourTrade[]
  defaultMarkup?: number   // quote's global markup — used to pre-fill new rows
  onChange:      (trades: LabourTrade[]) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function newTrade(tradeName: string, quoteMarkup: number): LabourTrade {
  const tr      = getDefaultTradeRate(tradeName)
  const markup  = tr.defaultMarkup > 0 ? tr.defaultMarkup : quoteMarkup
  return calcLabourTrade({
    id:             `trade-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    trade:          tradeName,
    qty:            1,
    unit:           'day',
    defaultDayRate: tr.dayRate,
    dayRate:        tr.dayRate,
    isOverridden:   false,
    markup,
    unitRate: 0, cost: 0, markupAmount: 0, quotePrice: 0,
  })
}

// ── Single trade row ─────────────────────────────────────────────────────────
function TradeRow({
  trade, onChange, onRemove,
}: {
  trade:    LabourTrade
  onChange: (t: LabourTrade) => void
  onRemove: () => void
}) {
  function update(patch: Partial<LabourTrade>) {
    const next = { ...trade, ...patch }
    // If the trade type changes, refresh the defaultDayRate and dayRate from Back Office
    if (patch.trade !== undefined && patch.trade !== trade.trade) {
      const tr = getDefaultTradeRate(patch.trade)
      next.defaultDayRate = tr.dayRate
      next.dayRate        = tr.dayRate
      next.markup         = tr.defaultMarkup > 0 ? tr.defaultMarkup : trade.markup
    }
    onChange(calcLabourTrade(next))
  }

  function resetToDefault() {
    onChange(calcLabourTrade({
      ...trade,
      dayRate:     trade.defaultDayRate,
      isOverridden: false,
    }))
  }

  const overridden  = trade.isOverridden
  const hourlyRate  = getHourlyRate(trade.dayRate)
  const halfDayRate = getHalfDayRate(trade.dayRate)

  const baseInp: React.CSSProperties = {
    padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5,
    fontSize: 13, background: '#fff', width: '100%', textAlign: 'right',
    fontFamily: 'DM Mono, monospace',
  }

  return (
    <div style={{
      borderBottom: '1px solid #f0ecf8',
      background: overridden ? 'rgba(251,191,36,0.03)' : '#fff',
    }}>
      {/* ── Main row ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '150px 55px 84px 1fr 64px 82px 86px 28px',
        gap: 6,
        alignItems: 'start',
        padding: '8px 12px',
      }}>

        {/* Trade */}
        <div style={{ position: 'relative' }}>
          <select
            value={trade.trade}
            onChange={e => update({ trade: e.target.value })}
            style={{
              ...baseInp, textAlign: 'left',
              appearance: 'none', paddingRight: 22, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown size={11} strokeWidth={2} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} />
        </div>

        {/* Qty */}
        <input
          type="number" value={trade.qty} min={0.5} step={0.5}
          onChange={e => update({ qty: Math.max(0.5, Number(e.target.value)) })}
          style={baseInp}
        />

        {/* Unit */}
        <div style={{ position: 'relative' }}>
          <select
            value={trade.unit}
            onChange={e => update({ unit: e.target.value as LabourUnit })}
            style={{
              ...baseInp, textAlign: 'left',
              appearance: 'none', paddingRight: 20, cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            {LABOUR_UNIT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown size={11} strokeWidth={2} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94a3b8' }} />
        </div>

        {/* Day Rate — master editable field + derived rates below */}
        <div>
          <div style={{ position: 'relative' }}>
            <input
              type="number" value={trade.dayRate} min={0} step={5}
              title="Day rate (£/day) — master rate"
              onChange={e => update({ dayRate: Math.max(0, Number(e.target.value)) })}
              style={{
                ...baseInp,
                border: overridden
                  ? '1.5px solid rgba(234,179,8,0.7)'
                  : '1px solid #c7d7e0',
                background: overridden ? '#fffbeb' : '#f0f8fc',
                paddingRight: overridden ? 30 : 8,
              }}
            />
            {/* Override indicator badge */}
            {overridden && (
              <span style={{
                position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                fontSize: 9, fontWeight: 700, color: '#b45309',
                background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)',
                borderRadius: 3, padding: '1px 4px', pointerEvents: 'none', letterSpacing: '0.3px',
              }}>
                OVERRIDE
              </span>
            )}
          </div>

          {/* Derived rates + reset */}
          <div style={{ marginTop: 3, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9.5, color: '#64748b', fontFamily: 'DM Mono, monospace' }}>
              £{halfDayRate.toFixed(2)}/half · £{hourlyRate.toFixed(2)}/hr
            </span>
            {overridden && (
              <button
                onClick={resetToDefault}
                title={`Reset to Back Office default (£${trade.defaultDayRate}/day)`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  fontSize: 9.5, color: '#b45309', background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, fontWeight: 600,
                }}
              >
                <RotateCcw size={9} strokeWidth={2.5} />
                Default £{trade.defaultDayRate}
              </button>
            )}
            {!overridden && (
              <span style={{ fontSize: 9.5, color: '#94a3b8' }}>£/day</span>
            )}
          </div>
        </div>

        {/* Markup % */}
        <input
          type="number" value={trade.markup} min={0} step={1}
          title="Markup %"
          onChange={e => update({ markup: Math.max(0, Number(e.target.value)) })}
          style={baseInp}
        />

        {/* Cost (read-only) */}
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
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: '#d0d5db',
            padding: 0, paddingTop: 5,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#c0392b')}
          onMouseLeave={e => (e.currentTarget.style.color = '#d0d5db')}
        >
          <X size={14} strokeWidth={2.2} />
        </button>
      </div>

      {/* ── Rate breakdown pill (visible when qty > 0 and rate set) ── */}
      {trade.qty > 0 && trade.dayRate > 0 && (
        <div style={{
          padding: '0 12px 8px 166px',
          fontSize: 10, color: '#64748b',
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <span style={{ fontWeight: 600, color: '#374151' }}>{trade.trade}</span>
          <span style={{ color: '#94a3b8' }}>·</span>
          <span>Day Rate: <strong style={{ color: '#1e40af', fontFamily: 'DM Mono, monospace' }}>£{trade.dayRate}</strong></span>
          <span style={{ color: '#94a3b8' }}>·</span>
          <span>Half-Day: <strong style={{ fontFamily: 'DM Mono, monospace' }}>£{halfDayRate.toFixed(2)}</strong></span>
          <span style={{ color: '#94a3b8' }}>·</span>
          <span>Hourly: <strong style={{ fontFamily: 'DM Mono, monospace' }}>£{hourlyRate.toFixed(2)}</strong></span>
          {overridden && (
            <>
              <span style={{ color: '#94a3b8' }}>·</span>
              <span style={{
                color: '#b45309', fontWeight: 600, background: 'rgba(234,179,8,0.12)',
                padding: '1px 6px', borderRadius: 3, border: '1px solid rgba(234,179,8,0.3)',
              }}>
                Override applied (default £{trade.defaultDayRate}/day)
              </span>
            </>
          )}
          {/* Calculation preview */}
          <span style={{ marginLeft: 'auto', color: '#374151', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
            {trade.qty} {trade.unit === 'day' ? `day${trade.qty !== 1 ? 's' : ''}` : trade.unit === 'half-day' ? `half-day${trade.qty !== 1 ? 's' : ''}` : `hr${trade.qty !== 1 ? 's' : ''}`}
            {' × '}£{trade.unitRate.toFixed(2)}
            {trade.markup > 0 && <> + {trade.markup}% markup</>}
            {' = '}
            <span style={{ color: '#15803d' }}>{fmt(trade.quotePrice)}</span>
          </span>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function LabourTradesPanel({ trades, defaultMarkup = 0, onChange }: Props) {
  const [open, setOpen] = useState(true)

  const totalCost  = labourTradesCostTotal(trades)
  const totalQuote = labourTradesTotal(trades)
  const hasOverride = trades.some(t => t.isOverridden)

  function handleAdd() {
    const used     = new Set(trades.map(t => t.trade))
    const nextName = TRADE_TYPES.find(t => !used.has(t)) ?? TRADE_TYPES[0]
    onChange([...trades, newTrade(nextName, defaultMarkup)])
  }

  return (
    <div style={{
      borderTop: '2px solid rgba(59,130,246,0.18)',
      background: 'rgba(59,130,246,0.012)',
    }}>

      {/* ── Header ── */}
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

        {trades.length > 0 && (
          <span style={{
            fontSize: 11, color: '#1e40af',
            background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.22)',
            borderRadius: 4, padding: '1px 7px',
            fontFamily: 'DM Mono, monospace', fontWeight: 600, flexShrink: 0,
          }}>
            {trades.length} trade{trades.length !== 1 ? 's' : ''}
          </span>
        )}

        {hasOverride && (
          <span style={{
            fontSize: 10, color: '#b45309',
            background: 'rgba(234,179,8,0.12)', border: '1px solid rgba(234,179,8,0.3)',
            borderRadius: 3, padding: '1px 6px', fontWeight: 600, flexShrink: 0,
          }}>
            overrides applied
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

      {/* ── Body ── */}
      {open && (
        <div onClick={e => e.stopPropagation()}>

          {/* Column headers */}
          {trades.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '150px 55px 84px 1fr 64px 82px 86px 28px',
              gap: 6,
              padding: '4px 12px',
              background: 'rgba(59,130,246,0.04)',
              borderBottom: '1px solid rgba(59,130,246,0.10)',
              borderTop: '1px solid rgba(59,130,246,0.06)',
            }}>
              {[
                { label: 'Trade',              align: 'left'  },
                { label: 'Qty',                align: 'right' },
                { label: 'Unit',               align: 'left'  },
                { label: 'Day Rate (£)',        align: 'right' },
                { label: 'Markup %',           align: 'right' },
                { label: 'Cost',               align: 'right' },
                { label: 'Quote (ex VAT)',      align: 'right' },
                { label: '',                   align: 'left'  },
              ].map(({ label, align }, i) => (
                <span key={i} style={{
                  fontSize: 9, fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '0.4px',
                  textAlign: align as 'left' | 'right',
                }}>
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Trade rows */}
          {trades.map((t, i) => (
            <TradeRow
              key={t.id}
              trade={t}
              onChange={u => onChange(trades.map((x, j) => j === i ? u : x))}
              onRemove={() => onChange(trades.filter((_, j) => j !== i))}
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

          {/* Footer */}
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
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.07)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Plus size={11} strokeWidth={2.5} /> Add Trade
            </button>

            {trades.length > 0 && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
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
