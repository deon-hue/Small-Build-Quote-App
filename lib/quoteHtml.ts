import type { Quote } from './types'
import type { Settings } from './types'
import { VAT, calcItemSell, calcPhaseSell } from './utils'
import { getPhaseVisual } from './phase-visuals'

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export interface HtmlOpts {
  showScope?: boolean
  showPaymentTerms?: boolean
  quoteView?: 'full' | 'phases' | 'total_only'
}

export function buildHtml(q: Quote, settings: Settings, opts: HtmlOpts = {}, boTasks: any[] = []): string {
  const showScope        = opts.showScope        ?? true
  const showPaymentTerms = opts.showPaymentTerms ?? true
  const co = settings
  const qMkp = q.markup || 0
  const qVat = q.vatIncluded
  // Sum calcPhaseSell per phase rather than calcPhase(net) + a flat markup:
  // calcPhase only totals the generic item rows (it misses BO catalogue
  // products/plant), and a flat markup on top double-counts labour-trade
  // items, which already store their own marked-up sell price.
  const sub = q.phases.reduce((s, p) => s + calcPhaseSell(p, qMkp), 0)
  const vat = qVat ? sub * VAT : 0
  const total = sub + vat
  const now = new Date()

  const itemTypeLabels: Record<string, string> = {
    labour: 'Labour', materials: 'Materials', plant: 'Plant Work',
    subcontractors: 'Subcontractor Work', other: 'Other Cost'
  }
  const getItemDesc = (i: any): string => {
    if (i.desc) return i.desc
    if (i.boTaskId) {
      const task = boTasks.find(t => t.id === i.boTaskId)
      if (task) return task.name
    }
    return (i.itemType ? itemTypeLabels[i.itemType] : undefined) || 'Item'
  }

  // One line-item row — shared by generic items, BO catalogue products and
  // BO catalogue plant-hire lines, so every row that contributes to
  // calcPhaseSell() also gets a visible row (previously products/plantItems
  // were counted into the phase total but never rendered).
  const itemRow = (desc: string, qty: number | undefined, unit: string | undefined, notes: string | undefined, sell: number): string => {
    const itemVat = qVat ? sell * VAT : 0
    const qtyHtml = qty !== undefined ? `<span style="font-size:11px;color:#94a3b8;margin-left:8px">${qty} ${esc(unit || '')}</span>` : ''
    return `<div style="display:flex;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">
      <div style="flex:1;color:#334155">${esc(desc)}${qtyHtml}${notes ? '<div style="font-size:11px;color:#94a3b8;margin-top:2px">' + esc(notes) + '</div>' : ''}</div>
      <div style="color:#7ab533;font-weight:600;font-family:monospace;text-align:right;min-width:80px">£${sell.toFixed(2)}</div>
      ${qVat ? `<div style="color:#94a3b8;font-size:11px;text-align:right;min-width:60px">£${itemVat.toFixed(2)}</div>` : ''}
    </div>`
  }

  const phaseRows = q.phases.map(p => {
    const phaseTotal = calcPhaseSell(p, qMkp)
    const itemRows = p.items.filter(i => calcItemSell(i, qMkp) > 0)
      .map(i => itemRow(getItemDesc(i), i.qty, i.unit, i.notes, calcItemSell(i, qMkp))).join('')
    const productRows = (p.products ?? []).filter(pr => pr.enabled !== false)
      .map(pr => itemRow(pr.name, pr.qty, pr.unit, pr.notes, pr.sellPrice * pr.qty)).join('')
    const plantRows = (p.plantItems ?? []).filter(pl => pl.enabled !== false)
      .map(pl => itemRow(pl.name, pl.qty, pl.unit, pl.notes, pl.sellPrice * pl.qty)).join('')
    return `
      <div style="margin-bottom:20px;border-left:4px solid #7ab533;background:#f8fafc;padding:16px;border-radius:4px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:14px;font-weight:600;color:#1e293b">${esc(p.phase)}</div>
          <div style="font-size:16px;font-weight:700;color:#7ab533;font-family:monospace">£${phaseTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
        </div>
        <div style="background:white;border-radius:4px;overflow:hidden">
          ${itemRows}${productRows}${plantRows}
        </div>
      </div>`
  }).join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:40px 20px}
