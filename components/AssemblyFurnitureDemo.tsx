'use client'

/**
 * Assembly Calculator — Fitted furniture and wardrobes, by run (Joinery & Fixtures → Fitted Furniture & Wardrobes (by run)).
 * One card per run: a fitted wardrobe (hinged or sliding doors), alcove shelving or a bookcase, an under-stair cupboard, a media unit or desk. Each has its width, height and depth, and how it is made: BUILT ON SITE (the board
 * worked out from the bays, with doors, rails, drawers, plinth and a scribed filler to the ceiling), a bought KIT system we fit, or supplied by the client or the supplier (we fit only). The carpenter's time follows the board, the
 * doors and the bays, with a labourer to help. Painting is Decoration; taking out old fitted furniture is Demolition (Strip-Out by Room); lights and sockets are Electrics. The engine is lib/fitted-furniture-units.ts; the body
 * shared with the tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateFurniture, newFurnRun, baysOf, doorCountOf, boardAreaM2, FURN_KINDS, FURN_KIND_BY_ID, BUILD_LABEL, BOARD_LABEL, DOOR_LABEL, STYLE_LABEL, DEFAULT_FURN_SITUATIONS,
  type FurnRun, type FurnResult, type FurnKind, type FurnBuild, type BoardMaterial, type DoorType, type DoorStyle,
} from '@/lib/fitted-furniture-units'
import { describeFurn, describeFurnShort, type FurnDescriptionInput } from '@/lib/fitted-furniture-description'
import { suggestFurnitureLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const BUILDS = Object.keys(BUILD_LABEL) as FurnBuild[]
const BOARDS = Object.keys(BOARD_LABEL) as BoardMaterial[]
const DOORS = Object.keys(DOOR_LABEL) as DoorType[]
const STYLES = Object.keys(STYLE_LABEL) as DoorStyle[]

export default function AssemblyFurnitureDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyFurnitureDemo'
  // The job starts with no runs: you add the ones the job has (a type brings its usual size, bays, shelves and doors)
  const [runs, setRuns] = useCalcState<FurnRun[]>(ID, 'runs', [])
  const [addKind, setAddKind] = useCalcState<FurnKind>(ID, 'addKind', 'wardrobe-hinged')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')

  function addRun() { setRuns(p => [...p, newFurnRun('ff-' + uid(), `FF${p.length + 1}`, addKind)]) }
  function update(id: string, patch: Partial<FurnRun>) { setRuns(p => p.map(r => (r.id === id ? { ...r, ...patch } : r))) }
  /** a different type of run: its usual size, doors, bays and shelves (what was typed in the old one's fields is dropped, but the reference, place, build and finish stay) */
  function changeKind(r: FurnRun, kind: FurnKind) {
    const fresh = newFurnRun(r.id, r.ref, kind)
    setRuns(p => p.map(x => (x.id === r.id ? { ...fresh, location: r.location, build: r.build, board: r.board, doorStyle: r.doorStyle, situationId: r.situationId } : x)))
  }

  const result = useMemo((): { ok: true; r: FurnResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateFurniture({ runs, jobSituationId, situations: DEFAULT_FURN_SITUATIONS, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [runs, jobSituationId])
  const r = result.ok ? result.r : null

  const descInput: FurnDescriptionInput | null = r ? {
    runs: runs.map(x => ({ ref: x.ref, location: x.location, name: FURN_KIND_BY_ID[x.kind]?.label ?? 'Fitted furniture', parts: r.runs.find(s => s.runId === x.id)?.parts ?? [] })).filter(x => x.parts.length > 0),
    anyClientSupplied: runs.some(x => x.build === 'client'),
    anySite: runs.some(x => x.build === 'site'),
    occupied: jobSituationId === 'occupied' || runs.some(x => x.situationId === 'occupied'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Fitted furniture" subject="fitted furniture" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestFurnitureLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeFurnShort(descInput) : ''} descFull={descInput ? describeFurn(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Runs</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value as FurnKind)} style={{ ...tilingSmall, minWidth: 230 }}>
                {FURN_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addRun} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add run</button>
            </div>

            {runs.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No fitted furniture yet. Pick a type above and press <strong>+ Add run</strong>, then set its size, how it is made and its doors.
              </div>
            )}

            {runs.map(x => {
              const k = FURN_KIND_BY_ID[x.kind]
              const sum = r?.runs.find(s => s.runId === x.id)
              const site = x.build === 'site'
              const bays = baysOf(x)
              const b = boardAreaM2(x)
              return (
                <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={x.ref} onChange={e => update(x.id, { ref: e.target.value })} title="Reference" style={{ fontWeight: 700, fontSize: 13, width: 56, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent' }} />
                    <input value={x.location} onChange={e => update(x.id, { location: e.target.value })} placeholder="Where (bedroom 1, hall)" style={{ fontSize: 12, width: 150, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <select value={x.kind} onChange={e => changeKind(x, e.target.value as FurnKind)} style={{ ...tilingSmall, minWidth: 210 }}>
                      {FURN_KINDS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum ? `${sum.hours}h` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(x.id) > 0 ? `£${roomCost(x.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setRuns(p => p.filter(o => o.id !== x.id))} title="Remove this run" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                    <PropRow label="Width (mm)"><TilingNumInput v={x.widthMm} set={n => update(x.id, { widthMm: n })} step={50} /></PropRow>
                    <PropRow label="Height (mm)"><TilingNumInput v={x.heightMm} set={n => update(x.id, { heightMm: n })} step={50} /></PropRow>
                    <PropRow label="Depth (mm)"><TilingNumInput v={x.depthMm} set={n => update(x.id, { depthMm: n })} step={10} /></PropRow>
                    <PropRow label="Bays — blank = one to 900mm"><TilingAutoInput v={x.bays} set={n => update(x.id, { bays: n === null ? null : Math.round(n) })} auto={bays} step={1} /></PropRow>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 6 }}>
                    <PropRow label="How it is made">
                      <select value={x.build} onChange={e => update(x.id, { build: e.target.value as FurnBuild })} style={propInput}>
                        {BUILDS.map(o => <option key={o} value={o}>{BUILD_LABEL[o]}</option>)}
                      </select>
                    </PropRow>
                    {site && (
                      <PropRow label="Carcass board">
                        <select value={x.board} onChange={e => update(x.id, { board: e.target.value as BoardMaterial })} style={propInput}>
                          {BOARDS.map(o => <option key={o} value={o}>{BOARD_LABEL[o]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {x.build === 'kit' && <PropRow label="Price of the kit (£) — blank = sample"><TilingAutoInput v={x.kitPc} set={n => update(x.id, { kitPc: n })} auto={k.kitPerLm * (x.widthMm / 1000) * Math.max(0.5, x.heightMm / 2400)} step={50} /></PropRow>}
                    <PropRow label="Doors">
                      <select value={x.doors} onChange={e => update(x.id, { doors: e.target.value as DoorType })} style={propInput}>
                        {DOORS.map(o => <option key={o} value={o}>{DOOR_LABEL[o]}</option>)}
                      </select>
                    </PropRow>
                    {x.doors !== 'none' && site && (
                      <PropRow label="Door finish">
                        <select value={x.doorStyle} onChange={e => update(x.id, { doorStyle: e.target.value as DoorStyle })} style={propInput}>
                          {STYLES.map(o => <option key={o} value={o}>{STYLE_LABEL[o]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    <PropRow label="Situation">
                      <select value={x.situationId ?? ''} onChange={e => update(x.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_FURN_SITUATIONS.map(o => <option key={o.id} value={o.id}>{o.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ fontSize: 10.5, color: '#94a3b8', margin: '6px 0 2px' }}>
                    {bays} bay{bays === 1 ? '' : 's'}{x.doors !== 'none' ? `, ${doorCountOf(x)} doors` : ''}{site ? `, about ${b.total.toFixed(1)}m² of board` : ''}.
                  </div>

                  <div style={{ marginTop: 6 }}>
                    <CollapsibleSection title="Inside the bays" borderColor="#bae6fd">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                        <PropRow label="Shelves to a bay"><TilingNumInput v={x.shelvesPerBay} set={n => update(x.id, { shelvesPerBay: Math.round(n) })} /></PropRow>
                        <PropRow label="Hanging rails to a bay"><TilingNumInput v={x.railsPerBay} set={n => update(x.id, { railsPerBay: Math.round(n) })} /></PropRow>
                        <PropRow label="Drawers (nr)"><TilingNumInput v={x.drawers} set={n => update(x.id, { drawers: Math.round(n) })} /></PropRow>
                      </div>
                      <div style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 2px' }}>Shelves, rails and drawers are priced for a run built on site; a kit or a delivered run has its own.</div>
                    </CollapsibleSection>
                    <CollapsibleSection title="Ends, plinth, filler and handles" borderColor="#bae6fd">
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                        <PropRow label="Handles (nr) — blank = doors and drawers"><TilingAutoInput v={x.handles} set={n => update(x.id, { handles: n === null ? null : Math.round(n) })} auto={(x.doors === 'hinged' || x.doors === 'bifold' ? doorCountOf(x) : 0) + x.drawers} step={1} /></PropRow>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <TilingCheck label="Both ends are against walls" on={x.betweenWalls} set={b2 => update(x.id, { betweenWalls: b2 })} />
                        <TilingCheck label="Plinth" on={x.plinth} set={b2 => update(x.id, { plinth: b2 })} />
                        <TilingCheck label="Scribed filler to the ceiling" on={x.ceilingFiller} set={b2 => update(x.id, { ceilingFiller: b2 })} />
                        <TilingCheck label="We supply the handles" on={x.weSupplyHandles} set={b2 => update(x.id, { weSupplyHandles: b2 })} />
                      </div>
                    </CollapsibleSection>
                  </div>
                </div>
              )
            })}

            {r && runs.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {runs.length} run{runs.length === 1 ? '' : 's'}, {r.totalWidthM}m of furniture, {r.totalBoardM2}m² of board, about {r.totalHours} carpenter hours.
              </div>
            )}
          </>
        ),
        side: (
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="The room is">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_FURN_SITUATIONS.map(o => <option key={o.id} value={o.id}>{o.label}{o.upliftPct ? ` +${o.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the carpenter's hours. A single run can have its own. Painting is Decoration; taking out old furniture is Demolition (Strip-Out by Room).</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
