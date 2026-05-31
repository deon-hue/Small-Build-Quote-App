'use client'

/**
 * TakeoffBreakdownView
 * Renders imported takeoff phases as a structured builder's breakdown —
 * phase header → sub-phase cards → layer/task rows → cost totals.
 * Used instead of the flat editable table when phases carry `meta.importedFrom === 'takeoff'`.
 */

import { useState } from 'react'
import type { QuotePhase, QuoteItem } from '@/lib/types'
import { calcPhase, calcPhaseSell, fmt } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt2(n: number | undefined) {
  return n != null ? n.toFixed(2) : '—'
}

function fmtM(n: number | undefined) {
  if (n == null) return '—'
  return `${n.toFixed(2)} m`
}

const CAT_COLORS: Record<string, { bg: string; text: string }> = {
  labour:        { bg: '#fef3c7', text: '#92400e' },
  materials:     { bg: '#dbeafe', text: '#1d4ed8' },
  plant:         { bg: '#f3e8ff', text: '#7c3aed' },
  subcontractors:{ bg: '#fee2e2', text: '#991b1b' },
  other:         { bg: '#f1f5f9', text: '#475569' },
}

const CAT_LABEL: Record<string, string> = {
  labour: 'Labour', materials: 'Materials', plant: 'Plant',
  subcontractors: 'Sub', other: 'Other',
}

function categoryTotal(items: QuoteItem[], cat: string): number {
  return items.reduce((s, i) => {
    if (i.itemType === 'labour'         && cat === 'labour')         return s + (i.labour ?? 0)
    if (i.itemType === 'materials'      && cat === 'materials')      return s + (i.materials ?? 0)
    if (i.itemType === 'plant'          && cat === 'plant')          return s + (i.plantHire ?? 0)
    if (i.itemType === 'subcontractors' && cat === 'subcontractors') return s + (i.subcontractors ?? 0)
    if (i.itemType === 'other'          && cat === 'other')          return s + (i.other ?? 0)
    return s
  }, 0)
}

// ── Sub-phase card ─────────────────────────────────────────────────────────────

