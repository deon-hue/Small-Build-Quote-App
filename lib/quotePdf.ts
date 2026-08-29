/**
 * quotePdf.ts — pure Node.js, zero React dependency
 *
 * Generates a professional A4 quote PDF using pdf-lib.
 * Called only by /api/generate-quote-pdf (server route).
 *
 * Returns a Buffer containing the PDF bytes.
 */

import { PDFDocument, PDFFont, rgb, StandardFonts, PDFPage } from 'pdf-lib'
import type { Quote, Settings } from './types'
import { calcPhaseSell, calcItemSell, VAT } from './utils'

// ── Colour helpers ────────────────────────────────────────────────────────────

const C = {
  darkGreen:  rgb(0.169, 0.227, 0.169),   // #2b3a2b
  charcoal:   rgb(0.169, 0.184, 0.2),     // #2b2f33
  lightGreen: rgb(0.784, 0.847, 0.604),   // #c8d8a8
  moss:       rgb(0.478, 0.784, 0.117),   // #7ab533  (scope border)
  white:      rgb(1, 1, 1),
  cream:      rgb(0.973, 0.961, 0.941),   // #f8f5f0
  lightBlue:  rgb(0.91, 0.925, 0.941),    // #e8ecf0 (phase row)
  muted:      rgb(0.541, 0.51, 0.471),    // #8a8278
  body:       rgb(0.118, 0.125, 0.133),   // #1e2022
  border:     rgb(0.906, 0.878, 0.816),   // #e8e0d0
  footerText: rgb(0.75, 0.75, 0.75),      // light grey on dark footer
}

// ── A4 layout constants ───────────────────────────────────────────────────────

const A4_W = 595.28
const A4_H = 841.89
const MARGIN = 40
const CONTENT_W = A4_W - MARGIN * 2

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGBP(n: number): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function dateStr(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Clamp string to avoid pdf-lib crashing on unsupported characters */
function safe(s: string | undefined | null): string {
  return (s ?? '')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    // Replace Unicode math symbols with ASCII equivalents
    .replace(/≈/g, '~')
    .replace(/±/g, '+/-')
    .replace(/×/g, 'x')
    .replace(/÷/g, '/')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')  // Replace any other non-WinAnsi chars with ?
    .trim()
}

/**
 * Convert a full scope text into a compact bullet list for PDF display.
 * Extracts **Section:** headings if the text uses markdown bold; falls back
 * to the first sentence of each paragraph for plain text.
 */
function scopeToBullets(scope: string): string[] {
  // Extract **Heading** or **Heading:** markers (AI scopes always use this format)
  const headingRx = /\*\*([^*\n]{3,70}?)\*\*/g
  const seen = new Set<string>()
  const headings: string[] = []
  let m: RegExpExecArray | null
  while ((m = headingRx.exec(scope)) !== null) {
    const h = m[1].replace(/:$/, '').trim()
    // Skip very long strings — those are titles/sentences, not section labels
    if (h.length >= 3 && h.length <= 65 && !seen.has(h)) {
      seen.add(h)
      headings.push(h)
    }
  }
  if (headings.length >= 2) return headings.map(h => `- ${h}`)

  // Fallback: clean the text and take the first sentence of each paragraph
  const clean = scope.replace(/\*\*/g, '').trim()
  const paras = clean.split(/\n+/).filter(p => p.trim().length > 0)
  return paras.slice(0, 10).map(p => {
    const s = p.trim().replace(/\s+/g, ' ')
    const dot = s.search(/\.\s/)
    const line = dot > 0 && dot < 120 ? s.slice(0, dot + 1) : s.slice(0, 110) + (s.length > 110 ? '...' : '')
    return `- ${line}`
  })
}

/** Word-wrap a string to max `width` points using the given font at `size` */
async function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): Promise<string[]> {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const test = current ? `${current} ${word}` : word
    const w = font.widthOfTextAtSize(test, size)
    if (w > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = test
    }
  }
  if (current) lines.push(current)
  return lines
}

// ── PDF builder ───────────────────────────────────────────────────────────────

