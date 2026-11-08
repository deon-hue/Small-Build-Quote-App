'use client'

/**
 * Assembly Calculator — External Timber Frame Wall with a Brick Outer Leaf (the wall of a timber frame extension or house).
 *
 * From the outside in: a half-brick facing leaf, a clear cavity (50mm or more), stainless steel ties to the frame, a breather membrane over sheathing, the timber stud frame with insulation between the studs, optional
 * extra insulation outside the sheathing, a vapour control layer and plasterboard inside. A doubled header and trimmed studs round each opening, with a steel angle lintel carrying the brick, a cavity tray and weep
 * vents; cavity barriers at the openings and the ends.
 *
 * Counts and prices what's drawn — it doesn't design the frame (the studs, headers, bracing and ties are the designer's), and the foundation and the blockwork up to the DPC are priced under Foundations.
 * See lib/timber-frame-brick-wall.ts.
 */

import { usePlanWallOpenings } from '@/components/usePlanWallOpenings'
import type { PlanWallOpening } from '@/lib/wall-openings'
import React, { useMemo } from 'react'
import LocationInput from './LocationInput'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import type { AssemblyOpening, CostedLine, AssemblyLayerDef } from '@/lib/assembly-calc'
import {
  LEAF_BRICK_LABEL, STUD_SECTIONS, DEFAULT_STUD, SHEATHING_LABEL, SHEATHING_THICKNESS, FRAME_INSULATION_LABEL, FRAME_LINING_LABEL, BRICK_MORTAR_LABEL, MIN_CAVITY_MM, LEAF_MM, LEAF_BRICKS_PER_HOUR,
  calculateTimberFrameBrickGeometry, buildTimberFrameBrickLayers, costTimberFrameBrickLayers, suggestTimberFrameBrickHours,
  type LeafBrick, type BrickMortar, type FrameSheathing, type FrameInsulation, type FrameLining, type TimberFrameBrickGeometry,
} from '@/lib/timber-frame-brick-wall'
import { describeTimberFrameBrickShort, describeTimberFrameBrick } from '@/lib/timber-frame-brick-description'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  OpeningsEditor, newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'
import { MasonryElevationSvg } from '@/components/AssemblyMasonryWallDemo'

const NS = 'AssemblyTimberFrameBrickWallDemo'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
  /** the doors and windows drawn on this wall in Take-off: added to its openings, and followed until typed over */
  planOpenings?: PlanWallOpening[]
  /** the height the wall was drawn at in Take-off (mm): where the calculator starts, until a height is saved */
  initialHeightMm?: number
}

