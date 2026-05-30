'use client'

/**
 * LabourCostBuilder — reusable labour selector for every Takeoff properties panel.
 *
 * Controlled component: receives current labourLines and fires onChange when any
 * line is added, edited, or removed.  All state lives in the parent (TakeoffItem).
 *
 * Rates source: Back Office bo_labour_trades.
 *   day_rate          → Day rate
 *   half_day_rate_override ?? day_rate/2  → Half-day rate
 *   day_rate / 8      → Hourly rate (derived)
 */

import type { BOLabourTrade } from '@/lib/back-office-types'
import type { TakeoffLabourLine, LabourRateType } from '@/lib/takeoff-types'

// ── helpers ───────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10) }

function effectiveRate(trade: BOLabourTrade, rateType: LabourRateType): number {
  if (rateType === 'day')      return trade.day_rate
  if (rateType === 'half_day') return trade.half_day_rate_override ?? +(trade.day_rate / 2).toFixed(2)
  // hourly
  return +(trade.day_rate / 8).toFixed(2)
}

function calcTotal(rate: number, qty: number, ops: number): number {
  return +(rate * qty * ops).toFixed(2)
}

const RATE_TYPE_LABELS: Record<LabourRateType, string> = {
  hourly:   'Hourly',
  half_day: 'Half Day',
  day:      'Day',
}

const RATE_TYPE_QTY_LABEL: Record<LabourRateType, string> = {
  hourly:   'Hours',
  half_day: 'Half-days',
  day:      'Days',
}

// ── component ─────────────────────────────────────────────────────────────────

interface Props {
  labourLines: TakeoffLabourLine[]
  trades:      BOLabourTrade[]
  onChange:    (lines: TakeoffLabourLine[]) => void
}

