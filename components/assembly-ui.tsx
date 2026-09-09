'use client'

// Shared, geometry-agnostic building blocks for assembly calculators — the cost breakdown
// table, the labour and misc-materials sections, the openings editor, and small dimension/
// property-row helpers. None of this knows whether it's costing a stud wall, a block wall,
// or a future roof/foundation module — it only ever sees CostedLine[]/AssemblyOpening[] and
// callbacks. Each calculator component supplies its own geometry, layer list, and elevation
// drawing; everything here is what stays identical across all of them.

import React from 'react'
import type { AssemblyOpening, CostedLine } from '@/lib/assembly-calc'
import type { BOLabourTrade } from '@/lib/back-office-types'

export const CATEGORY_LABEL: Record<string, string> = { materials: 'Materials', labour: 'Labour', plant: 'Plant', subcontractors: 'Subcontractors', other: 'Other' }

export const propInput: React.CSSProperties = { width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
export const miniInput: React.CSSProperties = { width: '100%', fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }

export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}

// ── Labour — manual trade + hours, priced from real Back Office day rates. Never derived
// from geometry: the estimator picks a trade, allows some time, and can add another trade
// for the next task (e.g. carpenter to build, plasterer to board). ──
export interface LabourLine { id: string; tradeId: string; task: string; hours: number }
let _labourLineId = 0
export const newLabourLineId = () => `ll-${++_labourLineId}`
export function hourlyRate(trade: BOLabourTrade): number { return +(trade.day_rate / 8).toFixed(2) }

