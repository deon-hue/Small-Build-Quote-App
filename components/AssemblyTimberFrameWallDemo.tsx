'use client'

/**
 * Assembly Calculator — External Timber Frame Wall (garden room / outbuilding).
 *
 * The timber stud wall of a typical garden room, built up from the outside in: cladding on
 * battens, breather membrane, sheathing (OSB or ply), the stud frame with insulation between,
 * optional extra insulation over the studs, a vapour control layer and an internal lining. The
 * framing engine is the same one the stud partition uses (studs at centres, doubled studs and a
 * header around each opening, plates, noggins); timber is priced by the metre actually used, so
 * the short studs around openings aren't charged as full-height ones.
 *
 * Counts and prices what's drawn — it doesn't design the frame (bracing, lintel sizes, uplift).
 * See calculateTimberFrameGeometry in lib/assembly-calc.ts.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  calculateTimberFrameGeometry, calculateTimberFrameWallCost,
  type TimberFrameWallInput, type CladdingOrientation, type AssemblyOpening, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import {
  propInput, PropRow, BreakdownTable,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  OpeningsEditor, newOpeningId, MaterialsListButtons,
} from '@/components/assembly-ui'
import { WallElevationSvg } from '@/components/AssemblyWallDemo'

// Sample rates, like every calculator here — editable per line in the breakdown until Back
// Office products/plant replace them. Timber is per linear metre.
interface StudSection { label: string; depthMm: number; thicknessMm: number; perLm: number }
const STUD_SECTIONS: Record<string, StudSection> = {
  '38x89':  { label: '38×89 CLS (4×2)',  depthMm: 89,  thicknessMm: 38, perLm: 1.60 },
  '50x100': { label: '50×100 PSE (4×2)', depthMm: 100, thicknessMm: 50, perLm: 2.60 },
  '38x140': { label: '38×140 C16 (6×2)', depthMm: 140, thicknessMm: 38, perLm: 3.10 },
  '45x145': { label: '45×145 C24 (6×2)', depthMm: 145, thicknessMm: 45, perLm: 3.80 },
}

type SheathingType = 'osb' | 'ply' | 'none'
const SHEATHING: Record<SheathingType, { label: string; thicknessMm: number; perSheet: number }> = {
  osb:  { label: 'OSB3 11mm',           thicknessMm: 11, perSheet: 18.50 },
  ply:  { label: 'WBP plywood 9mm',     thicknessMm: 9,  perSheet: 26.00 },
  none: { label: 'No sheathing',        thicknessMm: 0,  perSheet: 0 },
}

type CladdingType = 'larch' | 'cedar' | 'thermowood' | 'featheredge' | 'composite' | 'none'
const CLADDING: Record<CladdingType, { label: string; thicknessMm: number; perM2: number }> = {
  larch:       { label: 'Siberian larch shiplap',        thicknessMm: 20, perM2: 34.00 },
  cedar:       { label: 'Western red cedar shiplap',     thicknessMm: 20, perM2: 52.00 },
  thermowood:  { label: 'Thermowood shiplap',            thicknessMm: 20, perM2: 42.00 },
  featheredge: { label: 'Treated feather-edge softwood', thicknessMm: 22, perM2: 16.00 },
  composite:   { label: 'Composite cladding',            thicknessMm: 21, perM2: 68.00 },
  none:        { label: 'No cladding',                   thicknessMm: 0,  perM2: 0 },
}

type InsulationType = 'pir' | 'wool' | 'none'
const INSULATION: Record<InsulationType, { label: string; perM2PerMm: number }> = {
  pir:  { label: 'Rigid PIR board',   perM2PerMm: 0.24 },
  wool: { label: 'Mineral wool batt', perM2PerMm: 0.11 },
  none: { label: 'No insulation',     perM2PerMm: 0 },
}

type LiningType = 'plasterboard' | 'plywood' | 'tg' | 'osb' | 'none'
const LINING: Record<LiningType, { label: string; thicknessMm: number; unit: 'm²' | 'sheet'; rate: number }> = {
  plasterboard: { label: 'Plasterboard 12.5mm',           thicknessMm: 12.5, unit: 'm²',    rate: 6.90 },
  plywood:      { label: 'Plywood 9mm',                   thicknessMm: 9,    unit: 'sheet', rate: 26.00 },
  tg:           { label: 'T&G pine boarding',             thicknessMm: 12,   unit: 'm²',    rate: 22.00 },
  osb:          { label: 'OSB3 11mm',                     thicknessMm: 11,   unit: 'sheet', rate: 18.50 },
  none:         { label: 'No internal lining',            thicknessMm: 0,    unit: 'm²',    rate: 0 },
}

const SHEET_M2 = 2.88          // a 2400 × 1200 sheet
const BATTEN_MM = 25           // 25×50 treated batten — the cavity behind the cladding
const MEMBRANE_MM = 2          // drawn, not measured
const VCL_MM = 2

interface LayerOpts {
  wastePct: number
  section: StudSection
  sheathing: SheathingType
  cladding: CladdingType
  orientation: CladdingOrientation
  insulation: InsulationType
  insulationMm: number
  extraInsulationMm: number
  vcl: boolean
  lining: LiningType
  counts: { cornerTrimLm: number; openingPerimeterLm: number; headerLm: number }
}

function buildTimberFrameLayers(o: LayerOpts): AssemblyLayerDef[] {
  const w = o.wastePct
  const s = o.section
  const layers: AssemblyLayerDef[] = [
    { id: 'studs',    name: `Studs ${s.label}`,              category: 'materials', source: 'studLm',      unit: 'lm', unitCost: s.perLm, wastePct: w },
    { id: 'plates',   name: `Sole & top plate ${s.label}`,   category: 'materials', source: 'plateLm',     unit: 'lm', unitCost: s.perLm, wastePct: 5 },
    { id: 'noggins',  name: 'Noggins',                       category: 'materials', source: 'nogginCount', unit: 'nr', unitCost: +(s.perLm * 0.4).toFixed(2), roundToWhole: true },
  ]
  if (o.counts.headerLm > 0) {
    layers.push({ id: 'headers', name: 'Header timber 45×145 (doubled)', category: 'materials', source: 'headerLm', unit: 'lm', unitCost: 3.80 })
  }
  layers.push({ id: 'dpc', name: 'DPC under sole plate', category: 'materials', source: 'lengthM', unit: 'm', unitCost: 1.10, wastePct: w })

  if (o.sheathing !== 'none') {
    layers.push({ id: 'sheathing', name: `${SHEATHING[o.sheathing].label} sheathing`, category: 'materials', source: 'netAreaM2', unit: 'sheet', unitCost: SHEATHING[o.sheathing].perSheet, wastePct: w, coveragePerUnit: SHEET_M2, roundToWhole: true })
  }
  layers.push({ id: 'membrane', name: 'Breather membrane', category: 'materials', source: 'grossAreaM2', unit: 'm²', unitCost: 1.20, wastePct: w })

  if (o.insulation !== 'none' && o.insulationMm > 0) {
    layers.push({
      id: 'insulation',
      name: `${INSULATION[o.insulation].label} ${o.insulationMm}mm (between studs)`,
      category: 'materials', source: 'netAreaM2', unit: 'm²',
      unitCost: +(INSULATION[o.insulation].perM2PerMm * o.insulationMm).toFixed(2), wastePct: w,
    })
  }
  if (o.extraInsulationMm > 0) {
    layers.push({
      id: 'extra_insulation', name: `Rigid PIR board ${o.extraInsulationMm}mm (over the studs)`,
      category: 'materials', source: 'netAreaM2', unit: 'm²',
      unitCost: +(INSULATION.pir.perM2PerMm * o.extraInsulationMm).toFixed(2), wastePct: w,
    })
  }
  if (o.vcl) {
    layers.push({ id: 'vcl', name: 'Vapour control layer (foil-backed)', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 0.95, wastePct: w })
  }
  if (o.lining !== 'none') {
    const l = LINING[o.lining]
    layers.push(l.unit === 'sheet'
      ? { id: 'lining', name: `${l.label} lining`, category: 'materials', source: 'netAreaM2', unit: 'sheet', unitCost: l.rate, wastePct: w, coveragePerUnit: SHEET_M2, roundToWhole: true }
      : { id: 'lining', name: `${l.label} lining`, category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: l.rate, wastePct: w })
  }

  if (o.cladding !== 'none') {
    layers.push({ id: 'battens', name: 'Cavity battens 25×50 treated', category: 'materials', source: 'battenLm', unit: 'lm', unitCost: 0.95, wastePct: w })
    if (o.orientation === 'vertical') {
      layers.push({ id: 'counter_battens', name: 'Counter-battens 25×50 treated (horizontal)', category: 'materials', source: 'counterBattenLm', unit: 'lm', unitCost: 0.95, wastePct: w })
    }
    layers.push({ id: 'cladding', name: `${CLADDING[o.cladding].label} cladding`, category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: CLADDING[o.cladding].perM2, wastePct: w })
    if (o.counts.cornerTrimLm > 0) {
      layers.push({ id: 'corner_trim', name: 'External corner trim', category: 'materials', source: 'cornerTrimLm', unit: 'lm', unitCost: 5.00, wastePct: w })
    }
    if (o.counts.openingPerimeterLm > 0) {
      layers.push({ id: 'reveal_trim', name: 'Window/door reveal & cill trim', category: 'materials', source: 'openingPerimeterLm', unit: 'lm', unitCost: 4.00, wastePct: w })
    }
  }
  layers.push({ id: 'sundries', name: 'Fixings, tapes, sealant & sundries', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 1.10 })
  return layers
}

function sampleOpenings(): AssemblyOpening[] {
  return [{ id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 2000, sillHeightMm: 900 }]
}

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  externalLengthMm?: number
}

export default function AssemblyTimberFrameWallDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const [name, setName]         = useState('Timber Garden Room Wall')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 4000)
  useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useState(2400)
  const [sectionKey, setSectionKey] = useState('50x100')
  const [centresMm, setCentresMm] = useState(400)
  const [doubleTopPlate, setDoubleTopPlate] = useState(false)
  const [cornerEnds, setCornerEnds] = useState<0 | 1 | 2>(0)
  const [sheathing, setSheathing] = useState<SheathingType>('osb')
  const [cladding, setCladding] = useState<CladdingType>('larch')
  const [orientation, setOrientation] = useState<CladdingOrientation>('horizontal')
  const [battenCentresMm, setBattenCentresMm] = useState(600)
  const [insulation, setInsulation] = useState<InsulationType>('pir')
  const [insulationMm, setInsulationMm] = useState(STUD_SECTIONS['50x100'].depthMm)
  const [extraInsulationMm, setExtraInsulationMm] = useState(0)
  const [vcl, setVcl] = useState(true)
  const [lining, setLining] = useState<LiningType>('plasterboard')
  const [wastePct, setWastePct] = useState(10)
  const [openings, setOpenings] = useState<AssemblyOpening[]>(sampleOpenings)
  const [location, setLocation] = useState('')

  const section = STUD_SECTIONS[sectionKey]
  // Insulation between the studs fills the stud depth, so it follows the stud you pick — still
  // editable afterwards (e.g. a thinner board with a service void).
  function changeSection(key: string) {
    setSectionKey(key)
    setInsulationMm(STUD_SECTIONS[key].depthMm)
  }

  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Erect frame, board, insulate and clad wall', hours: 24 },
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

  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(layerId: string) {
    setDisabledLayerIds(prev => {
      const next = new Set(prev)
      next.has(layerId) ? next.delete(layerId) : next.add(layerId)
      return next
    })
  }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function buildAutoDescription(): string {
    const parts = [
      `${(lengthMm / 1000).toFixed(2)}m long × ${(heightMm / 1000).toFixed(2)}m high timber frame wall`,
      `${section.label} studs at ${centresMm}mm centres`,
    ]
    if (sheathing !== 'none') parts.push(`${SHEATHING[sheathing].label} sheathing and breather membrane`)
    else parts.push('breather membrane')
    // Labels are used as written — lowercasing would mangle PIR, OSB, T&G and Siberian/Western.
    if (insulation !== 'none' && insulationMm > 0) parts.push(`${insulationMm}mm ${INSULATION[insulation].label} between the studs`)
    if (extraInsulationMm > 0) parts.push(`${extraInsulationMm}mm PIR over the studs`)
    if (vcl) parts.push('vapour control layer')
    if (lining !== 'none') parts.push(`${LINING[lining].label} lining`)
    if (cladding !== 'none') parts.push(`${CLADDING[cladding].label} cladding, boards running ${orientation === 'horizontal' ? 'horizontally' : 'vertically'}, on battens`)
    let text = parts.join(', ') + '.'
    if (openings.length) {
      const list = openings.map(o => `${o.kind} (${o.widthMm}×${o.heightMm}mm)`).join(', ')
      text += ` Includes ${openings.length} opening${openings.length !== 1 ? 's' : ''}: ${list}.`
    }
    return text
  }
  const [description, setDescription] = useState(buildAutoDescription)

  const input: TimberFrameWallInput = {
    lengthMm, heightMm, studCentresMm: centresMm, studThicknessMm: section.thicknessMm,
    doubleTopPlate, cornerEnds, battenCentresMm, claddingOrientation: orientation, openings,
  }
  const openingsKey = JSON.stringify(openings)

  const geometryResult = useMemo(() => {
    try { return { ok: true as const, geometry: calculateTimberFrameGeometry(input) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lengthMm, heightMm, centresMm, section.thicknessMm, doubleTopPlate, cornerEnds, battenCentresMm, orientation, openingsKey])

  const layers = useMemo(() => {
    if (!geometryResult.ok) return []
    const g = geometryResult.geometry
    const base = buildTimberFrameLayers({
      wastePct, section, sheathing, cladding, orientation, insulation, insulationMm, extraInsulationMm, vcl, lining,
      counts: { cornerTrimLm: g.cornerTrimLm, openingPerimeterLm: g.openingPerimeterLm, headerLm: g.headerLm },
    })
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [geometryResult, wastePct, section, sheathing, cladding, orientation, insulation, insulationMm, extraInsulationMm, vcl, lining, rateOverrides])

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
    if (!geometryResult.ok) return { ok: false as const, error: geometryResult.error }
    try { return { ok: true as const, value: calculateTimberFrameWallCost(input, layers) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometryResult, layers])

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
    setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'window', widthMm: 900, heightMm: 1200, offsetMm: 0, sillHeightMm: 900 }])
  }

  // Build-up for the section drawing, outside → inside. Thin layers are drawn at a minimum width
  // so they stay visible; the real thicknesses are in the legend.
  const buildUp = useMemo(() => {
    const items: { label: string; mm: number; color: string }[] = []
    if (cladding !== 'none') {
      items.push({ label: `${CLADDING[cladding].label} ${CLADDING[cladding].thicknessMm}mm`, mm: CLADDING[cladding].thicknessMm, color: '#b45309' })
      items.push({ label: `Cavity battens ${BATTEN_MM}mm`, mm: BATTEN_MM, color: '#d6b98c' })
    }
    items.push({ label: 'Breather membrane', mm: MEMBRANE_MM, color: '#0d9488' })
    if (sheathing !== 'none') items.push({ label: `${SHEATHING[sheathing].label}`, mm: SHEATHING[sheathing].thicknessMm, color: '#e0b878' })
    items.push({ label: `${section.label} studs${insulation !== 'none' ? ` + ${insulationMm}mm ${INSULATION[insulation].label.toLowerCase()}` : ''}`, mm: section.depthMm, color: insulation === 'none' ? '#f1f5f9' : '#fde68a' })
    if (extraInsulationMm > 0) items.push({ label: `PIR over studs ${extraInsulationMm}mm`, mm: extraInsulationMm, color: '#fbcfe8' })
    if (vcl) items.push({ label: 'Vapour control layer', mm: VCL_MM, color: '#7c3aed' })
    if (lining !== 'none') items.push({ label: LINING[lining].label, mm: LINING[lining].thicknessMm, color: '#cbd5e1' })
    return items
  }, [cladding, sheathing, section, insulation, insulationMm, extraInsulationMm, vcl, lining])
  const totalThicknessMm = buildUp.reduce((s, i) => s + i.mm, 0)

  const g = geometryResult.ok ? geometryResult.geometry : null
  const numInput = (v: number, set: (n: number) => void, min = 0) => (
    <input type="number" min={min} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )

  return (
    <div style={{ border: '2px dashed #15803d', borderRadius: 10, background: '#f7fef9', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#15803d', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #bbf7d0', borderRadius: 5, color: '#15803d', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
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
          style={{ fontSize: 12, color: '#15803d', width: 140, padding: '4px 8px', border: '1px solid #bbf7d0', borderRadius: 5, background: '#f7fef9' }} />
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
            style={{ fontSize: 10, color: '#15803d', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            ↻ Regenerate
          </button>
        </div>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
          style={{ width: '100%', fontSize: 12, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
      </div>

      {/* An error (e.g. a wall too low for its plates while a height is being typed) is shown here
          with the controls still in place, so the value can be corrected — never in place of them. */}
      {!result.ok && (
        <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {result.error}</div>
      )}
      {(
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            {g && (<>
            <WallElevationSvg
              input={{ lengthMm, heightMm, studCentresMm: centresMm, doubleTopPlate, openings }}
              studLabels={{ full: 'King stud', cut: 'Jack stud (doubled at each opening)' }}
              onOpeningOffsetChange={(id, offsetMm) => updateOpening(id, { offsetMm })}
            />
            <WallSectionSvg items={buildUp} totalMm={totalThicknessMm} />
            {g.warnings.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {g.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginBottom: 3 }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high, {section.label} studs at {centresMm}mm centres,
              {' '}{openings.length} opening{openings.length !== 1 ? 's' : ''}.
              Net area {g.netAreaM2.toFixed(2)} m² · {g.totalStuds + g.cornerStuds} studs ({g.studLm.toFixed(1)}m of timber, studs are {g.studLengthMm}mm between the plates)
              {' '}· wall {totalThicknessMm.toFixed(0)}mm thick.
            </div>
            </>)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PropRow label="Length (mm)">{numInput(lengthMm, setLengthMm, 1)}</PropRow>
            <PropRow label="Height (mm)">{numInput(heightMm, setHeightMm, 1)}</PropRow>

            <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: 8, marginTop: 2 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Frame</div>
              <PropRow label="Stud size">
                <select value={sectionKey} onChange={e => changeSection(e.target.value)} style={propInput}>
                  {Object.entries(STUD_SECTIONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </PropRow>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <div style={{ flex: 1 }}>
                  <PropRow label="Stud centres">
                    <select value={centresMm} onChange={e => setCentresMm(+e.target.value)} style={propInput}>
                      {[300, 400, 600].map(c => <option key={c} value={c}>{c}mm</option>)}
                    </select>
                  </PropRow>
                </div>
                <div style={{ flex: 1 }}>
                  <PropRow label="Corners on this wall">
                    <select value={cornerEnds} onChange={e => setCornerEnds(+e.target.value as 0 | 1 | 2)} style={propInput}>
                      <option value={0}>None (both ends butt)</option>
                      <option value={1}>One end is a corner</option>
                      <option value={2}>Both ends are corners</option>
                    </select>
                  </PropRow>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={doubleTopPlate} onChange={e => setDoubleTopPlate(e.target.checked)} style={{ width: 'auto' }} />
                Double top plate
              </label>
            </div>

            <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Outside</div>
              <PropRow label="Cladding">
                <select value={cladding} onChange={e => setCladding(e.target.value as CladdingType)} style={propInput}>
                  {(Object.entries(CLADDING) as [CladdingType, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </PropRow>
              {cladding !== 'none' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <div style={{ flex: 2 }}>
                    <PropRow label="Boards run">
                      <select value={orientation} onChange={e => setOrientation(e.target.value as CladdingOrientation)} style={propInput}>
                        <option value="horizontal">Horizontally</option>
                        <option value="vertical">Vertically</option>
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ flex: 1 }}>
                    <PropRow label="Battens">
                      <select value={battenCentresMm} onChange={e => setBattenCentresMm(+e.target.value)} style={propInput}>
                        {[400, 600].map(c => <option key={c} value={c}>{c}mm</option>)}
                      </select>
                    </PropRow>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                <PropRow label="Sheathing (behind the membrane)">
                  <select value={sheathing} onChange={e => setSheathing(e.target.value as SheathingType)} style={propInput}>
                    {(Object.entries(SHEATHING) as [SheathingType, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </PropRow>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #bbf7d0', paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Insulation &amp; inside</div>
              <PropRow label="Between the studs">
                <select value={insulation} onChange={e => setInsulation(e.target.value as InsulationType)} style={propInput}>
                  {(Object.entries(INSULATION) as [InsulationType, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </PropRow>
              {insulation !== 'none' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <div style={{ flex: 1 }}><PropRow label="Thickness (mm)">{numInput(insulationMm, setInsulationMm)}</PropRow></div>
                  <div style={{ flex: 1 }}>
                    <PropRow label="PIR over studs">
                      <select value={extraInsulationMm} onChange={e => setExtraInsulationMm(+e.target.value)} style={propInput}>
                        {[0, 25, 40, 50, 75].map(m => <option key={m} value={m}>{m === 0 ? 'None' : `${m}mm`}</option>)}
                      </select>
                    </PropRow>
                  </div>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', marginTop: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={vcl} onChange={e => setVcl(e.target.checked)} style={{ width: 'auto' }} />
                Vapour control layer (warm side)
              </label>
              <div style={{ marginTop: 6 }}>
                <PropRow label="Internal lining">
                  <select value={lining} onChange={e => setLining(e.target.value as LiningType)} style={propInput}>
                    {(Object.entries(LINING) as [LiningType, { label: string }][]).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </PropRow>
              </div>
            </div>

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

          {result.ok && (
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
      )}
    </div>
  )
}

// ── Section through the wall — the build-up from the outside in, drawn to one scale so the
// stud depth and the boards read at their real proportions. Visual only: none of it feeds the
// quantities in the breakdown.
function WallSectionSvg({ items, totalMm }: { items: { label: string; mm: number; color: string }[]; totalMm: number }) {
  const vbW = 640, vbH = 150
  const k = Math.min(3, 420 / Math.max(totalMm, 1))
  const minW = 3
  const widths = items.map(i => Math.max(minW, i.mm * k))
  const drawnW = widths.reduce((s, w) => s + w, 0)
  const x0 = (vbW - drawnW) / 2
  const y0 = 30, h = 60
  let x = x0
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 132, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <text x={x0} y={18} fontSize={9} fill="#94a3b8">Outside</text>
        <text x={x0 + drawnW} y={18} fontSize={9} fill="#94a3b8" textAnchor="end">Inside</text>
        {items.map((it, i) => {
          const w = widths[i]
          const rx = x
          x += w
          return <rect key={i} x={rx} y={y0} width={w} height={h} fill={it.color} stroke="#64748b" strokeWidth={0.7} />
        })}
        <text x={vbW / 2} y={y0 + h + 18} fontSize={9} fill="#64748b" textAnchor="middle">Section through the wall — {totalMm.toFixed(0)}mm overall</text>
        {/* Legend */}
        <g transform={`translate(${x0}, ${y0 + h + 30})`}>
          {items.map((it, i) => (
            <g key={i} transform={`translate(${(i % 3) * 190}, ${Math.floor(i / 3) * 11})`}>
              <rect x={0} y={-6} width={8} height={8} fill={it.color} stroke="#64748b" strokeWidth={0.5} />
              <text x={12} y={1} fontSize={7.5} fill="#64748b">{it.label}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}
