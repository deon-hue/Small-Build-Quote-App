// The PDF of a subcontractor's invoice (or of their record of cash payments), drawn with pdf-lib on A4. Server side. See lib/sub-invoice.ts for the rules.
// An INVOICE has their logo and details top left, the number and dates top right, who it is to, a line for each day, the totals (VAT only if they are VAT registered, CIS as deducted), their bank
// details and payment terms. A CASH RECORD is not an invoice: it says so, lists what was paid and when, and has no number, VAT or CIS.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib'
import { periodLabel, dayLabel, type InvoiceLine, type SubInvoice, type SubInvoiceDetails } from './sub-invoice'

const W = 595.28, H = 841.89, M = 40, CW = W - 2 * M
const INK = rgb(0.12, 0.14, 0.17), MUTED = rgb(0.42, 0.45, 0.5), LINE = rgb(0.85, 0.87, 0.9), BAND = rgb(0.95, 0.96, 0.97)
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Standard PDF fonts cannot draw every character: anything outside the Latin-1 range becomes a plain one, never an error. */
const safe = (s: string) => (s || '')
  .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...')
  .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, '?')

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of safe(text).split(/\r?\n/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word
      if (font.widthOfTextAtSize(next, size) <= width) line = next
      else { if (line) out.push(line); line = word }
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

export interface SubInvoicePdfInput {
  kind: 'invoice' | 'cash-record'
  number?: string
  date: string                 // 'd Mon yyyy' for the heading
  details: SubInvoiceDetails
  /** the builder it is billed to: their company name and address */
  billTo: { name: string; address: string }
  invoice?: SubInvoice          // for an invoice
  lines?: InvoiceLine[]         // for a cash record
  total?: number                // for a cash record
  periodStart: string
  periodEnd: string
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg' } | null
  /** shown at the foot of an invoice */
  footnote?: string
}

export async function buildSubInvoicePdf(inp: SubInvoicePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const isInvoice = inp.kind === 'invoice'
  const d = inp.details
  pdf.setTitle(isInvoice ? `Invoice ${inp.number ?? ''}` : 'Record of cash payments')
  pdf.setAuthor(safe(d.tradingName || 'Subcontractor'))

  let logo: PDFImage | null = null
  if (inp.logo) { try { logo = inp.logo.type === 'png' ? await pdf.embedPng(inp.logo.bytes) : await pdf.embedJpg(inp.logo.bytes) } catch { logo = null } }

  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M
  const text = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK, maxW?: number) => {
    let s = safe(t)
    if (maxW) { while (s.length > 1 && f.widthOfTextAtSize(s, size) > maxW) s = s.slice(0, -1) }
    page.drawText(s, { x, y: yy, size, font: f, color })
  }
  const right = (t: string, xr: number, yy: number, size: number, f: PDFFont = font, color = INK) => { const s = safe(t); page.drawText(s, { x: xr - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color }) }

  // ── header: logo and who it is from (left), the title, number and dates (right)
  const LOGO = 56
  let leftX = M
  if (logo) {
    const sc = Math.min(LOGO / logo.width, LOGO / logo.height, 1)
    page.drawImage(logo, { x: M, y: y - logo.height * sc, width: logo.width * sc, height: logo.height * sc })
    leftX = M + logo.width * sc + 12
  }
  let ly = y - 14
  text(d.tradingName || 'Your business', leftX, ly, 15, bold, INK, 280); ly -= 14
  for (const l of wrap(d.address, font, 9, 250).slice(0, 4)) { if (l) { text(l, leftX, ly, 9, font, MUTED); ly -= 11 } }
  if (d.phone) { text(d.phone, leftX, ly, 9, font, MUTED); ly -= 11 }
  if (d.email) { text(d.email, leftX, ly, 9, font, MUTED); ly -= 11 }
  if (d.utr) { text(`UTR ${d.utr}`, leftX, ly, 9, font, MUTED); ly -= 11 }
  if (d.vatRegistered && d.vatNumber) { text(`VAT no. ${d.vatNumber}`, leftX, ly, 9, font, MUTED); ly -= 11 }

  right(isInvoice ? 'INVOICE' : 'RECORD OF CASH PAYMENTS', W - M, y - 16, isInvoice ? 20 : 13, bold)
  let ry = y - 34
  if (isInvoice && inp.number) { right(`No. ${inp.number}`, W - M, ry, 10, bold); ry -= 13 }
  right(`Date ${inp.date}`, W - M, ry, 9.5, font, MUTED); ry -= 12
  if (inp.periodStart) { right(`For ${periodLabel(inp.periodStart, inp.periodEnd)}`, W - M, ry, 9.5, font, MUTED); ry -= 12 }

  y = Math.min(ly, ry, y - (logo ? Math.min(LOGO, logo.height) : 0)) - 16

  // ── to
  if (isInvoice) {
    text('TO', M, y, 8, bold, MUTED); y -= 12
    text(inp.billTo.name || 'Contractor', M, y, 11, bold); y -= 13
    for (const l of wrap(inp.billTo.address, font, 9, 300).slice(0, 4)) { if (l) { text(l, M, y, 9, font, MUTED); y -= 11 } }
  } else {
    for (const l of wrap('This is a record of what was paid to you in cash. It is not an invoice.', font, 9.5, CW)) { text(l, M, y, 9.5, font, MUTED); y -= 12 }
  }
  y -= 10

  // ── table
  const COLS = { date: M, what: M + 62, qty: M + 292, rate: M + 372, amt: W - M }
  const header = () => {
    page.drawRectangle({ x: M, y: y - 5, width: CW, height: 18, color: BAND })
    text('Date', COLS.date + 4, y, 8.5, bold, MUTED); text('Work', COLS.what, y, 8.5, bold, MUTED); text('Time', COLS.qty, y, 8.5, bold, MUTED)
    right('Rate', COLS.rate + 56, y, 8.5, bold, MUTED); right('Amount', COLS.amt - 4, y, 8.5, bold, MUTED)
    y -= 20
  }
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; header() }
  header()
  const lines = isInvoice ? (inp.invoice?.lines ?? []) : (inp.lines ?? [])
  for (const l of lines) {
    const wl = wrap(l.what, font, 9, COLS.qty - COLS.what - 8)
    const rowH = Math.max(14, wl.length * 11 + 4)
    if (y - rowH < M + 120) newPage()
    text(l.dateLabel, COLS.date + 4, y, 9)
    wl.forEach((t, i) => text(t, COLS.what, y - i * 11, 9))
    text(l.quantity, COLS.qty, y, 9)
    right(l.rate, COLS.rate + 56, y, 9, font, MUTED)
    right(gbp(l.amount), COLS.amt - 4, y, 9)
    y -= rowH
    page.drawLine({ start: { x: M, y: y + 7 }, end: { x: W - M, y: y + 7 }, thickness: 0.4, color: LINE })
  }
  if (lines.length === 0) { text('No days to show.', COLS.what, y, 9, font, MUTED); y -= 16 }
  y -= 6

  // ── totals
  const tx = W - M - 230
  const trow = (label: string, value: string, strong = false) => {
    if (y < M + 100) newPage()
    text(label, tx, y, strong ? 11 : 9.5, strong ? bold : font, strong ? INK : MUTED)
    right(value, W - M - 4, y, strong ? 11 : 9.5, strong ? bold : font)
    y -= strong ? 17 : 14
  }
  if (isInvoice && inp.invoice) {
    const inv = inp.invoice
    trow('Subtotal', gbp(inv.subtotal))
    if (inv.vatRate > 0) trow(`VAT (${inv.vatRate}%)`, gbp(inv.vat))
    if (inv.cisRate > 0) trow(`Less CIS deduction (${inv.cisRate}%)`, '-' + gbp(inv.cisDeduction))
    page.drawLine({ start: { x: tx, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.6, color: INK })
    y -= 2
    trow('To be paid', gbp(inv.total), true)
  } else {
    page.drawLine({ start: { x: tx, y: y + 9 }, end: { x: W - M, y: y + 9 }, thickness: 0.6, color: INK })
    y -= 2
    trow('Total paid in cash', gbp(inp.total ?? 0), true)
  }

  // ── bank details and terms (an invoice only)
  if (isInvoice) {
    y -= 8
    const bank = [d.bankAccountName && `Account name: ${d.bankAccountName}`, d.sortCode && `Sort code: ${d.sortCode}`, d.accountNumber && `Account number: ${d.accountNumber}`].filter(Boolean) as string[]
    if (bank.length || d.paymentTerms) {
      if (y < M + 90) newPage()
      text('HOW TO PAY', M, y, 8, bold, MUTED); y -= 12
      for (const b of bank) { text(b, M, y, 9.5); y -= 12 }
      for (const l of wrap(d.paymentTerms, font, 9, CW)) { if (l) { text(l, M, y, 9, font, MUTED); y -= 11 } }
    }
  }
  // footer on the last page
  const foot = inp.footnote || (isInvoice ? 'Made from the days worked and approved for this job.' : '')
  if (foot) text(foot, M, M - 14, 8, font, MUTED, CW)
  return pdf.save()
}

export { dayLabel }
