// The one list of steel sections every steel calculator offers: universal beams (UB), universal columns (UC) and square hollow sections (SHS), each with its weight a metre and its dimensions as typically published
// (the 'Blue Book' tables). Structural Openings, Steel Beams Columns & Posts, the wall calculators' steel pop-up, Windows & Doors and the Take-off panel all read this list, so a size added here is everywhere.
// The weight is what prices the steel. The dimensions are for the section details panel: check them against the maker's or merchant's table before relying on one. Nothing here designs a member: the engineer does.
//
// The sections the calculators already offered keep exactly the weight, coating surface and casing girth they were priced with, so no saved price moves. Pure: no imports.

export type SectionFamily = 'UB' | 'UC' | 'SHS'

export interface CatalogueSection {
  label: string
  family: SectionFamily
  /** kg a metre: what the calculators price */
  kgPerM: number
  /** m² of surface a metre, for a coating */
  surfaceM2PerM: number
  /** the girth in mm of a fire casing round it */
  boxGirthMm: number
  /** overall depth, overall width, web thickness (a hollow section's wall), flange thickness, root radius, mm */
  depthMm: number
  widthMm: number
  webMm: number
  flangeMm: number
  rootMm: number
}

type Kept = { kgPerM: number; surfaceM2PerM: number; boxGirthMm: number }
const round2 = (x: number) => Math.round(x * 100) / 100

