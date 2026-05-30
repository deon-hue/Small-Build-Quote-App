// Back Office CRUD helpers + sync from product defaults
// All functions take a Supabase browser client and userId.

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BOLabourTrade, BOPhase, BOSubPhase, BOTask,
  BOProduct, BOPlantItem, BOTakeoffTool, BOTakeoffSubtype,
  BOToolTaskMapping, BOFormulaRule, BOAIScopeMapping,
  BOWallType, BOWallLayer,
} from './back-office-types'
import { TAKEOFF_PHASES, WALL_MAKEUPS, type FloorMakeup, type LayerQtyType } from './takeoff-types'
import { CANONICAL_PHASE_IDS } from './product-config'
import { ALL_PHASE_SUBPHASES } from './phase-tasks'
import { DEFAULT_DEMO_SUBPHASES } from './demolition-data'

// ── Labour Trades ─────────────────────────────────────────────────────────────

export async function fetchLabourTrades(sb: SupabaseClient, userId: string): Promise<BOLabourTrade[]> {
  const { data } = await sb.from('bo_labour_trades').select('*').eq('user_id', userId).order('display_order')
  return data ?? []
}

export async function upsertLabourTrade(sb: SupabaseClient, trade: Partial<BOLabourTrade> & { user_id: string }): Promise<BOLabourTrade | null> {
  const { data } = await sb.from('bo_labour_trades').upsert({ ...trade, updated_at: new Date().toISOString() }).select().single()
  return data
}

export async function deleteLabourTrade(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_labour_trades').delete().eq('id', id)
}

// ── Phases ────────────────────────────────────────────────────────────────────

export async function fetchPhases(sb: SupabaseClient, userId: string): Promise<BOPhase[]> {
  const { data } = await sb.from('bo_phases').select('*').eq('user_id', userId).order('display_order')
  return data ?? []
}

export async function upsertPhase(sb: SupabaseClient, phase: Partial<BOPhase> & { user_id: string }): Promise<BOPhase | null> {
  const { data } = await sb.from('bo_phases').upsert(phase).select().single()
  return data
}

export async function deletePhase(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_phases').delete().eq('id', id)
}

// ── Sub-Phases ────────────────────────────────────────────────────────────────

export async function fetchSubPhases(sb: SupabaseClient, userId: string, phaseId?: string): Promise<BOSubPhase[]> {
  let q = sb.from('bo_sub_phases').select('*').eq('user_id', userId).order('display_order')
  if (phaseId) q = q.eq('phase_id', phaseId)
  const { data } = await q
  return data ?? []
}

export async function upsertSubPhase(sb: SupabaseClient, sp: Partial<BOSubPhase> & { user_id: string }): Promise<BOSubPhase | null> {
  const { data } = await sb.from('bo_sub_phases').upsert(sp).select().single()
  return data
}

