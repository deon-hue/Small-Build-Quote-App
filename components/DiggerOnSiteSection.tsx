'use client'

// "Digger on site": how long the digger is on site, shown on every foundation calculator that digs. The sums are in lib/digger-on-site.ts.

import React from 'react'
import NumInput from '@/components/NumInput'
import { CollapsibleSection, PropRow, propInput } from '@/components/assembly-ui'
import { planDigger, DIGGER_FUEL_PER_DAY, DIGGER_DELIVERY_COLLECTION } from '@/lib/digger-on-site'

export default function DiggerOnSiteSection({ diggingDays, daysOnSite, onDaysOnSite }: {
  diggingDays: number; daysOnSite: number | null; onDaysOnSite: (n: number | null) => void
}) {
  const plan = planDigger(diggingDays, daysOnSite)
  return (
    <CollapsibleSection title="Digger on site" borderColor="#bae6fd">
      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginBottom: 6 }}>
        The digging takes about {plan.diggingDays} day{plan.diggingDays === 1 ? '' : 's'}. The digger is hired by the day, so it is priced for the days it is on site, plus its fuel and getting it there and back.
      </div>
      <PropRow label="Days the digger is on site">
        <NumInput type="number" min={0} step={0.5} value={plan.hireDays} onChange={e => onDaysOnSite(Math.max(0, +e.target.value || 0))} style={propInput} />
      </PropRow>
      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginTop: 4 }}>
        {plan.automatic
          ? 'Following the digging, in whole days. Type a number if it will be on site longer (delivered the day before, kept for the inspection) or shorter (shared with another job).'
          : <>Set by you. <button onClick={() => onDaysOnSite(null)} style={{ fontSize: 11, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↻ Follow the digging again</button></>}
      </div>
      <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginTop: 4 }}>
        Fuel (sample £{DIGGER_FUEL_PER_DAY} a day digging) and delivery and collection (sample £{DIGGER_DELIVERY_COLLECTION}, there and back) are added as plant. Change any rate in the breakdown, or untick a line you do not want, such as delivery when it is already on site.
      </div>
    </CollapsibleSection>
  )
}