export function LabourSection({ labourLines, labourTrades, onAdd, onUpdate, onRemove }: {
  labourLines: LabourLine[]
  labourTrades: BOLabourTrade[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<LabourLine>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Labour — pick a trade, allow some time, add another trade for the next task
      </div>
      {labourTrades.length === 0 ? (
        <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
          No Back Office labour trades found — add some under Back Office → Labour &amp; Trades.
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 70px 90px 90px 20px', gap: 6, marginBottom: 3 }}>
            {['Trade', 'Task', 'Hours', 'Rate', 'Cost'].map(h => (
              <div key={h} style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</div>
            ))}
            <div />
          </div>
          {labourLines.map(l => {
            const trade = labourTrades.find(t => t.id === l.tradeId)
            const rate = trade ? hourlyRate(trade) : 0
            const cost = trade ? +(l.hours * rate).toFixed(2) : 0
            return (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 70px 90px 90px 20px', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                <select value={l.tradeId} onChange={e => onUpdate(l.id, { tradeId: e.target.value })} style={miniInput}>
                  <option value="">Select trade…</option>
                  {labourTrades.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input value={l.task} onChange={e => onUpdate(l.id, { task: e.target.value })}
                  placeholder="e.g. Build stud wall" style={miniInput} />
                <input type="number" min={0} step={0.5} value={l.hours}
                  onChange={e => onUpdate(l.id, { hours: +e.target.value || 0 })} style={miniInput} />
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{trade ? `£${rate.toFixed(2)}/hr` : '—'}</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{trade ? `£${cost.toFixed(2)}` : '—'}</div>
                <button onClick={() => onRemove(l.id)} title="Remove this labour line"
                  style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            )
          })}
          <button onClick={onAdd}
            style={{ fontSize: 11, border: '1px dashed #94a3b8', background: 'transparent', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}>
            + Add Trade
          </button>
        </>
      )}
    </div>
  )
}

// ── Miscellaneous Materials — freeform name/qty/unit/rate lines for anything not covered
// by the standard layers (fixings, adhesive, sundries, ...). ──
export interface MiscMaterialLine { id: string; name: string; qty: number; unit: string; unitCost: number }
let _miscMaterialLineId = 0
export const newMiscMaterialLineId = () => `misc-${++_miscMaterialLineId}`

export function MiscMaterialsSection({ miscMaterialLines, onAdd, onUpdate, onRemove }: {
  miscMaterialLines: MiscMaterialLine[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<MiscMaterialLine>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Miscellaneous Materials — anything not covered by the layers below
      </div>
      {miscMaterialLines.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 80px 90px 90px 20px', gap: 6, marginBottom: 3 }}>
          {['Name', 'Qty', 'Unit', 'Rate', 'Cost'].map(h => (
            <div key={h} style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</div>
          ))}
          <div />
        </div>
      )}
      {miscMaterialLines.map(m => {
        const cost = +(m.qty * m.unitCost).toFixed(2)
        return (
          <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 80px 90px 90px 20px', gap: 6, marginBottom: 4, alignItems: 'center' }}>
            <input value={m.name} onChange={e => onUpdate(m.id, { name: e.target.value })}
              placeholder="e.g. Fixings" style={miniInput} />
            <input type="number" min={0} step={0.5} value={m.qty}
              onChange={e => onUpdate(m.id, { qty: Math.max(0, +e.target.value || 0) })} style={miniInput} />
            <input value={m.unit} onChange={e => onUpdate(m.id, { unit: e.target.value })}
              placeholder="item" style={miniInput} />
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>£</span>
              <input type="number" min={0} step={0.01} value={m.unitCost}
                onChange={e => onUpdate(m.id, { unitCost: Math.max(0, +e.target.value || 0) })} style={miniInput} />
            </div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>£{cost.toFixed(2)}</div>
            <button onClick={() => onRemove(m.id)} title="Remove this material"
              style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
        )
      })}
      <button onClick={onAdd}
        style={{ fontSize: 11, border: '1px dashed #94a3b8', background: 'transparent', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}>
        + Add Material
      </button>
    </div>
  )
}

// ── Openings — shared by every module that can have a window/door/custom opening. The
// elevation drawing and geometry differ per module (framed vs. masonry), but the editable
// width/height/offset/sill fields are identical. ──
let _openingId = 0
export const newOpeningId = () => `op-${++_openingId}`

export function OpeningsEditor({ openings, onAdd, onUpdate, onRemove }: {
  openings: AssemblyOpening[]
  onAdd: () => void
  onUpdate: (id: string, patch: Partial<AssemblyOpening>) => void
  onRemove: (id: string) => void
}) {
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
        Openings
      </div>
      {openings.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 20px', gap: 4, marginBottom: 3 }}>
          {['Kind', 'Width', 'Height', 'From left', 'Sill'].map(h => (
            <div key={h} style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</div>
          ))}
          <div />
        </div>
      )}
      {openings.map(o => (
        <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 20px', gap: 4, marginBottom: 4, alignItems: 'center' }}>
          <select value={o.kind} onChange={e => onUpdate(o.id, { kind: e.target.value as AssemblyOpening['kind'], sillHeightMm: e.target.value === 'door' ? 0 : (o.sillHeightMm || 900) })} style={miniInput}>
            <option value="window">Window</option>
            <option value="door">Door</option>
            <option value="custom">Custom</option>
          </select>
          <input type="number" title="Width of the opening (mm)" value={o.widthMm} onChange={e => onUpdate(o.id, { widthMm: +e.target.value || 0 })} style={miniInput} />
          <input type="number" title="Height of the opening itself (mm)" value={o.heightMm} onChange={e => onUpdate(o.id, { heightMm: +e.target.value || 0 })} style={miniInput} />
          <input type="number" title="Distance from the wall's left end to the opening's left edge (mm)" value={o.offsetMm} onChange={e => onUpdate(o.id, { offsetMm: +e.target.value || 0 })} style={miniInput} />
          <input type="number" title="Sill height — floor to the bottom of the opening (mm), 0 for a door" value={o.sillHeightMm} onChange={e => onUpdate(o.id, { sillHeightMm: +e.target.value || 0 })} style={miniInput} disabled={o.kind === 'door'} />
          <button onClick={() => onRemove(o.id)} title="Remove opening"
            style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
      ))}
      <button onClick={onAdd}
        style={{ fontSize: 11, border: '1px dashed #94a3b8', background: 'transparent', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}>
        + Opening
      </button>
    </div>
  )
}

// A dimension line with end-ticks and a centred label — the standard elevation-drawing
// convention, used for every measurement annotation in every calculator's elevation SVG.
export function HDim({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  if (Math.abs(x2 - x1) < 1) return null
  return (
    <g>
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#94a3b8" strokeWidth={1} />
      <text x={(x1 + x2) / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="#64748b">{label}</text>
    </g>
  )
}
export function VDim({ y1, y2, x, label }: { y1: number; y2: number; x: number; label: string }) {
  if (Math.abs(y2 - y1) < 1) return null
  return (
    <g>
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#94a3b8" strokeWidth={1} />
      <text x={x + 5} y={(y1 + y2) / 2} dominantBaseline="middle" fontSize={8} fill="#64748b">{label}</text>
    </g>
  )
}

export function BreakdownTable({ lines, onRateChange, disabledLayerIds, onToggleLayer, layerSides, onSidesChange, sidesEligibleLayerIds }: {
  lines: CostedLine[]
  onRateChange: (layerId: string, unitCost: number) => void
  disabledLayerIds: Set<string>
  onToggleLayer: (layerId: string) => void
  layerSides: Record<string, 1 | 2>
  onSidesChange: (layerId: string, sides: 1 | 2) => void
  sidesEligibleLayerIds: Set<string>
}) {
  const groups = ['materials', 'labour', 'plant', 'subcontractors', 'other'] as const
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Cost breakdown — sample rates, editable for now until Products/Labour/Plant linking replaces them. Untick a line to leave it out (e.g. no insulation).
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ width: 20 }} />
            <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Item</th>
            <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Sides</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Raw qty</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Waste</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Purchase qty</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Unit cost</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const groupLines = lines.filter(l => l.category === g)
            if (groupLines.length === 0) return null
            const groupTotal = groupLines.filter(l => !disabledLayerIds.has(l.layerId)).reduce((s, l) => s + l.cost, 0)
            return (
              <React.Fragment key={g}>
                <tr>
                  <td colSpan={8} style={{ padding: '6px 6px 2px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    {CATEGORY_LABEL[g]}
                  </td>
                </tr>
                {groupLines.map(l => {
                  const off = disabledLayerIds.has(l.layerId)
                  const sidesEligible = sidesEligibleLayerIds.has(l.layerId)
                  const sides = layerSides[l.layerId] ?? 1
                  return (
                    <tr key={l.layerId} style={{ borderBottom: '1px solid #f1f5f9', opacity: off ? 0.45 : 1 }}>
                      <td style={{ padding: '3px 6px' }}>
                        <input type="checkbox" checked={!off} onChange={() => onToggleLayer(l.layerId)}
                          title={off ? 'Excluded — click to include' : 'Included — click to leave out'}
                          style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '3px 6px', textDecoration: off ? 'line-through' : 'none' }}>{l.name}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                        {sidesEligible && (
                          <div style={{ display: 'inline-flex', gap: 2 }}>
                            {([1, 2] as const).map(s => (
                              <button key={s} type="button" disabled={off}
                                onClick={() => onSidesChange(l.layerId, s)}
                                title={s === 1 ? 'Applied to one face only' : 'Applied to both faces of the wall'}
                                style={{
                                  fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: off ? 'default' : 'pointer',
                                  border: `1px solid ${sides === s ? '#7c3aed' : '#e2e8f0'}`,
                                  background: sides === s ? '#7c3aed' : 'transparent',
                                  color: sides === s ? '#fff' : '#64748b',
                                }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{l.rawQty}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>{l.wastePct}%</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{l.purchaseQty} {l.unit}</td>
                      <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>£</span>
                          <input
                            type="number" min={0} step={0.01} value={l.unitCost} disabled={off}
                            onChange={e => onRateChange(l.layerId, +e.target.value)}
                            title="Edit this sample rate"
                            style={{ width: 62, fontFamily: 'monospace', fontSize: 12, textAlign: 'right', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 4 }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, textDecoration: off ? 'line-through' : 'none' }}>£{l.cost.toFixed(2)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td colSpan={7} style={{ padding: '2px 6px', textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>{CATEGORY_LABEL[g]} total</td>
                  <td style={{ padding: '2px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>£{groupTotal.toFixed(2)}</td>
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
