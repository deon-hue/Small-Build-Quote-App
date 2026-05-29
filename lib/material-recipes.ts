/**
 * Material Recipe System — Measurement Properties Engine
 *
 * Defines construction types, finish types, and per-m² material recipes
 * for the takeoff tool. When the user draws a wall and enters a spec,
 * these recipes generate a calculated, editable materials breakdown that
 * can be reviewed before being exported to the quote.
 */

// ── Wall Construction Types ───────────────────────────────────────────────────

export type WallConstructionType =
  | 'block_100'      // Concrete block 100mm
  | 'block_140'      // Concrete block 140mm
  | 'brick_half'     // Half-brick 102.5mm
  | 'brick_full'     // Full-brick 215mm
  | 'stud_metal_70'  // Metal stud partition 70mm
  | 'stud_metal_100' // Metal stud partition 100mm
  | 'stud_timber'    // Timber stud partition 89mm C16
  | 'existing'       // Existing wall — make-good only
  | 'drylining'      // Drylining / battened wall (no new structure)

export const WALL_CONSTRUCTION_LABELS: Record<WallConstructionType, string> = {
  block_100:      'Concrete Block 100mm',
  block_140:      'Concrete Block 140mm',
  brick_half:     'Half-Brick Wall 102.5mm',
  brick_full:     'Full-Brick Wall 215mm',
  stud_metal_70:  'Metal Stud Partition 70mm',
  stud_metal_100: 'Metal Stud Partition 100mm',
  stud_timber:    'Timber Stud Partition 89mm',
  existing:       'Existing Wall (Make-Good)',
  drylining:      'Drylining / Battened Wall',
}

// ── Wall Finish Types ─────────────────────────────────────────────────────────

export type WallFinishType =
  | 'none'           // No finish
  | 'dot_dab'        // Dot & dab plasterboard + skim
  | 'board_skim'     // Board to stud + skim
  | 'hardwall_skim'  // Hardwall backing + skim
  | 'sand_cement'    // Sand & cement render + skim
  | 'skim_only'      // Skim coat to existing board/plaster
  | 'tile_ready'     // Board only — no skim, ready for tiles

export const WALL_FINISH_LABELS: Record<WallFinishType, string> = {
  none:          'No Finish',
  dot_dab:       'Dot & Dab Plasterboard + Skim',
  board_skim:    'Board & Skim (on stud/batten)',
  hardwall_skim: 'Hardwall Backing + Skim',
  sand_cement:   'Sand & Cement Render + Skim',
  skim_only:     'Skim Coat Only (to existing board)',
  tile_ready:    'Board Only — Tile Ready',
}

// ── Recipe Line — materials per m² ───────────────────────────────────────────

export interface RecipeLine {
  id:           string
  name:         string
  category:     'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'
  qtyPerM2:     number    // quantity per m² of measured area
  unit:         string    // 'hrs' | 'nr' | 'bag' | 'lm' | 'm²' | 'm³' | 'ltr' | 'roll' | 'box' | 'tin'
  wastePercent: number    // 0–25
  unitRate:     number    // £ per unit (UK 2024 indicative rates)
  notes?:       string
  optional?:    boolean   // disabled by default; user can enable
}

// ── Calculated Material — stored on TakeoffItem ───────────────────────────────

export interface CalculatedMaterial {
  id:           string
  name:         string
  category:     'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'
  baseQty:      number    // recipe qty × area (before waste)
  qty:          number    // total incl waste (user-overridable)
  unit:         string
  wastePercent: number
  unitRate:     number    // £ per unit
  totalCost:    number    // qty × unitRate
  isOverridden: boolean
  notes:        string
  optional:     boolean
  enabled:      boolean
}

// ── Construction Recipes (per m² of net wall area) ────────────────────────────

