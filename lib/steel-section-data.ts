// The dimensions and section properties of the steel sections the calculators offer (universal beams, universal columns, square hollow sections), for a section spec panel: depth, width, web and flange thickness, weight, area and,
// for beams and columns, the second moment of area and the elastic and plastic moduli about the major axis. Typical catalogue figures (the 'Blue Book' tables as widely published) written out by hand: check them against
// the maker's or merchant's table before relying on one. They are not used to price anything (the price uses the weight a metre in structural-steel-units.ts) and not to design anything: the engineer designs the real member.
// The sizes themselves are the shared list (lib/steel-sections.ts): the sizes with figures typed below keep them, the rest are worked out from their dimensions. Pure.

import { ALL_SECTIONS, iProperties } from './steel-sections'

export type SectionFamily = 'UB' | 'UC' | 'SHS'

export interface SectionSpec {
  label: string
  family: SectionFamily
  /** overall depth D, mm */
  depthMm: number
  /** overall width B, mm (a flange's width; a square hollow section's side) */
  widthMm: number
  /** web thickness t, mm (a hollow section's wall thickness) */
  webMm: number
  /** flange thickness T, mm (a hollow section: the same as its wall) */
  flangeMm: number
  /** catalogue weight, kg per metre */
  kgPerM: number
  /** second moment of area about the major axis, cm4 (not given for a hollow section) */
  ixxCm4?: number
  /** elastic modulus about the major axis, cm3 */
  welCm3?: number
  /** plastic modulus about the major axis, cm3 */
  wplCm3?: number
}

const ub = (label: string, depthMm: number, widthMm: number, webMm: number, flangeMm: number, kgPerM: number, ixxCm4: number, welCm3: number, wplCm3: number): SectionSpec => ({ label, family: 'UB', depthMm, widthMm, webMm, flangeMm, kgPerM, ixxCm4, welCm3, wplCm3 })
const uc = (label: string, depthMm: number, widthMm: number, webMm: number, flangeMm: number, kgPerM: number, ixxCm4: number, welCm3: number, wplCm3: number): SectionSpec => ({ label, family: 'UC', depthMm, widthMm, webMm, flangeMm, kgPerM, ixxCm4, welCm3, wplCm3 })
const shs = (label: string, sideMm: number, wallMm: number, kgPerM: number): SectionSpec => ({ label, family: 'SHS', depthMm: sideMm, widthMm: sideMm, webMm: wallMm, flangeMm: wallMm, kgPerM })

const TYPED: SectionSpec[] = [
  ub('152 × 89 UB 16', 152.4, 88.7, 4.5, 7.7, 16.0, 834, 109, 123),
  ub('178 × 102 UB 19', 177.8, 101.2, 4.8, 7.9, 19.0, 1356, 153, 171),
  ub('203 × 133 UB 25', 203.2, 133.2, 5.7, 7.8, 25.1, 2340, 230, 258),
  ub('203 × 133 UB 30', 206.8, 133.9, 6.4, 9.6, 30.0, 2896, 280, 314),
  ub('254 × 146 UB 31', 251.4, 146.1, 6.0, 8.6, 31.1, 4413, 351, 393),
  ub('254 × 146 UB 37', 256.0, 146.4, 6.3, 10.9, 37.0, 5537, 433, 483),
  ub('254 × 146 UB 43', 259.6, 147.3, 7.2, 12.7, 43.0, 6544, 504, 566),
  ub('305 × 165 UB 40', 303.4, 165.0, 6.0, 10.2, 40.3, 8503, 560, 623),
  ub('305 × 165 UB 54', 310.4, 166.9, 7.9, 13.7, 54.0, 11700, 754, 846),
  ub('305 × 127 UB 37', 304.4, 123.4, 7.1, 10.7, 37.0, 7171, 471, 539),
  ub('356 × 171 UB 45', 351.4, 171.1, 7.0, 9.7, 45.0, 12070, 687, 775),
  ub('406 × 178 UB 54', 402.6, 177.7, 7.7, 10.9, 54.1, 18720, 930, 1060),
  ub('457 × 191 UB 67', 453.4, 189.9, 8.5, 12.7, 67.1, 29380, 1296, 1471),
  ub('533 × 210 UB 82', 528.3, 208.8, 9.6, 13.2, 82.2, 47540, 1800, 2060),
  uc('152 × 152 UC 23', 152.4, 152.2, 5.8, 6.8, 23.0, 1250, 164, 182),
  uc('203 × 203 UC 46', 203.2, 203.6, 7.2, 11.0, 46.1, 4568, 450, 497),
  uc('254 × 254 UC 73', 254.1, 254.6, 8.6, 14.2, 73.1, 11410, 898, 992),
  uc('305 × 305 UC 97', 307.9, 305.3, 9.9, 15.4, 96.9, 22250, 1445, 1592),
  shs('80 × 80 × 5 SHS', 80, 5, 11.7),
  shs('100 × 100 × 5 SHS', 100, 5, 14.7),
  shs('150 × 150 × 6.3 SHS', 150, 6.3, 27.4),
  shs('200 × 200 × 8 SHS', 200, 8, 47.0),
]
/** every size the calculators offer, in the shared list's order */
export const SECTION_SPECS: SectionSpec[] = ALL_SECTIONS.map(s => {
  const typed = TYPED.find(t => t.label === s.label)
  if (typed) return typed
  if (s.family === 'SHS') return shs(s.label, s.widthMm, s.webMm, s.kgPerM)
  const p = iProperties(s)
  return (s.family === 'UB' ? ub : uc)(s.label, s.depthMm, s.widthMm, s.webMm, s.flangeMm, s.kgPerM, Math.round(p.ixxCm4), Math.round(p.welCm3), Math.round(p.wplCm3))
})
export const SECTION_SPEC_BY_LABEL: Record<string, SectionSpec> = Object.fromEntries(SECTION_SPECS.map(s => [s.label, s]))

