'use client'

/**
 * QuoteWorkspace — clean 5-level hierarchical quote builder.
 *
 * Hierarchy:
 *   Phase (parentPhase)
 *     Area/Room (roomLabel)
 *       Sub-phase (phase)
 *         Task (taskGroup)
 *           Cost row (QuoteItem)
 *
 * Works for all data sources: takeoff import, AI-generated, manual.
 */

import { useState, useCallback, useRef } from 'react'
import type { QuotePhase, QuoteItem } from '@/lib/types'
import { fmt, calcPhase, calcPhaseSell } from '@/lib/utils'

// ── IDs ────────────────────────────────────────────────────────────────────────
let _id = Date.now()
const uid = () => ++_id

// ── Cost helpers ───────────────────────────────────────────────────────────────
const ITEM_TYPES = ['labour','materials','plant','subcontractors','other'] as const
type ItemType = typeof ITEM_TYPES[number]

const TYPE_LABEL: Record<ItemType, string> = {
  labour: 'Labour', materials: 'Materials', plant: 'Plant',
  subcontractors: 'Subcontract', other: 'Other',
}
const TYPE_COLOR: Record<ItemType, { bg: string; text: string }> = {
  labour:         { bg: '#fef3c7', text: '#92400e' },
  materials:      { bg: '#dbeafe', text: '#1d4ed8' },
  plant:          { bg: '#f3e8ff', text: '#7c3aed' },
  subcontractors: { bg: '#fee2e2', text: '#991b1b' },
  other:          { bg: '#f1f5f9', text: '#475569' },
}

function itemCost(i: QuoteItem): number {
  return (i.labour ?? 0) + (i.materials ?? 0) + (i.plantHire ?? 0) + (i.subcontractors ?? 0) + (i.other ?? 0)
}
function phaseSell(p: QuotePhase, markup: number): number {
  return calcPhaseSell(p, markup)
}
function fmt2(n: number) { return n.toFixed(2) }

// ── Hierarchy builders ─────────────────────────────────────────────────────────

/** Ordered unique values preserving insertion order */
function ordered<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

function getMainPhases(phases: QuotePhase[]): string[] {
  return ordered(phases.map(p => p.parentPhase || '(No Phase)'))
}
function getRoomLabels(phases: QuotePhase[], mainPhase: string): string[] {
  const sub = phases.filter(p => (p.parentPhase || '(No Phase)') === mainPhase)
  return ordered(sub.map(p => p.roomLabel || ''))
}
function getSubPhases(phases: QuotePhase[], mainPhase: string, room: string): QuotePhase[] {
  return phases.filter(p =>
    (p.parentPhase || '(No Phase)') === mainPhase &&
    (p.roomLabel || '') === room
  )
}
function getTaskGroups(items: QuoteItem[]): string[] {
  return ordered(items.map(i => i.taskGroup || ''))
}
function getItemsInTask(items: QuoteItem[], tg: string): QuoteItem[] {
  return items.filter(i => (i.taskGroup || '') === tg)
}

// ── Totals ─────────────────────────────────────────────────────────────────────
function taskTotal(items: QuoteItem[], tg: string, markup: number): number {
  const cost = getItemsInTask(items, tg).reduce((s, i) => s + itemCost(i), 0)
  return +(cost * (1 + markup / 100)).toFixed(2)
}
function subPhaseTotalSell(p: QuotePhase, markup: number): number {
  return phaseSell(p, markup)
}
function roomTotalSell(phases: QuotePhase[], mainPhase: string, room: string, markup: number): number {
  return getSubPhases(phases, mainPhase, room).reduce((s, p) => s + phaseSell(p, markup), 0)
}
function mainPhaseTotalSell(phases: QuotePhase[], mainPhase: string, markup: number): number {
  return phases.filter(p => (p.parentPhase || '(No Phase)') === mainPhase)
    .reduce((s, p) => s + phaseSell(p, markup), 0)
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const fldStyle: React.CSSProperties = {
  background: 'transparent', border: 'none', outline: 'none',
  fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit',
  width: '100%', padding: 0,
}
const cellInp: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  fontFamily: 'monospace', fontSize: 12, textAlign: 'right', padding: '2px 4px',
  borderRadius: 3,
}
const addBtn: React.CSSProperties = {
  background: 'transparent', border: '1px dashed #94a3b8', borderRadius: 4,
  color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '3px 8px',
  display: 'inline-flex', alignItems: 'center', gap: 3,
}
const iconBtn = (color = '#64748b'): React.CSSProperties => ({
  background: 'none', border: 'none', cursor: 'pointer', color, fontSize: 13,
  padding: '1px 5px', borderRadius: 3, lineHeight: 1,
})

