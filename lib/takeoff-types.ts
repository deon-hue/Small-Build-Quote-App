/**
 * Types and constants for the Construction Take-off Tool.
 */

// ── Drawing tools ─────────────────────────────────────────────────────────────

export type DrawingTool = 'select' | 'line' | 'rect' | 'polygon'

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