/** The dimensions and properties of a section by its name, or null if it is not one of these (timber, a typed name, 'auto') */
export const sectionSpec = (label: string): SectionSpec | null => SECTION_SPEC_BY_LABEL[label] ?? null

/** Steel grades offered (S355 is the usual for new structural steel; S275 is older or lighter work). The grade goes on the quote wording: it does not change the sample price. */
export const STEEL_GRADES = ['S275', 'S355'] as const
export type SteelGrade = (typeof STEEL_GRADES)[number]
export const isSteelGrade = (g: unknown): g is SteelGrade => g === 'S275' || g === 'S355'
export const USUAL_GRADE: SteelGrade = 'S355'

/** The cross-sectional area, cm²: the weight a metre over the density of steel (7850 kg/m³ is 0.785 kg a metre for each cm²) */
export const areaCm2 = (kgPerM: number): number => kgPerM / 0.785

export interface SpecRow { label: string; value: string }

/**
 * The rows of a section's spec for the panel: depth, width, thicknesses, weight, area and, for a beam or column, the second moment of area and the moduli, then the weight of the member itself. `pricedKgPerM` is the weight a
 * metre the calculator prices at (a sample, which can differ a little from the catalogue's), `lengthMm` and `qty` the member.
 */
export function specRows(spec: SectionSpec, pricedKgPerM: number, lengthMm: number, qty: number): SpecRow[] {
  const n1 = (x: number) => (Math.round(x * 10) / 10).toString()
  const rows: SpecRow[] = spec.family === 'SHS'
    ? [{ label: 'Outside size', value: `${n1(spec.depthMm)} × ${n1(spec.widthMm)}mm` }, { label: 'Wall thickness', value: `${n1(spec.webMm)}mm` }]
    : [{ label: 'Depth (D)', value: `${n1(spec.depthMm)}mm` }, { label: 'Width (B)', value: `${n1(spec.widthMm)}mm` }, { label: 'Web thickness (t)', value: `${n1(spec.webMm)}mm` }, { label: 'Flange thickness (T)', value: `${n1(spec.flangeMm)}mm` }]
  rows.push({ label: 'Weight priced', value: `${n1(pricedKgPerM)} kg/m` })
  rows.push({ label: 'Area', value: `${n1(areaCm2(spec.kgPerM))} cm²` })
  if (spec.ixxCm4 != null) rows.push({ label: 'Second moment of area (Ixx)', value: `${Math.round(spec.ixxCm4).toLocaleString('en-GB')} cm⁴` })
  if (spec.welCm3 != null) rows.push({ label: 'Elastic modulus (Wel,x)', value: `${Math.round(spec.welCm3).toLocaleString('en-GB')} cm³` })
  if (spec.wplCm3 != null) rows.push({ label: 'Plastic modulus (Wpl,x)', value: `${Math.round(spec.wplCm3).toLocaleString('en-GB')} cm³` })
  if (lengthMm > 0 && qty >= 1) {
    const each = pricedKgPerM * lengthMm / 1000
    rows.push({ label: qty === 1 ? 'This member weighs' : `Each of the ${qty} weighs`, value: `${n1(each)}kg` })
    if (qty > 1) rows.push({ label: 'All together', value: `${n1(each * qty)}kg` })
  }
  return rows
}
