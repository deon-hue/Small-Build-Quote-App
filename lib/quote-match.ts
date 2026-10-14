// Matching a supplier's own quote (a PDF or photo they emailed, or that was dropped onto a request) to the price request it answers, and to the supplier who sent it, and turning what
// was read from it into a reply. Pure, so each rule can be tested. Nothing here talks to the database or the AI; lib/quote-inbox.ts does.

import type { OrderItem, QuoteLine } from './job-orders'
import { pricedQuote, sameSupplier } from './job-orders'

/** The PO numbers mentioned in some text: "PO-0004", "PO 4", "P.O. #0004", "po0004". Numbers only, no duplicates. */
export function findPoNumbers(...texts: (string | undefined | null)[]): number[] {
  const found = new Set<number>()
  const re = /\bP\.?\s?O\.?[\s\-#:_]*0*(\d{1,6})(?!\d)/gi
  for (const t of texts) {
    if (!t) continue
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(t)) !== null) { const n = Number(m[1]); if (n > 0) found.add(n) }
  }
  return [...found]
}

export interface OpenRequest { id: string; poNumber: number }

export type RequestMatch =
  | { kind: 'matched'; request: OpenRequest }
  | { kind: 'none' }
  | { kind: 'ambiguous'; requests: OpenRequest[] }

/** Which open request does this quote answer? Exactly one PO number must point at an open request: none or several are left for a person to decide. */
export function matchRequest(poNumbers: number[], open: OpenRequest[]): RequestMatch {
  const hits = open.filter(r => poNumbers.includes(r.poNumber))
  if (hits.length === 1) return { kind: 'matched', request: hits[0] }
  if (hits.length === 0) return { kind: 'none' }
  return { kind: 'ambiguous', requests: hits }
}

export interface Invitee { id: string; supplierName: string; supplierEmail: string }

const FREE_MAIL = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|btinternet|sky|talktalk|aol|protonmail|proton)\./i
const domainOf = (e: string) => (e.split('@')[1] || '').trim().toLowerCase()

/**
 * Which of the suppliers asked sent this? By their email address first (the same address, then the same company domain, but never a shared one like gmail), then by the name on the quote.
 * Only one answer is accepted: if it is not clear, the quote is left for a person to assign.
 */
export function pickInvitee(invitees: Invitee[], fromEmail: string, nameOnQuote: string): Invitee | null {
  const from = (fromEmail || '').trim().toLowerCase()
  const exact = invitees.filter(i => i.supplierEmail && i.supplierEmail.trim().toLowerCase() === from)
  if (exact.length === 1) return exact[0]
  const dom = domainOf(from)
  if (dom && !FREE_MAIL.test(dom)) {
    const same = invitees.filter(i => domainOf(i.supplierEmail) === dom)
    if (same.length === 1) return same[0]
  }
  if (nameOnQuote.trim()) {
    const byName = invitees.filter(i => sameSupplier(i.supplierName, nameOnQuote))
    if (byName.length === 1) return byName[0]
  }
  return invitees.length === 1 && !from ? invitees[0] : null
}

export interface ReadQuoteLine { description: string; qty: number; unit: string; netAmount: number; /** the id of one of the request's items this line prices, when it clearly is one */ itemId: string | null }

export interface QuoteReply {
  mode: 'itemised' | 'total_only'
  price: number
  lines: QuoteLine[]
  deliveryCharge: number
  note: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * What was read from their quote, as a reply. If every item on the request has a line on their quote, the reply is itemised (a unit price for each item, worked back from what they charge for it,
 * plus delivery). If not, or if the items and delivery do not add up to their stated total (within 2%), only their total is kept and it says so: a wrong breakdown would mislead more than none.
 */
export function buildReply(items: OrderItem[], read: { lines: ReadQuoteLine[]; netTotal: number; deliveryCharge: number }): QuoteReply {
  const delivery = read.deliveryCharge > 0 ? round2(read.deliveryCharge) : 0
  const total = round2(read.netTotal)
  const byItem = new Map<string, number>()
  for (const l of read.lines) if (l.itemId && items.some(i => i.id === l.itemId)) byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + (Number(l.netAmount) || 0))
  const allMatched = items.length > 0 && items.every(i => (byItem.get(i.id) ?? 0) > 0)
  if (allMatched) {
    const lines: QuoteLine[] = items.map(i => ({ id: i.id, unitPrice: i.qty > 0 ? Math.round((byItem.get(i.id)! / i.qty) * 1e6) / 1e6 : null, unavailable: false, note: '' }))
    const computed = pricedQuote(items, lines, delivery).total
    if (total <= 0 || Math.abs(computed - total) / total <= 0.02) {
      return { mode: 'itemised', price: total > 0 ? total : computed, lines, deliveryCharge: delivery, note: '' }
    }
    return { mode: 'total_only', price: total, lines: [], deliveryCharge: delivery, note: 'Their quote did not add up to the items we matched, so only their total is shown.' }
  }
  return { mode: 'total_only', price: total, lines: [], deliveryCharge: delivery, note: items.length > 0 ? 'Their quote was not itemised the same way as the request, so only their total is shown.' : '' }
}
