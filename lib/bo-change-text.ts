// Plain-English wording for one line of the Back Office change history (bo_change_log), used by the Owner area's "Phase changes" page.

export interface ChangeRow {
  table_name: string
  op: string
  item_name: string | null
  parent_name: string | null
  changes: Record<string, unknown> | null
}

const KIND: Record<string, string> = { bo_phases: 'main phase', bo_sub_phases: 'sub-phase', bo_tasks: 'task', bo_deleted_items: 'standard item' }

const COLUMN: Record<string, string> = {
  name: 'Name', description: 'Description', client_description: 'Client description', unit: 'Unit', default_qty: 'Quantity',
  labour_cost: 'Labour £', materials_cost: 'Materials £', plant_cost: 'Plant £', subcontract_cost: 'Subcontract £', waste_cost: 'Waste £', other_cost: 'Other £',
  markup_pct: 'Markup %', active: 'Switched on', display_order: 'Order', phase_id: 'Main phase', sub_phase_id: 'Sub-phase', ai_hint: 'AI wording',
  is_allowance: 'Allowance', job_types: 'Job types', trade_name: 'Trade', productivity_rate: 'Productivity', canonical_id: 'Built-in id',
}

const short = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'empty'
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  return s.length > 90 ? s.slice(0, 87) + '…' : s
}

const isChange = (v: unknown): v is { old: unknown; new: unknown } => !!v && typeof v === 'object' && 'new' in (v as object)

/** A short headline: "Renamed sub-phase", "Deleted task", "Changed the AI wording" ... */
export function whatText(r: ChangeRow): string {
  const kind = KIND[r.table_name] ?? 'item'
  if (r.op === 'insert') return `Added ${kind}`
  if (r.op === 'delete') return `Deleted ${kind}`
  if (r.op === 'restore') return 'Restored a deleted standard item'
  const cols = Object.keys(r.changes ?? {})
  if (cols.length === 1 && cols[0] === 'name') return `Renamed ${kind}`
  if (cols.length === 1 && cols[0] === 'ai_hint') return 'Changed the AI wording'
  if (cols.some(c => c === 'phase_id' || c === 'sub_phase_id') && cols.length <= 2) return `Moved ${kind}`
  if (cols.length === 1 && cols[0] === 'active') return (r.changes as Record<string, { new: unknown }>).active.new ? `Switched ${kind} on` : `Switched ${kind} off`
  return `Changed ${kind}`
}

/** The detail lines: "Name: Roof Structure → Roof Frame". For an added or deleted item, its main figures. */
export function detailLines(r: ChangeRow): string[] {
  const ch = r.changes ?? {}
  if (r.op === 'update') {
    return Object.entries(ch).filter(([, v]) => isChange(v)).map(([col, v]) => {
      const c = v as { old: unknown; new: unknown }
      if (col === 'phase_id' || col === 'sub_phase_id') return `${COLUMN[col]}: moved`
      return `${COLUMN[col] ?? col}: ${short(c.old)} → ${short(c.new)}`
    })
  }
  if (r.op === 'restore') return [`${String((ch as { kind?: string }).kind ?? 'item').replace('_', '-')} put back`]
  const lines: string[] = []
  for (const col of ['unit', 'default_qty', 'labour_cost', 'materials_cost', 'plant_cost', 'subcontract_cost', 'other_cost', 'markup_pct', 'ai_hint']) {
    const v = (ch as Record<string, unknown>)[col]
    if (v !== undefined && v !== null && v !== '' && v !== 0) lines.push(`${COLUMN[col]}: ${short(v)}`)
  }
  return lines
}
