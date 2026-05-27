'use client'
// EstimatorBreakdown — redesigned cost-breakdown panel
// Summary / Detail views, colour-coded categories, inline warnings, mobile-friendly

import { useState, useEffect } from 'react'
import type { QuotePhase, QuoteItem } from '@/lib/types'
import type { EstimatorItem, EstimatorItemTemplate } from '@/lib/estimator'
import {
  calcEstimatorItem, estimatorAggregates, itemFromTemplate,
  MEASUREMENT_LABELS, type MeasurementType,
} from '@/lib/estimator'
import { getPhaseEstimatorDefaults } from '@/lib/estimatorDefaults'
import { fmt } from '@/lib/utils'
import { COST_CATEGORIES } from '@/lib/costCategories'
import { HardHat } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import MeasureModal from './MeasureModal'
import LabourTradesPanel from './LabourTradesPanel'
import TaskLabourLinesEditor from './TaskLabourLinesEditor'
import { migrateLabourTrade } from '@/lib/tradeRates'
import type { LabourTrade, TaskLabourLine } from '@/lib/tradeRates'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  phase:          QuotePhase
  onUpdatePhase:  (updated: QuotePhase) => void
  /** Quote-level global markup %; used to pre-fill new labour trade rows. */
  markup?:        number
}

type AggResult = ReturnType<typeof estimatorAggregates>

// ── Cost category config ──────────────────────────────────────────────────────
// Spread from the shared COST_CATEGORIES (icons, colours, labels) and add
// estimator-specific accessor functions.
const [_lab, _mat, _pla, _sub, _oth] = COST_CATEGORIES
const CATS = [
  {
    ..._lab,
    getAgg:   (a: AggResult)     => a.labour,
    getTotal: (i: EstimatorItem) => i.labourTotal,
    getRate:  (i: EstimatorItem) => i.labourRate,
    setRate:  (i: EstimatorItem, v: number) => calcEstimatorItem({ ...i, labourRate: v }),
  },
  {
    ..._mat,
    getAgg:   (a: AggResult)     => a.materials,
    getTotal: (i: EstimatorItem) => i.materialsTotal,
    getRate:  (i: EstimatorItem) => i.materialsRate,
    setRate:  (i: EstimatorItem, v: number) => calcEstimatorItem({ ...i, materialsRate: v }),
  },
  {
    ..._pla,
    getAgg:   (a: AggResult)     => a.plant,
    getTotal: (i: EstimatorItem) => i.plantTotal,
    getRate:  (i: EstimatorItem) => i.plantRate,
    setRate:  (i: EstimatorItem, v: number) => calcEstimatorItem({ ...i, plantRate: v }),
  },
  {
    ..._sub,
    getAgg:   (a: AggResult)     => a.subcontractors,
    getTotal: (i: EstimatorItem) => i.subTotal,
    getRate:  (i: EstimatorItem) => i.subRate,
    setRate:  (i: EstimatorItem, v: number) => calcEstimatorItem({ ...i, subRate: v }),
  },
  {
    ..._oth,
    getAgg:   (a: AggResult)     => a.other,
    getTotal: (i: EstimatorItem) => i.otherTotal,
    getRate:  (i: EstimatorItem) => i.otherRate,
    setRate:  (i: EstimatorItem, v: number) => calcEstimatorItem({ ...i, otherRate: v }),
  },
]

const MEAS_TYPES: MeasurementType[] = ['area', 'volume', 'linear', 'quantity']
const NUM_UNITS = ['m²', 'm³', 'm', 'nr', 'item', 'hr', 'day', 'wk', 'tonne', 'bag', 'roll', 'pack']

// ── Sync estimator → typed QuoteItems ────────────────────────────────────────
function syncToItems(items: QuoteItem[], agg: AggResult): QuoteItem[] {
  return items.map(qi => {
    if (qi.itemType === 'labour')         return { ...qi, labour:         agg.labour }
    if (qi.itemType === 'materials')      return { ...qi, materials:      agg.materials }
    if (qi.itemType === 'plant')          return { ...qi, plantHire:      agg.plant }
    if (qi.itemType === 'subcontractors') return { ...qi, subcontractors: agg.subcontractors }
    if (qi.itemType === 'other')          return { ...qi, other:          agg.other }
    return qi
  })
}

