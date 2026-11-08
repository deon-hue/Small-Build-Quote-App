'use client'

/**
 * Assembly Calculator — Steel Beams, Columns & Posts, by member (Structural Frame → Steel Beams, Columns & Posts (by member)).
 * The structural members that are not over an opening: steel beams, steel columns, hollow section posts, engineered timber beams (LVL or glulam) and timber posts. Each member has its section, length, number, who fits
 * it (us, or a steelwork contractor by the kilo), its finish (primed, galvanised, intumescent, cased in fire board, none) and how it is held: a beam on padstones or bolted through end plates, a post or column on a
 * base plate on a concrete pad. The engineer, the Building Control notice and the Hiab are once for the job. The engine is lib/structural-steel-units.ts; the body shared with the tiling calculators is
 * components/TilingCalcFrame.tsx. The sections are samples to price from: the engineer designs the real ones.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateSteelwork, newMember, sectionsFor, MEMBER_KINDS, KIND_BY_ID, FINISH_LABEL, ENDS_LABEL, BY_LABEL, DEFAULT_STRUCTURAL_SITUATIONS,
  type SteelMember, type SteelResult, type MemberKind, type MemberFinish, type MemberEnds, type MemberBy,
} from '@/lib/structural-steel-units'
import { describeSteelwork, describeSteelworkShort, type SteelDescriptionInput } from '@/lib/structural-steel-description'
import { suggestSteelworkLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the length of the line drawn on the plan in Take-off (mm): the length of the first member, which follows the line until it is typed over */
  externalLengthMm?: number
}

const uid = () => Math.random().toString(36).slice(2, 9)
const FINISHES = Object.keys(FINISH_LABEL) as MemberFinish[]
const ENDS = Object.keys(ENDS_LABEL) as MemberEnds[]
const BYS = Object.keys(BY_LABEL) as MemberBy[]

