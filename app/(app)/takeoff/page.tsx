'use client'

import { useState, useRef, useEffect, useCallback, ChangeEvent } from 'react'
import {
  TAKEOFF_PHASES, PHASE_COLORS, DEFAULT_MPP, SCALE_PRESETS,
  type TakeoffPhase, type DrawingTool, type TakeoffPoint,
  type DrawnElement, type TakeoffItem, type TakeoffProject, type ScaleCalibration,
} from '@/lib/takeoff-types'

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

// ── localStorage key ──────────────────────────────────────────────────────────
const LS_KEY = 'sbc_takeoff_project'

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

// ── Panel modes ───────────────────────────────────────────────────────────────
type PanelMode = 'schedule' | 'properties'

// ── Component ─────────────────────────────────────────────────────────────────
export default function TakeoffPage() {
  // Project state
  const [project, setProject] = useState<TakeoffProject>(() => loadProject() ?? blankProject())
  const [planImage, setPlanImage] = useState<string | null>(null)

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

  // Refs
  const svgRef = useRef<SVGSVGElement>(null)
  const queuedFinishRef = useRef<DrawnElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importJsonRef = useRef<HTMLInputElement>(null)

  // ── Persist on change ──────────────────────────────────────────────────────
  useEffect(() => {
    const p = { ...project, updatedAt: new Date().toISOString() }
    if (planImage) p.planImageUrl = planImage
    saveProject(p)
  }, [project, planImage])

  // ── Handle queued element (dblclick batching) ──────────────────────────────
  useEffect(() => {
    const el = queuedFinishRef.current
    if (!el) return
    queuedFinishRef.current = null
    const item = itemFromElement(el, project.calibration.mpp)
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

  // ── SVG coordinate helper ──────────────────────────────────────────────────
  function svgCoords(e: React.MouseEvent<SVGSVGElement>): TakeoffPoint {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    setMousePos(svgCoords(e))
  }

  function handleSvgClick(e: React.MouseEvent<SVGSVGElement>) {
    if (tool === 'select') return
    if (calibDrawing) {
      const pt = svgCoords(e)
      if (calibPts.length < 2) setCalibPts(prev => [...prev, pt])
      return
    }
    const pt = svgCoords(e)
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
    e.preventDefault()
    const pts = [...drawPoints]
    if (pts.length < 2) { setDrawPoints([]); setIsDrawing(false); return }
    finishElement(tool, pts)
  }

  function finishElement(type: 'line' | 'rect' | 'polygon', pts: TakeoffPoint[]) {
    const color = PHASE_COLORS[activePhase]
    const el: DrawnElement = {
      id: uid(),
      type,
      points: pts,
      phase: activePhase,
      label: `${activePhase} ${Date.now().toString(36).slice(-4)}`,
      color,
    }
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

  // ── Load plan image ────────────────────────────────────────────────────────
  function handleImageLoad(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setPlanImage(ev.target?.result as string)
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
    setProject(p => ({ ...p, calibration: { mpp, label: calibLabel || `${realM}m ref` } }))
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

  // ── Keyboard shortcut: Delete ──────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ── Render: SVG elements ───────────────────────────────────────────────────
  function renderElement(el: DrawnElement) {
    const sel = selectedId === el.id
    const stroke = sel ? '#fff' : el.color
    const sw = sel ? 3 : 2
    const fill = el.color + '33'  // 20% opacity

    if (el.type === 'line') {
      const pts = el.points.map(p => `${p.x},${p.y}`).join(' ')
      const mid = centroid(el.points)
      return (
        <g key={el.id} onClick={() => selectElement(el)} style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}>
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
        <g key={el.id} onClick={() => selectElement(el)} style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}>
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
        <g key={el.id} onClick={() => selectElement(el)} style={{ cursor: tool === 'select' ? 'pointer' : 'default' }}>
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
    const color = PHASE_COLORS[activePhase]
    const allPts = [...drawPoints, mousePos]

    if (tool === 'rect') {
      if (drawPoints.length < 1) return null
      const { x, y, width: w, height: h } = rectAttrs([drawPoints[0], mousePos])
      return <rect x={x} y={y} width={w} height={h} fill={color + '22'} stroke={color} strokeWidth={2} strokeDasharray="5 3" />
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
      <g>
        <polyline points={ptsStr} fill="none" stroke="#f1c40f" strokeWidth={2} strokeDasharray="4 3" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4} fill="#f1c40f" />)}
      </g>
    )
  }

  // ── Properties panel ───────────────────────────────────────────────────────
  function renderProperties() {
    if (!editingItem) {
      return (
        <div style={{ padding: '16px', color: '#888', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>☝️</div>
          Click an element on the canvas to view and edit its properties.
          <br /><br />
          Or click <strong>+ Add Item</strong> to manually add a take-off line.
        </div>
      )
    }

    const item = editingItem
    const el = editingElement

    return (
      <div style={{ padding: 14, fontSize: 13, overflowY: 'auto', height: '100%' }}>
        {/* Element label (if linked) */}
        {el && (
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Drawing Label</label>
            <input
              style={inputStyle}
              value={el.label}
              onChange={e => saveElementEdit({ ...el, label: e.target.value })}
            />
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Item Name</label>
          <input
            style={inputStyle}
            value={item.name}
            onChange={e => saveItemEdit({ ...item, name: e.target.value })}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Phase</label>
          <select
            style={inputStyle}
            value={item.phase}
            onChange={e => saveItemEdit({ ...item, phase: e.target.value as TakeoffPhase })}
          >
            {TAKEOFF_PHASES.map(ph => <option key={ph} value={ph}>{ph}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Qty</label>
            <input type="number" style={inputStyle} value={item.qty}
              onChange={e => saveItemEdit({ ...item, qty: +e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Unit</label>
            <select style={inputStyle} value={item.unit}
              onChange={e => saveItemEdit({ ...item, unit: e.target.value })}>
              {['m', 'm²', 'm³', 'nr', 'item', 'bag', 'tonne', 'kg', 'litre', 'hr', 'day'].map(u =>
                <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Spec / Description</label>
          <textarea
            style={{ ...inputStyle, height: 52, resize: 'none' }}
            value={item.spec ?? ''}
            onChange={e => saveItemEdit({ ...item, spec: e.target.value })}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Drawing Ref</label>
            <input style={inputStyle} value={item.drawingRef ?? ''}
              onChange={e => saveItemEdit({ ...item, drawingRef: e.target.value })} />
          </div>
          <div>
            <label style={labelStyle}>Sub-Phase</label>
            <input style={inputStyle} value={item.subPhase ?? ''}
              onChange={e => saveItemEdit({ ...item, subPhase: e.target.value })} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
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

        {/* Measurements (read-only if from canvas) */}
        {(item.length || item.area || item.volume) && (
          <div style={{ background: '#1a2a1a', borderRadius: 6, padding: '10px 12px', marginBottom: 12, fontSize: 12 }}>
            <div style={{ fontSize: 11, color: '#8aa', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
              Measurements (from canvas)
            </div>
            {item.length  != null && <div style={dimRow}><span>Length</span><span>{fmtM(item.length)}</span></div>}
            {item.width   != null && <div style={dimRow}><span>Width</span><span>{fmtM(item.width)}</span></div>}
            {item.height  != null && <div style={dimRow}><span>Height</span><span>{fmtM(item.height)}</span></div>}
            {item.area    != null && <div style={dimRow}><span>Area</span><span>{fmt2(item.area)} m²</span></div>}
            {item.volume  != null && <div style={dimRow}><span>Volume</span><span>{fmt2(item.volume)} m³</span></div>}
          </div>
        )}

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

  // ── Render: schedule panel ─────────────────────────────────────────────────
  function renderSchedule() {
    if (project.items.length === 0) {
      return (
        <div style={{ padding: '24px 16px', color: '#888', fontSize: 13, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>📋</div>
          No items yet.
          <br /><br />
          Draw on the canvas or click <strong>+ Add Item</strong> to start your take-off schedule.
        </div>
      )
    }

    return (
      <div style={{ overflowY: 'auto', height: '100%' }}>
        {/* Item count summary */}
        <div style={{ padding: '10px 14px', background: '#1a2a1a', borderBottom: '1px solid #2a3a2a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#8aa', textTransform: 'uppercase', letterSpacing: 1 }}>
            Quantities
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#c8d8a8' }}>
            {project.items.length} item{project.items.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Phase groups */}
        {phaseGroups.map(g => (
          <div key={g.phase}>
            <div style={{ padding: '8px 14px', background: '#162216', borderBottom: '1px solid #2a3a2a',
              display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: PHASE_COLORS[g.phase], flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#c8d8a8' }}>{g.phase}</span>
              <span style={{ fontSize: 11, color: '#6a8a6a', background: '#0d1a0d', borderRadius: 10,
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
                  padding: '7px 14px', borderBottom: '1px solid #1a2a1a',
                  cursor: 'pointer', background: editingItem?.id === item.id ? '#1a2e1a' : 'transparent',
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, color: '#dde', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                <div style={{ fontSize: 11, color: '#6a8a6a', marginTop: 2 }}>
                  <span style={{ color: '#c8d8a8', fontFamily: 'monospace' }}>
                    {item.qty} {item.unit}
                  </span>
                  {item.spec ? ` · ${item.spec}` : ''}
                  {item.drawingRef ? <span style={{ color: '#4a7a4a' }}> [{item.drawingRef}]</span> : ''}
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Export to quote button */}
        <div style={{ padding: '14px', borderTop: '1px solid #2a3a2a', marginTop: 8 }}>
          <button style={{ ...btnStyle, width: '100%', background: '#2b3a2b', justifyContent: 'center' }}
            onClick={exportForQuote}>
            📤 Export for Quote Import
          </button>
          <div style={{ fontSize: 11, color: '#6a8a6a', marginTop: 6, textAlign: 'center' }}>
            Then use &ldquo;📐 Import Take-off&rdquo; in New Quote
          </div>
        </div>
      </div>
    )
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#0d1a0d', border: '1px solid #2a3a2a', borderRadius: 5,
    color: '#dde', padding: '5px 8px', fontSize: 12, boxSizing: 'border-box',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, color: '#6a8a6a', letterSpacing: 1,
    textTransform: 'uppercase', marginBottom: 4,
  }
  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px',
    background: '#1e2e1e', border: '1px solid #3a4a3a', borderRadius: 5,
    color: '#c8d8a8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  }
  const dimRow: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', color: '#9ab', fontSize: 12, marginBottom: 3,
  }
  const toolBtn = (t: DrawingTool): React.CSSProperties => ({
    width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: tool === t ? '#2b5a2b' : '#1a2a1a',
    border: tool === t ? '1px solid #4a8a4a' : '1px solid #2a3a2a',
    borderRadius: 6, cursor: 'pointer', fontSize: 16, color: '#c8d8a8',
    marginBottom: 4,
  })

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      margin: '-26px -32px',
      height: 'calc(100dvh - 56px)',
      display: 'flex',
      flexDirection: 'column',
      background: '#0d1a0d',
      color: '#dde',
      fontFamily: 'system-ui, sans-serif',
      overflow: 'hidden',
    }}>

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div style={{
        height: 48, background: '#162216', borderBottom: '1px solid #2a3a2a',
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
            style={{ fontWeight: 700, fontSize: 13, color: '#c8d8a8', cursor: 'text', minWidth: 120,
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

        <div style={{ width: 1, height: 28, background: '#2a3a2a', margin: '0 4px' }} />

        {/* Scale */}
        <select
          style={{ ...inputStyle, width: 130, height: 28 }}
          value={project.calibration.label ?? ''}
          onChange={e => {
            const preset = SCALE_PRESETS.find(s => s.label === e.target.value)
            if (!preset) return
            if (preset.mpp === 0) { setShowCalib(true); return }
            setProject(p => ({ ...p, calibration: { mpp: preset.mpp, label: preset.label } }))
          }}
        >
          {SCALE_PRESETS.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
          <option value={project.calibration.label ?? ''}>{project.calibration.label ?? 'Scale'}</option>
        </select>

        <button style={btnStyle} onClick={() => setShowCalib(true)} title="Calibrate scale from drawing">
          📏 Calibrate
        </button>

        <button style={{ ...btnStyle, background: showGrid ? '#2b5a2b' : '#1e2e1e' }}
          onClick={() => setShowGrid(v => !v)} title="Toggle grid">
          ⊞ Grid
        </button>

        <div style={{ flex: 1 }} />

        <input type="file" accept="image/*" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImageLoad} />
        <button style={btnStyle} onClick={() => fileInputRef.current?.click()}>
          🖼 Load Plan
        </button>

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

        <button style={{ ...btnStyle, background: '#c0392b33', borderColor: '#c0392b' }}
          onClick={handleNew}>
          + New
        </button>
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel: tool icons + phase legend */}
        <div style={{
          width: 56, background: '#162216', borderRight: '1px solid #2a3a2a',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '8px 0', gap: 0, flexShrink: 0, overflowY: 'auto',
        }}>
          <div title="Select" style={toolBtn('select')} onClick={() => setTool('select')}>↖</div>
          <div title="Line / Polyline" style={toolBtn('line')} onClick={() => setTool('line')}>╱</div>
          <div title="Rectangle" style={toolBtn('rect')} onClick={() => setTool('rect')}>▭</div>
          <div title="Polygon" style={toolBtn('polygon')} onClick={() => setTool('polygon')}>⬠</div>

          <div style={{ width: 36, height: 1, background: '#2a3a2a', margin: '8px 0' }} />

          {/* + Add manual item */}
          <div title="Add manual item" style={{ ...toolBtn('select'), background: '#1e2e1e', border: '1px solid #3a4a3a' }}
            onClick={addManualItem}>
            +
          </div>

          <div style={{ width: 36, height: 1, background: '#2a3a2a', margin: '8px 0' }} />

          {/* Phase color dots */}
          {TAKEOFF_PHASES.map(ph => (
            <div
              key={ph}
              title={ph}
              onClick={() => setActivePhase(ph)}
              style={{
                width: 28, height: 28, borderRadius: 5, marginBottom: 3, cursor: 'pointer',
                background: PHASE_COLORS[ph],
                border: activePhase === ph ? '2px solid #fff' : '2px solid transparent',
                opacity: activePhase === ph ? 1 : 0.65,
                transition: 'all 0.15s',
              }}
            />
          ))}
        </div>

        {/* Centre: SVG canvas */}
        <div
          ref={containerRef}
          style={{
            flex: 1, overflow: 'hidden', position: 'relative', background: '#0d1a0d',
            backgroundImage: planImage ? `url(${planImage})` : undefined,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
          }}
        >
          <svg
            ref={svgRef}
            width={svgSize.w}
            height={svgSize.h}
            style={{
              display: 'block',
              position: 'absolute', top: 0, left: 0,
              cursor: tool === 'select' ? 'default' : 'crosshair',
            }}
            onClick={handleSvgClick}
            onDoubleClick={handleSvgDblClick}
            onMouseMove={handleMouseMove}
          >
            {/* Grid */}
            {showGrid && (() => {
              const mpp = project.calibration.mpp || DEFAULT_MPP
              const pxPerM = 1 / mpp
              const minor = Math.max(4, pxPerM)   // 1m grid
              const major = minor * 5               // 5m grid
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
                  <rect width="100%" height="100%" fill="url(#grid-major)" />
                </g>
              )
            })()}

            {/* Drawn elements */}
            {project.elements.map(renderElement)}

            {/* In-progress ghost */}
            {renderGhost()}

            {/* Calibration ghost */}
            {renderCalibGhost()}

            {/* Origin cross */}
            <line x1={20} y1={10} x2={20} y2={30} stroke="#2a4a2a" strokeWidth={1} />
            <line x1={10} y1={20} x2={30} y2={20} stroke="#2a4a2a" strokeWidth={1} />

            {/* Scale indicator */}
            {(() => {
              const mpp = project.calibration.mpp || DEFAULT_MPP
              const pxPer5m = 5 / mpp
              const barW = Math.min(pxPer5m, 120)
              const realM = barW * mpp
              const x = svgSize.w - barW - 20
              const y = svgSize.h - 20
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

          {/* Status bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 22,
            background: '#162216', borderTop: '1px solid #2a3a2a',
            display: 'flex', alignItems: 'center', padding: '0 10px', gap: 16,
            fontSize: 11, color: '#6a8a6a',
          }}>
            <span>Tool: <strong style={{ color: '#c8d8a8' }}>{
              calibDrawing ? '📏 CALIBRATING' :
              tool === 'select' ? 'Select' :
              tool === 'line' ? 'Line / Polyline (dbl-click to finish)' :
              tool === 'rect' ? 'Rectangle (click start, click finish)' :
              'Polygon (dbl-click to close)'
            }</strong></span>
            <span>Phase: <strong style={{ color: PHASE_COLORS[activePhase] }}>{activePhase}</strong></span>
            <span>Scale: <strong style={{ color: '#c8d8a8' }}>{project.calibration.label || '—'}</strong></span>
            <span>x: {Math.round(mousePos.x)}, y: {Math.round(mousePos.y)}</span>
            {selectedId && <span style={{ color: '#f1c40f' }}>Selected — press Delete to remove</span>}
            {isDrawing && drawPoints.length > 0 && (
              <span style={{ color: '#c8d8a8' }}>
                {drawPoints.length} point{drawPoints.length !== 1 ? 's' : ''}
                {tool !== 'rect' ? ' — dbl-click to finish' : ' — click to finish'}
              </span>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{
          width: 300, background: '#162216', borderLeft: '1px solid #2a3a2a',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {/* Panel tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #2a3a2a', flexShrink: 0 }}>
            {(['schedule', 'properties'] as PanelMode[]).map(m => (
              <button
                key={m}
                onClick={() => setPanelMode(m)}
                style={{
                  flex: 1, padding: '9px 0', background: panelMode === m ? '#1e2e1e' : 'transparent',
                  border: 'none', borderBottom: panelMode === m ? '2px solid #4a8a4a' : '2px solid transparent',
                  color: panelMode === m ? '#c8d8a8' : '#6a8a6a', fontSize: 12, cursor: 'pointer',
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
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: '#162216', border: '1px solid #2a3a2a', borderRadius: 10,
            padding: 28, width: 420, maxWidth: '90vw',
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#c8d8a8' }}>📏 Scale Calibration</h3>

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

            <div style={{ borderTop: '1px solid #2a3a2a', paddingTop: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#9ab', marginBottom: 12 }}>
                Or draw a line over a known dimension on the plan, then enter its real-world length:
              </p>

              <button
                style={{ ...btnStyle, background: calibDrawing ? '#2b5a2b' : '#1e2e1e',
                  borderColor: calibDrawing ? '#4a8a4a' : '#3a4a3a', marginBottom: 12 }}
                onClick={() => { setCalibDrawing(!calibDrawing); setCalibPts([]) }}
              >
                {calibDrawing ? '✓ Click 2 points on plan' : '✏️ Draw calibration line'}
              </button>

              {calibPts.length === 2 && (
                <div style={{ fontSize: 12, color: '#c8d8a8', marginBottom: 8 }}>
                  ✓ Line drawn ({Math.round(Math.sqrt(
                    Math.pow(calibPts[1].x - calibPts[0].x, 2) +
                    Math.pow(calibPts[1].y - calibPts[0].y, 2)
                  ))}px)
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
    </div>
  )
}
