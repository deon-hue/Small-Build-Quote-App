// How an invoice line is shown and sent on. A line can be a PART of a price (a stage payment: "Foundations, 40%"): its total is quantity x unit price x percentage, so anything that
// shows or sends only quantity and unit price (the invoice shown to the client, Xero) would show the whole price instead. This turns such a line into one that says its percentage and
// whose quantity x unit price is exactly the line total.

import type { InvoiceLineItem } from './types'

export interface InvoiceLineView { desc: string; qty: number; unitPrice: number; total: number }

const money = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pctText = (p: number) => String(+p.toFixed(2))

export function invoiceLineView(li: Pick<InvoiceLineItem, 'desc' | 'qty' | 'unitPrice' | 'total' | 'percentage'>): InvoiceLineView {
  const pct = li.percentage ?? 100
  const full = li.qty * li.unitPrice
  // the total the invoice was saved with is what the client was shown and what the invoice adds up to; work it out only if it is missing
  const total = Number.isFinite(li.total) && li.total !== 0 ? li.total : Math.round(full * pct) / 100
  if (pct >= 100) return { desc: li.desc, qty: li.qty, unitPrice: li.unitPrice, total }
  const base = li.desc || 'Works'
  return { desc: `${base} (${pctText(pct)}% of ${money(full)})`, qty: 1, unitPrice: total, total }
}
