'use client'

/**
 * QuoteWorkspace — clean 5-level hierarchical quote builder.
 *
 * Hierarchy:
 *   Phase (parentPhase)
 *     Area/Room (roomLabel)
 *       Sub-phase (phase)
 *         Task (taskGroup)
 *           Cost row (QuoteItem)
 *
 * Works for all data sources: takeoff import, AI-generated, manual.
 */

import React, { useState, useCallback } from 'react'
import type { QuotePhase, QuoteItem, QuoteProduct, QuotePlantItem } from '@/lib/types'
import type { BOLabourTrade, BOProduct, BOPlantItem, BOPhase, BOSubPhase } from '@/lib/back-office-types'
import { fmt, calcPhase, calcPhaseSell } from '@/lib/utils'
import ProductPicker      from '@/components/ProductPicker'
import PlantPicker        from '@/components/PlantPicker'
import PhaseReviewModal   from '@/components/PhaseReviewModal'

// ── IDs ────────────────────────────────────────────────────────────────────────
let _id = Date.now()
const uid = () => ++_id

// ── Cost helpers ───────────────────────────────────────────────────────────────
const ITEM_TYPES = ['labour','materials','plant','subcontractors','other'] as const
type ItemType = typeof ITEM_TYPES[number]

const TYPE_LABEL: Record<ItemType, string> = {
  labour: 'Labour', materials: 'Materials', plant: 'Plant',
  subcontractors: 'Subcontract', other: 'Other',
}
const TYPE_COLOR: Record<ItemType, { bg: string; text: string }> = {
  labour:         { bg: '#fef3c7', text: '#92400e' },
  materials:      { bg: '#dbeafe', text: '#1d4ed8' },
  plant:          { bg: '#f3e8ff', text: '#7c3aed' },
  subcontractors: { bg: '#fee2e2', text: '#991b1b' },
  other:          { bg: '#f1f5f9', text: '#475569' },
}

// Card-style presentation for each cost category (accordion tiles)
const CARD_META: Record<ItemType, { icon: string; label: string; accent: string; bg: string; border: string }> = {
  labour:         { icon: '🔨', label: 'Labour',          accent: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  materials:      { icon: '📦', label: 'Materials',       accent: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  plant:          { icon: '🚜', label: 'Plant',           accent: '#7c3aed', bg: '#faf5ff', border: '#e9d5ff' },
  subcontractors: { icon: '👷', label: 'Subcontractors',  accent: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  other:          { icon: '📋', label: 'Other',           accent: '#475569', bg: '#f8fafc', border: '#e2e8f0' },
}

function itemCost(i: QuoteItem): number {
  if (i.enabled === false) return 0
  const base = (i.labour ?? 0) + (i.materials ?? 0) + (i.plantHire ?? 0) + (i.subcontractors ?? 0) + (i.other ?? 0)
  return base * Math.max(i.qty ?? 1, 1)
}
function phaseSell(p: QuotePhase, markup: number): number {
  return calcPhaseSell(p, markup)
}
function fmt2(n: number) { return n.toFixed(2) }

// ── Hierarchy builders ─────────────────────────────────────────────────────────

/** Ordered unique values preserving insertion order */
function ordered<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

function getMainPhases(phases: QuotePhase[]): string[] {
  return ordered(phases.map(p => p.parentPhase || '(No Phase)'))
}
function getRoomLabels(phases: QuotePhase[], mainPhase: string): string[] {
  const sub = phases.filter(p => (p.parentPhase || '(No Phase)') === mainPhase)
  return ordered(sub.map(p => p.roomLabel || ''))
}
function getSubPhases(phases: QuotePhase[], mainPhase: string, room: string): QuotePhase[] {
  return phases.filter(p =>
    (p.parentPhase || '(No Phase)') === mainPhase &&
    (p.roomLabel || '') === room
  )
}
function getTaskGroups(items: QuoteItem[]): string[] {
  return ordered(items.map(i => i.taskGroup || ''))
}
function getItemsInTask(items: QuoteItem[], tg: string): QuoteItem[] {
  return items.filter(i => (i.taskGroup || '') === tg)
}

// ── Totals ─────────────────────────────────────────────────────────────────────
function taskTotal(items: QuoteItem[], tg: string, markup: number): number {
  const cost = getItemsInTask(items, tg).reduce((s, i) => s + itemCost(i), 0)
  return +(cost * (1 + markup / 100)).toFixed(2)
}
function productLineSell(prod: QuoteProduct): number {
  if (prod.enabled === false) return 0
  return +(prod.sellPrice * prod.qty).toFixed(2)
}

function plantLineSell(pl: QuotePlantItem): number {
  if (pl.enabled === false) return 0
  return +(pl.sellPrice * pl.qty).toFixed(2)
}

function subPhaseTotalSell(p: QuotePhase, markup: number): number {
  // products and plantItems are now included in calcPhaseSell (via phaseSell)
  // so we must NOT add them again here — they were previously double-counted.
  return +phaseSell(p, markup).toFixed(2)
}
function roomTotalSell(phases: QuotePhase[], mainPhase: string, room: string, markup: number): number {
  return getSubPhases(phases, mainPhase, room).reduce((s, p) => s + phaseSell(p, markup), 0)
}
function mainPhaseTotalSell(phases: QuotePhase[], mainPhase: string, markup: number): number {
  return phases.filter(p => (p.parentPhase || '(No Phase)') === mainPhase)
    .reduce((s, p) => s + phaseSell(p, markup), 0)
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const fldStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', outline: 'none',
  fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit',
  width: '100%', padding: 0,
}
const cellInp: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  fontFamily: 'monospace', fontSize: 12, textAlign: 'right', padding: '2px 4px',
  borderRadius: 3,
}
const addBtn: React.CSSProperties = {
  background: 'transparent', border: '1px dashed #94a3b8', borderRadius: 4,
  color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '3px 8px',
  display: 'inline-flex', alignItems: 'center', gap: 3,
}
const iconBtn = (color = '#64748b'): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 13,
  padding: '1px 5px', borderRadius: 3, lineHeight: 1,
})

// ── Cost row ──────────────────────────────────────────────────────────────────

// ── Labour rate helpers (shared with BO task editor) ──────────────────────────
type LabourRateType = 'hourly' | 'half_day' | 'day'
const LABOUR_RATE_LABELS: Record<LabourRateType, string> = { hourly: 'Hourly', half_day: 'Half Day', day: 'Day' }
const LABOUR_QTY_LABELS:  Record<LabourRateType, string> = { hourly: 'hrs', half_day: 'half-days', day: 'days' }

function boLabourRate(trade: BOLabourTrade, rt: LabourRateType): number {
  if (rt === 'day')      return trade.day_rate
  if (rt === 'half_day') return trade.half_day_rate_override ?? +(trade.day_rate / 2).toFixed(2)
  return +(trade.day_rate / 8).toFixed(2)
}

interface CostRowProps {
  item: QuoteItem
  isLocked: boolean
  onUpdate: (item: QuoteItem) => void
  onDelete: () => void
  onDuplicate: () => void
  isFirst: boolean
  labourTrades?: BOLabourTrade[]
  boProducts?: BOProduct[]
  boPlantItems?: BOPlantItem[]
  /** When set, the row's category is fixed by the parent card — hides the category dropdown. */
  lockCategory?: boolean
}

