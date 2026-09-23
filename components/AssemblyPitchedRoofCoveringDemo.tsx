'use client'

/**
 * Assembly Calculator — Pitched roof covering (Roof → Roof Coverings → pitched). Tiles or slate over battens
 * and a breather membrane, with ridge, hip, verge and abutment trims, priced for whichever roof shape the
 * structure is — mono-pitch, gable or hip, with the same per-end choices (a new gable wall, hipped, or built
 * against an existing wall) those structure calculators offer. This screen calls the structure engines
 * (lib/mono-pitch-roof.ts, lib/gable-roof.ts, lib/hip-roof.ts) directly to work out the roof's own edge
 * lengths — screens have no restriction on importing another lib file's runtime code, only the
 * lib/*-description.ts and lib/*-labour.ts modules do — then hands the covering engine
 * (lib/pitched-roof-covering.ts) just those lengths; it doesn't know or care which roof shape they came from.
 * A ridge only exists for gable and hip; a hip cap follows the hip rafters' own line; a verge runs up the
 * slope at any new-wall gable end; an abutment (lead flashing) runs wherever the roof meets an EXISTING wall
 * instead — always at a mono-pitch's high wall, or any gable/hip end set to 'existing-wall'.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import { calculateMonoPitchRoofGeometry, type MonoPitchWallConnection } from '@/lib/mono-pitch-roof'
import { calculateGableRoofGeometry, type GableEndTreatment } from '@/lib/gable-roof'
import { calculateHipRoofGeometry, type HipEndTreatment } from '@/lib/hip-roof'
import { calculatePitchedRoofCoveringGeometry, type PitchedCoveringMaterial, type PitchedRoofCoveringGeometry } from '@/lib/pitched-roof-covering'
import { describePitchedRoofCovering, describePitchedRoofCoveringShort } from '@/lib/pitched-roof-covering-description'
import { suggestPitchedRoofCoveringLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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

export type PitchedRoofShapeType = 'mono' | 'gable' | 'hip'

const SHAPE_LABEL: Record<PitchedRoofShapeType, string> = { mono: 'Mono-pitch / lean-to', gable: 'Gable ends', hip: 'Hipped' }
const MATERIAL_LABEL: Record<PitchedCoveringMaterial, string> = {
  'concrete-tile': 'Concrete interlocking tile', 'clay-tile': 'Plain clay tile (double lap)',
  'natural-slate': 'Natural slate', 'fibre-cement-slate': 'Fibre cement slate',
}
const MATERIAL_RATE: Record<PitchedCoveringMaterial, number> = { 'concrete-tile': 14, 'clay-tile': 28, 'natural-slate': 45, 'fibre-cement-slate': 20 }
const MONO_CONNECTION_LABEL: Record<MonoPitchWallConnection, string> = { ledger: 'Ledger bolted to the existing wall', bearing: 'Bears on its own wall plate' }
const GABLE_END_LABEL: Record<GableEndTreatment, string> = { gable: 'New gable wall', 'existing-wall': 'Against an existing wall' }
const HIP_END_LABEL: Record<HipEndTreatment, string> = { hip: 'Hipped', gable: 'New gable wall', 'existing-wall': 'Against an existing wall' }

/** Which roof-type/per-end choices give which covering edge lengths — the shape-to-edges wiring lives here,
 * in the screen, since it just calls the already-tested structure engines with no new maths of its own. */
