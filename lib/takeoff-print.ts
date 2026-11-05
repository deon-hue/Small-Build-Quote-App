// Printing a take-off drawing as a PDF: the paper, where the picture goes on the page, the scale it comes out at, the title block's words and the file name. Pure (no PDF library, no screen), so it can be tested on its own;
// the picture is made by Take-off (app/(app)/takeoff/page.tsx) and the PDF by lib/takeoff-print-pdf.ts. The drawing shows no prices: it is a plan printout with a key and a description of the work, not a priced document.

export type PaperName = 'A4' | 'A3' | 'A2' | 'A1' | 'A0'
/** the paper, portrait, in mm */
export const PAPER_MM: Record<PaperName, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 }, A2: { w: 420, h: 594 }, A1: { w: 594, h: 841 }, A0: { w: 841, h: 1189 } }
export const PAPER_NAMES = Object.keys(PAPER_MM) as PaperName[]
/** the scales offered for a true-scale print (the denominator: 1:50 is 50) */
export const PRINT_SCALES = [20, 50, 75, 100, 125, 150, 200, 250, 500] as const

export const PT_PER_MM = 72 / 25.4
export const MARGIN_MM = 10
/** the height of the title block along the bottom of the page, and of the key row above it when there is one */
export const TITLE_BLOCK_MM = 26
export const KEY_ROW_MM = 9
const GAP_MM = 3

export interface PrintRegion {
  /** the part of the sheet that is printed, in plan pixels */
  w: number
  h: number
}

export interface PrintLayoutInput {
  paper: PaperName
  region: PrintRegion
  /** metres per plan pixel, when the sheet's scale is set (0 or missing: not set) */
  mpp?: number
  /** 'fit': as big as the page allows. A number: that scale (50 is 1:50), if it fits */
  scale: 'fit' | number
  titleBlock: boolean
  keyRow: boolean
}

export interface PrintLayout {
  landscape: boolean
  /** page size in points */
  pageW: number
  pageH: number
  /** where the picture goes, in points, from the bottom left of the page */
  imgX: number
  imgY: number
  imgW: number
  imgH: number
  /** the title block's and key row's boxes, in points from the bottom left (null when not wanted) */
  titleBox: { x: number; y: number; w: number; h: number } | null
  keyBox: { x: number; y: number; w: number; h: number } | null
  /** the scale the picture comes out at (100 is 1:100), or null when the sheet's scale is not set */
  scaleDenom: number | null
  /** how to say it on the sheet: '1:100 at A3', 'about 1:87 at A3 (fitted)', 'Scale not set' */
  scaleText: string
  /** a sentence for the person when what they asked for could not be done (the scale was too big for the paper, so it was fitted) */
  note: string
}

const mm = (n: number) => n * PT_PER_MM