// [serial size, nominal weight, depth, width, web, flange, root radius]
type Row = [string, number, number, number, number, number, number]
const UB_ROWS: Row[] = [
  ['127 × 76', 13, 127.0, 76.0, 4.0, 7.6, 7.6],
  ['152 × 89', 16, 152.4, 88.7, 4.5, 7.7, 7.6],
  ['178 × 102', 19, 177.8, 101.2, 4.8, 7.9, 7.6],
  ['203 × 102', 23, 203.2, 101.8, 5.4, 9.3, 7.6],
  ['203 × 133', 25, 203.2, 133.2, 5.7, 7.8, 7.6],
  ['203 × 133', 30, 206.8, 133.9, 6.4, 9.6, 7.6],
  ['254 × 102', 22, 254.0, 101.6, 5.7, 6.8, 7.6],
  ['254 × 102', 25, 257.2, 101.9, 6.0, 8.4, 7.6],
  ['254 × 102', 28, 260.4, 102.2, 6.3, 10.0, 7.6],
  ['254 × 146', 31, 251.4, 146.1, 6.0, 8.6, 7.6],
  ['254 × 146', 37, 256.0, 146.4, 6.3, 10.9, 7.6],
  ['254 × 146', 43, 259.6, 147.3, 7.2, 12.7, 7.6],
  ['305 × 102', 25, 305.1, 101.6, 5.8, 7.0, 7.6],
  ['305 × 102', 28, 308.7, 101.8, 6.0, 8.8, 7.6],
  ['305 × 102', 33, 312.7, 102.4, 6.6, 10.8, 7.6],
  ['305 × 127', 37, 304.4, 123.4, 7.1, 10.7, 8.9],
  ['305 × 127', 42, 307.2, 124.3, 8.0, 12.1, 8.9],
  ['305 × 127', 48, 311.0, 125.3, 9.0, 14.0, 8.9],
  ['305 × 165', 40, 303.4, 165.0, 6.0, 10.2, 8.9],
  ['305 × 165', 46, 306.6, 165.7, 6.7, 11.8, 8.9],
  ['305 × 165', 54, 310.4, 166.9, 7.9, 13.7, 8.9],
  ['356 × 127', 33, 349.0, 125.4, 6.0, 8.5, 10.2],
  ['356 × 127', 39, 353.4, 126.0, 6.6, 10.7, 10.2],
  ['356 × 171', 45, 351.4, 171.1, 7.0, 9.7, 10.2],
  ['356 × 171', 51, 355.0, 171.5, 7.4, 11.5, 10.2],
  ['356 × 171', 57, 358.0, 172.2, 8.1, 13.0, 10.2],
  ['356 × 171', 67, 363.4, 173.2, 9.1, 15.7, 10.2],
  ['406 × 140', 39, 398.0, 141.8, 6.4, 8.6, 10.2],
  ['406 × 140', 46, 403.2, 142.2, 6.8, 11.2, 10.2],
  ['406 × 178', 54, 402.6, 177.7, 7.7, 10.9, 10.2],
  ['406 × 178', 60, 406.4, 177.9, 7.9, 12.8, 10.2],
  ['406 × 178', 67, 409.4, 178.8, 8.8, 14.3, 10.2],
  ['406 × 178', 74, 412.8, 179.5, 9.5, 16.0, 10.2],
  ['457 × 152', 52, 449.8, 152.4, 7.6, 10.9, 10.2],
  ['457 × 152', 60, 454.6, 152.9, 8.1, 13.3, 10.2],
  ['457 × 152', 67, 458.0, 153.8, 9.0, 15.0, 10.2],
  ['457 × 152', 74, 462.0, 154.4, 9.6, 17.0, 10.2],
  ['457 × 152', 82, 465.8, 155.3, 10.5, 18.9, 10.2],
  ['457 × 191', 67, 453.4, 189.9, 8.5, 12.7, 10.2],
  ['457 × 191', 74, 457.0, 190.4, 9.0, 14.5, 10.2],
  ['457 × 191', 82, 460.0, 191.3, 9.9, 16.0, 10.2],
  ['457 × 191', 89, 463.4, 191.9, 10.5, 17.7, 10.2],
  ['457 × 191', 98, 467.2, 192.8, 11.4, 19.6, 10.2],
  ['533 × 210', 82, 528.3, 208.8, 9.6, 13.2, 12.7],
  ['533 × 210', 92, 533.1, 209.3, 10.1, 15.6, 12.7],
  ['533 × 210', 101, 536.7, 210.0, 10.8, 17.4, 12.7],
  ['533 × 210', 109, 539.5, 210.8, 11.6, 18.8, 12.7],
  ['533 × 210', 122, 544.5, 211.9, 12.7, 21.3, 12.7],
  ['610 × 229', 101, 602.6, 227.6, 10.5, 14.8, 12.7],
  ['610 × 229', 113, 607.6, 228.2, 11.1, 17.3, 12.7],
  ['610 × 229', 125, 612.2, 229.0, 11.9, 19.6, 12.7],
  ['610 × 229', 140, 617.2, 230.2, 13.1, 22.1, 12.7],
]
const UC_ROWS: Row[] = [
  ['152 × 152', 23, 152.4, 152.2, 5.8, 6.8, 7.6],
  ['152 × 152', 30, 157.6, 152.9, 6.5, 9.4, 7.6],
  ['152 × 152', 37, 161.8, 154.4, 8.0, 11.5, 7.6],
  ['152 × 152', 44, 166.0, 155.9, 9.5, 13.6, 7.6],
  ['152 × 152', 51, 170.2, 157.4, 11.0, 15.7, 7.6],
  ['203 × 203', 46, 203.2, 203.6, 7.2, 11.0, 10.2],
  ['203 × 203', 52, 206.2, 204.3, 7.9, 12.5, 10.2],
  ['203 × 203', 60, 209.6, 205.8, 9.4, 14.2, 10.2],
  ['203 × 203', 71, 215.8, 206.4, 10.0, 17.3, 10.2],
  ['203 × 203', 86, 222.2, 209.1, 12.7, 20.5, 10.2],
  ['254 × 254', 73, 254.1, 254.6, 8.6, 14.2, 12.7],
  ['254 × 254', 89, 260.3, 256.3, 10.3, 17.3, 12.7],
  ['254 × 254', 107, 266.7, 258.8, 12.8, 20.5, 12.7],
  ['254 × 254', 132, 276.3, 261.3, 15.3, 25.3, 12.7],
  ['305 × 305', 97, 307.9, 305.3, 9.9, 15.4, 15.2],
  ['305 × 305', 118, 314.5, 307.4, 12.0, 18.7, 15.2],
  ['305 × 305', 137, 320.5, 309.2, 13.8, 21.7, 15.2],
  ['305 × 305', 158, 327.1, 311.2, 15.8, 25.0, 15.2],
]
// [side, wall, weight]
const SHS_ROWS: [number, number, number][] = [
  [60, 5, 8.4], [70, 5, 10.0], [80, 5, 11.3], [90, 5, 13.3], [100, 5, 14.7], [100, 6.3, 18.2], [100, 8, 22.6], [120, 6.3, 22.2], [150, 6.3, 27.4], [150, 8, 35.4], [200, 8, 47.0], [200, 10, 59.3],
]

