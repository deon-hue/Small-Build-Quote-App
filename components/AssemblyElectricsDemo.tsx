'use client'

/**
 * Assembly Calculator — Electrical installation, priced room by room (Electrics → Electrical Installation).
 * An electrician normally charges a price per point, all in, so each room is a list of points with a count and a rate. A "situation" (new build,
 * refurbishment, occupied house, hard to reach, listed building) adds a percentage you set to the points, for the whole job or one room. A special
 * fitting (a chandelier, breakfast bar pendants...) is charged as an extra install on top of its point, with or without us supplying the fitting.
 * A room where per-point doesn't fit can be priced by the day instead. Whole-house items (consumer unit, testing and certificate, extra circuits)
 * are at the bottom of the list. Counts and prices only: the circuit design, cable sizes and certificate are the electrician's. The engine is
 * lib/electrics-units.ts. Not drawn from a plan yet: counts are typed here (a later step lets Take-off points fill them in).
 */

import React, { useMemo, useState } from 'react'
import { costLayer, type AssemblyLayerDef, type CostedLine } from '@/lib/assembly-calc'
import {
  calculateElectrics, POINT_TYPES, POINT_BY_ID, GROUP_LABEL, ROOM_TYPES, ROOM_TYPE_BY_ID, DEFAULT_SITUATIONS, FITTING_TYPES, FITTING_BY_ID,
  WHOLE_HOUSE_ITEMS, type ElectricsRoom, type ElectricsFitting, type Situation, type PointGroup, type ElectricsResult,
} from '@/lib/electrics-units'
import { describeElectrics, describeElectricsShort, type ElectricsDescriptionInput } from '@/lib/electrics-description'
import { fmt } from '@/lib/utils'
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
}

const GROUP_COLOUR: Record<PointGroup, string> = { sockets: '#2563eb', switches: '#7c3aed', lighting: '#f59e0b', appliances: '#16a34a', safety: '#dc2626', data: '#0891b2' }
const GROUPS = Object.keys(GROUP_LABEL) as PointGroup[]

let roomSeq = 0
let fittingSeq = 0
const lcFirst = (s: string) => (s.length > 1 && /[A-Z]/.test(s[1]) ? s : s.charAt(0).toLowerCase() + s.slice(1))

function newRoom(typeId: string, existingOfType: number): ElectricsRoom {
  const t = ROOM_TYPE_BY_ID[typeId]
  return {
    id: 'room-' + ++roomSeq, name: existingOfType === 0 ? t.label : `${t.label} ${existingOfType + 1}`, typeId,
    points: { ...t.points }, situationId: null, mode: 'points', days: 1, dayRate: 260, fittings: [],
  }
}

