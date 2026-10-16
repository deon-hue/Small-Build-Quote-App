// Purchase orders for a job: a skip, a portaloo, plant hire, a materials delivery. An order keeps one PO number from the day it is raised to the supplier's
// invoice, so the invoice can be matched back to it. Two ways of paying:
//   * on account (skips, hire, a merchant account): the order is an EXPECTED cost on the job until the invoice is matched, so the job's margin already allows for it;
//   * paid when ordered (materials you pay for at once): a real, paid cost goes on the job when the order is placed.
// The pure parts (the sums, the matching, the wording of the messages) live here so they can be tested; the database calls are at the end.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobCost, JobCostCategory } from './types'

export type OrderStatus = 'draft' | 'ordered' | 'confirmed' | 'delivered' | 'collected' | 'invoiced' | 'cancelled'
export type PayTerms = 'account' | 'on_order'
export type RateBasis = 'fixed' | 'day' | 'week'
export type OrderType = 'skip' | 'portaloo' | 'plant' | 'materials' | 'other'

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Not sent yet', ordered: 'Ordered', confirmed: 'Confirmed by supplier', delivered: 'On site', collected: 'Collected', invoiced: 'Invoiced', cancelled: 'Cancelled',
}

/** What a new order of each kind starts as. Everything can be changed on the form. */
export const ORDER_TYPES: Record<OrderType, { label: string; category: JobCostCategory; payTerms: PayTerms; rateBasis: RateBasis; hire: boolean; example: string }> = {
  skip:      { label: 'Skip hire',          category: 'other',     payTerms: 'account',  rateBasis: 'fixed', hire: true,  example: '8-yard skip (builders\' waste)' },
  portaloo:  { label: 'Portaloo hire',      category: 'other',     payTerms: 'account',  rateBasis: 'week',  hire: true,  example: 'Portaloo, weekly service' },
  plant:     { label: 'Plant hire',         category: 'plant',     payTerms: 'account',  rateBasis: 'week',  hire: true,  example: '3-tonne mini digger with driver' },
  materials: { label: 'Materials delivery', category: 'materials', payTerms: 'on_order', rateBasis: 'fixed', hire: false, example: 'Materials as per list' },
  other:     { label: 'Something else',     category: 'other',     payTerms: 'account',  rateBasis: 'fixed', hire: false, example: '' },
}

export interface JobOrder {
  id: string
  /** the job it is for; empty for a request for a price made before there is a job (a calculator's materials list while pricing a quote) */
  jobId: string
  poNumber: number
  kind: 'order' | 'quote_request'
  orderType: OrderType
  status: OrderStatus
  supplierId?: string
  supplierName: string
  /** the person at the supplier, for "Hi Dave" (the firm's name is not a person's name) */
  supplierContact: string
  supplierEmail: string
  supplierPhone: string
  title: string
  details: string
  costCategory: JobCostCategory
  payTerms: PayTerms
  rateBasis: RateBasis
  /** the price: the whole price when fixed, otherwise per day or per week, ex VAT */
  rate: number
  /** how many days or weeks it is planned for (hire priced by the day or week) */
  plannedUnits: number
  deliveryDate: string
  deliverySlot: string
  offHireDate: string
  expectedInvoice: string
  siteAddress: string
  siteContact: string
  sitePhone: string
  accessNotes: string
  sentAt?: string
  sentVia: string
  paidCostId?: string
  invoicedCostId?: string
  createdAt?: string
  /** where a request came from, e.g. the calculator and quote its materials list was made in (supabase/job-orders-materials.sql) */
  sourceLabel?: string
  /** the items a request asks to be priced one by one (a calculator's materials list); empty when it asks for one price (supabase/job-orders-lines.sql) */
  items?: OrderItem[]
  /** when it was deleted; set means it sits in Recently deleted and is left out of every list, reminder and total (supabase/job-orders-deleted.sql) */
  deletedAt?: string
  /** when a request that had already been sent was last changed, so suppliers can be sent the amended version (supabase/job-orders-amend.sql) */
  amendedAt?: string
  /** the supplier's own reference for the quote this order came from, so it can be quoted back to them (supabase/job-orders-amend.sql) */
  supplierRef?: string
}

/** One thing to be priced on a request: how many, of what. Never carries our own price. */
export interface OrderItem { id: string; name: string; qty: number; unit: string }
/** A supplier's answer for one item: a unit price ex VAT, or that they cannot supply it, with an optional note ("can do the 7N block instead"). */
export interface QuoteLine { id: string; unitPrice: number | null; unavailable: boolean; note: string }

/**
 * One supplier a quote request was sent to, with its own secret link (supabase/job-orders-quotes.sql). The supplier opens the link, no login, and gives a price, a delivery date and
 * how long the price stands, or says they cannot do it. The builder compares the replies and approves one: the request then becomes an order with the same PO number.
 */
export type QuoteStatus = 'invited' | 'replied' | 'declined' | 'chosen' | 'not_chosen'
export interface OrderQuote {
  id: string
  orderId: string
  token: string
  supplierId?: string
  supplierName: string
  supplierContact: string
  supplierEmail: string
  supplierPhone: string
  status: QuoteStatus
  sentAt?: string
  sentVia: string
  viewedAt?: string
  /** their price, ex VAT: the whole price when fixed, otherwise per day or per week */
  price: number | null
  rateBasis: RateBasis
  deliveryDate: string
  validUntil: string
  notes: string
  repliedAt?: string
  /** their price for each item, when the request listed items */
  lines: QuoteLine[]
  /** delivery charge ex VAT, added to the items */
  deliveryCharge: number
  /** 'form' (their price page), 'email' (their own quote, emailed in) or 'upload' (their quote dropped onto the request) */
  source: 'form' | 'email' | 'upload'
  /** read from their own quote by the app and not yet confirmed by a person */
  needsCheck: boolean
  fileName: string
  hasFile: boolean
  /** the supplier's own quote reference (supabase/job-orders-amend.sql) */
  supplierRef: string
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  invited: 'Waiting for a reply', replied: 'Quoted', declined: 'Cannot do it', chosen: 'Approved', not_chosen: 'Not chosen',
}

