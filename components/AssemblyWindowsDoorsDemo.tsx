'use client'

/**
 * Assembly Calculator — Windows and doors, by opening (Windows & Doors → Windows & Doors Schedule (by opening)).
 * One card per opening: a window, an external door (front, back, French, bi-fold, sliding, garage) or an internal door (single, fire door, double, pocket), with its size, material, glazing, who supplies it (our price, a
 * provisional sum, or the client), and what goes with it: the cill or window board, an internal door's lining, architrave and ironmongery, taking out the old one. Each unit is priced from a sample price for its type and size;
 * the fitter's time follows the type and size, with a labourer to help. The opening in the wall (lintel, cavity closers, reveals) is priced by the wall calculator, not here. The engine is lib/wd-units.ts; the body shared with
 * the tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useEffect, useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateWindowsDoors, newOpening, unitPrice, mergePlanOpenings, planOpeningSig, KINDS, KIND_BY_ID, isInternalDoor, isWindow, DEFAULT_WD_SITUATIONS,
  MATERIAL_LABEL, GLAZING_LABEL, SUPPLY_LABEL, SWING_LABEL, CILL_LABEL,
  type WdOpening, type PlanOpening, type WdResult, type OpeningKind, type WdMaterial, type WdGlazing, type WdSupply, type WdSwing, type CillChoice,
} from '@/lib/wd-units'
import { describeWd, describeWdShort, type WdDescriptionInput } from '@/lib/wd-description'
import { suggestWindowsDoorsLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the doors and windows placed on the Take-off drawing: they are added here, and follow the drawing until typed over */
  planOpenings?: PlanOpening[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const GROUPS = ['Windows', 'External doors', 'Internal doors'] as const
const MATERIALS = Object.keys(MATERIAL_LABEL) as WdMaterial[]
const GLAZINGS = Object.keys(GLAZING_LABEL) as WdGlazing[]
const SUPPLIES = Object.keys(SUPPLY_LABEL) as WdSupply[]
const SWINGS = Object.keys(SWING_LABEL) as WdSwing[]
const CILLS = Object.keys(CILL_LABEL) as CillChoice[]

/** The next reference for a kind of opening: W1, W2 for windows, D1, D2 for external doors, ID1, ID2 for internal doors. */
function nextRef(openings: WdOpening[], kind: OpeningKind): string {
  const prefix = isWindow(kind) ? 'W' : isInternalDoor(kind) ? 'ID' : 'D'
  const used = openings.filter(o => (isWindow(o.kind) ? 'W' : isInternalDoor(o.kind) ? 'ID' : 'D') === prefix).length
  return `${prefix}${used + 1}`
}

export default function AssemblyWindowsDoorsDemo({ onClose, onSave, labourTrades = [], planOpenings }: Props) {
  const ID = 'AssemblyWindowsDoorsDemo'
  // The job starts with no openings: you add the ones the job has
  const [openings, setOpenings] = useCalcState<WdOpening[]>(ID, 'openings', [])
  const [addKind, setAddKind] = useCalcState<OpeningKind>(ID, 'addKind', 'win-casement')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'ground')

  // the openings drawn on the plan: added here, kept in step with the drawing (one typed over stays as typed until the drawing's opening changes)
  const planKey = planOpenings ? planOpenings.map(planOpeningSig).join(';') + '#' + planOpenings.map(p => p.id).join(',') : null
  useEffect(() => {
    if (planOpenings) setOpenings(p => mergePlanOpenings(p, planOpenings))
  }, [planKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function addOpening() {
    setOpenings(p => [...p, newOpening('op-' + uid(), nextRef(p, addKind), addKind)])
  }
  function update(id: string, patch: Partial<WdOpening>) { setOpenings(p => p.map(o => (o.id === id ? { ...o, ...patch } : o))) }
  /** a different kind of opening: its standard size, material and trims (what was typed in the old one's fields is dropped, but the reference, room and number stay) */
  function changeKind(o: WdOpening, kind: OpeningKind) {
    const fresh = newOpening(o.id, nextRef(openings.filter(x => x.id !== o.id), kind), kind, o.location)
    setOpenings(p => p.map(x => (x.id === o.id ? { ...fresh, qty: o.qty, supply: o.supply, pcEach: o.pcEach, removeOld: o.removeOld, planId: o.planId, fromPlan: o.fromPlan } : x)))
  }

  const result = useMemo((): { ok: true; r: WdResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateWindowsDoors({ openings, jobSituationId, situations: DEFAULT_WD_SITUATIONS, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [openings, jobSituationId])
  const r = result.ok ? result.r : null

  const count = (g: 'Windows' | 'External doors' | 'Internal doors') => openings.filter(o => KIND_BY_ID[o.kind]?.group === g).reduce((s, o) => s + (o.qty || 0), 0)
  const descInput: WdDescriptionInput | null = r ? {
    openings: openings.map(o => ({ ref: o.ref, location: o.location, parts: r.openings.find(x => x.openingId === o.id)?.parts ?? [] })).filter(o => o.parts.length > 0),
    windows: count('Windows'), externalDoors: count('External doors'), internalDoors: count('Internal doors'),
    anyProvisional: openings.some(o => o.supply === 'pc'), anyClientSupplied: openings.some(o => o.supply === 'client'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Windows and doors" subject="windows and doors" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestWindowsDoorsLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeWdShort(descInput) : ''} descFull={descInput ? describeWd(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Openings</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value as OpeningKind)} style={{ ...tilingSmall, minWidth: 190 }}>
                {GROUPS.map(g => (
                  <optgroup key={g} label={g}>
                    {KINDS.filter(k => k.group === g).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <button type="button" onClick={addOpening} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add opening</button>
            </div>

            {openings.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No openings yet. Pick a kind of window or door above and press <strong>+ Add opening</strong>, then set its size, material and who supplies it.
              </div>
            )}

            {openings.map(o => {
              const k = KIND_BY_ID[o.kind]
              const internal = isInternalDoor(o.kind), win = isWindow(o.kind)
              const each = unitPrice(o)
              return (
                <div key={o.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={o.ref} onChange={e => update(o.id, { ref: e.target.value })} title="Reference on the schedule" style={{ fontWeight: 700, fontSize: 13, width: 52, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent' }} />
                    <input value={o.location} onChange={e => update(o.id, { location: e.target.value })} placeholder="Room / wall" style={{ fontSize: 12, width: 130, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <select value={o.kind} onChange={e => changeKind(o, e.target.value as OpeningKind)} style={{ ...tilingSmall, minWidth: 170 }}>
                      {GROUPS.map(g => (
                        <optgroup key={g} label={g}>
                          {KINDS.filter(x => x.group === g).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{o.supply === 'client' ? 'client supplies' : `£${each.toFixed(0)} each`}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(o.id) > 0 ? `£${roomCost(o.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setOpenings(p => p.filter(x => x.id !== o.id))} title="Remove this opening" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    <PropRow label="Width (mm)"><TilingNumInput v={o.widthMm} set={n => update(o.id, { widthMm: n })} step={10} /></PropRow>
                    <PropRow label="Height (mm)"><TilingNumInput v={o.heightMm} set={n => update(o.id, { heightMm: n })} step={10} /></PropRow>
                    <PropRow label="Number of these"><TilingNumInput v={o.qty} set={n => update(o.id, { qty: Math.max(1, Math.round(n)) })} min={1} /></PropRow>
                    {!internal && (
                      <PropRow label="Material">
                        <select value={o.material} onChange={e => update(o.id, { material: e.target.value as WdMaterial })} style={propInput}>
                          {MATERIALS.map(m => <option key={m} value={m}>{MATERIAL_LABEL[m]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {!internal && (
                      <PropRow label="Glazing">
                        <select value={o.glazing} onChange={e => update(o.id, { glazing: e.target.value as WdGlazing })} style={propInput}>
                          {GLAZINGS.map(g => <option key={g} value={g}>{GLAZING_LABEL[g]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    <PropRow label="Supplied by">
                      <select value={o.supply} onChange={e => update(o.id, { supply: e.target.value as WdSupply })} style={propInput}>
                        {SUPPLIES.map(s => <option key={s} value={s}>{SUPPLY_LABEL[s]}</option>)}
                      </select>
                    </PropRow>
                    {o.supply === 'pc' && <PropRow label="PC sum each (£) — blank = sample"><TilingAutoInput v={o.pcEach} set={n => update(o.id, { pcEach: n })} auto={each} step={10} /></PropRow>}
                    {k.swings && (
                      <PropRow label="Opens">
                        <select value={o.swing} onChange={e => update(o.id, { swing: e.target.value as WdSwing })} style={propInput}>
                          {SWINGS.map(s => <option key={s} value={s}>{SWING_LABEL[s]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {win && (
                      <PropRow label="Cill and board">
                        <select value={o.cill} onChange={e => update(o.id, { cill: e.target.value as CillChoice })} style={propInput}>
                          {CILLS.map(c => <option key={c} value={c}>{CILL_LABEL[c]}</option>)}
                        </select>
                      </PropRow>
                    )}
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    {!internal && <TilingCheck label="Coloured (not white)" on={o.coloured} set={b => update(o.id, { coloured: b })} />}
                    {internal && o.kind !== 'door-int-pocket' && <TilingCheck label="Lining" on={o.lining} set={b => update(o.id, { lining: b })} />}
                    {internal && <TilingCheck label="Architrave" on={o.architrave} set={b => update(o.id, { architrave: b })} />}
                    {internal && <TilingCheck label="Ironmongery" on={o.ironmongery} set={b => update(o.id, { ironmongery: b })} />}
                    {o.removeOld && (
                      <>
                        <TilingCheck label="Take out the old one" on={o.removeOld} set={b => update(o.id, { removeOld: b })} />
                        <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 2, lineHeight: 1.4 }}>
                          Taking out old windows and doors is now priced in Demolition, Strip-Out by Room. This tick is kept only so a quote priced before keeps its figure: untick it once the removal is priced there.
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}

            {r && openings.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {openings.length} line{openings.length === 1 ? '' : 's'}, {r.totalUnits} unit{r.totalUnits === 1 ? '' : 's'} ({count('Windows')} window{count('Windows') === 1 ? '' : 's'}, {count('External doors')} external door{count('External doors') === 1 ? '' : 's'}, {count('Internal doors')} internal door{count('Internal doors') === 1 ? '' : 's'}), {r.totalAreaM2}m² of openings, about {r.totalFitterHours} fitter hours.
              </div>
            )}
          </>
        ),
        side: (
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="Access">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_WD_SITUATIONS.map(s => <option key={s.id} value={s.id}>{s.label}{s.upliftPct ? ` +${s.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the fitting hours. The lintels, cavity closers and reveals of each opening are priced with the wall, not here.</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
