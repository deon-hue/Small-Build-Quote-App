// ── Estimator types & utilities ────────────────────────────────────────────
// Measurement-based cost breakdown layer added to each quote phase.
// Stored as QuotePhase.estimatorItems in the existing JSONB phases column.

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
  // Rates (cost per unit)
  labourRate: number
  materialsRate: number
  plantRate: number
  subRate: number
  otherRate: number
  wastePercent: number
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
  const wasteMult      = 1 + item.wastePercent / 100
  const labourTotal    = +(m * item.labourRate).toFixed(2)
  const materialsTotal = +(m * item.materialsRate * wasteMult).toFixed(2)
  const plantTotal     = +(m * item.plantRate).toFixed(2)
  const subTotal       = +(m * item.subRate).toFixed(2)
  const otherTotal     = +(m * item.otherRate).toFixed(2)
  const lineTotal      = labourTotal + materialsTotal + plantTotal + subTotal + otherTotal
  return {
    ...item,
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
    labourTotal: 0, materialsTotal: 0, plantTotal: 0,
    subTotal: 0, otherTotal: 0, lineTotal: 0,
    notes: '',
    isCosted: false,
  }
  return base
}

/** Aggregate estimator items → per-type totals for lump-sum compatibility */
export function estimatorAggregates(items: EstimatorItem[]) {
  const costed = items.filter(i => i.isCosted)
  return {
    labour:         +costed.reduce((s, i) => s + i.labourTotal,    0).toFixed(2),
    materials:      +costed.reduce((s, i) => s + i.materialsTotal, 0).toFixed(2),
    plant:          +costed.reduce((s, i) => s + i.plantTotal,     0).toFixed(2),
    subcontractors: +costed.reduce((s, i) => s + i.subTotal,       0).toFixed(2),
    other:          +costed.reduce((s, i) => s + i.otherTotal,     0).toFixed(2),
    total:          +costed.reduce((s, i) => s + i.lineTotal,      0).toFixed(2),
  }
}
