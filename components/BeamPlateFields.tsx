'use client'

/**
 * A steel plate welded to a beam to spread its load over the wall it bears on: tick it, then the face (bottom, top or both), the thickness (6, 8, 10, 12 ... mm) and the width (as wide as the wall, or 100, 150, 215, 300 ... mm,
 * or typed, for the cavity the beam bears over) and the length (the whole beam, or typed). Used by the Structural Openings and the Steel Beams calculators; the sums are in lib/structural-openings-units.ts (beamPlateFor).
 */

import React from 'react'
import { TilingNumInput, TilingCheck, tilingSmall } from '@/components/TilingCalcFrame'
import { PropRow, propInput } from '@/components/assembly-ui'
import { newBeamPlate, beamPlateFor, PLATE_POSITION_LABEL, PLATE_THICKNESSES, PLATE_WIDTHS, type BeamPlate, type PlatePosition } from '@/lib/structural-openings-units'

const chip = (on: boolean): React.CSSProperties => ({ ...tilingSmall, cursor: 'pointer', padding: '2px 8px', background: on ? '#0369a1' : '#fff', color: on ? '#fff' : '#334155', borderColor: on ? '#0369a1' : '#cbd5e1' })

export default function BeamPlateFields({ plate, onChange, wallMm, beamLengthM, beams = 1 }: {
  plate: BeamPlate | null | undefined
  onChange: (p: BeamPlate | null) => void
  /** the thickness of the wall the beam bears on (for 'as wide as the wall'); not given for a beam on its own */
  wallMm?: number
  /** the length of the beam with its bearings, m, to say what the plate weighs */
  beamLengthM?: number
  beams?: number
}) {
  const p = plate ?? null
  const set = (patch: Partial<BeamPlate>) => onChange({ ...(p ?? newBeamPlate()), ...patch })
  const info = p && beamLengthM && beamLengthM > 0 ? beamPlateFor(p, beamLengthM, wallMm ?? 215) : null
  return (
    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '6px 8px' }}>
      <TilingCheck label="Weld a plate to the beam to spread its load over the wall" on={!!p} set={b => onChange(b ? newBeamPlate() : null)} />
      {p && (
        <div style={{ marginTop: 6, display: 'grid', gap: 8 }}>
          <PropRow label="Where it is welded">
            <select value={p.position} onChange={e => set({ position: e.target.value as PlatePosition })} style={propInput}>
              {(Object.keys(PLATE_POSITION_LABEL) as PlatePosition[]).map(k => <option key={k} value={k}>{PLATE_POSITION_LABEL[k]}</option>)}
            </select>
          </PropRow>
          <PropRow label="Plate thickness (mm)">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {PLATE_THICKNESSES.map(t => <button key={t} type="button" onClick={() => set({ thicknessMm: t })} style={chip(p.thicknessMm === t)}>{t}</button>)}
              <div style={{ width: 70 }}><TilingNumInput v={p.thicknessMm} set={n => set({ thicknessMm: Math.max(1, n) })} step={1} min={1} /></div>
            </div>
          </PropRow>
          <PropRow label={`Plate width (mm), to suit the wall or the cavity`}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={() => set({ widthMm: null })} style={chip(p.widthMm === null)}>{wallMm ? `As wide as the wall (${Math.round(wallMm)})` : 'Standard (215)'}</button>
              {PLATE_WIDTHS.map(w => <button key={w} type="button" onClick={() => set({ widthMm: w })} style={chip(p.widthMm === w)}>{w}</button>)}
              <div style={{ width: 70 }}><TilingNumInput v={p.widthMm ?? wallMm ?? 215} set={n => set({ widthMm: Math.max(1, n) })} step={5} min={1} /></div>
            </div>
          </PropRow>
          <PropRow label="Plate length (mm)">
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => set({ lengthMm: null })} style={chip(p.lengthMm === null)}>The whole beam</button>
              <div style={{ width: 90 }}><TilingNumInput v={p.lengthMm ?? Math.round((beamLengthM ?? 3) * 1000)} set={n => set({ lengthMm: Math.max(1, n) })} step={50} min={1} /></div>
            </div>
          </PropRow>
          {info && (
            <div style={{ fontSize: 11.5, color: '#475569' }}>
              {info.plates * beams} plate{info.plates * beams === 1 ? '' : 's'} of {p.thicknessMm} × {Math.round(info.widthMm)}mm, {info.lengthM.toFixed(2)}m long: about {Math.round(info.kg * beams)}kg of steel, plus cutting and welding. The engineer specifies the size, steel grade and weld.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
