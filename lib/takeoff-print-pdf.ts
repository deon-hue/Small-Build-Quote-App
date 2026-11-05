// The PDF of a take-off drawing (pdf-lib): page 1 is the drawing at the chosen paper and scale with a key of what the colours mean and a title block; the next page(s), if wanted, are the description of the works in
// plain words. NO prices anywhere: it is a plan printout. The layout rules are in lib/takeoff-print.ts, the words come from lib/takeoff-scope.ts.

import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib'
import { toPdfSafeText } from './pdf-text'
import { parseScope } from './scope-format'
import { printLayout, wrapLines, PT_PER_MM, type PrintLayoutInput } from './takeoff-print'

export interface PrintKeyEntry { label: string; color: string }

export interface TakeoffPdfInput {
  layout: PrintLayoutInput
  /** the picture of the drawing: JPEG bytes */
  jpeg: Uint8Array
  company: string
  /** the job: the take-off's name or reference */
  title: string
  client?: string
  address?: string
  sheet?: string
  level?: string
  /** the date as written on the sheet */
  dateText: string
  /** what each colour means (the phases that are on the drawing) */
  key: PrintKeyEntry[]
  /** the description of the works (scope format), or '' to leave the page out */
  description?: string
}

const safe = (s: string | undefined | null) => toPdfSafeText((s ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/±/g, '+/-').replace(/×/g, 'x').replace(/²/g, '2').replace(/³/g, '3')).trim()

function hex(c: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim())
  if (!m) return rgb(0.4, 0.4, 0.4)
  const n = parseInt(m[1], 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

const INK = rgb(0.13, 0.15, 0.18)
const MUTED = rgb(0.42, 0.45, 0.49)
const LINE = rgb(0.6, 0.63, 0.66)

/** Cut a line to the width, with an ellipsis. */
function fit(font: PDFFont, s: string, size: number, maxW: number): string {
  let t = safe(s)
  if (font.widthOfTextAtSize(t, size) <= maxW) return t
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > maxW) t = t.slice(0, -1)
  return t + '...'
}

