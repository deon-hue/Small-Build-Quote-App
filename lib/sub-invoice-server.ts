// The server half of the subcontractor's own invoice (lib/sub-invoice.ts has the rules, lib/sub-invoice-pdf.ts the drawing): who a signed-in subcontractor is, their saved details and logo,
// the invoice made for a set of days (numbered once, found again for the same days), the PDF, and attaching it to the Xero bill. SERVER ONLY: it takes the service-role client, because the
// two tables (sub_invoice_details and sub_invoices, supabase/sub-invoices.sql) have no policies at all. Every function checks the owner and the contact it was given.

import type { SupabaseClient } from '@supabase/supabase-js'
import { xeroFetch, type XeroConn } from '@/lib/xero'
import { ukToday } from '@/lib/uk-today'
import {
  EMPTY_DETAILS, buildSubInvoice, buildCashRecord, invoiceNumber, setKey, dayLabel, isLogoPath,
  type InvoiceLog, type SubInvoiceDetails,
} from '@/lib/sub-invoice'
import { buildSubInvoicePdf } from '@/lib/sub-invoice-pdf'

export interface SubContact { id: string; name: string; email: string; phone: string; address: string; cisPercentage: number }

const LOG_COLS = 'id, entry_date, job_id, notes, rate_type, rate_amount, total_hours, amount, status, paid_date, entry_type, contact_id, xero_bill_id'

/** A day paid in cash: marked paid with no bill behind it. Cash gets a record of payments, never an invoice. */
const isCash = (l: { status?: string | null; xero_bill_id?: string | null }) => l.status === 'paid' && !l.xero_bill_id

function contactFromRow(c: Record<string, unknown>): SubContact {
  const first = (c.first_name as string) || '', last = (c.last_name as string) || ''
  const addr = [c.address, c.address_line1, c.address_line2, c.city, c.postcode].filter(x => typeof x === 'string' && x.trim()).join(', ')
  return {
    id: c.id as string,
    name: [first, last].filter(Boolean).join(' ').trim() || (c.name as string) || '',
    email: (c.email as string) || '', phone: (c.phone as string) || '',
    address: addr, cisPercentage: Number(c.cis_percentage) || 0,
  }
}

/** The builder and the contact record of a signed-in subcontractor (the same match the timesheet alert uses: their profile's company, then their email on a subcontractor contact). null when they are neither. */
export async function identifySub(admin: SupabaseClient, user: { id: string; email?: string | null }): Promise<{ ownerId: string; contact: SubContact } | null> {
  if (!user.email) return null
  const { data: prof } = await admin.from('profiles').select('admin_user_id').eq('id', user.id).maybeSingle()
  const ownerId = (prof?.admin_user_id as string | null) ?? null
  if (!ownerId) return null
  const { data: c } = await admin.from('clients').select('*').eq('user_id', ownerId).eq('client_type', 'subcontractor').ilike('email', user.email).limit(1).maybeSingle()
  if (!c) return null
  return { ownerId, contact: contactFromRow(c as Record<string, unknown>) }
}

/** A subcontractor contact of this builder, for the builder's own side (checks the contact is theirs). */
export async function subContactOf(admin: SupabaseClient, ownerId: string, contactId: string): Promise<SubContact | null> {
  const { data: c } = await admin.from('clients').select('*').eq('id', contactId).eq('user_id', ownerId).maybeSingle()
  return c ? contactFromRow(c as Record<string, unknown>) : null
}

export async function loadDetails(admin: SupabaseClient, ownerId: string, contactId: string): Promise<SubInvoiceDetails | null> {
  const { data } = await admin.from('sub_invoice_details').select('*').eq('owner_id', ownerId).eq('contact_id', contactId).maybeSingle()
  if (!data) return null
  const r = data as Record<string, unknown>
  return {
    tradingName: (r.trading_name as string) || '', address: (r.address as string) || '', email: (r.email as string) || '', phone: (r.phone as string) || '',
    utr: (r.utr as string) || '', vatRegistered: r.vat_registered === true, vatNumber: (r.vat_number as string) || '',
    bankAccountName: (r.bank_account_name as string) || '', sortCode: (r.sort_code as string) || '', accountNumber: (r.account_number as string) || '',
    paymentTerms: (r.payment_terms as string) || '', invoicePrefix: (r.invoice_prefix as string) || '',
    logoPath: isLogoPath(r.logo_path, ownerId) ? (r.logo_path as string) : '',
  }
}

