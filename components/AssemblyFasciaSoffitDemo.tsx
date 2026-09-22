'use client'

/**
 * Assembly Calculator — Fascias, Soffits & Barge Boards (Roof → Fascias, Soffits & Barge Boards).
 *
 * Sized like every other Roof-phase calculator — from the drawn shape's bounding box — with each of the
 * four edges set to what it is: an eaves edge (fascia and soffit board; the gutter that's fixed to the
 * fascia is priced separately, under Gutters & Downpipes), a verge/gable edge (a barge board), or neither
 * (an existing wall, or nothing there). See lib/fascia-soffit-units.ts for the geometry and pricing.
 */

import React, { useMemo, useState, useEffect } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import {
  calculateFasciaSoffitGeometry, resolveFasciaSoffitMaterials, BOARD_MATERIAL_LABEL,
  type FasciaEdges, type FasciaEdgeRole, type EdgeKey, type BoardMaterial, type FasciaDepth, type SoffitWidth,
} from '@/lib/fascia-soffit-units'
import { describeFasciaSoffit, describeFasciaSoffitShort } from '@/lib/fascia-soffit-description'
import { suggestFasciaSoffitLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
  externalWidthMm?: number
}

const EDGE_ROLE_LABEL: Record<FasciaEdgeRole, string> = { eaves: 'Eaves', verge: 'Verge / gable', none: 'None (wall, or nothing)' }

function materialLineToLayer(l: { id: string; name: string; qty: number; unit: string; rate: number }, wastePct: number): AssemblyLayerDef {
  const isCount = l.unit === 'nr'
  return { id: l.id, name: l.name, category: 'materials', source: 'fixed', fixedQty: l.qty, unit: l.unit, unitCost: l.rate, roundToWhole: isCount, wastePct: isCount ? 0 : wastePct }
}

