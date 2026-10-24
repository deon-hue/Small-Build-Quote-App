'use client'

/**
 * The shared body of the four Tiling & Finishes calculators (floor tiling, wall tiling, tiling preparation, electric underfloor heating). Each of them is a by-room calculator whose screen holds the rooms and what each
 * room gets; everything else is the same and lives here: the header (name, location, quantity, price, materials list, Save & Price), the quote line and full description that follow the rooms until edited by hand,
 * the engine error banner and warnings (above the controls, never instead of them), the labour suggested from the rooms, miscellaneous materials, the profit margin and the cost breakdown with a rate to edit on every
 * line. The screen computes the engine result and passes it in; the frame costs the lines through the shared costLayer, as the plastering calculator does.
 */

import React, { useMemo } from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import { suggestTilingLabour, toLabourLines, type LabourSuggestion } from '@/lib/flat-roof-labour'
import { fmt } from '@/lib/utils'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { TILE_SIZES, TILE_SIZE_BY_ID, TILE_LAYOUTS, GROUT_KINDS, ROOM_SHAPE_LABEL, roomFootprint, type RoomShape, type RoomShapeExtras, type TilingLabourTask, type TilingLine, type TileSizeId, type TileLayoutId, type GroutId } from '@/lib/tiling-common'
import {
  propInput, PropRow, BreakdownTable,
  LabourSection, type LabourLine, newLabourLineId, hourlyRate,
  MiscMaterialsSection, type MiscMaterialLine, newMiscMaterialLineId,
  MaterialsListButtons,
} from '@/components/assembly-ui'
import { LabourSuggestionPanel } from '@/components/AssemblyFlatRoofDemo'

export interface TilingSaveResult { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }

interface FrameProps {
  /** the calculator's own saved-state namespace (its component name) */
  id: string
  defaultName: string
  /** what the labour is for, in the labour panel's wording ("floor tiling") */
  subject: string
  lines: TilingLine[]
  labourTasks: TilingLabourTask[]
  error: string | null
  warnings: string[]
  /** the descriptions written from the rooms; '' while the engine has an error */
  descShort: string
  descFull: string
  hasResult: boolean
  onClose?: () => void
  onSave?: (result: TilingSaveResult) => void
  labourTrades: BOLabourTrade[]
  /** the rooms editor (left) and the side sections (right: job situation and so on); given the cost of one room */
  children: (ctx: { roomCost: (roomId: string) => number }) => { main: React.ReactNode; side: React.ReactNode }
}

