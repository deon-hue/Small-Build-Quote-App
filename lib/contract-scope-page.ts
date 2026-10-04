/**
 * contract-scope-page.ts — puts the quote's full Scope of Works onto the FMB contract.
 *
 * The template's "Works provided" box is a single line about 270pt wide (it holds roughly 60 characters), so a real
 * scope of works — several lines or paragraphs — cannot be typed into it and ends up cut off or missing. When the
 * scope doesn't fit on that one line, the box says "see the Scope of Works schedule" and the whole scope is printed
 * on a numbered "Schedule 1 — Scope of Works" page added after the contract, which the contract then refers to.
 * A short one-line scope still goes straight into the box, as before.
 */

import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib'
import { toPdfSafeText } from './pdf-text'

/** Printable width (points) of the template's "Works provided" box, minus a little padding, at 9pt */
const BOX_WIDTH_PT = 262
const BOX_FONT_PT = 9

export const SCOPE_BOX_POINTER = 'See Schedule 1 - Scope of Works (at the end of this contract)'

/** Does this scope fit on the contract's single "Works provided" line? */
export function scopeFitsBox(scope: string, font: PDFFont): boolean {
  const text = toPdfSafeText(scope).trim()
  if (!text) return true
  if (text.includes('\n')) return false
  return font.widthOfTextAtSize(text, BOX_FONT_PT) <= BOX_WIDTH_PT
}

/** Word-wraps one paragraph to a width. A word longer than the line is broken by character so nothing is ever lost. */
export function wrapParagraph(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  const push = () => { lines.push(line); line = '' }
  for (const word of text.split(' ')) {
    if (word === '') { continue }
    const attempt = line ? line + ' ' + word : word
    if (font.widthOfTextAtSize(attempt, size) <= maxWidth) { line = attempt; continue }
    if (line) push()
    if (font.widthOfTextAtSize(word, size) <= maxWidth) { line = word; continue }
    let chunk = ''
    for (const ch of word) {
      if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) { lines.push(chunk); chunk = ch } else chunk += ch
    }
    line = chunk
  }
  if (line || lines.length === 0) push()
  return lines
}

/** Adds the "Schedule 1 — Scope of Works" page(s) to the end of the document. Returns how many pages were added. */
export async function appendScopeSchedule(
  pdf: PDFDocument,
  scope: string,
  header: { clientName?: string; site?: string; builderName?: string },
  changes = '',                  // dated notes on changes agreed after the quote was accepted; printed under the scope
): Promise<number> {
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const first = pdf.getPage(0)
  const { width: W, height: H } = first.getSize()
  const MARGIN = 56, BODY = 10.5, LEAD = 15
  const textWidth = W - MARGIN * 2
  const before = pdf.getPageCount()

  const paragraphs = toPdfSafeText(scope).split('\n').map(p => p.trim())
  const changeParagraphs = toPdfSafeText(changes).split('\n').map(p => p.trim())
  const hasChanges = changeParagraphs.some(p => p !== '')
  let page = pdf.addPage([W, H])
  let y = H - MARGIN

  const title = (t: string, size: number) => { page.drawText(t, { x: MARGIN, y, size, font: bold, color: rgb(0.1, 0.12, 0.13) }); y -= size + 8 }
  title('Schedule 1 - Scope of Works', 17)
  const meta = [
    header.builderName ? `Builder: ${header.builderName}` : '',
    header.clientName ? `Client: ${header.clientName}` : '',
    header.site ? `Site: ${header.site.split('\n').join(', ')}` : '',
  ].filter(Boolean).map(toPdfSafeText)
  for (const m of meta) for (const l of wrapParagraph(m, font, 9.5, textWidth)) { page.drawText(l, { x: MARGIN, y, size: 9.5, font, color: rgb(0.35, 0.38, 0.4) }); y -= 13 }
  page.drawLine({ start: { x: MARGIN, y: y + 2 }, end: { x: W - MARGIN, y: y + 2 }, thickness: 0.6, color: rgb(0.7, 0.72, 0.74) })
  y -= 16

  const writeParagraphs = (list: string[]) => {
    for (const para of list) {
      if (para === '') { y -= LEAD * 0.5; continue }
      for (const l of wrapParagraph(para, font, BODY, textWidth)) {
        if (y < MARGIN) {            // next page; carries the heading so each page stands alone when printed
          page = pdf.addPage([W, H]); y = H - MARGIN
          title('Schedule 1 - Scope of Works (continued)', 12)
          y -= 6
        }
        page.drawText(l, { x: MARGIN, y, size: BODY, font, color: rgb(0.1, 0.12, 0.13) })
        y -= LEAD
      }
      y -= 4
    }
  }

  writeParagraphs(paragraphs)

  if (hasChanges) {
    y -= 14
    if (y < MARGIN + 60) { page = pdf.addPage([W, H]); y = H - MARGIN; title('Schedule 1 - Scope of Works (continued)', 12); y -= 6 }
    title('Changes agreed to the scope', 13)
    page.drawText('Agreed after the original scope of works above was accepted. Where they differ, these changes apply.', { x: MARGIN, y, size: 9, font, color: rgb(0.35, 0.38, 0.4) })
    y -= 18
    writeParagraphs(changeParagraphs)
  }
  return pdf.getPageCount() - before
}