function deriveCoveringEdges(shape: {
  roofType: PitchedRoofShapeType
  lengthMm: number; spanMm: number; pitchDeg: number; eavesOverhangMm: number
  monoHighWallConnection: MonoPitchWallConnection
  gableEndA: GableEndTreatment; gableEndB: GableEndTreatment
  hipEndA: HipEndTreatment; hipEndB: HipEndTreatment
}): { ok: true; slopeAreaM2: number; ridgeLm: number; hipLm: number; vergeLm: number; abutmentLm: number; eavesLm: number; warnings: string[] } | { ok: false; error: string } {
  const { roofType, lengthMm, spanMm, pitchDeg, eavesOverhangMm } = shape
  const PLACEHOLDER_CENTRES_MM = 400 // rafter centres don't affect any covering quantity; a fixed, unexposed value
  try {
    if (roofType === 'mono') {
      const g = calculateMonoPitchRoofGeometry({ lengthMm, spanMm, pitchDeg, eavesOverhangMm, rafterCentresMm: PLACEHOLDER_CENTRES_MM, highWallConnection: shape.monoHighWallConnection })
      return { ok: true, slopeAreaM2: g.slopeAreaM2, ridgeLm: 0, hipLm: 0, vergeLm: 2 * (g.rafterRunMm / 1000), abutmentLm: g.lengthM, eavesLm: g.lengthM, warnings: g.warnings }
    }
    if (roofType === 'gable') {
      const g = calculateGableRoofGeometry({ lengthMm, spanMm, pitchDeg, eavesOverhangMm, rafterCentresMm: PLACEHOLDER_CENTRES_MM, endA: shape.gableEndA, endB: shape.gableEndB })
      const ends = [shape.gableEndA, shape.gableEndB]
      return {
        ok: true, slopeAreaM2: g.slopeAreaM2, ridgeLm: g.ridgeLm,
        hipLm: 0,
        vergeLm: ends.filter(e => e === 'gable').length * 2 * (g.rafterRunMm / 1000),
        abutmentLm: ends.filter(e => e === 'existing-wall').length * 2 * (g.rafterRunMm / 1000),
        eavesLm: g.wallPlateLm, warnings: g.warnings,
      }
    }
    const g = calculateHipRoofGeometry({ lengthMm, spanMm, pitchDeg, eavesOverhangMm, rafterCentresMm: PLACEHOLDER_CENTRES_MM, endA: shape.hipEndA, endB: shape.hipEndB })
    const ends = [shape.hipEndA, shape.hipEndB]
    return {
      ok: true, slopeAreaM2: g.slopeAreaM2, ridgeLm: g.ridgeLm, hipLm: g.hipRafterLm,
      vergeLm: ends.filter(e => e === 'gable').length * 2 * (g.commonRafterRunMm / 1000),
      abutmentLm: ends.filter(e => e === 'existing-wall').length * 2 * (g.commonRafterRunMm / 1000),
      eavesLm: g.wallPlateLm, warnings: g.warnings,
    }
  } catch (e: any) {
    return { ok: false, error: e.message as string }
  }
}