const BLOCK_100: RecipeLine[] = [
  { id: 'b100_labour',  name: 'Blockwork labour',         category: 'labour',    qtyPerM2: 0.75,  unit: 'hrs',  wastePercent: 0,  unitRate: 38.00, notes: 'Block up inc. mortar, levelling and cutting' },
  { id: 'b100_blocks',  name: 'Concrete blocks 100mm',    category: 'materials', qtyPerM2: 10.00, unit: 'nr',   wastePercent: 5,  unitRate: 0.90  },
  { id: 'b100_sand',    name: 'Mortar sand (25kg bag)',   category: 'materials', qtyPerM2: 0.45,  unit: 'bag',  wastePercent: 10, unitRate: 3.50  },
  { id: 'b100_cement',  name: 'Cement (25kg bag)',         category: 'materials', qtyPerM2: 0.12,  unit: 'bag',  wastePercent: 10, unitRate: 7.50  },
  { id: 'b100_ties',    name: 'Wall ties (stainless)',     category: 'materials', qtyPerM2: 2.00,  unit: 'nr',   wastePercent: 2,  unitRate: 0.18  },
  { id: 'b100_dpc',     name: 'DPC strip 112mm',          category: 'materials', qtyPerM2: 0.00,  unit: 'lm',   wastePercent: 5,  unitRate: 1.20, optional: true, notes: 'DPC at base — set qty = wall run in m if req.' },
]

const BLOCK_140: RecipeLine[] = [
  { id: 'b140_labour',  name: 'Blockwork labour',         category: 'labour',    qtyPerM2: 0.90,  unit: 'hrs',  wastePercent: 0,  unitRate: 38.00 },
  { id: 'b140_blocks',  name: 'Concrete blocks 140mm',    category: 'materials', qtyPerM2: 10.00, unit: 'nr',   wastePercent: 5,  unitRate: 1.20  },
  { id: 'b140_sand',    name: 'Mortar sand (25kg bag)',   category: 'materials', qtyPerM2: 0.55,  unit: 'bag',  wastePercent: 10, unitRate: 3.50  },
  { id: 'b140_cement',  name: 'Cement (25kg bag)',         category: 'materials', qtyPerM2: 0.15,  unit: 'bag',  wastePercent: 10, unitRate: 7.50  },
  { id: 'b140_ties',    name: 'Wall ties (stainless)',     category: 'materials', qtyPerM2: 2.00,  unit: 'nr',   wastePercent: 2,  unitRate: 0.18  },
]

const BRICK_HALF: RecipeLine[] = [
  { id: 'bh_labour',    name: 'Brickwork labour',         category: 'labour',    qtyPerM2: 1.20,  unit: 'hrs',  wastePercent: 0,  unitRate: 42.00, notes: 'Lay, cut, point' },
  { id: 'bh_bricks',    name: 'Facing bricks',            category: 'materials', qtyPerM2: 60.00, unit: 'nr',   wastePercent: 5,  unitRate: 0.38  },
  { id: 'bh_sand',      name: 'Mortar sand (25kg bag)',   category: 'materials', qtyPerM2: 0.55,  unit: 'bag',  wastePercent: 10, unitRate: 3.50  },
  { id: 'bh_cement',    name: 'Cement (25kg bag)',         category: 'materials', qtyPerM2: 0.15,  unit: 'bag',  wastePercent: 10, unitRate: 7.50  },
]

const BRICK_FULL: RecipeLine[] = [
  { id: 'bf_labour',    name: 'Brickwork labour',         category: 'labour',    qtyPerM2: 2.20,  unit: 'hrs',  wastePercent: 0,  unitRate: 42.00 },
  { id: 'bf_bricks',    name: 'Engineering / common bricks', category: 'materials', qtyPerM2: 120.00, unit: 'nr', wastePercent: 5, unitRate: 0.40 },
  { id: 'bf_sand',      name: 'Mortar sand (25kg bag)',   category: 'materials', qtyPerM2: 1.10,  unit: 'bag',  wastePercent: 10, unitRate: 3.50  },
  { id: 'bf_cement',    name: 'Cement (25kg bag)',         category: 'materials', qtyPerM2: 0.30,  unit: 'bag',  wastePercent: 10, unitRate: 7.50  },
]

