'use client'

/**
 * Assembly Calculator — Parapet wall, an external masonry wall drawn as a line (External Walls → Parapet wall).
 *
 * Its build (brick and block cavity, solid block rendered, or solid brick), its height above the finished roof and
 * the masonry below it, the DPC and cavity tray at its base, the coping or capping over it (concrete, stone,
 * bricks on edge, aluminium, lead), and the openings for the rainwater outlets. Each part has its own breakdown, so
 * a different capping is a different set of lines. The roof structure, covering and drainage are separate
 * calculators under Roof. See calculateParapetWallGeometry in lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  calculateParapetWallCost, calculateParapetWallGeometry,
  type ParapetWallInput, type ParapetBuildType, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import {
  COPING_LABEL, COPING_TYPES, BUILD_LABEL, describeParapetWall, describeParapetWallShort, type CopingType,
} from '@/lib/parapet-wall'
import { suggestParapetLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import { EXTERNAL_FINISH_CONFIG, CEMENT_M2_PER_BAG, SAND_M2_PER_TONNE } from '@/components/AssemblyMasonryWallDemo'

// Mortar as a volume — the same calibration as the dwarf, sleeper and flat roof calculators.
const CEMENT_M3_PER_BAG = +(CEMENT_M2_PER_BAG * 0.013).toFixed(4)
const SAND_M3_PER_TONNE = +(SAND_M2_PER_TONNE * 0.013).toFixed(3)

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** The length of the wall drawn in Take-off, in mm. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
}

/** The layers that cap the wall, by coping — sample rates, editable in the breakdown. */
function copingLayers(type: CopingType, copingWidthMm: number, w: number): AssemblyLayerDef[] {
  const dpc: AssemblyLayerDef = { id: 'coping_dpc', name: 'DPC under the coping', category: 'materials', source: 'copingLm', unit: 'lm', unitCost: 2.50, wastePct: w }
  switch (type) {
    case 'concrete':
      return [
        { id: 'coping', name: `Concrete coping stones ${copingWidthMm}mm wide (600mm lengths)`, category: 'materials', source: 'copingLm', unit: '600mm stone', unitCost: 8.50, wastePct: 5, coveragePerUnit: 0.6, roundToWhole: true }, dpc,
      ]
    case 'stone-recon':
      return [
        { id: 'coping', name: `Reconstituted stone coping ${copingWidthMm}mm wide (600mm lengths)`, category: 'materials', source: 'copingLm', unit: '600mm stone', unitCost: 14.00, wastePct: 5, coveragePerUnit: 0.6, roundToWhole: true }, dpc,
      ]
    case 'stone-natural':
      return [
        { id: 'coping', name: `Natural stone coping ${copingWidthMm}mm wide (600mm lengths)`, category: 'materials', source: 'copingLm', unit: '600mm stone', unitCost: 38.00, wastePct: 5, coveragePerUnit: 0.6, roundToWhole: true }, dpc,
      ]
    case 'brick-on-edge':
      return [
        { id: 'coping', name: 'Engineering bricks laid on edge (coping course)', category: 'materials', source: 'copingBrickCount', unit: 'nr', unitCost: 0.90, wastePct: 5, roundToWhole: true }, dpc,
      ]
    case 'aluminium':
      return [
        { id: 'coping', name: `Powder-coated aluminium coping ${copingWidthMm}mm (3m lengths)`, category: 'materials', source: 'copingLm', unit: '3m length', unitCost: 52.00, wastePct: 5, coveragePerUnit: 3, roundToWhole: true },
        { id: 'coping_fixings', name: 'Coping brackets, clips and sealant', category: 'materials', source: 'copingLm', unit: 'lm', unitCost: 3.50, wastePct: 5 },
      ]
    case 'lead':
      return [
        { id: 'coping', name: 'Code 4 lead capping (450mm girth)', category: 'materials', source: 'copingLm', unit: 'lm', unitCost: 34.00, wastePct: 5 },
        { id: 'coping_base', name: '18mm plywood base for the lead capping', category: 'materials', source: 'copingLm', unit: 'lm', unitCost: 6.00, wastePct: 5 },
        { id: 'coping_fixings', name: 'Lead clips, underlay and sealant', category: 'materials', source: 'copingLm', unit: 'lm', unitCost: 2.00, wastePct: 5 },
      ]
  }
}

