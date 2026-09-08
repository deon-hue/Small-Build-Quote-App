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

import React, { useMemo, useState } from 'react'
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
}

export default function AssemblyWallDemo({ onClose }: Props) {
  const [name, setName]         = useState('Timber Stud Partition')
  const [qty, setQty]           = useState(1)
  const [lengthMm, setLengthMm] = useState(5000)
  const [heightMm, setHeightMm] = useState(2400)
  const [centresMm, setCentresMm] = useState(400)
  const [doubleTopPlate, setDoubleTopPlate] = useState(false)
  const [wastePct, setWastePct] = useState(10)
  const [openings, setOpenings] = useState<AssemblyOpening[]>(sampleOpenings)

  const input: WallInput = { lengthMm, heightMm, studCentresMm: centresMm, doubleTopPlate, openings }
  const layers = useMemo(() => buildSampleLayers(wastePct), [wastePct])

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
      </div>

      {!result.ok ? (
        <div style={{ color: '#c0392b', fontSize: 12, padding: 8 }}>⚠ {result.error}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          {/* Left: elevation + description */}
          <div>
            <WallElevationSvg input={input} />
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
            <BreakdownTable lines={result.value.lines} />
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

function BreakdownTable({ lines }: { lines: CostedLine[] }) {
  const groups = ['materials', 'labour', 'plant', 'subcontractors', 'other'] as const
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
        Cost breakdown (sample rates — Stage 3 pulls these live from Back Office)
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
                    <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace' }}>£{l.unitCost.toFixed(2)}</td>
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

// ── Elevation SVG — a plan/elevation-style sketch of the wall, drawn from the
// same inputs the engine costs. Visual only: stud display positions approximate
// which field studs an opening displaces (matched to the grid), it doesn't feed
// any number in the breakdown above. ──
function WallElevationSvg({ input }: { input: WallInput }) {
  const { lengthMm: L, heightMm: H, studCentresMm: C, openings } = input
  const vbW = 600, vbH = 260, pad = 20
  const scale = Math.min((vbW - pad * 2) / L, (vbH - pad * 2) / H)
  const w = L * scale, h = H * scale
  const x0 = (vbW - w) / 2, y0 = (vbH - h) / 2
  const X = (mmVal: number) => x0 + mmVal * scale
  const Y = (mmVal: number) => y0 + h - mmVal * scale // y grows downward in SVG, up in real life

  const positions = studPositionsMm(L, C).filter(p =>
    !openings.some(o => p > o.offsetMm && p < o.offsetMm + o.widthMm)
  )

  return (
    <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ width: '100%', height: 220, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
      {/* Wall outline */}
      <rect x={x0} y={y0} width={w} height={h} fill="#f8fafc" stroke="#334155" strokeWidth={1.5} />
      {/* Field studs */}
      {positions.map(p => (
        <line key={p} x1={X(p)} y1={y0} x2={X(p)} y2={y0 + h} stroke="#94a3b8" strokeWidth={1.5} />
      ))}
      {/* Openings */}
      {openings.map(o => {
        const ox = X(o.offsetMm), ow = o.widthMm * scale
        const oyTop = Y(o.sillHeightMm + o.heightMm), oh = o.heightMm * scale
        return (
          <g key={o.id}>
            {/* King studs at the rough opening edges */}
            <line x1={X(o.offsetMm)} y1={y0} x2={X(o.offsetMm)} y2={y0 + h} stroke="#1e293b" strokeWidth={2.5} />
            <line x1={X(o.offsetMm + o.widthMm)} y1={y0} x2={X(o.offsetMm + o.widthMm)} y2={y0 + h} stroke="#1e293b" strokeWidth={2.5} />
            {/* Opening void */}
            <rect x={ox} y={oyTop} width={ow} height={oh} fill={o.kind === 'door' ? '#fef3c7' : '#dbeafe'} stroke="#4a90a4" strokeWidth={1.5} />
            {/* Header line */}
            <line x1={ox} y1={oyTop} x2={ox + ow} y2={oyTop} stroke="#c0392b" strokeWidth={2} />
            <text x={ox + ow / 2} y={oyTop + oh / 2} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#1d4ed8">
              {o.kind === 'door' ? '🚪' : '🪟'} {o.widthMm}×{o.heightMm}
            </text>
          </g>
        )
      })}
      {/* Dimension label */}
      <text x={vbW / 2} y={vbH - 4} textAnchor="middle" fontSize={10} fill="#64748b">
        {(L / 1000).toFixed(2)}m × {(H / 1000).toFixed(2)}m
      </text>
    </svg>
  )
}
