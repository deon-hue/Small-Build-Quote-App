// Materials list report — print and CSV export for an assembly calculator's materials
// lines, used both inside the calculator itself (the current, possibly-unsaved calculation)
// and on a quote's sub-phase (the last-saved QuotePhase.assemblyLines snapshot). Pure
// browser-API functions, no React — the calling component decides what lines to pass in
// (materials-category CostedLines only) and what title/meta to show.

import type { CostedLine } from './assembly-calc'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function escapeCsv(v: string | number): string {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildMaterialsCsv(lines: CostedLine[]): string {
  const header = ['Item', 'Qty', 'Unit', 'Waste %', 'Unit Cost (£)', 'Cost (£)']
  const rows = lines.map(l => [l.name, l.purchaseQty, l.unit, l.wastePct, l.unitCost.toFixed(2), l.cost.toFixed(2)])
  const total = lines.reduce((s, l) => s + l.cost, 0)
  rows.push(['', '', '', '', 'Total', total.toFixed(2)])
  return [header, ...rows].map(r => r.map(escapeCsv).join(',')).join('\r\n')
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadMaterialsCsv(title: string, lines: CostedLine[]) {
  const filename = `${title.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'materials'}-materials.csv`
  downloadTextFile(filename, buildMaterialsCsv(lines), 'text/csv')
}

function buildMaterialsPrintHtml(lines: CostedLine[], opts: { title: string; location?: string; description?: string }): string {
  const total = lines.reduce((s, l) => s + l.cost, 0)
  const rows = lines.map(l => `
    <tr>
      <td>${escapeHtml(l.name)}</td>
      <td class="num">${l.purchaseQty}</td>
      <td>${escapeHtml(l.unit)}</td>
      <td class="num">${l.wastePct}%</td>
      <td class="num">£${l.unitCost.toFixed(2)}</td>
      <td class="num">£${l.cost.toFixed(2)}</td>
    </tr>`).join('')
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)} — Materials List</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  .desc { font-size: 12px; color: #475569; max-width: 600px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
  th { background: #f8fafc; text-transform: uppercase; font-size: 11px; color: #64748b; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 700; border-top: 2px solid #1e293b; border-bottom: none; }
</style>
</head><body>
  <h1>${escapeHtml(opts.title)} — Materials List</h1>
  <div class="meta">${opts.location ? escapeHtml(opts.location) + ' · ' : ''}${new Date().toLocaleDateString('en-GB')}</div>
  ${opts.description ? `<div class="desc">${escapeHtml(opts.description)}</div>` : ''}
  <table>
    <thead><tr><th>Item</th><th class="num">Qty</th><th>Unit</th><th class="num">Waste</th><th class="num">Unit Cost</th><th class="num">Cost</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="5" class="num">Total</td><td class="num">£${total.toFixed(2)}</td></tr></tfoot>
  </table>
</body></html>`
}

/** Opens a new tab with a printable materials list and triggers the browser's print dialog
 * — "Save as PDF" from there covers the download case with no extra library. */
export function openMaterialsPrintView(lines: CostedLine[], opts: { title: string; location?: string; description?: string }) {
  const html = buildMaterialsPrintHtml(lines, opts)
  const win = window.open('', '_blank')
  if (!win) {
    alert('Please allow pop-ups for this site to print the materials list.')
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}