function CostRow({ item, isLocked, onUpdate, onDelete, onDuplicate, isFirst, labourTrades = [], lockCategory = false }: CostRowProps) {
  const cat      = (item.itemType ?? 'other') as ItemType
  const cs       = TYPE_COLOR[cat]
  const enabled  = item.enabled !== false   // default true
  const cost     = itemCost(item)           // returns 0 when disabled
  const rawCost  = ((item.labour ?? 0) + (item.materials ?? 0) + (item.plantHire ?? 0) + (item.subcontractors ?? 0) + (item.other ?? 0)) * Math.max(item.qty ?? 1, 1)
  const isLabour = cat === 'labour'

  // Labour picker state (local — doesn't need to persist)
  const [showPicker,   setShowPicker]   = useState(false)

  // Multi-trade lines — each line is one trade × rate × qty × workers
  interface TradeLine { id: number; tradeId: string; rateType: LabourRateType; qty: number; workers: number }
  const [tradeLines, setTradeLines] = useState<TradeLine[]>([
    { id: 1, tradeId: labourTrades[0]?.id ?? '', rateType: 'day', qty: 1, workers: 1 }
  ])
  let tlCounter = tradeLines.length + 1

  // Local trade list — starts from prop, grows when user adds a new trade inline
  const [localTrades,  setLocalTrades]  = useState<typeof labourTrades>(labourTrades)
  // New-trade inline form
  const [addingTrade,  setAddingTrade]  = useState(false)
  const [newTradeName, setNewTradeName] = useState('')
  const [newTradeRate, setNewTradeRate] = useState<number>(200)
  const [savingTrade,  setSavingTrade]  = useState(false)

  function tradeLineTotal(tl: TradeLine): number {
    const trade = localTrades.find(t => t.id === tl.tradeId)
    if (!trade) return 0
    return +(boLabourRate(trade, tl.rateType) * tl.qty * tl.workers).toFixed(2)
  }
  const pickedTotal = +tradeLines.reduce((s, tl) => s + tradeLineTotal(tl), 0).toFixed(2)

  function updateTradeLine(id: number, patch: Partial<TradeLine>) {
    setTradeLines(prev => prev.map(tl => tl.id === id ? { ...tl, ...patch } : tl))
  }
  function removeTradeLine(id: number) {
    setTradeLines(prev => prev.length > 1 ? prev.filter(tl => tl.id !== id) : prev)
  }
  function addTradeLine() {
    setTradeLines(prev => [...prev, { id: tlCounter++, tradeId: localTrades[0]?.id ?? '', rateType: 'day', qty: 1, workers: 1 }])
  }

  async function saveNewTrade() {
    if (!newTradeName.trim()) return
    setSavingTrade(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data, error } = await sb.from('bo_labour_trades').insert({
        user_id: user.id,
        name: newTradeName.trim(),
        day_rate: newTradeRate,
        half_day_rate_override: null,
        markup_pct: 20,
        active: true,
        display_order: 999,
      }).select().single()
      if (error || !data) return
      const newTrade = data as typeof labourTrades[0]
      setLocalTrades(prev => [...prev, newTrade])
      // Auto-select the new trade in the last line
      setTradeLines(prev => prev.map((tl, i) => i === prev.length - 1 ? { ...tl, tradeId: newTrade.id } : tl))
      setAddingTrade(false)
      setNewTradeName('')
      setNewTradeRate(200)
    } finally { setSavingTrade(false) }
  }

  function applyPicker() {
    if (tradeLines.length === 0) return
    const noteParts = tradeLines.map(tl => {
      const trade = localTrades.find(t => t.id === tl.tradeId)
      if (!trade) return null
      const rate = boLabourRate(trade, tl.rateType)
      const unit = tl.rateType === 'hourly' ? 'hr' : tl.rateType === 'half_day' ? 'half-day' : 'day'
      const suffix = tl.workers > 1 ? ` × ${tl.workers} workers` : ''
      return `${trade.name} £${rate.toFixed(2)}/${unit} × ${tl.qty}${suffix} = £${tradeLineTotal(tl).toFixed(2)}`
    }).filter(Boolean)
    const firstTrade = localTrades.find(t => t.id === tradeLines[0]?.tradeId)
    onUpdate({
      ...item,
      labour: pickedTotal,
      qty: 1,
      desc: item.desc || (tradeLines.length === 1 && firstTrade ? firstTrade.name : 'Labour'),
      notes: noteParts.join(' | '),
    })
    setShowPicker(false)
  }

  function setField<K extends keyof QuoteItem>(k: K, v: QuoteItem[K]) {
    onUpdate({ ...item, [k]: v })
  }
  function setNum(k: 'labour' | 'materials' | 'plantHire' | 'subcontractors' | 'other', raw: string) {
    setField(k, +raw || 0)
  }

  const catKey: 'labour' | 'materials' | 'plantHire' | 'subcontractors' | 'other' =
    cat === 'plant' ? 'plantHire' : cat as 'labour' | 'materials' | 'subcontractors' | 'other'

  return (
    <>
    <tr style={{ borderBottom: showPicker ? 'none' : '1px solid #f1f5f9', opacity: enabled ? 1 : 0.45 }}>

      {/* Col 0: Toggle — 24px */}
      <td style={{ padding: '5px 4px', width: 24, verticalAlign: 'top', paddingTop: 7 }}>
        <button
          onClick={() => setField('enabled', !enabled)}
          disabled={isLocked}
          title={enabled ? 'Exclude from total' : 'Include in total'}
          style={{
            background: 'none', border: 'none', cursor: isLocked ? 'default' : 'pointer',
            fontSize: 13, lineHeight: 1, padding: 0, color: enabled ? '#22c55e' : '#cbd5e1',
          }}
        >
          {enabled ? '●' : '○'}
        </button>
      </td>

      {/* Col 1: Category chip — fixed 76px (hidden when the card already fixes the category) */}
      {!lockCategory && (
        <td style={{ padding: '5px 6px', width: 76, verticalAlign: 'top', paddingTop: 7 }}>
          <select value={cat} disabled={isLocked}
            onChange={e => setField('itemType', e.target.value as ItemType)}
            style={{ fontSize: 10, fontWeight: 700, padding: '2px 4px', borderRadius: 4,
              border: 'none', cursor: 'pointer', background: enabled ? cs.bg : '#f1f5f9', color: enabled ? cs.text : '#94a3b8',
              width: '100%', outline: 'none' }}>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </td>
      )}

      {/* Col 2: Description + notes sub-line — flex grows */}
      <td style={{ padding: '4px 8px', verticalAlign: 'top' }}>
        <input
          style={{ ...fldStyle, fontSize: 12, width: '100%', display: 'block' }}
          value={item.desc} readOnly={isLocked}
          onChange={e => setField('desc', e.target.value)}
          placeholder="Description"
          title={item.desc}
        />
        {/* Notes as subtle sub-line — avoids a whole extra column */}
        {(item.notes || !isLocked) && (
          <input
            style={{ ...fldStyle, fontSize: 10, color: '#94a3b8', width: '100%', display: 'block', marginTop: 1 }}
            value={item.notes} readOnly={isLocked}
            onChange={e => setField('notes', e.target.value)}
            placeholder={isLocked ? '' : 'Notes…'}
          />
        )}
      </td>

      {/* Col 3: Qty — 52px */}
      <td style={{ padding: '5px 4px', width: 52, verticalAlign: 'top' }}>
        <input type="number"
          style={{ ...cellInp, width: '100%' }}
          value={item.qty} readOnly={isLocked}
          onChange={e => setField('qty', +e.target.value || 0)} />
      </td>

      {/* Col 4: Unit — 40px */}
      <td style={{ padding: '5px 4px', width: 40, verticalAlign: 'top' }}>
        <input
          style={{ ...fldStyle, fontSize: 11, textAlign: 'center', color: '#64748b' }}
          value={item.unit} readOnly={isLocked}
          onChange={e => setField('unit', e.target.value)} />
      </td>

      {/* Col 5: Rate — 88px (+ 🔨 for labour) */}
      <td style={{ padding: '5px 4px', width: 88, verticalAlign: 'top' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#cbd5e1', pointerEvents: 'none' }}>£</span>
            <input type="number"
              style={{ ...cellInp, paddingLeft: 14, width: '100%' }}
              value={item[catKey] ?? 0} readOnly={isLocked}
              onChange={e => setNum(catKey, e.target.value)} />
          </div>
          {isLabour && !isLocked && (
            <button onClick={() => setShowPicker(p => !p)}
              title="Use Back Office labour rate"
              style={{ background: showPicker ? '#fef3c7' : 'transparent', border: `1px solid ${showPicker ? '#f59e0b' : '#e2e8f0'}`, borderRadius: 4, fontSize: 11, cursor: 'pointer', padding: '1px 3px', color: showPicker ? '#92400e' : '#94a3b8', flexShrink: 0, lineHeight: 1.4 }}>
              🔨
            </button>
          )}
        </div>
      </td>

      {/* Col 6: Total — 80px, right-aligned */}
      <td style={{ padding: '5px 6px', width: 80, textAlign: 'right', verticalAlign: 'top',
        fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>
        {!enabled && rawCost > 0 ? (
          <span style={{ textDecoration: 'line-through', color: '#cbd5e1' }}>£{fmt2(rawCost)}</span>
        ) : cost > 0 ? (
          <span style={{ fontWeight: 700, color: '#1e293b' }}>£{fmt2(cost)}</span>
        ) : '—'}
      </td>

      {/* Col 7: Actions — 36px */}
      {!isLocked ? (
        <td style={{ padding: '4px 2px', width: 36, textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
          <button onClick={onDuplicate} style={iconBtn()} title="Duplicate">⧉</button>
          <button onClick={onDelete} style={iconBtn('#e74c3c')} title="Delete">×</button>
        </td>
      ) : <td />}
    </tr>

    {/* Labour rate picker — expands below the row when 🔨 is clicked */}
    {isLabour && showPicker && (
      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
        <td colSpan={8} style={{ padding: '0 6px 10px 6px', background: '#fffbeb' }}>
          <div style={{ paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 64px 56px 80px 24px', gap: 6, paddingLeft: 2, paddingRight: 2 }}>
              {['Trade', 'Rate', 'Qty', 'Workers', 'Total', ''].map(h => (
                <div key={h} style={{ fontSize: 9, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
              ))}
            </div>

            {/* One row per trade line */}
            {tradeLines.map(tl => {
              const trade = localTrades.find(t => t.id === tl.tradeId)
              const lineTotal = tradeLineTotal(tl)
              return (
                <div key={tl.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 64px 56px 80px 24px', gap: 6, alignItems: 'center' }}>
                  <select value={tl.tradeId} onChange={e => updateTradeLine(tl.id, { tradeId: e.target.value })}
                    style={{ padding: '4px 6px', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 12, background: '#fff', width: '100%' }}>
                    {localTrades.map(t => <option key={t.id} value={t.id}>{t.name} — £{t.day_rate}/day</option>)}
                  </select>
                  <select value={tl.rateType} onChange={e => updateTradeLine(tl.id, { rateType: e.target.value as LabourRateType })}
                    style={{ padding: '4px 6px', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 12, background: '#fff', width: '100%' }}>
                    {(Object.keys(LABOUR_RATE_LABELS) as LabourRateType[]).map(rt => (
                      <option key={rt} value={rt}>{LABOUR_RATE_LABELS[rt]} £{trade ? boLabourRate(trade, rt).toFixed(0) : '—'}</option>
                    ))}
                  </select>
                  <input type="number" min={0} step={0.5} value={tl.qty}
                    onChange={e => updateTradeLine(tl.id, { qty: Math.max(0, +e.target.value) })}
                    style={{ padding: '4px 6px', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 12, width: '100%' }} />
                  <input type="number" min={1} step={1} value={tl.workers}
                    onChange={e => updateTradeLine(tl.id, { workers: Math.max(1, +e.target.value) })}
                    style={{ padding: '4px 6px', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 12, width: '100%' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#92400e' }}>£{lineTotal.toFixed(2)}</span>
                  <button onClick={() => removeTradeLine(tl.id)} disabled={tradeLines.length === 1}
                    style={{ background: 'none', border: 'none', cursor: tradeLines.length > 1 ? 'pointer' : 'default', color: tradeLines.length > 1 ? '#ef4444' : '#d1d5db', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                </div>
              )
            })}

            {/* Add trade line + new trade form */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <button onClick={addTradeLine}
                style={{ padding: '4px 10px', border: '1px dashed #f59e0b', borderRadius: 5, background: '#fff', fontSize: 11, cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>
                + Add Trade
              </button>
              <button onClick={() => setAddingTrade(a => !a)}
                style={{ padding: '4px 8px', border: '1px solid #f59e0b', borderRadius: 5, background: addingTrade ? '#fef3c7' : '#fff', fontSize: 11, cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>
                + New Trade
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: '#92400e' }}>Total £{pickedTotal.toFixed(2)}</span>
              <button onClick={applyPicker}
                style={{ padding: '5px 14px', background: '#f59e0b', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Apply
              </button>
              <button onClick={() => setShowPicker(false)}
                style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
                Cancel
              </button>
            </div>

            {/* Inline new-trade form */}
            {addingTrade && (
              <div style={{ padding: '8px 10px', background: '#fff', border: '1px solid #f59e0b', borderRadius: 6, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 9, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Trade Name</div>
                  <input autoFocus value={newTradeName} onChange={e => setNewTradeName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveNewTrade(); if (e.key === 'Escape') setAddingTrade(false) }}
                    placeholder="e.g. Bricklayer"
                    style={{ padding: '4px 7px', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 12, width: 140, outline: 'none' }} />
                </div>
                <div>
                  <div style={{ fontSize: 9, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Day Rate (£)</div>
                  <input type="number" min={0} step={10} value={newTradeRate} onChange={e => setNewTradeRate(+e.target.value)}
                    style={{ padding: '4px 7px', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 12, width: 80, outline: 'none' }} />
                </div>
                <button onClick={saveNewTrade} disabled={savingTrade || !newTradeName.trim()}
                  style={{ padding: '5px 12px', background: '#f59e0b', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: savingTrade ? 'wait' : 'pointer' }}>
                  {savingTrade ? 'Saving…' : 'Save Trade'}
                </button>
                <button onClick={() => setAddingTrade(false)}
                  style={{ padding: '5px 8px', background: 'transparent', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, cursor: 'pointer', color: '#6b7280' }}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </td>
      </tr>
    )}
    </>
  )
}

// ── Task group (Level 4) ───────────────────────────────────────────────────────

interface TaskGroupProps {
  tg: string
  items: QuoteItem[]
  markup: number
  isLocked: boolean
  collapsed: Set<string>
  colKey: string
  toggle: (k: string) => void
  onUpdateItem: (item: QuoteItem) => void
  onDeleteItem: (id: number) => void
  onDuplicateItem: (item: QuoteItem) => void
  onAddRow: (tg: string, type: ItemType) => void
  onRenameTask: (oldName: string, newName: string) => void
  onDeleteTask: (tg: string) => void
  labourTrades?: BOLabourTrade[]
  boProducts?: BOProduct[]
  boPlantItems?: BOPlantItem[]
  /** When set, all rows in this task are one fixed category (hides the per-row dropdown & limits add buttons). */
  lockCategory?: ItemType
}

function TaskGroup({ tg, items, markup, isLocked, collapsed, colKey, toggle, onUpdateItem, onDeleteItem, onDuplicateItem, onAddRow, onRenameTask, onDeleteTask, labourTrades, boProducts, boPlantItems, lockCategory }: TaskGroupProps) {
  const open  = !collapsed.has(colKey)
  const cost  = items.reduce((s, i) => s + itemCost(i), 0)
  const sell  = +(cost * (1 + markup / 100)).toFixed(2)
  const hasName = !!tg

  return (
    <div style={{ marginBottom: 4 }}>
      {hasName && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 8px 5px 16px',
            background: '#f0f4f0', borderRadius: 4,
            cursor: 'pointer', userSelect: 'none',
          }}
          onClick={() => toggle(colKey)}
        >
          <span style={{ fontSize: 11, color: '#94a3b8', width: 12 }}>{open ? '▾' : '▸'}</span>
          <input
            value={tg}
            readOnly={isLocked}
            onClick={e => e.stopPropagation()}
            onChange={e => onRenameTask(tg, e.target.value)}
            style={{ ...fldStyle, fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}
          />
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', flexShrink: 0 }}>
            {sell > 0 ? `£${fmt2(sell)}` : '—'}
          </span>
          {!isLocked && (
            <button onClick={e => { e.stopPropagation(); onDeleteTask(tg) }} style={iconBtn('#e74c3c')} title="Remove task">×</button>
          )}
        </div>
      )}

      {(!hasName || open) && (
        <div style={{ paddingLeft: hasName ? 12 : 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {items.map(item => (
                <CostRow
                  key={item.id}
                  item={item}
                  isLocked={isLocked}
                  isFirst={false}
                  onUpdate={onUpdateItem}
                  onDelete={() => onDeleteItem(item.id)}
                  onDuplicate={() => onDuplicateItem(item)}
                  labourTrades={labourTrades}
                  boProducts={boProducts}
                  boPlantItems={boPlantItems}
                  lockCategory={!!lockCategory}
                />
              ))}
            </tbody>
          </table>
          {/* Add buttons. When the parent card fixes the category, only show a single
              "+ line" — and only for NAMED tasks (the card itself owns the ungrouped add). */}
          {!isLocked && (lockCategory
            ? hasName && (
                <div style={{ padding: '4px 0 2px' }}>
                  <button style={{ ...addBtn, fontSize: 10 }} onClick={() => onAddRow(tg, lockCategory)}>
                    + Line
                  </button>
                </div>
              )
            : (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '4px 0 2px' }}>
                {ITEM_TYPES.map(t => (
                  <button key={t} style={{ ...addBtn, fontSize: 10 }}
                    onClick={() => onAddRow(tg, t)}>
                    + {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  )
}

// ── Item status badge ─────────────────────────────────────────────────────────

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'manual') return null
  const config = {
    takeoff: { label: '📐 Takeoff', bg: '#eff6ff', text: '#1d4ed8' },
    ai:      { label: '✦ AI',      bg: '#fdf4ff', text: '#7c3aed' },
  }[source as 'takeoff' | 'ai']
  if (!config) return null
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: config.bg, color: config.text, flexShrink: 0 }}>
      {config.label}
    </span>
  )
}

// ── Sub-phase block (Level 3) ──────────────────────────────────────────────────

interface SubPhaseBlockProps {
  p: QuotePhase
  markup: number
  jobType?: string
  isLocked: boolean
  collapsed: Set<string>
  toggle: (k: string) => void
  onUpdate: (p: QuotePhase) => void
  onDelete: () => void
  onDuplicate: () => void
  onAddTask: () => void
  onSaveToBO?: (p: QuotePhase) => void
  labourTrades?: BOLabourTrade[]
  boProducts?: BOProduct[]
  boPlantItems?: BOPlantItem[]
}

function SubPhaseBlock({ p, markup, jobType = '', isLocked, collapsed, toggle, onUpdate, onDelete, onDuplicate, onAddTask, onSaveToBO, labourTrades, boProducts = [], boPlantItems = [] }: SubPhaseBlockProps) {
  const colKey = `sp_${p.id}`
  const open   = !collapsed.has(colKey)
  const sell   = subPhaseTotalSell(p, markup)
  const m      = p.meta?.measurements
  const [nameFocused, setNameFocused] = React.useState(false)

  // Task name shown to the user — priority order:
  //   1. Explicit p.taskName (user-edited or BO description)
  //   2. taskGroup values from cost rows (e.g. "Blockwork, DPC")
  //   3. desc from the first labour row (the most descriptive line)
  //   4. desc from any non-empty row
  const derivedTaskName =
    p.taskName?.trim() ||
    getTaskGroups(p.items).filter(Boolean).join(', ') ||
    p.items.find(i => i.itemType === 'labour' && i.desc?.trim())?.desc?.trim() ||
    p.items.find(i => i.desc?.trim())?.desc?.trim() ||
    ''

  // Picker state
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [showPlantPicker,   setShowPlantPicker]   = useState(false)
  // AI Review modal
  const [showReview,        setShowReview]        = useState(false)
  // Cost card modal
  const [openCard, setOpenCard] = useState<ItemType | null>(null)
  // Inline BO pickers inside the modal
  const [boMatSearch,   setBoMatSearch]   = useState('')
  const [boPlantSearch, setBoPlantSearch] = useState('')
  const [boLabourTrade, setBoLabourTrade] = useState('')
  const [boLabourRate,  setBoLabourRate]  = useState<'day' | 'half_day' | 'hourly'>('day')
  const [boLabourQty,   setBoLabourQty]   = useState(1)

  // Product CRUD
  function addProduct(prod: QuoteProduct) {
    onUpdate({ ...p, products: [...(p.products ?? []), prod] })
  }
  function updateProduct(prod: QuoteProduct) {
    onUpdate({ ...p, products: (p.products ?? []).map(pr => pr.id === prod.id ? prod : pr) })
  }
  function removeProduct(id: string) {
    onUpdate({ ...p, products: (p.products ?? []).filter(pr => pr.id !== id) })
  }
  function toggleProduct(id: string) {
    onUpdate({ ...p, products: (p.products ?? []).map(pr => pr.id === id ? { ...pr, enabled: pr.enabled === false ? true : false } : pr) })
  }

  // Plant CRUD
  function addPlant(pl: QuotePlantItem) {
    onUpdate({ ...p, plantItems: [...(p.plantItems ?? []), pl] })
  }
  function updatePlant(pl: QuotePlantItem) {
    onUpdate({ ...p, plantItems: (p.plantItems ?? []).map(x => x.id === pl.id ? pl : x) })
  }
  function removePlant(id: string) {
    onUpdate({ ...p, plantItems: (p.plantItems ?? []).filter(x => x.id !== id) })
  }
  function togglePlant(id: string) {
    onUpdate({ ...p, plantItems: (p.plantItems ?? []).map(x => x.id === id ? { ...x, enabled: x.enabled === false ? true : false } : x) })
  }

  // Mark phase as 'edited' when any cost field changes from a bo-default baseline
  function markEdited(updated: QuotePhase) {
    if (updated.itemStatus === 'bo-default') {
      return { ...updated, itemStatus: 'edited' as const }
    }
    return updated
  }

  function updateItem(item: QuoteItem) {
    onUpdate(markEdited({ ...p, items: p.items.map(i => i.id === item.id ? item : i) }))
  }
  function deleteItem(id: number) {
    onUpdate({ ...p, items: p.items.filter(i => i.id !== id) })
  }
  function duplicateItem(item: QuoteItem) {
    const idx = p.items.findIndex(i => i.id === item.id)
    const copy = { ...item, id: uid() }
    const next = [...p.items]
    next.splice(idx + 1, 0, copy)
    onUpdate({ ...p, items: next })
  }
  function addRow(tg: string, type: ItemType) {
    const newItem: QuoteItem = {
      id: uid(), desc: '', qty: 1, unit: 'item',
      labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0,
      notes: '', itemType: type, taskGroup: tg || undefined,
    }
    onUpdate({ ...p, items: [...p.items, newItem] })
  }
  function renameTask(oldName: string, newName: string) {
    onUpdate({ ...p, items: p.items.map(i => (i.taskGroup || '') === oldName ? { ...i, taskGroup: newName || undefined } : i) })
  }
  function deleteTask(tg: string) {
    onUpdate({ ...p, items: p.items.filter(i => (i.taskGroup || '') !== tg) })
  }

  // Measurement badges
  const badges: string[] = []
  if (m?.length)  badges.push(`${m.length?.toFixed(2)} m`)
  if (m?.area)    badges.push(`${m.area?.toFixed(2)} m²`)
  if (m?.volume)  badges.push(`${m.volume?.toFixed(3)} m³`)

  // ── Per-category cost roll-up (company cost, before markup) ──────────────────
  const itemsOfType   = (t: ItemType) => p.items.filter(i => (i.itemType ?? 'other') === t)
  const typeItemsCost = (t: ItemType) => itemsOfType(t).reduce((s, i) => s + itemCost(i), 0)
  const productsCost  = (p.products   ?? []).reduce((s, pr) => s + (pr.enabled === false ? 0 : pr.costPrice * pr.qty), 0)
  const plantCost     = (p.plantItems ?? []).reduce((s, pl) => s + (pl.enabled === false ? 0 : pl.costPrice * pl.qty), 0)
  const cardCost: Record<ItemType, number> = {
    labour:         typeItemsCost('labour'),
    materials:      typeItemsCost('materials') + productsCost,
    plant:          typeItemsCost('plant') + plantCost,
    subcontractors: typeItemsCost('subcontractors'),
    other:          typeItemsCost('other'),
  }
  const cardCount: Record<ItemType, number> = {
    labour:         itemsOfType('labour').length,
    materials:      itemsOfType('materials').length + (p.products   ?? []).length,
    plant:          itemsOfType('plant').length      + (p.plantItems ?? []).length,
    subcontractors: itemsOfType('subcontractors').length,
    other:          itemsOfType('other').length,
  }
  const totalCost = ITEM_TYPES.reduce((s, t) => s + cardCost[t], 0)
  const totalSell = sell
  const margin    = +(totalSell - totalCost).toFixed(2)

  // Add a uniquely-named task seeded with one line of the given category
  function addCardTask(type: ItemType) {
    const existing = new Set(p.items.map(i => i.taskGroup || ''))
    let n = 1
    while (existing.has(`Task ${n}`)) n++
    addRow(`Task ${n}`, type)
  }

  // Catalogue button shared by the Materials / Plant cards
  function catalogueBtn(label: string, onClick: () => void, accent: string, bg: string, border: string) {
    return (
      <button onClick={onClick}
        style={{ fontSize: 11, padding: '4px 10px', background: bg, border: `1px solid ${border}`, borderRadius: 6, color: accent, fontWeight: 600, cursor: 'pointer' }}>
        {label}
      </button>
    )
  }

  // ── Editable body for an items-based card (Labour / Subcontractors / Other) ──
  function renderItemsCardBody(type: ItemType) {
    const typeItems = itemsOfType(type)
    const tgs = getTaskGroups(typeItems)
    return (
      <>
        {tgs.map(tg => (
          <TaskGroup
            key={tg || '__ungrouped'}
            tg={tg}
            items={getItemsInTask(typeItems, tg)}
            markup={markup}
            isLocked={isLocked}
            collapsed={collapsed}
            colKey={`tk_${p.id}_${type}_${tg}`}
            toggle={toggle}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onDuplicateItem={duplicateItem}
            onAddRow={addRow}
            onRenameTask={renameTask}
            onDeleteTask={deleteTask}
            labourTrades={labourTrades}
            boProducts={boProducts}
            boPlantItems={boPlantItems}
            lockCategory={type}
          />
        ))}
        {typeItems.length === 0 && (
          <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic', padding: '2px 0 6px' }}>
            No {CARD_META[type].label.toLowerCase()} lines yet.
          </div>
        )}
        {!isLocked && (
          <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={{ ...addBtn, fontSize: 10 }} onClick={() => addRow('', type)}>+ Add line</button>
            <button style={{ ...addBtn, fontSize: 10 }} onClick={() => addCardTask(type)}>+ Add task</button>
          </div>
        )}
      </>
    )
  }

  // ── Materials catalogue table (Back Office products) ──
  function renderProductsTable() {
    if ((p.products ?? []).length === 0) return null
    return (
      <>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #dbeafe' }}>
              <th style={{ width: 20 }} />
              <th style={{ padding: '3px 6px', textAlign: 'left', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Product</th>
              <th style={{ padding: '3px 4px', width: 50, textAlign: 'right', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Qty</th>
              <th style={{ padding: '3px 4px', width: 36, fontSize: 10, color: '#64748b', fontWeight: 600 }}>Unit</th>
              <th style={{ padding: '3px 6px', width: 68, textAlign: 'right', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Cost</th>
              <th style={{ padding: '3px 6px', width: 68, textAlign: 'right', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Sell</th>
              <th style={{ padding: '3px 4px', width: 70, fontSize: 10, color: '#64748b', fontWeight: 600 }}>Supplier</th>
              <th style={{ width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {(p.products ?? []).map(prod => {
              const en = prod.enabled !== false
              return (
                <tr key={prod.id} style={{ borderBottom: '1px solid #f0f9ff', opacity: en ? 1 : 0.45 }}>
                  <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                    <button onClick={() => toggleProduct(prod.id)} disabled={isLocked}
                      style={{ background: 'none', border: 'none', cursor: isLocked ? 'default' : 'pointer', fontSize: 12, color: en ? '#3b82f6' : '#cbd5e1', padding: 0, lineHeight: 1 }}>
                      {en ? '●' : '○'}
                    </button>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input value={prod.name} readOnly={isLocked}
                      onChange={e => updateProduct({ ...prod, name: e.target.value })}
                      style={{ ...fldStyle, fontSize: 12, fontWeight: 500 }} />
                    {prod.category && <div style={{ fontSize: 10, color: '#94a3b8' }}>{prod.category}</div>}
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    <input type="number" min={0} step={0.1} value={prod.qty} readOnly={isLocked}
                      onChange={e => updateProduct({ ...prod, qty: Math.max(0, +e.target.value) })}
                      style={{ ...cellInp, width: '100%' }} />
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    <input value={prod.unit} readOnly={isLocked}
                      onChange={e => updateProduct({ ...prod, unit: e.target.value })}
                      style={{ ...fldStyle, fontSize: 11, color: '#64748b', textAlign: 'center' }} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#cbd5e1' }}>£</span>
                      <input type="number" min={0} step={0.01} value={prod.costPrice} readOnly={isLocked}
                        onChange={e => updateProduct({ ...prod, costPrice: Math.max(0, +e.target.value) })}
                        style={{ ...cellInp, paddingLeft: 12, width: '100%' }} />
                    </div>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#cbd5e1' }}>£</span>
                      <input type="number" min={0} step={0.01} value={prod.sellPrice} readOnly={isLocked}
                        onChange={e => updateProduct({ ...prod, sellPrice: Math.max(0, +e.target.value) })}
                        style={{ ...cellInp, paddingLeft: 12, fontWeight: en ? 600 : 400, width: '100%', color: en ? '#16a34a' : '#94a3b8' }} />
                    </div>
                  </td>
                  <td style={{ padding: '4px 4px', fontSize: 10, color: '#94a3b8', overflow: 'hidden', maxWidth: 70, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }} title={prod.supplier}>
                    {prod.supplier || '—'}
                  </td>
                  <td style={{ padding: '4px 2px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!isLocked && (
                      <button onClick={() => removeProduct(prod.id)} style={iconBtn('#e74c3c')} title="Remove">×</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 6px', borderTop: '1px solid #dbeafe', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: '#64748b', marginRight: 8 }}>Catalogue sell total:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#16a34a' }}>
            £{(p.products ?? []).reduce((s, pr) => s + productLineSell(pr), 0).toFixed(2)}
          </span>
        </div>
      </>
    )
  }

  // ── Plant catalogue table (Back Office plant items) ──
  function renderPlantTable() {
    if ((p.plantItems ?? []).length === 0) return null
    return (
      <>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e9d5ff' }}>
              <th style={{ width: 20 }} />
              <th style={{ padding: '3px 6px', textAlign: 'left', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Item</th>
              <th style={{ padding: '3px 4px', width: 50, textAlign: 'right', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Qty</th>
              <th style={{ padding: '3px 4px', width: 36, fontSize: 10, color: '#64748b', fontWeight: 600 }}>Unit</th>
              <th style={{ padding: '3px 6px', width: 68, textAlign: 'right', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Cost</th>
              <th style={{ padding: '3px 6px', width: 68, textAlign: 'right', fontSize: 10, color: '#64748b', fontWeight: 600 }}>Sell</th>
              <th style={{ width: 24 }} />
            </tr>
          </thead>
          <tbody>
            {(p.plantItems ?? []).map(pl => {
              const en = pl.enabled !== false
              return (
                <tr key={pl.id} style={{ borderBottom: '1px solid #faf5ff', opacity: en ? 1 : 0.45 }}>
                  <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                    <button onClick={() => togglePlant(pl.id)} disabled={isLocked}
                      style={{ background: 'none', border: 'none', cursor: isLocked ? 'default' : 'pointer', fontSize: 12, color: en ? '#7c3aed' : '#cbd5e1', padding: 0, lineHeight: 1 }}>
                      {en ? '●' : '○'}
                    </button>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input value={pl.name} readOnly={isLocked}
                      onChange={e => updatePlant({ ...pl, name: e.target.value })}
                      style={{ ...fldStyle, fontSize: 12, fontWeight: 500 }} />
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    <input type="number" min={0} step={0.5} value={pl.qty} readOnly={isLocked}
                      onChange={e => updatePlant({ ...pl, qty: Math.max(0, +e.target.value) })}
                      style={{ ...cellInp, width: '100%' }} />
                  </td>
                  <td style={{ padding: '4px 4px' }}>
                    <input value={pl.unit} readOnly={isLocked}
                      onChange={e => updatePlant({ ...pl, unit: e.target.value })}
                      style={{ ...fldStyle, fontSize: 11, color: '#64748b', textAlign: 'center' }} />
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#cbd5e1' }}>£</span>
                      <input type="number" min={0} step={0.01} value={pl.costPrice} readOnly={isLocked}
                        onChange={e => updatePlant({ ...pl, costPrice: Math.max(0, +e.target.value) })}
                        style={{ ...cellInp, paddingLeft: 12, width: '100%' }} />
                    </div>
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 3, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#cbd5e1' }}>£</span>
                      <input type="number" min={0} step={0.01} value={pl.sellPrice} readOnly={isLocked}
                        onChange={e => updatePlant({ ...pl, sellPrice: Math.max(0, +e.target.value) })}
                        style={{ ...cellInp, paddingLeft: 12, fontWeight: en ? 600 : 400, width: '100%', color: en ? '#7c3aed' : '#94a3b8' }} />
                    </div>
                  </td>
                  <td style={{ padding: '4px 2px', textAlign: 'right' }}>
                    {!isLocked && <button onClick={() => removePlant(pl.id)} style={iconBtn('#e74c3c')} title="Remove">×</button>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 6px', borderTop: '1px solid #e9d5ff', marginTop: 2 }}>
          <span style={{ fontSize: 11, color: '#64748b', marginRight: 8 }}>Catalogue sell total:</span>
          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: '#7c3aed' }}>
            £{(p.plantItems ?? []).reduce((s, pl) => s + plantLineSell(pl), 0).toFixed(2)}
          </span>
        </div>
      </>
    )
  }

  // ── Dispatch: editable body for the open card ──
  function renderCardBody(type: ItemType) {

    // ── Labour: show BO trades at the top ─────────────────────────────────────
    if (type === 'labour') {
      const trades = labourTrades ?? []
      const selTrade = trades.find(t => t.id === (boLabourTrade || trades[0]?.id))
      const rate = selTrade
        ? boLabourRate === 'day'      ? selTrade.day_rate
          : boLabourRate === 'half_day' ? (selTrade.half_day_rate_override ?? +(selTrade.day_rate / 2).toFixed(2))
          : +(selTrade.day_rate / 8).toFixed(2)
        : 0
      const total = +(rate * boLabourQty).toFixed(2)

      return (
        <>
          {trades.length > 0 && !isLocked && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Labour Rates — Back Office</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 80px', gap: 8, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#92400e', marginBottom: 3 }}>Trade</div>
                  <select value={boLabourTrade || trades[0]?.id || ''} onChange={e => setBoLabourTrade(e.target.value)}
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid #fde68a', borderRadius: 5, fontSize: 12 }}>
                    {trades.map(t => <option key={t.id} value={t.id}>{t.name} — £{t.day_rate}/day</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#92400e', marginBottom: 3 }}>Rate</div>
                  <select value={boLabourRate} onChange={e => setBoLabourRate(e.target.value as typeof boLabourRate)}
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid #fde68a', borderRadius: 5, fontSize: 12 }}>
                    <option value="day">Day £{selTrade?.day_rate ?? 0}</option>
                    <option value="half_day">Half day £{selTrade ? (selTrade.half_day_rate_override ?? +(selTrade.day_rate / 2).toFixed(2)) : 0}</option>
                    <option value="hourly">Hourly £{selTrade ? +(selTrade.day_rate / 8).toFixed(2) : 0}</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#92400e', marginBottom: 3 }}>Qty</div>
                  <input type="number" min={0} step={0.5} value={boLabourQty} onChange={e => setBoLabourQty(Math.max(0, +e.target.value))}
                    style={{ width: '100%', padding: '5px 8px', border: '1px solid #fde68a', borderRadius: 5, fontSize: 12, textAlign: 'right' }} />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#92400e' }}>= £{total.toFixed(2)}</span>
                <button onClick={() => {
                  if (!selTrade || total <= 0) return
                  const desc = `${selTrade.name} × ${boLabourQty} ${boLabourRate === 'hourly' ? 'hr' : boLabourRate === 'half_day' ? 'half-day' : 'day'}`
                  // Create the fully-populated item in one onUpdate call
                  // (calling addRow then patching doesn't work — React state isn't updated yet)
                  const newItem = {
                    id: uid(),
                    desc,
                    qty: 1,
                    unit: boLabourRate === 'hourly' ? 'hr' : 'day',
                    labour: total,
                    materials: 0, plantHire: 0, subcontractors: 0, other: 0,
                    notes: `${selTrade.name} · £${rate.toFixed(2)}/${boLabourRate === 'hourly' ? 'hr' : boLabourRate === 'half_day' ? 'half-day' : 'day'}`,
                    itemType: 'labour' as const,
                  }
                  onUpdate(markEdited({ ...p, items: [...p.items, newItem] }))
                }}
                  style={{ padding: '5px 14px', background: '#f59e0b', border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  + Add Trade
                </button>
              </div>
            </div>
          )}
          {renderItemsCardBody('labour')}
        </>
      )
    }

    // ── Materials: BO products inline ─────────────────────────────────────────
    if (type === 'materials') {
      const filtered = boProducts.filter(pr => pr.active && (!boMatSearch || pr.name.toLowerCase().includes(boMatSearch.toLowerCase()) || (pr.category ?? '').toLowerCase().includes(boMatSearch.toLowerCase())))
      return (
        <>
          {boProducts.length > 0 && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Products — Back Office</div>
              <input value={boMatSearch} onChange={e => setBoMatSearch(e.target.value)} placeholder="Search products…"
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                {filtered.length === 0
                  ? <div style={{ padding: '10px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>No matches</div>
                  : filtered.map(pr => {
                    const sell = +(pr.default_cost * (1 + (pr.markup_pct ?? 0) / 100)).toFixed(2)
                    return (
                      <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #e0f2fe', fontSize: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pr.name}</div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>{pr.unit} · £{pr.default_cost}{pr.waste_pct > 0 ? ` · ${pr.waste_pct}% waste` : ''}</div>
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#16a34a', flexShrink: 0 }}>£{sell}</span>
                        {!isLocked && (
                          <button onClick={() => addProduct({ id: `${Date.now()}`, boProductId: pr.id, name: pr.name, unit: pr.unit, qty: 1, costPrice: pr.default_cost, sellPrice: sell, supplier: pr.supplier || undefined, category: pr.category || undefined, wastePercent: pr.waste_pct || undefined, enabled: true })}
                            style={{ padding: '3px 10px', background: '#1d4ed8', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                            + Add
                          </button>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </div>
          )}
          {renderProductsTable()}
          {renderItemsCardBody('materials')}
        </>
      )
    }

    // ── Plant: BO plant items inline ──────────────────────────────────────────
    if (type === 'plant') {
      const filtered = boPlantItems.filter(pl => pl.active && (!boPlantSearch || pl.name.toLowerCase().includes(boPlantSearch.toLowerCase())))
      return (
        <>
          {boPlantItems.length > 0 && (
            <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Plant & Equipment — Back Office</div>
              <input value={boPlantSearch} onChange={e => setBoPlantSearch(e.target.value)} placeholder="Search plant & equipment…"
                style={{ width: '100%', padding: '6px 10px', border: '1px solid #e9d5ff', borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }} />
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e9d5ff', borderRadius: 6 }}>
                {filtered.length === 0
                  ? <div style={{ padding: '10px', fontSize: 11, color: '#64748b', textAlign: 'center' }}>No matches</div>
                  : filtered.map(pl => {
                    const sell = +(pl.default_cost * (1 + (pl.markup_pct ?? 0) / 100)).toFixed(2)
                    return (
                      <div key={pl.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #f3e8ff', fontSize: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.name}</div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>{pl.unit} · £{pl.default_cost}/unit</div>
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#16a34a', flexShrink: 0 }}>£{sell}</span>
                        {!isLocked && (
                          <button onClick={() => addPlant({ id: `${Date.now()}`, boPlantId: pl.id, name: pl.name, unit: pl.unit, qty: 1, costPrice: pl.default_cost, sellPrice: sell, enabled: true })}
                            style={{ padding: '3px 10px', background: '#7c3aed', border: 'none', borderRadius: 5, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                            + Add
                          </button>
                        )}
                      </div>
                    )
                  })
                }
              </div>
            </div>
          )}
          {renderPlantTable()}
          {renderItemsCardBody('plant')}
        </>
      )
    }

    return renderItemsCardBody(type)
  }

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
      {/* Sub-phase header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
          background: p.needsReview ? '#fffbeb' : '#f8fafc',
          cursor: 'pointer', userSelect: 'none',
          borderLeft: p.needsReview ? '3px solid #f59e0b' : 'none',
        }}
        onClick={() => toggle(colKey)}
      >
        <span style={{ color: '#94a3b8', fontSize: 11, width: 12, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
        <input
          value={p.phase}
          readOnly={isLocked}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ ...p, phase: e.target.value })}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          style={{
            ...fldStyle, fontWeight: 700, fontSize: 13, color: '#1e293b', flex: 1,
            cursor: isLocked ? 'default' : 'text',
            borderBottom: !isLocked && nameFocused ? '2px solid #7ab533' : '2px solid transparent',
            paddingBottom: 1,
          }}
          placeholder="Sub-phase name"
          title={isLocked ? undefined : 'Click to rename'}
        />
        {!isLocked && !nameFocused && <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0, pointerEvents: 'none' }}>✎</span>}
        {!open && derivedTaskName && (
          <span title={derivedTaskName} style={{ fontSize: 11, color: '#94a3b8', minWidth: 0, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {derivedTaskName}</span>
        )}
        {badges.map((b, i) => (
          <span key={i} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#e0f2fe', color: '#0369a1', flexShrink: 0 }}>{b}</span>
        ))}
        {p.needsReview && (
          <span title={p.reviewNote ?? 'This item needs review'} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e', flexShrink: 0, cursor: 'help' }}>
            ⚠️ Needs Review
          </span>
        )}
        {p.phaseImage && (
          <span title="AI reviewed — visual assigned" style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{p.phaseImage.emoji}</span>
        )}
        {p.aiReviewed && !p.phaseImage && (
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#f0fdf4', color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>✓ Reviewed</span>
        )}
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#7ab533', flexShrink: 0 }}>
          {sell > 0 ? fmt(sell) : '—'}
        </span>
        {!isLocked && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button style={iconBtn()} title="Add task" onClick={onAddTask}>+ Task</button>
            <button style={iconBtn()} title="Duplicate" onClick={onDuplicate}>⧉</button>
            <button
              onClick={e => { e.stopPropagation(); setShowReview(true) }}
              title="AI Phase Review — check for missing items before completing"
              style={{ ...iconBtn('#7c3aed'), fontSize: 11, border: '1px solid #ddd6fe', borderRadius: 4, padding: '2px 6px', background: p.aiReviewed ? '#f0fdf4' : undefined }}>
              🤖
            </button>
            {onSaveToBO && (p.itemStatus === 'edited' || p.itemStatus === 'bo-default') && p.boSubPhaseId && (
              <button
                onClick={e => { e.stopPropagation(); onSaveToBO(p) }}
                title="Save current rates back to Back Office defaults"
                style={{ ...iconBtn('#16a34a'), fontSize: 10, border: '1px solid #86efac', borderRadius: 4, padding: '2px 6px' }}
              >
                ↑ BO
              </button>
            )}
            <button style={iconBtn('#e74c3c')} title="Delete" onClick={onDelete}>×</button>
          </div>
        )}
      </div>

      {/* Sub-phase body — card-style cost breakdown */}
      {open && (
        <div style={{ padding: '8px 10px 10px' }}>

          {/* Totals — shown at the top right, above the task name */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'monospace', fontSize: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 12px' }}>
              <span style={{ color: '#64748b' }}>Cost <strong style={{ color: '#1e293b' }}>£{totalCost.toFixed(2)}</strong></span>
              <span style={{ color: '#64748b' }}>Margin <strong style={{ color: margin >= 0 ? '#16a34a' : '#dc2626' }}>£{margin.toFixed(2)}</strong></span>
              <span style={{ color: '#64748b' }}>Sell <strong style={{ color: '#7ab533', fontSize: 14 }}>£{totalSell.toFixed(2)}</strong></span>
            </div>
          </div>

          {/* Task description — tells the estimator what work this sub-phase covers */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 3 }}>
              Task Name
            </label>
            <input
              value={derivedTaskName}
              readOnly={isLocked}
              onChange={e => onUpdate({ ...p, taskName: e.target.value || undefined })}
              placeholder="Describe the work covered by this sub-phase…"
              style={{
                width: '100%', fontSize: 13, fontWeight: derivedTaskName ? 500 : 400,
                color: derivedTaskName ? '#1e293b' : '#94a3b8',
                background: isLocked ? '#f8fafc' : '#fff',
                border: `1px solid ${derivedTaskName ? '#cbd5e1' : '#e2e8f0'}`,
                borderRadius: 5, padding: '7px 9px', boxSizing: 'border-box', outline: 'none',
              }}
            />
          </div>

          {/* Needs-review banner */}
          {p.needsReview && p.reviewNote && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 8, background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 11, color: '#92400e' }}>
              <span>⚠️</span>
              <span style={{ flex: 1 }}>{p.reviewNote}</span>
              {!isLocked && (
                <button
                  onClick={() => onUpdate({ ...p, needsReview: false, reviewNote: undefined })}
                  style={{ ...iconBtn('#92400e'), fontSize: 10, border: '1px solid #f59e0b', borderRadius: 3, padding: '1px 6px' }}>
                  Mark reviewed
                </button>
              )}
            </div>
          )}

          {/* Cost-category cards — accordion, one open at a time */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {ITEM_TYPES.map(t => {
              const meta   = CARD_META[t]
              const active = openCard === t
              return (
                <button key={t} type="button" onClick={() => setOpenCard(active ? null : t)}
                  style={{
                    flex: '1 1 130px', minWidth: 112, textAlign: 'left', cursor: 'pointer',
                    border: `1.5px solid ${active ? meta.accent : meta.border}`,
                    background: meta.bg, borderRadius: 12, padding: '10px 12px',
                    boxShadow: active ? `0 4px 14px ${meta.accent}33` : 'none',
                    transition: 'box-shadow 0.15s, border-color 0.15s', outline: 'none',
                  }}>
                  {/* Icon chip + expand caret */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: 9, background: '#fff',
                      border: `1px solid ${meta.border}`, display: 'inline-flex',
                      alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>
                      {meta.icon}
                    </span>
                    <span style={{ fontSize: 11, color: meta.accent, opacity: 0.6 }}>↗</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: meta.accent, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {meta.label}
                  </div>
                  <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 15, color: '#0f172a', marginTop: 2 }}>
                    {cardCost[t] > 0 ? `£${cardCost[t].toFixed(2)}` : '—'}
                  </div>
                  <div style={{ fontSize: 10, color: meta.accent, opacity: 0.7 }}>
                    {cardCount[t]} line{cardCount[t] === 1 ? '' : 's'}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Summary of what's been added across all cost categories */}
          {(() => {
            const lines: { icon: string; color: string; text: string }[] = []

            // Labour — from cost rows
            const labourDescs = p.items
              .filter(i => (i.itemType === 'labour' || !i.itemType) && i.enabled !== false && i.desc?.trim())
              .map(i => i.desc.trim())
            if (labourDescs.length) lines.push({ icon: CARD_META.labour.icon, color: CARD_META.labour.accent, text: labourDescs.join('  ·  ') })

            // Materials — BO catalogue products + cost rows
            const matDescs: string[] = [
              ...(p.products ?? []).filter(pr => pr.enabled !== false).map(pr => pr.name),
              ...p.items.filter(i => i.itemType === 'materials' && i.enabled !== false && i.desc?.trim()).map(i => i.desc.trim()),
            ]
            if (matDescs.length) lines.push({ icon: CARD_META.materials.icon, color: CARD_META.materials.accent, text: matDescs.join('  ·  ') })

            // Plant — BO catalogue + cost rows
            const plantDescs: string[] = [
              ...(p.plantItems ?? []).filter(pl => pl.enabled !== false).map(pl => pl.name),
              ...p.items.filter(i => i.itemType === 'plant' && i.enabled !== false && i.desc?.trim()).map(i => i.desc.trim()),
            ]
            if (plantDescs.length) lines.push({ icon: CARD_META.plant.icon, color: CARD_META.plant.accent, text: plantDescs.join('  ·  ') })

            // Subcontractors + Other
            const subDescs = p.items.filter(i => i.itemType === 'subcontractors' && i.enabled !== false && i.desc?.trim()).map(i => i.desc.trim())
            if (subDescs.length) lines.push({ icon: CARD_META.subcontractors.icon, color: CARD_META.subcontractors.accent, text: subDescs.join('  ·  ') })

            const otherDescs = p.items.filter(i => i.itemType === 'other' && i.enabled !== false && i.desc?.trim()).map(i => i.desc.trim())
            if (otherDescs.length) lines.push({ icon: CARD_META.other.icon, color: CARD_META.other.accent, text: otherDescs.join('  ·  ') })

            if (!lines.length) return null
            return (
              <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {lines.map((l, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11 }}>
                    <span style={{ fontSize: 12, flexShrink: 0 }}>{l.icon}</span>
                    <span style={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.text}</span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Cost-category popup modal */}
          {openCard && (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
              onClick={e => { if (e.target === e.currentTarget) setOpenCard(null) }}>
              <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
                {/* Modal header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', background: CARD_META[openCard].bg, borderBottom: `1px solid ${CARD_META[openCard].border}`, borderRadius: '12px 12px 0 0' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 10, background: '#fff', border: `1px solid ${CARD_META[openCard].border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                      {CARD_META[openCard].icon}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: CARD_META[openCard].accent, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {CARD_META[openCard].label}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, color: CARD_META[openCard].accent, opacity: 0.8 }}>
                      {cardCost[openCard] > 0 ? `£${cardCost[openCard].toFixed(2)}` : '—'}
                    </span>
                  </span>
                  <button type="button" onClick={() => setOpenCard(null)}
                    style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: CARD_META[openCard].accent, lineHeight: 1, padding: 0, opacity: 0.7 }}
                    title="Close">×</button>
                </div>
                {/* Modal body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px' }}>
                  {renderCardBody(openCard)}
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Product picker modal */}
      {showProductPicker && (
        <ProductPicker
          products={boProducts}
          onAdd={prod => { addProduct(prod) }}
          onClose={() => setShowProductPicker(false)}
        />
      )}

      {/* Plant picker modal */}
      {showPlantPicker && (
        <PlantPicker
          items={boPlantItems}
          onAdd={pl => { addPlant(pl) }}
          onClose={() => setShowPlantPicker(false)}
        />
      )}

      {/* AI Phase Review modal */}
      {showReview && (
        <PhaseReviewModal
          phase={p}
          jobType={jobType}
          markup={markup}
          onAddItem={item => {
            const newItem: QuoteItem = { ...item, id: uid() }
            onUpdate({ ...p, items: [...p.items, newItem] })
          }}
          onComplete={image => {
            onUpdate({ ...p, aiReviewed: true, phaseImage: image })
            setShowReview(false)
            toggle(colKey)  // collapse phase after completing
          }}
          onClose={() => setShowReview(false)}
        />
      )}
    </div>
  )
}

// ── Room block (Level 2) ───────────────────────────────────────────────────────

interface RoomBlockProps {
  mainPhase: string
  room: string
  phases: QuotePhase[]
  markup: number
  jobType?: string
  isLocked: boolean
  collapsed: Set<string>
  toggle: (k: string) => void
  onUpdatePhase: (p: QuotePhase) => void
  onDeletePhase: (id: number) => void
  onDuplicatePhase: (p: QuotePhase) => void
  onAddSubPhase: (mainPhase: string, room: string) => void
  onAddTask: (phaseId: number) => void
  onRenameRoom: (mainPhase: string, oldRoom: string, newRoom: string) => void
  onSaveToBO?: (p: QuotePhase) => void
  labourTrades?: BOLabourTrade[]
  boProducts?: BOProduct[]
  boPlantItems?: BOPlantItem[]
}

function RoomBlock({ mainPhase, room, phases, markup, jobType, isLocked, collapsed, toggle, onUpdatePhase, onDeletePhase, onDuplicatePhase, onAddSubPhase, onAddTask, onRenameRoom, onSaveToBO, labourTrades, boProducts, boPlantItems }: RoomBlockProps) {
  const hasRoom = !!room
  const total   = roomTotalSell(phases, mainPhase, room, markup)
  const subPhs  = getSubPhases(phases, mainPhase, room)

  return (
    <div style={{ marginBottom: hasRoom ? 10 : 0 }}>
      {/* Room header — only show if there IS a room label */}
      {hasRoom && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#f0f9f0', borderRadius: 5, marginBottom: 4 }}
        >
          <span style={{ fontSize: 11 }}>📍</span>
          <input
            value={room}
            readOnly={isLocked}
            onChange={e => onRenameRoom(mainPhase, room, e.target.value)}
            style={{ ...fldStyle, fontWeight: 600, fontSize: 13, color: '#166534', flex: 1 }}
            placeholder="Area / Room label"
          />
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>
            {total > 0 ? fmt(total) : '—'}
          </span>
          {!isLocked && (
            <button
              onClick={e => { e.stopPropagation(); onAddSubPhase(mainPhase, room) }}
              style={{ ...addBtn, fontSize: 10 }}>
              + Sub-phase
            </button>
          )}
        </div>
      )}

      {/* Sub-phases inside this room — always visible (room name is info only) */}
      <div style={{ paddingLeft: hasRoom ? 16 : 0 }}>
          {subPhs.map(p => (
            <SubPhaseBlock
              key={p.id}
              p={p}
              markup={markup}
              jobType={jobType}
              isLocked={isLocked}
              collapsed={collapsed}
              toggle={toggle}
              onUpdate={onUpdatePhase}
              onDelete={() => onDeletePhase(p.id)}
              onDuplicate={() => onDuplicatePhase(p)}
              onAddTask={() => onAddTask(p.id)}
              onSaveToBO={onSaveToBO}
              labourTrades={labourTrades}
              boProducts={boProducts}
              boPlantItems={boPlantItems}
            />
          ))}
          {!isLocked && !hasRoom && (
            <button style={{ ...addBtn, fontSize: 11, marginTop: 4 }}
              onClick={() => onAddSubPhase(mainPhase, room)}>
              + Sub-phase
            </button>
          )}
        </div>
    </div>
  )
}

// ── Phase block (Level 1) ──────────────────────────────────────────────────────

interface PhaseBlockProps {
  mainPhase: string
  phases: QuotePhase[]
  markup: number
  jobType?: string
  isLocked: boolean
  collapsed: Set<string>
  toggle: (k: string) => void
  onUpdatePhase: (p: QuotePhase) => void
  onDeletePhase: (id: number) => void
  onDuplicatePhase: (p: QuotePhase) => void
  onAddSubPhase: (mainPhase: string, room: string) => void
  onAddRoom: (mainPhase: string) => void
  onAddTask: (phaseId: number) => void
  onRenameMain: (oldName: string, newName: string) => void
  onDeleteMain: (name: string) => void
  onRenameRoom: (mainPhase: string, oldRoom: string, newRoom: string) => void
  onSaveToBO?: (p: QuotePhase) => void
  labourTrades?: BOLabourTrade[]
  boProducts?: BOProduct[]
  boPlantItems?: BOPlantItem[]
}

function PhaseBlock({ mainPhase, phases, markup, jobType, isLocked, collapsed, toggle, onUpdatePhase, onDeletePhase, onDuplicatePhase, onAddSubPhase, onAddRoom, onAddTask, onRenameMain, onDeleteMain, onRenameRoom, onSaveToBO, labourTrades, boProducts, boPlantItems }: PhaseBlockProps) {
  const colKey = `mp_${mainPhase}`
  const open   = !collapsed.has(colKey)
  const total  = mainPhaseTotalSell(phases, mainPhase, markup)
  const rooms  = getRoomLabels(phases, mainPhase)
  const [nameFocused, setNameFocused] = React.useState(false)

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Phase header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', color: '#fff', padding: '10px 16px', borderRadius: open ? '8px 8px 0 0' : 8, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => toggle(colKey)}
      >
        <span style={{ fontSize: 12, width: 14 }}>{open ? '▾' : '▸'}</span>
        <input
          value={mainPhase}
          readOnly={isLocked}
          onClick={e => e.stopPropagation()}
          onChange={e => onRenameMain(mainPhase, e.target.value)}
          onFocus={() => setNameFocused(true)}
          onBlur={() => setNameFocused(false)}
          style={{
            ...fldStyle, fontWeight: 700, fontSize: 14, color: '#fff', flex: 1,
            cursor: isLocked ? 'default' : 'text',
            borderBottom: !isLocked && nameFocused ? '2px solid #7ab533' : '2px solid transparent',
            paddingBottom: 1,
          }}
          placeholder="Phase name"
          title={isLocked ? undefined : 'Click to rename'}
        />
        {!isLocked && !nameFocused && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0, pointerEvents: 'none' }}>✎</span>}
        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533', flexShrink: 0 }}>
          {total > 0 ? fmt(total) : '—'}
        </span>
        {!isLocked && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button style={{ ...addBtn, border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: 11 }}
              onClick={() => onAddRoom(mainPhase)}>+ Room</button>
            <button style={{ ...addBtn, border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: 11 }}
              onClick={() => onAddSubPhase(mainPhase, '')}>+ Sub-phase</button>
            <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
              onClick={() => onDeleteMain(mainPhase)} title="Delete phase">×</button>
          </div>
        )}
      </div>

      {/* Phase body */}
      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 12, background: '#fafafa' }}>
          {rooms.map(room => (
            <RoomBlock
              key={room}
              mainPhase={mainPhase}
              room={room}
              phases={phases}
              markup={markup}
              jobType={jobType}
              isLocked={isLocked}
              collapsed={collapsed}
              toggle={toggle}
              onUpdatePhase={onUpdatePhase}
              onDeletePhase={onDeletePhase}
              onDuplicatePhase={onDuplicatePhase}
              onAddSubPhase={onAddSubPhase}
              onAddTask={onAddTask}
              onRenameRoom={onRenameRoom}
              onSaveToBO={onSaveToBO}
              labourTrades={labourTrades}
              boProducts={boProducts}
              boPlantItems={boPlantItems}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main QuoteWorkspace ────────────────────────────────────────────────────────

export interface QuoteWorkspaceProps {
  phases:            QuotePhase[]
  markup:            number
  vatOn?:            boolean
  isLocked?:         boolean
  onChange:          (phases: QuotePhase[]) => void
  onAIGenerate?:     () => void
  aiGenerating?:     boolean
  onLoadTemplate?:   (jobType: string) => void
  jobType?:          string
  /** Called when user clicks "Save to BO" on a sub-phase */
  onSaveToBO?:       (phase: QuotePhase) => void
  /** Back Office labour trades — shown as a rate picker on Labour cost rows */
  labourTrades?:     BOLabourTrade[]
  /** Back Office products — used in the product picker */
  boProducts?:       BOProduct[]
  /** Back Office plant items — used in the plant picker */
  boPlantItems?:     BOPlantItem[]
  /** Back Office phases — for sub-phase picker grouping */
  boPhases?:         BOPhase[]
  /** Back Office sub-phases — shown in the sub-phase picker when adding */
  boSubPhases?:      BOSubPhase[]
  /** How the quote was created — drives empty-state messaging */
  quoteSource?:      'takeoff' | 'ai' | 'manual' | 'quick'
  /** Opens the BO library picker modal */
  onOpenLibrary?:    () => void
}

export default function QuoteWorkspace({ phases, markup, vatOn = true, isLocked = false, onChange, onAIGenerate, aiGenerating, onLoadTemplate, jobType, onSaveToBO, labourTrades = [], boProducts = [], boPlantItems = [], boPhases = [], boSubPhases = [], quoteSource, onOpenLibrary }: QuoteWorkspaceProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search,    setSearch]    = useState('')
  const [subPhasePicker, setSubPhasePicker] = useState<{ mainPhase: string; room: string } | null>(null)
  const [pickerSearch, setPickerSearch]     = useState('')

  const toggle = useCallback((k: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }, [])

  // ── Filter ───────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim()
  const visiblePhases = q
    ? phases.filter(p =>
        (p.parentPhase ?? '').toLowerCase().includes(q) ||
        (p.roomLabel   ?? '').toLowerCase().includes(q) ||
        p.phase.toLowerCase().includes(q) ||
        p.items.some(i => i.desc.toLowerCase().includes(q) || (i.notes ?? '').toLowerCase().includes(q))
      )
    : phases

  // ── Helpers for updating phases array ────────────────────────────────────
  function updatePhase(updated: QuotePhase) {
    onChange(phases.map(p => p.id === updated.id ? updated : p))
  }
  function deletePhase(id: number) {
    onChange(phases.filter(p => p.id !== id))
  }
  function duplicatePhase(p: QuotePhase) {
    const idx = phases.findIndex(x => x.id === p.id)
    const copy: QuotePhase = {
      ...JSON.parse(JSON.stringify(p)),
      id: uid(),
      items: p.items.map(i => ({ ...i, id: uid() })),
    }
    const next = [...phases]
    next.splice(idx + 1, 0, copy)
    onChange(next)
  }
  function addSubPhase(mainPhase: string, room: string) {
    if (boSubPhases.length > 0) {
      setPickerSearch('')
      setSubPhasePicker({ mainPhase, room })
    } else {
      createSubPhase(mainPhase, room, 'New Sub-Phase', undefined)
    }
  }

  function createSubPhase(mainPhase: string, room: string, name: string, boSubPhaseId: string | undefined) {
    const newPhase: QuotePhase = {
      id: uid(), phase: name, parentPhase: mainPhase,
      roomLabel: room || undefined,
      source: 'manual', itemStatus: 'manual',
      boSubPhaseId,
      items: [
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' },
      ],
      estimatorItems: [], useEstimator: false,
    }
    onChange([...phases, newPhase])
    setSubPhasePicker(null)
  }
  function addRoom(mainPhase: string) {
    addSubPhase(mainPhase, 'New Room')
  }
  function addMainPhase() {
    const newPhase: QuotePhase = {
      id: uid(), phase: 'New Sub-Phase', parentPhase: 'New Phase',
      items: [
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' },
      ],
      estimatorItems: [], useEstimator: false,
    }
    onChange([...phases, newPhase])
  }
  function addTask(phaseId: number) {
    const p = phases.find(x => x.id === phaseId)
    if (!p) return
    const tgName = `Task ${getTaskGroups(p.items).length + 1}`
    const rows: QuoteItem[] = ITEM_TYPES.map(t => ({
      id: uid(), desc: '', qty: 1, unit: 'Item',
      labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0,
      notes: '', itemType: t, taskGroup: tgName,
    }))
    updatePhase({ ...p, items: [...p.items, ...rows] })
  }
  function renameMain(oldName: string, newName: string) {
    onChange(phases.map(p => (p.parentPhase || '(No Phase)') === oldName ? { ...p, parentPhase: newName } : p))
  }
  function deleteMain(name: string) {
    if (!confirm(`Delete phase "${name}" and all its contents?`)) return
    onChange(phases.filter(p => (p.parentPhase || '(No Phase)') !== name))
  }
  function renameRoom(mainPhase: string, oldRoom: string, newRoom: string) {
    onChange(phases.map(p =>
      (p.parentPhase || '(No Phase)') === mainPhase && (p.roomLabel || '') === oldRoom
        ? { ...p, roomLabel: newRoom || undefined }
        : p
    ))
  }

  // ── Collapse all / expand all ─────────────────────────────────────────────
  function expandAll() { setCollapsed(new Set()) }
  function collapseAll() {
    const keys = new Set<string>()
    for (const p of phases) {
      const mp = p.parentPhase || '(No Phase)'
      const rl = p.roomLabel  || ''
      keys.add(`mp_${mp}`)
      if (rl) keys.add(`rm_${mp}_${rl}`)
      keys.add(`sp_${p.id}`)
      getTaskGroups(p.items).filter(Boolean).forEach(tg => keys.add(`tk_${p.id}_${tg}`))
    }
    setCollapsed(keys)
  }

  // ── Grand totals ──────────────────────────────────────────────────────────
  const grandCost = phases.reduce((s, p) => s + calcPhase(p), 0)
  const grandSell = phases.reduce((s, p) => s + calcPhaseSell(p, markup), 0)
  const grandVat  = vatOn ? grandSell * 0.2 : 0
  const grandTotal = grandSell + grandVat

  const mainPhases = getMainPhases(visiblePhases)

  return (
    <div style={{ fontSize: 13 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter phases, rooms, tasks…"
            style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', outline: 'none' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14 }}>×</button>}
        </div>
        <button style={{ ...addBtn, fontSize: 11 }} onClick={expandAll}>▼▼ Expand All</button>
        <button style={{ ...addBtn, fontSize: 11 }} onClick={collapseAll}>▶▶ Collapse All</button>
        {!isLocked && <button style={{ ...addBtn, fontSize: 11, borderColor: '#7ab533', color: '#16a34a' }} onClick={addMainPhase}>+ Add Phase</button>}
        {!isLocked && onOpenLibrary && <button style={{ ...addBtn, fontSize: 11, borderColor: '#4a90a4', color: '#1d6a8a' }} onClick={onOpenLibrary}>📚 From Library</button>}
      </div>

      {/* Empty / landing state */}
      {mainPhases.length === 0 && !search && (
        <div style={{ padding: '40px 20px', border: '2px dashed #e2e8f0', borderRadius: 12, textAlign: 'center' }}>

          {/* Manual mode empty state */}
          {quoteSource === 'manual' ? (
            <>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: '#1e293b', marginBottom: 8 }}>
                Select your phases to start the quote
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24, maxWidth: 360, margin: '0 auto 24px', lineHeight: 1.6 }}>
                Click <strong>+ Add Phase</strong> in the search bar above to add your first phase, or use the search to filter once phases are added.
              </div>
              <button
                onClick={addMainPhase}
                style={{ padding: '10px 24px', background: '#1e293b', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                + Add Phase
              </button>
            </>
          ) : (
            <>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>
            Your quote workspace is empty
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28, maxWidth: 420, margin: '0 auto 28px' }}>
            Start by importing from the Takeoff tool, generating from a scope of works, or loading a job template.
          </div>

          {/* Primary CTAs */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <button
              onClick={onAIGenerate}
              disabled={aiGenerating || !onAIGenerate}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '18px 28px', background: '#fdf4ff',
                border: '2px solid #e9d5ff', borderRadius: 10,
                cursor: aiGenerating ? 'wait' : 'pointer', minWidth: 160,
              }}
            >
              <span style={{ fontSize: 28 }}>{aiGenerating ? '⏳' : '✦'}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#7c3aed' }}>
                {aiGenerating ? 'Generating…' : 'Generate from Scope'}
              </span>
              <span style={{ fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
                Type your scope of works on the left, then click here to build the quote with AI
              </span>
            </button>
          </div>

          {/* Secondary: load template */}
          {onLoadTemplate && (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Or{' '}
              <button
                onClick={() => onLoadTemplate(jobType ?? 'Rear Extension')}
                style={{ background: 'none', border: 'none', color: '#4a90a4', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
                load a {jobType ?? 'Rear Extension'} template
              </button>
              {' '}to start with standard phases and edit manually.
            </div>
          )}
            </> /* end non-manual empty state */
          )}
        </div>
      )}

      {/* Filtered empty state */}
      {mainPhases.length === 0 && !!search && (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #e2e8f0', borderRadius: 8, color: '#94a3b8' }}>
          No results for &ldquo;{search}&rdquo;
        </div>
      )}

      {/* Phase blocks */}
      {mainPhases.map(mp => (
        <PhaseBlock
          key={mp}
          mainPhase={mp}
          phases={visiblePhases}
          markup={markup}
          jobType={jobType}
          isLocked={isLocked}
          collapsed={collapsed}
          toggle={toggle}
          onUpdatePhase={updatePhase}
          onDeletePhase={deletePhase}
          onDuplicatePhase={duplicatePhase}
          onAddSubPhase={addSubPhase}
          onAddRoom={addRoom}
          onAddTask={addTask}
          onRenameMain={renameMain}
          onDeleteMain={deleteMain}
          onRenameRoom={renameRoom}
          onSaveToBO={onSaveToBO}
          labourTrades={labourTrades}
                  boProducts={boProducts}
                  boPlantItems={boPlantItems}
        />
      ))}

      {/* Grand total footer */}
      {phases.length > 0 && (
        <div style={{ borderTop: '2px solid #e2e8f0', marginTop: 8, paddingTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Cost: <span style={{ fontFamily: 'monospace', color: '#e67e22', fontWeight: 600 }}>{fmt(grandCost)}</span></div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Sell (ex-VAT): <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(grandSell)}</span></div>
          {vatOn && <div style={{ fontSize: 12, color: '#64748b' }}>VAT: <span style={{ fontFamily: 'monospace', color: '#4a90a4' }}>{fmt(grandVat)}</span></div>}
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#7ab533' }}>Total: {fmt(grandTotal)}</div>
        </div>
      )}

      {/* ── Sub-phase picker modal ──────────────────────────────────────────── */}
      {subPhasePicker && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setSubPhasePicker(null)}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Add Sub-Phase</div>
              <input
                autoFocus
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Search sub-phases…"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
              {(() => {
                const q = pickerSearch.toLowerCase()
                const filtered = boSubPhases.filter(sp => !q || sp.name.toLowerCase().includes(q))
                const grouped = boPhases
                  .map(bp => ({ phase: bp, subs: filtered.filter(sp => sp.phase_id === bp.id) }))
                  .filter(g => g.subs.length > 0)
                // Also show sub-phases not matched to any known phase
                const ungrouped = filtered.filter(sp => !boPhases.find(bp => bp.id === sp.phase_id))
                return (
                  <>
                    {grouped.map(g => (
                      <div key={g.phase.id}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', padding: '6px 16px 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{g.phase.name}</div>
                        {g.subs.map(sp => (
                          <button key={sp.id}
                            onClick={() => createSubPhase(subPhasePicker.mainPhase, subPhasePicker.room, sp.name, sp.id)}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#1e293b' }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            {sp.name}
                          </button>
                        ))}
                      </div>
                    ))}
                    {ungrouped.map(sp => (
                      <button key={sp.id}
                        onClick={() => createSubPhase(subPhasePicker.mainPhase, subPhasePicker.room, sp.name, sp.id)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 16px', fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', color: '#1e293b' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        {sp.name}
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>No matches — use Custom below.</div>
                    )}
                  </>
                )
              })()}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 16px' }}>
              <button
                onClick={() => createSubPhase(subPhasePicker.mainPhase, subPhasePicker.room, pickerSearch.trim() || 'New Sub-Phase', undefined)}
                style={{ width: '100%', padding: '9px', border: '1px dashed #d1d5db', borderRadius: 7, background: '#f8fafc', fontSize: 13, cursor: 'pointer', color: '#374151', textAlign: 'center' }}
              >
                + Custom{pickerSearch.trim() ? `: "${pickerSearch.trim()}"` : ' (blank)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