export default function LabourCostBuilder({ labourLines, trades, onChange }: Props) {

  // ── derived ────────────────────────────────────────────────────────────────
  const total = labourLines.reduce((s, l) => s + l.total, 0)
  const activeTrades = trades.filter(t => t.active)

  // ── helpers ────────────────────────────────────────────────────────────────
  function addLine() {
    if (activeTrades.length === 0) return
    const trade = activeTrades[0]
    const rateType: LabourRateType = 'day'
    const rate = effectiveRate(trade, rateType)
    const newLine: TakeoffLabourLine = {
      id: uid(),
      tradeId:    trade.id,
      tradeName:  trade.name,
      rateType,
      rate,
      quantity:   1,
      operatives: 1,
      total:      calcTotal(rate, 1, 1),
    }
    onChange([...labourLines, newLine])
  }

  function updateLine(id: string, patch: Partial<TakeoffLabourLine>) {
    onChange(labourLines.map(l => {
      if (l.id !== id) return l
      const merged = { ...l, ...patch }
      // Recalculate rate if trade or rateType changed
      if (patch.tradeId || patch.rateType) {
        const trade = activeTrades.find(t => t.id === merged.tradeId) ?? activeTrades[0]
        if (trade) {
          merged.tradeName = trade.name
          merged.rate = effectiveRate(trade, merged.rateType)
        }
      }
      merged.total = calcTotal(merged.rate, merged.quantity, merged.operatives)
      return merged
    }))
  }

  function removeLine(id: string) {
    onChange(labourLines.filter(l => l.id !== id))
  }

  // ── styles ─────────────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    width: '100%', background: 'var(--to-input)', border: '1px solid var(--to-input-bd)',
    borderRadius: 4, color: 'var(--to-text)', fontSize: 11,
    padding: '4px 6px', boxSizing: 'border-box', outline: 'none',
  }
  const sel: React.CSSProperties = { ...inp }
  const lbl: React.CSSProperties = {
    fontSize: 9, color: 'var(--to-muted)', textTransform: 'uppercase' as const,
    letterSpacing: 0.5, display: 'block', marginBottom: 2,
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontSize: 12 }}>

      {/* Header row: total + Add button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--to-accent)', fontFamily: 'monospace' }}>
            £{total.toFixed(2)}
          </span>
          <span style={{ fontSize: 10, color: 'var(--to-muted)' }}>
            labour total{labourLines.length > 0 ? ` (${labourLines.length} line${labourLines.length > 1 ? 's' : ''})` : ''}
          </span>
        </div>
        <button
          onClick={addLine}
          disabled={activeTrades.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '4px 10px', border: `1px solid ${activeTrades.length ? 'var(--to-active-bd)' : 'var(--to-border)'}`,
            borderRadius: 5, background: 'transparent',
            color: activeTrades.length ? 'var(--to-accent)' : 'var(--to-muted)',
            fontSize: 11, fontWeight: 600, cursor: activeTrades.length ? 'pointer' : 'not-allowed',
          }}>
          + Add Labour
        </button>
      </div>

      {/* Empty state */}
      {labourLines.length === 0 && activeTrades.length === 0 && (
        <div style={{
          fontSize: 11, color: 'var(--to-muted)', fontStyle: 'italic',
          padding: '8px 10px', border: '1px dashed var(--to-border)', borderRadius: 5,
          textAlign: 'center',
        }}>
          No labour rates set up. Add trade rates in Back Office.
        </div>
      )}

      {labourLines.length === 0 && activeTrades.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--to-muted)', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>
          No labour lines — click <strong>+ Add Labour</strong> above
        </div>
      )}

      {/* Labour lines */}
      {labourLines.map((line, idx) => {
        const trade = activeTrades.find(t => t.id === line.tradeId)
        return (
          <div key={line.id} style={{
            marginBottom: 8, padding: '8px 10px', borderRadius: 6,
            background: 'var(--to-alt)', border: '1px solid var(--to-border)',
          }}>

            {/* Row 1: trade / rate type / qty / ops / total / remove */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 84px 56px 42px 62px 22px', gap: 5, alignItems: 'end' }}>

              {/* Trade */}
              <div>
                <label style={lbl}>Trade</label>
                {activeTrades.length > 0 ? (
                  <select style={sel}
                    value={line.tradeId}
                    onChange={e => updateLine(line.id, { tradeId: e.target.value })}>
                    {activeTrades.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                    {/* If trade was deleted, still show it as an option */}
                    {!trade && (
                      <option value={line.tradeId}>{line.tradeName} (deleted)</option>
                    )}
                  </select>
                ) : (
                  <div style={{ ...inp, color: 'var(--to-muted)', fontStyle: 'italic' }}>{line.tradeName}</div>
                )}
              </div>

              {/* Rate type */}
              <div>
                <label style={lbl}>Rate Type</label>
                <select style={sel} value={line.rateType}
                  onChange={e => updateLine(line.id, { rateType: e.target.value as LabourRateType })}>
                  {(Object.keys(RATE_TYPE_LABELS) as LabourRateType[]).map(rt => (
                    <option key={rt} value={rt}>{RATE_TYPE_LABELS[rt]}</option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label style={lbl}>{RATE_TYPE_QTY_LABEL[line.rateType]}</label>
                <input type="number" min={0} step={0.5} style={inp}
                  value={line.quantity}
                  onChange={e => updateLine(line.id, { quantity: Math.max(0, +e.target.value || 0) })} />
              </div>

              {/* Operatives */}
              <div>
                <label style={lbl}>Ops</label>
                <input type="number" min={1} max={99} step={1} style={inp}
                  value={line.operatives}
                  onChange={e => updateLine(line.id, { operatives: Math.max(1, +e.target.value || 1) })} />
              </div>

              {/* Calculated total */}
              <div>
                <label style={lbl}>Total</label>
                <div style={{
                  ...inp, background: 'transparent', fontFamily: 'monospace', fontWeight: 700,
                  color: 'var(--to-accent)', textAlign: 'right', padding: '4px 2px',
                }}>
                  £{line.total.toFixed(0)}
                </div>
              </div>

              {/* Remove */}
              <div style={{ paddingBottom: 1 }}>
                <button onClick={() => removeLine(line.id)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: '#e74c3c', fontSize: 16, lineHeight: 1, padding: 0,
                  display: 'flex', alignItems: 'center',
                }}>×</button>
              </div>
            </div>

            {/* Row 2: rate info + notes */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginTop: 5, alignItems: 'start' }}>
              {/* Rate display (read-only, derived from trade) */}
              <div style={{ fontSize: 10, color: 'var(--to-muted)', paddingTop: 2 }}>
                {trade
                  ? `£${line.rate.toFixed(2)} / ${line.rateType === 'hourly' ? 'hr' : line.rateType === 'half_day' ? 'half-day' : 'day'}
                     × ${line.quantity} × ${line.operatives} op${line.operatives > 1 ? 's' : ''}`
                  : `£${line.rate.toFixed(2)} (trade deleted)`
                }
                {trade && trade.markup_pct > 0 && (
                  <span style={{ color: 'var(--to-dim)', marginLeft: 4 }}>+{trade.markup_pct}% markup in BO</span>
                )}
              </div>
              {/* Notes */}
              <input
                style={{ ...inp, fontSize: 10 }}
                placeholder="Notes (optional)"
                value={line.notes ?? ''}
                onChange={e => updateLine(line.id, { notes: e.target.value || undefined })}
              />
            </div>
          </div>
        )
      })}

      {/* Summary when multiple lines */}
      {labourLines.length > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '5px 10px', borderRadius: 5, marginTop: 2,
          background: 'var(--to-hover)', border: '1px solid var(--to-border)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--to-muted)' }}>Total labour ({labourLines.length} lines)</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--to-accent)', fontFamily: 'monospace' }}>
            £{total.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  )
}