export default function TilingCalcFrame({ id, defaultName, subject, lines, labourTasks, error, warnings, descShort, descFull, hasResult, onClose, onSave, labourTrades, children }: FrameProps) {
  const [name, setName] = useCalcState(id, 'name', defaultName)
  const [location, setLocation] = useCalcState(id, 'location', '')
  const [qty, setQty] = useCalcState(id, 'qty', 1)
  const [profitPct, setProfitPct] = useCalcState(id, 'profitPct', 20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useCalcState<Record<string, number>>(id, 'rateOverrides', {})
  const [disabledLayerIds, setDisabledLayerIds] = useCalcState<Set<string>>(id, 'disabledLayerIds', new Set())
  function toggleLayer(lid: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(lid) ? n.delete(lid) : n.add(lid); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  const layers: AssemblyLayerDef[] = useMemo(() => lines.map(l => ({
    id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit,
    unitCost: rateOverrides[l.id] != null ? rateOverrides[l.id] : l.unitCost, fixedQty: l.qty, wastePct: 0,
  })), [lines, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))
  const roomCost = (roomId: string) => costedLines.filter(l => l.layerId.endsWith('|' + roomId)).reduce((s, l) => s + l.cost, 0)

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useCalcState<MiscMaterialLine[]>(id, 'miscMaterialLines', [])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(mid: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === mid ? { ...m, ...patch } : m)) }
  function removeMisc(mid: string) { setMiscMaterialLines(p => p.filter(m => m.id !== mid)) }
  function handleRate(lid: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === lid)) updateMisc(lid, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [lid]: Math.max(0, unitCost) }))
  }

  // Labour, suggested from the rooms and following them until edited
  const labourSuggestions: LabourSuggestion[] = suggestTilingLabour(labourTasks)
  const suggestedLabour = toLabourLines(labourSuggestions, labourTrades, false)
  const [labourOverride, setLabourOverride] = useCalcState<LabourLine[] | null>(id, 'labourOverride', null)
  const suggestedRef = React.useRef<LabourLine[]>([])
  suggestedRef.current = suggestedLabour.lines
  const labourLines: LabourLine[] = labourOverride ?? suggestedLabour.lines
  const addLabour = () => setLabourOverride(prev => { const b = prev ?? suggestedRef.current; return [...b, { id: newLabourLineId(), tradeId: b[0]?.tradeId ?? '', task: '', hours: 0 }] })
  const updateLabour = (lid: string, patch: Partial<LabourLine>) => setLabourOverride(prev => (prev ?? suggestedRef.current).map(l => l.id === lid ? { ...l, ...patch } : l))
  const removeLabour = (lid: string) => setLabourOverride(prev => (prev ?? suggestedRef.current).filter(l => l.id !== lid))

  const miscCostedLines: CostedLine[] = miscMaterialLines
    .filter(m => m.name.trim() !== '' && m.qty > 0)
    .map(m => ({ layerId: m.id, name: m.name, category: 'materials', source: 'fixed', wastePct: 0, rawQty: m.qty, purchaseQty: m.qty, unit: m.unit || 'item', unitCost: m.unitCost, cost: +(m.qty * m.unitCost).toFixed(2) }))
  const materialLines = [...(hasResult ? costedLines : []), ...miscCostedLines]
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

  // The customer's description follows the rooms until it's edited by hand
  const [descriptionOverride, setDescriptionOverride] = useCalcState<string | null>(id, 'descriptionOverride', null)
  const [detailOverride, setDetailOverride] = useCalcState<string | null>(id, 'detailOverride', null)
  const description = descriptionOverride ?? descShort
  const detail = detailOverride ?? descFull

  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the rooms</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the rooms — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate</button>

  const { main, side } = children({ roomCost })

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
        {hasResult && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {hasResult && <MaterialsListButtons lines={enabledMaterialLines} title={name} location={location} description={description} compact />}
        {onSave && hasResult && (
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
      {error && <div style={{ color: '#c0392b', fontSize: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '6px 10px', marginBottom: 10 }}>⚠ {error}</div>}
      {warnings.map((w, i) => (
        <div key={i} style={{ fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '4px 8px', marginBottom: 6 }}>⚠ {w}</div>
      ))}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>{main}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {side}
          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
          <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4 }}>Sample rates and hours — change any single line in the cost breakdown below.</div>
        </div>

        <LabourSuggestionPanel
          suggestions={labourSuggestions} includeFitting={false} onIncludeFitting={() => {}}
          unmatched={suggestedLabour.unmatched} edited={labourOverride !== null} onSuggestAgain={() => setLabourOverride(null)}
          tradesFound={labourTrades.length > 0} subject={subject}
        />
        <LabourSection labourLines={labourLines} labourTrades={labourTrades} onAdd={addLabour} onUpdate={updateLabour} onRemove={removeLabour} />
        <MiscMaterialsSection miscMaterialLines={miscMaterialLines} onAdd={addMisc} onUpdate={updateMisc} onRemove={removeMisc} />

        {hasResult && (
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

/** The small helpers every tiling screen uses for its rooms editor */
export const tilingSmall: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
export function TilingNumInput({ v, set, min = 0, step = 1 }: { v: number; set: (n: number) => void; min?: number; step?: number }) {
  return <NumInput type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
}
/** a number that can be left blank to mean "worked out from the room" */
export function TilingAutoInput({ v, set, auto, step = 0.5 }: { v: number | null; set: (n: number | null) => void; auto: number; step?: number }) {
  return <input type="number" min={0} step={step} value={v ?? ''} placeholder={String(+auto.toFixed(1))} onChange={e => set(e.target.value === '' ? null : Math.max(0, +e.target.value || 0))} style={propInput} />
}
export function TilingCheck({ label, on, set }: { label: string; on: boolean; set: (b: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#475569', cursor: 'pointer', marginRight: 12 }}>
      <input type="checkbox" checked={on} onChange={e => set(e.target.checked)} style={{ width: 'auto' }} />{label}
    </label>
  )
}

const SHAPE_PATH: Record<RoomShape, string> = {
  rectangle: 'M6 8H58V40H6Z', square: 'M14 6H50V42H14Z', l: 'M6 6H58V26H36V42H6Z', t: 'M6 6H58V22H46V42H18V22H6Z', u: 'M6 6H24V24H40V6H58V42H6Z', other: 'M8 12L30 5L58 14L52 40L20 43Z',
}

/** The room's floor shape and size, shared by the floor tiling, preparation and heating screens: a rectangle, a square, an L, T or U shape (the overall length and width less a cut-out) or any other shape from its area and the length of its walls. Shows the floor area and wall run it works out. */
export function RoomShapeFields({ room, onChange, fromPlan = false }: {
  room: { lengthM: number; widthM: number } & RoomShapeExtras
  onChange: (patch: { lengthM?: number; widthM?: number } & RoomShapeExtras) => void
  /** the room is sized from the drawing in Take-off */
  fromPlan?: boolean
}) {
  const shape: RoomShape = room.shape ?? 'rectangle'
  const fp = roomFootprint(room)
  const cut = shape === 'l' || shape === 't' || shape === 'u'
  const pick = (s: RoomShape) => {
    const patch: { lengthM?: number; widthM?: number } & RoomShapeExtras = { shape: s }
    if (s === 'square') patch.widthM = room.lengthM
    if ((s === 'l' || s === 't' || s === 'u') && !(room.cutLengthM && room.cutLengthM > 0)) { patch.cutLengthM = +(room.lengthM / 3).toFixed(1); patch.cutWidthM = +(room.widthM / 2).toFixed(1) }
    if (s === 'other' && !(room.otherAreaM2 && room.otherAreaM2 > 0)) { patch.otherAreaM2 = +fp.areaM2.toFixed(2); patch.otherPerimeterM = +fp.perimeterM.toFixed(2) }
    onChange(patch)
  }
  const what = fromPlan ? ' — from the plan' : ''
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <svg width="64" height="48" viewBox="0 0 64 48" aria-hidden="true" style={{ flex: 'none' }}><path d={SHAPE_PATH[shape]} fill="#e0f2fe" stroke="#0369a1" strokeWidth="1.6" strokeLinejoin="round" /></svg>
        <div style={{ flex: 1, minWidth: 160 }}>
          <PropRow label="Shape of the room">
            <select value={shape} onChange={e => pick(e.target.value as RoomShape)} style={propInput}>
              {(Object.keys(ROOM_SHAPE_LABEL) as RoomShape[]).map(s => <option key={s} value={s}>{ROOM_SHAPE_LABEL[s]}</option>)}
            </select>
          </PropRow>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        {shape === 'square' && <PropRow label={`Side (m)${what}`}><TilingNumInput v={room.lengthM} set={n => onChange({ lengthM: n, widthM: n })} step={0.1} /></PropRow>}
        {(shape === 'rectangle' || cut) && <PropRow label={`${cut ? 'Overall length' : 'Length'} (m)${what}`}><TilingNumInput v={room.lengthM} set={n => onChange({ lengthM: n })} step={0.1} /></PropRow>}
        {(shape === 'rectangle' || cut) && <PropRow label={`${cut ? 'Overall width' : 'Width'} (m)`}><TilingNumInput v={room.widthM} set={n => onChange({ widthM: n })} step={0.1} /></PropRow>}
        {cut && <PropRow label={shape === 't' ? 'Each cut-out, along the length (m)' : shape === 'u' ? 'Notch width, along the length (m)' : 'Cut-out along the length (m)'}><TilingNumInput v={room.cutLengthM ?? 0} set={n => onChange({ cutLengthM: n })} step={0.1} /></PropRow>}
        {cut && <PropRow label={shape === 'u' ? 'Notch depth, along the width (m)' : 'Cut-out along the width (m)'}><TilingNumInput v={room.cutWidthM ?? 0} set={n => onChange({ cutWidthM: n })} step={0.1} /></PropRow>}
        {shape === 'other' && <PropRow label={`Floor area (m²)${what}`}><TilingNumInput v={room.otherAreaM2 ?? 0} set={n => onChange({ otherAreaM2: n })} step={0.1} /></PropRow>}
        {shape === 'other' && <PropRow label="Length of the walls round it (m)"><TilingAutoInput v={room.otherPerimeterM ?? null} set={n => onChange({ otherPerimeterM: n ?? undefined })} auto={fp.perimeterM} step={0.1} /></PropRow>}
      </div>
      {fp.error
        ? <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4 }}>⚠ {fp.error}</div>
        : <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>Floor area {fp.areaM2.toFixed(2)}m², {fp.perimeterM.toFixed(1)}m of wall round it.{shape === 'other' && !room.otherPerimeterM ? ' (Wall length left blank: worked out as if it were square.)' : ''}</div>}
    </div>
  )
}

/** The tile choice shared by the floor and wall screens: size, layout, who supplies it and at what allowance, the joint and the grout */
export function TileSpecFields({ room, onChange }: {
  room: { tileId: TileSizeId; layoutId: TileLayoutId; clientSupplies: boolean; tilePriceM2: number | null; jointMm: number | null; groutId: GroutId }
  onChange: (patch: { tileId?: TileSizeId; layoutId?: TileLayoutId; clientSupplies?: boolean; tilePriceM2?: number | null; jointMm?: number | null; groutId?: GroutId }) => void
}) {
  const tile = TILE_SIZE_BY_ID[room.tileId] ?? TILE_SIZES[0]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
      <PropRow label="Tile">
        <select value={room.tileId} onChange={e => onChange({ tileId: e.target.value as TileSizeId })} style={propInput}>
          {TILE_SIZES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </PropRow>
      <PropRow label="Laid">
        <select value={room.layoutId} onChange={e => onChange({ layoutId: e.target.value as TileLayoutId })} style={propInput}>
          {TILE_LAYOUTS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </PropRow>
      <PropRow label="Tiles supplied by">
        <select value={room.clientSupplies ? 'client' : 'us'} onChange={e => onChange({ clientSupplies: e.target.value === 'client' })} style={propInput}>
          <option value="us">Us (at an allowance)</option>
          <option value="client">The client</option>
        </select>
      </PropRow>
      {!room.clientSupplies && <PropRow label="Tile allowance (£/m²) — blank = sample"><TilingAutoInput v={room.tilePriceM2} set={n => onChange({ tilePriceM2: n })} auto={tile.priceM2} /></PropRow>}
      <PropRow label="Joint (mm) — blank = usual"><TilingAutoInput v={room.jointMm} set={n => onChange({ jointMm: n })} auto={tile.jointMm} step={0.5} /></PropRow>
      <PropRow label="Grout">
        <select value={room.groutId} onChange={e => onChange({ groutId: e.target.value as GroutId })} style={propInput}>
          {GROUT_KINDS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </PropRow>
    </div>
  )
}