const STUD_METAL_70: RecipeLine[] = [
  { id: 'sm70_labour',  name: 'Metal stud erection labour', category: 'labour',    qtyPerM2: 0.35, unit: 'hrs',  wastePercent: 0, unitRate: 38.00, notes: 'Erect track, studs and noggins' },
  { id: 'sm70_track',   name: 'Floor / ceiling track 48mm', category: 'materials', qtyPerM2: 0.85, unit: 'lm',   wastePercent: 5, unitRate: 3.50, notes: '600mm centres; approx 0.85 lm track per m² wall' },
  { id: 'sm70_studs',   name: 'Metal studs 70mm (2.4m)',    category: 'materials', qtyPerM2: 0.50, unit: 'nr',   wastePercent: 5, unitRate: 3.50  },
  { id: 'sm70_wool',    name: 'Acoustic mineral wool 50mm', category: 'materials', qtyPerM2: 1.05, unit: 'm²',   wastePercent: 5, unitRate: 3.50  },
  { id: 'sm70_fixings', name: 'Drywall screws & fixings',   category: 'materials', qtyPerM2: 0.05, unit: 'box',  wastePercent: 0, unitRate: 8.50  },
]

const STUD_METAL_100: RecipeLine[] = [
  { id: 'sm100_labour',  name: 'Metal stud erection labour', category: 'labour',    qtyPerM2: 0.40, unit: 'hrs',  wastePercent: 0, unitRate: 38.00 },
  { id: 'sm100_track',   name: 'Floor / ceiling track 70mm', category: 'materials', qtyPerM2: 0.85, unit: 'lm',   wastePercent: 5, unitRate: 4.50  },
  { id: 'sm100_studs',   name: 'Metal studs 100mm (2.4m)',   category: 'materials', qtyPerM2: 0.50, unit: 'nr',   wastePercent: 5, unitRate: 4.50  },
  { id: 'sm100_wool',    name: 'Acoustic mineral wool 75mm', category: 'materials', qtyPerM2: 1.05, unit: 'm²',   wastePercent: 5, unitRate: 4.50  },
  { id: 'sm100_fixings', name: 'Drywall screws & fixings',   category: 'materials', qtyPerM2: 0.05, unit: 'box',  wastePercent: 0, unitRate: 8.50  },
]

const STUD_TIMBER: RecipeLine[] = [
  { id: 'st_labour',    name: 'Timber stud erection labour', category: 'labour',    qtyPerM2: 0.45, unit: 'hrs',  wastePercent: 0, unitRate: 38.00, notes: 'Erect head/sole plate, studs and noggins' },
  { id: 'st_timber',    name: 'Timber C16 75×50 CLS',        category: 'materials', qtyPerM2: 1.50, unit: 'lm',   wastePercent: 8, unitRate: 2.50, notes: 'Studs, head/sole plate, noggins combined' },
  { id: 'st_wool',      name: 'Acoustic mineral wool 50mm',  category: 'materials', qtyPerM2: 1.05, unit: 'm²',   wastePercent: 5, unitRate: 3.50  },
  { id: 'st_fixings',   name: 'Timber screws & fixings',     category: 'materials', qtyPerM2: 0.04, unit: 'box',  wastePercent: 0, unitRate: 8.50  },
]

const EXISTING_WALL: RecipeLine[] = [
  { id: 'ex_labour',    name: 'Make-good / hack-off labour', category: 'labour',    qtyPerM2: 0.25, unit: 'hrs',  wastePercent: 0, unitRate: 38.00, notes: 'Hack off old plaster, fill voids, prepare surface' },
  { id: 'ex_filler',    name: 'Bonding + filler (25kg bag)', category: 'materials', qtyPerM2: 0.05, unit: 'bag',  wastePercent: 10, unitRate: 9.50  },
]

const DRYLINING: RecipeLine[] = [
  { id: 'dl_labour',    name: 'Drylining installation labour', category: 'labour',    qtyPerM2: 0.30, unit: 'hrs',  wastePercent: 0, unitRate: 38.00 },
  { id: 'dl_channels',  name: 'Furring channels (1.8m)',        category: 'materials', qtyPerM2: 1.70, unit: 'lm',   wastePercent: 5, unitRate: 2.80, notes: '450mm centres' },
  { id: 'dl_fixings',   name: 'Channel fixings & resilient clips', category: 'materials', qtyPerM2: 4.0, unit: 'nr', wastePercent: 5, unitRate: 0.25 },
  { id: 'dl_strip',     name: 'Acoustic isolation strip',       category: 'materials', qtyPerM2: 0.85, unit: 'lm',   wastePercent: 5, unitRate: 1.80  },
]

// ── Finish Recipes (per m² of FINISH area = net × sides) ─────────────────────

