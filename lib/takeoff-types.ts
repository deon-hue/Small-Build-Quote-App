/**
 * Types and constants for the Construction Take-off Tool.
 */

import type { WallConstructionType, WallFinishType, CalculatedMaterial } from './material-recipes'

// ── Drawing tools ─────────────────────────────────────────────────────────────

export type DrawingTool = 'select' | 'line' | 'rect' | 'polygon' | 'floor'

// ── Measurement categories (match quote parentPhase names) ────────────────────

export const TAKEOFF_PHASES = [
  'Site Setup & Demolition',
  'Foundations',
  'Structural Frame',
  'External Walls',
  'Roof',
  'Windows & Doors',
  'Internal Walls & Partitions',
  'Floors & Screeds',
  'Drainage & Services',
  'Electrics',
  'Plumbing & Heating',
  'Plastering & Boarding',
  'Joinery & Fixtures',
  'Tiling & Finishes',
  'Decoration',
  'External Works & Landscaping',
  'Preliminaries',
  'Other',
] as const

export type TakeoffPhase = typeof TAKEOFF_PHASES[number]

export const PHASE_COLORS: Record<TakeoffPhase, string> = {
  'Site Setup & Demolition':     '#e74c3c',
  'Foundations':                  '#8e44ad',
  'Structural Frame':             '#2980b9',
  'External Walls':               '#16a085',
  'Roof':                         '#d35400',
  'Windows & Doors':              '#27ae60',
  'Internal Walls & Partitions':  '#2c3e50',
  'Floors & Screeds':             '#f39c12',
  'Drainage & Services':          '#7f8c8d',
  'Electrics':                    '#f1c40f',
  'Plumbing & Heating':           '#1abc9c',
  'Plastering & Boarding':        '#95a5a6',
  'Joinery & Fixtures':           '#6d4c41',
  'Tiling & Finishes':            '#ad1457',
  'Decoration':                   '#4a148c',
  'External Works & Landscaping': '#558b2f',
  'Preliminaries':                '#0277bd',
  'Other':                        '#546e7a',
}

/**
 * Maps take-off phases → quote parentPhase names.
 * Used when importing take-off items into the New Quote page.
 */
export const PHASE_TO_QUOTE_PARENT: Record<TakeoffPhase, string> = {
  'Site Setup & Demolition':     'Phase 1 – Site Setup & Demolition',
  'Foundations':                  'Phase 2 – Foundations & Groundworks',
  'Structural Frame':             'Phase 3 – Structural Shell',
  'External Walls':               'Phase 3 – Structural Shell',
  'Roof':                         'Phase 4 – Roof & Weathertight',
  'Windows & Doors':              'Phase 5 – Windows & Doors',
  'Internal Walls & Partitions':  'Phase 6 – First Fix',
  'Floors & Screeds':             'Phase 6 – First Fix',
  'Drainage & Services':          'Phase 6 – First Fix',
  'Electrics':                    'Phase 6 – First Fix',
  'Plumbing & Heating':           'Phase 7 – Mechanical & Electrical',
  'Plastering & Boarding':        'Phase 8 – Second Fix & Finishes',
  'Joinery & Fixtures':           'Phase 8 – Second Fix & Finishes',
  'Tiling & Finishes':            'Phase 8 – Second Fix & Finishes',
  'Decoration':                   'Phase 9 – Decoration',
  'External Works & Landscaping': 'Phase 10 – External Works',
  'Preliminaries':                'Phase 1 – Site Setup & Demolition',
  'Other':                        'Phase 10 – External Works',
}

// ── Drawn element geometry ────────────────────────────────────────────────────

export interface TakeoffPoint { x: number; y: number }

/** A single element drawn on the canvas */
export interface DrawnElement {
  id:          string
  type:        'line' | 'rect' | 'polygon'
  points:      TakeoffPoint[]   // SVG coords (pixels)
  phase:       TakeoffPhase
  label:       string           // e.g. "South Wall"
  color:       string           // hex
  // computed measurements (metres, set after drawing)
  length?:     number   // metres
  width?:      number   // metres
  height?:     number   // metres
  area?:       number   // m²
  volume?:     number   // m³
  qty?:        number   // count
  unit?:       string   // 'm', 'm²', 'm³', 'nr', 'item'
}

// ── Wall openings ─────────────────────────────────────────────────────────────

export type WallOpeningType = 'window' | 'door' | 'bifold' | 'french_door' | 'garage_door' | 'other'

export const WALL_OPENING_LABELS: Record<WallOpeningType, string> = {
  window:      'Window',
  door:        'Door',
  bifold:      'Bifold Door',
  french_door: 'French Doors',
  garage_door: 'Garage Door',
  other:       'Other Opening',
}

/** Default width × height (metres) for quick-add */
export const WALL_OPENING_DEFAULTS: Record<WallOpeningType, { width: number; height: number }> = {
  window:      { width: 0.9,  height: 1.0  },
  door:        { width: 0.9,  height: 2.1  },
  bifold:      { width: 2.4,  height: 2.1  },
  french_door: { width: 1.5,  height: 2.1  },
  garage_door: { width: 2.4,  height: 2.1  },
  other:       { width: 1.0,  height: 1.0  },
}

/** An opening (window, door etc.) cut from a wall and deducted from gross area */
export interface WallOpening {
  id:     string
  type:   WallOpeningType
  label:  string
  width:  number   // metres
  height: number   // metres
}

// ── Take-off line item (attached to a drawn element or manually added) ─────────

export interface TakeoffItem {
  id:          string
  elementId?:  string           // linked drawn element (optional for manual items)
  name:        string
  phase:       TakeoffPhase
  subPhase?:   string           // sub-category (optional)
  spec?:       string           // specification / product description
  drawingRef?: string           // drawing reference e.g. "SK-01"
  buildingRegsNotes?: string