// ── Cost row ──────────────────────────────────────────────────────────────────

interface CostRowProps {
  item: QuoteItem
  isLocked: boolean
  onUpdate: (item: QuoteItem) => void
  onDelete: () => void
  onDuplicate: () => void
  isFirst: boolean
}

function CostRow({ item, isLocked, onUpdate, onDelete, onDuplicate, isFirst }: CostRowProps) {
  const cat = (item.itemType ?? 'other') as ItemType
  const cs  = TYPE_COLOR[cat]
  const cost = itemCost(item)

  function setField<K extends keyof QuoteItem>(k: K, v: QuoteItem[K]) {
    onUpdate({ ...item, [k]: v })
  }
  function setNum(k: 'labour' | 'materials' | 'plantHire' | 'subcontractors' | 'other', raw: string) {
    setField(k, +raw || 0)
  }

  const catKey: 'labour' | 'materials' | 'plantHire' | 'subcontractors' | 'other' =
    cat === 'plant' ? 'plantHire' : cat as 'labour' | 'materials' | 'subcontractors' | 'other'

  return (
    <tr style={{ borderBottom: '1px solid #f1f5f9', opacity: 1 }}>
      {/* Category chip */}
      <td style={{ padding: '4px 6px', width: 80 }}>
        <select
          value={cat}
          disabled={isLocked}
          onChange={e => setField('itemType', e.target.value as ItemType)}
          style={{ ...fldStyle, fontSize: 10, fontWeight: 700,
            padding: '2px 5px', borderRadius: 3, cursor: 'pointer',
            background: cs.bg, color: cs.text, width: 'auto' }}>
          {ITEM_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </td>
      {/* Description */}
      <td style={{ padding: '4px 6px', minWidth: 160 }}>
        <input style={{ ...fldStyle, fontSize: 12 }}
          value={item.desc} readOnly={isLocked}
          onChange={e => setField('desc', e.target.value)}
          placeholder="Description" />
      </td>
      {/* Qty */}
      <td style={{ padding: '4px 6px', width: 64 }}>
        <input type="number" style={{ ...cellInp }}
          value={item.qty} readOnly={isLocked}
          onChange={e => setField('qty', +e.target.value || 0)} />
      </td>
      {/* Unit */}
      <td style={{ padding: '4px 6px', width: 46 }}>
        <input style={{ ...fldStyle, fontSize: 11, textAlign: 'center' }}
          value={item.unit} readOnly={isLocked}
          onChange={e => setField('unit', e.target.value)} />
      </td>
      {/* Rate (cost for this category) */}
      <td style={{ padding: '4px 6px', width: 90 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 4, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#94a3b8' }}>£</span>
          <input type="number" style={{ ...cellInp, paddingLeft: 16 }}
            value={item[catKey] ?? 0} readOnly={isLocked}
            onChange={e => setNum(catKey, e.target.value)} />
        </div>
      </td>
      {/* Total */}
      <td style={{ padding: '4px 6px', width: 90, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: cost > 0 ? 600 : 400, color: cost > 0 ? '#1e293b' : '#cbd5e1' }}>
        {cost > 0 ? `£${fmt2(cost)}` : '—'}
      </td>
      {/* Notes */}
      <td style={{ padding: '4px 6px', minWidth: 100 }}>
        <input style={{ ...fldStyle, fontSize: 10, color: '#94a3b8' }}
          value={item.notes} readOnly={isLocked}
          onChange={e => setField('notes', e.target.value)}
          placeholder="Notes" />
      </td>
      {/* Actions */}
      {!isLocked && (
        <td style={{ padding: '4px 2px', width: 50, textAlign: 'right', whiteSpace: 'nowrap' }}>
          <button onClick={onDuplicate} style={iconBtn()} title="Duplicate">⧉</button>
          <button onClick={onDelete} style={iconBtn('#e74c3c')} title="Delete">×</button>
        </td>
      )}
    </tr>
  )
}

// ── Task group (Level 4) ───────────────────────────────────────────────────────

interface TaskGroupProps {
  tg: string
  items: QuoteItem[]
  markup: number
  isLocked: boolean
  collapsed: Set<string>
  colKey: string
  toggle: (k: string) => void
  onUpdateItem: (item: QuoteItem) => void
  onDeleteItem: (id: number) => void
  onDuplicateItem: (item: QuoteItem) => void
  onAddRow: (tg: string, type: ItemType) => void
  onRenameTask: (oldName: string, newName: string) => void
  onDeleteTask: (tg: string) => void
}

function TaskGroup({ tg, items, markup, isLocked, collapsed, colKey, toggle, onUpdateItem, onDeleteItem, onDuplicateItem, onAddRow, onRenameTask, onDeleteTask }: TaskGroupProps) {
  const open  = !collapsed.has(colKey)
  const cost  = items.reduce((s, i) => s + itemCost(i), 0)
  const sell  = +(cost * (1 + markup / 100)).toFixed(2)
  const hasName = !!tg

  return (
    <div style={{ marginBottom: 4 }}>
      {hasName && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 8px 5px 16px',
            background: '#f0f4f0', borderRadius: 4,
            cursor: 'pointer', userSelect: 'none',
          }}
          onClick={() => toggle(colKey)}
        >
          <span style={{ fontSize: 11, color: '#94a3b8', width: 12 }}>{open ? '▾' : '▸'}</span>
          <input
            value={tg}
            readOnly={isLocked}
            onClick={e => e.stopPropagation()}
            onChange={e => onRenameTask(tg, e.target.value)}
            style={{ ...fldStyle, fontSize: 12, fontWeight: 600, color: '#374151', flex: 1 }}
          />
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', flexShrink: 0 }}>
            {sell > 0 ? `£${fmt2(sell)}` : '—'}
          </span>
          {!isLocked && (
            <button onClick={e => { e.stopPropagation(); onDeleteTask(tg) }} style={iconBtn('#e74c3c')} title="Remove task">×</button>
          )}
        </div>
      )}

      {(!hasName || open) && (
        <div style={{ paddingLeft: hasName ? 12 : 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {items.map(item => (
                <CostRow
                  key={item.id}
                  item={item}
                  isLocked={isLocked}
                  isFirst={false}
                  onUpdate={onUpdateItem}
                  onDelete={() => onDeleteItem(item.id)}
                  onDuplicate={() => onDuplicateItem(item)}
                />
              ))}
            </tbody>
          </table>
          {!isLocked && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', padding: '4px 0 2px' }}>
              {ITEM_TYPES.map(t => (
                <button key={t} style={{ ...addBtn, fontSize: 10 }}
                  onClick={() => onAddRow(tg, t)}>
                  + {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Item status badge ─────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  'bo-default': { label: '🏢 BO Default',  bg: '#f1f5f9', text: '#64748b' },
  'edited':     { label: '✏️ Edited',       bg: '#fef3c7', text: '#92400e' },
  'manual':     { label: '➕ Manual',       bg: '#dbeafe', text: '#1d4ed8' },
  'takeoff':    { label: '📐 Takeoff',      bg: '#eff6ff', text: '#1d4ed8' },
  'ai':         { label: '✦ AI',            bg: '#fdf4ff', text: '#7c3aed' },
}

function ItemStatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const cfg = STATUS_CONFIG[status]
  if (!cfg) return null
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: cfg.bg, color: cfg.text, flexShrink: 0 }}>
      {cfg.label}
    </span>
  )
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'manual') return null
  const config = {
    takeoff: { label: '📐 Takeoff', bg: '#eff6ff', text: '#1d4ed8' },
    ai:      { label: '✦ AI',      bg: '#fdf4ff', text: '#7c3aed' },
  }[source as 'takeoff' | 'ai']
  if (!config) return null
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: config.bg, color: config.text, flexShrink: 0 }}>
      {config.label}
    </span>
  )
}

// ── Sub-phase block (Level 3) ──────────────────────────────────────────────────

interface SubPhaseBlockProps {
  p: QuotePhase
  markup: number
  isLocked: boolean
  collapsed: Set<string>
  toggle: (k: string) => void
  onUpdate: (p: QuotePhase) => void
  onDelete: () => void
  onDuplicate: () => void
  onAddTask: () => void
  onSaveToBO?: (p: QuotePhase) => void
}

function SubPhaseBlock({ p, markup, isLocked, collapsed, toggle, onUpdate, onDelete, onDuplicate, onAddTask, onSaveToBO }: SubPhaseBlockProps) {
  const colKey = `sp_${p.id}`
  const open   = !collapsed.has(colKey)
  const sell   = subPhaseTotalSell(p, markup)
  const tgs    = getTaskGroups(p.items)
  const m      = p.meta?.measurements

  // Mark phase as 'edited' when any cost field changes from a bo-default baseline
  function markEdited(updated: QuotePhase) {
    if (updated.itemStatus === 'bo-default') {
      return { ...updated, itemStatus: 'edited' as const }
    }
    return updated
  }

  function updateItem(item: QuoteItem) {
    onUpdate(markEdited({ ...p, items: p.items.map(i => i.id === item.id ? item : i) }))
  }
  function deleteItem(id: number) {
    onUpdate({ ...p, items: p.items.filter(i => i.id !== id) })
  }
  function duplicateItem(item: QuoteItem) {
    const idx = p.items.findIndex(i => i.id === item.id)
    const copy = { ...item, id: uid() }
    const next = [...p.items]
    next.splice(idx + 1, 0, copy)
    onUpdate({ ...p, items: next })
  }
  function addRow(tg: string, type: ItemType) {
    const newItem: QuoteItem = {
      id: uid(), desc: '', qty: 1, unit: 'item',
      labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0,
      notes: '', itemType: type, taskGroup: tg || undefined,
    }
    onUpdate({ ...p, items: [...p.items, newItem] })
  }
  function renameTask(oldName: string, newName: string) {
    onUpdate({ ...p, items: p.items.map(i => (i.taskGroup || '') === oldName ? { ...i, taskGroup: newName || undefined } : i) })
  }
  function deleteTask(tg: string) {
    onUpdate({ ...p, items: p.items.filter(i => (i.taskGroup || '') !== tg) })
  }

  // Measurement badges
  const badges: string[] = []
  if (m?.length)  badges.push(`${m.length?.toFixed(2)} m`)
  if (m?.area)    badges.push(`${m.area?.toFixed(2)} m²`)
  if (m?.volume)  badges.push(`${m.volume?.toFixed(3)} m³`)

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 6, overflow: 'hidden' }}>
      {/* Sub-phase header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
          background: p.needsReview ? '#fffbeb' : '#f8fafc',
          cursor: 'pointer', userSelect: 'none',
          borderLeft: p.needsReview ? '3px solid #f59e0b' : 'none',
        }}
        onClick={() => toggle(colKey)}
      >
        <span style={{ color: '#94a3b8', fontSize: 11, width: 12, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
        <input
          value={p.phase}
          readOnly={isLocked}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ ...p, phase: e.target.value })}
          style={{ ...fldStyle, fontWeight: 700, fontSize: 13, color: '#1e293b', flex: 1 }}
          placeholder="Sub-phase name"
        />
        {badges.map((b, i) => (
          <span key={i} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 99, background: '#e0f2fe', color: '#0369a1', flexShrink: 0 }}>{b}</span>
        ))}
        {p.needsReview && (
          <span title={p.reviewNote ?? 'This item needs review'} style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: '#fef3c7', color: '#92400e', flexShrink: 0, cursor: 'help' }}>
            ⚠️ Needs Review
          </span>
        )}
        <ItemStatusBadge status={p.itemStatus} />
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: '#7ab533', flexShrink: 0 }}>
          {sell > 0 ? fmt(sell) : '—'}
        </span>
        {!isLocked && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button style={iconBtn()} title="Add task" onClick={onAddTask}>+ Task</button>
            <button style={iconBtn()} title="Duplicate" onClick={onDuplicate}>⧉</button>
            {onSaveToBO && (p.itemStatus === 'edited' || p.itemStatus === 'bo-default') && p.boSubPhaseId && (
              <button
                onClick={e => { e.stopPropagation(); onSaveToBO(p) }}
                title="Save current rates back to Back Office defaults"
                style={{ ...iconBtn('#16a34a'), fontSize: 10, border: '1px solid #86efac', borderRadius: 4, padding: '2px 6px' }}
              >
                ↑ BO
              </button>
            )}
            <button style={iconBtn('#e74c3c')} title="Delete" onClick={onDelete}>×</button>
          </div>
        )}
      </div>

      {/* Sub-phase body */}
      {open && (
        <div style={{ padding: '6px 10px 8px' }}>
          {/* Needs-review banner */}
          {p.needsReview && p.reviewNote && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 8, background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 5, fontSize: 11, color: '#92400e' }}>
              <span>⚠️</span>
              <span style={{ flex: 1 }}>{p.reviewNote}</span>
              {!isLocked && (
                <button
                  onClick={() => onUpdate({ ...p, needsReview: false, reviewNote: undefined })}
                  style={{ ...iconBtn('#92400e'), fontSize: 10, border: '1px solid #f59e0b', borderRadius: 3, padding: '1px 6px' }}>
                  Mark reviewed
                </button>
              )}
            </div>
          )}
          {tgs.map(tg => (
            <TaskGroup
              key={tg}
              tg={tg}
              items={getItemsInTask(p.items, tg)}
              markup={markup}
              isLocked={isLocked}
              collapsed={collapsed}
              colKey={`tk_${p.id}_${tg}`}
              toggle={toggle}
              onUpdateItem={updateItem}
              onDeleteItem={deleteItem}
              onDuplicateItem={duplicateItem}
              onAddRow={addRow}
              onRenameTask={renameTask}
              onDeleteTask={deleteTask}
            />
          ))}
          {p.items.length === 0 && (
            <div style={{ color: '#94a3b8', fontSize: 12, fontStyle: 'italic', padding: '4px 0' }}>
              No rows yet — add a task or cost row below
            </div>
          )}
          {!isLocked && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ITEM_TYPES.map(t => (
                <button key={t} style={{ ...addBtn, fontSize: 10 }}
                  onClick={() => addRow('', t)}>
                  + {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Room block (Level 2) ───────────────────────────────────────────────────────

interface RoomBlockProps {
  mainPhase: string
  room: string
  phases: QuotePhase[]
  markup: number
  isLocked: boolean
  collapsed: Set<string>
  toggle: (k: string) => void
  onUpdatePhase: (p: QuotePhase) => void
  onDeletePhase: (id: number) => void
  onDuplicatePhase: (p: QuotePhase) => void
  onAddSubPhase: (mainPhase: string, room: string) => void
  onAddTask: (phaseId: number) => void
  onRenameRoom: (mainPhase: string, oldRoom: string, newRoom: string) => void
  onSaveToBO?: (p: QuotePhase) => void
}

function RoomBlock({ mainPhase, room, phases, markup, isLocked, collapsed, toggle, onUpdatePhase, onDeletePhase, onDuplicatePhase, onAddSubPhase, onAddTask, onRenameRoom, onSaveToBO }: RoomBlockProps) {
  const hasRoom = !!room
  const colKey  = `rm_${mainPhase}_${room}`
  const open    = !collapsed.has(colKey)
  const total   = roomTotalSell(phases, mainPhase, room, markup)
  const subPhs  = getSubPhases(phases, mainPhase, room)

  return (
    <div style={{ marginBottom: hasRoom ? 10 : 0 }}>
      {/* Room header — only show if there IS a room label */}
      {hasRoom && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#f0f9f0', borderRadius: 5, cursor: 'pointer', userSelect: 'none', marginBottom: 4 }}
          onClick={() => toggle(colKey)}
        >
          <span style={{ color: '#94a3b8', fontSize: 11, width: 12 }}>{open ? '▾' : '▸'}</span>
          <span style={{ fontSize: 11 }}>📍</span>
          <input
            value={room}
            readOnly={isLocked}
            onClick={e => e.stopPropagation()}
            onChange={e => onRenameRoom(mainPhase, room, e.target.value)}
            style={{ ...fldStyle, fontWeight: 600, fontSize: 13, color: '#166534', flex: 1 }}
            placeholder="Area / Room label"
          />
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#16a34a', fontWeight: 700, flexShrink: 0 }}>
            {total > 0 ? fmt(total) : '—'}
          </span>
          {!isLocked && (
            <button
              onClick={e => { e.stopPropagation(); onAddSubPhase(mainPhase, room) }}
              style={{ ...addBtn, fontSize: 10 }}>
              + Sub-phase
            </button>
          )}
        </div>
      )}

      {/* Sub-phases inside this room */}
      {(!hasRoom || open) && (
        <div style={{ paddingLeft: hasRoom ? 16 : 0 }}>
          {subPhs.map(p => (
            <SubPhaseBlock
              key={p.id}
              p={p}
              markup={markup}
              isLocked={isLocked}
              collapsed={collapsed}
              toggle={toggle}
              onUpdate={onUpdatePhase}
              onDelete={() => onDeletePhase(p.id)}
              onDuplicate={() => onDuplicatePhase(p)}
              onAddTask={() => onAddTask(p.id)}
              onSaveToBO={onSaveToBO}
            />
          ))}
          {!isLocked && !hasRoom && (
            <button style={{ ...addBtn, fontSize: 11, marginTop: 4 }}
              onClick={() => onAddSubPhase(mainPhase, room)}>
              + Sub-phase
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Phase block (Level 1) ──────────────────────────────────────────────────────

interface PhaseBlockProps {
  mainPhase: string
  phases: QuotePhase[]
  markup: number
  isLocked: boolean
  collapsed: Set<string>
  toggle: (k: string) => void
  onUpdatePhase: (p: QuotePhase) => void
  onDeletePhase: (id: number) => void
  onDuplicatePhase: (p: QuotePhase) => void
  onAddSubPhase: (mainPhase: string, room: string) => void
  onAddRoom: (mainPhase: string) => void
  onAddTask: (phaseId: number) => void
  onRenameMain: (oldName: string, newName: string) => void
  onDeleteMain: (name: string) => void
  onRenameRoom: (mainPhase: string, oldRoom: string, newRoom: string) => void
  onSaveToBO?: (p: QuotePhase) => void
}

function PhaseBlock({ mainPhase, phases, markup, isLocked, collapsed, toggle, onUpdatePhase, onDeletePhase, onDuplicatePhase, onAddSubPhase, onAddRoom, onAddTask, onRenameMain, onDeleteMain, onRenameRoom, onSaveToBO }: PhaseBlockProps) {
  const colKey = `mp_${mainPhase}`
  const open   = !collapsed.has(colKey)
  const total  = mainPhaseTotalSell(phases, mainPhase, markup)
  const rooms  = getRoomLabels(phases, mainPhase)

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Phase header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', color: '#fff', padding: '10px 16px', borderRadius: open ? '8px 8px 0 0' : 8, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => toggle(colKey)}
      >
        <span style={{ fontSize: 12, width: 14 }}>{open ? '▾' : '▸'}</span>
        <input
          value={mainPhase}
          readOnly={isLocked}
          onClick={e => e.stopPropagation()}
          onChange={e => onRenameMain(mainPhase, e.target.value)}
          style={{ ...fldStyle, fontWeight: 700, fontSize: 14, color: '#fff', flex: 1 }}
          placeholder="Phase name"
        />
        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533', flexShrink: 0 }}>
          {total > 0 ? fmt(total) : '—'}
        </span>
        {!isLocked && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button style={{ ...addBtn, border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: 11 }}
              onClick={() => onAddRoom(mainPhase)}>+ Room</button>
            <button style={{ ...addBtn, border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: 11 }}
              onClick={() => onAddSubPhase(mainPhase, '')}>+ Sub-phase</button>
            <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
              onClick={() => onDeleteMain(mainPhase)} title="Delete phase">×</button>
          </div>
        )}
      </div>

      {/* Phase body */}
      {open && (
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px', padding: 12, background: '#fafafa' }}>
          {rooms.map(room => (
            <RoomBlock
              key={room}
              mainPhase={mainPhase}
              room={room}
              phases={phases}
              markup={markup}
              isLocked={isLocked}
              collapsed={collapsed}
              toggle={toggle}
              onUpdatePhase={onUpdatePhase}
              onDeletePhase={onDeletePhase}
              onDuplicatePhase={onDuplicatePhase}
              onAddSubPhase={onAddSubPhase}
              onAddTask={onAddTask}
              onRenameRoom={onRenameRoom}
              onSaveToBO={onSaveToBO}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main QuoteWorkspace ────────────────────────────────────────────────────────

export interface QuoteWorkspaceProps {
  phases:            QuotePhase[]
  markup:            number
  vatOn?:            boolean
  isLocked?:         boolean
  onChange:          (phases: QuotePhase[]) => void
  onImportTakeoff?:  () => void
  onAIGenerate?:     () => void
  aiGenerating?:     boolean
  onLoadTemplate?:   (jobType: string) => void
  jobType?:          string
  /** Called when user clicks "Save to BO" on a sub-phase */
  onSaveToBO?:       (phase: QuotePhase) => void
}

export default function QuoteWorkspace({ phases, markup, vatOn = true, isLocked = false, onChange, onImportTakeoff, onAIGenerate, aiGenerating, onLoadTemplate, jobType, onSaveToBO }: QuoteWorkspaceProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [search,    setSearch]    = useState('')

  const toggle = useCallback((k: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })
  }, [])

  // ── Filter ───────────────────────────────────────────────────────────────
  const q = search.toLowerCase().trim()
  const visiblePhases = q
    ? phases.filter(p =>
        (p.parentPhase ?? '').toLowerCase().includes(q) ||
        (p.roomLabel   ?? '').toLowerCase().includes(q) ||
        p.phase.toLowerCase().includes(q) ||
        p.items.some(i => i.desc.toLowerCase().includes(q) || (i.notes ?? '').toLowerCase().includes(q))
      )
    : phases

  // ── Helpers for updating phases array ────────────────────────────────────
  function updatePhase(updated: QuotePhase) {
    onChange(phases.map(p => p.id === updated.id ? updated : p))
  }
  function deletePhase(id: number) {
    onChange(phases.filter(p => p.id !== id))
  }
  function duplicatePhase(p: QuotePhase) {
    const idx = phases.findIndex(x => x.id === p.id)
    const copy: QuotePhase = {
      ...JSON.parse(JSON.stringify(p)),
      id: uid(),
      items: p.items.map(i => ({ ...i, id: uid() })),
    }
    const next = [...phases]
    next.splice(idx + 1, 0, copy)
    onChange(next)
  }
  function addSubPhase(mainPhase: string, room: string) {
    const newPhase: QuotePhase = {
      id: uid(), phase: 'New Sub-Phase', parentPhase: mainPhase,
      roomLabel: room || undefined,
      source: 'manual', itemStatus: 'manual',
      items: [
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' },
      ],
      estimatorItems: [], useEstimator: false,
    }
    onChange([...phases, newPhase])
  }
  function addRoom(mainPhase: string) {
    addSubPhase(mainPhase, 'New Room')
  }
  function addMainPhase() {
    const newPhase: QuotePhase = {
      id: uid(), phase: 'New Sub-Phase', parentPhase: 'New Phase',
      items: [
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
        { id: uid(), desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' },
      ],
      estimatorItems: [], useEstimator: false,
    }
    onChange([...phases, newPhase])
  }
  function addTask(phaseId: number) {
    const p = phases.find(x => x.id === phaseId)
    if (!p) return
    const tgName = `Task ${getTaskGroups(p.items).length + 1}`
    const rows: QuoteItem[] = ITEM_TYPES.map(t => ({
      id: uid(), desc: '', qty: 1, unit: 'Item',
      labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0,
      notes: '', itemType: t, taskGroup: tgName,
    }))
    updatePhase({ ...p, items: [...p.items, ...rows] })
  }
  function renameMain(oldName: string, newName: string) {
    onChange(phases.map(p => (p.parentPhase || '(No Phase)') === oldName ? { ...p, parentPhase: newName } : p))
  }
  function deleteMain(name: string) {
    if (!confirm(`Delete phase "${name}" and all its contents?`)) return
    onChange(phases.filter(p => (p.parentPhase || '(No Phase)') !== name))
  }
  function renameRoom(mainPhase: string, oldRoom: string, newRoom: string) {
    onChange(phases.map(p =>
      (p.parentPhase || '(No Phase)') === mainPhase && (p.roomLabel || '') === oldRoom
        ? { ...p, roomLabel: newRoom || undefined }
        : p
    ))
  }

  // ── Collapse all / expand all ─────────────────────────────────────────────
  function expandAll() { setCollapsed(new Set()) }
  function collapseAll() {
    const keys = new Set<string>()
    for (const p of phases) {
      const mp = p.parentPhase || '(No Phase)'
      const rl = p.roomLabel  || ''
      keys.add(`mp_${mp}`)
      if (rl) keys.add(`rm_${mp}_${rl}`)
      keys.add(`sp_${p.id}`)
      getTaskGroups(p.items).filter(Boolean).forEach(tg => keys.add(`tk_${p.id}_${tg}`))
    }
    setCollapsed(keys)
  }

  // ── Grand totals ──────────────────────────────────────────────────────────
  const grandCost = phases.reduce((s, p) => s + calcPhase(p), 0)
  const grandSell = phases.reduce((s, p) => s + calcPhaseSell(p, markup), 0)
  const grandVat  = vatOn ? grandSell * 0.2 : 0
  const grandTotal = grandSell + grandVat

  const mainPhases = getMainPhases(visiblePhases)

  return (
    <div style={{ fontSize: 13 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter phases, rooms, tasks…"
            style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', outline: 'none' }}
          />
          {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14 }}>×</button>}
        </div>
        <button style={{ ...addBtn, fontSize: 11 }} onClick={expandAll}>▼▼ Expand All</button>
        <button style={{ ...addBtn, fontSize: 11 }} onClick={collapseAll}>▶▶ Collapse All</button>
        {!isLocked && <button style={{ ...addBtn, fontSize: 11, borderColor: '#7ab533', color: '#16a34a' }} onClick={addMainPhase}>+ Add Phase</button>}
      </div>

      {/* Empty / landing state */}
      {mainPhases.length === 0 && !search && (
        <div style={{ padding: '32px 20px', border: '2px dashed #e2e8f0', borderRadius: 12, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginBottom: 6 }}>
            Your quote workspace is empty
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginBottom: 28, maxWidth: 420, margin: '0 auto 28px' }}>
            Start by importing from the Takeoff tool, generating from a scope of works, or loading a job template.
          </div>

          {/* Two primary CTAs */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
            <button
              onClick={onImportTakeoff}
              disabled={!onImportTakeoff}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '18px 28px', background: '#eff6ff',
                border: '2px solid #bfdbfe', borderRadius: 10,
                cursor: 'pointer', minWidth: 160,
                transition: 'border-color 0.15s',
              }}
            >
              <span style={{ fontSize: 28 }}>📐</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#1d4ed8' }}>Import from Takeoff</span>
              <span style={{ fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
                Upload a takeoff JSON file to bring in measured quantities and build-up recipes
              </span>
            </button>

            <button
              onClick={onAIGenerate}
              disabled={aiGenerating || !onAIGenerate}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '18px 28px', background: '#fdf4ff',
                border: '2px solid #e9d5ff', borderRadius: 10,
                cursor: aiGenerating ? 'wait' : 'pointer', minWidth: 160,
              }}
            >
              <span style={{ fontSize: 28 }}>{aiGenerating ? '⏳' : '✦'}</span>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#7c3aed' }}>
                {aiGenerating ? 'Generating…' : 'Generate from Scope'}
              </span>
              <span style={{ fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
                Type your scope of works on the left, then click here to build the quote with AI
              </span>
            </button>
          </div>

          {/* Secondary: load template */}
          {onLoadTemplate && (
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Or{' '}
              <button
                onClick={() => onLoadTemplate(jobType ?? 'Rear Extension')}
                style={{ background: 'none', border: 'none', color: '#4a90a4', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
                load a {jobType ?? 'Rear Extension'} template
              </button>
              {' '}to start with standard phases and edit manually.
            </div>
          )}
        </div>
      )}

      {/* Filtered empty state */}
      {mainPhases.length === 0 && !!search && (
        <div style={{ textAlign: 'center', padding: '40px 20px', border: '2px dashed #e2e8f0', borderRadius: 8, color: '#94a3b8' }}>
          No results for &ldquo;{search}&rdquo;
        </div>
      )}

      {/* Phase blocks */}
      {mainPhases.map(mp => (
        <PhaseBlock
          key={mp}
          mainPhase={mp}
          phases={visiblePhases}
          markup={markup}
          isLocked={isLocked}
          collapsed={collapsed}
          toggle={toggle}
          onUpdatePhase={updatePhase}
          onDeletePhase={deletePhase}
          onDuplicatePhase={duplicatePhase}
          onAddSubPhase={addSubPhase}
          onAddRoom={addRoom}
          onAddTask={addTask}
          onRenameMain={renameMain}
          onDeleteMain={deleteMain}
          onRenameRoom={renameRoom}
          onSaveToBO={onSaveToBO}
        />
      ))}

      {/* Grand total footer */}
      {phases.length > 0 && (
        <div style={{ borderTop: '2px solid #e2e8f0', marginTop: 8, paddingTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>Cost: <span style={{ fontFamily: 'monospace', color: '#e67e22', fontWeight: 600 }}>{fmt(grandCost)}</span></div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Sell (ex-VAT): <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{fmt(grandSell)}</span></div>
          {vatOn && <div style={{ fontSize: 12, color: '#64748b' }}>VAT: <span style={{ fontFamily: 'monospace', color: '#4a90a4' }}>{fmt(grandVat)}</span></div>}
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: '#7ab533' }}>Total: {fmt(grandTotal)}</div>
        </div>
      )}
    </div>
  )
}