export const poRef = (n: number) => `PO-${String(n).padStart(4, '0')}`

const DAY_MS = 86_400_000
const ymd = (s: string) => (s ? new Date(s.slice(0, 10) + 'T12:00:00') : null)
export const addDays = (s: string, n: number): string => {
  const d = ymd(s) ?? new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
export const todayYmd = () => new Date().toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round(((ymd(b)?.getTime() ?? 0) - (ymd(a)?.getTime() ?? 0)) / DAY_MS)
const money = (n: number) => +n.toFixed(2)

/** The units a hire is paid for: planned until it is on site, then the time it has actually been there (or was, once collected), never less than planned while it is still there. */
export function hireUnits(o: Pick<JobOrder, 'rateBasis' | 'plannedUnits' | 'deliveryDate' | 'offHireDate'>, today = todayYmd()): number {
  if (o.rateBasis === 'fixed') return 1
  const planned = o.plannedUnits > 0 ? o.plannedUnits : 1
  if (!o.deliveryDate) return planned
  const asUnits = (days: number) => (o.rateBasis === 'day' ? Math.max(1, days) : Math.max(1, Math.ceil(days / 7)))
  if (o.offHireDate) return asUnits(daysBetween(o.deliveryDate, o.offHireDate) + 1)
  if (today > o.deliveryDate) return Math.max(planned, asUnits(daysBetween(o.deliveryDate, today) + 1))
  return planned
}

/** What the order costs, ex VAT: the price, or the rate times the time it is hired for. */
export function expectedNet(o: Pick<JobOrder, 'rate' | 'rateBasis' | 'plannedUnits' | 'deliveryDate' | 'offHireDate'>, today = todayYmd()): number {
  if (o.rateBasis === 'fixed') return money(o.rate)
  return money(o.rate * hireUnits(o, today))
}

/** Marks an order that stands for an EXPECTED COST entered by hand in the job's Costs window (rent, monthly hire, a fee not invoiced yet): it is never sent to anyone. */
export const EXPECTED_COST_VIA = 'expected cost'
export const isExpectedCost = (o: Pick<JobOrder, 'sentVia'>) => o.sentVia === EXPECTED_COST_VIA

/** Add whole months to a YYYY-MM-DD date, keeping the day where the month has it and using the month's last day where it does not (31 Jan + 1 month = 28 Feb). */
export function addMonthsYmd(ymdStr: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymdStr)
  if (!m) return ''
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + n
  const y = Math.floor(total / 12), mo = total % 12
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
  return `${y}-${String(mo + 1).padStart(2, '0')}-${String(Math.min(Number(m[3]), last)).padStart(2, '0')}`
}

/**
 * The orders that stand for expected costs: one per month for `months` months, the first invoice expected on `firstDate`. Each is placed and on account (so it counts as still to come),
 * a fixed price with no delivery, and carries the marker so the Orders window does not offer to send it. The caller saves them with insertJobOrder, which gives each its PO number.
 */
export function expectedCostOrders(p: { jobId: string; supplier: string; description: string; category: JobCostCategory; netAmount: number; firstDate: string; months: number }): Partial<JobOrder>[] {
  const months = Math.max(1, Math.min(60, Math.floor(p.months) || 1))
  const out: Partial<JobOrder>[] = []
  for (let i = 0; i < months; i++) {
    out.push({
      jobId: p.jobId, kind: 'order', orderType: 'other', status: 'ordered', supplierName: p.supplier.trim() || 'To be confirmed', supplierContact: '', supplierEmail: '', supplierPhone: '',
      title: months > 1 ? `${p.description.trim()} (${i + 1} of ${months})` : p.description.trim(), details: '', costCategory: p.category, payTerms: 'account', rateBasis: 'fixed',
      rate: +p.netAmount.toFixed(2), plannedUnits: 1, deliveryDate: '', deliverySlot: '', offHireDate: '', expectedInvoice: p.firstDate ? addMonthsYmd(p.firstDate, i) : '',
      siteAddress: '', siteContact: '', sitePhone: '', accessNotes: '', sentVia: EXPECTED_COST_VIA,
    })
  }
  return out
}

/** An order that is placed, on account, and not yet invoiced: money the job will owe that no invoice shows yet. */
export function isCommitted(o: Pick<JobOrder, 'payTerms' | 'status' | 'kind'>): boolean {
  return o.kind === 'order' && o.payTerms === 'account' && (o.status === 'ordered' || o.status === 'confirmed' || o.status === 'delivered' || o.status === 'collected')
}

export interface CommittedTotals { labour: number; materials: number; plant: number; subcontractors: number; other: number; total: number }
export function committedTotals(orders: JobOrder[], today = todayYmd()): CommittedTotals {
  const t: CommittedTotals = { labour: 0, materials: 0, plant: 0, subcontractors: 0, other: 0, total: 0 }
  for (const o of orders) {
    if (!isCommitted(o)) continue
    const n = expectedNet(o, today)
    t[o.costCategory] += n
    t.total += n
  }
  for (const k of Object.keys(t) as (keyof CommittedTotals)[]) t[k] = money(t[k])
  return t
}

/** Hire still on site that has stayed longer than planned, for the amber warning. */
export function overrunNote(o: JobOrder, today = todayYmd()): string | null {
  if (!isCommitted(o) || o.status !== 'delivered' || o.offHireDate || !o.deliveryDate || today <= o.deliveryDate) return null
  const days = daysBetween(o.deliveryDate, today)
  const planned = o.plannedUnits > 0 ? o.plannedUnits : 1
  const plannedDays = o.rateBasis === 'week' ? planned * 7 : o.rateBasis === 'day' ? planned : 14
  return days > plannedDays ? `On site ${days} days (planned ${plannedDays}). Still to be collected?` : null
}

