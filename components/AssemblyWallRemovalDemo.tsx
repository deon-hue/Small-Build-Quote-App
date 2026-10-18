'use client'

/**
 * Assembly Calculator — Wall removal / knock-through (Demolition → Wall Removal / Knock-Through), priced from the length of wall taken out (the length drawn in Take-off, when drawn there).
 * The wall's length, height, thickness and what it is made of give the rubble and the skips; a load-bearing wall adds temporary props and needles, a steel beam sized from the span (indicative: the engineer
 * designs the real one), padstones, boxing in the steel, the engineer's fee and the Building Control notice. Making good (plaster and a floor patch) and services found in the wall are optional lines.
 * The engine is lib/wall-removal-units.ts.
 */

import React, { useMemo, useEffect } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { calculateWallRemoval, WALL_KINDS, BEAM_SIZES, PROPS_PER_LM_WEEK, type WallKind, type WallRemovalResult } from '@/lib/wall-removal-units'
import { describeWallRemoval, describeWallRemovalShort, type WallRemovalDescriptionInput } from '@/lib/wall-removal-description'
import { suggestWallRemovalLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
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
  /** The length of the wall line drawn in Take-off, mm: the length of wall taken out. Whenever it changes it overwrites the calculator's own. */
  externalLengthMm?: number
}

const WALL_WORDS: Record<WallKind, string> = { stud: 'stud partition', block: 'block partition', brick: 'solid brick wall', cavity: 'thick or cavity wall' }

