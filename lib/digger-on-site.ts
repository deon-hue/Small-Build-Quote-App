// A digger on a job, priced the way it is really hired: for the days it is on site (not the volume it digs), its fuel, and getting it there and back. The calculators work out how many
// days the DIGGING takes from the volume; the digger is on site for whole days (a hire is never less than a day) unless the estimator says otherwise (delivered the day before, kept for
// the inspection, shared with another job). Fuel is for the days it is working. Delivery and collection is one charge, there and back. Pure, so the sums can be tested; every foundation
// calculator with a digger uses it. All rates are samples to be checked against real hire prices, and each line can be edited in the calculator's breakdown.

import type { AssemblyLayerDef } from './assembly-calc'

export const DIGGER_PER_DAY = 260             // a mini excavator and its operator, per day on site
export const DIGGER_FUEL_PER_DAY = 25         // diesel for a day's digging
export const DIGGER_DELIVERY_COLLECTION = 120 // low loader or trailer, there and back

export interface DiggerPlan {
  /** days the digging itself takes, from the volume */
  diggingDays: number
  /** days the digger is on site and hired for */
  hireDays: number
  /** days it burns fuel (the digging days) */
  fuelDays: number
  /** delivered and collected once (none when it is not used at all) */
  trips: number
  /** the days on site are the calculator's own (whole days of digging) rather than typed in */
  automatic: boolean
}

/** Whole days for the digging (a hire is at least a day), or what the estimator typed (half days are fine). */
export function planDigger(diggingDays: number, daysOnSite: number | null): DiggerPlan {
  const dig = Math.max(0, diggingDays)
  const auto = dig > 0 ? Math.max(1, Math.ceil(dig - 1e-9)) : 0
  const typed = daysOnSite !== null && Number.isFinite(daysOnSite) && daysOnSite >= 0
  const hire = typed ? daysOnSite as number : auto
  return { diggingDays: dig, hireDays: hire, fuelDays: dig, trips: hire > 0 || dig > 0 ? 1 : 0, automatic: !typed }
}

/** The plant lines for the breakdown: the digger for the days it is on site, its fuel, and delivery and collection. `name` says what it digs, e.g. "digging the trench". */
export function diggerLayers(plan: DiggerPlan, what: string, who = 'Mini excavator with operator'): AssemblyLayerDef[] {
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }
  const L: AssemblyLayerDef[] = []
  if (plan.hireDays > 0) L.push(fixed({ id: 'excavator', name: `${who} — ${what} (days on site)`, category: 'plant', unit: 'day', unitCost: DIGGER_PER_DAY, qty: plan.hireDays }))
  if (plan.fuelDays > 0) L.push(fixed({ id: 'excavator-fuel', name: 'Fuel for the digger (diesel, per day digging)', category: 'plant', unit: 'day', unitCost: DIGGER_FUEL_PER_DAY, qty: plan.fuelDays }))
  if (plan.trips > 0) L.push(fixed({ id: 'excavator-delivery', name: 'Digger delivered to site and collected (there and back)', category: 'plant', unit: 'trip', unitCost: DIGGER_DELIVERY_COLLECTION, qty: plan.trips }))
  return L
}