/** what the sizes the calculators already offered were priced with: kept to the penny */
const KEPT: Record<string, Kept> = {
  '152 × 89 UB 16': { kgPerM: 16, surfaceM2PerM: 0.53, boxGirthMm: 493 },
  '178 × 102 UB 19': { kgPerM: 19, surfaceM2PerM: 0.6, boxGirthMm: 558 },
  '203 × 133 UB 25': { kgPerM: 25, surfaceM2PerM: 0.78, boxGirthMm: 639 },
  '203 × 133 UB 30': { kgPerM: 30, surfaceM2PerM: 0.78, boxGirthMm: 639 },
  '254 × 146 UB 31': { kgPerM: 31, surfaceM2PerM: 0.9, boxGirthMm: 754 },
  '254 × 146 UB 37': { kgPerM: 37, surfaceM2PerM: 0.91, boxGirthMm: 754 },
  '254 × 146 UB 43': { kgPerM: 43, surfaceM2PerM: 0.92, boxGirthMm: 754 },
  '305 × 127 UB 37': { kgPerM: 37, surfaceM2PerM: 1.09, boxGirthMm: 837 },
  '305 × 165 UB 40': { kgPerM: 40, surfaceM2PerM: 1.19, boxGirthMm: 871 },
  '305 × 165 UB 54': { kgPerM: 54, surfaceM2PerM: 1.22, boxGirthMm: 886 },
  '356 × 171 UB 45': { kgPerM: 45, surfaceM2PerM: 1.38, boxGirthMm: 975 },
  '406 × 178 UB 54': { kgPerM: 54, surfaceM2PerM: 1.5, boxGirthMm: 1083 },
  '457 × 191 UB 67': { kgPerM: 67, surfaceM2PerM: 1.65, boxGirthMm: 1197 },
  '533 × 210 UB 82': { kgPerM: 82, surfaceM2PerM: 1.87, boxGirthMm: 1366 },
  '152 × 152 UC 23': { kgPerM: 23, surfaceM2PerM: 0.92, boxGirthMm: 700 },
  '203 × 203 UC 46': { kgPerM: 46, surfaceM2PerM: 1.19, boxGirthMm: 900 },
  '254 × 254 UC 73': { kgPerM: 73, surfaceM2PerM: 1.51, boxGirthMm: 1120 },
  '305 × 305 UC 97': { kgPerM: 97, surfaceM2PerM: 1.82, boxGirthMm: 1330 },
  '80 × 80 × 5 SHS': { kgPerM: 11.3, surfaceM2PerM: 0.32, boxGirthMm: 620 },
  '100 × 100 × 5 SHS': { kgPerM: 14.7, surfaceM2PerM: 0.4, boxGirthMm: 700 },
  '150 × 150 × 6.3 SHS': { kgPerM: 27.4, surfaceM2PerM: 0.6, boxGirthMm: 900 },
  '200 × 200 × 8 SHS': { kgPerM: 47, surfaceM2PerM: 0.8, boxGirthMm: 1100 },
}

const open = (family: 'UB' | 'UC') => ([serial, kg, depthMm, widthMm, webMm, flangeMm, rootMm]: Row): CatalogueSection => {
  const label = `${serial} ${family} ${kg}`
  const surface = round2((2 * depthMm + 4 * widthMm - 2 * webMm) / 1000)
  const girth = Math.round(family === 'UB' ? 2 * depthMm + widthMm + 100 : 2 * (depthMm + widthMm) + 100)
  const k = KEPT[label] ?? { kgPerM: kg, surfaceM2PerM: surface, boxGirthMm: girth }
  return { label, family, ...k, depthMm, widthMm, webMm, flangeMm, rootMm }
}
const hollow = ([side, wall, kg]: [number, number, number]): CatalogueSection => {
  const label = `${side} × ${side} × ${wall} SHS`
  const k = KEPT[label] ?? { kgPerM: kg, surfaceM2PerM: round2((4 * side) / 1000), boxGirthMm: 4 * side + 300 }
  return { label, family: 'SHS', ...k, depthMm: side, widthMm: side, webMm: wall, flangeMm: wall, rootMm: 0 }
}

export const UB_SECTIONS: CatalogueSection[] = UB_ROWS.map(open('UB'))
export const UC_SECTIONS: CatalogueSection[] = UC_ROWS.map(open('UC'))
export const SHS_SECTIONS: CatalogueSection[] = SHS_ROWS.map(hollow)
export const ALL_SECTIONS: CatalogueSection[] = [...UB_SECTIONS, ...UC_SECTIONS, ...SHS_SECTIONS]
export const SECTION_BY_LABEL: Record<string, CatalogueSection> = Object.fromEntries(ALL_SECTIONS.map(s => [s.label, s]))

/** The properties of an I-section about its major axis from its dimensions, root radii included: area cm², second moment of area cm⁴, elastic and plastic moduli cm³. */
export function iProperties(s: Pick<CatalogueSection, 'depthMm' | 'widthMm' | 'webMm' | 'flangeMm' | 'rootMm'>): { areaCm2: number; ixxCm4: number; welCm3: number; wplCm3: number } {
  const { depthMm: h, widthMm: b, webMm: t, flangeMm: T, rootMm: r } = s
  const hw = h - 2 * T
  // each of the four root fillets: a square of side r less a quarter circle, its centroid 0.2234r from each face it sits in
  const af = r * r * (1 - Math.PI / 4)
  const yf = hw / 2 - 0.2234 * r
  const area = 2 * b * T + hw * t + 4 * af
  const ixx = (b * h ** 3 - (b - t) * hw ** 3) / 12 + 4 * af * yf * yf
  const wpl = b * T * (h - T) + (t * hw * hw) / 4 + 4 * af * yf
  return { areaCm2: area / 100, ixxCm4: ixx / 1e4, welCm3: ixx / (h / 2) / 1e3, wplCm3: wpl / 1e3 }
}
