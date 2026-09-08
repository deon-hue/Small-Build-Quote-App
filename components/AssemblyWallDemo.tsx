'use client'

/**
 * Assembly Calculator — Stage 2 preview (Timber Frame Wall).
 *
 * A demonstration of what a sub-phase looks like once it's wired to an "assembly" —
 * see the assembly-calculator feasibility report, §17 Stage 2. This is intentionally
 * disconnected from the real quote: every number here is local component state,
 * seeded with sample data and sample Back Office-style rates. Nothing is fetched from
 * Supabase, nothing is written to any quote, and closing this panel discards it.
 *
 * Purpose: let the user see and try the calculator's shape (elevation, properties,
 * live cost breakdown) before Stage 3 wires it to a real Back Office assembly record
 * and an "Add to Quote" action for the Walls phase.
 */

import React, { useMemo, useState, useRef } from 'react'
import {
  calculateWallCost, studPositionsMm,
  type WallInput, type AssemblyOpening, type AssemblyLayerDef, type CostedLine,
} from '@/lib/assembly-calc'
import { fmt } from '@/lib/utils'

// ── Sample Back Office-style rates (placeholders — Stage 3 will pull these live) ──
const SAMPLE_HOURLY_RATE = 28 // £/hr, stand-in for a Back Office labour trade's day rate ÷ 8

function buildSampleLayers(wastePct: number): AssemblyLayerDef[] {
  return [
    { id: 'studs',     name: 'CLS studs 89×38',        category: 'materials', source: 'studCount',    unit: 'nr',    unitCost: 4.20,  roundToWhole: true },
    { id: 'plates',    name: 'Head & sole plate',       category: 'materials', source: 'plateLm',      unit: 'lm',    unitCost: 3.80,  wastePct: 5 },
    { id: 'noggins',   name: 'Noggins',                 category: 'materials', source: 'nogginCount',  unit: 'nr',    unitCost: 2.10,  roundToWhole: true },
    { id: 'headers',   name: 'Header / lintel timber',  category: 'materials', source: 'headerCount',  unit: 'nr',    unitCost: 45.00, roundToWhole: true },
    { id: 'sheathing', name: 'OSB3 sheathing',          category: 'materials', source: 'netAreaM2',    unit: 'sheet', unitCost: 18.50, wastePct, coveragePerUnit: 2.88, roundToWhole: true },
    { id: 'membrane',  name: 'Breather membrane',       category: 'materials', source: 'grossAreaM2',  unit: 'm²',    unitCost: 1.20,  wastePct },
    { id: 'insulation',name: 'Insulation (between studs)', category: 'materials', source: 'netAreaM2', unit: 'm²',    unitCost: 8.50,  wastePct },
    { id: 'lining',    name: 'Plasterboard lining',     category: 'materials', source: 'netAreaM2',    unit: 'm²',    unitCost: 6.90,  wastePct },
    { id: 'labour-area', name: 'Fix & sheet frame',     category: 'labour',    source: 'grossAreaM2',  unit: 'hr',    unitCost: SAMPLE_HOURLY_RATE, coveragePerUnit: 1 / 0.75 },
    { id: 'labour-openings', name: 'Frame each opening', category: 'labour',  source: 'headerCount',   unit: 'hr',    unitCost: SAMPLE_HOURLY_RATE, coveragePerUnit: 1 / 2 },
  ]
}

const CATEGORY_LABEL: Record<string, string> = { materials: 'Materials', labour: 'Labour', plant: 'Plant', subcontractors: 'Subcontractors', other: 'Other' }

let _openingId = 0
const newOpeningId = () => `op-${++_openingId}`

function sampleOpenings(): AssemblyOpening[] {
  return [{ id: newOpeningId(), kind: 'window', widthMm: 1200, heightMm: 1200, offsetMm: 2000, sillHeightMm: 900 }]
}

interface Props {
  /** Omit when embedded as a fixed section (e.g. Back Office) rather than a dismissible overlay. */
  onClose?: () => void
  /** Present when opened from a real quote sub-phase — writes this calculation's costed
   * lines into it, replacing whatever was there before. Absent in Back Office's preview. */
  onSave?: (result: { name: string; qty: number; lines: CostedLine[] }) => void
}

