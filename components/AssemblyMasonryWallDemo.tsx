'use client'

/**
 * Assembly Calculator — Masonry Block Wall.
 *
 * Two contexts share this one component, via the `context` prop:
 *   - 'partition' (Internal Walls — Masonry Block Partitions): a single finish applied to
 *     one or both faces via the existing sides toggle, no windows by default, no DPC.
 *   - 'external-wall' (External Walls — Concrete Blockwork 100mm): two DIFFERENT faces —
 *     an outside finish (render, brick slip, painted block) and an inside finish (the same
 *     dot-and-dab/wet-plaster/battened options as a partition) — plus a DPC course, since
 *     this one actually meets the ground. There's no "both faces" toggle here: the two
 *     faces are never the same material, so each gets its own explicit choice instead.
 *
 * Blockwork coursing replaces stud spacing either way: block count comes from the net area
 * over a standard block's coordinating size, cement and sand come from a standard mortar mix
 * (see the mortar-mix comment below), and a precast lintel spans each opening instead of a
 * header. There's no stud/plate/noggin framing at all — see calculateMasonryGeometry in
 * lib/assembly-calc.ts, the module built specifically for this construction method.
 */

import React, { useMemo, useState, useRef, useEffect } from 'react'
import {
  calculateMasonryWallCost,
  type MasonryWallInput, type AssemblyOpening, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, HDim, VDim,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  OpeningsEditor, newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'

// Mortar mix assumptions — sample rates like everything else here, easy to correct:
//   - 0.013 m³ of mortar per m² of blockwork (bumped up from an initial 0.01 — too light)
//   - 1:5 cement:sand mix by volume (general-purpose blockwork mortar)
//   - cement @ 1440 kg/m³ in 25kg bags; sand @ 1600 kg/m³ sold by the tonne
// That works out to ~3.1kg (0.125 bags) of cement and ~17.3kg (0.0173 tonnes) of sand per m²,
// i.e. one bag of cement covers ~8.0m² and one tonne of sand covers ~57.7m².
const CEMENT_M2_PER_BAG = 8.0
const SAND_M2_PER_TONNE = 57.7

type BlockType = 'concrete' | 'thermal'
const BLOCK_TYPE_CONFIG: Record<BlockType, { label: string; unitCost: number }> = {
  concrete: { label: 'Dense concrete block 100mm', unitCost: 1.35 },
  thermal:  { label: 'Thermal lightweight block 100mm', unitCost: 2.10 },
}

function buildCoreLayers(wastePct: number, blockType: BlockType): AssemblyLayerDef[] {
  const block = BLOCK_TYPE_CONFIG[blockType]
  return [
    { id: 'blocks', name: block.label,                        category: 'materials', source: 'blockCount',  unit: 'nr',    unitCost: block.unitCost, roundToWhole: true, wastePct },
    { id: 'cement', name: 'Cement (mortar mix)',               category: 'materials', source: 'netAreaM2',   unit: 'bag',   unitCost: 6.50,  coveragePerUnit: CEMENT_M2_PER_BAG, roundToWhole: true, wastePct },
    { id: 'sand',   name: 'Building sand (mortar mix)',        category: 'materials', source: 'netAreaM2',   unit: 'tonne', unitCost: 32.00, coveragePerUnit: SAND_M2_PER_TONNE, wastePct },
    { id: 'lintel', name: 'Precast concrete lintel (opening)', category: 'materials', source: 'lintelCount', unit: 'nr',    unitCost: 38.00, roundToWhole: true },
  ]
}

export type MasonryContext = 'partition' | 'external-wall'

// The internal-face finish — identical whether it's the only face (a partition) or the
// inside face of an external wall.
type FinishType = 'dot-dab' | 'wet-plaster' | 'battened'
interface FinishTypeConfig { label: string; buildLayers: (wastePct: number) => AssemblyLayerDef[]; boardLayerId: string }
const FINISH_TYPE_CONFIG: Record<FinishType, FinishTypeConfig> = {
  'dot-dab': {
    label: 'Dot & dab + plasterboard',
    boardLayerId: 'lining',
    buildLayers: wastePct => [
      { id: 'adhesive', name: 'Dot & dab adhesive', category: 'materials', source: 'netAreaM2', unit: 'bag', unitCost: 9.50, coveragePerUnit: 12, roundToWhole: true, wastePct },
      { id: 'lining',   name: 'Plasterboard lining', category: 'materials', source: 'netAreaM2', unit: 'm²',  unitCost: 6.90, wastePct },
    ],
  },
  'wet-plaster': {
    label: 'Direct (wet) plaster',
    boardLayerId: 'plaster',
    buildLayers: wastePct => [
      { id: 'plaster', name: 'Two-coat plaster (render + skim)', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 9.00, wastePct },
    ],
  },
  battened: {
    label: 'Battened + plasterboard',
    boardLayerId: 'lining',
    buildLayers: wastePct => [
      { id: 'battens', name: 'Timber battens', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 4.20, wastePct },
      { id: 'lining',  name: 'Plasterboard lining', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 6.90, wastePct },
    ],
  },
}

// The outside face of an external wall — never the same material as the inside, so this is
// its own separate choice rather than a "both faces" toggle on one finish.
type ExternalFinishType = 'render' | 'brick-slip' | 'painted-block'
interface ExternalFinishTypeConfig { label: string; buildLayers: (wastePct: number) => AssemblyLayerDef[] }
const EXTERNAL_FINISH_CONFIG: Record<ExternalFinishType, ExternalFinishTypeConfig> = {
  render: {
    label: 'Two-coat render',
    buildLayers: wastePct => [
      { id: 'render_ext', name: 'External render (2-coat)', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 11.00, wastePct },
    ],
  },
  'brick-slip': {
    label: 'Brick slip cladding',
    buildLayers: wastePct => [
      { id: 'brick_slip', name: 'Brick slip cladding + adhesive', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 45.00, wastePct },
    ],
  },
  'painted-block': {
    label: 'Fair-faced block, painted',
    buildLayers: wastePct => [
      { id: 'masonry_paint', name: 'Masonry paint (2 coats)', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 3.50, wastePct },
    ],
  },
}

// One course of DPC along the base — only relevant where the wall actually meets the
// ground, i.e. an external wall. Priced per linear metre, not by area.
function buildDpcLayer(wastePct: number): AssemblyLayerDef {
  return { id: 'dpc', name: 'DPC (damp-proof course)', category: 'materials', source: 'lengthM', unit: 'm', unitCost: 1.80, wastePct }
}

function sampleOpenings(context: MasonryContext): AssemblyOpening[] {
  if (context === 'external-wall') {
    // External walls have windows too — a partition normally doesn't.
    return [{ id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 2000, sillHeightMm: 900 }]
  }
  return [{ id: newOpeningId(), kind: 'door', widthMm: 826, heightMm: 2040, offsetMm: 2000, sillHeightMm: 0 }]
}

interface Props {
  /** Defaults to 'partition' for callers that predate this option (Internal Walls). */
  context?: MasonryContext
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

export default function AssemblyMasonryWallDemo({ context = 'partition', onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const isExternal = context === 'external-wall'
  const [name, setName]         = useState(isExternal ? '100mm Blockwork External Wall' : 'Masonry Block Partition')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useState(2400)
  const [blockType, setBlockType] = useState<BlockType>('concrete')
  // For a partition, this is the wall's only finish. For an external wall, it's the inside
  // face specifically — the outside face is externalFinish below.
  const [finishType, setFinishType] = useState<FinishType>('dot-dab')
  const [externalFinish, setExternalFinish] = useState<ExternalFinishType>('render')
  const [wastePct, setWastePct] = useState(10)
  const [openings, setOpenings] = useState<AssemblyOpening[]>(() => sampleOpenings(context))
  const [location, setLocation] = useState('')
  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Build blockwork partition', hours: 6 },
  ])
  function addLabourLine() {
    setLabourLines(prev => [...prev, { id: newLabourLineId(), tradeId: prev[0]?.tradeId ?? '', task: '', hours: 0 }])
  }
  function updateLabourLine(id: string, patch: Partial<LabourLine>) {
    setLabourLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }
  function removeLabourLine(id: string) {
    setLabourLines(prev => prev.filter(l => l.id !== id))
  }

  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMiscMaterialLine() {
    setMiscMaterialLines(prev => [...prev, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }])
  }
  function updateMiscMaterialLine(id: string, patch: Partial<MiscMaterialLine>) {
    setMiscMaterialLines(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  }
  function removeMiscMaterialLine(id: string) {
    setMiscMaterialLines(prev => prev.filter(m => m.id !== id))
  }

  const [profitPct, setProfitPct] = useState(0)
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})

  // A partition's single finish can go on one or both faces — that toggle makes no sense
  // for an external wall, where the two faces are always different materials by definition.
  const [layerSides, setLayerSides] = useState<Record<string, 1 | 2>>({})
  function setSides(layerId: string, sides: 1 | 2) {
    setLayerSides(prev => ({ ...prev, [layerId]: sides }))
  }
  const sidesEligibleLayerIds = useMemo(
    () => isExternal ? new Set<string>() : new Set([FINISH_TYPE_CONFIG[finishType].boardLayerId]),
    [isExternal, finishType]
  )

  function buildAutoDescription(): string {
    const parts = isExternal
      ? [
          `${(lengthMm / 1000).toFixed(2)}m long × ${(heightMm / 1000).toFixed(2)}m high external blockwork wall`,
          BLOCK_TYPE_CONFIG[blockType].label.toLowerCase(),
          `${EXTERNAL_FINISH_CONFIG[externalFinish].label.toLowerCase()} outside`,
          `${FINISH_TYPE_CONFIG[finishType].label.toLowerCase()} inside`,
        ]
      : [
          `${(lengthMm / 1000).toFixed(2)}m long × ${(heightMm / 1000).toFixed(2)}m high masonry block partition`,
          BLOCK_TYPE_CONFIG[blockType].label.toLowerCase(),
          `finished with ${FINISH_TYPE_CONFIG[finishType].label.toLowerCase()}`,
        ]
    if (!isExternal && (layerSides[FINISH_TYPE_CONFIG[finishType].boardLayerId] ?? 1) === 2) parts.push('both faces')
    let text = parts.join(', ') + '.'
    if (openings.length) {
      const list = openings.map(o => `${o.kind} (${o.widthMm}×${o.heightMm}mm)`).join(', ')
      text += ` Includes ${openings.length} opening${openings.length !== 1 ? 's' : ''}: ${list}.`
    }
    return text
  }
  const [description, setDescription] = useState(buildAutoDescription)

  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(layerId: string) {
    setDisabledLayerIds(prev => {
      const next = new Set(prev)
      next.has(layerId) ? next.delete(layerId) : next.add(layerId)
      return next
    })
  }

  const input: MasonryWallInput = { lengthMm, heightMm, openings }
  const layers = useMemo(() => {
    const base = [
      ...buildCoreLayers(wastePct, blockType),
      ...FINISH_TYPE_CONFIG[finishType].buildLayers(wastePct),
      ...(isExternal ? EXTERNAL_FINISH_CONFIG[externalFinish].buildLayers(wastePct) : []),
      ...(isExternal ? [buildDpcLayer(wastePct)] : []),
    ]
    return base.map(l => {
      let next = l
      if (rateOverrides[l.id] != null) next = { ...next, unitCost: rateOverrides[l.id] }
      if (sidesEligibleLayerIds.has(l.id)) next = { ...next, sidesMultiplier: layerSides[l.id] ?? 1 }
      return next
    })
  }, [wastePct, blockType, finishType, isExternal, externalFinish, rateOverrides, layerSides, sidesEligibleLayerIds])
  function setRate(layerId: string, unitCost: number) {
    setRateOverrides(prev => ({ ...prev, [layerId]: Math.max(0, unitCost) }))
  }
  function handleBreakdownRateChange(layerId: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === layerId)) {
      updateMiscMaterialLine(layerId, { unitCost: Math.max(0, unitCost) })
    } else {
      setRate(layerId, unitCost)
    }
  }

  const result = useMemo(() => {
    try { return { ok: true as const, value: calculateMasonryWallCost(input, layers) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [lengthMm, heightMm, JSON.stringify(openings), layers])

  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({
      layerId: m.id, name: m.name, category: 'materials', source: 'fixed',
      wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item',
      unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2),
    }))
  const materialLines = [...(result.ok ? result.value.lines : []), ...miscCostedLines]
  const enabledMaterialLines = materialLines.filter(l => !disabledLayerIds.has(l.layerId))

  const labourCostedLines: CostedLine[] = labourLines
    .map(l => {
      const trade = labourTrades.find(t => t.id === l.tradeId)
      if (!trade || l.hours <= 0) return null
      const rate = hourlyRate(trade)
      const line: CostedLine = {
        layerId: l.id, name: `${trade.name} — ${l.task || 'Labour'}`, category: 'labour',
        source: 'fixed', wastePct: 0, rawQty: l.hours, purchaseQty: l.hours, unit: 'hr',
        unitCost: rate, cost: +(l.hours * rate).toFixed(2),
      }
      return line
    })
    .filter((l): l is CostedLine => l !== null)

  const costSubtotal = enabledMaterialLines.reduce((s, l) => s + l.cost, 0) + labourCostedLines.reduce((s, l) => s + l.cost, 0)
  const profitAmount = +(costSubtotal * profitPct / 100).toFixed(2)
  const profitLine: CostedLine | null = profitPct > 0 ? {
    layerId: 'profit', name: `Profit (${profitPct}%)`, category: 'other', source: 'fixed',
    wastePct: 0, rawQty: 1, purchaseQty: 1, unit: 'item', unitCost: profitAmount, cost: profitAmount,
  } : null
  const totalCost = costSubtotal + profitAmount

  function updateOpening(id: string, patch: Partial<AssemblyOpening>) {
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  function removeOpening(id: string) {
    setOpenings(prev => prev.filter(o => o.id !== id))
  }
  function addOpening() {
    setOpenings(prev => [...prev, isExternal
      ? { id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 0, sillHeightMm: 900 }
      : { id: newOpeningId(), kind: 'door', widthMm: 826, heightMm: 2040, offsetMm: 0, sillHeightMm: 0 }])
  }

  return (
    <div style={{ border: '2px dashed #b45309', borderRadius: 10, background: '#fffbeb', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#b45309', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #fde68a', borderRadius: 5, color: '#b45309', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
            Close preview
          </button>
        )}
      </div>

      {/* Card header — mirrors a real sp-card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1, border: 'none', outline: 'none', background: 'transparent' }} />
        <input value={location} onChange={e => setLocation(e.target.value)}
          placeholder="Room / location"
          title="Which room or location this is — becomes the quote's room grouping when saved"
          style={{ fontSize: 12, color: '#b45309', width: 140, padding: '4px 8px', border: '1px solid #fde68a', borderRadius: 5, background: '#fffbeb' }} />
        <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))}
          style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        {result.ok && (
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>
            {fmt(totalCost * qty)}
          </span>
        )}
        {result.ok && (
          <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />
        )}
        {onSave && result.ok && (
          <button
            onClick={() => onSave({ name, qty, location, description, lines: [...enabledMaterialLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>
            💾 Save &amp; Price
          </button>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Description (for the quote)</label>
          <button onClick={() => setDescription(buildAutoDescription())}
            title="Regenerate from the current sizing and openings — overwrites any edits below"
            style={{ fontSize: 10, color: '#b45309', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ↻ Regenerate
          </button>
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
          style={{ width: '100%', fontSize: 12, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {!result.ok ? (
        <div style={{ color: '#c0392b', fontSize: 12, padding: 8 }}>⚠ {result.error}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            <MasonryElevationSvg input={input} onOpeningOffsetChange={(id, offsetMm) => updateOpening(id, { offsetMm })} />
            {result.value.geometry.warnings.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {result.value.geometry.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginBottom: 3 }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high,
              {' '}{openings.length} opening{openings.length !== 1 ? 's' : ''}.
              Net area {result.value.geometry.netAreaM2.toFixed(2)} m², {Math.ceil(result.value.geometry.blockCount)} blocks.
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PropRow label="Length (mm)">
              <input type="number" value={lengthMm} onChange={e => setLengthMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Height (mm)">
              <input type="number" value={heightMm} onChange={e => setHeightMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Block type">
              <select value={blockType} onChange={e => setBlockType(e.target.value as BlockType)} style={propInput}>
                <option value="concrete">Dense concrete block</option>
                <option value="thermal">Thermal lightweight block</option>
              </select>
            </PropRow>
            {isExternal && (
              <PropRow label="External Finish">
                <select value={externalFinish} onChange={e => setExternalFinish(e.target.value as ExternalFinishType)} style={propInput}>
                  {(Object.entries(EXTERNAL_FINISH_CONFIG) as [ExternalFinishType, ExternalFinishTypeConfig][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </PropRow>
            )}
            <PropRow label={isExternal ? 'Internal Finish' : 'Finish'}>
              <select value={finishType} onChange={e => setFinishType(e.target.value as FinishType)} style={propInput}>
                {(Object.entries(FINISH_TYPE_CONFIG) as [FinishType, FinishTypeConfig][]).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </PropRow>
            <PropRow label={`Waste % (${wastePct}%)`}>
              <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>
            <PropRow label={`Profit % (${profitPct}%)`}>
              <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>

            <OpeningsEditor openings={openings} onAdd={addOpening} onUpdate={updateOpening} onRemove={removeOpening} />
          </div>

          <LabourSection labourLines={labourLines} labourTrades={labourTrades}
            onAdd={addLabourLine} onUpdate={updateLabourLine} onRemove={removeLabourLine} />

          <MiscMaterialsSection miscMaterialLines={miscMaterialLines}
            onAdd={addMiscMaterialLine} onUpdate={updateMiscMaterialLine} onRemove={removeMiscMaterialLine} />

          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={materialLines} onRateChange={handleBreakdownRateChange} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
              layerSides={layerSides} onSidesChange={setSides} sidesEligibleLayerIds={sidesEligibleLayerIds} />
            {profitPct > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>
                Cost: £{costSubtotal.toFixed(2)} + {profitPct}% profit (£{profitAmount.toFixed(2)}) ={' '}
                <strong style={{ color: '#7ab533' }}>£{totalCost.toFixed(2)}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Elevation SVG — a running-bond block grid instead of studs. The opening void gets a
// lintel line (not a header — no jamb framing, masonry just closes up to the opening with
// cut blocks) and the same drag-to-reposition handle as the framed-wall calculators.
function MasonryElevationSvg({ input, onOpeningOffsetChange }: {
  input: MasonryWallInput
  onOpeningOffsetChange: (id: string, offsetMm: number) => void
}) {
  const { lengthMm: L, heightMm: H, openings } = input
  const blockLengthMm = input.blockLengthMm ?? 450
  const blockHeightMm = input.blockHeightMm ?? 225
  const vbW = 640, vbH = 320, padX = 28, padTop = 20 + openings.length * 14, padBottom = 34
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const availW = vbW - padX * 2, availH = vbH - padTop - padBottom
  const scale = Math.min(availW / L, availH / H)
  const w = L * scale, h = H * scale
  const x0 = padX + (availW - w) / 2, y0 = padTop + (availH - h) / 2
  const X = (mmVal: number) => x0 + mmVal * scale
  const Y = (mmVal: number) => y0 + h - mmVal * scale

  const sortedOpenings = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)

  // Running-bond course lines — horizontal at every course, vertical joints staggered by
  // half a block on alternate courses. Visual only, same as the stud grid elsewhere: none
  // of this feeds the block/mortar counts in the breakdown.
  const courseCount = Math.max(1, Math.round(H / blockHeightMm))
  const courses: { y: number; joints: number[] }[] = []
  for (let c = 0; c < courseCount; c++) {
    const courseTopMm = c * blockHeightMm
    const offsetHalf = c % 2 === 1 ? blockLengthMm / 2 : 0
    const joints: number[] = []
    for (let x = offsetHalf; x < L; x += blockLengthMm) if (x > 0) joints.push(x)
    courses.push({ y: Y(courseTopMm), joints })
  }

  function offsetFromClientX(clientX: number, widthMm: number): number {
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return 0
    const pt = svg.createSVGPoint()
    pt.x = clientX
    const svgX = pt.matrixTransform(ctm.inverse()).x
    const mm = (svgX - x0) / scale
    return Math.max(0, Math.min(L - widthMm, Math.round(mm / 10) * 10))
  }
  function handlePointerDown(e: React.PointerEvent, id: string) {
    (e.target as Element).setPointerCapture(e.pointerId)
    setDragId(id)
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragId || !svgRef.current) return
    const o = openings.find(op => op.id === dragId)
    if (!o) return
    onOpeningOffsetChange(dragId, offsetFromClientX(e.clientX, o.widthMm))
  }
  function endDrag() { setDragId(null) }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${vbW} ${vbH}`}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      style={{ width: '100%', height: 280, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, touchAction: 'none' }}
    >
      <rect x={x0} y={y0} width={w} height={h} fill="#fffbeb" stroke="#334155" strokeWidth={1.5} />

      {/* Block coursing — running bond */}
      {courses.map((course, i) => (
        <React.Fragment key={i}>
          {i > 0 && <line x1={x0} y1={course.y} x2={x0 + w} y2={course.y} stroke="#d6a86a" strokeWidth={1} />}
          {course.joints.map(jx => {
            const jY1 = course.y, jY2 = course.y - (h / courseCount)
            return <line key={jx} x1={X(jx)} y1={jY1} x2={X(jx)} y2={jY2} stroke="#d6a86a" strokeWidth={1} />
          })}
        </React.Fragment>
      ))}

      {sortedOpenings.map((o, i) => {
        const dimY = y0 - 10 - i * 14
        return (
          <React.Fragment key={`dim-${o.id}`}>
            <HDim x1={x0} x2={X(o.offsetMm)} y={dimY} label={`${o.offsetMm}`} />
            <HDim x1={X(o.offsetMm)} x2={X(o.offsetMm + o.widthMm)} y={dimY} label={`${o.widthMm}`} />
          </React.Fragment>
        )
      })}

      {openings.map(o => {
        const ox = X(o.offsetMm), ow = o.widthMm * scale
        const oyTop = Y(o.sillHeightMm + o.heightMm), oh = o.heightMm * scale
        const rightEdge = X(o.offsetMm + o.widthMm)
        const dragging = dragId === o.id
        return (
          <g key={o.id}>
            <rect
              x={ox} y={oyTop} width={ow} height={oh}
              fill={o.kind === 'door' ? '#fef3c7' : '#dbeafe'}
              stroke={dragging ? '#b45309' : '#4a90a4'} strokeWidth={dragging ? 2.5 : 1.5}
              cursor="grab"
              onPointerDown={e => handlePointerDown(e, o.id)}
            />
            {/* Lintel — spans the opening, no jamb framing either side (masonry closes up
                to the void with cut blocks, not a doubled stud). */}
            <line x1={ox} y1={oyTop} x2={ox + ow} y2={oyTop} stroke="#c0392b" strokeWidth={3} />
            <text x={ox + ow / 2} y={oyTop + oh / 2 - 5} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#1d4ed8" pointerEvents="none">
              {o.kind === 'door' ? '🚪' : '🪟'} {o.widthMm}×{o.heightMm}
            </text>
            <text x={ox + ow / 2} y={oyTop + oh / 2 + 8} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#94a3b8" pointerEvents="none">
              ⋮⋮ drag to move
            </text>

            {o.sillHeightMm > 0 && <VDim y1={y0 + h} y2={oyTop + oh} x={rightEdge + 6} label={`${o.sillHeightMm}`} />}
            <VDim y1={oyTop + oh} y2={oyTop} x={rightEdge + 6} label={`${o.heightMm}`} />
          </g>
        )
      })}

      <HDim x1={x0} x2={x0 + w} y={y0 + h + 18} label={`${(L / 1000).toFixed(2)}m`} />
      <VDim y1={y0} y2={y0 + h} x={x0 - 16} label={`${(H / 1000).toFixed(2)}m`} />

      <g transform={`translate(${x0}, ${vbH - 10})`}>
        <line x1={0} y1={0} x2={14} y2={0} stroke="#c0392b" strokeWidth={3} />
        <text x={18} y={3} fontSize={8} fill="#64748b">Lintel (opening)</text>
      </g>
    </svg>
  )
}
