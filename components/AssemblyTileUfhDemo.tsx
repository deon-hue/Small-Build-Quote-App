'use client'

/**
 * Assembly Calculator — Electric underfloor heating under tiles, by room (Tiling & Finishes → Electric Underfloor Heating).
 * Each room is sized (length, width, less the floor under a bath or units) and the heated area follows (or is typed). The kit is chosen to cover it: loose-wire heating mats of standard sizes (150 or 200 W per m²)
 * or loose cable for an awkward shape. Each room has its own thermostat with a floor sensor, insulation board under the mat, a primer, optionally a levelling coat over the mat, and the electrician's connection as a
 * subcontract line per thermostat (or left out when the client's own electrician connects it). The tiler lays the mat, chases the sensor and tests it. The tiles are Floor Tiling; the floor under all of it is Tiling
 * Preparation. WATER underfloor heating is the Underfloor Heating calculator under Plumbing & Heating. The engine is lib/tile-ufh-units.ts; the body shared with the other three tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateTileUfh, newTileUfhRoom, heatedAreaM2, UFH_KITS, THERMOSTAT_INFO, INSULATION_INFO,
  type TileUfhRoom, type TileUfhResult, type UfhKit, type UfhThermostat, type UfhInsulation,
} from '@/lib/tile-ufh-units'
import { DEFAULT_TILING_SITUATIONS, TILING_ROOM_KINDS } from '@/lib/tiling-common'
import { describeTileUfh, describeTileUfhShort, type TilingDescriptionInput } from '@/lib/tiling-description'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const THERMOSTATS = Object.keys(THERMOSTAT_INFO) as UfhThermostat[]
const INSULATIONS = Object.keys(INSULATION_INFO) as UfhInsulation[]

export default function AssemblyTileUfhDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyTileUfhDemo'
  // The job starts with no rooms: you add the ones being heated
  const [rooms, setRooms] = useCalcState<TileUfhRoom[]>(ID, 'rooms', [])
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'bathroom')
  const [startKit, setStartKit] = useCalcState<UfhKit>(ID, 'startKit', 'mat150')
  const [startInsulation, setStartInsulation] = useCalcState<UfhInsulation>(ID, 'startInsulation', '6mm')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')
  const [electricianIncluded, setElectricianIncluded] = useCalcState(ID, 'electricianIncluded', true)

  function addRoom() {
    setRooms(p => {
      const k = TILING_ROOM_KINDS.find(x => x.id === addKind) ?? TILING_ROOM_KINDS[0]
      const n = p.filter(x => x.kindId === addKind).length
      return [...p, newTileUfhRoom('room-' + uid(), n === 0 ? k.label.split(' (')[0] : `${k.label.split(' (')[0]} ${n + 1}`, addKind, k, { kit: startKit, insulation: startInsulation })]
    })
  }
  function updateRoom(id: string, patch: Partial<TileUfhRoom>) { setRooms(p => p.map(r => r.id === id ? { ...r, ...patch } : r)) }

  const result = useMemo((): { ok: true; r: TileUfhResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateTileUfh({ rooms, jobSituationId, situations: DEFAULT_TILING_SITUATIONS, rates: {}, electricianIncluded }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [rooms, jobSituationId, electricianIncluded])
  const r = result.ok ? result.r : null

  const descInput: TilingDescriptionInput | null = r ? {
    rooms: r.rooms.map(x => ({ name: x.name, parts: x.parts })),
    occupied: jobSituationId === 'occupied' || rooms.some(x => x.situationId === 'occupied'),
    electricianByOthers: !electricianIncluded,
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Electric underfloor heating" subject="underfloor heating" lines={r?.lines ?? []} labourTasks={r?.labour ?? []}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeTileUfhShort(descInput) : ''} descFull={descInput ? describeTileUfh(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Rooms</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...tilingSmall, minWidth: 150 }}>
                {TILING_ROOM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addRoom} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add room</button>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>
              A new room starts with
              {' '}<select value={startKit} onChange={e => setStartKit(e.target.value as UfhKit)} style={{ ...tilingSmall, maxWidth: 260 }}>
                {UFH_KITS.map(k => <option key={k.id} value={k.id}>{k.short}</option>)}
              </select>
              {' '}and
              {' '}<select value={startInsulation} onChange={e => setStartInsulation(e.target.value as UfhInsulation)} style={{ ...tilingSmall, maxWidth: 170 }}>
                {INSULATIONS.map(i => <option key={i} value={i}>{INSULATION_INFO[i].label.toLowerCase()}</option>)}
              </select> under it. Change any room afterwards.
            </div>

            {rooms.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No rooms yet. Pick a kind of room above and press <strong>+ Add room</strong>, then change its size and the kit.
              </div>
            )}

            {rooms.map(rm => {
              const sum = r?.rooms.find(s => s.roomId === rm.id)
              return (
                <div key={rm.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={rm.name} onChange={e => updateRoom(rm.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120, flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.coveredM2}m² · ${(sum.watts / 1000).toFixed(2)}kW${sum.mats.length ? ` · mats ${sum.mats.join(' + ')}` : ''}` : ''}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(rm.id) > 0 ? `£${roomCost(rm.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setRooms(p => p.filter(x => x.id !== rm.id))} title="Remove this room" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    <PropRow label="Length (m)"><TilingNumInput v={rm.lengthM} set={n => updateRoom(rm.id, { lengthM: n })} step={0.1} /></PropRow>
                    <PropRow label="Width (m)"><TilingNumInput v={rm.widthM} set={n => updateRoom(rm.id, { widthM: n })} step={0.1} /></PropRow>
                    <PropRow label="Under fixed things (m²)"><TilingNumInput v={rm.fixedM2} set={n => updateRoom(rm.id, { fixedM2: n })} step={0.1} /></PropRow>
                    <PropRow label="Heated area (m²) — blank = from the room"><TilingAutoInput v={rm.heatedAreaOverrideM2} set={n => updateRoom(rm.id, { heatedAreaOverrideM2: n })} auto={heatedAreaM2(rm)} /></PropRow>
                  </div>
                  <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>Heated area is the floor less what is under a bath, units or anything fixed, and 5cm clear of the walls. Heat must never run under fixed furniture or a bath.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                    <PropRow label="Kit">
                      <select value={rm.kit} onChange={e => updateRoom(rm.id, { kit: e.target.value as UfhKit })} style={propInput}>
                        {UFH_KITS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Thermostat">
                      <select value={rm.thermostat} onChange={e => updateRoom(rm.id, { thermostat: e.target.value as UfhThermostat })} style={propInput}>
                        {THERMOSTATS.map(t => <option key={t} value={t}>{THERMOSTAT_INFO[t].label}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Insulation under the mat">
                      <select value={rm.insulation} onChange={e => updateRoom(rm.id, { insulation: e.target.value as UfhInsulation })} style={propInput}>
                        {INSULATIONS.map(i => <option key={i} value={i}>{INSULATION_INFO[i].label}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Levelling compound over the mat (mm) — 0 = none"><TilingNumInput v={rm.coverMm} set={n => updateRoom(rm.id, { coverMm: n })} step={1} /></PropRow>
                    <PropRow label="Situation">
                      <select value={rm.situationId ?? ''} onChange={e => updateRoom(rm.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_TILING_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    <TilingCheck label="Primer to the floor" on={rm.primer} set={b => updateRoom(rm.id, { primer: b })} />
                  </div>
                </div>
              )
            })}

            {r && rooms.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {rooms.length} room{rooms.length === 1 ? '' : 's'}: {r.totalHeatedM2}m² of heating, {(r.totalWatts / 1000).toFixed(2)}kW in all, {r.thermostats} thermostat{r.thermostats === 1 ? '' : 's'}, about {r.totalTilerHours} tiler hours.
              </div>
            )}
          </>
        ),
        side: (
          <>
            <CollapsibleSection title="Job situation" borderColor="#bae6fd">
              <PropRow label="Rooms are">
                <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                  {DEFAULT_TILING_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label}{s.upliftPct ? ` +${s.upliftPct}%` : ''}</option>)}
                </select>
              </PropRow>
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the tiler's hours. A single room can have its own.</div>
            </CollapsibleSection>
            <CollapsibleSection title="Electrical connection" borderColor="#bae6fd">
              <TilingCheck label="We include the electrician's connection, test and certificate" on={electricianIncluded} set={setElectricianIncluded} />
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 6px' }}>Each thermostat needs a dedicated circuit with a 30mA RCD, connected by a qualified electrician (Part P). Untick it if the client's own electrician does it: no line is priced and the quote says so.</div>
            </CollapsibleSection>
          </>
        ),
      })}
    </TilingCalcFrame>
  )
}