export async function deleteSubPhase(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_sub_phases').delete().eq('id', id)
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function fetchTasks(sb: SupabaseClient, userId: string, phaseId?: string, subPhaseId?: string): Promise<BOTask[]> {
  let q = sb.from('bo_tasks').select('*').eq('user_id', userId).order('display_order')
  if (phaseId) q = q.eq('phase_id', phaseId)
  if (subPhaseId) q = q.eq('sub_phase_id', subPhaseId)
  const { data } = await q
  return data ?? []
}

export async function upsertTask(sb: SupabaseClient, task: Partial<BOTask> & { user_id: string }): Promise<BOTask | null> {
  const { data } = await sb.from('bo_tasks').upsert({ ...task, updated_at: new Date().toISOString() }).select().single()
  return data
}

export async function deleteTask(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_tasks').delete().eq('id', id)
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function fetchProducts(sb: SupabaseClient, userId: string): Promise<BOProduct[]> {
  const { data } = await sb.from('bo_products').select('*').eq('user_id', userId).order('name')
  return data ?? []
}

export async function upsertProduct(sb: SupabaseClient, product: Partial<BOProduct> & { user_id: string }): Promise<BOProduct | null> {
  const { data } = await sb.from('bo_products').upsert({ ...product, updated_at: new Date().toISOString() }).select().single()
  return data
}

export async function deleteProduct(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_products').delete().eq('id', id)
}

// ── Plant Items ───────────────────────────────────────────────────────────────

export async function fetchPlantItems(sb: SupabaseClient, userId: string): Promise<BOPlantItem[]> {
  const { data } = await sb.from('bo_plant_items').select('*').eq('user_id', userId).order('display_order')
  return data ?? []
}

export async function upsertPlantItem(sb: SupabaseClient, item: Partial<BOPlantItem> & { user_id: string }): Promise<BOPlantItem | null> {
  const { data } = await sb.from('bo_plant_items').upsert({ ...item, updated_at: new Date().toISOString() }).select().single()
  return data
}

export async function deletePlantItem(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_plant_items').delete().eq('id', id)
}

// ── Takeoff Tools ─────────────────────────────────────────────────────────────

export async function fetchTakeoffTools(sb: SupabaseClient, userId: string): Promise<BOTakeoffTool[]> {
  const { data } = await sb.from('bo_takeoff_tools').select('*').eq('user_id', userId).order('display_order')
  return data ?? []
}

export async function upsertTakeoffTool(sb: SupabaseClient, tool: Partial<BOTakeoffTool> & { user_id: string }): Promise<BOTakeoffTool | null> {
  const { data } = await sb.from('bo_takeoff_tools').upsert(tool).select().single()
  return data
}

export async function deleteTakeoffTool(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_takeoff_tools').delete().eq('id', id)
}

export async function fetchTakeoffSubtypes(sb: SupabaseClient, userId: string, toolId?: string): Promise<BOTakeoffSubtype[]> {
  let q = sb.from('bo_takeoff_subtypes').select('*').eq('user_id', userId).order('display_order')
  if (toolId) q = q.eq('tool_id', toolId)
  const { data } = await q
  return data ?? []
}

export async function upsertTakeoffSubtype(sb: SupabaseClient, st: Partial<BOTakeoffSubtype> & { user_id: string }): Promise<BOTakeoffSubtype | null> {
  const { data } = await sb.from('bo_takeoff_subtypes').upsert(st).select().single()
  return data
}

export async function deleteTakeoffSubtype(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_takeoff_subtypes').delete().eq('id', id)
}

export async function fetchToolTaskMappings(sb: SupabaseClient, subtypeId: string): Promise<BOToolTaskMapping[]> {
  const { data } = await sb.from('bo_tool_task_mappings').select('*, task:bo_tasks(*)').eq('subtype_id', subtypeId).order('display_order')
  return (data ?? []) as BOToolTaskMapping[]
}

export async function upsertToolTaskMapping(sb: SupabaseClient, m: Partial<BOToolTaskMapping> & { user_id: string }): Promise<BOToolTaskMapping | null> {
  const { task: _task, ...row } = m as BOToolTaskMapping
  const { data } = await sb.from('bo_tool_task_mappings').upsert(row).select().single()
  return data
}

export async function deleteToolTaskMapping(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_tool_task_mappings').delete().eq('id', id)
}

// ── Formula Rules ─────────────────────────────────────────────────────────────

export async function fetchFormulaRules(sb: SupabaseClient, userId: string): Promise<BOFormulaRule[]> {
  const { data } = await sb.from('bo_formula_rules').select('*').eq('user_id', userId).order('name')
  return (data ?? []).map(r => ({ ...r, variables: r.variables ?? [] }))
}

export async function upsertFormulaRule(sb: SupabaseClient, rule: Partial<BOFormulaRule> & { user_id: string }): Promise<BOFormulaRule | null> {
  const { data } = await sb.from('bo_formula_rules').upsert({ ...rule, updated_at: new Date().toISOString() }).select().single()
  return data
}

export async function deleteFormulaRule(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_formula_rules').delete().eq('id', id)
}

// ── AI Scope Mappings ─────────────────────────────────────────────────────────

export async function fetchAIScopeMappings(sb: SupabaseClient, userId: string): Promise<BOAIScopeMapping[]> {
  const { data } = await sb.from('bo_ai_scope_mappings').select('*, phase:bo_phases(*), sub_phase:bo_sub_phases(*), task:bo_tasks(*)').eq('user_id', userId).order('weight', { ascending: false })
  return (data ?? []) as BOAIScopeMapping[]
}

export async function upsertAIScopeMapping(sb: SupabaseClient, m: Partial<BOAIScopeMapping> & { user_id: string }): Promise<BOAIScopeMapping | null> {
  const { phase: _p, sub_phase: _sp, task: _t, ...row } = m as BOAIScopeMapping
  const { data } = await sb.from('bo_ai_scope_mappings').upsert(row).select().single()
  return data
}

export async function deleteAIScopeMapping(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_ai_scope_mappings').delete().eq('id', id)
}

// ── Seed Defaults ─────────────────────────────────────────────────────────────
// Called on first Back Office visit. Inserts built-in defaults if tables are empty.

// ── Wall Types ────────────────────────────────────────────────────────────────

/**
 * Fetch all wall types with their layers for a user.
 * Returns types ordered by display_order, layers ordered within each type.
 */
export async function fetchWallTypesWithLayers(sb: SupabaseClient, userId: string): Promise<BOWallType[]> {
  const [{ data: types }, { data: layers }] = await Promise.all([
    sb.from('bo_wall_types').select('*').eq('user_id', userId).eq('active', true).order('display_order'),
    sb.from('bo_wall_layers').select('*').eq('user_id', userId).order('display_order'),
  ])
  const layerMap = new Map<string, BOWallLayer[]>()
  ;(layers ?? []).forEach(l => {
    const arr = layerMap.get(l.wall_type_id) ?? []
    arr.push(l as BOWallLayer)
    layerMap.set(l.wall_type_id, arr)
  })
  return (types ?? []).map(t => ({ ...t, layers: layerMap.get(t.id) ?? [] } as BOWallType))
}

export async function upsertWallType(sb: SupabaseClient, wt: Partial<BOWallType> & { user_id: string }): Promise<BOWallType | null> {
  const { layers: _layers, ...row } = wt as BOWallType
  const { data } = await sb.from('bo_wall_types').upsert({ ...row, updated_at: new Date().toISOString() }).select().single()
  return data
}

export async function deleteWallType(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_wall_types').delete().eq('id', id)
}

export async function upsertWallLayer(sb: SupabaseClient, layer: Partial<BOWallLayer> & { user_id: string; wall_type_id: string }): Promise<BOWallLayer | null> {
  const { data } = await sb.from('bo_wall_layers').upsert(layer).select().single()
  return data
}

export async function deleteWallLayer(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('bo_wall_layers').delete().eq('id', id)
}

/**
 * Convert DB wall types (BOWallType[]) to FloorMakeup[] so the takeoff tool
 * and quote import can use them with zero changes to their existing logic.
 *
 * ID strategy: FloorMakeup.id = canonical_id (if set) or UUID.
 *   - canonical_id keeps backward compat with existing project data that
 *     stored static string IDs like 'cav_wall_partial'.
 *   - Custom (user-added) types have no canonical_id so their UUID is used.
 */
export function wallTypesToMakeups(types: BOWallType[]): FloorMakeup[] {
  return types.map(t => ({
    id:                t.canonical_id ?? t.id,
    name:              t.name,
    clientDescription: t.client_description,
    labourHrsPerM2:    t.labour_hrs_per_m2,
    wastePercent:      t.waste_percent,
    layers: (t.layers ?? []).map(l => ({
      id:             l.canonical_id ?? l.id,
      name:           l.name,
      thickness:      l.thickness_mm,
      unit:           l.unit as FloorMakeup['layers'][0]['unit'],
      qtyType:        l.qty_type as LayerQtyType,
      spacing:        l.spacing_mm ?? undefined,
      description:    l.description,
      category:       l.category as 'labour' | 'materials' | 'plant' | 'other',
      defaultEnabled: l.default_enabled,
    })),
  }))
}

// ── Seed Defaults ─────────────────────────────────────────────────────────────

const DEFAULT_PHASES = [
  'Preliminaries', 'Demolition', 'Groundworks', 'Foundations', 'Drainage',
  'Oversite & Floors', 'External Walls', 'Structural Steel', 'Roof Structure',
  'Roofing', 'Windows & Doors', 'First Fix Plumbing', 'First Fix Electrical',
  'Insulation', 'Plasterboarding', 'Plastering', 'Screed', 'Underfloor Heating',
  'Kitchen', 'Second Fix Carpentry', 'Second Fix Plumbing', 'Second Fix Electrical',
  'Decoration', 'External Works', 'Waste / Clearance', 'Handover',
]

const DEFAULT_SUB_PHASES: Record<string, string[]> = {
  'Demolition': ['Strip out', 'Wall removal', 'Ceiling removal', 'Floor removal', 'Plaster removal', 'Waste removal'],
  'Roofing': ['Flat roof', 'Warm roof', 'Cold roof', 'Pitched roof', 'Vaulted roof', 'Roof lanterns', 'Roof windows'],
  'External Walls': ['Brick and block cavity wall', 'Blockwork', 'Timber frame wall', 'Garden room wall build-up', 'Render finish'],
  'Oversite & Floors': ['Concrete slab', 'Beam and block', 'Timber floor', 'Screed', 'Insulated slab', 'UFH overlay'],
  'Foundations': ['Strip foundation', 'Trench fill', 'Pad foundation', 'Raft foundation', 'Piled foundation'],
  'Groundworks': ['Excavation', 'Spoil removal', 'Hardcore fill', 'Sand blinding'],
  'Drainage': ['Foul drainage', 'Surface water drainage', 'Soakaway', 'Manholes'],
  'Roof Structure': ['Flat roof joists', 'Pitched roof rafters', 'Ridge beam', 'Structural beam'],
  'Insulation': ['Floor insulation', 'Wall insulation', 'Roof insulation', 'Cavity insulation'],
  'Plastering': ['Skim coat', 'Hard wall plaster', 'Dry lining', 'Coving'],
  'First Fix Plumbing': ['Soil stack', 'Hot/cold pipework', 'Boiler/plant connections'],
  'First Fix Electrical': ['Consumer unit', 'Cable runs', 'Back boxes'],
  'Decoration': ['Primer/undercoat', 'Emulsion', 'Gloss / satin', 'External masonry paint'],
  'External Works': ['Paving', 'Decking', 'Fencing', 'Landscaping', 'Drainage'],
}

const DEFAULT_TASKS: Array<{ phase: string; subPhase?: string; name: string; unit: string; labour: number; materials: number; plant: number; sub: number; waste: number }> = [
  // Demolition
  { phase: 'Demolition', subPhase: 'Strip out', name: 'Strip out existing finishes', unit: 'm2', labour: 18, materials: 0, plant: 2, sub: 0, waste: 5 },
  { phase: 'Demolition', subPhase: 'Wall removal', name: 'Remove non-structural wall', unit: 'item', labour: 280, materials: 0, plant: 50, sub: 0, waste: 40 },
  { phase: 'Demolition', subPhase: 'Waste removal', name: 'Skip hire and loading', unit: 'item', labour: 120, materials: 0, plant: 280, sub: 0, waste: 0 },
  // Groundworks
  { phase: 'Groundworks', subPhase: 'Excavation', name: 'Excavate to formation level', unit: 'm3', labour: 45, materials: 0, plant: 35, sub: 0, waste: 0 },
  { phase: 'Groundworks', subPhase: 'Spoil removal', name: 'Remove and dispose of spoil', unit: 'm3', labour: 0, materials: 0, plant: 28, sub: 0, waste: 0 },
  { phase: 'Groundworks', subPhase: 'Hardcore fill', name: 'Supply and compact hardcore', unit: 'm3', labour: 25, materials: 38, plant: 15, sub: 0, waste: 5 },
  // Foundations
  { phase: 'Foundations', subPhase: 'Strip foundation', name: 'Excavate strip foundations', unit: 'm', labour: 55, materials: 0, plant: 30, sub: 0, waste: 0 },
  { phase: 'Foundations', subPhase: 'Strip foundation', name: 'Pour concrete to foundations', unit: 'm3', labour: 65, materials: 95, plant: 25, sub: 0, waste: 8 },
  { phase: 'Foundations', subPhase: 'Strip foundation', name: 'Build foundation blockwork to DPC', unit: 'm2', labour: 45, materials: 28, plant: 0, sub: 0, waste: 5 },
  // External Walls
  { phase: 'External Walls', subPhase: 'Brick and block cavity wall', name: 'Brick outer leaf', unit: 'm2', labour: 65, materials: 48, plant: 0, sub: 0, waste: 8 },
  { phase: 'External Walls', subPhase: 'Brick and block cavity wall', name: 'Block inner leaf', unit: 'm2', labour: 45, materials: 28, plant: 0, sub: 0, waste: 5 },
  { phase: 'External Walls', subPhase: 'Brick and block cavity wall', name: 'Cavity insulation', unit: 'm2', labour: 12, materials: 18, plant: 0, sub: 0, waste: 3 },
  { phase: 'External Walls', subPhase: 'Render finish', name: 'External render two-coat', unit: 'm2', labour: 28, materials: 18, plant: 0, sub: 0, waste: 5 },
  // Roof Structure
  { phase: 'Roof Structure', subPhase: 'Flat roof joists', name: 'Supply and fix flat roof joists', unit: 'm2', labour: 35, materials: 42, plant: 0, sub: 0, waste: 5 },
  { phase: 'Roof Structure', subPhase: 'Flat roof joists', name: 'Firrings and decking', unit: 'm2', labour: 22, materials: 28, plant: 0, sub: 0, waste: 5 },
  // Roofing
  { phase: 'Roofing', subPhase: 'Warm roof', name: 'Warm roof insulation board', unit: 'm2', labour: 18, materials: 45, plant: 0, sub: 0, waste: 5 },
  { phase: 'Roofing', subPhase: 'Warm roof', name: 'EPDM membrane', unit: 'm2', labour: 25, materials: 55, plant: 0, sub: 0, waste: 3 },
  { phase: 'Roofing', subPhase: 'Roof lanterns', name: 'Supply and install roof lantern', unit: 'item', labour: 480, materials: 0, plant: 0, sub: 2400, waste: 0 },
  // Oversite & Floors
  { phase: 'Oversite & Floors', subPhase: 'Concrete slab', name: 'Sand blinding layer', unit: 'm2', labour: 8, materials: 6, plant: 0, sub: 0, waste: 5 },
  { phase: 'Oversite & Floors', subPhase: 'Concrete slab', name: 'DPM membrane', unit: 'm2', labour: 5, materials: 4, plant: 0, sub: 0, waste: 5 },
  { phase: 'Oversite & Floors', subPhase: 'Concrete slab', name: 'Floor insulation', unit: 'm2', labour: 10, materials: 22, plant: 0, sub: 0, waste: 5 },
  { phase: 'Oversite & Floors', subPhase: 'Concrete slab', name: 'Pour and power float slab', unit: 'm2', labour: 22, materials: 38, plant: 18, sub: 0, waste: 5 },
  // Windows & Doors
  { phase: 'Windows & Doors', name: 'Supply and fit bifold doors', unit: 'item', labour: 480, materials: 0, plant: 0, sub: 3200, waste: 0 },
  { phase: 'Windows & Doors', name: 'Supply and fit window', unit: 'item', labour: 240, materials: 0, plant: 0, sub: 850, waste: 0 },
  // Plastering
  { phase: 'Plastering', subPhase: 'Skim coat', name: 'Plasterboard and skim walls', unit: 'm2', labour: 22, materials: 14, plant: 0, sub: 0, waste: 5 },
  { phase: 'Plastering', subPhase: 'Skim coat', name: 'Skim coat ceiling', unit: 'm2', labour: 18, materials: 8, plant: 0, sub: 0, waste: 5 },
  // Decoration
  { phase: 'Decoration', subPhase: 'Emulsion', name: 'Mist coat and two coat emulsion walls', unit: 'm2', labour: 8, materials: 3, plant: 0, sub: 0, waste: 0 },
  { phase: 'Decoration', subPhase: 'Emulsion', name: 'Emulsion ceiling', unit: 'm2', labour: 7, materials: 2, plant: 0, sub: 0, waste: 0 },
  // UFH
  { phase: 'Underfloor Heating', name: 'UFH pipe and manifold', unit: 'm2', labour: 18, materials: 28, plant: 0, sub: 0, waste: 3 },
  { phase: 'Underfloor Heating', name: 'UFH controls and commissioning', unit: 'item', labour: 240, materials: 180, plant: 0, sub: 0, waste: 0 },
  // Screed
  { phase: 'Screed', name: 'Liquid screed (pump)', unit: 'm2', labour: 8, materials: 22, plant: 35, sub: 0, waste: 5 },
  { phase: 'Screed', name: 'Sand and cement screed', unit: 'm2', labour: 18, materials: 14, plant: 8, sub: 0, waste: 5 },
  // Drainage
  { phase: 'Drainage', subPhase: 'Foul drainage', name: 'Excavate and lay foul drain', unit: 'm', labour: 45, materials: 28, plant: 25, sub: 0, waste: 0 },
  { phase: 'Drainage', subPhase: 'Foul drainage', name: 'Inspection chamber', unit: 'item', labour: 240, materials: 180, plant: 0, sub: 0, waste: 0 },
  // Structural Steel
  { phase: 'Structural Steel', name: 'Supply and install RSJ beam', unit: 'item', labour: 0, materials: 0, plant: 0, sub: 1200, waste: 0 },
  { phase: 'Structural Steel', name: 'Padstones', unit: 'item', labour: 45, materials: 35, plant: 0, sub: 0, waste: 5 },
  // Handover
  { phase: 'Handover', name: 'Snagging and defects', unit: 'day', labour: 240, materials: 50, plant: 0, sub: 0, waste: 0 },
  { phase: 'Handover', name: 'Final clean', unit: 'item', labour: 360, materials: 0, plant: 0, sub: 0, waste: 0 },
]

const DEFAULT_PRODUCTS = [
  { name: 'Ready mix concrete C25', category: 'Concrete & Masonry', unit: 'm3', cost: 95, supplier: '', waste: 8, markup: 15 },
  { name: 'Dense aggregate blocks 100mm', category: 'Concrete & Masonry', unit: 'item', cost: 2.20, supplier: '', waste: 5, markup: 15 },
  { name: 'Facing bricks (standard)', category: 'Concrete & Masonry', unit: 'item', cost: 0.45, supplier: '', waste: 10, markup: 15 },
  { name: 'Building sand (bulk bag)', category: 'Concrete & Masonry', unit: 'item', cost: 45, supplier: '', waste: 5, markup: 15 },
  { name: 'Cement (25kg bag)', category: 'Concrete & Masonry', unit: 'bag', cost: 7.50, supplier: '', waste: 5, markup: 15 },
  { name: 'PIR insulation 50mm', category: 'Insulation', unit: 'm2', cost: 8.50, supplier: '', waste: 5, markup: 20 },
  { name: 'PIR insulation 100mm', category: 'Insulation', unit: 'm2', cost: 16.00, supplier: '', waste: 5, markup: 20 },
  { name: 'Mineral wool batt 100mm', category: 'Insulation', unit: 'm2', cost: 4.80, supplier: '', waste: 5, markup: 15 },
  { name: 'Plasterboard 12.5mm', category: 'Plasterboard & Plaster', unit: 'm2', cost: 4.80, supplier: '', waste: 8, markup: 15 },
  { name: 'Plasterboard 15mm', category: 'Plasterboard & Plaster', unit: 'm2', cost: 6.20, supplier: '', waste: 8, markup: 15 },
  { name: 'Multi-finish plaster (25kg)', category: 'Plasterboard & Plaster', unit: 'bag', cost: 9.50, supplier: '', waste: 5, markup: 15 },
  { name: 'Timber C16 47x150mm', category: 'Timber & Sheet', unit: 'm', cost: 4.20, supplier: '', waste: 10, markup: 15 },
  { name: 'OSB3 18mm', category: 'Timber & Sheet', unit: 'm2', cost: 9.80, supplier: '', waste: 8, markup: 15 },
  { name: 'DPM membrane 1200g', category: 'Waterproofing & DPM', unit: 'm2', cost: 1.20, supplier: '', waste: 10, markup: 20 },
  { name: 'EPDM membrane 1.2mm', category: 'Roofing', unit: 'm2', cost: 28.00, supplier: '', waste: 10, markup: 20 },
  { name: 'Lead flashing code 4', category: 'Roofing', unit: 'm', cost: 18.50, supplier: '', waste: 10, markup: 20 },
  { name: 'Hardcore (bulk bag)', category: 'Concrete & Masonry', unit: 'item', cost: 55, supplier: '', waste: 5, markup: 10 },
  { name: 'Sand blinding (bulk bag)', category: 'Concrete & Masonry', unit: 'item', cost: 38, supplier: '', waste: 5, markup: 10 },
  { name: 'Wall ties (bag of 250)', category: 'Concrete & Masonry', unit: 'item', cost: 14, supplier: '', waste: 5, markup: 15 },
  { name: 'Screed (per m2 @ 65mm)', category: 'Concrete & Masonry', unit: 'm2', cost: 22, supplier: '', waste: 5, markup: 15 },
]

const DEFAULT_PLANT = [
  { name: 'Mini digger 1.5t', unit: 'day', cost: 280, markup: 20 },
  { name: 'Mini digger 3t', unit: 'day', cost: 380, markup: 20 },
  { name: 'Dumper 1t', unit: 'day', cost: 150, markup: 20 },
  { name: 'Mixer 130L', unit: 'day', cost: 55, markup: 20 },
  { name: 'Acrow props x4', unit: 'day', cost: 40, markup: 20 },
  { name: 'Scaffold (full kit)', unit: 'week', cost: 650, markup: 20 },
  { name: 'Tower scaffold', unit: 'week', cost: 130, markup: 20 },
  { name: 'Skip 6 yard', unit: 'item', cost: 280, markup: 15 },
  { name: 'Skip 8 yard', unit: 'item', cost: 320, markup: 15 },
  { name: 'Grab lorry hire', unit: 'item', cost: 350, markup: 15 },
  { name: 'Wacker plate', unit: 'day', cost: 65, markup: 20 },
  { name: 'Rotary laser level', unit: 'day', cost: 45, markup: 20 },
  { name: 'Concrete pump', unit: 'day', cost: 850, markup: 15 },
  { name: 'Telehandler', unit: 'day', cost: 420, markup: 20 },
]

const DEFAULT_LABOUR = [
  { name: 'Labourer', day_rate: 160, markup: 20 },
  { name: 'Builder', day_rate: 240, markup: 20 },
  { name: 'Carpenter', day_rate: 280, markup: 20 },
  { name: 'Bricklayer', day_rate: 280, markup: 20 },
  { name: 'Plasterer', day_rate: 260, markup: 20 },
  { name: 'Electrician', day_rate: 320, markup: 20 },
  { name: 'Plumber', day_rate: 320, markup: 20 },
  { name: 'Decorator', day_rate: 220, markup: 20 },
  { name: 'Roofer', day_rate: 280, markup: 20 },
  { name: 'Groundworker', day_rate: 260, markup: 20 },
  { name: 'Tiler', day_rate: 260, markup: 20 },
  { name: 'Kitchen fitter', day_rate: 280, markup: 20 },
  { name: 'Site manager', day_rate: 380, markup: 20 },
]

const DEFAULT_FORMULAS = [
  { name: 'Wall area', expression: 'length * height', variables: [{ name: 'length', label: 'Length (m)', defaultValue: 0 }, { name: 'height', label: 'Height (m)', defaultValue: 2.4 }], description: 'Calculate wall area from length × height' },
  { name: 'Floor area', expression: 'length * width', variables: [{ name: 'length', label: 'Length (m)', defaultValue: 0 }, { name: 'width', label: 'Width (m)', defaultValue: 0 }], description: 'Calculate floor area from length × width' },
  { name: 'Volume', expression: 'length * width * depth', variables: [{ name: 'length', label: 'Length (m)', defaultValue: 0 }, { name: 'width', label: 'Width (m)', defaultValue: 0 }, { name: 'depth', label: 'Depth (m)', defaultValue: 0 }], description: 'Calculate volume from length × width × depth' },
  { name: 'Labour days', expression: 'measured_qty / productivity_rate', variables: [{ name: 'measured_qty', label: 'Quantity', defaultValue: 0 }, { name: 'productivity_rate', label: 'Productivity (units/day)', defaultValue: 10 }], description: 'Labour days = quantity / productivity rate' },
  { name: 'Waste allowance', expression: 'base_qty * (1 + waste_pct / 100)', variables: [{ name: 'base_qty', label: 'Base quantity', defaultValue: 0 }, { name: 'waste_pct', label: 'Waste %', defaultValue: 10 }], description: 'Order quantity including waste allowance' },
  { name: 'Linear metres', expression: 'length', variables: [{ name: 'length', label: 'Length (m)', defaultValue: 0 }], description: 'Simple linear measurement' },
]

const DEFAULT_TAKEOFF_TOOLS = [
  {
    name: 'Foundation Tool',
    phaseName: 'Foundations',
    description: 'Measure and price foundations',
    subtypes: [
      { name: 'Strip foundation', description: 'Concrete strip along walls' },
      { name: 'Trench fill', description: 'Fully filled concrete trench' },
      { name: 'Pad foundation', description: 'Isolated concrete pads' },
      { name: 'Raft foundation', description: 'Reinforced slab across full footprint' },
      { name: 'Piled foundation', description: 'Driven or bored concrete piles' },
    ],
  },
  {
    name: 'External Wall Tool',
    phaseName: 'External Walls',
    description: 'Measure and price external walls',
    subtypes: [
      { name: 'Brick and block cavity wall', description: '102.5mm brick + 100mm block + 75mm cavity' },
      { name: 'Blockwork wall', description: '100mm or 140mm dense block' },
      { name: 'Timber frame wall', description: 'Structural timber frame with sheathing' },
      { name: 'Garden room wall build-up', description: 'Timber clad garden room construction' },
      { name: 'Rendered external wall', description: 'Block wall with external render finish' },
    ],
  },
  {
    name: 'Roof Tool',
    phaseName: 'Roofing',
    description: 'Measure and price roof structures and coverings',
    subtypes: [
      { name: 'Warm flat roof', description: 'Insulation above decking — preferred modern spec' },
      { name: 'Cold flat roof', description: 'Insulation between joists' },
      { name: 'Pitched roof', description: 'Traditional rafters or trussed rafter roof' },
      { name: 'Vaulted roof', description: 'Exposed structural roof — insulated rafters' },
    ],
  },
  {
    name: 'Floor Tool',
    phaseName: 'Oversite & Floors',
    description: 'Measure and price floor construction',
    subtypes: [
      { name: 'Concrete slab', description: 'RC slab on hardcore and insulation' },
      { name: 'Beam and block', description: 'Pre-stressed concrete beams with infill blocks' },
      { name: 'Timber floor', description: 'Suspended timber joists' },
      { name: 'Liquid screed', description: 'Pumped anhydrite or cementitious screed' },
      { name: 'UFH overlay screed', description: 'Screed incorporating underfloor heating pipes' },
    ],
  },
]

export async function seedBackOfficeDefaults(sb: SupabaseClient, userId: string): Promise<void> {
  const [
    { count: tradeCount },
    { count: phaseCount },
    { count: productCount },
    { count: plantCount },
    { count: formulaCount },
    { count: toolCount },
  ] = await Promise.all([
    sb.from('bo_labour_trades').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb.from('bo_phases').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb.from('bo_products').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb.from('bo_plant_items').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb.from('bo_formula_rules').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    sb.from('bo_takeoff_tools').select('*', { count: 'exact', head: true }).eq('user_id', userId),
  ])

  // Seed labour trades
  if (!tradeCount) {
    await sb.from('bo_labour_trades').insert(
      DEFAULT_LABOUR.map((t, i) => ({ user_id: userId, name: t.name, day_rate: t.day_rate, markup_pct: t.markup, display_order: i }))
    )
  }

  // Seed phases, sub-phases, tasks
  if (!phaseCount) {
    const phases = DEFAULT_PHASES.map((name, i) => ({ user_id: userId, name, display_order: i }))
    const { data: insertedPhases } = await sb.from('bo_phases').insert(phases).select()
    if (insertedPhases) {
      const phaseMap = Object.fromEntries(insertedPhases.map(p => [p.name, p.id]))

      // Sub-phases
      const subPhaseRows: Array<{ user_id: string; phase_id: string; name: string; display_order: number }> = []
      for (const [phaseName, subs] of Object.entries(DEFAULT_SUB_PHASES)) {
        const phaseId = phaseMap[phaseName]
        if (!phaseId) continue
        subs.forEach((name, i) => subPhaseRows.push({ user_id: userId, phase_id: phaseId, name, display_order: i }))
      }
      const { data: insertedSubPhases } = await sb.from('bo_sub_phases').insert(subPhaseRows).select()
      const subPhaseMap = Object.fromEntries((insertedSubPhases ?? []).map(sp => [`${sp.phase_id}:${sp.name}`, sp.id]))

      // Tasks
      const taskRows = DEFAULT_TASKS.map((t, i) => {
        const phaseId = phaseMap[t.phase] ?? null
        const subPhaseId = t.subPhase && phaseId ? (subPhaseMap[`${phaseId}:${t.subPhase}`] ?? null) : null
        return {
          user_id: userId,
          phase_id: phaseId,
          sub_phase_id: subPhaseId,
          name: t.name,
          unit: t.unit,
          labour_cost: t.labour,
          materials_cost: t.materials,
          plant_cost: t.plant,
          subcontract_cost: t.sub,
          waste_cost: t.waste,
          from_takeoff: true,
          from_ai: true,
          display_order: i,
        }
      })
      await sb.from('bo_tasks').insert(taskRows)
    }
  }

  // Seed products
  if (!productCount) {
    await sb.from('bo_products').insert(
      DEFAULT_PRODUCTS.map(p => ({
        user_id: userId, name: p.name, category: p.category, unit: p.unit,
        default_cost: p.cost, supplier: p.supplier, waste_pct: p.waste, markup_pct: p.markup,
      }))
    )
  }

  // Seed plant
  if (!plantCount) {
    await sb.from('bo_plant_items').insert(
      DEFAULT_PLANT.map((p, i) => ({ user_id: userId, name: p.name, unit: p.unit, default_cost: p.cost, markup_pct: p.markup, display_order: i }))
    )
  }

  // Seed formula rules
  if (!formulaCount) {
    await sb.from('bo_formula_rules').insert(
      DEFAULT_FORMULAS.map(f => ({ user_id: userId, ...f }))
    )
  }

  // Seed takeoff tools + subtypes
  if (!toolCount) {
    // Fetch phase IDs so we can link tools to their phase
    const { data: allPhases } = await sb.from('bo_phases').select('id, name').eq('user_id', userId)
    const phaseNameToId = Object.fromEntries((allPhases ?? []).map(p => [p.name, p.id]))

    for (let i = 0; i < DEFAULT_TAKEOFF_TOOLS.length; i++) {
      const tool = DEFAULT_TAKEOFF_TOOLS[i]
      const phaseId = phaseNameToId[tool.phaseName] ?? null
      const { data: inserted } = await sb.from('bo_takeoff_tools').insert({
        user_id: userId, name: tool.name, description: tool.description, display_order: i, phase_id: phaseId,
      }).select().single()
      if (inserted) {
        await sb.from('bo_takeoff_subtypes').insert(
          tool.subtypes.map((st, j) => ({ user_id: userId, tool_id: inserted.id, name: st.name, description: st.description, display_order: j }))
        )
      }
    }
  }
}

// ── Sync from Product Defaults ────────────────────────────────────────────────
//
// Called on every Back Office page load (not just first visit).
// Reads directly from the product lib files so that any code change to
// phases, sub-phases or tasks automatically propagates to the Back Office DB.
//
// Rules:
//   • New phase / sub-phase / task in code  → INSERT with default rates
//   • Existing item renamed in code          → UPDATE name only (preserve rates)
//   • Item removed from code                 → left in DB untouched (may be customer data)
//   • Customer-set rates / markup_pct        → NEVER overwritten
//
// Requires supabase/phase12.sql to have been run (adds canonical_id columns).

export async function syncBackOfficeFromProduct(sb: SupabaseClient, userId: string): Promise<void> {

  // ── 1. Phases ────────────────────────────────────────────────────────────────
  const { data: dbPhases } = await sb
    .from('bo_phases')
    .select('id, canonical_id, name, display_order')
    .eq('user_id', userId)

  const phaseByCanon = new Map(
    (dbPhases ?? []).filter(p => p.canonical_id).map(p => [p.canonical_id as string, p as { id: string; name: string; display_order: number }])
  )
  const phaseCanonToId = new Map<string, string>(
    (dbPhases ?? []).filter(p => p.canonical_id).map(p => [p.canonical_id as string, p.id as string])
  )

  const desiredPhases = (TAKEOFF_PHASES as readonly string[]).map((name, i) => ({
    canonical_id: CANONICAL_PHASE_IDS[name] ?? null,
    name,
    display_order: i,
  })).filter(p => p.canonical_id !== null) as Array<{ canonical_id: string; name: string; display_order: number }>

  // Insert new phases (batch)
  const newPhases = desiredPhases.filter(p => !phaseByCanon.has(p.canonical_id))
  if (newPhases.length > 0) {
    const { data: inserted } = await sb.from('bo_phases').insert(
      newPhases.map(p => ({ user_id: userId, canonical_id: p.canonical_id, name: p.name, display_order: p.display_order, active: true, job_types: [] }))
    ).select('id, canonical_id')
    ;(inserted ?? []).forEach(r => { if (r.canonical_id) phaseCanonToId.set(r.canonical_id as string, r.id as string) })
  }

  // Update phases whose name or order changed
  for (const p of desiredPhases.filter(p => phaseByCanon.has(p.canonical_id))) {
    const ex = phaseByCanon.get(p.canonical_id)!
    if (ex.name !== p.name || ex.display_order !== p.display_order) {
      await sb.from('bo_phases').update({ name: p.name, display_order: p.display_order }).eq('id', phaseCanonToId.get(p.canonical_id)!)
    }
  }

  // ── 2. Sub-Phases ────────────────────────────────────────────────────────────
  // Sources:
  //   • ALL_PHASE_SUBPHASES (phase-tasks.ts) — canonical_id = subphase.id
  //   • DEFAULT_DEMO_SUBPHASES (demolition-data.ts) — canonical_id = 'demo-' + subphase.id

  const { data: dbSubs } = await sb
    .from('bo_sub_phases')
    .select('id, canonical_id, name, display_order')
    .eq('user_id', userId)

  const subByCanon = new Map(
    (dbSubs ?? []).filter(s => s.canonical_id).map(s => [s.canonical_id as string, s as { id: string; name: string; display_order: number }])
  )
  const subCanonToId = new Map<string, string>(
    (dbSubs ?? []).filter(s => s.canonical_id).map(s => [s.canonical_id as string, s.id as string])
  )

  interface SubRow { canonical_id: string; phase_canonical: string; name: string; display_order: number; markup_pct: number }
  const desiredSubs: SubRow[] = []

  ALL_PHASE_SUBPHASES.forEach((sub, i) => {
    const pc = CANONICAL_PHASE_IDS[sub.phase]
    if (pc) desiredSubs.push({ canonical_id: sub.id, phase_canonical: pc, name: sub.name, display_order: i, markup_pct: sub.markupPct })
  })
  DEFAULT_DEMO_SUBPHASES.forEach((sub, i) => {
    const pc = CANONICAL_PHASE_IDS['Site Setup & Demolition']
    if (pc) desiredSubs.push({ canonical_id: `demo-${sub.id}`, phase_canonical: pc, name: sub.name, display_order: i, markup_pct: sub.markupPct })
  })

  // Insert new sub-phases (batch by phase to keep FK resolution simple)
  const newSubs = desiredSubs.filter(s => !subByCanon.has(s.canonical_id) && phaseCanonToId.has(s.phase_canonical))
  if (newSubs.length > 0) {
    const { data: inserted } = await sb.from('bo_sub_phases').insert(
      newSubs.map(s => ({
        user_id: userId,
        canonical_id: s.canonical_id,
        phase_id: phaseCanonToId.get(s.phase_canonical)!,
        name: s.name,
        display_order: s.display_order,
        markup_pct: s.markup_pct,
        active: true,
      }))
    ).select('id, canonical_id')
    ;(inserted ?? []).forEach(r => { if (r.canonical_id) subCanonToId.set(r.canonical_id as string, r.id as string) })
  }

  // Update sub-phases whose name or order changed (preserve markup_pct)
  for (const s of desiredSubs.filter(s => subByCanon.has(s.canonical_id))) {
    const ex = subByCanon.get(s.canonical_id)!
    if (ex.name !== s.name || ex.display_order !== s.display_order) {
      await sb.from('bo_sub_phases').update({ name: s.name, display_order: s.display_order }).eq('id', subCanonToId.get(s.canonical_id)!)
    }
  }

  // ── 3. Tasks ─────────────────────────────────────────────────────────────────
  // Sources:
  //   • PhaseSubphase.tasks (phase-tasks.ts)       — canonical_id = task.id
  //   • DemoSubphase.tasks  (demolition-data.ts)   — canonical_id = 'demo-' + task.id

  const { data: dbTasks } = await sb
    .from('bo_tasks')
    .select('id, canonical_id, name, unit')
    .eq('user_id', userId)

  const taskByCanon = new Map(
    (dbTasks ?? []).filter(t => t.canonical_id).map(t => [t.canonical_id as string, t as { id: string; name: string; unit: string }])
  )

  interface TaskRow {
    canonical_id:     string
    sub_canonical:    string
    phase_canonical:  string
    name:             string
    unit:             string
    display_order:    number
    description:      string
    labour_cost:      number
    materials_cost:   number
    plant_cost:       number
    subcontract_cost: number
    waste_cost:       number
    other_cost:       number
  }
  const desiredTasks: TaskRow[] = []

  ALL_PHASE_SUBPHASES.forEach(sub => {
    const pc = CANONICAL_PHASE_IDS[sub.phase]
    sub.tasks.forEach((task, i) => {
      desiredTasks.push({
        canonical_id:     task.id,
        sub_canonical:    sub.id,
        phase_canonical:  pc ?? '',
        name:             task.name,
        unit:             task.unit,
        display_order:    i,
        description:      task.notes ?? '',
        labour_cost:      task.labour,
        materials_cost:   task.materials,
        plant_cost:       task.plant,
        subcontract_cost: task.subcontractor,
        waste_cost:       0,
        other_cost:       task.other,
      })
    })
  })

  DEFAULT_DEMO_SUBPHASES.forEach(sub => {
    const pc = CANONICAL_PHASE_IDS['Site Setup & Demolition'] ?? ''
    sub.tasks.forEach((task, i) => {
      desiredTasks.push({
        canonical_id:     `demo-${task.id}`,
        sub_canonical:    `demo-${sub.id}`,
        phase_canonical:  pc,
        name:             task.name,
        unit:             task.unit,
        display_order:    i,
        description:      task.clientDescription,
        labour_cost:      task.labourCost,
        materials_cost:   task.materialCost,
        plant_cost:       task.plantCost,
        subcontract_cost: task.subcontractorCost,
        waste_cost:       task.wasteCost,
        other_cost:       task.otherCost,
      })
    })
  })

  // Insert new tasks (batch)
  const newTasks = desiredTasks.filter(t =>
    !taskByCanon.has(t.canonical_id) &&
    subCanonToId.has(t.sub_canonical)
  )
  if (newTasks.length > 0) {
    // Insert in chunks of 100 to stay within Supabase payload limits
    for (let i = 0; i < newTasks.length; i += 100) {
      await sb.from('bo_tasks').insert(
        newTasks.slice(i, i + 100).map(t => ({
          user_id:          userId,
          canonical_id:     t.canonical_id,
          phase_id:         phaseCanonToId.get(t.phase_canonical) ?? null,
          sub_phase_id:     subCanonToId.get(t.sub_canonical)!,
          name:             t.name,
          unit:             t.unit,
          description:      t.description,
          display_order:    t.display_order,
          labour_cost:      t.labour_cost,
          materials_cost:   t.materials_cost,
          plant_cost:       t.plant_cost,
          subcontract_cost: t.subcontract_cost,
          waste_cost:       t.waste_cost,
          other_cost:       t.other_cost,
          from_takeoff:     true,
          active:           true,
        }))
      )
    }
  }

  // Update tasks whose name or unit changed (preserve all cost fields)
  for (const t of desiredTasks.filter(t => taskByCanon.has(t.canonical_id))) {
    const ex = taskByCanon.get(t.canonical_id)!
    if (ex.name !== t.name || ex.unit !== t.unit) {
      await sb.from('bo_tasks')
        .update({ name: t.name, unit: t.unit, updated_at: new Date().toISOString() })
        .eq('id', ex.id)
    }
  }

  // ── 4. Wall Types ─────────────────────────────────────────────────────────────
  // Sync WALL_MAKEUPS from takeoff-types.ts → bo_wall_types + bo_wall_layers.
  // Rules: insert new types/layers; update names of existing ones; preserve nothing
  // (there are no customer-set rate fields on wall types — they're structural specs).

  const { data: dbWallTypes } = await sb
    .from('bo_wall_types')
    .select('id, canonical_id, name')
    .eq('user_id', userId)

  const wallTypeByCanon = new Map(
    (dbWallTypes ?? []).filter(w => w.canonical_id).map(w => [w.canonical_id as string, w as { id: string; name: string }])
  )

  for (let i = 0; i < WALL_MAKEUPS.length; i++) {
    const wm = WALL_MAKEUPS[i]
    const existing = wallTypeByCanon.get(wm.id)

    let wallTypeDbId: string

    if (existing) {
      // Update name if it changed
      if (existing.name !== wm.name) {
        await sb.from('bo_wall_types').update({
          name: wm.name,
          client_description: wm.clientDescription,
          labour_hrs_per_m2: wm.labourHrsPerM2,
          waste_percent: wm.wastePercent,
          display_order: i,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id)
      }
      wallTypeDbId = existing.id
    } else {
      // Insert new wall type
      const { data: inserted } = await sb.from('bo_wall_types').insert({
        user_id: userId,
        canonical_id: wm.id,
        name: wm.name,
        client_description: wm.clientDescription,
        labour_hrs_per_m2: wm.labourHrsPerM2,
        waste_percent: wm.wastePercent,
        display_order: i,
        active: true,
      }).select('id').single()
      if (!inserted?.id) continue
      wallTypeDbId = inserted.id
    }

    // Sync layers for this wall type
    const { data: dbLayers } = await sb
      .from('bo_wall_layers')
      .select('id, canonical_id, name')
      .eq('wall_type_id', wallTypeDbId)

    const layerByCanon = new Map(
      (dbLayers ?? []).filter(l => l.canonical_id).map(l => [l.canonical_id as string, l as { id: string; name: string }])
    )

    const newLayers = wm.layers.filter(l => !layerByCanon.has(l.id))
    if (newLayers.length > 0) {
      await sb.from('bo_wall_layers').insert(
        newLayers.map((l, j) => ({
          user_id:         userId,
          wall_type_id:    wallTypeDbId,
          canonical_id:    l.id,
          name:            l.name,
          thickness_mm:    l.thickness,
          unit:            l.unit,
          qty_type:        l.qtyType,
          spacing_mm:      l.spacing ?? null,
          description:     l.description,
          category:        l.category,
          default_enabled: l.defaultEnabled,
          display_order:   (dbLayers?.length ?? 0) + j,
        }))
      )
    }

    // Update layer names that changed
    for (const l of wm.layers.filter(l => layerByCanon.has(l.id))) {
      const exL = layerByCanon.get(l.id)!
      if (exL.name !== l.name) {
        await sb.from('bo_wall_layers').update({ name: l.name, description: l.description }).eq('id', exL.id)
      }
    }
  }
}