.container{max-width:900px;margin:0 auto;background:white;box-shadow:0 10px 40px rgba(0,0,0,0.1)}
.header{display:flex;align-items:center;gap:30px;padding:40px;border-bottom:3px solid #7ab533;background:linear-gradient(135deg,#f8faf8 0%,#fff 100%)}
.logo{width:80px;height:80px;background:#7ab533;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:28px;font-weight:bold;flex-shrink:0}
.company-info h1{font-size:28px;color:#1e293b;margin-bottom:8px}
.company-info p{font-size:13px;color:#64748b;line-height:1.6}
.quote-title{padding:30px 40px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
.quote-title h2{font-size:18px;color:#1e293b;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px}
.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:30px 40px;background:white;border-bottom:1px solid #e2e8f0}
.detail-block h3{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;font-weight:600}
.detail-block p{font-size:13px;color:#334155;line-height:1.7}
.phases-section{padding:40px}
.phases-title{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px;font-weight:600;border-bottom:2px solid #7ab533;padding-bottom:10px}
.totals-section{display:flex;justify-content:flex-end;padding:40px;background:#f8fafc;border-top:2px solid #e2e8f0}
.totals-box{width:350px}
.total-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
.total-label{color:#64748b}
.total-amount{color:#1e293b;font-weight:600;font-family:'Monaco',monospace}
.grand-total{border-bottom:none!important;border-top:2px solid #7ab533;padding-top:16px;padding-bottom:0;font-size:16px}
.grand-total .total-label{color:#1e293b;font-weight:700}
.grand-total .total-amount{color:#7ab533;font-size:18px;font-weight:700}
.scope-box{margin:0 40px 24px;padding:16px 18px;background:#f8fafc;border-left:3px solid #7ab533;border-radius:0 4px 4px 0}
.scope-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5a8a20;margin-bottom:8px}
.scope-text{font-size:13px;color:#1e2022;line-height:1.7}
.terms-box{margin:0 40px 24px;padding:16px 18px;background:#f8fafc;border-radius:4px}
.terms-box h4{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:7px}
.terms-box p{font-size:12px;color:#444;line-height:1.6;margin-bottom:5px}
.footer{padding:30px 40px;background:#1e293b;color:rgba(255,255,255,0.7);font-size:12px;text-align:center;line-height:1.6}
.footer-divider{height:1px;background:rgba(255,255,255,0.2);margin-bottom:20px}
</style></head><body>
<div class="container">
  <div class="header">
    ${co.logo ? `<img src="${co.logo}" alt="Logo" style="height:80px;max-width:160px;object-fit:contain;flex-shrink:0">` : `<div class="logo">SBC</div>`}
    <div class="company-info">
      <h1>${esc(co.name || 'Small Build Company')}</h1>
      <p>${esc(co.tagline || 'Building Extensions & Renovations')}<br>
      📍 ${esc(co.address || '123 High Street, London, UK')}<br>
      📧 ${esc(co.email || 'info@company.co.uk')} · 📞 ${esc(co.phone || '')}</p>
    </div>
  </div>

  <div class="quote-title">
    <h2>Quotation for Works</h2>
  </div>

  <div class="details-grid">
    <div>
      <div class="detail-block">
        <h3>Quote Reference</h3>
        <p>${esc(q.ref || '—')}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Date Issued</h3>
        <p>${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Valid Until</h3>
        <p>${new Date(now.getTime() + 30 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
    <div>
      <div class="detail-block">
        <h3>Prepared For</h3>
        <p>${esc(q.customer.name || '—')}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Property Address</h3>
        <p>${esc(q.customer.address || '—')}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Job Type</h3>
        <p>${esc(q.jobType)}</p>
      </div>
    </div>
  </div>

  ${showScope && q.scope ? `<div class="scope-box"><div class="scope-label">Scope of Works</div><div class="scope-text">${q.scope.replace(/\n/g, '<br>')}</div></div>` : ''}
  ${q.photo ? `<div style="margin:0 40px 24px;text-align:center"><img src="${q.photo}" alt="Property" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid #e2e8f0;object-fit:cover"></div>` : ''}

  <div class="phases-section">
    <div class="phases-title">Summary of Works — ${esc(q.jobType)}</div>
    ${phaseRows}
  </div>

  <div class="totals-section">
    <div class="totals-box">
      <div class="total-row">
        <div class="total-label">Subtotal (ex-VAT)</div>
        <div class="total-amount">£${sub.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
      </div>
      ${qVat ? `<div class="total-row">
        <div class="total-label">VAT (20%)</div>
        <div class="total-amount">£${vat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
      </div>` : ''}
      <div class="total-row grand-total">
        <div class="total-label">TOTAL${!qVat ? ' (ex-VAT)' : ' (inc. VAT)'}</div>
        <div class="total-amount">£${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>
  </div>

  ${showPaymentTerms ? `<div class="terms-box"><h4>Payment Terms &amp; Conditions</h4><p>${co.terms || ''}</p><p>${co.extra || ''}</p></div>` : ''}
  <p style="margin:0 40px 32px;font-size:13px;color:#444">To accept this quotation or to discuss any aspect of the works:<br><strong>${esc(co.contact || '')}</strong> &nbsp;·&nbsp; ${esc(co.email || '')} &nbsp;·&nbsp; ${esc(co.phone || '')}</p>

  <div class="footer">
    <div class="footer-divider"></div>
    <p><strong>${esc(co.name || 'Small Build Company')}</strong><br>
    ${esc(co.address || '')} · Registered in England &amp; Wales<br>
    This quotation is valid for 30 days from the date of issue.</p>
  </div>
</div>
</body></html>`
}

export function buildHtmlClientView(q: Quote, settings: Settings, opts: HtmlOpts = {}, boTasks: any[] = []): string {
  const showScope        = opts.showScope        ?? true
  const showPaymentTerms = opts.showPaymentTerms ?? true
  const quoteView        = opts.quoteView        ?? 'full'
  const co = settings
  const qMkp = q.markup || 0
  const qVat = q.vatIncluded
  const now = new Date()

  const sub = q.phases.reduce((s, p) => s + calcPhaseSell(p, qMkp), 0)
  const vat = qVat ? sub * VAT : 0
  const total = sub + vat

  // Build phase card rows — behaviour depends on quoteView
  const phaseRows = quoteView === 'total_only' ? '' : q.phases.map(p => {
    const sell    = calcPhaseSell(p, qMkp)
    const vatAmt  = qVat ? sell * VAT : 0
    // Use AI-assigned image if available; fall back to the static mapping
    const img     = p.phaseImage ?? { ...getPhaseVisual(p.phase), photoUrl: undefined }
    const emoji   = img.emoji
    const color   = img.color
    const photo   = img.photoUrl

    const photoHtml = photo
      ? `<div style="width:72px;height:52px;border-radius:6px;overflow:hidden;flex-shrink:0;margin-right:14px">
           <img src="${photo}" alt="${esc(p.phase)}" style="width:100%;height:100%;object-fit:cover">
         </div>`
      : `<div style="width:52px;height:52px;border-radius:6px;background:${color}18;border:1px solid ${color}44;display:flex;align-items:center;justify-content:center;font-size:26px;flex-shrink:0;margin-right:14px">${emoji}</div>`

    // 'phases' view: show name, item/task list and the phase total, but hide
    // per-item and per-phase prices. 'full' shows everything.
    const priceHtml = (quoteView === 'full' || quoteView === 'phases')
      ? `<div style="text-align:right;flex-shrink:0">
           <div style="font-weight:700;font-size:14px;color:#2b2f33">£${sell.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
           ${qVat ? `<div style="font-size:11px;color:#4a90a4">+£${vatAmt.toLocaleString('en-GB', { minimumFractionDigits: 2 })} VAT</div>` : ''}
         </div>`
      : ''

    const getItemDesc = (i: any): string => {
      if (i.desc) return i.desc
      if (i.boTaskId) {
        const task = boTasks.find(t => t.id === i.boTaskId)
        if (task) return task.name
      }
      const itemTypeLabels: Record<string, string> = {
        labour: 'Labour', materials: 'Materials', plant: 'Plant Work',
        subcontractors: 'Subcontractor Work', other: 'Other Cost'
      }
      return (i.itemType ? itemTypeLabels[i.itemType] : undefined) || 'Item'
    }
    // Combine generic items with BO catalogue products/plant-hire — all three
    // feed calcPhaseSell(), so all three need a visible row or the list
    // undercounts the phase total shown above it.
    type LineEntry = { desc: string; qty: number; unit: string; sell: number }
    const visibleItems: LineEntry[] = (quoteView === 'full' || quoteView === 'phases')
      ? [
          ...p.items.filter(i => calcItemSell(i, qMkp) > 0)
            .map(i => ({ desc: getItemDesc(i), qty: i.qty, unit: i.unit, sell: calcItemSell(i, qMkp) })),
          ...(p.products ?? []).filter(pr => pr.enabled !== false)
            .map(pr => ({ desc: pr.name, qty: pr.qty, unit: pr.unit, sell: pr.sellPrice * pr.qty })),
          ...(p.plantItems ?? []).filter(pl => pl.enabled !== false)
            .map(pl => ({ desc: pl.name, qty: pl.qty, unit: pl.unit, sell: pl.sellPrice * pl.qty })),
        ]
      : []
    const itemRowsHtml = visibleItems.map(entry => {
      return `<div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 16px;border-bottom:1px solid #e2e8f0;background:white">
        <div>
          <span style="font-size:12px;color:#334155">${esc(entry.desc)}</span>
          <span style="font-size:11px;color:#94a3b8;margin-left:8px">${entry.qty} ${esc(entry.unit)}</span>
        </div>
        ${quoteView === 'full' ? `<span style="font-size:12px;font-weight:600;color:#2b2f33;white-space:nowrap">£${entry.sell.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>` : ''}
      </div>`
    }).join('')

    return `<div style="margin-bottom:20px;border-left:4px solid #7ab533;background:#f8fafc;border-radius:4px;overflow:hidden">
      <div style="display:flex;align-items:center;padding:12px 14px">
        ${photoHtml}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;color:#1e293b">${esc(p.phase)}</div>
          ${p.taskName ? `<div style="font-size:11px;color:#64748b;margin-top:2px">${esc(p.taskName)}</div>` : ''}
        </div>
        ${priceHtml}
      </div>
      ${itemRowsHtml ? `<div style="border-top:1px solid #e2e8f0">${itemRowsHtml}</div>` : ''}
    </div>`
  }).join('')

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:40px 20px}
.container{max-width:900px;margin:0 auto;background:white;box-shadow:0 10px 40px rgba(0,0,0,0.1)}
.header{display:flex;align-items:center;gap:30px;padding:40px;border-bottom:3px solid #7ab533;background:linear-gradient(135deg,#f8faf8 0%,#fff 100%)}
.logo{width:80px;height:80px;background:#7ab533;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-size:28px;font-weight:bold;flex-shrink:0}
.company-info h1{font-size:28px;color:#1e293b;margin-bottom:8px}
.company-info p{font-size:13px;color:#64748b;line-height:1.6}
.quote-title{padding:30px 40px;background:#f8fafc;border-bottom:1px solid #e2e8f0}
.quote-title h2{font-size:18px;color:#1e293b;margin-bottom:12px;text-transform:uppercase;letter-spacing:1px}
.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;padding:30px 40px;background:white;border-bottom:1px solid #e2e8f0}
.detail-block h3{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;font-weight:600}
.detail-block p{font-size:13px;color:#334155;line-height:1.7}
.phases-section{padding:40px}
.phases-title{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:20px;font-weight:600;border-bottom:2px solid #7ab533;padding-bottom:10px}
.totals-section{display:flex;justify-content:flex-end;padding:40px;background:#f8fafc;border-top:2px solid #e2e8f0}
.totals-box{width:350px}
.total-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
.total-label{color:#64748b}
.total-amount{color:#1e293b;font-weight:600;font-family:'Monaco',monospace}
.grand-total{border-bottom:none!important;border-top:2px solid #7ab533;padding-top:16px;padding-bottom:0;font-size:16px}
.grand-total .total-label{color:#1e293b;font-weight:700}
.grand-total .total-amount{color:#7ab533;font-size:18px;font-weight:700}
.scope-box{margin:0 40px 24px;padding:16px 18px;background:#f8fafc;border-left:3px solid #7ab533;border-radius:0 4px 4px 0}
.scope-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5a8a20;margin-bottom:8px}
.scope-text{font-size:13px;color:#1e2022;line-height:1.7}
.terms-box{margin:0 40px 24px;padding:16px 18px;background:#f8fafc;border-radius:4px}
.terms-box h4{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:7px}
.terms-box p{font-size:12px;color:#444;line-height:1.6;margin-bottom:5px}
.footer{padding:30px 40px;background:#1e293b;color:rgba(255,255,255,0.7);font-size:12px;text-align:center;line-height:1.6}
.footer-divider{height:1px;background:rgba(255,255,255,0.2);margin-bottom:20px}
</style></head><body>
<div class="container">
  <div class="header">
    ${co.logo ? `<img src="${co.logo}" alt="Logo" style="height:80px;max-width:160px;object-fit:contain;flex-shrink:0">` : `<div class="logo">SBC</div>`}
    <div class="company-info">
      <h1>${esc(co.name || 'Small Build Company')}</h1>
      <p>${esc(co.tagline || 'Building Extensions & Renovations')}<br>
      📍 ${esc(co.address || '123 High Street, London, UK')}<br>
      📧 ${esc(co.email || 'info@company.co.uk')} · 📞 ${esc(co.phone || '')}</p>
    </div>
  </div>

  <div class="quote-title">
    <h2>Quotation for Works</h2>
  </div>

  <div class="details-grid">
    <div>
      <div class="detail-block">
        <h3>Quote Reference</h3>
        <p>${esc(q.ref || '—')}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Date Issued</h3>
        <p>${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Valid Until</h3>
        <p>${new Date(now.getTime() + 30 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
    </div>
    <div>
      <div class="detail-block">
        <h3>Prepared For</h3>
        <p>${esc(q.customer.name || '—')}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Property Address</h3>
        <p>${esc(q.customer.address || '—')}</p>
      </div>
      <div class="detail-block" style="margin-top:20px">
        <h3>Job Type</h3>
        <p>${esc(q.jobType)}</p>
      </div>
    </div>
  </div>

  ${showScope && q.scope ? `<div class="scope-box"><div class="scope-label">Scope of Works</div><div class="scope-text">${q.scope.replace(/\n/g, '<br>')}</div></div>` : ''}
  ${q.photo ? `<div style="margin:0 40px 24px;text-align:center"><img src="${q.photo}" alt="Property" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid #e2e8f0;object-fit:cover"></div>` : ''}

  ${quoteView !== 'total_only' ? `<div class="phases-section">
    <div class="phases-title">Summary of Works — ${esc(q.jobType)}</div>
    ${phaseRows}
  </div>` : ''}

  <div class="totals-section">
    <div class="totals-box">
      ${quoteView !== 'total_only' ? `<div class="total-row">
        <div class="total-label">Subtotal (ex-VAT)</div>
        <div class="total-amount">£${sub.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
      </div>
      ${qVat ? `<div class="total-row">
        <div class="total-label">VAT (20%)</div>
        <div class="total-amount">£${vat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
      </div>` : '<div class="total-row"><div class="total-label" style="font-size:10px">*VAT not included</div></div>'}` : ''}
      <div class="total-row grand-total">
        <div class="total-label">TOTAL${qVat ? ' (inc. VAT)' : ''}</div>
        <div class="total-amount">£${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>
  </div>

  ${showPaymentTerms ? `<div class="terms-box"><h4>Payment Terms &amp; Conditions</h4><p>${co.terms || ''}</p><p>${co.extra || ''}</p></div>` : ''}
  <p style="margin:0 40px 32px;font-size:13px;color:#444">To accept this quotation or to discuss any aspect of the works, please contact us:<br><strong>${esc(co.contact || '')}</strong> &nbsp;·&nbsp; ${esc(co.email || '')} &nbsp;·&nbsp; ${esc(co.phone || '')}</p>

  <div class="footer">
    <div class="footer-divider"></div>
    <p><strong>${esc(co.name || 'Small Build Company')}</strong><br>
    ${esc(co.address || '')} · Registered in England &amp; Wales<br>
    This quotation is valid for 30 days from the date of issue.</p>
  </div>
</div>
</body></html>`
}
