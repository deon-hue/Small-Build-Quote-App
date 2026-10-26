'use client'

/**
 * Assembly Calculator — External Solid Brick Wall (the old-fashioned wall of a Victorian house, no cavity).
 *
 * One, one and a half or two bricks thick (the usual Victorian wall is one and a half bricks, about 330mm or 13 inch),
 * facing bricks outside with common bricks behind (or facing bricks all through), laid in lime or cement mortar, with
 * a lintel over each opening, a DPC the width of the wall, movement joints, and an outside and an inside finish if wanted.
 *
 * Counts and prices what's drawn — it doesn't design the wall (stability, lintel sizes) and it does not insulate it: a new
 * solid brick wall needs insulation to meet Part L, priced with Wall Insulation & Backing. See lib/solid-brick-wall.ts.
 */

import React, { useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import type { AssemblyOpening, CostedLine, AssemblyLayerDef } from '@/lib/assembly-calc'
import {
  BRICK_THICKNESS, BRICK_BOND_LABEL, FACING_BRICK, BRICK_MORTAR_LABEL, BRICK_LINTEL_LABEL, BRICKS_PER_BRICKLAYER_HOUR,
  calculateSolidBrickGeometry, buildSolidBrickLayers, costSolidBrickLayers, suggestSolidBrickHours,
  type BrickThickness, type BrickBond, type FacingBrick, type BrickMortar, type BrickLintel,
} from '@/lib/solid-brick-wall'
import { describeSolidBrickShort, describeSolidBrick } from '@/lib/solid-brick-description'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  OpeningsEditor, newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'
import {
  FINISH_TYPE_CONFIG, EXTERNAL_FINISH_CONFIG, MasonryElevationSvg,
  type FinishType, type FinishTypeConfig, type ExternalFinishType, type ExternalFinishTypeConfig,
} from '@/components/AssemblyMasonryWallDemo'

type ExtFinish = ExternalFinishType | 'none'
type IntFinish = FinishType | 'none'
const NS = 'AssemblySolidBrickWallDemo'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

export default function AssemblySolidBrickWallDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName] = useCalcState(NS, 'name', 'Solid Brick Wall (Victorian)')
  const [qty, setQty] = useCalcState(NS, 'qty', 1)
  const [lengthMm, setLengthMm] = useCalcState(NS, 'lengthMm', externalLengthMm ?? 5000)
  React.useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useCalcState(NS, 'heightMm', 2700)
  const [thickness, setThickness] = useCalcState<BrickThickness>(NS, 'thickness', 'one-half')
  const [bond, setBond] = useCalcState<BrickBond>(NS, 'bond', 'english')
  const [facing, setFacing] = useCalcState<FacingBrick>(NS, 'facing', 'stock-new')
  const [backing, setBacking] = useCalcState<'commons' | 'all-facing'>(NS, 'backing', 'commons')
  const [mortar, setMortar] = useCalcState<BrickMortar>(NS, 'mortar', 'lime')
  const [lintel, setLintel] = useCalcState<BrickLintel>(NS, 'lintel', 'concrete')
  const [externalFinish, setExternalFinish] = useCalcState<ExtFinish>(NS, 'externalFinish', 'none')
  const [internalFinish, setInternalFinish] = useCalcState<IntFinish>(NS, 'internalFinish', 'none')
  const [movementJointSpacingMm, setMovementJointSpacingMm] = useCalcState(NS, 'movementJointSpacingMm', 0)
  const [wastePct, setWastePct] = useCalcState(NS, 'wastePct', 10)
  const [openings, setOpenings] = useCalcState<AssemblyOpening[]>(NS, 'openings', [])
  const [location, setLocation] = useCalcState(NS, 'location', '')

  const [labourLines, setLabourLines] = useCalcState<LabourLine[]>(NS, 'labourLines', [
    { id: newLabourLineId(), tradeId: '', task: 'Build solid brickwork', hours: 40 },
  ])
  const addLabourLine = () => setLabourLines(prev => [...prev, { id: newLabourLineId(), tradeId: prev[0]?.tradeId ?? '', task: '', hours: 0 }])
  const updateLabourLine = (id: string, patch: Partial<LabourLine>) => setLabourLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabourLine = (id: string) => setLabourLines(prev => prev.filter(l => l.id !== id))

  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(NS, 'miscMaterialLines', [])
  const addMiscMaterialLine = () => setMiscMaterialLines(prev => [...prev, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }])
  const updateMiscMaterialLine = (id: string, patch: Partial<MiscMaterialLine>) => setMiscMaterialLines(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
  const removeMiscMaterialLine = (id: string) => setMiscMaterialLines(prev => prev.filter(m => m.id !== id))

  const [profitPct, setProfitPct] = useCalcState(NS, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(NS, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(NS, 'disabledLayerIds', new Set())
  const toggleLayer = (layerId: string) => setDisabledLayerIds(prev => {
    const next = new Set(prev)
    next.has(layerId) ? next.delete(layerId) : next.add(layerId)
    return next
  })
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const openingsKey = JSON.stringify(openings)
  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateSolidBrickGeometry({ lengthMm, heightMm, thickness, backing, openings, movementJointSpacingMm }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, thickness, backing, openingsKey, movementJointSpacingMm])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo((): AssemblyLayerDef[] => {
    if (!geometryResult.ok) return []
    const gg = geometryResult.geometry
    const base = buildSolidBrickLayers(gg, { wastePct, facing, mortar, lintel, thickness })
    // the finishes put over the brick are priced over the wall's net face
    if (externalFinish !== 'none') base.push(...EXTERNAL_FINISH_CONFIG[externalFinish].buildLayers(wastePct).map(l => ({ ...l, source: 'fixed' as const, fixedQty: gg.netAreaM2 })))
    if (internalFinish !== 'none') base.push(...FINISH_TYPE_CONFIG[internalFinish].buildLayers(wastePct).map(l => ({ ...l, source: 'fixed' as const, fixedQty: gg.netAreaM2 })))
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, facing, mortar, lintel, thickness, externalFinish, internalFinish, rateOverrides])

  const handleBreakdownRateChange = (layerId: string, unitCost: number) => {
    if (miscMaterialLines.some(m => m.id === layerId)) updateMiscMaterialLine(layerId, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(prev => ({ ...prev, [layerId]: Math.max(0, unitCost) }))
  }

  const materialLinesCosted = useMemo(() => costSolidBrickLayers(layers).lines, [layers])
  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({
      layerId: m.id, name: m.name, category: 'materials', source: 'fixed',
      wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item',
      unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2),
    }))
  const materialLines = [...materialLinesCosted, ...miscCostedLines]
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

  // Hours to start the labour from: a guide worked out from the number of bricks, typed over in the lines.
  const suggested = g ? suggestSolidBrickHours(g) : null
  function applySuggestedHours() {
    if (!suggested) return
    const brickie = labourTrades.find(t => /bricklayer|brick layer|brickie/i.test(t.name))
    const labourer = labourTrades.find(t => /labourer|laborer/i.test(t.name))
    setLabourLines([
      { id: newLabourLineId(), tradeId: brickie?.id ?? labourLines[0]?.tradeId ?? '', task: 'Build solid brickwork', hours: suggested.bricklayer },
      { id: newLabourLineId(), tradeId: labourer?.id ?? '', task: 'Labourer serving the bricklayer', hours: suggested.labourer },
    ])
  }

  // The customer's description follows the settings until it is edited by hand
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(NS, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(NS, 'detailOverride', null)
  const descInput = {
    lengthMm, heightMm, thickness, bond, facing, backing, mortar, lintel,
    openingCount: openings.length,
    outsideFinish: externalFinish === 'none' ? 'none' : EXTERNAL_FINISH_CONFIG[externalFinish].label.toLowerCase(),
    insideFinish: internalFinish === 'none' ? 'none' : FINISH_TYPE_CONFIG[internalFinish].label.toLowerCase(),
    movementJointSpacingMm,
  }
  const description = descriptionOverride ?? describeSolidBrickShort(descInput)
  const detail = detailOverride ?? describeSolidBrick(descInput)

  const updateOpening = (id: string, patch: Partial<AssemblyOpening>) => setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  const removeOpening = (id: string) => setOpenings(prev => prev.filter(o => o.id !== id))
  const addOpening = () => setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1500, offsetMm: 0, sillHeightMm: 800 }])

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <NumInput type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the wall</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the wall — overwrites your edits below`} style={{ fontSize: 10, color: '#b45309', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>

  const result = geometryResult.ok

  return (
    <div style={{ border: '2px dashed #b45309', borderRadius: 10, background: '#fffbeb', padding: 14, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#b45309', color: '#fff' }}>🧪 PREVIEW</span>
        <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>Assembly Calculator — sample data and sample rates, nothing here is saved yet</span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: '1px solid #fde68a', borderRadius: 5, color: '#b45309', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>Close preview</button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)} style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1, border: 'none', outline: 'none', background: 'transparent' }} />
        <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room / location"
          title="Which room or location this is — becomes the quote's room grouping when saved"
          style={{ fontSize: 12, color: '#b45309', width: 140, padding: '4px 8px', border: '1px solid #fde68a', borderRadius: 5, background: '#fffbeb' }} />
        <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
        <NumInput type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))} style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        {result && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {result && <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />}
        {onSave && result && (
          <button
            onClick={() => onSave({ name, qty, location, description, detail, lines: [...enabledMaterialLines, ...labourCostedLines, ...(profitLine ? [profitLine] : [])] })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>
            💾 Save &amp; Price
          </button>
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

      {!geometryResult.ok || !g ? (
        <div style={{ color: '#c0392b', fontSize: 12, padding: 8 }}>⚠ {geometryResult.ok ? 'Could not calculate' : geometryResult.error}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div>
          {g && (
            <>
              <MasonryElevationSvg
                input={{ lengthMm, heightMm, openings, blockLengthMm: 225, blockHeightMm: 75 }}
                onOpeningOffsetChange={(id, offsetMm) => updateOpening(id, { offsetMm })}
              />
              <BrickSectionSvg thicknessMm={g.thicknessMm} skins={g.skins} backing={backing} bond={bond} />
              {g.warnings.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {g.warnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginBottom: 3 }}>⚠ {w}</div>
                  ))}
                </div>
              )}
              {g.notes.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  {g.notes.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 3 }}>ℹ {w}</div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high, {g.thicknessMm}mm thick ({g.courseCount} courses),
                {' '}{openings.length} opening{openings.length !== 1 ? 's' : ''}. Net area {g.netAreaM2.toFixed(2)} m² ·
                {' '}{Math.ceil(g.facingBricks)} facing{g.commonBricks > 0 ? ` + ${Math.ceil(g.commonBricks)} common` : ''} bricks
                {' '}= {Math.ceil(g.brickCount)} ({g.bricksPerM2.toFixed(0)} per m²) · mortar {g.mortarM3.toFixed(2)} m³.
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
          <PropRow label="Height (mm)">{numInput(heightMm, setHeightMm, 1)}</PropRow>
          <PropRow label="How thick the wall is">
            <select value={thickness} onChange={e => setThickness(e.target.value as BrickThickness)} style={propInput}>
              {(Object.entries(BRICK_THICKNESS) as [BrickThickness, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </PropRow>
          <PropRow label="Outer face brick">
            <select value={facing} onChange={e => setFacing(e.target.value as FacingBrick)} style={propInput}>
              {(Object.entries(FACING_BRICK) as [FacingBrick, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </PropRow>
          <PropRow label="Behind the face brick">
            <select value={backing} onChange={e => setBacking(e.target.value as 'commons' | 'all-facing')} style={propInput}>
              <option value="commons">Common bricks (the usual way)</option>
              <option value="all-facing">Facing bricks all through</option>
            </select>
          </PropRow>
          <PropRow label="Mortar">
            <select value={mortar} onChange={e => setMortar(e.target.value as BrickMortar)} style={propInput}>
              {(Object.entries(BRICK_MORTAR_LABEL) as [BrickMortar, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>
          <PropRow label="Bond (for the wording: the same bricks per m²)">
            <select value={bond} onChange={e => setBond(e.target.value as BrickBond)} style={propInput}>
              {(Object.entries(BRICK_BOND_LABEL) as [BrickBond, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>
          <PropRow label="Over each opening">
            <select value={lintel} onChange={e => setLintel(e.target.value as BrickLintel)} style={propInput}>
              {(Object.entries(BRICK_LINTEL_LABEL) as [BrickLintel, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>
          <PropRow label="Outside finish">
            <select value={externalFinish} onChange={e => setExternalFinish(e.target.value as ExtFinish)} style={propInput}>
              <option value="none">None (the brick is the finish)</option>
              {(Object.entries(EXTERNAL_FINISH_CONFIG) as [ExternalFinishType, ExternalFinishTypeConfig][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </PropRow>
          <PropRow label="Inside finish">
            <select value={internalFinish} onChange={e => setInternalFinish(e.target.value as IntFinish)} style={propInput}>
              <option value="none">None</option>
              {(Object.entries(FINISH_TYPE_CONFIG) as [FinishType, FinishTypeConfig][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </PropRow>

          <CollapsibleSection title="Movement joints and waste" borderColor="#fde68a">
            <PropRow label="Movement joint every (mm, 0 = none)">{numInput(movementJointSpacingMm, setMovementJointSpacingMm)}</PropRow>
            <div style={{ marginTop: 6 }}>
              <PropRow label={`Waste % on bricks (${wastePct}%)`}>
                <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
              </PropRow>
            </div>
          </CollapsibleSection>
          <PropRow label={`Profit % (${profitPct}%)`}>
            <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>

          <OpeningsEditor openings={openings} onAdd={addOpening} onUpdate={updateOpening} onRemove={removeOpening} />
        </div>

        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {suggested && (
            <>
              <span>A guide for the labour: about {suggested.bricklayer} bricklayer hours and {suggested.labourer} labourer hours (a bricklayer lays about {BRICKS_PER_BRICKLAYER_HOUR} bricks an hour in a solid wall).</span>
              <button onClick={applySuggestedHours} style={{ fontSize: 11, color: '#b45309', background: '#fff', border: '1px solid #fde68a', borderRadius: 5, cursor: 'pointer', padding: '2px 8px' }}>Use these hours</button>
            </>
          )}
        </div>

        <LabourSection labourLines={labourLines} labourTrades={labourTrades}
          onAdd={addLabourLine} onUpdate={updateLabourLine} onRemove={removeLabourLine} />

        <MiscMaterialsSection miscMaterialLines={miscMaterialLines}
          onAdd={addMiscMaterialLine} onUpdate={updateMiscMaterialLine} onRemove={removeMiscMaterialLine} />

        {result && (
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={materialLines} onRateChange={handleBreakdownRateChange} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
              layerSides={{}} onSidesChange={() => {}} sidesEligibleLayerIds={noSidesLayers} />
            {profitPct > 0 && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, textAlign: 'right' }}>
                Cost: £{costSubtotal.toFixed(2)} + {profitPct}% profit (£{profitAmount.toFixed(2)}) ={' '}
                <strong style={{ color: '#7ab533' }}>£{totalCost.toFixed(2)}</strong>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section — the wall seen from above, to show how many bricks thick it is: the outer skin is the facing brick, the skins behind are commons (or more facing). Visual only: none of it feeds the quantities.
function BrickSectionSvg({ thicknessMm, skins, backing, bond }: { thicknessMm: number; skins: number; backing: 'commons' | 'all-facing'; bond: BrickBond }) {
  const vbW = 640, vbH = 110
  const k = Math.min(1.1, 520 / thicknessMm)
  const w = thicknessMm * k, x0 = (vbW - w) / 2, y0 = 34, h = 30
  const skinW = w / skins
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 96, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={x0} y={14} fontSize={9} fill="#94a3b8">Inside</text>
        <text x={x0} y={vbH - 8} fontSize={9} fill="#94a3b8">Outside{bond === 'unstated' ? '' : ' — ' + BRICK_BOND_LABEL[bond].toLowerCase()}, seen from above</text>
        {Array.from({ length: skins }).map((_, i) => {
          const outer = i === skins - 1
          const facingSkin = outer || backing === 'all-facing'
          return (
            <g key={i}>
              <rect x={x0 + i * skinW} y={y0} width={skinW} height={h} fill={facingSkin ? '#c2703d' : '#d9b08c'} stroke="#7c2d12" strokeWidth={1} />
              <text x={x0 + i * skinW + skinW / 2} y={y0 + h / 2 + 3} fontSize={8} textAnchor="middle" fill="#fff">{facingSkin ? 'facing' : 'common'}</text>
            </g>
          )
        })}
        <text x={x0 + w + 6} y={y0 + h / 2 + 3} fontSize={9} fill="#64748b">{thicknessMm}mm</text>
      </svg>
    </div>
  )
}