export default function AssemblyTimberFrameBrickWallDemo({ onClose, onSave, labourTrades = [], externalLengthMm, planOpenings, initialHeightMm }: Props) {
  const [name, setName] = useCalcState(NS, 'name', 'Timber Frame Wall with Brick Outer Leaf')
  const [qty, setQty] = useCalcState(NS, 'qty', 1)
  const [lengthMm, setLengthMm] = useCalcState(NS, 'lengthMm', externalLengthMm ?? 6000)
  React.useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useCalcState(NS, 'heightMm', initialHeightMm ?? 2400)
  const [brick, setBrick] = useCalcState<LeafBrick>(NS, 'brick', 'machine')
  const [mortar, setMortar] = useCalcState<BrickMortar>(NS, 'mortar', 'cement')
  const [studKey, setStudKey] = useCalcState(NS, 'studKey', DEFAULT_STUD)
  const [studCentresMm, setStudCentresMm] = useCalcState(NS, 'studCentresMm', 400)
  const [cavityMm, setCavityMm] = useCalcState(NS, 'cavityMm', MIN_CAVITY_MM)
  const [sheathing, setSheathing] = useCalcState<FrameSheathing>(NS, 'sheathing', 'osb')
  const [insulation, setInsulation] = useCalcState<FrameInsulation>(NS, 'insulation', 'mineral')
  const [outerInsulationMm, setOuterInsulationMm] = useCalcState(NS, 'outerInsulationMm', 0)
  const [vcl, setVcl] = useCalcState(NS, 'vcl', true)
  const [lining, setLining] = useCalcState<FrameLining>(NS, 'lining', 'one')
  const [movementJointSpacingMm, setMovementJointSpacingMm] = useCalcState(NS, 'movementJointSpacingMm', 0)
  const [wastePct, setWastePct] = useCalcState(NS, 'wastePct', 10)
  const [openings, setOpenings] = useCalcState<AssemblyOpening[]>(NS, 'openings', [])
  usePlanWallOpenings(planOpenings, setOpenings)
  const [location, setLocation] = useCalcState(NS, 'location', '')

  const [labourLines, setLabourLines] = useCalcState<LabourLine[]>(NS, 'labourLines', [
    { id: newLabourLineId(), tradeId: '', task: 'Make and erect the timber frame, sheathing and membrane', hours: 24 },
    { id: newLabourLineId(), tradeId: '', task: 'Build the brick outer leaf, ties, trays and barriers', hours: 40 },
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
      return { ok: true as const, geometry: calculateTimberFrameBrickGeometry({ lengthMm, heightMm, openings, studKey, studCentresMm, cavityMm, outerInsulationMm, movementJointSpacingMm }) }
    } catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, openingsKey, studKey, studCentresMm, cavityMm, outerInsulationMm, movementJointSpacingMm])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo((): AssemblyLayerDef[] => {
    if (!geometryResult.ok) return []
    const base = buildTimberFrameBrickLayers(geometryResult.geometry, { wastePct, brick, mortar, studKey, sheathing, insulation, outerInsulationMm, vcl, lining })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, brick, mortar, studKey, sheathing, insulation, outerInsulationMm, vcl, lining, rateOverrides])

  const handleBreakdownRateChange = (layerId: string, unitCost: number) => {
    if (miscMaterialLines.some(m => m.id === layerId)) updateMiscMaterialLine(layerId, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(prev => ({ ...prev, [layerId]: Math.max(0, unitCost) }))
  }

  const materialLinesCosted = useMemo(() => costTimberFrameBrickLayers(layers).lines, [layers])
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

  // Hours to start the labour from: a guide worked out from the areas, the bricks and the openings, typed over in the lines.
  const suggested = g ? suggestTimberFrameBrickHours(g, { insulation, vcl, lining, outerInsulationMm }) : null
  function applySuggestedHours() {
    if (!suggested) return
    const carp = labourTrades.find(t => /carpenter|joiner/i.test(t.name))
    const brickie = labourTrades.find(t => /bricklayer|brick layer|brickie/i.test(t.name))
    const labourer = labourTrades.find(t => /labourer|laborer/i.test(t.name))
    setLabourLines([
      { id: newLabourLineId(), tradeId: carp?.id ?? labourLines[0]?.tradeId ?? '', task: 'Make and erect the timber frame, sheathing and membrane', hours: suggested.carpenter },
      { id: newLabourLineId(), tradeId: brickie?.id ?? '', task: 'Build the brick outer leaf, ties, trays and barriers', hours: suggested.bricklayer },
      { id: newLabourLineId(), tradeId: labourer?.id ?? '', task: 'Labourer serving the carpenter and bricklayer', hours: suggested.labourer },
    ])
  }

  // The customer's description follows the settings until it is edited by hand
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(NS, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(NS, 'detailOverride', null)
  const stud = STUD_SECTIONS[studKey] ?? STUD_SECTIONS[DEFAULT_STUD]
  const descInput = {
    lengthMm, heightMm, brick, mortar, studLabel: stud.label, studDepthMm: stud.depthMm, studCentresMm, cavityMm, sheathing, insulation, outerInsulationMm, vcl, lining,
    openingCount: openings.length, wideOpenings: g ? g.headers.filter(h => h.wide).length : 0, movementJointSpacingMm,
  }
  const description = descriptionOverride ?? describeTimberFrameBrickShort(descInput)
  const detail = detailOverride ?? describeTimberFrameBrick(descInput)

  const updateOpening = (id: string, patch: Partial<AssemblyOpening>) => setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  const removeOpening = (id: string) => setOpenings(prev => prev.filter(o => o.id !== id))
  const addOpening = () => setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 1000, sillHeightMm: 900 }])

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
              <WallSectionSvg g={g} cavityMm={cavityMm} outerInsulationMm={outerInsulationMm} sheathing={sheathing} insulation={insulation} lining={lining} />
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
                {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high, about {Math.round(g.thicknessMm)}mm thick (brick, cavity, sheathing, studs), {openings.length} opening{openings.length !== 1 ? 's' : ''}. Net area {g.netAreaM2.toFixed(2)} m² ·
                {' '}{Math.ceil(g.bricks)} bricks ({g.courseCount} courses) · {g.studCount} studs and {g.frameLm.toFixed(1)}m of frame timber · {Math.ceil(g.tieCount)} ties · mortar {g.mortarM3.toFixed(2)} m³.
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
          <PropRow label="Height (mm)">{numInput(heightMm, setHeightMm, 1)}</PropRow>
          <PropRow label="Brick">
            <select value={brick} onChange={e => setBrick(e.target.value as LeafBrick)} style={propInput}>
              {(Object.entries(LEAF_BRICK_LABEL) as [LeafBrick, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>
          <PropRow label="Mortar">
            <select value={mortar} onChange={e => setMortar(e.target.value as BrickMortar)} style={propInput}>
              {(Object.entries(BRICK_MORTAR_LABEL) as [BrickMortar, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </PropRow>

          <CollapsibleSection title="Timber frame" borderColor="#fde68a">
            <PropRow label="Studs">
              <select value={studKey} onChange={e => setStudKey(e.target.value)} style={propInput}>
                {Object.entries(STUD_SECTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </PropRow>
            <PropRow label="Stud centres">
              <select value={studCentresMm} onChange={e => setStudCentresMm(+e.target.value)} style={propInput}>
                <option value={400}>400mm</option>
                <option value={600}>600mm</option>
              </select>
            </PropRow>
            <PropRow label="Sheathing">
              <select value={sheathing} onChange={e => setSheathing(e.target.value as FrameSheathing)} style={propInput}>
                {(Object.entries(SHEATHING_LABEL) as [FrameSheathing, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Cavity, insulation and lining" borderColor="#fde68a">
            <PropRow label={`Clear cavity (mm, ${MIN_CAVITY_MM} or more)`}>{numInput(cavityMm, setCavityMm, 1)}</PropRow>
            <PropRow label="Between the studs">
              <select value={insulation} onChange={e => setInsulation(e.target.value as FrameInsulation)} style={propInput}>
                {(Object.entries(FRAME_INSULATION_LABEL) as [FrameInsulation, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <PropRow label="Extra PIR over the sheathing (mm, 0 = none)">
              <select value={outerInsulationMm} onChange={e => setOuterInsulationMm(+e.target.value)} style={propInput}>
                {[0, 25, 40, 50, 75].map(n => <option key={n} value={n}>{n === 0 ? 'None' : `${n}mm`}</option>)}
              </select>
            </PropRow>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', margin: '6px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={vcl} onChange={e => setVcl(e.target.checked)} />
              Vapour control layer inside the studs
            </label>
            <PropRow label="Lining inside">
              <select value={lining} onChange={e => setLining(e.target.value as FrameLining)} style={propInput}>
                {(Object.entries(FRAME_LINING_LABEL) as [FrameLining, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

          <CollapsibleSection title="Movement joints and waste" borderColor="#fde68a">
            <PropRow label="Movement joint in the brick every (mm, 0 = none)">{numInput(movementJointSpacingMm, setMovementJointSpacingMm)}</PropRow>
            <div style={{ marginTop: 6 }}>
              <PropRow label={`Waste % (${wastePct}%)`}>
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
              <span>A guide for the labour: about {suggested.carpenter} carpenter, {suggested.bricklayer} bricklayer and {suggested.labourer} labourer hours (a bricklayer lays about {LEAF_BRICKS_PER_HOUR} bricks an hour in the leaf and sets each lintel and tray).</span>
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

// ── Section — the wall cut through, outside on the left, drawn to scale of each layer's thickness. Visual only.
function WallSectionSvg({ g, cavityMm, outerInsulationMm, sheathing, insulation, lining }: { g: TimberFrameBrickGeometry; cavityMm: number; outerInsulationMm: number; sheathing: FrameSheathing; insulation: FrameInsulation; lining: FrameLining }) {
  const parts: { label: string; mm: number; fill: string; stroke: string }[] = [
    { label: 'Brick', mm: LEAF_MM, fill: '#c2703d', stroke: '#7c2d12' },
    { label: 'Cavity', mm: cavityMm, fill: '#ffffff', stroke: '#94a3b8' },
    ...(outerInsulationMm > 0 ? [{ label: 'PIR', mm: outerInsulationMm, fill: '#fde68a', stroke: '#b45309' }] : []),
    { label: SHEATHING_LABEL[sheathing].split(' ')[0], mm: SHEATHING_THICKNESS[sheathing], fill: '#d6b88a', stroke: '#78350f' },
    { label: insulation === 'none' ? 'Studs' : 'Studs + insulation', mm: g.studDepthMm, fill: insulation === 'none' ? '#d6b88a' : '#fef3c7', stroke: '#78350f' },
    ...(lining === 'none' ? [] : [{ label: 'Board', mm: lining === 'two' ? 25 : 12.5, fill: '#e5e7eb', stroke: '#6b7280' }]),
  ]
  const total = parts.reduce((s, p) => s + p.mm, 0)
  const vbW = 640, vbH = 74, pad = 20
  const k = (vbW - pad * 2) / Math.max(1, total)
  let x = pad
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 78, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={pad} y={13} fontSize={9} fill="#94a3b8">Through the wall, outside on the left: about {Math.round(total)}mm</text>
        {parts.map((p, i) => {
          const w = Math.max(2, p.mm * k)
          const el = (
            <g key={i}>
              <rect x={x} y={22} width={w} height={26} fill={p.fill} stroke={p.stroke} strokeWidth={0.8} />
              <text x={x + w / 2} y={60} fontSize={8} fill="#64748b" textAnchor="middle">{p.label}</text>
              <text x={x + w / 2} y={69} fontSize={8} fill="#94a3b8" textAnchor="middle">{Math.round(p.mm)}</text>
            </g>
          )
          x += w
          return el
        })}
      </svg>
    </div>
  )
}
