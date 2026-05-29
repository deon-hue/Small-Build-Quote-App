'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  fetchLabourTrades, upsertLabourTrade, deleteLabourTrade,
} from '@/lib/back-office-queries'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { RotateCcw, Plus, Trash2 } from 'lucide-react'

interface Props { userId: string }

function autoHalf(dayRate: number) { return +(dayRate / 2).toFixed(2) }
function autoHourly(dayRate: number) { return +(dayRate / 8).toFixed(2) }

export default function SectionLabour({ userId }: Props) {
  const sb = createClient()
  const [trades, setTrades] = useState<BOLabourTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setTrades(await fetchLabourTrades(sb, userId))
    setLoading(false)
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function saveTrade(trade: BOLabourTrade) {
    setSaving(trade.id)
    await upsertLabourTrade(sb, { ...trade, user_id: userId })
    setSaving(null)
  }

  async function removeTrade(id: string) {
    if (!confirm('Delete this trade?')) return
    await deleteLabourTrade(sb, id)
    setTrades(prev => prev.filter(t => t.id !== id))
  }

  async function addTrade() {
    const newTrade = await upsertLabourTrade(sb, {
      user_id: userId, name: 'New Trade', day_rate: 0, markup_pct: 20,
      active: true, display_order: trades.length,
    })
    if (newTrade) setTrades(prev => [...prev, newTrade])
  }

  function updateLocal(id: string, patch: Partial<BOLabourTrade>) {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  if (loading) return <div style={{ padding: 32, color: '#64748b', textAlign: 'center' }}>Loading trades…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Labour & Trades</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Day rate is the master rate. Half-day and hourly are auto-calculated (÷ 2 and ÷ 8). Half-day can be manually overridden.
          </p>
        </div>
        <button
          onClick={addTrade}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#4a90a4', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={14} /> Add Trade
        </button>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px 110px 100px 80px 36px', gap: 8, padding: '8px 12px', borderBottom: '2px solid #e2e8f0', marginBottom: 2 }}>
        {[
          { label: 'Trade', hint: '' },
          { label: 'Day Rate', hint: '£/day (master)' },
          { label: 'Half-Day Rate', hint: 'auto = Day ÷ 2' },
          { label: 'Hourly Rate', hint: 'auto = Day ÷ 8' },
          { label: 'Markup', hint: '% on sell price' },
          { label: 'Active', hint: '' },
        ].map(({ label, hint }) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
            {hint && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{hint}</div>}
          </div>
        ))}
        <div />
      </div>

      {trades.map(trade => {
        const halfAuto = autoHalf(trade.day_rate)
        const halfValue = trade.half_day_rate_override ?? halfAuto
        const isOverridden = trade.half_day_rate_override != null
        const hourly = autoHourly(trade.day_rate)
        const isSaving = saving === trade.id

        return (
          <div key={trade.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 150px 110px 100px 80px 36px', gap: 8, padding: '9px 12px', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
            {/* Name */}
            <input
              value={trade.name}
              onChange={e => updateLocal(trade.id, { name: e.target.value })}
              onBlur={() => saveTrade(trade)}
              style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 13, fontWeight: 600 }}
            />

            {/* Day Rate — PRIMARY */}
            <input
              type="number" value={trade.day_rate} min={0} step={5}
              onChange={e => updateLocal(trade.id, { day_rate: +e.target.value })}
              onBlur={() => saveTrade(trade)}
              style={{ padding: '6px 8px', border: '1.5px solid #3b82f6', borderRadius: 5, fontSize: 13, textAlign: 'right', background: '#eff6ff', fontWeight: 700 }}
            />

            {/* Half-Day */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <input
                type="number" value={halfValue} min={0} step={5}
                onChange={e => {
                  const v = +e.target.value
                  updateLocal(trade.id, { half_day_rate_override: v === halfAuto ? null : v })
                }}
                onBlur={() => saveTrade(trade)}
                style={{
                  padding: '6px 8px', flex: 1, minWidth: 0,
                  border: isOverridden ? '1.5px solid rgba(234,179,8,0.7)' : '1px solid #e2e8f0',
                  borderRadius: 5, fontSize: 13, textAlign: 'right',
                  background: isOverridden ? '#fffbeb' : '#f8fafc',
                }}
              />
              {isOverridden ? (
                <button
                  title="Clear override"
                  onClick={() => { updateLocal(trade.id, { half_day_rate_override: null }); saveTrade({ ...trade, half_day_rate_override: null }) }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', padding: 2, flexShrink: 0 }}
                >
                  <RotateCcw size={12} />
                </button>
              ) : (
                <span style={{ fontSize: 9, color: '#94a3b8', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 3, padding: '2px 4px', fontWeight: 700, flexShrink: 0 }}>AUTO</span>
              )}
            </div>

            {/* Hourly — read only */}
            <div style={{ padding: '6px 8px', borderRadius: 5, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, textAlign: 'right', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
              £{hourly.toFixed(2)}
              <span style={{ fontSize: 9, color: '#94a3b8', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 3, padding: '2px 4px', fontWeight: 700 }}>AUTO</span>
            </div>

            {/* Markup % */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number" value={trade.markup_pct} min={0} max={200} step={1}
                onChange={e => updateLocal(trade.id, { markup_pct: +e.target.value })}
                onBlur={() => saveTrade(trade)}
                style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 13, textAlign: 'right', background: '#fafafa', width: 60 }}
              />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>%</span>
            </div>

            {/* Active */}
            <div style={{ textAlign: 'center' }}>
              <input
                type="checkbox" checked={trade.active}
                onChange={e => { updateLocal(trade.id, { active: e.target.checked }); saveTrade({ ...trade, active: e.target.checked }) }}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
            </div>

            {/* Delete */}
            <button
              onClick={() => removeTrade(trade.id)}
              disabled={isSaving}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: 4 }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}

      {trades.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8', fontSize: 13 }}>
          No trades yet. Click <strong>Add Trade</strong> to get started.
        </div>
      )}

      <div style={{ marginTop: 16, padding: '10px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#64748b', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <span>Standard day = 8 hours</span>
        <span>Hourly = Day ÷ 8</span>
        <span>Half-day = Day ÷ 2 (auto) or manually set</span>
        <span>All rates are cost prices before markup</span>
        <span style={{ color: '#3b82f6', fontWeight: 600 }}>Saved to database — syncs across all modules</span>
      </div>
    </div>
  )
}
