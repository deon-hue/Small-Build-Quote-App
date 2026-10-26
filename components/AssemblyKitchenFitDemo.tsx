'use client'

/**
 * Assembly Calculator — Kitchen installation, by kitchen (Joinery & Fixtures → Kitchen Installation (by kitchen)).
 * One card per kitchen (or utility room): the units (base, wall, tall and the corner kinds) and who supplies them (the client or supplier delivers them and we fit only, we supply them at a sample price for the range, or a
 * provisional sum), flat-pack or ready built, the worktops (laminate or timber cut and fitted by us, stone made and fitted by a specialist) with their joints and cut-outs, an upstand, plinth, cornice, end panels, handles, and the
 * integrated appliances to be fitted. The kitchen fitter's time follows the units, the worktops and the appliances, with a labourer to help. The sink and appliance plumbing is Plumbing, the wiring is Electrics, the splashback is
 * Wall Tiling, and taking out the old kitchen is Demolition (Strip-Out by Room). The engine is lib/kitchen-fit-units.ts; the body shared with the tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateKitchens, newKitchen, totalUnits, UNIT_KINDS, APPLIANCES, KITCHEN_KINDS, RANGE_LABEL, SUPPLY_LABEL, WORKTOP_LABEL, DEFAULT_KITCHEN_SITUATIONS,
  type KitchenFit, type KitchenResult, type UnitRange, type UnitSupply, type WorktopMaterial,
} from '@/lib/kitchen-fit-units'
import { describeKitchen, describeKitchenShort, type KitchenDescriptionInput } from '@/lib/kitchen-fit-description'
import { suggestKitchenFitLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingAutoInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const RANGES = Object.keys(RANGE_LABEL) as UnitRange[]
const SUPPLIES = Object.keys(SUPPLY_LABEL) as UnitSupply[]
const WORKTOPS = Object.keys(WORKTOP_LABEL) as WorktopMaterial[]

export default function AssemblyKitchenFitDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblyKitchenFitDemo'
  // The job starts with no kitchens: you add the ones the job has (a size brings its usual run of units and worktop)
  const [kitchens, setKitchens] = useCalcState<KitchenFit[]>(ID, 'kitchens', [])
  const [addKind, setAddKind] = useCalcState(ID, 'addKind', 'medium')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')

  function addKitchen() {
    setKitchens(p => {
      const k = KITCHEN_KINDS.find(x => x.id === addKind) ?? KITCHEN_KINDS[1]
      const n = p.length
      const base = addKind === 'utility' ? 'Utility room' : 'Kitchen'
      return [...p, newKitchen('k-' + uid(), n === 0 ? base : `${base} ${n + 1}`, k.id)]
    })
  }
  function update(id: string, patch: Partial<KitchenFit>) { setKitchens(p => p.map(k => (k.id === id ? { ...k, ...patch } : k))) }

  const result = useMemo((): { ok: true; r: KitchenResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateKitchens({ kitchens, jobSituationId, situations: DEFAULT_KITCHEN_SITUATIONS, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [kitchens, jobSituationId])
  const r = result.ok ? result.r : null

  const descInput: KitchenDescriptionInput | null = r ? {
    kitchens: r.kitchens.map(k => ({ name: k.name, parts: k.parts, units: k.units, worktopLm: k.worktopLm })),
    anyClientUnits: kitchens.some(k => k.unitSupply === 'client' && totalUnits(k) > 0),
    anyStone: kitchens.some(k => k.worktopMaterial === 'stone' && k.worktopLm > 0),
    occupied: jobSituationId === 'occupied' || kitchens.some(k => k.situationId === 'occupied'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Kitchen installation" subject="kitchen installation" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestKitchenFitLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeKitchenShort(descInput) : ''} descFull={descInput ? describeKitchen(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Kitchens</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value)} style={{ ...tilingSmall, minWidth: 220 }}>
                {KITCHEN_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addKitchen} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add kitchen</button>
            </div>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 10, lineHeight: 1.5 }}>A size brings its usual run of units and worktop as a start: change any count afterwards. The units and the worktop start as supplied by the client, so only the fitting is priced until you change that.</div>

            {kitchens.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No kitchens yet. Pick a size above and press <strong>+ Add kitchen</strong>, then set the units, the worktop and who supplies them.
              </div>
            )}

            {kitchens.map(k => {
              const sum = r?.kitchens.find(s => s.kitchenId === k.id)
              const n = totalUnits(k)
              const stone = k.worktopMaterial === 'stone'
              const hasExtras = k.upstandLm > 0 || k.corniceLm > 0 || k.endPanels > 0 || k.plinthLm !== null || k.handles !== null || k.weSupplyHandles
              const hasApp = APPLIANCES.some(a => k.appliances[a.id] > 0) || k.sinkFit
              return (
                <div key={k.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={k.name} onChange={e => update(k.id, { name: e.target.value })} style={{ fontWeight: 700, fontSize: 13, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent', minWidth: 120 }} />
                    <input value={k.location} onChange={e => update(k.id, { location: e.target.value })} placeholder="Where (ground floor, extension)" style={{ fontSize: 12, width: 170, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <span style={{ fontSize: 11, color: '#64748b' }}>{n} unit{n === 1 ? '' : 's'}{k.worktopLm > 0 ? `, ${k.worktopLm}m of worktop` : ''}{sum && sum.hours > 0 ? `, about ${sum.hours}h` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(k.id) > 0 ? `£${roomCost(k.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setKitchens(p => p.filter(x => x.id !== k.id))} title="Remove this kitchen" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Units</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {UNIT_KINDS.map(u => (
                      <PropRow key={u.id} label={u.label}><TilingNumInput v={k.units[u.id]} set={v => update(k.id, { units: { ...k.units, [u.id]: Math.round(v) } })} /></PropRow>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 6 }}>
                    <PropRow label="Units supplied by">
                      <select value={k.unitSupply} onChange={e => update(k.id, { unitSupply: e.target.value as UnitSupply })} style={propInput}>
                        {SUPPLIES.map(s => <option key={s} value={s}>{SUPPLY_LABEL[s]}</option>)}
                      </select>
                    </PropRow>
                    {k.unitSupply === 'we' && (
                      <PropRow label="Range">
                        <select value={k.range} onChange={e => update(k.id, { range: e.target.value as UnitRange })} style={propInput}>
                          {RANGES.map(x => <option key={x} value={x}>{RANGE_LABEL[x]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {k.unitSupply === 'pc' && <PropRow label="Provisional sum for the units (£) — blank = sample"><TilingAutoInput v={k.unitsPc} set={v => update(k.id, { unitsPc: v })} auto={UNIT_KINDS.reduce((s, u) => s + u.price[1] * k.units[u.id], 0)} step={50} /></PropRow>}
                    <PropRow label="Situation">
                      <select value={k.situationId ?? ''} onChange={e => update(k.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_KITCHEN_SITUATIONS.map(x => <option key={x.id} value={x.id}>{x.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 4 }}><TilingCheck label="The units come flat-packed and are built on site" on={k.flatPack} set={b => update(k.id, { flatPack: b })} /></div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.4, margin: '10px 0 4px' }}>Worktop</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    <PropRow label="Worktop">
                      <select value={k.worktopMaterial} onChange={e => update(k.id, { worktopMaterial: e.target.value as WorktopMaterial })} style={propInput}>
                        {WORKTOPS.map(w => <option key={w} value={w}>{WORKTOP_LABEL[w]}</option>)}
                      </select>
                    </PropRow>
                    <PropRow label="Length (m)"><TilingNumInput v={k.worktopLm} set={v => update(k.id, { worktopLm: v })} step={0.5} /></PropRow>
                    {!stone && <PropRow label="Joints (nr)"><TilingNumInput v={k.worktopJoints} set={v => update(k.id, { worktopJoints: Math.round(v) })} /></PropRow>}
                    <PropRow label={stone ? 'Cut-outs (nr) — in the price' : 'Cut-outs (nr) — sink, hob, taps'}><TilingNumInput v={k.cutouts} set={v => update(k.id, { cutouts: Math.round(v) })} /></PropRow>
                  </div>
                  <div style={{ marginTop: 4 }}><TilingCheck label="The client supplies the worktop" on={k.worktopClientSupplies} set={b => update(k.id, { worktopClientSupplies: b })} /></div>

                  <div style={{ marginTop: 8 }}>
                    <CollapsibleSection title={`Upstand, plinth, cornice and handles${hasExtras ? ' ✓' : ''}`} borderColor="#bae6fd" defaultOpen={hasExtras}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                        <PropRow label="Upstand (m)"><TilingNumInput v={k.upstandLm} set={v => update(k.id, { upstandLm: v })} step={0.5} /></PropRow>
                        <PropRow label="Plinth (m) — blank = from the base units"><TilingAutoInput v={k.plinthLm} set={v => update(k.id, { plinthLm: v })} auto={(k.units.base + k.units.cornerBase) * 0.6} step={0.5} /></PropRow>
                        <PropRow label="Cornice and pelmet (m)"><TilingNumInput v={k.corniceLm} set={v => update(k.id, { corniceLm: v })} step={0.5} /></PropRow>
                        <PropRow label="End and cover panels (nr)"><TilingNumInput v={k.endPanels} set={v => update(k.id, { endPanels: Math.round(v) })} /></PropRow>
                        <PropRow label="Handles (nr) — blank = 1.5 a unit"><TilingAutoInput v={k.handles} set={v => update(k.id, { handles: v === null ? null : Math.round(v) })} auto={(n) * 1.5} step={1} /></PropRow>
                      </div>
                      <div style={{ marginTop: 4 }}><TilingCheck label="We supply the handles" on={k.weSupplyHandles} set={b => update(k.id, { weSupplyHandles: b })} /></div>
                    </CollapsibleSection>
                    <CollapsibleSection title={`Appliances and the sink${hasApp ? ' ✓' : ''}`} borderColor="#bae6fd" defaultOpen={hasApp}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8 }}>
                        {APPLIANCES.map(a => (
                          <PropRow key={a.id} label={a.label}><TilingNumInput v={k.appliances[a.id]} set={v => update(k.id, { appliances: { ...k.appliances, [a.id]: Math.round(v) } })} /></PropRow>
                        ))}
                      </div>
                      <div style={{ marginTop: 4 }}><TilingCheck label="Set the sink in its cut-out and seal it" on={k.sinkFit} set={b => update(k.id, { sinkFit: b })} /></div>
                      <div style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 2px' }}>Only the carpentry is priced: the plumber connects the sink, tap and waste, and the gas or electric connections are Plumbing and Electrics.</div>
                    </CollapsibleSection>
                  </div>
                </div>
              )
            })}

            {r && kitchens.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {kitchens.length} kitchen{kitchens.length === 1 ? '' : 's'}: {r.totalUnits} units, {r.totalWorktopLm}m of worktop, about {r.totalHours} fitter hours.
              </div>
            )}
          </>
        ),
        side: (
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="The room is">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_KITCHEN_SITUATIONS.map(x => <option key={x.id} value={x.id}>{x.label}{x.upliftPct ? ` +${x.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the fitter's hours. A single kitchen can have its own. Taking out the old kitchen is Demolition (Strip-Out by Room).</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
