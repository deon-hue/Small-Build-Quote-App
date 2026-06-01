'use client'

import { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { makeDebouncedSave, loadTakeoffFromSupabase } from '@/lib/takeoff-sync'
import { fetchWallTypesWithLayers, wallTypesToMakeups, fetchLabourTrades } from '@/lib/back-office-queries'
import type { BOLabourTrade } from '@/lib/back-office-types'
import LabourCostBuilder from './components/LabourCostBuilder'
import ClientProjectModal from './components/ClientProjectModal'
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
  calcDemoSellingPrice, DEMO_UNIT_LABELS, DEMO_UNITS,
  type DemoSubphase, type DemoTask, type DemoUnit,
} from '@/lib/demolition-data'
import {
  ALL_PHASE_SUBPHASES, getAllSubphasesForPhase, getTasksForSubphase,
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
export const PHASE_DEFAULT_TOOL: Record<string, DrawingTool> = {
  'Site Setup & Demolition':     'line',
  'Foundations':                  'line',
  'Structural Frame':             'line',
  'External Walls':               'line',
  'Roof':                         'polygon',
  'Windows & Doors':              'rect',
  'Internal Walls & Partitions':  'line',
  'Floors & Screeds':             'polygon',
  'Drainage & Services':          'line',
  'Electrics':                    'line',
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
  'Site Setup & Demolition':     'Linear / Area',
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
    id: uid(),
    name: 'New Take-off',
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

// ── Recalculate all element-linked item quantities for a new mpp ──────────────
function recalcItemsForMpp(
  items: TakeoffItem[],
  elements: DrawnElement[],
  mpp: number,
): TakeoffItem[] {
  return items.map(item => {
    if (!item.elementId) return item               // manual items: leave untouched
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
        const openingsArea = (item.openings ?? []).reduce((s, o) => s + o.width * o.height, 0)
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
        const openingsArea = (item.openings ?? []).reduce((s, o) => s + o.width * o.height, 0)
        qty = +(Math.max(0, area - openingsArea)).toFixed(3)
      } else {
        qty = area
      }
    } else if (el.type === 'polygon') {
      area = polygonArea(el.points, mpp)
      // Wall items: preserve opening deductions
      if (item.phase === 'External Walls') {
        const openingsArea = (item.openings ?? []).reduce((s, o) => s + o.width * o.height, 0)
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
                     .replace('Site Setup & Demolition', 'Demolition')
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

  // Calibration dialog
  const [showCalib, setShowCalib] = useState(false)
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

  // Custom demolition subphases (loaded from localStorage on mount)
  const [customDemoSubphases, setCustomDemoSubphases] = useState<DemoSubphase[]>([])
  useEffect(() => { setCustomDemoSubphases(loadCustomDemoSubphases()) }, [])

  // Refs
  const svgRef = useRef<SVGSVGElement>(null)
  const queuedFinishRef = useRef<DrawnElement | null>(null)
  const queuedFloorMakeupRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importJsonRef = useRef<HTMLInputElement>(null)

  // PDF state
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null)
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)
  const [pdfTotalPages, setPdfTotalPages] = useState(0)
  const [pdfLoading, setPdfLoading] = useState(false)

  // Zoom / pan state
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [canvasImgSize, setCanvasImgSize] = useState<{ w: number; h: number } | null>(null)
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const hasPannedRef = useRef(false)

  // When the plan image is restored from localStorage on mount, measure its
  // dimensions so the canvas fits correctly (same as after a fresh upload).
  useEffect(() => {
    const saved = loadProject()
    if (!saved?.planImageUrl) return
    const img = new Image()
    img.onload = () => {
      setCanvasImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = saved.planImageUrl
  }, []) // run once on mount

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
    if (planImage) p.planImageUrl = planImage
    // Tier 3 — synchronous write to localStorage (immediate cache + recovery)
    saveProject(p)
    // Tier 3 — debounced async write to Supabase (system of record)
    if (userId) {
      const sb = createClient()
      debouncedSaveRef.current(sb, p, userId)
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

    const item = itemFromElement(el, project.calibration.mpp)

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
  })

  // ── Keep editingItem in sync when project.items is recalculated ──────────────
  useEffect(() => {
    if (!editingItem) return
    const fresh = project.items.find(it => it.id === editingItem.id)
    if (fresh && fresh !== editingItem) setEditingItem(fresh)
  }, [project.items]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── SVG container resize ───────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null)
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
    // Element / vertex drag takes priority over everything
    if (dragRef.current) {
      const pt = svgCoords(e)
      const dx = pt.x - dragRef.current.startSvgX
      const dy = pt.y - dragRef.current.startSvgY
      const id = dragRef.current.id
      const orig = dragRef.current.origPoints
      const vi = dragRef.current.vertexIndex
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
    setMousePos(svgCoords(e))
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
    if (dragRef.current) {
      // Mark as "panned" so handleSvgClick ignores the synthetic click that fires
      // after mouseup. When mousedown is on the vertex circle and mouseup lands on
      // the SVG background, the browser fires a click on the SVG (lowest common
      // ancestor), bypassing the circle's onClick stopPropagation. Without this,
      // that click would add a draw point in line/polygon mode.
      hasPannedRef.current = true
      dragRef.current = null
      setIsDraggingEl(false)
      // Recalculate measurements after move
      setProject(p => ({ ...p, items: recalcItemsForMpp(p.items, p.elements, p.calibration.mpp) }))
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
      const pt = svgCoords(e)
      setCalibPts(prev => {
        const next = [...prev, pt]
        // After 2nd point, auto-reopen the dialog so user can enter the real length
        if (next.length >= 2) setShowCalib(true)
        return next.slice(0, 2)
      })
      return
    }
    if (tool === 'select') return
    const pt = svgCoords(e)

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
    const el: DrawnElement = { id: uid(), type, points: pts, phase, label, color }
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

  // ── Select element ─────────────────────────────────────────────────────────
  function selectElement(el: DrawnElement) {
    if (tool !== 'select') return
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
    setProject(p => ({
      ...p,
      items: p.items.map(it => it.id === item.id ? item : it),
    }))
    setEditingItem(item)
  }

  // ── Manual add item ────────────────────────────────────────────────────────
  function addManualItem() {
    const item: TakeoffItem = {
      id: uid(),
      name: 'New Item',
      phase: activePhase,
      qty: 1,
      unit: 'nr',
    }
    setProject(p => ({ ...p, items: [...p.items, item] }))
    setEditingItem(item)
    setEditingElement(null)
    setPanelMode('properties')
  }

  // ── Render a PDF page to planImage ────────────────────────────────────────
  async function renderPdfPage(pageNum: number) {
    if (!pdfDocRef.current) return
    setPdfLoading(true)
    try {
      const page = await pdfDocRef.current.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2.0 })
      const canvas = document.createElement('canvas')
      canvas.width  = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await page.render({ canvasContext: ctx, viewport }).promise
      setPlanImage(canvas.toDataURL('image/png'))
      setCanvasImgSize({ w: viewport.width, h: viewport.height })
      fitToScreen(viewport.width, viewport.height)
      setPdfCurrentPage(pageNum)
    } finally {
      setPdfLoading(false)
    }
  }

  // ── Load plan image (image or PDF) ─────────────────────────────────────────
  async function handleImageLoad(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      setPdfLoading(true)
      try {
        // Dynamic import avoids SSR issues and keeps the bundle lean
        const pdfjsLib = await import('pdfjs-dist')
        // Use CDN worker — avoids Next.js bundling complexity
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        pdfDocRef.current = pdf
        setPdfTotalPages(pdf.numPages)
        setPdfCurrentPage(1)
        await renderPdfPage(1)
      } catch (err) {
        console.error('PDF load error:', err)
        alert('Could not load PDF. Make sure it is a valid PDF file.')
      } finally {
        setPdfLoading(false)
      }
      return
    }

    // Regular image
    pdfDocRef.current = null
    setPdfTotalPages(0)
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setPlanImage(dataUrl)
      // Get natural dimensions then fit to screen
      const img = new Image()
      img.onload = () => {
        setCanvasImgSize({ w: img.naturalWidth, h: img.naturalHeight })
        fitToScreen(img.naturalWidth, img.naturalHeight)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
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
          id: data.id ?? uid(),
          name: data.name ?? 'Imported Take-off',
          address: data.address ?? '',
          jobType: data.jobType ?? '',
          calibration: data.calibration ?? { mpp: DEFAULT_MPP, label: '1:100' },
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
      planImageUrl: planImage ?? undefined,
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
    const unlinkedItems = project.items.filter(it => !it.elementId)
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
  }

  /** Return cursor to selection mode without changing the active phase */
  function resetDrawMode() {
    setTool('select')
    setDrawPoints([])
    setIsDrawing(false)
    showToast('Draw mode reset to Selection.')
  }

  // ── New project ────────────────────────────────────────────────────────────
  function handleNew() {
    if (!confirm('Start a new take-off? Unsaved changes will be lost.')) return
    const p = blankProject()
    setProject(p)
    setPlanImage(null)
    setDrawPoints([])
    setIsDrawing(false)
    setSelectedId(null)
    setEditingElement(null)
    setEditingItem(null)
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
    const updatedItems = recalcItemsForMpp(project.items, project.elements, mpp)
    const n = updatedItems.filter(it => !!it.elementId).length
    setProject(p => ({
      ...p,
      calibration: { mpp, label: lbl },
      items: recalcItemsForMpp(p.items, p.elements, mpp),
    }))
    showToast(`Calibration applied (${lbl}) — ${n} item${n !== 1 ? 's' : ''} recalculated ✓`)
    setShowCalib(false)
    setCalibDrawing(false)
    setCalibPts([])
  }

  // ── Phase summary for schedule panel ──────────────────────────────────────
  const phaseGroups = TAKEOFF_PHASES.map(ph => ({
    phase: ph,
    items: project.items.filter(it => it.phase === ph),
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
    const { planImageUrl: _, ...rest } = project
    const data = { version: 1, ...rest }
    sessionStorage.setItem('sbc_takeoff_for_quote', JSON.stringify(data))
    router.push('/new-quote')
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        setSpaceHeld(true)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        deleteSelected()
      }
      if (e.key === 'Escape') {
        setDrawPoints([])
        setIsDrawing(false)
        if (calibDrawing) { setCalibDrawing(false); setCalibPts([]) }
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') { setSpaceHeld(false); setIsPanning(false) }
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

  function renderElement(el: DrawnElement) {
    const sel = selectedId === el.id
    const isWall = el.phase === 'External Walls'
    const stroke = sel ? '#fff' : el.color
    const sw = sel ? 3 : 2
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
        <g key={el.id} onClick={() => selectElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polygon points={bodyPts} fill={fillC} stroke="none" />
          <polyline points={outerPts} fill="none" stroke={faceC} strokeWidth={sel ? 2.5 : 2} strokeLinecap="square" strokeLinejoin="miter" />
          <polyline points={innerPts} fill="none" stroke={faceC} strokeWidth={sel ? 2.5 : 2} strokeLinecap="square" strokeLinejoin="miter" />
          <polyline points={centrePts} fill="none" stroke={caviC} strokeWidth={0.8} strokeDasharray="5 4" strokeOpacity={sel ? 0.7 : 0.4} />
          {sel && <polygon points={bodyPts} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="5 3" />}
          <text x={mid.x} y={mid.y - (halfW + 5)} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : WALL_LINE_COLOR} fontFamily="monospace" fontWeight={700}>
            {el.label}
          </text>
          <text x={mid.x} y={mid.y + (halfW + 13)} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
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
        <g key={el.id} onClick={() => selectElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <rect x={x} y={y} width={w} height={h} fill={WALL_FILL_COLOR + '20'} stroke={wallStroke} strokeWidth={wallSw} />
          {sel && <rect x={x} y={y} width={w} height={h} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="5 3" />}
          <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : WALL_LINE_COLOR} fontFamily="monospace" fontWeight={700}>
            {el.label}
          </text>
          <text x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
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
        <g key={el.id} onClick={() => selectElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polygon points={pts} fill={WALL_FILL_COLOR + '20'} stroke={wallStroke} strokeWidth={wallSw} strokeLinejoin="miter" />
          {sel && <polygon points={pts} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="5 3" />}
          <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : WALL_LINE_COLOR} fontFamily="monospace" fontWeight={700}>
            {el.label}
          </text>
          <text x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
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
        <g key={el.id} onClick={() => selectElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polyline points={pts} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
          {sel && <polyline points={pts} fill="none" stroke="#fff" strokeWidth={1} strokeOpacity={0.4} strokeDasharray="4 3" />}
          <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : el.color} fontFamily="monospace" fontWeight={600}>
            {el.label}
          </text>
          <text x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmtM(polylineLength(el.points, project.calibration.mpp))}
          </text>
        </g>
      )
    }

    if (el.type === 'rect') {
      const { x, y, width: w, height: h } = rectAttrs(el.points)
      return (
        <g key={el.id} onClick={() => selectElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={sw} />
          <text x={x + w / 2} y={y + h / 2 - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : el.color} fontFamily="monospace" fontWeight={600}>
            {el.label}
          </text>
          <text x={x + w / 2} y={y + h / 2 + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmt2(rectArea(el.points, project.calibration.mpp))} m²
          </text>
        </g>
      )
    }

    if (el.type === 'polygon') {
      const pts = el.points.map(p => `${p.x},${p.y}`).join(' ')
      const mid = centroid(el.points)
      return (
        <g key={el.id} onClick={() => selectElement(el)} onMouseDown={onElMouseDown} style={{ cursor: elCursor, pointerEvents: elPointerEvents }}>
          <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
          <text x={mid.x} y={mid.y - 6} textAnchor="middle" fontSize={11} fill={sel ? '#fff' : el.color} fontFamily="monospace" fontWeight={600}>
            {el.label}
          </text>
          <text x={mid.x} y={mid.y + 8} textAnchor="middle" fontSize={10} fill={sel ? '#ccc' : '#999'} fontFamily="monospace">
            {fmt2(polygonArea(el.points, project.calibration.mpp))} m²
          </text>
        </g>
      )
    }
    return null
  }

  // ── Render: in-progress drawing ghost ─────────────────────────────────────
  function renderGhost() {
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
    return <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 3" strokeLinecap="round" />
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
    const openingsArea = +openings.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
    const netArea      = +(Math.max(0, grossArea - openingsArea)).toFixed(3)
    const finishArea   = +(netArea * finishSidesVal).toFixed(3)
    const totals       = sumByCategory(mats)

    function recalcAndSave(patch: Partial<TakeoffItem>) {
      const merged   = { ...item, ...patch }
      const h        = merged.wallHeight    ?? wallHeight
      const sides    = (merged.finishSides  ?? finishSidesVal) as 1 | 2
      const ops      = merged.openings      ?? openings
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
            <input type="number" step={0.05} min={0.1} max={10}
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
                  <input type="number" step={0.05} min={0.1} style={{ ...inputStyle, fontSize: 11 }}
                    value={op.width} onChange={e => updateOpening(op.id, { width: Math.max(0.1, +e.target.value || 0.9) })} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 9 }}>Height (m)</label>
                  <input type="number" step={0.05} min={0.1} style={{ ...inputStyle, fontSize: 11 }}
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
                <input type="number" step="any" min={0}
                  style={{ width: '100%', background: darkMode ? '#162216' : '#f0f4f0', border: `1px solid ${darkMode ? '#2a3a2a' : '#c8d8c8'}`, borderRadius: 3, color: m.isOverridden ? '#e67e22' : (darkMode ? '#c8d8a8' : '#2b3a2b'), fontSize: 10, padding: '2px 3px', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                  value={m.qty}
                  onChange={e => updateMaterial(m.id, { qty: Math.max(0, +e.target.value || 0) })}
                />
                <input type="number" step="any" min={0}
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

  // ── External Wall properties panel ───────────────────────────────────────────
  function renderWallProperties(item: TakeoffItem) {
    const allWallTypes: FloorMakeup[] = allWallMakeups
    const makeup = allWallTypes.find(m => m.id === item.floorMakeupId)
    const accentColor = '#16a085'   // External Walls teal
    const linkEl = item.elementId ? project.elements.find(e => e.id === item.elementId) : null
    const isLineBased = linkEl?.type === 'line'

    // Measurements
    const wallLength = item.length ?? 0
    const wallHeight = item.wallHeight ?? 2.7
    const grossArea  = isLineBased
      ? +(wallLength * wallHeight).toFixed(3)
      : (item.area ?? item.qty ?? 0)
    const openings      = item.openings ?? []
    const openingsArea  = +openings.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
    const netArea       = +(Math.max(0, grossArea - openingsArea)).toFixed(3)

    // Perimeter for layer calcs: wall run (for DPC etc.)
    const wallPerimeter = isLineBased
      ? wallLength
      : (linkEl?.type === 'rect' && linkEl.points.length >= 2
          ? rectPerimeter(linkEl.points, project.calibration.mpp)
          : linkEl?.type === 'polygon' && linkEl.points.length >= 3
            ? polyPerimeter(linkEl.points, project.calibration.mpp)
            : 0)

    const toggles    = item.floorLayerToggles    ?? {}
    const thicknesses = item.floorLayerThicknesses ?? {}

    // Opening helpers
    function addOpening(type: WallOpeningType) {
      const def = WALL_OPENING_DEFAULTS[type]
      const newOpening: WallOpening = {
        id: Math.random().toString(36).slice(2, 8),
        type, label: WALL_OPENING_LABELS[type],
        width: def.width, height: def.height,
      }
      const updatedOpenings = [...openings, newOpening]
      const newOpenArea = +updatedOpenings.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
      const newNet = +(Math.max(0, grossArea - newOpenArea)).toFixed(3)
      saveItemEdit({ ...item, openings: updatedOpenings, qty: newNet, unit: 'm²', area: grossArea })
    }

    function updateOpening(id: string, changes: Partial<WallOpening>) {
      const updated = openings.map(o => o.id === id ? { ...o, ...changes } : o)
      const newOpenArea = +updated.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
      const newNet = +(Math.max(0, grossArea - newOpenArea)).toFixed(3)
      saveItemEdit({ ...item, openings: updated, qty: newNet, unit: 'm²', area: grossArea })
    }

    function removeOpening(id: string) {
      const updated = openings.filter(o => o.id !== id)
      const newOpenArea = +updated.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
      const newNet = +(Math.max(0, grossArea - newOpenArea)).toFixed(3)
      saveItemEdit({ ...item, openings: updated, qty: newNet, unit: 'm²', area: grossArea })
    }

    // Hex → RGB for accent bg
    const [r2, g2, b2] = [0x16, 0xa0, 0x85]
    const bgDark  = `rgba(${r2},${g2},${b2},0.08)`
    const bgLight = `rgba(${r2},${g2},${b2},0.06)`
    const bdColor = `rgba(${r2},${g2},${b2},0.30)`

    const builtInIds = new Set(WALL_MAKEUPS.map(m => m.id))

    return (
      <div style={{ padding: 14, fontSize: 13, overflowY: 'auto', height: '100%' }}>

        {/* ── Key metrics ── */}
        <div style={{
          background: darkMode ? bgDark : bgLight,
          borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          border: `1px solid ${bdColor}`,
        }}>
          <div style={{ fontSize: 10, color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🧱 External Wall
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isLineBased ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
            {isLineBased && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: accentColor, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(wallLength)}</div>
                <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m wall run</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: darkMode ? '#c8d8a8' : '#2b3a2b', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(grossArea)}</div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m² gross area{openingsArea > 0 ? ` (−${fmt2(openingsArea)} openings)` : ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: accentColor, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(netArea)}</div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m² net wall area</div>
            </div>
          </div>
        </div>

        {/* ── Label ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Drawing Label</label>
          <input style={inputStyle} value={editingElement?.label ?? item.name}
            onChange={e => {
              if (editingElement) saveElementEdit({ ...editingElement, label: e.target.value })
              saveItemEdit({ ...item, name: e.target.value })
            }} />
        </div>

        {/* ── Wall height (line-based only) ── */}
        {isLineBased && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Wall Height (m) — storey or section height</label>
            <input
              type="number" step={0.05} min={0.5} max={10}
              style={{ ...inputStyle, color: accentColor }}
              value={wallHeight}
              onChange={e => {
                const h = Math.max(0.1, +e.target.value || 2.7)
                const newGross = +(wallLength * h).toFixed(3)
                const newNet   = +(Math.max(0, newGross - openingsArea)).toFixed(3)
                saveItemEdit({ ...item, wallHeight: h, area: newGross, qty: newNet, unit: 'm²' })
              }}
            />
          </div>
        )}

        {/* ── Canvas line width slider ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Canvas Line Width — how thick on plan</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="range" min={4} max={30} step={1}
              style={{ flex: 1, accentColor }}
              value={item.wallBandPx ?? 9}
              onChange={e => saveItemEdit({ ...item, wallBandPx: Number(e.target.value) })}
            />
            <span style={{ fontSize: 13, color: accentColor, fontWeight: 700, minWidth: 36, textAlign: 'right' }}>
              {(item.wallBandPx ?? 9) * 2}px
            </span>
          </div>
        </div>

        {/* ── Wall Construction Type ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Wall Construction Type</label>
          <select
            style={{ ...inputStyle, color: accentColor }}
            value={item.floorMakeupId ?? ''}
            onChange={e => {
              const newM = allWallTypes.find(m => m.id === e.target.value)
              saveItemEdit({
                ...item,
                floorMakeupId: e.target.value,
                spec: newM?.clientDescription ?? item.spec,
                floorLayerToggles: {},
                floorLayerThicknesses: {},
              })
            }}
          >
            <optgroup label="── Built-in Wall Types">
              {WALL_MAKEUPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </optgroup>
            {customWallTypes.length > 0 && (
              <optgroup label="── Custom Wall Types">
                {customWallTypes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </optgroup>
            )}
          </select>
          {makeup && (
            <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 3, fontStyle: 'italic' }}>
              {builtInIds.has(item.floorMakeupId ?? '') ? 'Built-in' : '★ Custom'} · {makeup.layers.length} layers
              {makeup.labourHrsPerM2 > 0 && ` · ~${fmt2(netArea * makeup.labourHrsPerM2)} hrs labour`}
            </div>
          )}
        </div>

        {/* ── Layer Schedule ── */}
        {makeup && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10, color: '#6a8a6a', letterSpacing: 1, textTransform: 'uppercase',
              marginBottom: 6, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>Layer Schedule (net area)</span>
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '16px 1fr 64px 8px',
              gap: 4, padding: '3px 6px', marginBottom: 2,
              fontSize: 9, color: '#4a6a4a', textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              <span /><span>Layer</span><span style={{ textAlign: 'right' }}>Qty</span><span />
            </div>
            {makeup.layers.map(layer => {
              const enabled = toggles[layer.id] ?? layer.defaultEnabled
              const thk = thicknesses[layer.id] ?? layer.thickness
              const { qty: lQty, unit: lUnit } = calcLayerQty(layer, netArea, wallPerimeter, thk || undefined)
              return (
                <div key={layer.id} style={{
                  display: 'grid', gridTemplateColumns: '16px 1fr 64px 8px',
                  gap: 4, alignItems: 'center',
                  padding: '5px 6px', marginBottom: 2, borderRadius: 4,
                  background: enabled ? (darkMode ? '#0a181a' : '#f0f8f8') : (darkMode ? '#090f09' : '#f8f9fa'),
                  border: `1px solid ${enabled ? (darkMode ? '#1a3030' : '#cce6e4') : (darkMode ? '#111' : '#eee')}`,
                  opacity: enabled ? 1 : 0.5,
                }}>
                  <input type="checkbox" checked={enabled}
                    onChange={ev => saveItemEdit({ ...item, floorLayerToggles: { ...toggles, [layer.id]: ev.target.checked } })}
                    style={{ margin: 0, accentColor, cursor: 'pointer' }} />
                  <div>
                    <div style={{ fontSize: 11, color: enabled ? (darkMode ? '#c8d8a8' : '#2b3a2b') : '#6a8a6a', lineHeight: 1.2 }}>{layer.name}</div>
                    {layer.thickness > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                        <input type="number" value={thk} min={0}
                          onChange={ev => saveItemEdit({ ...item, floorLayerThicknesses: { ...thicknesses, [layer.id]: +ev.target.value } })}
                          style={{ width: 38, background: darkMode ? '#0a181a' : '#f0f8f8', border: '1px solid #2a3a2a', borderRadius: 3, color: '#8aa', fontSize: 10, padding: '1px 3px', textAlign: 'right', outline: 'none' }} />
                        <span style={{ fontSize: 9, color: '#4a6a4a' }}>mm</span>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: enabled ? (darkMode ? '#c8d8a8' : '#2b3a2b') : '#4a6a4a', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {enabled ? `${lQty} ${lUnit}` : '—'}
                  </div>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[layer.category] ?? '#95a5a6', flexShrink: 0, alignSelf: 'center' }} title={layer.category} />
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {(['labour', 'materials', 'plant', 'other'] as const).map(cat => (
                <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6a8a6a' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[cat], display: 'inline-block' }} />
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Openings & Deductions ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#6a8a6a', letterSpacing: 1, textTransform: 'uppercase' }}>
              Openings & Deductions
            </span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(['window', 'door', 'bifold', 'french_door'] as WallOpeningType[]).map(t => (
                <button key={t} onClick={() => addOpening(t)} style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                  background: darkMode ? '#0a181a' : '#e8f5f4',
                  border: `1px solid ${darkMode ? '#1a3030' : '#a0d4cf'}`,
                  color: accentColor, fontWeight: 600,
                }}>
                  + {WALL_OPENING_LABELS[t].replace(' Door', '').replace('French Doors', 'French')}
                </button>
              ))}
              <button onClick={() => addOpening('other')} style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                background: darkMode ? '#1a1a1a' : '#f0f0f0',
                border: `1px solid ${darkMode ? '#333' : '#ccc'}`,
                color: '#6a8a6a',
              }}>+ Other</button>
            </div>
          </div>

          {openings.length === 0 ? (
            <div style={{ fontSize: 11, color: '#6a8a6a', textAlign: 'center', padding: '8px 0', fontStyle: 'italic' }}>
              No openings — click + to add windows, doors or bifolds
            </div>
          ) : (
            <>
              {openings.map(op => (
                <div key={op.id} style={{
                  display: 'grid', gridTemplateColumns: '90px 1fr 48px 4px 48px 36px 20px',
                  gap: 3, alignItems: 'center', marginBottom: 4,
                  padding: '5px 6px', borderRadius: 4,
                  background: darkMode ? '#0a181a' : '#f0f8f8',
                  border: `1px solid ${darkMode ? '#1a3030' : '#cce6e4'}`,
                }}>
                  <select
                    style={{ ...inputStyle, padding: '2px 4px', fontSize: 11 }}
                    value={op.type}
                    onChange={e => updateOpening(op.id, { type: e.target.value as WallOpeningType, label: WALL_OPENING_LABELS[e.target.value as WallOpeningType] })}
                  >
                    {(Object.keys(WALL_OPENING_LABELS) as WallOpeningType[]).map(t => (
                      <option key={t} value={t}>{WALL_OPENING_LABELS[t]}</option>
                    ))}
                  </select>
                  <input
                    style={{ ...inputStyle, fontSize: 11 }}
                    placeholder="Label"
                    value={op.label}
                    onChange={e => updateOpening(op.id, { label: e.target.value })}
                  />
                  <input type="number" step={0.05} min={0.1}
                    style={{ ...inputStyle, fontSize: 11, textAlign: 'right' }}
                    value={op.width}
                    onChange={e => updateOpening(op.id, { width: +e.target.value })}
                    title="Width (m)"
                  />
                  <span style={{ fontSize: 10, color: '#6a8a6a', textAlign: 'center' }}>×</span>
                  <input type="number" step={0.05} min={0.1}
                    style={{ ...inputStyle, fontSize: 11, textAlign: 'right' }}
                    value={op.height}
                    onChange={e => updateOpening(op.id, { height: +e.target.value })}
                    title="Height (m)"
                  />
                  <div style={{ fontSize: 10, color: '#e74c3c', fontFamily: 'monospace', textAlign: 'right' }}>
                    −{fmt2(op.width * op.height)}
                  </div>
                  <button onClick={() => removeOpening(op.id)} style={{
                    background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
                  }}>×</button>
                </div>
              ))}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 6px', borderRadius: 4, marginTop: 2,
                background: darkMode ? '#0d1a12' : '#e8f5f0',
                border: `1px solid ${darkMode ? '#1a3020' : '#b0d8c4'}`,
                fontSize: 11,
              }}>
                <span style={{ color: '#6a8a6a' }}>Total openings deducted</span>
                <span style={{ color: '#e74c3c', fontFamily: 'monospace', fontWeight: 700 }}>−{fmt2(openingsArea)} m²</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 6px', borderRadius: 4, marginTop: 3,
                background: darkMode ? bgDark : bgLight,
                border: `1px solid ${bdColor}`,
                fontSize: 11,
              }}>
                <span style={{ color: '#6a8a6a' }}>Net wall area (to price)</span>
                <span style={{ color: accentColor, fontFamily: 'monospace', fontWeight: 700 }}>{fmt2(netArea)} m²</span>
              </div>
            </>
          )}
        </div>

        {/* ── Disclaimer ── */}
        <div style={{
          fontSize: 10, lineHeight: 1.5, padding: '7px 10px', borderRadius: 6, marginBottom: 10,
          background: darkMode ? '#1a1500' : '#fffbeb',
          border: `1px solid ${darkMode ? '#3a3000' : '#fde68a'}`,
          color: darkMode ? '#c8b060' : '#92400e',
        }}>
          ⚠️ Wall make-up is for estimating purposes only and should be confirmed against drawings, structural design and Building Control requirements.
        </div>

        {/* ── Client Description ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Client Description (quote text)</label>
          <textarea style={{ ...inputStyle, height: 64, resize: 'none', fontSize: 11, lineHeight: 1.5 }}
            value={item.spec ?? ''}
            onChange={e => saveItemEdit({ ...item, spec: e.target.value })}
          />
        </div>

        {/* ── Drawing Ref ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Drawing Ref</label>
          <input style={inputStyle} value={item.drawingRef ?? ''}
            onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
        </div>

        {/* ── Building Regs Notes ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Building Regs Notes</label>
          <textarea style={{ ...inputStyle, height: 52, resize: 'none' }}
            value={item.buildingRegsNotes ?? ''}
            onChange={e => saveItemEdit({ ...item, buildingRegsNotes: e.target.value })} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, height: 52, resize: 'none' }}
            value={item.notes ?? ''}
            onChange={e => saveItemEdit({ ...item, notes: e.target.value })} />
        </div>

        {/* ── Delete ── */}
        <button
          style={{ ...btnStyle, background: '#c0392b', borderColor: '#c0392b', marginTop: 4 }}
          onClick={() => {
            if (item.elementId) {
              setProject(p => ({
                ...p,
                elements: p.elements.filter(el2 => el2.id !== item.elementId),
                items: p.items.filter(it => it.id !== item.id),
              }))
              setSelectedId(null)
            } else {
              setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) }))
            }
            setEditingItem(null)
            setEditingElement(null)
            setPanelMode('schedule')
          }}
        >
          🗑 Delete Wall Item
        </button>
      </div>
    )
  }

  // ── Plastering & Boarding properties panel ───────────────────────────────────
  // Line-based: user draws wall run → enters height → selects finish sides → openings deducted.
  // boardingArea = netArea × finishSides — this is the area used for layer quantity calcs.
  function renderPlasterProperties(item: TakeoffItem) {
    const accentColor  = '#95a5a6'
    const [r3, g3, b3] = [0x95, 0xa5, 0xa6]
    const bgCard  = darkMode ? `rgba(${r3},${g3},${b3},0.07)` : `rgba(${r3},${g3},${b3},0.06)`
    const bdCard  = `rgba(${r3},${g3},${b3},0.30)`

    const linkEl     = item.elementId ? project.elements.find(e => e.id === item.elementId) : null
    const isLineBased = linkEl?.type === 'line'

    // Measurements
    const wallLength   = item.length ?? 0
    const wallHeight   = item.wallHeight ?? 2.4
    const finishSides  = item.plasterFinishSides ?? 1
    const grossArea    = +(wallLength * wallHeight).toFixed(3)
    const openings     = item.openings ?? []
    const openingsArea = +openings.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
    const netArea      = +(Math.max(0, grossArea - openingsArea)).toFixed(3)
    const boardingArea = +(netArea * finishSides).toFixed(3)

    // For perimeter-based layers (metal stud track), use wall run as the perimeter
    const perimeter = isLineBased ? wallLength : 0

    const makeups   = PLASTER_MAKEUPS
    const makeup    = makeups.find(m => m.id === item.floorMakeupId)
    const toggles   = item.floorLayerToggles    ?? {}
    const thicknesses = item.floorLayerThicknesses ?? {}

    // Recalc & save quantities whenever dimensions change
    function recalcAndSave(patch: Partial<TakeoffItem>) {
      const merged   = { ...item, ...patch }
      const h        = merged.wallHeight   ?? wallHeight
      const sides    = merged.plasterFinishSides ?? finishSides
      const ops      = merged.openings     ?? openings
      const newGross = +(wallLength * h).toFixed(3)
      const newOpA   = +ops.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
      const newNet   = +(Math.max(0, newGross - newOpA)).toFixed(3)
      const newBoard = +(newNet * sides).toFixed(3)
      saveItemEdit({ ...merged, area: newGross, qty: newBoard, unit: 'm²' })
    }

    // Opening helpers
    function addOpening(type: WallOpeningType) {
      const def = WALL_OPENING_DEFAULTS[type]
      const newOpening: WallOpening = {
        id: Math.random().toString(36).slice(2, 8),
        type, label: WALL_OPENING_LABELS[type],
        width: def.width, height: def.height,
      }
      recalcAndSave({ openings: [...openings, newOpening] })
    }
    function updateOpening(id: string, changes: Partial<WallOpening>) {
      recalcAndSave({ openings: openings.map(o => o.id === id ? { ...o, ...changes } : o) })
    }
    function removeOpening(id: string) {
      recalcAndSave({ openings: openings.filter(o => o.id !== id) })
    }

    return (
      <div style={{ padding: 14, fontSize: 13, overflowY: 'auto', height: '100%' }}>

        {/* ── Key metrics ── */}
        <div style={{ background: bgCard, borderRadius: 8, padding: '12px 14px', marginBottom: 12, border: `1px solid ${bdCard}` }}>
          <div style={{ fontSize: 10, color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            🪣 Plastering & Boarding
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            {isLineBased && (
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: accentColor, fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(wallLength)}</div>
                <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m wall run</div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: darkMode ? '#c8d8a8' : '#2b3a2b', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(grossArea)}</div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m² gross{openingsArea > 0 ? ` (−${fmt2(openingsArea)})` : ''}</div>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#7fb3a0', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(netArea)}</div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m² net area</div>
            </div>
          </div>
          {/* Boarding area highlight */}
          <div style={{ background: darkMode ? '#1a1a20' : '#eef0f8', borderRadius: 6, padding: '8px 10px', border: `1px solid ${darkMode ? '#3a3a5a' : '#c5cae9'}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#7986cb', fontFamily: 'monospace' }}>{fmt2(boardingArea)}</span>
              <span style={{ fontSize: 11, color: darkMode ? '#7986cb' : '#3949ab' }}>m² boarding / skimming area</span>
              <span style={{ fontSize: 10, color: '#6a8a6a', marginLeft: 'auto' }}>
                {netArea} × {finishSides} side{finishSides > 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* ── Label ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Drawing Label</label>
          <input style={inputStyle} value={editingElement?.label ?? item.name}
            onChange={e => {
              if (editingElement) saveElementEdit({ ...editingElement, label: e.target.value })
              saveItemEdit({ ...item, name: e.target.value })
            }} />
        </div>

        {/* ── Wall height ── */}
        {isLineBased && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Wall Height (m)</label>
            <input
              type="number" step={0.05} min={0.1} max={10}
              style={{ ...inputStyle, color: accentColor }}
              value={wallHeight}
              onChange={e => recalcAndSave({ wallHeight: Math.max(0.1, +e.target.value || 2.4) })}
            />
          </div>
        )}

        {/* ── Finish sides ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Finish Sides</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([1, 2] as const).map(n => (
              <div
                key={n}
                onClick={() => recalcAndSave({ plasterFinishSides: n })}
                style={{
                  flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 5, cursor: 'pointer', fontSize: 12,
                  background: finishSides === n ? (darkMode ? '#2a2a3a' : '#e8eaf6') : 'var(--to-alt)',
                  border: `1px solid ${finishSides === n ? '#7986cb' : 'var(--to-border)'}`,
                  color: finishSides === n ? '#7986cb' : 'var(--to-sub)',
                  fontWeight: finishSides === n ? 700 : 400,
                }}
              >
                {n === 1 ? '1 Side' : '2 Sides'}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 3 }}>
            {finishSides === 1 ? 'One face boarded / skimmed (e.g. masonry wall, one face only)' : 'Both faces boarded / skimmed (e.g. new stud partition)'}
          </div>
        </div>

        {/* ── Openings ── */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: '#6a8a6a', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Door &amp; Window Openings</span>
            {openingsArea > 0 && <span style={{ color: '#e67e22' }}>−{fmt2(openingsArea)} m²</span>}
          </div>

          {openings.map(op => (
            <div key={op.id} style={{ background: darkMode ? '#1a1a0d' : '#fffde7', border: `1px solid ${darkMode ? '#3a3a1a' : '#fff176'}`, borderRadius: 5, padding: '6px 8px', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <select
                  value={op.type}
                  onChange={e => updateOpening(op.id, { type: e.target.value as WallOpeningType, label: WALL_OPENING_LABELS[e.target.value as WallOpeningType] })}
                  style={{ ...inputStyle, flex: 1, fontSize: 11, padding: '3px 5px' }}
                >
                  {(Object.keys(WALL_OPENING_LABELS) as WallOpeningType[]).map(k => (
                    <option key={k} value={k}>{WALL_OPENING_LABELS[k]}</option>
                  ))}
                </select>
                <button onClick={() => removeOpening(op.id)}
                  style={{ background: 'transparent', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div>
                  <label style={{ ...labelStyle, fontSize: 9 }}>Width (m)</label>
                  <input type="number" step={0.05} min={0.1}
                    style={{ ...inputStyle, fontSize: 11, padding: '3px 6px' }}
                    value={op.width}
                    onChange={e => updateOpening(op.id, { width: Math.max(0.1, +e.target.value || 0.9) })} />
                </div>
                <div>
                  <label style={{ ...labelStyle, fontSize: 9 }}>Height (m)</label>
                  <input type="number" step={0.05} min={0.1}
                    style={{ ...inputStyle, fontSize: 11, padding: '3px 6px' }}
                    value={op.height}
                    onChange={e => updateOpening(op.id, { height: Math.max(0.1, +e.target.value || 2.1) })} />
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#8a7a3a', marginTop: 3 }}>
                {fmt2(op.width * op.height)} m² deducted
              </div>
            </div>
          ))}

          {/* Add opening buttons */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {(['door', 'window', 'bifold', 'french_door', 'other'] as WallOpeningType[]).map(t => (
              <button key={t} onClick={() => addOpening(t)}
                style={{ ...btnStyle, fontSize: 10, padding: '4px 7px', background: 'transparent', borderColor: '#5a4a1a', color: '#c8a830' }}>
                + {WALL_OPENING_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Finish type ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Finish Type</label>
          <select
            style={{ ...inputStyle, color: accentColor }}
            value={item.floorMakeupId ?? ''}
            onChange={e => {
              const newM = makeups.find(m => m.id === e.target.value)
              saveItemEdit({
                ...item,
                floorMakeupId: e.target.value,
                spec: newM?.clientDescription ?? item.spec,
                floorLayerToggles: {},
                floorLayerThicknesses: {},
              })
            }}
          >
            {makeups.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* ── Layer Schedule — uses boardingArea for quantities ── */}
        {makeup && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#6a8a6a', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>Layer Schedule</span>
              <span style={{ color: '#4a6a4a' }}>~{fmt2(boardingArea * makeup.labourHrsPerM2)} hrs labour</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 64px 8px', gap: 4, padding: '3px 6px', marginBottom: 2, fontSize: 9, color: '#4a6a4a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <span /><span>Layer</span><span style={{ textAlign: 'right' }}>Qty</span><span />
            </div>
            {makeup.layers.map(layer => {
              const enabled = toggles[layer.id] ?? layer.defaultEnabled
              const thk = thicknesses[layer.id] ?? layer.thickness
              const { qty, unit } = calcLayerQty(layer, boardingArea, perimeter, thk || undefined)
              return (
                <div key={layer.id} style={{
                  display: 'grid', gridTemplateColumns: '16px 1fr 64px 8px',
                  gap: 4, alignItems: 'center', padding: '5px 6px', marginBottom: 2, borderRadius: 4,
                  background: enabled ? (darkMode ? '#0d1a0d' : '#f5f9f5') : (darkMode ? '#090f09' : '#f0f0f0'),
                  border: `1px solid ${enabled ? (darkMode ? '#1e2e1e' : '#c8ddc8') : (darkMode ? '#111' : '#ddd')}`,
                  opacity: enabled ? 1 : 0.5,
                }}>
                  <input type="checkbox" checked={enabled}
                    onChange={ev => saveItemEdit({ ...item, floorLayerToggles: { ...toggles, [layer.id]: ev.target.checked } })}
                    style={{ margin: 0, accentColor, cursor: 'pointer' }} />
                  <div>
                    <div style={{ fontSize: 11, color: enabled ? (darkMode ? '#c8d8a8' : '#2b3a2b') : '#6a8a6a', lineHeight: 1.2 }}>{layer.name}</div>
                    {layer.thickness > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                        <input type="number" value={thk} min={0}
                          onChange={ev => saveItemEdit({ ...item, floorLayerThicknesses: { ...thicknesses, [layer.id]: +ev.target.value } })}
                          style={{ width: 38, background: darkMode ? '#162216' : '#f0f4f0', border: `1px solid ${darkMode ? '#2a3a2a' : '#c8d8c8'}`, borderRadius: 3, color: darkMode ? '#8aa' : '#4a6a4a', fontSize: 10, padding: '1px 3px', textAlign: 'right', outline: 'none' }} />
                        <span style={{ fontSize: 9, color: '#4a6a4a' }}>mm</span>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: enabled ? (darkMode ? '#c8d8a8' : '#2b3a2b') : '#4a6a4a', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {enabled ? `${qty} ${unit}` : '—'}
                  </div>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[layer.category] ?? '#95a5a6', flexShrink: 0, alignSelf: 'center' }} title={layer.category} />
                </div>
              )
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {(['labour', 'materials', 'plant', 'other'] as const).map(cat => (
                <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6a8a6a' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[cat], display: 'inline-block' }} />
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Client Description ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Client Description (quote text)</label>
          <textarea style={{ ...inputStyle, height: 70, resize: 'none', fontSize: 11, lineHeight: 1.5 }}
            value={item.spec ?? ''}
            onChange={e => saveItemEdit({ ...item, spec: e.target.value })} />
        </div>

        {/* ── Drawing Ref ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Drawing Ref</label>
          <input style={inputStyle} value={item.drawingRef ?? ''} onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, height: 52, resize: 'none' }}
            value={item.notes ?? ''} onChange={e => saveItemEdit({ ...item, notes: e.target.value })} />
        </div>

        {/* ── Delete ── */}
        <button
          style={{ ...btnStyle, background: '#c0392b', borderColor: '#c0392b', marginTop: 4 }}
          onClick={() => {
            if (item.elementId) {
              setProject(p => ({
                ...p,
                elements: p.elements.filter(el2 => el2.id !== item.elementId),
                items: p.items.filter(it => it.id !== item.id),
              }))
              setSelectedId(null)
            } else {
              setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) }))
            }
            setEditingItem(null)
            setEditingElement(null)
            setPanelMode('schedule')
          }}
        >
          🗑 Delete Plaster Item
        </button>
      </div>
    )
  }

  // ── Demolition properties panel ──────────────────────────────────────────────
  function renderDemolitionProperties(item: TakeoffItem) {
    const accentColor   = '#e74c3c'
    const bgDark        = darkMode ? '#1a0d0d' : '#fff5f5'
    const bdColor       = darkMode ? '#4a1a1a' : '#fecaca'
    const labelStyle2: React.CSSProperties = { fontSize: 10, letterSpacing: 1, color: 'var(--to-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }
    const inputStyle2: React.CSSProperties = { width: '100%', background: 'var(--to-input)', border: '1px solid var(--to-input-bd)', borderRadius: 4, padding: '5px 8px', fontSize: 12, color: 'var(--to-text)', boxSizing: 'border-box' }
    const btnStyle2: React.CSSProperties = { padding: '5px 10px', borderRadius: 4, border: `1px solid ${accentColor}`, background: accentColor, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }

    const allSubphases = getAllDemoSubphases(customDemoSubphases)
    const subphase: DemoSubphase = allSubphases.find(s => s.id === item.demoSubphaseId) ?? allSubphases[0]
    const task: DemoTask         = subphase.tasks.find(t => t.id === item.demoTaskId)   ?? subphase.tasks[0]

    const markupPct = item.demoMarkupPct ?? subphase.markupPct
    const labour    = item.demoLabour        ?? +(task.labourCost        * item.qty).toFixed(2)
    const materials = item.demoMaterials     ?? +(task.materialCost      * item.qty).toFixed(2)
    const plant     = item.demoPlant         ?? +(task.plantCost         * item.qty).toFixed(2)
    const waste     = item.demoWaste         ?? +(task.wasteCost         * item.qty).toFixed(2)
    const sub       = item.demoSubcontractor ?? +(task.subcontractorCost * item.qty).toFixed(2)
    const other     = item.demoOther         ?? +(task.otherCost         * item.qty).toFixed(2)
    const base      = labour + materials + plant + waste + sub + other
    const selling   = calcDemoSellingPrice(labour, materials, plant, waste, sub, other, markupPct)

    const allWarnings = [...(subphase.warnings ?? []), ...(task.warnings ?? [])]
    const demoUnit  = (item.unit as DemoUnit) || task.unit

    function applyTaskDefaults(newSubphase: DemoSubphase, newTask: DemoTask) {
      const q = item.qty > 0 ? item.qty : newTask.defaultQty
      saveItemEdit({
        ...item,
        name:               newTask.name,
        spec:               newTask.clientDescription,
        demoSubphaseId:     newSubphase.id,
        demoTaskId:         newTask.id,
        demoMarkupPct:      newSubphase.markupPct,
        subPhase:           newSubphase.name,
        unit:               newTask.unit,
        qty:                q,
        demoLabour:         +(newTask.labourCost        * q).toFixed(2),
        demoMaterials:      +(newTask.materialCost      * q).toFixed(2),
        demoPlant:          +(newTask.plantCost         * q).toFixed(2),
        demoWaste:          +(newTask.wasteCost         * q).toFixed(2),
        demoSubcontractor:  +(newTask.subcontractorCost * q).toFixed(2),
        demoOther:          +(newTask.otherCost         * q).toFixed(2),
      })
    }

    return (
      <div style={{ padding: 14, fontSize: 13, overflowY: 'auto', height: '100%' }}>

        {/* Header */}
        <div style={{ background: bgDark, border: `1px solid ${bdColor}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: accentColor, fontWeight: 700, marginBottom: 6 }}>🔨 DEMOLITION / STRIP OUT</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--to-text)', fontFamily: 'monospace' }}>{item.qty} {DEMO_UNIT_LABELS[demoUnit]}</div>
              <div style={{ fontSize: 10, color: 'var(--to-muted)' }}>quantity</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: accentColor, fontFamily: 'monospace' }}>£{selling.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div style={{ fontSize: 10, color: 'var(--to-muted)' }}>selling price</div>
            </div>
          </div>
        </div>

        {/* Subphase */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle2}>Demolition Subphase</label>
          <select style={{ ...inputStyle2, color: accentColor }}
            value={subphase.id}
            onChange={e => {
              const newSub = allSubphases.find(s => s.id === e.target.value) ?? allSubphases[0]
              applyTaskDefaults(newSub, newSub.tasks[0])
            }}>
            {allSubphases.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Task */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle2}>Demolition Task</label>
          <select style={{ ...inputStyle2, color: accentColor }}
            value={task.id}
            onChange={e => {
              const newTask = subphase.tasks.find(t => t.id === e.target.value) ?? subphase.tasks[0]
              applyTaskDefaults(subphase, newTask)
            }}>
            {subphase.tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Qty + Unit */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={labelStyle2}>Quantity</label>
            <input type="number" min={0} step={0.5} style={inputStyle2}
              value={item.qty}
              onChange={e => {
                const q = Math.max(0, +e.target.value || 0)
                saveItemEdit({
                  ...item, qty: q,
                  demoLabour:        +(task.labourCost        * q).toFixed(2),
                  demoMaterials:     +(task.materialCost      * q).toFixed(2),
                  demoPlant:         +(task.plantCost         * q).toFixed(2),
                  demoWaste:         +(task.wasteCost         * q).toFixed(2),
                  demoSubcontractor: +(task.subcontractorCost * q).toFixed(2),
                  demoOther:         +(task.otherCost         * q).toFixed(2),
                })
              }}
            />
          </div>
          <div>
            <label style={labelStyle2}>Unit</label>
            <select style={inputStyle2} value={demoUnit}
              onChange={e => saveItemEdit({ ...item, unit: e.target.value })}>
              {DEMO_UNITS.map(u => <option key={u} value={u}>{DEMO_UNIT_LABELS[u]}</option>)}
            </select>
          </div>
        </div>

        {/* Cost breakdown */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle2}>Cost Breakdown (total, ex-VAT)</label>
          {[
            { label: '🔨 Labour',       key: 'demoLabour',        val: labour    },
            { label: '📦 Materials',     key: 'demoMaterials',     val: materials },
            { label: '🚜 Plant',         key: 'demoPlant',         val: plant     },
            { label: '🗑 Waste / Skips', key: 'demoWaste',         val: waste     },
            { label: '👷 Subcontractor', key: 'demoSubcontractor', val: sub       },
            { label: '📋 Other',         key: 'demoOther',         val: other     },
          ].map(({ label, key, val }) => (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--to-sub)' }}>{label}</span>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--to-muted)' }}>£</span>
                <input type="number" min={0} step={1} style={{ ...inputStyle2, paddingLeft: 18 }}
                  value={val}
                  onChange={e => saveItemEdit({ ...item, [key]: Math.max(0, +e.target.value || 0) })}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Markup & selling price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={labelStyle2}>Markup %</label>
            <input type="number" min={0} max={200} step={1} style={inputStyle2}
              value={markupPct}
              onChange={e => saveItemEdit({ ...item, demoMarkupPct: Math.max(0, +e.target.value || 0) })}
            />
          </div>
          <div>
            <label style={labelStyle2}>Selling Price</label>
            <div style={{ ...inputStyle2, background: bgDark, border: `1px solid ${bdColor}`, color: accentColor, fontWeight: 700, fontFamily: 'monospace' }}>
              £{selling.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Base cost breakdown summary */}
        <div style={{ fontSize: 10, color: 'var(--to-muted)', marginBottom: 10 }}>
          Base cost: £{base.toFixed(2)} + {markupPct}% = £{selling.toFixed(2)}
        </div>

        {/* Warnings */}
        {allWarnings.length > 0 && (
          <div style={{ fontSize: 10, lineHeight: 1.6, padding: '8px 10px', borderRadius: 6, marginBottom: 10, background: darkMode ? '#1a1200' : '#fffbeb', border: `1px solid ${darkMode ? '#4a3000' : '#fde68a'}`, color: darkMode ? '#c8a060' : '#92400e' }}>
            {allWarnings.map((w, i) => <div key={i}>⚠️ {w}</div>)}
          </div>
        )}

        {/* Client Description */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle2}>Client Description (quote text)</label>
          <textarea style={{ ...inputStyle2, height: 72, resize: 'none', fontSize: 11, lineHeight: 1.5 }}
            value={item.spec ?? ''}
            onChange={e => saveItemEdit({ ...item, spec: e.target.value })}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={labelStyle2}>Drawing Ref</label>
            <input style={inputStyle2} value={item.drawingRef ?? ''} onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle2}>Bldg Regs Notes</label>
            <input style={inputStyle2} value={item.buildingRegsNotes ?? ''} onChange={e => saveItemEdit({ ...item, buildingRegsNotes: e.target.value })} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle2}>Notes</label>
          <textarea style={{ ...inputStyle2, height: 48, resize: 'none' }}
            value={item.notes ?? ''}
            onChange={e => saveItemEdit({ ...item, notes: e.target.value })}
          />
        </div>

        {/* Delete */}
        <button style={{ ...btnStyle2, background: '#c0392b', borderColor: '#c0392b', marginTop: 4, width: '100%' }}
          onClick={() => {
            if (item.elementId) {
              setProject(p => ({ ...p, elements: p.elements.filter(el2 => el2.id !== item.elementId), items: p.items.filter(it => it.id !== item.id) }))
              setSelectedId(null)
            } else {
              setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) }))
            }
            setEditingItem(null); setEditingElement(null); setPanelMode('schedule')
          }}>
          🗑 Delete Demolition Item
        </button>
      </div>
    )
  }

  // ── Build-up properties panel (floors, walls, foundations, plastering) ───────
  function renderBuildupProperties(item: TakeoffItem) {
    const makeups = PHASE_MAKEUPS[item.phase] ?? FLOOR_MAKEUPS
    const makeup = makeups.find(m => m.id === item.floorMakeupId)
    const accentColor = PHASE_COLORS[item.phase] ?? '#f39c12'
    const area = item.area ?? 0
    // Compute perimeter from geometry if it wasn't stored on the item
    const _buildEl = item.elementId ? project.elements.find(e => e.id === item.elementId) : null
    const perimeter = item.perimeter ??
      (_buildEl?.type === 'rect' && _buildEl.points.length >= 2
        ? rectPerimeter(_buildEl.points, project.calibration.mpp)
        : _buildEl?.type === 'polygon' && _buildEl.points.length >= 3
          ? polyPerimeter(_buildEl.points, project.calibration.mpp)
          : 0)
    const toggles = item.floorLayerToggles ?? {}
    const thicknesses = item.floorLayerThicknesses ?? {}

    // Phase-specific labels
    const phaseEmoji: Partial<Record<TakeoffPhase, string>> = {
      'Floors & Screeds': '🏗', 'External Walls': '🧱', 'Foundations': '⛏', 'Plastering & Boarding': '🪣',
    }
    const areaLabel: Partial<Record<TakeoffPhase, string>> = {
      'Floors & Screeds': 'floor area', 'External Walls': 'wall area', 'Foundations': 'base area', 'Plastering & Boarding': 'surface area',
    }
    const perimLabel = item.phase === 'Foundations' ? 'strip run (lm)' : 'perimeter (lm)'
    const emoji = phaseEmoji[item.phase] ?? '🏗'
    const aLbl = areaLabel[item.phase] ?? 'area'

    // Derive subtle tinted bg from accent color
    const hexToRgb = (h: string) => {
      const c = h.replace('#', '')
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
    }
    const [r, g, b] = hexToRgb(accentColor)
    const bgDark  = `rgba(${r},${g},${b},0.07)`
    const bgLight = `rgba(${r},${g},${b},0.06)`
    const bdColor = `rgba(${r},${g},${b},0.30)`

    return (
      <div style={{ padding: 14, fontSize: 13, overflowY: 'auto', height: '100%' }}>

        {/* ── Key metrics ── */}
        <div style={{
          background: darkMode ? bgDark : bgLight,
          borderRadius: 8, padding: '12px 14px', marginBottom: 12,
          border: `1px solid ${bdColor}`,
        }}>
          <div style={{ fontSize: 10, color: accentColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {emoji} {item.phase} Build-up
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: accentColor, fontFamily: 'monospace', lineHeight: 1 }}>
                {fmt2(area)}
              </div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>m² {aLbl}</div>
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#c8d8a8', fontFamily: 'monospace', lineHeight: 1 }}>
                {fmt2(perimeter)}
              </div>
              <div style={{ fontSize: 10, color: '#6a8a6a', marginTop: 2 }}>{perimLabel}</div>
            </div>
          </div>
        </div>

        {/* ── Label ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Label</label>
          <input
            style={inputStyle}
            value={editingElement?.label ?? item.name}
            onChange={e => {
              if (editingElement) saveElementEdit({ ...editingElement, label: e.target.value })
              saveItemEdit({ ...item, name: e.target.value })
            }}
          />
        </div>

        {/* ── Build-up type selector ── */}
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Construction Type</label>
          <select
            style={{ ...inputStyle, color: accentColor }}
            value={item.floorMakeupId ?? ''}
            onChange={e => {
              const newM = makeups.find(m => m.id === e.target.value)
              saveItemEdit({
                ...item,
                floorMakeupId: e.target.value,
                spec: newM?.clientDescription ?? item.spec,
                floorLayerToggles: {},
                floorLayerThicknesses: {},
              })
            }}
          >
            {makeups.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* ── Layer Schedule ── */}
        {makeup && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 10, color: '#6a8a6a', letterSpacing: 1, textTransform: 'uppercase',
              marginBottom: 6, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>Layer Schedule</span>
              <span style={{ color: '#4a6a4a' }}>
                ~{fmt2(area * makeup.labourHrsPerM2)} hrs labour
              </span>
            </div>

            {/* Column headers */}
            <div style={{
              display: 'grid', gridTemplateColumns: '16px 1fr 64px 8px',
              gap: 4, padding: '3px 6px', marginBottom: 2,
              fontSize: 9, color: '#4a6a4a', textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              <span />
              <span>Layer</span>
              <span style={{ textAlign: 'right' }}>Qty</span>
              <span />
            </div>

            {makeup.layers.map(layer => {
              const enabled = toggles[layer.id] ?? layer.defaultEnabled
              const thk = thicknesses[layer.id] ?? layer.thickness
              const { qty, unit } = calcLayerQty(layer, area, perimeter, thk || undefined)

              return (
                <div key={layer.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '16px 1fr 64px 8px',
                  gap: 4, alignItems: 'center',
                  padding: '5px 6px', marginBottom: 2, borderRadius: 4,
                  background: enabled ? '#0d1a0d' : '#090f09',
                  border: `1px solid ${enabled ? '#1e2e1e' : '#111'}`,
                  opacity: enabled ? 1 : 0.5,
                }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={ev => saveItemEdit({
                      ...item,
                      floorLayerToggles: { ...toggles, [layer.id]: ev.target.checked },
                    })}
                    style={{ margin: 0, accentColor, cursor: 'pointer' }}
                  />
                  <div>
                    <div style={{ fontSize: 11, color: enabled ? '#c8d8a8' : '#6a8a6a', lineHeight: 1.2 }}>
                      {layer.name}
                    </div>
                    {layer.thickness > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                        <input
                          type="number"
                          value={thk}
                          min={0}
                          onChange={ev => saveItemEdit({
                            ...item,
                            floorLayerThicknesses: { ...thicknesses, [layer.id]: +ev.target.value },
                          })}
                          style={{
                            width: 38, background: '#162216', border: '1px solid #2a3a2a',
                            borderRadius: 3, color: '#8aa', fontSize: 10,
                            padding: '1px 3px', textAlign: 'right', outline: 'none',
                          }}
                        />
                        <span style={{ fontSize: 9, color: '#4a6a4a' }}>mm</span>
                      </div>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, fontFamily: 'monospace', color: enabled ? '#c8d8a8' : '#4a6a4a',
                    textAlign: 'right', whiteSpace: 'nowrap',
                  }}>
                    {enabled ? `${qty} ${unit}` : '—'}
                  </div>
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: CAT_COLOR[layer.category] ?? '#95a5a6',
                    flexShrink: 0, alignSelf: 'center',
                  }} title={layer.category} />
                </div>
              )
            })}

            {/* Category legend */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              {(['labour', 'materials', 'plant', 'other'] as const).map(cat => (
                <span key={cat} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6a8a6a' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: CAT_COLOR[cat], display: 'inline-block' }} />
                  {cat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Client Description ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Client Description (quote text)</label>
          <textarea
            style={{ ...inputStyle, height: 80, resize: 'none', fontSize: 11, lineHeight: 1.5 }}
            value={item.spec ?? ''}
            onChange={e => saveItemEdit({ ...item, spec: e.target.value })}
          />
        </div>

        {/* ── Drawing Ref ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Drawing Ref</label>
          <input style={inputStyle} value={item.drawingRef ?? ''}
            onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
        </div>

        {/* ── Building Regs Notes ── */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Building Regs Notes</label>
          <textarea style={{ ...inputStyle, height: 52, resize: 'none' }}
            value={item.buildingRegsNotes ?? ''}
            onChange={e => saveItemEdit({ ...item, buildingRegsNotes: e.target.value })}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Notes</label>
          <textarea style={{ ...inputStyle, height: 52, resize: 'none' }}
            value={item.notes ?? ''}
            onChange={e => saveItemEdit({ ...item, notes: e.target.value })}
          />
        </div>

        {/* ── Delete ── */}
        <button
          style={{ ...btnStyle, background: '#c0392b', borderColor: '#c0392b', marginTop: 4 }}
          onClick={() => {
            if (item.elementId) {
              setProject(p => ({
                ...p,
                elements: p.elements.filter(el => el.id !== item.elementId),
                items: p.items.filter(it => it.id !== item.id),
              }))
              setSelectedId(null)
            } else {
              setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) }))
            }
            setEditingItem(null)
            setEditingElement(null)
            setPanelMode('schedule')
          }}
        >
          🗑 Delete Item
        </button>
      </div>
    )
  }

  // ── Generic Phase Task properties panel ──────────────────────────────────────
  function renderPhaseTaskProperties(item: TakeoffItem) {
    const PHASE_ACCENT: Record<string, string> = {
      'Structural Frame':             '#2980b9',
      'Roof':                         '#d35400',
      'Windows & Doors':              '#27ae60',
      'Internal Walls & Partitions':  '#2c3e50',
      'Drainage & Services':          '#7f8c8d',
      'Electrics':                    '#f1c40f',
      'Plumbing & Heating':           '#1abc9c',
      'Plastering & Boarding':        '#95a5a6',
      'Joinery & Fixtures':           '#6d4c41',
      'Tiling & Finishes':            '#ad1457',
      'Decoration':                   '#4a148c',
      'External Works & Landscaping': '#558b2f',
      'Preliminaries':                '#0277bd',
    }
    const accentColor = PHASE_ACCENT[item.phase] ?? '#7ab533'
    const bgDark  = darkMode ? '#0e1520' : '#f0f4ff'
    const bdColor = darkMode ? '#1a2a40' : '#c0d0ee'

    const subphases = getAllSubphasesForPhase(item.phase)
    const selSub = subphases.find(s => s.id === item.taskSubphaseId) ?? subphases[0]
    const tasks = selSub ? getTasksForSubphase(selSub.id) : []
    const selTask = tasks.find(t => t.id === item.taskId) ?? tasks[0]

    const qty     = item.qty || 1
    const markup  = item.taskMarkupPct ?? (selSub?.markupPct ?? 20)
    const labour  = item.taskLabour      ?? 0
    const mats    = item.taskMaterials   ?? 0
    const plant   = item.taskPlant       ?? 0
    const sub     = item.taskSubcontractor ?? 0
    const other   = item.taskOther       ?? 0
    const selling = calcPhaseTaskSellingPrice(labour, mats, plant, sub, other, markup)
    const cost    = labour + mats + plant + sub + other

    const hdr: React.CSSProperties = {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: accentColor, color: '#fff', padding: '10px 14px',
      borderRadius: '8px 8px 0 0', fontSize: 13, fontWeight: 700,
    }
    const card: React.CSSProperties = {
      background: bgDark, border: `1px solid ${bdColor}`,
      borderRadius: 8, marginBottom: 12, overflow: 'hidden',
    }
    const row: React.CSSProperties = { padding: '10px 14px' }
    const twoCol: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }
    const costRow: React.CSSProperties = {
      display: 'grid', gridTemplateColumns: '110px 1fr', alignItems: 'center', gap: 6, marginBottom: 7,
    }
    const costLabel: React.CSSProperties = { fontSize: 12, color: 'var(--to-muted)', fontWeight: 600 }
    const linkedEl = item.elementId ? project.elements.find(e => e.id === item.elementId) : null

    function applyTask(subphaseId: string, taskId: string, overrideQty?: number) {
      const sp = getAllSubphasesForPhase(item.phase).find(s => s.id === subphaseId)
      const tk = sp?.tasks.find(t => t.id === taskId)
      if (!sp || !tk) return
      const q = overrideQty ?? (item.qty > 0 ? item.qty : tk.defaultQty)
      const updated: TakeoffItem = {
        ...item,
        name:               tk.name,
        spec:               tk.notes ?? '',
        taskSubphaseId:     subphaseId,
        taskId:             taskId,
        taskMarkupPct:      sp.markupPct,
        subPhase:           sp.name,
        unit:               tk.unit,
        qty:                q,
        taskLabour:         +(tk.labour       * q).toFixed(2),
        taskMaterials:      +(tk.materials    * q).toFixed(2),
        taskPlant:          +(tk.plant        * q).toFixed(2),
        taskSubcontractor:  +(tk.subcontractor * q).toFixed(2),
        taskOther:          +(tk.other        * q).toFixed(2),
      }
      saveItemEdit(updated)
    }

    return (
      <div style={{ padding: 14, fontSize: 13, overflowY: 'auto', height: '100%' }}>
        {/* Header */}
        <div style={{ ...card, marginBottom: 14 }}>
          <div style={hdr}>
            <span>{item.phase}</span>
            <span style={{ fontSize: 18, fontWeight: 900 }}>
              £{selling.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ ...row, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, color: 'var(--to-muted)' }}>
              Cost: <strong style={{ color: 'var(--to-text)' }}>£{cost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ fontSize: 11, color: 'var(--to-muted)' }}>
              Markup:&nbsp;
              <input
                type="number" min={0} max={200} style={{ ...inputStyle, width: 60, display: 'inline-block', padding: '2px 4px' }}
                value={markup}
                onChange={e => saveItemEdit({ ...item, taskMarkupPct: +e.target.value })}
              />
              %
            </div>
          </div>
        </div>

        {/* Drawing label */}
        {linkedEl && (
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Drawing Label</label>
            <input style={inputStyle} value={linkedEl.label}
              onChange={e => saveElementEdit({ ...linkedEl, label: e.target.value })} />
          </div>
        )}

        {/* Item name */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Item Name</label>
          <input style={inputStyle} value={item.name}
            onChange={e => saveItemEdit({ ...item, name: e.target.value })} />
        </div>

        {/* Subphase selector */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Sub-Phase</label>
          <select style={inputStyle} value={item.taskSubphaseId ?? (subphases[0]?.id ?? '')}
            onChange={e => {
              const sp = getAllSubphasesForPhase(item.phase).find(s => s.id === e.target.value)
              const firstTask = sp?.tasks[0]
              if (sp && firstTask) applyTask(sp.id, firstTask.id)
            }}>
            {subphases.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>

        {/* Task selector */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Task</label>
          <select style={inputStyle} value={item.taskId ?? (tasks[0]?.id ?? '')}
            onChange={e => applyTask(item.taskSubphaseId ?? subphases[0]?.id ?? '', e.target.value)}>
            {tasks.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* UK Warning */}
        {selSub?.ukWarning && (
          <div style={{
            background: darkMode ? '#2a1a00' : '#fffbe6',
            border: '1px solid #f59e0b',
            borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 11.5,
            color: darkMode ? '#fcd34d' : '#92400e', lineHeight: 1.5,
          }}>
            ⚠️ {selSub.ukWarning}
          </div>
        )}

        {/* Qty / Unit */}
        <div style={twoCol}>
          <div>
            <label style={labelStyle}>Qty</label>
            <input type="number" step="any" min={0} style={inputStyle}
              value={qty}
              onChange={e => {
                const q = +e.target.value
                const tk = selTask
                if (!tk) { saveItemEdit({ ...item, qty: q }); return }
                saveItemEdit({
                  ...item,
                  qty: q,
                  taskLabour:        +(tk.labour        * q).toFixed(2),
                  taskMaterials:     +(tk.materials     * q).toFixed(2),
                  taskPlant:         +(tk.plant         * q).toFixed(2),
                  taskSubcontractor: +(tk.subcontractor * q).toFixed(2),
                  taskOther:         +(tk.other         * q).toFixed(2),
                })
              }}
            />
          </div>
          <div>
            <label style={labelStyle}>Unit</label>
            <select style={inputStyle} value={item.unit}
              onChange={e => saveItemEdit({ ...item, unit: e.target.value })}>
              {(Object.keys(PHASE_TASK_UNIT_LABELS) as PhaseTaskUnit[]).map(u => (
                <option key={u} value={u}>{PHASE_TASK_UNIT_LABELS[u]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Cost breakdown */}
        <div style={card}>
          <div style={{ ...hdr, background: darkMode ? '#1a2a3a' : '#e0e8f0', color: 'var(--to-text)', fontSize: 11, padding: '8px 14px' }}>
            Cost Breakdown
          </div>
          <div style={{ padding: '10px 14px' }}>
            {(
              [
                { key: 'taskLabour',        label: '🔨 Labour',          color: '#f39c12' },
                { key: 'taskMaterials',     label: '📦 Materials',       color: '#3498db' },
                { key: 'taskPlant',         label: '🚜 Plant',           color: '#9b59b6' },
                { key: 'taskSubcontractor', label: '👷 Subcontractor',   color: '#e74c3c' },
                { key: 'taskOther',         label: '📋 Other',           color: '#95a5a6' },
              ] as { key: keyof TakeoffItem; label: string; color: string }[]
            ).map(({ key, label, color }) => (
              <div key={key} style={costRow}>
                <label style={{ ...costLabel, color }}>{label}</label>
                <input type="number" step="any" min={0} style={inputStyle}
                  value={(item[key] as number | undefined) ?? 0}
                  onChange={e => saveItemEdit({ ...item, [key]: +e.target.value })}
                />
              </div>
            ))}
            <div style={{ borderTop: `1px solid ${bdColor}`, paddingTop: 8, marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--to-muted)' }}>
                <span>Total Cost</span>
                <strong style={{ color: 'var(--to-text)' }}>£{cost.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4, color: accentColor, fontWeight: 700 }}>
                <span>Selling Price (incl. {markup}% markup)</span>
                <strong>£{selling.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Notes fields */}
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Client Description</label>
          <textarea style={{ ...inputStyle, height: 52, resize: 'none' }}
            value={item.spec ?? selTask?.notes ?? ''}
            onChange={e => saveItemEdit({ ...item, spec: e.target.value })}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Drawing Ref</label>
            <input style={inputStyle} value={item.drawingRef ?? ''}
              onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Phase</label>
            <select style={inputStyle} value={item.phase}
              onChange={e => saveItemEdit({ ...item, phase: e.target.value as import('@/lib/takeoff-types').TakeoffPhase })}>
              {TAKEOFF_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Building Regs Notes</label>
          <textarea style={{ ...inputStyle, height: 44, resize: 'none' }}
            value={item.buildingRegsNotes ?? ''}
            onChange={e => saveItemEdit({ ...item, buildingRegsNotes: e.target.value })}
          />
        </div>

        {/* Delete */}
        <button
          onClick={() => {
            setProject(p => ({ ...p, items: p.items.filter(it => it.id !== item.id) }))
            setEditingItem(null)
            setPanelMode('schedule')
          }}
          style={{
            background: 'none', border: `1px solid #c0392b`, color: '#c0392b',
            borderRadius: 6, padding: '6px 14px', fontSize: 12, cursor: 'pointer', width: '100%', marginTop: 4,
          }}
        >
          🗑 Delete Item
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
    if (item.phase === 'Site Setup & Demolition' && !item.demoSubphaseId) {
      const _allSubs = getAllDemoSubphases(customDemoSubphases)
      const _defSub  = _allSubs[0]
      const _defTask = _defSub.tasks[0]
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

    // Plastering
    if (item.phase === 'Plastering & Boarding') {
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
        foundationWidth: 600, foundationDepth: 1000, foundationType: 'trench_fill',
        unit:   'lm',
        qty:    +_len.toFixed(3),
        area:   +(_len * _wM).toFixed(3),
        volume: +(_len * _wM * _dM).toFixed(3),
      }
      saveItemEdit(item)
    }

    // Buildup (Floors, Foundations, rect/polygon External Walls, Plastering rect)
    const _phaseMakeups = PHASE_MAKEUPS[item.phase]
    const _isBuildupItem = !!item.floorMakeupId || (!!_phaseMakeups && !!linkedEl && linkedEl.type !== 'line')
    if (_isBuildupItem && !item.floorMakeupId) {
      const _idx = item.phase === 'Floors & Screeds' ? 1 : 0
      const _dm  = (_phaseMakeups ?? FLOOR_MAKEUPS)[_idx]
      item = { ...item, floorMakeupId: _dm.id, spec: _dm.clientDescription }
      saveItemEdit(item)
    }

    // Generic phase tasks
    const _phaseHasTasks = ALL_PHASE_SUBPHASES.some(s => s.phase === item.phase)
    if (_phaseHasTasks && !item.taskSubphaseId && !_isBuildupItem) {
      const _subs = getAllSubphasesForPhase(item.phase)
      const _ds = _subs[0]; const _dt = _ds?.tasks[0]
      if (_ds && _dt) {
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
    const isDemo           = item.phase === 'Site Setup & Demolition'
    const isExtWall        = item.phase === 'External Walls'
    const isIntWall        = item.phase === 'Internal Walls & Partitions' && isLineBased
    const isPlaster        = item.phase === 'Plastering & Boarding'
    const isBuildup        = _isBuildupItem
    const isFoundationLine = item.phase === 'Foundations' && isLineBased
    const isTurf           = isBuildup && item.phase === 'External Works & Landscaping'
    const isTaskPhase      = _phaseHasTasks && !isBuildup && !isExtWall && !isPlaster && !isIntWall && !isDemo && !isFoundationLine
    const showWallLine     = isLineBased && (isExtWall || isIntWall || isPlaster)
    const hasOpenings      = (isExtWall || isIntWall || isPlaster) && isLineBased

    // ── 4. Computed wall measurements ──────────────────────────────────────
    const wallLength     = item.length ?? 0
    const wallHeight     = item.wallHeight ?? (isExtWall ? 2.7 : 2.4)
    const openings       = item.openings ?? []
    const grossArea      = showWallLine ? +(wallLength * wallHeight).toFixed(3) : (item.area ?? 0)
    const openingsArea   = +openings.reduce((s, o) => s + o.width * o.height, 0).toFixed(3)
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
      { value: 'other',       label: 'Other',            makeupId: null          },
    ]
    // Resolve the FOUNDATION_MAKEUPS entry for the current foundationType
    const foundMakeupId = FOUNDATION_TYPE_OPTIONS.find(o => o.value === (item.foundationType ?? 'trench_fill'))?.makeupId ?? null
    const foundMakeup   = foundMakeupId ? FOUNDATION_MAKEUPS.find(m => m.id === foundMakeupId) : null

    // ── 5. Wall helpers ────────────────────────────────────────────────────
    function recalcWallAndSave(patch: Partial<TakeoffItem>) {
      const merged = { ...item, ...patch }
      const h    = merged.wallHeight    ?? wallHeight
      const ops  = merged.openings      ?? openings
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
    const allDemoSubs  = isDemo ? getAllDemoSubphases(customDemoSubphases) : []
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
        ...item, name: tk.name, spec: tk.notes ?? '',
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
    const buildArea  = item.area ?? 0
    const buildPerim = item.perimeter ??
      (linkedEl?.type === 'rect'    ? rectPerimeter(linkedEl.points, project.calibration.mpp)
        : linkedEl?.type === 'polygon' ? polyPerimeter(linkedEl.points, project.calibration.mpp)
        : 0)
    const layerToggles    = item.floorLayerToggles    ?? {}
    const layerThicknesses = item.floorLayerThicknesses ?? {}

    // ── 10. Accent colour ──────────────────────────────────────────────────
    const phaseAccents: Partial<Record<string, string>> = {
      'Site Setup & Demolition':     '#e74c3c',
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
                      <input type="number" value={thk} min={0}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
              <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

                {/* Tick — outside the box, to the left */}
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={ev => saveItemEdit({ ...itm, floorLayerToggles: { ...tgls, [layer.id]: ev.target.checked } })}
                  style={{ margin: 0, cursor: 'pointer', flexShrink: 0, accentColor: ac }}
                  title={enabled ? 'Disable layer' : 'Enable layer'}
                />

                {/* Named box — clicking opens the editor */}
                <div
                  onClick={() => setLayerModal({ layer, makeup: mk, item: itm, area, perim, accent: ac })}
                  style={{
                    flex: 1, cursor: 'pointer', borderRadius: 6,
                    padding: '7px 10px',
                    background: enabled ? (darkMode ? '#0a180a' : '#f8faf8') : (darkMode ? '#060c06' : '#f3f3f3'),
                    border: `1px solid ${enabled ? color + '55' : (darkMode ? '#1a1a1a' : '#ddd')}`,
                    opacity: enabled ? 1 : 0.5,
                    transition: 'border-color 0.15s',
                  }}>
                  {/* Layer name row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: enabled ? 'var(--to-text)' : 'var(--to-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {layer.name}{thk > 0 ? ` (${thk}mm)` : ''}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--to-muted)', lineHeight: 1 }}>›</span>
                  </div>
                  {/* Sub-row: qty + cost */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 3, paddingLeft: 14 }}>
                    <span style={{ fontSize: 10, color: 'var(--to-muted)', fontFamily: 'monospace' }}>
                      {lq} {lu}
                    </span>
                    {costTotal > 0 && (
                      <span style={{ fontSize: 10, color: ac, fontFamily: 'monospace', fontWeight: 600 }}>
                        £{Math.round(costTotal)}
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: 'var(--to-muted)', textTransform: 'capitalize', marginLeft: 'auto' }}>
                      {layer.category}
                    </span>
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
        {showWallLine && (
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
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--to-textb)', fontFamily: 'monospace', lineHeight: 1 }}>{fmt2(buildPerim)}</div>
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 2 }}>lm perimeter</div>
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
              {TAKEOFF_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
            </select>
          </div>

          {/* Build-up Type: shown immediately under Phase for External Walls */}
          {isExtWall && (() => {
            const _allWT   = allWallMakeups
            const _wMakeup = _allWT.find(m => m.id === item.floorMakeupId)
            const _builtIn = new Set(WALL_MAKEUPS.map(m => m.id))
            return (
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Build-up Type</label>
                <select style={{ ...inputStyle, color: accent }} value={item.floorMakeupId ?? ''}
                  onChange={e => {
                    const nm = _allWT.find(m => m.id === e.target.value)
                    saveItemEdit({ ...item, floorMakeupId: e.target.value, spec: nm?.clientDescription ?? item.spec, floorLayerToggles: {}, floorLayerThicknesses: {} })
                  }}>
                  <optgroup label="── Built-in Wall Types">
                    {WALL_MAKEUPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </optgroup>
                  {customWallTypes.length > 0 && (
                    <optgroup label="── Custom Wall Types">
                      {customWallTypes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {_wMakeup && (
                  <div style={{ fontSize: 10, color: 'var(--to-muted)', marginTop: 3, fontStyle: 'italic' }}>
                    {_builtIn.has(item.floorMakeupId ?? '') ? 'Built-in' : '★ Custom'} · {_wMakeup.layers.length} layer{_wMakeup.layers.length !== 1 ? 's' : ''}
                    {_wMakeup.labourHrsPerM2 > 0 && ` · ~${fmt2(netArea * _wMakeup.labourHrsPerM2)} hrs labour`}
                  </div>
                )}
              </div>
            )
          })()}

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
        <div style={secHdr}><span>📐</span><span>Measurement</span></div>
        <div style={secBody}>

          {/* Wall line: height + band + sides */}
          {showWallLine && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Wall / Storey Height (m)</label>
                <input type="number" step={0.05} min={0.1} max={12}
                  style={{ ...inputStyle, color: accent }}
                  value={wallHeight}
                  onChange={e => recalcWallAndSave({ wallHeight: Math.max(0.1, +e.target.value || wallHeight) })}
                />
              </div>

              {isExtWall && (
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
                  <input type="number" step={50} min={100} max={5000}
                    style={{ ...inputStyle, color: accent, fontWeight: 600 }}
                    value={foundWidthMM}
                    onChange={e => recalcFoundationAndSave({ foundationWidth: Math.max(50, +e.target.value || 600) })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Depth (mm)</label>
                  <input type="number" step={50} min={100} max={5000}
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
                  <input type="number" step="any" min={0} style={inputStyle} value={item.qty}
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

        {/* ════════════════ CONSTRUCTION ════════════════ */}
        <div style={secHdr}><span>🔧</span><span>Construction</span></div>
        <div style={secBody}>

          {/* Demo: category + task selectors */}
          {isDemo && demoSub && demoTask && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Construction Type</label>
                <select style={{ ...inputStyle, color: accent }} value={demoSub.id}
                  onChange={e => {
                    const ns = allDemoSubs.find(s => s.id === e.target.value) ?? allDemoSubs[0]
                    applyDemoTask(ns, ns.tasks[0])
                  }}>
                  {allDemoSubs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Build-Up Type</label>
                <select style={{ ...inputStyle, color: accent }} value={demoTask.id}
                  onChange={e => {
                    const t = demoSub.tasks.find(t => t.id === e.target.value) ?? demoSub.tasks[0]
                    applyDemoTask(demoSub, t)
                  }}>
                  {demoSub.tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
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

          {/* Int Wall: construction type + finish type */}
          {isIntWall && (
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

          {/* Plaster: finish type + layer schedule */}
          {isPlaster && (() => {
            const _pMakeup = PLASTER_MAKEUPS.find(m => m.id === item.floorMakeupId)
            return (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Finish Type</label>
                  <select style={{ ...inputStyle, color: accent }} value={item.floorMakeupId ?? ''}
                    onChange={e => {
                      const nm = PLASTER_MAKEUPS.find(m => m.id === e.target.value)
                      saveItemEdit({ ...item, floorMakeupId: e.target.value, spec: nm?.clientDescription ?? item.spec, floorLayerToggles: {}, floorLayerThicknesses: {} })
                    }}>
                    {PLASTER_MAKEUPS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {_pMakeup && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Construction Layers</label>
                    {renderLayerList(_pMakeup, isLineBased ? netArea : buildArea, wallPerimeter, layerToggles, layerThicknesses, item, accent)}
                  </div>
                )}
              </>
            )
          })()}

          {/* Foundation line: type + layer schedule */}
          {isFoundationLine && (
            <>
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Foundation Type</label>
                <select style={{ ...inputStyle, color: accent }}
                  value={item.foundationType ?? 'trench_fill'}
                  onChange={e => recalcFoundationAndSave({ foundationType: e.target.value })}>
                  {FOUNDATION_TYPE_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div style={{ fontSize: 10, color: 'var(--to-muted)', marginBottom: 10 }}>
                {fmt2(foundLength)} m × {foundWidthMM}mm × {foundDepthMM}mm deep
              </div>
              {/* Layer schedule — perimeter = foundLength (lm run), area = footprint */}
              {foundMakeup && (
                <div style={{ marginBottom: 4 }}>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Construction Layers</label>
                  {renderLayerList(foundMakeup, foundArea, foundLength, layerToggles, layerThicknesses, item, accent)}
                </div>
              )}
              {!foundMakeup && (
                <div style={{ fontSize: 11, color: 'var(--to-muted)', fontStyle: 'italic' }}>
                  No layer schedule for "Other" — add layers manually in the Outputs section.
                </div>
              )}
            </>
          )}

          {/* Buildup (Floors, Foundations, Turfing): makeup type + layer schedule.
              Ext Walls and Plastering have their own dedicated sections above. */}
          {isBuildup && !isExtWall && !isPlaster && (() => {
            const _bm = _phaseMakeups ?? FLOOR_MAKEUPS
            return (
              <>
                <div style={{ marginBottom: 10 }}>
                  <label style={labelStyle}>Build-Up Type</label>
                  <select style={{ ...inputStyle, color: accent }} value={item.floorMakeupId ?? ''}
                    onChange={e => {
                      const nm = _bm.find(m => m.id === e.target.value)
                      saveItemEdit({ ...item, floorMakeupId: e.target.value, spec: nm?.clientDescription ?? item.spec, floorLayerToggles: {}, floorLayerThicknesses: {} })
                    }}>
                    {_bm.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                {bMakeup && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Construction Layers</label>
                    {renderLayerList(bMakeup, buildArea, buildPerim, layerToggles, layerThicknesses, item, accent)}
                  </div>
                )}
              </>
            )
          })()}

          {/* Task phases: subphase + task selectors */}
          {isTaskPhase && taskSelSub && (
            <>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Construction Type</label>
                <select style={{ ...inputStyle, color: accent }}
                  value={item.taskSubphaseId ?? (taskSubs[0]?.id ?? '')}
                  onChange={e => {
                    const sp = getAllSubphasesForPhase(item.phase).find(s => s.id === e.target.value)
                    if (sp?.tasks[0]) applyPhaseTask(sp.id, sp.tasks[0].id)
                  }}>
                  {taskSubs.map(sp => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelStyle}>Build-Up Type</label>
                <select style={{ ...inputStyle, color: accent }}
                  value={item.taskId ?? (taskList[0]?.id ?? '')}
                  onChange={e => applyPhaseTask(item.taskSubphaseId ?? taskSubs[0]?.id ?? '', e.target.value)}>
                  {taskList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              {taskSelSub?.ukWarning && (
                <div style={{ fontSize: 11, padding: '7px 10px', borderRadius: 5, marginBottom: 10, background: darkMode ? '#2a1a00' : '#fffbe6', border: '1px solid #f59e0b', color: darkMode ? '#fcd34d' : '#92400e', lineHeight: 1.5 }}>
                  ⚠️ {taskSelSub.ukWarning}
                </div>
              )}
            </>
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

        {/* ════════════════ OPENINGS ════════════════ */}
        {hasOpenings && (
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
              {openings.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--to-muted)', fontStyle: 'italic' }}>No openings — net area = gross area</div>
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
                      <input type="number" step={0.05} min={0.1}
                        style={{ ...inputStyle, textAlign: 'center', padding: '3px 4px', fontSize: 11 }}
                        value={op.width}
                        onChange={e => updateOpening(op.id, { width: Math.max(0.1, +e.target.value || op.width) })}
                      />
                      <span style={{ fontSize: 10, color: 'var(--to-muted)', textAlign: 'center' }}>×</span>
                      <input type="number" step={0.05} min={0.1}
                        style={{ ...inputStyle, textAlign: 'center', padding: '3px 4px', fontSize: 11 }}
                        value={op.height}
                        onChange={e => updateOpening(op.id, { height: Math.max(0.1, +e.target.value || op.height) })}
                      />
                      <button style={{ ...btnStyle, padding: '3px 6px', fontSize: 12, color: '#e74c3c', borderColor: '#e74c3c', justifyContent: 'center' }}
                        onClick={() => removeOpening(op.id)}>×</button>
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: 'var(--to-muted)', textAlign: 'right', marginTop: 4 }}>
                    Deductions: <strong style={{ color: '#e74c3c' }}>{fmt2(openingsArea)} m²</strong>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ════════════════ OUTPUTS ════════════════ */}
        <div style={secHdr}><span>📊</span><span>Outputs</span></div>
        <div style={secBody}>

          {/* Labour costing — always first, above materials */}
          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--to-border)' }}>
            <LabourCostBuilder
              labourLines={item.labourLines ?? []}
              trades={labourTrades}
              onChange={lines => saveItemEdit({ ...item, labourLines: lines })}
            />
          </div>

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
                    <input type="number" step="any" min={0}
                      style={{ ...inputStyle, fontSize: 10, padding: '2px 4px', textAlign: 'right' }}
                      value={+mat.qty.toFixed(3)}
                      onChange={e => updateMaterial(mat.id, { qty: +e.target.value })}
                    />
                    <span style={{ fontSize: 9, color: 'var(--to-muted)', textAlign: 'center' }}>{mat.unit}</span>
                    <input type="number" step="any" min={0}
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
                    <input type="number" min={0} step={1} style={{ ...inputStyle, paddingLeft: 18 }}
                      value={val}
                      onChange={e => saveItemEdit({ ...item, [key]: Math.max(0, +e.target.value || 0) })}
                    />
                  </div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, marginBottom: 4 }}>
                <div>
                  <label style={labelStyle}>Markup %</label>
                  <input type="number" min={0} max={200} step={1} style={inputStyle}
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
                  <input type="number" step="any" min={0} style={inputStyle}
                    value={(item[key] as number | undefined) ?? 0}
                    onChange={e => saveItemEdit({ ...item, [key]: +e.target.value })}
                  />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8, borderTop: '1px solid var(--to-border)', paddingTop: 8 }}>
                <div>
                  <label style={labelStyle}>Markup %</label>
                  <input type="number" min={0} max={200} style={inputStyle}
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
                  <input type="number" step="any" min={0} style={inputStyle}
                    value={(item[key] as number | undefined) ?? 0}
                    onChange={e => saveItemEdit({ ...item, [key]: +e.target.value })}
                  />
                </div>
              ))}
            </>
          )}
        </div>

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
    if (!editingItem) {
      return (
        <div style={{ padding: '16px', color: 'var(--to-muted)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>☝️</div>
          Click an element on the canvas to view and edit its properties.
          <br /><br />
          Or click <strong>+ Add Item</strong> to manually add a take-off line.
        </div>
      )
    }
    return renderUnifiedProperties(editingItem)
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
      <div style={{ overflowY: 'auto', height: '100%' }}>
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

        {/* Phase groups */}
        {phaseGroups.map(g => (
          <div key={g.phase}>
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
                  setEditingItem(item)
                  const el = item.elementId ? project.elements.find(e => e.id === item.elementId) ?? null : null
                  setEditingElement(el)
                  if (el) setSelectedId(el.id)
                  setPanelMode('properties')
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
                    ? <span style={{ color: '#f39c12' }}> · {FLOOR_MAKEUPS.find(m => m.id === item.floorMakeupId)?.name ?? 'Floor'}</span>
                    : item.spec ? ` · ${item.spec}` : ''}
                  {item.perimeter != null && (
                    <span style={{ color: '#6a8a6a' }}>, {fmt2(item.perimeter)}m perim</span>
                  )}
                  {item.drawingRef ? <span style={{ color: '#4a7a4a' }}> [{item.drawingRef}]</span> : ''}
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

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 48, background: 'var(--to-panel)', borderBottom: '1px solid var(--to-border)',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8, flexShrink: 0,
      }}>
        {/* Project name */}
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
            style={{ fontWeight: 700, fontSize: 13, color: 'var(--to-text)', cursor: 'text', minWidth: 120,
              padding: '3px 6px', borderRadius: 4, border: '1px solid transparent' }}
            title="Click to edit project name"
          >
            📐 {project.name}
          </div>
        )}

        <input
          style={{ ...inputStyle, width: 200, height: 28, fontSize: 12 }}
          placeholder="Address / project ref"
          value={project.address}
          onChange={e => setProject(p => ({ ...p, address: e.target.value }))}
        />

        {/* Client / project info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--to-text)', lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {project.client?.name ?? 'No client assigned'}
            </span>
            {(project.siteAddress ?? project.client?.address ?? '') && (
              <span style={{ fontSize: 10, color: 'var(--to-muted)', lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {project.siteAddress ?? project.client?.address ?? ''}
              </span>
            )}
            {project.projectName && (
              <span style={{ fontSize: 10, color: 'var(--to-dim)', lineHeight: 1.2, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

        <div style={{ width: 1, height: 28, background: 'var(--to-border)', margin: '0 4px' }} />

        {/* Scale */}
        <select
          style={{ ...inputStyle, width: 130, height: 28 }}
          value={project.calibration.label ?? ''}
          onChange={e => {
            const preset = SCALE_PRESETS.find(s => s.label === e.target.value)
            if (!preset) return
            if (preset.mpp === 0) { setShowCalib(true); return }
            // Snapshot current items/elements for the toast count (outside updater)
            const updatedItems = recalcItemsForMpp(project.items, project.elements, preset.mpp)
            const n = updatedItems.filter(it => !!it.elementId).length
            setProject(p => ({
              ...p,
              calibration: { mpp: preset.mpp, label: preset.label },
              items: recalcItemsForMpp(p.items, p.elements, preset.mpp),
            }))
            showToast(`Scale set to ${preset.label} — ${n} item${n !== 1 ? 's' : ''} recalculated ✓`)
          }}
        >
          {SCALE_PRESETS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
          {/* Show current custom calibration label if it isn't one of the presets */}
          {project.calibration.label && !SCALE_PRESETS.some(s => s.label === project.calibration.label) && (
            <option value={project.calibration.label}>{project.calibration.label}</option>
          )}
        </select>

        <button style={btnStyle} onClick={() => setShowCalib(true)} title="Calibrate scale from drawing">
          📏 Calibrate
        </button>

        <button style={{ ...btnStyle, background: showGrid ? '#2b5a2b' : '#1e2e1e' }}
          onClick={() => setShowGrid(v => !v)} title="Toggle grid">
          ⊞ Grid
        </button>

        <div style={{ flex: 1 }} />

        <input type="file" accept="image/*,application/pdf,.pdf" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageLoad} />
        <button style={btnStyle} onClick={() => fileInputRef.current?.click()} disabled={pdfLoading}>
          {pdfLoading ? '⏳ Loading…' : '🖼 Load Plan'}
        </button>

        {/* PDF page navigation */}
        {pdfTotalPages > 1 && (
          <>
            <button style={{ ...btnStyle, padding: '6px 8px' }}
              disabled={pdfCurrentPage <= 1 || pdfLoading}
              onClick={() => renderPdfPage(pdfCurrentPage - 1)}>
              ◀
            </button>
            <span style={{ fontSize: 12, color: '#c8d8a8', whiteSpace: 'nowrap' }}>
              p.{pdfCurrentPage}/{pdfTotalPages}
            </span>
            <button style={{ ...btnStyle, padding: '6px 8px' }}
              disabled={pdfCurrentPage >= pdfTotalPages || pdfLoading}
              onClick={() => renderPdfPage(pdfCurrentPage + 1)}>
              ▶
            </button>
          </>
        )}

        {/* Zoom controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={{ ...btnStyle, padding: '6px 8px' }} onClick={() => {
            const rect = svgRef.current!.getBoundingClientRect()
            const cx = rect.width / 2, cy = rect.height / 2
            const nz = Math.min(zoom * 1.25, 20)
            setPanOffset({ x: cx - (cx - panOffset.x) * (nz / zoom), y: cy - (cy - panOffset.y) * (nz / zoom) })
            setZoom(nz)
          }} title="Zoom in (scroll wheel)">+</button>
          <span style={{ fontSize: 11, color: '#c8d8a8', minWidth: 38, textAlign: 'center', fontFamily: 'monospace' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button style={{ ...btnStyle, padding: '6px 8px' }} onClick={() => {
            const rect = svgRef.current!.getBoundingClientRect()
            const cx = rect.width / 2, cy = rect.height / 2
            const nz = Math.max(zoom / 1.25, 0.05)
            setPanOffset({ x: cx - (cx - panOffset.x) * (nz / zoom), y: cy - (cy - panOffset.y) * (nz / zoom) })
            setZoom(nz)
          }} title="Zoom out">−</button>
          <button style={btnStyle} onClick={() => fitToScreen()} title="Fit plan to screen">⊡</button>
        </div>

        <input type="file" accept=".json" ref={importJsonRef} style={{ display: 'none' }} onChange={handleImportJson} />
        <button style={btnStyle} onClick={() => importJsonRef.current?.click()}>
          📂 Open
        </button>

        <button style={btnStyle} onClick={() => exportJSON(project)}>
          💾 JSON
        </button>
        <button style={btnStyle} onClick={() => exportCSV(project)}>
          📊 CSV
        </button>

        <div style={{ width: 1, height: 28, background: 'var(--to-border)' }} />

        {/* Reset cluster */}
        <button
          style={{ ...btnStyle, color: '#7ab533', borderColor: '#3a5a2a' }}
          onClick={resetView}
          title="Reset zoom and pan only — drawings are kept"
        >
          ⊡ View
        </button>
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
          ↺ Takeoff
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          style={{
            ...btnStyle,
            padding: '6px 10px',
            background: darkMode ? 'var(--to-hover)' : 'rgba(122,181,51,0.12)',
            borderColor: 'var(--to-accent)',
            color: 'var(--to-accent)',
            gap: 4,
          }}
        >
          {darkMode ? '☀' : '◑'} {darkMode ? 'Light' : 'Dark'}
        </button>

        <div style={{ width: 1, height: 28, background: 'var(--to-border)' }} />

        <button style={{ ...btnStyle, background: '#c0392b33', borderColor: '#c0392b', color: '#e57373' }}
          onClick={handleNew}>
          + New
        </button>
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
          ] as { t: DrawingTool; icon: string; label: string }[]).map(({ t, icon, label }) => (
            <div
              key={t}
              onClick={() => { setTool(t); if (t === 'select') { setDrawPoints([]); setIsDrawing(false) } }}
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
          {TAKEOFF_PHASES.map(ph => (
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
          <svg
            ref={svgRef}
            width={svgSize.w}
            height={svgSize.h}
            style={{
              display: 'block',
              position: 'absolute', top: 0, left: 0,
              cursor: isPanning ? 'grabbing' : spaceHeld ? 'grab' : tool === 'select' ? 'default' : 'crosshair',
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
            {/* Everything inside this group is zoomed/panned together */}
            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>

              {/* Plan image */}
              {planImage && canvasImgSize && (
                <image
                  href={planImage}
                  x={0} y={0}
                  width={canvasImgSize.w}
                  height={canvasImgSize.h}
                  preserveAspectRatio="none"
                />
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
              {project.elements.filter(el => !hiddenPhases.has(el.phase)).map(renderElement)}

              {/* Vertex handles — rendered above all elements when an element is selected.
                  Shown in ALL tool modes so the user can immediately adjust a just-drawn
                  element without having to switch to select mode first.
                  Both onMouseDown AND onClick stop propagation so clicks never leak to
                  handleSvgClick (which would add a draw point in line/polygon mode). */}
              {selectedId && (() => {
                const el = project.elements.find(e => e.id === selectedId)
                if (!el) return null
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
            const drawnPhases = TAKEOFF_PHASES.filter(ph => project.elements.some(el => el.phase === ph))
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
                {SCALE_PRESETS.filter(s => s.mpp > 0).map(s => (
                  <button key={s.label} style={{ ...btnStyle, fontSize: 11 }}
                    onClick={() => {
                      setProject(p => ({ ...p, calibration: { mpp: s.mpp, label: s.label } }))
                      setShowCalib(false)
                    }}>
                    {s.label}
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
                  <input type="number" style={inputStyle} placeholder="e.g. 5.0"
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
                Reset Takeoff
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
