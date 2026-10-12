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
  if (!isCommitted(o) || o.status === 'collected' || o.offHireDate || !o.deliveryDate || today <= o.deliveryDate) return null
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

export interface OrderWording { poRef: string; title: string; when: string; where: string; collect: string; details: string; contact: string; priceLine: string }

export function orderWording(o: JobOrder): OrderWording {
  const when = [longDate(o.deliveryDate), o.deliverySlot].filter(Boolean).join(', ')
  const priceLine = o.rate > 0
    ? o.rateBasis === 'fixed' ? `Agreed price £${o.rate.toFixed(2)} + VAT` : `Agreed rate £${o.rate.toFixed(2)} + VAT per ${o.rateBasis}`
    : ''
  return {
    poRef: poRef(o.poNumber), title: o.title || ORDER_TYPES[o.orderType].label, when, where: o.siteAddress,
    collect: o.offHireDate ? longDate(o.offHireDate) : '', details: o.details,
    contact: [o.siteContact, o.sitePhone].filter(Boolean).join(', '), priceLine,
  }
}

const firstName = (s: string) => (s.trim().split(/\s+/)[0] || '').replace(/[^A-Za-z'’-]/g, '')

/** The WhatsApp / plain-text version of an order, written the way you would say it. */
export function orderWhatsAppText(o: JobOrder, sender: { name: string; company: string }): string {
  const w = orderWording(o)
  const who = firstName(o.supplierContact)
  const hi = who ? `Hi ${who}, ` : 'Hi, '
  const body = [
    w.title + (o.details ? ` (${o.details.replace(/\s+/g, ' ').trim()})` : ''),
    w.when ? `Deliver: ${w.when}` : '',
    w.where ? `To: ${w.where}` : '',
    w.collect ? `Collect: ${w.collect}` : '',
    w.contact ? `Site contact: ${w.contact}` : '',
    o.accessNotes ? `Access: ${o.accessNotes}` : '',
    w.priceLine,
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

// ── Database ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const d10 = (v: unknown) => (typeof v === 'string' ? v.slice(0, 10) : '')

export function rowToOrder(r: Record<string, unknown>): JobOrder {
  return {
    id: r.id as string, jobId: r.job_id as string, poNumber: Number(r.po_number) || 0,
    kind: (r.kind as JobOrder['kind']) ?? 'order', orderType: (r.order_type as OrderType) ?? 'other', status: (r.status as OrderStatus) ?? 'draft',
    supplierId: (r.supplier_id as string) || undefined, supplierName: str(r.supplier_name), supplierContact: str(r.supplier_contact), supplierEmail: str(r.supplier_email), supplierPhone: str(r.supplier_phone),
    title: str(r.title), details: str(r.details), costCategory: (r.cost_category as JobCostCategory) ?? 'other',
    payTerms: (r.pay_terms as PayTerms) ?? 'account', rateBasis: (r.rate_basis as RateBasis) ?? 'fixed',
    rate: Number(r.rate) || 0, plannedUnits: Number(r.planned_units) || 1,
    deliveryDate: d10(r.delivery_date), deliverySlot: str(r.delivery_slot), offHireDate: d10(r.off_hire_date), expectedInvoice: d10(r.expected_invoice),
    siteAddress: str(r.site_address), siteContact: str(r.site_contact), sitePhone: str(r.site_phone), accessNotes: str(r.access_notes),
    sentAt: (r.sent_at as string) || undefined, sentVia: str(r.sent_via),
    paidCostId: (r.paid_cost_id as string) || undefined, invoicedCostId: (r.invoiced_cost_id as string) || undefined,
    createdAt: r.created_at as string | undefined,
  }
}

function orderToRow(o: Partial<JobOrder>) {
  const row: Record<string, unknown> = {}
  const map: [keyof JobOrder, string][] = [
    ['jobId', 'job_id'], ['poNumber', 'po_number'], ['kind', 'kind'], ['orderType', 'order_type'], ['status', 'status'],
    ['supplierName', 'supplier_name'], ['supplierContact', 'supplier_contact'], ['supplierEmail', 'supplier_email'], ['supplierPhone', 'supplier_phone'],
    ['title', 'title'], ['details', 'details'], ['costCategory', 'cost_category'], ['payTerms', 'pay_terms'], ['rateBasis', 'rate_basis'],
    ['rate', 'rate'], ['plannedUnits', 'planned_units'], ['deliverySlot', 'delivery_slot'],
    ['siteAddress', 'site_address'], ['siteContact', 'site_contact'], ['sitePhone', 'site_phone'], ['accessNotes', 'access_notes'], ['sentVia', 'sent_via'],
  ]
  for (const [k, col] of map) if (o[k] !== undefined) row[col] = o[k]
  if (o.supplierId !== undefined) row.supplier_id = o.supplierId || null
  if (o.deliveryDate !== undefined) row.delivery_date = o.deliveryDate || null
  if (o.offHireDate !== undefined) row.off_hire_date = o.offHireDate || null
  if (o.expectedInvoice !== undefined) row.expected_invoice = o.expectedInvoice || null
  if (o.sentAt !== undefined) row.sent_at = o.sentAt || null
  if (o.paidCostId !== undefined) row.paid_cost_id = o.paidCostId || null
  if (o.invoicedCostId !== undefined) row.invoiced_cost_id = o.invoicedCostId || null
  return row
}

/** The orders for a job. `missing` is true when the table has not been created yet (supabase/job-orders.sql not run). */
export async function fetchJobOrders(sb: SupabaseClient, jobId: string): Promise<{ orders: JobOrder[]; missing: boolean }> {
  const { data, error } = await sb.from('job_orders').select('*').eq('job_id', jobId).order('po_number', { ascending: false })
  if (error) {
    const missing = /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code ?? ''} ${error.message ?? ''}`)
    return { orders: [], missing }
  }
  return { orders: (data ?? []).map(rowToOrder), missing: false }
}

/** The next PO number for this company (one running count across every job). */
export async function nextPoNumber(sb: SupabaseClient, ownerId: string): Promise<number> {
  const { data } = await sb.from('job_orders').select('po_number').eq('user_id', ownerId).order('po_number', { ascending: false }).limit(1)
  return ((data?.[0]?.po_number as number | undefined) ?? 0) + 1
}

export async function insertJobOrder(sb: SupabaseClient, ownerId: string, o: Partial<JobOrder>): Promise<{ order: JobOrder | null; error?: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const poNumber = await nextPoNumber(sb, ownerId)
    const { data, error } = await sb.from('job_orders').insert({ ...orderToRow({ ...o, poNumber }), user_id: ownerId }).select().single()
    if (data) return { order: rowToOrder(data) }
    // two orders raised at the same moment can pick the same number: try the next one
    if (!/duplicate|unique|23505/i.test(`${error?.code ?? ''} ${error?.message ?? ''}`)) return { order: null, error: error?.message }
  }
  return { order: null, error: 'Could not get a free PO number. Try again.' }
}

export async function updateJobOrder(sb: SupabaseClient, id: string, o: Partial<JobOrder>): Promise<JobOrder | null> {
  const { data } = await sb.from('job_orders').update({ ...orderToRow(o), updated_at: new Date().toISOString() }).eq('id', id).select().single()
  return data ? rowToOrder(data) : null
}

export async function deleteJobOrder(sb: SupabaseClient, id: string): Promise<void> {
  await sb.from('job_orders').delete().eq('id', id)
}