export async function saveDetails(admin: SupabaseClient, ownerId: string, contactId: string, d: SubInvoiceDetails): Promise<string | null> {
  const { error } = await admin.from('sub_invoice_details').upsert({
    owner_id: ownerId, contact_id: contactId,
    trading_name: d.tradingName, address: d.address, email: d.email, phone: d.phone, utr: d.utr,
    vat_registered: d.vatRegistered, vat_number: d.vatNumber,
    bank_account_name: d.bankAccountName, sort_code: d.sortCode, account_number: d.accountNumber,
    payment_terms: d.paymentTerms, invoice_prefix: d.invoicePrefix,
    logo_path: isLogoPath(d.logoPath, ownerId) ? d.logoPath : '', updated_at: new Date().toISOString(),
  }, { onConflict: 'owner_id,contact_id' })
  return error ? error.message : null
}

export async function loadLogo(admin: SupabaseClient, path: string): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' } | null> {
  if (!path) return null
  try {
    const { data } = await admin.storage.from('job-documents').download(path)
    if (!data) return null
    return { bytes: new Uint8Array(await data.arrayBuffer()), type: /\.png$/i.test(path) ? 'png' : 'jpg' }
  } catch { return null }
}

/** Who the invoice is addressed to: the builder's company name and address from their settings. */
export async function builderParty(admin: SupabaseClient, ownerId: string): Promise<{ name: string; address: string }> {
  const { data } = await admin.from('settings').select('company_name, address').eq('user_id', ownerId).maybeSingle()
  return { name: (data?.company_name as string) || 'Contractor', address: (data?.address as string) || '' }
}

/** 'Client, address' for each job a set of days was on. */
export async function jobLabeller(admin: SupabaseClient, ownerId: string, jobIds: (string | null)[]): Promise<(id: string | null) => string> {
  const ids = [...new Set(jobIds.filter(Boolean) as string[])]
  const map = new Map<string, string>()
  if (ids.length) {
    const { data } = await admin.from('jobs').select('id, client, address').eq('user_id', ownerId).in('id', ids)
    for (const j of data ?? []) map.set(j.id as string, [j.address, j.client].filter(x => typeof x === 'string' && x.trim()).join(', ') || '')
  }
  return id => (id ? map.get(id) ?? '' : '')
}

/** The initials of a name, for an invoice number when they have not chosen a prefix: J Smith Plastering is JSP. */
export function initialsOf(name: string): string {
  const s = (name || '').split(/\s+/).map(w => w.replace(/[^A-Za-z0-9]/g, '').charAt(0)).join('').toUpperCase().slice(0, 4)
  return s || 'INV'
}

async function logsFor(admin: SupabaseClient, ownerId: string, contactId: string, logIds: string[]): Promise<InvoiceLog[]> {
  if (!logIds.length) return []
  const { data } = await admin.from('sub_admin_time_logs').select(LOG_COLS).in('id', logIds).eq('user_id', ownerId).eq('contact_id', contactId).eq('entry_type', 'payable')
  return (data ?? []).map(r => ({ ...r, amount: Number(r.amount), rate_amount: Number(r.rate_amount), total_hours: r.total_hours == null ? null : Number(r.total_hours) })) as InvoiceLog[]
}

export interface MadeInvoice { id: string; invoiceNumber: string; number: number; created: boolean }

