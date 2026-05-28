/**
 * Types and constants for the Construction Take-off Tool.
 */

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
  area?:       number   // m²
  volume?:     number   // m³
  qty:         number
  unit:        string   // 'm', 'm²', 'm³', 'nr', 'item', 'bag', etc.

  notes?: string

  // Floor-specific (set when item created by the Floor tool)
  floorMakeupId?:        string                      // references FLOOR_MAKEUPS[].id
  perimeter?:            number                      // m, calculated from drawn geometry
  floorLayerToggles?:    Record<string, boolean>     // layerId → enabled override
  floorLayerThicknesses?: Record<string, number>     // layerId → thickness override (mm)
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
