/**
 * jobReportPdf.ts — pure Node.js, zero React dependency
 *
 * The customer-facing Job Financial Summary (the same figures as lib/jobReportHtml.ts, which supplies them) as an A4 PDF, drawn with pdf-lib in the same house style as the quote PDF
 * (lib/quotePdf.ts): header band with the company, a grid of who and what, then the contract value, variations, invoices and payments, and the balance. Contract value, variations, invoices and
 * payments only: no cost or labour detail and no variation line rates, which are internal.
 * Called by /api/generate-job-report-pdf (server route) and attached to the email by SendJobReportModal. Returns a Buffer containing the PDF bytes.
 */

import { PDFDocument, PDFFont, rgb, StandardFonts, PDFPage } from 'pdf-lib'
import type { Settings, Variation } from './types'
import { jobReportFigures, VAR_STATUS_LABEL, PAYMENT_METHOD_LABEL, type JobReportData } from './jobReportHtml'
import { PRODUCT_NAME } from './product-config'
import { toPdfSafeText } from './pdf-text'
import { companyLegalParts } from './company-legal'

type Rgb = ReturnType<typeof rgb>
const hex = (h: string): Rgb => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)

const C = {
  charcoal: rgb(0.118, 0.161, 0.231), moss: rgb(0.478, 0.71, 0.2), white: rgb(1, 1, 1), headerBg: rgb(0.973, 0.98, 0.973),
  cream: rgb(0.973, 0.98, 0.988), muted: rgb(0.392, 0.455, 0.545), body: rgb(0.118, 0.125, 0.133), border: rgb(0.886, 0.91, 0.941),
  head: rgb(0.941, 0.949, 0.957), footerText: rgb(0.75, 0.78, 0.82),
  green: hex('#16a34a'), amber: hex('#92400e'), amberBg: hex('#fef3c7'), greenBg: hex('#f0fdf4'), greenDark: hex('#166534'),
}
const VAR_COLOUR: Record<string, string> = { draft: '#94a3b8', sent: '#d97706', approved: '#16a34a', rejected: '#dc2626', cancelled: '#94a3b8', invoiced: '#16a34a', paid: '#16a34a' }
const INV_COLOUR: Record<string, string> = { draft: '#94a3b8', sent: '#4a90a4', paid: '#16a34a', overdue: '#c0392b' }

const A4_W = 595.28
const A4_H = 841.89
const MARGIN = 40
const CONTENT_W = A4_W - MARGIN * 2
const PAD = 6

