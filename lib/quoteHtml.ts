import type { Quote } from './types'
import type { Settings } from './types'
import { VAT, calcPhase, calcItemSell, calcPhaseSell } from './utils'

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function buildHtml(q: Quote, settings: Settings): string {
  const co = settings
  const net = q.phases.reduce((s, p) => s + calcPhase(p), 0)
  const mu = net * (q.markup / 100)
  const sub = net + mu
  const vat = q.vatIncluded ? sub * VAT : 0
  const total = sub + vat
  const qMkp = q.markup || 0
  const qVat = q.vatIncluded
  const now = new Date()

  const phRows = q.phases.map(p => `
    <tr class="ph"><td colspan="${qVat ? 5 : 4}">${esc(p.phase)}</td><td style="text-align:right;font-size:11px">Sell ex-VAT</td>${qVat ? '<td style="text-align:right;font-size:11px">VAT</td>' : ''}</tr>
    ${p.items.map(i => {
      const sell = calcItemSell(i, qMkp)
      const vatAmt = qVat ? sell * VAT : 0
      return `<tr><td>${esc(i.desc)}${i.notes ? '<br><small>' + esc(i.notes) + '</small>' : ''}</td><td style="text-align:center">${i.qty}</td><td style="text-align:center">${esc(i.unit)}</td><td style="text-align:right">${sell.toFixed(2)}</td>${qVat ? '<td style="text-align:right">' + vatAmt.toFixed(2) + '</td>' : ''}</tr>`
    }).join('')}
    <tr><td colspan="${qVat ? 4 : 3}" style="text-align:right;font-weight:600;font-size:11px;color:#2b2f33">Phase Total</td><td style="text-align:right;font-weight:700">£${calcPhaseSell(p, qMkp).toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>${qVat ? '<td style="text-align:right;font-weight:700">£' + (calcPhaseSell(p, qMkp) * VAT).toLocaleString('en-GB', { minimumFractionDigits: 2 }) + '</td>' : ''}</tr>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;background:#f0ece4;margin:0;padding:28px}
.w{max-width:720px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.1)}
.hd{background:#2b2f33;padding:28px 36px;color:white}
.co{font-size:22px;font-weight:700;margin-bottom:3px}
.tag{font-size:11px;opacity:0.7;letter-spacing:1px;text-transform:uppercase}
.bd{padding:32px 36px}
.intro{font-size:14px;line-height:1.7;color:#444;margin-bottom:24px}
.det{display:flex;gap:36px;margin-bottom:24px;padding:18px;background:#f8f5f0;border-radius:4px;flex-wrap:wrap}
.dl dt{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8a8278;margin-bottom:2px}
.dl dd{font-size:13px;color:#1a1612;margin-bottom:10px}
h3{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#2b2f33;margin:0 0 10px;padding-bottom:7px;border-bottom:2px solid #3d4a3e}
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}
th{background:#2b2f33;color:white;padding:7px 9px;text-align:left;font-weight:600;font-size:11px}
tr:nth-child(even) td{background:#f8f5f0}
td{padding:7px 9px;border-bottom:1px solid #e8e0d0;vertical-align:top}
.ph td{background:#e8ecf0;font-weight:600;color:#2b2f33}
.tots{float:right;width:260px;margin-bottom:28px}
.tots table{margin:0;font-size:13px}
.tots td{border:none;padding:5px 9px}
.tr td{font-weight:700;font-size:14px;background:#2b2f33;color:white}
.terms{background:#f8f5f0;border-radius:4px;padding:16px 18px;margin-top:6px;clear:both}
.terms h4{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a8278;margin-bottom:7px}
.terms p{font-size:12px;color:#444;line-height:1.6;margin-bottom:5px}
.ft{background:#2b2f33;padding:16px 36px;text-align:center;color:rgba(255,255,255,0.5);font-size:11px}
small{font-size:10px;color:#8a8278}
</style></head><body><div class="w">
<div class="hd" style="display:flex;align-items:center;gap:24px">
  ${co.logo ? `<div style="flex-shrink:0"><img src="${co.logo}" alt="Logo" style="height:60px;max-width:160px;object-fit:contain;filter:brightness(0) invert(1)"></div>` : ''}
  <div><div class="co">${esc(co.name || 'Small Build Company Ltd')}</div><div class="tag">${esc(co.tagline || 'Building Extensions & Renovations')}</div></div>
</div>
<div class="bd">
<div class="intro">Dear ${esc(q.customer.name || 'Customer')},<br><br>Thank you for the opportunity to quote for the works at <strong>${esc(q.customer.address || 'your property')}</strong>. Please find below our detailed estimate for the ${esc(q.jobType)} works as discussed. This quotation is valid for 30 days from the date of issue.</div>
${q.scope ? `<div style="margin-bottom:24px;padding:16px 18px;background:#f8f5f0;border-left:3px solid #7ab533;border-radius:0 4px 4px 0"><div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5a8a20;margin-bottom:8px">Scope of Works</div><div style="font-size:13px;color:#1e2022;line-height:1.7">${q.scope.replace(/\n/g, '<br>')}</div></div>` : ''}
${q.photo ? `<div style="margin-bottom:24px;text-align:center"><img src="${q.photo}" alt="Property" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid #e0ddd8;object-fit:cover"></div>` : ''}
<div class="det">
  <dl class="dl"><dt>Quote Reference</dt><dd>${esc(q.ref || '—')}</dd><dt>Date Issued</dt><dd>${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd><dt>Valid Until</dt><dd>${new Date(now.getTime() + 30 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></dl>
  <dl class="dl"><dt>Prepared For</dt><dd>${esc(q.customer.name || '—')}</dd><dt>Property</dt><dd>${esc(q.customer.address || '—')}</dd><dt>Job Type</dt><dd>${esc(q.jobType)}</dd></dl>
</div>
<h3>Itemised Estimate — ${esc(q.jobType)}</h3>
<table><thead><tr><th>Description</th><th style="width:48px;text-align:center">Qty</th><th style="width:44px;text-align:center">Unit</th><th style="width:90px;text-align:right">Sell Price (ex-VAT)</th>${qVat ? '<th style="width:80px;text-align:right">VAT (20%)</th>' : ''}</tr></thead><tbody>${phRows}</tbody></table>
<div class="tots"><table>
  <tr><td>Sell Price (ex-VAT)</td><td style="text-align:right">£${sub.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td></tr>
  ${q.vatIncluded ? `<tr><td>VAT (20%)</td><td style="text-align:right">£${vat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td></tr>` : '<tr><td colspan="2" style="font-size:10px;color:#8a8278">*VAT not included</td></tr>'}
  <tr class="tr"><td>TOTAL</td><td style="text-align:right">£${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td></tr>
</table></div>
<div style="clear:both"></div>
<div class="terms"><h4>Payment Terms &amp; Conditions</h4><p>${co.terms || ''}</p><p>${co.extra || ''}</p></div>
<p style="margin-top:20px;font-size:13px;color:#444">To accept this quotation or to discuss any aspect of the works:<br><strong>${esc(co.contact || '')}</strong> &nbsp;·&nbsp; ${esc(co.email || '')} &nbsp;·&nbsp; ${esc(co.phone || '')}</p>
</div>
<div class="ft">${esc(co.name || 'Small Build Company Ltd')} · ${esc(co.address || '')} · Registered in England &amp; Wales</div>
</div></body></html>`
}

export function buildHtmlClientView(q: Quote, settings: Settings): string {
  const co = settings
  const qMkp = q.markup || 0
  const qVat = q.vatIncluded
  const now = new Date()

  const phaseRows = q.phases.map(p => {
    const sell = calcPhaseSell(p, qMkp)
    const vat = qVat ? sell * VAT : 0
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e0d0;font-weight:500">${esc(p.phase)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e8e0d0;text-align:right;font-weight:600">£${sell.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>
      ${qVat ? `<td style="padding:10px 12px;border-bottom:1px solid #e8e0d0;text-align:right;color:#4a90a4">£${vat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td>` : ''}
    </tr>`
  }).join('')

  const sub = q.phases.reduce((s, p) => s + calcPhaseSell(p, qMkp), 0)
  const vat = qVat ? sub * VAT : 0
  const total = sub + vat

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;background:#f0f2f4;margin:0;padding:28px}
.w{max-width:680px;margin:0 auto;background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.1)}
.hd{background:#2b2f33;padding:28px 36px;color:white}
.co{font-size:22px;font-weight:700;margin-bottom:3px}
.tag{font-size:11px;opacity:0.7;letter-spacing:1px;text-transform:uppercase}
.bd{padding:32px 36px}
.intro{font-size:14px;line-height:1.7;color:#444;margin-bottom:24px}
.scope-box{margin-bottom:24px;padding:16px 18px;background:#f8f5f0;border-left:3px solid #7ab533;border-radius:0 4px 4px 0}
.scope-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5a8a20;margin-bottom:8px}
.scope-text{font-size:13px;color:#1e2022;line-height:1.7}
.det{display:flex;gap:36px;margin-bottom:24px;padding:18px;background:#f8f5f0;border-radius:4px;flex-wrap:wrap}
.dl dt{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#8a8278;margin-bottom:2px}
.dl dd{font-size:13px;color:#1a1612;margin-bottom:10px}
h3{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#2b2f33;margin:0 0 10px;padding-bottom:7px;border-bottom:2px solid #2b2f33}
table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px}
th{background:#2b2f33;color:white;padding:9px 12px;text-align:left;font-weight:600;font-size:11px}
.tots{float:right;width:280px;margin-bottom:28px}
.tots table{margin:0;font-size:13px;border-collapse:collapse}
.tots td{border:none;padding:6px 10px}
.tr td{font-weight:700;font-size:15px;background:#2b2f33;color:white;padding:10px}
.terms{background:#f8f5f0;border-radius:4px;padding:16px 18px;margin-top:6px;clear:both}
.terms h4{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:#8a8278;margin-bottom:7px}
.terms p{font-size:12px;color:#444;line-height:1.6;margin-bottom:5px}
.ft{background:#2b2f33;padding:16px 36px;text-align:center;color:rgba(255,255,255,0.5);font-size:11px}
</style></head><body><div class="w">
<div class="hd" style="display:flex;align-items:center;gap:24px">
  ${co.logo ? `<div style="flex-shrink:0"><img src="${co.logo}" alt="Logo" style="height:60px;max-width:160px;object-fit:contain;filter:brightness(0) invert(1)"></div>` : ''}
  <div><div class="co">${esc(co.name || 'Small Build Company Ltd')}</div><div class="tag">${esc(co.tagline || 'Building Extensions & Renovations')}</div></div>
</div>
<div class="bd">
<div class="intro">Dear ${esc(q.customer.name || 'Customer')},<br><br>Thank you for the opportunity to quote for the works at <strong>${esc(q.customer.address || 'your property')}</strong>. Please find below our quotation for the ${esc(q.jobType)} works as discussed. This quotation is valid for 30 days from the date of issue.</div>
${q.scope ? `<div class="scope-box"><div class="scope-label">Scope of Works</div><div class="scope-text">${q.scope.replace(/\n/g, '<br>')}</div></div>` : ''}
${q.photo ? `<div style="margin-bottom:24px;text-align:center"><img src="${q.photo}" alt="Property" style="max-width:100%;max-height:280px;border-radius:6px;border:1px solid #e0ddd8;object-fit:cover"></div>` : ''}
<div class="det">
  <dl class="dl"><dt>Quote Reference</dt><dd>${esc(q.ref || '—')}</dd><dt>Date Issued</dt><dd>${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd><dt>Valid Until</dt><dd>${new Date(now.getTime() + 30 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></dl>
  <dl class="dl"><dt>Prepared For</dt><dd>${esc(q.customer.name || '—')}</dd><dt>Property</dt><dd>${esc(q.customer.address || '—')}</dd><dt>Job Type</dt><dd>${esc(q.jobType)}</dd></dl>
</div>
<h3>Summary of Works — ${esc(q.jobType)}</h3>
<table><thead><tr><th>Phase / Stage of Works</th><th style="width:110px;text-align:right">Price (ex-VAT)</th>${qVat ? '<th style="width:90px;text-align:right">VAT (20%)</th>' : ''}</tr></thead><tbody>${phaseRows}</tbody></table>
<div class="tots"><table>
  <tr><td>Subtotal (ex-VAT)</td><td style="text-align:right">£${sub.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td></tr>
  ${qVat ? `<tr><td>VAT (20%)</td><td style="text-align:right">£${vat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td></tr>` : '<tr><td colspan="2" style="font-size:10px;color:#8a8278">*VAT not included</td></tr>'}
  <tr class="tr"><td>TOTAL</td><td style="text-align:right">£${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</td></tr>
</table></div>
<div style="clear:both"></div>
<div class="terms"><h4>Payment Terms &amp; Conditions</h4><p>${co.terms || ''}</p><p>${co.extra || ''}</p></div>
<p style="margin-top:20px;font-size:13px;color:#444">To accept this quotation or to discuss any aspect of the works, please contact us:<br><strong>${esc(co.contact || '')}</strong> &nbsp;·&nbsp; ${esc(co.email || '')} &nbsp;·&nbsp; ${esc(co.phone || '')}</p>
</div>
<div class="ft">${esc(co.name || 'Small Build Company Ltd')} · ${esc(co.address || '')} · Registered in England &amp; Wales</div>
</div></body></html>`
}
