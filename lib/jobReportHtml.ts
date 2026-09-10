import type { Invoice, JobPayment, Variation, Settings } from './types'

// Customer-facing financial summary for a job — contract value, variations, invoices, and
// payments received, so the client can check their own figures against ours. Deliberately
// excludes materials/labour/plant cost detail (lib/job-costs.ts's JobCost ledger) and
// variation line-item rates (Variation.items) — those are internal-only.

export interface JobReportData {
  jobType: string
  clientName: string
  jobAddress?: string
  contractValue: number
  variations: Variation[]   // every variation for the job, any status — grouped below
  invoices: Invoice[]
  payments: JobPayment[]
}

const VAR_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', sent: 'Awaiting Your Response', approved: 'Approved',
  rejected: 'Rejected', cancelled: 'Cancelled', invoiced: 'Approved (Invoiced)', paid: 'Approved (Paid)',
}
const VAR_STATUS_COLOR: Record<string, string> = {
  draft: '#94a3b8', sent: '#d97706', approved: '#16a34a',
  rejected: '#dc2626', cancelled: '#94a3b8', invoiced: '#16a34a', paid: '#16a34a',
}
const INV_BADGE: Record<string, string> = { draft: '#aaa', sent: '#4a90a4', paid: '#7ab533', overdue: '#c0392b' }
const PAYMENT_METHOD_LABEL: Record<string, string> = { cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank Transfer', other: 'Other' }

export function buildJobReportHtml(data: JobReportData, settings: Settings): string {
  const fmt = (n: number) => '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtDate = (d: string) => d ? new Date(d.length <= 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  // Same grouping rule the app already uses everywhere else (JobDocumentsModal, the
  // portal jobs view) — approved/invoiced/paid variations count toward the contract total;
  // draft/sent are pending, rejected/cancelled never did.
  const approvedVariations = data.variations.filter(v => v.status === 'approved' || v.status === 'invoiced' || v.status === 'paid')
  const pendingVariations  = data.variations.filter(v => v.status === 'draft' || v.status === 'sent')
  const closedVariations   = data.variations.filter(v => v.status === 'rejected' || v.status === 'cancelled')

  const approvedVariationsTotal = approvedVariations.reduce((s, v) => s + v.total, 0)
  const adjustedContractTotal = data.contractValue + approvedVariationsTotal

  const invoicedTotal = data.invoices.reduce((s, i) => s + i.total, 0)
  const paidInvoicesTotal = data.invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const cashReceived = data.payments.reduce((s, p) => s + p.amount, 0)
  const totalReceived = paidInvoicesTotal + cashReceived
  const balanceOutstanding = +(adjustedContractTotal - totalReceived).toFixed(2)

  const logoHtml = settings.logo
    ? `<img src="${settings.logo}" style="height:56px;max-width:180px;object-fit:contain;margin-bottom:8px" />`
    : ''

  function variationRow(v: Variation): string {
    return `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px">
        <div style="font-weight:600">${v.title || '—'}</div>
        ${v.description ? `<div style="font-size:12px;color:#888;margin-top:2px">${v.description.replace(/\n/g, '<br>')}</div>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666;font-family:monospace">${v.ref || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${VAR_STATUS_COLOR[v.status] || '#94a3b8'}22;color:${VAR_STATUS_COLOR[v.status] || '#94a3b8'}">${VAR_STATUS_LABEL[v.status] || v.status}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:monospace;font-weight:600">${fmt(v.total)}</td>
    </tr>`
  }

  function variationGroup(title: string, list: Variation[], subtotalLabel: string): string {
    if (!list.length) return ''
    const subtotal = list.reduce((s, v) => s + v.total, 0)
    return `
    <tr><td colspan="4" style="padding:14px 12px 4px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#888;font-weight:700">${title}</td></tr>
    ${list.map(variationRow).join('')}
    <tr>
      <td colspan="3" style="padding:6px 12px;text-align:right;font-size:12px;color:#888">${subtotalLabel}</td>
      <td style="padding:6px 12px;text-align:right;font-size:13px;font-family:monospace;font-weight:700">${fmt(subtotal)}</td>
    </tr>`
  }

  const invoiceRows = data.invoices.length ? data.invoices
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))
    .map(inv => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;font-family:monospace">${inv.ref}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666">${fmtDate(inv.issueDate)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666">${fmtDate(inv.dueDate)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">
        <span style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;background:${INV_BADGE[inv.status] || '#aaa'}22;color:${INV_BADGE[inv.status] || '#aaa'}">${inv.status.toUpperCase()}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:monospace;font-weight:600">${fmt(inv.total)}</td>
    </tr>`).join('')
    : `<tr><td colspan="5" style="padding:16px 12px;text-align:center;color:#aaa;font-size:13px">No invoices raised yet</td></tr>`

  const paymentRows = data.payments.length ? data.payments
    .slice()
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
    .map(p => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666">${fmtDate(p.paymentDate)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px">${PAYMENT_METHOD_LABEL[p.method] || p.method}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#888">${p.notes || '—'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:monospace;font-weight:600">${fmt(p.amount)}</td>
    </tr>`).join('')
    : `<tr><td colspan="4" style="padding:16px 12px;text-align:center;color:#aaa;font-size:13px">No payments logged yet</td></tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Job Financial Summary — ${data.clientName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0 }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e2022; background: #fff; font-size: 14px }
  table { width: 100%; border-collapse: collapse }
  @media print {
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact }
    .no-print { display: none }
  }
</style>
</head>
<body>
<div style="max-width:760px;margin:0 auto;padding:40px 32px">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
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
      <div style="font-size:26px;font-weight:700;color:#2b2f33;letter-spacing:-0.5px">Job Financial Summary</div>
      <div style="font-size:12px;color:#888;margin-top:6px">Generated ${fmtDate(new Date().toISOString())}</div>
    </div>
  </div>

  <!-- Client / job -->
  <div style="background:#f8f9fa;border-radius:8px;padding:18px 22px;margin-bottom:28px">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#888;margin-bottom:10px;font-weight:700">Job</div>
    <div style="font-weight:700;font-size:15px">${data.clientName}</div>
    <div style="font-size:13px;color:#555;margin-top:3px">${data.jobType}</div>
    ${data.jobAddress ? `<div style="font-size:12px;color:#888;margin-top:4px;line-height:1.5">${data.jobAddress.replace(/\n/g, '<br>')}</div>` : ''}
  </div>

  <!-- Contract summary -->
  <div style="margin-bottom:12px">
    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:10px">Contract Value</div>
    <table>
      <tbody>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666">Original contract value</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:monospace;font-weight:600">${fmt(data.contractValue)}</td>
        </tr>
        ${approvedVariationsTotal !== 0 ? `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;color:#666">Approved variations</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-family:monospace;font-weight:600;color:#2563eb">${approvedVariationsTotal > 0 ? '+' : ''}${fmt(approvedVariationsTotal)}</td>
        </tr>` : ''}
        <tr style="background:#2b2f33">
          <td style="padding:12px;font-size:14px;font-weight:700;color:#fff;border-radius:0 0 0 6px">Adjusted contract total</td>
          <td style="padding:12px;font-size:16px;font-weight:700;color:#fff;text-align:right;font-family:monospace;border-radius:0 0 6px 0">${fmt(adjustedContractTotal)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Variations detail -->
  ${data.variations.length > 0 ? `
  <div style="margin-top:28px;margin-bottom:12px">
    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:4px">Variations</div>
    <table>
      <thead>
        <tr style="background:#f0f2f4">
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Description</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Ref</th>
          <th style="padding:6px 12px;text-align:center;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Status</th>
          <th style="padding:6px 12px;text-align:right;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${variationGroup('Approved', approvedVariations, 'Approved total')}
        ${variationGroup('Pending Your Approval', pendingVariations, 'Pending total (not yet in contract)')}
        ${variationGroup('Rejected / Cancelled', closedVariations, 'Not included')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- Invoices -->
  <div style="margin-top:28px;margin-bottom:12px">
    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:4px">Invoices</div>
    <table>
      <thead>
        <tr style="background:#f0f2f4">
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Ref</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Issued</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Due</th>
          <th style="padding:6px 12px;text-align:center;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Status</th>
          <th style="padding:6px 12px;text-align:right;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceRows}
        <tr>
          <td colspan="4" style="padding:8px 12px;text-align:right;font-size:12px;color:#888;border-top:2px solid #ddd">Total invoiced</td>
          <td style="padding:8px 12px;text-align:right;font-size:13px;font-family:monospace;font-weight:700;border-top:2px solid #ddd">${fmt(invoicedTotal)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Payments -->
  <div style="margin-top:28px;margin-bottom:12px">
    <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#888;font-weight:700;margin-bottom:4px">Payments Received</div>
    <table>
      <thead>
        <tr style="background:#f0f2f4">
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Date</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Method</th>
          <th style="padding:6px 12px;text-align:left;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Notes</th>
          <th style="padding:6px 12px;text-align:right;font-size:11px;letter-spacing:0.8px;text-transform:uppercase;color:#888">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${paymentRows}
        <tr>
          <td colspan="3" style="padding:8px 12px;text-align:right;font-size:12px;color:#888;border-top:2px solid #ddd">Total received</td>
          <td style="padding:8px 12px;text-align:right;font-size:13px;font-family:monospace;font-weight:700;color:#16a34a;border-top:2px solid #ddd">${fmt(totalReceived)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Balance -->
  <div style="display:flex;justify-content:flex-end;margin-top:20px">
    <div style="min-width:280px">
      <div style="display:flex;justify-content:space-between;padding:14px;background:${balanceOutstanding > 0 ? '#fef3c7' : '#f0fdf4'};border-radius:8px">
        <span style="font-weight:700;font-size:15px;color:${balanceOutstanding > 0 ? '#92400e' : '#166534'}">${balanceOutstanding > 0 ? 'Balance Outstanding' : 'Balance Settled'}</span>
        <span style="font-family:monospace;font-size:18px;font-weight:700;color:${balanceOutstanding > 0 ? '#92400e' : '#166534'}">${fmt(Math.abs(balanceOutstanding))}</span>
      </div>
    </div>
  </div>

  <div style="margin-top:32px;padding:16px 20px;border-top:2px solid #eee;font-size:12px;color:#888;line-height:1.6">
    Please check these figures against your own records. If anything doesn't match, get in touch and we'll go through it together.
  </div>

</div>
</body>
</html>`
}