const DOT_DAB: RecipeLine[] = [
  { id: 'dd_labour',    name: 'Dot & dab + skim labour',      category: 'labour',    qtyPerM2: 0.35, unit: 'hrs',  wastePercent: 0,  unitRate: 38.00, notes: 'Fix board, tape, float and skim' },
  { id: 'dd_board',     name: 'Plasterboard 12.5mm (sheets)', category: 'materials', qtyPerM2: 0.38, unit: 'nr',   wastePercent: 15, unitRate: 8.50, notes: 'Gyproc Wallboard 2400×1200mm; 15% for cuts' },
  { id: 'dd_adhesive',  name: 'Dot & dab adhesive (25kg)',    category: 'materials', qtyPerM2: 0.22, unit: 'bag',  wastePercent: 5,  unitRate: 12.00, notes: 'Thistle Bond-It; 1 bag ≈ 4.5m²' },
  { id: 'dd_scrim',     name: 'Scrim tape (90mm × 90m roll)', category: 'materials', qtyPerM2: 0.05, unit: 'roll', wastePercent: 5,  unitRate: 4.00  },
  { id: 'dd_bead',      name: 'Angle bead (per lm of corner)', category: 'materials', qtyPerM2: 0.10, unit: 'lm',  wastePercent: 5,  unitRate: 2.80, optional: true, notes: 'Adjust qty to actual number of corners' },
  { id: 'dd_skim',      name: 'Skim plaster (25kg bag)',       category: 'materials', qtyPerM2: 0.09, unit: 'bag', wastePercent: 10, unitRate: 8.00, notes: 'Thistle MultiFinish; 1 bag ≈ 11m²' },
]

const BOARD_SKIM: RecipeLine[] = [
  { id: 'bs_labour',    name: 'Board & skim labour',           category: 'labour',    qtyPerM2: 0.45, unit: 'hrs',  wastePercent: 0,  unitRate: 38.00, notes: 'Fix board to studs, tape, float and skim' },
  { id: 'bs_board',     name: 'Plasterboard 12.5mm (sheets)', category: 'materials', qtyPerM2: 0.38, unit: 'nr',   wastePercent: 15, unitRate: 8.50  },
  { id: 'bs_screws',    name: 'Drywall screws (200/box)',       category: 'materials', qtyPerM2: 0.03, unit: 'box',  wastePercent: 5,  unitRate: 8.50  },
  { id: 'bs_scrim',     name: 'Scrim tape (90mm × 90m roll)', category: 'materials', qtyPerM2: 0.05, unit: 'roll', wastePercent: 5,  unitRate: 4.00  },
  { id: 'bs_bead',      name: 'Angle bead (per lm of corner)', category: 'materials', qtyPerM2: 0.10, unit: 'lm',  wastePercent: 5,  unitRate: 2.80, optional: true },
  { id: 'bs_skim',      name: 'Skim plaster (25kg bag)',       category: 'materials', qtyPerM2: 0.09, unit: 'bag', wastePercent: 10, unitRate: 8.00  },
]

const HARDWALL_SKIM: RecipeLine[] = [
  { id: 'hw_labour',    name: 'Hardwall + skim labour',        category: 'labour',    qtyPerM2: 0.55, unit: 'hrs',  wastePercent: 0,  unitRate: 38.00 },
  { id: 'hw_pva',       name: 'PVA bonding agent (5 ltr tin)', category: 'materials', qtyPerM2: 0.06, unit: 'tin',  wastePercent: 5,  unitRate: 12.00, notes: 'Diluted PVA to masonry; 1 tin ≈ 16m²' },
  { id: 'hw_hardwall',  name: 'Hardwall backing (12.5kg bag)', category: 'materials', qtyPerM2: 0.42, unit: 'bag',  wastePercent: 10, unitRate: 9.50, notes: 'Thistle Hardwall; 1 bag ≈ 3m² at 11mm' },
  { id: 'hw_skim',      name: 'Finish plaster (25kg bag)',     category: 'materials', qtyPerM2: 0.09, unit: 'bag',  wastePercent: 10, unitRate: 8.00  },
  { id: 'hw_bead',      name: 'Angle bead (per lm of corner)', category: 'materials', qtyPerM2: 0.10, unit: 'lm',  wastePercent: 5,  unitRate: 2.80, optional: true },
]