export default function AssemblyWallRemovalDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const ID = 'AssemblyWallRemovalDemo'
  const [name, setName] = useCalcState(ID, 'name', 'Wall removal')
  const [location, setLocation] = useCalcState(ID, 'location', '')
  const [qty, setQty] = useCalcState(ID, 'qty', 1)
  const [kind, setKind] = useCalcState<WallKind>(ID, 'kind', 'brick')
  const [lengthM, setLengthM] = useCalcState(ID, 'lengthM', externalLengthMm && externalLengthMm > 0 ? +(externalLengthMm / 1000).toFixed(2) : 3)
  useEffect(() => { if (externalLengthMm != null && externalLengthMm > 0) setLengthM(+(externalLengthMm / 1000).toFixed(2)) }, [externalLengthMm])
  const [heightM, setHeightM] = useCalcState(ID, 'heightM', 2.4)
  const [thicknessMm, setThicknessMm] = useCalcState(ID, 'thicknessMm', WALL_KINDS.brick.defaultThicknessMm)
  const [structural, setStructural] = useCalcState(ID, 'structural', WALL_KINDS.brick.usuallyStructural)
  const [propWeeks, setPropWeeks] = useCalcState(ID, 'propWeeks', 1)
  const [engineer, setEngineer] = useCalcState(ID, 'engineer', true)
  const [buildingControl, setBuildingControl] = useCalcState(ID, 'buildingControl', true)
  const [boxInSteel, setBoxInSteel] = useCalcState(ID, 'boxInSteel', true)
  const [makeGoodPlaster, setMakeGoodPlaster] = useCalcState(ID, 'makeGoodPlaster', true)
  const [makeGoodFloor, setMakeGoodFloor] = useCalcState(ID, 'makeGoodFloor', true)
  const [dustProtection, setDustProtection] = useCalcState(ID, 'dustProtection', true)
  // optional extras the job may not have start off
  const [services, setServices] = useCalcState(ID, 'services', 0)
  const [profitPct, setProfitPct] = useCalcState(ID, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(ID, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(ID, 'disabledLayerIds', new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function pickKind(k: WallKind) { setKind(k); setThicknessMm(WALL_KINDS[k].defaultThicknessMm); setStructural(WALL_KINDS[k].usuallyStructural) }

  const result = useMemo((): { ok: true; r: WallRemovalResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateWallRemoval({ kind, lengthM, heightM, thicknessMm, structural, propWeeks, engineer, buildingControl, makeGoodPlaster, makeGoodFloor, boxInSteel, dustProtection, services }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [kind, lengthM, heightM, thicknessMm, structural, propWeeks, engineer, buildingControl, makeGoodPlaster, makeGoodFloor, boxInSteel, dustProtection, services])
  const r = result.ok ? result.r : null
  const isStructural = structural && kind !== 'stud'

  const layers: AssemblyLayerDef[] = useMemo(() => (r?.lines ?? []).map(l => ({
    id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit,
    unitCost: rateOverrides[l.id] != null ? rateOverrides[l.id] : l.unitCost, fixedQty: l.qty, wastePct: 0,
  })), [r, rateOverrides])
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

  // Labour, suggested and following the sizes until edited
  const labourSuggestions: LabourSuggestion[] = r ? suggestWallRemovalLabour({
    wallVolumeM3: r.wallVolumeM3, hoursPerM3: WALL_KINDS[kind].hoursPerM3, structural: isStructural, lengthM, propWeeks, plasterM2: r.plasterM2, floorM2: r.floorM2, boxInLm: isStructural && boxInSteel ? lengthM : 0, dustProtection,
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
  const materialLines = [...(r ? costedLines : []), ...miscCostedLines]
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

  // The customer's description follows the settings until it's edited by hand
  const descInput: WallRemovalDescriptionInput | null = r ? {
    wallWords: WALL_WORDS[kind], lengthM, heightM, thicknessMm, structural: isStructural, propWeeks, engineer, buildingControl, boxInSteel, makeGoodPlaster, makeGoodFloor, dustProtection, skips: r.skips, services, beamLabel: r.beamLabel,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(ID, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(ID, 'detailOverride', null)
  const description = descriptionOverride ?? (descInput ? describeWallRemovalShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeWallRemoval(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the wall</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the wall — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>
  const check = (label: string, on: boolean, set: (b: boolean) => void, hint: string) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#334155', cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto', marginTop: 2 }} />
      <span>{label}<span style={{ display: 'block', fontSize: 10, color: '#94a3b8' }}>{hint}</span></span>
    </label>
  )

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
        {r && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {r && <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />}
        {onSave && r && (
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
      {!result.ok && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {result.error}</div>}
      {r && r.warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>⚠ {w}</div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          {r && <WallSketch lengthM={lengthM} heightM={heightM} structural={isStructural} beamLabel={r.beamLabel} />}
          {r && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {lengthM}m × {heightM}m × {thicknessMm}mm = {r.wallVolumeM3} m³ of wall, about {r.rubbleM3} m³ of rubble in {r.skips} skip{r.skips === 1 ? '' : 's'}.
              {isStructural && <> Indicative steel: {r.beamLabel}, {r.beamLengthM}m long ({r.beamKg}kg), props for {propWeeks} week{propWeeks === 1 ? '' : 's'} at £{PROPS_PER_LM_WEEK} a metre a week.</>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CollapsibleSection title="The wall" borderColor="#bae6fd">
            <PropRow label="What it is">
              <select value={kind} onChange={e => pickKind(e.target.value as WallKind)} style={propInput}>
                {(Object.keys(WALL_KINDS) as WallKind[]).map(k => <option key={k} value={k}>{WALL_KINDS[k].label}</option>)}
              </select>
            </PropRow>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}><PropRow label="Length removed (m) — drawn">{numInput(lengthM, setLengthM, 0, 0.1)}</PropRow></div>
              <div style={{ flex: 1 }}><PropRow label="Height (m)">{numInput(heightM, setHeightM, 0, 0.1)}</PropRow></div>
            </div>
            <PropRow label="Thickness (mm)">{numInput(thicknessMm, setThicknessMm, 0, 5)}</PropRow>
            {check('Load-bearing', structural, setStructural, kind === 'stud' ? 'A stud partition is not load-bearing' : 'Needs props, a steel beam and an engineer')}
          </CollapsibleSection>

          {isStructural && (
            <CollapsibleSection title="Support and steel" borderColor="#bae6fd">
              <PropRow label="Weeks the props stay up">{numInput(propWeeks, setPropWeeks, 0, 0.5)}</PropRow>
              {check('Structural engineer', engineer, setEngineer, 'Design and calculations, an allowance')}
              {check('Building Control notice', buildingControl, setBuildingControl, 'A provisional sum: fees vary by council')}
              {check('Box in the steel', boxInSteel, setBoxInSteel, 'Fire board and skim round the beam')}
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 4px' }}>Indicative sections: {BEAM_SIZES.map(b => `${b.label} to ${b.upToM}m`).join('; ')}.</div>
            </CollapsibleSection>
          )}

          <CollapsibleSection title="Making good and clearing" borderColor="#bae6fd">
            {check('Plaster make-good', makeGoodPlaster, setMakeGoodPlaster, 'To the ends of the opening, the ceiling line and the new reveals')}
            {check('Floor patch', makeGoodFloor, setMakeGoodFloor, 'Where the wall stood')}
            {check('Dust sheets and protection', dustProtection, setDustProtection, 'Floors and doorways')}
            <PropRow label="Services in the wall to move or cap (nr)">{numInput(services, n => setServices(Math.round(n)), 0, 1)}</PropRow>
          </CollapsibleSection>

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates — change any single line in the cost breakdown below.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject="wall removal"
        />
        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {r && (
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

// ── An elevation: the wall with the opening taken out, and the steel beam over it for a load-bearing wall ──
function WallSketch({ lengthM, heightM, structural, beamLabel }: { lengthM: number; heightM: number; structural: boolean; beamLabel: string }) {
  const vbW = 430, vbH = 210
  const wallW = 330, wallH = 140
  const x0 = (vbW - wallW) / 2, y0 = 22
  const openFrac = Math.min(Math.max(lengthM / Math.max(lengthM + 1.2, 1), 0.25), 0.8)
  const openW = wallW * openFrac
  const ox = x0 + (wallW - openW) / 2
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 210, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      <rect x={x0} y={y0} width={wallW} height={wallH} fill="#d6d3d1" stroke="#57534e" />
      <rect x={ox} y={structural ? y0 + 16 : y0} width={openW} height={wallH - (structural ? 16 : 0)} fill="#fff" stroke="#57534e" strokeDasharray="4 3" />
      {structural && <>
        <rect x={ox - 14} y={y0} width={openW + 28} height={16} fill="#64748b" stroke="#1e293b" />
        <text x={x0 + wallW / 2} y={y0 + 12} fontSize={9} fill="#fff" textAnchor="middle">{beamLabel}</text>
        <rect x={ox - 14} y={y0 + 16} width={14} height={6} fill="#a8a29e" stroke="#57534e" />
        <rect x={ox + openW} y={y0 + 16} width={14} height={6} fill="#a8a29e" stroke="#57534e" />
      </>}
      <line x1={ox} x2={ox + openW} y1={y0 + wallH + 14} y2={y0 + wallH + 14} stroke="#2563eb" />
      <text x={ox + openW / 2} y={y0 + wallH + 28} fontSize={10} fill="#2563eb" textAnchor="middle">{lengthM}m removed</text>
      <line x1={x0 - 10} x2={x0 - 10} y1={y0} y2={y0 + wallH} stroke="#2563eb" />
      <text x={x0 - 14} y={y0 + wallH / 2} fontSize={10} fill="#2563eb" textAnchor="end">{heightM}m</text>
    </svg>
  )
}
