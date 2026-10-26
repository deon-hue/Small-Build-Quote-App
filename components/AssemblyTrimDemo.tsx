'use client'

/**
 * Assembly Calculator — Skirtings, architraves and trim, by room (Joinery & Fixtures → Skirtings, Architraves & Trim (by room)).
 * Each room has its skirting (a profile, the wall round the room less the doors and any gaps), the corners that are scribed or mitred, and the extras the job may have: architraves to doors that are not on the
 * Windows & Doors schedule and to windows, dado rail, picture rail and scotia or quadrant. The timber is priced per metre from a sample rate for its profile with a waste allowance (or left out when the client
 * supplies it) and the carpenter's time follows the length and the corners. Taking off old skirting is Demolition (Strip-Out by Room); door units and the architrave of a door on that schedule are Windows & Doors;
 * painting is Decoration. The engine is lib/skirting-units.ts; the body shared with the tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useEffect, useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateTrim, newTrimRoom, skirtingLmOf, roomPerimeterM, SKIRTING_PROFILES, SKIRTING_PROFILE_BY_ID, ARCHITRAVE_PROFILES, ARCHITRAVE_BY_ID, RAILS, TRIM_ROOM_KINDS, TRIM_ROOM_KIND_BY_ID,
  DEFAULT_TRIM_SITUATIONS, DOOR_DEDUCT_M, DOOR_SET_LM, WINDOW_SET_LM,
  type TrimRoom, type TrimResult, type SkirtingProfileId, type ArchitraveId, type RailKind,
} from '@/lib/skirting-units'
import PlanRoomsBar from '@/components/PlanRoomsBar'
import { followPlanRooms, planRoomSig, trimKindFor } from '@/lib/rooms-merge'
import type { PlanRoomInfo } from '@/lib/rooms-from-walls'
import { sidesFromAreaPerimeter } from '@/lib/tiling-common'
import { describeTrim, describeTrimShort, type TrimDescriptionInput } from '@/lib/skirting-description'
import { suggestTrimLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** Take-off's drawn area (m²) and perimeter (m): the first room is sized from them and follows them */
  externalAreaM2?: number
  externalPerimeterM?: number
  /** the name of the room the drawn shape sits in, when that room is named */
  externalName?: string
  /** the rooms found on the Take-off plan: they can be added with their sizes, and follow the plan until typed over */
  planRooms?: PlanRoomInfo[]
}

const uid = () => Math.random().toString(36).slice(2, 9)