  // Dimensions (extracted from drawing)
  length?:     number   // m
  width?:      number   // m
  height?:     number   // m
  area?:       number   // m²  (gross wall area for wall items; floor area for floor items)
  volume?:     number   // m³
  qty:         number   // net area for wall items (gross minus openings)
  unit:        string   // 'm', 'm²', 'm³', 'nr', 'item', 'bag', etc.

  notes?: string

  // Build-up (floors, walls, foundations, plastering)
  floorMakeupId?:        string                      // references any FloorMakeup[].id
  perimeter?:            number                      // m, calculated from drawn geometry
  floorLayerToggles?:    Record<string, boolean>     // layerId → enabled override
  floorLayerThicknesses?: Record<string, number>     // layerId → thickness override (mm)

  // Wall-specific
  wallHeight?:   number           // metres — storey height for LINE-drawn walls
  openings?:     WallOpening[]    // deducted openings (windows, doors, bifolds, etc.)
  wallBandPx?:   number           // half-width of wall band on canvas in pixels (default 9)

  // Plastering-specific
  plasterFinishSides?: 1 | 2      // 1 = one face, 2 = both faces (boarding/skimming multiplier)

  // Wall Measurement Engine (Internal Walls & Partitions)
  wallConstructionType?: WallConstructionType  // block, stud, brick, drylining, existing
  wallFinishType?:       WallFinishType         // dot-dab, board-skim, hardwall, sand-cement, etc.
  finishSides?:          1 | 2                  // finish both faces (2 = full stud partition)
  calculatedMaterials?:  CalculatedMaterial[]  // per-m² recipe, editable before quote export
  materialsConfirmed?:   boolean               // user reviewed & confirmed → enabled for export

  // Demolition-specific
  demoSubphaseId?:     string     // e.g. 'structural'
  demoTaskId?:         string     // e.g. 'structural-masonry'
  demoMarkupPct?:      number     // override subphase markup (default from subphase)
  demoLabour?:         number     // total costs for this item (qty × unit rate)
  demoMaterials?:      number
  demoPlant?:          number
  demoWaste?:          number
  demoSubcontractor?:  number
  demoOther?:          number

  // Generic phase task fields (Plastering, Roof, Electrics, Plumbing, etc.)
  taskSubphaseId?:     string     // PhaseSubphase.id
  taskId?:             string     // PhaseTask.id
  taskMarkupPct?:      number     // override subphase default markup
  taskLabour?:         number     // total labour cost (qty × unit rate)
  taskMaterials?:      number     // total materials cost
  taskPlant?:          number     // total plant cost
  taskSubcontractor?:  number     // total subcontractor cost
  taskOther?:          number     // total other cost
}

// ── Calibration ───────────────────────────────────────────────────────────────

export interface ScaleCalibration {
  /** meters per pixel */
  mpp: number
  /** human-readable description e.g. "1 : 100 (A3 print)" */
  label?: string
}

export const SCALE_PRESETS: { label: string; mpp: number }[] = [
  { label: '1:50  (A3)',   mpp: 0.05  / 50   },    // 1px ≈ 0.05m at 50dpi — approximate
  { label: '1:100 (A3)',   mpp: 0.10  / 50   },
  { label: '1:50  (A1)',   mpp: 0.05  / 96   },    // 1:50 on A1 at 96dpi
  { label: '1:100 (A1)',   mpp: 0.10  / 96   },
  { label: '1:200 (A1)',   mpp: 0.20  / 96   },
  { label: 'Custom…',      mpp: 0             },
]

// Better defaults: use sensible mpp values
// A3 at 96dpi ≈ 313×442px. 1:100 means 1mm on paper = 100mm real.
// At 96dpi, 1px = 0.265mm. At 1:100 scale: 1px = 26.5mm = 0.0265m
export const DEFAULT_MPP = 0.0265  // 1:100 scale, A3, 96dpi

// ── Top-level project state (persisted to localStorage) ──────────────────────

export interface TakeoffProject {
  id:           string
  name:         string
  address:      string
  jobType:      string
  planImageUrl?: string  // data: URI or object URL
  calibration:  ScaleCalibration
  elements:     DrawnElement[]
  items:        TakeoffItem[]
  createdAt:    string
  updatedAt:    string
}

// ── Export format ─────────────────────────────────────────────────────────────

export interface TakeoffExport {
  version:  1
  project:  Omit<TakeoffProject, 'planImageUrl'>  // exclude blob
  items:    TakeoffItem[]
  elements: DrawnElement[]
}

// ── Floor build-up types ──────────────────────────────────────────────────────

/** How a floor layer's quantity is derived from drawn geometry */
export type LayerQtyType =
  | 'area'       // qty = floor area (m²)
  | 'volume'     // qty = area × thickness ÷ 1000 (m³)
  | 'perimeter'  // qty = perimeter (lm)
  | 'ufh_pipe'   // qty = area ÷ (spacing mm ÷ 1000) × 1.15 overage (lm)
  | 'count'      // qty = 1 (nr) — e.g. manifold

/** A single layer within a floor build-up */
export interface FloorLayer {
  id:             string
  name:           string
  thickness:      number          // mm; 0 for area/perimeter/count items
  unit:           string          // display: 'm²' | 'm³' | 'lm' | 'nr'
  qtyType:        LayerQtyType
  spacing?:       number          // mm pipe/joist spacing — used by ufh_pipe
  description:    string          // estimator note / product description
  category:       'labour' | 'materials' | 'plant' | 'other'
  defaultEnabled: boolean
}

/** A complete UK floor build-up specification */
export interface FloorMakeup {
  id:                string
  name:              string
  clientDescription: string       // client-facing line for the quote
  layers:            FloorLayer[]
  labourHrsPerM2:    number       // indicative hours/m² for labour pricing
  wastePercent:      number       // % waste to add to material quantities
}

