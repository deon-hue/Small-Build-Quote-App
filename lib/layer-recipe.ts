// Shared helper: build a full LayerCostRecord from a Back Office task's
// aggregate costs, preserving explicit item lists when they are present.
//
// This keeps bo_tasks.recipe_items consistent with the aggregate *_cost fields
// so the Takeoff Construction Layer Editor (which prefers recipe_items) always
// shows the same numbers as the Back Office editor — while allowing tasks to
// carry real lists of labour trades, plant items etc. selected by the user.

import type { BOTask } from './back-office-types'
import type { LayerCostRecord, LayerPlantItem } from './takeoff-types'

export function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  return 'id-' + Math.abs(Math.floor(Math.random() * 1e9)).toString(36)
}

export const plantListTotal = (list: LayerPlantItem[]): number =>
  +list.reduce((s, p) => s + (p.total || 0), 0).toFixed(2)

export function buildTaskRecipe(task: BOTask): LayerCostRecord {
  const existing = (task.recipe_items ?? null) as LayerCostRecord | null
  const dq = Math.max(1, task.default_qty || 1)
  const rec: LayerCostRecord = { labourItems: [], materialItems: [], plantItems: [], subItems: [], otherItems: [] }

  // Labour: prefer the explicit multi-trade list when its total matches labour_cost.
  // This preserves e.g. "Builder 1 day + Labourer 2 days" set up in the editor.
  const existingLabour = existing?.labourItems ?? []
  const labourListTotal = +existingLabour.reduce((s, l) => s + (l.total || 0), 0).toFixed(2)
  if (existingLabour.length && Math.abs(labourListTotal - (task.labour_cost ?? 0)) < 0.5) {
    rec.labourItems = existingLabour
  } else if ((task.labour_cost ?? 0) > 0) {
    rec.labourItems.push({
      id: uid(), trade: task.trade_name ?? 'Labour', description: task.description ?? '',
      qty: dq, unit: 'hr', rate: +((task.labour_cost) / dq).toFixed(2), total: task.labour_cost,
    })
  }

  if ((task.materials_cost ?? 0) > 0)
    rec.materialItems.push({
      id: uid(), name: 'Materials', unit: task.unit ?? 'm²', qty: dq,
      unitCost: +((task.materials_cost) / dq).toFixed(2), wastePct: 0, total: task.materials_cost,
    })

  // Plant: prefer the explicit master-library list when it matches plant_cost,
  // otherwise fall back to a single aggregate row (e.g. plant_cost typed directly).
  const list = existing?.plantItems ?? []
  if (list.length && Math.abs(plantListTotal(list) - (task.plant_cost ?? 0)) < 0.5) {
    rec.plantItems = list
  } else if ((task.plant_cost ?? 0) > 0) {
    rec.plantItems = [{ id: uid(), name: 'Plant / Equipment', unit: 'day', qty: 1, hireRate: task.plant_cost, total: task.plant_cost }]
  }

  if ((task.subcontract_cost ?? 0) > 0)
    rec.subItems.push({
      id: uid(), trade: 'Subcontractor', description: task.client_description ?? '',
      basis: 'fixed', qty: 1, unit: 'item', rate: task.subcontract_cost, total: task.subcontract_cost,
    })

  const ot = (task.other_cost ?? 0) + (task.waste_cost ?? 0)
  if (ot > 0)
    rec.otherItems.push({ id: uid(), description: 'Other / waste', unit: 'item', qty: 1, unitCost: ot, total: ot })

  return rec
}
