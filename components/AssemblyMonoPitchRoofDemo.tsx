'use client'

/**
 * Assembly Calculator — Mono-pitch / lean-to roof structure (Roof → Roof Structure → "Mono-pitch / lean-to
 * roof"). The simplest pitched roof: rafters sloping one way, low (eaves) wall at one end, high wall at the
 * other. Sized like every Roof-phase calculator from the drawn shape's bounding box, with the eaves length
 * along one side and the plan span (low wall to high wall) along the other — set which is which if the roof
 * was drawn the other way round with the Swap button. The rafter section is checked against the flat roof's
 * own span chart (lib/flat-roof-joist-spans.ts), using this roof's true, sloped rafter length as the span —
 * the same span-chart module every flat-roof joist already uses. See lib/mono-pitch-roof.ts for the geometry.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import {
  calculateMonoPitchRoofGeometry, monoPitchRafterLayout, openingTrimZoneMm, RAFTER_THICKNESS_MM,
  type MonoPitchWallConnection, type MonoPitchRoofGeometry, type MonoPitchOpening, type MonoPitchOpeningKind,
} from '@/lib/mono-pitch-roof'
import { describeMonoPitchRoof, describeMonoPitchRoofShort } from '@/lib/mono-pitch-roof-description'
import { suggestMonoPitchRoofLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'
import {
  checkFlatRoofJoist, flatRoofSpanChart, DEFAULT_JOIST_SPAN_LOADS, SPAN_CHART_CENTRES_MM,
  type JoistSpanLoads, type SolidJoistGrade,
} from '@/lib/flat-roof-joist-spans'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, miniInput, PropRow, BreakdownTable, CollapsibleSection,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons, newOpeningId,
} from '@/components/assembly-ui'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
  externalWidthMm?: number
}

// Its own copy of rafter/timber pricing — every calculator screen here prices its own timber, not shared
// runtime state with the flat roof screen (see lib/rooflight-description.ts for why lib modules don't
// import each other's runtime code; screens keep the same self-contained habit for their sample rates).
const TIMBER_DEPTHS_MM = [100, 125, 150, 175, 200, 225, 250] as const
const C16_PER_LM: Record<number, number> = { 100: 1.90, 125: 2.40, 150: 2.95, 175: 3.55, 200: 4.20, 225: 4.85, 250: 5.60 }
const C24_FACTOR = 1.10
function timberRate(grade: SolidJoistGrade, depthMm: number): number {
  const c16 = C16_PER_LM[depthMm] ?? C16_PER_LM[175]
  return +(grade === 'c24' ? c16 * C24_FACTOR : c16).toFixed(2)
}

const WALL_CONNECTION_LABEL: Record<MonoPitchWallConnection, string> = {
  ledger: 'Ledger bolted to the existing wall, rafters in hangers',
  bearing: 'Rafters bear on their own wall plate, strapped',
}

// Roof windows and the like — the units themselves are supplied and fitted under Roof → Rooflights &
// Dormers; this calculator only forms the opening (trimmed rafters and a kerb). Same kinds and starting
// sizes as the flat roof, and the same plan-position convention: widthMm across the rafters, depthMm up
// the (plan) slope, offsetMm from the left, offsetSpanMm from the low (eaves) wall.
const KIND_LABEL: Record<MonoPitchOpeningKind, string> = {
  lantern: 'Lantern', 'roof-window': 'Roof window', dome: 'Dome rooflight', hatch: 'Access hatch',
}
const KIND_SHORT: Record<MonoPitchOpeningKind, string> = {
  lantern: 'Lantern', 'roof-window': 'Window', dome: 'Dome', hatch: 'Hatch',
}
const KIND_STYLE: Record<MonoPitchOpeningKind, { fill: string; stroke: string }> = {
  lantern: { fill: '#ccfbf1', stroke: '#0f766e' },
  'roof-window': { fill: '#dbeafe', stroke: '#1d4ed8' },
  dome: { fill: '#fef3c7', stroke: '#b45309' },
  hatch: { fill: '#e5e7eb', stroke: '#4b5563' },
}
const KIND_DEFAULTS: Record<MonoPitchOpeningKind, { widthMm: number; depthMm: number; trimmers: 2 | 3; kerbHeightMm: number }> = {
  lantern: { widthMm: 1500, depthMm: 1000, trimmers: 3, kerbHeightMm: 200 },
  'roof-window': { widthMm: 900, depthMm: 900, trimmers: 2, kerbHeightMm: 150 },
  dome: { widthMm: 900, depthMm: 900, trimmers: 2, kerbHeightMm: 150 },
  hatch: { widthMm: 600, depthMm: 600, trimmers: 2, kerbHeightMm: 150 },
}
const TRIMMER_COLOUR = '#b45309'

// A new opening goes in the first free spot: scanning along the eaves, then up the span, for a gap that
// clears every opening already there by 300mm (room for the trimmers and kerbs) — same approach as the
// flat roof's own newOpening.
function newMonoPitchOpening(kind: MonoPitchOpeningKind, existing: MonoPitchOpening[], lengthMm: number, spanMm: number): MonoPitchOpening {
  const d = KIND_DEFAULTS[kind]
  const gap = 300
  const room = openingTrimZoneMm({ trimmers: d.trimmers }) + 100
  const maxX = Math.max(0, lengthMm - d.widthMm - room)
  const maxY = Math.max(0, spanMm - d.depthMm - room)
  const clashes = (x: number, y: number) => existing.some(o =>
    x < o.offsetMm + o.widthMm + gap && o.offsetMm < x + d.widthMm + gap &&
    y < o.offsetSpanMm + o.depthMm + gap && o.offsetSpanMm < y + d.depthMm + gap)
  const startY = Math.max(room, Math.min(maxY, 600))
  let spot = { x: Math.min(maxX, 300), y: Math.min(maxY, startY) }
  search: for (let y = startY; y <= maxY; y += 200) {
    for (let x = 300; x <= maxX; x += 100) {
      if (!clashes(x, y)) { spot = { x, y }; break search }
    }
  }
  return {
    id: newOpeningId(), kind, widthMm: d.widthMm, depthMm: d.depthMm,
    offsetMm: spot.x, offsetSpanMm: spot.y, trimmers: d.trimmers, kerbHeightMm: d.kerbHeightMm,
  }
}

export default function AssemblyMonoPitchRoofDemo({ onClose, onSave, labourTrades = [], externalLengthMm, externalWidthMm }: Props) {
  const [name, setName]         = useState('Mono-Pitch Roof Structure')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  const [spanMm, setSpanMm]     = useState(externalWidthMm ?? 3000)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  useEffect(() => { if (externalWidthMm != null) setSpanMm(externalWidthMm) }, [externalWidthMm])
  function swapLengthSpan() { setLengthMm(spanMm); setSpanMm(lengthMm) }

  const [pitchDeg, setPitchDeg] = useState(15)
  const [rafterCentresMm, setRafterCentresMm] = useState(400)
  const [eavesOverhangMm, setEavesOverhangMm] = useState(300)
  const [highWallConnection, setHighWallConnection] = useState<MonoPitchWallConnection>('ledger')

  const [rafterGrade, setRafterGrade] = useState<SolidJoistGrade>('c24')
  const [rafterDepthMm, setRafterDepthMm] = useState(150)
  const [spanLoads, setSpanLoads] = useState<JoistSpanLoads>(DEFAULT_JOIST_SPAN_LOADS)
  const [depthPicked, setDepthPicked] = useState(false)

  // Roof windows — start empty, never pre-seeded (the calculator defaults rule).
  const [openings, setOpenings] = useState<MonoPitchOpening[]>([])
  function addOpening(kind: MonoPitchOpeningKind) { setOpenings(prev => [...prev, newMonoPitchOpening(kind, prev, lengthMm, spanMm)]) }
  function updateOpening(id: string, patch: Partial<MonoPitchOpening>) { setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o)) }
  function removeOpening(id: string) { setOpenings(prev => prev.filter(o => o.id !== id)) }

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateMonoPitchRoofGeometry({ lengthMm, spanMm, pitchDeg, rafterCentresMm, eavesOverhangMm, highWallConnection, openings }) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [lengthMm, spanMm, pitchDeg, rafterCentresMm, eavesOverhangMm, highWallConnection, openings])
  const g: MonoPitchRoofGeometry | null = geometryResult.ok ? geometryResult.geometry : null

  const spanChart = useMemo(() => flatRoofSpanChart(rafterGrade, spanLoads), [rafterGrade, spanLoads])
  const rafterCheck = useMemo(
    () => checkFlatRoofJoist({ grade: rafterGrade, depthMm: rafterDepthMm, centresMm: rafterCentresMm, spanMm: g?.rafterRunMm ?? 0, loads: spanLoads }),
    [rafterGrade, rafterDepthMm, rafterCentresMm, g, spanLoads],
  )
  useEffect(() => {
    if (!depthPicked && rafterCheck.suggestedDepthMm != null) setRafterDepthMm(rafterCheck.suggestedDepthMm)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rafterCheck.suggestedDepthMm, depthPicked])

  const rafterSectionLabel = `47×${rafterDepthMm} ${rafterGrade.toUpperCase()}`
  const rafterRate = timberRate(rafterGrade, rafterDepthMm)

  const [wastePct, setWastePct] = useState(5)
  const [profitPct, setProfitPct] = useState(20)
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const layers: AssemblyLayerDef[] = useMemo(() => {
    if (!g) return []
    const out: AssemblyLayerDef[] = []
    out.push({ id: 'rafters', name: `${rafterSectionLabel} rafters`, category: 'materials', source: 'fixed', fixedQty: g.rafterLm, unit: 'lm', unitCost: rafterRate, wastePct })
    if (g.wallPlateLm > 0) out.push({ id: 'wall_plate', name: 'Wall plate 100×50 treated', category: 'materials', source: 'fixed', fixedQty: g.wallPlateLm, unit: 'lm', unitCost: 2.80, wastePct })
    if (g.ledgerLm > 0) {
      const ledgerDepth = TIMBER_DEPTHS_MM.find(d => d >= rafterDepthMm) ?? 250
      out.push({ id: 'ledger', name: `Ledger plate 47×${ledgerDepth} treated (bolted to the existing wall)`, category: 'materials', source: 'fixed', fixedQty: g.ledgerLm, unit: 'lm', unitCost: timberRate('c24', ledgerDepth), wastePct })
      out.push({ id: 'ledger_bolts', name: 'M12 anchor bolts and washers (ledger to wall, 600 centres)', category: 'materials', source: 'fixed', fixedQty: g.ledgerBoltCount, unit: 'nr', unitCost: 3.80, roundToWhole: true })
    }
    if (g.hangerCount > 0) out.push({ id: 'hangers', name: 'Joist hangers', category: 'materials', source: 'fixed', fixedQty: g.hangerCount, unit: 'nr', unitCost: 2.40, roundToWhole: true })
    if (g.strapCount > 0) out.push({ id: 'straps', name: 'Lateral restraint straps', category: 'materials', source: 'fixed', fixedQty: g.strapCount, unit: 'nr', unitCost: 4.20, roundToWhole: true })
    if (g.trimLm > 0) out.push({ id: 'trimmers', name: `${rafterSectionLabel} — trimmers and headers round the rooflight openings`, category: 'materials', source: 'fixed', fixedQty: g.trimLm, unit: 'lm', unitCost: rafterRate, wastePct })
    if (g.kerbLm > 0) {
      out.push({ id: 'kerb_timber', name: 'Kerb timber 47×150 (rooflight kerbs)', category: 'materials', source: 'fixed', fixedQty: g.kerbLm, unit: 'lm', unitCost: 3.60, wastePct })
      out.push({ id: 'kerb_cladding', name: 'Kerb cladding 18mm ply', category: 'materials', source: 'fixed', fixedQty: g.kerbFaceAreaM2, unit: 'm²', unitCost: 7.50, wastePct })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, rafterSectionLabel, rafterRate, rafterDepthMm, wastePct])

  const costedLines: CostedLine[] = useMemo(() => layers.map(l => {
    const withRate = rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l
    return costLayer(withRate, withRate.fixedQty ?? 0)
  }), [layers, rateOverrides])
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

  // Labour — the carpenter fixing the wall plate/ledger, rafters, trimmers and kerbs, following the roof
  // until edited by hand. Fitting the rooflights themselves is optional — off by default, since it's
  // normally priced under Roof → Rooflights & Dormers instead.
  const [includeFitting, setIncludeFitting] = useState(false)
  const labourSuggestions: LabourSuggestion[] = g ? suggestMonoPitchRoofLabour({ ...g, openings }) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, includeFitting)
  const [labourOverride, setLabourOverride] = useState<LabourLine[] | null>(null)
  const suggestedRef = useRef<LabourLine[]>([])
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
  const descInput = g ? {
    lengthM: g.lengthM, spanM: g.spanM, pitchDeg: g.pitchDeg, rafterCount: g.rafterCount, rafterSectionLabel, highWallConnection, slopeAreaM2: g.slopeAreaM2,
    openings: openings.map(o => ({ kind: o.kind, widthMm: o.widthMm, depthMm: o.depthMm, trimmers: o.trimmers ?? 2 })),
  } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describeMonoPitchRoofShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeMonoPitchRoof(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the roof</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the roof — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the roof</button>

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
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Plan — drag a rooflight to move it</div>
            <MonoPitchPlanSvg
              lengthMm={lengthMm} spanMm={spanMm} centresMm={rafterCentresMm} openings={openings}
              onMoveOpening={(id, offsetMm, offsetSpanMm) => updateOpening(id, { offsetMm, offsetSpanMm })}
            />
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 10, marginBottom: 3 }}>Section</div>
            <MonoPitchSectionSvg g={g} eavesOverhangMm={eavesOverhangMm} highWallConnection={highWallConnection} />
            {g.warnings.map((w, i) => (
              <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {g.rafterCount} rafters, true length {(g.rafterRunMm / 1000).toFixed(2)}m each ({g.rafterLm.toFixed(1)}lm total). Rise over the span: {(g.riseMm / 1000).toFixed(2)}m. Slope area {g.slopeAreaM2.toFixed(1)}m².
            </div>
            <RafterSpanPanel
              chart={spanChart} check={rafterCheck} grade={rafterGrade} spanMm={g.rafterRunMm} centresMm={rafterCentresMm} depthMm={rafterDepthMm}
              picked={depthPicked} loads={spanLoads} onLoads={setSpanLoads}
              onUse={() => { if (rafterCheck.suggestedDepthMm != null) { setRafterDepthMm(rafterCheck.suggestedDepthMm); setDepthPicked(true) } }}
              onPick={(d, c) => { setRafterDepthMm(d); setRafterCentresMm(c); setDepthPicked(true) }}
            />
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><PropRow label="Eaves length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Plan span (mm)">{numInput(spanMm, setSpanMm, 1)}</PropRow></div>
            <button onClick={swapLengthSpan} title="Swap eaves length and span — if the roof was drawn the other way round"
              style={{ fontSize: 11, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', color: '#64748b', cursor: 'pointer', marginBottom: 1 }}>⇄ Swap</button>
          </div>

          <CollapsibleSection title="Pitch and rafters" borderColor="#bae6fd">
            <PropRow label={`Pitch (${pitchDeg}°)`}>
              <input type="range" min={5} max={60} value={pitchDeg} onChange={e => setPitchDeg(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Rafter centres (mm)">
                <select value={rafterCentresMm} onChange={e => { setRafterCentresMm(+e.target.value); setDepthPicked(false) }} style={propInput}>
                  {SPAN_CHART_CENTRES_MM.map(c => <option key={c} value={c}>{c}mm</option>)}
                </select>
              </PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Eaves overhang (mm)">{numInput(eavesOverhangMm, setEavesOverhangMm, 0)}</PropRow></div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Rafter grade">
                <select value={rafterGrade} onChange={e => { setRafterGrade(e.target.value as SolidJoistGrade); setDepthPicked(false) }} style={propInput}>
                  <option value="c16">C16</option>
                  <option value="c24">C24</option>
                </select>
              </PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Rafter section">
                <select value={rafterDepthMm} onChange={e => { setRafterDepthMm(+e.target.value); setDepthPicked(true) }} style={propInput}>
                  {TIMBER_DEPTHS_MM.map(d => <option key={d} value={d}>47×{d}</option>)}
                </select>
              </PropRow></div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="High wall connection" borderColor="#bae6fd">
            <PropRow label="How the rafters meet the high wall">
              <select value={highWallConnection} onChange={e => setHighWallConnection(e.target.value as MonoPitchWallConnection)} style={propInput}>
                {(Object.entries(WALL_CONNECTION_LABEL) as [MonoPitchWallConnection, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>The low (eaves) wall always gets a wall plate. This is only for the high wall — an existing wall the lean-to is built against.</div>
          </CollapsibleSection>

          <CollapsibleSection title="Rooflight openings" borderColor="#bae6fd">
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, lineHeight: 1.4 }}>
              This forms the opening — trimmed rafters and a kerb. The rooflight itself is priced separately, under Roof → Rooflights &amp; Dormers.
            </div>
            {openings.map((o, i) => (
              <div key={o.id} style={{ border: '1px solid #e2e8f0', borderRadius: 5, padding: 6, marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', minWidth: 14 }}>{i + 1}</span>
                  <select value={o.kind} onChange={e => {
                    const kind = e.target.value as MonoPitchOpeningKind
                    updateOpening(o.id, { kind, trimmers: KIND_DEFAULTS[kind].trimmers, kerbHeightMm: KIND_DEFAULTS[kind].kerbHeightMm })
                  }} style={{ ...miniInput, flex: 1 }}>
                    {(Object.entries(KIND_LABEL) as [MonoPitchOpeningKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <button onClick={() => removeOpening(o.id)} aria-label={`Remove opening ${i + 1}`}
                    style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>×</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>Width</div>
                    <input type="number" min={1} value={o.widthMm} onChange={e => updateOpening(o.id, { widthMm: Math.max(1, +e.target.value || 0) })} style={miniInput} /></div>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>Length</div>
                    <input type="number" min={1} value={o.depthMm} onChange={e => updateOpening(o.id, { depthMm: Math.max(1, +e.target.value || 0) })} style={miniInput} /></div>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>From left</div>
                    <input type="number" min={0} value={o.offsetMm} onChange={e => updateOpening(o.id, { offsetMm: Math.max(0, +e.target.value || 0) })} style={miniInput} /></div>
                  <div><div style={{ fontSize: 9, color: '#94a3b8' }}>From low wall</div>
                    <input type="number" min={0} value={o.offsetSpanMm} onChange={e => updateOpening(o.id, { offsetSpanMm: Math.max(0, +e.target.value || 0) })} style={miniInput} /></div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  <label style={{ fontSize: 9, color: '#94a3b8' }}>Trimmers</label>
                  <select value={o.trimmers ?? 2} onChange={e => updateOpening(o.id, { trimmers: +e.target.value as 2 | 3 })} style={miniInput}>
                    <option value={2}>Doubled</option>
                    <option value={3}>Tripled</option>
                  </select>
                  <label style={{ fontSize: 9, color: '#94a3b8' }}>Kerb (mm)</label>
                  <input type="number" min={0} value={o.kerbHeightMm ?? 200} onChange={e => updateOpening(o.id, { kerbHeightMm: Math.max(0, +e.target.value || 0) })} style={miniInput} />
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {(Object.keys(KIND_LABEL) as MonoPitchOpeningKind[]).map(k => (
                <button key={k} onClick={() => addOpening(k)}
                  style={{ fontSize: 11, padding: '3px 8px', border: '1px dashed #7dd3fc', borderRadius: 999, background: 'none', color: '#0369a1', cursor: 'pointer' }}>
                  + {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}>
            <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}>
            <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={includeFitting} onIncludeFitting={setIncludeFitting}
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

// ── The rafter span check — the flat roof's own span chart, checked against this roof's true (sloped)
// rafter length. A trimmed-down copy of AssemblyFlatRoofDemo's own SpanChartPanel: same chart, same
// working, since Posi-joists aren't offered here (a lean-to's rafters are cut roof, not manufactured). ──
function RafterSpanPanel({ chart, check, grade, spanMm, centresMm, depthMm, picked, loads, onLoads, onUse, onPick }: {
  chart: ReturnType<typeof flatRoofSpanChart>
  check: ReturnType<typeof checkFlatRoofJoist>
  grade: SolidJoistGrade
  spanMm: number
  centresMm: number
  depthMm: number
  picked: boolean
  loads: JoistSpanLoads
  onLoads: (l: JoistSpanLoads) => void
  onUse: () => void
  onPick: (depthMm: number, centresMm: number) => void
}) {
  const span = (spanMm / 1000).toFixed(2)
  const bad = check.status !== 'ok'
  const cell = (spanOfCell: number, isChosen: boolean): React.CSSProperties => ({
    padding: '2px 4px', textAlign: 'center', cursor: 'pointer',
    background: spanOfCell >= spanMm ? '#dcfce7' : '#f8fafc',
    color: spanOfCell >= spanMm ? '#166534' : '#94a3b8',
    outline: isChosen ? '2px solid #0369a1' : 'none', outlineOffset: -2,
    fontWeight: isChosen ? 700 : 400,
  })
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, lineHeight: 1.45, color: bad ? '#c0392b' : '#166534' }}>
        {check.status === 'ok' && <>✓ 47×{depthMm} {grade.toUpperCase()} works for the {span}m true rafter length at {centresMm}mm centres (up to {(check.maxSpanMm / 1000).toFixed(2)}m).</>}
        {check.status === 'under' && <>⚠ 47×{depthMm} {grade.toUpperCase()} is too small for the {span}m true rafter length at {centresMm}mm centres — it manages {(check.maxSpanMm / 1000).toFixed(2)}m. The chart says 47×{check.suggestedDepthMm}.</>}
        {check.status === 'beyond' && <>⚠ A {span}m true rafter length at {centresMm}mm centres is beyond solid timber.{check.closerCentres ? <> It works at {check.closerCentres.centresMm}mm centres in 47×{check.closerCentres.depthMm}.</> : <> Use an engineer's design.</>}</>}
        {check.suggestedDepthMm != null && check.suggestedDepthMm !== depthMm && (
          <button onClick={onUse}
            style={{ marginLeft: 6, fontSize: 11, background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
            Use 47×{check.suggestedDepthMm}
          </button>
        )}
      </div>
      {!picked && check.suggestedDepthMm != null && (
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>The section follows the span chart until you pick one yourself.</div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary style={{ fontSize: 11, color: '#0369a1', cursor: 'pointer' }}>Span chart — {grade.toUpperCase()} rafters, longest span in metres</summary>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginTop: 4 }}>
          <thead>
            <tr style={{ color: '#64748b' }}>
              <th style={{ textAlign: 'left', fontWeight: 600, padding: '2px 4px' }}>Section</th>
              {SPAN_CHART_CENTRES_MM.map(c => <th key={c} style={{ fontWeight: 600, padding: '2px 4px', background: c === centresMm ? '#e0f2fe' : 'none' }}>{c}mm</th>)}
            </tr>
          </thead>
          <tbody>
            {chart.map(row => (
              <tr key={row.depthMm}>
                <td style={{ padding: '2px 4px', fontWeight: row.depthMm === depthMm ? 700 : 400 }}>47×{row.depthMm}</td>
                {SPAN_CHART_CENTRES_MM.map(c => (
                  <td key={c} onClick={() => onPick(row.depthMm, c)} title={`Use 47×${row.depthMm} at ${c}mm centres`}
                    style={cell(row.spansMm[c], row.depthMm === depthMm && c === centresMm)}>
                    {(row.spansMm[c] / 1000).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
          Green reaches the {span}m true rafter length (span plus the eaves overhang, along the slope). Click a cell to use that section and those centres.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', fontSize: 10, color: '#64748b' }}>
          <label>Roof build-up load (kN/m²)
            <input type="number" step={0.05} min={0.2} value={loads.deadKnM2} onChange={e => onLoads({ ...loads, deadKnM2: Math.max(0.2, +e.target.value || 0.2) })}
              style={{ ...miniInput, width: 56, marginLeft: 4 }} />
          </label>
          <label>Snow / access (kN/m²)
            <input type="number" step={0.05} min={0.25} value={loads.imposedKnM2} onChange={e => onLoads({ ...loads, imposedKnM2: Math.max(0.25, +e.target.value || 0.25) })}
              style={{ ...miniInput, width: 56, marginLeft: 4 }} />
          </label>
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>
          Worked out cautiously from timber beam formulae (deflection to 0.003 × span, creep included) — a pricing guide, not a design. Check the span tables or an engineer.
        </div>
      </details>
    </div>
  )
}

// ── The roof in plan: the eaves length across, the plan span down (low/eaves wall at the bottom, high wall
// at the top — the natural way round to read it, roughly as the roof would appear from the garden). Rafters
// are drawn from the engine's own layout, so a rafter an opening cuts short is drawn only where it's there;
// each opening's trimmers (doubled or tripled, to scale) are drawn round it. An opening can be dragged to a
// new spot, snapped to the nearest 50mm — the same convention the flat roof's own plan view uses. ──
function MonoPitchPlanSvg({ lengthMm, spanMm, centresMm, openings, onMoveOpening }: {
  lengthMm: number
  spanMm: number
  centresMm: number
  openings: MonoPitchOpening[]
  onMoveOpening: (id: string, offsetMm: number, offsetSpanMm: number) => void
}) {
  const vbW = 430, vbH = 300
  const k = Math.min(340 / lengthMm, 200 / spanMm)
  const w = lengthMm * k, h = spanMm * k
  const x0 = (vbW - w) / 2, y0 = 40
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)

  function pointerMm(e: React.PointerEvent): { x: number; y: number } | null {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return null
    const pt = svg.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const p = pt.matrixTransform(ctm.inverse())
    // x: distance from the left. y: distance from the low (eaves) wall, drawn at the bottom.
    return { x: (p.x - x0) / k, y: (y0 + h - p.y) / k }
  }
  const capture = (e: React.PointerEvent) => { try { (e.target as Element).setPointerCapture(e.pointerId) } catch { /* the drag still works without it */ } }
  function onDown(e: React.PointerEvent, o: MonoPitchOpening) {
    const p = pointerMm(e)
    if (!p) return
    capture(e)
    setDrag({ id: o.id, dx: p.x - o.offsetMm, dy: p.y - o.offsetSpanMm })
  }
  function onMove(e: React.PointerEvent) {
    if (!drag) return
    const p = pointerMm(e)
    if (!p) return
    const o = openings.find(op => op.id === drag.id)
    if (!o) return
    const snap50 = (n: number) => Math.round(n / 50) * 50
    onMoveOpening(o.id,
      Math.max(0, Math.min(Math.max(0, lengthMm - o.widthMm), snap50(p.x - drag.dx))),
      Math.max(0, Math.min(Math.max(0, spanMm - o.depthMm), snap50(p.y - drag.dy))))
  }

  const rafterLines: React.ReactNode[] = []
  for (const r of monoPitchRafterLayout(lengthMm, spanMm, centresMm, openings)) {
    if (r.replaced) continue
    const segments: [number, number][] = []
    let from = 0
    for (const [a, b] of r.cuts) { if (a > from) segments.push([from, a]); from = Math.max(from, b) }
    if (from < spanMm) segments.push([from, spanMm])
    segments.forEach(([a, b], i) => rafterLines.push(
      <line key={`${r.positionMm}-${i}`} x1={x0 + r.positionMm * k} x2={x0 + r.positionMm * k} y1={y0 + h - b * k} y2={y0 + h - a * k} stroke="#b4b2a9" strokeWidth={1} />,
    ))
  }

  const T = RAFTER_THICKNESS_MM
  const trimmerShapes: React.ReactNode[] = []
  const member = (key: string, x: number, y: number, wd: number, ht: number) =>
    <rect key={key} x={x} y={y} width={Math.max(0.8, wd)} height={Math.max(0.8, ht)} fill={TRIMMER_COLOUR} stroke="#fff" strokeWidth={0.4} />
  for (const o of openings) {
    const n = o.trimmers ?? 2
    const right = o.offsetMm + o.widthMm
    const nearY = y0 + h - o.offsetSpanMm * k                    // toward the low wall
    const farY = y0 + h - (o.offsetSpanMm + o.depthMm) * k       // toward the high wall
    for (let i = 0; i < n; i++) {
      trimmerShapes.push(
        member(`${o.id}-tl-${i}`, x0 + (o.offsetMm - (i + 1) * T) * k, y0, T * k, h),
        member(`${o.id}-tr-${i}`, x0 + (right + i * T) * k, y0, T * k, h),
        member(`${o.id}-hn-${i}`, x0 + o.offsetMm * k, nearY + i * T * k, o.widthMm * k, T * k),
        member(`${o.id}-hf-${i}`, x0 + o.offsetMm * k, farY - (i + 1) * T * k, o.widthMm * k, T * k),
      )
    }
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${vbW} ${vbH}`} onPointerMove={onMove} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}
      style={{ width: '100%', height: 260, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, touchAction: 'none' }}>
      <rect x={x0} y={y0} width={w} height={h} fill="#fafaf9" stroke="#78716c" strokeWidth={1.2} />
      {rafterLines}
      {trimmerShapes}
      {openings.map((o, i) => {
        const st = KIND_STYLE[o.kind]
        const rx = x0 + o.offsetMm * k, rw = o.widthMm * k
        const ry = y0 + h - (o.offsetSpanMm + o.depthMm) * k, rh = o.depthMm * k
        const dragging = drag?.id === o.id
        return (
          <g key={o.id}>
            {o.kind === 'dome'
              ? <ellipse cx={rx + rw / 2} cy={ry + rh / 2} rx={rw / 2} ry={rh / 2} fill={st.fill} stroke={dragging ? '#0369a1' : st.stroke} strokeWidth={dragging ? 2.5 : 1.5} cursor="grab" onPointerDown={e => onDown(e, o)} />
              : <rect x={rx} y={ry} width={rw} height={rh} fill={st.fill} stroke={dragging ? '#0369a1' : st.stroke} strokeWidth={dragging ? 2.5 : 1.5} cursor="grab" onPointerDown={e => onDown(e, o)} />}
            <text x={rx + rw / 2} y={ry + rh / 2 + 3} fontSize={9} textAnchor="middle" fill={st.stroke} pointerEvents="none">{i + 1} {KIND_SHORT[o.kind]}</text>
          </g>
        )
      })}
      <text x={x0 + w / 2} y={y0 - 8} fontSize={9} fill="#57534e" textAnchor="middle">High wall</text>
      <text x={x0 + w / 2} y={y0 + h + 16} fontSize={9} fill="#57534e" textAnchor="middle">Low wall — eaves</text>
      <text x={x0 + w / 2} y={y0 + h + 30} fontSize={9} fill="#64748b" textAnchor="middle">{(lengthMm / 1000).toFixed(2)}m × {(spanMm / 1000).toFixed(2)}m plan · {centresMm}mm rafter centres</text>
      {openings.length > 0 && <g transform={`translate(${x0}, ${vbH - 8})`}>
        <line x1={0} x2={16} y1={-3} y2={-3} stroke={TRIMMER_COLOUR} strokeWidth={1.5} /><line x1={0} x2={16} y1={0} y2={0} stroke={TRIMMER_COLOUR} strokeWidth={1.5} />
        <text x={21} y={0} fontSize={8} fill="#64748b">Trimmer rafters</text>
      </g>}
    </svg>
  )
}

// ── The roof's cross-section: low wall (with wall plate + overhang) at the left, sloped rafter, high wall
// at the right (ledger + hangers, or its own wall plate + strap) — drawn to the pitch so the shape reads
// straight off it, with the plan length noted since the section can't show it. ──
function MonoPitchSectionSvg({ g, eavesOverhangMm, highWallConnection }: { g: MonoPitchRoofGeometry; eavesOverhangMm: number; highWallConnection: MonoPitchWallConnection }) {
  const vbW = 380, vbH = 300
  const spanPx = 220
  const k = spanPx / (g.spanM * 1000)
  const overhangPx = eavesOverhangMm * k
  const risePx = g.riseMm * k
  const lowWallH = 60, highWallH = lowWallH + risePx
  const x0 = 70, xLow = x0, xHigh = x0 + spanPx
  const yBase = 210
  const yLowTop = yBase - lowWallH, yHighTop = yBase - highWallH
  const xEave = xLow - overhangPx
  const yEave = yLowTop - overhangPx * (risePx / spanPx)

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 260, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {/* Low wall */}
      <rect x={xLow - 6} y={yLowTop} width={12} height={lowWallH} fill="#e7e5e4" stroke="#78716c" strokeWidth={1} />
      {/* High wall */}
      <rect x={xHigh - 6} y={yHighTop} width={12} height={highWallH} fill="#e7e5e4" stroke="#78716c" strokeWidth={1} />
      {/* Ground */}
      <line x1={20} x2={vbW - 20} y1={yBase} y2={yBase} stroke="#d6d3d1" strokeWidth={1.5} />
      {/* Rafter, eave to high wall */}
      <line x1={xEave} y1={yEave} x2={xHigh} y2={yHighTop} stroke="#0f766e" strokeWidth={3.5} strokeLinecap="round" />
      {/* Wall plate at low wall */}
      <rect x={xLow - 9} y={yLowTop - 3} width={18} height={6} fill="#b45309" />
      {/* High wall connection */}
      {highWallConnection === 'ledger'
        ? <>
            <rect x={xHigh - 3} y={yHighTop - 16} width={6} height={16} fill="#0369a1" />
            <circle cx={xHigh} cy={yHighTop - 8} r={2.2} fill="#93c5fd" />
            <rect x={xHigh - 10} y={yHighTop - 4} width={10} height={5} fill="#0f766e" />
          </>
        : <rect x={xHigh - 9} y={yHighTop - 3} width={18} height={6} fill="#b45309" />}
      {/* Pitch angle marker */}
      <path d={`M ${xLow + 26} ${yLowTop} A 26 26 0 0 0 ${xLow} ${yLowTop - 26 * (risePx / Math.hypot(spanPx, risePx))}`} fill="none" stroke="#94a3b8" strokeWidth={1} />
      <text x={xLow + 30} y={yLowTop - 4} fontSize={10} fill="#64748b">{g.pitchDeg}°</text>
      {/* Labels */}
      <text x={(xLow + xHigh) / 2} y={yBase + 18} fontSize={9} fill="#64748b" textAnchor="middle">Span {g.spanM.toFixed(2)}m</text>
      <text x={xHigh + 14} y={(yHighTop + yBase) / 2} fontSize={9} fill="#64748b" textAnchor="start" transform={`rotate(90 ${xHigh + 14} ${(yHighTop + yBase) / 2})`}>Rise {(g.riseMm / 1000).toFixed(2)}m</text>
      <text x={xEave - 6} y={yEave - 6} fontSize={9} fill="#64748b" textAnchor="end">Overhang {(eavesOverhangMm / 1000).toFixed(2)}m</text>
      <text x={(xLow + xHigh) / 2} y={30} fontSize={10} fill="#57534e" textAnchor="middle">Eaves length {g.lengthM.toFixed(2)}m (into the page)</text>
      <text x={xLow} y={yBase + 20} fontSize={9} fill="#57534e" textAnchor="middle">Low wall</text>
      <text x={xHigh} y={yBase + 20} fontSize={9} fill="#57534e" textAnchor="middle">High wall</text>
      <g transform={`translate(20, ${vbH - 12})`}>
        <rect x={0} y={-6} width={14} height={6} fill="#b45309" /><text x={19} y={0} fontSize={8} fill="#64748b">Wall plate</text>
        <rect x={90} y={-6} width={14} height={6} fill="#0369a1" /><text x={109} y={0} fontSize={8} fill="#64748b">Ledger</text>
        <line x1={170} x2={184} y1={-3} y2={-3} stroke="#0f766e" strokeWidth={3} /><text x={190} y={0} fontSize={8} fill="#64748b">Rafter</text>
      </g>
    </svg>
  )
}