/** The invoice for these days: the one already made for exactly these days (so the number never changes), else a new one with the next number. Cash-paid days are refused: no invoice for them. */
export async function ensureSubInvoice(admin: SupabaseClient, a: { ownerId: string; contactId: string; logIds: string[]; billId?: string | null; xeroBillId?: string | null }): Promise<MadeInvoice | { error: string }> {
  const all = await logsFor(admin, a.ownerId, a.contactId, a.logIds)
  const logs = all.filter(l => !isCash(l as unknown as { status?: string; xero_bill_id?: string }))   // days paid in cash are left off: no invoice for cash
  if (logs.length === 0) return { error: all.length ? 'Time paid in cash does not get an invoice.' : 'No time to invoice.' }
  const key = setKey(logs.map(l => l.id))
  const { data: existing } = await admin.from('sub_invoices').select('id, number, invoice_number').eq('owner_id', a.ownerId).eq('contact_id', a.contactId).eq('set_key', key).maybeSingle()
  if (existing) {
    const upd: Record<string, unknown> = {}
    if (a.billId) upd.bill_id = a.billId
    if (a.xeroBillId) upd.xero_bill_id = a.xeroBillId
    if (Object.keys(upd).length) await admin.from('sub_invoices').update(upd).eq('id', existing.id)
    return { id: existing.id as string, invoiceNumber: existing.invoice_number as string, number: Number(existing.number), created: false }
  }
  const [details, contact] = await Promise.all([loadDetails(admin, a.ownerId, a.contactId), subContactOf(admin, a.ownerId, a.contactId)])
  const prefix = details?.invoicePrefix || initialsOf(details?.tradingName || contact?.name || '')
  const label = await jobLabeller(admin, a.ownerId, logs.map(l => l.job_id))
  const inv = buildSubInvoice({ logs, jobLabel: label, vatRegistered: !!details?.vatRegistered, cisRate: contact?.cisPercentage ?? 0 })
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: top } = await admin.from('sub_invoices').select('number').eq('owner_id', a.ownerId).eq('contact_id', a.contactId).order('number', { ascending: false }).limit(1).maybeSingle()
    const n = (Number(top?.number) || 0) + 1
    const number = invoiceNumber(prefix, n)
    const { data: row, error } = await admin.from('sub_invoices').insert({
      owner_id: a.ownerId, contact_id: a.contactId, number: n, invoice_number: number,
      period_start: inv.periodStart || null, period_end: inv.periodEnd || null, log_ids: logs.map(l => l.id), set_key: key, total: inv.total,
      bill_id: a.billId ?? null, xero_bill_id: a.xeroBillId ?? null,
    }).select('id').single()
    if (!error && row) return { id: row.id as string, invoiceNumber: number, number: n, created: true }
    if (error && !/duplicate|unique/i.test(error.message)) return { error: error.message }
  }
  return { error: 'Could not number the invoice. Try again.' }
}

/** The PDF of an invoice that has been made. Rebuilt from the days each time (so a change to their details shows), with the number and date it was made with. */
export async function renderInvoicePdf(admin: SupabaseClient, ownerId: string, contactId: string, invoiceId: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const { data: row } = await admin.from('sub_invoices').select('*').eq('id', invoiceId).eq('owner_id', ownerId).eq('contact_id', contactId).maybeSingle()
  if (!row) return null
  const logs = await logsFor(admin, ownerId, contactId, (row.log_ids as string[]) ?? [])
  if (logs.length === 0) return null
  const [saved, contact, billTo, label] = await Promise.all([loadDetails(admin, ownerId, contactId), subContactOf(admin, ownerId, contactId), builderParty(admin, ownerId), jobLabeller(admin, ownerId, logs.map(l => l.job_id))])
  const details: SubInvoiceDetails = { ...EMPTY_DETAILS, ...(saved ?? {}) }
  details.tradingName = details.tradingName || contact?.name || ''
  details.address = details.address || contact?.address || ''
  details.email = details.email || contact?.email || ''
  details.phone = details.phone || contact?.phone || ''
  const inv = buildSubInvoice({ logs, jobLabel: label, vatRegistered: details.vatRegistered, cisRate: contact?.cisPercentage ?? 0 })
  const made = ukToday(new Date(row.created_at as string))
  const bytes = await buildSubInvoicePdf({
    kind: 'invoice', number: row.invoice_number as string, date: dayLabel(made, true), details, billTo, invoice: inv,
    periodStart: inv.periodStart, periodEnd: inv.periodEnd, logo: await loadLogo(admin, details.logoPath),
  })
  return { bytes, fileName: `Invoice ${row.invoice_number}.pdf` }
}