export default function AssemblyPitchedRoofCoveringDemo({ onClose, onSave, labourTrades = [], externalLengthMm, externalWidthMm }: Props) {
  const [name, setName]         = useState('Pitched Roof Covering')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 8000)
  const [spanMm, setSpanMm]     = useState(externalWidthMm ?? 6000)
  useEffect(() => { if (externalLengthMm != null) setLengthMm(externalLengthMm) }, [externalLengthMm])
  useEffect(() => { if (externalWidthMm != null) setSpanMm(externalWidthMm) }, [externalWidthMm])
  function swapLengthSpan() { setLengthMm(spanMm); setSpanMm(lengthMm) }

  const [roofType, setRoofType] = useState<PitchedRoofShapeType>('gable')
  const [pitchDeg, setPitchDeg] = useState(30)
  const [eavesOverhangMm, setEavesOverhangMm] = useState(300)
  const [monoHighWallConnection, setMonoHighWallConnection] = useState<MonoPitchWallConnection>('ledger')
  const [gableEndA, setGableEndA] = useState<GableEndTreatment>('gable')
  const [gableEndB, setGableEndB] = useState<GableEndTreatment>('gable')
  const [hipEndA, setHipEndA] = useState<HipEndTreatment>('hip')
  const [hipEndB, setHipEndB] = useState<HipEndTreatment>('hip')

  const [material, setMaterial] = useState<PitchedCoveringMaterial>('concrete-tile')
  const [battenGaugeMm, setBattenGaugeMm] = useState(345)
  const [membraneType, setMembraneType] = useState<'breather' | 'felt'>('breather')

  const edges = useMemo(
    () => deriveCoveringEdges({ roofType, lengthMm, spanMm, pitchDeg, eavesOverhangMm, monoHighWallConnection, gableEndA, gableEndB, hipEndA, hipEndB }),
    [roofType, lengthMm, spanMm, pitchDeg, eavesOverhangMm, monoHighWallConnection, gableEndA, gableEndB, hipEndA, hipEndB],
  )

  const geometryResult = useMemo(() => {
    if (!edges.ok) return { ok: false as const, error: edges.error }
    try {
      return {
        ok: true as const,
        geometry: calculatePitchedRoofCoveringGeometry({
          slopeAreaM2: edges.slopeAreaM2, battenGaugeMm, ridgeLm: edges.ridgeLm, hipLm: edges.hipLm, vergeLm: edges.vergeLm, abutmentLm: edges.abutmentLm, eavesLm: edges.eavesLm,
        }),
      }
    } catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [edges, battenGaugeMm])
  const g: PitchedRoofCoveringGeometry | null = geometryResult.ok ? geometryResult.geometry : null
  const shapeWarnings = edges.ok ? edges.warnings : []

  const [wastePct, setWastePct] = useState(5)
  const [profitPct, setProfitPct] = useState(20)
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const layers: AssemblyLayerDef[] = useMemo(() => {
    if (!g) return []
    const out: AssemblyLayerDef[] = []
    out.push({ id: 'membrane', name: membraneType === 'breather' ? 'Breather membrane' : 'Roofing felt (type 1F)', category: 'materials', source: 'fixed', fixedQty: g.slopeAreaM2, unit: 'm²', unitCost: membraneType === 'breather' ? 1.20 : 0.90, wastePct })
    out.push({ id: 'battens', name: 'Treated batten 25×38mm', category: 'materials', source: 'fixed', fixedQty: g.battenLm, unit: 'lm', unitCost: 0.55, wastePct })
    out.push({ id: 'covering', name: `${MATERIAL_LABEL[material]}, incl. underlay clips and fixings`, category: 'materials', source: 'fixed', fixedQty: g.slopeAreaM2, unit: 'm²', unitCost: MATERIAL_RATE[material], wastePct })
    if (g.ridgeLm > 0) out.push({ id: 'ridge', name: 'Ridge capping, dry-fix system', category: 'materials', source: 'fixed', fixedQty: g.ridgeLm, unit: 'lm', unitCost: 18, wastePct })
    if (g.hipLm > 0) out.push({ id: 'hip_cap', name: 'Hip capping, dry-fix system', category: 'materials', source: 'fixed', fixedQty: g.hipLm, unit: 'lm', unitCost: 20, wastePct })
    if (g.vergeLm > 0) out.push({ id: 'verge', name: 'Dry verge system', category: 'materials', source: 'fixed', fixedQty: g.vergeLm, unit: 'lm', unitCost: 12, wastePct })
    if (g.abutmentLm > 0) out.push({ id: 'abutment', name: 'Lead flashing, code 4, at the abutment', category: 'materials', source: 'fixed', fixedQty: g.abutmentLm, unit: 'lm', unitCost: 15, wastePct })
    if (g.eavesLm > 0) out.push({ id: 'eaves', name: 'Eaves felt support tray / eaves closure', category: 'materials', source: 'fixed', fixedQty: g.eavesLm, unit: 'lm', unitCost: 3.50, wastePct })
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, material, membraneType, wastePct])

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

  // Labour — the roofer laying the membrane, battens, covering and dressing the trims, following the roof
  // until edited by hand
  const labourSuggestions: LabourSuggestion[] = g ? suggestPitchedRoofCoveringLabour({ material, ...g }) : []
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
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
  const descInput = g ? { material, slopeAreaM2: g.slopeAreaM2, battenGaugeMm, ridgeLm: g.ridgeLm, hipLm: g.hipLm, vergeLm: g.vergeLm, abutmentLm: g.abutmentLm } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describePitchedRoofCoveringShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describePitchedRoofCovering(descInput) : '')

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
          {g && edges.ok && (<>
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 }}>Plan — which trim goes where</div>
            <PitchedCoveringPlanSvg roofType={roofType} lengthMm={lengthMm} spanMm={spanMm}
              gableEndA={gableEndA} gableEndB={gableEndB} hipEndA={hipEndA} hipEndB={hipEndB} ridgeLm={edges.ridgeLm} />
            {shapeWarnings.map((w, i) => (
              <div key={`s${i}`} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            {g.warnings.map((w, i) => (
              <div key={`c${i}`} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginTop: 6 }}>⚠ {w}</div>
            ))}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              Slope area {g.slopeAreaM2.toFixed(1)}m². Battens {g.battenLm.toFixed(0)}lm at {battenGaugeMm}mm gauge.
              {g.ridgeLm > 0 && ` Ridge ${g.ridgeLm.toFixed(1)}m.`}
              {g.hipLm > 0 && ` Hips ${g.hipLm.toFixed(1)}m.`}
              {g.vergeLm > 0 && ` Verge ${g.vergeLm.toFixed(1)}m.`}
              {g.abutmentLm > 0 && ` Abutment flashing ${g.abutmentLm.toFixed(1)}m.`}
              {' '}Eaves {g.eavesLm.toFixed(1)}m.
            </div>
          </>)}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><PropRow label="Ridge-direction length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow></div>
            <div style={{ flex: 1 }}><PropRow label="Overall span (mm)">{numInput(spanMm, setSpanMm, 1)}</PropRow></div>
            <button onClick={swapLengthSpan} title="Swap length and span — if the roof was drawn the other way round"
              style={{ fontSize: 11, padding: '5px 8px', border: '1px solid #e2e8f0', borderRadius: 5, background: '#fff', color: '#64748b', cursor: 'pointer', marginBottom: 1 }}>⇄ Swap</button>
          </div>
          <PropRow label="Pitch">
            <select value={pitchDeg} onChange={e => setPitchDeg(+e.target.value)} style={propInput}>
              {[15, 20, 25, 30, 35, 40, 45, 50].map(p => <option key={p} value={p}>{p}°</option>)}
            </select>
          </PropRow>

          <CollapsibleSection title="Roof shape" borderColor="#bae6fd">
            <PropRow label="Roof type">
              <select value={roofType} onChange={e => setRoofType(e.target.value as PitchedRoofShapeType)} style={propInput}>
                {(Object.entries(SHAPE_LABEL) as [PitchedRoofShapeType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ marginTop: 6 }}><PropRow label="Eaves overhang (mm)">{numInput(eavesOverhangMm, setEavesOverhangMm, 0)}</PropRow></div>
            {roofType === 'mono' && (
              <div style={{ marginTop: 6 }}><PropRow label="High wall">
                <select value={monoHighWallConnection} onChange={e => setMonoHighWallConnection(e.target.value as MonoPitchWallConnection)} style={propInput}>
                  {(Object.entries(MONO_CONNECTION_LABEL) as [MonoPitchWallConnection, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </PropRow></div>
            )}
            {roofType === 'gable' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <div style={{ flex: 1 }}><PropRow label="Start end">
                  <select value={gableEndA} onChange={e => setGableEndA(e.target.value as GableEndTreatment)} style={propInput}>
                    {(Object.entries(GABLE_END_LABEL) as [GableEndTreatment, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </PropRow></div>
                <div style={{ flex: 1 }}><PropRow label="Far end">
                  <select value={gableEndB} onChange={e => setGableEndB(e.target.value as GableEndTreatment)} style={propInput}>
                    {(Object.entries(GABLE_END_LABEL) as [GableEndTreatment, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </PropRow></div>
              </div>
            )}
            {roofType === 'hip' && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <div style={{ flex: 1 }}><PropRow label="Start end">
                  <select value={hipEndA} onChange={e => setHipEndA(e.target.value as HipEndTreatment)} style={propInput}>
                    {(Object.entries(HIP_END_LABEL) as [HipEndTreatment, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </PropRow></div>
                <div style={{ flex: 1 }}><PropRow label="Far end">
                  <select value={hipEndB} onChange={e => setHipEndB(e.target.value as HipEndTreatment)} style={propInput}>
                    {(Object.entries(HIP_END_LABEL) as [HipEndTreatment, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </PropRow></div>
              </div>
            )}
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>Matches the roof structure calculator's own shape and per-end choices — set them the same way here.</div>
          </CollapsibleSection>

          <CollapsibleSection title="Covering" borderColor="#bae6fd">
            <PropRow label="Material">
              <select value={material} onChange={e => setMaterial(e.target.value as PitchedCoveringMaterial)} style={propInput}>
                {(Object.entries(MATERIAL_LABEL) as [PitchedCoveringMaterial, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </PropRow>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Batten gauge (mm)">{numInput(battenGaugeMm, setBattenGaugeMm, 100)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Underlay">
                <select value={membraneType} onChange={e => setMembraneType(e.target.value as 'breather' | 'felt')} style={propInput}>
                  <option value="breather">Breather membrane</option>
                  <option value="felt">Roofing felt (type 1F)</option>
                </select>
              </PropRow></div>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>Check the batten gauge against the chosen product's own gauge table — this is a starting point, not the product's rating.</div>
          </CollapsibleSection>

          <PropRow label={`Waste % (${wastePct}%)`}>
            <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
          <PropRow label={`Profit % (${profitPct}%)`}>
            <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
          </PropRow>
        </div>

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

// ── A simplified plan showing which trim goes where: the ridge (blue, gable/hip only), hip lines (amber,
// hip only), and each end drawn as a verge bar (teal) or a hatched abutment bar, matching the structure
// calculators' own convention for the same choices. Eaves are simply the plain edges — every side that
// isn't a ridge/verge/abutment end is an eave. ──
const ROLE_COLOUR = { ridge: '#0369a1', hip: '#b45309', verge: '#0f766e' }
function PitchedCoveringPlanSvg({ roofType, lengthMm, spanMm, gableEndA, gableEndB, hipEndA, hipEndB, ridgeLm }: {
  roofType: PitchedRoofShapeType; lengthMm: number; spanMm: number
  gableEndA: GableEndTreatment; gableEndB: GableEndTreatment; hipEndA: HipEndTreatment; hipEndB: HipEndTreatment
  ridgeLm: number
}) {
  const vbW = 430, vbH = 260
  const k = Math.min(340 / lengthMm, 170 / spanMm)
  const w = lengthMm * k, h = spanMm * k
  const x0 = (vbW - w) / 2, y0 = 40
  const halfSpanMm = spanMm / 2
  const ridgeMm = ridgeLm * 1000
  const endA = roofType === 'gable' ? gableEndA : roofType === 'hip' ? hipEndA : null
  const endB = roofType === 'gable' ? gableEndB : roofType === 'hip' ? hipEndB : null
  const ridgeStartMm = roofType === 'hip' && endA === 'hip' ? halfSpanMm : 0
  const xRidgeStart = x0 + ridgeStartMm * k, xRidgeEnd = x0 + (ridgeStartMm + ridgeMm) * k
  const yMid = y0 + h / 2

  const endBar = (end: GableEndTreatment | HipEndTreatment | null, atRight: boolean) => {
    if (end === null || end === 'hip') return null
    const barX = atRight ? x0 + w - 4 : x0
    const fill = end === 'gable' ? ROLE_COLOUR.verge : 'url(#pitchCoveringHatch)'
    return <rect x={barX} y={y0} width={4} height={h} fill={fill} stroke={end === 'gable' ? 'none' : '#78716c'} strokeWidth={end === 'gable' ? 0 : 0.6} />
  }

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 220, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <defs>
        <pattern id="pitchCoveringHatch" patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
          <rect width={5} height={5} fill="#e7e5e4" />
          <line x1={0} y1={0} x2={0} y2={5} stroke="#a8a29e" strokeWidth={1.5} />
        </pattern>
      </defs>
      <rect x={x0} y={y0} width={w} height={h} fill="#fafaf9" stroke="#78716c" strokeWidth={1.2} />
      {roofType === 'mono' && <>
        <rect x={x0} y={y0} width={4} height={h} fill={ROLE_COLOUR.verge} />
        <rect x={x0 + w - 4} y={y0} width={4} height={h} fill={ROLE_COLOUR.verge} />
        <rect x={x0} y={y0} width={w} height={4} fill="url(#pitchCoveringHatch)" stroke="#78716c" strokeWidth={0.6} />
      </>}
      {roofType === 'gable' && ridgeLm > 0 && <line x1={x0} y1={yMid} x2={x0 + w} y2={yMid} stroke={ROLE_COLOUR.ridge} strokeWidth={2.5} />}
      {roofType === 'hip' && <>
        {endA === 'hip' && <>
          <line x1={x0} y1={y0} x2={xRidgeStart} y2={yMid} stroke={ROLE_COLOUR.hip} strokeWidth={2} />
          <line x1={x0} y1={y0 + h} x2={xRidgeStart} y2={yMid} stroke={ROLE_COLOUR.hip} strokeWidth={2} />
        </>}
        {endB === 'hip' && <>
          <line x1={x0 + w} y1={y0} x2={xRidgeEnd} y2={yMid} stroke={ROLE_COLOUR.hip} strokeWidth={2} />
          <line x1={x0 + w} y1={y0 + h} x2={xRidgeEnd} y2={yMid} stroke={ROLE_COLOUR.hip} strokeWidth={2} />
        </>}
        {ridgeLm > 0 && <line x1={xRidgeStart} y1={yMid} x2={xRidgeEnd} y2={yMid} stroke={ROLE_COLOUR.ridge} strokeWidth={2.5} />}
      </>}
      {(roofType === 'gable' || roofType === 'hip') && <>{endBar(endA, false)}{endBar(endB, true)}</>}
      <text x={x0 + w / 2} y={y0 - 8} fontSize={9} fill="#57534e" textAnchor="middle">{roofType === 'mono' ? 'Abutment (high wall)' : 'Eaves wall'}</text>
      <text x={x0 + w / 2} y={y0 + h + 16} fontSize={9} fill="#57534e" textAnchor="middle">Eaves wall (low)</text>
      <text x={x0 + w / 2} y={y0 + h + 30} fontSize={9} fill="#64748b" textAnchor="middle">{(lengthMm / 1000).toFixed(2)}m × {(spanMm / 1000).toFixed(2)}m plan</text>
      <g transform={`translate(20, ${vbH - 6})`}>
        <line x1={0} x2={16} y1={-3} y2={-3} stroke={ROLE_COLOUR.ridge} strokeWidth={2.5} /><text x={21} y={0} fontSize={8} fill="#64748b">Ridge</text>
        <line x1={65} x2={81} y1={-3} y2={-3} stroke={ROLE_COLOUR.hip} strokeWidth={2} /><text x={86} y={0} fontSize={8} fill="#64748b">Hip</text>
        <rect x={115} y={-6} width={8} height={6} fill={ROLE_COLOUR.verge} /><text x={127} y={0} fontSize={8} fill="#64748b">Verge</text>
        <rect x={175} y={-6} width={8} height={6} fill="url(#pitchCoveringHatch)" stroke="#78716c" strokeWidth={0.6} /><text x={187} y={0} fontSize={8} fill="#64748b">Abutment</text>
      </g>
    </svg>
  )
}
