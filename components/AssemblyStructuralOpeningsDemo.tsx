'use client'

/**
 * Assembly Calculator — Structural openings, by opening (Structural Frame → Structural Openings (by opening)).
 * A new opening cut through an existing wall, or formed in a new wall, with the steelwork that carries what is above it: steel beams (the section picked from the span and the load above, or typed), steel posts on concrete
 * pads, padstones, the fire protection to the steel, and for a cut in a standing wall the needles and props, the masonry cut out, the rubble away and the jambs made good. The engineer and the Building Control notice are
 * priced; the steel sections are indicative (the engineer designs the real ones). The engine is lib/structural-openings-units.ts; the body shared with the tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateStructuralOpenings, newStructuralOpening, usualBeams, beamFor, BEAM_SECTIONS, POST_SECTIONS, WALL_LABEL, WALL_THICKNESS, FORMED_LABEL, LOAD_LABEL, FINISH_LABEL, POST_ROLE_LABEL, DEFAULT_STRUCTURAL_SITUATIONS,
  type StructuralOpening, type StructuralResult, type OpeningFormed, type OpeningWallKind, type LoadAbove, type SteelFinish, type SteelBy, type PostRole,
} from '@/lib/structural-openings-units'
import { describeStructuralOpenings, describeStructuralOpeningsShort, type StructuralDescriptionInput } from '@/lib/structural-openings-description'
import { suggestStructuralOpeningsLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const WALLS = Object.keys(WALL_LABEL) as OpeningWallKind[]
const FORMEDS = Object.keys(FORMED_LABEL) as OpeningFormed[]
const LOADS = Object.keys(LOAD_LABEL) as LoadAbove[]
const FINISHES = Object.keys(FINISH_LABEL) as SteelFinish[]
const ROLES = Object.keys(POST_ROLE_LABEL) as PostRole[]

export default function AssemblyStructuralOpeningsDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyStructuralOpeningsDemo'
  // The job starts with no openings: you add the ones the job has
  const [openings, setOpenings] = useCalcState<StructuralOpening[]>(ID, 'openings', [])
  const [addFormed, setAddFormed] = useCalcState<OpeningFormed>(ID, 'addFormed', 'cut-existing')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'clear')
  const [buildingControl, setBuildingControl] = useCalcState(ID, 'buildingControl', true)
  const [dustProtection, setDustProtection] = useCalcState(ID, 'dustProtection', false)

  function addOpening() { setOpenings(p => [...p, newStructuralOpening('so-' + uid(), `SO${p.length + 1}`, addFormed)]) }
  function update(id: string, patch: Partial<StructuralOpening>) { setOpenings(p => p.map(x => (x.id === id ? { ...x, ...patch } : x))) }
  /** a different kind of wall: its usual thickness and beams (the beam count only follows while it is still the usual for the old wall) */
  function changeWall(x: StructuralOpening, wall: OpeningWallKind) {
    const t = WALL_THICKNESS[wall]
    update(x.id, { wall, thicknessMm: t, beams: x.beams === usualBeams(x.thicknessMm) ? usualBeams(t) : x.beams })
  }
  function changeThickness(x: StructuralOpening, mm: number) {
    update(x.id, { thicknessMm: mm, beams: x.beams === usualBeams(x.thicknessMm) ? usualBeams(mm) : x.beams })
  }
  /** cut or new wall: the things that only belong to one of them follow (a cut in a standing wall is load-bearing with the engineer to start; a new wall has neither) */
  function changeFormed(x: StructuralOpening, formed: OpeningFormed) {
    update(x.id, { formed, loadBearing: formed === 'cut-existing', engineer: formed === 'cut-existing', makeGood: formed === 'cut-existing' })
  }

  const result = useMemo((): { ok: true; r: StructuralResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateStructuralOpenings({ openings, jobSituationId, situations: DEFAULT_STRUCTURAL_SITUATIONS, buildingControl, dustProtection, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [openings, jobSituationId, buildingControl, dustProtection])
  const r = result.ok ? result.r : null

  const descInput: StructuralDescriptionInput | null = r ? {
    openings: openings.map(x => ({ ref: x.ref, location: x.location, name: 'Structural opening', parts: r.openings.find(s => s.openingId === x.id)?.parts ?? [] })).filter(x => x.parts.length > 0),
    anyCut: openings.some(x => x.formed === 'cut-existing'),
    anyLoadBearing: openings.some(x => x.loadBearing),
    anySteelContractor: openings.some(x => x.steelBy === 'sub' && (x.beams > 0 || x.posts > 0)),
    buildingControl: buildingControl && openings.some(x => x.loadBearing),
    occupied: jobSituationId === 'occupied' || openings.some(x => x.situationId === 'occupied'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Structural openings" subject="structural openings" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestStructuralOpeningsLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeStructuralOpeningsShort(descInput) : ''} descFull={descInput ? describeStructuralOpenings(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Openings</span>
              <select value={addFormed} onChange={e => setAddFormed(e.target.value as OpeningFormed)} style={{ ...tilingSmall, minWidth: 280 }}>
                {FORMEDS.map(f => <option key={f} value={f}>{FORMED_LABEL[f]}</option>)}
              </select>
              <button type="button" onClick={addOpening} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add opening</button>
            </div>

            {openings.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No openings yet. Pick whether it is cut in an existing wall or formed in a new one and press <strong>+ Add opening</strong>, then set its size, the wall and the steel.
              </div>
            )}

            {openings.map(x => {
              const sum = r?.openings.find(s => s.openingId === x.id)
              const cut = x.formed === 'cut-existing'
              const widthM = x.widthMm / 1000
              const spanM = widthM / (x.postRole === 'mid' && x.posts > 0 ? x.posts + 1 : 1)
              const suggested = x.widthMm > 0 ? beamFor(spanM, x.loadAbove) : null
              return (
                <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={x.ref} onChange={e => update(x.id, { ref: e.target.value })} title="Reference" style={{ fontWeight: 700, fontSize: 13, width: 56, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent' }} />
                    <input value={x.location} onChange={e => update(x.id, { location: e.target.value })} placeholder="Where (kitchen to dining room)" style={{ fontSize: 12, width: 190, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <select value={x.formed} onChange={e => changeFormed(x, e.target.value as OpeningFormed)} style={{ ...tilingSmall, minWidth: 250 }}>
                      {FORMEDS.map(f => <option key={f} value={f}>{FORMED_LABEL[f]}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum && sum.steelKg > 0 ? `${sum.steelKg}kg steel` : ''}{sum && sum.hours > 0 ? ` · ${sum.hours}h` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(x.id) > 0 ? `£${roomCost(x.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setOpenings(p => p.filter(o => o.id !== x.id))} title="Remove this opening" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.4, margin: '2px 0 4px' }}>The opening</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    <PropRow label="Width, the span (mm)"><TilingNumInput v={x.widthMm} set={n => update(x.id, { widthMm: n })} step={100} /></PropRow>
                    <PropRow label="Height (mm)"><TilingNumInput v={x.heightMm} set={n => update(x.id, { heightMm: n })} step={50} /></PropRow>
                    <PropRow label="Number of these"><TilingNumInput v={x.qty} set={n => update(x.id, { qty: Math.max(1, Math.round(n)) })} min={1} /></PropRow>
                    <PropRow label="What kind of wall">
                      <select value={x.wall} onChange={e => changeWall(x, e.target.value as OpeningWallKind)} style={propInput}>
                        {WALLS.map(k => <option key={k} value={k}>{WALL_LABEL[k]}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Wall thickness (mm)"><TilingNumInput v={x.thicknessMm} set={n => changeThickness(x, Math.max(1, n))} step={5} /></PropRow>
                    <PropRow label="What is above it">
                      <select value={x.loadAbove} onChange={e => update(x.id, { loadAbove: e.target.value as LoadAbove })} style={propInput}>
                        {LOADS.map(k => <option key={k} value={k}>{LOAD_LABEL[k]}</option>)}
                      </select>
                    </PropRow>
                  </div>

                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.4, margin: '10px 0 4px' }}>The steel</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    <PropRow label="Beams over the opening"><TilingNumInput v={x.beams} set={n => update(x.id, { beams: Math.max(0, Math.round(n)) })} min={0} /></PropRow>
                    {x.beams > 0 && (
                      <PropRow label="Beam section">
                        <select value={x.section} onChange={e => update(x.id, { section: e.target.value })} style={propInput}>
                          <option value="auto">{suggested ? `Pick from the span: ${suggested.section.label}${suggested.beyond ? ' (beyond the table)' : ''}` : 'Pick from the span'}</option>
                          {BEAM_SECTIONS.map(b => <option key={b.label} value={b.label}>{b.label}</option>)}
                        </select>
                      </PropRow>
                    )}
                    <PropRow label="Steel posts"><TilingNumInput v={x.posts} set={n => update(x.id, { posts: Math.max(0, Math.round(n)) })} min={0} /></PropRow>
                    {x.posts > 0 && (
                      <PropRow label="Post section">
                        <select value={x.postSection} onChange={e => update(x.id, { postSection: e.target.value })} style={propInput}>
                          {POST_SECTIONS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {x.posts > 0 && x.beams > 0 && (
                      <PropRow label="What the posts do">
                        <select value={x.postRole} onChange={e => update(x.id, { postRole: e.target.value as PostRole })} style={propInput}>
                          {ROLES.map(k => <option key={k} value={k}>{POST_ROLE_LABEL[k]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {x.posts > 0 && <PropRow label="Post height (mm)"><TilingNumInput v={x.postHeightMm} set={n => update(x.id, { postHeightMm: n })} step={50} /></PropRow>}
                    {x.posts > 0 && <PropRow label="Pad, length (mm)"><TilingNumInput v={x.padLengthMm} set={n => update(x.id, { padLengthMm: n })} step={50} /></PropRow>}
                    {x.posts > 0 && <PropRow label="Pad, width (mm)"><TilingNumInput v={x.padWidthMm} set={n => update(x.id, { padWidthMm: n })} step={50} /></PropRow>}
                    {x.posts > 0 && <PropRow label="Pad, depth (mm)"><TilingNumInput v={x.padDepthMm} set={n => update(x.id, { padDepthMm: n })} step={50} /></PropRow>}
                    {x.beams > 0 && (
                      <PropRow label="Padstones under the beam ends">
                        <TilingNumInput v={x.padstones ?? Math.max(0, 2 * x.beams - (x.postRole === 'ends' ? x.posts : 0))} set={n => update(x.id, { padstones: Math.max(0, Math.round(n)) })} min={0} />
                      </PropRow>
                    )}
                    <PropRow label="Who fits the steel">
                      <select value={x.steelBy} onChange={e => update(x.id, { steelBy: e.target.value as SteelBy })} style={propInput}>
                        <option value="us">We supply and fit it</option>
                        <option value="sub">A steelwork contractor supplies and fits it</option>
                      </select>
                    </PropRow>
                    <PropRow label="Fire protection to the steel">
                      <select value={x.finish} onChange={e => update(x.id, { finish: e.target.value as SteelFinish })} style={propInput}>
                        {FINISHES.map(k => <option key={k} value={k}>{FINISH_LABEL[k]}</option>)}
                      </select>
                    </PropRow>
                    {cut && x.loadBearing && <PropRow label="Weeks the props stay up"><TilingNumInput v={x.propWeeks} set={n => update(x.id, { propWeeks: Math.max(0, n) })} step={0.5} min={0} /></PropRow>}
                    <PropRow label="Situation">
                      <select value={x.situationId ?? ''} onChange={e => update(x.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_STRUCTURAL_SITUATIONS.map(o => <option key={o.id} value={o.id}>{o.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    <TilingCheck label="It carries load (needles and props, and the engineer)" on={x.loadBearing} set={b => update(x.id, { loadBearing: b, engineer: b && cut })} />
                    {x.loadBearing && <TilingCheck label="Include the structural engineer's calculations" on={x.engineer} set={b => update(x.id, { engineer: b })} />}
                    {x.beams + x.posts > 0 && x.steelBy === 'us' && <TilingCheck label="A Hiab or lorry crane lifts the steel in" on={x.hiab} set={b => update(x.id, { hiab: b })} />}
                    {cut && <TilingCheck label="Make good the jambs (bricks, mortar and DPC, and the bricklayer)" on={x.makeGood} set={b => update(x.id, { makeGood: b })} />}
                  </div>
                </div>
              )
            })}

            {r && openings.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {r.totalOpenings} opening{r.totalOpenings === 1 ? '' : 's'}{r.totalSteelKg > 0 ? `, about ${r.totalSteelKg}kg of steel` : ''}, about {r.totalHours} hours of labour. The steel sections are indicative: the engineer designs the real ones.
              </div>
            )}
          </>
        ),
        side: (
          <>
            <CollapsibleSection title="Job situation" borderColor="#bae6fd">
              <PropRow label="The work is">
                <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                  {DEFAULT_STRUCTURAL_SITUATIONS.map(o => <option key={o.id} value={o.id}>{o.label}{o.upliftPct ? ` +${o.upliftPct}%` : ''}</option>)}
                </select>
              </PropRow>
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the labour hours. A single opening can have its own.</div>
            </CollapsibleSection>
            <CollapsibleSection title="For the whole job" borderColor="#bae6fd">
              <TilingCheck label="Building Control notice and inspections (once, when an opening carries load)" on={buildingControl} set={setBuildingControl} />
              <TilingCheck label="Dust sheets and a temporary screen" on={dustProtection} set={setDustProtection} />
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The door or window and its frame are Windows and Doors. Plastering the reveals is Plastering and Boarding. Taking out a whole wall is Demolition.</div>
            </CollapsibleSection>
          </>
        ),
      })}
    </TilingCalcFrame>
  )
}
