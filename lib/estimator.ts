// ── Estimator types & utilities ────────────────────────────────────────────
// Measurement-based cost breakdown layer added to each quote phase.
// Stored as QuotePhase.estimatorItems in the existing JSONB phases column.

import { calcTaskLabourLine, type TaskLabourLine } from './tradeRates'
export type { TaskLabourLine }

export type MeasurementType = 'area' | 'volume' | 'linear' | 'quantity'

export const MEASUREMENT_LABELS: Record<MeasurementType, {
  label: string; fields: string[]; unit: string
}> = {
  area:     { label: 'Area',     fields: ['Length (m)', 'Width (m)', 'No. of areas'],               unit: 'm²' },
  volume:   { label: 'Volume',   fields: ['Length (m)', 'Width (m)', 'Depth (m)', 'No. of areas'],  unit: 'm³' },
  linear:   { label: 'Linear',   fields: ['Length (m)', 'No. of runs'],                             unit: 'm'  },
  quantity: { label: 'Quantity', fields: ['Qty'],                                                    unit: 'nr' },
}

export interface EstimatorItem {
  id: string
  name: string
  description: string
  measurementType: MeasurementType
  unit: string
  // Measurement inputs
  length: number
  width: number
  depth: number
  qty: number
  measurement: number
  manualMeasurement: boolean
  // Rates (cost per unit) — labour rate ignored when taskLabourLines present
  labourRate: number
  materialsRate: number
  plantRate: number
  subRate: number
  otherRate: number
  wastePercent: number
  /**
   * Per-task trade labour lines.  When present and non-empty, labourTotal is
   * computed from these lines instead of from labourRate × measurement.
   * Each line is cost-only — global quote markup is applied later.
   */
  taskLabourLines?: TaskLabourLine[]
  // Computed totals
  labourTotal: number
  materialsTotal: number
  plantTotal: number
  subTotal: number
  otherTotal: number
  lineTotal: number
  notes: string
  isCosted: boolean
  aiSuggested?: boolean
}

export interface EstimatorItemTemplate {
  id: string
  name: string
  description: string
  measurementType: MeasurementType
  unit: string
  labourRate: number
  materialsRate: number
  plantRate: number
  subRate: number
  otherRate: number
  wastePercent: number
  /** Default task labour lines pre-configured in Back Office.
   *  Copied to taskLabourLines when the item is added to a quote. */
  defaultTaskLabourLines?: TaskLabourLine[]
}

// ── Calculation functions ──────────────────────────────────────────────────

export function calcMeasurement(
  type: MeasurementType,
  length: number,
  width: number,
  depth: number,
  qty: number,
): number {
  switch (type) {
    case 'area':     return +(length * width * qty).toFixed(3)
    case 'volume':   return +(length * width * depth * qty).toFixed(3)
    case 'linear':   return +(length * qty).toFixed(3)
    case 'quantity': return +qty.toFixed(3)
  }
}

export function calcEstimatorItem(item: EstimatorItem): EstimatorItem {
  const m = item.manualMeasurement
    ? item.measurement
    : calcMeasurement(item.measurementType, item.length, item.width, item.depth, item.qty)
  const wasteMult = 1 + item.wastePercent / 100

  // Recalculate task labour lines so totals are always fresh after a rate change
  const taskLabourLines = item.taskLabourLines?.map(calcTaskLabourLine)
  const hasTaskLabour   = (taskLabourLines?.length ?? 0) > 0

  // Labour total comes exclusively from task labour lines.
  // labourRate is kept in the data model for backward compat but is no longer
  // used in calculations — the UI field has been removed.
  const labourTotal    = hasTaskLabour
    ? +taskLabourLines!.reduce((s, l) => s + l.total, 0).toFixed(2)
    : 0
  const materialsTotal = +(m * item.materialsRate * wasteMult).toFixed(2)
  const plantTotal     = +(m * item.plantRate).toFixed(2)
  const subTotal       = +(m * item.subRate).toFixed(2)
  const otherTotal     = +(m * item.otherRate).toFixed(2)
  const lineTotal      = labourTotal + materialsTotal + plantTotal + subTotal + otherTotal
  return {
    ...item,
    taskLabourLines,
    measurement: m,
    labourTotal, materialsTotal, plantTotal, subTotal, otherTotal, lineTotal,
    isCosted: lineTotal > 0,
  }
}

export function itemFromTemplate(tpl: EstimatorItemTemplate): EstimatorItem {
  const base: EstimatorItem = {
    id: `${tpl.id}-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    name: tpl.name,
    description: tpl.description,
    measurementType: tpl.measurementType,
    unit: tpl.unit,
    length: 0, width: 0, depth: 0, qty: 1,
    measurement: 0,
    manualMeasurement: false,
    labourRate: tpl.labourRate,
    materialsRate: tpl.materialsRate,
    plantRate: tpl.plantRate,
    subRate: tpl.subRate,
    otherRate: tpl.otherRate,
    wastePercent: tpl.wastePercent,
    // Copy default task labour lines from the template if configured
    taskLabourLines: tpl.defaultTaskLabourLines?.length
      ? tpl.defaultTaskLabourLines.map(l => ({ ...l }))
      : undefined,
    labourTotal: 0, materialsTotal: 0, plantTotal: 0,
    subTotal: 0, otherTotal: 0, lineTotal: 0,
    notes: '',
    isCosted: false,
  }
  return calcEstimatorItem(base)
}

/** Aggregate estimator items → per-type totals for lump-sum compatibility.
 *
 * When `labourTrades` are supplied and non-empty, the `labour` total is taken
 * from the trades' `quotePrice` values (which already include per-trade markup).
 * In that case `calcPhaseSell` will NOT apply the global quote markup to labour
 * again — preventing double-markup. All other cost types always come from item
 * rates and will receive the global markup as normal.
 */
export function estimatorAggregates(
  items: EstimatorItem[],
  labourTrades?: import('./tradeRates').LabourTrade[],
) {
  // Include ALL items regardless of isCosted — zero is a valid cost value.
  // isCosted remains as informational metadata only (used for UI warning counts).
  const hasLabourTrades = (labourTrades?.length ?? 0) > 0

  const labour = hasLabourTrades
    ? +labourTrades!.reduce((s, t) => s + t.quotePrice, 0).toFixed(2)
    : +items.reduce((s, i) => s + i.labourTotal, 0).toFixed(2)

  const materials      = +items.reduce((s, i) => s + i.materialsTotal, 0).toFixed(2)
  const plant          = +items.reduce((s, i) => s + i.plantTotal,     0).toFixed(2)
  const subcontractors = +items.reduce((s, i) => s + i.subTotal,       0).toFixed(2)
  const other          = +items.reduce((s, i) => s + i.otherTotal,     0).toFixed(2)

  // When using labour trades, item lineTotals exclude labour (it's handled above).
  const itemNonLabourTotal = hasLabourTrades
    ? +(materials + plant + subcontractors + other).toFixed(2)
    : +items.reduce((s, i) => s + i.lineTotal, 0).toFixed(2)

  const total = hasLabourTrades
    ? +(labour + itemNonLabourTotal).toFixed(2)
    : itemNonLabourTotal

  return { labour, materials, plant, subcontractors, other, total }
}
