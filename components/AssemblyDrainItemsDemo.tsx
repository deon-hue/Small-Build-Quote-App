'use client'

/**
 * Assembly Calculator — Drainage chambers, manholes, gullies and connections, by item (Drainage & Services → Chambers, Gullies & Connections (by item)).
 * One card per item: an inspection chamber, a manhole, a rodding eye, a trapped, yard or road gully, or a connection to an existing drain or the public sewer. Each has a depth, a grade of cover (chambers and manholes),
 * a number and how its pit is dug. The chamber (with the extension sections a deeper inspection chamber needs, or a manhole's rings by depth), the cover, the bed and the surround, the pit (by machine or by hand) and the soil
 * taken away are worked out from that. The pipe between them is Underground Drainage (by run): the two are separate so each item here is a thing at a place, ready to be put on the plan.
 * The engine is lib/drain-items-units.ts; the body shared with the tiling calculators is components/TilingCalcFrame.tsx.
 */

import React, { useEffect, useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import DiggerOnSiteSection from '@/components/DiggerOnSiteSection'
import { planDigger, diggerLayers } from '@/lib/digger-on-site'
import {
  calculateDrainItems, newDrainItem, nextRef, icExtensions, drainItemWords, itemGeometry, DRAIN_ITEMS, DRAIN_ITEM_KINDS, DRAIN_ITEM_GROUP_LABEL, COVER_LABEL, IC_MAX_DEPTH_MM,
  type DrainItem, type DrainItemKind, type DrainItemGroup, type CoverGrade, type PitDig, type DrainItemsResult,
} from '@/lib/drain-items-units'
import { describeDrainItems, describeDrainItemsShort } from '@/lib/drain-items-description'
import { mergePlacedDrainItems, type PlacedDrain } from '@/lib/drain-points'
import { suggestDrainItemsLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingCheck, tilingSmall, type FrameLine } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
  /** the items placed on the Take-off plan: each becomes an item here, follows the plan until a value is typed over, and goes when it is deleted on the plan */
  placed?: PlacedDrain[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const GROUPS: DrainItemGroup[] = ['chamber', 'gully', 'connection']
const COVERS = Object.keys(COVER_LABEL) as CoverGrade[]
const GROUP_COLOUR: Record<DrainItemGroup, string> = { chamber: '#92400e', gully: '#2563eb', connection: '#7c3aed' }

export default function AssemblyDrainItemsDemo({ onClose, onSave, labourTrades = [], placed }: Props) {
  const ID = 'AssemblyDrainItemsDemo'
  // The job starts with no items: you add the ones it has
  const [items, setItems] = useCalcState<DrainItem[]>(ID, 'items', [])
  const [addKind, setAddKind] = useCalcState<DrainItemKind>(ID, 'addKind', 'ic')
  const [diggerWithRuns, setDiggerWithRuns] = useCalcState(ID, 'diggerWithRuns', false)
  const [diggerDays, setDiggerDays] = useCalcState<number | null>(ID, 'diggerDays', null)

  // Items placed on the plan come in as items here and stay in step with it
  const placedKey = JSON.stringify(placed ?? null)
  useEffect(() => {
    if (!placed) return
    setItems(p => { const next = mergePlacedDrainItems(p, placed); return JSON.stringify(next) === JSON.stringify(p) ? p : next })
  }, [placedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  function addItem() { setItems(p => [...p, newDrainItem('di-' + uid(), addKind, nextRef(p, addKind))]) }
  function update(id: string, patch: Partial<DrainItem>) { setItems(p => p.map(x => (x.id === id ? { ...x, ...patch } : x))) }
  /** A new kind brings its own usual depth (unless the depth was changed) and, if the reference was the automatic one, the next reference of the new kind */
  function changeKind(id: string, kind: DrainItemKind) {
    setItems(p => p.map(x => {
      if (x.id !== id) return x
      const old = DRAIN_ITEMS[x.kind]
      const others = p.filter(y => y.id !== id)
      return {
        ...x, kind,
        depthMm: x.depthMm === old.defaultDepthMm ? DRAIN_ITEMS[kind].defaultDepthMm : x.depthMm,
        ref: new RegExp('^' + old.ref + '\\d+$', 'i').test(x.ref.trim()) ? nextRef(others, kind) : x.ref,
      }
    }))
  }

  const result = useMemo((): { ok: true; r: DrainItemsResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateDrainItems({ items, diggerWithRuns }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [items, diggerWithRuns])
  const r = result.ok ? result.r : null

  // The digger is priced in days on site, as in the foundation and drain-run calculators
  const diggerLines: FrameLine[] = r && r.excavatorDays > 0
    ? diggerLayers(planDigger(r.excavatorDays, diggerDays), 'digging the chamber and gully pits', 'Mini excavator with operator')
        .map(l => ({ id: l.id, name: l.name, category: l.category as FrameLine['category'], unit: l.unit, unitCost: l.unitCost, qty: l.fixedQty ?? 0 }))
    : []

  const descInput = r ? { items: drainItemWords(items) } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Drainage chambers, gullies and connections" subject="drainage chambers and gullies" lines={[...(r?.lines ?? []), ...diggerLines]} labourTasks={r?.labour ?? []}
      suggestLabour={suggestDrainItemsLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeDrainItemsShort(descInput) : ''} descFull={descInput ? describeDrainItems(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Items</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value as DrainItemKind)} style={{ ...tilingSmall, minWidth: 260, maxWidth: '100%' }}>
                {GROUPS.map(g => (
                  <optgroup key={g} label={DRAIN_ITEM_GROUP_LABEL[g]}>
                    {DRAIN_ITEM_KINDS.filter(k => DRAIN_ITEMS[k].group === g).map(k => <option key={k} value={k}>{DRAIN_ITEMS[k].label}</option>)}
                  </optgroup>
                ))}
              </select>
              <button type="button" onClick={addItem} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add item</button>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>One for each chamber, gully or connection, or one with a number for several the same.</span>
            </div>

            {placed && (
              <div style={{ fontSize: 11, color: '#0369a1', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '6px 10px', marginBottom: 10, lineHeight: 1.45 }}>
                {placed.length === 0 ? 'Nothing is placed on the plan yet.' : `${placed.length} item${placed.length === 1 ? ' is' : 's are'} placed on the plan and listed here.`} Each follows the plan (its kind, reference, depth and cover) until you type over it here. Items you add here yourself have no place on the plan.
              </div>
            )}

            {items.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No items yet. Pick a kind above and press <strong>+ Add item</strong>, then give it its depth and cover. The pipe between them is priced in Underground Drainage (by run).
              </div>
            )}

            {items.map(x => {
              const k = DRAIN_ITEMS[x.kind]
              const hasPit = k.pitSide > 0
              const showDepth = hasPit
              const g = itemGeometry(x.kind, x.depthMm)
              const ext = x.kind === 'ic' ? icExtensions(x.depthMm) : 0
              const cost = roomCost(x.id)
              return (
                <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: GROUP_COLOUR[k.group], flexShrink: 0 }} />
                    <input value={x.ref} onChange={e => update(x.id, { ref: e.target.value })} title="Reference (as it will be marked on the plan)" style={{ fontWeight: 700, fontSize: 13, width: 52, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent' }} />
                    <input value={x.where} onChange={e => update(x.id, { where: e.target.value })} placeholder="Where (rear garden, by the road)" style={{ fontSize: 12, width: 190, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <select value={x.kind} onChange={e => changeKind(x.id, e.target.value as DrainItemKind)} style={{ ...tilingSmall, minWidth: 230, maxWidth: '100%' }}>
                      {GROUPS.map(gr => (
                        <optgroup key={gr} label={DRAIN_ITEM_GROUP_LABEL[gr]}>
                          {DRAIN_ITEM_KINDS.filter(kk => DRAIN_ITEMS[kk].group === gr).map(kk => <option key={kk} value={kk}>{DRAIN_ITEMS[kk].label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{cost > 0 ? `£${cost.toFixed(2)}` : ''}</span>
                    {x.planId
                      ? <span title="Placed on the plan: delete it there to remove it from here" style={{ fontSize: 10.5, color: '#0369a1', whiteSpace: 'nowrap' }}>📍 on the plan</span>
                      : <button type="button" onClick={() => setItems(p => p.filter(y => y.id !== x.id))} title="Remove this item" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    <PropRow label="Number"><TilingNumInput v={x.qty} set={n => update(x.id, { qty: Math.round(n) })} step={1} /></PropRow>
                    {showDepth && <PropRow label="Depth to the bottom (mm)"><TilingNumInput v={x.depthMm} set={n => update(x.id, { depthMm: n })} step={50} /></PropRow>}
                    {k.coverGrades && (
                      <PropRow label="Cover">
                        <select value={x.cover} onChange={e => update(x.id, { cover: e.target.value as CoverGrade })} style={propInput}>
                          {COVERS.map(c => <option key={c} value={c}>{COVER_LABEL[c]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {hasPit && (
                      <PropRow label="Pit dug">
                        <select value={x.dig} onChange={e => update(x.id, { dig: e.target.value as PitDig })} style={propInput}>
                          <option value="machine">By machine</option><option value="hand">By hand</option>
                        </select>
                      </PropRow>
                    )}
                  </div>
                  {hasPit && (
                    <div style={{ fontSize: 10.5, color: x.kind === 'ic' && x.depthMm > IC_MAX_DEPTH_MM ? '#b45309' : '#94a3b8', marginTop: 4 }}>
                      Pit {(k.pitSide * 1000).toFixed(0)}mm square: about {g.pitM3.toFixed(2)} m³ dug for each{x.kind === 'ic' ? `; ${ext === 0 ? 'no extension sections' : `${ext} extension section${ext === 1 ? '' : 's'} (300mm each)`} at this depth` : ''}.
                    </div>
                  )}
                  {k.group === 'connection' && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>A subcontract charge for each: no pit is dug here.</div>}
                </div>
              )
            })}

            {r && r.totalNr > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {r.totalNr} item{r.totalNr === 1 ? '' : 's'}{r.pitM3 > 0 ? `: ${r.pitM3} m³ of pits (${r.machineM3} m³ by machine${r.excavatorDays > 0 ? ` over ${r.excavatorDays} day${r.excavatorDays === 1 ? '' : 's'}` : ''}, ${r.handM3} m³ by hand), ${r.concreteM3} m³ of concrete, ${r.gravelM3} m³ of gravel, ${r.spoilAwayM3} m³ of soil taken away` : ''}.
              </div>
            )}
          </>
        ),
        side: (
          <>
            <CollapsibleSection title="Digger" borderColor="#bae6fd">
              <TilingCheck label="The digger is already on site for the drain runs" on={diggerWithRuns} set={setDiggerWithRuns} />
              <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>If the job also has drain runs (Underground Drainage by run) the digger is already priced there: tick this so it is not charged twice, and check its days there cover these pits. Left off, the digger is priced here in days on site, with its fuel and delivery.</div>
              {r && r.excavatorDays > 0 && <DiggerOnSiteSection diggingDays={r.excavatorDays} daysOnSite={diggerDays} onDaysOnSite={setDiggerDays} />}
            </CollapsibleSection>
            <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.4, padding: '2px 2px 0' }}>
              The drain pipe, trench, bed and surround between these are priced in Underground Drainage (by run). A yard gully can also be counted in Soakaway &amp; Rainwater: count each in one place only.
            </div>
          </>
        ),
      })}
    </TilingCalcFrame>
  )
}