function buildParapetLayers(build: ParapetBuildType, coping: CopingType, copingWidthMm: number, w: number): AssemblyLayerDef[] {
  const layers: AssemblyLayerDef[] = []
  if (build === 'cavity-brick-block') {
    layers.push(
      { id: 'parapet_bricks', name: 'Facing bricks (parapet outer leaf)', category: 'materials', source: 'brickCount', unit: 'nr', unitCost: 0.75, roundToWhole: true, wastePct: w },
      { id: 'parapet_blocks', name: 'Dense concrete blocks 100mm (parapet inner leaf)', category: 'materials', source: 'blockCount', unit: 'nr', unitCost: 1.35, roundToWhole: true, wastePct: w },
      { id: 'parapet_ties', name: 'Stainless steel wall ties (parapet)', category: 'materials', source: 'tieCount', unit: 'nr', unitCost: 0.28, roundToWhole: true, wastePct: 5 },
    )
  } else if (build === 'solid-block') {
    layers.push({ id: 'parapet_blocks', name: 'Dense concrete blocks laid flat, 215mm (parapet)', category: 'materials', source: 'blockCount', unit: 'nr', unitCost: 1.35, roundToWhole: true, wastePct: w })
  } else {
    layers.push({ id: 'parapet_bricks', name: 'Facing bricks (solid 215mm parapet, both skins)', category: 'materials', source: 'brickCount', unit: 'nr', unitCost: 0.75, roundToWhole: true, wastePct: w })
  }
  layers.push(
    { id: 'parapet_cement', name: 'Cement (parapet mortar)', category: 'materials', source: 'mortarM3', unit: 'bag', unitCost: 6.50, coveragePerUnit: CEMENT_M3_PER_BAG, roundToWhole: true, wastePct: w },
    { id: 'parapet_sand', name: 'Building sand (parapet mortar)', category: 'materials', source: 'mortarM3', unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M3_PER_TONNE, wastePct: w },
  )
  if (build === 'solid-block') {
    layers.push(...EXTERNAL_FINISH_CONFIG.render.buildLayers(w).map(l => ({ ...l, source: 'renderAreaM2' as const })))
  }
  layers.push({ id: 'parapet_tray', name: 'DPC and cavity tray at the parapet base', category: 'materials', source: 'trayLm', unit: 'lm', unitCost: 4.60, wastePct: w })
  layers.push(...copingLayers(coping, copingWidthMm, w))
  return layers
}

