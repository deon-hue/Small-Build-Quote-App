'use client'

/**
 * Assembly Calculator — Rooflights & Dormers (Roof → Rooflights & Dormers).
 *
 * The glazed units themselves — roof lanterns, roof windows (Velux-style), fixed flat rooflights, dome
 * rooflights, and access hatches — supplied and fitted. The opening, its trimmers and its kerb are already
 * priced under Roof Structure, and the covering is already dressed up to the kerb under Roof Coverings; this
 * calculator prices only the unit that sits in that kerb and its flashing kit. No rooflights are pre-added —
 * add one for each unit the job actually has. See lib/rooflight-units.ts for the pricing.
 */

import React, { useMemo, useState } from 'react'
import {
  costLayer, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import {
  priceRooflightItem, resolveRooflightMaterials, KIND_DEFAULTS, ROOFLIGHT_KIND_LABEL, VELUX_PRESET,
  type RooflightItem, type RooflightKind, type VeluxPreset, type RoofWindowOpening, type GlazingTier, type DomeSkin,
} from '@/lib/rooflight-units'
import { describeRooflights, describeRooflightsShort } from '@/lib/rooflight-description'
import { suggestRooflightLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, miniInput, PropRow, BreakdownTable,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

let _rooflightId = 0
const newRooflightId = () => `rl-${++_rooflightId}`

function materialLineToLayer(l: { id: string; name: string; qty: number; unit: string; rate: number }, wastePct: number): AssemblyLayerDef {
  // Waste only makes sense for the area/length lines (glazed panels, bar) — a "nr" line is whole units bought
  // as whole units (one flashing kit, one hardware kit), and rounding a waste-inflated count up would double it.
  const isCount = l.unit === 'nr'
  return { id: l.id, name: l.name, category: 'materials', source: 'fixed', fixedQty: l.qty, unit: l.unit, unitCost: l.rate, roundToWhole: isCount, wastePct: isCount ? 0 : wastePct }
}

export default function AssemblyRooflightsDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const [name, setName]         = useState('Rooflights & Dormers')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [items, setItems]       = useState<RooflightItem[]>([])
  const [wastePct, setWastePct] = useState(5)
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function addItem(kind: RooflightKind) {
    setItems(prev => [...prev, { id: newRooflightId(), kind, qty: 1, ...KIND_DEFAULTS[kind] }])
  }
  function updateItem(id: string, patch: Partial<RooflightItem>) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
  }
  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const materialLines = useMemo(() => resolveRooflightMaterials(items), [items])
  const layers = useMemo(() => materialLines.map(l => {
    const layer = materialLineToLayer(l, wastePct)
    return rateOverrides[layer.id] != null ? { ...layer, unitCost: rateOverrides[layer.id] } : layer
  }), [materialLines, wastePct, rateOverrides])
  const costedLines: CostedLine[] = useMemo(() => layers.map(l => costLayer(l, l.fixedQty ?? 0)), [layers])
  const enabledMaterialLines = costedLines.filter(l => !disabledLayerIds.has(l.layerId))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }
  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const allMaterialLines = [...costedLines, ...miscCostedLines]
  const enabledLines = [...enabledMaterialLines, ...miscCostedLines]

  // Labour — the fitter's time, grouped by kind, following the items until the labour is edited by hand
  const kindGroups = useMemo(() => {
    const map = new Map<RooflightKind, { qty: number; hours: number }>()
    for (const item of items) {
      if (item.qty <= 0) continue
      const hrs = priceRooflightItem(item).fittingHours * item.qty
      const prev = map.get(item.kind) ?? { qty: 0, hours: 0 }
      map.set(item.kind, { qty: prev.qty + item.qty, hours: prev.hours + hrs })
    }
    return [...map.entries()].map(([kind, v]) => ({ label: ROOFLIGHT_KIND_LABEL[kind], qty: v.qty, hours: v.hours }))
  }, [items])
  const labourSuggestions: LabourSuggestion[] = suggestRooflightLabour(kindGroups)
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useState<LabourLine[] | null>(null)
  const suggestedRef = React.useRef<LabourLine[]>([])
  suggestedRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines
  const addLabour = () => setLabourOverride(prev => { const b = prev ?? suggestedRef.current; return [...b, { id: newLabourLineId(), tradeId: b[0]?.tradeId ?? '', task: '', hours: 0 }] })
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourOverride(prev => (prev ?? suggestedRef.current).map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourOverride(prev => (prev ?? suggestedRef.current).filter(l => l.id !== id))

  const labourCostedLines: CostedLine[] = labourLines
    .map(l => {
      const trade = labourTrades.find(t => t.id === l.tradeId)
      if (!trade || l.hours <= 0) return null
      const rate = hourlyRate(trade)
      return { layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour', source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr', unitCost: rate, cost: +(l.hours * rate).toFixed(2) } as CostedLine
    })
    .filter((l): l is CostedLine => l !== null)

  const costSubtotal = enabledLines.reduce((s, l) => s + l.cost, 0) + labourCostedLines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(costSubtotal * profitPct / 100).toFixed(2)
  const profitLine: CostedLine | null = profitPct > 0 ? { layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed', wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount } : null
  const totalCost = costSubtotal + profitAmount

  // The customer's description follows the items until it's edited by hand
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? describeRooflightsShort(items)
  const detail = detailOverride ?? describeRooflights(items)

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const miniNum = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <input type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={miniInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the rooflights</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the rooflights — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>

  return (
    <div style={{ border: '2px dashed #0369a1', borderRadius: 10, background: '#f5fbff', padding: 14, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#0369a1', color: '#fff' }}>🧪 PREVIEW</span>
        <span style={{ fontSize: 12, color: '#0369a1', fontWeight: 600 }}>Assembly Calculator — sample data and sample rates, nothing here is saved yet</span>
        <div style={{ flex: 1 }} />
        {onClose && <button onClick={onClose} style={{ background: 'none', border: '1px solid #bae6fd', borderRadius: 5, color: '#0369a1', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>Close preview</button>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1, border: 'none', outline: 'none', background: 'transparent' }} />
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room / location" title="Which room or location this is — becomes the quote's room grouping when saved"
          style={{ fontSize: 12, color: '#0369a1', width: 140, padding: '4px 8px', border: '1px solid #bae6fd', borderRadius: 5, background: '#f5fbff' }} />
        <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))} style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>
        <MaterialsListButtons lines={enabledLines} title={name} location={location} description={description} compact />
        {onSave && (
          <button onClick={() => onSave({ name, qty, location, description, detail, lines: [...enabledLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>💾 Save &amp; Price</button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Quote line (short — printed on the quote)</label>
          {following(descriptionOverride, () => setDescriptionOverride(null), 'line')}
        </div>
        <textarea value={description} onChange={e => setDescriptionOverride(e.target.value)} rows={2} style={box} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>What's included (full — shown on the online quote)</label>
          {following(detailOverride, () => setDetailOverride(null), 'description')}
        </div>
        <textarea value={detail} onChange={e => setDetailOverride(e.target.value)} rows={7} style={box} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          <RooflightsPlanSvg items={items} />
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            {items.filter(i => i.qty > 0).length === 0
              ? 'No rooflights added yet — the opening, kerb and covering for any planned are still priced under Roof Structure and Roof Coverings.'
              : `${items.reduce((s, i) => s + i.qty, 0)} rooflight${items.reduce((s, i) => s + i.qty, 0) === 1 ? '' : 's'} in all.`}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((item, i) => (
            <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#64748b', width: 14 }}>{i + 1}</span>
                <select value={item.kind} onChange={e => {
                  const kind = e.target.value as RooflightKind
                  updateItem(item.id, { kind, ...KIND_DEFAULTS[kind] })
                }} style={{ ...miniInput, flex: 1 }}>
                  {(Object.entries(ROOFLIGHT_KIND_LABEL) as [RooflightKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <button onClick={() => removeItem(item.id)} aria-label={`Remove item ${i + 1}`}
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
              </div>

              {item.kind === 'roof-window' ? (
                <>
                  <PropRow label="Size">
                    <select value={item.veluxPreset ?? 'mk04'} onChange={e => {
                      const preset = e.target.value as VeluxPreset
                      const known = preset !== 'bespoke' ? VELUX_PRESET[preset] : null
                      updateItem(item.id, { veluxPreset: preset, ...(known ? { widthMm: known.widthMm, depthMm: known.depthMm } : {}) })
                    }} style={miniInput}>
                      {(Object.entries(VELUX_PRESET) as [Exclude<VeluxPreset, 'bespoke'>, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      <option value="bespoke">Bespoke size</option>
                    </select>
                  </PropRow>
                  {item.veluxPreset === 'bespoke' && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: '#94a3b8' }}>Width</div>{miniNum(item.widthMm, n => updateItem(item.id, { widthMm: n }), 1)}</div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: '#94a3b8' }}>Length</div>{miniNum(item.depthMm, n => updateItem(item.id, { depthMm: n }), 1)}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>Opening</div>
                      <select value={item.opening ?? 'manual'} onChange={e => updateItem(item.id, { opening: e.target.value as RoofWindowOpening })} style={miniInput}>
                        <option value="manual">Manual</option>
                        <option value="electric">Electric</option>
                      </select>
                    </div>
                    <div style={{ width: 56 }}><div style={{ fontSize: 9, color: '#94a3b8' }}>Qty</div>{miniNum(item.qty, n => updateItem(item.id, { qty: n }), 0)}</div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: '#94a3b8' }}>Width</div>{miniNum(item.widthMm, n => updateItem(item.id, { widthMm: n }), 1)}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 9, color: '#94a3b8' }}>Length</div>{miniNum(item.depthMm, n => updateItem(item.id, { depthMm: n }), 1)}</div>
                    <div style={{ width: 56 }}><div style={{ fontSize: 9, color: '#94a3b8' }}>Qty</div>{miniNum(item.qty, n => updateItem(item.id, { qty: n }), 0)}</div>
                  </div>
                  {(item.kind === 'lantern' || item.kind === 'flat-rooflight') && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 4, alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8' }}>Glazing</div>
                        <select value={item.glazing ?? 'double'} onChange={e => updateItem(item.id, { glazing: e.target.value as GlazingTier })} style={miniInput}>
                          <option value="double">Double</option>
                          <option value="triple">Triple</option>
                        </select>
                      </div>
                      {item.kind === 'flat-rooflight' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#475569', cursor: 'pointer', marginTop: 12 }}>
                          <input type="checkbox" checked={!!item.walkOn} onChange={e => updateItem(item.id, { walkOn: e.target.checked })} style={{ width: 'auto' }} />
                          Walk-on
                        </label>
                      )}
                    </div>
                  )}
                  {item.kind === 'dome' && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 9, color: '#94a3b8' }}>Skin</div>
                      <select value={item.skin ?? 'twin'} onChange={e => updateItem(item.id, { skin: e.target.value as DomeSkin })} style={miniInput}>
                        <option value="single">Single</option>
                        <option value="twin">Twin</option>
                        <option value="triple">Triple</option>
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {(Object.keys(ROOFLIGHT_KIND_LABEL) as RooflightKind[]).map(k => (
              <button key={k} onClick={() => addItem(k)}
                style={{ fontSize: 11, padding: '3px 8px', border: '1px dashed #7dd3fc', borderRadius: 999, background: 'none', color: '#0369a1', cursor: 'pointer' }}>
                + {ROOFLIGHT_KIND_LABEL[k]}
              </button>
            ))}
          </div>

          <PropRow label={`Waste % (${wastePct}%)`}>
            <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}>
            <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0}
        />
        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
          <BreakdownTable lines={allMaterialLines} onRateChange={handleRate} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
            layerSides={{}} onSidesChange={() => {}} sidesEligibleLayerIds={noSidesLayers} />
          {profitPct > 0 && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>
              Cost: £{costSubtotal.toFixed(2)} + {profitPct}% profit (£{profitAmount.toFixed(2)}) = <strong style={{ color: '#7ab533' }}>£{totalCost.toFixed(2)}</strong>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── A row of each added rooflight, drawn roughly to scale so their relative sizes read at a glance ──
function RooflightsPlanSvg({ items }: { items: RooflightItem[] }) {
  const shown = items.filter(i => i.qty > 0)
  const vbW = 430, vbH = 220
  if (shown.length === 0) {
    return (
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={vbW / 2} y={vbH / 2} fontSize={12} fill="#94a3b8" textAnchor="middle">Add a rooflight below to see it here</text>
      </svg>
    )
  }
  const maxW = Math.max(...shown.map(i => i.widthMm)), maxD = Math.max(...shown.map(i => i.depthMm))
  const k = Math.min(110 / maxW, 130 / maxD, 0.09)
  const gap = 24
  let x = 20
  const boxes = shown.map(item => {
    const w = item.widthMm * k, h = item.depthMm * k
    const box = { item, x, y: vbH - 40 - h, w, h }
    x += w + gap
    return box
  })
  const totalW = x
  const scale = totalW > vbW - 20 ? (vbW - 20) / totalW : 1
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <g transform={`scale(${scale})`}>
        {boxes.map(({ item, x, y, w, h }, i) => (
          <g key={item.id}>
            <rect x={x} y={y} width={w} height={h} fill="#ccfbf1" stroke="#0f766e" strokeWidth={1.4} />
            {item.kind === 'lantern' && <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke="#0f766e" strokeWidth={0.8} />}
            <text x={x + w / 2} y={vbH - 20} fontSize={9} fill="#57534e" textAnchor="middle">{ROOFLIGHT_KIND_LABEL[item.kind]}{item.qty > 1 ? ` ×${item.qty}` : ''}</text>
            <text x={x + w / 2} y={vbH - 8} fontSize={8} fill="#94a3b8" textAnchor="middle">{item.widthMm}×{item.depthMm}</text>
            <text x={x + w / 2} y={y + h / 2 + 3} fontSize={8} fill="#0f766e" textAnchor="middle">{i + 1}</text>
          </g>
        ))}
      </g>
    </svg>
  )
}
