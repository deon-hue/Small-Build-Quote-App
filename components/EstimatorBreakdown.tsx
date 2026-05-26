'use client'
// EstimatorBreakdown — expandable cost-breakdown panel embedded inside a quote phase card.
// When useEstimator=true the five typed QuoteItem rows are auto-synced from the estimator totals.

import { useState } from 'react'
import type { QuotePhase, QuoteItem } from '@/lib/types'
import type { EstimatorItem, EstimatorItemTemplate } from '@/lib/estimator'
import {
  calcEstimatorItem, estimatorAggregates, itemFromTemplate,
  MEASUREMENT_LABELS, type MeasurementType,
} from '@/lib/estimator'
import { getPhaseEstimatorDefaults } from '@/lib/estimatorDefaults'
import { fmt } from '@/lib/utils'
import MeasureModal from './MeasureModal'

interface Props {
  phase: QuotePhase
  onUpdatePhase: (updated: QuotePhase) => void
}

const MEAS_TYPES: MeasurementType[] = ['area', 'volume', 'linear', 'quantity']
const NUM_UNITS = ['m²', 'm³', 'm', 'nr', 'item', 'hr', 'day', 'wk', 'tonne', 'bag', 'roll', 'pack']

// ── helper to sync estimator aggregates → phase QuoteItems ────────────────────
function syncToItems(items: QuoteItem[], agg: ReturnType<typeof estimatorAggregates>): QuoteItem[] {
  return items.map(qi => {
    if (qi.itemType === 'labour')        return { ...qi, labour:         agg.labour }
    if (qi.itemType === 'materials')     return { ...qi, materials:      agg.materials }
    if (qi.itemType === 'plant')         return { ...qi, plantHire:      agg.plant }
    if (qi.itemType === 'subcontractors')return { ...qi, subcontractors: agg.subcontractors }
    if (qi.itemType === 'other')         return { ...qi, other:          agg.other }
    return qi
  })
}

// ── small editable number cell ────────────────────────────────────────────────
function RateInput({ val, onChange }: { val: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number" value={val} min={0} step={0.5}
      onChange={e => onChange(Number(e.target.value))}
      style={{ width: 70, textAlign: 'right', fontSize: 12, padding: '3px 5px' }}
    />
  )
}

// ── a single estimator item row ───────────────────────────────────────────────
interface RowProps {
  item: EstimatorItem
  onUpdate: (updated: EstimatorItem) => void
  onRemove: () => void
  onMeasure: () => void
}

