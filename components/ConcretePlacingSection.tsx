'use client'

// "Getting the concrete in": the choice every foundation calculator offers for when the concrete lorry cannot reach the foundation. The sums are in lib/concrete-placing.ts.

import React from 'react'
import NumInput from '@/components/NumInput'
import { CollapsibleSection, PropRow, propInput } from '@/components/assembly-ui'
import { PLACING_LABEL, PUMP_VISIT, PUMP_PER_M3, type PlacingMethod, type PlacingPlan } from '@/lib/concrete-placing'

export default function ConcretePlacingSection({ method, onMethod, distanceM, onDistance, men, onMen, plan, volumeM3 }: {
  method: PlacingMethod; onMethod: (m: PlacingMethod) => void
  distanceM: number; onDistance: (n: number) => void
  men: number; onMen: (n: number) => void
  plan: PlacingPlan; volumeM3: number
}) {
  return (
    <CollapsibleSection title="Getting the concrete in" borderColor="#bae6fd">
      <PropRow label="How the concrete gets to the foundation">
        <select value={method} onChange={e => onMethod(e.target.value as PlacingMethod)} style={propInput}>
          {(Object.keys(PLACING_LABEL) as PlacingMethod[]).map(k => <option key={k} value={k}>{PLACING_LABEL[k]}</option>)}
        </select>
      </PropRow>
      {method === 'direct' && (
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>Choose pump or wheelbarrows when the lorry cannot back up to where the concrete is poured.</div>
      )}
      {method === 'pump' && (
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
          One pump visit (£{PUMP_VISIT}, with its operator) and £{PUMP_PER_M3} for each m³ pumped ({plan.pump ? plan.pump.m3 : volumeM3.toFixed(1)} m³) are added as plant. Sample rates: change them in the breakdown below.
        </div>
      )}
      {method === 'barrow' && (<>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1 }}><PropRow label="Extra men barrowing">
            <NumInput type="number" min={1} step={1} value={men} onChange={e => onMen(Math.max(1, Math.round(+e.target.value || 1)))} style={propInput} />
          </PropRow></div>
          <div style={{ flex: 1 }}><PropRow label="Lorry to foundation (m)">
            <NumInput type="number" min={0} step={5} value={distanceM} onChange={e => onDistance(Math.max(0, +e.target.value || 0))} style={propInput} />
          </PropRow></div>
        </div>
        {plan.barrow && (
          <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
            At about {plan.barrow.m3PerManHour} m³ per man-hour over {distanceM}m, {volumeM3.toFixed(1)} m³ is {plan.barrow.manHours} man-hours: about {plan.barrow.hoursOnSite} hours for {plan.barrow.men} {plan.barrow.men === 1 ? 'man' : 'men'}.
            Added as labour (change the hours below) with the wheelbarrows hired as plant.
          </div>
        )}
      </>)}
    </CollapsibleSection>
  )
}
