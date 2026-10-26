'use client'

/**
 * Assembly Calculator — Boxing-in, shelving and second fix, by item (Joinery & Fixtures → Boxing-in, Shelving & Second Fix (by item)).
 * The small carpentry jobs that are not stairs, a kitchen, skirting or a fitted wardrobe: boxing in pipes or a boiler (a timber frame, board and access panels), casing a steel beam in fire-resisting board, shelves (on
 * brackets, floating or on battens), bath panels, radiator covers, a loft hatch with or without its ladder, ironmongery, and any other second-fix carpentry by the hour. Boxing and shelves are priced from the length, girth
 * and depth; the carpenter's time follows the length and the supports. Plumbing and wiring are other trades, painting is Decoration. The engine is lib/boxing-shelving-units.ts; the body shared with the tiling calculators
 * is components/TilingCalcFrame.tsx.
 */

import React, { useMemo } from 'react'
import { useCalcState } from '@/components/calc-state'
import type { CostedLine } from '@/lib/assembly-calc'
import {
  calculateSecondFix, newSecondFixItem, supportsFor, SECOND_FIX_KINDS, KIND_BY_ID, BOARD_LABEL, STYLE_LABEL, SHELF_MATERIAL_LABEL, DEFAULT_SECOND_FIX_SITUATIONS,
  type SecondFixItem, type SecondFixResult, type SecondFixKind, type BoxBoard, type ShelfStyle, type ShelfMaterial,
} from '@/lib/boxing-shelving-units'
import { describeSecondFix, describeSecondFixShort, type SecondFixDescriptionInput } from '@/lib/boxing-shelving-description'
import { suggestSecondFixLabour } from '@/lib/flat-roof-labour'
import type { BOLabourTrade } from '@/lib/back-office-types'
import { propInput, PropRow, CollapsibleSection } from '@/components/assembly-ui'
import TilingCalcFrame, { TilingNumInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'

interface Props {
  onClose?: () => void
  onSave?: (result: { name: string; qty: number; location: string; description: string; detail?: string; lines: CostedLine[] }) => void
  labourTrades?: BOLabourTrade[]
}

const uid = () => Math.random().toString(36).slice(2, 9)
const BOARDS = Object.keys(BOARD_LABEL) as BoxBoard[]
const STYLES = Object.keys(STYLE_LABEL) as ShelfStyle[]
const SHELF_MATERIALS = Object.keys(SHELF_MATERIAL_LABEL) as ShelfMaterial[]

export default function AssemblySecondFixDemo({ onClose, onSave, labourTrades = [] }: Props) {
  const ID = 'AssemblySecondFixDemo'
  // The job starts with no items: you add the ones the job has
  const [items, setItems] = useCalcState<SecondFixItem[]>(ID, 'items', [])
  const [addKind, setAddKind] = useCalcState<SecondFixKind>(ID, 'addKind', 'box-pipe')
  const [jobSituationId, setJobSituationId] = useCalcState(ID, 'jobSituationId', 'empty')

  function addItem() { setItems(p => [...p, newSecondFixItem('sf-' + uid(), `SF${p.length + 1}`, addKind)]) }
  function update(id: string, patch: Partial<SecondFixItem>) { setItems(p => p.map(x => (x.id === id ? { ...x, ...patch } : x))) }
  /** a different kind of item: its usual size and counts (what was typed in the old one's fields is dropped, but the reference, place, supply and situation stay) */
  function changeKind(x: SecondFixItem, kind: SecondFixKind) {
    const fresh = newSecondFixItem(x.id, x.ref, kind)
    setItems(p => p.map(o => (o.id === x.id ? { ...fresh, location: x.location, clientSupplies: x.clientSupplies, situationId: x.situationId } : o)))
  }

  const result = useMemo((): { ok: true; r: SecondFixResult } | { ok: false; error: string } => {
    try { return { ok: true, r: calculateSecondFix({ items, jobSituationId, situations: DEFAULT_SECOND_FIX_SITUATIONS, rates: {} }) } }
    catch (e: any) { return { ok: false, error: e.message as string } }
  }, [items, jobSituationId])
  const r = result.ok ? result.r : null

  const descInput: SecondFixDescriptionInput | null = r ? {
    items: items.map(x => ({ ref: x.ref, location: x.location, name: KIND_BY_ID[x.kind]?.label ?? 'Second fix', parts: r.items.find(s => s.itemId === x.id)?.parts ?? [] })).filter(x => x.parts.length > 0),
    anyClientSupplied: items.some(x => x.clientSupplies),
    occupied: jobSituationId === 'occupied' || items.some(x => x.situationId === 'occupied'),
  } : null

  return (
    <TilingCalcFrame
      id={ID} defaultName="Boxing-in, shelving and second fix" subject="boxing-in, shelving and second fix" lines={r?.lines ?? []} labourTasks={r?.labour ?? []} suggestLabour={suggestSecondFixLabour as (t: any[]) => any}
      error={result.ok ? null : result.error} warnings={r?.warnings ?? []}
      descShort={descInput ? describeSecondFixShort(descInput) : ''} descFull={descInput ? describeSecondFix(descInput) : ''}
      hasResult={!!r} onClose={onClose} onSave={onSave} labourTrades={labourTrades}
    >
      {({ roomCost }) => ({
        main: (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>Items</span>
              <select value={addKind} onChange={e => setAddKind(e.target.value as SecondFixKind)} style={{ ...tilingSmall, minWidth: 250 }}>
                {SECOND_FIX_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button type="button" onClick={addItem} style={{ background: '#0369a1', color: '#fff', border: 'none', borderRadius: 5, fontSize: 12, fontWeight: 600, padding: '4px 12px', cursor: 'pointer' }}>+ Add item</button>
            </div>

            {items.length === 0 && (
              <div style={{ fontSize: 12, color: '#64748b', background: '#fff', border: '1px dashed #bae6fd', borderRadius: 6, padding: '14px 12px', marginBottom: 10 }}>
                No items yet. Pick a kind of job above and press <strong>+ Add item</strong>, then set its size and how many.
              </div>
            )}

            {items.map(x => {
              const sum = r?.items.find(s => s.itemId === x.id)
              const boxing = x.kind === 'box-pipe' || x.kind === 'box-steel'
              return (
                <div key={x.id} style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    <input value={x.ref} onChange={e => update(x.id, { ref: e.target.value })} title="Reference" style={{ fontWeight: 700, fontSize: 13, width: 56, border: '1px solid transparent', borderBottom: '1px solid #e2e8f0', outline: 'none', background: 'transparent' }} />
                    <input value={x.location} onChange={e => update(x.id, { location: e.target.value })} placeholder="Where (bathroom, landing)" style={{ fontSize: 12, width: 150, border: '1px solid #e2e8f0', borderRadius: 4, padding: '3px 6px' }} />
                    <select value={x.kind} onChange={e => changeKind(x, e.target.value as SecondFixKind)} style={{ ...tilingSmall, minWidth: 230 }}>
                      {SECOND_FIX_KINDS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{sum && sum.hours > 0 ? `${sum.hours}h` : ''}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 70, textAlign: 'right' }}>{roomCost(x.id) > 0 ? `£${roomCost(x.id).toFixed(2)}` : ''}</span>
                    <button type="button" onClick={() => setItems(p => p.filter(o => o.id !== x.id))} title="Remove this item" style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                    {boxing && <PropRow label="Length (m)"><TilingNumInput v={x.lengthM} set={n => update(x.id, { lengthM: n })} step={0.5} /></PropRow>}
                    {boxing && <PropRow label="Girth (mm) — the three faces added up"><TilingNumInput v={x.girthMm} set={n => update(x.id, { girthMm: n })} step={50} /></PropRow>}
                    {x.kind === 'box-pipe' && (
                      <PropRow label="Board">
                        <select value={x.board} onChange={e => update(x.id, { board: e.target.value as BoxBoard })} style={propInput}>
                          {BOARDS.map(o => <option key={o} value={o}>{BOARD_LABEL[o]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {boxing && <PropRow label="Access panels (nr)"><TilingNumInput v={x.accessPanels} set={n => update(x.id, { accessPanels: Math.round(n) })} /></PropRow>}

                    {x.kind === 'shelf' && <PropRow label="Number of shelves"><TilingNumInput v={x.count} set={n => update(x.id, { count: Math.max(1, Math.round(n)) })} min={1} /></PropRow>}
                    {x.kind === 'shelf' && <PropRow label="Each shelf, length (m)"><TilingNumInput v={x.lengthM} set={n => update(x.id, { lengthM: n })} step={0.1} /></PropRow>}
                    {x.kind === 'shelf' && <PropRow label="Depth (mm)"><TilingNumInput v={x.depthMm} set={n => update(x.id, { depthMm: n })} step={10} /></PropRow>}
                    {x.kind === 'shelf' && (
                      <PropRow label="Fixed">
                        <select value={x.shelfStyle} onChange={e => update(x.id, { shelfStyle: e.target.value as ShelfStyle })} style={propInput}>
                          {STYLES.map(o => <option key={o} value={o}>{STYLE_LABEL[o]}</option>)}
                        </select>
                      </PropRow>
                    )}
                    {x.kind === 'shelf' && (
                      <PropRow label="Made of">
                        <select value={x.shelfMaterial} onChange={e => update(x.id, { shelfMaterial: e.target.value as ShelfMaterial })} style={propInput}>
                          {SHELF_MATERIALS.map(o => <option key={o} value={o}>{SHELF_MATERIAL_LABEL[o]}</option>)}
                        </select>
                      </PropRow>
                    )}

                    {(x.kind === 'bath-panel' || x.kind === 'radiator-cover' || x.kind === 'loft-hatch' || x.kind === 'ironmongery') && (
                      <PropRow label="Number"><TilingNumInput v={x.count} set={n => update(x.id, { count: Math.max(1, Math.round(n)) })} min={1} /></PropRow>
                    )}
                    {x.kind === 'bath-panel' && <PropRow label="Access panels to each (nr)"><TilingNumInput v={x.accessPanels} set={n => update(x.id, { accessPanels: Math.round(n) })} /></PropRow>}
                    {x.kind === 'ironmongery' && <PropRow label="Price of each (£)"><TilingNumInput v={x.eachCost} set={n => update(x.id, { eachCost: n })} step={0.5} /></PropRow>}
                    {x.kind === 'day' && <PropRow label="Hours"><TilingNumInput v={x.hours} set={n => update(x.id, { hours: n })} step={0.5} /></PropRow>}
                    {x.kind === 'day' && <PropRow label="Materials allowance (£)"><TilingNumInput v={x.materialsAllowance} set={n => update(x.id, { materialsAllowance: n })} step={10} /></PropRow>}
                    <PropRow label="Situation">
                      <select value={x.situationId ?? ''} onChange={e => update(x.id, { situationId: e.target.value || null })} style={propInput}>
                        <option value="">Same as the job</option>
                        {DEFAULT_SECOND_FIX_SITUATIONS.map(o => <option key={o.id} value={o.id}>{o.label.split(' (')[0]}</option>)}
                      </select>
                    </PropRow>
                  </div>
                  <div style={{ marginTop: 6, borderTop: '1px dashed #e2e8f0', paddingTop: 6 }}>
                    {x.kind === 'loft-hatch' && <TilingCheck label="With a loft ladder" on={x.ladder} set={b => update(x.id, { ladder: b })} />}
                    {x.kind !== 'day' && <TilingCheck label="The client supplies the materials (we fit only)" on={x.clientSupplies} set={b => update(x.id, { clientSupplies: b })} />}
                    {x.kind === 'shelf' && <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{supportsFor(x.lengthM)} supports to each shelf.</span>}
                  </div>
                </div>
              )
            })}

            {r && items.length > 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {items.length} item{items.length === 1 ? '' : 's'}{r.totalBoxingLm > 0 ? `, ${r.totalBoxingLm}m of boxing` : ''}{r.totalShelfLm > 0 ? `, ${r.totalShelfLm}m of shelf` : ''}, about {r.totalHours} carpenter hours.
              </div>
            )}
          </>
        ),
        side: (
          <CollapsibleSection title="Job situation" borderColor="#bae6fd">
            <PropRow label="The rooms are">
              <select value={jobSituationId} onChange={e => setJobSituationId(e.target.value)} style={propInput}>
                {DEFAULT_SECOND_FIX_SITUATIONS.map(o => <option key={o.id} value={o.id}>{o.label}{o.upliftPct ? ` +${o.upliftPct}%` : ''}</option>)}
              </select>
            </PropRow>
            <div style={{ fontSize: 10, color: '#94a3b8', margin: '2px 0 6px' }}>The extra is added to the carpenter's hours. A single item can have its own. The plumbing or wiring behind boxing is another trade; painting is Decoration.</div>
          </CollapsibleSection>
        ),
      })}
    </TilingCalcFrame>
  )
}