// ── Matching an invoice to an order ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/\b(ltd|limited|plc|llp|co|company|uk|services|hire)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim()

export const sameSupplier = (a: string, b: string): boolean => {
  const x = norm(a), y = norm(b)
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

/** Does the text mention this PO number ("PO-0142", "PO 142", "po0142")? */
export function mentionsPo(text: string, poNumber: number): boolean {
  const re = new RegExp(`\\bpo[\\s\\-#:]*0*${poNumber}\\b`, 'i')
  return re.test(text || '')
}

export interface OrderMatch { order: JobOrder; cost: JobCost; /** the invoice names the PO number */ strong: boolean }

/**
 * Real costs on the job that look like the invoice for an order still waiting for one: the same supplier, entered after the order was raised, not already used by another order;
 * or a cost that names the order's PO number (whoever the supplier is). The estimator confirms each: nothing is matched on its own.
 */
export function matchSuggestions(orders: JobOrder[], costs: JobCost[]): OrderMatch[] {
  const taken = new Set(orders.map(o => o.invoicedCostId || o.paidCostId).filter(Boolean) as string[])
  const out: OrderMatch[] = []
  for (const o of orders) {
    if (!isCommitted(o)) continue
    for (const c of costs) {
      if (c.source === 'timesheet' || taken.has(c.id)) continue
      const text = `${c.docNumber} ${c.description}`
      const strong = mentionsPo(text, o.poNumber)
      const later = !o.createdAt || !c.createdAt || c.createdAt >= o.createdAt
      if (strong || (later && sameSupplier(c.supplier, o.supplierName))) out.push({ order: o, cost: c, strong })
    }
  }
  return out.sort((a, b) => Number(b.strong) - Number(a.strong))
}

// ── Wording of the messages ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const longDate = (s: string) => (s ? ymd(s)!.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '')
const shortDate = (s: string) => (s ? ymd(s)!.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '')

export interface OrderWording { poRef: string; title: string; when: string; where: string; collect: string; details: string; contact: string; priceLine: string; theirRef: string; account: string }

export function orderWording(o: JobOrder, account = ''): OrderWording {
  const when = [longDate(o.deliveryDate), o.deliverySlot].filter(Boolean).join(', ')
  const priceLine = o.rate > 0
    ? o.rateBasis === 'fixed' ? `Agreed price £${o.rate.toFixed(2)} + VAT` : `Agreed rate £${o.rate.toFixed(2)} + VAT per ${o.rateBasis}`
    : ''
  return {
    poRef: poRef(o.poNumber), title: o.title || ORDER_TYPES[o.orderType].label, when, where: o.siteAddress,
    collect: o.offHireDate ? longDate(o.offHireDate) : '', details: requestDetails(o),
    contact: [o.siteContact, o.sitePhone].filter(Boolean).join(', '), priceLine, theirRef: (o.supplierRef || '').trim(), account: account.trim(),
  }
}

/** The title and its detail as message lines: a short detail goes in brackets after the title, a list (one item per line, from a calculator) goes underneath, cut short for a message. */
export function titleAndDetails(title: string, details: string, maxLines = 25): string[] {
  const d = (details || '').trim()
  if (!d) return [title]
  if (!d.includes('\n')) return [`${title} (${d.replace(/\s+/g, ' ')})`]
  const lines = d.split('\n').map(l => l.trimEnd())
  const shown = lines.slice(0, maxLines)
  const more = lines.filter(l => l.trim()).length - shown.filter(l => l.trim()).length
  return [title, ...shown, ...(more > 0 ? [`…and ${more} more lines`] : [])]
}

const firstName = (s: string) => (s.trim().split(/\s+/)[0] || '').replace(/[^A-Za-z'’-]/g, '')

/** The WhatsApp / plain-text version of an order, written the way you would say it. */
export function orderWhatsAppText(o: JobOrder, sender: { name: string; company: string }, account = ''): string {
  const w = orderWording(o, account)
  const who = firstName(o.supplierContact)
  const hi = who ? `Hi ${who}, ` : 'Hi, '
  const body = [
    ...titleAndDetails(w.title, requestDetails(o)),
    w.when ? `Deliver: ${w.when}` : '',
    w.where ? `To: ${w.where}` : '',
    w.collect ? `Collect: ${w.collect}` : '',
    w.contact ? `Site contact: ${w.contact}` : '',
    o.accessNotes ? `Access: ${o.accessNotes}` : '',
    w.priceLine,
    w.theirRef ? `Your quote ref: ${w.theirRef}` : '',
    w.account ? `Our account with you: ${w.account}` : '',
  ].filter(Boolean)
  return [
    `${hi}it's ${sender.name || 'the team'} at ${sender.company}. Order ${w.poRef}:`,
    '',
    ...body,
    '',
    `Please quote ${w.poRef} on your invoice, and reply to confirm. Thanks!`,
  ].join('\n')
}

/** A wa.me link for a UK (or international) number, with the message ready to send. null if there is no usable number. */
export function waLink(phone: string, text: string): string | null {
  let n = (phone || '').replace(/[^\d+]/g, '')
  if (!n) return null
  if (n.startsWith('+')) n = n.slice(1)
  else if (n.startsWith('00')) n = n.slice(2)
  else if (n.startsWith('0')) n = '44' + n.slice(1)
  if (n.length < 9) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

export const orderDateLabel = shortDate

// ── Quote requests ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Where the job is, without the door: a supplier asked for a quote sees the area, not the street, until a quote is accepted.
 * "107 Slough Road, Tooting, SW17 0AB" becomes "Tooting, SW17". A single-line address is cut to its postcode area if it has one.
 */
export function areaOnly(address: string): string {
  const POST = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/gi
  const parts = (address || '').split(/[,\n]/).map(p => p.trim()).filter(Boolean).map(p => p.replace(POST, '$1'))
  if (parts.length === 0) return ''
  if (parts.length === 1) { const m = /\b[A-Z]{1,2}\d[A-Z\d]?\b/i.exec(parts[0]); return m ? m[0].toUpperCase() : '' }
  // leave out the house and street lines (a house number, or a street word), and with three or more lines always the first; a bare area such as "Tooting, SW17" is kept whole
  const POSTCODE_AREA = /^[A-Z]{1,2}\d[A-Z\d]?$/i
  const STREET = /\b(road|rd|street|st|avenue|ave|lane|ln|close|drive|dr|way|court|ct|gardens|gdns|crescent|place|terrace|grove|mews|hill|park|row|walk|flat|apartment|house)\b/i
  const streety = (p: string) => !POSTCODE_AREA.test(p) && (/\d/.test(p) || STREET.test(p))
  let i = 0
  while (i < parts.length - 1 && streety(parts[i])) i++
  if (i === 0 && parts.length >= 3) i = 1
  return parts.slice(i).join(', ')
}

/** What a supplier's price comes to for this request: the price, or the rate times the planned time. Ex VAT. */
export function quoteNet(q: Pick<OrderQuote, 'price' | 'rateBasis'>, plannedUnits: number): number {
  if (q.price === null || q.price === undefined) return 0
  return expectedNet({ rate: q.price, rateBasis: q.rateBasis, plannedUnits, deliveryDate: '', offHireDate: '' })
}

/** The quote that is cheapest (by what it comes to), among the ones that carry a price. */
export function cheapestQuoteId(quotes: OrderQuote[], plannedUnits: number, items: OrderItem[] = []): string | null {
  // with a list of items, only an answer that prices every item is fairly compared: one that left things out is always cheaper
  const priced = quotes.filter(q => q.status === 'replied' && q.price !== null && (items.length === 0 || q.lines.length === 0 || pricedQuote(items, q.lines, q.deliveryCharge).priced === items.length))
  if (priced.length < 2) return null
  return priced.reduce((a, b) => (quoteNet(b, plannedUnits) < quoteNet(a, plannedUnits) ? b : a)).id
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** One item's price from a supplier: quantity x unit price. null if they have not priced it or cannot supply it. */
export function lineTotal(item: OrderItem, line: QuoteLine | undefined): number | null {
  if (!line || line.unavailable || line.unitPrice === null || !(line.unitPrice >= 0)) return null
  return round2(item.qty * line.unitPrice)
}

/** A supplier's whole answer to a list: the items they priced, plus delivery. `priced` of `count` says how many items they covered. */
export function pricedQuote(items: OrderItem[], lines: QuoteLine[], delivery = 0): { total: number; priced: number; count: number } {
  let sum = 0
  let priced = 0
  for (const it of items) {
    const t = lineTotal(it, lines.find(l => l.id === it.id))
    if (t !== null) { sum += t; priced++ }
  }
  return { total: round2(sum + (delivery > 0 ? delivery : 0)), priced, count: items.length }
}

/** What it would come to buying every item from whoever is cheapest for it, ex VAT and before delivery: just for information, an order goes to one supplier. */
export function cheapestMix(items: OrderItem[], quotes: OrderQuote[]): { total: number; covered: number } {
  let total = 0
  let covered = 0
  for (const it of items) {
    const all = quotes.filter(q => q.status === 'replied').map(q => lineTotal(it, q.lines.find(l => l.id === it.id))).filter((x): x is number => x !== null)
    if (all.length) { total += Math.min(...all); covered++ }
  }
  return { total: round2(total), covered }
}

export const quoteLink = (base: string, token: string) => `${base.replace(/\/$/, '')}/supplier-quote/${token}`

/** The message asking for a quote, for WhatsApp, a text or the plain part of an email. Shows the area only. */
export function quoteRequestText(o: JobOrder, q: Pick<OrderQuote, 'supplierContact'>, link: string, sender: { name: string; company: string }, inboxEmail = '', amended = false, account = ''): string {
  const who = firstName(q.supplierContact)
  const hi = who ? `Hi ${who}, ` : 'Hi, '
  const area = areaOnly(o.siteAddress)
  const body = [
    ...titleAndDetails(o.title, requestDetails(o)),
    o.deliveryDate ? `Needed: ${longDate(o.deliveryDate)}${o.deliverySlot ? ', ' + o.deliverySlot : ''}` : '',
    o.offHireDate ? `Collect: ${longDate(o.offHireDate)}` : '',
    area ? `Where: ${area}` : '',
    account ? `Our account with you: ${account}` : '',
  ].filter(Boolean)
  return [
    amended
      ? `${hi}it's ${sender.name || 'the team'} at ${sender.company}. We have changed our price request ${poRef(o.poNumber)}, so please check it below and update your price if it changes.`
      : `${hi}it's ${sender.name || 'the team'} at ${sender.company}. Could you give me a price for this? Ref ${poRef(o.poNumber)}`,
    '',
    ...body,
    '',
    `Put your price in here, it takes a minute (no login): ${link}`,
    inboxEmail ? `Or, if you would rather use your own quoting system, email your quote as a PDF attachment (not pasted into the email, and not a link) to ${inboxEmail} with ${poRef(o.poNumber)} on it and we will match it up. Thanks!` : 'Or just reply with your price and earliest date. Thanks!',
  ].join('\n')
}

// ── Database ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const d10 = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '')

export function rowToOrder(r: Record<string, unknown>): JobOrder {
  return {
    id: r.id as string, jobId: (r.job_id as string) || '', poNumber: Number(r.po_number) || 0,
    kind: (r.kind as JobOrder['kind']) ?? 'order', orderType: (r.order_type as OrderType) ?? 'other', status: (r.status as OrderStatus) ?? 'draft',
    supplierId: (r.supplier_id as string) || undefined, supplierName: str(r.supplier_name), supplierContact: str(r.supplier_contact), supplierEmail: str(r.supplier_email), supplierPhone: str(r.supplier_phone),
    title: str(r.title), details: str(r.details), costCategory: (r.cost_category as JobCostCategory) ?? 'other',
    payTerms: (r.pay_terms as PayTerms) ?? 'account', rateBasis: (r.rate_basis as RateBasis) ?? 'fixed',
    rate: Number(r.rate) || 0, plannedUnits: Number(r.planned_units) || 1,
    deliveryDate: d10(r.delivery_date), deliverySlot: str(r.delivery_slot), offHireDate: d10(r.off_hire_date), expectedInvoice: d10(r.expected_invoice),
    siteAddress: str(r.site_address), siteContact: str(r.site_contact), sitePhone: str(r.site_phone), accessNotes: str(r.access_notes),
    sentAt: (r.sent_at as string) || undefined, sentVia: str(r.sent_via),
    paidCostId: (r.paid_cost_id as string) || undefined, invoicedCostId: (r.invoiced_cost_id as string) || undefined,
    createdAt: r.created_at as string | undefined, sourceLabel: str(r.source_label), deletedAt: (r.deleted_at as string) || undefined,
    amendedAt: (r.amended_at as string) || undefined, supplierRef: str(r.supplier_ref),
    items: parseItems(r.items),
  }
}

function orderToRow(o: Partial<JobOrder>) {
  const row: Record<string, unknown> = {}
  const map: [keyof JobOrder, string][] = [
    ['poNumber', 'po_number'], ['kind', 'kind'], ['orderType', 'order_type'], ['status', 'status'],
    ['supplierName', 'supplier_name'], ['supplierContact', 'supplier_contact'], ['supplierEmail', 'supplier_email'], ['supplierPhone', 'supplier_phone'],
    ['title', 'title'], ['details', 'details'], ['costCategory', 'cost_category'], ['payTerms', 'pay_terms'], ['rateBasis', 'rate_basis'],
    ['rate', 'rate'], ['plannedUnits', 'planned_units'], ['deliverySlot', 'delivery_slot'],
    ['siteAddress', 'site_address'], ['siteContact', 'site_contact'], ['sitePhone', 'site_phone'], ['accessNotes', 'access_notes'], ['sentVia', 'sent_via'],
  ]
  for (const [k, col] of map) if (o[k] !== undefined) row[col] = o[k]
  if (o.jobId !== undefined) row.job_id = o.jobId || null
  // only written when there is one, so a database without the column (supabase/job-orders-materials.sql not run) keeps working for every ordinary order
  if (o.sourceLabel) row.source_label = o.sourceLabel
  if (o.amendedAt) row.amended_at = o.amendedAt
  if (o.supplierRef) row.supplier_ref = o.supplierRef
  if (o.items && o.items.length) row.items = o.items
  if (o.supplierId !== undefined) row.supplier_id = o.supplierId || null
  if (o.deliveryDate !== undefined) row.delivery_date = o.deliveryDate || null
  if (o.offHireDate !== undefined) row.off_hire_date = o.offHireDate || null
  if (o.expectedInvoice !== undefined) row.expected_invoice = o.expectedInvoice || null
  if (o.sentAt !== undefined) row.sent_at = o.sentAt || null
  if (o.paidCostId !== undefined) row.paid_cost_id = o.paidCostId || null
  if (o.invoicedCostId !== undefined) row.invoiced_cost_id = o.invoicedCostId || null
  return row
}

function parseItems(v: unknown): OrderItem[] {
  if (!Array.isArray(v)) return []
  return v.filter(x => x && typeof x === 'object').map((x, i) => {
    const r = x as Record<string, unknown>
    return { id: typeof r.id === 'string' && r.id ? r.id : `it-${i}`, name: str(r.name), qty: Number(r.qty) || 0, unit: str(r.unit) }
  })
}
function parseLines(v: unknown): QuoteLine[] {
  if (!Array.isArray(v)) return []
  return v.filter(x => x && typeof x === 'object').map(x => {
    const r = x as Record<string, unknown>
    const p = r.unitPrice === null || r.unitPrice === undefined || r.unitPrice === '' ? null : Number(r.unitPrice)
    return { id: str(r.id), unitPrice: p !== null && Number.isFinite(p) ? p : null, unavailable: !!r.unavailable, note: str(r.note) }
  })
}

export function rowToQuote(r: Record<string, unknown>): OrderQuote {
  return {
    id: r.id as string, orderId: r.order_id as string, token: str(r.token),
    supplierId: (r.supplier_id as string) || undefined, supplierName: str(r.supplier_name), supplierContact: str(r.supplier_contact), supplierEmail: str(r.supplier_email), supplierPhone: str(r.supplier_phone),
    status: (r.status as QuoteStatus) ?? 'invited', sentAt: (r.sent_at as string) || undefined, sentVia: str(r.sent_via), viewedAt: (r.viewed_at as string) || undefined,
    price: r.price === null || r.price === undefined ? null : Number(r.price), rateBasis: (r.rate_basis as RateBasis) ?? 'fixed',
    deliveryDate: d10(r.delivery_date), validUntil: d10(r.valid_until), notes: str(r.notes), repliedAt: (r.replied_at as string) || undefined,
    lines: parseLines(r.lines), deliveryCharge: Number(r.delivery_charge) || 0,
    source: r.source === 'email' || r.source === 'upload' ? r.source : 'form', needsCheck: !!r.needs_check, fileName: str(r.file_name), hasFile: !!str(r.file_path), supplierRef: str(r.supplier_ref),
  }
}

/** The quote replies for some requests. An unset table (job-orders-quotes.sql not run) just gives none. */
export async function fetchOrderQuotes(sb: SupabaseClient, orderIds: string[]): Promise<OrderQuote[]> {
  if (orderIds.length === 0) return []
  const { data, error } = await sb.from('job_order_quotes').select('*').in('order_id', orderIds).order('created_at', { ascending: true })
  if (error) return []
  return (data ?? []).map(rowToQuote)
}

export interface QuoteInvitee { supplierId?: string; supplierName: string; supplierContact: string; supplierEmail: string; supplierPhone: string }

export async function insertOrderQuotes(sb: SupabaseClient, ownerId: string, orderId: string, who: QuoteInvitee[]): Promise<{ ok: boolean; error?: string }> {
  if (who.length === 0) return { ok: true }
  const rows = who.map(w => ({
    user_id: ownerId, order_id: orderId, supplier_id: w.supplierId || null, supplier_name: w.supplierName, supplier_contact: w.supplierContact,
    supplier_email: w.supplierEmail, supplier_phone: w.supplierPhone,
  }))
  const { error } = await sb.from('job_order_quotes').insert(rows)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export async function updateOrderQuote(sb: SupabaseClient, id: string, p: Partial<Pick<OrderQuote, 'status' | 'sentAt' | 'sentVia' | 'supplierName' | 'supplierContact' | 'supplierEmail' | 'supplierPhone' | 'supplierRef'>>): Promise<boolean> {
  const row: Record<string, unknown> = {}
  if (p.status !== undefined) row.status = p.status
  if (p.sentAt !== undefined) row.sent_at = p.sentAt || null
  if (p.sentVia !== undefined) row.sent_via = p.sentVia
  if (p.supplierName !== undefined) row.supplier_name = p.supplierName
  if (p.supplierContact !== undefined) row.supplier_contact = p.supplierContact
  if (p.supplierEmail !== undefined) row.supplier_email = p.supplierEmail
  if (p.supplierPhone !== undefined) row.supplier_phone = p.supplierPhone
  if (p.supplierRef !== undefined) row.supplier_ref = p.supplierRef
  const { error } = await sb.from('job_order_quotes').update(row).eq('id', id)
  return !error
}

/** Has a request that was already sent been changed in a way a supplier would care about? (the wording, the items, when, where or how it is priced) */
export function requestChanged(prev: JobOrder, next: Partial<JobOrder>): boolean {
  const key = (o: Partial<JobOrder>) => JSON.stringify([o.title ?? '', o.details ?? '', (o.items ?? []).map(i => [i.name, i.qty, i.unit]), o.deliveryDate ?? '', o.deliverySlot ?? '', o.offHireDate ?? '', areaOnly(o.siteAddress ?? ''), o.rateBasis ?? 'fixed', o.plannedUnits ?? 1])
  return key(prev) !== key({ ...prev, ...next })
}

/** Was this request changed after the supplier was last sent it (or after they answered it)? */
export function amendedSince(o: Pick<JobOrder, 'amendedAt'>, since?: string): boolean {
  return !!o.amendedAt && !!since && Date.parse(o.amendedAt) > Date.parse(since)
}

export async function deleteOrderQuote(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('job_order_quotes').delete().eq('id', id)
}

/** The orders for a job. `missing` is true when the table has not been created yet (supabase/job-orders.sql not run). */
export async function fetchJobOrders(sb: SupabaseClient, jobId: string | null): Promise<{ orders: JobOrder[]; missing: boolean }> {
  // null: the requests for a price that are not for a job yet
  const base = sb.from('job_orders').select('*')
  const { data, error } = await (jobId === null ? base.is('job_id', null) : base.eq('job_id', jobId)).order('po_number', { ascending: false })
  if (error) {
    const missing = /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
    return { orders: [], missing }
  }
  return { orders: (data ?? []).map(rowToOrder).filter(o => !o.deletedAt), missing: false }
}

/** The deleted requests and orders (newest deletion first), for the Recently deleted list. Empty until supabase/job-orders-deleted.sql has been run. */
export async function fetchDeletedOrders(sb: SupabaseClient, jobId: string | null): Promise<JobOrder[]> {
  const base = sb.from('job_orders').select('*')
  const { data, error } = await (jobId === null ? base.is('job_id', null) : base.eq('job_id', jobId))
  if (error) return []
  return (data ?? []).map(rowToOrder).filter(o => o.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
}

/** The next PO number for this company (one running count across every job). */
export async function nextPoNumber(sb: SupabaseClient, ownerId: string): Promise<number> {
  const { data } = await sb.from('job_orders').select('po_number').eq('user_id', ownerId).order('po_number', { ascending: false }).limit(1)
  return ((data?.[0]?.po_number as number | undefined) ?? 0) + 1
}

/**
 * A column added by a later SQL file (items, source_label) that this database does not have yet. Rather than refuse to save, the order is saved without it, with the list of items
 * written into the details instead (one price for the whole list, as before): the screen says so, and per-item pricing starts once the SQL file has been run.
 */
const LATER_COLUMN_MISSING = /could not find the '(items|source_label)' column/i
const AMEND_COLUMN_MISSING = /could not find the '(amended_at|supplier_ref)' column/i
const withoutLaterColumns = (o: Partial<JobOrder>): Partial<JobOrder> => ({ ...o, details: o.details !== undefined || o.items ? requestDetails({ details: o.details ?? '', items: o.items }) : o.details, items: undefined, sourceLabel: undefined })

export async function insertJobOrder(sb: SupabaseClient, ownerId: string, o: Partial<JobOrder>): Promise<{ order: JobOrder | null; error?: string; degraded?: boolean }> {
  let cur = o
  let degraded = false
  for (let attempt = 0; attempt < 4; attempt++) {
    const poNumber = await nextPoNumber(sb, ownerId)
    const { data, error } = await sb.from('job_orders').insert({ ...orderToRow({ ...cur, poNumber }), user_id: ownerId }).select().single()
    if (data) return { order: rowToOrder(data), degraded }
    const msg = `${error?.code ?? ''} ${error?.message ?? ''}`
    if (!degraded && LATER_COLUMN_MISSING.test(msg)) { cur = withoutLaterColumns(cur); degraded = true; continue }
    // two orders raised at the same moment can pick the same number: try the next one
    if (!/duplicate|unique|23505/i.test(msg)) return { order: null, error: error?.message }
  }
  return { order: null, error: 'Could not get a free PO number. Try again.' }
}

export async function updateJobOrder(sb: SupabaseClient, id: string, o: Partial<JobOrder>): Promise<JobOrder | null> {
  let { data, error } = await sb.from('job_orders').update({ ...orderToRow(o), updated_at: new Date().toISOString() }).eq('id', id).select().single()
  if (!data && LATER_COLUMN_MISSING.test(error?.message ?? '')) {
    ;({ data } = await sb.from('job_orders').update({ ...orderToRow(withoutLaterColumns(o)), updated_at: new Date().toISOString() }).eq('id', id).select().single())
  } else if (!data && AMEND_COLUMN_MISSING.test(error?.message ?? '')) {
    // supabase/job-orders-amend.sql has not been run: save everything else (the amended mark and the supplier's reference simply are not kept)
    const row = orderToRow(o); delete row.amended_at; delete row.supplier_ref
    ;({ data } = await sb.from('job_orders').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().single())
  }
  return data ? rowToOrder(data) : null
}

/**
 * Deleting moves it to Recently deleted (it is only marked, so its suppliers and their replies stay with it and it can be restored).
 * If the database has not had supabase/job-orders-deleted.sql run, nothing is deleted: 'needs-sql'.
 */
export async function deleteJobOrder(sb: SupabaseClient, id: string): Promise<'trash' | 'needs-sql' | 'error'> {
  const { error } = await sb.from('job_orders').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (!error) return 'trash'
  return /deleted_at/i.test(error.message ?? '') ? 'needs-sql' : 'error'
}

export async function restoreJobOrder(sb: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await sb.from('job_orders').update({ deleted_at: null }).eq('id', id)
  return !error
}

/** Delete forever: the request and, with it, its suppliers and their replies. Only offered from Recently deleted. */
export async function purgeJobOrder(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('job_orders').delete().eq('id', id)
}

// ── What needs your attention (the dashboard) ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type ReminderKind = 'confirm' | 'replies' | 'match' | 'delivery_late' | 'invoice_late' | 'overrun'
export interface OrderReminder { kind: ReminderKind; order: JobOrder; text: string; days?: number }

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * The things about orders that someone should look at today, most pressing first:
 *   confirm       a price was approved but the supplier has not been sent the order;
 *   replies       suppliers have answered a request for a price and nobody has chosen;
 *   match         a cost on the job looks like the invoice for an order (the margin counts both until matched);
 *   delivery_late the delivery date has passed and nobody has said it arrived;
 *   invoice_late  the invoice was expected by now and has not turned up;
 *   overrun       hire still on site longer than planned.
 * `repliesByOrder` is how many suppliers have replied, per request. Nothing here changes anything: it only says what to look at.
 */
export function orderReminders(orders: JobOrder[], costs: JobCost[], repliesByOrder: Record<string, number> = {}, today = todayYmd()): OrderReminder[] {
  const out: OrderReminder[] = []
  const matches = matchSuggestions(orders, costs)
  const matched = new Set(matches.map(m => m.order.id))
  for (const o of orders) {
    const po = poRef(o.poNumber)
    if (o.kind === 'quote_request') {
      const n = repliesByOrder[o.id] ?? 0
      if (o.status !== 'cancelled' && n > 0) out.push({ kind: 'replies', order: o, text: `${plural(n, 'supplier')} replied to the price request ${po} (${o.title}). Compare and approve one.` })
      continue
    }
    if (o.status === 'cancelled' || o.status === 'invoiced') continue
    if (o.sentVia === 'quote accepted' && !o.sentAt) out.push({ kind: 'confirm', order: o, text: `You approved ${o.supplierName} for ${po} (${o.title}) but have not sent them the order yet.` })
    if (!isCommitted(o)) continue
    const net = expectedNet(o, today)
    if ((o.status === 'ordered' || o.status === 'confirmed') && o.deliveryDate && o.deliveryDate < today) {
      const d = daysBetween(o.deliveryDate, today)
      out.push({ kind: 'delivery_late', order: o, days: d, text: `${o.title} from ${o.supplierName} (${po}) was due ${d === 1 ? 'yesterday' : `${d} days ago`}. Has it arrived?` })
    }
    const stillOnSite = o.rateBasis !== 'fixed' && o.status === 'delivered' && !o.offHireDate
    if (!matched.has(o.id) && !stillOnSite && o.payTerms === 'account' && o.expectedInvoice && o.expectedInvoice < today) {
      const d = daysBetween(o.expectedInvoice, today)
      out.push({ kind: 'invoice_late', order: o, days: d, text: `The invoice from ${o.supplierName} for ${po} (${o.title}, about ${gbp(net)}) was expected ${d === 1 ? 'yesterday' : `${d} days ago`}. Chase it, or record it if it has come.` })
    }
    const over = overrunNote(o, today)
    if (over) out.push({ kind: 'overrun', order: o, text: `${o.title} from ${o.supplierName} (${po}): ${over}` })
  }
  for (const m of matches) {
    const c = m.cost
    out.push({ kind: 'match', order: m.order, text: `${c.supplier}${c.docNumber ? ` invoice ${c.docNumber}` : ' cost'} of ${gbp(c.netAmount)} ${m.strong ? 'names' : 'looks like it could be for'} ${poRef(m.order.poNumber)} (${m.order.title}). Match them so the margin does not count both.` })
  }
  const rank: Record<ReminderKind, number> = { confirm: 0, replies: 1, match: 2, delivery_late: 3, invoice_late: 4, overrun: 5 }
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || (b.days ?? 0) - (a.days ?? 0))
}

/** Every order of the company, and how many suppliers have replied to each request for a price. Quiet if the tables are not there yet. */
export async function fetchAllJobOrders(sb: SupabaseClient): Promise<{ orders: JobOrder[]; repliesByOrder: Record<string, number> }> {
  const { data, error } = await sb.from('job_orders').select('*')
  if (error) return { orders: [], repliesByOrder: {} }
  const orders = (data ?? []).map(rowToOrder).filter(o => !o.deletedAt)
  const repliesByOrder: Record<string, number> = {}
  const reqIds = orders.filter(o => o.kind === 'quote_request' && o.status !== 'cancelled').map(o => o.id)
  if (reqIds.length) {
    const { data: qs } = await sb.from('job_order_quotes').select('order_id').eq('status', 'replied').in('order_id', reqIds)
    for (const q of qs ?? []) repliesByOrder[q.order_id as string] = (repliesByOrder[q.order_id as string] ?? 0) + 1
  }
  return { orders, repliesByOrder }
}

// ── Deliveries on the calendar ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface DeliveryMarker {
  id: string
  order: JobOrder
  /** a delivery to site, or the collection / off-hire of hired kit */
  kind: 'delivery' | 'collect'
  /** the day, as YYYY-MM-DD */
  date: string
  /** already happened (marked delivered, or collected) */
  done: boolean
  /** the order has not been sent to the supplier yet */
  tentative: boolean
}

/**
 * The dates to put on the calendar: each order's delivery day, and the collection day of skips, portaloos and plant. Requests for a price, cancelled orders and ones already
 * invoiced are left out. An order not sent yet is still shown, marked tentative, so a planned skip is not forgotten.
 */
export function deliveryMarkers(orders: JobOrder[]): DeliveryMarker[] {
  const out: DeliveryMarker[] = []
  for (const o of orders) {
    if (o.kind !== 'order' || o.status === 'cancelled' || o.status === 'invoiced') continue
    const tentative = o.status === 'draft' || (o.sentVia === 'quote accepted' && !o.sentAt)
    if (o.deliveryDate) out.push({ id: `${o.id}-d`, order: o, kind: 'delivery', date: o.deliveryDate, done: o.status === 'delivered' || o.status === 'collected', tentative })
    if (o.offHireDate && ORDER_TYPES[o.orderType]?.hire) out.push({ id: `${o.id}-c`, order: o, kind: 'collect', date: o.offHireDate, done: o.status === 'collected', tentative })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.order.poNumber - b.order.poNumber || (a.kind === 'delivery' ? -1 : 1))
}

// ── A calculator's materials list, as a request for prices ───────────────────────────────────────────────────────────────────────────────────────

const qtyText = (n: number) => String(+n.toFixed(2))

/**
 * The list a supplier is asked to price: what and how much, never what we expect to pay (our own unit costs and totals are not shared, so nobody prices to them).
 * The quantity is what to buy, waste already allowed for.
 */
export function materialsListText(lines: { name: string; purchaseQty: number; unit: string }[]): string {
  return lines
    .filter(l => l.purchaseQty > 0 && l.name.trim())
    .map(l => `• ${qtyText(l.purchaseQty)} ${l.unit.trim()} — ${l.name.trim()}`.replace(/ {2,}/g, ' '))
    .join('\n')
}

/** The note part of a request's details: what was written before the "Please price" ask and list (requests made earlier carried the list inside their details). */
export function noteOfDetails(details: string): string {
  const d = (details || '').trim()
  const i = d.indexOf('Please price')
  return i < 0 ? d : d.slice(0, i).trim()
}

/**
 * What a supplier is shown as the detail of a request: the note, and, when it lists items, the ask and the items as a list. Built from the items each time, so changing the items
 * changes what is sent. A request made before items were kept separately already has its list written into its details, and is left as it is.
 */
export function requestDetails(o: { details: string; items?: OrderItem[] }): string {
  const items = (o.items ?? []).filter(i => i.name.trim() && i.qty > 0)
  if (items.length === 0 || /^•/m.test(o.details || '')) return o.details || ''
  return materialsRequestDetails(items.map(i => ({ name: i.name, purchaseQty: i.qty, unit: i.unit })), noteOfDetails(o.details))
}

/** The details of a price request for a materials list: an optional note, then the list. */
export function materialsRequestDetails(lines: { name: string; purchaseQty: number; unit: string }[], note = ''): string {
  const list = materialsListText(lines)
  const ask = 'Please price each item below (a unit price, ex VAT, on the link) and any delivery charge; tell us anything you cannot supply or would swap:'
  return [...(note.trim() ? [note.trim(), ''] : []), ask, list].join('\n')
}

// ── Emailed quotes waiting to be assigned ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A supplier's own quote that came in by email but could not be matched to a request and supplier with confidence (supabase/quote-inbox.sql). */
export interface IncomingQuote {
  id: string
  fileName: string
  sourceEmail: string
  subject: string
  reason: string
  suggestedOrderId?: string
  createdAt?: string
  /** what the reader found, for showing next to the file */
  supplier: string
  netTotal: number
}

export async function fetchIncomingQuotes(sb: SupabaseClient): Promise<IncomingQuote[]> {
  const { data, error } = await sb.from('incoming_quotes').select('*').eq('status', 'unmatched').order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []).map(r => {
    const x = (r.extraction ?? {}) as { supplier?: string; netTotal?: number }
    return {
      id: r.id as string, fileName: str(r.file_name), sourceEmail: str(r.source_email), subject: str(r.subject), reason: str(r.reason),
      suggestedOrderId: (r.suggested_order_id as string) || undefined, createdAt: r.created_at as string | undefined,
      supplier: x.supplier ?? '', netTotal: Number(x.netTotal) || 0,
    }
  })
}