/** Where the picture goes on the page and what scale it comes out at. */
export function printLayout(i: PrintLayoutInput): PrintLayout {
  const p = PAPER_MM[i.paper]
  if (!p) throw new Error('Pick a paper size.')
  if (!(i.region.w > 0 && i.region.h > 0)) throw new Error('There is nothing to print: the drawing has no size.')
  const landscape = i.region.w >= i.region.h
  const pw = landscape ? p.h : p.w, ph = landscape ? p.w : p.h
  const bottomReserve = (i.titleBlock ? TITLE_BLOCK_MM + GAP_MM : 0) + (i.keyRow ? KEY_ROW_MM + GAP_MM : 0)
  const areaW = pw - 2 * MARGIN_MM
  const areaH = ph - 2 * MARGIN_MM - bottomReserve
  if (!(areaW > 20 && areaH > 20)) throw new Error('That paper is too small for the drawing and its title block.')

  const known = !!(i.mpp && i.mpp > 0)
  const realWmm = known ? i.region.w * (i.mpp as number) * 1000 : 0   // the width of the drawn part in real millimetres
  const aspect = i.region.w / i.region.h
  // as big as the area allows, the picture's shape kept
  const fitW = Math.min(areaW, areaH * aspect)
  let imgWmm = fitW
  let note = ''
  let fitted = true
  if (i.scale !== 'fit') {
    if (!known) note = 'The sheet\'s scale is not set, so the drawing was fitted to the page instead.'
    else {
      const want = realWmm / i.scale
      if (want <= areaW + 1e-6 && want / aspect <= areaH + 1e-6) { imgWmm = want; fitted = false }
      else note = `1:${i.scale} does not fit on ${i.paper}, so the drawing was fitted to the page instead.`
    }
  }
  const imgHmm = imgWmm / aspect
  // centred in the area above the key row and title block
  const x0 = MARGIN_MM + (areaW - imgWmm) / 2
  const yTop = ph - MARGIN_MM                                       // top of the area, from the bottom of the page
  const y0 = yTop - (areaH - imgHmm) / 2 - imgHmm                   // the picture's bottom edge: centred in the area, which starts at the top margin

  let denom: number | null = null
  let scaleText = 'Scale not set'
  if (known) {
    const raw = realWmm / imgWmm
    const preset = PRINT_SCALES.find(s => Math.abs(s - raw) / s < 0.01)
    denom = preset ?? Math.round(raw)
    scaleText = fitted && !preset ? `about 1:${denom} at ${i.paper} (fitted)` : `1:${denom} at ${i.paper}`
  }
  let reserveY = MARGIN_MM
  const titleBox = i.titleBlock ? { x: mm(MARGIN_MM), y: mm(reserveY), w: mm(pw - 2 * MARGIN_MM), h: mm(TITLE_BLOCK_MM) } : null
  if (i.titleBlock) reserveY += TITLE_BLOCK_MM + GAP_MM
  const keyBox = i.keyRow ? { x: mm(MARGIN_MM), y: mm(reserveY), w: mm(pw - 2 * MARGIN_MM), h: mm(KEY_ROW_MM) } : null
  return { landscape, pageW: mm(pw), pageH: mm(ph), imgX: mm(x0), imgY: mm(y0), imgW: mm(imgWmm), imgH: mm(imgHmm), titleBox, keyBox, scaleDenom: denom, scaleText, note }
}

/** How many pixels across to make the picture for a paper size: about 190 dots per inch on the long side, kept between sensible limits so the file is not huge and the picture is not coarse. */
export function rasterLongSide(paper: PaperName): number {
  const long = PAPER_MM[paper].h
  return Math.max(1800, Math.min(4500, Math.round(long * 7.5)))
}

/** A file name for the PDF: the job, the sheet and the level, with nothing a file system dislikes. */
export function printFileName(job: string, sheet?: string, level?: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = [job, sheet, level].map(s => clean(s || '')).filter(Boolean)
  const base = (parts.length ? parts.join(' - ') : 'Take-off drawing').slice(0, 100).trim()
  return `${base} - drawing.pdf`
}

/** Text broken into lines no wider than `maxW`, by the width `measure` gives each piece; a word wider than the line is cut. Blank lines in the text are kept. */
export function wrapLines(text: string, maxW: number, measure: (s: string) => number): string[] {
  const out: string[] = []
  for (const raw of text.split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean)
    if (words.length === 0) { out.push(''); continue }
    let line = ''
    for (let w of words) {
      while (measure(w) > maxW && w.length > 1) {
        // a word too wide for the line: put what fits on its own line
        let k = w.length - 1
        while (k > 1 && measure(w.slice(0, k)) > maxW) k--
        if (line) { out.push(line); line = '' }
        out.push(w.slice(0, k)); w = w.slice(k)
      }
      const next = line ? line + ' ' + w : w
      if (line && measure(next) > maxW) { out.push(line); line = w } else line = next
    }
    if (line) out.push(line)
  }
  return out
}

/** The date as the title block shows it: 5 Nov 2026 */
export function printDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** The description of the works with every line that mentions a price taken out (a printout carries none, whatever a calculator's own words say), and any heading left with nothing under it. */
export function stripPrices(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(l => !l.includes('£'))
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\s*\*\*[^*]+\*\*\s*$/.test(l)) {
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      if (j >= lines.length || !/^\s*[-•*]\s/.test(lines[j])) continue   // a heading with nothing under it
    }
    out.push(l)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
