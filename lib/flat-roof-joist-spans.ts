// A span chart for solid timber flat roof joists (47mm wide, C16 and C24): the longest span each section
// manages at 300, 400 and 600mm centres, and the smallest section that works for a given span. The flat
// roof calculator reads it to suggest a joist size and to warn when the size chosen is too small for the
// span — the warning goes away as soon as the section is big enough.
//
// The figures are worked out from beam formulae (below) rather than typed in, so the loading can be
// changed. They are CAUTIOUS and INDICATIVE — a pricing aid, not a design. They land close to the usual
// published flat-roof span tables, but the joist size for a real roof stays with the span tables, the
// timber supplier, an engineer or Building Control. To use a published or supplier's chart instead, replace
// `maxFlatRoofJoistSpanMm` with a lookup into it — nothing else needs to change.
//
// Method (Eurocode 5 style, simply supported joist, uniform load):
//   Loads:      permanent = the roof build-up (covering, insulation, deck, ceiling, services — `deadKnM2`)
//               plus the joist's own weight; variable = snow / access for maintenance (`imposedKnM2`).
//   Bending:    (1.35 × permanent + 1.5 × variable) with kmod 0.8 (medium term), ksys 1.1 (joists working
//               together under a deck), γM 1.3, and the small-section depth factor kh.
//   Shear:      the same design load, crack factor 0.67.
//   Deflection: the cautious choice — the minimum (5th percentile) stiffness E0,05, the permanent load
//               increased by 1.6 for creep (kdef 0.6), limited to 0.003 × span (the long-standing timber
//               joist limit).
// Deflection governs for nearly every section here; bending and shear are checked anyway.

export type SolidJoistGrade = 'c16' | 'c24'

/** The solid timber joist sections offered (all 47mm wide), shallowest first. */
export const JOIST_SECTION_DEPTHS_MM = [100, 125, 150, 175, 200, 225, 250] as const
/** The centres the chart is worked out for. */
export const SPAN_CHART_CENTRES_MM = [300, 400, 600] as const

export interface JoistSpanLoads {
  /** Permanent load from the roof build-up, kN/m² (the joist's own weight is added). */
  deadKnM2: number
  /** Snow and access for maintenance, kN/m². */
  imposedKnM2: number
}
/** Cautious defaults: a warm or cold roof with insulation, deck, covering, ceiling and services (1.0), and
 * snow with maintenance access (0.75). */
export const DEFAULT_JOIST_SPAN_LOADS: JoistSpanLoads = { deadKnM2: 1.0, imposedKnM2: 0.75 }

const JOIST_WIDTH_MM = 47
// EN 338 strength classes: bending fm,k and shear fv,k (N/mm²), 5th-percentile stiffness E0,05 (N/mm²),
// and mean density as a unit weight (kN/m³).
const GRADE = {
  c16: { fm: 16, fv: 3.2, e05: 5400, weightKnM3: 370 * 9.81 / 1000 },
  c24: { fm: 24, fv: 4.0, e05: 7400, weightKnM3: 420 * 9.81 / 1000 },
} as const

const KMOD = 0.8, KSYS = 1.1, GAMMA_M = 1.3, KCR = 0.67, KDEF = 0.6, DEFLECTION_LIMIT = 0.003

export type SpanGovernedBy = 'deflection' | 'bending' | 'shear'