const fmtGBP = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (d: string | undefined) => (d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-')
const safe = (s: string | undefined | null) => toPdfSafeText((s ?? '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/±/g, '+/-').replace(/×/g, 'x').replace(/÷/g, '/')).trim()

/** One cell of a table row: its text, an optional smaller grey second paragraph, and how it is drawn */
interface Cell { text: string; sub?: string; bold?: boolean; color?: Rgb }
type Row =
  | { kind: 'row'; cells: Cell[] }
  | { kind: 'group'; text: string }
  | { kind: 'total'; label: string; amount: string; color?: Rgb; line?: boolean }
  | { kind: 'empty'; text: string }

export async function buildJobReportPdf(data: JobReportData, settings: Settings): Promise<Buffer> {
  const co = settings
  const f = jobReportFigures(data)

  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(`Job Financial Summary - ${safe(data.clientName)}`)
  pdfDoc.setAuthor(co.name || PRODUCT_NAME)
  pdfDoc.setCreator(`${PRODUCT_NAME} Job Report`)
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let page = pdfDoc.addPage([A4_W, A4_H])
  let y = A4_H

  function drawRect(pg: PDFPage, x: number, py: number, w: number, h: number, fill: Rgb) { pg.drawRectangle({ x, y: py, width: w, height: h, color: fill }) }
  function drawText(pg: PDFPage, text: string, x: number, py: number, size: number, font: PDFFont, color: Rgb = C.body, maxWidth?: number): number {
    let s = safe(text)
    if (maxWidth) { while (s.length > 0 && font.widthOfTextAtSize(s, size) > maxWidth) s = s.slice(0, -1); if (s !== safe(text)) s += '...' }
    pg.drawText(s, { x, y: py, size, font, color })
    return font.widthOfTextAtSize(s, size)
  }
  function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const out: string[] = []
    for (const para of safe(text).split(/\n+/)) {
      let cur = ''
      for (const word of para.split(' ')) {
        const test = cur ? `${cur} ${word}` : word
        if (font.widthOfTextAtSize(test, size) > maxWidth && cur) { out.push(cur); cur = word } else cur = test
      }
      if (cur) out.push(cur)
    }
    return out.length ? out : ['']
  }
  /** at most `max` lines; when some are left out the last one ends with '...' so nothing is cut off without saying so */
  const capLines = (lines: string[], max: number) => (lines.length <= max ? lines : [...lines.slice(0, max - 1), lines[max - 1].replace(/s+$/, '') + '...'])
  const rightX = (text: string, font: PDFFont, size: number, rightEdge: number) => rightEdge - font.widthOfTextAtSize(safe(text), size)

  function drawFooter(pg: PDFPage) {
    drawRect(pg, 0, 0, A4_W, 36, C.charcoal)
    drawText(pg, co.name || 'Your Company', MARGIN, 13, 7.5, fontRegular, C.footerText)
    const right = safe([co.address, ...companyLegalParts(co)].filter(Boolean).join(' - '))
    drawText(pg, right, A4_W - MARGIN - fontRegular.widthOfTextAtSize(right, 7.5) - 80, 13, 7.5, fontRegular, C.footerText)
  }
  function newPage() { drawFooter(page); page = pdfDoc.addPage([A4_W, A4_H]); y = A4_H - 40 }
  function ensureSpace(needed: number, floor = 56) { if (y - needed < floor) newPage() }

  // ── Header ──
  const HEADER_H = 70
  drawRect(page, 0, A4_H - HEADER_H, A4_W, HEADER_H, C.headerBg)
  drawRect(page, 0, A4_H - HEADER_H, A4_W, 3, C.moss)
  y = A4_H - HEADER_H
  const MONO = 40
  const initial = (safe(co.name || 'B').charAt(0) || 'B').toUpperCase()
  drawRect(page, MARGIN, y + 15, MONO, MONO, C.moss)
  drawText(page, initial, MARGIN + (MONO - fontBold.widthOfTextAtSize(initial, 20)) / 2, y + 27, 20, fontBold, C.white)
  const NAME_X = MARGIN + MONO + 12
  drawText(page, co.name || 'Your Company', NAME_X, y + 38, 18, fontBold, C.body, CONTENT_W - MONO - 170)
  drawText(page, safe(co.tagline || 'Building Extensions & Renovations').toUpperCase(), NAME_X, y + 22, 7.5, fontRegular, C.muted, CONTENT_W - MONO - 170)
  const title = 'JOB FINANCIAL SUMMARY'
  drawText(page, title, rightX(title, fontBold, 13, A4_W - MARGIN), y + 36, 13, fontBold, C.body)
  const gen = `Generated ${fmtDate(new Date().toISOString())}`
  drawText(page, gen, rightX(gen, fontRegular, 7.5, A4_W - MARGIN), y + 22, 7.5, fontRegular, C.muted)
  y -= 20

  // ── Who and what ──
  const col = CONTENT_W / 3
  const addrLines = wrap(data.jobAddress || '-', fontRegular, 8.5, col - 14).slice(0, 5)
  const nameLines = wrap(data.clientName || '-', fontRegular, 8.5, col - 14).slice(0, 3)
  const infoCols: [string, string[]][][] = [
    [['PREPARED FOR', nameLines], ['JOB TYPE', [data.jobType || '-']]],
    [['PROPERTY', addrLines]],
    [['FROM', [co.name || '-']], ...(co.phone ? [['PHONE', [co.phone]] as [string, string[]]] : []), ...(co.email ? [['EMAIL', [co.email]] as [string, string[]]] : [])],
  ]
  const heightOf = (c: [string, string[]][]) => 12 + c.reduce((s, [, v]) => s + 11 + v.length * 11 + 3, 0)
  const INFO_H = Math.max(...infoCols.map(heightOf), 60)
  drawRect(page, MARGIN, y - INFO_H, CONTENT_W, INFO_H, C.cream)
  infoCols.forEach((c, i) => {
    let iy = y - 12
    for (const [label, vals] of c) {
      drawText(page, label, MARGIN + i * col + 10, iy, 6.5, fontBold, C.muted, col - 14); iy -= 11
      for (const v of vals) { drawText(page, v, MARGIN + i * col + 10, iy, 8.5, fontRegular, C.body, col - 14); iy -= 11 }
      iy -= 3
    }
  })
  y -= INFO_H + 14

  // ── Tables ──
  function sectionTitle(text: string) { ensureSpace(60); drawText(page, text.toUpperCase(), MARGIN, y - 8, 7, fontBold, C.muted); y -= 16 }

  function table(headers: { label: string; w: number; align: 'left' | 'right' | 'center' }[], rows: Row[]) {
    const xs: number[] = []
    let acc = MARGIN
    for (const h of headers) { xs.push(acc); acc += h.w }
    const drawHead = () => {
      drawRect(page, MARGIN, y - 18, CONTENT_W, 18, C.head)
      headers.forEach((h, i) => {
        const w = fontBold.widthOfTextAtSize(h.label.toUpperCase(), 6.5)
        const x = h.align === 'right' ? xs[i] + h.w - PAD - w : h.align === 'center' ? xs[i] + (h.w - w) / 2 : xs[i] + PAD
        drawText(page, h.label.toUpperCase(), x, y - 12, 6.5, fontBold, C.muted)
      })
      y -= 18
    }
    ensureSpace(60)
    drawHead()
    const hRule = () => page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 0.5, color: C.border })
    for (const r of rows) {
      if (r.kind === 'row') {
        const lay = r.cells.map((c, i) => ({
          main: wrap(c.text, c.bold ? fontBold : fontRegular, 8.5, headers[i].w - PAD * 2),
          sub: c.sub ? capLines(wrap(c.sub, fontRegular, 7.5, headers[i].w - PAD * 2), 14) : [],
        }))
        const h = Math.max(...lay.map(l => l.main.length * 11 + l.sub.length * 10)) + 10
        if (y - h < 56) { newPage(); drawHead() }
        r.cells.forEach((c, i) => {
          const font = c.bold ? fontBold : fontRegular
          let ty = y - PAD - 7
          for (const line of lay[i].main) {
            const w = font.widthOfTextAtSize(line, 8.5)
            const x = headers[i].align === 'right' ? xs[i] + headers[i].w - PAD - w : headers[i].align === 'center' ? xs[i] + (headers[i].w - w) / 2 : xs[i] + PAD
            page.drawText(line, { x, y: ty, size: 8.5, font, color: c.color ?? C.body }); ty -= 11
          }
          for (const line of lay[i].sub) { page.drawText(line, { x: xs[i] + PAD, y: ty - 1, size: 7.5, font: fontRegular, color: C.muted }); ty -= 10 }
        })
        y -= h; hRule()
      } else if (r.kind === 'group') {
        if (y - 24 < 56) { newPage(); drawHead() }
        drawText(page, r.text.toUpperCase(), MARGIN + PAD, y - 15, 6.5, fontBold, C.muted); y -= 22
      } else if (r.kind === 'total') {
        if (y - 22 < 56) { newPage(); drawHead() }
        if (r.line) page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 1, color: C.border })
        const last = headers.length - 1
        drawText(page, r.label, xs[last] - fontRegular.widthOfTextAtSize(safe(r.label), 8) - PAD, y - 14, 8, fontRegular, C.muted)
        drawText(page, r.amount, xs[last] + headers[last].w - PAD - fontBold.widthOfTextAtSize(safe(r.amount), 9), y - 14, 9, fontBold, r.color ?? C.body)
        y -= 22
      } else {
        if (y - 28 < 56) { newPage(); drawHead() }
        const w = fontRegular.widthOfTextAtSize(safe(r.text), 8.5)
        drawText(page, r.text, MARGIN + (CONTENT_W - w) / 2, y - 18, 8.5, fontRegular, C.muted); y -= 28; hRule()
      }
    }
    y -= 10
  }

  // Contract value
  sectionTitle('Contract value')
  const cv: Row[] = [{ kind: 'row', cells: [{ text: 'Original contract value' }, { text: fmtGBP(data.contractValue), bold: true }] }]
  if (f.approvedVariationsTotal !== 0) cv.push({ kind: 'row', cells: [{ text: 'Approved variations' }, { text: fmtGBP(f.approvedVariationsTotal), bold: true, color: hex('#2563eb') }] })
  table([{ label: 'Item', w: CONTENT_W - 120, align: 'left' }, { label: 'Amount', w: 120, align: 'right' }], cv)
  ensureSpace(34)
  drawRect(page, MARGIN, y - 28, CONTENT_W, 28, C.charcoal)
  drawText(page, 'Adjusted contract total', MARGIN + 12, y - 18, 10, fontBold, C.white)
  const act = fmtGBP(f.adjustedContractTotal)
  drawText(page, act, rightX(act, fontBold, 12, A4_W - MARGIN - 12), y - 19, 12, fontBold, C.white)
  y -= 40

  // Variations
  if (data.variations.length > 0) {
    sectionTitle('Variations')
    const rows: Row[] = []
    const group = (name: string, list: Variation[], subtotalLabel: string) => {
      if (!list.length) return
      rows.push({ kind: 'group', text: name })
      for (const v of list) rows.push({
        kind: 'row', cells: [
          { text: v.title || '-', bold: true, sub: v.description || undefined }, { text: v.ref || '-', color: C.muted },
          { text: VAR_STATUS_LABEL[v.status] || v.status, color: hex(VAR_COLOUR[v.status] || '#94a3b8'), bold: true }, { text: fmtGBP(v.total), bold: true },
        ],
      })
      rows.push({ kind: 'total', label: subtotalLabel, amount: fmtGBP(list.reduce((s, v) => s + v.total, 0)) })
    }
    group('Approved', f.approvedVariations, 'Approved total')
    group('Pending your approval', f.pendingVariations, 'Pending total (not yet in the contract)')
    group('Rejected / cancelled', f.closedVariations, 'Not included')
    table([{ label: 'Description', w: CONTENT_W - 295, align: 'left' }, { label: 'Ref', w: 70, align: 'left' }, { label: 'Status', w: 125, align: 'center' }, { label: 'Amount', w: 100, align: 'right' }], rows)
  }

  // Invoices
  sectionTitle('Invoices')
  const inv: Row[] = data.invoices.length
    ? data.invoices.slice().sort((a, b) => a.issueDate.localeCompare(b.issueDate)).map(i => ({
        kind: 'row' as const, cells: [
          { text: i.ref, bold: true }, { text: fmtDate(i.issueDate), color: C.muted }, { text: fmtDate(i.dueDate), color: C.muted },
          { text: i.status.toUpperCase(), color: hex(INV_COLOUR[i.status] || '#94a3b8'), bold: true }, { text: fmtGBP(i.total), bold: true },
        ],
      }))
    : [{ kind: 'empty', text: 'No invoices raised yet' }]
  inv.push({ kind: 'total', label: 'Total invoiced', amount: fmtGBP(f.invoicedTotal), line: true })
  table([{ label: 'Ref', w: 110, align: 'left' }, { label: 'Issued', w: 100, align: 'left' }, { label: 'Due', w: 100, align: 'left' }, { label: 'Status', w: 95, align: 'center' }, { label: 'Amount', w: CONTENT_W - 405, align: 'right' }], inv)

  // Payments
  sectionTitle('Payments received')
  const pay: Row[] = data.payments.length
    ? data.payments.slice().sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)).map(p => ({
        kind: 'row' as const, cells: [
          { text: fmtDate(p.paymentDate), color: C.muted }, { text: PAYMENT_METHOD_LABEL[p.method] || p.method }, { text: p.notes || '-', color: C.muted }, { text: fmtGBP(p.amount), bold: true },
        ],
      }))
    : [{ kind: 'empty', text: 'No payments logged yet' }]
  pay.push({ kind: 'total', label: 'Total received', amount: fmtGBP(f.totalReceived), color: C.green, line: true })
  table([{ label: 'Date', w: 100, align: 'left' }, { label: 'Method', w: 110, align: 'left' }, { label: 'Notes', w: CONTENT_W - 330, align: 'left' }, { label: 'Amount', w: 120, align: 'right' }], pay)

  // Balance
  ensureSpace(60)
  const owing = f.balanceOutstanding > 0
  const BOX_W = 280
  const bx = A4_W - MARGIN - BOX_W
  drawRect(page, bx, y - 36, BOX_W, 36, owing ? C.amberBg : C.greenBg)
  drawText(page, owing ? 'Balance outstanding' : 'Balance settled', bx + 12, y - 22, 11, fontBold, owing ? C.amber : C.greenDark)
  const bal = fmtGBP(Math.abs(f.balanceOutstanding))
  drawText(page, bal, rightX(bal, fontBold, 14, bx + BOX_W - 12), y - 23, 14, fontBold, owing ? C.amber : C.greenDark)
  y -= 46

  // Closing note
  const note = wrap("Please check these figures against your own records. If anything doesn't match, get in touch and we'll go through it together.", fontRegular, 8.5, CONTENT_W)
  ensureSpace(note.length * 12 + 16, 44)
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 1, color: C.border })
  let ny = y - 16
  for (const line of note) { drawText(page, line, MARGIN, ny, 8.5, fontRegular, C.muted); ny -= 12 }

  drawFooter(page)
  const count = pdfDoc.getPageCount()
  for (let i = 0; i < count; i++) {
    const label = `Page ${i + 1} of ${count}`
    drawText(pdfDoc.getPage(i), label, A4_W - MARGIN - fontRegular.widthOfTextAtSize(label, 7.5), 13, 7.5, fontRegular, C.footerText)
  }
  return Buffer.from(await pdfDoc.save())
}
