'use client'

/**
 * Assembly Calculator — Staircase and balustrade, by staircase (Joinery & Fixtures → Staircase & Balustrade (by staircase)).
 * One card per staircase: its shape (straight, quarter or half turn with a landing or winders, spiral), the floor-to-floor height (which gives the number of risers and the rise), the going and the width, and how it is
 * supplied: a made staircase we fit, built on site by the carpenter, or the client's own. Then its balustrade (timber spindles, glass or stainless rods, newel posts, handrails on the open sides and the wall, guarding along
 * a landing) and, if wanted, the underside boarded in. The rise, going and pitch are checked against Part K. The stairwell opening is priced with the floor; taking out the old staircase is Demolition (Strip-Out by Room).
 * The engine is lib/stairs-units.ts; the body shared with the tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateStairs, newStaircase, stairGeometry, STAIR_KINDS, BUILD_LABEL, MATERIAL_LABEL, BAL_LABEL, DEFAULT_STAIR_SITUATIONS, MAX_RISE_MM, MIN_GOING_MM, MAX_PITCH_DEG,
  type Staircase, type StairResult, type StairKind, type StairBuild, type StairMaterial, type BalStyle,
} from '@/lib/stairs-units'
import { describeStairs, describeStairsShort, type StairsDescriptionInput } from '@/lib/stairs-description'
import { suggestStairsLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const BUILDS = Object.keys(BUILD_LABEL) as StairBuild[]
const MATERIALS = Object.keys(MATERIAL_LABEL) as StairMaterial[]
const BALS = Object.keys(BAL_LABEL) as BalStyle[]

export default function AssemblyStairsDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyStairsDemo'
  // The job starts with no staircases: you add the ones the job has
  const [stairs, setStairs] = useCalcState<Staircase[]>(ID, 'stairs', [])
  const [addKind, setAddKind] = useCalcState<StairKind>(ID, 'addKind', 'straight')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')

  function addStair() {
    setStairs(p => [...p, { ...newStaircase('st-' + uid(), `S${p.length + 1}`), kind: addKind }])
  }
  function update(id: string, patch: Partial<Staircase>) { setStairs(p => p.map(s => (s.id === id ? { ...s, ...patch } : s))) }

  const result = useMemo((): { ok: true; r: StairResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateStairs({ stairs, jobSituationId, situations: DEFAULT_STAIR_SITUATIONS, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [stairs, jobSituationId])
  const r = result.ok ? result.r : null

  const descInput: StairsDescriptionInput | null = r ? {
    stairs: stairs.map(s => ({ ref: s.ref, location: s.location, parts: r.stairs.find(x => x.stairId === s.id)?.parts ?? [] })).filter(s => s.parts.length > 0),
    anyClientSupplied: stairs.some(s => s.clientSupplies || s.balClientSupplies),
    occupied: jobSituationId === 'occupied' || stairs.some(s => s.situationId === 'occupied'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Staircase and balustrade" subject="staircases" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestStairsLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeStairsShort(descInput) : ''} descFull={descInput ? describeStairs(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Staircases</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value as StairKind)} style={{ ...tilingSmall, minWidth: 210 }}>
                {STAIR_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addStair} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add staircase</button>
            </div>

            {stairs.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No staircases yet. Pick a shape above and press <strong>+ Add staircase</strong>, then set the floor-to-floor height, the width, how it is supplied and the balustrade.
              </div>
            )}

            {stairs.map(s => {
              const spiral = s.kind === 'spiral'
              const g = stairGeometry(s)
              const bad = !spiral && (g.riseMm > MAX_RISE_MM || s.goingMm < MIN_GOING_MM || g.pitchDeg > MAX_PITCH_DEG)
              const supplied = s.clientSupplies
              return (
                <div key={s.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={s.ref} onChange={e => update(s.id, { ref: e.target.value })} title="Reference" style={{ fontWeight: 700, fontSize: 13, width: 52, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent' }} />
                    <input value={s.location} onChange={e => update(s.id, { location: e.target.value })} placeholder="Where (main stairs, loft)" style={{ fontSize: 12, width: 160, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <select value={s.kind} onChange={e => update(s.id, { kind: e.target.value as StairKind })} style={{ ...tilingSmall, minWidth: 200 }}>
                      {STAIR_KINDS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(s.id) > 0 ? `£${roomCost(s.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setStairs(p => p.filter(x => x.id !== s.id))} title="Remove this staircase" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                    <PropRow label="Floor to floor (mm)"><TilingNumInput v={s.heightMm} set={n => update(s.id, { heightMm: n })} step={10} /></PropRow>
                    <PropRow label="Risers — blank = worked out"><TilingAutoInput v={s.risersOverride} set={n => update(s.id, { risersOverride: n === null ? null : Math.round(n) })} auto={g.risers} step={1} /></PropRow>
                    {!spiral && <PropRow label="Going (mm)"><TilingNumInput v={s.goingMm} set={n => update(s.id, { goingMm: n })} step={5} /></PropRow>}
                    <PropRow label={spiral ? 'Diameter (mm)' : 'Width (mm)'}><TilingNumInput v={s.widthMm} set={n => update(s.id, { widthMm: n })} step={10} /></PropRow>
                  </div>
                  {!spiral && (
                    <div style={{ fontSize: 10.5, margin: '4px 0 6px', color: bad ? '#b45309' : '#94a3b8' }}>
                      {g.risers} risers of {Math.round(g.riseMm)}mm, {g.treads} treads, pitch {g.pitchDeg.toFixed(1)}°, run about {(g.runMm / 1000).toFixed(2)}m, {g.rakeM.toFixed(2)}m along the slope. Part K: rise up to {MAX_RISE_MM}mm, going at least {MIN_GOING_MM}mm, pitch up to {MAX_PITCH_DEG}°.
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                    {!spiral && (
                      <PropRow label="Supplied and made">
                        <select value={s.build} onChange={e => update(s.id, { build: e.target.value as StairBuild })} style={propInput} disabled={supplied}>
                          {BUILDS.map(b => <option key={b} value={b}>{BUILD_LABEL[b]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    <PropRow label="Material">
                      <select value={s.material} onChange={e => update(s.id, { material: e.target.value as StairMaterial })} style={propInput}>
                        {MATERIALS.map(m => <option key={m} value={m}>{MATERIAL_LABEL[m]}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Situation">
                      <select value={s.situationId ?? ''} onChange={e => update(s.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_STAIR_SITUATIONS.map(x => <option key={x.id} value={x.id}>{x.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    {!spiral && <TilingCheck label="Open risers" on={s.openRisers} set={b => update(s.id, { openRisers: b })} />}
                    <TilingCheck label="The client supplies the staircase (we fit only)" on={s.clientSupplies} set={b => update(s.id, { clientSupplies: b })} />
                  </div>

                  {!spiral && (
                    <div style={{ marginTop: 8 }}>
                      <CollapsibleSection title={`Balustrade and handrail${s.balSides > 0 || s.wallHandrail || s.landingBalLm > 0 ? ' ✓' : ''}`} borderColor="#bae6fd" defaultOpen={s.balSides > 0 || s.wallHandrail || s.landingBalLm > 0}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
                          <PropRow label="Open sides (balustrade)">
                            <select value={s.balSides} onChange={e => update(s.id, { balSides: +e.target.value as 0 | 1 | 2 })} style={propInput}>
                              <option value={0}>None (both sides against a wall)</option>
                              <option value={1}>One side</option>
                              <option value={2}>Both sides</option>
                            </select>
                          </PropRow>
                          <PropRow label="Style">
                            <select value={s.balStyle} onChange={e => update(s.id, { balStyle: e.target.value as BalStyle })} style={propInput}>
                              {BALS.map(b => <option key={b} value={b}>{BAL_LABEL[b]}</option>)}
                            </select>
                          </PropRow>
                          <PropRow label="Guarding along the landing (m)"><TilingNumInput v={s.landingBalLm} set={n => update(s.id, { landingBalLm: n })} step={0.5} /></PropRow>
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <TilingCheck label="Handrail on the wall side" on={s.wallHandrail} set={b => update(s.id, { wallHandrail: b })} />
                          <TilingCheck label="The client supplies the balustrade (we fit only)" on={s.balClientSupplies} set={b => update(s.id, { balClientSupplies: b })} />
                        </div>
                      </CollapsibleSection>
                      <CollapsibleSection title={`Underside boarded in${s.soffitM2 > 0 ? ' ✓' : ''}`} borderColor="#bae6fd" defaultOpen={s.soffitM2 > 0}>
                        <PropRow label="Area of the underside (m²)"><TilingNumInput v={s.soffitM2} set={n => update(s.id, { soffitM2: n })} step={0.5} /></PropRow>
                        <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 4px' }}>Fire-resisting board on battens. The plastering or taping is Plastering & Boarding.</div>
                      </CollapsibleSection>
                    </div>
                  )}
                  {spiral && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>A spiral kit has its own handrail, so no balustrade is priced.</div>}
                </div>
              )
            })}

            {r && stairs.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {stairs.length} staircase{stairs.length === 1 ? '' : 's'}, {r.totalRisers} risers in all, {r.totalBalLm}m of balustrade and handrail, about {r.totalHours} carpenter hours.
              </div>
            )}
          </>
        ),
        side: (
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="The house is">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_STAIR_SITUATIONS.map(x => <option key={x.id} value={x.id}>{x.label}{x.upliftPct ? ` +${x.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the carpenter's hours. A single staircase can have its own. The stairwell opening is priced with the floor; taking out the old staircase is Demolition (Strip-Out by Room).</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