/** UK-standard domestic floor build-up types */
export const FLOOR_MAKEUPS: FloorMakeup[] = [
  {
    id: 'block_beam',
    name: 'Block and Beam Floor',
    clientDescription:
      'Supply and install block and beam suspended floor including compacted hardcore sub-base, sand blinding, DPM, PIR insulation and sand:cement screed finish, ready to receive final floor covering.',
    labourHrsPerM2: 2.8,
    wastePercent: 10,
    layers: [
      { id: 'hardcore',    name: 'Hardcore sub-base',        thickness: 200, unit: 'm³', qtyType: 'volume',   description: 'Compacted MOT Type 1 hardcore',                         category: 'materials', defaultEnabled: true  },
      { id: 'sand_blind',  name: 'Sand blinding',            thickness: 50,  unit: 'm²', qtyType: 'area',     description: 'Sand blinding layer to hardcore',                        category: 'materials', defaultEnabled: true  },
      { id: 'dpm',         name: 'DPC / DPM',                thickness: 0,   unit: 'm²', qtyType: 'area',     description: '1200g polythene DPM',                                    category: 'materials', defaultEnabled: true  },
      { id: 'beam_block',  name: 'Beam and block structure', thickness: 225, unit: 'm²', qtyType: 'area',     description: 'Pre-stressed T-beams with dense concrete block infill',   category: 'materials', defaultEnabled: true  },
      { id: 'insulation',  name: 'PIR insulation',           thickness: 100, unit: 'm²', qtyType: 'area',     description: '100mm rigid PIR boards (Part L compliant)',               category: 'materials', defaultEnabled: true  },
      { id: 'screed',      name: 'Sand:cement screed',       thickness: 65,  unit: 'm²', qtyType: 'area',     description: '65mm sand:cement floor screed',                           category: 'materials', defaultEnabled: true  },
      { id: 'floor_finish',name: 'Floor finish allowance',   thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'PC sum — client to specify floor finish',                 category: 'other',     defaultEnabled: true  },
    ],
  },
  {
    id: 'concrete_slab',
    name: 'Concrete Slab Floor',
    clientDescription:
      'Supply and install reinforced concrete ground floor slab including sub-base preparation, DPM, PIR insulation and screed finish, ready to receive final floor covering.',
    labourHrsPerM2: 3.2,
    wastePercent: 10,
    layers: [
      { id: 'hardcore',    name: 'Hardcore sub-base',        thickness: 150, unit: 'm³', qtyType: 'volume',   description: 'Compacted MOT Type 1 hardcore',                         category: 'materials', defaultEnabled: true  },
      { id: 'sand_blind',  name: 'Sand blinding',            thickness: 50,  unit: 'm²', qtyType: 'area',     description: 'Sand blinding layer',                                    category: 'materials', defaultEnabled: true  },
      { id: 'dpm',         name: 'DPC / DPM',                thickness: 0,   unit: 'm²', qtyType: 'area',     description: '1200g polythene DPM',                                    category: 'materials', defaultEnabled: true  },
      { id: 'insulation',  name: 'PIR insulation',           thickness: 100, unit: 'm²', qtyType: 'area',     description: '100mm rigid PIR boards (Part L compliant)',               category: 'materials', defaultEnabled: true  },
      { id: 'concrete',    name: 'Concrete slab',            thickness: 150, unit: 'm³', qtyType: 'volume',   description: 'C25/30 reinforced concrete slab with A142 mesh',          category: 'materials', defaultEnabled: true  },
      { id: 'screed',      name: 'Sand:cement screed',       thickness: 65,  unit: 'm²', qtyType: 'area',     description: '65mm sand:cement floor screed',                           category: 'materials', defaultEnabled: true  },
      { id: 'floor_finish',name: 'Floor finish allowance',   thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'PC sum — client to specify floor finish',                 category: 'other',     defaultEnabled: true  },
    ],
  },
  {
    id: 'suspended_timber',
    name: 'Suspended Timber Floor',
    clientDescription:
      'Supply and install suspended timber floor including sleeper walls, DPC, C16 timber joists, mineral wool insulation, vapour control layer and T&G chipboard decking, ready to receive final floor covering.',
    labourHrsPerM2: 3.5,
    wastePercent: 12,
    layers: [
      { id: 'sleeper_walls',name: 'Honeycomb sleeper walls', thickness: 0,   unit: 'lm', qtyType: 'perimeter',description: 'Half-brick honeycomb sleeper walls at DPC level',          category: 'materials', defaultEnabled: true  },
      { id: 'dpc',          name: 'DPC to sleeper walls',    thickness: 0,   unit: 'lm', qtyType: 'perimeter',description: 'DPC strip to all sleeper walls',                          category: 'materials', defaultEnabled: true  },
      { id: 'joists',       name: 'Timber floor joists',     thickness: 200, unit: 'm²', qtyType: 'area',     description: '50×200 C16 joists at 400mm centres',                     category: 'materials', defaultEnabled: true  },
      { id: 'insulation',   name: 'Mineral wool insulation', thickness: 200, unit: 'm²', qtyType: 'area',     description: '200mm mineral wool between joists (Part L)',              category: 'materials', defaultEnabled: true  },
      { id: 'vcl',          name: 'Vapour control layer',    thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'Polythene VCL over joists',                               category: 'materials', defaultEnabled: true  },
      { id: 'chipboard',    name: 'T&G chipboard deck',      thickness: 22,  unit: 'm²', qtyType: 'area',     description: '22mm T&G moisture-resistant P5 chipboard',                category: 'materials', defaultEnabled: true  },
      { id: 'floor_finish', name: 'Floor finish allowance',  thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'PC sum — client to specify floor finish',                 category: 'other',     defaultEnabled: true  },
    ],
  },
  {
    id: 'insulated_concrete',
    name: 'Insulated Concrete Floor',
    clientDescription:
      'Supply and install insulated concrete floor slab including sub-base preparation, DPM, high-performance PIR insulation and screed finish, ready to receive final floor covering.',
    labourHrsPerM2: 3.5,
    wastePercent: 10,
    layers: [
      { id: 'hardcore',    name: 'Hardcore sub-base',        thickness: 150, unit: 'm³', qtyType: 'volume',   description: 'Compacted MOT Type 1 hardcore',                         category: 'materials', defaultEnabled: true  },
      { id: 'sand_blind',  name: 'Sand blinding',            thickness: 50,  unit: 'm²', qtyType: 'area',     description: 'Sand blinding layer',                                    category: 'materials', defaultEnabled: true  },
      { id: 'dpm',         name: 'DPC / DPM',                thickness: 0,   unit: 'm²', qtyType: 'area',     description: '1200g polythene DPM',                                    category: 'materials', defaultEnabled: true  },
      { id: 'insulation',  name: 'PIR insulation',           thickness: 150, unit: 'm²', qtyType: 'area',     description: '150mm rigid PIR — enhanced Part L compliance',            category: 'materials', defaultEnabled: true  },
      { id: 'concrete',    name: 'Concrete slab',            thickness: 100, unit: 'm³', qtyType: 'volume',   description: 'C25 concrete slab on insulation',                         category: 'materials', defaultEnabled: true  },
      { id: 'screed',      name: 'Sand:cement screed',       thickness: 65,  unit: 'm²', qtyType: 'area',     description: '65mm sand:cement floor screed',                           category: 'materials', defaultEnabled: true  },
      { id: 'floor_finish',name: 'Floor finish allowance',   thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'PC sum — client to specify floor finish',                 category: 'other',     defaultEnabled: true  },
    ],
  },
  {
    id: 'screeded_floor',
    name: 'Screeded Floor',
    clientDescription:
      'Supply and apply sand:cement screed to existing structural floor, including surface preparation and bonding treatment, ready to receive final floor covering.',
    labourHrsPerM2: 1.2,
    wastePercent: 8,
    layers: [
      { id: 'preparation', name: 'Surface preparation',      thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'Clean, prime and prepare existing floor surface',         category: 'labour',    defaultEnabled: true  },
      { id: 'bonding',     name: 'Bonding agent',            thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'SBR bonding agent to existing slab',                     category: 'materials', defaultEnabled: true  },
      { id: 'screed',      name: 'Sand:cement screed',       thickness: 65,  unit: 'm²', qtyType: 'area',     description: '65mm sand:cement screed (1:3.5 mix)',                    category: 'materials', defaultEnabled: true  },
      { id: 'floor_finish',name: 'Floor finish allowance',   thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'PC sum — client to specify floor finish',                 category: 'other',     defaultEnabled: true  },
    ],
  },
  {
    id: 'ufh_screed',
    name: 'Screed with Underfloor Heating',
    clientDescription:
      'Supply and install underfloor heating system including UFH pipework, manifold, controls and specialist screed finish, ready to receive final floor covering.',
    labourHrsPerM2: 2.0,
    wastePercent: 10,
    layers: [
      { id: 'preparation', name: 'Surface preparation',      thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'Clean and prepare existing floor surface',                category: 'labour',    defaultEnabled: true  },
      { id: 'edge_strip',  name: 'Edge insulation strip',    thickness: 10,  unit: 'lm', qtyType: 'perimeter',description: '10mm perimeter edge insulation strip',                    category: 'materials', defaultEnabled: true  },
      { id: 'ufh_pipe',    name: 'UFH pipework',             thickness: 0,   unit: 'lm', qtyType: 'ufh_pipe', description: '16mm PERT-AL-PERT UFH pipe at 200mm centres', spacing: 200, category: 'materials', defaultEnabled: true },
      { id: 'manifold',    name: 'UFH manifold & controls',  thickness: 0,   unit: 'nr', qtyType: 'count',    description: 'Stainless manifold, actuators, thermostat & controls',    category: 'materials', defaultEnabled: true  },
      { id: 'screed',      name: 'Liquid screed (UFH grade)',thickness: 75,  unit: 'm²', qtyType: 'area',     description: '75mm calcium sulphate liquid screed',                    category: 'materials', defaultEnabled: true  },
      { id: 'floor_finish',name: 'Floor finish allowance',   thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'PC sum — client to specify floor finish',                 category: 'other',     defaultEnabled: true  },
    ],
  },
  {
    id: 'floor_overlay',
    name: 'Existing Floor Overlay',
    clientDescription:
      'Supply and apply self-levelling compound to existing floor, including surface preparation and priming, ready to receive final floor covering.',
    labourHrsPerM2: 0.8,
    wastePercent: 8,
    layers: [
      { id: 'preparation', name: 'Surface preparation',      thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'Clean, prime and prepare existing floor',                 category: 'labour',    defaultEnabled: true  },
      { id: 'self_level',  name: 'Self-levelling compound',  thickness: 10,  unit: 'm²', qtyType: 'area',     description: '10mm self-levelling compound (Ardex or similar)',         category: 'materials', defaultEnabled: true  },
      { id: 'floor_finish',name: 'Floor finish allowance',   thickness: 0,   unit: 'm²', qtyType: 'area',     description: 'PC sum — client to specify floor finish',                 category: 'other',     defaultEnabled: true  },
    ],
  },
]