export async function buildQuotePdf(
  quote: Quote,
  settings: Settings,
  opts: {
    customerView?: boolean
    showScope?: boolean
    showPaymentTerms?: boolean
  } = {},
): Promise<Buffer> {
  const customerView    = opts.customerView    ?? false
  const showScope       = opts.showScope       ?? true
  const showPaymentTerms = opts.showPaymentTerms ?? true
  const co = settings
  const qMkp = quote.markup || 0
  const qVat = quote.vatIncluded
  const now = new Date()

  const net = quote.phases.reduce((s, p) => s + calcPhaseSell(p, qMkp), 0)
  const vat = qVat ? net * VAT : 0
  const total = net + vat
  const validUntil = new Date(now.getTime() + 30 * 864e5)

  // ── Create document and embed fonts ──────────────────────────────────────
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(`Quote ${quote.ref || ''} — ${quote.customer.name || ''}`)
  pdfDoc.setAuthor(co.name || 'Buildospro')
  pdfDoc.setCreator('Buildospro Quote Builder')

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // ── Page management ───────────────────────────────────────────────────────
  let page = pdfDoc.addPage([A4_W, A4_H])
  let y = A4_H  // current Y position (pdf-lib origin is bottom-left)

  function newPage() {
    drawFooter(page)
    page = pdfDoc.addPage([A4_W, A4_H])
    y = A4_H - 20
    return page
  }

  function ensureSpace(needed: number) {
    if (y - needed < 50) newPage()
  }

  // ── Drawing helpers ───────────────────────────────────────────────────────

  function drawRect(
    pg: PDFPage,
    x: number, py: number, w: number, h: number,
    fillColor: ReturnType<typeof rgb>,
    borderColor?: ReturnType<typeof rgb>,
  ) {
    pg.drawRectangle({
      x, y: py, width: w, height: h,
      color: fillColor,
      borderColor,
      borderWidth: borderColor ? 0.5 : 0,
    })
  }

  function drawText(
    pg: PDFPage,
    text: string,
    x: number, py: number,
    size: number,
    font: PDFFont,
    color: ReturnType<typeof rgb> = C.body,
    maxWidth?: number,
  ): number {
    // Clamp to max width by truncating
    let s = safe(text)
    if (maxWidth) {
      while (s.length > 0 && font.widthOfTextAtSize(s, size) > maxWidth) {
        s = s.slice(0, -1)
      }
      if (s !== safe(text)) s += '…'
    }
    pg.drawText(s, { x, y: py, size, font, color })
    return font.widthOfTextAtSize(s, size)
  }

  // ── Header ────────────────────────────────────────────────────────────────
  const HEADER_H = 70
  drawRect(page, 0, A4_H - HEADER_H, A4_W, HEADER_H, C.darkGreen)
  y = A4_H - HEADER_H

  // Company name + tagline
  drawText(page, safe(co.name || 'Buildospro Ltd'), MARGIN, y + 40, 18, fontBold, C.white)
  drawText(page, safe(co.tagline || 'Building Extensions & Renovations').toUpperCase(), MARGIN, y + 22, 7.5, fontRegular, C.lightGreen)

  // Quote ref (right side)
  const refLabel = 'QUOTATION'
  const refVal   = safe(quote.ref || 'DRAFT')
  const refValW  = fontBold.widthOfTextAtSize(refVal, 16)
  drawText(page, refLabel, A4_W - MARGIN - refValW - 2, y + 22, 7.5, fontRegular, C.lightGreen)
  drawText(page, refVal, A4_W - MARGIN - refValW, y + 36, 16, fontBold, C.white)

  y -= 20  // gap below header

  // ── Info grid ─────────────────────────────────────────────────────────────
  const INFO_H = 86
  drawRect(page, MARGIN, y - INFO_H, CONTENT_W, INFO_H, C.cream)
  const col = CONTENT_W / 3
  const infoData: [string, string][][] = [
    [
      ['QUOTE REFERENCE', safe(quote.ref || '—')],
      ['DATE ISSUED',     dateStr(now)],
      ['VALID UNTIL',     dateStr(validUntil)],
    ],
    [
      ['PREPARED FOR',  safe(quote.customer.name || '—')],
      ['PROPERTY',      safe(quote.customer.address || '—')],
      ['JOB TYPE',      safe(quote.jobType)],
    ],
    [
      ['COMPANY',  safe(co.name || '—')],
      ...(co.phone ? [['PHONE', safe(co.phone)] as [string, string]] : []),
      ...(co.email ? [['EMAIL', safe(co.email)] as [string, string]] : []),
    ],
  ]
  const infoCols = infoData.map((_, i) => MARGIN + i * col + 10)
  for (let c = 0; c < infoData.length; c++) {
    let iy = y - 12
    for (const [label, value] of infoData[c]) {
      drawText(page, label, infoCols[c], iy, 6.5, fontBold, C.muted, col - 14)
      iy -= 11
      drawText(page, value, infoCols[c], iy, 8.5, fontRegular, C.body, col - 14)
      iy -= 14
    }
  }
  y -= INFO_H + 14

  // ── Scope ─────────────────────────────────────────────────────────────────
  // Rendered as a compact bullet list so it fits on page 1 without a gap.
  // Full scope text is available in the customer portal.
  if (showScope && quote.scope) {
    const lineH = 13
    const bullets = scopeToBullets(quote.scope)
    // Pre-wrap each bullet in case it's still long, using the font measurer
    const wrappedBullets: string[] = []
    for (const b of bullets) {
      const lines = await wrapText(safe(b), fontRegular, 8.5, CONTENT_W - 24)
      wrappedBullets.push(...lines)
    }
    const boxH = 18 + wrappedBullets.length * lineH + 18
    ensureSpace(boxH + 10)
    drawRect(page, MARGIN, y - boxH, CONTENT_W, boxH, rgb(0.973, 0.98, 0.949))
    drawRect(page, MARGIN, y - boxH, 3, boxH, C.moss)
    drawText(page, 'SCOPE OF WORKS', MARGIN + 10, y - 13, 6.5, fontBold, rgb(0.353, 0.541, 0.125))
    let sy = y - 26
    for (const line of wrappedBullets) {
      drawText(page, line, MARGIN + 10, sy, 8.5, fontRegular, C.body)
      sy -= lineH
    }
    y -= boxH + 12
  }

  // ── Table heading ─────────────────────────────────────────────────────────
  ensureSpace(30)
  drawText(page, `ITEMISED ESTIMATE — ${safe(quote.jobType).toUpperCase()}`, MARGIN, y, 7.5, fontBold, C.charcoal)
  y -= 8
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + CONTENT_W, y }, thickness: 1.5, color: C.charcoal })
  y -= 10

  // ── Table columns — customer view hides price columns ────────────────────
  // customerView: Description | Qty | Unit  (no prices shown)
  // detailedView: Description | Qty | Unit | Sell (ex-VAT) [| VAT]
  const COL = customerView ? {
    desc:  MARGIN,
    descW: CONTENT_W - 46 - 40,
    qty:   MARGIN + CONTENT_W - 46 - 40,
    qtyW:  40,
    unit:  MARGIN + CONTENT_W - 46,
    unitW: 46,
    amt:   0, amtW: 0, vat: 0, vatW: 0,   // unused in customer view
  } : {
    desc:  MARGIN,
    descW: qVat ? CONTENT_W - 40 - 36 - 80 - 72 : CONTENT_W - 40 - 36 - 80,
    qty:   MARGIN + (qVat ? CONTENT_W - 40 - 36 - 80 - 72 : CONTENT_W - 40 - 36 - 80),
    qtyW:  40,
    unit:  MARGIN + (qVat ? CONTENT_W - 36 - 80 - 72 : CONTENT_W - 36 - 80),
    unitW: 36,
    amt:   MARGIN + (qVat ? CONTENT_W - 80 - 72 : CONTENT_W - 80),
    amtW:  80,
    vat:   MARGIN + CONTENT_W - 72,
    vatW:  72,
  }

  const TABLE_ROW_H = 15
  drawRect(page, MARGIN, y - TABLE_ROW_H, CONTENT_W, TABLE_ROW_H, C.charcoal)
  drawText(page, 'Description', COL.desc + 4,  y - 10, 7.5, fontBold, C.white)
  drawText(page, 'Qty',         COL.qty + 4,   y - 10, 7.5, fontBold, C.white)
  drawText(page, 'Unit',        COL.unit + 2,  y - 10, 7.5, fontBold, C.white)
  if (!customerView) {
    drawText(page, 'Sell (ex-VAT)', COL.amt + 2, y - 10, 7.5, fontBold, C.white)
    if (qVat) drawText(page, 'VAT 20%', COL.vat + 2, y - 10, 7.5, fontBold, C.white)
  }
  y -= TABLE_ROW_H

  // ── Phase rows ────────────────────────────────────────────────────────────
  let rowAlt = false
  for (const p of quote.phases) {
    const phaseSell = calcPhaseSell(p, qMkp)
    const phaseVat  = qVat ? phaseSell * VAT : 0
    const phaseLabel = p.parentPhase ? `${p.parentPhase} — ${p.phase}` : p.phase

    ensureSpace(TABLE_ROW_H + 2)
    drawRect(page, MARGIN, y - TABLE_ROW_H, CONTENT_W, TABLE_ROW_H, C.lightBlue)
    // In customer view — full-width label, no price
    if (customerView) {
      drawText(page, safe(phaseLabel), COL.desc + 4, y - 10, 7.5, fontBold, C.charcoal, CONTENT_W - 8)
    } else {
      drawText(page, safe(phaseLabel), COL.desc + 4, y - 10, 7.5, fontBold, C.charcoal, COL.descW - 120)
      const ptLabel = 'Phase total'
      const ptLabelW = fontBold.widthOfTextAtSize(ptLabel, 6.5)
      drawText(page, ptLabel, COL.amt - ptLabelW - 6, y - 10, 6.5, fontBold, C.charcoal)
      drawText(page, fmtGBP(phaseSell), COL.amt + 2, y - 10, 7.5, fontBold, C.charcoal, COL.amtW - 4)
      if (qVat) drawText(page, fmtGBP(phaseVat), COL.vat + 2, y - 10, 7.5, fontBold, C.charcoal, COL.vatW - 4)
    }
    y -= TABLE_ROW_H

    // Item rows
    const visibleItems = p.items.filter(
      i => i.enabled !== false && calcItemSell(i, qMkp) > 0
    )

    for (const item of visibleItems) {
      const noteLines = item.notes
        ? Math.ceil(fontRegular.widthOfTextAtSize(safe(item.notes), 7) / (COL.descW - 8)) + 1
        : 0
      const rowH = TABLE_ROW_H + noteLines * 9

      ensureSpace(rowH + 2)
      if (rowAlt) drawRect(page, MARGIN, y - rowH, CONTENT_W, rowH, C.cream)

      drawText(page, safe(item.desc || '—'), COL.desc + 4, y - 10, 8, fontRegular, C.body, COL.descW - 8)
      if (item.notes) {
        drawText(page, safe(item.notes), COL.desc + 4, y - 10 - 9, 7, fontRegular, C.muted, COL.descW - 8)
      }
      drawText(page, String(item.qty ?? ''), COL.qty + 4,  y - 10, 8, fontRegular, C.body)
      drawText(page, safe(item.unit || ''),  COL.unit + 2, y - 10, 8, fontRegular, C.body)
      if (!customerView) {
        const itemCost = (Number(item.labour) || 0) + (Number(item.materials) || 0)
        const itemSell = itemCost * (1 + qMkp / 100)
        const itemVat  = qVat ? itemSell * VAT : 0
        drawText(page, fmtGBP(itemSell), COL.amt + 2, y - 10, 8, fontRegular, C.body, COL.amtW - 4)
        if (qVat) drawText(page, fmtGBP(itemVat), COL.vat + 2, y - 10, 8, fontRegular, C.body, COL.vatW - 4)
      }

      page.drawLine({ start: { x: MARGIN, y: y - rowH }, end: { x: MARGIN + CONTENT_W, y: y - rowH }, thickness: 0.4, color: C.border })
      y -= rowH
      rowAlt = !rowAlt
    }
  }

  y -= 10

  // ── Totals box ────────────────────────────────────────────────────────────
  const TOTALS_W = 220
  const TOTALS_X = MARGIN + CONTENT_W - TOTALS_W
  const TROW_H   = 16

  if (customerView) {
    // Customer view: grand total only — no subtotal breakdown
    const vatNote = qVat ? ' (inc. VAT)' : ' (ex-VAT)'
    ensureSpace(TROW_H + 20)
    drawRect(page, TOTALS_X, y - TROW_H - 2, TOTALS_W, TROW_H + 2, C.darkGreen)
    drawText(page, `TOTAL${vatNote}`, TOTALS_X + 6, y - 13, 10, fontBold, C.white)
    const totalStr = fmtGBP(total)
    drawText(page, totalStr, TOTALS_X + TOTALS_W - fontBold.widthOfTextAtSize(totalStr, 10) - 6, y - 13, 10, fontBold, C.white)
    y -= TROW_H + 16
  } else {
    // Detailed view: subtotal rows then total bar
    const totalsRows: [string, string][] = [
      ['Subtotal (ex-VAT)', fmtGBP(net)],
      ...(qVat ? [['VAT (20%)', fmtGBP(vat)] as [string, string]] : [['* VAT not included', ''] as [string, string]]),
    ]
    ensureSpace(TROW_H * (totalsRows.length + 1) + 20)
    for (const [label, value] of totalsRows) {
      page.drawLine({ start: { x: TOTALS_X, y: y - TROW_H }, end: { x: TOTALS_X + TOTALS_W, y: y - TROW_H }, thickness: 0.4, color: C.border })
      drawText(page, label, TOTALS_X + 6, y - 11, 8.5, fontRegular, C.body)
      if (value) drawText(page, value, TOTALS_X + TOTALS_W - fontBold.widthOfTextAtSize(value, 8.5) - 6, y - 11, 8.5, fontBold, C.body)
      y -= TROW_H
    }
    drawRect(page, TOTALS_X, y - TROW_H - 2, TOTALS_W, TROW_H + 2, C.darkGreen)
    drawText(page, 'TOTAL', TOTALS_X + 6, y - 13, 10, fontBold, C.white)
    const totalStr = fmtGBP(total)
    drawText(page, totalStr, TOTALS_X + TOTALS_W - fontBold.widthOfTextAtSize(totalStr, 10) - 6, y - 13, 10, fontBold, C.white)
    y -= TROW_H + 16
  }

  // ── Terms ─────────────────────────────────────────────────────────────────
  if (showPaymentTerms && co.terms) {
    const termsText = [co.terms, co.extra].filter(Boolean).join('\n')
    const termsLines = termsText.split('\n')
    const lineH = 11
    const boxH  = 18 + termsLines.length * lineH + 8
    ensureSpace(boxH + 10)
    drawRect(page, MARGIN, y - boxH, CONTENT_W, boxH, C.cream)
    drawText(page, 'PAYMENT TERMS & CONDITIONS', MARGIN + 8, y - 13, 6.5, fontBold, C.muted)
    let ty = y - 25
    for (const line of termsLines) {
      const wrapped = await wrapText(safe(line), fontRegular, 8, CONTENT_W - 16)
      for (const wl of wrapped) {
        drawText(page, wl, MARGIN + 8, ty, 8, fontRegular, C.body, CONTENT_W - 16)
        ty -= lineH
      }
    }
    y -= boxH + 12
  }

  // ── Contact ───────────────────────────────────────────────────────────────
  ensureSpace(30)
  const contactParts = [safe(co.contact || co.name || '')]
  if (co.phone) contactParts.push(safe(co.phone))
  if (co.email) contactParts.push(safe(co.email))
  drawText(page, 'To accept this quotation, please contact us:', MARGIN, y, 8.5, fontRegular, C.body)
  y -= 12
  drawText(page, contactParts.join('  ·  '), MARGIN, y, 8.5, fontBold, C.charcoal, CONTENT_W)

  // ── Footer on last page ───────────────────────────────────────────────────
  drawFooter(page)

  // ── Page numbers ──────────────────────────────────────────────────────────
  const pageCount = pdfDoc.getPageCount()
  for (let i = 0; i < pageCount; i++) {
    const pg = pdfDoc.getPage(i)
    const pageLabel = `Page ${i + 1} of ${pageCount}`
    const labelW = fontRegular.widthOfTextAtSize(pageLabel, 7.5)
    drawText(pg, pageLabel, A4_W - MARGIN - labelW, 18, 7.5, fontRegular, C.footerText)
  }

  return Buffer.from(await pdfDoc.save())

  // ── Footer helper ──────────────────────────────────────────────────────────
  function drawFooter(pg: PDFPage) {
    drawRect(pg, 0, 0, A4_W, 36, C.charcoal)
    drawText(pg, safe(co.name || 'Buildospro Ltd'), MARGIN, 13, 7.5, fontRegular, C.footerText)
    const footerRight = safe(`${co.address || ''} · Registered in England & Wales`)
    const frW = fontRegular.widthOfTextAtSize(footerRight, 7.5)
    drawText(pg, footerRight, A4_W - MARGIN - frW - 80, 13, 7.5, fontRegular, C.footerText)
  }
}
