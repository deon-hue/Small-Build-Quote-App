'use client'
// TaskLabourLinesEditor — compact per-task trade labour costing
// Lives inside each EstimatorItem's expanded row.
// Lines are cost-only (no per-line markup); global quote markup is applied
// later by calcPhaseSell, consistent with the rest of the estimator.

import { HardHat, RotateCcw, Plus } from 'lucide-react'
import {
  TRADE_TYPES,
  LABOUR_UNIT_OPTIONS,
  getDefaultTradeRate,
  getHourlyRate,
  getHalfDayRate,
  calcTaskLabourLine,
  taskLabourLinesTotal,
  type TaskLabourLine,
  type LabourUnit,
} from '@/lib/tradeRates'

interface Props {
  lines:    TaskLabourLine[]
  onChange: (updated: TaskLabourLine[]) => void
}

function newLine(): TaskLabourLine {
  const rate = getDefaultTradeRate('Builder')
  return calcTaskLabourLine({
    id:             `task-trade-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    trade:          'Builder',
    qty:            1,
    unit:           'day',
    defaultDayRate: rate.dayRate,
    dayRate:        rate.dayRate,
    isOverridden:   false,
    unitRate:       0,
    total:          0,
  })
}

export default function TaskLabourLinesEditor({ lines, onChange }: Props) {
  const total = taskLabourLinesTotal(lines)

  function updateLine(id: string, patch: Partial<TaskLabourLine>) {
    onChange(lines.map(l => l.id === id ? calcTaskLabourLine({ ...l, ...patch }) : l))
  }

  function removeLine(id: string) {
    onChange(lines.filter(l => l.id !== id))
  }

  return (
    <div style={{
      marginBottom: 12,
      borderRadius: 6,
      border: '1.5px solid rgba(59,130,246,0.22)',
      background: 'rgba(59,130,246,0.025)',
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 10px',
        background: 'rgba(59,130,246,0.08)',
        borderBottom: lines.length > 0 ? '1px solid rgba(59,130,246,0.14)' : 'none',
      }}>
        <HardHat size={12} strokeWidth={2.2} style={{ color: '#1e40af', flexShrink: 0 }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: '#1e40af',
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}>
          Task Labour Lines
        </span>
        {lines.length > 0 && (
          <span style={{
            fontSize: 10, background: 'rgba(59,130,246,0.15)', color: '#1e40af',
            borderRadius: 3, padding: '1px 6px', fontWeight: 700,
          }}>
            {lines.length} trade{lines.length !== 1 ? 's' : ''}
          </span>
        )}
        {total > 0 && (
          <span style={{
            marginLeft: 'auto',
            fontSize: 12, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#1e40af',
          }}>
            £{total.toFixed(2)}
          </span>
        )}
      </div>

      {/* ── Trade rows ── */}
      {lines.map(line => {
        const hourlyRate  = getHourlyRate(line.dayRate)
        const halfRate    = getHalfDayRate(line.dayRate)
        const isOverride  = line.isOverridden
        const unitLabel   = LABOUR_UNIT_OPTIONS.find(o => o.value === line.unit)?.short ?? line.unit

        return (
          <div key={line.id} style={{
            padding: '8px 10px',
            borderBottom: '1px solid rgba(59,130,246,0.08)',
            background: 'white',
          }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', flexWrap: 'wrap' }}>

              {/* Trade select */}
              <div style={{ flex: '1 1 110px', minWidth: 95 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                  Trade
                </div>
                <select
                  value={line.trade}
                  onChange={e => {
                    const rate = getDefaultTradeRate(e.target.value)
                    updateLine(line.id, {
                      trade:          e.target.value,
                      defaultDayRate: rate.dayRate,
                      dayRate:        rate.dayRate,
                    })
                  }}
                  style={{ fontSize: 12, padding: '4px 7px', width: '100%' }}
                >
                  {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Qty */}
              <div style={{ flex: '0 0 54px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                  Qty
                </div>
                <input
                  type="number" value={line.qty} min={0.5} step={0.5}
                  onChange={e => updateLine(line.id, { qty: Number(e.target.value) })}
                  style={{
                    width: '100%', textAlign: 'right', fontSize: 12,
                    padding: '4px 6px', fontFamily: 'DM Mono, monospace',
                  }}
                />
              </div>

              {/* Unit */}
              <div style={{ flex: '0 0 88px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3 }}>
                  Unit
                </div>
                <select
                  value={line.unit}
                  onChange={e => updateLine(line.id, { unit: e.target.value as LabourUnit })}
                  style={{ fontSize: 12, padding: '4px 7px', width: '100%' }}
                >
                  {LABOUR_UNIT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Day Rate */}
              <div style={{ flex: '1 1 84px', minWidth: 76 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 9, fontWeight: 700, color: '#1e40af',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3,
                }}>
                  <span>Day Rate</span>
                  {isOverride && (
                    <button
                      onClick={() => updateLine(line.id, { dayRate: line.defaultDayRate })}
                      title={`Reset to default £${line.defaultDayRate}/day`}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#f59e0b', padding: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 2,
                        fontSize: 9,
                      }}
                    >
                      <RotateCcw size={9} strokeWidth={2.5} />
                      <span>£{line.defaultDayRate}</span>
                    </button>
                  )}
                </div>
                <input
                  type="number" value={line.dayRate} min={0} step={5}
                  onChange={e => updateLine(line.id, { dayRate: Number(e.target.value) })}
                  style={{
                    width: '100%', textAlign: 'right', fontSize: 12,
                    padding: '4px 6px', fontFamily: 'DM Mono, monospace',
                    border:      isOverride ? '1.5px solid rgba(245,158,11,0.5)' : undefined,
                    background:  isOverride ? 'rgba(245,158,11,0.06)'            : undefined,
                    borderRadius: 4,
                  }}
                />
                <div style={{
                  fontSize: 9, color: 'var(--muted)', marginTop: 2,
                  fontFamily: 'DM Mono, monospace',
                }}>
                  £{halfRate}/half · £{hourlyRate}/hr
                </div>
              </div>

              {/* Total */}
              <div style={{ flex: '0 0 82px', textAlign: 'right' }}>
                <div style={{
                  fontSize: 9, fontWeight: 700, color: '#1e40af',
                  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3,
                }}>
                  Cost
                </div>
                <div style={{
                  fontSize: 13, fontFamily: 'DM Mono, monospace', fontWeight: 700,
                  color:      line.total > 0 ? '#1e40af' : '#ccc',
                  background: line.total > 0 ? 'rgba(59,130,246,0.08)' : 'transparent',
                  borderRadius: 4, padding: '4px 6px',
                  minHeight: 28, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                }}>
                  {line.total > 0 ? `£${line.total.toFixed(2)}` : '—'}
                </div>
                {line.total > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2, fontFamily: 'DM Mono, monospace' }}>
                    {line.qty} {unitLabel} × £{line.unitRate}
                  </div>
                )}
              </div>

              {/* Remove */}
              <button
                onClick={() => removeLine(line.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#ccc', fontSize: 15, padding: '0 2px', lineHeight: 1,
                  flexShrink: 0, marginBottom: 2,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#c0392b')}
                onMouseLeave={e => (e.currentTarget.style.color = '#ccc')}
              >×</button>
            </div>

            {/* Override badge */}
            {isOverride && (
              <div style={{ marginTop: 4 }}>
                <span style={{
                  fontSize: 9, background: 'rgba(245,158,11,0.12)', color: '#92400e',
                  border: '1px solid rgba(245,158,11,0.3)', borderRadius: 3,
                  padding: '1px 6px', fontWeight: 700,
                }}>
                  OVERRIDE — default £{line.defaultDayRate}/day
                </span>
              </div>
            )}
          </div>
        )
      })}

      {/* ── Footer ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px',
        background: 'rgba(59,130,246,0.04)',
        borderTop: lines.length > 0 ? '1px solid rgba(59,130,246,0.12)' : 'none',
      }}>
        <button
          onClick={() => onChange([...lines, newLine()])}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '4px 10px', borderRadius: 4,
            border: '1.5px solid rgba(59,130,246,0.3)',
            background: 'rgba(59,130,246,0.06)', color: '#1e40af',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          <Plus size={10} strokeWidth={2.5} />
          Add Trade
        </button>

        {total > 0 && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Labour total (cost):</span>
            <span style={{
              fontSize: 13, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: '#1e40af',
            }}>
              £{total.toFixed(2)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
