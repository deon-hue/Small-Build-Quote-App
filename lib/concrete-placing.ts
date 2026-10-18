// Getting the concrete from the lorry to where it is poured. Most of the time the lorry backs up to the foundation and tips it straight in; when it cannot, the concrete has to be
// pumped (a pump hired in, with its own charge per visit and per cubic metre) or carried in by extra men with wheelbarrows. Pure, so the sums can be tested and every foundation calculator
// (strip, trench fill, pads) prices it the same way. All rates are samples to be checked against real jobs, and each line can be edited in the calculator's breakdown.

import type { AssemblyLayerDef } from './assembly-calc'
import type { LabourSuggestion } from './flat-roof-labour'

export type PlacingMethod = 'direct' | 'pump' | 'barrow'

export const PLACING_LABEL: Record<PlacingMethod, string> = {
  direct: 'The lorry can reach the foundation (nothing extra)',
  pump: 'Concrete pump (the lorry cannot get close)',
  barrow: 'Extra men with wheelbarrows (the lorry cannot get close)',
}

export const PUMP_VISIT = 450           // a pump and its operator on site: set up, pump, wash out
export const PUMP_PER_M3 = 6            // per cubic metre pumped
export const BARROW_PER_DAY = 6         // hire of one wheelbarrow for a day
export const BARROW_LITRES = 65         // what one barrow load carries
const WALK_M_PER_MIN = 45               // loaded barrow, walking pace on a site
const LOAD_AND_TIP_MIN = 1              // filling and tipping, per trip
const FATIGUE = 0.6                     // nobody barrows flat out all day
const DAY_HOURS = 8

/** Cubic metres one man barrows in an hour over this distance (lorry to where it is poured, one way). */
export function barrowM3PerManHour(distanceM: number): number {
  const d = Math.max(0, distanceM)
  const tripMin = LOAD_AND_TIP_MIN + (2 * d) / WALK_M_PER_MIN
  return +(((BARROW_LITRES / 1000) * (60 / tripMin)) * FATIGUE).toFixed(2)
}

export interface PlacingInput { method: PlacingMethod; volumeM3: number; distanceM: number; men: number }

export interface PlacingPlan {
  method: PlacingMethod
  /** a pump: one visit, and the cubic metres it pumps */
  pump: { visits: number; m3: number } | null
  /** barrows: the extra men's hours in all, how long the pour takes them, and the barrows hired */
  barrow: { men: number; manHours: number; hoursOnSite: number; m3PerManHour: number; barrowDays: number } | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function planConcretePlacing(i: PlacingInput): PlacingPlan {
  const vol = Math.max(0, i.volumeM3)
  if (i.method === 'pump' && vol > 0) return { method: 'pump', pump: { visits: 1, m3: round1(vol) }, barrow: null }
  if (i.method === 'barrow' && vol > 0) {
    const men = Math.max(1, Math.round(i.men))
    const rate = barrowM3PerManHour(i.distanceM)
    const manHours = Math.max(0.5, Math.round((vol / rate) * 2) / 2)
    const hoursOnSite = round1(manHours / men)
    // a barrow for each man for as long as the pour lasts, at least half a day each
    const barrowDays = men * Math.max(0.5, Math.ceil((hoursOnSite / DAY_HOURS) * 2) / 2)
    return { method: 'barrow', pump: null, barrow: { men, manHours, hoursOnSite, m3PerManHour: rate, barrowDays } }
  }
  return { method: 'direct', pump: null, barrow: null }
}

/** The words for the quote: how the concrete gets in, or '' when the lorry reaches (nothing to say). */
export function describePlacing(method: PlacingMethod): string {
  if (method === 'pump') return 'The concrete is placed by pump.'
  if (method === 'barrow') return 'The concrete is carried to the foundation by wheelbarrow.'
  return ''
}

/** The plant lines for the breakdown: the pump visit and what it pumps, or the barrows hired. None when the lorry reaches. */
export function placingLayers(plan: PlacingPlan): AssemblyLayerDef[] {
  const fixed = (l: Omit<AssemblyLayerDef, 'source'> & { qty: number }): AssemblyLayerDef => { const { qty, ...rest } = l; return { ...rest, source: 'fixed', fixedQty: qty } }
  if (plan.pump) return [
    fixed({ id: 'pump-visit', name: 'Concrete pump hire with operator (one visit)', category: 'plant', unit: 'visit', unitCost: PUMP_VISIT, qty: plan.pump.visits }),
    fixed({ id: 'pump-m3', name: 'Concrete pumped', category: 'plant', unit: 'm³', unitCost: PUMP_PER_M3, qty: plan.pump.m3 }),
  ]
  if (plan.barrow) return [fixed({ id: 'barrows', name: 'Wheelbarrow hire — carrying the concrete in', category: 'plant', unit: 'day', unitCost: BARROW_PER_DAY, qty: plan.barrow.barrowDays })]
  return []
}

/** The extra men's hours when the concrete is barrowed in, as a labour suggestion (a labourer), or null. */
export function placingLabour(plan: PlacingPlan): LabourSuggestion | null {
  if (!plan.barrow) return null
  const b = plan.barrow
  return {
    key: 'concrete-barrow', trade: 'labourer', task: 'Barrow the concrete from the lorry to the foundation (extra men)', hours: b.manHours,
    basis: `${b.men} men: ${b.m3PerManHour} m³ per man-hour, so about ${b.hoursOnSite} hours on site`,
  }
}