export default function AssemblyWallDemo({ onClose, onSave }: Props) {
  const [name, setName]         = useState('Timber Stud Partition')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(5000)
  const [heightMm, setHeightMm] = useState(2400)
  const [centresMm, setCentresMm] = useState(400)
  const [doubleTopPlate, setDoubleTopPlate] = useState(false)
  const [wastePct, setWastePct] = useState(10)
  const [openings, setOpenings] = useState<AssemblyOpening[]>(sampleOpenings)
  // Sample rates the user has overridden in this session — keyed by layer id. Still not
  // linked to real Products/Labour/Plant records, but editable here in the meantime.
  const [rateOverrides, setRateOverrides] = useState<Record<string, number>>({})

  const input: WallInput = { lengthMm, heightMm, studCentresMm: centresMm, doubleTopPlate, openings }
  const layers = useMemo(() => {
    const base = buildSampleLayers(wastePct)
    return base.map(l => rateOverrides[l.id] != null ? { ...l, unitCost: rateOverrides[l.id] } : l)
  }, [wastePct, rateOverrides])
  function setRate(layerId: string, unitCost: number) {
    setRateOverrides(prev => ({ ...prev, [layerId]: Math.max(0, unitCost) }))
  }

  const result = useMemo(() => {
    try { return { ok: true as const, value: calculateWallCost(input, layers) } }
    catch (e: any) { return { ok: false as const, error: e.message as string } }
  }, [lengthMm, heightMm, centresMm, doubleTopPlate, wastePct, JSON.stringify(openings)])

  function updateOpening(id: string, patch: Partial<AssemblyOpening>) {
    setOpenings(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o))
  }
  function removeOpening(id: string) {
    setOpenings(prev => prev.filter(o => o.id !== id))
  }
  function addOpening() {
    setOpenings(prev => [...prev, { id: newOpeningId(), kind: 'window', widthMm: 900, heightMm: 1200, offsetMm: 0, sillHeightMm: 900 }])
  }

  return (
    <div style={{ border: '2px dashed #7c3aed', borderRadius: 10, background: '#fdfaff', padding: 14, marginBottom: 20 }}>
      {/* Preview banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#7c3aed', color: '#fff' }}>
          🧪 PREVIEW
        </span>
        <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
          Assembly Calculator — sample data and sample rates, nothing here is saved yet
        </span>
        <div style={{ flex: 1 }} />
        {onClose && (
          <button onClick={onClose}
            style={{ background: 'none', border: '1px solid #e9d5ff', borderRadius: 5, color: '#7c3aed', fontSize: 12, cursor: 'pointer', padding: '3px 10px' }}>
            Close preview
          </button>
        )}
      </div>

      {/* Card header — mirrors a real sp-card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ fontWeight: 700, fontSize: 14, color: '#1e293b', flex: 1, border: 'none', outline: 'none', background: 'transparent' }} />
        <label style={{ fontSize: 11, color: '#64748b' }}>Qty</label>
        <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, +e.target.value || 1))}
          style={{ width: 48, fontSize: 12, padding: '3px 5px', border: '1px solid #e2e8f0', borderRadius: 4 }} />
        {result.ok && (
          <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#7ab533' }}>
            {fmt(result.value.totalCost * qty)}
          </span>
        )}
        {onSave && result.ok && (
          <button
            onClick={() => onSave({ name, qty, lines: result.value.lines })}
            title="Replace this sub-phase's cost items with this calculation's costed lines"
            style={{ background: '#16a34a', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px' }}>
            💾 Save &amp; Price
          </button>
        )}
      </div>

      {!result.ok ? (
        <div style={{ color: '#c0392b', fontSize: 12, padding: 8 }}>⚠ {result.error}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* Left: elevation + description */}
          <div>
            <WallElevationSvg input={input} onOpeningOffsetChange={(id, offsetMm) => updateOpening(id, { offsetMm })} />
            {result.value.geometry.warnings.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {result.value.geometry.warnings.map((w, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#c0392b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '4px 8px', marginBottom: 3 }}>
                    ⚠ {w}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
              {(lengthMm / 1000).toFixed(2)}m long × {(heightMm / 1000).toFixed(2)}m high, studs at {centresMm}mm centres,
              {' '}{openings.length} opening{openings.length !== 1 ? 's' : ''}.
              Net area {result.value.geometry.netAreaM2.toFixed(2)} m², {result.value.geometry.totalStuds} studs.
            </div>
          </div>

          {/* Right: properties */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PropRow label="Length (mm)">
              <input type="number" value={lengthMm} onChange={e => setLengthMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Height (mm)">
              <input type="number" value={heightMm} onChange={e => setHeightMm(Math.max(1, +e.target.value || 0))} style={propInput} />
            </PropRow>
            <PropRow label="Stud centres (mm)">
              <select value={centresMm} onChange={e => setCentresMm(+e.target.value)} style={propInput}>
                {[300, 400, 600].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </PropRow>
            <PropRow label="Top plate">
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={doubleTopPlate} onChange={e => setDoubleTopPlate(e.target.checked)} />
                Double top plate
              </label>
            </PropRow>
            <PropRow label={`Waste % (${wastePct}%)`}>
              <input type="range" min={0} max={25} value={wastePct} onChange={e => setWastePct(+e.target.value)} style={{ width: '100%' }} />
            </PropRow>

            {/* Openings */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>
                Openings
              </div>
              {openings.map(o => (
                <div key={o.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 20px', gap: 4, marginBottom: 4, alignItems: 'center' }}>
                  <select value={o.kind} onChange={e => updateOpening(o.id, { kind: e.target.value as AssemblyOpening['kind'], sillHeightMm: e.target.value === 'door' ? 0 : (o.sillHeightMm || 900) })} style={miniInput}>
                    <option value="window">Window</option>
                    <option value="door">Door</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input type="number" title="Width (mm)" value={o.widthMm} onChange={e => updateOpening(o.id, { widthMm: +e.target.value || 0 })} style={miniInput} />
                  <input type="number" title="Offset from left (mm)" value={o.offsetMm} onChange={e => updateOpening(o.id, { offsetMm: +e.target.value || 0 })} style={miniInput} />
                  <input type="number" title="Sill height (mm), 0 for a door" value={o.sillHeightMm} onChange={e => updateOpening(o.id, { sillHeightMm: +e.target.value || 0 })} style={miniInput} disabled={o.kind === 'door'} />
                  <button onClick={() => removeOpening(o.id)} title="Remove opening"
                    style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
              <button onClick={addOpening}
                style={{ fontSize: 11, border: '1px dashed #94a3b8', background: 'transparent', borderRadius: 4, color: '#64748b', padding: '3px 8px', cursor: 'pointer' }}>
                + Opening
              </button>
            </div>
          </div>

          {/* Breakdown — spans both columns */}
          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
            <BreakdownTable lines={result.value.lines} onRateChange={setRate} />
          </div>
        </div>
      )}
    </div>
  )
}

const propInput: React.CSSProperties = { width: '100%', fontSize: 12, padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }
const miniInput: React.CSSProperties = { width: '100%', fontSize: 11, padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, boxSizing: 'border-box' }

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
      {children}
    </div>
  )
}

function BreakdownTable({ lines, onRateChange }: { lines: CostedLine[]; onRateChange: (layerId: string, unitCost: number) => void }) {
  const groups = ['materials', 'labour', 'plant', 'subcontractors', 'other'] as const
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Cost breakdown — sample rates, editable for now until Products/Labour/Plant linking replaces them
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Item</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Raw qty</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Waste</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Purchase qty</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Unit cost</th>
            <th style={{ textAlign: 'right', padding: '4px 6px', fontSize: 10, color: '#94a3b8' }}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => {
            const groupLines = lines.filter(l => l.category === g)
            if (groupLines.length === 0) return null
            const groupTotal = groupLines.reduce((s, l) => s + l.cost, 0)
            return (
              <React.Fragment key={g}>
                <tr>
                  <td colSpan={6} style={{ padding: '6px 6px 2px', fontSize: 10, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    {CATEGORY_LABEL[g]}
                  </td>
                </tr>
                {groupLines.map(l => (
                  <tr key={l.layerId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '3px 6px' }}>{l.name}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{l.rawQty}</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', color: '#94a3b8' }}>{l.wastePct}%</td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{l.purchaseQty} {l.unit}</td>
                    <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>£</span>
                        <input
                          type="number" min={0} step={0.01} value={l.unitCost}
                          onChange={e => onRateChange(l.layerId, +e.target.value)}
                          title="Edit this sample rate"
                          style={{ width: 62, fontFamily: 'monospace', fontSize: 12, textAlign: 'right', padding: '2px 4px', border: '1px solid #e2e8f0', borderRadius: 4 }}
                        />
                      </div>
                    </td>
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>£{l.cost.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={5} style={{ padding: '2px 6px', textAlign: 'right', fontSize: 11, color: '#94a3b8' }}>{CATEGORY_LABEL[g]} total</td>
                  <td style={{ padding: '2px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>£{groupTotal.toFixed(2)}</td>
                </tr>
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A dimension line with end-ticks and a centred label — the standard elevation-drawing
// convention, used for every measurement annotation below rather than plain floating text.
function HDim({ x1, x2, y, label }: { x1: number; x2: number; y: number; label: string }) {
  if (Math.abs(x2 - x1) < 1) return null
  return (
    <g>
      <line x1={x1} y1={y - 4} x2={x1} y2={y + 4} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x2} y1={y - 4} x2={x2} y2={y + 4} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="#94a3b8" strokeWidth={1} />
      <text x={(x1 + x2) / 2} y={y - 3} textAnchor="middle" fontSize={8} fill="#64748b">{label}</text>
    </g>
  )
}
function VDim({ y1, y2, x, label }: { y1: number; y2: number; x: number; label: string }) {
  if (Math.abs(y2 - y1) < 1) return null
  return (
    <g>
      <line x1={x - 4} y1={y1} x2={x + 4} y2={y1} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x - 4} y1={y2} x2={x + 4} y2={y2} stroke="#94a3b8" strokeWidth={1} />
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#94a3b8" strokeWidth={1} />
      <text x={x + 5} y={(y1 + y2) / 2} dominantBaseline="middle" fontSize={8} fill="#64748b">{label}</text>
    </g>
  )
}

// ── Elevation SVG — a plan/elevation-style sketch of the wall, drawn from the same inputs
// the engine costs. Drag an opening left/right to reposition it — dimensions update live.
// King + jack studs are drawn as the doubled-up pair they actually are: the king stud runs
// full height to the sole plate, the jack stud is cut to the header's underside and sits
// right against it. Visual only — stud display positions approximate which field studs an
// opening displaces (matched to the grid), none of this feeds the numbers in the breakdown.
function WallElevationSvg({ input, onOpeningOffsetChange }: { input: WallInput; onOpeningOffsetChange: (id: string, offsetMm: number) => void }) {
  const { lengthMm: L, heightMm: H, studCentresMm: C, openings } = input
  const vbW = 640, vbH = 320, padX = 28, padTop = 20 + openings.length * 14, padBottom = 34
  const svgRef = useRef<SVGSVGElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  const availW = vbW - padX * 2, availH = vbH - padTop - padBottom
  const scale = Math.min(availW / L, availH / H)
  const w = L * scale, h = H * scale
  const x0 = padX + (availW - w) / 2, y0 = padTop + (availH - h) / 2
  const X = (mmVal: number) => x0 + mmVal * scale
  const Y = (mmVal: number) => y0 + h - mmVal * scale // y grows downward in SVG, up in real life

  const positions = studPositionsMm(L, C).filter(p =>
    !openings.some(o => p > o.offsetMm && p < o.offsetMm + o.widthMm)
  )
  const sortedOpenings = [...openings].sort((a, b) => a.offsetMm - b.offsetMm)

  function offsetFromClientX(clientX: number, widthMm: number): number {
    // Use the SVG's own screen transform (not a plain width ratio) so this stays correct
    // even though the viewBox is letterboxed inside a wider responsive container.
    const svg = svgRef.current!
    const ctm = svg.getScreenCTM()
    if (!ctm) return 0
    const pt = svg.createSVGPoint()
    pt.x = clientX
    const svgX = pt.matrixTransform(ctm.inverse()).x
    const mm = (svgX - x0) / scale
    return Math.max(0, Math.min(L - widthMm, Math.round(mm / 10) * 10))
  }
  function handlePointerDown(e: React.PointerEvent, id: string) {
    (e.target as Element).setPointerCapture(e.pointerId)
    setDragId(id)
  }
  function handlePointerMove(e: React.PointerEvent) {
    if (!dragId || !svgRef.current) return
    const o = openings.find(op => op.id === dragId)
    if (!o) return
    onOpeningOffsetChange(dragId, offsetFromClientX(e.clientX, o.widthMm))
  }
  function endDrag() { setDragId(null) }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${vbW} ${vbH}`}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      style={{ width: '100%', height: 280, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, touchAction: 'none' }}
    >
      {/* Wall outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#f8fafc" stroke="#334155" strokeWidth={1.5} />
      {/* Field studs */}
      {positions.map(p => (
        <line key={p} x1={X(p)} y1={y0} x2={X(p)} y2={y0 + h} stroke="#94a3b8" strokeWidth={1.5} />
      ))}

      {/* Per-opening dimension row above the wall: offset from left, then the opening's own width */}
      {sortedOpenings.map((o, i) => {
        const dimY = y0 - 10 - i * 14
        return (
          <React.Fragment key={`dim-${o.id}`}>
            <HDim x1={x0} x2={X(o.offsetMm)} y={dimY} label={`${o.offsetMm}`} />
            <HDim x1={X(o.offsetMm)} x2={X(o.offsetMm + o.widthMm)} y={dimY} label={`${o.widthMm}`} />
          </React.Fragment>
        )
      })}

      {/* Openings — void, doubled king+jack studs, header, and a drag handle */}
      {openings.map(o => {
        const ox = X(o.offsetMm), ow = o.widthMm * scale
        const oyTop = Y(o.sillHeightMm + o.heightMm), oh = o.heightMm * scale
        const leftEdge = X(o.offsetMm), rightEdge = X(o.offsetMm + o.widthMm)
        const jackGap = 3
        const dragging = dragId === o.id
        return (
          <g key={o.id}>
            {/* King studs — full height, carry the header load to the sole plate */}
            <line x1={leftEdge} y1={y0} x2={leftEdge} y2={y0 + h} stroke="#1e293b" strokeWidth={2.5} />
            <line x1={rightEdge} y1={y0} x2={rightEdge} y2={y0 + h} stroke="#1e293b" strokeWidth={2.5} />
            {/* Jack studs — cut to the header's underside, doubled up against each king stud */}
            <line x1={leftEdge - jackGap} y1={oyTop} x2={leftEdge - jackGap} y2={y0 + h} stroke="#7c3aed" strokeWidth={1.6} />
            <line x1={rightEdge + jackGap} y1={oyTop} x2={rightEdge + jackGap} y2={y0 + h} stroke="#7c3aed" strokeWidth={1.6} />

            {/* Opening void — draggable */}
            <rect
              x={ox} y={oyTop} width={ow} height={oh}
              fill={o.kind === 'door' ? '#fef3c7' : '#dbeafe'}
              stroke={dragging ? '#7c3aed' : '#4a90a4'} strokeWidth={dragging ? 2.5 : 1.5}
              cursor="grab"
              onPointerDown={e => handlePointerDown(e, o.id)}
            />
            {/* Header line */}
            <line x1={ox} y1={oyTop} x2={ox + ow} y2={oyTop} stroke="#c0392b" strokeWidth={2} />
            <text x={ox + ow / 2} y={oyTop + oh / 2 - 5} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#1d4ed8" pointerEvents="none">
              {o.kind === 'door' ? '🚪' : '🪟'} {o.widthMm}×{o.heightMm}
            </text>
            <text x={ox + ow / 2} y={oyTop + oh / 2 + 8} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="#94a3b8" pointerEvents="none">
              ⋮⋮ drag to move
            </text>

            {/* Sill height + opening height, to the right of the opening */}
            {o.sillHeightMm > 0 && <VDim y1={y0 + h} y2={oyTop + oh} x={rightEdge + jackGap + 6} label={`${o.sillHeightMm}`} />}
            <VDim y1={oyTop + oh} y2={oyTop} x={rightEdge + jackGap + 6} label={`${o.heightMm}`} />
          </g>
        )
      })}

      {/* Overall dimensions */}
      <HDim x1={x0} x2={x0 + w} y={y0 + h + 18} label={`${(L / 1000).toFixed(2)}m`} />
      <VDim y1={y0} y2={y0 + h} x={x0 - 16} label={`${(H / 1000).toFixed(2)}m`} />

      {/* Legend */}
      <g transform={`translate(${x0}, ${vbH - 10})`}>
        <line x1={0} y1={0} x2={14} y2={0} stroke="#1e293b" strokeWidth={2.5} />
        <text x={18} y={3} fontSize={8} fill="#64748b">King stud</text>
        <line x1={80} y1={0} x2={94} y2={0} stroke="#7c3aed" strokeWidth={1.6} />
        <text x={98} y={3} fontSize={8} fill="#64748b">Jack stud (doubled at each opening)</text>
      </g>
    </svg>
  )
}
