// Scale presets in Take-off need to know how big one picture pixel is ON PAPER. A plan printed 1:150 means 1mm on the sheet is 150mm in real life, so a preset is only right when the paper size is
// known. A PDF page is drawn into a picture at 2x its size (144 pixels to the inch), so a PDF's pixel is always 25.4/144 mm of paper whatever the sheet size, and an A1 and an A3 differ only in how
// many pixels they have. A plain image (a photo or a scan) has no known paper size, so the user says what it is. Pure rules, tested.

/** How many mm of paper one pixel is, for a PDF page drawn at 2x (the page is measured in 1/72 inch points, so 2x is 144 pixels to the inch). */
export const PDF_RENDER_MM_PER_PX = 25.4 / 144

export interface PaperSize { name: string; longMm: number; shortMm: number }

export const PAPER_SIZES: PaperSize[] = [
  { name: 'A0', longMm: 1189, shortMm: 841 },
  { name: 'A1', longMm: 841, shortMm: 594 },
  { name: 'A2', longMm: 594, shortMm: 420 },
  { name: 'A3', longMm: 420, shortMm: 297 },
  { name: 'A4', longMm: 297, shortMm: 210 },
]

/** The scales offered, as the second number of 1:n. */
export const SCALE_DENOMS = [20, 50, 75, 100, 125, 150, 200, 250, 500]

export const scaleLabel = (denom: number): string => `1:${denom}`

/** n from a label like "1:150" or "1:100 (A1)", or null for anything else (a custom calibration). */
export function denomFromLabel(label: string | undefined): number | null {
  const m = /^\s*1\s*:\s*(\d+(?:\.\d+)?)/.exec(label ?? '')
  return m ? +m[1] : null
}

/** Metres of real life per picture pixel, for a plan drawn at 1:denom where one pixel is mmPerPx mm of paper. */
export const mppForScale = (mmPerPx: number, denom: number): number => (mmPerPx * denom) / 1000

/** The A-size whose sheet measures about this many mm (long side and, when given, short side), within 4%, or null. */
export function paperFromMm(longMm: number, shortMm?: number): PaperSize | null {
  const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.04
  return PAPER_SIZES.find(p => near(longMm, p.longMm) && (shortMm === undefined || near(shortMm, p.shortMm))) ?? null
}

/** For a picture that is the size of a PDF page drawn at 2x: the A-size it must be and how many mm of paper a pixel is. Null if it is not an A-size sheet (so it must be asked). */
export function inferPdfPaper(widthPx: number, heightPx: number): { paper: string; mmPerPx: number } | null {
  if (!(widthPx > 0 && heightPx > 0)) return null
  const long = Math.max(widthPx, heightPx), short = Math.min(widthPx, heightPx)
  const p = paperFromMm(long * PDF_RENDER_MM_PER_PX, short * PDF_RENDER_MM_PER_PX)
  return p ? { paper: p.name, mmPerPx: PDF_RENDER_MM_PER_PX } : null
}

/** mm of paper per pixel for a picture that is the whole of a sheet of the named paper (its long side matches the paper's long side). */
export function mmPerPxForPaper(paperName: string, widthPx: number, heightPx: number): number | null {
  const p = PAPER_SIZES.find(x => x.name === paperName)
  const long = Math.max(widthPx, heightPx)
  return p && long > 0 ? p.longMm / long : null
}