function SubPhaseCard({ phase, markup }: { phase: QuotePhase; markup: number }) {
  const [open, setOpen] = useState(true)
  const meta  = phase.meta
  const cost  = calcPhase(phase)
  const sell  = calcPhaseSell(phase, markup)
  const cats  = ['labour', 'materials', 'plant', 'subcontractors', 'other'] as const
  const m     = meta?.measurements

  // Measurement badges
  const measureBadges: { label: string; value: string }[] = []
  if (m?.length)  measureBadges.push({ label: 'Length',  value: fmtM(m.length) })
  if (m?.height)  measureBadges.push({ label: 'Height',  value: `${m.height.toFixed(2)} m` })
  if (m?.width)   measureBadges.push({ label: 'Width',   value: `${(m.width * 1000).toFixed(0)} mm` })
  if (m?.depth)   measureBadges.push({ label: 'Depth',   value: `${(m.depth * 1000).toFixed(0)} mm` })
  if (m?.area)    measureBadges.push({ label: 'Area',    value: `${m.area.toFixed(2)} m²` })
  if (m?.volume)  measureBadges.push({ label: 'Volume',  value: `${m.volume.toFixed(3)} m³` })
  if (!measureBadges.length && m?.qty != null)
    measureBadges.push({ label: m.unit ?? 'Qty', value: `${m.qty} ${m.unit ?? ''}` })

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8,
      overflow: 'hidden', background: '#fff',
    }}>
      {/* Card header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          background: '#f8fafc', cursor: 'pointer', userSelect: 'none',
          borderBottom: open ? '1px solid #e2e8f0' : 'none',
        }}
      >
        <span style={{ fontSize: 13, color: '#64748b' }}>{open ? '▾' : '▸'}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sub-phase / build-up name */}
          <div style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', lineHeight: 1.3 }}>
            {meta?.buildupType ?? meta?.taskType ?? phase.phase}
          </div>
          {/* Room + drawing label chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 4 }}>
            {meta?.roomName && (
              <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                📍 {meta.roomName}
              </span>
            )}
            {meta?.drawingLabel && (
              <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>
                ✏️ {meta.drawingLabel}
              </span>
            )}
            {/* Measurement badges */}
            {measureBadges.map(b => (
              <span key={b.label} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 99, background: '#f1f5f9', color: '#475569' }}>
                {b.label}: <strong>{b.value}</strong>
              </span>
            ))}
          </div>
        </div>

        {/* Cost summary */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#7ab533', fontFamily: 'monospace' }}>{fmt(sell)}</div>
          <div style={{ fontSize: 10, color: '#94a3b8' }}>cost {fmt(cost)}</div>
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '10px 14px 12px' }}>
          {/* Layer/task rows */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '4px 6px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11 }}>Item / Layer</th>
                <th style={{ padding: '4px 6px', textAlign: 'right', color: '#64748b', fontWeight: 600, fontSize: 11, width: 72 }}>Qty</th>
                <th style={{ padding: '4px 6px', textAlign: 'left', color: '#64748b', fontWeight: 600, fontSize: 11, width: 36 }}>Unit</th>
                <th style={{ padding: '4px 6px', textAlign: 'center', color: '#64748b', fontWeight: 600, fontSize: 11, width: 60 }}>Category</th>
                <th style={{ padding: '4px 6px', textAlign: 'right', color: '#64748b', fontWeight: 600, fontSize: 11, width: 80 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {phase.items.filter(i => i.desc).map(item => {
                const cat = item.itemType ?? 'other'
                const catStyle = CAT_COLORS[cat] ?? CAT_COLORS.other
                const itemCost = (item.labour ?? 0) + (item.materials ?? 0) + (item.plantHire ?? 0) + (item.subcontractors ?? 0) + (item.other ?? 0)
                // Extract the readable name from desc (strip the "— qty unit" suffix if present)
                const name = item.desc.split(' — ')[0] || item.desc
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '5px 6px', color: '#1e293b', fontWeight: 500 }}>{name}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>{item.qty}</td>
                    <td style={{ padding: '5px 6px', color: '#94a3b8' }}>{item.unit}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: catStyle.bg, color: catStyle.text }}>
                        {CAT_LABEL[cat] ?? cat}
                      </span>
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'right', fontFamily: 'monospace', color: itemCost > 0 ? '#1e293b' : '#cbd5e1' }}>
                      {itemCost > 0 ? fmt(itemCost) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Category totals strip */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '8px 6px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
            {cats.map(cat => {
              const val = categoryTotal(phase.items, cat)
              if (val === 0) return null
              const cs = CAT_COLORS[cat]
              return (
                <div key={cat} style={{ textAlign: 'center', padding: '4px 10px', background: cs.bg, borderRadius: 5, minWidth: 70 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cs.text, fontFamily: 'monospace' }}>{fmt(val)}</div>
                  <div style={{ fontSize: 9, color: cs.text, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{CAT_LABEL[cat]}</div>
                </div>
              )
            })}
            <div style={{ marginLeft: 'auto', textAlign: 'right', padding: '4px 8px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#7ab533', fontFamily: 'monospace' }}>{fmt(sell)}</div>
              <div style={{ fontSize: 9, color: '#94a3b8' }}>sell ({markup}% markup)</div>
            </div>
          </div>

          {/* Notes if any */}
          {phase.items[0]?.notes && (
            <div style={{ marginTop: 6, fontSize: 10, color: '#94a3b8', fontStyle: 'italic', paddingLeft: 4 }}>
              {phase.items[0].notes}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  phases:  QuotePhase[]
  markup:  number
  onEdit:  () => void   // callback to switch to edit mode
}

export default function TakeoffBreakdownView({ phases, markup, onEdit }: Props) {
  // Group by parentPhase
  const mainPhaseOrder: string[] = []
  const seen = new Set<string>()
  for (const p of phases) {
    const mp = p.parentPhase || '(No phase)'
    if (!seen.has(mp)) { seen.add(mp); mainPhaseOrder.push(mp) }
  }

  const phaseTotal = (mp: string) =>
    phases.filter(p => p.parentPhase === mp).reduce((s, p) => s + calcPhaseSell(p, markup), 0)

  const grandTotal = phases.reduce((s, p) => s + calcPhaseSell(p, markup), 0)

  return (
    <div style={{ fontSize: 13 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          📐 Takeoff Breakdown
          <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 400, color: '#64748b' }}>
            {phases.length} item{phases.length !== 1 ? 's' : ''} · {mainPhaseOrder.length} phase{mainPhaseOrder.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#7ab533', fontFamily: 'monospace' }}>{fmt(grandTotal)}</div>
          <button
            onClick={onEdit}
            style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#374151', fontWeight: 600 }}
          >
            ✏️ Edit Rates
          </button>
        </div>
      </div>

      {/* Phase groups */}
      {mainPhaseOrder.map(mp => {
        const subPhases = phases.filter(p => p.parentPhase === mp)
        const mpTotal = phaseTotal(mp)
        return (
          <div key={mp} style={{ marginBottom: 20 }}>
            {/* Phase header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: '#1e293b', color: '#fff',
              padding: '10px 16px', borderRadius: '8px 8px 0 0',
              fontSize: 13, fontWeight: 700,
            }}>
              <span>{mp}</span>
              <span style={{ fontFamily: 'monospace', color: '#7ab533', fontSize: 14 }}>{fmt(mpTotal)}</span>
            </div>

            {/* Sub-phase cards */}
            <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 10, background: '#f8fafc' }}>
              {subPhases.map(p => (
                <SubPhaseCard key={p.id} phase={p} markup={markup} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