export default function AssemblyFasciaSoffitDemo({ onClose, onSave, labourTrades = [], externalLengthMm, externalWidthMm }: Props) {
  const [name, setName]         = useState('Fascias, Soffits & Barge Boards')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  const [widthMm, setWidthMm]   = useState(externalWidthMm ?? 3200)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  useEffect(() => { if (externalWidthMm != null) setWidthMm(externalWidthMm) }, [externalWidthMm])

  const [edges, setEdges] = useState<FasciaEdges>({ high: 'none', low: 'eaves', left: 'verge', right: 'verge' })
  function setEdge(which: EdgeKey, value: FasciaEdgeRole) { setEdges(prev => ({ ...prev, [which]: value })) }

  const [fasciaMaterial, setFasciaMaterial] = useState<BoardMaterial>('upvc')
  const [fasciaDepthMm, setFasciaDepthMm]   = useState<FasciaDepth>(175)
  const [soffitMaterial, setSoffitMaterial] = useState<BoardMaterial>('upvc')
  const [soffitVented, setSoffitVented]     = useState(true)
  const [soffitWidthMm, setSoffitWidthMm]   = useState<SoffitWidth>(300)
  const [bargeMaterial, setBargeMaterial]   = useState<BoardMaterial>('upvc')

  const [wastePct, setWastePct] = useState(5)
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateFasciaSoffitGeometry({ lengthMm, widthMm, edges }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, widthMm, edges.high, edges.low, edges.left, edges.right])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const materialLines = useMemo(() => g ? resolveFasciaSoffitMaterials(g, { fasciaMaterial, fasciaDepthMm, soffitMaterial, soffitVented, soffitWidthMm, bargeMaterial }) : [], [g, fasciaMaterial, fasciaDepthMm, soffitMaterial, soffitVented, soffitWidthMm, bargeMaterial])
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

  // Labour — the carpenter fixing the boards, following the edges until the labour is edited by hand
  const labourSuggestions: LabourSuggestion[] = g ? suggestFasciaSoffitLabour(g) : []
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

  // The customer's description follows the roof until it's edited by hand
  const descInput = g ? { eavesLm: g.eavesLm, vergeLm: g.vergeLm, fasciaMaterial, fasciaDepthMm, soffitMaterial, soffitVented, soffitWidthMm, bargeMaterial } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describeFasciaSoffitShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeFasciaSoffit(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the roof</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the roof — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the roof</button>
  const edgeSelect = (which: EdgeKey, label: string) => (
    <div style={{ flex: 1 }}>
      <PropRow label={label}>
        <select value={edges[which]} onChange={e => setEdge(which, e.target.value as FasciaEdgeRole)} style={propInput}>
          {(Object.entries(EDGE_ROLE_LABEL) as [FasciaEdgeRole, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </PropRow>
    </div>
  )

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
        {geometryResult.ok && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {geometryResult.ok && <MaterialsListButtons lines={enabledLines} title={name} location={location} description={description} compact />}
        {onSave && geometryResult.ok && (
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

      {!geometryResult.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {geometryResult.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <FasciaPlanSvg lengthMm={lengthMm} widthMm={widthMm} edges={edges} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              Eaves {g.eavesLm.toFixed(1)}m, verge {g.vergeLm.toFixed(1)}m. {g.cornerCount} corner{g.cornerCount === 1 ? '' : 's'}, {g.eaveStopEnds + g.vergeStopEnds} end cap{(g.eaveStopEnds + g.vergeStopEnds) === 1 ? '' : 's'}, {g.eaveJoints + g.vergeJoints} joint{(g.eaveJoints + g.vergeJoints) === 1 ? '' : 's'}.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Width (mm)">{numInput(widthMm, setWidthMm, 1)}</PropRow></div>
          </div>

          <CollapsibleSection title="Edges" borderColor="#bae6fd">
            <div style={{ display: 'flex', gap: 6 }}>
              {edgeSelect('high', 'High edge (top)')}
              {edgeSelect('low', 'Low edge (bottom)')}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {edgeSelect('left', 'Left')}
              {edgeSelect('right', 'Right')}
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Fascia and soffit (eaves)" borderColor="#bae6fd">
            <PropRow label="Fascia material">
              <select value={fasciaMaterial} onChange={e => setFasciaMaterial(e.target.value as BoardMaterial)} style={propInput}>
                {(Object.entries(BOARD_MATERIAL_LABEL) as [BoardMaterial, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ marginTop: 6 }}>
              <PropRow label="Fascia depth">
                <select value={fasciaDepthMm} onChange={e => setFasciaDepthMm(+e.target.value as FasciaDepth)} style={propInput}>
                  <option value={175}>175mm</option>
                  <option value={225}>225mm (deep fascia)</option>
                </select>
              </PropRow>
            </div>
            <div style={{ marginTop: 6 }}>
              <PropRow label="Soffit material">
                <select value={soffitMaterial} onChange={e => setSoffitMaterial(e.target.value as BoardMaterial)} style={propInput}>
                  {(Object.entries(BOARD_MATERIAL_LABEL) as [BoardMaterial, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </PropRow>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <PropRow label="Soffit width">
                  <select value={soffitWidthMm} onChange={e => setSoffitWidthMm(+e.target.value as SoffitWidth)} style={propInput}>
                    <option value={200}>200mm</option>
                    <option value={300}>300mm</option>
                    <option value={405}>405mm</option>
                  </select>
                </PropRow>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer', marginTop: 20 }}>
                <input type="checkbox" checked={soffitVented} onChange={e => setSoffitVented(e.target.checked)} style={{ width: 'auto' }} />
                Vented
              </label>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Barge board (verge)" borderColor="#bae6fd">
            <PropRow label="Barge board material">
              <select value={bargeMaterial} onChange={e => setBargeMaterial(e.target.value as BoardMaterial)} style={propInput}>
                {(Object.entries(BOARD_MATERIAL_LABEL) as [BoardMaterial, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

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

        {geometryResult.ok && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={allMaterialLines} onRateChange={handleRate} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
              layerSides={{}} onSidesChange={() => {}} sidesEligibleLayerIds={noSidesLayers} />
            {profitPct > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>
                Cost: £{costSubtotal.toFixed(2)} + {profitPct}% profit (£{profitAmount.toFixed(2)}) = <strong style={{ color: '#7ab533' }}>£{totalCost.toFixed(2)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── The roof's outline in plan, each edge coloured by what it is: eaves (fascia/soffit, teal), verge
// (barge board, amber), or nothing (grey dashed) — so the choices read straight off the drawing. ──
const ROLE_COLOUR: Record<FasciaEdgeRole, string> = { eaves: '#0f766e', verge: '#b45309', none: '#a8a29e' }
function FasciaPlanSvg({ lengthMm, widthMm, edges }: { lengthMm: number; widthMm: number; edges: FasciaEdges }) {
  const vbW = 380, vbH = 260
  const k = Math.min(260 / lengthMm, 150 / widthMm)
  const w = lengthMm * k, h = widthMm * k
  const x0 = (vbW - w) / 2, y0 = 50
  const EDGE_BAR = 6
  const rects: Record<EdgeKey, { x: number; y: number; w: number; h: number }> = {
    high:  { x: x0, y: y0 - EDGE_BAR, w, h: EDGE_BAR },
    low:   { x: x0, y: y0 + h, w, h: EDGE_BAR },
    left:  { x: x0 - EDGE_BAR, y: y0, w: EDGE_BAR, h },
    right: { x: x0 + w, y: y0, w: EDGE_BAR, h },
  }
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 240, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={x0} y={y0} width={w} height={h} fill="#fafaf9" stroke="#78716c" strokeWidth={1.2} />
      {(['high', 'low', 'left', 'right'] as EdgeKey[]).map(k => {
        const r = rects[k], role = edges[k]
        return role === 'none'
          ? <rect key={k} {...r} fill="none" stroke="#d6d3d1" strokeWidth={1.2} strokeDasharray="3 2" />
          : <rect key={k} {...r} fill={ROLE_COLOUR[role]} />
      })}
      <text x={x0 + w / 2} y={y0 - EDGE_BAR - 6} fontSize={9} fill="#57534e" textAnchor="middle">{edges.high === 'none' ? '' : EDGE_ROLE_LABEL[edges.high]}</text>
      <text x={x0 + w / 2} y={y0 + h + EDGE_BAR + 16} fontSize={9} fill="#57534e" textAnchor="middle">{edges.low === 'none' ? '' : EDGE_ROLE_LABEL[edges.low]}</text>
      <text x={x0 - EDGE_BAR - 8} y={y0 + h / 2} fontSize={9} fill="#57534e" textAnchor="middle" transform={`rotate(-90 ${x0 - EDGE_BAR - 8} ${y0 + h / 2})`}>{edges.left === 'none' ? '' : EDGE_ROLE_LABEL[edges.left]}</text>
      <text x={x0 + w + EDGE_BAR + 8} y={y0 + h / 2} fontSize={9} fill="#57534e" textAnchor="middle" transform={`rotate(90 ${x0 + w + EDGE_BAR + 8} ${y0 + h / 2})`}>{edges.right === 'none' ? '' : EDGE_ROLE_LABEL[edges.right]}</text>
      <text x={x0 + w / 2} y={y0 + h + 40} fontSize={9} fill="#64748b" textAnchor="middle">{(lengthMm / 1000).toFixed(2)}m × {(widthMm / 1000).toFixed(2)}m</text>
      <g transform={`translate(${x0}, ${vbH - 12})`}>
        <rect x={0} y={-6} width={14} height={6} fill={ROLE_COLOUR.eaves} /><text x={19} y={0} fontSize={8} fill="#64748b">Eaves</text>
        <rect x={70} y={-6} width={14} height={6} fill={ROLE_COLOUR.verge} /><text x={89} y={0} fontSize={8} fill="#64748b">Verge</text>
        <rect x={140} y={-6} width={14} height={6} fill="none" stroke="#d6d3d1" strokeDasharray="3 2" /><text x={159} y={0} fontSize={8} fill="#64748b">None</text>
      </g>
    </svg>
  )
}