function ItemRow({ item, onUpdate, onRemove, onMeasure }: RowProps) {
  const [expanded, setExpanded] = useState(false)

  function set<K extends keyof EstimatorItem>(key: K, val: EstimatorItem[K]) {
    onUpdate(calcEstimatorItem({ ...item, [key]: val }))
  }

  const mLabel = MEASUREMENT_LABELS[item.measurementType]
  const hasVal  = item.measurement > 0

  return (
    <div style={{ borderBottom: '1px solid #f0f0f0' }}>
      {/* Collapsed row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr 96px 70px 70px 60px 60px 60px 76px 24px',
        alignItems: 'center', gap: 0, minHeight: 34, padding: '0 4px',
      }}>
        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 10, padding: 0, lineHeight: 1 }}
        >{expanded ? '▼' : '▶'}</button>

        {/* Name + AI badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingRight: 6, overflow: 'hidden' }}>
          {item.aiSuggested && (
            <span style={{ fontSize: 9, background: 'rgba(74,144,164,0.15)', color: '#2a7090', borderRadius: 3, padding: '1px 4px', flexShrink: 0, fontWeight: 700 }}>✦</span>
          )}
          <input
            value={item.name}
            onChange={e => onUpdate(calcEstimatorItem({ ...item, name: e.target.value }))}
            style={{ fontSize: 12, padding: '3px 6px', border: '1px solid transparent', borderRadius: 3, width: '100%', minWidth: 0 }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'transparent')}
          />
        </div>

        {/* Measurement badge — click to open modal */}
        <button
          onClick={onMeasure}
          style={{
            fontSize: 11, padding: '3px 6px', borderRadius: 4, cursor: 'pointer',
            background: hasVal ? 'rgba(74,144,164,0.12)' : 'rgba(0,0,0,0.04)',
            border: hasVal ? '1px solid rgba(74,144,164,0.3)' : '1px dashed #ccc',
            color: hasVal ? '#2a7090' : 'var(--muted)', fontFamily: 'DM Mono, monospace',
            whiteSpace: 'nowrap', textAlign: 'center',
          }}
          title="Click to enter dimensions"
        >
          {hasVal ? `${item.measurement.toFixed(2)} ${item.unit}` : `📐 ${mLabel.label}`}
        </button>

        {/* Category totals */}
        {([
          ['labour',    item.labourTotal],
          ['materials', item.materialsTotal],
          ['plant',     item.plantTotal],
          ['sub',       item.subTotal],
          ['other',     item.otherTotal],
        ] as const).map(([cat, tot]) => (
          <span key={cat} style={{
            textAlign: 'right', fontSize: 11, fontFamily: 'DM Mono, monospace',
            color: Number(tot) > 0 ? 'var(--slate)' : '#ccc', padding: '0 4px',
          }}>
            {Number(tot) > 0 ? fmt(Number(tot)) : '—'}
          </span>
        ))}

        {/* Line total */}
        <span style={{
          textAlign: 'right', fontSize: 12, fontFamily: 'DM Mono, monospace',
          fontWeight: 700, color: item.lineTotal > 0 ? '#2b8a3e' : '#ccc', padding: '0 4px',
        }}>
          {item.lineTotal > 0 ? fmt(item.lineTotal) : '—'}
        </span>

        {/* Remove */}
        <button onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
      </div>

      {/* Expanded rate editor */}
      {expanded && (
        <div style={{ background: '#fafafa', padding: '10px 14px 12px', borderTop: '1px solid #f0f0f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 8 }}>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Description</label>
              <input value={item.description}
                onChange={e => onUpdate(calcEstimatorItem({ ...item, description: e.target.value }))}
                placeholder="Brief spec…" style={{ fontSize: 12 }} />
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Notes</label>
              <input value={item.notes}
                onChange={e => onUpdate(calcEstimatorItem({ ...item, notes: e.target.value }))}
                placeholder="Any notes…" style={{ fontSize: 12 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8 }}>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Meas type</label>
              <select value={item.measurementType}
                onChange={e => {
                  const t = e.target.value as MeasurementType
                  onUpdate(calcEstimatorItem({ ...item, measurementType: t, unit: MEASUREMENT_LABELS[t].unit }))
                }}
                style={{ fontSize: 12, padding: '4px 6px' }}>
                {MEAS_TYPES.map(t => <option key={t} value={t}>{MEASUREMENT_LABELS[t].label}</option>)}
              </select>
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Unit</label>
              <select value={item.unit}
                onChange={e => onUpdate(calcEstimatorItem({ ...item, unit: e.target.value }))}
                style={{ fontSize: 12, padding: '4px 6px' }}>
                {NUM_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>🔨 Labour/unit</label>
              <RateInput val={item.labourRate} onChange={v => set('labourRate', v)} />
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>📦 Mat/unit</label>
              <RateInput val={item.materialsRate} onChange={v => set('materialsRate', v)} />
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>🚜 Plant/unit</label>
              <RateInput val={item.plantRate} onChange={v => set('plantRate', v)} />
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Waste %</label>
              <RateInput val={item.wastePercent} onChange={v => set('wastePercent', v)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 8 }}>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>👷 Sub/unit</label>
              <RateInput val={item.subRate} onChange={v => set('subRate', v)} />
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>📋 Other/unit</label>
              <RateInput val={item.otherRate} onChange={v => set('otherRate', v)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main EstimatorBreakdown ───────────────────────────────────────────────────
export default function EstimatorBreakdown({ phase, onUpdatePhase }: Props) {
  const [open, setOpen]             = useState(true)
  const [measureItem, setMeasureItem] = useState<EstimatorItem | null>(null)

  const items: EstimatorItem[] = phase.estimatorItems || []
  const agg  = estimatorAggregates(items)
  const costedCount = items.filter(i => i.isCosted).length

  // ── item mutation helpers ──────────────────────────────────────────────────
  // Estimator is always the single source of truth — sync to items on every change
  function applyItems(newItems: EstimatorItem[]) {
    const a = estimatorAggregates(newItems)
    onUpdatePhase({
      ...phase,
      estimatorItems: newItems,
      useEstimator: true,
      items: syncToItems(phase.items, a),
    })
  }

  function handleUpdate(item: EstimatorItem) {
    applyItems(items.map(i => i.id === item.id ? item : i))
  }

  function handleRemove(id: string) {
    applyItems(items.filter(i => i.id !== id))
  }

  function handleMeasureConfirm(updated: EstimatorItem) {
    handleUpdate(calcEstimatorItem(updated))
    setMeasureItem(null)
  }

  function handleAddFromDefault() {
    const defaults = getPhaseEstimatorDefaults(phase.phase)
    if (!defaults.length) {
      // blank item
      const blank: EstimatorItemTemplate = {
        id: `custom-${Date.now()}`,
        name: 'New item', description: '', measurementType: 'quantity', unit: 'nr',
        labourRate: 0, materialsRate: 0, plantRate: 0, subRate: 0, otherRate: 0, wastePercent: 0,
      }
      applyItems([...items, itemFromTemplate(blank)])
    } else {
      // add first unloaded default or blank if all loaded
      const existingNames = new Set(items.map(i => i.name.toLowerCase()))
      const tpl = defaults.find(d => !existingNames.has(d.name.toLowerCase()))
      if (tpl) {
        applyItems([...items, itemFromTemplate(tpl)])
      } else {
        const blank: EstimatorItemTemplate = {
          id: `custom-${Date.now()}`,
          name: 'New item', description: '', measurementType: 'quantity', unit: 'nr',
          labourRate: 0, materialsRate: 0, plantRate: 0, subRate: 0, otherRate: 0, wastePercent: 0,
        }
        applyItems([...items, itemFromTemplate(blank)])
      }
    }
  }

  function handleLoadDefaults() {
    const defaults = getPhaseEstimatorDefaults(phase.phase)
    if (!defaults.length) { alert('No defaults available for this phase.'); return }
    const existingNames = new Set(items.map(i => i.name.toLowerCase()))
    const newItems = defaults
      .filter(d => !existingNames.has(d.name.toLowerCase()))
      .map(d => itemFromTemplate(d))
    applyItems([...items, ...newItems])
  }

  // ── header strip ──────────────────────────────────────────────────────────
  return (
    <div style={{ borderTop: '2px solid rgba(74,144,164,0.2)', background: 'rgba(74,144,164,0.04)' }}>
      {/* Collapsible header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{ fontSize: 10, color: '#4a90a4' }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#4a90a4', flex: 1 }}>
          📐 Cost Breakdown
          {items.length > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 6 }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
              {costedCount > 0 && <> &mdash; <span style={{ fontFamily: 'DM Mono, monospace', color: '#e07b22' }}>{fmt(agg.total)}</span></>}
            </span>
          )}
        </span>
      </div>

      {/* Expanded panel */}
      {open && (
        <div>
          {/* ── empty state ── */}
          {items.length === 0 && (
            <div style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No estimator items yet.
              <button
                onClick={handleLoadDefaults}
                className="btn btn-sm btn-outline"
                style={{ marginLeft: 10, fontSize: 11 }}
              >
                Load defaults for this phase
              </button>
            </div>
          )}

          {/* ── items table ── */}
          {items.length > 0 && (
            <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
              {/* Column headers */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr 96px 70px 70px 60px 60px 60px 76px 24px',
                gap: 0, padding: '2px 4px',
                background: 'rgba(0,0,0,0.03)', borderBottom: '1px solid #e8e8e8',
              }}>
                <span />
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Measurement</span>
                {['🔨', '📦', '🚜', '👷', '📋'].map((e, i) => (
                  <span key={i} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'right', padding: '2px 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{e}</span>
                ))}
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'right', padding: '2px 4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total</span>
                <span />
              </div>

              {/* Item rows */}
              {items.map(item => (
                <ItemRow
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdate}
                  onRemove={() => handleRemove(item.id)}
                  onMeasure={() => setMeasureItem(item)}
                />
              ))}

              {/* Aggregate footer */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '18px 1fr 96px 70px 70px 60px 60px 60px 76px 24px',
                gap: 0, padding: '5px 4px',
                background: 'rgba(0,0,0,0.03)', borderTop: '2px solid #e0e0e0',
              }}>
                <span /><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', padding: '0 6px' }}>Totals ({costedCount} costed)</span><span />
                {[agg.labour, agg.materials, agg.plant, agg.subcontractors, agg.other].map((v, i) => (
                  <span key={i} style={{ textAlign: 'right', fontSize: 11, fontFamily: 'DM Mono, monospace', fontWeight: 600, color: v > 0 ? '#2b8a3e' : '#ccc', padding: '0 4px' }}>
                    {v > 0 ? fmt(v) : '—'}
                  </span>
                ))}
                <span style={{ textAlign: 'right', fontSize: 12, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: agg.total > 0 ? '#2b8a3e' : '#ccc', padding: '0 4px' }}>
                  {agg.total > 0 ? fmt(agg.total) : '—'}
                </span>
                <span />
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div style={{ padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={handleAddFromDefault}>
              + Add item
            </button>
            {items.length < getPhaseEstimatorDefaults(phase.phase).length && (
              <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={handleLoadDefaults}>
                ↓ Load defaults
              </button>
            )}
          </div>
        </div>
      )}

      {/* Measure modal */}
      {measureItem && (
        <MeasureModal
          item={measureItem}
          onConfirm={handleMeasureConfirm}
          onClose={() => setMeasureItem(null)}
        />
      )}
    </div>
  )
}