/** The longest span (mm, rounded down to the nearest 50) a solid timber joist manages, and what limits it. */
export function maxFlatRoofJoistSpanMm(
  grade: SolidJoistGrade, depthMm: number, centresMm: number, loads: JoistSpanLoads = DEFAULT_JOIST_SPAN_LOADS,
): { spanMm: number; governedBy: SpanGovernedBy } {
  const g = GRADE[grade]
  const b = JOIST_WIDTH_MM, d = depthMm, c = centresMm
  const I = b * d ** 3 / 12                       // mm⁴
  const W = b * d * d / 6                         // mm³
  const A = b * d                                 // mm²
  const selfKnM2 = (b * d / 1e6) * g.weightKnM3 / (c / 1000)
  const wG = (loads.deadKnM2 + selfKnM2) * c / 1000   // permanent load on one joist, N/mm (= kN/m)
  const wQ = loads.imposedKnM2 * c / 1000             // variable load on one joist, N/mm
  const wDesign = 1.35 * wG + 1.5 * wQ

  const kh = d < 150 ? Math.min(1.3, (150 / d) ** 0.2) : 1
  const fmd = KMOD * KSYS * kh * g.fm / GAMMA_M
  const fvd = KMOD * g.fv / GAMMA_M
  const bending = Math.sqrt(8 * W * fmd / wDesign)
  const shear = 2 * (fvd * KCR * A / 1.5) / wDesign
  const deflection = Math.cbrt(DEFLECTION_LIMIT * 384 * g.e05 * I / (5 * ((1 + KDEF) * wG + wQ)))

  const spanMm = Math.min(bending, shear, deflection)
  const governedBy: SpanGovernedBy = spanMm === deflection ? 'deflection' : spanMm === bending ? 'bending' : 'shear'
  return { spanMm: Math.floor(spanMm / 50) * 50, governedBy }
}

export interface FlatRoofSpanChartRow { depthMm: number; spansMm: Record<number, number> }

/** The whole chart for one grade: a row per section, the longest span at each set of centres. */
export function flatRoofSpanChart(grade: SolidJoistGrade, loads: JoistSpanLoads = DEFAULT_JOIST_SPAN_LOADS): FlatRoofSpanChartRow[] {
  return JOIST_SECTION_DEPTHS_MM.map(depthMm => ({
    depthMm,
    spansMm: Object.fromEntries(SPAN_CHART_CENTRES_MM.map(c => [c, maxFlatRoofJoistSpanMm(grade, depthMm, c, loads).spanMm])),
  }))
}

export interface FlatRoofJoistCheck {
  status: 'ok' | 'under' | 'beyond'
  /** The longest span the chosen section manages at these centres. */
  maxSpanMm: number
  governedBy: SpanGovernedBy
  /** The smallest section that works for the span at these centres, or null if none of them does. */
  suggestedDepthMm: number | null
  /** How much shorter the chosen section's limit is than the span (mm) when it's too small, else 0. */
  shortByMm: number
  /** When no section works at these centres: closer centres and the section that would work with them, if any. */
  closerCentres: { centresMm: number; depthMm: number } | null
}

/** Looks the span up in the chart. 'ok' — the chosen section is enough; 'under' — it's too small and
 * `suggestedDepthMm` is what would work; 'beyond' — no solid timber section spans that far at these centres. */
export function checkFlatRoofJoist(input: {
  grade: SolidJoistGrade; depthMm: number; centresMm: number; spanMm: number; loads?: JoistSpanLoads
}): FlatRoofJoistCheck {
  const loads = input.loads ?? DEFAULT_JOIST_SPAN_LOADS
  const chosen = maxFlatRoofJoistSpanMm(input.grade, input.depthMm, input.centresMm, loads)
  const suggestedDepthMm = JOIST_SECTION_DEPTHS_MM.find(d => maxFlatRoofJoistSpanMm(input.grade, d, input.centresMm, loads).spanMm >= input.spanMm) ?? null
  const enough = chosen.spanMm >= input.spanMm
  let closerCentres: FlatRoofJoistCheck['closerCentres'] = null
  if (!enough && suggestedDepthMm === null) {
    for (const c of [...SPAN_CHART_CENTRES_MM].reverse().filter(x => x < input.centresMm)) {
      const depthMm = JOIST_SECTION_DEPTHS_MM.find(d => maxFlatRoofJoistSpanMm(input.grade, d, c, loads).spanMm >= input.spanMm)
      if (depthMm !== undefined) { closerCentres = { centresMm: c, depthMm }; break }
    }
  }
  return {
    status: enough ? 'ok' : suggestedDepthMm === null ? 'beyond' : 'under',
    maxSpanMm: chosen.spanMm,
    governedBy: chosen.governedBy,
    suggestedDepthMm,
    shortByMm: enough ? 0 : input.spanMm - chosen.spanMm,
    closerCentres,
  }
}
