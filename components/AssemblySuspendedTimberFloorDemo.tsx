'use client'

/**
 * Assembly Calculator — Suspended timber floor (Floors & Screeds → Suspended Timber Floor), priced per m² from the floor's area.
 *
 * Used for a ground floor over a void, an upper (first) floor and a loft floor. Joists at set centres spanning between the walls (the span follows the shorter side of the drawn floor until typed over), wall plates
 * or joist hangers, strutting on longer spans, insulation between the joists, a vapour control layer and the decking. A ground floor also takes sleeper-wall rows (priced elsewhere, with the sleeper wall
 * calculator) and an optional ground cover; the joist size is checked against the span with the same span chart the flat roof uses, at floor loads. The sums are in lib/suspended-timber-floor.ts.
 * Every rate is a sample, editable per line in the breakdown.
 */

import React, { useMemo, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateSuspendedTimberFloor, sleeperRowsFor, FLOOR_KINDS, CARRY_LABEL, JOIST_DEPTHS_MM, JOIST_PER_LM, C24_EXTRA, WALL_PLATE_PER_LM, DPC_PER_LM, HANGER_EACH, STRUTTING_PER_LM,
  JOIST_CENTRES_MM, QUILT_THICKNESSES_MM, QUILT_PER_M2, NETTING_PER_M2, VCL_PER_M2, DECK_KINDS, DECK_FIXINGS_PER_M2, GROUND_COVER_LABEL, GRAVEL_PER_M3, OVERSITE_PER_M3, COVER_MEMBRANE_PER_M2,
  type FloorKind, type JoistGrade, type JoistCarry, type DeckKind, type GroundCover, type SuspendedTimberGeometry,
} from '@/lib/suspended-timber-floor'
import { sidesFromAreaPerimeter } from '@/lib/block-beam-floor'
import { checkFlatRoofJoist, maxFlatRoofJoistSpanMm } from '@/lib/flat-roof-joist-spans'
import { describeSuspendedTimberFloor, describeSuspendedTimberFloorShort } from '@/lib/suspended-timber-floor-description'
import { suggestSuspendedTimberFloorLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** The area of the floor drawn in Take-off, m². Whenever it changes it overwrites the calculator's own. */
  externalAreaM2?: number
  /** The perimeter of the drawn floor, m (the span of the joists). */
  externalPerimeterM?: number
}