export default function AssemblySteelworkDemo({ onClose, onSave, labourTrades = [], externalLengthMm }: Props) {
  const ID = 'AssemblySteelworkDemo'
  // The job starts with no members: you add the ones the job has
  const [members, setMembers] = useCalcState<SteelMember[]>(ID, 'members', [])
  const [addKind, setAddKind] = useCalcState<MemberKind>(ID, 'addKind', 'beam')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'clear')
  const [engineer, setEngineer] = useCalcState(ID, 'engineer', true)
  const [buildingControl, setBuildingControl] = useCalcState(ID, 'buildingControl', true)
  const [hiabVisits, setHiabVisits] = useCalcState(ID, 'hiabVisits', 0)

  function addMember() { setMembers(p => [...p, newMember('sm-' + uid(), `${KIND_BY_ID[addKind].post ? 'P' : 'B'}${p.filter(x => KIND_BY_ID[x.kind].post === KIND_BY_ID[addKind].post).length + 1}`, addKind)]) }
  function update(id: string, patch: Partial<SteelMember>) { setMembers(p => p.map(x => (x.id === id ? { ...x, ...patch } : x))) }
  /** a different kind of member: its usual section, size and finish (what was typed in the old one's fields is dropped, but the reference, place, number, supply and situation stay) */
  function changeKind(x: SteelMember, kind: MemberKind) {
    const fresh = newMember(x.id, x.ref, kind)
    setMembers(p => p.map(o => (o.id === x.id ? { ...fresh, location: x.location, qty: x.qty, by: x.by, situationId: x.situationId, planLengthMm: x.planLengthMm } : o)))
  }
  // the line drawn on the plan in Take-off IS the first member (a beam): its length is the member's length, and the member follows the line until a length is typed over it (one made by hand, or saved before this, is left alone)
  React.useEffect(() => {
    if (!(externalLengthMm != null && externalLengthMm > 0)) return
    const w = Math.round(externalLengthMm)
    setMembers(p => {
      if (p.length === 0) return [{ ...newMember('sm-' + uid(), 'B1', 'beam'), lengthMm: w, planLengthMm: w }]
      const f = p[0]
      if (f.planLengthMm === undefined || f.planLengthMm === w) return p
      return f.lengthMm === f.planLengthMm ? [{ ...f, lengthMm: w, planLengthMm: w }, ...p.slice(1)] : p
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalLengthMm])

  const result = useMemo((): { ok: true; r: SteelResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateSteelwork({ members, jobSituationId, situations: DEFAULT_STRUCTURAL_SITUATIONS, engineer, buildingControl, hiabVisits, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [members, jobSituationId, engineer, buildingControl, hiabVisits])
  const r = result.ok ? result.r : null

  const descInput: SteelDescriptionInput | null = r ? {
    members: members.map(x => ({ ref: x.ref, location: x.location, name: KIND_BY_ID[x.kind]?.word ?? 'Member', parts: r.members.find(s => s.memberId === x.id)?.parts ?? [] })).filter(x => x.parts.length > 0),
    anySteelContractor: members.some(x => x.by === 'sub' && KIND_BY_ID[x.kind]?.steel), engineer, buildingControl, hiabVisits,
    occupied: jobSituationId === 'occupied' || members.some(x => x.situationId === 'occupied'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Steel beams, columns and posts" subject="structural steelwork" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestSteelworkLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeSteelworkShort(descInput) : ''} descFull={descInput ? describeSteelwork(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Members</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value as MemberKind)} style={{ ...tilingSmall, minWidth: 260 }}>
                {MEMBER_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addMember} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add member</button>
            </div>

            {members.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No members yet. Pick a kind of member above and press <strong>+ Add member</strong>, then set its section, length and how it is held. Steel over an opening in a wall is priced with the opening in Structural Openings.
              </div>
            )}

            {members.map(x => {
              const sum = r?.members.find(s => s.memberId === x.id)
              const k = KIND_BY_ID[x.kind]
              return (
                <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={x.ref} onChange={e => update(x.id, { ref: e.target.value })} title="Reference" style={{ fontWeight: 700, fontSize: 13, width: 56, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent' }} />
                    <input value={x.location} onChange={e => update(x.id, { location: e.target.value })} placeholder="Where (first floor, rear)" style={{ fontSize: 12, width: 170, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <select value={x.kind} onChange={e => changeKind(x, e.target.value as MemberKind)} style={{ ...tilingSmall, minWidth: 240 }}>
                      {MEMBER_KINDS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum && sum.steelKg > 0 ? `${sum.steelKg}kg` : ''}{sum && sum.hours > 0 ? ` · ${sum.hours}h` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(x.id) > 0 ? `£${roomCost(x.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setMembers(p => p.filter(o => o.id !== x.id))} title="Remove this member" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                    <PropRow label="Section">
                      <select value={x.section} onChange={e => update(x.id, { section: e.target.value })} style={propInput}>
                        {!sectionsFor(x.kind).some(s => s.label === x.section) && <option value={x.section}>{x.section}</option>}
                        {sectionsFor(x.kind).map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label={k.post ? 'Height (mm)' : 'Length with bearings (mm)'}><TilingNumInput v={x.lengthMm} set={n => update(x.id, { lengthMm: n })} step={100} /></PropRow>
                    <PropRow label="Number of these"><TilingNumInput v={x.qty} set={n => update(x.id, { qty: Math.max(1, Math.round(n)) })} min={1} /></PropRow>
                    {k.steel && (
                      <PropRow label="Who fits it">
                        <select value={x.by} onChange={e => update(x.id, { by: e.target.value as MemberBy })} style={propInput}>
                          {BYS.map(b => <option key={b} value={b}>{BY_LABEL[b]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {k.steel && (
                      <PropRow label="Finish">
                        <select value={x.finish} onChange={e => update(x.id, { finish: e.target.value as MemberFinish })} style={propInput}>
                          {FINISHES.map(f => <option key={f} value={f}>{FINISH_LABEL[f]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {!k.post && (
                      <PropRow label="How the ends are held">
                        <select value={x.ends} onChange={e => update(x.id, { ends: e.target.value as MemberEnds })} style={propInput}>
                          {ENDS.map(en => <option key={en} value={en}>{ENDS_LABEL[en]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {!k.post && x.ends === 'masonry' && (
                      <PropRow label="Padstones under the ends">
                        <TilingNumInput v={x.padstones ?? 2 * x.qty} set={n => update(x.id, { padstones: Math.max(0, Math.round(n)) })} min={0} />
                      </PropRow>
                    )}
                    {k.post && x.pad && <PropRow label="Pad, length (mm)"><TilingNumInput v={x.padLengthMm} set={n => update(x.id, { padLengthMm: n })} step={50} /></PropRow>}
                    {k.post && x.pad && <PropRow label="Pad, width (mm)"><TilingNumInput v={x.padWidthMm} set={n => update(x.id, { padWidthMm: n })} step={50} /></PropRow>}
                    {k.post && x.pad && <PropRow label="Pad, depth (mm)"><TilingNumInput v={x.padDepthMm} set={n => update(x.id, { padDepthMm: n })} step={50} /></PropRow>}
                    <PropRow label="Situation">
                      <select value={x.situationId ?? ''} onChange={e => update(x.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_STRUCTURAL_SITUATIONS.map(o => <option key={o.id} value={o.id}>{o.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    {k.post && <TilingCheck label="A concrete pad under each (dug, poured and the soil away)" on={x.pad} set={b => update(x.id, { pad: b })} />}
                    {!k.post && <TilingCheck label="Needles and Acrow props while it is fixed" on={x.propped} set={b => update(x.id, { propped: b })} />}
                  </div>
                </div>
              )
            })}

            {r && members.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {r.totalMembers} member{r.totalMembers === 1 ? '' : 's'}{r.totalSteelKg > 0 ? `, about ${r.totalSteelKg}kg of steel` : ''}, about {r.totalHours} hours of labour. The sections are samples to price from: the engineer designs the real ones.
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
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the labour hours. A single member can have its own.</div>
            </CollapsibleSection>
            <CollapsibleSection title="For the whole job" borderColor="#bae6fd">
              <TilingCheck label="The structural engineer's calculations (once)" on={engineer} set={setEngineer} />
              <TilingCheck label="Building Control notice and inspections (once)" on={buildingControl} set={setBuildingControl} />
              <PropRow label="Hiab or lorry crane visits"><TilingNumInput v={hiabVisits} set={n => setHiabVisits(Math.max(0, Math.round(n)))} min={0} /></PropRow>
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>Beams over an opening in a wall are priced with the opening, in Structural Openings. Use this list for steel that is not over one.</div>
            </CollapsibleSection>
          </>
        ),
      })}
    </TilingCalcFrame>
  )
}

