'use client'

/**
 * Assembly Calculator — Stage 2 preview (Timber Frame Wall).
 *
 * A demonstration of what a sub-phase looks like once it's wired to an "assembly" —
 * see the assembly-calculator feasibility report, §17 Stage 2. This is intentionally
 * disconnected from the real quote: every number here is local component state,
 * seeded with sample data and sample Back Office-style rates. Nothing is fetched from
 * Supabase, nothing is written to any quote, and closing this panel discards it.
 *
 * Purpose: let the user see and try the calculator's shape (elevation, properties,
 * live cost breakdown) before Stage 3 wires it to a real Back Office assembly record
 * and an "Add to Quote" action for the Walls phase.
 */

import React, { useMemo, useState, useRef, useEffect } from 'react'
import {
  calculateWallCost, studPositionsMm,
  type WallInput, type AssemblyOpening, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'

// ── Sample Back Office-style rates for materials (placeholders — real Products linking
// comes later). Labour isn't derived from geometry at all — see LabourLine below, it's a
// manual trade + hours entry priced from real Back Office labour rates. ──
//
// The framing geometry (calculateWallGeometry/calculateWallCost in lib/assembly-calc.ts) is
// shared by every stud-wall system — studs at centres, doubled studs + header around each
// opening, top/bottom run, noggin rows. Only the material layer list and a few labels differ
// per system, captured in WALL_SYSTEM_CONFIG below.
function buildTimberLayers(wastePct: number): AssemblyLayerDef[] {
  return [
    { id: 'studs',     name: 'CLS studs 89×38',        category: 'materials', source: 'studCount',    unit: 'nr',    unitCost: 4.20,  roundToWhole: true },
    { id: 'plates',    name: 'Head & sole plate',       category: 'materials', source: 'plateLm',      unit: 'lm',    unitCost: 3.80,  wastePct: 5 },
    { id: 'noggins',   name: 'Noggins',                 category: 'materials', source: 'nogginCount',  unit: 'nr',    unitCost: 2.10,  roundToWhole: true },
    { id: 'headers',   name: 'Header / lintel timber',  category: 'materials', source: 'headerCount',  unit: 'nr',    unitCost: 45.00, roundToWhole: true },
    { id: 'sheathing', name: 'OSB3 sheathing',          category: 'materials', source: 'netAreaM2',    unit: 'sheet', unitCost: 18.50, wastePct, coveragePerUnit: 2.88, roundToWhole: true },
    { id: 'membrane',  name: 'Breather membrane',       category: 'materials', source: 'grossAreaM2',  unit: 'm²',    unitCost: 1.20,  wastePct },
    { id: 'insulation',name: 'Insulation (between studs)', category: 'materials', source: 'netAreaM2', unit: 'm²',    unitCost: 8.50,  wastePct },
    { id: 'lining',    name: 'Plasterboard lining',     category: 'materials', source: 'netAreaM2',    unit: 'm²',    unitCost: 6.90,  wastePct },
  ]
}

// No sheathing or breather membrane — those were timber-frame bracing/weatherproofing layers
// for an external wall, not relevant to an internal metal stud partition. Noggin/bridging is
// kept as a togglable layer since not every metal stud job needs it — leave it out per-job
// with the existing toggle-off checkbox rather than removing it from the system entirely.
function buildMetalLayers(wastePct: number): AssemblyLayerDef[] {
  return [
    { id: 'studs',     name: 'Metal C-studs 70×50',       category: 'materials', source: 'studCount',   unit: 'nr', unitCost: 3.60,  roundToWhole: true },
    { id: 'plates',    name: 'Head & sole track',         category: 'materials', source: 'plateLm',     unit: 'lm', unitCost: 4.10,  wastePct: 5 },
    { id: 'noggins',   name: 'Nogging / bridging',        category: 'materials', source: 'nogginCount', unit: 'nr', unitCost: 2.40,  roundToWhole: true },
    { id: 'headers',   name: 'Boxed head track (opening)', category: 'materials', source: 'headerCount', unit: 'nr', unitCost: 22.00, roundToWhole: true },
    { id: 'insulation',name: 'Acoustic insulation (between studs)', category: 'materials', source: 'netAreaM2', unit: 'm²', unitCost: 8.50, wastePct },
    { id: 'lining',    name: 'Plasterboard lining',       category: 'materials', source: 'netAreaM2',   unit: 'm²', unitCost: 6.90,  wastePct },
  ]
}

export type WallSystem = 'timber' | 'metal'

interface WallSystemConfig {
  label: string                          // default name for a new calculation
  descriptor: string                     // e.g. 'timber stud partition' — used in the auto description
  buildLayers: (wastePct: number) => AssemblyLayerDef[]
  sidesEligibleLayerIds: Set<string>      // layers that can be applied to one or both faces of the wall
  topPlateRowLabel: string                // PropRow label, e.g. 'Top plate' / 'Head track'
  topPlateLabel: string                  // checkbox label for WallInput.doubleTopPlate
  studLabels: { full: string; cut: string } // elevation legend for the doubled studs at an opening
}

const WALL_SYSTEM_CONFIG: Record<WallSystem, WallSystemConfig> = {
  timber: {
    label: 'Timber Stud Partition',
    descriptor: 'timber stud partition',
    buildLayers: buildTimberLayers,
    sidesEligibleLayerIds: new Set(['sheathing', 'lining']),
    topPlateRowLabel: 'Top plate',
    topPlateLabel: 'Double top plate',
    studLabels: { full: 'King stud', cut: 'Jack stud (doubled at each opening)' },
  },
  metal: {
    label: 'Metal Stud Partition',
    descriptor: 'metal stud partition',
    buildLayers: buildMetalLayers,
    sidesEligibleLayerIds: new Set(['lining']),
    topPlateRowLabel: 'Head track',
    topPlateLabel: 'Double head track',
    studLabels: { full: 'Jamb stud (full height)', cut: 'Jamb stud (cut to head track)' },
  },
}

interface LabourLine { id: string; tradeId: string; task: string; hours: number }
let _labourLineId = 0
const newLabourLineId = () => `ll-${++_labourLineId}`
function hourlyRate(trade: BOLabourTrade): number { return +(trade.day_rate / 8).toFixed(2) }

// Freeform materials not covered by the standard layers above — e.g. fixings, adhesive,
// anything the estimator wants to price without it being a named layer in the shell.
interface MiscMaterialLine { id: string; name: string; qty: number; unit: string; unitCost: number }
let _miscMaterialLineId = 0
const newMiscMaterialLineId = () => `misc-${++_miscMaterialLineId}`

const CATEGORY_LABEL: Record<string, string> = { materials: 'Materials', labour: 'Labour', plant: 'Plant', subcontractors: 'Subcontractors', other: 'Other' }

let _openingId = 0
const newOpeningId = () => `op-${++_openingId}`

function sampleOpenings(): AssemblyOpening[] {
  return [{ id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 2000, sillHeightMm: 900 }]
}

interface Props {
  /** Which stud-wall system this is — picks the material layer list and a few labels.
   * Defaults to 'timber' for callers that predate this option. */
  system?: WallSystem
  /** Omit when embedded as a fixed section (e.g. Back Office) rather than a dismissible overlay. */
  onClose?: () => void
  /** Present when opened from a real quote sub-phase — writes this calculation's costed
   * lines into it, replacing whatever was there before. Absent in Back Office's preview. */
  onSave?: (result: { name: string; qty: number; location: string; description: string; lines: CostedLine[] }) => void
  /** Real Back Office labour trades, for the manual trade + hours labour picker. Absent (or
   * empty) shows a message pointing at Back Office rather than falling back to a guess. */
  labourTrades?: BOLabourTrade[]
  /** Present when embedded in Take-off — the traced line's live length (mm). Whenever this
   * changes (the user redraws or adjusts the shape), it overwrites the length field below,
   * same as any other seeded default in Take-off; still freely editable by hand in between. */
  externalLengthMm?: number
}

export default function AssemblyWallDemo({ system = 'timber', onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const cfg = WALL_SYSTEM_CONFIG[system]
  const [name, setName]         = useState(cfg.label)
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(externalLengthMm ?? 5000)
  useEffect(() => {
    if (externalLengthMm != null) setLengthMm(externalLengthMm)
  }, [externalLengthMm])
  const [heightMm, setHeightMm] = useState(2400)
  const [centresMm, setCentresMm] = useState(400)
  const [doubleTopPlate, setDoubleTopPlate] = useState(false)
  const [wastePct, setWastePct] = useState(10)
  const [openings, setOpenings] = useState<AssemblyOpening[]>(sampleOpenings)
  const [location, setLocation] = useState('')
  const [labourLines, setLabourLines] = useState<LabourLine[]>([
    { id: newLabourLineId(), tradeId: '', task: 'Build stud wall', hours: 4 },
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

  // Miscellaneous materials — freeform name/qty/unit/rate lines for anything not covered by
  // the standard layers (fixings, adhesive, sundries, ...).
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

  // Profit % — applied to the whole calculation (materials + labour + misc), shown as its
  // own line in the breakdown and folded into the total price and Save & Price.
  const [profitPct, setProfitPct] = useState(0)

  // Sample rates the user has overridden in this session — keyed by layer id. Still not
  // linked to real Products/Labour/Plant records, but editable here in the meantime.
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})

  // How many faces each sides-eligible layer (sheathing, lining) is applied to. Defaults to
  // 1 (one side) — a stud wall boarded/lined on both faces sets it to 2, doubling that
  // layer's raw quantity and cost.
  const [layerSides, setLayerSides] = useState<Record<string, 1 | 2>>({})
  function setSides(layerId: string, sides: 1 | 2) {
    setLayerSides(prev => ({ ...prev, [layerId]: sides }))
  }

  // A quote-facing description — sizing and openings, in plain language. Auto-generated,
  // but kept as its own editable state (not recomputed on every keystroke) so typing notes
  // into it doesn't get clobbered; "↻ Regenerate" refreshes it from the current numbers.
  function buildAutoDescription(): string {
    const parts = [
      `${(lengthMm / 1000).toFixed(2)}m long × ${(heightMm / 1000).toFixed(2)}m high ${cfg.descriptor}`,
      `studs at ${centresMm}mm centres`,
    ]
    if (doubleTopPlate) parts.push(cfg.topPlateLabel.toLowerCase())
    if ((layerSides.sheathing ?? 1) === 2) parts.push('sheathed both faces')
    if ((layerSides.lining ?? 1) === 2) parts.push('boarded both faces')
    let text = parts.join(', ') + '.'
    if (openings.length) {
      const list = openings.map(o => `${o.kind} (${o.widthMm}×${o.heightMm}mm)`).join(', ')
      text += ` Includes ${openings.length} opening${openings.length !== 1 ? 's' : ''}: ${list}.`
    }
    return text
  }
  const [description, setDescription] = useState(buildAutoDescription)

  // Layers toggled off — e.g. a stud wall without insulation. Kept out of the total and
  // excluded from what Save & Price writes to the quote, but still shown (greyed out, with
  // its rate) so it's easy to switch back on rather than having to re-add it from scratch.
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(layerId: string) {
    setDisabledLayerIds(prev => {
      const next = new Set(prev)
      next.has(layerId) ? next.delete(layerId) : next.add(layerId)
      return next
    })
  }

  const input: WallInput = { lengthMm, heightMm, studCentresMm: centresMm, doubleTopPlate, openings }
  const layers = useMemo(() => {
    const base = cfg.buildLayers(wastePct)
    return base.map(l => {
      let next = l
      if (rateOverrides[l.id] != null) next = { ...next, unitCost: rateOverrides[l.id] }
      if (cfg.sidesEligibleLayerIds.has(l.id)) next = { ...next, sidesMultiplier: layerSides[l.id] ?? 1 }
      return next
    })
  }, [cfg, wastePct, rateOverrides, layerSides])
  function setRate(layerId: string, unitCost: number) {
    setRateOverrides(prev => ({ ...prev, [layerId]: Math.max(0, unitCost) }))
  }
  // Breakdown-table rate edits route to whichever state actually owns that line — a sample
  // layer's override, or a misc material's own rate.
  function handleBreakdownRateChange(layerId: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === layerId)) {
      updateMiscMaterialLine(layerId, { unitCost: Math.max(0, unitCost) })
    } else {
      setRate(layerId, unitCost)
    }
  }

  const result = useMemo(() => {
    try { return { ok: true as const, value: calculateWallCost(input, layers) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [lengthMm, heightMm, centresMm, doubleTopPlate, JSON.stringify(openings), layers])

  // Standard layers, plus any freeform misc materials — every line minus whatever's toggled off.
  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({
      layerId: m.id, name: m.name, category: 'materials', source: 'fixed',
      wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item',
      unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2),
    }))
  const materialLines = [...(result.ok ? result.value.lines : []), ...miscCostedLines]
  const enabledMaterialLines = materialLines.filter(l => !disabledLayerIds.has(l.layerId))

  // Labour is never derived from geometry — it's manual trade + hours, priced from the
  // real Back Office day rate (÷8 for an hourly figure), per line. No rate override here:
  // the whole point is that this comes from Back Office, not a typed-in guess.
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

  return (
    <div style={{ border: '2px dashed #7c3aed', borderRadius: 10, background: '#fdfaff', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#7c3aed', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #e9d5ff', borderRadius: 5, color: '#7c3aed', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
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
          style={{ fontSize: 12, color: '#7c3aed', width: 140, padding: '4px 8px', border: '1px solid #e9d5ff', borderRadius: 5, background: '#fdfaff' }} />
        <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))}
          style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        {result.ok && (
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>
            {fmt(totalCost * qty)}
          </span>
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

      {/* Quote-facing description — auto-generated from the sizing/openings, editable, and
          what gets saved as the sub-phase's task description on Save & Price. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <label style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>Description (for the quote)</label>
          <button onClick={() => setDescription(buildAutoDescription())}
            title="Regenerate from the current sizing and openings — overwrites any edits below"
            style={{ fontSize: 10, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
          {/* Left: elevation + description */}
          <div>
            <WallElevationSvg input={input} studLabels={cfg.studLabels} onOpeningOffsetChange={(id, offsetMm) => updateOpening(id, { offsetMm })} />
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
              {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high, studs at {centresMm}mm centres,
              {' '}{openings.length} opening{openings.length !== 1 ? 's' : ''}.
              Net area {result.value.geometry.netAreaM2.toFixed(2)} m², {result.value.geometry.totalStuds} studs.
            </div>
          </div>

          {/* Right: properties */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PropRow label="Length (mm)">
              <input type="number" value={lengthMm} onChange={e => setLengthMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Height (mm)">
              <input type="number" value={heightMm} onChange={e => setHeightMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Stud centres (mm)">
              <select value={centresMm} onChange={e => setCentresMm(+e.target.value)} style={propInput}>
                {[300, 400, 600].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </PropRow>
            <PropRow label={cfg.topPlateRowLabel}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={doubleTopPlate} onChange={e => setDoubleTopPlate(e.target.checked)} />
                {cfg.topPlateLabel}
              </label>
            </PropRow>
            <PropRow label={`Waste % (${wastePct}%)`}>
              <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>
            <PropRow label={`Profit % (${profitPct}%)`}>
              <input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>

            {/* Openings */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                Openings
              </div>
              {openings.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 20px', gap: 4, marginBottom: 3 }}>
                  {['Kind', 'Width', 'Height', 'From left', 'Sill'].map(h => (
                    <div key={h} style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</div>
                  ))}
                  <div />
                </div>
              )}
              {openings.map(o => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 20px', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                  <select value={o.kind} onChange={e => updateOpening(o.id, { kind: e.target.value as AssemblyOpening['kind'], sillHeightMm: e.target.value === 'door' ? 0 : (o.sillHeightMm || 900) })} style={miniInput}>
                    <option value="window">Window</option>
                    <option value="door">Door</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input type="number" title="Width of the opening (mm)" value={o.widthMm} onChange={e => updateOpening(o.id, { widthMm: +e.target.value || 0 })} style={miniInput} />
                  <input type="number" title="Height of the opening itself (mm)" value={o.heightMm} onChange={e => updateOpening(o.id, { heightMm: +e.target.value || 0 })} style={miniInput} />
                  <input type="number" title="Distance from the wall's left end to the opening's left edge (mm)" value={o.offsetMm} onChange={e => updateOpening(o.id, { offsetMm: +e.target.value || 0 })} style={miniInput} />
                  <input type="number" title="Sill height — floor to the bottom of the opening (mm), 0 for a door" value={o.sillHeightMm} onChange={e => updateOpening(o.id, { sillHeightMm: +e.target.value || 0 })} style={miniInput} disabled={o.kind === 'door'} />
                  <button onClick={() => removeOpening(o.id)} title="Remove opening"
                    style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
              <button onClick={addOpening}
                style={{ fontSize: 11, border: '1px dashed #94a3b8', background: 'transparent', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}>
                + Opening
              </button>
            </div>
          </div>

          {/* Labour — manual trade + hours, priced from real Back Office day rates. Spans
              both columns: it needs the room, and it's not a wall-geometry property. */}
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Labour — pick a trade, allow some time, add another trade for the next task
            </div>
            {labourTrades.length === 0 ? (
              <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '6px 0' }}>
                No Back Office labour trades found — add some under Back Office → Labour &amp; Trades.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 70px 90px 90px 20px', gap: 6, marginBottom: 3 }}>
                  {['Trade', 'Task', 'Hours', 'Rate', 'Cost'].map(h => (
                    <div key={h} style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</div>
                  ))}
                  <div />
                </div>
                {labourLines.map(l => {
                  const trade = labourTrades.find(t => t.id === l.tradeId)
                  const rate = trade ? hourlyRate(trade) : 0
                  const cost = trade ? +(l.hours * rate).toFixed(2) : 0
                  return (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 70px 90px 90px 20px', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                      <select value={l.tradeId} onChange={e => updateLabourLine(l.id, { tradeId: e.target.value })} style={miniInput}>
                        <option value="">Select trade…</option>
                        {labourTrades.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                      <input value={l.task} onChange={e => updateLabourLine(l.id, { task: e.target.value })}
                        placeholder="e.g. Build stud wall" style={miniInput} />
                      <input type="number" min={0} step={0.5} value={l.hours}
                        onChange={e => updateLabourLine(l.id, { hours: +e.target.value || 0 })} style={miniInput} />
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#94a3b8' }}>{trade ? `£${rate.toFixed(2)}/hr` : '—'}</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>{trade ? `£${cost.toFixed(2)}` : '—'}</div>
                      <button onClick={() => removeLabourLine(l.id)} title="Remove this labour line"
                        style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>×</button>
                    </div>
                  )
                })}
                <button onClick={addLabourLine}
                  style={{ fontSize: 11, border: '1px dashed #94a3b8', background: 'transparent', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}>
                  + Add Trade
                </button>
              </>
            )}
          </div>

          {/* Miscellaneous Materials — freeform name/qty/unit/rate lines for anything not
              covered by the standard layers (fixings, adhesive, sundries, ...). Spans both
              columns, same pattern as Labour above. */}
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
              Miscellaneous Materials — anything not covered by the layers below
            </div>
            {miscMaterialLines.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 70px 80px 90px 90px 20px', gap: 6, marginBottom: 3 }}>
                {['Name', 'Qty', 'Unit', 'Rate', 'Cost'].map(h => (
                  <div key={h} style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>{h}</div>
                ))}
                <div />
              </div>
            )}
            {miscMaterialLines.map(m => {
              const cost = +(m.qty * m.unitCost).toFixed(2)
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 80px 90px 90px 20px', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                  <input value={m.name} onChange={e => updateMiscMaterialLine(m.id, { name: e.target.value })}
                    placeholder="e.g. Fixings" style={miniInput} />
                  <input type="number" min={0} step={0.5} value={m.qty}
                    onChange={e => updateMiscMaterialLine(m.id, { qty: Math.max(0, +e.target.value || 0) })} style={miniInput} />
                  <input value={m.unit} onChange={e => updateMiscMaterialLine(m.id, { unit: e.target.value })}
                    placeholder="item" style={miniInput} />
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>£</span>
                    <input type="number" min={0} step={0.01} value={m.unitCost}
                      onChange={e => updateMiscMaterialLine(m.id, { unitCost: Math.max(0, +e.target.value || 0) })} style={miniInput} />
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>£{cost.toFixed(2)}</div>
                  <button onClick={() => removeMiscMaterialLine(m.id)} title="Remove this material"
                    style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              )
            })}
            <button onClick={addMiscMaterialLine}
              style={{ fontSize: 11, border: '1px dashed #94a3b8', background: 'transparent', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}>
              + Add Material
            </button>
          </div>

          {/* Breakdown — spans both columns */}
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={materialLines} onRateChange={handleBreakdownRateChange} disabledLayerIds={disabledLayerIds} onToggleLayer={toggleLayer}
              layerSides={layerSides} onSidesChange={setSides} sidesEligibleLayerIds={cfg.sidesEligibleLayerIds} />
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

const propInput: React.CSSProperties = { width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
const miniInput: React.CSSProperties = { width: '100%', fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}

function BreakdownTable({ lines, onRateChange, disabledLayerIds, onToggleLayer, layerSides, onSidesChange, sidesEligibleLayerIds }: {
  lines: CostedLine[]
  onRateChange: (layerId: string, unitCost: number) => void
  disabledLayerIds: Set<string>
  onToggleLayer: (layerId: string) => void
  layerSides: Record<string, 1 | 2>
  onSidesChange: (layerId: string, sides: 1 | 2) => void
  sidesEligibleLayerIds: Set<string>
}) {
  const groups = ['materials', 'labour', 'plant', 'subcontractors', 'other'] as const
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Cost breakdown — sample rates, editable for now until Products/Labour/Plant linking replaces them. Untick a line to leave it out (e.g. no insulation).
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ width: 20 }} />
            <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Item</th>
            <th style={{ textAlign: 'center', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Sides</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Raw qty</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Waste</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Purchase qty</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Unit cost</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const groupLines = lines.filter(l => l.category === g)
            if (groupLines.length === 0) return null
            const groupTotal = groupLines.filter(l => !disabledLayerIds.has(l.layerId)).reduce((s, l) => s + l.cost, 0)
            return (
              <React.Fragment key={g}>
                <tr>
                  <td colSpan={8} style={{ padding: '6px 6px 2px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    {CATEGORY_LABEL[g]}
                  </td>
                </tr>
                {groupLines.map(l => {
                  const off = disabledLayerIds.has(l.layerId)
                  const sidesEligible = sidesEligibleLayerIds.has(l.layerId)
                  const sides = layerSides[l.layerId] ?? 1
                  return (
                    <tr key={l.layerId} style={{ borderBottom: '1px solid #f1f5f9', opacity: off ? 0.45 : 1 }}>
                      <td style={{ padding: '3px 6px' }}>
                        <input type="checkbox" checked={!off} onChange={() => onToggleLayer(l.layerId)}
                          title={off ? 'Excluded — click to include' : 'Included — click to leave out'}
                          style={{ cursor: 'pointer' }} />
                      </td>
                      <td style={{ padding: '3px 6px', textDecoration: off ? 'line-through' : 'none' }}>{l.name}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                        {sidesEligible && (
                          <div style={{ display: 'inline-flex', gap: 2 }}>
                            {([1, 2] as const).map(s => (
                              <button key={s} type="button" disabled={off}
                                onClick={() => onSidesChange(l.layerId, s)}
                                title={s === 1 ? 'Applied to one face only' : 'Applied to both faces of the wall'}
                                style={{
                                  fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: off ? 'default' : 'pointer',
                                  border: `1px solid ${sides === s ? '#7c3aed' : '#e2e8f0'}`,
                                  background: sides === s ? '#7c3aed' : 'transparent',
                                  color: sides === s ? '#fff' : '#64748b',
                                }}>
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{l.rawQty}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>{l.wastePct}%</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{l.purchaseQty} {l.unit}</td>
                      <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>£</span>
                          <input
                            type="number" min={0} step={0.01} value={l.unitCost} disabled={off}
                            onChange={e => onRateChange(l.layerId, +e.target.value)}
                            title="Edit this sample rate"
                            style={{ width: 62, fontFamily: 'monospace', fontSize: 12, textAlign: 'right', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 4 }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, textDecoration: off ? 'line-through' : 'none' }}>£{l.cost.toFixed(2)}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td colSpan={7} style={{ padding: '2px 6px', textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>{CATEGORY_LABEL[g]} total</td>
                  <td style={{ padding: '2px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>£{groupTotal.toFixed(2)}</td>
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A dimension line with end-ticks and a centred label — the standard elevation-drawing
// convention, used for every measurement annotation below rather than plain floating text.
function HDim({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  if (Math.abs(x2 - x1) < 1) return null
  return (
    <g>
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#94a3b8" strokeWidth={1} />
      <text x={(x1 + x2) / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="#64748b">{label}</text>
    </g>
  )
}
function VDim({ y1, y2, x, label }: { y1: number; y2: number; x: number; label: string }) {
  if (Math.abs(y2 - y1) < 1) return null
  return (
    <g>
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#94a3b8" strokeWidth={1} />
      <text x={x + 5} y={(y1 + y2) / 2} dominantBaseline="middle" fontSize={8} fill="#64748b">{label}</text>
    </g>
  )
}

// ── Elevation SVG — a plan/elevation-style sketch of the wall, drawn from the same inputs
// the engine costs. Drag an opening left/right to reposition it — dimensions update live.
// The doubled studs at each opening are drawn as the pair they actually are: one runs full
// height to the bottom track/plate, the other is cut to the header's underside and sits right
// against it — labelled per wall system (king/jack for timber, jamb studs for metal) via
// studLabels. Visual only — stud display positions approximate which field studs an opening
// displaces (matched to the grid), none of this feeds the numbers in the breakdown.
function WallElevationSvg({ input, studLabels, onOpeningOffsetChange }: {
  input: WallInput
  studLabels: { full: string; cut: string }
  onOpeningOffsetChange: (id: string, offsetMm: number) => void
}) {
  const { lengthMm: L, heightMm: H, studCentresMm: C, openings } = input
  const vbW = 640, vbH = 320, padX = 28, padTop = 20 + openings.length * 14, padBottom = 34
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const availW = vbW - padX * 2, availH = vbH - padTop - padBottom
  const scale = Math.min(availW / L, availH / H)
  const w = L * scale, h = H * scale
  const x0 = padX + (availW - w) / 2, y0 = padTop + (availH - h) / 2
  const X = (mmVal: number) => x0 + mmVal * scale
  const Y = (mmVal: number) => y0 + h - mmVal * scale // y grows downward in SVG, up in real life

  const positions = studPositionsMm(L, C).filter(p =>
    !openings.some(o => p > o.offsetMm && p < o.offsetMm + o.widthMm)
  )
  const sortedOpenings = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)

  function offsetFromClientX(clientX: number, widthMm: number): number {
    // Use the SVG's own screen transform (not a plain width ratio) so this stays correct
    // even though the viewBox is letterboxed inside a wider responsive container.
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
      {/* Wall outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#f8fafc" stroke="#334155" strokeWidth={1.5} />
      {/* Field studs */}
      {positions.map(p => (
        <line key={p} x1={X(p)} y1={y0} x2={X(p)} y2={y0 + h} stroke="#94a3b8" strokeWidth={1.5} />
      ))}

      {/* Per-opening dimension row above the wall: offset from left, then the opening's own width */}
      {sortedOpenings.map((o, i) => {
        const dimY = y0 - 10 - i * 14
        return (
          <React.Fragment key={`dim-${o.id}`}>
            <HDim x1={x0} x2={X(o.offsetMm)} y={dimY} label={`${o.offsetMm}`} />
            <HDim x1={X(o.offsetMm)} x2={X(o.offsetMm + o.widthMm)} y={dimY} label={`${o.widthMm}`} />
          </React.Fragment>
        )
      })}

      {/* Openings — void, doubled studs, header, and a drag handle */}
      {openings.map(o => {
        const ox = X(o.offsetMm), ow = o.widthMm * scale
        const oyTop = Y(o.sillHeightMm + o.heightMm), oh = o.heightMm * scale
        const leftEdge = X(o.offsetMm), rightEdge = X(o.offsetMm + o.widthMm)
        const jackGap = 3
        const dragging = dragId === o.id
        return (
          <g key={o.id}>
            {/* Full-height studs — carry the header load to the bottom track/plate */}
            <line x1={leftEdge} y1={y0} x2={leftEdge} y2={y0 + h} stroke="#1e293b" strokeWidth={2.5} />
            <line x1={rightEdge} y1={y0} x2={rightEdge} y2={y0 + h} stroke="#1e293b" strokeWidth={2.5} />
            {/* Cut studs — trimmed to the header's underside, doubled up against each full-height stud */}
            <line x1={leftEdge - jackGap} y1={oyTop} x2={leftEdge - jackGap} y2={y0 + h} stroke="#7c3aed" strokeWidth={1.6} />
            <line x1={rightEdge + jackGap} y1={oyTop} x2={rightEdge + jackGap} y2={y0 + h} stroke="#7c3aed" strokeWidth={1.6} />

            {/* Opening void — draggable */}
            <rect
              x={ox} y={oyTop} width={ow} height={oh}
              fill={o.kind === 'door' ? '#fef3c7' : '#dbeafe'}
              stroke={dragging ? '#7c3aed' : '#4a90a4'} strokeWidth={dragging ? 2.5 : 1.5}
              cursor="grab"
              onPointerDown={e => handlePointerDown(e, o.id)}
            />
            {/* Header line */}
            <line x1={ox} y1={oyTop} x2={ox + ow} y2={oyTop} stroke="#c0392b" strokeWidth={2} />
            <text x={ox + ow / 2} y={oyTop + oh / 2 - 5} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#1d4ed8" pointerEvents="none">
              {o.kind === 'door' ? '🚪' : '🪟'} {o.widthMm}×{o.heightMm}
            </text>
            <text x={ox + ow / 2} y={oyTop + oh / 2 + 8} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#94a3b8" pointerEvents="none">
              ⋮⋮ drag to move
            </text>

            {/* Sill height + opening height, to the right of the opening */}
            {o.sillHeightMm > 0 && <VDim y1={y0 + h} y2={oyTop + oh} x={rightEdge + jackGap + 6} label={`${o.sillHeightMm}`} />}
            <VDim y1={oyTop + oh} y2={oyTop} x={rightEdge + jackGap + 6} label={`${o.heightMm}`} />
          </g>
        )
      })}

      {/* Overall dimensions */}
      <HDim x1={x0} x2={x0 + w} y={y0 + h + 18} label={`${(L / 1000).toFixed(2)}m`} />
      <VDim y1={y0} y2={y0 + h} x={x0 - 16} label={`${(H / 1000).toFixed(2)}m`} />

      {/* Legend */}
      <g transform={`translate(${x0}, ${vbH - 10})`}>
        <line x1={0} y1={0} x2={14} y2={0} stroke="#1e293b" strokeWidth={2.5} />
        <text x={18} y={3} fontSize={8} fill="#64748b">{studLabels.full}</text>
        <line x1={80} y1={0} x2={94} y2={0} stroke="#7c3aed" strokeWidth={1.6} />
        <text x={98} y={3} fontSize={8} fill="#64748b">{studLabels.cut}</text>
      </g>
    </svg>
  )
}
