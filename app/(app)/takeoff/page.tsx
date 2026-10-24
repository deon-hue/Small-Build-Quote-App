'use client'

import { useState, useRef, useEffect, useCallback, useMemo, ChangeEvent } from 'react'
import NumInput from '@/components/NumInput'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { makeDebouncedSave, isEmptyTakeoff, isUuid, newProjectId, loadTakeoffFromSupabase, saveTakeoffToSupabase, listTakeoffSummaries, deleteTakeoffProject, type TakeoffSummary } from '@/lib/takeoff-sync'
import { activeSheetIdOf, onActiveSheet, elementsOnActiveSheet, activeSheetElementIds, itemSheetId, sheetName, makeSheet, sheetNameFromFile, parsePageList, addSheets, switchActiveSheet, setActiveSheetCalibration, renameSheet, removeSheet, setSheetPaper } from '@/lib/takeoff-sheets'
import { layoutTags, polylineMidpoint, textColorFor, tagText, TAG_HEIGHT_PX } from '@/lib/takeoff-tags'
import { PDF_RENDER_MM_PER_PX, PAPER_SIZES, SCALE_DENOMS, scaleLabel, denomFromLabel, mppForScale, paperFromMm, inferPdfPaper, mmPerPxForPaper } from '@/lib/takeoff-paper'
import { putSheetImage, getSheetImage, deleteProjectImages } from '@/lib/takeoff-sheet-images'
import { uploadSheetPicture, downloadSheetPicture, listCloudPictureSheetIds, deleteProjectPictures } from '@/lib/takeoff-sheet-cloud'
import type { TakeoffSheet } from '@/lib/takeoff-types'
import { fetchWallTypesWithLayers, wallTypesToMakeups, fetchLabourTrades, fetchPhases, fetchSubPhases, fetchTasks } from '@/lib/back-office-queries'
import type { BOLabourTrade, BOPhase, BOSubPhase, BOTask } from '@/lib/back-office-types'
import { BUILT_ASSEMBLY_CANON_IDS } from '@/lib/built-assemblies'
import { WALL_MAKEUP_TO_SUBPHASE_CANONICAL } from '@/lib/built-assembly-ids'
import AssemblyItemPanel from './components/AssemblyWindow'
import ElectricalPointsPanel, { POINT_GROUP_COLOUR } from './components/ElectricalPointsPanel'
import OpeningsPanel from './components/OpeningsPanel'
import { POINT_BY_ID, type ElectricsSavedState } from '@/lib/electrics-units'
import { planRoomsFromPoints, roomAtPoint, rectToPolygon, POINT_SHORT, type ElectricPoint } from '@/lib/electric-points'

// The one Take-off item that holds every electrical point placed on the plan (and the electrics calculator's saved price).
const ELECTRICS_ITEM_ID = 'electrics-summary'
const WD_ITEM_ID = 'wd-summary'
const OPENING_COLOUR = { win: '#2b6cb0', ext: '#7c3aed', int: '#b45309' }

// A drawn foundation line's Foundation Type -> its build-up id (see FOUNDATION_MAKEUPS). A type whose build-up has a calculator (WALL_MAKEUP_TO_SUBPHASE_CANONICAL) is priced by it.
const FOUNDATION_MAKEUP_BY_TYPE: Record<string, string | null> = { trench_fill: 'trench_fill', strip: 'strip_found', pad_edge: 'pad_found', raft_edge: 'raft_found', piled: 'piled_found', underpin: 'underpin', other: null }
// A drawn foundation LINE is priced by the strip or trench fill calculator; a raft is a SHAPE (its footprint), so a line - even one set to Raft Edge Beam - never gets the raft calculator.
const FOUNDATION_LINE_CALCS = new Set(['fnd-strip', 'fnd-trench-fill', 'fnd-piled', 'fnd-underpin'])
// A raft (sized from its box) and pad foundations (counted in the calculator: the shape is only a placemarker) are shapes.
const FOUNDATION_SHAPE_CALCS = new Set(['fnd-raft', 'fnd-pad'])
// A floor is a shape (its footprint) priced by its calculator from the area and perimeter drawn: the sub-phases of Floors & Screeds that have one
/** Phases where picking a calculator sub-phase makes the item a marker on the plan and the calculator card opens (Decoration, Plumbing & Heating, Drainage & Services): the sizes are typed in the calculator. */
const MARKER_CALC_PHASES = new Set<string>(['Decoration', 'Plumbing & Heating', 'Drainage & Services', 'Plastering & Boarding', 'Tiling & Finishes', 'Windows & Doors'])
const FLOOR_SHAPE_CALCS = new Set(['fs-screeded-floor', 'fs-floor-overlay', 'fs-concrete-slab', 'fs-block-beam', 'fs-suspended-timber', 'fs-insulated-concrete'])
import LabourCostBuilder from './components/LabourCostBuilder'
import { SharedWallAreasProvider } from '@/components/TilingShareContext'
import { sharedWallRoomsFrom } from '@/lib/tiling-share'
import ClientProjectModal from './components/ClientProjectModal'
import ClientFilePicker from '@/components/ClientFilePicker'
import { planResize, applyResize } from '@/lib/calc-size'
import { wallDrawing, wallBand, signedArea, chainWalls, cavityWallSpec, solidBlockSpec, specFromMakeupLayers, defaultWallSpec, LAYER_STYLE } from '@/lib/wall-drawing'
import { openingShape, locateOnPath, clampDist, pathLength, nextOpeningRef, hasSwing, wallOpeningTypeFor, planWallOpenings, type PlacedOpening, type WallBand } from '@/lib/wall-openings'
import { KIND_BY_ID as WD_KIND_BY_ID, planOpeningSig, type OpeningKind, type WdSwing, type PlanOpening } from '@/lib/wd-units'
import { cornersOf, snapPoint, anchorsFor, parseTyped, pointAtDistance, rectCornerAt, rotateShape, type SnapResult } from '@/lib/takeoff-snap'
import { newHistory, observe as observeHistory, undoStep, redoStep, type History } from '@/lib/takeoff-history'
import ConstructionLayerModal, { saveLayerCostToBackOffice } from './components/ConstructionLayerModal'
import {
  TAKEOFF_PHASES, PHASE_COLORS, DEFAULT_MPP, SCALE_PRESETS,
  FLOOR_MAKEUPS, WALL_MAKEUPS, ALL_WALL_MAKEUPS, PLASTER_MAKEUPS, FOUNDATION_MAKEUPS, PHASE_MAKEUPS, calcLayerQty,
  loadCustomWallTypes, saveCustomWallTypes,
  WALL_OPENING_LABELS, WALL_OPENING_DEFAULTS,
  type TakeoffPhase, type DrawingTool, type TakeoffPoint,
  type DrawnElement, type TakeoffItem, type TakeoffProject, type ScaleCalibration,
  type FloorLayer, type FloorMakeup, type WallOpeningType, type WallOpening,
  type TakeoffLabourLine, type LayerCostRecord,
} from '@/lib/takeoff-types'
import {
  DEFAULT_DEMO_SUBPHASES, getAllDemoSubphases, loadCustomDemoSubphases,
  calcDemoSellingPrice,
  type DemoSubphase, type DemoTask,
} from '@/lib/demolition-data'
import {
  calcPhaseTaskSellingPrice, PHASE_TASK_UNIT_LABELS,
  type PhaseSubphase, type PhaseTask, type PhaseTaskUnit,
} from '@/lib/phase-tasks'
import {
  calcMaterialLines, recalcMaterial, sumByCategory,
  WALL_CONSTRUCTION_LABELS, WALL_FINISH_LABELS,
  type WallConstructionType, type WallFinishType, type CalculatedMaterial,
} from '@/lib/material-recipes'

// ── Smart Draw Mode: phase → default tool mapping ─────────────────────────────
// When the user selects a phase, the draw tool auto-resets to this default.
// Prevents "floor tool still active while Demolition is selected" bugs.
// Not exported — page files can only export Next.js special names
const PHASE_DEFAULT_TOOL: Record<string, DrawingTool> = {
  'Site Setup':                  'select',
  'Demolition':                  'line',
  'Site Setup & Demolition':     'line',  // legacy compat
  'Foundations':                  'line',
  'Structural Frame':             'line',
  'External Walls':               'line',
  'Roof':                         'polygon',
  'Windows & Doors':              'opening',
  'Internal Walls & Partitions':  'line',
  'Floors & Screeds':             'polygon',
  'Drainage & Services':          'line',
  'Electrics':                    'electric',
  'Plumbing & Heating':           'line',
  'Plastering & Boarding':        'line',
  'Joinery & Fixtures':           'rect',
  'Tiling & Finishes':            'rect',
  'Decoration':                   'rect',
  'External Works & Landscaping': 'polygon',
  'Preliminaries':                'select',
  'Other':                        'select',
}

// Human-readable measurement label per phase (shown in Active Draw Mode panel)
const PHASE_MEASURE_LABEL: Record<string, string> = {
  'Site Setup':                  'Items / Lump Sum',
  'Demolition':                  'Linear / Area',
  'Site Setup & Demolition':     'Linear / Area',  // legacy compat
  'Foundations':                  'Linear (m) → Volume (m³)',
  'Structural Frame':             'Linear (m)',
  'External Walls':               'Linear (m)',
  'Roof':                         'Area (m²)',
  'Windows & Doors':              'Count / Area',
  'Internal Walls & Partitions':  'Linear (m)',
  'Floors & Screeds':             'Area (m²)',
  'Drainage & Services':          'Linear (m)',
  'Electrics':                    'Linear / Count',
  'Plumbing & Heating':           'Count / Linear',
  'Plastering & Boarding':        'Linear (m) → Area',
  'Joinery & Fixtures':           'Count / Area',
  'Tiling & Finishes':            'Area (m²)',
  'Decoration':                   'Area (m²)',
  'External Works & Landscaping': 'Area (m²)',
  'Preliminaries':                'Sum / Count',
  'Other':                        'Count (nr)',
}

// Display name for each draw tool
const TOOL_DISPLAY: Record<DrawingTool, string> = {
  select:  'Selection',
  line:    'Line (Linear)',
  rect:    'Rectangle (Area)',
  polygon: 'Polygon (Area)',
  floor:   'Floor Area',
  click:   'Click to Place Item',
  electric: 'Place Electrical Point',
  opening: 'Place Window / Door',
  measure: 'Measure',
}

// ── ID helpers ────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10) }

// ── Measurement helpers ───────────────────────────────────────────────────────
function polylineLength(pts: TakeoffPoint[], mpp: number): number {
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dy = pts[i].y - pts[i - 1].y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return +(total * mpp).toFixed(3)
}

function rectArea(pts: TakeoffPoint[], mpp: number): number {
  if (pts.length < 2) return 0
  const w = Math.abs(pts[1].x - pts[0].x) * mpp
  const h = Math.abs(pts[1].y - pts[0].y) * mpp
  return +(w * h).toFixed(3)
}

function polygonArea(pts: TakeoffPoint[], mpp: number): number {
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    area += pts[i].x * pts[j].y
    area -= pts[j].x * pts[i].y
  }
  return +(Math.abs(area) / 2 * mpp * mpp).toFixed(3)
}

function centroid(pts: TakeoffPoint[]): TakeoffPoint {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return { x, y }
}

function fmt2(n: number | undefined) {
  return n != null ? n.toFixed(2) : '—'
}

function fmtM(n: number | undefined) {
  if (n == null) return '—'
  return n >= 1000 ? `${(n / 1000).toFixed(1)}km` : `${n.toFixed(2)}m`
}

// ── Floor helpers ─────────────────────────────────────────────────────────────

function rectPerimeter(pts: TakeoffPoint[], mpp: number): number {
  const w = Math.abs(pts[1].x - pts[0].x) * mpp
  const h = Math.abs(pts[1].y - pts[0].y) * mpp
  return +(2 * (w + h)).toFixed(3)
}

function polyPerimeter(pts: TakeoffPoint[], mpp: number): number {
  let total = 0
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length
    const dx = pts[j].x - pts[i].x
    const dy = pts[j].y - pts[i].y
    total += Math.sqrt(dx * dx + dy * dy)
  }
  return +(total * mpp).toFixed(3)
}

/**
 * Offset a polyline by d pixels perpendicular to its path.
 * Uses proper miter joins at interior vertices so the wall band stays
 * an even thickness around corners instead of flaring or pinching.
 * Miter length is clamped to 4× d to prevent spikes at very sharp angles.
 */
function offsetPoly(pts: TakeoffPoint[], d: number): TakeoffPoint[] {
  const n = pts.length
  if (n < 2) return pts

  // Unit normal for each segment (perpendicular, left of travel)
  const segNormals: TakeoffPoint[] = []
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x
    const dy = pts[i + 1].y - pts[i].y
    const len = Math.hypot(dx, dy)
    segNormals.push(len > 0 ? { x: -dy / len, y: dx / len } : { x: 0, y: 0 })
  }

  return pts.map((pt, i) => {
    if (i === 0) {
      // Start: simple perpendicular offset from first segment
      const sn = segNormals[0]
      return { x: pt.x + sn.x * d, y: pt.y + sn.y * d }
    }
    if (i === n - 1) {
      // End: simple perpendicular offset from last segment
      const sn = segNormals[n - 2]
      return { x: pt.x + sn.x * d, y: pt.y + sn.y * d }
    }
    // Interior vertex — miter join
    const n1 = segNormals[i - 1]   // normal of incoming segment
    const n2 = segNormals[i]       // normal of outgoing segment
    // Bisector direction (sum of unit normals)
    const bx = n1.x + n2.x, by = n1.y + n2.y
    const bLen = Math.hypot(bx, by)
    if (bLen < 0.001) {
      // 180° turn (straight line) — just use either normal
      return { x: pt.x + n1.x * d, y: pt.y + n1.y * d }
    }
    // Scale factor: d / dot(bisector_unit, n1)
    // This keeps the wall face exactly d away from the centreline on both sides
    const dot = (bx / bLen) * n1.x + (by / bLen) * n1.y
    const scale = Math.abs(dot) > 0.1
      ? Math.max(-4 * Math.abs(d), Math.min(4 * Math.abs(d), d / dot))
      : Math.sign(d) * 4 * Math.abs(d)   // very sharp corner — clamp
    return { x: pt.x + (bx / bLen) * scale, y: pt.y + (by / bLen) * scale }
  })
}

/** Calculate a layer's qty from drawn geometry */
// calcLayerQty is imported from @/lib/takeoff-types

// ── High-visibility wall colours (readable on B&W / greyscale plans) ─────────
const WALL_LINE_COLOR = '#FF1111'   // vivid red face lines
const WALL_FILL_COLOR = '#FF8800'   // amber fill between the two leaves
const WALL_CAVI_COLOR = '#FF1111'   // red cavity centre dashes

const CAT_COLOR: Record<string, string> = {
  labour: '#f39c12', materials: '#3498db', plant: '#9b59b6', subcontractors: '#e74c3c', other: '#95a5a6',
}

// ── Theme ─────────────────────────────────────────────────────────────────────

const DARK_VARS: Record<string, string> = {
  '--to-bg':        '#0d1a0d',   // canvas / deepest bg
  '--to-panel':     '#162216',   // panels, topbar
  '--to-alt':       '#1a2a1a',   // secondary bg (rows, cards)
  '--to-hover':     '#1e2e1e',   // hover / tertiary
  '--to-active':    '#2b5a2b',   // active tool bg
  '--to-border':    '#2a3a2a',   // main border
  '--to-blt':       '#1e2a1e',   // light border
  '--to-active-bd': '#4a8a4a',   // active border
  '--to-btn-bd':    '#3a4a3a',   // button border
  '--to-text':      '#c8d8a8',   // primary text
  '--to-textb':     '#dde',      // bright text
  '--to-muted':     '#6a8a6a',   // muted text
  '--to-dim':       '#4a6a4a',   // dim / labels
  '--to-sub':       '#8aa',      // secondary text
  '--to-link':      '#9ab',      // links / dim accents
  '--to-input':     '#0d1a0d',   // input bg
  '--to-input-bd':  '#2a3a2a',   // input border
  '--to-accent':    '#7ab533',   // company green
  '--to-scrim':     'rgba(0,0,0,0.45)',
}

const LIGHT_VARS: Record<string, string> = {
  '--to-bg':        '#e8ecf0',
  '--to-panel':     '#ffffff',
  '--to-alt':       '#f5f6f8',
  '--to-hover':     '#f0f2f4',
  '--to-active':    'rgba(122,181,51,0.14)',
  '--to-border':    '#dde1e5',
  '--to-blt':       '#eaecef',
  '--to-active-bd': '#7ab533',
  '--to-btn-bd':    '#c8cdd5',
  '--to-text':      '#2b2f33',
  '--to-textb':     '#1e2022',
  '--to-muted':     '#6b7580',
  '--to-dim':       '#9aa0a8',
  '--to-sub':       '#6b7580',
  '--to-link':      '#4a7a9b',
  '--to-input':     '#ffffff',
  '--to-input-bd':  '#dde1e5',
  '--to-accent':    '#7ab533',
  '--to-scrim':     'rgba(30,32,34,0.6)',
}

// ── localStorage keys ─────────────────────────────────────────────────────────
const LS_KEY      = 'sbc_takeoff_project'
const LS_THEME    = 'sbc_takeoff_theme'
const LS_RECOVERY = 'sbc_takeoff_recovery'

// ── Recovery snapshot ─────────────────────────────────────────────────────────
interface RecoverySnapshot {
  id:          string
  label:       string      // "Recovery Snapshot - [name] - [datetime]"
  timestamp:   string      // ISO
  projectName: string
  project:     Omit<TakeoffProject, 'planImageUrl'>
  planImageUrl?: string    // included so full restore is possible
}

function saveRecoverySnapshot(snap: RecoverySnapshot) {
  try { localStorage.setItem(LS_RECOVERY, JSON.stringify(snap)) } catch {}
}

function loadRecoverySnapshot(): RecoverySnapshot | null {
  try {
    const raw = localStorage.getItem(LS_RECOVERY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function loadProject(): TakeoffProject | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveProject(p: TakeoffProject) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)) } catch {}
}

function blankProject(): TakeoffProject {
  return {
    id: newProjectId(),
    name: '',
    address: '',
    jobType: 'Rear Extension',
    calibration: { mpp: DEFAULT_MPP, label: '1:100' },
    elements: [],
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

// ── Export helpers ────────────────────────────────────────────────────────────
function exportJSON(project: TakeoffProject) {
  const { planImageUrl: _, ...rest } = project
  const blob = new Blob([JSON.stringify({ version: 1, ...rest }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `takeoff-${project.name.replace(/\s+/g, '-')}.json`
  a.click()
}

function exportCSV(project: TakeoffProject) {
  const header = ['Name', 'Phase', 'Sub-Phase', 'Spec', 'Drawing Ref',
    'Length (m)', 'Width (m)', 'Height (m)', 'Area (m²)', 'Volume (m³)',
    'Qty', 'Unit', 'Building Regs Notes', 'Notes']

  const rows = project.items.map(item => [
    item.name, item.phase, item.subPhase ?? '', item.spec ?? '', item.drawingRef ?? '',
    item.length ?? '', item.width ?? '', item.height ?? '',
    item.area ?? '', item.volume ?? '',
    item.qty, item.unit,
    item.buildingRegsNotes ?? '', item.notes ?? '',
  ])

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `takeoff-${project.name.replace(/\s+/g, '-')}.csv`
  a.click()
}

// ── SVG rect helper ───────────────────────────────────────────────────────────
function rectAttrs(pts: TakeoffPoint[]) {
  if (pts.length < 2) return { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0, width: 0, height: 0 }
  const x = Math.min(pts[0].x, pts[1].x)
  const y = Math.min(pts[0].y, pts[1].y)
  const w = Math.abs(pts[1].x - pts[0].x)
  const h = Math.abs(pts[1].y - pts[0].y)
  return { x, y, width: w, height: h }
}

// ── Default item from element ─────────────────────────────────────────────────
function itemFromElement(el: DrawnElement, mpp: number): TakeoffItem {
  let length: number | undefined, area: number | undefined, qty = 1, unit = 'nr'

  if (el.type === 'line') {
    length = polylineLength(el.points, mpp)
    unit = 'm'; qty = length
  } else if (el.type === 'rect') {
    area = rectArea(el.points, mpp)
    unit = 'm²'; qty = area
  } else if (el.type === 'polygon') {
    area = polygonArea(el.points, mpp)
    unit = 'm²'; qty = area
  }

  return {
    id: uid(),
    elementId: el.id,
    name: el.label,
    phase: el.phase,
    qty: +(qty).toFixed(3),
    unit,
    length,
    area,
  }
}

// ── Openings a wall takes off: the ones typed in Properties and the doors and windows drawn on it ──────────
const openingsAreaOf = (item: TakeoffItem) => [...(item.openings ?? []), ...(item.drawnOpenings ?? [])].reduce((s, o) => s + o.width * o.height, 0)

/** The wall items kept in step with the doors and windows placed on their walls: each wall item carries the openings drawn on it (drawnOpenings) and its net area (and an internal wall's materials) follow. Nothing changes where nothing was drawn. */
function withDrawnOpenings(items: TakeoffItem[], placed: PlacedOpening[]): TakeoffItem[] {
  return items.map(item => {
    if (!item.elementId || (item.phase !== 'External Walls' && item.phase !== 'Internal Walls & Partitions')) return item
    const drawn: WallOpening[] = placed.filter(o => o.wallId === item.elementId).map(o => ({
      id: 'po-' + o.id, type: wallOpeningTypeFor(o.kind), label: o.ref, width: o.widthMm / 1000, height: o.heightMm / 1000,
    }))
    if (JSON.stringify(drawn) === JSON.stringify(item.drawnOpenings ?? [])) return item
    const next: TakeoffItem = { ...item, drawnOpenings: drawn.length ? drawn : undefined }
    // an area-priced wall (net = gross less every opening); a wall priced another way keeps its own quantity
    if (next.unit === 'm²' && next.area != null) {
      const net = +Math.max(0, next.area - openingsAreaOf(next)).toFixed(3)
      next.qty = net
      if (next.phase === 'Internal Walls & Partitions' && next.calculatedMaterials) {
        const sides = (next.finishSides ?? 2) as 1 | 2
        next.calculatedMaterials = calcMaterialLines((next.wallConstructionType ?? 'stud_metal_70') as WallConstructionType, (next.wallFinishType ?? 'board_skim') as WallFinishType, sides, net, next.calculatedMaterials)
        next.materialsConfirmed = false
      }
    }
    return next
  })
}

// ── Recalculate all element-linked item quantities for a new mpp ──────────────
function recalcItemsForMpp(
  items: TakeoffItem[],
  elements: DrawnElement[],
  mpp: number,
  /** only remeasure the items drawn with these drawings (the showing sheet's: every other sheet has its own scale) */
  onlyElementIds?: Set<string>,
): TakeoffItem[] {
  return items.map(item => {
    if (!item.elementId) return item               // manual items: leave untouched
    if (onlyElementIds && !onlyElementIds.has(item.elementId)) return item
    const el = elements.find(e => e.id === item.elementId)
    if (!el) return item

    let length: number | undefined, area: number | undefined, volume: number | undefined
    let qty = item.qty
    const unit = item.unit

    if (el.type === 'line') {
      length = polylineLength(el.points, mpp)
      // Wall items: recalculate gross area and net area from new length
      if (item.phase === 'External Walls' && item.wallHeight != null) {
        area = +(length * item.wallHeight).toFixed(3)
        const openingsArea = openingsAreaOf(item)
        qty = +(Math.max(0, area - openingsArea)).toFixed(3)
      } else if (item.phase === 'Foundations' && item.foundationWidth != null) {
        // Foundation line: qty = lm; area = footprint; volume = excavation/concrete
        qty  = length
        const _wM = (item.foundationWidth ?? 600) / 1000
        const _dM = (item.foundationDepth ?? 1000) / 1000
        area   = +(length * _wM).toFixed(3)
        volume = +(length * _wM * _dM).toFixed(3)
      } else {
        qty = length
      }
    } else if (el.type === 'rect') {
      area = rectArea(el.points, mpp)
      // Wall items: preserve opening deductions
      if (item.phase === 'External Walls') {
        const openingsArea = openingsAreaOf(item)
        qty = +(Math.max(0, area - openingsArea)).toFixed(3)
      } else {
        qty = area
      }
    } else if (el.type === 'polygon') {
      area = polygonArea(el.points, mpp)
      // Wall items: preserve opening deductions
      if (item.phase === 'External Walls') {
        const openingsArea = openingsAreaOf(item)
        qty = +(Math.max(0, area - openingsArea)).toFixed(3)
      } else {
        qty = area
      }
    }

    const perimeter = item.perimeter != null
      ? (el.type === 'rect' && el.points.length >= 2
          ? rectPerimeter(el.points, mpp)
          : el.type === 'polygon' && el.points.length >= 3
            ? polyPerimeter(el.points, mpp)
            : undefined)
      : undefined

    return { ...item, qty: +(qty).toFixed(3), unit, length, area, perimeter, ...(volume !== undefined && { volume }) }
  })
}

// ── Panel modes ───────────────────────────────────────────────────────────────
type PanelMode = 'schedule' | 'properties'

// ── Component ─────────────────────────────────────────────────────────────────
// ── Layers panel component ────────────────────────────────────────────────────

interface LayersPanelProps {
  drawnPhases:  readonly string[]
  hiddenPhases: Set<string>
  phaseColors:  Record<string, string>
  onToggle:     (ph: TakeoffPhase) => void
  onShowAll:    () => void
  onHideAll:    () => void
  darkMode:     boolean
  hiddenCount:  number
}

function LayersPanel({ drawnPhases, hiddenPhases, phaseColors, onToggle, onShowAll, onHideAll, darkMode, hiddenCount }: LayersPanelProps) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 20 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
          background: open ? 'var(--to-panel)' : 'var(--to-alt)',
          border: `1px solid ${open ? 'var(--to-active-bd)' : 'var(--to-border)'}`,
          color: 'var(--to-text)', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          transition: 'all 0.12s',
        }}
        title="Toggle phase layer visibility"
      >
        <span>🗂</span>
        <span>Layers</span>
        {hiddenCount > 0 && (
          <span style={{ background: '#e74c3c', color: '#fff', borderRadius: 9, fontSize: 9, padding: '0 5px', fontWeight: 700 }}>
            {hiddenCount}
          </span>
        )}
        <span style={{ fontSize: 9, color: 'var(--to-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: 200,
          background: 'var(--to-panel)', border: '1px solid var(--to-border)', borderRadius: 8,
          boxShadow: '0 6px 24px rgba(0,0,0,0.28)', padding: '8px 0', zIndex: 30,
        }}>
          {/* Show all / Hide all */}
          <div style={{ display: 'flex', gap: 4, padding: '4px 10px 8px', borderBottom: '1px solid var(--to-border)' }}>
            <button onClick={onShowAll} style={{ flex: 1, fontSize: 10, padding: '3px 0', border: '1px solid var(--to-border)', borderRadius: 4, background: 'transparent', color: 'var(--to-accent)', cursor: 'pointer', fontWeight: 600 }}>
              Show All
            </button>
            <button onClick={onHideAll} style={{ flex: 1, fontSize: 10, padding: '3px 0', border: '1px solid var(--to-border)', borderRadius: 4, background: 'transparent', color: 'var(--to-muted)', cursor: 'pointer' }}>
              Hide All
            </button>
          </div>

          {/* Per-phase toggles */}
          {drawnPhases.map(ph => {
            const hidden = hiddenPhases.has(ph)
            return (
              <div
                key={ph}
                onClick={() => onToggle(ph as TakeoffPhase)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', cursor: 'pointer',
                  background: 'transparent', transition: 'background 0.1s',
                  opacity: hidden ? 0.5 : 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--to-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Colour swatch */}
                <div style={{
                  width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                  background: phaseColors[ph] ?? '#888',
                  opacity: hidden ? 0.4 : 1,
                }} />
                {/* Phase name */}
                <span style={{ fontSize: 11, flex: 1, color: 'var(--to-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ph.replace('External Works & Landscaping', 'Ext. Works')
                     .replace('Internal Walls & Partitions', 'Int. Walls')
                     .replace('Site Setup & Demolition', 'Demolition')  // legacy compat
                     .replace('Plastering & Boarding', 'Plastering')
                     .replace('Structural Frame', 'Struct. Frame')
                     .replace('Windows & Doors', 'Windows/Doors')
                     .replace('Plumbing & Heating', 'Plumbing')
                     .replace('Drainage & Services', 'Drainage')
                     .replace('Joinery & Fixtures', 'Joinery')
                     .replace('Tiling & Finishes', 'Tiling')
                     .replace('Floors & Screeds', 'Floors')
                     .replace('Preliminaries', 'Prelims')}
                </span>
                {/* Toggle indicator */}
                <span style={{ fontSize: 13, flexShrink: 0, color: hidden ? 'var(--to-muted)' : 'var(--to-accent)' }}>
                  {hidden ? '○' : '●'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function TakeoffPage() {
  const router = useRouter()

  // Project state
  const [project, setProject] = useState<TakeoffProject>(() => loadProject() ?? blankProject())
  // Restore plan image from saved project on first load
  const [planImage, setPlanImage] = useState<string | null>(() => {
    const saved = loadProject()
    return saved?.planImageUrl ?? null
  })

  // Supabase auth — userId loaded once on mount
  const [userId, setUserId] = useState<string | null>(null)
  // Debounced save function — stable ref, created once
  const debouncedSaveRef = useRef(makeDebouncedSave(2000))

  // Canvas / drawing state
  const [tool, setTool] = useState<DrawingTool>('select')
  const [drawPoints, setDrawPoints] = useState<TakeoffPoint[]>([])
  // The measure tool's finished line stays on the plan until it is cleared. It is never saved and never priced.
  const [measureDone, setMeasureDone] = useState<{ points: TakeoffPoint[] } | null>(null)
  useEffect(() => { if (tool !== 'measure') setMeasureDone(null) }, [tool])
  const [mousePos, setMousePos] = useState<TakeoffPoint>({ x: 0, y: 0 })
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activePhase, setActivePhase] = useState<TakeoffPhase>('External Walls')
  const [showGrid, setShowGrid] = useState(true)
  const [svgSize, setSvgSize] = useState({ w: 1200, h: 800 })

  // Panel
  const [panelMode, setPanelMode] = useState<PanelMode>('schedule')
  const [editingItem, setEditingItem] = useState<TakeoffItem | null>(null)
  const [editingElement, setEditingElement] = useState<DrawnElement | null>(null)
  const [phaseDefaults, setPhaseDefaults] = useState<TakeoffItem | null>(null)
  // The item whose assembly calculator window is open, if any. Tied to an item id so selecting a
  // different wall closes it without any extra bookkeeping.
  const [assemblyWindowItemId, setAssemblyWindowItemId] = useState<string | null>(null)
  // Electrics: the kind of point and room for the next click, and the placed point that is selected
  const [electricTypeId, setElectricTypeId] = useState('dbl-socket')
  const [electricRoom, setElectricRoom] = useState('')
  const [selectedElectricPointId, setSelectedElectricPointId] = useState<string | null>(null)
  // Windows & Doors: the kind, size and swing of the next opening, the placed opening that is selected, and where the pointer is (unsnapped) for the ghost
  const [openingKind, setOpeningKind] = useState<OpeningKind>('win-casement')
  const [openingNext, setOpeningNext] = useState<{ widthMm: number; heightMm: number; swing: WdSwing }>({ widthMm: 1200, heightMm: 1200, swing: 'in-left' })
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null)
  const [rawMouse, setRawMouse] = useState<TakeoffPoint | null>(null)
  const [selectedTaskSubphaseId, setSelectedTaskSubphaseId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  // Calibration dialog
  const [showCalib, setShowCalib] = useState(false)
  // Scale presets need the paper size: asked once per plan that is not a PDF page of a known size
  const [showPaperModal, setShowPaperModal] = useState(false)
  const [pendingDenom, setPendingDenom] = useState<number | null>(null)
  const [calibDrawing, setCalibDrawing] = useState(false)
  const [calibPts, setCalibPts] = useState<TakeoffPoint[]>([])
  const [calibReal, setCalibReal] = useState('')
  const [calibLabel, setCalibLabel] = useState('1:100')

  // Header edit
  const [editingName, setEditingName] = useState(false)
  const [showClientModal, setShowClientModal] = useState(false)

  // Theme
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try { return localStorage.getItem(LS_THEME) !== 'light' } catch { return true }
  })
  const toggleTheme = () => setDarkMode(d => {
    const next = !d
    try { localStorage.setItem(LS_THEME, next ? 'dark' : 'light') } catch {}
    return next
  })
  const TV = darkMode ? DARK_VARS : LIGHT_VARS   // theme vars shorthand

  // Toast notification
  const [toast, setToast] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 2800)
  }

  // Construction Layer Editor modal
  const [layerModal, setLayerModal] = useState<{
    layer:   FloorLayer
    makeup:  FloorMakeup
    item:    TakeoffItem
    area:    number
    perim:   number
    accent:  string
  } | null>(null)

  // Reset / recovery state
  const [showClearModal, setShowClearModal]   = useState(false)
  const [showResetModal, setShowResetModal]   = useState(false)
  const [resetInProgress, setResetInProgress] = useState(false)
  const [recoverySnap, setRecoverySnap]       = useState<RecoverySnapshot | null>(() => loadRecoverySnapshot())

  // Floor tool state
  const [floorDrawMode, setFloorDrawMode] = useState<'rect' | 'polygon'>('rect')
  const [activeFloorMakeup, setActiveFloorMakeup] = useState<string>(FLOOR_MAKEUPS[1].id) // default: concrete slab

  // Custom wall types (localStorage — fallback when DB not available)
  const [customWallTypes, setCustomWallTypes] = useState<FloorMakeup[]>([])
  useEffect(() => { setCustomWallTypes(loadCustomWallTypes()) }, [])

  // DB wall types — master source of truth from Back Office (Supabase)
  const [dbWallTypes, setDbWallTypes] = useState<FloorMakeup[]>([])

  // Computed: DB takes precedence; localStorage fallback when DB not loaded yet
  // ALL_WALL_MAKEUPS = WALL_MAKEUPS + DWARF_WALL_MAKEUPS; DB takes precedence when loaded
  const allWallMakeups = dbWallTypes.length > 0 ? dbWallTypes : [...ALL_WALL_MAKEUPS, ...customWallTypes]

  // Back Office labour trades — loaded once, used by LabourCostBuilder in every panel
  const [labourTrades, setLabourTrades] = useState<BOLabourTrade[]>([])

  // Back Office Phases & Tasks — live, replaces the old static ALL_PHASE_SUBPHASES +
  // per-browser local-storage "custom sub-phase" layer entirely. This is deliberately the
  // same data Back Office → Phases & Tasks and Assemblies read/write (Assemblies is just a
  // different view onto these same tables, not a separate source) — so anything changed in
  // Back Office shows up here next time this page loads. Doesn't cover the separate wall/
  // floor "build-up" system (External Walls, Floors & Screeds, Foundations, Plastering &
  // Boarding, Roof) — that already has its own live fetch (fetchWallTypesWithLayers above).
  const [boPhases, setBoPhases] = useState<BOPhase[]>([])
  const [boSubPhases, setBoSubPhases] = useState<BOSubPhase[]>([])
  const [boTasks, setBoTasks] = useState<BOTask[]>([])

  // Map a live BOTask onto the same PhaseTask shape the old static data used, so every
  // call site below (which expects PhaseTask's field names) keeps working unchanged.
  function boTaskToPhaseTask(t: BOTask): PhaseTask {
    return {
      id: t.id, name: t.name, unit: (t.unit as PhaseTaskUnit) || 'nr', defaultQty: t.default_qty,
      labour: t.labour_cost, materials: t.materials_cost, plant: t.plant_cost,
      subcontractor: t.subcontract_cost, other: t.other_cost,
      notes: t.description || t.client_description || undefined,
    }
  }
  // Replaces the old static getAllSubphasesForPhase(phase) from lib/phase-tasks.ts — same
  // name and signature, so nothing below needed to change, just where the data comes from.
  const getAllSubphasesForPhase = useCallback((phaseName: string): PhaseSubphase[] => {
    const phase = boPhases.find(p => p.name === phaseName)
    if (!phase) return []
    return boSubPhases
      .filter(sp => sp.phase_id === phase.id)
      .map((sp): PhaseSubphase => ({
        id: sp.id, phase: phaseName, name: sp.name, markupPct: sp.markup_pct,
        tasks: boTasks.filter(t => t.sub_phase_id === sp.id).map(boTaskToPhaseTask),
      }))
  }, [boPhases, boSubPhases, boTasks])
  // Replaces the old static getTasksForSubphase(subphaseId).
  function getTasksForSubphase(subphaseId: string): PhaseTask[] {
    return boTasks.filter(t => t.sub_phase_id === subphaseId).map(boTaskToPhaseTask)
  }
  // The phase list itself (left-hand sidebar, the phase-assignment dropdown, the layers
  // panel, the schedule summary) — live order + current names from Back Office, falling
  // back to the static canonical list before the fetch completes or if Back Office has no
  // phases yet, so the sidebar isn't empty on first paint.
  const livePhaseNames: TakeoffPhase[] = boPhases.length > 0
    ? [...boPhases].sort((a, b) => a.display_order - b.display_order).map(p => p.name as TakeoffPhase)
    : [...TAKEOFF_PHASES]

  // Custom demolition subphases (loaded from localStorage on mount)
  const [customDemoSubphases, setCustomDemoSubphases] = useState<DemoSubphase[]>([])
  useEffect(() => { setCustomDemoSubphases(loadCustomDemoSubphases()) }, [])

  // The Demolition list (Construction Type) follows Back Office like every other phase: its names, order, prices and markups, and only what is kept (a sub-phase deleted or hidden there is gone here).
  // The ids stay the old built-in ones ('structural', 'wall-removal-calc' ...) for the standard entries, so take-off items saved before this still find theirs; a sub-phase or task added in Back Office
  // uses its own id. A calculator entry keeps its calculator. Until Back Office has loaded (or if it has no Demolition sub-phases at all) the built-in list is used, so the picker is never empty.
  const liveDemoSubs = useMemo((): DemoSubphase[] => {
    const phase = boPhases.find(p => p.name === 'Demolition') ?? boPhases.find(p => p.name === 'Site Setup & Demolition')
    const subs = phase ? boSubPhases.filter(sp => sp.phase_id === phase.id).sort((a, b) => a.display_order - b.display_order) : []
    if (subs.length === 0) return getAllDemoSubphases(customDemoSubphases)
    return subs.map((sp): DemoSubphase => {
      const id = sp.canonical_id?.startsWith('demo-') ? sp.canonical_id.slice(5) : sp.id
      const builtIn = DEFAULT_DEMO_SUBPHASES.find(d => d.id === id)
      const tasks = boTasks.filter(t => t.sub_phase_id === sp.id).sort((a, b) => a.display_order - b.display_order).map((t): DemoTask => {
        const tc = (t as unknown as { canonical_id?: string | null }).canonical_id
        return {
          id: tc?.startsWith('demo-') ? tc.slice(5) : t.id, name: t.name, clientDescription: t.client_description || t.description || '',
          unit: (t.unit || 'item') as DemoTask['unit'], defaultQty: t.default_qty || 1,
          labourCost: t.labour_cost, materialCost: t.materials_cost, plantCost: t.plant_cost, wasteCost: t.waste_cost, subcontractorCost: t.subcontract_cost, otherCost: t.other_cost,
          showInTakeoff: true, showInAiScope: true,
        }
      })
      return { id, name: sp.name, markupPct: sp.markup_pct, tasks, ...(builtIn?.calculatorId ? { calculatorId: builtIn.calculatorId } : {}) }
    })
  }, [boPhases, boSubPhases, boTasks, customDemoSubphases])

  // Refs
  const svgRef = useRef<SVGSVGElement>(null)
  const queuedFinishRef = useRef<DrawnElement | null>(null)
  const queuedFloorMakeupRef = useRef<string | null>(null)
  const queuedTaskSubphaseIdRef = useRef<string | null>(null)
  const queuedTaskIdRef = useRef<string | null>(null)
  const queuedTaskNameRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importJsonRef = useRef<HTMLInputElement>(null)

  // Loading a plan (a PDF's pages take a moment to draw)
  const [pdfLoading, setPdfLoading] = useState(false)
  // Adding a plan: from this computer, or from a customer's files (the contact card's Files)
  const [planChooserOpen, setPlanChooserOpen] = useState(false)
  // a blank sheet to draw on with no plan behind it: its paper, scale and name while it is being asked for
  const [blankForm, setBlankForm] = useState<{ paper: string; denom: number; name: string } | null>(null)
  const [filePickerOpen, setFilePickerOpen] = useState(false)
  // Sheets (plans): the one showing, whether its picture is missing from this device, and a nudge to reload the picture after it is put back
  const activeSheetId = activeSheetIdOf(project)
  const [sheetImageMissing, setSheetImageMissing] = useState(false)
  const [imageNonce, setImageNonce] = useState(0)
  // Plan pictures are kept on this device AND in the account (so a take-off's plans open on any computer): where each sheet's copy in the account has got to
  const [sheetImageLoading, setSheetImageLoading] = useState(false)
  const [pictureSync, setPictureSync] = useState<Record<string, 'saving' | 'saved' | 'failed' | 'too-big'>>({})
  const uploadAttempted = useRef(new Set<string>())
  const autosaveErrorShown = useRef(false)
  // How drawings show on a busy plan (kept per person in this browser, not in the take-off): a white halo under each, a name tag on each, and how much the plan picture is faded
  const [viewHalo, setViewHalo] = useState(true)
  const [viewTags, setViewTags] = useState(true)
  const [viewFade, setViewFade] = useState(30)
  const tagDragRef = useRef<{ id: string; sx: number; sy: number; dx0: number; dy0: number } | null>(null)
  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem('sbc_takeoff_view') ?? 'null')
      if (r && typeof r === 'object') {
        if (typeof r.halo === 'boolean') setViewHalo(r.halo)
        if (typeof r.tags === 'boolean') setViewTags(r.tags)
        if (typeof r.fade === 'number' && r.fade >= 0 && r.fade <= 75) setViewFade(r.fade)
      }
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem('sbc_takeoff_view', JSON.stringify({ halo: viewHalo, tags: viewTags, fade: viewFade })) } catch {} }, [viewHalo, viewTags, viewFade])
  const lastSaveError = useRef('')
  const idMigration = useRef<string | null>(null)
  const oldPictureFolders = useRef<string[]>([])
  const cloudPictureIds = useRef<{ key: string; ids: Set<string> | null } | null>(null)
  const [scheduleSheetFilter, setScheduleSheetFilter] = useState<string>('all')
  // My Take-offs: the list of take-offs saved to the account
  const [showTakeoffList, setShowTakeoffList] = useState(false)
  const [takeoffList, setTakeoffList] = useState<TakeoffSummary[] | null>(null)
  const [takeoffListError, setTakeoffListError] = useState('')
  const [newTakeoffName, setNewTakeoffName] = useState('')
  const [takeoffBusy, setTakeoffBusy] = useState(false)

  // Zoom / pan state
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  // Drawing aids: snap to the corners, ends and mid-points of drawings already on the plan, keep a line horizontal or vertical (Shift does it for one line), type an exact length while drawing, undo and redo
  const [snapOn, setSnapOn] = useState(true)
  const [orthoOn, setOrthoOn] = useState(false)
  const [shiftHeld, setShiftHeld] = useState(false)
  const [snapInfo, setSnapInfo] = useState<SnapResult | null>(null)
  const [typed, setTyped] = useState('')
  const [, setHistoryTick] = useState(0)
  const historyRef = useRef<History<{ elements: DrawnElement[]; items: TakeoffItem[] }> | null>(null)
  const [canvasImgSize, setCanvasImgSize] = useState<{ w: number; h: number } | null>(null)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const hasPannedRef = useRef(false)

  // A take-off from before sheets keeps its one plan inside the project: move it into Sheet 1. The picture goes to the device's own database (off the 5MB localStorage, where one big plan could stop
  // the whole take-off from saving), and the project keeps only the sheet's name and scale.
  useEffect(() => {
    const saved = loadProject()
    if (!saved?.planImageUrl || saved.sheets?.length) return
    const sheetId = uid()
    ;(async () => {
      await putSheetImage(saved.id, sheetId, saved.planImageUrl!)
      setProject(p => {
        if (p.sheets?.length) return p
        const { planImageUrl: _moved, ...rest } = p
        return addSheets(rest as TakeoffProject, [makeSheet(sheetId, 'Plan 1')])
      })
    })()
  }, []) // run once on mount

  // Show the picture of the sheet that is showing: the copy on this device first, then the copy in the account (a take-off opened on another computer), which is kept on this device from then on.
  // A sheet whose picture is in neither place says so, and Add Plan fills it.
  const sheetImageLoadedOnce = useRef(false)
  useEffect(() => {
    setSheetImageLoading(false)
    if (!activeSheetId) return
    let alive = true
    ;(async () => {
      let url = await getSheetImage(project.id, activeSheetId)
      if (!url && userId) {
        if (!alive) return
        setSheetImageLoading(true)
        url = await downloadSheetPicture(createClient(), userId, project.id, activeSheetId)
        if (!alive) return
        setSheetImageLoading(false)
        if (url) {
          await putSheetImage(project.id, activeSheetId, url)
          setPictureSync(m => ({ ...m, [activeSheetId]: 'saved' }))
        }
      }
      if (!alive) return
      setSheetImageMissing(!url)
      setPlanImage(url)
      if (!url) { setCanvasImgSize(null); return }
      const img = new Image()
      img.onload = () => {
        if (!alive) return
        setCanvasImgSize({ w: img.naturalWidth, h: img.naturalHeight })
        // the first picture after opening the page keeps the view as it was; changing sheet fits the new plan to the screen
        if (sheetImageLoadedOnce.current) fitToScreen(img.naturalWidth, img.naturalHeight)
        sheetImageLoadedOnce.current = true
      }
      img.src = url
    })()
    return () => { alive = false }
  }, [activeSheetId, project.id, imageNonce, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // A take-off made before this fix has a short random id, which the account's database refuses (its id is a UUID), so it was only ever saved on this computer. Give it a real id, moving its plan pictures across, then it saves normally.
  useEffect(() => {
    if (isUuid(project.id) || idMigration.current === project.id) return
    if (!project.sheets?.length && project.planImageUrl) return   // a very old one-plan take-off is moved into a sheet first
    idMigration.current = project.id
    const oldId = project.id
    const newId = newProjectId()
    const sheetIds = (project.sheets ?? []).map(s => s.id)
    ;(async () => {
      for (const sid of sheetIds) {
        const url = await getSheetImage(oldId, sid)
        if (url) await putSheetImage(newId, sid, url)
      }
      oldPictureFolders.current.push(oldId)
      setProject(p => (p.id === oldId ? { ...p, id: newId } : p))
      deleteProjectImages(oldId)
    })()
  }, [project.id, project.sheets?.length, project.planImageUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Pictures uploaded to the account under the old reference are removed once the account is known
  useEffect(() => {
    if (!userId) return
    for (const oldId of oldPictureFolders.current.splice(0)) deleteProjectPictures(createClient(), userId, oldId)
  }, [userId, project.id])

  /** Puts a sheet's picture in the account in the background (drawing never waits for it). */
  async function savePictureToAccount(projectId: string, sheetId: string, dataUrl: string) {
    if (!userId) return
    uploadAttempted.current.add(userId + ':' + projectId + ':' + sheetId)
    setPictureSync(m => ({ ...m, [sheetId]: 'saving' }))
    const result = await uploadSheetPicture(createClient(), userId, projectId, sheetId, dataUrl)
    setPictureSync(m => ({ ...m, [sheetId]: result }))
    if (result === 'saved') {
      if (cloudPictureIds.current?.ids) cloudPictureIds.current.ids.add(sheetId)
    } else if (result === 'too-big') {
      showToast('That plan is too big to save to your account (over 10MB even squeezed). It is kept on this computer only.')
    } else {
      showToast('Could not save a plan to your account just now. It is kept on this computer: press the warning on its sheet tab to try again.')
    }
  }

  async function retryPictureToAccount(sheetId: string) {
    const local = await getSheetImage(project.id, sheetId)
    if (local) await savePictureToAccount(project.id, sheetId, local)
  }

  // Plans loaded before pictures were kept in the account (or while offline) are put there once, when the take-off is open.
  useEffect(() => {
    if (!userId || !project.sheets?.length) return
    ;(async () => {
      const sb = createClient()
      const key = userId + ':' + project.id
      if (cloudPictureIds.current?.key !== key) cloudPictureIds.current = { key, ids: await listCloudPictureSheetIds(sb, userId, project.id) }
      const ids = cloudPictureIds.current.ids
      if (!ids) return   // could not read the account's list just now: try again next visit rather than upload blind
      for (const sh of project.sheets ?? []) {
        const k = key + ':' + sh.id
        if (uploadAttempted.current.has(k)) continue
        uploadAttempted.current.add(k)
        if (ids.has(sh.id)) { setPictureSync(m => (m[sh.id] ? m : { ...m, [sh.id]: 'saved' })); continue }
        const local = await getSheetImage(project.id, sh.id)
        if (local) await savePictureToAccount(project.id, sh.id, local)
      }
    })()
  }, [userId, project.id, project.sheets?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Phase layer visibility — phases in this set are hidden on the canvas
  const [hiddenPhases, setHiddenPhases] = useState<Set<TakeoffPhase>>(new Set())
  function togglePhaseVisibility(ph: TakeoffPhase) {
    setHiddenPhases(prev => {
      const next = new Set(prev)
      next.has(ph) ? next.delete(ph) : next.add(ph)
      return next
    })
  }

  // Drag-to-move state
  const dragRef = useRef<{
    id: string
    startSvgX: number
    startSvgY: number
    origPoints: TakeoffPoint[]
    vertexIndex?: number   // set = drag single vertex; undefined = drag whole shape
  } | null>(null)
  const [isDraggingEl, setIsDraggingEl] = useState(false)

  // ── Persist on change ──────────────────────────────────────────────────────
  useEffect(() => {
    const p = { ...project, updatedAt: new Date().toISOString() }
    // Plans are kept in the device's own database once the take-off has sheets: never inside the saved project (localStorage holds about 5MB, and one big plan filling it stopped the whole take-off saving)
    if (p.sheets?.length) delete p.planImageUrl
    else if (planImage) p.planImageUrl = planImage
    // Tier 3 — synchronous write to localStorage (immediate cache + recovery)
    saveProject(p)
    // Tier 3 — debounced async write to Supabase (system of record)
    if (userId && !isEmptyTakeoff(p)) {
      const sb = createClient()
      debouncedSaveRef.current(sb, p, userId, msg => {
        if (autosaveErrorShown.current) return
        autosaveErrorShown.current = true
        showToast('Could not save this take-off to your account: ' + msg + ' It is still kept on this computer.')
      })
    }
  }, [project, planImage, userId])

  // ── Supabase auth + initial cloud sync ─────────────────────────────────────
  // Step 1: get the current user on mount.
  // Step 2: check if the cloud project is newer than localStorage and merge.
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null
      setUserId(uid)
      if (!uid) return

      // Load DB wall types (Back Office master source of truth)
      fetchWallTypesWithLayers(sb, uid).then(types => {
        const makeups = wallTypesToMakeups(types)
        if (makeups.length > 0) setDbWallTypes(makeups)
      })

      // Load Back Office labour trades (for LabourCostBuilder in every panel)
      fetchLabourTrades(sb, uid).then(trades => {
        setLabourTrades(trades.filter(t => t.active))
      })

      // Load Back Office Phases & Tasks live — see the boPhases/boSubPhases/boTasks
      // declaration above for why this replaces the old static + local-storage picker.
      Promise.all([fetchPhases(sb, uid), fetchSubPhases(sb, uid), fetchTasks(sb, uid)]).then(([ph, sp, tk]) => {
        setBoPhases(ph.filter(p => p.active))
        setBoSubPhases(sp.filter(s => s.active))
        setBoTasks(tk.filter(t => t.active))
      })

      // Async cloud sync — merge if the Supabase record has a newer updatedAt
      const local = loadProject()
      if (!local?.id) return
      const remote = await loadTakeoffFromSupabase(sb, local.id, uid)
      if (!remote) return
      const remoteTime = new Date(remote.updatedAt).getTime()
      const localTime  = new Date(local.updatedAt ?? 0).getTime()
      if (remoteTime > localTime) {
        // Cloud is newer — restore remote data (keep planImageUrl from local)
        setProject(prev => ({
          ...remote,
          planImageUrl: prev.planImageUrl,
          sheets: remote.sheets ?? prev.sheets,
          activeSheetId: remote.activeSheetId ?? prev.activeSheetId,
        }))
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle queued element (dblclick batching) ──────────────────────────────
  useEffect(() => {
    const el = queuedFinishRef.current
    if (!el) return
    queuedFinishRef.current = null
    const floorMakeupId = queuedFloorMakeupRef.current
    queuedFloorMakeupRef.current = null
    const taskSubphaseId = queuedTaskSubphaseIdRef.current
    queuedTaskSubphaseIdRef.current = null
    const taskId = queuedTaskIdRef.current
    queuedTaskIdRef.current = null
    const taskName = queuedTaskNameRef.current
    queuedTaskNameRef.current = null

    const item = itemFromElement(el, project.calibration.mpp)
    // With several plans, each priced item notes which sheet it was drawn on (editable, and it travels to the quote)
    if ((project.sheets?.length ?? 0) > 1) item.drawingRef = sheetName(project, el.sheetId) || item.drawingRef

    // Apply task info if this was a click-placed item
    if (taskSubphaseId && taskId) {
      item.taskSubphaseId = taskSubphaseId
      item.taskId = taskId
      if (taskName) item.name = taskName
      item.qty = 1
      item.unit = 'nr'
    }

    // Demolition: a Sub-Phase (and Task) picked before drawing, or a click-placed item, arrives as that Demolition type: a calculator entry opens its calculator, a task entry carries the task's pricing.
    // (Demolition items keep their own demo* fields, so the generic carry-over below does not apply to them.)
    if (item.phase === 'Demolition' && !item.demoSubphaseId) {
      const pickedSubId = taskSubphaseId ?? selectedTaskSubphaseId
      const pickedTaskId = taskId ?? selectedTaskId
      const bo = pickedSubId ? boSubPhases.find(sp => sp.id === pickedSubId) : undefined
      if (bo && boPhases.find(p => p.id === bo.phase_id)?.name === 'Demolition') {
        const dsId = bo.canonical_id?.startsWith('demo-') ? bo.canonical_id.slice(5) : bo.id
        const ds = liveDemoSubs.find(d => d.id === dsId)
        if (ds?.calculatorId) {
          Object.assign(item, { name: ds.name, spec: '', demoSubphaseId: ds.id, demoTaskId: undefined, demoMarkupPct: ds.markupPct, subPhase: ds.name, taskSubphaseId: bo.id, taskId: undefined,
            demoLabour: 0, demoMaterials: 0, demoPlant: 0, demoWaste: 0, demoSubcontractor: 0, demoOther: 0 })
        } else if (ds && ds.tasks.length > 0) {
          const boT = pickedTaskId ? boTasks.find(t => t.id === pickedTaskId) : undefined
          const dt = ds.tasks.find(t => t.name === boT?.name) ?? ds.tasks[0]
          const q = item.qty > 0 ? item.qty : dt.defaultQty
          Object.assign(item, { name: dt.name, spec: dt.clientDescription, demoSubphaseId: ds.id, demoTaskId: dt.id, demoMarkupPct: ds.markupPct, subPhase: ds.name, unit: dt.unit, qty: q,
            taskSubphaseId: undefined, taskId: undefined,
            demoLabour: +(dt.labourCost * q).toFixed(2), demoMaterials: +(dt.materialCost * q).toFixed(2), demoPlant: +(dt.plantCost * q).toFixed(2),
            demoWaste: +(dt.wasteCost * q).toFixed(2), demoSubcontractor: +(dt.subcontractorCost * q).toFixed(2), demoOther: +(dt.otherCost * q).toFixed(2) })
        }
      }
    }

    // A Sub-Phase picked in the properties panel before drawing carries onto the wall it draws.
    // Without this the wall screens ignored it and fell back to their own default (the first
    // build-up type for external walls, the first sub-phase for internal walls). Only an explicit
    // pick counts — the dropdown's un-touched default is what those screens already default to.
    // Walls are lines; a roof is a shape, so any roof element qualifies — but a roof only carries a
    // sub-phase that has a calculator (the others aren't used by the roof screen).
    if (!taskSubphaseId && selectedTaskSubphaseId &&
        ((el.type === 'line' && (item.phase === 'External Walls' || item.phase === 'Internal Walls & Partitions' || item.phase === 'Foundations')) ||
          item.phase === 'Roof' || MARKER_CALC_PHASES.has(item.phase) || (item.phase === 'Foundations' && el.type !== 'line'))) {
      const bo = boSubPhases.find(sp => sp.id === selectedTaskSubphaseId)
      const boPhaseName = bo ? boPhases.find(p => p.id === bo.phase_id)?.name : undefined
      const hasCalculator = !!(bo?.canonical_id && BUILT_ASSEMBLY_CANON_IDS[bo.canonical_id])
      const foundationFits = item.phase !== 'Foundations' || (el.type === 'line' ? FOUNDATION_LINE_CALCS.has(bo?.canonical_id ?? '') : FOUNDATION_SHAPE_CALCS.has(bo?.canonical_id ?? ''))
      if (bo && boPhaseName === item.phase && foundationFits && ((item.phase !== 'Roof' && item.phase !== 'Foundations' && !MARKER_CALC_PHASES.has(item.phase)) || hasCalculator)) {
        item.taskSubphaseId = bo.id
        item.subPhase = bo.name
        if (item.phase === 'Foundations') {
          if (el.type === 'line') {
            const pairedType = Object.entries(FOUNDATION_MAKEUP_BY_TYPE).find(([, mk]) => mk && WALL_MAKEUP_TO_SUBPHASE_CANONICAL[mk] === bo.canonical_id)?.[0]
            if (pairedType) item.foundationType = pairedType
          } else {
            const pairedMakeupId = Object.keys(WALL_MAKEUP_TO_SUBPHASE_CANONICAL).find(k => WALL_MAKEUP_TO_SUBPHASE_CANONICAL[k] === bo.canonical_id)
            const pairedMakeup = (PHASE_MAKEUPS['Foundations'] ?? []).find(m => m.id === pairedMakeupId)
            if (pairedMakeup) { item.floorMakeupId = pairedMakeup.id; item.spec = pairedMakeup.clientDescription }
          }
        }
        if (item.phase === 'External Walls' || item.phase === 'Roof') {
          // Some sub-phases pair with one of the Build-up Types (e.g. Cavity Wall – Full Fill, Flat
          // Roof) — set that too, so the item arrives as that type rather than the default one.
          const pairedMakeupId = Object.keys(WALL_MAKEUP_TO_SUBPHASE_CANONICAL)
            .find(k => WALL_MAKEUP_TO_SUBPHASE_CANONICAL[k] === bo.canonical_id)
          const pairedMakeup = pairedMakeupId
            ? (item.phase === 'Roof' ? (PHASE_MAKEUPS['Roof'] ?? []) : allWallMakeups).find(m => m.id === pairedMakeupId)
            : undefined
          if (pairedMakeup) { item.floorMakeupId = pairedMakeup.id; item.spec = pairedMakeup.clientDescription }
        }
      }
    }

    // Apply phase defaults to the new item
    if (phaseDefaults) {
      // Copy over phase default properties (but keep element-specific ones)
      item.wallHeight = item.wallHeight ?? phaseDefaults.wallHeight
      item.wallBandPx = item.wallBandPx ?? phaseDefaults.wallBandPx
      item.foundationWidth = item.foundationWidth ?? phaseDefaults.foundationWidth
      item.foundationDepth = item.foundationDepth ?? phaseDefaults.foundationDepth
      item.foundationType = item.foundationType ?? phaseDefaults.foundationType
      if (phaseDefaults.spec) item.spec = item.spec ?? phaseDefaults.spec
      if (phaseDefaults.subPhase) item.subPhase = item.subPhase ?? phaseDefaults.subPhase
    }

    // Floor-specific enrichment
    if (floorMakeupId) {
      item.floorMakeupId = floorMakeupId
      const makeup = FLOOR_MAKEUPS.find(m => m.id === floorMakeupId)
      if (makeup) item.spec = makeup.clientDescription
      // Compute perimeter from geometry
      if (el.type === 'rect' && el.points.length >= 2) {
        item.perimeter = rectPerimeter(el.points, project.calibration.mpp)
      } else if (el.type === 'polygon' && el.points.length >= 3) {
        item.perimeter = polyPerimeter(el.points, project.calibration.mpp)
      }
    }

    setProject(p => ({
      ...p,
      elements: [...p.elements, el],
      items: [...p.items, item],
    }))
    setSelectedId(el.id)
    setPanelMode('properties')
    setEditingElement(el)
    setEditingItem(item)
    setPhaseDefaults(null)
    // Reset task selection after placing item
    setSelectedTaskSubphaseId(null)
    setSelectedTaskId(null)
  })

  // ── Keep editingItem in sync when project.items is recalculated ──────────────
  useEffect(() => {
    if (!editingItem) return
    const fresh = project.items.find(it => it.id === editingItem.id)
    if (fresh && fresh !== editingItem) setEditingItem(fresh)
  }, [project.items]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── SVG container resize ───────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
  const scheduleContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const obs = new ResizeObserver(entries => {
      const el = entries[0]?.contentRect
      if (el) setSvgSize({ w: el.width, h: el.height })
    })
    if (containerRef.current) obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // ── Fit image to canvas ────────────────────────────────────────────────────
  function fitToScreen(imgW?: number, imgH?: number) {
    const iw = imgW ?? canvasImgSize?.w
    const ih = imgH ?? canvasImgSize?.h
    if (!iw || !ih) { setZoom(1); setPanOffset({ x: 0, y: 0 }); return }
    const cw = svgSize.w
    const ch = svgSize.h
    const scale = Math.min(cw / iw, ch / ih) * 0.95
    setPanOffset({ x: (cw - iw * scale) / 2, y: (ch - ih * scale) / 2 })
    setZoom(scale)
  }

  // ── SVG coordinate helper (accounts for zoom/pan) ──────────────────────────
  // Accepts any mouse event (SVG-level or element-level)
  function svgCoords(e: React.MouseEvent): TakeoffPoint {
    const rect = svgRef.current!.getBoundingClientRect()
    const rawX = e.clientX - rect.left
    const rawY = e.clientY - rect.top
    return { x: (rawX - panOffset.x) / zoom, y: (rawY - panOffset.y) / zoom }
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    // a name tag being dragged out of the way (the offset is kept on its drawing)
    if (tagDragRef.current) {
      const pt = svgCoords(e)
      const d = tagDragRef.current
      const dx = d.dx0 + (pt.x - d.sx), dy = d.dy0 + (pt.y - d.sy)
      setProject(p => ({ ...p, elements: p.elements.map(el => (el.id === d.id ? { ...el, tagDx: dx, tagDy: dy } : el)) }))
      return
    }
    // Element / vertex drag takes priority over everything
    if (dragRef.current) {
      const pt = svgCoords(e)
      let dx = pt.x - dragRef.current.startSvgX
      let dy = pt.y - dragRef.current.startSvgY
      const id = dragRef.current.id
      const orig = dragRef.current.origPoints
      const vi = dragRef.current.vertexIndex
      // a corner being dragged snaps to the corners, ends and mid-points of the other drawings
      if (vi !== undefined && snapOn) {
        const dragged = project.elements.find(el => el.id === id)
        const handle = dragged ? getElVertexHandles({ ...dragged, points: orig })[vi] : undefined
        if (dragged && handle) {
          const want = { x: handle.x + dx, y: handle.y + dy }
          const r = snapPoint(want, { anchors: anchorsFor(elementsOnActiveSheet(project).filter(el => el.id !== id && !hiddenPhases.has(el.phase))), radius: 10 / zoom, snap: true, ortho: false })
          dx += r.pt.x - want.x; dy += r.pt.y - want.y
          setSnapInfo(r.kind === 'none' ? null : r)
        }
      }
      setProject(prev => ({
        ...prev,
        elements: prev.elements.map(el => {
          if (el.id !== id) return el
          if (vi === undefined) {
            // Whole-shape drag (existing behaviour)
            return { ...el, points: orig.map(p => ({ x: p.x + dx, y: p.y + dy })) }
          }
          // Single-vertex drag
          if (el.type === 'rect') {
            // Rect stores [p0, p1]. Virtual corners: 0=TL, 1=TR, 2=BR, 3=BL
            const p0 = { ...orig[0] }, p1 = { ...orig[1] }
            if      (vi === 0) { p0.x += dx; p0.y += dy }
            else if (vi === 1) { p1.x += dx; p0.y += dy }
            else if (vi === 2) { p1.x += dx; p1.y += dy }
            else if (vi === 3) { p0.x += dx; p1.y += dy }
            return { ...el, points: [p0, p1] }
          }
          // Line / polygon: move just the indexed point
          return { ...el, points: orig.map((p, i) => i === vi ? { x: p.x + dx, y: p.y + dy } : p) }
        }),
      }))
      return
    }
    if (isPanning) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasPannedRef.current = true
      setPanOffset({
        x: panStart.current.panX + dx,
        y: panStart.current.panY + dy,
      })
      return
    }
    if (tool === 'opening') setRawMouse(svgCoords(e))
    const snapped = drawingPoint(svgCoords(e))
    setMousePos(snapped.pt)
    setSnapInfo(snapped.kind === 'none' ? null : snapped)
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    // Middle mouse, Space+left, or left button in select mode on canvas background = pan
    // (element onMouseDown calls stopPropagation so this won't fire for element clicks)
    if (!calibDrawing && (e.button === 1 || (e.button === 0 && spaceHeld) || (e.button === 0 && tool === 'select'))) {
      e.preventDefault()
      hasPannedRef.current = false
      setIsPanning(true)
      panStart.current = { x: e.clientX, y: e.clientY, panX: panOffset.x, panY: panOffset.y }
    }
  }

  function handleMouseUp() {
    if (tagDragRef.current) { tagDragRef.current = null; hasPannedRef.current = true; return }
    if (dragRef.current) {
      // Mark as "panned" so handleSvgClick ignores the synthetic click that fires
      // after mouseup. When mousedown is on the vertex circle and mouseup lands on
      // the SVG background, the browser fires a click on the SVG (lowest common
      // ancestor), bypassing the circle's onClick stopPropagation. Without this,
      // that click would add a draw point in line/polygon mode.
      hasPannedRef.current = true
      dragRef.current = null
      setIsDraggingEl(false)
      setSnapInfo(null)
      // Recalculate measurements after move
      setProject(p => ({ ...p, items: recalcItemsForMpp(p.items, p.elements, p.calibration.mpp, activeSheetElementIds(p)) }))
      return
    }
    if (isPanning) setIsPanning(false)
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const newZoom = Math.max(0.05, Math.min(20, zoom * factor))
    // Zoom toward cursor
    setPanOffset({
      x: mx - (mx - panOffset.x) * (newZoom / zoom),
      y: my - (my - panOffset.y) * (newZoom / zoom),
    })
    setZoom(newZoom)
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (hasPannedRef.current) { hasPannedRef.current = false; return }
    // Calibration takes priority over everything else
    if (calibDrawing) {
      const pt = drawingPoint(svgCoords(e)).pt
      setCalibPts(prev => {
        const next = [...prev, pt]
        // After 2nd point, auto-reopen the dialog so user can enter the real length
        if (next.length >= 2) setShowCalib(true)
        return next.slice(0, 2)
      })
      return
    }
    if (tool === 'electric') {
      if (activePhase !== 'Electrics') { showToast('⚡ Choose the Electrics phase to place electrical points'); return }
      placeElectricPoint(svgCoords(e))
      return
    }
    if (tool === 'opening') {
      placeOpening(svgCoords(e))
      return
    }
    if (tool === 'measure') {
      setMeasureDone(null)
      const mp = drawingPoint(svgCoords(e)).pt
      setDrawPoints(prev => [...prev, mp])
      setIsDrawing(true)
      return
    }
    if (tool === 'select') return
    const pt = drawingPoint(svgCoords(e)).pt
    setTyped('')

    // Click tool for item-based tasks
    if (tool === 'click') {
      if (!selectedTaskId || !selectedTaskSubphaseId) {
        showToast('⚠️ Please select a task from the Properties panel first')
        return
      }
      const taskSubs = getAllSubphasesForPhase(activePhase)
      const sub = taskSubs.find(s => s.id === selectedTaskSubphaseId)
      const task = sub?.tasks.find(t => t.id === selectedTaskId)
      if (!task) {
        showToast('⚠️ Could not find selected task')
        return
      }
      finishElement('rect', [pt, { x: pt.x + 20, y: pt.y + 20 }], false)
      // Mark this element as task-based so it renders as a point marker
      queuedTaskSubphaseIdRef.current = selectedTaskSubphaseId
      queuedTaskIdRef.current = selectedTaskId
      queuedTaskNameRef.current = task.name
      return
    }

    // Floor tool
    if (tool === 'floor') {
      if (floorDrawMode === 'rect') {
        if (!isDrawing) {
          setDrawPoints([pt]); setIsDrawing(true)
        } else {
          finishElement('rect', [drawPoints[0], pt], true)
        }
      } else {
        // polygon mode — accumulate points, finish on dblclick
        setDrawPoints(prev => [...prev, pt])
        setIsDrawing(true)
      }
      return
    }

    if (tool === 'rect') {
      if (!isDrawing) {
        setDrawPoints([pt])
        setIsDrawing(true)
      } else {
        // finish rect on second click
        const pts = [drawPoints[0], pt]
        finishElement('rect', pts)
      }
      return
    }
    // line / polygon: accumulate points
    setDrawPoints(prev => [...prev, pt])
    setIsDrawing(true)
  }

  function handleSvgDblClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool === 'measure') {
      e.preventDefault()
      // the double-click's two clicks leave a repeated point at the end: drop points that sit on the one before
      const pts = drawPoints.filter((p, i) => i === 0 || Math.hypot(p.x - drawPoints[i - 1].x, p.y - drawPoints[i - 1].y) > 1.5)
      setDrawPoints([])
      setIsDrawing(false)
      if (pts.length >= 2) setMeasureDone({ points: pts })
      return
    }
    if (tool === 'select' || tool === 'rect') return
    if (tool === 'floor' && floorDrawMode === 'rect') return
    e.preventDefault()
    const pts = [...drawPoints]
    if (pts.length < 2) { setDrawPoints([]); setIsDrawing(false); return }
    if (tool === 'floor') {
      if (pts.length < 3) { setDrawPoints([]); setIsDrawing(false); return }
      finishElement('polygon', pts, true)
    } else {
      finishElement(tool as 'line' | 'polygon', pts)
    }
  }

  function finishElement(type: 'line' | 'rect' | 'polygon', pts: TakeoffPoint[], isFloor = false) {
    const phase: TakeoffPhase = isFloor ? 'Floors & Screeds' : activePhase
    const color = PHASE_COLORS[phase]
    const shortId = Date.now().toString(36).slice(-4)
    const label = isFloor
      ? `Floor area ${shortId}`
      : `${activePhase} ${shortId}`
    const el: DrawnElement = { id: uid(), type, points: pts, phase, label, color, ...(activeSheetId ? { sheetId: activeSheetId } : {}) }
    // Capture floor makeup before state update
    if (isFloor) queuedFloorMakeupRef.current = activeFloorMakeup
    setDrawPoints(_ => {
      setIsDrawing(false)
      queuedFinishRef.current = el
      return []
    })
  }

  // ── Delete selected element + its item ────────────────────────────────────
  function deleteSelected() {
    if (!selectedId) return
    setProject(p => ({
      ...p,
      elements: p.elements.filter(el => el.id !== selectedId),
      items: p.items.filter(it => it.elementId !== selectedId),
    }))
    setSelectedId(null)
    setEditingElement(null)
    setEditingItem(null)
  }

  // ── Assembly calculators ───────────────────────────────────────────────────
  // Whether a drawn item has a real assembly calculator, and which. Internal walls resolve it
  // through the real Back Office sub-phase (taskSubphaseId); external walls through the Build-up
  // Type, which is keyed by floorMakeupId (WALL_MAKEUPS/bo_wall_types) — a separate id space from
  // bo_sub_phases, bridged by WALL_MAKEUP_TO_SUBPHASE_CANONICAL.
  // A demolition item picked on a calculator entry in the Construction Type list (Wall Removal / Knock-Through): the entry, or undefined
  function demoCalcSub(it: TakeoffItem) {
    if (!(it.phase === 'Demolition' || (it.phase as string) === 'Site Setup & Demolition') || !it.demoSubphaseId) return undefined
    return liveDemoSubs.find(s => s.id === it.demoSubphaseId && !!s.calculatorId)
  }
  function resolveBuiltAssembly(it: TakeoffItem) {
    if (it.electricsSummary) return BUILT_ASSEMBLY_CANON_IDS['elec-install']
    if (it.wdSummary) return BUILT_ASSEMBLY_CANON_IDS['wd-schedule']
    const demoCalc = demoCalcSub(it)
    if (demoCalc?.calculatorId) return BUILT_ASSEMBLY_CANON_IDS[demoCalc.calculatorId]
    // External walls and roofs both: a calculator picked by sub-phase, else the Build-up Type.
    if (it.phase === 'External Walls' || it.phase === 'Roof') {
      // A calculator picked by Sub-Phase (dwarf wall, sleeper wall, ...) — those have no Build-up
      // Type of their own, so the sub-phase decides. Checked first; otherwise the Build-up Type.
      const boSub = it.taskSubphaseId ? boSubPhases.find(sp => sp.id === it.taskSubphaseId) : undefined
      const bySubPhase = boSub?.canonical_id ? BUILT_ASSEMBLY_CANON_IDS[boSub.canonical_id] : undefined
      if (bySubPhase) return bySubPhase
      const canonical = it.floorMakeupId ? WALL_MAKEUP_TO_SUBPHASE_CANONICAL[it.floorMakeupId] : undefined
      return canonical ? BUILT_ASSEMBLY_CANON_IDS[canonical] : undefined
    }
    if (MARKER_CALC_PHASES.has(it.phase) && !it.taskId) {
      // (an item that already carries a flat task from before the calculator existed stays a task item until its sub-phase is changed)
      const boSub = it.taskSubphaseId ? boSubPhases.find(sp => sp.id === it.taskSubphaseId) : undefined
      return boSub?.canonical_id ? BUILT_ASSEMBLY_CANON_IDS[boSub.canonical_id] : undefined
    }
    if (it.phase === 'Floors & Screeds') {
      // by the sub-phase picked (a calculator listed under the Build-Up Type), else by the Build-Up Type that pairs with one
      const boSub = it.taskSubphaseId ? boSubPhases.find(sp => sp.id === it.taskSubphaseId) : undefined
      if (boSub?.canonical_id && FLOOR_SHAPE_CALCS.has(boSub.canonical_id)) return BUILT_ASSEMBLY_CANON_IDS[boSub.canonical_id]
      const canonical = it.floorMakeupId ? WALL_MAKEUP_TO_SUBPHASE_CANONICAL[it.floorMakeupId] : undefined
      return canonical && FLOOR_SHAPE_CALCS.has(canonical) ? BUILT_ASSEMBLY_CANON_IDS[canonical] : undefined
    }
    const isLine = (it.elementId ? project.elements.find(e => e.id === it.elementId) : null)?.type === 'line'
    if (it.phase === 'Foundations' && isLine) {
      const mk = FOUNDATION_MAKEUP_BY_TYPE[it.foundationType ?? 'trench_fill']
      const canonical = mk ? WALL_MAKEUP_TO_SUBPHASE_CANONICAL[mk] : undefined
      return canonical && FOUNDATION_LINE_CALCS.has(canonical) ? BUILT_ASSEMBLY_CANON_IDS[canonical] : undefined
    }
    if (it.phase === 'Foundations') {
      // A shape in Foundations: a raft or pad foundations, by the sub-phase picked or the Build-Up Type
      const boSub = it.taskSubphaseId ? boSubPhases.find(sp => sp.id === it.taskSubphaseId) : undefined
      if (boSub?.canonical_id && FOUNDATION_SHAPE_CALCS.has(boSub.canonical_id)) return BUILT_ASSEMBLY_CANON_IDS[boSub.canonical_id]
      const canonical = it.floorMakeupId ? WALL_MAKEUP_TO_SUBPHASE_CANONICAL[it.floorMakeupId] : undefined
      return canonical && FOUNDATION_SHAPE_CALCS.has(canonical) ? BUILT_ASSEMBLY_CANON_IDS[canonical] : undefined
    }
    if (it.phase === 'Internal Walls & Partitions' && isLine) {
      const subs = getAllSubphasesForPhase('Internal Walls & Partitions')
      const sel = subs.find(s => s.id === it.taskSubphaseId) ?? subs[0]
      const bo = sel ? boSubPhases.find(sp => sp.id === sel.id) : undefined
      return bo?.canonical_id ? BUILT_ASSEMBLY_CANON_IDS[bo.canonical_id] : undefined
    }
    return undefined
  }

  // The box a drawn shape sits in, in mm: its longer side and its shorter. A roof calculator is sized
  // from this (the joists span the shorter side); for a shape that isn't a rectangle it's the
  // bounding box, so the calculator's own length and width are there to match it.
  function drawnBoxMm(it: TakeoffItem): { lengthMm: number; widthMm: number } | undefined {
    const el = it.elementId ? project.elements.find(e => e.id === it.elementId) : undefined
    if (!el || el.points.length < 2) return undefined
    const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y)
    const w = (Math.max(...xs) - Math.min(...xs)) * project.calibration.mpp * 1000
    const h = (Math.max(...ys) - Math.min(...ys)) * project.calibration.mpp * 1000
    const long = Math.max(w, h), short = Math.min(w, h)
    return long > 0 ? { lengthMm: Math.round(long), widthMm: Math.round(short) } : undefined
  }

  // The area and the perimeter of a drawn floor, in m² and m (the shoelace formula on its corners). A floor calculator is sized from these.
  function drawnAreaPerimeter(it: TakeoffItem): { areaM2: number; perimeterM: number } | undefined {
    const el = it.elementId ? project.elements.find(e => e.id === it.elementId) : undefined
    if (!el || el.points.length < 3) return undefined
    const mpp = project.calibration.mpp
    let a = 0, p = 0
    for (let i = 0; i < el.points.length; i++) {
      const q = el.points[i], r = el.points[(i + 1) % el.points.length]
      a += q.x * r.y - r.x * q.y
      p += Math.hypot(r.x - q.x, r.y - q.y)
    }
    const areaM2 = Math.abs(a) / 2 * mpp * mpp
    return areaM2 > 0 ? { areaM2: +areaM2.toFixed(2), perimeterM: +(p * mpp).toFixed(2) } : undefined
  }

  // ── Electrical points (Electrics) ─────────────────────────────────────────
  // Points are kept on one "Electrical installation" item (created the first time one is needed) so they save and load with the project like
  // everything else. The electrics calculator is fed room counts worked out from them (planRoomsFromPoints) and its saved state is kept here too.
  const electricsItem = project.items.find(it => it.electricsSummary)
  const electricPoints: ElectricPoint[] = electricsItem?.electricPoints ?? []

  function newElectricsItem(): TakeoffItem {
    const sub = boSubPhases.find(sp => sp.canonical_id === 'elec-install')
    return { id: ELECTRICS_ITEM_ID, name: 'Electrical installation', phase: 'Electrics', qty: 1, unit: 'item', electricsSummary: true, electricPoints: [], ...(sub && { taskSubphaseId: sub.id, subPhase: sub.name }) }
  }

  function changeElectricItem(fn: (it: TakeoffItem) => TakeoffItem) {
    setProject(p => {
      const items = p.items.some(it => it.electricsSummary) ? p.items : [...p.items, newElectricsItem()]
      return { ...p, items: items.map(it => it.electricsSummary ? fn(it) : it) }
    })
  }

  function changeElectricPoints(fn: (pts: ElectricPoint[]) => ElectricPoint[]) {
    changeElectricItem(it => ({ ...it, electricPoints: fn(it.electricPoints ?? []) }))
  }

  // Named rooms drawn in Floors, as shapes, so a point takes the room it falls in
  function electricRoomShapes() {
    return elementsOnActiveSheet(project)
      .filter(el => el.phase === 'Floors & Screeds' && el.points.length >= 2)
      .map(el => ({ name: project.items.find(it => it.elementId === el.id)?.roomName ?? '', points: el.type === 'rect' ? rectToPolygon(el.points) : el.points }))
  }

  function placeElectricPoint(pt: TakeoffPoint) {
    const room = roomAtPoint(pt, electricRoomShapes()) ?? electricRoom
    const id = uid()
    changeElectricPoints(pts => [...pts, { id, typeId: electricTypeId, roomName: room, x: pt.x, y: pt.y, ...(activeSheetId ? { sheetId: activeSheetId } : {}) }])
    setSelectedElectricPointId(id)
  }

  function startElectricPointDrag(e: React.MouseEvent, pt: ElectricPoint) {
    if (tool !== 'select') return
    e.stopPropagation()
    setSelectedElectricPointId(pt.id)
    setPanelMode('properties')
    setEditingItem(electricsItem ?? null)
    const rect = svgRef.current!.getBoundingClientRect()
    const pan = panOffset, z = zoom
    const move = (ev: MouseEvent) => {
      const x = (ev.clientX - rect.left - pan.x) / z, y = (ev.clientY - rect.top - pan.y) / z
      changeElectricPoints(pts => pts.map(q => q.id === pt.id ? { ...q, x, y } : q))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // ── Doors and windows placed on walls (Windows & Doors) ───────────────────
  // They are kept on one "Windows and doors" item (created the first time one is placed) so they save and load with the project; each is a distance along its wall's drawn line, so it keeps its place when the wall is reshaped.
  // The Windows & Doors calculator is fed them (PlanOpening) and keeps its own openings in step with the plan until one is typed over.
  const wdItem = project.items.find(it => it.wdSummary)
  const allPlaced: PlacedOpening[] = wdItem?.placedOpenings ?? []
  // an opening whose wall has been deleted is not shown or counted (and comes back with the wall if the deletion is undone)
  const livePlaced = allPlaced.filter(o => project.elements.some(e => e.id === o.wallId))

  function newWdItem(): TakeoffItem {
    const sub = boSubPhases.find(sp => sp.canonical_id === 'wd-schedule')
    return { id: WD_ITEM_ID, name: 'Windows and doors', phase: 'Windows & Doors', qty: 1, unit: 'item', wdSummary: true, placedOpenings: [], ...(sub && { taskSubphaseId: sub.id, subPhase: sub.name }) }
  }
  function changeWdItem(fn: (it: TakeoffItem) => TakeoffItem) {
    setProject(p => {
      const items = p.items.some(it => it.wdSummary) ? p.items : [...p.items, newWdItem()]
      return { ...p, items: items.map(it => it.wdSummary ? fn(it) : it) }
    })
  }
  function changePlaced(fn: (list: PlacedOpening[]) => PlacedOpening[]) {
    setProject(p => {
      const base = p.items.some(it => it.wdSummary) ? p.items : [...p.items, newWdItem()]
      let placed: PlacedOpening[] = []
      const items = base.map(it => {
        if (!it.wdSummary) return it
        placed = fn(it.placedOpenings ?? [])
        return { ...it, placedOpenings: placed }
      })
      // an opening whose wall is gone takes nothing off, and the walls it is on take it off their area
      return { ...p, items: withDrawnOpenings(items, placed.filter(o => p.elements.some(e => e.id === o.wallId))) }
    })
  }
  function pickOpeningKind(k: OpeningKind) {
    const info = WD_KIND_BY_ID[k]
    setOpeningKind(k)
    setOpeningNext(n => ({ ...n, widthMm: info.stdW, heightMm: info.stdH }))
  }

  /** a drawn wall's line (a rectangle or polygon wall is a closed outline) and its two faces: where an opening is cut and drawn */
  function wallGeometry(el: DrawnElement): { path: TakeoffPoint[]; closed: boolean; band: WallBand } | null {
    if (el.phase !== 'External Walls' && el.phase !== 'Internal Walls & Partitions') return null
    const mpp = project.calibration.mpp
    if (!(mpp > 0)) return null
    const closed = el.type !== 'line'
    const path = el.type === 'rect' ? cornersOf(el) : el.points
    if (path.length < 2) return null
    const ws = wallSpecFor(el)
    let band: WallBand | null = ws ? wallBand(path, ws.spec, mpp, { ref: ws.ref, closed, flip: ws.flip }) : null
    if (!band) {
      const half = project.items.find(it => it.elementId === el.id)?.wallBandPx ?? 9   // a wall not drawn at real thickness is a band centred on the line
      band = { lo: -half, hi: half, inside: closed && signedArea(path) < 0 ? -1 : 1 }
    }
    return { path, closed, band }
  }

  /** the wall (on the showing sheet) nearest a point, if the point is on it or close beside it */
  function nearestWall(pt: TakeoffPoint) {
    let best: { el: DrawnElement; g: NonNullable<ReturnType<typeof wallGeometry>>; dist: number; score: number; off: number } | null = null
    for (const el of elementsOnActiveSheet(project)) {
      if (hiddenPhases.has(el.phase)) continue
      const g = wallGeometry(el)
      if (!g) continue
      const loc = locateOnPath(g.path, g.closed, pt)
      if (!loc) continue
      const across = (pt.x - loc.x) * -loc.ty + (pt.y - loc.y) * loc.tx   // which side of the line, and how far, the point is
      const score = across < g.band.lo ? g.band.lo - across : across > g.band.hi ? across - g.band.hi : 0
      if (!best || score < best.score || (score === best.score && loc.off < best.off)) best = { el, g, dist: loc.dist, score, off: loc.off }
    }
    return best && best.score <= 24 / zoom ? best : null
  }

  function placeOpening(pt: TakeoffPoint) {
    const mpp = project.calibration.mpp
    if (!(mpp > 0)) { showToast('Set the scale of the plan first, so the openings are the right size'); return }
    const hit = nearestWall(pt)
    if (!hit) { showToast('Click on a wall to put the opening in it (draw the walls first in External Walls or Internal Walls & Partitions)'); return }
    const half = openingNext.widthMm / (mpp * 1000) / 2
    const id = uid()
    const ref = nextOpeningRef(allPlaced, openingKind)
    const distPx = clampDist(hit.g.path, hit.g.closed, hit.dist, half)
    changePlaced(list => [...list, { id, wallId: hit.el.id, distPx, kind: openingKind, widthMm: openingNext.widthMm, heightMm: openingNext.heightMm, swing: openingNext.swing, ref, ...(activeSheetId ? { sheetId: activeSheetId } : {}) }])
    setSelectedOpeningId(id)
  }

  function deleteOpening(id: string) {
    changePlaced(list => list.filter(o => o.id !== id))
    setSelectedOpeningId(null)
  }

  /** moves an opening to a distance (mm to its centre) along its own wall */
  function moveOpeningAlong(id: string, mm: number) {
    const o = allPlaced.find(q => q.id === id)
    const el = o && project.elements.find(e => e.id === o.wallId)
    const g = el && wallGeometry(el)
    if (!o || !g) return
    const mpp = project.calibration.mpp
    changePlaced(list => list.map(q => q.id === id ? { ...q, distPx: clampDist(g.path, g.closed, mm / (mpp * 1000), q.widthMm / (mpp * 1000) / 2) } : q))
  }

  function startOpeningDrag(e: React.MouseEvent, o: PlacedOpening) {
    if (tool !== 'select') return
    e.stopPropagation()
    setSelectedOpeningId(o.id)
    setSelectedId(null); setEditingElement(null)
    setPanelMode('properties')
    setEditingItem(wdItem ?? null)
    const rect = svgRef.current!.getBoundingClientRect()
    const pan = panOffset, z = zoom
    const mpp = project.calibration.mpp
    const move = (ev: MouseEvent) => {
      const pt = { x: (ev.clientX - rect.left - pan.x) / z, y: (ev.clientY - rect.top - pan.y) / z }
      const hit = nearestWall(pt)
      if (!hit) return
      const distPx = clampDist(hit.g.path, hit.g.closed, hit.dist, o.widthMm / (mpp * 1000) / 2)
      changePlaced(list => list.map(q => q.id === o.id ? { ...q, wallId: hit.el.id, distPx } : q))
    }
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  /** the openings drawn on the walls: the wall is cut (a white gap), the jambs, a window's glass, a door's leaf and swing arc, bi-fold panels; with the ghost of the next one under the pointer while placing */
  function renderOpenings() {
    const mpp = project.calibration.mpp
    if (!(mpp > 0) || hiddenPhases.has('Windows & Doors')) return null
    const els = elementsOnActiveSheet(project)
    const colourOf = (k: OpeningKind) => (k.startsWith('win-') ? OPENING_COLOUR.win : k.startsWith('door-int-') ? OPENING_COLOUR.int : OPENING_COLOUR.ext)
    const sw = (n: number) => n / zoom
    const draw = (shape: NonNullable<ReturnType<typeof openingShape>>, colour: string, key: string, text: string | null, picked: boolean) => (
      <g key={key}>
        {shape.prims.map((pr, i) => {
          if (pr.type === 'poly') return <polygon key={i} points={pr.pts.map(q => q.x + ',' + q.y).join(' ')} fill="#ffffff" stroke="none" />
          if (pr.type === 'arc') return <path key={i} d={`M${pr.from.x} ${pr.from.y}A${pr.r} ${pr.r} 0 0 ${pr.sweep} ${pr.to.x} ${pr.to.y}`} fill="none" stroke={colour} strokeWidth={sw(1)} strokeDasharray={`${sw(4)} ${sw(3)}`} />
          const st = pr.style
          return <line key={i} x1={pr.a.x} y1={pr.a.y} x2={pr.b.x} y2={pr.b.y} stroke={st === 'jamb' ? '#222' : st === 'glass' ? colour : colour} strokeWidth={sw(st === 'jamb' ? 1.6 : st === 'leaf' ? 2.2 : st === 'frame' ? 1.4 : 1.1)} strokeDasharray={st === 'dash' ? `${sw(5)} ${sw(3)}` : undefined} strokeLinecap="round" />
        })}
        {picked && <polygon points={shape.gap.map(q => q.x + ',' + q.y).join(' ')} fill="none" stroke="#1565c0" strokeWidth={sw(2.5)} strokeDasharray={`${sw(6)} ${sw(3)}`} />}
        {text !== null && <text x={shape.labelAt.x} y={shape.labelAt.y} textAnchor="middle" dominantBaseline="central" fontSize={sw(10)} fontWeight={700} fill={colour} stroke="#fff" strokeWidth={sw(3)} paintOrder="stroke" style={{ pointerEvents: 'none' }}>{text}</text>}
      </g>
    )
    const placed = allPlaced.map(o => {
      const el = els.find(e => e.id === o.wallId)
      const g = el && wallGeometry(el)
      const shape = g ? openingShape(g.path, g.closed, o, mpp, g.band, sw(10)) : null
      if (!shape) return null
      return (
        <g key={'op-' + o.id} onMouseDown={ev => startOpeningDrag(ev, o)} onClick={ev => { if (tool === 'select') ev.stopPropagation() }}
          style={{ cursor: tool === 'select' ? 'move' : 'inherit', pointerEvents: tool === 'select' ? undefined : 'none' }}>
          {draw(shape, colourOf(o.kind), 'd', o.ref, o.id === selectedOpeningId)}
          <polygon points={shape.gap.map(q => q.x + ',' + q.y).join(' ')} fill="rgba(0,0,0,0.001)" stroke="none" />
        </g>
      )
    })
    let ghost: React.ReactNode = null
    if (tool === 'opening' && rawMouse) {
      const hit = nearestWall(rawMouse)
      if (hit) {
        const half = openingNext.widthMm / (mpp * 1000) / 2
        const shape = openingShape(hit.g.path, hit.g.closed, { distPx: clampDist(hit.g.path, hit.g.closed, hit.dist, half), kind: openingKind, widthMm: openingNext.widthMm, swing: openingNext.swing }, mpp, hit.g.band, sw(10))
        if (shape) ghost = <g key="ghost" opacity={0.6} style={{ pointerEvents: 'none' }}>{draw(shape, colourOf(openingKind), 'g', nextOpeningRef(allPlaced, openingKind), false)}</g>
      }
    }
    return <g>{placed}{ghost}</g>
  }

  function renderOpeningsPanel() {
    const mpp = project.calibration.mpp
    const it = wdItem
    const built = BUILT_ASSEMBLY_CANON_IDS['wd-schedule']
    const plan: PlanOpening[] = livePlaced.map(o => ({ id: o.id, ref: o.ref, location: o.location, kind: o.kind, widthMm: o.widthMm, heightMm: o.heightMm, swing: o.swing }))
    const planKey = plan.map(planOpeningSig).join(';') + '#' + plan.map(o => o.id).join(',')
    const stale = !!it?.assemblyResult && it.wdPricedKey !== undefined && it.wdPricedKey !== planKey
    const sel = livePlaced.find(o => o.id === selectedOpeningId)
    const selEl = sel ? project.elements.find(e => e.id === sel.wallId) : undefined
    const selGeo = selEl ? wallGeometry(selEl) : null
    return (
      <OpeningsPanel
        openings={livePlaced}
        placing={tool === 'opening'}
        onPlacing={on => { setTool(on ? 'opening' : 'select'); if (!on) { setDrawPoints([]); setIsDrawing(false); setRawMouse(null) } }}
        kind={openingKind} onKind={pickOpeningKind}
        widthMm={openingNext.widthMm} heightMm={openingNext.heightMm} swing={openingNext.swing}
        onNext={patch => setOpeningNext(n => ({ ...n, ...patch }))}
        selectedId={selectedOpeningId} onSelect={setSelectedOpeningId}
        onUpdate={(id, patch) => changePlaced(list => list.map(q => q.id === id ? { ...q, ...patch } : q))}
        onDelete={deleteOpening}
        selectedAlong={sel && selGeo && mpp > 0 ? { mm: sel.distPx * mpp * 1000, wallMm: pathLength(selGeo.path, selGeo.closed) * mpp * 1000 } : undefined}
        onMoveAlong={moveOpeningAlong}
        saved={it?.assemblyResult}
        stale={stale}
        calculatorOpen={assemblyWindowItemId === WD_ITEM_ID}
        onOpenCalculator={() => { changeWdItem(x => x); setAssemblyWindowItemId(WD_ITEM_ID) }}
        onCloseCalculator={() => setAssemblyWindowItemId(null)}
        calculator={built?.render({
          labourTrades,
          calcState: it?.assemblyCalcState,
          planOpenings: plan,
          onSave: result => {
            const { calcState, state: _state, size: _size, ...res } = result
            const sub = boSubPhases.find(sp => sp.canonical_id === 'wd-schedule')
            changeWdItem(x => ({
              ...x, assemblyResult: res, assemblyCalcState: calcState, wdPricedKey: planKey, name: result.name,
              ...(sub && { taskSubphaseId: sub.id, subPhase: sub.name }),
            }))
            setAssemblyWindowItemId(null)
          },
        })}
      />
    )
  }

  function renderElectricsPanel() {
    const planRooms = planRoomsFromPoints(electricPoints)
    const it = electricsItem
    const built = BUILT_ASSEMBLY_CANON_IDS['elec-install']
    const roomNames = Array.from(new Set([
      ...electricRoomShapes().map(r => r.name).filter(Boolean),
      ...electricPoints.map(q => q.roomName).filter(Boolean),
    ]))
    const stale = !!it?.assemblyResult && it.electricsPricedKey !== undefined && it.electricsPricedKey !== JSON.stringify(planRooms)
    return (
      <ElectricalPointsPanel
        points={electricPoints}
        placing={tool === 'electric'}
        onPlacing={on => { setTool(on ? 'electric' : 'select'); if (!on) { setDrawPoints([]); setIsDrawing(false) } }}
        typeId={electricTypeId} onTypeId={setElectricTypeId}
        roomName={electricRoom} onRoomName={setElectricRoom}
        roomSuggestions={roomNames}
        selectedPointId={selectedElectricPointId} onSelectPoint={setSelectedElectricPointId}
        onUpdatePoint={(id, patch) => changeElectricPoints(pts => pts.map(q => q.id === id ? { ...q, ...patch } : q))}
        onDeletePoint={id => { changeElectricPoints(pts => pts.filter(q => q.id !== id)); setSelectedElectricPointId(null) }}
        saved={it?.assemblyResult}
        stale={stale}
        calculatorOpen={assemblyWindowItemId === ELECTRICS_ITEM_ID}
        onOpenCalculator={() => { changeElectricItem(x => x); setAssemblyWindowItemId(ELECTRICS_ITEM_ID) }}
        onCloseCalculator={() => setAssemblyWindowItemId(null)}
        calculator={built?.render({
          labourTrades,
          electrics: { planRooms, initialState: it?.electricsState as ElectricsSavedState | undefined },
          onSave: result => {
            const { state, size: _size, ...res } = result
            const sub = boSubPhases.find(sp => sp.canonical_id === 'elec-install')
            changeElectricItem(x => ({
              ...x, assemblyResult: res, electricsState: state, electricsPricedKey: JSON.stringify(planRooms), name: result.name,
              ...(sub && { taskSubphaseId: sub.id, subPhase: sub.name }),
            }))
            setAssemblyWindowItemId(null)
          },
        })}
      />
    )
  }

  // Opens the calculator window for an item — only if it has a calculator.
  function openAssemblyFor(it: TakeoffItem | null | undefined) {
    if (it && resolveBuiltAssembly(it)) setAssemblyWindowItemId(it.id)
  }

  // Double-clicking a wall on the drawing (select tool — the other tools use a double-click to
  // finish a shape) opens its calculator.
  function openAssemblyFromElement(el: DrawnElement) {
    if (tool !== 'select') return
    openAssemblyFor(project.items.find(it => it.elementId === el.id))
  }

  // ── Select element ─────────────────────────────────────────────────────────
  function selectElement(el: DrawnElement) {
    if (tool !== 'select') return
    setSelectedOpeningId(null)
    setSelectedId(el.id)
    setEditingElement(el)
    const item = project.items.find(it => it.elementId === el.id) ?? null
    setEditingItem(item)
    setPanelMode('properties')
  }

  // ── Save edits ─────────────────────────────────────────────────────────────
  function saveElementEdit(el: DrawnElement) {
    setProject(p => ({
      ...p,
      elements: p.elements.map(e => e.id === el.id ? el : e),
    }))
    setEditingElement(el)
  }

  function saveItemEdit(item: TakeoffItem) {
    // If editing phase defaults, update the local state instead of project
    if (item.id.startsWith('__phase-defaults-')) {
      setPhaseDefaults(item)
      return
    }
    setProject(p => ({
      ...p,
      items: p.items.map(it => it.id === item.id ? item : it),
    }))
    setEditingItem(item)
  }

  // ── Manual add item ────────────────────────────────────────────────────────
  function addManualItem() {
    // Start with phase defaults, if available
    const item: TakeoffItem = {
      ...(phaseDefaults ? { ...phaseDefaults } : {}),
      id: uid(),
      name: phaseDefaults?.name && phaseDefaults.name.includes('Default') ? 'New Item' : (phaseDefaults?.name ?? 'New Item'),
      phase: activePhase,
      qty: phaseDefaults?.qty ?? 1,
      unit: phaseDefaults?.unit ?? 'nr',
    }
    setProject(p => ({ ...p, items: [...p.items, item] }))
    setEditingItem(item)
    setEditingElement(null)
    setPhaseDefaults(null)
    setPanelMode('properties')
  }

  // ── Plans are sheets ────────────────────────────────────────────────────────
  // Every plan loaded (and every PDF page chosen) becomes a sheet with its own picture, scale and drawings. The pictures are kept on this device (lib/takeoff-sheet-images.ts), not in the project.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function renderPdfPageToDataUrl(pdf: any, pageNum: number): Promise<{ url: string; paper?: string; mmPerPx: number }> {
    const page = await pdf.getPage(pageNum)
    // the page's size on paper (in 1/72 inch points), so the scale presets know what a pixel of the picture is
    const natural = page.getViewport({ scale: 1.0 })
    const paper = paperFromMm(Math.max(natural.width, natural.height) * 25.4 / 72, Math.min(natural.width, natural.height) * 25.4 / 72)?.name
    const viewport = page.getViewport({ scale: 2.0 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    await page.render({ canvasContext: ctx, viewport }).promise
    return { url: canvas.toDataURL('image/jpeg', 0.9), paper, mmPerPx: PDF_RENDER_MM_PER_PX }
  }

  /** Adds loaded plans as new sheets, or, when the showing sheet's picture is missing from this device, puts the first one back into that sheet (keeping its drawings and scale) */
  async function addPlansAsSheets(plans: { name: string; url: string; paper?: string; mmPerPx?: number; /** the scale (1:denom) to start the sheet at: a blank sheet is made at one */ denom?: number }[]) {
    if (plans.length === 0) return
    const hadSheets = (project.sheets?.length ?? 0) > 0
    let savedOnDevice = true
    let rest = plans
    if (sheetImageMissing && activeSheetId) {
      savedOnDevice = (await putSheetImage(project.id, activeSheetId, plans[0].url)) && savedOnDevice
      savePictureToAccount(project.id, activeSheetId, plans[0].url)
      setProject(p => {
        const q = setSheetPaper(p, activeSheetId, plans[0].paper, plans[0].mmPerPx)   // a different picture may have a different paper size
        return plans[0].denom && plans[0].mmPerPx ? setActiveSheetCalibration(q, { mpp: mppForScale(plans[0].mmPerPx, plans[0].denom), label: scaleLabel(plans[0].denom) }) : q
      })
      rest = plans.slice(1)
      setImageNonce(n => n + 1)
    }
    const created: TakeoffSheet[] = []
    for (const pl of rest) {
      const startScale = pl.denom && pl.mmPerPx ? { mpp: mppForScale(pl.mmPerPx, pl.denom), label: scaleLabel(pl.denom) } : undefined
      const sheet: TakeoffSheet = { ...(startScale ? makeSheet(uid(), pl.name, startScale, true) : makeSheet(uid(), pl.name)), ...(pl.mmPerPx ? { paperMmPerPx: pl.mmPerPx, ...(pl.paper ? { paper: pl.paper } : {}) } : {}) }
      savedOnDevice = (await putSheetImage(project.id, sheet.id, pl.url)) && savedOnDevice
      savePictureToAccount(project.id, sheet.id, pl.url)
      created.push(sheet)
    }
    if (created.length > 0) {
      setProject(p => switchActiveSheet(addSheets(p, created), created[0].id))
      // the new sheet starts clean: nothing selected from the sheet we were on
      setSelectedId(null); setEditingElement(null); setEditingItem(null); setSelectedElectricPointId(null); setDrawPoints([]); setIsDrawing(false); setAssemblyWindowItemId(null)
    }
    if (!savedOnDevice) showToast('This browser cannot keep plans between visits (a private window?). They will be lost when you close the page.')
    else if (created.length > 1) showToast(created.length + ' sheets added. Set the scale of each before you draw on it.')
    else if (created.length === 1 && hadSheets) showToast('Sheet added. Set its scale before you draw on it.')
  }

  /** A blank white sheet of a paper size at a scale, to draw on with no plan behind it: it is made like a PDF page (so the scale presets, the paper chip, saving and the copy in the account all work as for any plan). */
  async function createBlankSheet(f: { paper: string; denom: number; name: string }) {
    const paper = PAPER_SIZES.find(x => x.name === f.paper)
    if (!paper) return
    const w = Math.round(paper.longMm / PDF_RENDER_MM_PER_PX), h = Math.round(paper.shortMm / PDF_RENDER_MM_PER_PX)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) { alert('This browser could not make a blank sheet.'); return }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6)
    const n = (project.sheets?.length ?? 0) + 1
    setPlanChooserOpen(false); setBlankForm(null)
    await addPlansAsSheets([{ name: f.name.trim() || (n > 1 ? 'Blank sheet ' + n : 'Blank sheet'), url: canvas.toDataURL('image/jpeg', 0.7), paper: paper.name, mmPerPx: PDF_RENDER_MM_PER_PX, denom: f.denom }])
    showToast(`Blank ${paper.name} sheet at ${scaleLabel(f.denom)}: ${(paper.longMm * f.denom / 1000).toFixed(1)} × ${(paper.shortMm * f.denom / 1000).toFixed(1)} m. Draw the walls with the Line tool.`)
  }

  async function handleImageLoad(e: ChangeEvent<HTMLInputElement>) {
    const input = e.target
    const file = input.files?.[0]
    input.value = ''   // so the same file can be chosen again
    if (!file) return
    await loadPlanFile(file)
  }

  /** Loads a plan (a picture or a PDF) as a new sheet: a file chosen from this computer, or one fetched from a customer's files. */
  async function loadPlanFile(file: File) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    setPdfLoading(true)
    try {
      if (isPdf) {
        // Dynamic import avoids SSR issues and keeps the bundle lean
        const pdfjsLib = await import('pdfjs-dist')
        // Use CDN worker — avoids Next.js bundling complexity
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
        let pages = [1]
        if (pdf.numPages > 1) {
          const answer = window.prompt('This PDF has ' + pdf.numPages + ' pages. Which pages should become sheets? Each page becomes its own sheet with its own scale.\n\nType all, or pages like 1-3, 5', 'all')
          if (answer === null) return
          const parsed = parsePageList(answer, pdf.numPages)
          if (!parsed) { alert('Could not read that list of pages. Type all, or numbers like 1-3, 5.'); return }
          pages = parsed
        }
        const plans: { name: string; url: string; paper?: string; mmPerPx?: number }[] = []
        for (const n of pages) { const r = await renderPdfPageToDataUrl(pdf, n); plans.push({ name: sheetNameFromFile(file.name, n, pdf.numPages), url: r.url, paper: r.paper, mmPerPx: r.mmPerPx }) }
        await addPlansAsSheets(plans)
      } else {
        const url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(file)
        })
        await addPlansAsSheets([{ name: sheetNameFromFile(file.name), url }])
      }
    } catch (err) {
      console.error('Plan load error:', err)
      alert('Could not load that plan. Make sure it is a valid image or PDF file.')
    } finally {
      setPdfLoading(false)
    }
  }

  /** Shows another sheet: its plan, its scale and only its drawings. keepSelection is for jumping to the sheet of an item you just picked. */
  function switchSheet(id: string, keepSelection = false) {
    if (id === activeSheetId) return
    const target = project.sheets?.find(s => s.id === id)
    setProject(p => switchActiveSheet(p, id))
    if (!keepSelection) { setSelectedId(null); setEditingElement(null); setEditingItem(null) }
    setSelectedElectricPointId(null)
    setDrawPoints([])
    setIsDrawing(false)
    setMeasureDone(null)
    setCalibDrawing(false)
    setCalibPts([])
    setAssemblyWindowItemId(null)
    if (target && !target.scaleSet) showToast('Set the scale for ' + target.name + ' before you draw on it.')
  }

  function renameSheetPrompt(id: string) {
    const next = window.prompt('Name this sheet', sheetName(project, id))
    if (next !== null && next.trim()) setProject(p => renameSheet(p, id, next))
  }

  function deleteSheetConfirm(id: string) {
    const dry = removeSheet(project, id)
    if (!window.confirm('Remove "' + sheetName(project, id) + '"?\n\nThis also removes the ' + dry.removedElements + ' drawing(s) and ' + dry.removedItems + ' priced item(s) drawn on it. A recovery copy is kept.')) return
    createRecoverySnapshot('clear')
    setProject(p => removeSheet(p, id).project)
    setSelectedId(null)
    setEditingElement(null)
    setEditingItem(null)
    setDrawPoints([])
    setIsDrawing(false)
    setSelectedElectricPointId(null)
    showToast('Sheet removed. Recovery copy saved.')
  }

  /** What a pixel of the showing sheet's picture is on paper: what was recorded for the sheet, or worked out when the picture is the size of a PDF page of an A size. Null when it must be asked. */
  function paperInfoForActiveSheet(): { mmPerPx: number; paper: string } | null {
    const sh = project.sheets?.find(s => s.id === activeSheetId)
    if (sh?.paperMmPerPx) return { mmPerPx: sh.paperMmPerPx, paper: sh.paper ?? '' }
    if (canvasImgSize) return inferPdfPaper(canvasImgSize.w, canvasImgSize.h)
    return null
  }

  /** A scale preset (1:150 ...): the real size of a pixel follows from the paper size, so a plan printed at that scale measures right. */
  function applyScaleDenom(denom: number, info = paperInfoForActiveSheet()) {
    if (!canvasImgSize) { showToast('Load a plan first, then set its scale.'); return }
    if (!info) { setPendingDenom(denom); setShowPaperModal(true); return }
    const label = scaleLabel(denom)
    const n = rescaleActiveSheet(mppForScale(info.mmPerPx, denom), label)
    showToast(`Scale set to ${label}${info.paper ? ' on ' + info.paper : ''} — ${n} item${n !== 1 ? 's' : ''} recalculated ✓`)
  }

  /** The user says what paper this plan is: remembered on the sheet, then any waiting scale is applied. */
  function choosePaper(paperName: string) {
    if (!canvasImgSize || !activeSheetId) return
    const mmPerPx = mmPerPxForPaper(paperName, canvasImgSize.w, canvasImgSize.h)
    if (!mmPerPx) return
    setProject(p => setSheetPaper(p, activeSheetId, paperName, mmPerPx))
    setShowPaperModal(false)
    if (pendingDenom) applyScaleDenom(pendingDenom, { mmPerPx, paper: paperName })
    setPendingDenom(null)
  }

  /** Sets the showing sheet's scale and remeasures ONLY the drawings on that sheet (the other sheets have their own scales). Returns how many priced items were remeasured. */
  function rescaleActiveSheet(mpp: number, label: string): number {
    const ids = activeSheetElementIds(project)
    const n = project.items.filter(it => it.elementId && ids.has(it.elementId)).length
    setProject(p => {
      const q = setActiveSheetCalibration(p, { mpp, label })
      return { ...q, items: recalcItemsForMpp(q.items, q.elements, mpp, activeSheetElementIds(q)) }
    })
    return n
  }

  // ── Import JSON ────────────────────────────────────────────────────────────
  function handleImportJson(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (data.version !== 1) { alert('Unrecognised take-off file version.'); return }
        setProject({
          id: isUuid(data.id) ? data.id : newProjectId(),
          name: data.name ?? 'Imported Take-off',
          address: data.address ?? '',
          jobType: data.jobType ?? '',
          calibration: data.calibration ?? { mpp: DEFAULT_MPP, label: '1:100' },
          sheets: data.sheets,
          activeSheetId: data.activeSheetId,
          elements: data.elements ?? [],
          items: data.items ?? [],
          createdAt: data.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        setPlanImage(null)
        alert('Take-off imported successfully.')
      } catch {
        alert('Could not parse take-off file.')
      }
    }
    reader.readAsText(file)
  }

  // ── Reset system ────────────────────────────────────────────────────────────

  /** 1. Reset View — viewport only, nothing else touched */
  function resetView() {
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
    showToast('View reset.')
  }

  /** 2. Create recovery snapshot — call BEFORE any destructive reset */
  function createRecoverySnapshot(reason: 'clear' | 'reset'): RecoverySnapshot {
    const now    = new Date()
    const label  = `Recovery Snapshot — ${project.name} — ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    const { planImageUrl: _, ...projectData } = project
    const snap: RecoverySnapshot = {
      id:          uid(),
      label,
      timestamp:   now.toISOString(),
      projectName: project.name,
      project:     { ...projectData },
      planImageUrl: project.sheets?.length ? undefined : (planImage ?? undefined),
    }
    saveRecoverySnapshot(snap)
    setRecoverySnap(snap)
    return snap
  }

  /** 3. Restore last recovery snapshot */
  function restoreRecoverySnapshot() {
    const snap = recoverySnap
    if (!snap) return
    setProject({
      ...snap.project,
      updatedAt: new Date().toISOString(),
    })
    if (snap.planImageUrl) {
      setPlanImage(snap.planImageUrl)
      const img = new Image()
      img.onload = () => setCanvasImgSize({ w: img.naturalWidth, h: img.naturalHeight })
      img.src    = snap.planImageUrl
    }
    setSelectedId(null)
    setEditingElement(null)
    setEditingItem(null)
    setDrawPoints([])
    setIsDrawing(false)
    setPanelMode('schedule')
    showToast(`Restored: ${snap.label}`)
  }

  /** 4. Clear Drawings — removes elements + linked items, keeps project meta */
  function clearDrawings() {
    if (resetInProgress) return
    setResetInProgress(true)
    createRecoverySnapshot('clear')
    // Keep items that are NOT linked to any element (manually-added, pricing-only rows)
    const unlinkedItems = project.items.filter(it => !it.elementId).map(it => it.electricsSummary ? { ...it, electricPoints: [] } : it.wdSummary ? { ...it, placedOpenings: [] } : it)
    setProject(p => ({
      ...p,
      elements: [],
      items:    unlinkedItems,
    }))
    setSelectedId(null)
    setEditingElement(null)
    setEditingItem(null)
    setDrawPoints([])
    setIsDrawing(false)
    setShowClearModal(false)
    setTimeout(() => setResetInProgress(false), 600)
    showToast('Drawings cleared. Recovery snapshot saved.')
  }

  /** 5. Reset Takeoff — full wipe, returns to blank project with same name/address */
  function resetTakeoff() {
    if (resetInProgress) return
    setResetInProgress(true)
    createRecoverySnapshot('reset')
    const blank = blankProject()
    // Preserve project identity and settings, wipe all drawing/measurement data
    setProject({
      ...blank,
      id:          project.id,     // keep same ID so LS key stays stable
      name:        project.name,
      address:     project.address,
      jobType:     project.jobType,
      calibration: project.calibration,
      createdAt:   project.createdAt,
    })
    setPlanImage(null)
    setCanvasImgSize(null)
    setSelectedId(null)
    setEditingElement(null)
    setEditingItem(null)
    setDrawPoints([])
    setIsDrawing(false)
    setTool('select')
    setPanelMode('schedule')
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
    setShowResetModal(false)
    setTimeout(() => setResetInProgress(false), 600)
    showToast('Takeoff reset. Recovery snapshot saved.')
  }

  // ── Draw mode helpers ───────────────────────────────────────────────────────

  /** Switch active phase AND auto-reset the draw tool to the phase default */
  function selectPhase(ph: TakeoffPhase) {
    setActivePhase(ph)
    const defaultTool = PHASE_DEFAULT_TOOL[ph] ?? 'select'
    setTool(defaultTool)
    setDrawPoints([])
    setIsDrawing(false)
    // Show phase defaults in properties panel
    setEditingItem(null)
    setEditingElement(null)
    setSelectedId(null)
    setPhaseDefaults({
      id: `__phase-defaults-${ph}`,
      phase: ph,
      name: `${ph} – Default Properties`,
      qty: 1,
      unit: 'item',
      wallHeight: 3,  // sensible default for walls
      wallBandPx: 9,  // default wall width in pixels
    })
    // Reset task selection for this phase
    setSelectedTaskSubphaseId(null)
    setSelectedTaskId(null)
    setPanelMode('properties')
  }

  // Auto-scroll schedule panel to active phase when phase is selected
  useEffect(() => {
    if (scheduleContainerRef.current && panelMode === 'schedule') {
      const phaseElement = scheduleContainerRef.current.querySelector(`[data-phase="${activePhase}"]`)
      if (phaseElement) {
        phaseElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  }, [activePhase, panelMode])

  /** Return cursor to selection mode without changing the active phase */
  function resetDrawMode() {
    setTool('select')
    setDrawPoints([])
    setIsDrawing(false)
    showToast('Draw mode reset to Selection.')
  }

  // ── New project ────────────────────────────────────────────────────────────
  // ── My Take-offs: the take-offs saved to your account, to open again later ──────────────────────────────────
  // The screen always works on one take-off (kept on this computer and, a couple of seconds after each change, in your account). These put the one on screen safely away and bring another back.

  /** Puts what is on screen into your account now (the automatic save waits a couple of seconds after the last change). */
  async function saveCurrentToCloud(): Promise<boolean> {
    lastSaveError.current = ''
    if (!userId) { lastSaveError.current = 'You are not signed in.'; return false }
    if (isEmptyTakeoff(project)) return true   // nothing started: nothing to keep
    const { error } = await saveTakeoffToSupabase(createClient(), { ...project, updatedAt: new Date().toISOString() }, userId)
    lastSaveError.current = error ?? ''
    return !error
  }

  function resetScreenForOtherTakeoff() {
    setPlanImage(null)
    setCanvasImgSize(null)
    setSheetImageMissing(false)
    setDrawPoints([])
    setIsDrawing(false)
    setSelectedId(null)
    setEditingElement(null)
    setEditingItem(null)
    setPhaseDefaults(null)
    setSelectedElectricPointId(null)
    setAssemblyWindowItemId(null)
    setMeasureDone(null)
    setCalibDrawing(false)
    setCalibPts([])
    setScheduleSheetFilter('all')
    setPanelMode('schedule')
    setZoom(1)
    setPanOffset({ x: 0, y: 0 })
    sheetImageLoadedOnce.current = false
  }

  async function openTakeoffList() {
    setShowTakeoffList(true)
    setTakeoffList(null)
    setTakeoffListError('')
    if (!userId) { setTakeoffListError('Sign in to see your saved take-offs.'); return }
    const saved = await saveCurrentToCloud()
    if (!saved) setTakeoffListError('Could not save this take-off to your account just now, so it may be missing from the list. It is still on this computer.' + (lastSaveError.current ? ' Reason: ' + lastSaveError.current : ''))
    try { setTakeoffList(await listTakeoffSummaries(createClient(), userId)) }
    catch { setTakeoffList([]); setTakeoffListError('Could not load your saved take-offs. Check your connection and try again.') }
  }

  async function openSavedTakeoff(id: string) {
    if (!userId || takeoffBusy) return
    if (id === project.id) { setShowTakeoffList(false); return }
    setTakeoffBusy(true)
    try {
      await saveCurrentToCloud()   // what is on screen is put away first
      const remote = await loadTakeoffFromSupabase(createClient(), id, userId)
      if (!remote) { alert('Could not open that take-off. Check your connection and try again.'); return }
      resetScreenForOtherTakeoff()
      setProject({ ...remote, updatedAt: new Date().toISOString() })
      setShowTakeoffList(false)
      showToast('Opened "' + (remote.name || 'take-off') + '".')
    } finally {
      setTakeoffBusy(false)
    }
  }

  function startBlankTakeoff(name: string) {
    resetScreenForOtherTakeoff()
    setProject({ ...blankProject(), name: name.trim() })
    setShowTakeoffList(false)
    setNewTakeoffName('')
  }

  async function startNewTakeoffFromList() {
    if (takeoffBusy) return
    setTakeoffBusy(true)
    try {
      await saveCurrentToCloud()
      startBlankTakeoff(newTakeoffName)
    } finally {
      setTakeoffBusy(false)
    }
  }

  async function deleteSavedTakeoff(t: TakeoffSummary) {
    if (!userId || takeoffBusy) return
    if (!window.confirm('Delete "' + t.name + '"?\n\nIts drawings, priced items, sheets and plan pictures are removed from your account and from this computer. This cannot be undone.')) return
    setTakeoffBusy(true)
    try {
      await deleteTakeoffProject(createClient(), t.id, userId)
      deleteProjectImages(t.id)
      await deleteProjectPictures(createClient(), userId, t.id)
      setTakeoffList(list => (list ? list.filter(x => x.id !== t.id) : list))
      if (t.id === project.id) startBlankTakeoff('')   // the one on screen was deleted: start a blank one
      showToast('Deleted "' + t.name + '".')
    } finally {
      setTakeoffBusy(false)
    }
  }

  /** Closes the take-off on screen: it is saved to My Take-offs under its name, and the screen is left as a fresh, empty take-off ready for the next job. */
  async function handleClose() {
    if (isEmptyTakeoff(project)) { showToast('This take-off is empty: nothing to close. Use My Take-offs to open a job.'); return }
    const kept = await saveCurrentToCloud()
    if (!kept && !confirm('This take-off could NOT be saved to your account just now, so closing it would lose it.' + (lastSaveError.current ? '\n\nReason: ' + lastSaveError.current : '') + '\n\nClose it anyway?')) return
    const name = project.name.trim() || 'Untitled take-off'
    startBlankTakeoff('')
    showToast(kept ? '"' + name + '" is saved in My Take-offs. Here is a fresh take-off.' : 'Closed without saving.')
  }

  // ── Calibration ────────────────────────────────────────────────────────────
  function applyCalibration() {
    const realM = parseFloat(calibReal)
    if (isNaN(realM) || realM <= 0 || calibPts.length < 2) {
      alert('Draw a line over a known dimension first, then enter its real length.')
      return
    }
    const dx = calibPts[1].x - calibPts[0].x
    const dy = calibPts[1].y - calibPts[0].y
    const pixLen = Math.sqrt(dx * dx + dy * dy)
    const mpp = realM / pixLen
    const lbl = calibLabel || `${realM}m ref`
    const n = rescaleActiveSheet(mpp, lbl)
    showToast(`Calibration applied (${lbl}) — ${n} item${n !== 1 ? 's' : ''} recalculated ✓`)
    setShowCalib(false)
    setCalibDrawing(false)
    setCalibPts([])
  }

  // ── Phase summary for schedule panel ──────────────────────────────────────
  const phaseGroups = livePhaseNames.map(ph => ({
    phase: ph,
    items: project.items.filter(it => it.phase === ph && (scheduleSheetFilter === 'all' || itemSheetId(it, project) === scheduleSheetFilter)),
  })).filter(g => g.items.length > 0)

  // ── Export for quote import ────────────────────────────────────────────────
  function exportForQuote() {
    const { planImageUrl: _, ...rest } = project
    const data = { version: 1, ...rest }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `takeoff-${project.name.replace(/\s+/g, '-')}.json`
    a.click()
    alert('Take-off exported. Use "📐 Import Take-off" in the New Quote page to import it.')
  }

  // ── Send directly to New Quote (no file download) ─────────────────────────
  function sendToQuote() {
    // A wall with a calculator that hasn't been priced would go to the quote as a plain build-up
    // (e.g. the default cavity wall layers) rather than what it's labelled as — say so first.
    const unpriced = project.items.filter(it => resolveBuiltAssembly(it) && !it.assemblyResult)
    if (unpriced.length > 0 && !window.confirm(
      `${unpriced.length} item${unpriced.length !== 1 ? 's have' : ' has'} a calculator that hasn't been priced yet:\n\n` +
      unpriced.map(it => `• ${it.name}${it.subPhase ? ` (${it.subPhase})` : ''}`).join('\n') +
      `\n\nUnpriced items are sent to the quote as a plain build-up, not from their calculator. Send anyway?`
    )) return
    const { planImageUrl: _, ...rest } = project
    const data = { version: 1, ...rest }
    sessionStorage.setItem('sbc_takeoff_for_quote', JSON.stringify(data))
    router.push('/new-quote')
  }

  // ── Drawing aids: snapping, typed lengths, undo / redo, copy and rotate ─────────────────────────────
  /** Where the cursor really lands: snapped to a corner, end or mid-point of a drawing on this sheet (within 10 screen pixels), and kept horizontal or vertical from the last point when Ortho is on or Shift is held. */
  function drawingPoint(raw: TakeoffPoint): SnapResult {
    const drawingTool = tool === 'line' || tool === 'polygon' || tool === 'rect' || tool === 'floor' || tool === 'measure' || tool === 'click' || calibDrawing
    const ortho = orthoOn || shiftHeld
    if (!drawingTool || (!snapOn && !ortho)) return { pt: raw, kind: 'none' }
    const polyMode = tool === 'line' || tool === 'polygon' || tool === 'measure' || (tool === 'floor' && floorDrawMode === 'polygon')
    const last = calibDrawing
      ? (calibPts.length === 1 ? calibPts[0] : undefined)
      : (isDrawing && polyMode && drawPoints.length > 0 ? drawPoints[drawPoints.length - 1] : undefined)
    const anchors = snapOn ? anchorsFor(elementsOnActiveSheet(project).filter(el => !hiddenPhases.has(el.phase)), drawPoints.slice(0, -1)) : []
    return snapPoint(raw, { anchors, last, radius: 10 / zoom, snap: snapOn, ortho })
  }

  /** Typing a length is on while a line, polygon, rectangle or floor is being drawn (not the measure tool or calibration). */
  function typedAllowed() {
    return isDrawing && drawPoints.length > 0 && !calibDrawing && (tool === 'line' || tool === 'polygon' || tool === 'rect' || tool === 'floor')
  }

  /** Enter after typing: a length places the next point that far from the last one, the way the cursor points; "4.5x3" completes a rectangle. */
  function commitTyped() {
    const parsed = parseTyped(typed)
    if (!parsed) { showToast('Type a length in metres, like 3.45 (or 4.5x3 for a rectangle)'); return }
    if (project.sheets?.find(s => s.id === activeSheetId)?.scaleSet === false) { showToast('Set the scale for this sheet first: a typed length needs it'); return }
    const mpp = project.calibration.mpp
    const isRect = tool === 'rect' || (tool === 'floor' && floorDrawMode === 'rect')
    if (isRect) {
      if (parsed.b === undefined) { showToast('Type the width and height, like 4.5x3'); return }
      finishElement('rect', [drawPoints[0], rectCornerAt(drawPoints[0], mousePos, parsed.a, parsed.b, mpp)], tool === 'floor')
      setTyped('')
      return
    }
    if (parsed.b !== undefined) { showToast('Type just one length here, like 3.45'); return }
    const last = drawPoints[drawPoints.length - 1]
    const np = pointAtDistance(last, mousePos, parsed.a, mpp)
    if (!np) { showToast('Move the cursor the way the line should run, then type its length'); return }
    setDrawPoints(prev => [...prev, np])
    setTyped('')
  }

  /** Enter on its own finishes a line, polygon or floor (the same as a double-click). */
  function finishFromKeys() {
    if (tool === 'rect' || (tool === 'floor' && floorDrawMode === 'rect')) return
    const pts = [...drawPoints]
    if (tool === 'floor') {
      if (pts.length < 3) { showToast('A floor needs at least three corners'); return }
      finishElement('polygon', pts, true)
    } else {
      if (pts.length < 2) { showToast('Click the next point first'); return }
      finishElement(tool as 'line' | 'polygon', pts)
    }
    setTyped('')
  }

  /** Undo: while drawing it takes back the last point; otherwise it goes back one step in the drawings and items. */
  function undoDrawing() {
    if (isDrawing && drawPoints.length > 0 && tool !== 'measure') {
      setDrawPoints(p => p.slice(0, -1))
      if (drawPoints.length <= 1) setIsDrawing(false)
      setTyped('')
      return
    }
    const h = historyRef.current
    const snap = h ? undoStep(h, { elements: project.elements, items: project.items }) : null
    if (!snap) { showToast('Nothing to undo'); return }
    restoreDrawings(snap)
  }
  function redoDrawing() {
    const h = historyRef.current
    const snap = h ? redoStep(h, { elements: project.elements, items: project.items }) : null
    if (!snap) { showToast('Nothing to redo'); return }
    restoreDrawings(snap)
  }
  function restoreDrawings(snap: { elements: DrawnElement[]; items: TakeoffItem[] }) {
    setProject(p => ({ ...p, elements: snap.elements, items: snap.items }))
    setSelectedId(null); setEditingElement(null); setEditingItem(null); setSelectedElectricPointId(null)
    setHistoryTick(t => t + 1)
  }

  /** Copy the selected drawing and its priced item: the copy is a little down and to the right, selected, ready to drag into place. */
  function duplicateSelected() {
    const el = selectedId ? project.elements.find(e => e.id === selectedId) : undefined
    if (!el) { showToast('Select a drawing first, then copy it'); return }
    const item = project.items.find(it => it.elementId === el.id && !it.electricsSummary)
    const off = 30 / zoom
    const copy: DrawnElement = { ...el, id: uid(), points: el.points.map(p => ({ ...p, x: p.x + off, y: p.y + off })), tagDx: undefined, tagDy: undefined }
    const copyItem: TakeoffItem | null = item ? { ...item, id: uid(), elementId: copy.id } : null
    setProject(p => ({ ...p, elements: [...p.elements, copy], items: copyItem ? [...p.items, copyItem] : p.items }))
    setSelectedId(copy.id)
    showToast('Copied. The copy is selected: drag it into place.')
  }

  /** Turn the selected drawing about its middle (clockwise is positive). With no angle it asks. */
  function rotateSelected(deg: number | null) {
    const el = selectedId ? project.elements.find(e => e.id === selectedId) : undefined
    if (!el) { showToast('Select a drawing first, then rotate it'); return }
    let d = deg
    if (d === null) {
      const a = window.prompt('Turn the selected drawing by how many degrees? Clockwise is positive, anticlockwise negative.', '90')
      if (a === null) return
      d = parseFloat(a)
      if (!Number.isFinite(d) || d === 0) return
    }
    const turned = rotateShape(el, d)
    setProject(p => {
      const elements = p.elements.map(e => (e.id === el.id ? { ...e, type: turned.type, points: turned.points } : e))
      return { ...p, elements, items: recalcItemsForMpp(p.items, elements, p.calibration.mpp, new Set([el.id])) }
    })
  }

  // Undo history: the drawings and items, one step per burst of changes. It starts again for another take-off or when the sheets change (a deleted sheet's drawings must not come back without it).
  const historyKey = project.id + '|' + (project.sheets ?? []).map(s => s.id).join(',')
  useEffect(() => {
    const cur = { elements: project.elements, items: project.items }
    if (!historyRef.current) { historyRef.current = newHistory(cur, historyKey); return }
    if (observeHistory(historyRef.current, cur, historyKey, Date.now(), (a, b) => a.elements === b.elements && a.items === b.items)) setHistoryTick(t => t + 1)
  }, [project.elements, project.items, historyKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // While a calculator window is open the drawing shortcuts are off: Delete/Backspace would
      // otherwise remove the selected wall from behind it, and Space would start panning. Escape
      // closes the window (which only hides it — nothing typed is lost).
      if (assemblyWindowItemId) {
        if (e.key === 'Escape') setAssemblyWindowItemId(null)
        return
      }
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSpaceHeld(true)
      }
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (e.key === 'Shift') setShiftHeld(true)
      if (!inField && (e.ctrlKey || e.metaKey)) {
        const k = e.key.toLowerCase()
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoDrawing(); return }
        if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redoDrawing(); return }
        if (k === 'd') { e.preventDefault(); duplicateSelected(); return }
      }
      // while drawing: type a length (or width x height for a rectangle), Enter places it, Backspace takes back a typed digit and then the last point, Enter on its own finishes
      if (!inField && !e.ctrlKey && !e.metaKey && !e.altKey && typedAllowed()) {
        if (/^[0-9.,x*]$/i.test(e.key)) { e.preventDefault(); setTyped(t => t + e.key.toLowerCase()); return }
        if (e.key === 'Backspace') { e.preventDefault(); if (typed) setTyped(t => t.slice(0, -1)); else undoDrawing(); return }
        if (e.key === 'Enter') { e.preventDefault(); if (typed) commitTyped(); else finishFromKeys(); return }
      }
      if (!inField && !e.ctrlKey && !e.metaKey && !isDrawing && selectedId && (e.key === 'r' || e.key === 'R')) { rotateSelected(90); return }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !inField && !isDrawing) {
        if (selectedOpeningId) deleteOpening(selectedOpeningId)
        else deleteSelected()
      }
      if (e.key === 'Escape') {
        setSelectedOpeningId(null)
        setDrawPoints([])
        setIsDrawing(false)
        setMeasureDone(null)
        setTyped('')
        if (calibDrawing) { setCalibDrawing(false); setCalibPts([]) }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') { setSpaceHeld(false); setIsPanning(false) }
      if (e.key === 'Shift') setShiftHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  })

  // ── Render: SVG elements ───────────────────────────────────────────────────
  // Returns screen-space handle positions for an element.
  // Rect: 4 corners (derived from 2 stored points). Line/polygon: each stored point.
  function getElVertexHandles(el: DrawnElement): TakeoffPoint[] {
    if (el.type === 'rect' && el.points.length >= 2) {
      const [p0, p1] = el.points
      return [
        { x: p0.x, y: p0.y }, // 0 TL
        { x: p1.x, y: p0.y }, // 1 TR
        { x: p1.x, y: p1.y }, // 2 BR
        { x: p0.x, y: p1.y }, // 3 BL
      ]
    }
    return el.points
  }

  // What a drawn wall is made of, so it can be drawn at its real thickness: from its saved calculator (the cavity wall's leaves and cavity, a solid block's width), else the layers of its Build-Up Type (your Back Office wall type),
  // else the standard for its kind of wall. External walls: the line you draw is the OUTSIDE face and the wall builds to the inside. Internal walls: the line is the middle. Nothing known: null (the plain band as before).
  function wallSpecForItem(item: TakeoffItem) {
    const external = item.phase === 'External Walls'
    const internal = item.phase === 'Internal Walls & Partitions'
    if ((!external && !internal) || !(project.calibration.mpp > 0)) return null
    const snap = item.assemblyCalcState
    const vals = (snap?.values ?? {}) as Record<string, Record<string, unknown>>
    let spec = null as ReturnType<typeof defaultWallSpec>
    if (snap?.id === 'ew-cav-full' || snap?.id === 'ew-cav-partial') { const v = vals.AssemblyCavityWallDemo; if (v) spec = cavityWallSpec(v, snap.id === 'ew-cav-full') }
    else if (snap?.id === 'ew-blockwork-215') { const v = vals.AssemblySolidBlockWallDemo; if (v) spec = solidBlockSpec(v) }
    const boSub = item.taskSubphaseId ? boSubPhases.find(sp => sp.id === item.taskSubphaseId) : undefined
    const makeupId = item.floorMakeupId ?? (external && !item.taskSubphaseId ? allWallMakeups[0]?.id : undefined)   // an external wall with no type picked shows the first type, as the Properties panel does
    const canonical = boSub?.canonical_id ?? (makeupId ? WALL_MAKEUP_TO_SUBPHASE_CANONICAL[makeupId] : undefined)
    if (!spec && external && makeupId) { const mk = allWallMakeups.find(m => m.id === makeupId); if (mk) spec = specFromMakeupLayers(mk.layers) }
    if (!spec) spec = defaultWallSpec(canonical)
    return spec ? { spec, ref: (external ? 'outer' : 'centre') as 'outer' | 'centre', flip: !!item.wallFlip } : null
  }
  function wallSpecFor(el: DrawnElement) {
    if (el.phase !== 'External Walls' && el.phase !== 'Internal Walls & Partitions') return null
    const item = project.items.find(it => it.elementId === el.id)
    return item ? wallSpecForItem(item) : null
  }

  // The walls drawn at real thickness, all together: walls of the same kind whose ends meet are one run with a mitred corner (four walls round a house are one ring); internal walls are painted first and external walls over
  // them, and within a kind the longer wall over the shorter, so a partition stops at the face of the wall it butts into. Nothing here takes the mouse: clicking is in renderElement.
  function renderWallVisuals(els: DrawnElement[]) {
    const mpp = project.calibration.mpp
    const pieces: { id: string; points: TakeoffPoint[]; closed: boolean; flip: boolean; group: string }[] = []
    const kinds = new Map<string, NonNullable<ReturnType<typeof wallSpecFor>>>()
    for (const el of els) {
      const w = wallSpecFor(el)
      if (!w) continue
      const group = `${el.phase === 'External Walls' ? '2-ext' : '1-int'}|${w.ref}|${JSON.stringify(w.spec.layers)}`
      pieces.push({ id: el.id, points: el.type === 'rect' ? cornersOf(el) : el.points, closed: el.type !== 'line', flip: w.flip, group })
      kinds.set(group, w)
    }
    if (pieces.length === 0) return null
    return (
      <g style={{ pointerEvents: 'none' }}>
        {chainWalls(pieces, 3).map(ch => {
          const w = kinds.get(ch.group)
          const wd = w ? wallDrawing(ch.points, w.spec, mpp, { ref: w.ref, closed: ch.closed, flip: ch.flip }) : null
          if (!wd) return null
          return (
            <g key={'wv-' + ch.ids.join('-')}>
              {wd.strips.map((st, i) => {
                const style = LAYER_STYLE[st.kind]
                const showHatch = style.hatch !== 'none' && (st.mm / (mpp * 1000)) * zoom >= 3   // only when the layer is wide enough on screen to show it
                return (
                  <g key={i}>
                    <path d={st.d} fillRule="evenodd" fill={style.fill} />
                    {showHatch && <path d={st.d} fillRule="evenodd" fill={`url(#wl-${style.hatch})`} />}
                    <path d={st.d} fillRule="evenodd" fill="none" stroke={style.line} strokeWidth={0.8 / zoom} strokeLinejoin="miter" />
                  </g>
                )
              })}
            </g>
          )
        })}
        {/* the selected wall's outline, over the paint */}
        {(() => {
          const picked = els.find(e => e.id === selectedId)
          const w = picked ? wallSpecFor(picked) : null
          const wd = picked && w ? wallDrawing(picked.type === 'rect' ? cornersOf(picked) : picked.points, w.spec, mpp, { ref: w.ref, closed: picked.type !== 'line', flip: w.flip }) : null
          return wd ? <path d={wd.bodyD} fillRule="evenodd" fill="none" stroke="#1565c0" strokeWidth={2.5 / zoom} strokeDasharray={`${6 / zoom} ${3 / zoom}`} /> : null
        })()}
      </g>
    )
  }

  function renderElement(el: DrawnElement) {
    const sel = selectedId === el.id
    const isWall = el.phase === 'External Walls'
    const stroke = sel ? '#fff' : el.color
    // with the halo on, a line never gets thinner than a few screen pixels, however far the plan is zoomed out
    const sw = Math.max(sel ? 3 : 2, viewHalo ? (sel ? 4.5 : 3.5) / zoom : 0)
    const faceSw = Math.max(sel ? 2.5 : 2, viewHalo ? 3 / zoom : 0)
    const fill = el.color + '33'

    // Drag initiator — attached to every element <g>
    const elCursor = tool === 'select' ? (isDraggingEl && sel ? 'grabbing' : 'grab') : 'default'
    // When not in select mode, pass all pointer events through to the SVG
    // canvas so drawing tools work cleanly over existing elements.
    const elPointerEvents = tool === 'select' ? undefined : 'none'
    function onElMouseDown(e: React.MouseEvent<SVGGElement>) {
      if (tool !== 'select') return
      e.stopPropagation()   // prevent canvas pan from starting
      selectElement(el)
      const pt = svgCoords(e)
      dragRef.current = { id: el.id, startSvgX: pt.x, startSvgY: pt.y, origPoints: [...el.points] }
      setIsDraggingEl(true)
    }

    // ── A wall with a known make-up is painted at its real thickness by renderWallVisuals (joined to the walls it meets); this carries the clicking and the selection outline ──
    const ws = wallSpecFor(el)
    if (ws) {
      const mpp = project.calibration.mpp
      const closed = el.type !== 'line'
      const wd = wallDrawing(el.type === 'rect' ? cornersOf(el) : el.points, ws.spec, mpp, { ref: ws.ref, closed, flip: ws.flip })
      if (wd) {
        const hit = wd.centre.map(p => `${p.x},${p.y}`).join(' ')
        const hitW = Math.max(14 / zoom, wd.totalPx)
        return (
          <g key={el.id} onClick={() => selectElement(el)} onDoubleClick={() => openAssemblyFromElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
            {closed
              ? <polygon points={hit} fill="none" stroke="transparent" strokeWidth={hitW} />
              : <polyline points={hit} fill="none" stroke="transparent" strokeWidth={hitW} />}
          </g>
        )
      }
    }

    // ── External Walls LINE: two parallel lines = cavity wall cross-section ──
    if (isWall && el.type === 'line') {
      const linkedItem = project.items.find(it => it.elementId === el.id)
      const halfW = linkedItem?.wallBandPx ?? 9
      const outer = offsetPoly(el.points, halfW)
      const inner = offsetPoly(el.points, -halfW)
      const outerPts  = outer.map(p => `${p.x},${p.y}`).join(' ')
      const innerPts  = inner.map(p => `${p.x},${p.y}`).join(' ')
      const centrePts = el.points.map(p => `${p.x},${p.y}`).join(' ')
      const bodyPts   = [...outer, ...[...inner].reverse()].map(p => `${p.x},${p.y}`).join(' ')
      const mid = centroid(el.points)
      const faceC  = sel ? '#ffffff' : WALL_LINE_COLOR
      const fillC  = sel ? WALL_LINE_COLOR + '44' : WALL_FILL_COLOR + '28'
      const caviC  = sel ? '#ffffff' : WALL_CAVI_COLOR
      return (
        <g key={el.id} onClick={() => selectElement(el)} onDoubleClick={() => openAssemblyFromElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polygon points={bodyPts} fill={fillC} stroke="none" />
          <polyline points={outerPts} fill="none" stroke={faceC} strokeWidth={faceSw} strokeLinecap="square" strokeLinejoin="miter" />
          <polyline points={innerPts} fill="none" stroke={faceC} strokeWidth={faceSw} strokeLinecap="square" strokeLinejoin="miter" />
          <polyline points={centrePts} fill="none" stroke={caviC} strokeWidth={0.8} strokeDasharray="5 4" strokeOpacity={sel ? 0.7 : 0.4} />
          {sel && <polygon points={bodyPts} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="5 3" />}
          <text className="to-lbl" x={mid.x} y={mid.y - (halfW + 5)} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : WALL_LINE_COLOR} fontFamily="monospace" fontWeight={700}>
            {el.label}
          </text>
          <text className="to-lbl" x={mid.x} y={mid.y + (halfW + 13)} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmtM(polylineLength(el.points, project.calibration.mpp))}
          </text>
        </g>
      )
    }

    // ── External Walls RECT: thick coloured border ──
    if (isWall && el.type === 'rect') {
      const { x, y, width: w, height: h } = rectAttrs(el.points)
      const linkedItem = project.items.find(it => it.elementId === el.id)
      const wallSw = (linkedItem?.wallBandPx ?? 9) * 2
      const mid = centroid(el.points)
      const wallStroke = sel ? '#fff' : WALL_LINE_COLOR
      return (
        <g key={el.id} onClick={() => selectElement(el)} onDoubleClick={() => openAssemblyFromElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <rect x={x} y={y} width={w} height={h} fill={WALL_FILL_COLOR + '20'} stroke={wallStroke} strokeWidth={wallSw} />
          {sel && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="5 3" />}
          <text className="to-lbl" x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : WALL_LINE_COLOR} fontFamily="monospace" fontWeight={700}>
            {el.label}
          </text>
          <text className="to-lbl" x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmt2(rectArea(el.points, project.calibration.mpp))} m²
          </text>
        </g>
      )
    }

    // ── External Walls POLYGON: thick coloured border ──
    if (isWall && el.type === 'polygon') {
      const pts = el.points.map(p => `${p.x},${p.y}`).join(' ')
      const mid = centroid(el.points)
      const linkedItem = project.items.find(it => it.elementId === el.id)
      const wallSw = (linkedItem?.wallBandPx ?? 9) * 2
      const wallStroke = sel ? '#fff' : WALL_LINE_COLOR
      return (
        <g key={el.id} onClick={() => selectElement(el)} onDoubleClick={() => openAssemblyFromElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polygon points={pts} fill={WALL_FILL_COLOR + '20'} stroke={wallStroke} strokeWidth={wallSw} strokeLinejoin="miter" />
          {sel && <polygon points={pts} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="5 3" />}
          <text className="to-lbl" x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : WALL_LINE_COLOR} fontFamily="monospace" fontWeight={700}>
            {el.label}
          </text>
          <text className="to-lbl" x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmt2(polygonArea(el.points, project.calibration.mpp))} m²
          </text>
        </g>
      )
    }

    // ── Standard rendering for all other phases ──
    if (el.type === 'line') {
      const pts = el.points.map(p => `${p.x},${p.y}`).join(' ')
      const mid = centroid(el.points)
      return (
        <g key={el.id} onClick={() => selectElement(el)} onDoubleClick={() => openAssemblyFromElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polyline points={pts} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          {sel && <polyline points={pts} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />}
          <text className="to-lbl" x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : el.color} fontFamily="monospace" fontWeight={600}>
            {el.label}
          </text>
          <text className="to-lbl" x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmtM(polylineLength(el.points, project.calibration.mpp))}
          </text>
        </g>
      )
    }

    if (el.type === 'rect') {
      const { x, y, width: w, height: h } = rectAttrs(el.points)
      return (
        <g key={el.id} onClick={() => selectElement(el)} onDoubleClick={() => openAssemblyFromElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={sw} />
          <text className="to-lbl" x={x + w / 2} y={y + h / 2 - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : el.color} fontFamily="monospace" fontWeight={600}>
            {el.label}
          </text>
          <text className="to-lbl" x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmt2(rectArea(el.points, project.calibration.mpp))} m²
          </text>
        </g>
      )
    }

    if (el.type === 'polygon') {
      const pts = el.points.map(p => `${p.x},${p.y}`).join(' ')
      const mid = centroid(el.points)
      return (
        <g key={el.id} onClick={() => selectElement(el)} onDoubleClick={() => openAssemblyFromElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <text className="to-lbl" x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : el.color} fontFamily="monospace" fontWeight={600}>
            {el.label}
          </text>
          <text className="to-lbl" x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmt2(polygonArea(el.points, project.calibration.mpp))} m²
          </text>
        </g>
      )
    }
    return null
  }

  // ── A white halo under a drawing, so its colour stands out on a busy plan ──────────────────────────────
  function renderHalo(el: DrawnElement) {
    const sel = selectedId === el.id
    const isWall = el.phase === 'External Walls'
    const extra = 5 / zoom
    const common = { fill: 'none', stroke: '#ffffff', strokeOpacity: 0.92, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
    const linked = project.items.find(it => it.elementId === el.id)
    const pts = el.points.map(p => `${p.x},${p.y}`).join(' ')
    const wsHalo = wallSpecFor(el)
    if (wsHalo) {
      const wdh = wallDrawing(el.type === 'rect' ? cornersOf(el) : el.points, wsHalo.spec, project.calibration.mpp, { ref: wsHalo.ref, closed: el.type !== 'line', flip: wsHalo.flip })
      if (wdh) return <path key={'halo-' + el.id} d={wdh.bodyD} fillRule="evenodd" fill="#ffffff" fillOpacity={0.9} stroke="#ffffff" strokeOpacity={0.92} strokeWidth={Math.max(extra, 6 / zoom)} strokeLinejoin="round" />
    }
    if (isWall && el.type === 'line') {
      const half = linked?.wallBandPx ?? 9
      const face = Math.max(sel ? 2.5 : 2, 3 / zoom)
      const outer = offsetPoly(el.points, half).map(p => `${p.x},${p.y}`).join(' ')
      const inner = offsetPoly(el.points, -half).map(p => `${p.x},${p.y}`).join(' ')
      return (
        <g key={'halo-' + el.id}>
          <polyline points={outer} {...common} strokeWidth={face + extra} />
          <polyline points={inner} {...common} strokeWidth={face + extra} />
        </g>
      )
    }
    const base = isWall ? (linked?.wallBandPx ?? 9) * 2 : Math.max(sel ? 3 : 2, (sel ? 4.5 : 3.5) / zoom)
    if (el.type === 'line') return <polyline key={'halo-' + el.id} points={pts} {...common} strokeWidth={base + extra} />
    if (el.type === 'rect') { const r = rectAttrs(el.points); return <rect key={'halo-' + el.id} x={r.x} y={r.y} width={r.width} height={r.height} {...common} strokeWidth={base + extra} /> }
    return <polygon key={'halo-' + el.id} points={pts} {...common} strokeWidth={base + extra} />
  }

  // ── A name tag on each drawing: the name and its measurement, the same size on screen at any zoom, movable ──
  function renderTags(els: DrawnElement[]) {
    const mpp = project.calibration.mpp
    const inputs = els.map(el => {
      const linked = project.items.find(it => it.elementId === el.id)
      const measure = el.type === 'line' ? fmtM(polylineLength(el.points, mpp))
        : el.type === 'rect' ? fmt2(rectArea(el.points, mpp)) + ' m²'
        : fmt2(polygonArea(el.points, mpp)) + ' m²'
      const anchor = el.type === 'line' ? polylineMidpoint(el.points) : centroid(el.points)
      const wsTag = wallSpecFor(el)
      return { id: el.id, text: tagText(el.label || linked?.name || '', wsTag ? measure + ' · ' + wsTag.spec.label : measure), ax: anchor.x, ay: anchor.y, dx: el.tagDx, dy: el.tagDy }
    })
    const boxes = layoutTags(inputs, zoom)
    return boxes.map(t => {
      const el = els.find(e => e.id === t.id)!
      const sel = selectedId === el.id
      const fillC = el.phase === 'External Walls' ? WALL_LINE_COLOR : el.color
      const textC = textColorFor(fillC)
      const fs = 12 / zoom
      const interactive = tool === 'select'
      // the leader runs from the tag's nearest edge to the thing it names
      const fromY = t.y + t.h / 2 < t.ay ? t.y + t.h : t.y
      return (
        <g key={'tag-' + el.id} style={{ pointerEvents: interactive ? undefined : 'none', cursor: interactive ? (tagDragRef.current?.id === el.id ? 'grabbing' : 'grab') : 'default' }}
          onClick={e => { e.stopPropagation(); selectElement(el) }}
          onMouseDown={e => {
            if (!interactive) return
            e.stopPropagation()
            selectElement(el)
            const p = svgCoords(e)
            tagDragRef.current = { id: el.id, sx: p.x, sy: p.y, dx0: el.tagDx ?? 0, dy0: el.tagDy ?? 0 }
          }}>
          <line x1={t.x + t.w / 2} y1={fromY} x2={t.ax} y2={t.ay} stroke={fillC} strokeWidth={1.5 / zoom} style={{ pointerEvents: 'none' }} />
          <circle cx={t.ax} cy={t.ay} r={2.5 / zoom} fill={fillC} stroke="#ffffff" strokeWidth={1 / zoom} style={{ pointerEvents: 'none' }} />
          <rect x={t.x} y={t.y} width={t.w} height={t.h} rx={4 / zoom} fill={fillC} stroke={sel ? '#ffffff' : '#00000055'} strokeWidth={(sel ? 2 : 1) / zoom} />
          <text x={t.x + t.w / 2} y={t.y + t.h / 2} textAnchor="middle" dominantBaseline="central" fontSize={fs} fontWeight={600} fill={textC} fontFamily="monospace" style={{ pointerEvents: 'none' }}>{t.text}</text>
        </g>
      )
    })
  }

  // ── Render: in-progress drawing ghost ─────────────────────────────────────
  function renderGhost() {
    if (tool === 'measure') return null   // the measure tool draws its own line (renderMeasure)
    if (!isDrawing || drawPoints.length === 0) return null
    const isFloor = tool === 'floor'
    const color = isFloor ? PHASE_COLORS['Floors & Screeds'] : PHASE_COLORS[activePhase]
    const allPts = [...drawPoints, mousePos]
    const effectiveType = isFloor ? floorDrawMode : tool

    if (effectiveType === 'rect') {
      if (drawPoints.length < 1) return null
      const { x, y, width: w, height: h } = rectAttrs([drawPoints[0], mousePos])
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} fill={color + '33'} stroke={color} strokeWidth={2} strokeDasharray="5 3" />
          {isFloor && w > 20 && h > 20 && (() => {
            const mpp = project.calibration.mpp
            const areaM2 = Math.abs(w) * mpp * Math.abs(h) * mpp
            return (
              <text x={x + w / 2} y={y + h / 2} textAnchor="middle" dominantBaseline="middle"
                fontSize={Math.max(10, Math.min(18, w / 8))} fill={color + 'cc'}
                fontFamily="monospace" fontWeight={700} style={{ pointerEvents: 'none' }}>
                {fmt2(areaM2)} m²
              </text>
            )
          })()}
        </g>
      )
    }

    const pts = allPts.map(p => `${p.x},${p.y}`).join(' ')
    const mpp = project.calibration.mpp
    const total = polylineLength(allPts, mpp)
    return (
      <g style={{ pointerEvents: 'none' }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
        {/* Per-segment length labels */}
        {allPts.slice(1).map((p, i) => {
          const a = allPts[i]
          const dx = p.x - a.x
          const dy = p.y - a.y
          const segLen = Math.sqrt(dx * dx + dy * dy)
          if (segLen < 18) return null   // skip tiny segments to avoid clutter
          const mx = (a.x + p.x) / 2
          const my = (a.y + p.y) / 2
          // offset the label perpendicular to the segment so it sits beside the line
          const nx = segLen ? -dy / segLen : 0
          const ny = segLen ?  dx / segLen : 0
          return (
            <text key={i} x={mx + nx * 12} y={my + ny * 12} textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fill={color} fontFamily="monospace" fontWeight={700}>
              {fmtM(+(segLen * mpp).toFixed(3))}
            </text>
          )
        })}
        {/* Running total near the cursor */}
        {total > 0 && (
          <text x={mousePos.x + 14} y={mousePos.y - 10} textAnchor="start"
            fontSize={12} fill={color} fontFamily="monospace" fontWeight={700}>
            Σ {fmtM(total)}
          </text>
        )}
      </g>
    )
  }

  // ── Render: where the cursor has snapped to: a square at a corner or end, a triangle at a mid-point ─────────
  function renderSnapMarker() {
    if (!snapInfo?.target) return null
    const r = 6 / zoom, t = snapInfo.target
    return (
      <g style={{ pointerEvents: 'none' }}>
        {snapInfo.kind === 'end'
          ? <rect x={t.x - r} y={t.y - r} width={2 * r} height={2 * r} fill="none" stroke="#7fdc3c" strokeWidth={2 / zoom} />
          : <polygon points={`${t.x},${t.y - r * 1.2} ${t.x - r * 1.1},${t.y + r * 0.8} ${t.x + r * 1.1},${t.y + r * 0.8}`} fill="none" stroke="#f1c40f" strokeWidth={2 / zoom} />}
      </g>
    )
  }

  // ── Render: the measure tool's line (nothing here is saved or priced) ───────────────────────────────────
  function renderMeasure() {
    const live = tool === 'measure' && isDrawing && drawPoints.length > 0
    const pts = live ? [...drawPoints, mousePos] : (measureDone?.points ?? [])
    if (pts.length < 1) return null
    const mpp = project.calibration.mpp
    const c = '#00d4ff'
    const total = polylineLength(pts, mpp)
    return (
      <g style={{ pointerEvents: 'none' }}>
        <polyline points={pts.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={c} strokeWidth={2.5 / zoom} strokeDasharray={live ? `${6 / zoom} ${4 / zoom}` : undefined} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4 / zoom} fill={c} stroke="#000" strokeWidth={1 / zoom} />)}
        {/* each segment's length, beside the line */}
        {pts.slice(1).map((p, i) => {
          const a = pts[i]
          const dx = p.x - a.x, dy = p.y - a.y
          const segLen = Math.sqrt(dx * dx + dy * dy)
          if (segLen * zoom < 28) return null   // too short on screen to label without clutter
          const nx = -dy / segLen, ny = dx / segLen
          return (
            <text key={i} x={(a.x + p.x) / 2 + nx * 13 / zoom} y={(a.y + p.y) / 2 + ny * 13 / zoom} textAnchor="middle" dominantBaseline="middle"
              fontSize={12 / zoom} fill={c} stroke="#000" strokeWidth={3 / zoom} paintOrder="stroke" fontFamily="monospace" fontWeight={700}>
              {fmtM(+(segLen * mpp).toFixed(3))}
            </text>
          )
        })}
        {/* the running total at the end of the line */}
        {pts.length > 2 && total > 0 && (
          <text x={pts[pts.length - 1].x + 14 / zoom} y={pts[pts.length - 1].y - 12 / zoom} textAnchor="start"
            fontSize={13 / zoom} fill="#fff" stroke="#000" strokeWidth={3.5 / zoom} paintOrder="stroke" fontFamily="monospace" fontWeight={800}>
            Σ {fmtM(total)}
          </text>
        )}
      </g>
    )
  }

  // ── Render: calibration ghost ──────────────────────────────────────────────
  function renderCalibGhost() {
    if (!calibDrawing) return null
    const pts = calibPts.length === 0
      ? [mousePos, mousePos]
      : calibPts.length === 1 ? [calibPts[0], mousePos] : calibPts

    const ptsStr = pts.map(p => `${p.x},${p.y}`).join(' ')
    return (
      <g style={{ pointerEvents: 'none' }}>
        <polyline points={ptsStr} fill="none" stroke="#f1c40f" strokeWidth={2} strokeDasharray="4 3" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#f1c40f" />)}
      </g>
    )
  }

  // ── Internal Wall Measurement Engine ─────────────────────────────────────────
  // Line-based: user draws a wall run → enters height, construction type, finish → openings deducted.
  // calcMaterialLines() produces an editable per-m² breakdown; user confirms before quote export.
  function renderWallMeasurementEngine(item: TakeoffItem) {
    const accent2  = '#5d8aa8'
    const bgCard   = darkMode ? `rgba(44,62,80,0.12)` : `rgba(44,62,80,0.06)`
    const bdCard   = `rgba(44,62,80,0.25)`

    const linkEl         = item.elementId ? project.elements.find(e => e.id === item.elementId) : null
    const isLineBased    = linkEl?.type === 'line'
    const wallLength     = item.length ?? 0
    const wallHeight     = item.wallHeight ?? 2.4
    const finishSidesVal = (item.finishSides ?? 2) as 1 | 2
    const ctype          = (item.wallConstructionType ?? 'stud_metal_70') as WallConstructionType
    const ftype          = (item.wallFinishType ?? 'board_skim') as WallFinishType
    const openings       = item.openings ?? []
    const mats           = item.calculatedMaterials ?? []
    const confirmed      = item.materialsConfirmed ?? false

    const grossArea    = +(wallLength * wallHeight).toFixed(3)
    const openingsArea = +openingsAreaOf(item).toFixed(3)
    const netArea      = +(Math.max(0, grossArea - openingsArea)).toFixed(3)
    const finishArea   = +(netArea * finishSidesVal).toFixed(3)
    const totals       = sumByCategory(mats)

    function recalcAndSave(patch: Partial<TakeoffItem>) {
      const merged   = { ...item, ...patch }
      const h        = merged.wallHeight    ?? wallHeight
      const sides    = (merged.finishSides  ?? finishSidesVal) as 1 | 2
      const ops      = [...(merged.openings ?? openings), ...(item.drawnOpenings ?? [])]
      const ct       = (merged.wallConstructionType ?? ctype) as WallConstructionType
      const ft       = (merged.wallFinishType ?? ftype) as WallFinishType
      const newGross = +(wallLength * h).toFixed(3)
      const newOpA   = +ops.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
      const newNet   = +(Math.max(0, newGross - newOpA)).toFixed(3)
      const newMats  = calcMaterialLines(ct, ft, sides, newNet, merged.calculatedMaterials)
      saveItemEdit({ ...merged, area: newGross, qty: newNet, unit: 'm²', calculatedMaterials: newMats, materialsConfirmed: false })
    }

    function addOpening(type: WallOpeningType) {
      const def = WALL_OPENING_DEFAULTS[type]
      const op: WallOpening = { id: Math.random().toString(36).slice(2, 8), type, label: WALL_OPENING_LABELS[type], width: def.width, height: def.height }
      recalcAndSave({ openings: [...openings, op] })
    }
    function updateOpening(id: string, changes: Partial<WallOpening>) {
      recalcAndSave({ openings: openings.map(o => o.id === id ? { ...o, ...changes } : o) })
    }
    function removeOpening(id: string) {
      recalcAndSave({ openings: openings.filter(o => o.id !== id) })
    }
    function updateMaterial(matId: string, patch: { qty?: number; unitRate?: number }) {
      const updated = mats.map(m => m.id === matId ? recalcMaterial(m, patch) : m)
      saveItemEdit({ ...item, calculatedMaterials: updated })
    }
    function toggleMaterial(matId: string, enabled: boolean) {
      const updated = mats.map(m => m.id === matId ? { ...m, enabled } : m)
      saveItemEdit({ ...item, calculatedMaterials: updated })
    }

    return (
      <div style={{ padding: 14, fontSize: 13, overflowY: 'auto', height: '100%' }}>

        {/* ── Metrics card ── */}
        <div style={{ background: bgCard, borderRadius: 8, padding: '12px 14px', marginBottom: 12, border: `1px solid ${bdCard}` }}>
          <div style={{ fontSize: 10, color: accent2, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🏗 Internal Wall
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isLineBased ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8, marginBottom: 8 }}>
            {isLineBased && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: accent2, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(wallLength)}</div>
                <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m wall run</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: darkMode ? '#c8d8a8' : '#2b3a2b', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(grossArea)}</div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m² gross{openingsArea > 0 ? ` (−${fmt2(openingsArea)})` : ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: accent2, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(netArea)}</div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m² net</div>
            </div>
          </div>
          <div style={{ background: darkMode ? '#1a1a20' : '#eef0f8', borderRadius: 6, padding: '8px 10px', border: `1px solid ${darkMode ? '#3a3a5a' : '#c5cae9'}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#7986cb', fontFamily: 'monospace' }}>{fmt2(finishArea)}</span>
              <span style={{ fontSize: 11, color: darkMode ? '#7986cb' : '#3949ab' }}>m² finish area</span>
              <span style={{ fontSize: 10, color: '#6a8a6a', marginLeft: 'auto' }}>{netArea} × {finishSidesVal} side{finishSidesVal > 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>

        {/* ── Label ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Drawing Label</label>
          <input style={inputStyle} value={editingElement?.label ?? item.name}
            onChange={e => { if (editingElement) saveElementEdit({ ...editingElement, label: e.target.value }); saveItemEdit({ ...item, name: e.target.value }) }} />
        </div>

        {/* ── Wall height ── */}
        {isLineBased && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Wall / Storey Height (m)</label>
            <NumInput type="number" step={0.05} min={0.1} max={10}
              style={{ ...inputStyle, color: accent2 }}
              value={wallHeight}
              onChange={e => recalcAndSave({ wallHeight: Math.max(0.1, +e.target.value || 2.4) })} />
          </div>
        )}

        {/* ── Construction type ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Construction Type</label>
          <select style={{ ...inputStyle, color: accent2 }} value={ctype}
            onChange={e => recalcAndSave({ wallConstructionType: e.target.value as WallConstructionType })}>
            {(Object.entries(WALL_CONSTRUCTION_LABELS) as [WallConstructionType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* ── Finish type ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Finish Type</label>
          <select style={{ ...inputStyle, color: accent2 }} value={ftype}
            onChange={e => recalcAndSave({ wallFinishType: e.target.value as WallFinishType })}>
            {(Object.entries(WALL_FINISH_LABELS) as [WallFinishType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* ── Finish sides ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Finish Sides</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([1, 2] as const).map(n => (
              <div key={n} onClick={() => recalcAndSave({ finishSides: n })}
                style={{
                  flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                  background: finishSidesVal === n ? (darkMode ? '#2a2a3a' : '#e8eaf6') : 'var(--to-alt)',
                  border: `1px solid ${finishSidesVal === n ? '#7986cb' : 'var(--to-border)'}`,
                  color: finishSidesVal === n ? '#7986cb' : 'var(--to-sub)', fontWeight: finishSidesVal === n ? 700 : 400,
                }}>
                {n === 1 ? '1 Side' : '2 Sides'}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 3 }}>
            {finishSidesVal === 1 ? 'One face finished (e.g. against existing structure)' : 'Both faces finished (e.g. new stud partition — board & skim both sides)'}
          </div>
        </div>

        {/* ── Openings ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#6a8a6a', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Openings &amp; Deductions</span>
            {openingsArea > 0 && <span style={{ color: '#e67e22' }}>−{fmt2(openingsArea)} m²</span>}
          </div>
          {openings.map(op => (
            <div key={op.id} style={{ background: darkMode ? '#1a1a0d' : '#fffde7', border: `1px solid ${darkMode ? '#3a3a1a' : '#fff176'}`, borderRadius: 5, padding: '6px 8px', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <select value={op.type}
                  onChange={e => updateOpening(op.id, { type: e.target.value as WallOpeningType, label: WALL_OPENING_LABELS[e.target.value as WallOpeningType] })}
                  style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 5px' }}>
                  {(Object.keys(WALL_OPENING_LABELS) as WallOpeningType[]).map(k => (
                    <option key={k} value={k}>{WALL_OPENING_LABELS[k]}</option>
                  ))}
                </select>
                <button onClick={() => removeOpening(op.id)}
                  style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 9 }}>Width (m)</label>
                  <NumInput type="number" step={0.05} min={0.1} style={{ ...inputStyle, fontSize: 11 }}
                    value={op.width} onChange={e => updateOpening(op.id, { width: Math.max(0.1, +e.target.value || 0.9) })} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 9 }}>Height (m)</label>
                  <NumInput type="number" step={0.05} min={0.1} style={{ ...inputStyle, fontSize: 11 }}
                    value={op.height} onChange={e => updateOpening(op.id, { height: Math.max(0.1, +e.target.value || 2.1) })} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#8a7a3a', marginTop: 3 }}>{fmt2(op.width * op.height)} m² deducted</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {(['door', 'window', 'bifold', 'french_door', 'other'] as WallOpeningType[]).map(t => (
              <button key={t} onClick={() => addOpening(t)}
                style={{ ...btnStyle, fontSize: 10, padding: '4px 7px', background: 'transparent', borderColor: '#5a4a1a', color: '#c8a830' }}>
                + {WALL_OPENING_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Materials Breakdown ── */}
        {mats.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#6a8a6a', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Materials Breakdown</span>
              <span style={{ color: '#4a6a4a' }}>{mats.filter(m => m.enabled).length}/{mats.length} active</span>
            </div>
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 58px 52px 58px 8px', gap: 3, padding: '2px 4px', fontSize: 9, color: '#4a6a4a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
              <span /><span>Item</span><span style={{ textAlign: 'right' }}>Qty</span><span style={{ textAlign: 'right' }}>£/unit</span><span style={{ textAlign: 'right' }}>Total</span><span />
            </div>
            {mats.map(m => (
              <div key={m.id} style={{
                display: 'grid', gridTemplateColumns: '14px 1fr 58px 52px 58px 8px',
                gap: 3, alignItems: 'center', padding: '4px 4px', marginBottom: 2, borderRadius: 4,
                background: m.enabled ? (darkMode ? '#0d1a0d' : '#f5f9f5') : (darkMode ? '#090f09' : '#f0f0f0'),
                border: `1px solid ${m.enabled ? (darkMode ? '#1e2e1e' : '#c8ddc8') : (darkMode ? '#111' : '#ddd')}`,
                opacity: m.enabled ? 1 : 0.5,
              }}>
                <input type="checkbox" checked={m.enabled}
                  onChange={e => toggleMaterial(m.id, e.target.checked)}
                  style={{ margin: 0, cursor: 'pointer' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: m.enabled ? (darkMode ? '#c8d8a8' : '#2b3a2b') : '#6a8a6a', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}{m.isOverridden && <span style={{ fontSize: 8, color: '#e67e22', marginLeft: 4 }}>✏</span>}
                  </div>
                  <div style={{ fontSize: 9, color: '#6a8a6a' }}>{m.unit}{m.wastePercent > 0 ? ` +${m.wastePercent}%` : ''}</div>
                </div>
                <NumInput type="number" step="any" min={0}
                  style={{ width: '100%', background: darkMode ? '#162216' : '#f0f4f0', border: `1px solid ${darkMode ? '#2a3a2a' : '#c8d8c8'}`, borderRadius: 3, color: m.isOverridden ? '#e67e22' : (darkMode ? '#c8d8a8' : '#2b3a2b'), fontSize: 10, padding: '2px 3px', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                  value={m.qty}
                  onChange={e => updateMaterial(m.id, { qty: Math.max(0, +e.target.value || 0) })}
                />
                <NumInput type="number" step="any" min={0}
                  style={{ width: '100%', background: darkMode ? '#162216' : '#f0f4f0', border: `1px solid ${darkMode ? '#2a3a2a' : '#c8d8c8'}`, borderRadius: 3, color: m.isOverridden ? '#e67e22' : (darkMode ? '#c8d8a8' : '#2b3a2b'), fontSize: 10, padding: '2px 3px', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                  value={m.unitRate}
                  onChange={e => updateMaterial(m.id, { unitRate: Math.max(0, +e.target.value || 0) })}
                />
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: m.enabled ? (darkMode ? '#c8d8a8' : '#2b3a2b') : '#4a6a4a', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {m.enabled ? `£${m.totalCost.toFixed(2)}` : '—'}
                </div>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[m.category] ?? '#95a5a6', flexShrink: 0, alignSelf: 'center' }} title={m.category} />
              </div>
            ))}

            {/* Category totals */}
            <div style={{ marginTop: 8, borderTop: `1px solid ${darkMode ? '#2a3a2a' : '#dde'}`, paddingTop: 8 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {(['labour', 'materials', 'plant', 'subcontractors', 'other'] as const)
                  .filter(cat => totals[cat] > 0)
                  .map(cat => (
                    <div key={cat} style={{ textAlign: 'center', padding: '5px 8px', background: darkMode ? '#0d1520' : '#f0f4ff', borderRadius: 4, border: `1px solid ${darkMode ? '#1a2a40' : '#c0d0ee'}`, flex: '1 1 auto', minWidth: 64 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: CAT_COLOR[cat], fontFamily: 'monospace' }}>£{totals[cat].toFixed(2)}</div>
                      <div style={{ fontSize: 9, color: '#6a8a6a', marginTop: 1, textTransform: 'capitalize' }}>{cat}</div>
                    </div>
                  ))
                }
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: darkMode ? '#0d1a20' : '#e0e8f0', borderRadius: 5, border: `1px solid ${darkMode ? '#1a3040' : '#b0c8e0'}` }}>
                <span style={{ fontSize: 11, color: '#6a8a6a' }}>Total cost (excl. markup &amp; VAT)</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: accent2, fontFamily: 'monospace' }}>£{totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Confirm & Send to Quote ── */}
        {!confirmed ? (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => saveItemEdit({ ...item, materialsConfirmed: true })}
              disabled={mats.length === 0}
              style={{
                width: '100%', padding: '10px', borderRadius: 6, cursor: mats.length > 0 ? 'pointer' : 'not-allowed',
                background: darkMode ? '#1a3a1a' : '#dcfce7',
                border: `1px solid ${darkMode ? '#3d7a3d' : '#86efac'}`,
                color: darkMode ? '#86efac' : '#166534',
                fontSize: 13, fontWeight: 700, opacity: mats.length > 0 ? 1 : 0.5,
              }}
            >
              ✅ Confirm &amp; Send to Quote
            </button>
            <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 4, textAlign: 'center' }}>
              Review quantities &amp; rates above, then confirm to enable export.
            </div>
          </div>
        ) : (
          <div style={{
            marginBottom: 12, padding: '8px 12px', borderRadius: 6,
            background: darkMode ? '#1a3a1a' : '#dcfce7',
            border: `1px solid ${darkMode ? '#3d7a3d' : '#86efac'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, color: darkMode ? '#86efac' : '#166534', fontWeight: 700 }}>✅ Confirmed — will export to quote</span>
            <button
              onClick={() => saveItemEdit({ ...item, materialsConfirmed: false })}
              style={{ background: 'none', border: 'none', color: '#6a8a6a', cursor: 'pointer', fontSize: 11 }}>Edit</button>
          </div>
        )}

        {/* ── Client Description ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Client Description (quote text)</label>
          <textarea style={{ ...inputStyle, height: 60, resize: 'none', fontSize: 11, lineHeight: 1.5 }}
            value={item.spec ?? ''}
            onChange={e => saveItemEdit({ ...item, spec: e.target.value })} />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Drawing Ref</label>
          <input style={inputStyle} value={item.drawingRef ?? ''} onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Building Regs Notes</label>
          <textarea style={{ ...inputStyle, height: 44, resize: 'none' }}
            value={item.buildingRegsNotes ?? ''}
            onChange={e => saveItemEdit({ ...item, buildingRegsNotes: e.target.value })} />
        </div>

        {/* ── Delete ── */}
        <button
          style={{ ...btnStyle, background: '#c0392b', borderColor: '#c0392b', marginTop: 4 }}
          onClick={() => {
            if (item.elementId) {
              setProject(p => ({ ...p, elements: p.elements.filter(el2 => el2.id !== item.elementId), items: p.items.filter(it => it.id !== item.id) }))
              setSelectedId(null)
            } else {
              setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) }))
            }
            setEditingItem(null); setEditingElement(null); setPanelMode('schedule')
          }}
        >
          🗑 Delete Wall Item
        </button>
      </div>
    )
  }

  // ── Unified Properties Panel ────────────────────────────────────────────────
  function renderUnifiedProperties(rawItem: TakeoffItem) {

    // ── 1. Resolve linked element ──────────────────────────────────────────
    const linkedEl = rawItem.elementId
      ? project.elements.find(e => e.id === rawItem.elementId) ?? null
      : null
    let item = rawItem

    // ── 2. Auto-init (same logic as old renderProperties waterfall) ────────

    // Demo
    if ((item.phase === 'Demolition' || (item.phase as string) === 'Site Setup & Demolition') && !item.demoSubphaseId) {
      // a new line starts on the first sub-phase that has tasks (a calculator entry has none)
      const _defSub  = liveDemoSubs.find(sb => !sb.calculatorId && sb.tasks.length > 0)
      const _defTask = _defSub?.tasks[0]
      if (_defSub && _defTask) {
      const _q = item.qty > 0 ? item.qty : _defTask.defaultQty
      item = {
        ...item,
        name: _defTask.name, spec: _defTask.clientDescription,
        demoSubphaseId: _defSub.id, demoTaskId: _defTask.id,
        demoMarkupPct: _defSub.markupPct, subPhase: _defSub.name,
        unit: _defTask.unit, qty: _q,
        demoLabour:        +(_defTask.labourCost        * _q).toFixed(2),
        demoMaterials:     +(_defTask.materialCost      * _q).toFixed(2),
        demoPlant:         +(_defTask.plantCost         * _q).toFixed(2),
        demoWaste:         +(_defTask.wasteCost         * _q).toFixed(2),
        demoSubcontractor: +(_defTask.subcontractorCost * _q).toFixed(2),
        demoOther:         +(_defTask.otherCost         * _q).toFixed(2),
      }
      saveItemEdit(item)
      } else {
        // no Demolition sub-phase has tasks (Back Office keeps only calculator entries): start on the first calculator entry rather than an unpriced blank line
        const _calcSub = liveDemoSubs.find(sb => sb.calculatorId)
        if (_calcSub) {
          const _boSub = boSubPhases.find(b => b.canonical_id === 'demo-' + _calcSub.id)
          item = {
            ...item, name: _calcSub.name, spec: '', demoSubphaseId: _calcSub.id, demoTaskId: undefined, demoMarkupPct: _calcSub.markupPct, subPhase: _calcSub.name,
            taskSubphaseId: _boSub?.id, assemblyResult: undefined, assemblyCalcState: undefined,
            demoLabour: 0, demoMaterials: 0, demoPlant: 0, demoWaste: 0, demoSubcontractor: 0, demoOther: 0,
          }
          saveItemEdit(item)
        }
      }
    }

    // External Walls
    if (item.phase === 'External Walls') {
      const _allWT = allWallMakeups
      if (!item.floorMakeupId) {
        item = { ...item, floorMakeupId: _allWT[0].id, spec: _allWT[0].clientDescription }
        saveItemEdit(item)
      }
      if (linkedEl?.type === 'line' && item.wallHeight == null) {
        const _gross = +((item.length ?? 0) * 2.7).toFixed(3)
        item = { ...item, wallHeight: 2.7, area: _gross, qty: _gross, unit: 'm²' }
        saveItemEdit(item)
      }
    }

    // Plastering: a line is priced by Finish Type and wall height, unless the room calculator (Internal Plastering & Boarding by room) was picked for it
    const _plasterCalc = item.phase === 'Plastering & Boarding' && !!resolveBuiltAssembly(item)
    if (item.phase === 'Plastering & Boarding' && !_plasterCalc) {
      if (!item.floorMakeupId) {
        item = { ...item, floorMakeupId: PLASTER_MAKEUPS[0].id, spec: PLASTER_MAKEUPS[0].clientDescription }
        saveItemEdit(item)
      }
      if (linkedEl?.type === 'line' && item.wallHeight == null) {
        const _sides = item.plasterFinishSides ?? 1
        const _gross = +((item.length ?? 0) * 2.4).toFixed(3)
        item = { ...item, wallHeight: 2.4, plasterFinishSides: _sides, area: _gross, qty: +(_gross * _sides).toFixed(3), unit: 'm²' }
        saveItemEdit(item)
      }
    }

    // Internal Walls
    if (item.phase === 'Internal Walls & Partitions' && linkedEl?.type === 'line' && !item.wallConstructionType) {
      const _defH: number = 2.4
      const _defSides: 1 | 2 = 2
      const _gross = +((item.length ?? 0) * _defH).toFixed(3)
      item = {
        ...item,
        wallConstructionType: 'stud_metal_70' as WallConstructionType,
        wallFinishType:       'board_skim'     as WallFinishType,
        finishSides: _defSides, wallHeight: _defH,
        area: _gross, qty: _gross, unit: 'm²',
        calculatedMaterials: calcMaterialLines('stud_metal_70', 'board_skim', _defSides, _gross),
        materialsConfirmed: false,
      }
      saveItemEdit(item)
    }

    // Foundation line — auto-init dimensions on first open
    if (item.phase === 'Foundations' && linkedEl?.type === 'line' && item.foundationWidth == null) {
      const _len = item.length ?? 0
      const _wM  = 0.6    // 600mm default
      const _dM  = 1.0    // 1000mm default
      item = {
        ...item,
        foundationWidth: 600, foundationDepth: 1000, foundationType: item.foundationType ?? 'trench_fill',
        unit:   'lm',
        qty:    +_len.toFixed(3),
        area:   +(_len * _wM).toFixed(3),
        volume: +(_len * _wM * _dM).toFixed(3),
      }
      saveItemEdit(item)
    }

    // Buildup (Floors, Foundations, rect/polygon External Walls, Plastering rect)
    const _phaseMakeups = PHASE_MAKEUPS[item.phase]
    const _isBuildupItem = (!!item.floorMakeupId || (!!_phaseMakeups && !!linkedEl && linkedEl.type !== 'line')) && !_plasterCalc
    if (_isBuildupItem && !item.floorMakeupId) {
      const _idx = item.phase === 'Floors & Screeds' ? 1 : 0
      const _dm  = (_phaseMakeups ?? FLOOR_MAKEUPS)[_idx]
      item = { ...item, floorMakeupId: _dm.id, spec: _dm.clientDescription }
      saveItemEdit(item)
    }

    // Generic phase tasks — Internal Walls has its own dedicated sub-phase picker below
    // (recipe engine or assembly calculator, depending on what's picked), so it's excluded
    // here rather than also being auto-stamped with flat-task cost fields nothing displays.
    const _subs = item.phase === 'Internal Walls & Partitions' ? [] : getAllSubphasesForPhase(item.phase)
    const _phaseHasTasks = _subs.length > 0
    if (_phaseHasTasks && !item.taskSubphaseId && !_isBuildupItem) {
      const _ds = _subs[0]; const _dt = _ds?.tasks[0]
      const _dsCanon = _ds ? boSubPhases.find(b => b.id === _ds.id)?.canonical_id : undefined
      if (_ds && item.phase === 'Decoration' && _dsCanon && BUILT_ASSEMBLY_CANON_IDS[_dsCanon]) {
        // The first Decoration sub-phase is priced by its calculator: carry it onto the item, with no flat task
        item = { ...item, taskSubphaseId: _ds.id, subPhase: _ds.name }
        saveItemEdit(item)
      } else if (_ds && _dt) {
        const _q = item.qty > 0 ? item.qty : _dt.defaultQty
        item = {
          ...item, name: _dt.name, spec: _dt.notes ?? '',
          taskSubphaseId: _ds.id, taskId: _dt.id, taskMarkupPct: _ds.markupPct,
          subPhase: _ds.name, unit: _dt.unit, qty: _q,
          taskLabour:        +(_dt.labour        * _q).toFixed(2),
          taskMaterials:     +(_dt.materials     * _q).toFixed(2),
          taskPlant:         +(_dt.plant         * _q).toFixed(2),
          taskSubcontractor: +(_dt.subcontractor * _q).toFixed(2),
          taskOther:         +(_dt.other         * _q).toFixed(2),
        }
        saveItemEdit(item)
      }
    }

    // ── 3. Phase flags ─────────────────────────────────────────────────────
    const isLineBased      = linkedEl?.type === 'line'
    const isDemoPhase      = item.phase === 'Demolition' || (item.phase as string) === 'Site Setup & Demolition'
    // a demolition item priced by a calculator (Wall Removal / Knock-Through) is not a task item
    const isDemoCalc       = isDemoPhase && !!demoCalcSub(item)
    const isDemo           = isDemoPhase && !isDemoCalc
    // Only Wall Removal is sized by the drawn line; the other demolition calculators take typed sizes, so the line is just a marker
    const _demoMarker      = isDemoCalc && demoCalcSub(item)?.calculatorId !== 'demo-wall-removal-calc'
    const isExtWall        = item.phase === 'External Walls'
    const isIntWall        = item.phase === 'Internal Walls & Partitions' && isLineBased
    const isPlaster        = item.phase === 'Plastering & Boarding' && !_plasterCalc
    const isBuildup        = _isBuildupItem
    const isFoundationLine = item.phase === 'Foundations' && isLineBased
    const isTurf           = isBuildup && item.phase === 'External Works & Landscaping'
    // Decoration is a task phase, except when the sub-phase picked has a calculator (Internal decoration): then the calculator prices it
    const isDecoCalc       = MARKER_CALC_PHASES.has(item.phase) && !!resolveBuiltAssembly(item)
    // the external render and wall insulation calculators take their first wall's length from the drawn line, so the card shows the length, not a marker
    const _lengthFedCalc    = isDecoCalc && item.phase === 'Plastering & Boarding' && ['plaster-render', 'plaster-insul-wall'].includes(boSubPhases.find(b => b.id === item.taskSubphaseId)?.canonical_id ?? '')
    // the tiling calculators are sized from what is drawn: an area gives the first room its size, a line gives wall tiling its first wall's length
    const _tileCalc        = isDecoCalc && item.phase === 'Tiling & Finishes'
    const isTaskPhase      = _phaseHasTasks && !isBuildup && !isExtWall && !isPlaster && !isIntWall && !isDemo && !isDemoCalc && !isFoundationLine && !isDecoCalc
    const showWallLine     = isLineBased && (isExtWall || isIntWall || isPlaster)
    const hasOpenings      = (isExtWall || isIntWall || isPlaster) && isLineBased

    // Internal Walls: the selected sub-phase (live from Back Office, same as every other phase).
    const intWallSubs   = isIntWall ? getAllSubphasesForPhase('Internal Walls & Partitions') : []
    const intWallSelSub = intWallSubs.find(s => s.id === item.taskSubphaseId) ?? intWallSubs[0]

    // Does the selected sub-phase (internal) or Build-up Type (external) have a built assembly
    // calculator? See resolveBuiltAssembly. When it does, it has final say on measurements/
    // materials/pricing, so all the old recipe-engine/build-up UI below is suppressed.
    const isRoof = item.phase === 'Roof'
    // A raft is a shape in Foundations, sized from the box it sits in (like a roof)
    const isFoundationShape = item.phase === 'Foundations' && !isLineBased && !!linkedEl
    // A floor is a shape too, sized from its area and perimeter
    const isFloorShape = item.phase === 'Floors & Screeds' && !isLineBased && !!linkedEl
    const builtAssembly = (isIntWall || isExtWall || isRoof || isFoundationLine || isFoundationShape || isFloorShape || isDecoCalc || isDemoCalc) ? resolveBuiltAssembly(item) : undefined
    const hideForBuiltAssembly = (isIntWall || isExtWall || isRoof || isFoundationLine || isFoundationShape || isFloorShape || isDecoCalc || isDemoCalc) && !!builtAssembly

    // The calculator is too big for this ~300px panel, so the panel shows a summary card and the
    // calculator itself opens full size in a window (see AssemblyWindow.tsx). A wall is sized by its
    // length; a roof by the box its drawn shape sits in.
    const isBoxShape = isRoof || isFoundationShape
    const roofBox = isBoxShape ? drawnBoxMm(item) : undefined
    const floorDims = (isFloorShape || _tileCalc) ? drawnAreaPerimeter(item) : undefined
    const renderAssemblyPanel = (savePatch: Partial<TakeoffItem>) => builtAssembly && (
      <AssemblyItemPanel
        name={item.name}
        lengthM={item.length ?? 0}
        measureLabel={isBoxShape ? 'Size' : isFloorShape || (_tileCalc && floorDims) ? 'Area' : _tileCalc && (item.length ?? 0) > 0 ? 'Length' : (isDecoCalc && !_lengthFedCalc) || _demoMarker ? 'Marker' : undefined}
        measureText={isBoxShape ? (roofBox ? `${(roofBox.lengthMm / 1000).toFixed(2)} × ${(roofBox.widthMm / 1000).toFixed(2)} m` : 'Not drawn') : isFloorShape || (_tileCalc && floorDims) ? (floorDims ? `${floorDims.areaM2.toFixed(1)} m²` : 'Not drawn') : _tileCalc && (item.length ?? 0) > 0 ? `${(item.length ?? 0).toFixed(2)} m` : _demoMarker ? 'sizes are typed in the calculator' : isDecoCalc && !_lengthFedCalc ? 'rooms are set in the calculator' : undefined}
        saved={item.assemblyResult}
        open={assemblyWindowItemId === item.id}
        onOpen={() => setAssemblyWindowItemId(item.id)}
        onClose={() => setAssemblyWindowItemId(null)}
      >
        <SharedWallAreasProvider rooms={sharedWallRoomsFrom(project.items.map(i => i.assemblyCalcState))}>
        {builtAssembly.render({
          externalLengthMm: isBoxShape ? roofBox?.lengthMm : ((item.length ?? 0) > 0 ? Math.round((item.length ?? 0) * 1000) : undefined),
          externalWidthMm: isBoxShape ? roofBox?.widthMm : undefined,
          externalAreaM2: floorDims?.areaM2,
          externalPerimeterM: floorDims?.perimeterM,
          variant: item.floorMakeupId === 'cold_flat_roof' ? 'cold' : undefined,
          labourTrades,
          calcState: item.assemblyCalcState,
          wallOpenings: isExtWall && item.elementId ? planWallOpenings(livePlaced, item.elementId, project.calibration.mpp) : undefined,
          onSave: result => {
            const { calcState, state: _state, size, ...res } = result
            saveItemEdit({
              ...item, ...savePatch, assemblyResult: res, assemblyCalcState: calcState, name: result.name, roomName: result.location || item.roomName,
            })
            setAssemblyWindowItemId(null)
            // A size typed over inside the calculator carries back to the drawing: the drawn line, roof box or floor is scaled to match, and its quantity, label and area follow (the drawing is what Take-off measures from)
            const drawn = item.elementId ? project.elements.find(e => e.id === item.elementId) : undefined
            const kind = isBoxShape ? 'box' : isFloorShape ? 'area' : isLineBased ? 'line' : null
            const plan = drawn && kind && size ? planResize(kind, drawn.points, project.calibration.mpp, size) : null
            if (drawn && plan) {
              setProject(p => {
                const elements = p.elements.map(e => (e.id === drawn.id ? { ...e, points: applyResize(e.points, plan) } : e))
                return { ...p, elements, items: recalcItemsForMpp(p.items, elements, p.calibration.mpp, new Set([drawn.id])) }
              })
              showToast(`Drawing changed to match the calculator: ${plan.was} → ${plan.now}`)
            }
          },
        })}
        </SharedWallAreasProvider>
      </AssemblyItemPanel>
    )

    // ── 4. Computed wall measurements ──────────────────────────────────────
    const wallLength     = item.length ?? 0
    const wallHeight     = item.wallHeight ?? (isExtWall ? 2.7 : 2.4)
    const openings       = item.openings ?? []
    const grossArea      = showWallLine ? +(wallLength * wallHeight).toFixed(3) : (item.area ?? 0)
    const openingsArea   = +openingsAreaOf(item).toFixed(3)
    const netArea        = +(Math.max(0, grossArea - openingsArea)).toFixed(3)
    const finishSidesVal = (item.finishSides ?? 2) as 1 | 2
    const plasterSides   = (item.plasterFinishSides ?? 1) as 1 | 2
    const finishArea     = +(netArea * finishSidesVal).toFixed(3)
    const wallPerimeter  = isLineBased ? wallLength
      : (linkedEl?.type === 'rect'    ? rectPerimeter(linkedEl.points, project.calibration.mpp)
        : linkedEl?.type === 'polygon' ? polyPerimeter(linkedEl.points, project.calibration.mpp)
        : 0)

    // ── 4b. Foundation line computed values ────────────────────────────────
    const foundLength  = item.length ?? 0
    const foundWidthMM = item.foundationWidth  ?? 600
    const foundDepthMM = item.foundationDepth  ?? 1000
    const foundWidthM  = foundWidthMM / 1000
    const foundDepthM  = foundDepthMM / 1000
    const foundArea    = +(foundLength * foundWidthM).toFixed(3)       // m² footprint
    const foundVolume  = +(foundLength * foundWidthM * foundDepthM).toFixed(3) // m³ excavation/concrete

    function recalcFoundationAndSave(patch: Partial<TakeoffItem>) {
      const m   = { ...item, ...patch }
      const len = foundLength
      const wM  = (m.foundationWidth  ?? 600)  / 1000
      const dM  = (m.foundationDepth  ?? 1000) / 1000
      saveItemEdit({ ...m,
        unit:   'lm',
        qty:    +len.toFixed(3),
        area:   +(len * wM).toFixed(3),
        volume: +(len * wM * dM).toFixed(3),
      })
    }

    const FOUNDATION_TYPE_OPTIONS = [
      { value: 'trench_fill', label: 'Trench Fill',      makeupId: 'trench_fill' },
      { value: 'strip',       label: 'Strip Footing',    makeupId: 'strip_found' },
      { value: 'pad_edge',    label: 'Pad / Edge Beam',  makeupId: 'pad_found'   },
      { value: 'raft_edge',   label: 'Raft Edge Beam',   makeupId: 'raft_found'  },
      { value: 'piled',       label: 'Piled Foundation (piles and beam)', makeupId: 'piled_found' },
      { value: 'underpin',    label: 'Underpinning (existing wall)',       makeupId: null },
      { value: 'other',       label: 'Other',            makeupId: null          },
    ]
    // Resolve the FOUNDATION_MAKEUPS entry for the current foundationType
    const foundMakeupId = FOUNDATION_TYPE_OPTIONS.find(o => o.value === (item.foundationType ?? 'trench_fill'))?.makeupId ?? null
    const foundMakeup   = foundMakeupId ? FOUNDATION_MAKEUPS.find(m => m.id === foundMakeupId) : null

    // ── 5. Wall helpers ────────────────────────────────────────────────────
    function recalcWallAndSave(patch: Partial<TakeoffItem>) {
      const merged = { ...item, ...patch }
      const h    = merged.wallHeight    ?? wallHeight
      const ops  = [...(merged.openings ?? openings), ...(item.drawnOpenings ?? [])]
      const newGross = +(wallLength * h).toFixed(3)
      const newOpA   = +ops.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
      const newNet   = +(Math.max(0, newGross - newOpA)).toFixed(3)
      if (isIntWall) {
        const sides = (merged.finishSides ?? finishSidesVal) as 1 | 2
        const ct = (merged.wallConstructionType ?? item.wallConstructionType ?? 'stud_metal_70') as WallConstructionType
        const ft = (merged.wallFinishType       ?? item.wallFinishType       ?? 'board_skim')    as WallFinishType
        const newMats = calcMaterialLines(ct, ft, sides, newNet, merged.calculatedMaterials)
        saveItemEdit({ ...merged, area: newGross, qty: newNet, unit: 'm²', calculatedMaterials: newMats, materialsConfirmed: false })
      } else if (isPlaster) {
        const sides = (merged.plasterFinishSides ?? plasterSides) as 1 | 2
        saveItemEdit({ ...merged, area: newGross, qty: +(newNet * sides).toFixed(3), unit: 'm²' })
      } else {
        saveItemEdit({ ...merged, area: newGross, qty: newNet, unit: 'm²' })
      }
    }

    function addOpening(type: WallOpeningType) {
      const def = WALL_OPENING_DEFAULTS[type]
      recalcWallAndSave({ openings: [...openings, { id: uid(), type, label: WALL_OPENING_LABELS[type], width: def.width, height: def.height }] })
    }
    function updateOpening(id: string, changes: Partial<WallOpening>) {
      recalcWallAndSave({ openings: openings.map(o => o.id === id ? { ...o, ...changes } : o) })
    }
    function removeOpening(id: string) {
      recalcWallAndSave({ openings: openings.filter(o => o.id !== id) })
    }

    // ── 6. Material engine helpers (Int Wall) ──────────────────────────────
    const mats      = item.calculatedMaterials ?? []
    const matTotals = sumByCategory(mats)
    function updateMaterial(matId: string, patch: { qty?: number; unitRate?: number }) {
      saveItemEdit({ ...item, calculatedMaterials: mats.map(m => m.id === matId ? recalcMaterial(m, patch) : m) })
    }
    function toggleMaterial(matId: string, enabled: boolean) {
      saveItemEdit({ ...item, calculatedMaterials: mats.map(m => m.id === matId ? { ...m, enabled } : m) })
    }

    // ── 7. Demo data & helpers ─────────────────────────────────────────────
    const allDemoSubs  = (isDemo || isDemoCalc) ? liveDemoSubs : []
    const demoSub      = allDemoSubs.find(s => s.id === item.demoSubphaseId) ?? allDemoSubs[0]
    const demoTask     = demoSub?.tasks.find(t => t.id === item.demoTaskId) ?? demoSub?.tasks[0]
    const demoMarkup   = item.demoMarkupPct ?? demoSub?.markupPct ?? 20
    const demoLabour   = item.demoLabour        ?? 0
    const demoMats     = item.demoMaterials     ?? 0
    const demoPlant    = item.demoPlant         ?? 0
    const demoWaste    = item.demoWaste         ?? 0
    const demoSubC     = item.demoSubcontractor ?? 0
    const demoOtherV   = item.demoOther         ?? 0
    const demoBase     = demoLabour + demoMats + demoPlant + demoWaste + demoSubC + demoOtherV
    const demoSelling  = isDemo ? calcDemoSellingPrice(demoLabour, demoMats, demoPlant, demoWaste, demoSubC, demoOtherV, demoMarkup) : 0

    function applyDemoTask(newSub: DemoSubphase, newTask: DemoTask) {
      const q = item.qty > 0 ? item.qty : newTask.defaultQty
      saveItemEdit({
        ...item, name: newTask.name, spec: newTask.clientDescription,
        // (coming from a calculator entry: drop its price and its link to the calculator)
        assemblyResult: undefined, assemblyCalcState: undefined, taskSubphaseId: undefined,
        demoSubphaseId: newSub.id, demoTaskId: newTask.id, demoMarkupPct: newSub.markupPct,
        subPhase: newSub.name, unit: newTask.unit, qty: q,
        demoLabour:        +(newTask.labourCost        * q).toFixed(2),
        demoMaterials:     +(newTask.materialCost      * q).toFixed(2),
        demoPlant:         +(newTask.plantCost         * q).toFixed(2),
        demoWaste:         +(newTask.wasteCost         * q).toFixed(2),
        demoSubcontractor: +(newTask.subcontractorCost * q).toFixed(2),
        demoOther:         +(newTask.otherCost         * q).toFixed(2),
      })
    }

    // Picking a calculator entry in the Construction Type list: the item is priced by that calculator (linked to its Back Office sub-phase, so the quote can reopen it)
    function applyDemoCalc(ns: DemoSubphase) {
      const boSub = boSubPhases.find(b => b.canonical_id === 'demo-' + ns.id)
      saveItemEdit({
        ...item, name: ns.name, spec: '', demoSubphaseId: ns.id, demoTaskId: undefined, demoMarkupPct: ns.markupPct, subPhase: ns.name,
        taskSubphaseId: boSub?.id, assemblyResult: undefined, assemblyCalcState: undefined,
        demoLabour: 0, demoMaterials: 0, demoPlant: 0, demoWaste: 0, demoSubcontractor: 0, demoOther: 0,
      })
    }

    // ── 8. Task phase data & helpers ───────────────────────────────────────
    const taskSubs    = isTaskPhase ? getAllSubphasesForPhase(item.phase) : []
    const taskSelSub  = taskSubs.find(s => s.id === item.taskSubphaseId) ?? taskSubs[0]
    const taskList    = taskSelSub ? getTasksForSubphase(taskSelSub.id) : []
    const taskSelTask = taskList.find(t => t.id === item.taskId) ?? taskList[0]
    const taskMarkup  = item.taskMarkupPct ?? taskSelSub?.markupPct ?? 20
    const taskLabour  = item.taskLabour      ?? 0
    const taskMats    = item.taskMaterials   ?? 0
    const taskPlant   = item.taskPlant       ?? 0
    const taskSubC    = item.taskSubcontractor ?? 0
    const taskOtherV  = item.taskOther       ?? 0
    const taskCost    = taskLabour + taskMats + taskPlant + taskSubC + taskOtherV
    const taskSelling = isTaskPhase ? calcPhaseTaskSellingPrice(taskLabour, taskMats, taskPlant, taskSubC, taskOtherV, taskMarkup) : 0

    function applyPhaseTask(subId: string, taskId: string) {
      const sp = getAllSubphasesForPhase(item.phase).find(s => s.id === subId)
      const tk = sp?.tasks.find(t => t.id === taskId)
      if (!sp || !tk) return
      const q = item.qty > 0 ? item.qty : tk.defaultQty
      saveItemEdit({
        ...item, name: tk.name, spec: tk.notes ?? '', assemblyResult: undefined, assemblyCalcState: undefined,
        taskSubphaseId: subId, taskId, taskMarkupPct: sp.markupPct,
        subPhase: sp.name, unit: tk.unit, qty: q,
        taskLabour:        +(tk.labour        * q).toFixed(2),
        taskMaterials:     +(tk.materials     * q).toFixed(2),
        taskPlant:         +(tk.plant         * q).toFixed(2),
        taskSubcontractor: +(tk.subcontractor * q).toFixed(2),
        taskOther:         +(tk.other         * q).toFixed(2),
      })
    }

    // ── 9. Buildup data ────────────────────────────────────────────────────
    const bMakeups   = _phaseMakeups ?? FLOOR_MAKEUPS
    const bMakeup    = isBuildup ? bMakeups.find(m => m.id === item.floorMakeupId) : undefined
    // A wall priced by its calculator keeps its height there, not on the item: the area is the drawn length times that height
    const _calcHeightM = (() => { for (const ns of Object.values(item.assemblyCalcState?.values ?? {})) { const h = (ns as Record<string, unknown>)?.heightMm; if (typeof h === 'number' && h > 0) return h / 1000 } return 0 })()
    const buildArea  = (item.area ?? 0) > 0 ? (item.area ?? 0) : (isLineBased && _calcHeightM > 0 ? +((item.length ?? 0) * _calcHeightM).toFixed(3) : 0)
    const buildPerim = item.perimeter ??
      (linkedEl?.type === 'rect'    ? rectPerimeter(linkedEl.points, project.calibration.mpp)
        : linkedEl?.type === 'polygon' ? polyPerimeter(linkedEl.points, project.calibration.mpp)
        : 0)
    const layerToggles    = item.floorLayerToggles    ?? {}
    const layerThicknesses = item.floorLayerThicknesses ?? {}

    // ── 10. Accent colour ──────────────────────────────────────────────────
    const phaseAccents: Partial<Record<string, string>> = {
      'Site Setup':                  '#f59e0b',
      'Demolition':                  '#e74c3c',
      'Site Setup & Demolition':     '#e74c3c',  // legacy compat
      'External Walls':               '#16a085',
      'Internal Walls & Partitions':  '#5d8aa8',
      'Plastering & Boarding':        '#95a5a6',
      'Floors & Screeds':             '#f39c12',
      'Foundations':                  '#8e44ad',
      'Structural Frame':             '#2980b9',
      'Roof':                         '#d35400',
      'Windows & Doors':              '#27ae60',
      'Electrics':                    '#f1c40f',
      'Plumbing & Heating':           '#1abc9c',
      'Joinery & Fixtures':           '#6d4c41',
      'Tiling & Finishes':            '#ad1457',
      'Decoration':                   '#4a148c',
      'External Works & Landscaping': '#558b2f',
      'Preliminaries':                '#0277bd',
    }
    const accent = phaseAccents[item.phase] ?? '#7ab533'

    // ── 11. Delete helper ──────────────────────────────────────────────────
    function deleteItem() {
      if (item.elementId) {
        setProject(p => ({
          ...p,
          elements: p.elements.filter(el => el.id !== item.elementId),
          items:    p.items.filter(it => it.id !== item.id),
        }))
        setSelectedId(null)
      } else {
        setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) }))
      }
      setEditingItem(null)
      setEditingElement(null)
      setPanelMode('schedule')
    }

    // ── 12. Layer schedule helper (used by Ext Wall, Plaster, Floors, Found) ──
    function renderLayerSchedule(
      mk: FloorMakeup,
      area: number,
      perim: number,
      tgls: Record<string, boolean>,
      thks: Record<string, number>,
      itm: TakeoffItem,
      ac: string,
    ) {
      return (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--to-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span>Layers ({mk.layers.length})</span>
            {mk.labourHrsPerM2 > 0 && <span>~{fmt2(area * mk.labourHrsPerM2)} hrs labour</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 64px 8px', gap: 3, padding: '2px 4px', marginBottom: 1, fontSize: 9, color: 'var(--to-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <span /><span>Layer</span><span style={{ textAlign: 'right' }}>Qty</span><span />
          </div>
          {mk.layers.map(layer => {
            const enabled = tgls[layer.id] ?? layer.defaultEnabled
            const thk     = thks[layer.id] ?? layer.thickness
            const { qty: lq, unit: lu } = calcLayerQty(layer, area, perim, thk || undefined)
            return (
              <div key={layer.id} style={{
                display: 'grid', gridTemplateColumns: '16px 1fr 64px 8px',
                gap: 3, alignItems: 'center', padding: '4px 4px', marginBottom: 2, borderRadius: 4,
                background: enabled ? (darkMode ? '#0a180a' : '#f8faf8') : (darkMode ? '#060c06' : '#f5f5f5'),
                border: `1px solid ${enabled ? (darkMode ? '#1a2e1a' : '#cce8cc') : (darkMode ? '#111' : '#eee')}`,
                opacity: enabled ? 1 : 0.5,
              }}>
                <input type="checkbox" checked={enabled}
                  onChange={ev => saveItemEdit({ ...itm, floorLayerToggles: { ...tgls, [layer.id]: ev.target.checked } })}
                  style={{ margin: 0, cursor: 'pointer', accentColor: ac }}
                />
                <div>
                  <div style={{ fontSize: 11, color: enabled ? 'var(--to-text)' : 'var(--to-muted)', lineHeight: 1.2 }}>{layer.name}</div>
                  {layer.thickness > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 1 }}>
                      <NumInput type="number" value={thk} min={0}
                        onChange={ev => saveItemEdit({ ...itm, floorLayerThicknesses: { ...thks, [layer.id]: +ev.target.value } })}
                        style={{ width: 36, background: darkMode ? '#162216' : '#f0f8f0', border: '1px solid var(--to-input-bd)', borderRadius: 3, color: 'var(--to-sub)', fontSize: 10, padding: '1px 3px', textAlign: 'right', outline: 'none' }}
                      />
                      <span style={{ fontSize: 9, color: 'var(--to-muted)' }}>mm</span>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: enabled ? 'var(--to-textb)' : 'var(--to-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {enabled ? `${lq} ${lu}` : '—'}
                </div>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLOR[layer.category] ?? '#95a5a6', flexShrink: 0 }} title={layer.category} />
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
            {(['labour', 'materials', 'plant', 'other'] as const).map(cat => (
              <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--to-muted)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLOR[cat], display: 'inline-block' }} />
                {cat}
              </span>
            ))}
          </div>
        </div>
      )
    }

    // ── 12b. Compact layer list (sidebar) — click row to open full editor ─────
    function renderLayerList(
      mk: FloorMakeup,
      area: number,
      perim: number,
      tgls: Record<string, boolean>,
      thks: Record<string, number>,
      itm: TakeoffItem,
      ac: string,
    ) {
      const layerCosts = itm.layerCosts ?? {}
      const catColor: Record<string, string> = { labour: '#e74c3c', materials: '#3498db', plant: '#f39c12', other: '#95a5a6' }
      return (
        <div>
          {mk.layers.map(layer => {
            const enabled  = tgls[layer.id] ?? layer.defaultEnabled
            const thk      = thks[layer.id] ?? layer.thickness
            const { qty: lq, unit: lu } = calcLayerQty(layer, area, perim, thk || undefined)
            const rec      = layerCosts[layer.id]
            const costTotal = rec
              ? [...rec.labourItems, ...rec.materialItems, ...rec.plantItems, ...rec.subItems, ...rec.otherItems]
                  .reduce((s, x) => s + x.total, 0)
              : 0
            const color = catColor[layer.category] ?? '#95a5a6'
            return (
              <div key={layer.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: 8, marginBottom: 5, alignItems: 'center' }}>

                {/* Tick — outside the box, to the left */}
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={ev => saveItemEdit({ ...itm, floorLayerToggles: { ...tgls, [layer.id]: ev.target.checked } })}
                  style={{ margin: 0, cursor: 'pointer', width: 16, height: 16, accentColor: ac }}
                  title={enabled ? 'Disable layer' : 'Enable layer'}
                />

                {/* Named box — clicking opens the editor */}
                <div
                  onClick={() => setLayerModal({ layer, makeup: mk, item: itm, area, perim, accent: ac })}
                  style={{
                    cursor: 'pointer', borderRadius: 6, padding: '7px 10px', minWidth: 0,
                    background: enabled ? (darkMode ? '#0a180a' : '#f8faf8') : (darkMode ? '#060c06' : '#f3f3f3'),
                    border: `1px solid ${enabled ? color + '55' : (darkMode ? '#1a1a1a' : '#ddd')}`,
                    opacity: enabled ? 1 : 0.5,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: enabled ? 'var(--to-text)' : 'var(--to-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {layer.name}{thk > 0 ? ` (${thk}mm)` : ''}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--to-muted)', flexShrink: 0 }}>›</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, paddingLeft: 14 }}>
                    <span style={{ fontSize: 10, color: 'var(--to-muted)', fontFamily: 'monospace' }}>{lq} {lu}</span>
                    {costTotal > 0 && <span style={{ fontSize: 10, color: ac, fontFamily: 'monospace', fontWeight: 600 }}>£{Math.round(costTotal)}</span>}
                    <span style={{ fontSize: 10, color: 'var(--to-muted)', textTransform: 'capitalize', marginLeft: 'auto' }}>{layer.category}</span>
                  </div>
                </div>

              </div>
            )
          })}
        </div>
      )
    }

    // ── Shared section header style ────────────────────────────────────────
    const secHdr: React.CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 6,
      fontSize: 10, letterSpacing: 1, fontWeight: 700,
      color: 'var(--to-muted)', textTransform: 'uppercase',
      padding: '9px 14px 5px',
      borderTop: '1px solid var(--to-border)',
    }
    const secBody: React.CSSProperties = { padding: '2px 14px 10px' }

    // ── 13. JSX ────────────────────────────────────────────────────────────
    return (
      <div style={{ fontSize: 13, overflowY: 'auto', height: '100%' }}>

        {/* ── Top metrics card (foundation line) ── */}
        {isFoundationLine && (
          <div style={{ padding: '10px 14px 0' }}>
            <div style={{ background: darkMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '12px 14px', border: `1px solid ${accent}44` }}>
              <div style={{ fontSize: 10, color: accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                ⛏ Foundation
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: accent, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(foundLength)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m run</div>
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--to-textb)', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(foundArea)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m² footprint</div>
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: accent, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(foundVolume)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m³ volume</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Top metrics card (wall phases) ── */}
        {showWallLine && !hideForBuiltAssembly && (
          <div style={{ padding: '10px 14px 0' }}>
            <div style={{ background: darkMode ? `rgba(0,0,0,0.25)` : `rgba(0,0,0,0.04)`, borderRadius: 8, padding: '12px 14px', border: `1px solid ${accent}44` }}>
              <div style={{ fontSize: 10, color: accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {isExtWall ? '🧱 External Wall' : isIntWall ? '🏗 Internal Wall' : '🪣 Plastering'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isIntWall ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: accent, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(wallLength)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m run</div>
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--to-textb)', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(grossArea)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m² gross{openingsArea > 0 ? ` (−${fmt2(openingsArea)})` : ''}</div>
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: accent, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(netArea)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m² net</div>
                </div>
                {isIntWall && (
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 700, color: '#7986cb', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(finishArea)}</div>
                    <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m² finish ({finishSidesVal} side{finishSidesVal > 1 ? 's' : ''})</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Top metrics card (buildup phases) ── */}
        {isBuildup && (
          <div style={{ padding: '10px 14px 0' }}>
            <div style={{ background: darkMode ? `rgba(0,0,0,0.25)` : `rgba(0,0,0,0.04)`, borderRadius: 8, padding: '12px 14px', border: `1px solid ${accent}44` }}>
              <div style={{ fontSize: 10, color: accent, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                {item.phase}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: accent, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(buildArea)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>m² area</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--to-textb)', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(isLineBased ? (item.length ?? 0) : buildPerim)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>{isLineBased ? 'm run' : 'lm perimeter'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Top metrics card (demo / task phases) ── */}
        {(isDemo || isTaskPhase) && (
          <div style={{ padding: '10px 14px 0' }}>
            <div style={{ background: darkMode ? `rgba(0,0,0,0.25)` : `rgba(0,0,0,0.04)`, borderRadius: 8, padding: '10px 14px', border: `1px solid ${accent}44` }}>
              <div style={{ fontSize: 10, color: accent, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                {item.phase}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--to-text)', fontFamily: 'monospace' }}>
                    {item.qty} {item.unit}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)' }}>quantity</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: accent, fontFamily: 'monospace' }}>
                    £{(isDemo ? demoSelling : taskSelling).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)' }}>selling price</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ GENERAL ════════════════ */}
        <div style={secHdr}><span>📋</span><span>General</span></div>
        <div style={secBody}>

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Phase</label>
            <select style={inputStyle} value={item.phase}
              onChange={e => saveItemEdit({ ...item, phase: e.target.value as TakeoffPhase })}>
              {livePhaseNames.map(ph => <option key={ph} value={ph}>{ph}</option>)}
            </select>
          </div>

          {/* ── Type selector (phase-specific) — sits directly under Phase ── */}

          {/* External Walls: Build-up Type — picks between the layer build-up system (below)
              and, for whichever wall types have one, the real assembly calculator instead.
              This picker is keyed by floorMakeupId (a separate id space from bo_sub_phases —
              see WALL_MAKEUP_TO_SUBPHASE_CANONICAL), unlike Internal Walls' Sub-Phase picker. */}
          {isExtWall && (() => {
            const _allWT   = allWallMakeups
            const _wMakeup = _allWT.find(m => m.id === item.floorMakeupId)
            const _builtIn = new Set(WALL_MAKEUPS.map(m => m.id))

            // External-wall sub-phases that have a calculator but no Build-up Type of their own
            // (dwarf wall, sleeper wall, garden room timber wall, ...). The ones that do pair with
            // a Build-up Type (the cavity walls, ...) are already in the list above.
            const _pairedCanonicals = new Set(Object.values(WALL_MAKEUP_TO_SUBPHASE_CANONICAL))
            const _calcSubs = getAllSubphasesForPhase('External Walls').filter(sp => {
              const c = boSubPhases.find(b => b.id === sp.id)?.canonical_id
              return !!c && !!BUILT_ASSEMBLY_CANON_IDS[c] && !_pairedCanonicals.has(c)
            })
            const _calcSubSelected = _calcSubs.find(s => s.id === item.taskSubphaseId)

            // Changing the wall type starts the calculator afresh: a result saved from one calculator
            // must not carry over to another's price.
            function selectExtWallMakeup(makeupId: string) {
              const nm = _allWT.find(m => m.id === makeupId)
              saveItemEdit({
                ...item, floorMakeupId: makeupId, spec: nm?.clientDescription ?? item.spec,
                floorLayerToggles: {}, floorLayerThicknesses: {},
                // Back to a Build-up Type: drop any calculator that was picked by sub-phase.
                taskSubphaseId: undefined, subPhase: undefined,
                assemblyResult: undefined,
              })
            }
            function selectExtWallCalculator(subId: string) {
              const sub = _calcSubs.find(s => s.id === subId)
              saveItemEdit({
                ...item, taskSubphaseId: subId, subPhase: sub?.name,
                floorLayerToggles: {}, floorLayerThicknesses: {},
                assemblyResult: undefined,
              })
            }

            return (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Build-up Type</label>
                <select style={{ ...inputStyle, color: accent }}
                  value={_calcSubSelected ? `sub:${_calcSubSelected.id}` : (item.floorMakeupId ?? '')}
                  onChange={e => e.target.value.startsWith('sub:')
                    ? selectExtWallCalculator(e.target.value.slice(4))
                    : selectExtWallMakeup(e.target.value)}>
                  <optgroup label="── Built-in Wall Types">
                    {WALL_MAKEUPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                  {customWallTypes.length > 0 && (
                    <optgroup label="── Custom Wall Types">
                      {customWallTypes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  )}
                  {_calcSubs.length > 0 && (
                    <optgroup label="── Calculators">
                      {_calcSubs.map(sp => <option key={sp.id} value={`sub:${sp.id}`}>{sp.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {!builtAssembly && _wMakeup && (
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 3, fontStyle: 'italic' }}>
                    {_builtIn.has(item.floorMakeupId ?? '') ? 'Built-in' : '★ Custom'} · {_wMakeup.layers.length} layer{_wMakeup.layers.length !== 1 ? 's' : ''}
                    {_wMakeup.labourHrsPerM2 > 0 && ` · ~${fmt2(netArea * _wMakeup.labourHrsPerM2)} hrs labour`}
                  </div>
                )}
                {builtAssembly && (
                  <div style={{ marginTop: 10 }}>
                    {renderAssemblyPanel({})}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Internal Walls: Sub-Phase — picks between the recipe-based Wall Measurement
              Engine (below) and, for whichever wall types have one, the real assembly
              calculator instead. Live from Back Office, same as every other phase's
              sub-phase list, so a newly-built assembly shows up here automatically. */}
          {isIntWall && (() => {
            const selectedSub = intWallSelSub

            function selectIntWallSub(subId: string) {
              const sub = intWallSubs.find(s => s.id === subId)
              const bo = sub ? boSubPhases.find(sp => sp.id === sub.id) : undefined
              const built = bo?.canonical_id ? BUILT_ASSEMBLY_CANON_IDS[bo.canonical_id] : undefined
              // Clear whichever system's fields don't apply to the newly-picked sub-phase,
              // so switching back and forth never leaves stale mixed state behind.
              saveItemEdit({
                ...item, taskSubphaseId: subId, subPhase: sub?.name,
                ...(built
                  ? { wallConstructionType: undefined, wallFinishType: undefined, calculatedMaterials: undefined, materialsConfirmed: undefined }
                  : { assemblyResult: undefined }),
              })
            }

            return (
              <>
                {intWallSubs.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Sub-Phase</label>
                    <select style={{ ...inputStyle, color: accent }}
                      value={selectedSub?.id ?? ''}
                      onChange={e => selectIntWallSub(e.target.value)}>
                      {intWallSubs.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                    </select>
                  </div>
                )}

                {builtAssembly ? (
                  <div style={{ marginBottom: 10 }}>
                    {renderAssemblyPanel({ taskSubphaseId: selectedSub?.id, subPhase: selectedSub?.name })}
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Construction Type</label>
                      <select style={{ ...inputStyle, color: accent }}
                        value={item.wallConstructionType ?? 'stud_metal_70'}
                        onChange={e => recalcWallAndSave({ wallConstructionType: e.target.value as WallConstructionType })}>
                        {(Object.entries(WALL_CONSTRUCTION_LABELS) as [WallConstructionType, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Finish Type</label>
                      <select style={{ ...inputStyle, color: accent }}
                        value={item.wallFinishType ?? 'board_skim'}
                        onChange={e => recalcWallAndSave({ wallFinishType: e.target.value as WallFinishType })}>
                        {(Object.entries(WALL_FINISH_LABELS) as [WallFinishType, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </>
            )
          })()}

          {/* Plastering: Finish Type */}
          {isPlaster && (() => {
            // the sub-phases of this phase that have a calculator (Internal Plastering & Boarding by room): picking one makes this line a marker and the calculator prices it
            const _calcSubs = getAllSubphasesForPhase('Plastering & Boarding').filter(sp => { const c = boSubPhases.find(b => b.id === sp.id)?.canonical_id; return !!(c && BUILT_ASSEMBLY_CANON_IDS[c]) })
            if (_calcSubs.length === 0) return null
            return (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Priced by</label>
                <select style={{ ...inputStyle, color: accent }} value=""
                  onChange={e => {
                    const sp = _calcSubs.find(x => x.id === e.target.value)
                    if (sp) saveItemEdit({ ...item, taskSubphaseId: sp.id, subPhase: sp.name, taskId: undefined, floorMakeupId: undefined, assemblyResult: undefined, assemblyCalcState: undefined })
                  }}>
                  <option value="">Finish Type, by wall length and height (below)</option>
                  {_calcSubs.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                </select>
              </div>
            )
          })()}

          {isPlaster && (() => {
            const _pMakeup = PLASTER_MAKEUPS.find(m => m.id === item.floorMakeupId)
            return (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Finish Type</label>
                <select style={{ ...inputStyle, color: accent }} value={item.floorMakeupId ?? ''}
                  onChange={e => {
                    const nm = PLASTER_MAKEUPS.find(m => m.id === e.target.value)
                    saveItemEdit({ ...item, floorMakeupId: e.target.value, spec: nm?.clientDescription ?? item.spec, floorLayerToggles: {}, floorLayerThicknesses: {} })
                  }}>
                  {PLASTER_MAKEUPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                {_pMakeup && (
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 3, fontStyle: 'italic' }}>
                    {_pMakeup.layers.length} layer{_pMakeup.layers.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Foundations (line): Foundation Type */}
          {isFoundationLine && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Foundation Type</label>
              <select style={{ ...inputStyle, color: accent }}
                value={item.foundationType ?? 'trench_fill'}
                onChange={e => recalcFoundationAndSave({ foundationType: e.target.value, assemblyResult: undefined })}>
                {FOUNDATION_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {builtAssembly && (() => {
                // the calculator's own sub-phase, so the quote links to it
                const calcSub = boSubPhases.find(sp => sp.canonical_id === WALL_MAKEUP_TO_SUBPHASE_CANONICAL[FOUNDATION_MAKEUP_BY_TYPE[item.foundationType ?? 'trench_fill'] ?? ''])
                return <div style={{ marginTop: 10 }}>{renderAssemblyPanel({ taskSubphaseId: calcSub?.id, subPhase: calcSub?.name })}</div>
              })()}
            </div>
          )}

          {/* Buildup (Floors, Turfing, etc.): Build-Up Type */}
          {isBuildup && !isExtWall && !isPlaster && !isFoundationLine && (() => {
            const _bm = _phaseMakeups ?? FLOOR_MAKEUPS
            const _bMakeup = _bm.find(m => m.id === item.floorMakeupId)

            // Roofs: calculator sub-phases that have no Build-Up Type of their own get a "Calculators"
            // group here, exactly as for external walls (the flat roof pairs with the two build-up
            // types, so it isn't listed separately). Nothing to list until a second roof calculator exists.
            const _pairedCanonicals = new Set(Object.values(WALL_MAKEUP_TO_SUBPHASE_CANONICAL))
            const _calcSubs = isRoof ? getAllSubphasesForPhase('Roof').filter(sp => {
              const c = boSubPhases.find(b => b.id === sp.id)?.canonical_id
              return !!c && !!BUILT_ASSEMBLY_CANON_IDS[c] && !_pairedCanonicals.has(c)
            }) : []
            const _calcSubSelected = _calcSubs.find(s => s.id === item.taskSubphaseId)

            return (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Build-Up Type</label>
                <select style={{ ...inputStyle, color: accent }}
                  value={_calcSubSelected ? `sub:${_calcSubSelected.id}` : (item.floorMakeupId ?? '')}
                  onChange={e => {
                    const v = e.target.value
                    if (v.startsWith('sub:')) {
                      const sub = _calcSubs.find(s => s.id === v.slice(4))
                      saveItemEdit({
                        ...item, taskSubphaseId: v.slice(4), subPhase: sub?.name,
                        floorLayerToggles: {}, floorLayerThicknesses: {}, assemblyResult: undefined,
                      })
                      return
                    }
                    const nm = _bm.find(m => m.id === v)
                    saveItemEdit({
                      ...item, floorMakeupId: v, spec: nm?.clientDescription ?? item.spec, floorLayerToggles: {}, floorLayerThicknesses: {},
                      // Back to a Build-Up Type: drop any calculator picked by sub-phase, and a saved
                      // result from the calculator that was there (roofs only — as for external walls).
                      ...((isRoof || isFoundationShape || isFloorShape) && { taskSubphaseId: undefined, subPhase: undefined, assemblyResult: undefined }),
                    })
                  }}>
                  {_bm.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  {_calcSubs.length > 0 && (
                    <optgroup label="── Calculators">
                      {_calcSubs.map(sp => <option key={sp.id} value={`sub:${sp.id}`}>{sp.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {(isRoof || isFoundationShape || isFloorShape) && builtAssembly && (
                  <div style={{ marginTop: 10 }}>
                    {renderAssemblyPanel((isFoundationShape || isFloorShape) ? (() => {
                      const canon = (boSubPhases.find(sp => sp.id === item.taskSubphaseId)?.canonical_id) ?? WALL_MAKEUP_TO_SUBPHASE_CANONICAL[item.floorMakeupId ?? '']
                      const sub = boSubPhases.find(sp => sp.canonical_id === canon)
                      return { taskSubphaseId: sub?.id, subPhase: sub?.name }
                    })() : {})}
                  </div>
                )}
                {!builtAssembly && _bMakeup && (
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 3, fontStyle: 'italic' }}>
                    {_bMakeup.layers.length} layer{_bMakeup.layers.length !== 1 ? 's' : ''}
                    {_bMakeup.labourHrsPerM2 > 0 && ` · ~${fmt2(buildArea * _bMakeup.labourHrsPerM2)} hrs labour`}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Demo: Construction Type + Task */}
          {isDemo && demoSub && demoTask && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Construction Type</label>
                <select style={{ ...inputStyle, color: accent }} value={demoSub.id}
                  onChange={e => {
                    const ns = allDemoSubs.find(s => s.id === e.target.value) ?? allDemoSubs[0]
                    if (ns.calculatorId) applyDemoCalc(ns)
                    else applyDemoTask(ns, ns.tasks[0])
                  }}>
                  {allDemoSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Task</label>
                <select style={{ ...inputStyle, color: accent }} value={demoTask.id}
                  onChange={e => {
                    const t = demoSub.tasks.find(t => t.id === e.target.value) ?? demoSub.tasks[0]
                    applyDemoTask(demoSub, t)
                  }}>
                  {demoSub.tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Demolition priced by its calculator (Wall Removal / Knock-Through): the Construction Type picker and the calculator card. The length of the drawn line is the length of wall taken out. */}
          {isDemoCalc && builtAssembly && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Construction Type</label>
                <select style={{ ...inputStyle, color: accent }} value={item.demoSubphaseId ?? ''}
                  onChange={e => {
                    const ns = allDemoSubs.find(s => s.id === e.target.value) ?? allDemoSubs[0]
                    if (ns.calculatorId) applyDemoCalc(ns)
                    else applyDemoTask(ns, ns.tasks[0])
                  }}>
                  {allDemoSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 8 }}>
                {_demoMarker
                  ? 'Priced with its own calculator. The line drawn here is only a marker on the plan: the rooms, waste, buildings and sizes are typed in the calculator.'
                  : 'Priced with its own calculator. The length of the line drawn here is the length of wall taken out: set its height, thickness and what it is made of in the calculator.'}
              </div>
              {renderAssemblyPanel({})}
            </>
          )}

          {/* Decoration priced by its calculator (Internal decoration): the Sub-Phase picker and the calculator card. The drawn area is only a marker. */}
          {isDecoCalc && builtAssembly && (() => {
            // a plaster line shows only the calculator sub-phases here (its other sub-phases are tasks, and a plaster line is not a task line), with a way back to Finish Type
            const _plasterLine = item.phase === 'Plastering & Boarding'
            const decoSubs = getAllSubphasesForPhase(item.phase).filter(sp => { if (!_plasterLine) return true; const c = boSubPhases.find(b => b.id === sp.id)?.canonical_id; return !!(c && BUILT_ASSEMBLY_CANON_IDS[c]) })
            return (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>{_plasterLine ? 'Priced by' : 'Sub-Phase'}</label>
                  <select style={{ ...inputStyle, color: accent }} value={item.taskSubphaseId ?? ''}
                    onChange={e => {
                      if (_plasterLine && e.target.value === '') { saveItemEdit({ ...item, taskSubphaseId: undefined, subPhase: undefined, assemblyResult: undefined, assemblyCalcState: undefined }); return }
                      const sp = decoSubs.find(x => x.id === e.target.value)
                      if (!sp) return
                      const canon = boSubPhases.find(b => b.id === sp.id)?.canonical_id
                      if (canon && BUILT_ASSEMBLY_CANON_IDS[canon]) {
                        saveItemEdit({ ...item, taskSubphaseId: sp.id, subPhase: sp.name, taskId: undefined, assemblyResult: undefined, assemblyCalcState: undefined })
                      } else if (sp.tasks[0]) applyPhaseTask(sp.id, sp.tasks[0].id)
                    }}>
                    {_plasterLine && <option value="">Finish Type, by wall length and height</option>}
                    {decoSubs.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 11, color: 'var(--to-muted)', marginBottom: 8 }}>
                  {_tileCalc
                    ? 'Priced room by room with its own calculator. The area drawn here sizes the first room (a line drawn gives the first wall area its length for wall tiling): add the other rooms and the finishes in the calculator.'
                    : _lengthFedCalc
                    ? "Priced wall by wall with its own calculator. The length of the line drawn here is the first wall's length: add the height, openings and the finish in the calculator."
                    : `Priced room by room with its own calculator. The ${_plasterLine ? 'line' : 'area'} drawn here is only a marker on the plan: add the rooms in the calculator.`}
                </div>
                {renderAssemblyPanel({})}
              </>
            )
          })()}

          {/* Task phases: Sub-phase + Task */}
          {isTaskPhase && taskSelSub && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Sub-Phase</label>
                <select style={{ ...inputStyle, color: accent }}
                  value={item.taskSubphaseId ?? (taskSubs[0]?.id ?? '')}
                  onChange={e => {
                    const sp = getAllSubphasesForPhase(item.phase).find(s => s.id === e.target.value)
                    const canon = sp ? boSubPhases.find(b => b.id === sp.id)?.canonical_id : undefined
                    if (sp && MARKER_CALC_PHASES.has(item.phase) && canon && BUILT_ASSEMBLY_CANON_IDS[canon]) {
                      // to a sub-phase with a calculator: drop the flat task, the calculator prices it
                      saveItemEdit({ ...item, taskSubphaseId: sp.id, subPhase: sp.name, taskId: undefined, taskLabour: undefined, taskMaterials: undefined, taskPlant: undefined, taskSubcontractor: undefined, taskOther: undefined, assemblyResult: undefined, assemblyCalcState: undefined })
                    } else if (sp?.tasks[0]) applyPhaseTask(sp.id, sp.tasks[0].id)
                  }}>
                  {taskSubs.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Task</label>
                <select style={{ ...inputStyle, color: accent }}
                  value={item.taskId ?? (taskList[0]?.id ?? '')}
                  onChange={e => applyPhaseTask(item.taskSubphaseId ?? taskSubs[0]?.id ?? '', e.target.value)}>
                  {taskList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </>
          )}

          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Room Name</label>
            <input style={inputStyle} placeholder="e.g. Kitchen" value={item.roomName ?? ''}
              onChange={e => saveItemEdit({ ...item, roomName: e.target.value })} />
          </div>

          {linkedEl && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Drawing Label</label>
              <input style={inputStyle} value={linkedEl.label}
                onChange={e => saveElementEdit({ ...linkedEl, label: e.target.value })} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Item Name</label>
              <input style={inputStyle} value={item.name}
                onChange={e => saveItemEdit({ ...item, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Drawing Ref</label>
              <input style={inputStyle} value={item.drawingRef ?? ''}
                onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea style={{ ...inputStyle, height: 46, resize: 'none' }}
              value={item.notes ?? ''}
              onChange={e => saveItemEdit({ ...item, notes: e.target.value })}
            />
          </div>
        </div>

        {/* ════════════════ MEASUREMENT ════════════════ */}
        {!hideForBuiltAssembly && (
        <>
        <div style={secHdr}><span>📐</span><span>Measurement</span></div>
        <div style={secBody}>

          {/* Wall line: height + band + sides */}
          {showWallLine && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Wall / Storey Height (m)</label>
                <NumInput type="number" step={0.05} min={0.1} max={12}
                  style={{ ...inputStyle, color: accent }}
                  value={wallHeight}
                  onChange={e => recalcWallAndSave({ wallHeight: Math.max(0.1, +e.target.value || wallHeight) })}
                />
              </div>

              {(() => {
                const _wsI = wallSpecForItem(item)
                const _wsEl = project.elements.find(e => e.id === item.elementId)
                if (!_wsI) return null
                return (
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Drawn on the plan as</label>
                    <div style={{ fontSize: 12, color: 'var(--to-text)', lineHeight: 1.5 }}>
                      <strong>{_wsI.spec.label}</strong>, to scale<br />
                      <span style={{ color: 'var(--to-muted)', fontSize: 11 }}>{_wsI.spec.layers.map(l => `${l.kind} ${l.mm}`).join(' + ')} mm. {_wsI.ref === 'outer' ? 'The line you drew is the outside face; the wall builds to the inside.' : 'The line you drew is the middle of the wall.'} Taken from {item.assemblyCalcState ? 'the saved calculator' : 'the wall type'}.</span>
                    </div>
                    {isExtWall && _wsEl?.type === 'line' && (
                      <button style={{ ...btnStyle, marginTop: 6, fontSize: 11, padding: '4px 8px' }} onClick={() => saveItemEdit({ ...item, wallFlip: !item.wallFlip })} title="Build the wall to the other side of the line you drew">⇄ Flip to the other side</button>
                    )}
                  </div>
                )
              })()}

              {isExtWall && !wallSpecForItem(item) && (
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Canvas Line Width (wall thickness on plan)</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min={4} max={30} step={1}
                      style={{ flex: 1, accentColor: accent }}
                      value={item.wallBandPx ?? 9}
                      onChange={e => saveItemEdit({ ...item, wallBandPx: Number(e.target.value) })}
                    />
                    <span style={{ fontSize: 13, color: accent, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>
                      {(item.wallBandPx ?? 9) * 2}px
                    </span>
                  </div>
                </div>
              )}

              {isIntWall && (
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Finish Sides</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([1, 2] as const).map(s => (
                      <button key={s}
                        style={{ ...btnStyle, flex: 1, justifyContent: 'center',
                          background: finishSidesVal === s ? '#5d8aa8' : 'var(--to-hover)',
                          color: finishSidesVal === s ? '#fff' : 'var(--to-text)',
                          borderColor: finishSidesVal === s ? '#5d8aa8' : 'var(--to-btn-bd)',
                        }}
                        onClick={() => recalcWallAndSave({ finishSides: s })}>
                        {s === 1 ? '1 face' : '2 faces'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isPlaster && (
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Finish Sides</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([1, 2] as const).map(s => (
                      <button key={s}
                        style={{ ...btnStyle, flex: 1, justifyContent: 'center',
                          background: plasterSides === s ? accent : 'var(--to-hover)',
                          color: plasterSides === s ? '#fff' : 'var(--to-text)',
                          borderColor: plasterSides === s ? accent : 'var(--to-btn-bd)',
                        }}
                        onClick={() => recalcWallAndSave({ plasterFinishSides: s, finishSides: s as 1 | 2 })}>
                        {s === 1 ? '1 face' : '2 faces'}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Gross/net area read-only — hidden for Ext Wall (top card already shows them) */}
              {!isExtWall && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Gross Area (m²)</label>
                    <div style={{ ...inputStyle, color: 'var(--to-muted)', fontFamily: 'monospace' }}>{fmt2(grossArea)}</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Net Area (m²)</label>
                    <div style={{ ...inputStyle, color: accent, fontWeight: 700, fontFamily: 'monospace' }}>{fmt2(netArea)}</div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Foundation line: length (canvas) + editable width/depth */}
          {isFoundationLine && (
            <>
              {/* Length — from canvas, read-only */}
              <div style={{ background: darkMode ? '#0d1a0d' : '#f0f4f0', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 12, border: '1px solid var(--to-border)' }}>
                <div style={{ fontSize: 10, color: 'var(--to-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>From Canvas</div>
                <div style={dimRow}><span>Length</span><span style={{ fontWeight: 700, color: accent }}>{fmtM(foundLength)}</span></div>
              </div>
              {/* Width + Depth — editable, drive the calculations */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={labelStyle}>Width (mm)</label>
                  <NumInput type="number" step={50} min={100} max={5000}
                    style={{ ...inputStyle, color: accent, fontWeight: 600 }}
                    value={foundWidthMM}
                    onChange={e => recalcFoundationAndSave({ foundationWidth: Math.max(50, +e.target.value || 600) })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Depth (mm)</label>
                  <NumInput type="number" step={50} min={100} max={5000}
                    style={{ ...inputStyle, color: accent, fontWeight: 600 }}
                    value={foundDepthMM}
                    onChange={e => recalcFoundationAndSave({ foundationDepth: Math.max(50, +e.target.value || 1000) })}
                  />
                </div>
              </div>
              {/* Calculated results */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Footprint area</label>
                  <div style={{ ...inputStyle, fontFamily: 'monospace', color: 'var(--to-textb)', fontWeight: 700 }}>{fmt2(foundArea)} m²</div>
                </div>
                <div>
                  <label style={labelStyle}>Excavation volume</label>
                  <div style={{ ...inputStyle, fontFamily: 'monospace', color: accent, fontWeight: 700 }}>{fmt2(foundVolume)} m³</div>
                </div>
              </div>
            </>
          )}

          {/* Non-wall: canvas measurements + qty/unit */}
          {!showWallLine && !isBuildup && !isFoundationLine && (
            <>
              {(item.length != null || item.area != null || item.volume != null) && (
                <div style={{ background: darkMode ? '#0d1a0d' : '#f0f4f0', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 12, border: '1px solid var(--to-border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>From Canvas</div>
                  {item.length != null && <div style={dimRow}><span>Length</span><span>{fmtM(item.length)}</span></div>}
                  {item.width  != null && <div style={dimRow}><span>Width</span><span>{fmtM(item.width)}</span></div>}
                  {item.height != null && <div style={dimRow}><span>Height</span><span>{fmtM(item.height)}</span></div>}
                  {item.area   != null && <div style={dimRow}><span>Area</span><span>{fmt2(item.area)} m²</span></div>}
                  {item.volume != null && <div style={dimRow}><span>Volume</span><span>{fmt2(item.volume)} m³</span></div>}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                <div>
                  <label style={labelStyle}>Qty</label>
                  <NumInput type="number" step="any" min={0} style={inputStyle} value={item.qty}
                    onChange={e => {
                      const q = +e.target.value
                      if (isTaskPhase && taskSelTask) {
                        saveItemEdit({ ...item, qty: q,
                          taskLabour:        +(taskSelTask.labour        * q).toFixed(2),
                          taskMaterials:     +(taskSelTask.materials     * q).toFixed(2),
                          taskPlant:         +(taskSelTask.plant         * q).toFixed(2),
                          taskSubcontractor: +(taskSelTask.subcontractor * q).toFixed(2),
                          taskOther:         +(taskSelTask.other         * q).toFixed(2),
                        })
                      } else if (isDemo && demoTask) {
                        saveItemEdit({ ...item, qty: q,
                          demoLabour:        +(demoTask.labourCost        * q).toFixed(2),
                          demoMaterials:     +(demoTask.materialCost      * q).toFixed(2),
                          demoPlant:         +(demoTask.plantCost         * q).toFixed(2),
                          demoWaste:         +(demoTask.wasteCost         * q).toFixed(2),
                          demoSubcontractor: +(demoTask.subcontractorCost * q).toFixed(2),
                          demoOther:         +(demoTask.otherCost         * q).toFixed(2),
                        })
                      } else {
                        saveItemEdit({ ...item, qty: q })
                      }
                    }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Unit</label>
                  <select style={inputStyle} value={item.unit}
                    onChange={e => saveItemEdit({ ...item, unit: e.target.value })}>
                    {['m', 'm²', 'm³', 'nr', 'item', 'bag', 'tonne', 'kg', 'litre', 'hr', 'day'].map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {/* Buildup: area is read-only from canvas (hidden for Ext Wall — top card covers it) */}
          {isBuildup && !isExtWall && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={labelStyle}>Area (m²)</label>
                <div style={{ ...inputStyle, color: accent, fontFamily: 'monospace', fontWeight: 700 }}>{fmt2(buildArea)}</div>
              </div>
              <div>
                <label style={labelStyle}>Perimeter (lm)</label>
                <div style={{ ...inputStyle, color: 'var(--to-textb)', fontFamily: 'monospace' }}>{fmt2(buildPerim)}</div>
              </div>
            </div>
          )}
        </div>
        </>
        )}

        {/* ════════════════ CONSTRUCTION ════════════════ */}
        {!hideForBuiltAssembly && (
        <>
        <div style={secHdr}><span>🔧</span><span>Construction</span></div>
        <div style={secBody}>

          {/* Demo: warnings only (selectors moved to General) */}
          {isDemo && demoSub && demoTask && (
            <>
              {[...(demoSub.warnings ?? []), ...(demoTask.warnings ?? [])].map((w, i) => (
                <div key={i} style={{ fontSize: 11, padding: '6px 10px', borderRadius: 5, marginBottom: 8, background: darkMode ? '#1a1200' : '#fffbeb', border: '1px solid #f59e0b', color: darkMode ? '#fcd34d' : '#92400e' }}>
                  ⚠️ {w}
                </div>
              ))}
            </>
          )}

          {/* Ext Wall: compact layer list — click any row to open Construction Layer Editor */}
          {isExtWall && (() => {
            const _wMakeup = allWallMakeups.find(m => m.id === item.floorMakeupId)
            return _wMakeup ? (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Construction Layers</label>
                {renderLayerList(_wMakeup, netArea, wallPerimeter, layerToggles, layerThicknesses, item, accent)}
              </div>
            ) : null
          })()}

          {/* Int Wall: selectors moved to General — nothing extra needed here */}

          {/* Plaster: layer list only (Finish Type moved to General) */}
          {isPlaster && (() => {
            const _pMakeup = PLASTER_MAKEUPS.find(m => m.id === item.floorMakeupId)
            return _pMakeup ? (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Construction Layers</label>
                {renderLayerList(_pMakeup, isLineBased ? netArea : buildArea, wallPerimeter, layerToggles, layerThicknesses, item, accent)}
              </div>
            ) : null
          })()}

          {/* Foundation line: layer list only (Foundation Type moved to General) */}
          {isFoundationLine && (
            <>
              <div style={{ fontSize: 10, color: 'var(--to-muted)', marginBottom: 10 }}>
                {fmt2(foundLength)} m × {foundWidthMM}mm × {foundDepthMM}mm deep
              </div>
              {foundMakeup ? (
                <div style={{ marginBottom: 4 }}>
                  <label style={labelStyle}>Construction Layers</label>
                  {renderLayerList(foundMakeup, foundArea, foundLength, layerToggles, layerThicknesses, item, accent)}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--to-muted)', fontStyle: 'italic' }}>
                  No layer schedule for "Other" — add costs manually in the Outputs section.
                </div>
              )}
            </>
          )}

          {/* Buildup (Floors, Turfing, etc.): layer list only (Build-Up Type moved to General) */}
          {isBuildup && !isExtWall && !isPlaster && !isFoundationLine && bMakeup && (
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Construction Layers</label>
              {renderLayerList(bMakeup, buildArea, buildPerim, layerToggles, layerThicknesses, item, accent)}
            </div>
          )}

          {/* Task phases: warning only (selectors moved to General) */}
          {isTaskPhase && taskSelSub?.ukWarning && (
            <div style={{ fontSize: 11, padding: '7px 10px', borderRadius: 5, marginBottom: 10, background: darkMode ? '#2a1a00' : '#fffbe6', border: '1px solid #f59e0b', color: darkMode ? '#fcd34d' : '#92400e', lineHeight: 1.5 }}>
              ⚠️ {taskSelSub.ukWarning}
            </div>
          )}

          {/* Client Description (all phases) */}
          <div style={{ marginBottom: 8 }}>
            <label style={labelStyle}>Client Description</label>
            <textarea style={{ ...inputStyle, height: 60, resize: 'none', fontSize: 11, lineHeight: 1.5 }}
              value={item.spec ?? ''}
              onChange={e => saveItemEdit({ ...item, spec: e.target.value })}
            />
          </div>

          <div>
            <label style={labelStyle}>Building Regs Notes</label>
            <textarea style={{ ...inputStyle, height: 38, resize: 'none' }}
              value={item.buildingRegsNotes ?? ''}
              onChange={e => saveItemEdit({ ...item, buildingRegsNotes: e.target.value })}
            />
          </div>
        </div>
        </>
        )}

        {/* ════════════════ OPENINGS ════════════════ */}
        {hasOpenings && !hideForBuiltAssembly && (
          <>
            <div style={secHdr}><span>🚪</span><span>Openings</span></div>
            <div style={secBody}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {(Object.keys(WALL_OPENING_LABELS) as WallOpeningType[]).map(type => (
                  <button key={type} style={{ ...btnStyle, fontSize: 11, padding: '4px 8px' }}
                    onClick={() => addOpening(type)}>
                    + {WALL_OPENING_LABELS[type]}
                  </button>
                ))}
              </div>
              {(item.drawnOpenings ?? []).length > 0 && (
                <div style={{ marginBottom: 8, padding: '5px 7px', borderRadius: 4, border: '1px dashed var(--to-border)', fontSize: 11, color: 'var(--to-text)' }}>
                  <div style={{ fontSize: 9, color: 'var(--to-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>Drawn on this wall (taken off automatically)</div>
                  {(item.drawnOpenings ?? []).map(op => <div key={op.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{op.label} · {WALL_OPENING_LABELS[op.type]}</span><span style={{ fontFamily: 'monospace' }}>{op.width.toFixed(2)} × {op.height.toFixed(2)} m</span></div>)}
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 3 }}>Move or delete them with the Place Window / Door tool in the Windows & Doors phase.</div>
                </div>
              )}
              {openings.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--to-muted)', fontStyle: 'italic' }}>{(item.drawnOpenings ?? []).length > 0 ? 'No openings typed here' : 'No openings — net area = gross area'}</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 12px 52px 28px', gap: 3, padding: '2px 0', marginBottom: 3, fontSize: 9, color: 'var(--to-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <span>Label</span><span style={{ textAlign: 'center' }}>W (m)</span><span /><span style={{ textAlign: 'center' }}>H (m)</span><span />
                  </div>
                  {openings.map(op => (
                    <div key={op.id} style={{
                      display: 'grid', gridTemplateColumns: '1fr 52px 12px 52px 28px',
                      gap: 3, alignItems: 'center', marginBottom: 4,
                      padding: '5px 6px', borderRadius: 4,
                      background: darkMode ? '#0d1a0d' : '#f8fafc',
                      border: '1px solid var(--to-border)',
                    }}>
                      <div style={{ fontSize: 11, color: 'var(--to-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.label}</div>
                      <NumInput type="number" step={0.05} min={0.1}
                        style={{ ...inputStyle, textAlign: 'center', padding: '3px 4px', fontSize: 11 }}
                        value={op.width}
                        onChange={e => updateOpening(op.id, { width: Math.max(0.1, +e.target.value || op.width) })}
                      />
                      <span style={{ fontSize: 10, color: 'var(--to-muted)', textAlign: 'center' }}>×</span>
                      <NumInput type="number" step={0.05} min={0.1}
                        style={{ ...inputStyle, textAlign: 'center', padding: '3px 4px', fontSize: 11 }}
                        value={op.height}
                        onChange={e => updateOpening(op.id, { height: Math.max(0.1, +e.target.value || op.height) })}
                      />
                      <button style={{ ...btnStyle, padding: '3px 6px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c', justifyContent: 'center' }}
                        onClick={() => removeOpening(op.id)}>×</button>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: 'var(--to-muted)', textAlign: 'right', marginTop: 4 }}>
                    Deductions: <strong style={{ color: '#e74c3c' }}>{fmt2(openingsArea)} m²</strong>{(item.drawnOpenings ?? []).length > 0 ? ' (including the drawn ones)' : ''}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ════════════════ OUTPUTS ════════════════ */}
        {!hideForBuiltAssembly && (
        <>
        <div style={secHdr}><span>📊</span><span>Outputs</span></div>
        <div style={secBody}>

          {/* Int Wall: materials table + totals + confirm */}
          {isIntWall && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                {([
                  { label: 'Labour',    val: matTotals.labour,    color: CAT_COLOR.labour    },
                  { label: 'Materials', val: matTotals.materials, color: CAT_COLOR.materials },
                  { label: 'Plant',     val: matTotals.plant,     color: CAT_COLOR.plant     },
                ] as { label: string; val: number; color: string }[]).map(({ label, val, color }) => (
                  <div key={label} style={{ textAlign: 'center', background: darkMode ? '#0d1a0d' : '#f8fafc', borderRadius: 6, padding: '6px 4px', border: `1px solid ${color}44` }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color, fontFamily: 'monospace' }}>£{val.toFixed(0)}</div>
                    <div style={{ fontSize: 9, color: 'var(--to-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '8px 1fr 52px 6px 46px 54px', gap: 3, padding: '2px 0', marginBottom: 2, fontSize: 9, color: 'var(--to-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  <span /><span>Material</span><span style={{ textAlign: 'right' }}>Qty</span><span /><span style={{ textAlign: 'right' }}>Rate</span><span style={{ textAlign: 'right' }}>Total</span>
                </div>
                {mats.map(mat => (
                  <div key={mat.id} style={{
                    display: 'grid', gridTemplateColumns: '8px 1fr 52px 6px 46px 54px',
                    gap: 3, alignItems: 'center', padding: '4px 4px', marginBottom: 2, borderRadius: 3,
                    background: mat.enabled ? (darkMode ? '#0a1a0a' : '#f8fafc') : (darkMode ? '#060c06' : '#f5f5f5'),
                    border: `1px solid ${mat.enabled ? (CAT_COLOR[mat.category] ?? '#95a5a6') + '33' : 'var(--to-border)'}`,
                    opacity: mat.enabled ? 1 : 0.5,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLOR[mat.category] ?? '#95a5a6', cursor: 'pointer' }}
                      onClick={() => toggleMaterial(mat.id, !mat.enabled)} />
                    <div style={{ fontSize: 10, color: mat.isOverridden ? '#f39c12' : 'var(--to-text)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mat.name}>{mat.name}</div>
                    <NumInput type="number" step="any" min={0}
                      style={{ ...inputStyle, fontSize: 10, padding: '2px 4px', textAlign: 'right' }}
                      value={+mat.qty.toFixed(3)}
                      onChange={e => updateMaterial(mat.id, { qty: +e.target.value })}
                    />
                    <span style={{ fontSize: 9, color: 'var(--to-muted)', textAlign: 'center' }}>{mat.unit}</span>
                    <NumInput type="number" step="any" min={0}
                      style={{ ...inputStyle, fontSize: 10, padding: '2px 4px', textAlign: 'right' }}
                      value={+mat.unitRate.toFixed(2)}
                      onChange={e => updateMaterial(mat.id, { unitRate: +e.target.value })}
                    />
                    <div style={{ fontSize: 10, color: 'var(--to-textb)', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>£{mat.totalCost.toFixed(0)}</div>
                  </div>
                ))}
              </div>

              <button
                style={{
                  ...btnStyle, width: '100%', justifyContent: 'center',
                  background: item.materialsConfirmed ? (darkMode ? '#1a4a1a' : '#e8f5e8') : (darkMode ? '#2b3a2b' : 'rgba(122,181,51,0.1)'),
                  borderColor: item.materialsConfirmed ? '#4a8a4a' : 'var(--to-active-bd)',
                  color: item.materialsConfirmed ? '#6aca6a' : 'var(--to-text)',
                }}
                onClick={() => saveItemEdit({ ...item, materialsConfirmed: !item.materialsConfirmed })}>
                {item.materialsConfirmed ? '✅ Confirmed — Ready for Quote' : '✓ Confirm & Send to Quote'}
              </button>
            </>
          )}

          {/* Demo: cost breakdown */}
          {isDemo && demoSub && demoTask && (
            <>
              {([
                { label: '📦 Materials',     key: 'demoMaterials'     as const, val: demoMats    },
                { label: '🚜 Plant',         key: 'demoPlant'         as const, val: demoPlant   },
                { label: '🗑 Waste / Skips', key: 'demoWaste'         as const, val: demoWaste   },
                { label: '👷 Subcontractor', key: 'demoSubcontractor' as const, val: demoSubC    },
                { label: '📋 Other',         key: 'demoOther'         as const, val: demoOtherV  },
              ] as { label: string; key: keyof TakeoffItem; val: number }[]).map(({ label, key, val }) => (
                <div key={key as string} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--to-sub)' }}>{label}</span>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--to-muted)' }}>£</span>
                    <NumInput type="number" min={0} step={1} style={{ ...inputStyle, paddingLeft: 18 }}
                      value={val}
                      onChange={e => saveItemEdit({ ...item, [key]: Math.max(0, +e.target.value || 0) })}
                    />
                  </div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, marginBottom: 4 }}>
                <div>
                  <label style={labelStyle}>Markup %</label>
                  <NumInput type="number" min={0} max={200} step={1} style={inputStyle}
                    value={demoMarkup}
                    onChange={e => saveItemEdit({ ...item, demoMarkupPct: Math.max(0, +e.target.value || 0) })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Selling Price</label>
                  <div style={{ ...inputStyle, color: accent, fontWeight: 700, fontFamily: 'monospace' }}>
                    £{demoSelling.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--to-muted)' }}>
                Base: £{demoBase.toFixed(2)} + {demoMarkup}% markup = £{demoSelling.toFixed(2)}
              </div>
            </>
          )}

          {/* Task phases: cost breakdown */}
          {isTaskPhase && (
            <>
              {([
                { key: 'taskMaterials'     as const, label: '📦 Materials',      color: CAT_COLOR.materials      },
                { key: 'taskPlant'         as const, label: '🚜 Plant',          color: CAT_COLOR.plant          },
                { key: 'taskSubcontractor' as const, label: '👷 Subcontractor',  color: CAT_COLOR.subcontractors },
                { key: 'taskOther'         as const, label: '📋 Other',          color: CAT_COLOR.other          },
              ] as { key: keyof TakeoffItem; label: string; color: string }[]).map(({ key, label, color }) => (
                <div key={key as string} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</span>
                  <NumInput type="number" step="any" min={0} style={inputStyle}
                    value={(item[key] as number | undefined) ?? 0}
                    onChange={e => saveItemEdit({ ...item, [key]: +e.target.value })}
                  />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, borderTop: '1px solid var(--to-border)', paddingTop: 8 }}>
                <div>
                  <label style={labelStyle}>Markup %</label>
                  <NumInput type="number" min={0} max={200} style={inputStyle}
                    value={taskMarkup}
                    onChange={e => saveItemEdit({ ...item, taskMarkupPct: +e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Selling Price</label>
                  <div style={{ ...inputStyle, color: accent, fontWeight: 700, fontFamily: 'monospace' }}>
                    £{taskSelling.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 4 }}>
                Cost: £{taskCost.toFixed(2)} + {taskMarkup}% = £{taskSelling.toFixed(2)}
              </div>
            </>
          )}

          {/* Foundation line outputs */}
          {isFoundationLine && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 6 }}>
              {([
                { label: 'Length (lm)',   val: foundLength,  unit: 'm',  color: accent             },
                { label: 'Footprint',     val: foundArea,    unit: 'm²', color: 'var(--to-textb)'  },
                { label: 'Excavation vol',val: foundVolume,  unit: 'm³', color: accent             },
              ] as { label: string; val: number; unit: string; color: string }[]).map(({ label, val, unit, color }) => (
                <div key={label} style={{ textAlign: 'center', background: darkMode ? '#0d1a0d' : '#f8fafc', borderRadius: 6, padding: '7px 4px', border: `1px solid ${accent}33` }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(val)}</div>
                  <div style={{ fontSize: 9, color: 'var(--to-muted)', marginTop: 2 }}>{unit}</div>
                  <div style={{ fontSize: 9, color: 'var(--to-dim)', letterSpacing: 0.3 }}>{label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Manual cost breakdown — for foundation lines, buildup phases and all
              other phases that don't have an automated task/demo cost breakdown.
              Stored in taskMaterials/taskPlant/taskSubcontractor/taskOther so
              they export to the quote the same way task-phase items do. */}
          {!isIntWall && !isDemo && !isTaskPhase && (
            <>
              {(isBuildup || isExtWall || isPlaster) && (
                <div style={{ fontSize: 10, color: 'var(--to-muted)', fontStyle: 'italic', marginBottom: 8 }}>
                  Layer quantities shown in Construction above. Add costs below:
                </div>
              )}
              {([
                { key: 'taskMaterials'     as const, label: '📦 Materials',     color: CAT_COLOR.materials      },
                { key: 'taskPlant'         as const, label: '🚜 Plant',         color: CAT_COLOR.plant          },
                { key: 'taskSubcontractor' as const, label: '👷 Subcontractor', color: CAT_COLOR.subcontractors },
                { key: 'taskOther'         as const, label: '📋 Other',         color: CAT_COLOR.other          },
              ] as { key: keyof TakeoffItem; label: string; color: string }[]).map(({ key, label, color }) => (
                <div key={key as string} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</span>
                  <NumInput type="number" step="any" min={0} style={inputStyle}
                    value={(item[key] as number | undefined) ?? 0}
                    onChange={e => saveItemEdit({ ...item, [key]: +e.target.value })}
                  />
                </div>
              ))}
            </>
          )}
        </div>
        </>
        )}

        {/* ════════════════ FOOTER ════════════════ */}
        <div style={{ padding: '8px 14px 18px', borderTop: '1px solid var(--to-border)', marginTop: 2 }}>
          <button
            style={{ ...btnStyle, background: '#c0392b', borderColor: '#c0392b', width: '100%', justifyContent: 'center', color: '#fff' }}
            onClick={deleteItem}>
            🗑 Delete Item
          </button>
        </div>
      </div>
    )
  }

  // ── Properties panel ───────────────────────────────────────────────────────
  function renderProperties() {
    const item = editingItem ?? phaseDefaults
    if ((activePhase === 'Electrics' && tool === 'electric') || item?.electricsSummary) return renderElectricsPanel()
    if ((activePhase === 'Windows & Doors' && tool === 'opening') || item?.wdSummary) return renderOpeningsPanel()
    if (!item) {
      return (
        <div style={{ padding: '16px', color: 'var(--to-muted)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>☝️</div>
          Click a phase on the left or an element on the canvas to view properties.
          <br /><br />
          Or click <strong>+ Add Item</strong> to manually add a take-off line.
        </div>
      )
    }

    // If showing phase defaults, show task picker first
    if (item.id.startsWith('__phase-defaults-')) {
      const taskSubs = getAllSubphasesForPhase(activePhase)
      const selectedSub = taskSubs.find(s => s.id === selectedTaskSubphaseId) ?? taskSubs[0]
      const taskList = selectedSub?.tasks ?? []
      const selectedTask = taskList.find(t => t.id === selectedTaskId)
      // A sub-phase with a built calculator has no flat tasks to pick — it's priced by its calculator
      // once the wall is drawn (see the drawing step, which carries this choice onto the wall).
      const selectedSubCanonical = selectedSub ? boSubPhases.find(b => b.id === selectedSub.id)?.canonical_id : undefined
      const selectedSubBuilt = !!(selectedSubCanonical && BUILT_ASSEMBLY_CANON_IDS[selectedSubCanonical])

      return (
        <div style={{ padding: '16px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--to-text)', marginBottom: 12 }}>
            {activePhase}
          </div>

          {taskSubs.length > 0 && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Sub-Phase</label>
                <select
                  style={inputStyle}
                  value={selectedTaskSubphaseId ?? (taskSubs[0]?.id ?? '')}
                  onChange={e => {
                    setSelectedTaskSubphaseId(e.target.value)
                    const sp = getAllSubphasesForPhase(activePhase).find(s => s.id === e.target.value)
                    if (sp?.tasks[0]) setSelectedTaskId(sp.tasks[0].id)
                    else setSelectedTaskId(null)
                    // A calculator sub-phase is drawn as a line, whatever the last task's tool was.
                    const canon = boSubPhases.find(b => b.id === e.target.value)?.canonical_id
                    if (canon && BUILT_ASSEMBLY_CANON_IDS[canon]) setTool(FOUNDATION_SHAPE_CALCS.has(canon) ? 'rect' : (PHASE_DEFAULT_TOOL[activePhase] ?? 'line'))
                  }}>
                  {taskSubs.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                </select>
              </div>

              {selectedSubBuilt && (
                <div style={{
                  background: 'var(--to-alt)', padding: 10, borderRadius: 6, fontSize: 12,
                  color: 'var(--to-text)', marginBottom: 12,
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>🧮 {selectedSub?.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--to-muted)' }}>
                    Priced with its own calculator — there are no tasks to pick. {(activePhase === 'Decoration' || activePhase === 'Tiling & Finishes' || activePhase === 'Windows & Doors') ? 'Draw an area on the plan (it is only a marker), then open the calculator to price it.' : (activePhase === 'Plumbing & Heating' || activePhase === 'Drainage & Services') ? 'Draw a line on the plan (it is only a marker), then open the calculator to price it.' : 'Draw the wall, then open the calculator to price it.'}
                  </div>
                </div>
              )}

              {!selectedSubBuilt && (<>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Task</label>
                <select
                  style={inputStyle}
                  value={selectedTaskId ?? (taskList[0]?.id ?? '')}
                  onChange={e => {
                    const taskIdValue = e.target.value
                    setSelectedTaskId(taskIdValue)
                    // Look up task from fresh phase data to ensure we have correct unit
                    const allSubs = getAllSubphasesForPhase(activePhase)
                    const subphaseId = selectedTaskSubphaseId ?? allSubs[0]?.id
                    const sub = allSubs.find(s => s.id === subphaseId)
                    const tk = sub?.tasks.find(t => t.id === taskIdValue)
                    if (tk) {
                      // Switch tool based on task unit
                      const toolForUnit = tk.unit === 'nr' || tk.unit === 'day' || tk.unit === 'wk' || tk.unit === 'sum' || tk.unit === '%' ? 'click' : PHASE_DEFAULT_TOOL[activePhase] ?? 'select'
                      setTool(toolForUnit)
                    }
                  }}>
                  {taskList.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({PHASE_TASK_UNIT_LABELS[t.unit]})
                    </option>
                  ))}
                </select>
              </div>

              {selectedTask && (
                <div style={{
                  background: 'var(--to-alt)',
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--to-text)',
                  marginBottom: 12
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{selectedTask.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--to-muted)' }}>
                    {selectedTask.unit === 'nr' ? '💠 Click to place item' :
                     selectedTask.unit === 'lm' ? '📏 Draw line (linear metres)' :
                     selectedTask.unit === 'm²' ? '📐 Draw shape (square metres)' :
                     selectedTask.unit === 'm³' ? '📦 Draw shape (cubic metres)' :
                     selectedTask.unit === 'day' ? '⏱️ Lump sum per day' :
                     selectedTask.unit === 'wk' ? '📅 Lump sum per week' :
                     selectedTask.unit === 'sum' ? '💷 Lump sum' :
                     selectedTask.unit === '%' ? '% Percentage of value' : 'Draw on canvas'}
                  </div>
                </div>
              )}
              </>)}
            </>
          )}

          <div style={{ marginTop: 16, padding: '12px', background: 'var(--to-alt)', borderRadius: 6, fontSize: 12, color: 'var(--to-muted)' }}>
            {selectedSubBuilt
              ? '👈 Ready to draw the wall on the canvas'
              : selectedTask?.unit === 'nr'
                ? '👈 Ready to click on canvas to place a marker'
                : '👈 Ready to draw on canvas'}
          </div>
        </div>
      )
    }

    return renderUnifiedProperties(item)
  }

  // ── Recovery snapshot banner (reusable) ──────────────────────────────────────
  function renderRecoveryBanner() {
    if (!recoverySnap) return null
    const snapTime = new Date(recoverySnap.timestamp)
    const timeLabel = `${snapTime.toLocaleDateString('en-GB')} ${snapTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    return (
      <div style={{
        background: darkMode ? '#1a2a1a' : '#f0fdf4',
        border: `1px solid ${darkMode ? '#2d5a2d' : '#86efac'}`,
        borderRadius: 6, margin: '8px 10px 0', padding: '8px 10px',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 16 }}>💾</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: darkMode ? '#86efac' : '#166534' }}>
            Recovery snapshot available
          </div>
          <div style={{ fontSize: 10, color: 'var(--to-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {recoverySnap.projectName} · {timeLabel}
          </div>
        </div>
        <button
          onClick={restoreRecoverySnapshot}
          style={{
            padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer',
            background: darkMode ? '#2d5a2d' : '#dcfce7', border: `1px solid ${darkMode ? '#3d7a3d' : '#86efac'}`,
            color: darkMode ? '#86efac' : '#166534', whiteSpace: 'nowrap',
          }}
        >
          ↩ Restore
        </button>
        <button
          onClick={() => { localStorage.removeItem(LS_RECOVERY); setRecoverySnap(null) }}
          style={{ padding: '4px 6px', fontSize: 11, borderRadius: 4, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--to-muted)' }}
          title="Dismiss snapshot"
        >
          ×
        </button>
      </div>
    )
  }

  // ── Render: schedule panel ─────────────────────────────────────────────────
  function renderSchedule() {
    if (project.items.length === 0) {
      return (
        <div style={{ padding: '24px 16px', color: 'var(--to-muted)', fontSize: 13, textAlign: 'center' }}>
          {renderRecoveryBanner()}
          <div style={{ fontSize: 28, marginTop: 20, marginBottom: 12 }}>📋</div>
          No items yet.
          <br /><br />
          Draw on the canvas or click <strong>+ Add Item</strong> to start your take-off schedule.
        </div>
      )
    }

    return (
      <div ref={scheduleContainerRef} style={{ overflowY: 'auto', height: '100%' }}>
        {renderRecoveryBanner()}
        {/* Item count summary */}
        <div style={{ padding: '10px 14px', background: 'var(--to-alt)', borderBottom: '1px solid var(--to-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--to-sub)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Quantities
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--to-text)' }}>
            {project.items.length} item{project.items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* With several plans: show the items from one sheet, or all of them */}
        {(project.sheets?.length ?? 0) > 1 && (
          <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--to-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--to-muted)' }}>Show</span>
            <select style={{ ...inputStyle, height: 26, flex: 1 }} value={scheduleSheetFilter} onChange={e => setScheduleSheetFilter(e.target.value)}>
              <option value="all">All sheets</option>
              {project.sheets!.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Phase groups */}
        {phaseGroups.map(g => (
          <div key={g.phase} data-phase={g.phase}>
            <div style={{ padding: '8px 14px', background: 'var(--to-panel)', borderBottom: '1px solid var(--to-border)',
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: PHASE_COLORS[g.phase], flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--to-text)' }}>{g.phase}</span>
              <span style={{ fontSize: 11, color: 'var(--to-muted)', background: 'var(--to-bg)', borderRadius: 10,
                padding: '1px 7px', marginLeft: 2 }}>{g.items.length}</span>
            </div>
            {g.items.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  // an item drawn on another sheet: show that sheet first (keeping this item selected)
                  const itemSheet = itemSheetId(item, project)
                  if (itemSheet && itemSheet !== activeSheetId) switchSheet(itemSheet, true)
                  setEditingItem(item)
                  const el = item.elementId ? project.elements.find(e => e.id === item.elementId) ?? null : null
                  setEditingElement(el)
                  if (el) setSelectedId(el.id)
                  setPanelMode('properties')
                  // A wall with a calculator opens it straight away — the panel is only its summary.
                  openAssemblyFor(item)
                }}
                style={{
                  padding: '7px 14px', borderBottom: '1px solid var(--to-blt)',
                  cursor: 'pointer', background: editingItem?.id === item.id ? 'var(--to-hover)' : 'transparent',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--to-textb)', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: 'var(--to-muted)', marginTop: 2 }}>
                  <span style={{ color: 'var(--to-text)', fontFamily: 'monospace' }}>
                    {item.qty} {item.unit}
                  </span>
                  {item.floorMakeupId
                    ? <span style={{ color: '#f39c12' }}> · {item.taskSubphaseId && item.subPhase ? item.subPhase : ((PHASE_MAKEUPS[item.phase] ?? FLOOR_MAKEUPS).find(m => m.id === item.floorMakeupId)?.name ?? FLOOR_MAKEUPS.find(m => m.id === item.floorMakeupId)?.name ?? 'Floor')}</span>
                    : item.spec ? ` · ${item.spec}` : ''}
                  {item.perimeter != null && (
                    <span style={{ color: '#6a8a6a' }}>, {fmt2(item.perimeter)}m perim</span>
                  )}
                  {item.drawingRef ? <span style={{ color: '#4a7a4a' }}> [{item.drawingRef}]</span> : ''}
                  {/* An item whose drawing is gone (deleted by an older version, or removed some other way) says so, and can be removed here */}
                  {item.elementId && !project.elements.some(e => e.id === item.elementId) && (
                    <span style={{ marginLeft: 6 }}>
                      <span style={{ color: '#f39c12' }}>⚠ its drawing is gone</span>
                      <button title="Remove this item from the schedule"
                        onClick={e => { e.stopPropagation(); setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) })); if (editingItem?.id === item.id) { setEditingItem(null); setEditingElement(null) } showToast('Item removed.') }}
                        style={{ marginLeft: 6, padding: '0 6px', fontSize: 10, border: '1px solid #c0392b', borderRadius: 4, background: 'transparent', color: '#e57373', cursor: 'pointer' }}>Remove</button>
                    </span>
                  )}
                  {/* A drawing on a hidden layer is still in the schedule: say why it is not on the plan */}
                  {item.elementId && project.elements.some(e => e.id === item.elementId) && hiddenPhases.has(item.phase as TakeoffPhase) && (
                    <span style={{ marginLeft: 6, color: '#6a7a8a' }}>👁 layer hidden</span>
                  )}
                  {(project.sheets?.length ?? 0) > 1 && (() => { const sid = itemSheetId(item, project); const nm = sid ? sheetName(project, sid) : ''; return nm && nm !== item.drawingRef ? <span style={{ color: '#6a7a8a' }}> · {nm}</span> : null })()}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Send / Export to quote */}
        <div style={{ padding: '14px', borderTop: '1px solid var(--to-border)', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            style={{ ...btnStyle, width: '100%', justifyContent: 'center', background: '#2563eb', color: '#fff', borderColor: '#1d4ed8', fontWeight: 600 }}
            onClick={sendToQuote}>
            📋 Send to Quote
          </button>
          <button
            style={{ ...btnStyle, width: '100%', justifyContent: 'center', background: darkMode ? '#1e293b' : '#f1f5f9', fontSize: 11 }}
            onClick={exportForQuote}>
            📤 Export JSON
          </button>
        </div>
      </div>
    )
  }

  // ── Shared styles (theme-aware) ────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--to-input)', border: '1px solid var(--to-input-bd)', borderRadius: 5,
    color: 'var(--to-textb)', padding: '5px 8px', fontSize: 12, boxSizing: 'border-box',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, color: 'var(--to-muted)', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 4,
  }
  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px',
    background: 'var(--to-hover)', border: '1px solid var(--to-btn-bd)', borderRadius: 5,
    color: 'var(--to-text)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  }
  // The tool bar's groups, and an on/off button that reads clearly: lit green with white text when on, the normal button when off
  const tbGroup: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', border: '1px solid var(--to-border)', borderRadius: 8, background: 'var(--to-alt)' }
  const tbGroupLabel: React.CSSProperties = { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--to-muted)', marginRight: 3, userSelect: 'none' }
  const toggleBtn = (on: boolean): React.CSSProperties => ({ ...btnStyle, padding: '6px 9px', ...(on ? { background: '#2f6f2f', borderColor: '#7ab533', color: '#ffffff', fontWeight: 600 } : {}) })
  const dimRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', color: 'var(--to-link)', fontSize: 12, marginBottom: 3,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      ...TV as React.CSSProperties,
      margin: '-26px -32px',
      height: 'calc(100dvh - 56px)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--to-bg)',
      color: 'var(--to-text)',
      fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* ── Top bar: row 1 is the job (name, address, customer, files); row 2 is the tools, in groups ───────── */}
      <div style={{ background: 'var(--to-panel)', borderBottom: '1px solid var(--to-border)', flexShrink: 0 }}>
        {/* Row 1: the job */}
        <div style={{ minHeight: 46, display: 'flex', alignItems: 'center', flexWrap: 'wrap', padding: '4px 12px', gap: 8 }}>
          {editingName ? (
            <input
              autoFocus
              style={{ ...inputStyle, width: 180, height: 28, fontSize: 13, fontWeight: 700 }}
              value={project.name}
              onChange={e => setProject(p => ({ ...p, name: e.target.value }))}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
            />
          ) : (
            <div
              onClick={() => setEditingName(true)}
              style={{ fontWeight: 700, fontSize: 14, color: 'var(--to-text)', cursor: 'text', minWidth: 120,
                padding: '3px 6px', borderRadius: 4, border: '1px solid transparent' }}
              title="Click to edit project name"
            >
              📐 {project.name || <span style={{ color: 'var(--to-muted)', fontWeight: 500 }}>Name this take-off…</span>}
            </div>
          )}

          <button style={btnStyle} onClick={openTakeoffList} title="Your saved take-offs: open one to carry on, or start a new one">
            📁 My Take-offs
          </button>
          <button style={{ ...btnStyle, background: '#c0392b33', borderColor: '#c0392b', color: '#e57373', whiteSpace: 'nowrap' }}
            onClick={handleClose} title="Save this take-off under its name in My Take-offs and clear the screen for a fresh one">
            ✕ Close take-off
          </button>

          <div style={{ width: 1, height: 28, background: 'var(--to-border)', margin: '0 2px' }} />

          <input
            style={{ ...inputStyle, width: 200, height: 28, fontSize: 12 }}
            placeholder="Address / project ref"
            value={project.address}
            onChange={e => setProject(p => ({ ...p, address: e.target.value }))}
          />

          {/* Client / project info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--to-text)', lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.client?.name ?? 'No client assigned'}
              </span>
              {(project.siteAddress ?? project.client?.address ?? '') && (
                <span style={{ fontSize: 10, color: 'var(--to-muted)', lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {project.siteAddress ?? project.client?.address ?? ''}
                </span>
              )}
              {project.projectName && (
                <span style={{ fontSize: 10, color: 'var(--to-dim)', lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {project.projectName}
                </span>
              )}
            </div>
            <button
              style={{ ...btnStyle, fontSize: 11, padding: '4px 8px', whiteSpace: 'nowrap' }}
              onClick={() => setShowClientModal(true)}
              title="Edit client and project details"
            >
              Edit Client
            </button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Files */}
          <div style={tbGroup}>
            <span style={tbGroupLabel}>File</span>
            <input type="file" accept=".json" ref={importJsonRef} style={{ display: 'none' }} onChange={handleImportJson} />
            <button style={btnStyle} onClick={() => importJsonRef.current?.click()} title="Load a take-off from a backup file (JSON). Your saved take-offs are under My Take-offs.">
              📂 Open
            </button>
            <button style={btnStyle} onClick={() => exportJSON(project)} title="Download a backup file of this take-off (drawings and pricing, not the plan pictures)">
              💾 JSON
            </button>
            <button style={btnStyle} onClick={() => exportCSV(project)} title="Download the schedule as a spreadsheet">
              📊 CSV
            </button>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            style={{ ...btnStyle, padding: '6px 10px', background: darkMode ? 'var(--to-hover)' : 'rgba(122,181,51,0.12)', borderColor: 'var(--to-accent)', color: 'var(--to-accent)', gap: 4 }}
          >
            {darkMode ? '☀' : '◑'} {darkMode ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Row 2: the tools, in groups */}
        <div style={{ minHeight: 46, display: 'flex', alignItems: 'center', flexWrap: 'wrap', padding: '4px 12px 6px', gap: 8, borderTop: '1px solid var(--to-border)' }}>
          {/* Plan: the picture and its scale */}
          <div style={tbGroup}>
            <span style={tbGroupLabel}>Plan</span>
            <input type="file" accept="image/*,application/pdf,.pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageLoad} />
            <button style={btnStyle} onClick={() => setPlanChooserOpen(true)} disabled={pdfLoading} title="Add a plan from this computer or from a customer's files">
              {pdfLoading ? '⏳ Loading…' : (project.sheets?.length ? '🖼 Add Plan' : '🖼 Load Plan')}
            </button>
            <select
              style={{ ...inputStyle, width: 120, height: 28 }}
              value={project.calibration.label ?? ''}
              onChange={e => {
                if (e.target.value === 'custom') { setShowCalib(true); return }
                { const d = denomFromLabel(e.target.value); if (d) applyScaleDenom(d) }
              }}
              title="Scale the plan was printed at. The paper size is used to work out real distances: check it with the paper button next to this, or use Calibrate with a known length."
            >
              {SCALE_DENOMS.map(d => <option key={d} value={scaleLabel(d)}>{scaleLabel(d)}</option>)}
              {/* Show current custom calibration label if it isn't one of the presets */}
              {project.calibration.label && !SCALE_DENOMS.some(d => scaleLabel(d) === project.calibration.label) && (
                <option value={project.calibration.label}>{project.calibration.label}</option>
              )}
              <option value="custom">Custom…</option>
            </select>
            <button style={{ ...btnStyle, padding: '4px 8px', fontSize: 11 }} disabled={!canvasImgSize}
              onClick={() => { setPendingDenom(null); setShowPaperModal(true) }}
              title="The paper size this plan is printed on. The scale presets need it to measure correctly.">
              📄 {paperInfoForActiveSheet()?.paper || 'Paper?'}
            </button>
            <button style={btnStyle} onClick={() => setShowCalib(true)} title="Calibrate scale from drawing">
              📏 Calibrate
            </button>
          </div>

          {/* Draw: undo, and the aids that help place a point */}
          <div style={tbGroup}>
            <span style={tbGroupLabel}>Draw</span>
            <button style={{ ...btnStyle, padding: '6px 9px', opacity: (historyRef.current?.undo.length ?? 0) > 0 || (isDrawing && drawPoints.length > 0) ? 1 : 0.5 }} onClick={undoDrawing} title="Undo (Ctrl+Z). While you are drawing it takes back the last point.">↶ Undo</button>
            <button style={{ ...btnStyle, padding: '6px 9px', opacity: (historyRef.current?.redo.length ?? 0) > 0 ? 1 : 0.5 }} onClick={redoDrawing} title="Redo (Ctrl+Y)">↷ Redo</button>
            <div style={{ width: 1, height: 20, background: 'var(--to-border)', margin: '0 2px' }} />
            <button style={toggleBtn(snapOn)} aria-pressed={snapOn} onClick={() => setSnapOn(v => !v)} title="Snap to the corners, ends and mid-points of drawings already on the plan">🧲 Snap{snapOn ? ' ✓' : ''}</button>
            <button style={toggleBtn(orthoOn)} aria-pressed={orthoOn} onClick={() => setOrthoOn(v => !v)} title="Keep each line horizontal or vertical (hold Shift to do it for one line)">⊾ Ortho{orthoOn ? ' ✓' : ''}</button>
            <button style={toggleBtn(showGrid)} aria-pressed={showGrid} onClick={() => setShowGrid(v => !v)} title="Show the grid">⊞ Grid{showGrid ? ' ✓' : ''}</button>
          </div>

          {/* The selected drawing */}
          <div style={tbGroup}>
            <span style={tbGroupLabel}>Selected</span>
            <button style={{ ...btnStyle, padding: '6px 9px', opacity: selectedId ? 1 : 0.5 }} onClick={duplicateSelected} title="Copy the selected drawing and its item (Ctrl+D)">⧉ Copy</button>
            <button style={{ ...btnStyle, padding: '6px 9px', opacity: selectedId ? 1 : 0.5 }} onClick={() => rotateSelected(null)} title="Rotate the selected drawing (R turns it a quarter turn)">⟳ Rotate</button>
          </div>

          {/* View: zoom */}
          <div style={tbGroup}>
            <span style={tbGroupLabel}>View</span>
            <button style={{ ...btnStyle, padding: '6px 9px' }} onClick={() => {
              const rect = svgRef.current!.getBoundingClientRect()
              const cx = rect.width / 2, cy = rect.height / 2
              const nz = Math.max(zoom / 1.25, 0.05)
              setPanOffset({ x: cx - (cx - panOffset.x) * (nz / zoom), y: cy - (cy - panOffset.y) * (nz / zoom) })
              setZoom(nz)
            }} title="Zoom out">−</button>
            <span style={{ fontSize: 11, color: 'var(--to-text)', minWidth: 40, textAlign: 'center', fontFamily: 'monospace' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button style={{ ...btnStyle, padding: '6px 9px' }} onClick={() => {
              const rect = svgRef.current!.getBoundingClientRect()
              const cx = rect.width / 2, cy = rect.height / 2
              const nz = Math.min(zoom * 1.25, 20)
              setPanOffset({ x: cx - (cx - panOffset.x) * (nz / zoom), y: cy - (cy - panOffset.y) * (nz / zoom) })
              setZoom(nz)
            }} title="Zoom in (scroll wheel)">+</button>
            <button style={btnStyle} onClick={() => fitToScreen()} title="Fit plan to screen">⊡ Fit</button>
            <button
              style={{ ...btnStyle, color: '#7ab533', borderColor: '#3a5a2a' }}
              onClick={resetView}
              title="Reset zoom and pan only — drawings are kept"
            >
              ⟲ Reset view
            </button>
          </div>

          <div style={{ flex: 1 }} />

          {/* Clearing: kept apart and in warning colours so they are not pressed by mistake */}
          <div style={{ ...tbGroup, borderColor: 'rgba(192,57,43,0.4)' }}>
            <span style={{ ...tbGroupLabel, color: '#c0392b' }}>Clear</span>
            <button
              style={{ ...btnStyle, color: '#f39c12', borderColor: '#5a3a0a', opacity: resetInProgress ? 0.5 : 1 }}
              onClick={() => setShowClearModal(true)}
              disabled={resetInProgress}
              title="Remove all drawings but keep phases, tasks and pricing"
            >
              🗑 Drawings
            </button>
            <button
              style={{ ...btnStyle, color: '#e74c3c', borderColor: '#5a1a1a', opacity: resetInProgress ? 0.5 : 1 }}
              onClick={() => setShowResetModal(true)}
              disabled={resetInProgress}
              title="Full reset — wipes everything and returns to a blank takeoff"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel: tool icons + phase legend */}
        <div style={{
          width: 130, background: 'var(--to-panel)', borderRight: '1px solid var(--to-border)',
          display: 'flex', flexDirection: 'column', alignItems: 'stretch',
          padding: '8px 6px', gap: 0, flexShrink: 0, overflowY: 'auto',
        }}>
          {/* ── Active Draw Mode panel ── */}
          <div style={{
            background: darkMode ? '#0d1a0d' : '#f0f7e8',
            border: `1px solid ${darkMode ? '#2a4a2a' : '#b8d98d'}`,
            borderRadius: 6, padding: '7px 8px', marginBottom: 8,
          }}>
            <div style={{ fontSize: 8, color: darkMode ? '#5a8a5a' : '#6a9a4a', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 5, fontWeight: 700 }}>
              Active Tool
            </div>
            {/* Phase */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: 1, background: PHASE_COLORS[activePhase], flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: darkMode ? '#a0c080' : '#4a7a2a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                {activePhase.replace('External Works & Landscaping', 'Ext. Works').replace('Internal Walls & Partitions', 'Int. Walls').replace('Site Setup & Demolition', 'Demolition').replace('Plastering & Boarding', 'Plastering').replace('Structural Frame', 'Struct. Frame').replace('Windows & Doors', 'Windows/Doors').replace('Plumbing & Heating', 'Plumbing').replace('Drainage & Services', 'Drainage').replace('Joinery & Fixtures', 'Joinery').replace('Tiling & Finishes', 'Tiling').replace('Floors & Screeds', 'Floors').replace('Preliminaries', 'Prelims')}
              </span>
            </div>
            {/* Measurement */}
            <div style={{ fontSize: 9, color: darkMode ? '#7a9a7a' : '#5a7a4a', marginBottom: 2 }}>
              <span style={{ color: darkMode ? '#4a6a4a' : '#8aaa6a' }}>Measure: </span>
              {PHASE_MEASURE_LABEL[activePhase] ?? '—'}
            </div>
            {/* Tool mode */}
            <div style={{ fontSize: 9, color: darkMode ? '#7a9a7a' : '#5a7a4a', marginBottom: 2 }}>
              <span style={{ color: darkMode ? '#4a6a4a' : '#8aaa6a' }}>Mode: </span>
              {TOOL_DISPLAY[tool]}
            </div>
            {/* Status */}
            <div style={{ fontSize: 9, fontWeight: 700, marginTop: 3 }}>
              <span style={{
                display: 'inline-block', padding: '1px 5px', borderRadius: 3,
                background: isDrawing ? (darkMode ? '#2a1a00' : '#fff3cd') : (darkMode ? '#0a2a0a' : '#d4edda'),
                color: isDrawing ? (darkMode ? '#f0a030' : '#856404') : (darkMode ? '#4aaa4a' : '#155724'),
                border: `1px solid ${isDrawing ? (darkMode ? '#5a3a00' : '#ffc107') : (darkMode ? '#2a6a2a' : '#28a745')}`,
              }}>
                {isDrawing ? 'Drawing' : 'Ready'}
              </span>
            </div>
          </div>

          {/* Section label */}
          <div style={{ fontSize: 9, color: 'var(--to-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, paddingLeft: 4 }}>
            Tools
          </div>

          {/* Drawing tools */}
          {([
            { t: 'select',  icon: '↖', label: 'Select'    },
            { t: 'line',    icon: '╱', label: 'Line'       },
            { t: 'rect',    icon: '▭', label: 'Rectangle'  },
            { t: 'polygon', icon: '⬠', label: 'Polygon'    },
            { t: 'measure', icon: '📏', label: 'Measure'    },
            { t: 'click',   icon: '💠', label: 'Click to Place Item' },
            { t: 'electric', icon: '⚡', label: 'Place Electrical Point' },
            { t: 'opening', icon: '🪟', label: 'Place Window / Door' },
          ] as { t: DrawingTool; icon: string; label: string }[]).filter(({ t }) => (t !== 'electric' || activePhase === 'Electrics') && (t !== 'opening' || activePhase === 'Windows & Doors')).map(({ t, icon, label }) => (
            <div
              key={t}
              onClick={() => { if (tool === 'measure' || t === 'measure') { setDrawPoints([]); setIsDrawing(false) } setTool(t); if (t === 'select') { setDrawPoints([]); setIsDrawing(false) } if (t === 'electric') setPanelMode('properties'); if (t === 'opening') { setPanelMode('properties'); setEditingItem(null); setEditingElement(null); setSelectedId(null) } }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 8px', marginBottom: 3, borderRadius: 5, cursor: 'pointer',
                background: tool === t ? 'var(--to-active)' : 'var(--to-alt)',
                border: `1px solid ${tool === t ? 'var(--to-active-bd)' : 'var(--to-border)'}`,
                color: 'var(--to-text)', fontSize: 12, fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, width: 16, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
              <span>{label}</span>
            </div>
          ))}

          {/* Cancel drawing — only shown while actively drawing */}
          {isDrawing && (
            <div
              onClick={() => { setDrawPoints([]); setIsDrawing(false) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 8px', marginBottom: 3, borderRadius: 5, cursor: 'pointer',
                background: darkMode ? '#5a1a1a' : '#fdecea', border: `1px solid ${darkMode ? '#8a2a2a' : '#e57373'}`,
                color: darkMode ? '#f1a0a0' : '#c0392b', fontSize: 12, fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, width: 16, textAlign: 'center', flexShrink: 0 }}>✕</span>
              <span>Cancel</span>
            </div>
          )}

          {/* Reset Draw Mode — always visible, resets tool to Select */}
          <div
            onClick={resetDrawMode}
            title="Return to selection mode (does not change phase)"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 8px', marginBottom: 3, borderRadius: 5, cursor: tool === 'select' && !isDrawing ? 'default' : 'pointer',
              background: tool === 'select' && !isDrawing
                ? (darkMode ? '#111' : '#f5f5f5')
                : (darkMode ? '#1a1a2a' : '#e8eaf6'),
              border: `1px solid ${tool === 'select' && !isDrawing ? 'var(--to-border)' : (darkMode ? '#3a3a7a' : '#9fa8da')}`,
              color: tool === 'select' && !isDrawing ? 'var(--to-dim)' : (darkMode ? '#a0a0e0' : '#3949ab'),
              fontSize: 12, fontFamily: 'inherit',
              opacity: tool === 'select' && !isDrawing ? 0.45 : 1,
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1, width: 16, textAlign: 'center', flexShrink: 0 }}>↩</span>
            <span>Reset Mode</span>
          </div>

          <div style={{ height: 1, background: 'var(--to-border)', margin: '8px 0' }} />

          {/* Add manual item */}
          <div
            onClick={addManualItem}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 8px', marginBottom: 3, borderRadius: 5, cursor: 'pointer',
              background: 'var(--to-hover)', border: '1px solid var(--to-btn-bd)',
              color: 'var(--to-text)', fontSize: 12, fontFamily: 'inherit',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1, width: 16, textAlign: 'center', flexShrink: 0 }}>+</span>
            <span>Add Item</span>
          </div>

          <div style={{ height: 1, background: 'var(--to-border)', margin: '8px 0' }} />

          {/* Section label */}
          <div style={{ fontSize: 9, color: 'var(--to-dim)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5, paddingLeft: 4 }}>
            Phase
          </div>

          {/* Phase list */}
          {livePhaseNames.map(ph => (
            <div key={ph}>
            <div
              title={ph}
              onClick={() => selectPhase(ph)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 6px', marginBottom: 2, borderRadius: 4, cursor: 'pointer',
                background: activePhase === ph ? 'var(--to-hover)' : 'transparent',
                border: `1px solid ${activePhase === ph ? 'var(--to-btn-bd)' : 'transparent'}`,
                transition: 'all 0.12s',
              }}
            >
              <div style={{
                width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                background: PHASE_COLORS[ph],
                boxShadow: activePhase === ph ? `0 0 0 2px ${darkMode ? '#fff4' : '#0003'}` : 'none',
              }} />
              <span style={{
                fontSize: 11, color: activePhase === ph ? 'var(--to-text)' : 'var(--to-sub)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {ph.replace('External Works & Landscaping', 'Ext. Works').replace('Internal Walls & Partitions', 'Int. Walls').replace('Site Setup & Demolition', 'Demolition').replace('Plastering & Boarding', 'Plastering').replace('Structural Frame', 'Struct. Frame').replace('Windows & Doors', 'Windows/Doors').replace('Plumbing & Heating', 'Plumbing').replace('Drainage & Services', 'Drainage').replace('Joinery & Fixtures', 'Joinery').replace('Tiling & Finishes', 'Tiling').replace('Floors & Screeds', 'Floors').replace('Preliminaries', 'Prelims')}
              </span>
            </div>
            </div>
          ))}
        </div>

        {/* Centre: SVG canvas */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: 'hidden', position: 'relative', background: 'var(--to-bg)' }}
        >
          {/* Drawing aids: what to type while drawing, and what has been typed */}
          {typedAllowed() && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 6, background: 'var(--to-panel)', border: '1px solid var(--to-border)', color: 'var(--to-text)', borderRadius: 8, padding: '6px 12px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'center', pointerEvents: 'none' }}>
              <strong style={{ fontFamily: 'monospace', minWidth: 60, color: typed ? '#7fdc3c' : 'var(--to-sub)' }}>{typed ? typed + ' m' : (tool === 'rect' || (tool === 'floor' && floorDrawMode === 'rect')) ? 'type 4.5x3' : 'type a length'}</strong>
              <span style={{ color: 'var(--to-sub)' }}>
                {tool === 'rect' || (tool === 'floor' && floorDrawMode === 'rect')
                  ? 'width x height in metres, then Enter · Backspace takes back the first corner'
                  : 'metres, then Enter places the point · Enter alone finishes · Backspace takes back a point'}
                {(orthoOn || shiftHeld) ? ' · straight (ortho)' : ''}
              </span>
            </div>
          )}

          {/* Measure tool: what is being measured, with a reminder that nothing is saved or priced */}
          {(tool === 'measure' || measureDone) && (() => {
            const live = tool === 'measure' && isDrawing && drawPoints.length > 0
            const pts = live ? [...drawPoints, mousePos] : (measureDone?.points ?? [])
            const mpp = project.calibration.mpp
            const total = polylineLength(pts, mpp)
            const last = pts.length >= 2 ? polylineLength(pts.slice(-2), mpp) : 0
            const closed = pts.length >= 3 ? { area: polygonArea(pts, mpp), perimeter: total + polylineLength([pts[pts.length - 1], pts[0]], mpp) } : null
            const activeSheet = project.sheets?.find(s => s.id === activeSheetId)
            return (
              <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', zIndex: 6, background: 'var(--to-panel)', border: '1px solid #00d4ff', color: 'var(--to-text)', borderRadius: 8, padding: '7px 12px', fontSize: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '70%' }}>
                <strong style={{ color: '#00d4ff' }}>📏 Measure</strong>
                {pts.length < 2 ? (
                  <span style={{ color: 'var(--to-sub)' }}>Click the start, click along the route, double-click to finish. Esc clears it. Nothing is saved or priced.</span>
                ) : (
                  <>
                    <span>Total <strong style={{ fontFamily: 'monospace' }}>{fmtM(total)}</strong></span>
                    {pts.length > 2 && <span style={{ color: 'var(--to-sub)' }}>last <span style={{ fontFamily: 'monospace' }}>{fmtM(last)}</span></span>}
                    {closed && <span style={{ color: 'var(--to-sub)' }}>if closed: <span style={{ fontFamily: 'monospace' }}>{fmt2(closed.area)} m²</span>, perimeter <span style={{ fontFamily: 'monospace' }}>{fmtM(closed.perimeter)}</span></span>}
                    {!live && <button onClick={() => setMeasureDone(null)} style={{ ...btnStyle, padding: '2px 8px', fontSize: 11 }}>Clear</button>}
                  </>
                )}
                <span style={{ color: 'var(--to-muted)', fontSize: 11 }}>scale {project.calibration.label || '1:100'}</span>
                {activeSheet && !activeSheet.scaleSet && <span style={{ color: '#f39c12', fontSize: 11 }}>⚠ this sheet's scale is not set yet: set it first or the length will be wrong</span>}
              </div>
            )
          })()}

          {/* Sheets: each plan has its own picture, its own scale and its own drawings */}
          {(project.sheets?.length ?? 0) > 0 && (
            <div style={{ position: 'absolute', left: 8, bottom: 8, right: 150, zIndex: 5, display: 'flex', alignItems: 'center', gap: 4, overflowX: 'auto', padding: '4px 6px', background: 'var(--to-panel)', border: '1px solid var(--to-border)', borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
              {project.sheets!.map(s => {
                const on = s.id === activeSheetId
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 6, border: '1px solid ' + (on ? '#7ab533' : 'var(--to-border)'), background: on ? 'rgba(122,181,51,0.18)' : 'transparent' }}>
                    <button
                      onClick={() => switchSheet(s.id)}
                      onDoubleClick={() => renameSheetPrompt(s.id)}
                      title={s.name + ' · scale ' + (s.calibration.label ?? 'custom') + (s.scaleSet ? '' : ' (not set yet)') + ' · double-click to rename'}
                      style={{ background: 'none', border: 'none', color: 'var(--to-text)', fontSize: 12, fontWeight: on ? 700 : 500, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}{!s.scaleSet && <span style={{ color: '#f39c12' }}> ⚠</span>}
                    </button>
                    {pictureSync[s.id] === 'saving' && <span title="Saving this plan to your account…" style={{ fontSize: 10, color: 'var(--to-muted)' }}>☁…</span>}
                    {pictureSync[s.id] === 'saved' && <span title="This plan is saved in your account, so it opens on any computer" style={{ fontSize: 10, color: '#7ab533' }}>☁✓</span>}
                    {(pictureSync[s.id] === 'failed' || pictureSync[s.id] === 'too-big') && (
                      <button onClick={() => retryPictureToAccount(s.id)} title={pictureSync[s.id] === 'too-big' ? 'This plan is too big to save to your account: it is on this computer only' : 'This plan is NOT saved in your account yet (kept on this computer). Press to try again'}
                        style={{ background: 'none', border: 'none', color: '#f39c12', fontSize: 11, padding: '0 2px', cursor: 'pointer' }}>☁⚠</button>
                    )}
                    {on && <span style={{ fontSize: 10, color: 'var(--to-muted)' }}>{s.calibration.label ?? 'custom'}</span>}
                    <button onClick={() => deleteSheetConfirm(s.id)} title="Remove this sheet and everything drawn on it"
                      style={{ background: 'none', border: 'none', color: 'var(--to-muted)', fontSize: 13, padding: '2px 6px', cursor: 'pointer' }}>×</button>
                  </div>
                )
              })}
              <button onClick={() => setPlanChooserOpen(true)} disabled={pdfLoading} title="Add another plan as a new sheet"
                style={{ ...btnStyle, padding: '4px 10px', fontSize: 11, flexShrink: 0 }}>+ Plan</button>
            </div>
          )}
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 6, display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: 'var(--to-panel)', border: '1px solid var(--to-border)', borderRadius: 8, fontSize: 11, color: 'var(--to-text)', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}
            title="How your drawings show on the plan (kept on this computer)">
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title="A white outline under each drawing so its colour stands out on a busy plan">
              <input type="checkbox" checked={viewHalo} onChange={e => setViewHalo(e.target.checked)} style={{ width: 'auto' }} /> Halo
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }} title="A name tag on each drawing. Drag a tag in Select mode to move it out of the way">
              <input type="checkbox" checked={viewTags} onChange={e => setViewTags(e.target.checked)} style={{ width: 'auto' }} /> Names
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Wash out the plan picture so your drawings stand out">
              Fade plan
              <input type="range" min={0} max={75} step={5} value={viewFade} onChange={e => setViewFade(+e.target.value)} style={{ width: 80 }} />
              <span style={{ minWidth: 28, fontFamily: 'monospace' }}>{viewFade}%</span>
            </label>
          </div>
          {sheetImageLoading && (
            <div style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'var(--to-panel)', border: '1px solid var(--to-border)', color: 'var(--to-text)', borderRadius: 8, padding: '8px 14px', fontSize: 12 }}>
              ⏳ Getting this plan from your account…
            </div>
          )}
          {sheetImageMissing && !sheetImageLoading && activeSheetId && (
            <div style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: '#fff7e6', border: '1px solid #f0c080', color: '#7a4a00', borderRadius: 8, padding: '8px 14px', fontSize: 12, maxWidth: 420, textAlign: 'center' }}>
              The picture for <strong>{sheetName(project, activeSheetId)}</strong> is not on this computer or in your account. Press <strong>Add Plan</strong> to load it again: it fills this sheet and keeps its drawings and scale.
            </div>
          )}
          <svg
            ref={svgRef}
            className={viewTags ? 'to-tags-on' : undefined}
            width={svgSize.w}
            height={svgSize.h}
            style={{
              display: 'block',
              position: 'absolute', top: 0, left: 0,
              cursor: isPanning ? 'grabbing' : spaceHeld ? 'grab' : tool === 'select' ? 'default' : tool === 'click' ? 'pointer' : 'crosshair',
              userSelect: 'none',
            }}
            onClick={handleSvgClick}
            onDoubleClick={handleSvgDblClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <style>{'.to-tags-on .to-lbl { display: none }'}</style>
            {/* Everything inside this group is zoomed/panned together */}
            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>

              {/* Plan image */}
              {planImage && canvasImgSize && (
                <>
                  {viewFade > 0 && <rect x={0} y={0} width={canvasImgSize.w} height={canvasImgSize.h} fill="#ffffff" />}
                  <image
                    href={planImage}
                    x={0} y={0}
                    width={canvasImgSize.w}
                    height={canvasImgSize.h}
                    opacity={1 - viewFade / 100}
                    preserveAspectRatio="none"
                  />
                </>
              )}

              {/* Grid */}
              {showGrid && (() => {
                const mpp = project.calibration.mpp || DEFAULT_MPP
                const pxPerM = 1 / mpp
                const minor = Math.max(4, pxPerM)
                const major = minor * 5
                const gridW = canvasImgSize?.w ?? svgSize.w / zoom
                const gridH = canvasImgSize?.h ?? svgSize.h / zoom
                return (
                  <g>
                    <defs>
                      {/* hatching for the layers of a wall drawn at its real thickness (kept the same density on screen at any zoom) */}
                      <pattern id="wl-diag" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / zoom})`}><path d="M-1 6 L6 -1" stroke="#8c3a1f" strokeWidth="0.9" /></pattern>
                      <pattern id="wl-dots" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / zoom})`}><circle cx="1.5" cy="1.5" r="0.7" fill="#555a63" /><circle cx="4" cy="4" r="0.7" fill="#555a63" /></pattern>
                      <pattern id="wl-zig" width="8" height="6" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / zoom})`}><path d="M0 3 L2 0 L4 6 L6 0 L8 3" fill="none" stroke="#a38b00" strokeWidth="0.8" /></pattern>
                      <pattern id="wl-wood" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / zoom})`}><path d="M0 0 L6 6 M6 0 L0 6" stroke="#7a5420" strokeWidth="0.7" /></pattern>
                      <pattern id="wl-cross" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform={`scale(${1 / zoom})`}><path d="M0 0 L5 5 M5 0 L0 5" stroke="#42525f" strokeWidth="0.8" /></pattern>
                      <pattern id="grid-minor" width={minor} height={minor} patternUnits="userSpaceOnUse">
                        <path d={`M ${minor} 0 L 0 0 0 ${minor}`} fill="none" stroke="#1e2e1e" strokeWidth={0.5} />
                      </pattern>
                      <pattern id="grid-major" width={major} height={major} patternUnits="userSpaceOnUse">
                        <rect width={major} height={major} fill="url(#grid-minor)" />
                        <path d={`M ${major} 0 L 0 0 0 ${major}`} fill="none" stroke="#2a3a2a" strokeWidth={1} />
                      </pattern>
                    </defs>
                    <rect x={0} y={0} width={gridW} height={gridH} fill="url(#grid-major)" />
                  </g>
                )
              })()}

              {/* Drawn elements — skip phases toggled hidden */}
              {viewHalo && <g style={{ pointerEvents: 'none' }}>{elementsOnActiveSheet(project).filter(el => !hiddenPhases.has(el.phase)).map(renderHalo)}</g>}
              {elementsOnActiveSheet(project).filter(el => !hiddenPhases.has(el.phase)).map(renderElement)}
              {renderWallVisuals(elementsOnActiveSheet(project).filter(el => !hiddenPhases.has(el.phase)))}
              {renderOpenings()}
              {viewTags && renderTags(elementsOnActiveSheet(project).filter(el => !hiddenPhases.has(el.phase)))}

              {/* Electrical points — a coloured dot with its letters; a star marks a special fitting. Drag one in Select mode to move it. */}
              {!hiddenPhases.has('Electrics') && electricPoints.filter(pt => onActiveSheet(pt, project)).map(pt => {
                const g = POINT_BY_ID[pt.typeId]?.group
                const r = 10 / zoom
                const chosen = pt.id === selectedElectricPointId
                return (
                  <g key={pt.id} transform={`translate(${pt.x}, ${pt.y})`}
                    onMouseDown={ev => startElectricPointDrag(ev, pt)}
                    onClick={ev => { if (tool === 'select') ev.stopPropagation() }}
                    style={{ cursor: tool === 'select' ? 'move' : 'inherit' }}>
                    <circle r={r} fill={g ? POINT_GROUP_COLOUR[g] : '#888'} stroke={chosen ? '#fff' : '#111'} strokeWidth={(chosen ? 2.5 : 1) / zoom} opacity={0.95} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={8.5 / zoom} fontWeight={800} fill="#fff" style={{ pointerEvents: 'none' }}>{POINT_SHORT[pt.typeId] ?? '?'}</text>
                    {pt.fitting && <text x={r * 0.9} y={-r * 0.9} fontSize={11 / zoom} fill="#facc15" stroke="#111" strokeWidth={0.6 / zoom} style={{ pointerEvents: 'none' }}>★</text>}
                  </g>
                )
              })}

              {/* Vertex handles — rendered above all elements when an element is selected.
                  Shown in ALL tool modes so the user can immediately adjust a just-drawn
                  element without having to switch to select mode first.
                  Both onMouseDown AND onClick stop propagation so clicks never leak to
                  handleSvgClick (which would add a draw point in line/polygon mode). */}
              {selectedId && (() => {
                const el = project.elements.find(e => e.id === selectedId)
                if (!el || !onActiveSheet(el, project)) return null
                if (hiddenPhases.has(el.phase)) return null   // hide handles when phase is toggled off
                const handles = getElVertexHandles(el)
                const hr  = 5 / zoom    // handle radius — stays constant screen size
                const hsw = 1.5 / zoom  // stroke width
                return handles.map((h, i) => (
                  <circle
                    key={`vh-${el.id}-${i}`}
                    cx={h.x}
                    cy={h.y}
                    r={hr}
                    fill="#fff"
                    stroke={el.color}
                    strokeWidth={hsw}
                    style={{ cursor: tool === 'select' ? 'crosshair' : 'default', pointerEvents: tool === 'select' ? undefined : 'none' }}
                    onMouseDown={ev => {
                      if (tool !== 'select') return   // don't intercept during drawing
                      ev.stopPropagation()
                      const svgRect = svgRef.current!.getBoundingClientRect()
                      const ptX = (ev.clientX - svgRect.left - panOffset.x) / zoom
                      const ptY = (ev.clientY - svgRect.top  - panOffset.y) / zoom
                      dragRef.current = {
                        id: el.id,
                        startSvgX: ptX,
                        startSvgY: ptY,
                        origPoints: [...el.points],
                        vertexIndex: i,
                      }
                      setIsDraggingEl(true)
                    }}
                    onClick={ev => { if (tool === 'select') ev.stopPropagation() }}
                  />
                ))
              })()}

              {/* In-progress ghost */}
              {renderGhost()}

              {/* Calibration ghost */}
              {renderCalibGhost()}

              {/* Measure tool */}
              {renderMeasure()}

              {/* Snap marker */}
              {renderSnapMarker()}

            </g>

            {/* Fixed UI — outside transform group so it stays at screen position */}

            {/* Scale indicator */}
            {(() => {
              const mpp = (project.calibration.mpp || DEFAULT_MPP) / zoom
              const pxPer5m = 5 / mpp
              const barW = Math.min(Math.max(pxPer5m, 30), 150)
              const realM = barW * mpp
              const x = svgSize.w - barW - 20
              const y = svgSize.h - 30
              return (
                <g>
                  <line x1={x} y1={y} x2={x + barW} y2={y} stroke="#4a6a4a" strokeWidth={2} />
                  <line x1={x} y1={y - 4} x2={x} y2={y + 4} stroke="#4a6a4a" strokeWidth={1.5} />
                  <line x1={x + barW} y1={y - 4} x2={x + barW} y2={y + 4} stroke="#4a6a4a" strokeWidth={1.5} />
                  <text x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize={10}
                    fill="#6a8a6a" fontFamily="monospace">{fmtM(realM)}</text>
                </g>
              )
            })()}
          </svg>

          {/* ── Layers panel — top of canvas, only shown when there are drawn elements ── */}
          {(() => {
            const drawnPhases = livePhaseNames.filter(ph => elementsOnActiveSheet(project).some(el => el.phase === ph))
            if (drawnPhases.length === 0) return null
            const hiddenCount = drawnPhases.filter(ph => hiddenPhases.has(ph)).length
            return (
              <LayersPanel
                drawnPhases={drawnPhases}
                hiddenPhases={hiddenPhases}
                phaseColors={PHASE_COLORS}
                onToggle={togglePhaseVisibility}
                onShowAll={() => setHiddenPhases(new Set())}
                onHideAll={() => setHiddenPhases(new Set(drawnPhases))}
                darkMode={darkMode}
                hiddenCount={hiddenCount}
              />
            )
          })()}

          {/* Calibration overlay hint */}
          {calibDrawing && !showCalib && (
            <div style={{
              position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--to-panel)', border: '2px solid var(--to-active-bd)', borderRadius: 8,
              padding: '10px 20px', color: 'var(--to-text)', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 12, zIndex: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            }}>
              <span style={{ fontSize: 18 }}>📏</span>
              <span>
                {calibPts.length === 0
                  ? 'Click the START of a known dimension on the plan'
                  : 'Click the END of the known dimension'}
              </span>
              <span style={{ fontSize: 12, color: 'var(--to-muted)', marginLeft: 4 }}>
                ({calibPts.length}/2 points)
              </span>
              <button
                onClick={() => { setCalibDrawing(false); setCalibPts([]) }}
                style={{ background: 'none', border: '1px solid var(--to-btn-bd)', borderRadius: 4,
                  color: 'var(--to-muted)', fontSize: 11, cursor: 'pointer', padding: '2px 8px', marginLeft: 4 }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Status bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 22,
            background: 'var(--to-panel)', borderTop: '1px solid var(--to-border)',
            display: 'flex', alignItems: 'center', padding: '0 10px', gap: 16,
            fontSize: 11, color: 'var(--to-muted)',
          }}>
            <span>Tool: <strong style={{ color: tool === 'floor' ? '#f39c12' : 'var(--to-text)' }}>{
              calibDrawing ? '📏 CALIBRATING' :
              tool === 'select' ? 'Select' :
              tool === 'line' ? 'Line / Polyline (dbl-click to finish)' :
              tool === 'rect' ? 'Rectangle (click start, click finish)' :
              tool === 'measure' ? 'Measure (click along the route, dbl-click to finish: nothing is saved)' :
              tool === 'click' ? 'Click to place an item' :
              tool === 'electric' ? 'Place electrical points' :
              tool === 'opening' ? 'Place windows and doors (click a wall)' :
              tool === 'floor' ? `⬛ Floor — ${FLOOR_MAKEUPS.find(m => m.id === activeFloorMakeup)?.name} (${floorDrawMode === 'rect' ? 'click two corners' : 'click points, dbl-click to close'})` :
              'Polygon (dbl-click to close)'
            }</strong></span>
            <span>Phase: <strong style={{ color: PHASE_COLORS[activePhase] }}>{activePhase}</strong></span>
            <span>Scale: <strong style={{ color: 'var(--to-text)' }}>{project.calibration.label || '—'}</strong></span>
            <span>Zoom: <strong style={{ color: 'var(--to-text)' }}>{Math.round(zoom * 100)}%</strong></span>
            <span style={{ color: 'var(--to-dim)' }}>Scroll to zoom · Space+drag or middle-mouse to pan</span>
            <span>x: {Math.round(mousePos.x)}, y: {Math.round(mousePos.y)}</span>
            {selectedId && <span style={{ color: '#f1c40f' }}>Selected — press Delete to remove</span>}
            {isDrawing && drawPoints.length > 0 && (
              <span style={{ color: 'var(--to-text)' }}>
                {drawPoints.length} point{drawPoints.length !== 1 ? 's' : ''}
                {tool !== 'rect' ? ' — dbl-click to finish' : ' — click to finish'}
              </span>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{
          width: 300, background: 'var(--to-panel)', borderLeft: '1px solid var(--to-border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--to-border)', flexShrink: 0 }}>
            {(['schedule', 'properties'] as PanelMode[]).map(m => (
              <button
                key={m}
                onClick={() => setPanelMode(m)}
                style={{
                  flex: 1, padding: '9px 0', background: panelMode === m ? 'var(--to-hover)' : 'transparent',
                  border: 'none', borderBottom: panelMode === m ? '2px solid var(--to-active-bd)' : '2px solid transparent',
                  color: panelMode === m ? 'var(--to-text)' : 'var(--to-muted)', fontSize: 12, cursor: 'pointer',
                  fontFamily: 'inherit', fontWeight: panelMode === m ? 700 : 400,
                }}
              >
                {m === 'schedule' ? `📋 Schedule (${project.items.length})` : '✏️ Properties'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {panelMode === 'schedule' ? renderSchedule() : renderProperties()}
          </div>
        </div>
      </div>

      {/* ── Calibration dialog ─────────────────────────────────────────────── */}
      {showCalib && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--to-scrim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--to-panel)', border: '1px solid var(--to-border)', borderRadius: 10,
            padding: 28, width: 420, maxWidth: '90vw',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            <h3 style={{ margin: '0 0 16px', color: 'var(--to-text)' }}>📏 Scale Calibration</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Quick Presets</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {SCALE_DENOMS.map(d => (
                  <button key={d} style={{ ...btnStyle, fontSize: 11 }}
                    onClick={() => {
                      setShowCalib(false)
                      applyScaleDenom(d)
                    }}>
                    {scaleLabel(d)}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--to-border)', paddingTop: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--to-link)', marginBottom: 12 }}>
                Or draw a line over a known dimension on the plan, then enter its real-world length:
              </p>

              <button
                style={{ ...btnStyle, background: '#2b5a2b', borderColor: '#4a8a4a', marginBottom: 12 }}
                onClick={() => {
                  hasPannedRef.current = false   // clear any stale pan flag before calibrating
                  setIsPanning(false)
                  setCalibDrawing(true)
                  setCalibPts([])
                  setShowCalib(false)   // close dialog so canvas is accessible
                }}
              >
                ✏️ Draw calibration line on plan
              </button>

              {calibPts.length === 2 && (
                <div style={{ fontSize: 13, color: '#4a8a4a', marginBottom: 8, fontWeight: 600 }}>
                  ✓ Line drawn — {Math.round(Math.sqrt(
                    Math.pow(calibPts[1].x - calibPts[0].x, 2) +
                    Math.pow(calibPts[1].y - calibPts[0].y, 2)
                  ))} canvas pixels. Now enter the real-world length below.
                </div>
              )}
              {calibPts.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--to-muted)', marginBottom: 8 }}>
                  No line drawn yet — click the button above, then click 2 points on the plan.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Real length (metres)</label>
                  <NumInput type="number" style={inputStyle} placeholder="e.g. 5.0"
                    value={calibReal} onChange={e => setCalibReal(e.target.value)} />
                </div>
                <div>
                  <label style={labelStyle}>Label (optional)</label>
                  <input style={inputStyle} placeholder="e.g. 1:100"
                    value={calibLabel} onChange={e => setCalibLabel(e.target.value)} />
                </div>
              </div>

              <button style={{ ...btnStyle, background: '#2b5a2b', borderColor: '#4a8a4a' }}
                onClick={applyCalibration} disabled={calibPts.length < 2 || !calibReal}>
                Apply
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button style={btnStyle} onClick={() => { setShowCalib(false); setCalibDrawing(false); setCalibPts([]) }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clear Drawings confirmation modal ───────────────────────────────── */}
      {showClearModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--to-scrim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div style={{
            background: 'var(--to-panel)', border: '1px solid var(--to-border)',
            borderRadius: 12, padding: 28, width: 420, maxWidth: '92vw',
            boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>🗑️</div>
            <h3 style={{ margin: '0 0 10px', color: 'var(--to-text)', textAlign: 'center', fontSize: 17 }}>
              Clear all traced drawings?
            </h3>
            <p style={{ margin: '0 0 20px', color: 'var(--to-muted)', fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
              This will remove all drawings and measurements, but your quote, scope of works, phases, tasks and pricing will remain.
            </p>
            <div style={{
              background: darkMode ? '#1a2a1a' : '#f0fdf4',
              border: `1px solid ${darkMode ? '#2d5a2d' : '#86efac'}`,
              borderRadius: 6, padding: '8px 12px', marginBottom: 20, fontSize: 12, color: darkMode ? '#86efac' : '#166534',
            }}>
              💾 A recovery snapshot will be saved before clearing.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowClearModal(false)}
                style={{
                  flex: 1, padding: '10px', border: '1px solid var(--to-border)', borderRadius: 7,
                  background: 'var(--to-alt)', color: 'var(--to-text)', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={clearDrawings}
                disabled={resetInProgress}
                style={{
                  flex: 1, padding: '10px', border: 'none', borderRadius: 7,
                  background: '#d97706', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700,
                  opacity: resetInProgress ? 0.5 : 1,
                }}
              >
                Clear Drawings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Paper size: the scale presets work out real distances from it ──────────────────────────────── */}
      {showPaperModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--to-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
          onClick={() => { setShowPaperModal(false); setPendingDenom(null) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--to-panel)', border: '1px solid var(--to-border)', borderRadius: 12, padding: 22, width: 420, maxWidth: '94vw', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <h3 style={{ margin: '0 0 6px', color: 'var(--to-text)', fontSize: 17 }}>📄 What paper is this plan?</h3>
            <p style={{ margin: '0 0 14px', color: 'var(--to-muted)', fontSize: 12, lineHeight: 1.5 }}>
              A plan printed at {pendingDenom ? scaleLabel(pendingDenom) : 'a scale such as 1:100'} is only the right size on the right paper: 1mm on an A1 sheet is not the same distance as 1mm on an A3. Pick the sheet size it was drawn for, and the picture is taken as the whole sheet.
              Scanned or cropped plans may not match: check a known length with the Measure tool, or use Calibrate.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PAPER_SIZES.map(ps => (
                <button key={ps.name} onClick={() => choosePaper(ps.name)} style={{ ...btnStyle, fontWeight: 700, padding: '8px 16px', background: paperInfoForActiveSheet()?.paper === ps.name ? 'rgba(122,181,51,0.25)' : undefined }}>
                  {ps.name}<span style={{ fontWeight: 400, fontSize: 10, marginLeft: 6, color: 'var(--to-muted)' }}>{ps.longMm}×{ps.shortMm}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 14, textAlign: 'right' }}>
              <button onClick={() => { setShowPaperModal(false); setPendingDenom(null) }} style={btnStyle}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── My Take-offs: open a saved take-off, or start a new one ─────────────────────────────────────── */}
      {showTakeoffList && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--to-scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
          onClick={() => { if (!takeoffBusy) setShowTakeoffList(false) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--to-panel)', border: '1px solid var(--to-border)', borderRadius: 12, padding: 22, width: 640, maxWidth: '94vw', maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <h3 style={{ margin: 0, color: 'var(--to-text)', fontSize: 17, flex: 1 }}>📁 My Take-offs</h3>
              <button onClick={() => setShowTakeoffList(false)} disabled={takeoffBusy} style={{ ...btnStyle, padding: '4px 10px' }}>Close</button>
            </div>
            <p style={{ margin: '0 0 12px', color: 'var(--to-muted)', fontSize: 12, lineHeight: 1.5 }}>
              Each take-off is saved to your account as you work, plan pictures included. Open one on any computer to carry on where you left off.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={newTakeoffName} onChange={e => setNewTakeoffName(e.target.value)} placeholder="Name for a new take-off, e.g. 14 Elm Road rear extension"
                onKeyDown={e => { if (e.key === 'Enter') startNewTakeoffFromList() }} style={{ ...inputStyle, flex: 1, height: 32 }} />
              <button onClick={startNewTakeoffFromList} disabled={takeoffBusy} style={{ ...btnStyle, background: '#2563eb', color: '#fff', borderColor: '#1d4ed8', fontWeight: 600 }}>+ New take-off</button>
            </div>

            {takeoffListError && <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px', marginBottom: 10 }}>{takeoffListError}</div>}

            <div style={{ overflowY: 'auto', flex: 1, minHeight: 80 }}>
              {takeoffList === null && !takeoffListError && <div style={{ color: 'var(--to-muted)', fontSize: 13, padding: 16, textAlign: 'center' }}>⏳ Loading your take-offs…</div>}
              {takeoffList && takeoffList.length === 0 && <div style={{ color: 'var(--to-muted)', fontSize: 13, padding: 16, textAlign: 'center' }}>Nothing saved yet. Your take-offs appear here as you work.</div>}
              {takeoffList?.map(t => {
                const current = t.id === project.id
                return (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, borderRadius: 8, border: '1px solid ' + (current ? '#7ab533' : 'var(--to-border)'), background: current ? 'rgba(122,181,51,0.10)' : 'var(--to-alt)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--to-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}{current && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#7ab533', textTransform: 'uppercase' }}>open now</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--to-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[t.clientName, t.address, t.jobType].filter(Boolean).join(' · ') || 'No customer or address yet'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--to-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Changed {new Date(t.updatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {t.sheetNames.length > 0 && <> · {t.sheetNames.length} sheet{t.sheetNames.length === 1 ? '' : 's'}: {t.sheetNames.join(', ')}</>}
                      </div>
                    </div>
                    <button onClick={() => openSavedTakeoff(t.id)} disabled={takeoffBusy} style={{ ...btnStyle, background: current ? 'transparent' : '#2563eb', color: current ? 'var(--to-text)' : '#fff', borderColor: current ? 'var(--to-border)' : '#1d4ed8', fontWeight: 600 }}>{current ? 'Keep working' : 'Open'}</button>
                    <button onClick={() => deleteSavedTakeoff(t)} disabled={takeoffBusy} title="Delete this take-off" style={{ ...btnStyle, color: '#e74c3c', borderColor: '#5a1a1a', padding: '6px 9px' }}>🗑</button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Takeoff confirmation modal ─────────────────────────────────── */}
      {showResetModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--to-scrim)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div style={{
            background: 'var(--to-panel)', border: '1px solid #5a1a1a',
            borderRadius: 12, padding: 28, width: 460, maxWidth: '92vw',
            boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12, textAlign: 'center' }}>⚠️</div>
            <h3 style={{ margin: '0 0 10px', color: '#e74c3c', textAlign: 'center', fontSize: 17 }}>
              Reset entire takeoff?
            </h3>
            <p style={{ margin: '0 0 16px', color: 'var(--to-muted)', fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
              This will remove all drawings, measurements, quantities, quote links, scope items, AI-generated data and schedules connected to this takeoff.
            </p>
            <p style={{ margin: '0 0 20px', color: 'var(--to-muted)', fontSize: 13, lineHeight: 1.6, textAlign: 'center' }}>
              A recovery snapshot will be created before the reset.
            </p>
            <div style={{
              background: darkMode ? '#1a2a1a' : '#f0fdf4',
              border: `1px solid ${darkMode ? '#2d5a2d' : '#86efac'}`,
              borderRadius: 6, padding: '8px 12px', marginBottom: 20, fontSize: 12, color: darkMode ? '#86efac' : '#166534',
            }}>
              💾 Recovery snapshot saved automatically. Project name, address and calibration are preserved.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowResetModal(false)}
                style={{
                  flex: 1, padding: '10px', border: '1px solid var(--to-border)', borderRadius: 7,
                  background: 'var(--to-alt)', color: 'var(--to-text)', fontSize: 13, cursor: 'pointer', fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={resetTakeoff}
                disabled={resetInProgress}
                style={{
                  flex: 1, padding: '10px', border: 'none', borderRadius: 7,
                  background: '#c0392b', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700,
                  opacity: resetInProgress ? 0.5 : 1,
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Construction Layer Editor modal ───────────────────────────────── */}
      {layerModal && (() => {
        const { layer, makeup, item: lmItem, area, perim, accent } = layerModal
        const { qty: cq, unit: cu } = calcLayerQty(
          layer, area, perim,
          (lmItem.floorLayerThicknesses ?? {})[layer.id] || undefined,
        )
        return (
          <ConstructionLayerModal
            layer={layer}
            makeup={makeup}
            item={lmItem}
            calcQty={cq}
            calcUnit={cu}
            darkMode={darkMode}
            accentColor={accent}
            labourTrades={labourTrades}
            onSaveToTakeoff={(costs, toggleEnabled, thicknessMm) => {
              const updItem: typeof lmItem = {
                ...lmItem,
                layerCosts: { ...(lmItem.layerCosts ?? {}), [layer.id]: costs },
                ...(toggleEnabled  !== undefined && { floorLayerToggles:     { ...(lmItem.floorLayerToggles     ?? {}), [layer.id]: toggleEnabled  } }),
                ...(thicknessMm    !== undefined && { floorLayerThicknesses:  { ...(lmItem.floorLayerThicknesses  ?? {}), [layer.id]: thicknessMm    } }),
              }
              saveItemEdit(updItem)
              // keep modal open, update its reference item
              setLayerModal(m => m ? { ...m, item: updItem } : m)
            }}
            onSaveToBO={async (costs) => {
              if (!userId) throw new Error('Not signed in')
              await saveLayerCostToBackOffice(userId, lmItem, layer, makeup, costs)
            }}
            onClose={() => setLayerModal(null)}
          />
        )
      })()}

      {/* ── Adding a plan: from this computer or from a customer's files ───── */}
      {planChooserOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={e => { if (e.target === e.currentTarget) { setPlanChooserOpen(false); setBlankForm(null) } }}>
          <div style={{ background: 'var(--to-panel, #fff)', color: 'var(--to-text, #1e293b)', border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 10, width: 'min(420px, 92vw)', padding: 18, boxShadow: '0 12px 48px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>{project.sheets?.length ? 'Add a plan' : 'Load a plan'}</div>
              <button onClick={() => setPlanChooserOpen(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'inherit', lineHeight: 1 }} aria-label="Close">×</button>
            </div>
            <button onClick={() => { setPlanChooserOpen(false); fileInputRef.current?.click() }} style={{ ...btnStyle, display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', marginBottom: 8, fontSize: 13 }}>
              💻 From this computer<div style={{ fontSize: 11, opacity: 0.7, fontWeight: 400, marginTop: 2 }}>A picture or PDF from your own folders</div>
            </button>
            <button onClick={() => { setPlanChooserOpen(false); setFilePickerOpen(true) }} style={{ ...btnStyle, display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', fontSize: 13 }}>
              📁 From a customer's files<div style={{ fontSize: 11, opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Files on their contact card, quotes and jobs</div>
            </button>
            <button onClick={() => setBlankForm(f => f ?? { paper: 'A1', denom: 50, name: '' })} style={{ ...btnStyle, display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', marginTop: 8, fontSize: 13, ...(blankForm ? { borderColor: 'var(--to-active-bd)' } : {}) }}>
              ⬜ A blank sheet<div style={{ fontSize: 11, opacity: 0.7, fontWeight: 400, marginTop: 2 }}>Draw a plan from scratch at a scale you choose, with no picture behind it</div>
            </button>
            {blankForm && (() => {
              const paper = PAPER_SIZES.find(x => x.name === blankForm.paper)
              const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 7px', background: 'var(--to-bg, #fff)', color: 'inherit', border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 5, fontFamily: 'inherit' }
              return (
                <div style={{ marginTop: 10, padding: 12, border: '1px solid var(--to-border, #e2e8f0)', borderRadius: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label style={{ fontSize: 11 }}>Paper<select value={blankForm.paper} onChange={e => setBlankForm({ ...blankForm, paper: e.target.value })} style={fieldStyle}>{PAPER_SIZES.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
                    <label style={{ fontSize: 11 }}>Scale<select value={blankForm.denom} onChange={e => setBlankForm({ ...blankForm, denom: +e.target.value })} style={fieldStyle}>{SCALE_DENOMS.map(d => <option key={d} value={d}>{scaleLabel(d)}</option>)}</select></label>
                  </div>
                  <label style={{ fontSize: 11, display: 'block', marginTop: 8 }}>Name (optional)<input value={blankForm.name} onChange={e => setBlankForm({ ...blankForm, name: e.target.value })} placeholder="e.g. Ground floor" style={fieldStyle} /></label>
                  {paper && <div style={{ fontSize: 11, opacity: 0.75, marginTop: 8 }}>A {paper.name} sheet at {scaleLabel(blankForm.denom)} covers {(paper.longMm * blankForm.denom / 1000).toFixed(1)} × {(paper.shortMm * blankForm.denom / 1000).toFixed(1)} m of building. The scale is set for you, so what you draw measures right straight away.</div>}
                  <button onClick={() => createBlankSheet(blankForm)} style={{ ...btnStyle, width: '100%', justifyContent: 'center', marginTop: 10, background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontWeight: 700 }}>Make the blank sheet</button>
                </div>
              )
            })()}
          </div>
        </div>
      )}
      <ClientFilePicker open={filePickerOpen} onClose={() => setFilePickerOpen(false)} takeoffClient={{ id: project.clientId, name: project.client?.name }}
        onPick={file => { setFilePickerOpen(false); loadPlanFile(file) }} />

      {/* ── Client / Project modal ─────────────────────────────────────────── */}
      <ClientProjectModal
        open={showClientModal}
        onClose={() => setShowClientModal(false)}
        project={project}
        onSave={updated => { setProject(prev => ({ ...prev, ...updated })) }}
        userId={userId ?? ''}
      />

      {/* ── Toast notification ─────────────────────────────────────────────── */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          background: darkMode ? '#1e3a1e' : '#2d6a2d',
          color: '#c8f0a8', border: '1px solid #4a8a4a',
          borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          zIndex: 2000, whiteSpace: 'nowrap',
          animation: 'fadeIn 0.15s ease',
          pointerEvents: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