// ── Cost chip ─────────────────────────────────────────────────────────────────
function CostChip({ cat, val, size = 'sm' }: {
  cat: typeof CATS[number]
  val: number
  size?: 'sm' | 'md' | 'lg'
}) {
  if (val <= 0) return null
  const iconSize = size === 'lg' ? 12 : 10
  const { Icon } = cat
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: size === 'lg' ? '5px 10px' : size === 'md' ? '4px 8px' : '2px 6px',
      borderRadius: 5,
      background: cat.bg,
      border: `1px solid ${cat.border}`,
      fontSize: size === 'lg' ? 13 : size === 'md' ? 12 : 11,
      color: cat.color,
      fontFamily: 'DM Mono, monospace',
      fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      <Icon size={iconSize} strokeWidth={2.2} style={{ flexShrink: 0 }} />
      {fmt(val)}
    </span>
  )
}

// ── Rate field ────────────────────────────────────────────────────────────────
function RateField({
  label, Icon, val, color, bg, border, onChange,
}: {
  label: string; Icon: LucideIcon; val: number
  color: string; bg: string; border: string
  onChange: (n: number) => void
}) {
  return (
    <div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 700, color,
        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4,
      }}>
        <Icon size={10} strokeWidth={2.2} style={{ flexShrink: 0 }} />
        {label}
      </div>
      <input
        type="number" value={val} min={0} step={0.5}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%', textAlign: 'right', fontSize: 12, padding: '5px 7px',
          border: `1.5px solid ${val > 0 ? border : 'var(--border)'}`,
          borderRadius: 4,
          background: val > 0 ? bg : 'white',
          fontFamily: 'DM Mono, monospace',
        }}
      />
    </div>
  )
}