export default function AssemblyParapetWallDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName]         = useState('Parapet wall')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 8200)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  const [heightMm, setHeightMm] = useState(450)
  const [belowMm, setBelowMm]   = useState(350)
  const [build, setBuild]       = useState<ParapetBuildType>('cavity-brick-block')
  const [coping, setCoping]     = useState<CopingType>('concrete')
  const [outlets, setOutlets]   = useState(0)
  const [wastePct, setWastePct] = useState(10)
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const input: ParapetWallInput = { lengthMm, heightAboveRoofMm: heightMm, belowRoofMm: belowMm, build, outletOpenings: outlets }
  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateParapetWallGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, belowMm, build, outlets])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildParapetLayers(build, coping, g.copingWidthMm, wastePct).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, build, coping, wastePct, rateOverrides])

  const result = useMemo(() => {
    if (!geometryResult.ok) return { ok: false as const, error: geometryResult.error }
    try { return { ok: true as const, value: calculateParapetWallCost(input, layers) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryResult, layers])

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour — suggested from the wall, following it until edited
  const labourSuggestions: LabourSuggestion[] = g ? suggestParapetLabour({
    lm: g.lengthM, masonryAreaM2: g.masonryAreaM2, build, renderAreaM2: g.renderAreaM2, outletOpenings: g.outletOpenings,
  }) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useState<LabourLine[] | null>(null)
  const suggestedRef = React.useRef<LabourLine[]>([])
  suggestedRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines
  const addLabour = () => setLabourOverride(prev => { const b = prev ?? suggestedRef.current; return [...b, { id: newLabourLineId(), tradeId: b[0]?.tradeId ?? '', task: '', hours: 0 }] })
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourOverride(prev => (prev ?? suggestedRef.current).map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourOverride(prev => (prev ?? suggestedRef.current).filter(l => l.id !== id))

  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const materialLines = [...(result.ok ? result.value.lines : []), ...miscCostedLines]
  const enabledMaterialLines = materialLines.filter(l => !disabledLayerIds.has(l.layerId))
  const labourCostedLines: CostedLine[] = labourLines
    .map(l => {
      const trade = labourTrades.find(t => t.id === l.tradeId)
      if (!trade || l.hours <= 0) return null
      const rate = hourlyRate(trade)
      return { layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour', source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr', unitCost: rate, cost: +(l.hours * rate).toFixed(2) } as CostedLine
    })
    .filter((l): l is CostedLine => l !== null)
  const costSubtotal = enabledMaterialLines.reduce((s, l) => s + l.cost, 0) + labourCostedLines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(costSubtotal * profitPct / 100).toFixed(2)
  const profitLine: CostedLine | null = profitPct > 0 ? { layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed', wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount } : null
  const totalCost = costSubtotal + profitAmount

  // The customer's description follows the wall until it's edited by hand
  const descInput = g ? { lengthM: g.lengthM, heightAboveRoofMm: heightMm, build, coping, outletOpenings: g.outletOpenings } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describeParapetWallShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeParapetWall(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the wall</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the wall — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the wall</button>

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
        {result.ok && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {result.ok && <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />}
        {onSave && result.ok && (
          <button onClick={() => onSave({ name, qty, location, description, detail, lines: [...enabledMaterialLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
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
        <textarea value={detail} onChange={e => setDetailOverride(e.target.value)} rows={6} style={box} />
      </div>

      {!result.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {result.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <ParapetSectionSvg heightMm={heightMm} belowMm={belowMm} thicknessMm={g.wallThicknessMm} copingWidthMm={g.copingWidthMm} build={build} coping={coping} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.lengthM.toFixed(2)}m of wall, {g.totalHeightMm}mm high ({heightMm}mm above the roof and {belowMm}mm below it): {g.masonryAreaM2.toFixed(2)} m² of masonry, {g.wallThicknessMm}mm thick.
              {g.brickCount > 0 && <> {Math.round(g.brickCount)} bricks.</>}{g.blockCount > 0 && <> {Math.round(g.blockCount)} blocks.</>}{g.tieCount > 0 && <> {g.tieCount} wall ties.</>}
              {' '}Coping {g.copingLm.toFixed(1)}m, {g.copingWidthMm}mm wide.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Length (mm) — from the line drawn">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Height above roof (mm)">{numInput(heightMm, setHeightMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Masonry below roof (mm)">{numInput(belowMm, setBelowMm, 0)}</PropRow></div>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: -4 }}>Below the roof is the roof's build-up above the wall head (joists, deck, insulation, covering).</div>

          <CollapsibleSection title="Build" borderColor="#bae6fd">
            <PropRow label="Built as">
              <select value={build} onChange={e => setBuild(e.target.value as ParapetBuildType)} style={propInput}>
                {(Object.entries(BUILD_LABEL) as [ParapetBuildType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Coping or capping" borderColor="#bae6fd">
            <PropRow label="Cap the wall with">
              <select value={coping} onChange={e => setCoping(e.target.value as CopingType)} style={propInput}>
                {COPING_TYPES.map(k => <option key={k} value={k}>{COPING_LABEL[k]}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
              A coping {g ? g.copingWidthMm : '—'}mm wide overhangs the wall by 40mm each side, with a drip. Each capping is priced as its own set of lines.
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Outlets through the wall" borderColor="#bae6fd">
            <PropRow label="Openings for rainwater and overflow outlets">{numInput(outlets, setOutlets, 0)}</PropRow>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>Only the openings are formed here. The outlets themselves are priced with the roof drainage.</div>
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0}
        />
        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {result.ok && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={materialLines} onRateChange={handleRate} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
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

// ── A section through the wall: the roof, the masonry above and below it, the tray and the coping ──
function ParapetSectionSvg({ heightMm, belowMm, thicknessMm, copingWidthMm, build, coping }: {
  heightMm: number; belowMm: number; thicknessMm: number; copingWidthMm: number; build: ParapetBuildType; coping: CopingType
}) {
  const vbW = 430, vbH = 300
  const totalMm = heightMm + belowMm + 250
  const k = Math.min(210 / totalMm, 1 / 1.4)   // px per mm, so the wall fits
  const ks = Math.min(200 / (heightMm + belowMm + 250), 0.4)
  const wallW = thicknessMm * ks * 1.6, top = 40
  const x = 150
  const above = heightMm * ks, below = belowMm * ks
  const roofY = top + above
  const capH = Math.max(8, 70 * ks)
  const copingW = copingWidthMm * ks * 1.6
  const fillMasonry = build === 'solid-block' ? '#d6d3d1' : '#fca5a5'
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {/* the roof to the right of the wall, and the wall head below */}
      <rect x={x + wallW} y={roofY - 10} width={200} height={10} fill="#a8a29e" />
      <text x={x + wallW + 8} y={roofY - 14} fontSize={9} fill="#57534e">Finished roof</text>
      <rect x={x + wallW} y={roofY} width={200} height={below} fill="#f5f5f4" stroke="#d6d3d1" />
      <text x={x + wallW + 8} y={roofY + below / 2 + 3} fontSize={9} fill="#78716c">Roof build-up</text>
      {/* the wall */}
      <rect x={x} y={top} width={wallW} height={above + below} fill={fillMasonry} stroke="#57534e" strokeWidth={1.2} />
      {build === 'cavity-brick-block' && <rect x={x + wallW * 0.42} y={top} width={wallW * 0.2} height={above + below} fill="#fff" />}
      {/* the DPC and tray at the roof line */}
      <line x1={x - 8} x2={x + wallW + 8} y1={roofY} y2={roofY} stroke="#0f766e" strokeWidth={2.5} />
      <text x={x - 12} y={roofY + 3} fontSize={9} fill="#0f766e" textAnchor="end">DPC and tray</text>
      {/* the coping */}
      {coping === 'brick-on-edge'
        ? <rect x={x - 2} y={top - 11} width={wallW + 4} height={11} fill="#b45309" stroke="#78350f" />
        : coping === 'lead' || coping === 'aluminium'
          ? <path d={`M${x - 6},${top + 8} L${x - 6},${top - 4} L${x + wallW + 6},${top - 4} L${x + wallW + 6},${top + 8}`} fill="none" stroke={coping === 'lead' ? '#64748b' : '#0369a1'} strokeWidth={4} />
          : <rect x={x + wallW / 2 - copingW / 2} y={top - capH} width={copingW} height={capH} fill="#a8a29e" stroke="#57534e" />}
      <text x={x + wallW / 2} y={top - capH - 8} fontSize={9} fill="#57534e" textAnchor="middle">{COPING_LABEL[coping]}</text>
      {/* dimensions */}
      <line x1={x - 60} x2={x - 60} y1={top} y2={roofY} stroke="#2563eb" /><text x={x - 66} y={(top + roofY) / 2 + 3} fontSize={10} fill="#2563eb" textAnchor="end">{heightMm}</text>
      <line x1={x - 60} x2={x - 60} y1={roofY} y2={roofY + below} stroke="#78716c" /><text x={x - 66} y={roofY + below / 2 + 3} fontSize={10} fill="#78716c" textAnchor="end">{belowMm}</text>
      <text x={x + wallW / 2} y={roofY + below + 16} fontSize={10} fill="#57534e" textAnchor="middle">{thicknessMm}mm {build === 'cavity-brick-block' ? 'cavity wall' : 'solid wall'}</text>
      <text x={x + wallW + 8} y={top + 12} fontSize={9} fill="#94a3b8">Coping {copingWidthMm}mm wide</text>
    </svg>
  )
}