// ── Wall build-up types ───────────────────────────────────────────────────────

export const WALL_MAKEUPS: FloorMakeup[] = [
  {
    id: 'cav_wall_partial',
    name: 'Cavity Wall – Partial Fill',
    clientDescription:
      'Supply and build cavity wall construction with 102.5mm facing brick outer leaf, 75mm partial-fill mineral wool cavity batts, stainless wall ties and 100mm blockwork inner leaf, including DPC at base of wall, ready to receive internal finishes.',
    labourHrsPerM2: 3.5,
    wastePercent: 10,
    layers: [
      { id: 'w_labour',       name: 'Brickwork & blockwork labour',          thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Labour – build outer brick leaf, cavity, inner block leaf',           category: 'labour',    defaultEnabled: true  },
      { id: 'w_outer_brick',  name: 'Outer leaf brickwork 102.5mm',          thickness: 102, unit: 'm²', qtyType: 'area',      description: 'Facing brickwork 102.5mm (client to specify brick type & bond)',      category: 'materials', defaultEnabled: true  },
      { id: 'w_cavity_batt',  name: 'Cavity insulation – partial fill 75mm', thickness: 75,  unit: 'm²', qtyType: 'area',      description: 'Rockwool or Knauf partial-fill cavity batts 75mm (Part L compliant)', category: 'materials', defaultEnabled: true  },
      { id: 'w_wall_ties',    name: 'Stainless steel wall ties',             thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'SS double-triangle wall ties at 900×450mm centres',                  category: 'materials', defaultEnabled: true  },
      { id: 'w_inner_block',  name: 'Inner leaf blockwork 100mm',            thickness: 100, unit: 'm²', qtyType: 'area',      description: '7.3N/mm² medium-density concrete block 100mm',                      category: 'materials', defaultEnabled: true  },
      { id: 'w_dpc',          name: 'DPC to base of wall',                   thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: '112mm polythene DPC at base of cavity wall',                         category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'cav_wall_full',
    name: 'Cavity Wall – Full Fill',
    clientDescription:
      'Supply and build cavity wall with 102.5mm facing brick outer leaf, full-fill mineral wool cavity insulation, stainless wall ties and 100mm blockwork inner leaf, including DPC at base, ready to receive internal finishes.',
    labourHrsPerM2: 3.5,
    wastePercent: 10,
    layers: [
      { id: 'cwf_labour',      name: 'Brickwork & blockwork labour',          thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Labour – build outer brick, full-fill cavity, inner block',          category: 'labour',    defaultEnabled: true  },
      { id: 'cwf_outer_brick', name: 'Outer leaf brickwork 102.5mm',          thickness: 102, unit: 'm²', qtyType: 'area',      description: 'Facing brickwork 102.5mm (client to specify brick type)',            category: 'materials', defaultEnabled: true  },
      { id: 'cwf_full_fill',   name: 'Full-fill mineral wool batts 100mm',    thickness: 100, unit: 'm²', qtyType: 'area',      description: 'Full-fill mineral wool cavity batts 100mm (Part L compliant)',       category: 'materials', defaultEnabled: true  },
      { id: 'cwf_wall_ties',   name: 'Stainless steel wall ties',             thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'SS wall ties at 900×450mm centres',                                 category: 'materials', defaultEnabled: true  },
      { id: 'cwf_inner_block', name: 'Inner leaf blockwork 100mm',            thickness: 100, unit: 'm²', qtyType: 'area',      description: '7.3N/mm² medium-density concrete block 100mm',                      category: 'materials', defaultEnabled: true  },
      { id: 'cwf_dpc',         name: 'DPC to base of wall',                   thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: '112mm polythene DPC at base of cavity wall',                         category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'solid_brick_225',
    name: 'Solid Brick 225mm',
    clientDescription:
      'Supply and build solid brick 225mm wall with insulated internal dry-lining, DPC and associated work, ready to receive finishes.',
    labourHrsPerM2: 4.0,
    wastePercent: 10,
    layers: [
      { id: 'sb_labour',      name: 'Brickwork labour',                      thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Labour – build 225mm solid brick wall',                             category: 'labour',    defaultEnabled: true  },
      { id: 'sb_brickwork',   name: 'Solid brickwork 225mm',                 thickness: 225, unit: 'm²', qtyType: 'area',      description: 'Engineering or facing brick 225mm solid wall',                      category: 'materials', defaultEnabled: true  },
      { id: 'sb_dpc',         name: 'DPC to base of wall',                   thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Polythene DPC at base of wall',                                      category: 'materials', defaultEnabled: true  },
      { id: 'sb_dry_lining',  name: 'Insulated dry-lining (internal) 72mm',  thickness: 72,  unit: 'm²', qtyType: 'area',      description: '50mm PIR insulated plasterboard dry-lining to internal face',        category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'timber_frame_wall',
    name: 'Timber Frame Wall',
    clientDescription:
      'Supply and erect timber frame wall including treated sole plate, 140×38mm C16 studwork at 400/600mm centres, mineral wool insulation, OSB sheathing, vapour control layer and breather membrane externally, ready to receive cladding and internal finishes.',
    labourHrsPerM2: 2.8,
    wastePercent: 12,
    layers: [
      { id: 'tfw_labour',     name: 'Frame erection labour',                 thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Labour – erect stud frame, insulate, board and membrane',           category: 'labour',    defaultEnabled: true  },
      { id: 'tfw_sole_plate', name: 'Sole plate treated timber',             thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: '75×50mm treated timber sole plate with DPC underneath',             category: 'materials', defaultEnabled: true  },
      { id: 'tfw_studs',      name: 'Timber studwork 140×38 C16',            thickness: 140, unit: 'm²', qtyType: 'area',      description: '140×38mm C16 timber studs at 400mm or 600mm centres',              category: 'materials', defaultEnabled: true  },
      { id: 'tfw_insulation', name: 'Mineral wool insulation 140mm',         thickness: 140, unit: 'm²', qtyType: 'area',      description: '140mm mineral wool between studs (Part L compliant)',               category: 'materials', defaultEnabled: true  },
      { id: 'tfw_osb',        name: 'OSB structural sheathing 11mm',         thickness: 11,  unit: 'm²', qtyType: 'area',      description: '11mm OSB3 structural sheathing to external face',                   category: 'materials', defaultEnabled: true  },
      { id: 'tfw_vcl',        name: 'Vapour control layer',                  thickness: 0,   unit: 'm²', qtyType: 'area',      description: '500g polythene VCL to warm side of insulation',                     category: 'materials', defaultEnabled: true  },
      { id: 'tfw_membrane',   name: 'Breather membrane',                     thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Tyvek or similar breather membrane to external face',               category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'blockwork_100',
    name: 'Concrete Blockwork 100mm',
    clientDescription:
      'Supply and build 100mm dense concrete blockwork partition or external leaf with associated DPC, mortar and sundries, ready to receive finishes.',
    labourHrsPerM2: 2.2,
    wastePercent: 8,
    layers: [
      { id: 'bk_labour',      name: 'Blockwork labour',                      thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Labour – build 100mm concrete blockwork wall',                      category: 'labour',    defaultEnabled: true  },
      { id: 'bk_blocks',      name: 'Dense concrete blocks 100mm',           thickness: 100, unit: 'm²', qtyType: 'area',      description: '7.3N/mm² dense concrete block 100mm, mortar-set',                  category: 'materials', defaultEnabled: true  },
      { id: 'bk_dpc',         name: 'DPC to base of wall',                   thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Polythene DPC at base of blockwork wall',                            category: 'materials', defaultEnabled: true  },
    ],
  },
]

// ── Foundation build-up types ─────────────────────────────────────────────────

export const FOUNDATION_MAKEUPS: FloorMakeup[] = [
  {
    id: 'strip_found',
    name: 'Strip Foundation (Traditional)',
    clientDescription:
      'Excavate trenches to required depth, lay mass concrete strip foundations to structural engineer\'s design, build blockwork from foundation to DPC level including all associated earthwork and make-good.',
    labourHrsPerM2: 0,
    wastePercent: 10,
    layers: [
      { id: 'sf_excavation',  name: 'Trench excavation',                     thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Machine & hand excavate foundation trench (rate per lm of wall run)', category: 'labour',    defaultEnabled: true  },
      { id: 'sf_concrete',    name: 'Mass concrete C15/20',                  thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Mass concrete strip foundation (rate per lm, includes concrete volume)', category: 'materials', defaultEnabled: true  },
      { id: 'sf_blockwork',   name: 'Blockwork to DPC level',                thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Solid concrete blockwork from foundation to DPC level',              category: 'materials', defaultEnabled: true  },
      { id: 'sf_dpc',         name: 'DPC at floor level',                    thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Polythene DPC at ground floor slab / screed level',                  category: 'materials', defaultEnabled: true  },
      { id: 'sf_backfill',    name: 'Backfill & compaction',                 thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Backfill trench sides, compact and make good',                       category: 'labour',    defaultEnabled: true  },
    ],
  },
  {
    id: 'trench_fill',
    name: 'Trench Fill Foundation',
    clientDescription:
      'Excavate trenches and fill with mass concrete to within 150mm of finished ground level, including all associated earthwork, DPC and make-good.',
    labourHrsPerM2: 0,
    wastePercent: 10,
    layers: [
      { id: 'trf_excavation', name: 'Trench excavation',                     thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Machine excavate trench to required depth (rate per lm)',            category: 'labour',    defaultEnabled: true  },
      { id: 'trf_concrete',   name: 'Trench fill concrete C25',              thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Trench fill mass concrete C25 (rate per lm, includes volume)',       category: 'materials', defaultEnabled: true  },
      { id: 'trf_dpc',        name: 'DPC at ground floor level',             thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Polythene DPC strip at ground floor level',                          category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'raft_found',
    name: 'Raft Foundation',
    clientDescription:
      'Supply and construct reinforced concrete raft foundation including bulk excavation, 150mm compacted hardcore, DPM, EPS edge insulation, A393 reinforcement mesh and C30 concrete raft slab.',
    labourHrsPerM2: 3.5,
    wastePercent: 10,
    layers: [
      { id: 'rf_excavation',  name: 'Bulk excavation & formation',           thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Bulk excavation and trim to formation level',                       category: 'labour',    defaultEnabled: true  },
      { id: 'rf_hardcore',    name: 'Hardcore sub-base 150mm',               thickness: 150, unit: 'm³', qtyType: 'volume',    description: 'Compacted MOT Type 1 hardcore 150mm',                               category: 'materials', defaultEnabled: true  },
      { id: 'rf_blinding',    name: 'Sand blinding 50mm',                    thickness: 50,  unit: 'm²', qtyType: 'area',      description: 'Sand blinding layer to hardcore',                                    category: 'materials', defaultEnabled: true  },
      { id: 'rf_dpm',         name: 'DPM',                                   thickness: 0,   unit: 'm²', qtyType: 'area',      description: '1200g polythene DPM',                                               category: 'materials', defaultEnabled: true  },
      { id: 'rf_edge_ins',    name: 'EPS edge insulation 100mm',             thickness: 100, unit: 'lm', qtyType: 'perimeter', description: 'EPS edge insulation board 100mm to perimeter upstand',               category: 'materials', defaultEnabled: true  },
      { id: 'rf_mesh',        name: 'Reinforcement mesh A393',               thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'A393 fabric reinforcement mesh (2 layers as required)',             category: 'materials', defaultEnabled: true  },
      { id: 'rf_concrete',    name: 'Concrete raft C30 (200mm)',             thickness: 200, unit: 'm³', qtyType: 'volume',    description: 'C30/37 concrete raft slab 200mm minimum thickness',                 category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'pad_found',
    name: 'Pad Foundations',
    clientDescription:
      'Excavate individual pad positions, form formwork, place reinforcement cage and pour C30 concrete pad foundations to structural engineer\'s design.',
    labourHrsPerM2: 4.0,
    wastePercent: 12,
    layers: [
      { id: 'pf_excavation',  name: 'Excavation to pad positions',           thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Excavate each pad position (qty = overall foundation zone m²)',    category: 'labour',    defaultEnabled: true  },
      { id: 'pf_blinding',    name: 'Blinding concrete 75mm',                thickness: 75,  unit: 'm³', qtyType: 'volume',    description: 'C10 blinding concrete 75mm to pad base',                            category: 'materials', defaultEnabled: true  },
      { id: 'pf_formwork',    name: 'Formwork to pads',                      thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Plywood formwork to sides of pads',                                 category: 'materials', defaultEnabled: true  },
      { id: 'pf_rebar',       name: 'Reinforcement cage',                    thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Steel reinforcement cage to SE design (adjust qty for pad count)',  category: 'materials', defaultEnabled: true  },
      { id: 'pf_concrete',    name: 'Pad concrete C30',                      thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'C30 structural concrete to pad foundations',                        category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'piled_found',
    name: 'Piled Foundation',
    clientDescription:
      'Install CFA or mini-piles to structural engineer\'s design, including pile caps, ring beam / ground beam and associated DPM.',
    labourHrsPerM2: 0,
    wastePercent: 5,
    layers: [
      { id: 'pl_piling',      name: 'Piling works (sub-contract)',           thickness: 0,   unit: 'nr', qtyType: 'count',     description: 'CFA or mini-pile installation — specialist sub-contractor (adjust nr)', category: 'other',    defaultEnabled: true  },
      { id: 'pl_pile_caps',   name: 'Pile caps concrete',                    thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Reinforced concrete pile caps to SE design',                        category: 'materials', defaultEnabled: true  },
      { id: 'pl_ring_beam',   name: 'Ring beam / ground beam',               thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Reinforced concrete ring or ground beam perimeter',                  category: 'materials', defaultEnabled: true  },
      { id: 'pl_dpm',         name: 'DPM to beam zone',                      thickness: 0,   unit: 'm²', qtyType: 'area',      description: '1200g polythene DPM',                                               category: 'materials', defaultEnabled: true  },
    ],
  },
]

// ── Plastering & Boarding build-up types ──────────────────────────────────────

export const PLASTER_MAKEUPS: FloorMakeup[] = [
  {
    id: 'dot_dab',
    name: 'Dot & Dab Plasterboard (to masonry)',
    clientDescription:
      'Supply and fix 12.5mm tapered-edge plasterboard to masonry walls using adhesive dabs, including skim finish plaster, scrim tape and all associated surface preparation.',
    labourHrsPerM2: 0.9,
    wastePercent: 10,
    layers: [
      { id: 'dd_prep',        name: 'Surface preparation',                   thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Clean, dust and PVA prime masonry surface',                         category: 'labour',    defaultEnabled: true  },
      { id: 'dd_adhesive',    name: 'Plasterboard adhesive (dabs)',          thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Thistle Bond-It or Gyproc Dri-Wall adhesive dabs',                  category: 'materials', defaultEnabled: true  },
      { id: 'dd_board',       name: 'Plasterboard 12.5mm',                   thickness: 12,  unit: 'm²', qtyType: 'area',      description: 'Gyproc Wallboard 12.5mm tapered-edge',                              category: 'materials', defaultEnabled: true  },
      { id: 'dd_tape',        name: 'Joint scrim tape & compound',           thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Paper tape and jointing compound to all joints and angles',          category: 'materials', defaultEnabled: true  },
      { id: 'dd_skim',        name: 'Finish plaster skim 2mm',               thickness: 2,   unit: 'm²', qtyType: 'area',      description: 'Thistle MultiFinish skim coat approx 2mm',                          category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'skim_only',
    name: 'Skim Coat (to existing surface)',
    clientDescription:
      'Supply and apply finish plaster skim coat to existing plasterboard or bonded masonry surface, including surface preparation and PVA bonding.',
    labourHrsPerM2: 0.5,
    wastePercent: 8,
    layers: [
      { id: 'sk_prep',        name: 'Surface preparation & PVA bond',        thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Prepare existing surface, apply PVA bonding agent',                category: 'labour',    defaultEnabled: true  },
      { id: 'sk_skim',        name: 'Finish plaster skim 2mm',               thickness: 2,   unit: 'm²', qtyType: 'area',      description: 'Thistle MultiFinish skim coat — 2 coats to 2mm',                    category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'metal_stud_partition',
    name: 'Metal Stud Partition',
    clientDescription:
      'Supply and erect metal stud partition including floor and ceiling track, 70mm studs at 600mm centres, 50mm acoustic mineral wool, 12.5mm plasterboard to both faces and skim finish.',
    labourHrsPerM2: 1.2,
    wastePercent: 10,
    layers: [
      { id: 'ms_labour',      name: 'Partition erection labour',             thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Labour – erect stud, board both faces and skim finish',             category: 'labour',    defaultEnabled: true  },
      { id: 'ms_track',       name: 'Floor & ceiling track 48mm',            thickness: 0,   unit: 'lm', qtyType: 'perimeter', description: 'Knauf or British Gypsum 48mm steel floor / ceiling track',           category: 'materials', defaultEnabled: true  },
      { id: 'ms_studs',       name: 'Metal studs 70mm',                      thickness: 70,  unit: 'm²', qtyType: 'area',      description: '70mm metal studs at 600mm centres',                                 category: 'materials', defaultEnabled: true  },
      { id: 'ms_insulation',  name: 'Acoustic mineral wool 50mm',            thickness: 50,  unit: 'm²', qtyType: 'area',      description: '50mm Knauf Earthwool acoustic mineral wool between studs',           category: 'materials', defaultEnabled: true  },
      { id: 'ms_board_a',     name: 'Plasterboard 12.5mm (face A)',          thickness: 12,  unit: 'm²', qtyType: 'area',      description: '12.5mm Gyproc Wallboard to one face',                               category: 'materials', defaultEnabled: true  },
      { id: 'ms_board_b',     name: 'Plasterboard 12.5mm (face B)',          thickness: 12,  unit: 'm²', qtyType: 'area',      description: '12.5mm Gyproc Wallboard to other face',                             category: 'materials', defaultEnabled: true  },
      { id: 'ms_skim',        name: 'Scrim tape & skim both faces',          thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Scrim, tape and Thistle MultiFinish skim coat — both faces',         category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'wet_plaster_two_coat',
    name: 'Wet Plaster Two-coat',
    clientDescription:
      'Supply and apply traditional two-coat wet plaster system: 11mm sand:cement scratch coat and 2mm Thistle finish coat to masonry backgrounds, ready to decorate.',
    labourHrsPerM2: 1.4,
    wastePercent: 12,
    layers: [
      { id: 'wp_prep',        name: 'Surface preparation & dubbing',         thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Clean surface, dub out voids, fix angle beads and render stops',    category: 'labour',    defaultEnabled: true  },
      { id: 'wp_scratch',     name: 'Scratch coat sand:cement 11mm',         thickness: 11,  unit: 'm³', qtyType: 'volume',    description: 'Sand:cement scratch coat 11mm to masonry (1:3 mix)',                category: 'materials', defaultEnabled: true  },
      { id: 'wp_finish',      name: 'Finish coat Thistle 2mm',               thickness: 2,   unit: 'm²', qtyType: 'area',      description: 'Thistle MultiFinish 2mm finish coat',                               category: 'materials', defaultEnabled: true  },
    ],
  },
  {
    id: 'ext_render_three_coat',
    name: 'External Render Three-coat',
    clientDescription:
      'Supply and apply three-coat external render system to masonry: key / bonding coat, 11mm sand:cement render base coat, 6mm float coat and through-colour silicone or monocouche finish coat.',
    labourHrsPerM2: 1.8,
    wastePercent: 12,
    layers: [
      { id: 'er_prep',        name: 'Surface preparation & key coat',        thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Clean masonry, apply bonding agent / key coat, fix render beads',   category: 'labour',    defaultEnabled: true  },
      { id: 'er_base_coat',   name: 'Render base coat (sand:cement) 11mm',   thickness: 11,  unit: 'm³', qtyType: 'volume',    description: 'Sand:cement render base coat 11mm',                                 category: 'materials', defaultEnabled: true  },
      { id: 'er_float',       name: 'Float coat 6mm',                        thickness: 6,   unit: 'm²', qtyType: 'area',      description: 'Float and scratch render coat 6mm',                                 category: 'materials', defaultEnabled: true  },
      { id: 'er_finish',      name: 'Finish coat (silicone render)',          thickness: 0,   unit: 'm²', qtyType: 'area',      description: 'Through-colour silicone render or monocouche finish coat',           category: 'materials', defaultEnabled: true  },
    ],
  },
]

// ── Combined lookup ───────────────────────────────────────────────────────────

/** All makeups from every phase combined — use for ID lookups (e.g. quote import) */
export const ALL_MAKEUPS: FloorMakeup[] = [
  ...FLOOR_MAKEUPS,
  ...WALL_MAKEUPS,
  ...FOUNDATION_MAKEUPS,
  ...PLASTER_MAKEUPS,
]

/** Maps TakeoffPhase → its array of build-up makeups (only phases that support them) */
export const PHASE_MAKEUPS: Partial<Record<TakeoffPhase, FloorMakeup[]>> = {
  'Floors & Screeds':      FLOOR_MAKEUPS,
  'External Walls':        WALL_MAKEUPS,
  'Foundations':           FOUNDATION_MAKEUPS,
  'Plastering & Boarding': PLASTER_MAKEUPS,
}

// ── Custom wall type storage (localStorage) ───────────────────────────────────

const CUSTOM_WALL_TYPES_KEY = 'sbc_custom_wall_types'

/** Load user-defined custom wall types from localStorage */
export function loadCustomWallTypes(): FloorMakeup[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_WALL_TYPES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/** Persist custom wall types to localStorage */
export function saveCustomWallTypes(types: FloorMakeup[]): void {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(CUSTOM_WALL_TYPES_KEY, JSON.stringify(types)) } catch {}
}

/** Return all wall types: built-in WALL_MAKEUPS + any saved custom types */
export function getAllWallTypes(): FloorMakeup[] {
  return [...WALL_MAKEUPS, ...loadCustomWallTypes()]
}

// ── Layer quantity calculator (shared between take-off tool and quote import) ──

export function calcLayerQty(
  layer: FloorLayer,
  area: number,
  perimeter: number,
  thicknessOverride?: number,
): { qty: number; unit: string } {
  const thickness = (thicknessOverride != null ? thicknessOverride : layer.thickness) / 1000
  switch (layer.qtyType) {
    case 'area':
      return { qty: +area.toFixed(3), unit: 'm²' }
    case 'volume':
      return { qty: +(area * thickness).toFixed(3), unit: 'm³' }
    case 'perimeter':
      return { qty: +perimeter.toFixed(2), unit: 'lm' }
    case 'ufh_pipe': {
      const spacingM = (layer.spacing ?? 200) / 1000
      return { qty: +(area / spacingM * 1.15).toFixed(1), unit: 'lm' }
    }
    case 'count':
      return { qty: 1, unit: 'nr' }
    default:
      return { qty: +area.toFixed(3), unit: 'm²' }
  }
}