const SAND_CEMENT: RecipeLine[] = [
  { id: 'sc_labour',    name: 'Sand & cement render labour',  category: 'labour',    qtyPerM2: 0.60, unit: 'hrs',  wastePercent: 0,  unitRate: 38.00 },
  { id: 'sc_sand',      name: 'Sharp sand (25kg bag)',        category: 'materials', qtyPerM2: 0.60, unit: 'bag',  wastePercent: 10, unitRate: 3.50  },
  { id: 'sc_cement',    name: 'Cement (25kg bag)',             category: 'materials', qtyPerM2: 0.15, unit: 'bag',  wastePercent: 10, unitRate: 7.50  },
  { id: 'sc_skim',      name: 'Finish plaster (25kg bag)',    category: 'materials', qtyPerM2: 0.09, unit: 'bag',  wastePercent: 10, unitRate: 8.00  },
  { id: 'sc_bead',      name: 'Render bead / angle bead',    category: 'materials', qtyPerM2: 0.10, unit: 'lm',   wastePercent: 5,  unitRate: 2.80, optional: true },
]

const SKIM_ONLY: RecipeLine[] = [
  { id: 'sk_labour',    name: 'PVA + skim labour',            category: 'labour',    qtyPerM2: 0.25, unit: 'hrs',  wastePercent: 0,  unitRate: 38.00 },
  { id: 'sk_pva',       name: 'PVA bonding agent (5 ltr tin)', category: 'materials', qtyPerM2: 0.06, unit: 'tin', wastePercent: 5,  unitRate: 12.00 },
  { id: 'sk_skim',      name: 'Finish plaster (25kg bag)',    category: 'materials', qtyPerM2: 0.09, unit: 'bag',  wastePercent: 10, unitRate: 8.00  },
]

const TILE_READY: RecipeLine[] = [
  { id: 'tr_labour',    name: 'Board only labour',            category: 'labour',    qtyPerM2: 0.25, unit: 'hrs',  wastePercent: 0,  unitRate: 38.00 },
  { id: 'tr_board',     name: 'Tile backer board 12.5mm',    category: 'materials', qtyPerM2: 0.38, unit: 'nr',   wastePercent: 15, unitRate: 9.50  },
  { id: 'tr_screws',    name: 'Drywall screws (200/box)',     category: 'materials', qtyPerM2: 0.03, unit: 'box',  wastePercent: 5,  unitRate: 8.50  },
  { id: 'tr_scrim',     name: 'Waterproof scrim tape (roll)', category: 'materials', qtyPerM2: 0.05, unit: 'roll', wastePercent: 5,  unitRate: 5.50  },
]

const NO_FINISH: RecipeLine[] = []

// ── Recipe lookup helpers ─────────────────────────────────────────────────────

export function getConstructionRecipe(type: WallConstructionType): RecipeLine[] {
  switch (type) {
    case 'block_100':      return BLOCK_100
    case 'block_140':      return BLOCK_140
    case 'brick_half':     return BRICK_HALF
    case 'brick_full':     return BRICK_FULL
    case 'stud_metal_70':  return STUD_METAL_70
    case 'stud_metal_100': return STUD_METAL_100
    case 'stud_timber':    return STUD_TIMBER
    case 'existing':       return EXISTING_WALL
    case 'drylining':      return DRYLINING
  }
}

export function getFinishRecipe(type: WallFinishType): RecipeLine[] {
  switch (type) {
    case 'dot_dab':        return DOT_DAB
    case 'board_skim':     return BOARD_SKIM
    case 'hardwall_skim':  return HARDWALL_SKIM
    case 'sand_cement':    return SAND_CEMENT
    case 'skim_only':      return SKIM_ONLY
    case 'tile_ready':     return TILE_READY
    case 'none':           return NO_FINISH
  }
}

// ── Core calculation ──────────────────────────────────────────────────────────