export async function buildTakeoffPdf(i: TakeoffPdfInput): Promise<Uint8Array> {
  const L = printLayout(i.layout)
  const doc = await PDFDocument.create()
  const reg = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const page = doc.addPage([L.pageW, L.pageH])

  // the drawing, with a thin frame
  const img = await doc.embedJpg(i.jpeg)
  page.drawImage(img, { x: L.imgX, y: L.imgY, width: L.imgW, height: L.imgH })
  page.drawRectangle({ x: L.imgX, y: L.imgY, width: L.imgW, height: L.imgH, borderColor: LINE, borderWidth: 0.5 })

  // the key: a small coloured square and the name, left to right, as many as fit
  if (L.keyBox) {
    const k = L.keyBox
    let x = k.x
    const sz = 7.5
    page.drawText('KEY', { x, y: k.y + k.h / 2 - 2.5, size: 6.5, font: bold, color: MUTED })
    x += 22
    const gap = 12
    let shown = 0
    for (const e of i.key) {
      const label = safe(e.label)
      const w = 8 + 3 + reg.widthOfTextAtSize(label, sz)
      if (x + w > k.x + k.w - 40) break
      page.drawRectangle({ x, y: k.y + k.h / 2 - 3.5, width: 8, height: 8, color: hex(e.color), opacity: 0.85, borderColor: hex(e.color), borderWidth: 0.5 })
      page.drawText(label, { x: x + 11, y: k.y + k.h / 2 - 2.5, size: sz, font: reg, color: INK })
      x += w + gap; shown++
    }
    if (shown < i.key.length) page.drawText(`+${i.key.length - shown} more`, { x, y: k.y + k.h / 2 - 2.5, size: sz, font: reg, color: MUTED })
  }

  // the title block: company and job on the left, who and where in the middle, sheet, scale and date on the right
  if (L.titleBox) {
    const t = L.titleBox
    page.drawRectangle({ x: t.x, y: t.y, width: t.w, height: t.h, borderColor: INK, borderWidth: 0.8 })
    const c1 = t.x + t.w * 0.38, c2 = t.x + t.w * 0.70
    for (const cx of [c1, c2]) page.drawLine({ start: { x: cx, y: t.y }, end: { x: cx, y: t.y + t.h }, thickness: 0.5, color: LINE })
    const pad = 6
    const label = (txt: string, x: number, y: number) => page.drawText(txt, { x, y, size: 6, font: bold, color: MUTED })
    const top = t.y + t.h
    // left
    label('JOB', t.x + pad, top - 10)
    page.drawText(fit(bold, i.title || 'Take-off drawing', 13, c1 - t.x - 2 * pad), { x: t.x + pad, y: top - 25, size: 13, font: bold, color: INK })
    page.drawText(fit(reg, i.company, 8, c1 - t.x - 2 * pad), { x: t.x + pad, y: t.y + 6, size: 8, font: reg, color: MUTED })
    // middle
    label('CLIENT', c1 + pad, top - 10)
    page.drawText(fit(reg, i.client || '', 9.5, c2 - c1 - 2 * pad), { x: c1 + pad, y: top - 21, size: 9.5, font: reg, color: INK })
    label('SITE', c1 + pad, top - 37)
    page.drawText(fit(reg, i.address || '', 8.5, c2 - c1 - 2 * pad), { x: c1 + pad, y: top - 48, size: 8.5, font: reg, color: INK })
    // right
    const sheetLine = [i.sheet, i.level].map(s => safe(s)).filter(Boolean).join(' - ')
    label('DRAWING', c2 + pad, top - 10)
    page.drawText(fit(bold, sheetLine || 'Plan', 9.5, t.x + t.w - c2 - 2 * pad), { x: c2 + pad, y: top - 21, size: 9.5, font: bold, color: INK })
    label('SCALE', c2 + pad, t.y + 15)
    page.drawText(fit(reg, L.scaleText, 8.5, (t.x + t.w - c2) * 0.62 - pad), { x: c2 + pad, y: t.y + 5, size: 8.5, font: reg, color: INK })
    const dx = c2 + (t.x + t.w - c2) * 0.62
    label('DATE', dx, t.y + 15)
    page.drawText(fit(reg, i.dateText, 8.5, t.x + t.w - dx - pad), { x: dx, y: t.y + 5, size: 8.5, font: reg, color: INK })
  }

  // the description of the works: A4 portrait, headings and bullets, as many pages as it needs
  const desc = (i.description || '').trim()
  if (desc) {
    const W = 210 * PT_PER_MM, H = 297 * PT_PER_MM, M = 18 * PT_PER_MM
    const textW = W - 2 * M
    let pg = doc.addPage([W, H])
    let y = H - M
    const header = (first: boolean) => {
      pg.drawText(first ? 'DESCRIPTION OF WORKS' : 'DESCRIPTION OF WORKS (continued)', { x: M, y: y - 8, size: 8, font: bold, color: MUTED })
      pg.drawText(fit(bold, i.title || 'Take-off drawing', first ? 16 : 11, textW), { x: M, y: y - (first ? 28 : 24), size: first ? 16 : 11, font: bold, color: INK })
      y -= first ? 36 : 30
      const meta = [i.client, i.address].map(s => safe(s)).filter(Boolean).join('  -  ')
      if (first && meta) { pg.drawText(fit(reg, meta, 9, textW), { x: M, y: y - 6, size: 9, font: reg, color: MUTED }); y -= 14 }
      pg.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.6, color: LINE })
      y -= 16
    }
    const newPage = () => { pg = doc.addPage([W, H]); y = H - M; header(false) }
    header(true)
    const SZ = 9.5, LEAD = 13.2
    for (const b of parseScope(desc)) {
      if (b.kind === 'blank') { y -= 5; continue }
      const isHeading = b.kind === 'line' && b.segs.length > 0 && b.segs.every(s => s.bold)
      const text = safe(b.segs.map(s => s.text).join(''))
      if (!text) continue
      const font = isHeading ? bold : reg
      const indent = b.kind === 'bullet' ? 12 : 0
      const lines = wrapLines(text, textW - indent, s => font.widthOfTextAtSize(s, SZ))
      if (isHeading) { y -= 6 }
      // keep a heading with at least its first two lines
      const need = (isHeading ? 3 : Math.min(lines.length, 2)) * LEAD
      if (y - need < M) newPage()
      lines.forEach((ln, idx) => {
        if (y - LEAD < M) newPage()
        y -= LEAD
        if (b.kind === 'bullet' && idx === 0) pg.drawText('-', { x: M + 2, y, size: SZ, font: reg, color: MUTED })
        pg.drawText(ln, { x: M + indent, y, size: SZ, font, color: INK })
      })
    }
    pg.drawText('This is a description of the works shown on the drawing. It is not a priced document.', { x: M, y: M * 0.5, size: 7, font: reg, color: MUTED })
  }

  doc.setTitle(safe(i.title) || 'Take-off drawing')
  doc.setProducer('BuildOS Pro')
  return doc.save()
}