export default function AssemblyElectricsDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const [name, setName]         = useState('Electrical installation')
  const [location, setLocation] = useState('')
  const [qty, setQty]           = useState(1)
  // The job starts with no rooms: you add the ones it has. Only the testing and certificate is in the starting price.
  const [rooms, setRooms]       = useState<ElectricsRoom[]>([])
  const [wholeHouse, setWholeHouse] = useState<Record<string, number>>(() => Object.fromEntries(WHOLE_HOUSE_ITEMS.map(w => [w.id, w.defaultQty])))
  const [jobSituationId, setJobSituationId] = useState('new-build')
  const [situations, setSituations] = useState<Situation[]>(DEFAULT_SITUATIONS)
  const [pointRates, setPointRates] = useState<Record<string, number>>({})
  const [fittingRates, setFittingRates] = useState<Record<string, number>>({})
  const [wholeHouseRates, setWholeHouseRates] = useState<Record<string, number>>({})
  const [addType, setAddType]   = useState('kitchen')
  const [profitPct, setProfitPct] = useState(20)   // default profit margin
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})
  const [disabledLayerIds, setDisabledLayerIds] = useState<Set<string>>(new Set())
  function toggleLayer(id: string) { setDisabledLayerIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const noSidesLayers = useMemo(() => new Set<string>(), [])

  function updateRoom(id: string, patch: Partial<ElectricsRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }
  function setCount(roomId: string, pointId: string, n: number) { setRooms(p => p.map(r => r.id === roomId ? { ...r, points: { ...r.points, [pointId]: Math.max(0, n) } } : r)) }
  function removePoint(roomId: string, pointId: string) { setRooms(p => p.map(r => { if (r.id !== roomId) return r; const pts = { ...r.points }; delete pts[pointId]; return { ...r, points: pts } })) }
  function addFitting(roomId: string) {
    const f: ElectricsFitting = { id: 'fit-' + ++fittingSeq, typeId: 'pendant-cluster', name: '', count: 1, supply: 'client', fittingCost: 0 }
    setRooms(p => p.map(r => r.id === roomId ? { ...r, fittings: [...r.fittings, f] } : r))
  }
  function updateFitting(roomId: string, fid: string, patch: Partial<ElectricsFitting>) {
    setRooms(p => p.map(r => r.id === roomId ? { ...r, fittings: r.fittings.map(f => f.id === fid ? { ...f, ...patch } : f) } : r))
  }
  function removeFitting(roomId: string, fid: string) { setRooms(p => p.map(r => r.id === roomId ? { ...r, fittings: r.fittings.filter(f => f.id !== fid) } : r)) }

  const result = useMemo((): { ok: true; r: ElectricsResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateElectrics({ rooms, wholeHouse, jobSituationId, situations, pointRates, fittingRates, wholeHouseRates }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, wholeHouse, jobSituationId, situations, pointRates, fittingRates, wholeHouseRates])
  const r = result.ok ? result.r : null

  const layers: AssemblyLayerDef[] = useMemo(() => (r?.lines ?? []).map(l => ({
    id: l.id, name: l.name, category: l.category, source: 'fixed' as const, unit: l.unit,
    unitCost: rateOverrides[l.id] != null ? rateOverrides[l.id] : l.unitCost, fixedQty: l.qty, wastePct: 0,
  })), [r, rateOverrides])
  const costedLines: CostedLine[] = layers.map(l => costLayer(l, l.fixedQty ?? 0))

  // Miscellaneous materials
  const [miscMaterialLines, setMiscMaterialLines] = useState<MiscMaterialLine[]>([])
  function addMisc() { setMiscMaterialLines(p => [...p, { id: newMiscMaterialLineId(), name: '', qty: 1, unit: 'item', unitCost: 0 }]) }
  function updateMisc(id: string, patch: Partial<MiscMaterialLine>) { setMiscMaterialLines(p => p.map(m => m.id === id ? { ...m, ...patch } : m)) }
  function removeMisc(id: string) { setMiscMaterialLines(p => p.filter(m => m.id !== id)) }
  function handleRate(id: string, unitCost: number) {
    if (miscMaterialLines.some(m => m.id === id)) updateMisc(id, { unitCost: Math.max(0, unitCost) })
    else setRateOverrides(p => ({ ...p, [id]: Math.max(0, unitCost) }))
  }

  // Own labour (e.g. chasing and making good) — starts empty: the electrician's work is in the point prices
  const [labourLines, setLabourLines] = useState<LabourLine[]>([])
  const addLabour = () => setLabourLines(prev => [...prev, { id: newLabourLineId(), tradeId: prev[0]?.tradeId ?? '', task: '', hours: 0 }])
  const updateLabour = (id: string, patch: Partial<LabourLine>) => setLabourLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  const removeLabour = (id: string) => setLabourLines(prev => prev.filter(l => l.id !== id))

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
  // the list that can be printed or downloaded: every priced line, as a schedule of the points
  const scheduleLines: CostedLine[] = enabledMaterialLines.map(l => ({ ...l, category: 'materials' as const }))

  // The customer's description follows the rooms until it's edited by hand
  const descInput: ElectricsDescriptionInput | null = r ? {
    rooms: rooms.map(rm => ({
      name: rm.name.trim() || 'Room',
      days: rm.mode === 'days' ? rm.days : null,
      items: rm.mode === 'days' ? [] : POINT_TYPES.filter(p => (rm.points[p.id] ?? 0) > 0).map(p => {
        const n = rm.points[p.id]
        const word = n === 1 ? lcFirst(p.name) : p.plural
        return p.unit === 'm²' ? `${n} ${p.plural}` : /^\d/.test(word) ? `${n} × ${word}` : `${n} ${word}`
      }),
      fittings: rm.fittings.filter(f => f.count > 0).map(f => {
        const ft = FITTING_BY_ID[f.typeId]
        const label = f.name.trim() || (f.count === 1 ? lcFirst(ft.name) : ft.plural)
        return `${f.count} ${label}${f.supply === 'client' ? ' (client-supplied)' : ''}`
      }),
    })),
    wholeHouse: WHOLE_HOUSE_ITEMS.filter(w => w.id !== 'certificate' && (wholeHouse[w.id] ?? 0) > 0).map(w => (wholeHouse[w.id] === 1 ? lcFirst(w.name) : `${wholeHouse[w.id]} × ${lcFirst(w.name)}`)),
    certificate: (wholeHouse['certificate'] ?? 0) > 0,
    totalPoints: r.totalPoints, fittingCount: r.fittingCount,
  } : null
  const [descriptionOverride, setDescriptionOverride] = useState<string | null>(null)
  const [detailOverride, setDetailOverride] = useState<string | null>(null)
  const description = descriptionOverride ?? (descInput ? describeElectricsShort(descInput) : '')
  const detail = detailOverride ?? (descInput ? describeElectrics(descInput) : '')

  const numInput = (v: number, set: (n: number) => void, min = 0, step = 1) => (
    <input type="number" min={min} step={step} value={v} onChange={e => set(Math.max(min, +e.target.value || 0))} style={propInput} />
  )
  const small: React.CSSProperties = { fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
  const box: React.CSSProperties = { width: '100%', fontSize: 12, lineHeight: 1.5, color: '#1e293b', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 5, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }
  const following = (override: string | null, reset: () => void, what: string) => override === null
    ? <span style={{ fontSize: 10, color: '#16a34a' }}>updates as you change the rooms</span>
    : <button onClick={reset} title={`Go back to the ${what} written from the rooms — overwrites your edits below`} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Edited by you — regenerate from the rooms</button>
  const jobSit = situations.find(s => s.id === jobSituationId)

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
        {r && <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>{fmt(totalCost * qty)}</span>}
        {r && <MaterialsListButtons lines={scheduleLines} title={`${name} — schedule of points`} location={location} description={description} compact />}
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
          {/* Add a room */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
            <select value={addType} onChange={e => setAddType(e.target.value)} style={{ ...small, minWidth: 190 }}>
              {ROOM_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
            <button type="button" onClick={() => setRooms(p => [...p, newRoom(addType, p.filter(x => x.typeId === addType).length)])}
              style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>A new room comes with its usual points — change the numbers to suit.</span>
          </div>

          {rooms.length === 0 && (
            <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
              No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>. The testing and certificate is already in the price.
            </div>
          )}

          {rooms.map(rm => {
            const sum = r?.roomSummaries.find(s => s.roomId === rm.id)
            const roomCost = (r?.lines ?? []).filter(l => l.roomId === rm.id).reduce((s, l) => s + l.qty * (rateOverrides[l.id] ?? l.unitCost), 0)
            const unused = POINT_TYPES.filter(p => rm.points[p.id] === undefined)
            return (
              <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                  <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={small}
                    title="The situation for this room: the percentage added to its points. 'Job standard' follows the situation set for the whole job.">
                    <option value="">Job standard{jobSit ? ` (${jobSit.upliftPct >= 0 ? '+' : ''}${jobSit.upliftPct}%)` : ''}</option>
                    {situations.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]} ({s.upliftPct >= 0 ? '+' : ''}{s.upliftPct}%)</option>)}
                  </select>
                  <div style={{ display: 'inline-flex', gap: 2 }}>
                    {(['points', 'days'] as const).map(m => (
                      <button key={m} type="button" onClick={() => updateRoom(rm.id, { mode: m })}
                        title={m === 'points' ? 'Price this room per point' : 'Price this room as electrician days instead of per point'}
                        style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', border: `1px solid ${rm.mode === m ? '#0369a1' : '#e2e8f0'}`, background: rm.mode === m ? '#0369a1' : '#fff', color: rm.mode === m ? '#fff' : '#64748b' }}>
                        {m === 'points' ? 'Per point' : 'By the day'}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{fmt(roomCost)}</span>
                  <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room"
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                </div>

                {rm.mode === 'days' ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <div style={{ width: 120 }}><PropRow label="Electrician days">{numInput(rm.days, n => updateRoom(rm.id, { days: n }), 0, 0.5)}</PropRow></div>
                    <div style={{ width: 120 }}><PropRow label="Day rate (£)">{numInput(rm.dayRate, n => updateRoom(rm.id, { dayRate: n }), 0, 5)}</PropRow></div>
                    <div style={{ fontSize: 10.5, color: '#94a3b8', flex: 1 }}>This room's points above are not priced while it is by the day (they are kept if you switch back).</div>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '4px 12px' }}>
                      {POINT_TYPES.filter(p => rm.points[p.id] !== undefined).map(p => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: GROUP_COLOUR[p.group], flexShrink: 0 }} />
                          <span style={{ fontSize: 11.5, color: '#334155', flex: 1, minWidth: 0 }}>{p.name}{p.unit === 'm²' ? ' (m²)' : ''}</span>
                          <input type="number" min={0} step={p.unit === 'm²' ? 0.5 : 1} value={rm.points[p.id]} onChange={e => setCount(rm.id, p.id, +e.target.value || 0)} style={{ ...small, width: 54, textAlign: 'right' }} />
                          <button type="button" onClick={() => removePoint(rm.id, p.id)} title="Take this point type out of the room" style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                        </div>
                      ))}
                    </div>
                    {unused.length > 0 && (
                      <select value="" onChange={e => { if (e.target.value) setCount(rm.id, e.target.value, 1) }} style={{ ...small, marginTop: 6, color: '#64748b' }}>
                        <option value="">+ Add another kind of point…</option>
                        {GROUPS.map(g => {
                          const opts = unused.filter(p => p.group === g)
                          return opts.length === 0 ? null : <optgroup key={g} label={GROUP_LABEL[g]}>{opts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                        })}
                      </select>
                    )}
                  </>
                )}

                {/* Special fittings: an extra install charge on top of the point */}
                <div style={{ marginTop: 8, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                  {rm.fittings.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                      <span title="A special fitting" style={{ fontSize: 13 }}>✨</span>
                      <select value={f.typeId} onChange={e => updateFitting(rm.id, f.id, { typeId: e.target.value })} style={small}>
                        {FITTING_TYPES.map(t => <option key={t.id} value={t.id}>{t.name} — £{(fittingRates[t.id] ?? t.installRate)} install</option>)}
                      </select>
                      <input value={f.name} onChange={e => updateFitting(rm.id, f.id, { name: e.target.value })} placeholder="What it is (optional), e.g. breakfast bar pendants" style={{ ...small, flex: 1, minWidth: 140 }} />
                      <input type="number" min={0} value={f.count} onChange={e => updateFitting(rm.id, f.id, { count: Math.max(0, +e.target.value || 0) })} style={{ ...small, width: 46, textAlign: 'right' }} title="How many" />
                      <select value={f.supply} onChange={e => updateFitting(rm.id, f.id, { supply: e.target.value as 'client' | 'us' })} style={small} title="Who buys the fitting">
                        <option value="client">Client supplies</option>
                        <option value="us">We supply</option>
                      </select>
                      {f.supply === 'us' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>£</span>
                          <input type="number" min={0} step={5} value={f.fittingCost} onChange={e => updateFitting(rm.id, f.id, { fittingCost: Math.max(0, +e.target.value || 0) })} style={{ ...small, width: 64, textAlign: 'right' }} title="Price of the fitting itself, each (a provisional sum)" />
                        </span>
                      )}
                      <button type="button" onClick={() => removeFitting(rm.id, f.id)} title="Remove" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addFitting(rm.id)} style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontSize: 11.5, padding: 0 }}>
                    + Special fitting (chandelier, feature pendants…)
                  </button>
                </div>
                {sum && sum.uplift !== 0 && rm.mode === 'points' && <div style={{ fontSize: 10.5, color: '#92400e', marginTop: 4 }}>Points in this room are priced {sum.uplift > 0 ? '+' : ''}{sum.uplift}% for the situation.</div>}
              </div>
            )
          })}

          {r && rooms.length > 0 && <PointsDrawing summaries={r.roomSummaries} />}
          {r && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {r.roomCount} room{r.roomCount === 1 ? '' : 's'}, {r.totalPoints} point{r.totalPoints === 1 ? '' : 's'}{r.fittingCount > 0 ? `, ${r.fittingCount} special fitting${r.fittingCount === 1 ? '' : 's'}` : ''}.
              Each point's price is all in (cable, back box, accessory, fitting off, connected and tested).
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PropRow label="Situation for the whole job">
            <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
              {situations.map(s => <option key={s.id} value={s.id}>{s.label} ({s.upliftPct >= 0 ? '+' : ''}{s.upliftPct}%)</option>)}
            </select>
          </PropRow>

          <CollapsibleSection title="Whole house" borderColor="#bae6fd">
            {WHOLE_HOUSE_ITEMS.map(w => (
              <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{w.name}</span>
                <input type="number" min={0} value={wholeHouse[w.id] ?? 0} onChange={e => setWholeHouse(p => ({ ...p, [w.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 46, textAlign: 'right' }} />
                <span style={{ fontSize: 10.5, color: '#94a3b8' }}>£</span>
                <input type="number" min={0} value={wholeHouseRates[w.id] ?? w.rate} onChange={e => setWholeHouseRates(p => ({ ...p, [w.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 58, textAlign: 'right' }} title="Price each" />
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Situations (the % added to points)" borderColor="#bae6fd">
            {situations.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{s.label}</span>
                <input type="number" step={1} value={s.upliftPct} onChange={e => setSituations(p => p.map(x => x.id === s.id ? { ...x, upliftPct: +e.target.value || 0 } : x))} style={{ ...small, width: 54, textAlign: 'right' }} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>%</span>
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection title="Point rates (£ each, all in)" borderColor="#bae6fd">
            {GROUPS.map(g => (
              <div key={g} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: GROUP_COLOUR[g], textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, marginBottom: 2 }}>{GROUP_LABEL[g]}</div>
                {POINT_TYPES.filter(p => p.group === g).map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{p.name}{p.unit === 'm²' ? ' (per m²)' : ''}</span>
                    <span style={{ fontSize: 10.5, color: '#94a3b8' }}>£</span>
                    <input type="number" min={0} value={pointRates[p.id] ?? p.rate} onChange={e => setPointRates(prev => ({ ...prev, [p.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 62, textAlign: 'right' }} />
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700, margin: '6px 0 2px' }}>Special fitting install</div>
            {FITTING_TYPES.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <span style={{ fontSize: 11.5, color: '#334155', flex: 1 }}>{t.name}</span>
                <span style={{ fontSize: 10.5, color: '#94a3b8' }}>£</span>
                <input type="number" min={0} value={fittingRates[t.id] ?? t.installRate} onChange={e => setFittingRates(prev => ({ ...prev, [t.id]: Math.max(0, +e.target.value || 0) }))} style={{ ...small, width: 62, textAlign: 'right' }} />
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>Sample rates — use your electrician's own prices. You can also change any single line in the cost breakdown below.</div>
          </CollapsibleSection>

          <PropRow label={`Profit % (${profitPct}%)`}><input type="range" min={0} max={50} value={profitPct} onChange={e => setProfitPct(+e.target.value)} style={{ width: '100%' }} /></PropRow>
        </div>

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

// ── The drawing: each room as a bar, one coloured part per kind of point ──
function PointsDrawing({ summaries }: { summaries: ElectricsResult['roomSummaries'] }) {
  const rows = summaries.length
  const max = Math.max(1, ...summaries.map(s => s.points))
  const rowH = 24, labelW = 130, barW = 250, vbW = labelW + barW + 60, vbH = rows * rowH + 34
  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', maxHeight: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4 }}>
      {summaries.map((s, i) => {
        const y = 8 + i * rowH
        let x = labelW
        return (
          <g key={s.roomId}>
            <text x={labelW - 6} y={y + 12} fontSize={10} fill="#334155" textAnchor="end">{s.name.length > 20 ? s.name.slice(0, 19) + '…' : s.name}</text>
            {s.mode === 'days'
              ? <text x={labelW} y={y + 12} fontSize={10} fill="#94a3b8">priced by the day</text>
              : GROUPS.map(g => {
                  const n = s.byGroup[g]
                  if (n <= 0) return null
                  const w = (n / max) * barW
                  const el = <rect key={g} x={x} y={y} width={Math.max(w, 1)} height={rowH - 8} fill={GROUP_COLOUR[g]} rx={2}><title>{GROUP_LABEL[g]}: {n}</title></rect>
                  x += w
                  return el
                })}
            <text x={labelW + barW + 6} y={y + 12} fontSize={10} fill="#475569">{s.mode === 'days' ? '' : s.points}{s.fittings > 0 ? ` ✨${s.fittings}` : ''}</text>
          </g>
        )
      })}
      {GROUPS.map((g, i) => (
        <g key={g} transform={`translate(${8 + i * 78}, ${vbH - 16})`}>
          <rect width={9} height={9} fill={GROUP_COLOUR[g]} rx={2} />
          <text x={13} y={8} fontSize={9} fill="#64748b">{GROUP_LABEL[g].replace(' & fans', '')}</text>
        </g>
      ))}
    </svg>
  )
}