/** The record of what was paid in cash between two dates (yyyy-mm-dd): not an invoice. null when nothing was paid in cash then. */
export async function renderCashRecordPdf(admin: SupabaseClient, ownerId: string, contactId: string, from: string, to: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null
  const { data } = await admin.from('sub_admin_time_logs').select(LOG_COLS).eq('user_id', ownerId).eq('contact_id', contactId).eq('entry_type', 'payable').eq('status', 'paid').is('xero_bill_id', null).gte('entry_date', from).lte('entry_date', to)
  const logs = ((data ?? []) as unknown as Record<string, unknown>[]).map(r => ({ ...r, amount: Number(r.amount), rate_amount: Number(r.rate_amount), total_hours: r.total_hours == null ? null : Number(r.total_hours) })) as unknown as InvoiceLog[]
  if (logs.length === 0) return null
  const [saved, contact, billTo, label] = await Promise.all([loadDetails(admin, ownerId, contactId), subContactOf(admin, ownerId, contactId), builderParty(admin, ownerId), jobLabeller(admin, ownerId, logs.map(l => l.job_id))])
  const details: SubInvoiceDetails = { ...EMPTY_DETAILS, ...(saved ?? {}) }
  details.tradingName = details.tradingName || contact?.name || ''
  details.address = details.address || contact?.address || ''
  const rec = buildCashRecord(logs, label)
  const bytes = await buildSubInvoicePdf({
    kind: 'cash-record', date: dayLabel(ukToday(), true), details, billTo, lines: rec.lines, total: rec.total,
    periodStart: rec.lines[0]?.date ?? from, periodEnd: rec.lines[rec.lines.length - 1]?.date ?? to, logo: await loadLogo(admin, details.logoPath),
  })
  return { bytes, fileName: `Cash payments ${from} to ${to}.pdf` }
}

/** Puts the invoice on the Xero bill as an attachment (best effort: a failure never stops the bill). Returns whether it was attached. */
export async function attachInvoiceToXero(conn: XeroConn, xeroBillId: string, pdf: { bytes: Uint8Array; fileName: string }): Promise<boolean> {
  try {
    const safeName = pdf.fileName.replace(/[^\w\s.-]/g, '_')
    const res = await xeroFetch(conn, `/Invoices/${xeroBillId}/Attachments/${encodeURIComponent(safeName)}`, {
      method: 'PUT', body: pdf.bytes as unknown as BodyInit, headers: { 'Content-Type': 'application/pdf' },
    })
    if (!res.ok) { console.warn('sub invoice: Xero attachment refused', res.status); return false }
    return true
  } catch (e) {
    console.warn('sub invoice: Xero attachment failed (non-fatal)', e)
    return false
  }
}

/** Makes (or finds) the invoice for these days and attaches it to a Xero bill that has just been made from them. Never throws, never blocks the bill. */
export async function invoiceAndAttach(admin: SupabaseClient, conn: XeroConn, a: { ownerId: string; contactId: string; logIds: string[]; xeroBillId: string; billId?: string | null }): Promise<void> {
  try {
    const made = await ensureSubInvoice(admin, { ownerId: a.ownerId, contactId: a.contactId, logIds: a.logIds, billId: a.billId, xeroBillId: a.xeroBillId })
    if ('error' in made) return
    const pdf = await renderInvoicePdf(admin, a.ownerId, a.contactId, made.id)
    if (pdf) await attachInvoiceToXero(conn, a.xeroBillId, pdf)
  } catch (e) { console.warn('sub invoice: could not make or attach (non-fatal)', e) }
}