export default function AssemblyTrimDemo({ onClose, onSave, labourTrades = [], externalAreaM2, externalPerimeterM, externalName, planRooms }: Props) {
  const ID = 'AssemblyTrimDemo'
  // The area drawn in Take-off (if any) sizes the first room, which follows it until the drawing changes
  const planArea = externalAreaM2 && externalAreaM2 > 0 ? externalAreaM2 : 0
  const planPerimeter = externalPerimeterM && externalPerimeterM > 0 ? externalPerimeterM : 0
  const planSides = planArea > 0 ? sidesFromAreaPerimeter(planArea, planPerimeter) : null
  const planName = externalName?.trim() || 'Room from the plan'
  const [startSkirting, setStartSkirting] = useCalcState<SkirtingProfileId>(ID, 'startSkirting', 'mdf-chamfer')
  const [startArchitrave, setStartArchitrave] = useCalcState<ArchitraveId>(ID, 'startArchitrave', 'mdf-chamfer')
  const planRoom = (): TrimRoom => ({
    ...newTrimRoom('room-' + uid(), planName, 'other', TRIM_ROOM_KIND_BY_ID.other, { skirtingId: startSkirting, architraveId: startArchitrave }),
    lengthM: planSides?.long ?? 4, widthM: planSides?.short ?? 3, perimeterOverrideM: planPerimeter > 0 ? planPerimeter : null, doors: 1,
    fromPlan: { areaM2: planArea, perimeterM: planPerimeter, name: planName },
  })
  // The job starts with no rooms: you add the ones that get trim (or the drawn area is the first)
  const [rooms, setRooms] = useCalcState<TrimRoom[]>(ID, 'rooms', () => (planSides ? [planRoom()] : []))
  useEffect(() => {
    if (!planSides) return
    setRooms(p => (p.length === 0 ? [planRoom()] : p.map(r => {
      const fp = r.fromPlan
      if (!fp || (fp.areaM2 === planArea && fp.perimeterM === planPerimeter && (fp.name ?? 'Room from the plan') === planName)) return r
      const resized = fp.areaM2 !== planArea || fp.perimeterM !== planPerimeter
      return {
        ...r, name: r.name === (fp.name ?? 'Room from the plan') ? planName : r.name,
        ...(resized ? { lengthM: planSides.long, widthM: planSides.short, perimeterOverrideM: planPerimeter > 0 ? planPerimeter : null } : {}),
        fromPlan: { areaM2: planArea, perimeterM: planPerimeter, name: planName },
      }
    })))
  }, [planArea, planPerimeter, planName]) // eslint-disable-line react-hooks/exhaustive-deps
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'bedroom')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')
  const [wastePct, setWastePct] = useCalcState(ID, 'wastePct', 10)

  function addRoom() {
    setRooms(p => {
      const k = TRIM_ROOM_KINDS.find(x => x.id === addKind) ?? TRIM_ROOM_KINDS[0]
      const n = p.filter(x => x.kindId === addKind).length
      return [...p, newTrimRoom('room-' + uid(), n === 0 ? k.label.split(' / ')[0].split(' (')[0] : `${k.label.split(' / ')[0].split(' (')[0]} ${n + 1}`, addKind, k, { skirtingId: startSkirting, architraveId: startArchitrave })]
    })
  }
  function updateRoom(id: string, patch: Partial<TrimRoom>) { setRooms(p => p.map(r => (r.id === id ? { ...r, ...patch } : r))) }

  // a room from the Take-off plan: the length of wall round it (so an L-shaped room measures right), its doors and the width they take
  const fitToPlan = (r: TrimRoom, pr: PlanRoomInfo): TrimRoom => {
    const sides = sidesFromAreaPerimeter(pr.areaM2, pr.perimeterM)
    return { ...r, lengthM: sides.long, widthM: sides.short, perimeterOverrideM: pr.perimeterM, doors: pr.doors, doorWidthM: pr.doorWidthM > 0 ? pr.doorWidthM : null }
  }
  function addPlanRooms(list: PlanRoomInfo[]) {
    setRooms(p => {
      const made = list.filter(pr => !p.some(r => r.planRoomId === pr.id)).map(pr => {
        const k = TRIM_ROOM_KIND_BY_ID[trimKindFor(pr.kind)] ?? TRIM_ROOM_KIND_BY_ID.other
        const room = fitToPlan(newTrimRoom('room-' + uid(), pr.name, k.id, k, { skirtingId: startSkirting, architraveId: startArchitrave }), pr)
        return { ...room, planRoomId: pr.id, planRoomSig: planRoomSig(pr) }
      })
      return [...p, ...made]
    })
  }
  const planRoomsKey = planRooms ? planRooms.map(p => p.id + ':' + planRoomSig(p)).join(';') : null
  useEffect(() => {
    if (planRooms) setRooms(p => followPlanRooms(p, planRooms, fitToPlan))
  }, [planRoomsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const result = useMemo((): { ok: true; r: TrimResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateTrim({ rooms, jobSituationId, situations: DEFAULT_TRIM_SITUATIONS, wastePct, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, jobSituationId, wastePct])
  const r = result.ok ? result.r : null

  const descInput: TrimDescriptionInput | null = r ? {
    rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })),
    anyClientSupplied: rooms.some(x => x.clientSupplies),
    anyUnprimed: rooms.some(x => !x.clientSupplies && ((x.skirting && !SKIRTING_PROFILE_BY_ID[x.skirtingId]?.primed) || ((x.doorArchSets > 0 || x.windowArchSets > 0) && !ARCHITRAVE_BY_ID[x.architraveId]?.primed))),
    occupied: jobSituationId === 'occupied' || rooms.some(x => x.situationId === 'occupied'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Skirtings and trim" subject="skirtings and trim" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestTrimLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeTrimShort(descInput) : ''} descFull={descInput ? describeTrim(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <PlanRoomsBar planRooms={planRooms} isAdded={id => rooms.some(x => x.planRoomId === id)} onAdd={x => addPlanRooms([x])} onAddAll={addPlanRooms} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...tilingSmall, minWidth: 150 }}>
                {TRIM_ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addRoom} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
              {planSides && !rooms.some(x => x.fromPlan) && (
                <button type="button" onClick={() => setRooms(p => [...p, planRoom()])} title="Add the area drawn on the plan as a room" style={{ ...tilingSmall, cursor: 'pointer', background: '#f1f5f9' }}>+ The drawn area ({planArea.toFixed(1)}m²)</button>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
              A new room starts with
              {' '}<select value={startSkirting} onChange={e => setStartSkirting(e.target.value as SkirtingProfileId)} style={{ ...tilingSmall, maxWidth: 230 }}>
                {SKIRTING_PROFILES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {' '}skirting. Change any room afterwards. Architraves, rails and the other extras start off: tick what the room has.
            </div>

            {rooms.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>, then set its size, doors and the skirting it gets.
              </div>
            )}

            {rooms.map(rm => {
              const sum = r?.rooms.find(s => s.roomId === rm.id)
              const perimeter = roomPerimeterM(rm)
              const hasArch = rm.doorArchSets > 0 || rm.windowArchSets > 0 || RAILS.some(x => (rm.railsLm[x.id] ?? 0) > 0)
              return (
                <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120 }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum && sum.trimLm > 0 ? `${sum.skirtingLm}m of skirting${sum.trimLm !== sum.skirtingLm ? `, ${sum.trimLm}m of trim in all` : ''}` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(rm.id) > 0 ? `£${roomCost(rm.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    <PropRow label="Length (m)"><TilingNumInput v={rm.lengthM} set={n => updateRoom(rm.id, { lengthM: n, perimeterOverrideM: rm.fromPlan || rm.planRoomId ? rm.perimeterOverrideM : null })} step={0.1} /></PropRow>
                    <PropRow label="Width (m)"><TilingNumInput v={rm.widthM} set={n => updateRoom(rm.id, { widthM: n, perimeterOverrideM: rm.fromPlan || rm.planRoomId ? rm.perimeterOverrideM : null })} step={0.1} /></PropRow>
                    <PropRow label="Wall round it (m) — blank = from the size"><TilingAutoInput v={rm.perimeterOverrideM} set={n => updateRoom(rm.id, { perimeterOverrideM: n })} auto={2 * (rm.lengthM + rm.widthM)} step={0.1} /></PropRow>
                    <PropRow label="Doors (nr)"><TilingNumInput v={rm.doors} set={n => updateRoom(rm.id, { doors: Math.round(n), doorWidthM: null })} /></PropRow>
                    <PropRow label="Taken off (m) — units, patio doors"><TilingNumInput v={rm.deductLm} set={n => updateRoom(rm.id, { deductLm: n })} step={0.1} /></PropRow>
                    <PropRow label="Added back (m) — chimney, alcoves"><TilingNumInput v={rm.addLm} set={n => updateRoom(rm.id, { addLm: n })} step={0.1} /></PropRow>
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>
                    {perimeter.toFixed(1)}m of wall less {rm.doorWidthM != null ? `${rm.doorWidthM.toFixed(1)}m of doors (from the plan)` : `${rm.doors} door${rm.doors === 1 ? '' : 's'} at ${DOOR_DEDUCT_M}m`}{rm.deductLm > 0 ? ` less ${rm.deductLm}m` : ''}{rm.addLm > 0 ? ` plus ${rm.addLm}m` : ''} = {skirtingLmOf(rm).toFixed(1)}m of skirting.
                  </div>
                  <div style={{ marginBottom: 6 }}><TilingCheck label="Skirting in this room" on={rm.skirting} set={b => updateRoom(rm.id, { skirting: b })} /></div>
                  {rm.skirting && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                      <PropRow label="Skirting">
                        <select value={rm.skirtingId} onChange={e => updateRoom(rm.id, { skirtingId: e.target.value as SkirtingProfileId })} style={propInput}>
                          {SKIRTING_PROFILES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </PropRow>
                      <PropRow label="Internal corners"><TilingNumInput v={rm.internalCorners} set={n => updateRoom(rm.id, { internalCorners: Math.round(n) })} /></PropRow>
                      <PropRow label="External corners"><TilingNumInput v={rm.externalCorners} set={n => updateRoom(rm.id, { externalCorners: Math.round(n) })} /></PropRow>
                      <PropRow label="Plinth blocks (nr)"><TilingNumInput v={rm.plinthBlocks} set={n => updateRoom(rm.id, { plinthBlocks: Math.round(n) })} /></PropRow>
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <CollapsibleSection title={`Architraves and other trim${hasArch ? ' ✓' : ''}`} borderColor="#bae6fd" defaultOpen={hasArch}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                        <PropRow label="Architrave">
                          <select value={rm.architraveId} onChange={e => updateRoom(rm.id, { architraveId: e.target.value as ArchitraveId })} style={propInput}>
                            {ARCHITRAVE_PROFILES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                        </PropRow>
                        <PropRow label="Doors to architrave (sets)"><TilingNumInput v={rm.doorArchSets} set={n => updateRoom(rm.id, { doorArchSets: Math.round(n) })} /></PropRow>
                        <PropRow label="Windows to architrave (sets)"><TilingNumInput v={rm.windowArchSets} set={n => updateRoom(rm.id, { windowArchSets: Math.round(n) })} /></PropRow>
                        {RAILS.map(x => (
                          <PropRow key={x.id} label={`${x.label} (m)`}><TilingNumInput v={rm.railsLm[x.id] ?? 0} set={n => updateRoom(rm.id, { railsLm: { ...rm.railsLm, [x.id as RailKind]: n } })} step={0.5} /></PropRow>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 2px' }}>A door set is both sides of one door ({DOOR_SET_LM}m); a window set is {WINDOW_SET_LM}m round a 1200 x 1200 window. A door on the Windows & Doors schedule already has its architrave priced there: only add a door here that is not.</div>
                    </CollapsibleSection>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, marginTop: 6 }}>
                    <PropRow label="Situation">
                      <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_TRIM_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    <TilingCheck label="The client supplies the timber (we fit only)" on={rm.clientSupplies} set={b => updateRoom(rm.id, { clientSupplies: b })} />
                  </div>
                </div>
              )
            })}

            {r && rooms.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {rooms.length} room{rooms.length === 1 ? '' : 's'}: {r.totalSkirtingLm}m of skirting, {r.totalTrimLm}m of trim in all, about {r.totalHours} carpenter hours.
              </div>
            )}
          </>
        ),
        side: (
          <>
            <CollapsibleSection title="Job situation" borderColor="#bae6fd">
              <PropRow label="Rooms are">
                <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                  {DEFAULT_TRIM_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label}{s.upliftPct ? ` +${s.upliftPct}%` : ''}</option>)}
                </select>
              </PropRow>
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the carpenter's hours. A single room can have its own. Taking off the old skirting is in Demolition (Strip-Out by Room); painting is Decoration.</div>
            </CollapsibleSection>
            <CollapsibleSection title="Waste" borderColor="#bae6fd">
              <PropRow label="Extra timber for cuts and offcuts (%)"><TilingNumInput v={wastePct} set={n => setWastePct(Math.min(50, n))} step={1} /></PropRow>
            </CollapsibleSection>
          </>
        ),
      })}
    </TilingCalcFrame>
  )
}