function buildTimberFloorLayers(g: SuspendedTimberGeometry, o: { wastePct: number; joistDepthMm: number; grade: JoistGrade; deck: DeckKind }): AssemblyLayerDef[] {
  const w = o.wastePct
  const L: AssemblyLayerDef[] = []
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }
  if (g.coverAreaM2 > 0) {
    L.push(fixed({ id: 'cover-membrane', name: 'Membrane over the ground under the floor', category: 'materials', unit: 'm²', unitCost: COVER_MEMBRANE_PER_M2, wastePct: Math.max(w, 10), qty: g.coverAreaM2 }))
    L.push(g.groundCover === 'concrete'
      ? fixed({ id: 'cover', name: 'Concrete oversite, 100mm (C20 ready-mix)', category: 'materials', unit: 'm³', unitCost: OVERSITE_PER_M3, wastePct: Math.max(w, 5), qty: g.coverVolumeM3 })
      : fixed({ id: 'cover', name: 'Gravel, 50mm', category: 'materials', unit: 'm³', unitCost: GRAVEL_PER_M3, wastePct: w, qty: g.coverVolumeM3 }))
  }
  if (g.plateLm > 0) L.push(fixed({ id: 'plates', name: 'Treated wall plate, 100 × 50', category: 'materials', unit: 'lm', unitCost: WALL_PLATE_PER_LM, wastePct: w, qty: g.plateLm }))
  if (g.dpcLm > 0) L.push(fixed({ id: 'dpc', name: 'DPC under the wall plates', category: 'materials', unit: 'lm', unitCost: DPC_PER_LM, wastePct: Math.max(w, 10), qty: g.dpcLm }))
  if (g.hangerCount > 0) L.push(fixed({ id: 'hangers', name: 'Joist hangers with nails', category: 'materials', unit: 'nr', unitCost: HANGER_EACH, roundToWhole: true, qty: g.hangerCount }))
  const perLm = (JOIST_PER_LM[o.joistDepthMm] ?? +(0.022 * o.joistDepthMm).toFixed(2)) * (o.grade === 'c24' ? C24_EXTRA : 1)
  L.push(fixed({ id: 'joists', name: `47 × ${o.joistDepthMm}mm ${o.grade.toUpperCase()} joists, ${g.joistCount + g.extraJoists} nr × ${g.joistLengthM.toFixed(2)}m`, category: 'materials', unit: 'lm', unitCost: +perLm.toFixed(2), wastePct: Math.max(w, 8), qty: g.joistLm }))
  if (g.struttingLm > 0) L.push(fixed({ id: 'strutting', name: `Strutting between the joists (${g.struttingRows} row${g.struttingRows === 1 ? '' : 's'})`, category: 'materials', unit: 'lm', unitCost: STRUTTING_PER_LM, wastePct: w, qty: g.struttingLm }))
  if (g.insulationAreaM2 > 0) {
    L.push(fixed({ id: 'insulation', name: `${g.insulationMm}mm mineral wool insulation between the joists`, category: 'materials', unit: 'm²', unitCost: QUILT_PER_M2[g.insulationMm] ?? +(0.042 * g.insulationMm).toFixed(2), wastePct: w, qty: g.insulationAreaM2 }))
    L.push(fixed({ id: 'netting', name: 'Netting or battens to hold the insulation up', category: 'materials', unit: 'm²', unitCost: NETTING_PER_M2, wastePct: 5, qty: g.insulationAreaM2 }))
  }
  if (g.vclAreaM2 > 0) L.push(fixed({ id: 'vcl', name: 'Vapour control layer (polythene) over the joists', category: 'materials', unit: 'm²', unitCost: VCL_PER_M2, wastePct: Math.max(w, 10), qty: g.vclAreaM2 }))
  const dk = DECK_KINDS[o.deck]
  L.push(fixed({ id: 'deck', name: `${dk.label} decking`, category: 'materials', unit: 'sheet', unitCost: dk.perSheet, roundToWhole: true, wastePct: Math.max(w, 10), qty: g.deckSheets }))
  L.push(fixed({ id: 'deck-fixings', name: 'Screws and adhesive for the decking', category: 'materials', unit: 'm²', unitCost: DECK_FIXINGS_PER_M2, qty: g.deckAreaM2 }))
  return L
}

export default function AssemblySuspendedTimberFloorDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM }: Props) {
  const ID = 'AssemblySuspendedTimberFloorDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Suspended timber floor')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [areaM2, setAreaM2] = useCalcState(ID, 'areaM2', externalAreaM2 && externalAreaM2 > 0 ? +externalAreaM2.toFixed(2) : 30)
  useEffect(() => { if (externalAreaM2 != null && externalAreaM2 > 0) setAreaM2(+externalAreaM2.toFixed(2)) }, [externalAreaM2])
  const [perimeterLm, setPerimeterLm] = useCalcState(ID, 'perimeterLm', externalPerimeterM && externalPerimeterM > 0 ? +externalPerimeterM.toFixed(2) : 22)
  useEffect(() => { if (externalPerimeterM != null && externalPerimeterM > 0) setPerimeterLm(+externalPerimeterM.toFixed(2)) }, [externalPerimeterM])
  const [kind, setKind] = useCalcState<FloorKind>(ID, 'kind', 'ground')
  // the span follows the shorter side of the drawn floor until it is typed over
  const [spanOverride, setSpanOverride] = useCalcState<number | null>(ID, 'spanOverride', null)
  const sides = useMemo(() => sidesFromAreaPerimeter(areaM2, perimeterLm), [areaM2, perimeterLm])
  const spanMm = spanOverride ?? Math.round(sides.short * 1000)
  const [centresMm, setCentresMm] = useCalcState(ID, 'centresMm', 400)
  const [joistDepthMm, setJoistDepthMm] = useCalcState(ID, 'joistDepthMm', FLOOR_KINDS.ground.defaultDepthMm)
  const [grade, setGrade] = useCalcState<JoistGrade>(ID, 'grade', 'c16')
  const [carry, setCarry] = useCalcState<JoistCarry>(ID, 'carry', FLOOR_KINDS.ground.defaultCarry)
  const [extraJoists, setExtraJoists] = useCalcState(ID, 'extraJoists', 0)
  const [rowsOverride, setRowsOverride] = useCalcState<number | null>(ID, 'rowsOverride', null)
  const [insulationMm, setInsulationMm] = useCalcState(ID, 'insulationMm', FLOOR_KINDS.ground.defaultInsulationMm)
  const [vcl, setVcl] = useCalcState(ID, 'vcl', FLOOR_KINDS.ground.defaultVcl)
  const [deck, setDeck] = useCalcState<DeckKind>(ID, 'deck', 'chipboard-22')
  const [groundCover, setGroundCover] = useCalcState<GroundCover>(ID, 'groundCover', 'none')
  const [wastePct, setWastePct] = useCalcState(ID, 'wastePct', 10)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function pickKind(k: FloorKind) {
    const info = FLOOR_KINDS[k]
    setKind(k); setJoistDepthMm(info.defaultDepthMm); setInsulationMm(info.defaultInsulationMm); setCarry(info.defaultCarry); setVcl(info.defaultVcl); setRowsOverride(null)
  }
  const info = FLOOR_KINDS[kind]
  const ground = kind === 'ground'

  // the joist section against the span, at this floor's loads; on a ground floor sleeper walls split the span until each part fits
  const maxSpanMm = useMemo(() => maxFlatRoofJoistSpanMm(grade, joistDepthMm, centresMm, info.loads).spanMm, [grade, joistDepthMm, centresMm, info])
  const autoRows = ground ? sleeperRowsFor(spanMm, maxSpanMm) : 0
  const sleeperRows = ground ? (rowsOverride ?? autoRows) : 0
  const subSpanMm = spanMm / (sleeperRows + 1)
  const joistCheck = useMemo(() => checkFlatRoofJoist({ grade, depthMm: joistDepthMm, centresMm, spanMm: subSpanMm, loads: info.loads }), [grade, joistDepthMm, centresMm, subSpanMm, info])

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateSuspendedTimberFloor({ kind, areaM2, perimeterLm, spanMm, centresMm, joistDepthMm, grade, carry, extraJoists, sleeperRows, insulationMm, vcl, deck, groundCover }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [kind, areaM2, perimeterLm, spanMm, centresMm, joistDepthMm, grade, carry, extraJoists, sleeperRows, insulationMm, vcl, deck, groundCover])
  const g = geometryResult.ok ? geometryResult.geometry : null

  const layers = useMemo(() => {
    if (!g) return []
    return buildTimberFloorLayers(g, { wastePct, joistDepthMm, grade, deck }).map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [g, wastePct, joistDepthMm, grade, deck, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(ID, 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Labour, suggested from the floor and following it until edited
  const labourSuggestions: LabourSuggestion[] = g ? suggestSuspendedTimberFloorLabour({
    areaM2: g.areaM2, joistNr: g.joistCount + g.extraJoists, plateLm: g.plateLm, dpcLm: g.dpcLm, hangerNr: g.hangerCount, struttingLm: g.struttingLm, deckAreaM2: g.deckAreaM2,
    coverAreaM2: g.coverAreaM2, coverKind: g.groundCover, coverVolumeM3: g.coverVolumeM3, insulationAreaM2: g.insulationAreaM2, vclAreaM2: g.vclAreaM2,
  }) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useCalcState<LabourLine[] | null>(ID, 'labourOverride', null)
  const suggestedRef = React.useRef<LabourLine[]>([])
  suggestedRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines
  const addLabour = () => setLabourOverride(prev => { const b = prev ?? suggestedRef.current; return [...b, { id: newLabourLineId(), tradeId: b[0]?.tradeId ?? '', task: '', hours: 0 }] })
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourOverride(prev => (prev ?? suggestedRef.current).map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourOverride(prev => (prev ?? suggestedRef.current).filter(l => l.id !== id))

  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const materialLines = [...(g ? costedLines : []), ...miscCostedLines]
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

  // The customer's description follows the floor until it's edited by hand
  const descInput = g ? {
    kind, areaM2: g.areaM2, spanM: g.spanM, centresMm, joistDepthMm, grade: grade.toUpperCase(), carry, extraJoists: g.extraJoists, sleeperRows: g.sleeperRows, strutting: g.struttingLm > 0,
    insulationMm: g.insulationMm, vcl: g.vclAreaM2 > 0, deck, groundCover: g.groundCover,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeSuspendedTimberFloorShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeSuspendedTimberFloor(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step?: number) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the floor</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the floor — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}<span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{hint}</span></span>
    </label>
  )
  const joistWarning = joistCheck.status === 'ok' ? null
    : joistCheck.status === 'under'
      ? `A 47 × ${joistDepthMm}mm ${grade.toUpperCase()} joist at ${centresMm}mm centres manages about ${(joistCheck.maxSpanMm / 1000).toFixed(2)}m, and this ${(subSpanMm / 1000).toFixed(2)}m span is longer: try ${joistCheck.suggestedDepthMm}mm joists${ground ? ' or a sleeper wall to split the span' : ''}.`
      : `No 47mm solid joist spans ${(subSpanMm / 1000).toFixed(2)}m at ${centresMm}mm centres${joistCheck.closerCentres ? ` (${joistCheck.closerCentres.depthMm}mm joists would at ${joistCheck.closerCentres.centresMm}mm centres)` : ''}: use ${ground ? 'sleeper walls, ' : ''}an engineered joist or a beam, and have it designed.`

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
        <NumInput type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))} style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        {g && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {g && <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />}
        {onSave && g && (
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

      {/* An engine error is a banner above the controls, never instead of them: typing a value digit by digit passes through invalid ones. */}
      {!geometryResult.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {geometryResult.error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {g && (<>
            <TimberFloorSectionSvg kind={kind} joistDepthMm={joistDepthMm} insulationMm={g.insulationMm} deck={deck} hangers={carry === 'hangers'} sleeper={g.sleeperRows > 0} cover={g.groundCover} />
            {joistWarning && <div style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {joistWarning}</div>}
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.areaM2.toFixed(1)} m², perimeter {g.perimeterLm.toFixed(1)}m: joists span {g.spanM.toFixed(2)}m, the floor is {g.widthM.toFixed(2)}m along the walls.
              {' '}{g.joistCount + g.extraJoists} joists of {g.joistLengthM.toFixed(2)}m ({g.joistLm.toFixed(1)}lm), {g.deckSheets.toFixed(1)} sheets of decking.
              {joistCheck.status === 'ok' && <> The joists manage up to {(joistCheck.maxSpanMm / 1000).toFixed(2)}m at these centres.</>}
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Which floor">
            <select value={kind} onChange={e => pickKind(e.target.value as FloorKind)} style={propInput}>
              {(Object.keys(FLOOR_KINDS) as FloorKind[]).map(k => <option key={k} value={k}>{FLOOR_KINDS[k].label}</option>)}
            </select>
          </PropRow>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}><PropRow label="Floor area (m²) — from the drawing">{numInput(areaM2, setAreaM2, 0, 0.5)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Perimeter (m)">{numInput(perimeterLm, setPerimeterLm, 0, 0.5)}</PropRow></div>
          </div>

          <CollapsibleSection title="Joists" borderColor="#bae6fd">
            <PropRow label="Joist span between the walls (mm)">{numInput(spanMm, n => setSpanOverride(n), 1, 50)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>
              {spanOverride === null ? `Follows the shorter side of the drawn floor (${sides.short.toFixed(2)}m × ${sides.long.toFixed(2)}m). Type over it if the joists run the other way or the floor is not a rectangle.`
                : <button onClick={() => setSpanOverride(null)} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Set by you — follow the drawn shape again</button>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Joist depth (47mm wide)">
                <select value={joistDepthMm} onChange={e => setJoistDepthMm(+e.target.value)} style={propInput}>
                  {JOIST_DEPTHS_MM.map(d => <option key={d} value={d}>{d}mm</option>)}
                </select>
              </PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Timber grade">
                <select value={grade} onChange={e => setGrade(e.target.value as JoistGrade)} style={propInput}>
                  <option value="c16">C16</option><option value="c24">C24</option>
                </select>
              </PropRow></div>
            </div>
            <PropRow label="Joist centres (mm)">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ width: 90 }}>{numInput(centresMm, setCentresMm, 1, 10)}</div>
                {JOIST_CENTRES_MM.map(t => (
                  <button key={t} onClick={() => setCentresMm(t)}
                    style={{ fontSize: 11, padding: '3px 7px', borderRadius: 4, border: '1px solid #bae6fd', background: centresMm === t ? '#0369a1' : '#fff', color: centresMm === t ? '#fff' : '#0369a1', cursor: 'pointer' }}>{t}</button>
                ))}
              </div>
            </PropRow>
            <PropRow label="How the joists are carried">
              <select value={carry} onChange={e => setCarry(e.target.value as JoistCarry)} style={propInput}>
                {(Object.keys(CARRY_LABEL) as JoistCarry[]).map(k => <option key={k} value={k}>{CARRY_LABEL[k]}</option>)}
              </select>
            </PropRow>
            <PropRow label="Extra joists: doubled, trimming (nr)">{numInput(extraJoists, n => setExtraJoists(Math.round(n)), 0, 1)}</PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>Under walls, or round a stairwell or loft hatch.</div>
          </CollapsibleSection>

          {ground && (
            <CollapsibleSection title="The void under a ground floor" borderColor="#bae6fd">
              <PropRow label="Rows of sleeper wall in the void">{numInput(sleeperRows, n => setRowsOverride(Math.round(n)), 0, 1)}</PropRow>
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>
                {rowsOverride === null ? `Worked out from the joist and the span (${autoRows}). Sleeper walls are priced under External Walls, not here.`
                  : <button onClick={() => setRowsOverride(null)} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Set by you — work it out again</button>}
              </div>
              <PropRow label="Ground cover under the floor">
                <select value={groundCover} onChange={e => setGroundCover(e.target.value as GroundCover)} style={propInput}>
                  {(Object.keys(GROUND_COVER_LABEL) as GroundCover[]).map(k => <option key={k} value={k}>{GROUND_COVER_LABEL[k]}</option>)}
                </select>
              </PropRow>
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Insulation and decking" borderColor="#bae6fd">
            <PropRow label={ground ? 'Insulation between the joists' : 'Insulation between the joists (sound and warmth)'}>
              <select value={insulationMm} onChange={e => setInsulationMm(+e.target.value)} style={propInput}>
                {QUILT_THICKNESSES_MM.map(t => <option key={t} value={t}>{t === 0 ? 'None' : `${t}mm mineral wool`}</option>)}
              </select>
            </PropRow>
            {check('Vapour control layer', vcl, setVcl, 'Polythene over the joists, under the decking')}
            <PropRow label="Decking">
              <select value={deck} onChange={e => setDeck(e.target.value as DeckKind)} style={propInput}>
                {(Object.keys(DECK_KINDS) as DeckKind[]).map(k => <option key={k} value={k}>{DECK_KINDS[k].label}</option>)}
              </select>
            </PropRow>
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}><input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="floor"
        />
        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {g && (
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

// ── A section across the joists: the walls either side, the joists with insulation between them, the decking on top (and for a ground floor, the void and ground below) ──
function TimberFloorSectionSvg({ kind, joistDepthMm, insulationMm, deck, hangers, sleeper, cover }: { kind: FloorKind; joistDepthMm: number; insulationMm: number; deck: DeckKind; hangers: boolean; sleeper: boolean; cover: GroundCover }) {
  const vbW = 430, vbH = 230
  const x0 = 60, x1 = vbW - 50
  const ground = kind === 'ground'
  const joistH = Math.max(joistDepthMm * 0.2, 20)
  const deckH = deck === 'ply-18' ? 6 : 7
  const insH = insulationMm > 0 ? Math.min(Math.max(insulationMm * 0.2, 6), joistH - 2) : 0
  const bottom = vbH - 18
  const groundH = ground ? 14 : 0
  const coverH = ground && cover !== 'none' ? (cover === 'concrete' ? 8 : 5) : 0
  const voidH = ground ? 60 : 0
  const joistBottom = bottom - groundH - coverH - voidH - (ground ? 0 : 30)
  const joistTop = joistBottom - joistH
  const deckTop = joistTop - deckH
  const n = 6
  const gap = (x1 - x0 - 16) / (n - 1)
  const joists = Array.from({ length: n }).map((_, i) => x0 + 8 + i * gap)
  const wallTop = deckTop - 20
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 230, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={20} y={wallTop} width={x0 - 20} height={bottom - wallTop - groundH + (ground ? 0 : 0)} fill="#d6d3d1" stroke="#57534e" />
      <rect x={x1} y={wallTop} width={30} height={bottom - wallTop - groundH} fill="#d6d3d1" stroke="#57534e" />
      <text x={40} y={wallTop - 5} fontSize={9} fill="#57534e" textAnchor="middle">Wall</text>
      {ground && <rect x={x0} y={bottom - groundH} width={x1 - x0} height={groundH} fill="#a8a29e" stroke="#78716c" />}
      {coverH > 0 && <rect x={x0} y={bottom - groundH - coverH} width={x1 - x0} height={coverH} fill={cover === 'concrete' ? '#cbd5e1' : '#e7e5e4'} stroke="#78716c" />}
      {ground && <text x={x0 + 70} y={joistBottom + voidH / 2 + 4} fontSize={10} fill="#94a3b8" textAnchor="middle">Ventilated void</text>}
      {sleeper && <>
        <rect x={(x0 + x1) / 2 - 12} y={joistBottom + 4} width={24} height={voidH - 4} fill="#d6d3d1" stroke="#57534e" />
      </>}
      {!ground && <text x={(x0 + x1) / 2} y={joistBottom + 20} fontSize={10} fill="#94a3b8" textAnchor="middle">{kind === 'upper' ? 'Room below (ceiling priced separately)' : 'Ceiling below (priced separately)'}</text>}
      <rect x={x0} y={deckTop} width={x1 - x0} height={deckH} fill="#e7d3b0" stroke="#78716c" />
      {insH > 0 && joists.slice(0, -1).map((jx, i) => <rect key={i} x={jx + 4} y={joistBottom - insH} width={gap - 8} height={insH} fill="#fde68a" stroke="#a16207" />)}
      {joists.map((jx, i) => <rect key={i} x={jx - 3} y={joistTop} width={6} height={joistH} fill="#b45309" stroke="#78350f" />)}
      {hangers ? <>
        <rect x={x0 - 4} y={joistTop} width={4} height={joistH} fill="#64748b" />
        <rect x={x1} y={joistTop} width={4} height={joistH} fill="#64748b" />
      </> : <>
        <rect x={x0} y={joistBottom} width={26} height={5} fill="#92400e" />
        <rect x={x1 - 26} y={joistBottom} width={26} height={5} fill="#92400e" />
      </>}
      <text x={(x0 + x1) / 2} y={deckTop - 5} fontSize={10} fill="#78350f" textAnchor="middle">Decking · joists 47 × {joistDepthMm}{insH > 0 ? ` · insulation ${insulationMm}` : ''}</text>
    </svg>
  )
}
