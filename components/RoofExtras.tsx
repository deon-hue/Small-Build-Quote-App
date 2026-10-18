'use client'

// The two extras every pitched roof structure calculator (gable, hip, mono-pitch) offers: a VAULTED ceiling, and a JOIN to an existing roof. The state, the sections and the small panels are shared so
// the three screens behave the same. The sums are in lib/roof-extras.ts and the cost lines in lib/roof-extras-layers.ts.

import React from 'react'
import NumInput from '@/components/NumInput'
import { useCalcState } from '@/components/calc-state'
import { CollapsibleSection, PropRow, propInput } from '@/components/assembly-ui'
import {
  CEILING_LABEL, RIDGE_BEAM, vaultedWarnings, ROOF_JOIN_LABEL,
  type CeilingKind, type RidgeBeamKind, type RoofJoinGeometry,
} from '@/lib/roof-extras'

/** The state a roof structure screen keeps for the extras, under the screen's own id. */
export function useRoofExtras(id: string) {
  const [ceiling, setCeiling] = useCalcState<CeilingKind>(id, 'ceiling', 'flat')
  const [ridgeBeam, setRidgeBeam] = useCalcState<RidgeBeamKind>(id, 'ridgeBeam', 'lvl')
  // roof-over joins: the area of existing covering stripped, when typed; null follows the join's own estimate
  const [strippedA, setStrippedA] = useCalcState<number | null>(id, 'joinStrippedA', null)
  const [strippedB, setStrippedB] = useCalcState<number | null>(id, 'joinStrippedB', null)
  return { ceiling, setCeiling, ridgeBeam, setRidgeBeam, strippedA, setStrippedA, strippedB, setStrippedB }
}

const amber: React.CSSProperties = { fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '5px 8px', marginTop: 6, lineHeight: 1.4 }

/** The ceiling choice: flat (the usual ceiling joists, passed as children) or vaulted (a ridge beam, no ceiling joists, and a reminder that the lining is priced elsewhere). */
export function CeilingSection({ roof, ceiling, onCeiling, ridgeBeam, onRidgeBeam, hasRidge, children }: {
  roof: 'gable' | 'hip' | 'mono'
  ceiling: CeilingKind; onCeiling: (c: CeilingKind) => void
  ridgeBeam: RidgeBeamKind; onRidgeBeam: (k: RidgeBeamKind) => void
  /** a roof with a ridge (gable, hip) has a ridge beam when vaulted; a mono-pitch roof has none */
  hasRidge: boolean
  /** what a flat ceiling brings (the ceiling joist section) */
  children?: React.ReactNode
}) {
  return (
    <CollapsibleSection title="Ceiling" borderColor="#bae6fd">
      <PropRow label="Ceiling">
        <select value={ceiling} onChange={e => onCeiling(e.target.value as CeilingKind)} style={propInput}>
          {(Object.keys(CEILING_LABEL) as CeilingKind[]).map(k => <option key={k} value={k}>{CEILING_LABEL[k]}</option>)}
        </select>
      </PropRow>
      {ceiling === 'flat' && children}
      {ceiling === 'vaulted' && (<>
        {hasRidge && (
          <PropRow label="Ridge beam">
            <select value={ridgeBeam} onChange={e => onRidgeBeam(e.target.value as RidgeBeamKind)} style={propInput}>
              {(Object.keys(RIDGE_BEAM) as RidgeBeamKind[]).map(k => <option key={k} value={k}>{RIDGE_BEAM[k].label}</option>)}
            </select>
          </PropRow>
        )}
        {vaultedWarnings(roof).map((w, i) => <div key={i} style={amber}>⚠ {w}</div>)}
      </>)}
    </CollapsibleSection>
  )
}

/** What one join to an existing roof comes to: the quantities, a way to type the stripped area for a roof built over the existing one, and the warnings. */
export function RoofJoinPanel({ title, geo, stripped, onStripped }: { title: string; geo: RoofJoinGeometry; stripped: number | null; onStripped: (n: number | null) => void }) {
  const lines = [
    geo.bearerLm > 0 ? `bearer ${geo.bearerLm.toFixed(1)}lm` : '',
    geo.valleyRafterLm > 0 ? `${geo.valleyCount} valleys, ${geo.valleyRafterLm.toFixed(1)}lm of valley rafters` : '',
    geo.trimmerLm > 0 ? `${geo.trimmerLm.toFixed(1)}lm of trimmers (${geo.cutRafters} existing rafters cut)` : '',
    `${geo.fixingCount} ties and hangers`,
    `${geo.strippedAreaM2.toFixed(1)}m² of existing roof opened up`,
  ].filter(Boolean)
  return (
    <div style={{ border: '1px solid #bae6fd', borderRadius: 6, padding: '6px 8px', marginTop: 6, background: '#f8fcff' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>{title}: {ROOF_JOIN_LABEL[geo.kind]}</div>
      <div style={{ fontSize: 11, color: '#475569', marginTop: 2, lineHeight: 1.4 }}>{lines.join(' · ')}.</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 1.4 }}>
        The covering's side (lead flashing {geo.abutmentLm > 0 ? `${geo.abutmentLm.toFixed(1)}lm` : ''}{geo.valleyLeadLm > 0 ? `valley lead ${geo.valleyLeadLm.toFixed(1)}lm` : ''}{geo.makeGoodM2 > 0 ? `, ${geo.makeGoodM2.toFixed(1)}m² of existing tiling made good` : ''}) is priced in Roof Coverings.
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginTop: 4 }}>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>Existing roof opened up (m²)</label>
          <NumInput type="number" min={0} step={0.5} value={stripped ?? geo.strippedAreaM2} onChange={e => onStripped(Math.max(0, +e.target.value || 0))} style={propInput} />
        </div>
        {stripped !== null && <button onClick={() => onStripped(null)} style={{ fontSize: 10, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 4 }}>↻ Use the estimate</button>}
      </div>
      {geo.warnings.map((w, i) => <div key={i} style={amber}>⚠ {w}</div>)}
    </div>
  )
}
