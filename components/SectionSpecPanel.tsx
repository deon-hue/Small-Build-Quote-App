'use client'

/**
 * A section spec panel for a steel member, as a steel merchant's beam calculator shows beside the choices: a drawing of the section with its depth, width, web and flange, a table of its properties, the weight of the member and the
 * grade of steel. It opens from a small button on the member (closed to start). Read-only except the grade, which goes on the quote wording and does not change the sample price. The figures are typical catalogue values
 * (lib/steel-section-data.ts): check them against the maker's table; the engineer designs the real member.
 */

import React, { useState } from 'react'
import { miniInput } from '@/components/assembly-ui'
import { sectionSpec, specRows, STEEL_GRADES, USUAL_GRADE, isSteelGrade, type SectionSpec, type SteelGrade } from '@/lib/steel-section-data'
import { STEEL_BEAMS, STEEL_COLUMNS, STEEL_HOLLOW } from '@/lib/structural-steel-units'

const pricedKg = (label: string): number | null => [...STEEL_BEAMS, ...STEEL_COLUMNS, ...STEEL_HOLLOW].find(s => s.label === label)?.kgPerM ?? null

/** the section drawn to scale (its longest side is 110 units) with its dimensions marked */
function SectionDrawing({ spec }: { spec: SectionSpec }) {
  const k = 110 / Math.max(spec.depthMm, spec.widthMm)
  const D = spec.depthMm * k, B = spec.widthMm * k, t = Math.max(1.2, spec.webMm * k), T = Math.max(1.2, spec.flangeMm * k)
  const ox = 34, oy = 14, W = ox + B + 34, H = oy + D + 24
  const col = '#0369a1'
  const mark = { fontSize: 8.5, fill: '#475569', fontFamily: 'system-ui, sans-serif' } as const
  const hollow = spec.family === 'SHS'
  const cx = ox + B / 2
  const path = hollow
    ? `M${ox} ${oy}H${ox + B}V${oy + D}H${ox}Z M${ox + t} ${oy + t}V${oy + D - t}H${ox + B - t}V${oy + t}Z`
    : `M${ox} ${oy}H${ox + B}V${oy + T}H${cx + t / 2}V${oy + D - T}H${ox + B}V${oy + D}H${ox}V${oy + D - T}H${cx - t / 2}V${oy + T}H${ox}Z`
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${spec.label} section`} style={{ flex: 'none', background: '#f8fafc', borderRadius: 6 }}>
      <path d={path} fill="#bae6fd" stroke={col} strokeWidth={1.4} fillRule="evenodd" strokeLinejoin="round" />
      {/* depth, down the left */}
      <path d={`M${ox - 10} ${oy}V${oy + D}M${ox - 14} ${oy}H${ox - 6}M${ox - 14} ${oy + D}H${ox - 6}`} stroke="#64748b" strokeWidth={0.8} fill="none" />
      <text x={ox - 12} y={oy + D / 2} {...mark} textAnchor="middle" transform={`rotate(-90 ${ox - 12} ${oy + D / 2})`} dy={-3}>{Math.round(spec.depthMm * 10) / 10}</text>
      {/* width, along the foot */}
      <path d={`M${ox} ${oy + D + 8}H${ox + B}M${ox} ${oy + D + 4}V${oy + D + 12}M${ox + B} ${oy + D + 4}V${oy + D + 12}`} stroke="#64748b" strokeWidth={0.8} fill="none" />
      <text x={cx} y={oy + D + 21} {...mark} textAnchor="middle">{Math.round(spec.widthMm * 10) / 10}</text>
      {!hollow && <text x={ox + B + 4} y={oy + D / 2 + 3} {...mark} fill={col}>t {Math.round(spec.webMm * 10) / 10}</text>}
      {!hollow && <text x={ox + B + 4} y={oy + T + 8} {...mark} fill={col}>T {Math.round(spec.flangeMm * 10) / 10}</text>}
    </svg>
  )
}

export default function SectionSpecPanel({ label, lengthMm, qty, grade, onGrade }: {
  /** the section's name ('203 × 133 UB 25'); for a beam set to be picked from the span, the one it picks */
  label: string
  lengthMm: number
  qty: number
  grade?: SteelGrade
  onGrade: (g: SteelGrade | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const spec = sectionSpec(label)
  if (!spec) return null
  const rows = specRows(spec, pricedKg(label) ?? spec.kgPerM, lengthMm, qty)
  return (
    <div style={{ marginTop: 6 }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, padding: 0 }}>
        {open ? '▾' : '▸'} Section details{grade ? ` · ${grade}` : ''}
      </button>
      {open && (
        <div data-section-spec style={{ marginTop: 6, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
          <SectionDrawing spec={spec} />
          <div style={{ flex: '1 1 220px', minWidth: 200 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>{spec.label}</div>
            {rows.map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: '#334155', padding: '1px 0', borderBottom: '1px dotted #e2e8f0' }}>
                <span style={{ color: '#64748b' }}>{r.label}</span><span style={{ fontFamily: 'monospace' }}>{r.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 9, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.3 }}>Grade of steel</span>
              <select value={grade ?? ''} onChange={e => onGrade(isSteelGrade(e.target.value) ? e.target.value : undefined)} style={{ ...miniInput, width: 150 }}>
                <option value="">Not stated</option>
                {STEEL_GRADES.map(g => <option key={g} value={g}>{g}{g === USUAL_GRADE ? ' (the usual)' : ''}</option>)}
              </select>
            </div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>Typical catalogue figures: check them against the maker&apos;s table. The grade goes on the quote wording and does not change the sample price. The engineer designs the real member.</div>
          </div>
        </div>
      )}
    </div>
  )
}
