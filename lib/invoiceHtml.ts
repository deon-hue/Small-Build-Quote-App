import type { Invoice, Settings } from './types'

export function buildInvoiceHtml(inv: Invoice, settings: Settings): string {
  const fmt = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const INV_BADGE: Record<string, string> = {
    draft: '#aaa', sent: '#4a90a4', paid: '#7ab533', overdue: '#c0392b',
  }
  const INV_LABEL: Record<string, string> = {
    draft: 'DRAFT', sent: 'SENT', paid: 'PAID', overdue: 'OVERDUE',
  }

  const rows = inv.lineItems.map(li => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px">${li.desc || '—'}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px;text-align:center">${li.qty}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:monospace">${fmt(li.unitPrice)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:monospace;font-weight:600">${fmt(li.total)}</td>
    </tr>`).join('')

  const logoHtml = settings.logo
    ? `<img src="${settings.logo}" style="height:56px;max-width:180px;object-fit:contain;margin-bottom:8px" />`
    : ''

  const statusColor = INV_BADGE[inv.status] || '#aaa'
  const statusLabel = INV_LABEL[inv.status] || inv.status.toUpperCase()

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Invoice ${inv.ref}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e2022; background: #fff; font-size: 14px }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact }
    .no-print { display: none }
  }
</style>
</head>
<body>
<div style="max-width:760px;margin:0 auto;padding:40px 32px">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px">
    <div>
      ${logoHtml}
      <div style="font-size:20px;font-weight:700;color:#2b2f33">${settings.name || 'Company Name'}</div>
      ${settings.tagline ? `<div style="font-size:12px;color:#888;margin-top:2px">${settings.tagline}</div>` : ''}
      <div style="font-size:12px;color:#666;margin-top:10px;line-height:1.6">
        ${settings.address ? settings.address.replace(/\n/g, '<br>') : ''}
        ${settings.phone ? `<br>${settings.phone}` : ''}
        ${settings.email ? `<br>${settings.email}` : ''}
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-size:32px;font-weight:700;color:#2b2f33;letter-spacing:-1px">INVOICE</div>
      <div style="font-size:15px;color:#888;margin-top:4px;font-family:monospace">${inv.ref}</div>
      <div style="margin-top:12px;display:inline-block;background:${statusColor};color:white;padding:4px 14px;border-radius:20px;font-size:12px;font-weight:700;letter-spacing:1px">${statusLabel}</div>
    </div>
  </div>

  <!-- Dates + client -->
  <div style="display:flex;justify-content:space-between;margin-bottom:32px;gap:20px">
    <div style="background:#f8f9fa;border-radius:8px;padding:18px 22px;flex:1">
      <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#888;margin-bottom:12px;font-weight:700">Billed To</div>
      <div style="font-weight:700;font-size:15px">${inv.clientName || '—'}</div>
      ${inv.clientAddress ? `<div style="font-size:13px;color:#555;margin-top:4px;line-height:1.5">${inv.clientAddress.replace(/\n/g, '<br>')}</div>` : ''}
      ${inv.clientEmail ? `<div style="font-size:12px;color:#888;margin-top:4px">${inv.clientEmail}</div>` : ''}
    </div>
    <div style="background:#f8f9fa;border-radius:8px;padding:18px 22px;min-width:180px">
      <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#888;margin-bottom:12px;font-weight:700">Invoice Details</div>
      <div style="font-size:13px;margin-bottom:6px"><span style="color:#888">Issue Date:</span> <strong>${inv.issueDate || '—'}</strong></div>
      <div style="font-size:13px"><span style="color:#888">Due Date:</span> <strong>${inv.dueDate || '—'}</strong></div>
    </div>
  </div>

  <!-- Line items -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:0">
    <thead>
      <tr style="background:#2b2f33;color:white">
        <th style="padding:10px 14px;text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase">Description</th>
        <th style="padding:10px 14px;text-align:center;font-size:11px;letter-spacing:1px;text-transform:uppercase">Qty</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px;letter-spacing:1px;text-transform:uppercase">Unit Price</th>
        <th style="padding:10px 14px;text-align:right;font-size:11px;letter-spacing:1px;text-transform:uppercase">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <!-- Totals -->
  <div style="display:flex;justify-content:flex-end;margin-top:0">
    <div style="min-width:240px">
      <div style="display:flex;justify-content:space-between;padding:10px 14px;font-size:13px;border-bottom:1px solid #eee">
        <span style="color:#888">Subtotal</span>
        <span style="font-family:monospace">${fmt(inv.subtotal)}</span>
      </div>
      ${inv.vatIncluded ? `
      <div style="display:flex;justify-content:space-between;padding:10px 14px;font-size:13px;border-bottom:1px solid #eee">
        <span style="color:#888">VAT (20%)</span>
        <span style="font-family:monospace">${fmt(inv.vatAmount)}</span>
      </div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:14px;background:#2b2f33;color:white;border-radius:0 0 6px 6px">
        <span style="font-weight:700;font-size:15px">TOTAL DUE</span>
        <span style="font-family:monospace;font-size:18px;font-weight:700">${fmt(inv.total)}</span>
      </div>
    </div>
  </div>

  <!-- Payment plan / schedule -->
  ${inv.paymentPlan && inv.paymentPlan.length > 0 ? `
  <div style="margin-top:32px">
    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:12px">Payment Schedule</div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#f0f2f4">
          <th style="padding:8px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Milestone</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Due Date</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Amount</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Status</th>
        </tr>
      </thead>
      <tbody>
        ${inv.paymentPlan.map(m => `
        <tr style="border-bottom:1px solid #eee">
          <td style="padding:10px 12px;font-size:13px">${m.description || '—'}</td>
          <td style="padding:10px 12px;font-size:13px;text-align:center;color:#666">${m.dueDate ? new Date(m.dueDate).toLocaleDateString('en-GB') : 'TBC'}</td>
          <td style="padding:10px 12px;font-size:13px;text-align:right;font-family:monospace;font-weight:600">${fmt(m.amount)}</td>
          <td style="padding:10px 12px;text-align:center">
            <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${m.paid ? '#e8f5d6' : '#f0f2f4'};color:${m.paid ? '#5e8f20' : '#888'}">
              ${m.paid ? '✓ PAID' : 'PENDING'}
            </span>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- Payment Details (bank info from settings) -->
  ${(settings.invoiceBankName || settings.invoiceAccountName || settings.invoiceAccountNumber) ? `
  <div style="margin-top:32px;padding:16px 20px;background:#f0f7ee;border-radius:8px;font-size:13px;color:#3a5a35;line-height:1.8">
    <div style="font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6a9162;margin-bottom:10px">Payment Details</div>
    <div style="display:grid;grid-template-columns:160px 1fr;gap:2px 16px">
      ${settings.invoicePaymentMethods?.length ? `<span style="color:#6a9162;font-size:12px">Payment Method</span><span>${settings.invoicePaymentMethods.join(', ')}</span>` : ''}
      ${settings.invoiceAccountName  ? `<span style="color:#6a9162;font-size:12px">Account Name</span><span style="font-weight:600">${settings.invoiceAccountName}</span>` : ''}
      ${settings.invoiceBankName     ? `<span style="color:#6a9162;font-size:12px">Bank</span><span>${settings.invoiceBankName}</span>` : ''}
      ${settings.invoiceSortCode     ? `<span style="color:#6a9162;font-size:12px">Sort Code</span><span style="font-family:monospace">${settings.invoiceSortCode}</span>` : ''}
      ${settings.invoiceAccountNumber ? `<span style="color:#6a9162;font-size:12px">Account Number</span><span style="font-family:monospace">${settings.invoiceAccountNumber}</span>` : ''}
    </div>
  </div>` : ''}

  <!-- Notes -->
  ${inv.notes ? `
  <div style="margin-top:32px;padding:16px 20px;background:#f8f9fa;border-radius:8px;font-size:13px;color:#555;line-height:1.6">
    <div style="font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888;margin-bottom:8px">Notes</div>
    ${inv.notes.replace(/\n/g, '<br>')}
  </div>` : ''}

  <!-- Terms -->
  ${settings.terms ? `
  <div style="margin-top:24px;padding:16px 20px;border-top:2px solid #eee;font-size:12px;color:#888;line-height:1.6">
    <div style="font-weight:700;font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Payment Terms</div>
    ${settings.terms}
  </div>` : ''}

</div>
</body>
</html>`
}
