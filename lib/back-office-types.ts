// Back Office Master Database — TypeScript interfaces
// These mirror the bo_* Supabase tables exactly.

export interface BOLabourTrade {
  id: string
  user_id: string
  name: string
  day_rate: number
  half_day_rate_override: number | null
  markup_pct: number
  active: boolean
  display_order: number
  created_at?: string
  updated_at?: string
}

export interface BOPhase {
  id: string
  user_id: string
  name: string
  display_order: number
  active: boolean
  job_types: string[]
  created_at?: string
}

export interface BOSubPhase {
  id: string
  user_id: string
  phase_id: string
  name: string
  display_order: number
  markup_pct: number
  active: boolean
  created_at?: string
}

export interface BOTask {
  id: string
  user_id: string
  phase_id: string | null
  sub_phase_id: string | null
  name: string
  description: string
  client_description: string
  unit: string
  default_qty: number
  labour_cost: number
  materials_cost: number
  plant_cost: number
  subcontract_cost: number
  waste_cost: number
  other_cost: number
  markup_pct: number
  trade_name: string | null
  productivity_rate: number | null
  active: boolean
  from_takeoff: boolean
  from_ai: boolean
  display_order: number
  created_at?: string
  updated_at?: string
  // phase15: 5-category cost recipe (LayerCostRecord JSON)
  recipe_items?: Record<string, unknown> | null
}

export interface BOProduct {
  id: string
  user_id: string
  name: string
  category: string
  unit: string
  default_cost: number
  supplier: string
  waste_pct: number
  markup_pct: number
  phase_id: string | null
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface BOPlantItem {
  id: string
  user_id: string
  name: string
  unit: string
  default_cost: number
  markup_pct: number
  phase_id: string | null
  active: boolean
  display_order: number
  created_at?: string
  updated_at?: string
}

export interface BOTakeoffTool {
  id: string
  user_id: string
  name: string
  phase_id: string | null
  description: string
  active: boolean
  display_order: number
  created_at?: string
}

export interface BOTakeoffSubtype {
  id: string
  user_id: string
  tool_id: string
  name: string
  description: string
  active: boolean
  display_order: number
  created_at?: string
}

export interface BOToolTaskMapping {
  id: string
  user_id: string
  subtype_id: string
  task_id: string
  quantity_formula: string
  waste_pct: number
  markup_pct: number
  active: boolean
  display_order: number
  created_at?: string
  // Joined fields (not in DB)
  task?: BOTask
}

export interface BOFormulaRule {
  id: string
  user_id: string
  name: string
  expression: string
  variables: FormulaVariable[]
  description: string
  active: boolean
  created_at?: string
  updated_at?: string
}

export interface FormulaVariable {
  name: string
  label: string
  defaultValue: number
}

export interface BOAIScopeMapping {
  id: string
  user_id: string
  keyword: string
  phase_id: string
  sub_phase_id: string | null
  task_id: string | null
  weight: number
  active: boolean
  created_at?: string
  // Joined
  phase?: BOPhase
  sub_phase?: BOSubPhase
  task?: BOTask
}

// ── Wall Types (bo_wall_types + bo_wall_layers) ───────────────────────────────

export interface BOWallType {
  id:                 string
  user_id:            string
  canonical_id:       string | null   // original string key for built-ins (e.g. 'cav_wall_partial')
  name:               string
  client_description: string
  labour_hrs_per_m2:  number
  waste_percent:      number
  display_order:      number
  active:             boolean
  created_at?:        string
  updated_at?:        string
  // Joined — populated by fetchWallTypesWithLayers
  layers?:            BOWallLayer[]
}

export interface BOWallLayer {
  id:              string
  user_id:         string
  wall_type_id:    string
  canonical_id:    string | null      // original string key for built-in layers
  name:            string
  thickness_mm:    number
  unit:            string             // 'm²' | 'lm' | 'm³' | 'nr'
  qty_type:        string             // LayerQtyType
  spacing_mm:      number | null
  description:     string
  category:        string             // 'labour' | 'materials' | 'plant' | 'other'
  default_enabled: boolean
  display_order:   number
  created_at?:     string
}

export const WALL_LAYER_CATEGORIES = [
  { value: 'labour',    label: 'Labour' },
  { value: 'materials', label: 'Materials' },
  { value: 'plant',     label: 'Plant' },
  { value: 'other',     label: 'Other' },
] as const

export const WALL_LAYER_QTY_TYPES = [
  { value: 'area',      label: 'Area (m²)' },
  { value: 'volume',    label: 'Volume (m³)' },
  { value: 'perimeter', label: 'Perimeter (lm)' },
  { value: 'count',     label: 'Count (nr)' },
] as const

export const WALL_LAYER_UNITS = ['m²', 'lm', 'm³', 'nr'] as const

// ── Seed data types ──────────────────────────────────────────────────────────

export const TASK_UNITS = [
  { value: 'item', label: 'Item' },
  { value: 'm2', label: 'm²' },
  { value: 'm3', label: 'm³' },
  { value: 'm', label: 'm (linear)' },
  { value: 'day', label: 'Day' },
  { value: 'hr', label: 'Hour' },
  { value: 'nr', label: 'Nr' },
  { value: 'tonne', label: 'Tonne' },
  { value: 'bag', label: 'Bag' },
  { value: 'week', label: 'Week' },
] as const

export const PRODUCT_CATEGORIES = [
  'Concrete & Masonry',
  'Timber & Sheet',
  'Insulation',
  'Waterproofing & DPM',
  'Plasterboard & Plaster',
  'Roofing',
  'Windows & Doors',
  'Drainage',
  'Fixings & Adhesives',
  'Waste Disposal',
  'General',
] as const

export const PLANT_UNITS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'item', label: 'Item (one-off)' },
  { value: 'hr', label: 'Hour' },
] as const