/** Convert a recipe line + measured area into a CalculatedMaterial row */
function lineToCalculated(line: RecipeLine, area: number): CalculatedMaterial {
  const baseQty  = +(line.qtyPerM2 * area).toFixed(3)
  const qty      = +(baseQty * (1 + line.wastePercent / 100)).toFixed(3)
  return {
    id:           line.id,
    name:         line.name,
    category:     line.category,
    baseQty,
    qty,
    unit:         line.unit,
    wastePercent: line.wastePercent,
    unitRate:     line.unitRate,
    totalCost:    +(qty * line.unitRate).toFixed(2),
    isOverridden: false,
    notes:        line.notes ?? '',
    optional:     line.optional ?? false,
    enabled:      !(line.optional ?? false) || (line.qtyPerM2 > 0),
  }
}

/**
 * Calculate material lines from a wall spec.
 * Construction recipe is applied to netArea.
 * Finish recipe is applied to finishArea (netArea × sides).
 * User overrides from a previous calculation are preserved where IDs match.
 */
export function calcMaterialLines(
  constructionType: WallConstructionType,
  finishType:       WallFinishType,
  finishSides:      1 | 2,
  netArea:          number,
  previousMaterials?: CalculatedMaterial[],
): CalculatedMaterial[] {
  const finishArea  = +(netArea * finishSides).toFixed(3)
  const constLines  = getConstructionRecipe(constructionType)
  const finishLines = getFinishRecipe(finishType)

  const fresh = [
    ...constLines.map(l => lineToCalculated(l, netArea)),
    ...finishLines.map(l => lineToCalculated(l, finishArea)),
  ]

  // Preserve user overrides: if same line ID was manually changed, keep their qty/rate
  if (previousMaterials?.length) {
    const overrideMap = new Map(
      previousMaterials.filter(m => m.isOverridden).map(m => [m.id, m])
    )
    return fresh.map(m => {
      const override = overrideMap.get(m.id)
      if (!override) return m
      return {
        ...m,
        qty:          override.qty,
        unitRate:     override.unitRate,
        wastePercent: override.wastePercent,
        totalCost:    +(override.qty * override.unitRate).toFixed(2),
        isOverridden: true,
        enabled:      override.enabled,
      }
    })
  }

  return fresh
}

// ── Material update helper ────────────────────────────────────────────────────

export function recalcMaterial(
  mat:   CalculatedMaterial,
  patch: Partial<{ qty: number; unitRate: number; wastePercent: number; enabled: boolean; notes: string }>,
): CalculatedMaterial {
  const updated: CalculatedMaterial = { ...mat, ...patch }
  if (patch.qty != null || patch.unitRate != null) {
    updated.isOverridden = true
  }
  if (patch.wastePercent != null && !mat.isOverridden) {
    // Re-derive qty from baseQty with new waste
    updated.qty = +(mat.baseQty * (1 + updated.wastePercent / 100)).toFixed(3)
  }
  updated.totalCost = +(updated.qty * updated.unitRate).toFixed(2)
  return updated
}

// ── Totals ────────────────────────────────────────────────────────────────────

export interface MaterialCostTotals {
  labour:         number
  materials:      number
  plant:          number
  subcontractors: number
  other:          number
  total:          number
}

export function sumByCategory(materials: CalculatedMaterial[]): MaterialCostTotals {
  const active = materials.filter(m => m.enabled)
  const s = (cat: string) => +active.filter(m => m.category === cat).reduce((sum, m) => sum + m.totalCost, 0).toFixed(2)
  const labour = s('labour'), mats = s('materials'), plant = s('plant'), sub = s('subcontractors'), other = s('other')
  return {
    labour,
    materials:      mats,
    plant,
    subcontractors: sub,
    other,
    total: +(labour + mats + plant + sub + other).toFixed(2),
  }
}

// ── Custom recipe persistence (localStorage) ──────────────────────────────────

const CUSTOM_RECIPES_KEY = 'sbc_custom_material_recipes'

export function saveCustomRecipeLines(recipeId: string, lines: RecipeLine[]): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(CUSTOM_RECIPES_KEY)
    const all: Record<string, RecipeLine[]> = raw ? JSON.parse(raw) : {}
    all[recipeId] = lines
    localStorage.setItem(CUSTOM_RECIPES_KEY, JSON.stringify(all))
  } catch {}
}

export function loadCustomRecipeLines(recipeId: string): RecipeLine[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CUSTOM_RECIPES_KEY)
    if (!raw) return null
    const all: Record<string, RecipeLine[]> = JSON.parse(raw)
    return all[recipeId] ?? null
  } catch { return null }
}