// ── Item row ──────────────────────────────────────────────────────────────────
function ItemRow({
  item, onUpdate, onRemove, onMeasure,
}: {
  item: EstimatorItem
  onUpdate: (u: EstimatorItem) => void
  onRemove: () => void
  onMeasure: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const hasVal        = item.measurement > 0
  const mLabel        = MEASUREMENT_LABELS[item.measurementType]
  const hasTaskLabour = (item.taskLabourLines?.length ?? 0) > 0

  return (
    <div style={{
      borderBottom: '1px solid #f0ede8',
      background: item.aiSuggested ? 'rgba(74,144,164,0.025)' : 'white',
    }}>
      {/* ── Main row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '7px 10px', flexWrap: 'wrap',
      }}>

        {/* Expand chevron */}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 1px',
            color: expanded ? '#4a90a4' : '#bbb', fontSize: 9, flexShrink: 0, lineHeight: 1,
          }}
        >{expanded ? '▼' : '▶'}</button>

        {/* AI badge */}
        {item.aiSuggested && (
          <span title="AI-suggested item" style={{
            fontSize: 9, background: 'rgba(74,144,164,0.15)', color: '#2a7090',
            borderRadius: 3, padding: '1px 5px', flexShrink: 0, fontWeight: 700, letterSpacing: '0.5px',
          }}>AI</span>
        )}

        {/* Item name */}
        <input
          value={item.name}
          onChange={e => onUpdate(calcEstimatorItem({ ...item, name: e.target.value }))}
          style={{
            flex: '1 1 140px', fontSize: 13, fontWeight: 500, padding: '3px 7px',
            border: '1.5px solid transparent', borderRadius: 4,
            background: 'transparent', color: 'var(--slate)', minWidth: 0,
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'white' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
        />

        {/* Measurement button */}
        <button
          onClick={onMeasure}
          title="Click to enter dimensions"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '4px 9px', borderRadius: 5, cursor: 'pointer',
            flexShrink: 0,
            background:   hasVal ? 'rgba(74,144,164,0.09)' : '#f6f6f6',
            border:       hasVal ? '1.5px solid rgba(74,144,164,0.28)' : '1.5px dashed #d0d0d0',
            color:        hasVal ? '#2a7090' : 'var(--muted)',
            fontFamily:   hasVal ? 'DM Mono, monospace' : 'DM Sans, sans-serif',
            fontWeight:   hasVal ? 700 : 400,
            minWidth: 80, justifyContent: 'center',
          }}
        >
          📐&nbsp;{hasVal ? `${item.measurement.toFixed(2)} ${item.unit}` : mLabel.label}
        </button>

        {/* Labour lines button — always visible, expands row on click */}
        <button
          onClick={e => { e.stopPropagation(); setExpanded(true) }}
          title={hasTaskLabour ? 'View / edit task labour lines' : 'Add labour trades to this task'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, padding: '4px 9px', borderRadius: 5, cursor: 'pointer',
            flexShrink: 0,
            background:   hasTaskLabour ? 'rgba(59,130,246,0.09)'        : '#f6f6f6',
            border:       hasTaskLabour ? '1.5px solid rgba(59,130,246,0.28)' : '1.5px dashed #d0d0d0',
            color:        hasTaskLabour ? '#1e40af'                       : 'var(--muted)',
            fontFamily:   hasTaskLabour ? 'DM Mono, monospace'            : 'DM Sans, sans-serif',
            fontWeight:   hasTaskLabour ? 700                             : 400,
          }}
        >
          <HardHat size={11} strokeWidth={2.2} style={{ flexShrink: 0 }} />
          {hasTaskLabour
            ? `${item.taskLabourLines!.length} trade${item.taskLabourLines!.length !== 1 ? 's' : ''} · £${item.labourTotal.toFixed(2)}`
            : '+ Labour'
          }
        </button>

        {/* Cost chips (non-zero only) */}
        {CATS.filter(c => c.getTotal(item) > 0).length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {CATS.map(cat => {
              const v = cat.getTotal(item)
              return v > 0 ? <CostChip key={cat.id} cat={cat} val={v} /> : null
            })}
          </div>
        )}

        {/* Line total */}
        {item.lineTotal > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 13, fontFamily: 'DM Mono, monospace',
            fontWeight: 700, color: '#15803d', paddingLeft: 4, flexShrink: 0,
          }}>
            {fmt(item.lineTotal)}
          </span>
        )}

        {/* Remove */}
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 15, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget.style.color = '#c0392b')}
          onMouseLeave={e => (e.currentTarget.style.color = '#ccc')}
        >×</button>
      </div>

      {/* ── Expanded rate editor ── */}
      {expanded && (
        <div style={{
          background: '#fafaf9',
          borderTop: '1px solid #f0ede8',
          padding: '12px 14px 14px 30px',
        }}>

          {/* Description / Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px', marginBottom: 12 }}>
            {[
              { label: 'Description', key: 'description' as const, ph: 'Brief spec / scope note…' },
              { label: 'Notes',       key: 'notes'       as const, ph: 'Any notes…'              },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{f.label}</div>
                <input
                  value={item[f.key] as string}
                  onChange={e => onUpdate(calcEstimatorItem({ ...item, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ fontSize: 12 }}
                />
              </div>
            ))}
          </div>

          {/* Measurement type + unit */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 130 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Measure type</div>
              <select
                value={item.measurementType}
                onChange={e => {
                  const t = e.target.value as MeasurementType
                  onUpdate(calcEstimatorItem({ ...item, measurementType: t, unit: MEASUREMENT_LABELS[t].unit }))
                }}
                style={{ fontSize: 12, padding: '5px 8px', width: '100%' }}
              >
                {MEAS_TYPES.map(t => <option key={t} value={t}>{MEASUREMENT_LABELS[t].label}</option>)}
              </select>
            </div>
            <div style={{ minWidth: 80 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Unit</div>
              <select
                value={item.unit}
                onChange={e => onUpdate(calcEstimatorItem({ ...item, unit: e.target.value }))}
                style={{ fontSize: 12, padding: '5px 8px', width: '100%' }}
              >
                {NUM_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Task Labour Lines editor */}
          <TaskLabourLinesEditor
            lines={item.taskLabourLines || []}
            onChange={(lines: TaskLabourLine[]) =>
              onUpdate(calcEstimatorItem({ ...item, taskLabourLines: lines }))
            }
          />

          {/* Rate fields — colour coded (Labour removed — use Task Labour Lines above) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10, marginBottom: 10 }}>
            {CATS.map(cat => {
              if (cat.id === 'labour') return null
              return (
                <RateField
                  key={cat.id}
                  label={`${cat.label}/unit`}
                  Icon={cat.Icon}
                  val={cat.getRate(item)}
                  color={cat.color}
                  bg={cat.bg}
                  border={cat.border}
                  onChange={v => onUpdate(cat.setRate(item, v))}
                />
              )
            })}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Waste %</div>
              <input
                type="number" value={item.wastePercent} min={0} step={1}
                onChange={e => onUpdate(calcEstimatorItem({ ...item, wastePercent: Number(e.target.value) }))}
                style={{ width: '100%', textAlign: 'right', fontSize: 12, padding: '5px 7px', borderRadius: 4, fontFamily: 'DM Mono, monospace' }}
              />
            </div>
          </div>

          {/* Per-unit rate summary — labour excluded */}
          {CATS.some(c => c.id !== 'labour' && c.getRate(item) > 0) ? (
            <div style={{
              padding: '7px 10px', background: 'rgba(0,0,0,0.03)', borderRadius: 5,
              fontSize: 11, color: 'var(--muted)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
            }}>
              <span>Rate / {item.unit}:</span>
              {CATS.map(cat => {
                if (cat.id === 'labour') return null
                const r = cat.getRate(item)
                return r > 0 ? (
                  <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: cat.color, fontFamily: 'DM Mono, monospace', fontWeight: 700 }}>
                    <cat.Icon size={10} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                    £{r.toFixed(2)}
                  </span>
                ) : null
              })}
              {item.wastePercent > 0 && (
                <span style={{ color: 'var(--muted)' }}>+ {item.wastePercent}% waste</span>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

// ── Summary panel ─────────────────────────────────────────────────────────────
function SummaryPanel({ items, agg }: { items: EstimatorItem[]; agg: AggResult }) {
  const costedCount    = items.filter(i => i.isCosted).length
  // noMeasureCount: only warn about measurement if non-labour rates are set
  // (task labour lines don't require measurement)
  const noMeasureCount = items.filter(i =>
    CATS.filter(c => c.id !== 'labour').some(c => c.getRate(i) > 0) && i.measurement === 0
  ).length
  // noRatesCount: item has no task labour lines AND all non-labour rates are 0
  const noRatesCount   = items.filter(i =>
    !(i.taskLabourLines?.length) &&
    i.materialsRate === 0 && i.plantRate === 0 && i.subRate === 0 && i.otherRate === 0
  ).length

  // Always show all 5 categories when items exist — zero is a valid cost value.
  const activeCats = items.length > 0 ? CATS : []
  const total      = agg.total

  return (
    <div style={{ padding: '14px 16px' }}>

      {/* Category cards — all 5 always shown; zero-value ones are dimmed */}
      {activeCats.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {activeCats.map(cat => {
            const val = cat.getAgg(agg)
            return (
              <div key={cat.id} style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                padding: '8px 12px', borderRadius: 6,
                background: cat.bg, border: `1px solid ${cat.border}`,
                minWidth: 88,
                opacity: val === 0 ? 0.38 : 1,
                transition: 'opacity 0.2s',
              }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: cat.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <cat.Icon size={11} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                  {cat.label}
                </span>
                <span style={{ fontSize: 16, fontFamily: 'DM Mono, monospace', fontWeight: 700, color: cat.color }}>
                  {fmt(val)}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Proportional colour bar — only when total > 0 (proportions meaningless at zero) */}
      {total > 0 && (
        <div style={{
          height: 7, borderRadius: 4, background: '#ebe8e3',
          display: 'flex', overflow: 'hidden', marginBottom: 12, gap: 1,
        }}>
          {activeCats.filter(c => c.getAgg(agg) > 0).map(cat => (
            <div
              key={cat.id}
              title={`${cat.label}: ${fmt(cat.getAgg(agg))}`}
              style={{
                width: `${(cat.getAgg(agg) / total) * 100}%`,
                background: cat.bar,
                transition: 'width 0.3s',
              }}
            />
          ))}
        </div>
      )}

      {/* Item meta + warnings */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12 }}>
        <span style={{ color: 'var(--muted)' }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
        </span>
        {costedCount > 0 && (
          <span style={{ color: '#15803d', fontWeight: 600 }}>✓ {costedCount} costed</span>
        )}
        {noMeasureCount > 0 && (
          <span style={{
            color: '#92400e', background: 'rgba(245,158,11,0.10)',
            padding: '2px 8px', borderRadius: 4, fontWeight: 600,
          }}>⚠️ {noMeasureCount} need measurement</span>
        )}
        {noRatesCount > 0 && (
          <span style={{
            color: '#a93226', background: 'rgba(192,57,43,0.07)',
            padding: '2px 8px', borderRadius: 4, fontWeight: 600,
          }}>🔴 {noRatesCount} no rates set</span>
        )}
        {total > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 15, fontFamily: 'DM Mono, monospace',
            fontWeight: 700, color: '#15803d',
          }}>
            {fmt(total)}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EstimatorBreakdown({ phase, onUpdatePhase, markup = 0 }: Props) {
  const [open,        setOpen]        = useState(true)
  const [view,        setView]        = useState<'summary' | 'detail'>('detail')
  const [measureItem, setMeasureItem] = useState<EstimatorItem | null>(null)

  const items        = phase.estimatorItems || []
  // Migrate any trades saved with the old costRate shape → new dayRate shape
  const labourTrades = (phase.labourTrades || []).map(
    t => migrateLabourTrade(t as Parameters<typeof migrateLabourTrade>[0]),
  )
  const agg          = estimatorAggregates(items, labourTrades)

  // ── Mount sync ─────────────────────────────────────────────────────────────
  // On first render, sync typed QuoteItems from the current estimator aggregate.
  // This ensures that stale hardcoded template amounts in phase.items are
  // replaced by the estimator's actual values (which may be £0 when Back Office
  // defaults have been zeroed — zero is a valid cost value).
  useEffect(() => {
    if (!phase.useEstimator || items.length === 0) return
    const a    = estimatorAggregates(items, labourTrades)
    const synced = syncToItems(phase.items, a)
    const needsSync = phase.items.some(qi => {
      if (qi.itemType === 'labour')         return (qi.labour         ?? 0) !== a.labour
      if (qi.itemType === 'materials')      return (qi.materials      ?? 0) !== a.materials
      if (qi.itemType === 'plant')          return (qi.plantHire      ?? 0) !== a.plant
      if (qi.itemType === 'subcontractors') return (qi.subcontractors ?? 0) !== a.subcontractors
      if (qi.itemType === 'other')          return (qi.other          ?? 0) !== a.other
      return false
    })
    if (needsSync) onUpdatePhase({ ...phase, items: synced })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── mutations ──────────────────────────────────────────────────────────────
  function applyItems(newItems: EstimatorItem[]) {
    const a = estimatorAggregates(newItems, labourTrades)
    onUpdatePhase({
      ...phase,
      estimatorItems: newItems,
      useEstimator:   true,
      items:          syncToItems(phase.items, a),
    })
  }

  function handleLabourTradesChange(newTrades: LabourTrade[]) {
    const a = estimatorAggregates(items, newTrades)
    onUpdatePhase({
      ...phase,
      labourTrades: newTrades,
      useEstimator: true,
      items:        syncToItems(phase.items, a),
    })
  }

  function handleUpdate(item: EstimatorItem)  { applyItems(items.map(i => i.id === item.id ? item : i)) }
  function handleRemove(id: string)           { applyItems(items.filter(i => i.id !== id)) }

  function handleMeasureConfirm(updated: EstimatorItem) {
    handleUpdate(calcEstimatorItem(updated))
    setMeasureItem(null)
  }

  function handleAddItem() {
    const defaults     = getPhaseEstimatorDefaults(phase.phase)
    const existingNames = new Set(items.map(i => i.name.toLowerCase()))
    const tpl = defaults.find(d => !existingNames.has(d.name.toLowerCase()))
    const blank: EstimatorItemTemplate = tpl ?? {
      id: `custom-${Date.now()}`, name: 'New item', description: '',
      measurementType: 'quantity', unit: 'nr',
      labourRate: 0, materialsRate: 0, plantRate: 0, subRate: 0, otherRate: 0, wastePercent: 0,
    }
    applyItems([...items, itemFromTemplate(blank)])
    if (view === 'summary') setView('detail')
  }

  function handleLoadDefaults() {
    const defaults = getPhaseEstimatorDefaults(phase.phase)
    if (!defaults.length) { alert('No defaults available for this phase.'); return }
    const existingNames = new Set(items.map(i => i.name.toLowerCase()))
    const newItems = defaults
      .filter(d => !existingNames.has(d.name.toLowerCase()))
      .map(d => itemFromTemplate(d))
    if (!newItems.length) { alert('All defaults are already loaded.'); return }
    applyItems([...items, ...newItems])
  }

  const defaultsAvailable = getPhaseEstimatorDefaults(phase.phase).length > items.length

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ borderTop: '2px solid rgba(74,144,164,0.18)', background: 'rgba(74,144,164,0.02)' }}>

      {/* ── Collapsible header ── */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 9, color: '#4a90a4', flexShrink: 0 }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#4a90a4', flexShrink: 0 }}>📐 Cost Breakdown</span>

        {/* Mini cost chips in header */}
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {CATS.map(cat => <CostChip key={cat.id} cat={cat} val={cat.getAgg(agg)} />)}
          </div>
        )}

        {/* Grand total in header */}
        {agg.total > 0 && (
          <span style={{
            fontSize: 13, fontFamily: 'DM Mono, monospace', fontWeight: 700,
            color: '#15803d', flexShrink: 0,
          }}>
            {fmt(agg.total)}
          </span>
        )}
      </div>

      {/* ── Expanded panel ── */}
      {open && (
        <div onClick={e => e.stopPropagation()}>

          {/* View toggle + quick actions */}
          {items.length > 0 && (
            <div style={{
              display: 'flex', gap: 6, padding: '5px 12px 6px',
              alignItems: 'center', flexWrap: 'wrap',
              borderBottom: '1px solid rgba(74,144,164,0.10)',
              background: 'rgba(74,144,164,0.03)',
            }}>
              {/* Summary / Detail toggle */}
              <div style={{
                display: 'flex', background: 'rgba(0,0,0,0.05)',
                borderRadius: 6, padding: 2, gap: 2,
              }}>
                {(['summary', 'detail'] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    style={{
                      fontSize: 11, padding: '3px 10px', borderRadius: 4, border: 'none',
                      cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
                      background: view === v ? 'white' : 'transparent',
                      color:      view === v ? 'var(--slate)' : 'var(--muted)',
                      boxShadow:  view === v ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                    }}
                  >
                    {v === 'summary' ? '◼ Summary' : '≡ Detail'}
                  </button>
                ))}
              </div>

              <div style={{ flex: 1 }} />

              <button
                className="btn btn-sm btn-outline"
                style={{ fontSize: 11, padding: '4px 11px' }}
                onClick={handleAddItem}
              >+ Add item</button>

              {defaultsAvailable && (
                <button
                  className="btn btn-sm btn-outline"
                  style={{ fontSize: 11, padding: '4px 11px' }}
                  onClick={handleLoadDefaults}
                >↓ Load defaults</button>
              )}
            </div>
          )}

          {/* ── Empty state ── */}
          {items.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--muted)' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>No cost items for this phase yet.</div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-sm btn-primary" onClick={handleLoadDefaults}>
                  ↓ Load defaults
                </button>
                <button className="btn btn-sm btn-outline" onClick={handleAddItem}>
                  + Add item
                </button>
              </div>
            </div>
          )}

          {/* ── Summary view ── */}
          {items.length > 0 && view === 'summary' && (
            <SummaryPanel items={items} agg={agg} />
          )}

          {/* ── Detail view ── */}
          {items.length > 0 && view === 'detail' && (
            <>
              {/* Column hint bar */}
              <div style={{
                display: 'flex', padding: '3px 10px', gap: 6,
                background: 'rgba(0,0,0,0.025)', borderBottom: '1px solid #ede8e2',
                alignItems: 'center',
              }}>
                <span style={{ width: 20 }} />
                <span style={{ flex: 1, fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Item</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', minWidth: 90 }}>Measurement</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cost breakdown</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', minWidth: 60 }}>Total</span>
                <span style={{ width: 20 }} />
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

              {/* ── Phase totals footer ── */}
              <div style={{
                background: '#f5f4f1', borderTop: '2px solid #e0dbd4',
                padding: '10px 14px',
              }}>
                {/* Category totals */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>
                    Phase total
                  </span>
                  {CATS.map(cat => <CostChip key={cat.id} cat={cat} val={cat.getAgg(agg)} size="md" />)}
                </div>

                {/* Colour bar + grand total */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {agg.total > 0 && (
                    <div style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: '#ddd', display: 'flex', overflow: 'hidden', gap: 1,
                    }}>
                      {CATS.filter(c => c.getAgg(agg) > 0).map(cat => (
                        <div
                          key={cat.id}
                          title={`${cat.label}: ${fmt(cat.getAgg(agg))}`}
                          style={{
                            width: `${(cat.getAgg(agg) / agg.total) * 100}%`,
                            background: cat.bar, transition: 'width 0.3s',
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <span style={{
                    fontSize: 16, fontFamily: 'DM Mono, monospace', fontWeight: 700,
                    color: agg.total > 0 ? '#15803d' : '#ccc', flexShrink: 0,
                  }}>
                    {agg.total > 0 ? fmt(agg.total) : '—'}
                  </span>
                </div>

                {/* Warning row */}
                {(() => {
                  const nm = items.filter(i =>
                    CATS.filter(c => c.id !== 'labour').some(c => c.getRate(i) > 0) && i.measurement === 0
                  ).length
                  const nr = items.filter(i =>
                    !(i.taskLabourLines?.length) &&
                    i.materialsRate === 0 && i.plantRate === 0 && i.subRate === 0 && i.otherRate === 0
                  ).length
                  if (!nm && !nr) return null
                  return (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      {nm > 0 && (
                        <span style={{ fontSize: 11, color: '#92400e', background: 'rgba(245,158,11,0.10)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          ⚠️ {nm} item{nm !== 1 ? 's' : ''} need a measurement
                        </span>
                      )}
                      {nr > 0 && (
                        <span style={{ fontSize: 11, color: '#a93226', background: 'rgba(192,57,43,0.07)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                          🔴 {nr} item{nr !== 1 ? 's' : ''} have no rates set
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Add item toolbar */}
              <div style={{
                padding: '7px 12px', display: 'flex', gap: 7,
                background: 'white', borderTop: '1px solid #f0ede8', flexWrap: 'wrap',
              }}>
                <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={handleAddItem}>
                  + Add item
                </button>
                {defaultsAvailable && (
                  <button className="btn btn-sm btn-outline" style={{ fontSize: 11 }} onClick={handleLoadDefaults}>
                    ↓ Load more defaults
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Labour Trades panel ──────────────────────────────────────── */}
          <LabourTradesPanel
            trades={labourTrades}
            defaultMarkup={markup}
            onChange={handleLabourTradesChange}
          />
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
