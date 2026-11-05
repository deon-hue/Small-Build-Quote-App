'use client'

/**
 * Assembly Calculator — External Single Skin Brick Wall with Piers (a single skin garage, an outbuilding or store, a garden or boundary wall).
 *
 * One half-brick skin (102.5mm) in stretcher bond, facing bricks or commons, cement or lime mortar, stiffened by brick piers: one at each end, one every so far along the wall and one each side of a wide opening
 * (a garage door), with a lintel or a steel beam over each opening, a DPC under the wall and the piers, an optional concrete coping and movement joints, and an outside and inside finish if wanted.
 *
 * Counts and prices what's drawn — it doesn't design the wall (the pier size and spacing, the lintel over a wide door and the ties to the roof are the designer's), it does not insulate it, and the foundation is priced
 * under Foundations. See lib/single-skin-brick-wall.ts.
 */

import React, { useMemo } from 'react'
import LocationInput from './LocationInput'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import type { AssemblyOpening, CostedLine, AssemblyLayerDef } from '@/lib/assembly-calc'
import {
  SKIN_BRICK_LABEL, PIER_WIDTH, PIER_DEPTH, PIER_SIDE_LABEL, SKIN_LINTEL_LABEL, SKIN_COPING_LABEL, BRICK_MORTAR_LABEL, WALL_BRICKS_PER_HOUR, PIER_BRICKS_PER_HOUR, MAX_CONCRETE_LINTEL_SPAN_MM, SKIN_MM,
  calculateSingleSkinGeometry, buildSingleSkinLayers, costSingleSkinLayers, suggestSingleSkinHours,
  type SkinBrick, type BrickMortar, type SkinLintel, type SkinCoping, type PierWidth, type PierDepth, type PierSide, type SingleSkinGeometry,
} from '@/lib/single-skin-brick-wall'
import { describeSingleSkinShort, describeSingleSkin } from '@/lib/single-skin-brick-description'
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
const NS = 'AssemblySingleSkinBrickWallDemo'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

export default function AssemblySingleSkinBrickWallDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName] = useCalcState(NS, 'name', 'Single Skin Brick Wall with Piers')
  const [qty, setQty] = useCalcState(NS, 'qty', 1)
  const [lengthMm, setLengthMm] = useCalcState(NS, 'lengthMm', externalLengthMm ?? 6000)
  React.useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useCalcState(NS, 'heightMm', 2400)
  const [brick, setBrick] = useCalcState<SkinBrick>(NS, 'brick', 'machine')
  const [mortar, setMortar] = useCalcState<BrickMortar>(NS, 'mortar', 'cement')
  const [pierWidth, setPierWidth] = useCalcState<PierWidth>(NS, 'pierWidth', 'one-half')
  const [pierDepth, setPierDepth] = useCalcState<PierDepth>(NS, 'pierDepth', 'one')
  const [pierSide, setPierSide] = useCalcState<PierSide>(NS, 'pierSide', 'inside')
  const [endPiers, setEndPiers] = useCalcState<0 | 1 | 2>(NS, 'endPiers', 2)
  const [pierSpacingMm, setPierSpacingMm] = useCalcState(NS, 'pierSpacingMm', 3000)
  const [piersBesideOpenings, setPiersBesideOpenings] = useCalcState(NS, 'piersBesideOpenings', true)
  const [extraPiers, setExtraPiers] = useCalcState(NS, 'extraPiers', 0)
  const [lintel, setLintel] = useCalcState<SkinLintel>(NS, 'lintel', 'concrete')
  const [coping, setCoping] = useCalcState<SkinCoping>(NS, 'coping', 'none')
  const [externalFinish, setExternalFinish] = useCalcState<ExtFinish>(NS, 'externalFinish', 'none')
  const [internalFinish, setInternalFinish] = useCalcState<IntFinish>(NS, 'internalFinish', 'none')
  const [movementJointSpacingMm, setMovementJointSpacingMm] = useCalcState(NS, 'movementJointSpacingMm', 0)
  const [wastePct, setWastePct] = useCalcState(NS, 'wastePct', 10)
  const [openings, setOpenings] = useCalcState<AssemblyOpening[]>(NS, 'openings', [])
  const [location, setLocation] = useCalcState(NS, 'location', '')

  const [labourLines, setLabourLines] = useCalcState<LabourLine[]>(NS, 'labourLines', [
    { id: newLabourLineId(), tradeId: '', task: 'Build single skin brickwork and piers', hours: 24 },
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
    try {
      return { ok: true as const, geometry: calculateSingleSkinGeometry({ lengthMm, heightMm, openings, pierWidth, pierDepth, endPiers, pierSpacingMm, piersBesideOpenings, extraPiers, movementJointSpacingMm }) }
    } catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, openingsKey, pierWidth, pierDepth, endPiers, pierSpacingMm, piersBesideOpenings, extraPiers, movementJointSpacingMm])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo((): AssemblyLayerDef[] => {
    if (!geometryResult.ok) return []
    const gg = geometryResult.geometry
    const base = buildSingleSkinLayers(gg, { wastePct, brick, mortar, lintel, coping, pierWidthMm: gg.pierWidthMm })
    // the finishes put over the brick are priced over the wall's net face
    if (externalFinish !== 'none') base.push(...EXTERNAL_FINISH_CONFIG[externalFinish].buildLayers(wastePct).map(l => ({ ...l, source: 'fixed' as const, fixedQty: gg.netAreaM2 })))
    if (internalFinish !== 'none') base.push(...FINISH_TYPE_CONFIG[internalFinish].buildLayers(wastePct).map(l => ({ ...l, source: 'fixed' as const, fixedQty: gg.netAreaM2 })))
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, brick, mortar, lintel, coping, externalFinish, internalFinish, rateOverrides])

  const handleBreakdownRateChange = (layerId: string, unitCost: number) => {
    if (miscMaterialLines.some(m => m.id === layerId)) updateMiscMaterialLine(layerId, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(prev => ({ ...prev, [layerId]: Math.max(0, unitCost) }))
  }

  const materialLinesCosted = useMemo(() => costSingleSkinLayers(layers).lines, [layers])
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

  // Hours to start the labour from: a guide worked out from the bricks, lintels and coping, typed over in the lines.
  const suggested = g ? suggestSingleSkinHours(g, coping) : null
  function applySuggestedHours() {
    if (!suggested) return
    const brickie = labourTrades.find(t => /bricklayer|brick layer|brickie/i.test(t.name))
    const labourer = labourTrades.find(t => /labourer|laborer/i.test(t.name))
    setLabourLines([
      { id: newLabourLineId(), tradeId: brickie?.id ?? labourLines[0]?.tradeId ?? '', task: 'Build single skin brickwork and piers', hours: suggested.bricklayer },
      { id: newLabourLineId(), tradeId: labourer?.id ?? '', task: 'Labourer serving the bricklayer', hours: suggested.labourer },
    ])
  }

  // The customer's description follows the settings until it is edited by hand
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(NS, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(NS, 'detailOverride', null)
  const descInput = {
    lengthMm, heightMm, brick, mortar, pierCount: g?.pierCount ?? 0, pierWidth, pierDepth, pierSide, pierSpacingMm,
    openingCount: openings.length, wideOpenings: openings.filter(o => o.widthMm > MAX_CONCRETE_LINTEL_SPAN_MM).length, lintel, coping, movementJointSpacingMm,
    outsideFinish: externalFinish === 'none' ? 'none' : EXTERNAL_FINISH_CONFIG[externalFinish].label.toLowerCase(),
    insideFinish: internalFinish === 'none' ? 'none' : FINISH_TYPE_CONFIG[internalFinish].label.toLowerCase(),
  }
  const description = descriptionOverride ?? describeSingleSkinShort(descInput)
  const detail = detailOverride ?? describeSingleSkin(descInput)

  const updateOpening = (id: string, patch: Partial<AssemblyOpening>) => setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  const removeOpening = (id: string) => setOpenings(prev => prev.filter(o => o.id !== id))
  const addOpening = () => setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'window', widthMm: 900, heightMm: 1050, offsetMm: 400, sillHeightMm: 900 }])
  // a garage door: 2440 x 2135, in the middle of the wall (the usual single garage door opening), with a pier each side
  const addGarageDoor = () => setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'door', widthMm: 2440, heightMm: 2135, offsetMm: Math.max(0, Math.round((lengthMm - 2440) / 2)), sillHeightMm: 0 }])

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
        <LocationInput value={location} onChange={setLocation} placeholder="Room / location"
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
              <PierPlanSvg lengthMm={lengthMm} g={g} openings={openings} pierSide={pierSide} pierDepthMm={PIER_DEPTH[pierDepth].mm} />
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
                {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high, one skin ({SKIN_MM}mm, {g.courseCount} courses),
                {' '}{openings.length} opening{openings.length !== 1 ? 's' : ''}. Net area {g.netAreaM2.toFixed(2)} m² ·
                {' '}{Math.ceil(g.wallBricks)} bricks in the wall + {Math.ceil(g.pierBricks)} in {g.pierCount} pier{g.pierCount !== 1 ? 's' : ''}
                {' '}= {Math.ceil(g.brickCount)} · mortar {g.mortarM3.toFixed(2)} m³.
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
          <PropRow label="Height (mm)">{numInput(heightMm, setHeightMm, 1)}</PropRow>
          <PropRow label="Brick">
            <select value={brick} onChange={e => setBrick(e.target.value as SkinBrick)} style={propInput}>
              {(Object.entries(SKIN_BRICK_LABEL) as [SkinBrick, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>
          <PropRow label="Mortar">
            <select value={mortar} onChange={e => setMortar(e.target.value as BrickMortar)} style={propInput}>
              {(Object.entries(BRICK_MORTAR_LABEL) as [BrickMortar, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>

          <CollapsibleSection title="Piers" borderColor="#fde68a">
            <PropRow label="How wide each pier is">
              <select value={pierWidth} onChange={e => setPierWidth(e.target.value as PierWidth)} style={propInput}>
                {(Object.entries(PIER_WIDTH) as [PierWidth, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </PropRow>
            <PropRow label="How far each goes through the wall">
              <select value={pierDepth} onChange={e => setPierDepth(e.target.value as PierDepth)} style={propInput}>
                {(Object.entries(PIER_DEPTH) as [PierDepth, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </PropRow>
            <PropRow label="Which face they stand out on (for the wording)">
              <select value={pierSide} onChange={e => setPierSide(e.target.value as PierSide)} style={propInput}>
                {(Object.entries(PIER_SIDE_LABEL) as [PierSide, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <PropRow label="Piers at the ends of the wall">
              <select value={endPiers} onChange={e => setEndPiers(+e.target.value as 0 | 1 | 2)} style={propInput}>
                <option value={2}>A pier at each end</option>
                <option value={1}>A pier at one end</option>
                <option value={0}>None at the ends</option>
              </select>
            </PropRow>
            <PropRow label="A pier every (mm, 0 = none between the ends)">{numInput(pierSpacingMm, setPierSpacingMm)}</PropRow>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', margin: '6px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={piersBesideOpenings} onChange={e => setPiersBesideOpenings(e.target.checked)} />
              A pier each side of every opening over 1.5m wide (a garage door)
            </label>
            <PropRow label="Other piers to add (not placed above)">{numInput(extraPiers, n => setExtraPiers(Math.round(n)))}</PropRow>
          </CollapsibleSection>

          <PropRow label="Over each opening (a wide one is always steel)">
            <select value={lintel} onChange={e => setLintel(e.target.value as SkinLintel)} style={propInput}>
              {(Object.entries(SKIN_LINTEL_LABEL) as [SkinLintel, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>
          <PropRow label="Top of the wall">
            <select value={coping} onChange={e => setCoping(e.target.value as SkinCoping)} style={propInput}>
              {(Object.entries(SKIN_COPING_LABEL) as [SkinCoping, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
              <option value="none">None (the brick is the finish)</option>
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
          <button onClick={addGarageDoor} title="Adds a 2440 x 2135 garage door opening in the middle of the wall"
            style={{ fontSize: 11, color: '#b45309', background: '#fff', border: '1px solid #fde68a', borderRadius: 5, cursor: 'pointer', padding: '3px 8px', alignSelf: 'flex-start' }}>
            + Garage door opening (2440 × 2135)
          </button>
        </div>

        <div style={{ gridColumn: '1 / -1', fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {suggested && (
            <>
              <span>A guide for the labour: about {suggested.bricklayer} bricklayer hours and {suggested.labourer} labourer hours (a bricklayer lays about {WALL_BRICKS_PER_HOUR} bricks an hour in the wall and {PIER_BRICKS_PER_HOUR} in a pier, and sets each lintel).</span>
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

// ── Plan — the wall seen from above, with its piers where the rules put them and the openings as gaps. Visual only: the piers' count is what feeds the price, the drawing just shows where they fall.
function PierPlanSvg({ lengthMm, g, openings, pierSide, pierDepthMm }: { lengthMm: number; g: SingleSkinGeometry; openings: AssemblyOpening[]; pierSide: PierSide; pierDepthMm: number }) {
  const vbW = 640, vbH = 90, pad = 20
  const k = (vbW - pad * 2) / Math.max(1, lengthMm)
  const wallH = Math.max(3, SKIN_MM * k), y0 = 34
  const pierH = Math.max(wallH + 3, pierDepthMm * k)
  const pierY = pierSide === 'inside' ? y0 : y0 + wallH - pierH
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 86, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={pad} y={14} fontSize={9} fill="#94a3b8">Seen from above: the wall and its {g.pierCount} pier{g.pierCount === 1 ? '' : 's'} ({g.pierWidthMm}mm wide), {pierSide === 'inside' ? 'inside face at the top' : 'outside face at the bottom'}</text>
        <rect x={pad} y={y0} width={lengthMm * k} height={wallH} fill="#c2703d" stroke="#7c2d12" strokeWidth={0.8} />
        {openings.map(o => (
          <rect key={o.id} x={pad + o.offsetMm * k} y={y0 - 1} width={o.widthMm * k} height={wallH + 2} fill="#fffbeb" stroke="#b45309" strokeWidth={0.6} strokeDasharray="3 2" />
        ))}
        {g.pierXs.map((x, i) => (
          <rect key={i} x={pad + (x - g.pierWidthMm / 2) * k} y={pierY} width={g.pierWidthMm * k} height={pierH} fill="#a85a2b" stroke="#7c2d12" strokeWidth={0.8} />
        ))}
        <text x={pad} y={vbH - 6} fontSize={9} fill="#94a3b8">{(lengthMm / 1000).toFixed(2)}m{g.pierCount > g.pierXs.length ? ` · plus ${g.pierCount - g.pierXs.length} added by hand (not placed)` : ''}</text>
      </svg>
    </div>
  )
}
