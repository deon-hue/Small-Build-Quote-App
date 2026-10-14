// The words of the morning summary alert: what needs the person, as one short line. Pure, so it can be tested. Returns null when nothing needs them (then no alert is sent).

import type { OrderReminder } from './job-orders'

export function summaryText(reminders: Pick<OrderReminder, 'kind'>[], overdueInvoices: number): { title: string; body: string } | null {
  const n = (k: OrderReminder['kind']) => reminders.filter(r => r.kind === k).length
  const bits: [number, string, string][] = [
    [n('replies'), 'price reply to compare', 'price replies to compare'],
    [n('confirm'), 'approved order to send', 'approved orders to send'],
    [n('delivery_late'), 'late delivery', 'late deliveries'],
    [n('invoice_late'), 'invoice not arrived', 'invoices not arrived'],
    [n('match'), 'invoice to match', 'invoices to match'],
    [n('overrun'), 'hire still on site', 'hire still on site'],
    [overdueInvoices, 'overdue invoice', 'overdue invoices'],
  ]
  const total = bits.reduce((s, b) => s + b[0], 0)
  if (total === 0) return null
  const parts = bits.filter(b => b[0] > 0).map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
  return { title: `${total} thing${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} you today`, body: parts.join(', ') }
}
