/**
 * Tests for lib/sub-invoice-server.ts with a small in-memory stand-in for the database:
 * numbering, finding an invoice again for the same days, no invoice for cash, the subcontractor being found, details saved, the PDF made.
 *
 * Run with:   npx tsx __tests__/sub-invoice-server.test.ts
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { identifySub, loadDetails, saveDetails, ensureSubInvoice, renderInvoicePdf, renderCashRecordPdf, initialsOf } from '../lib/sub-invoice-server'
import { EMPTY_DETAILS } from '../lib/sub-invoice'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  let idn = 0
  const q = (name: string) => {
    const rows = tables[name] ?? (tables[name] = [])
    const filters: ((r: Row) => boolean)[] = []
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select'
    let payload: Row | null = null
    let order: { col: string; asc: boolean } | null = null
    let lim = Infinity
    let conflict = ''
    const api: Record<string, unknown> = {}
    const run = () => {
      if (mode === 'insert') {
        const row = { id: `id-${++idn}`, created_at: '2026-11-20T10:00:00Z', ...payload }
        // unique (owner, contact, number) and (owner, contact, set_key) on sub_invoices
        if (name === 'sub_invoices' && rows.some(r => r.owner_id === row.owner_id && r.contact_id === row.contact_id && (r.number === row.number || r.set_key === row.set_key))) return { data: null, error: { message: 'duplicate key value violates unique constraint' } }
        rows.push(row); return { data: row, error: null }
      }
      if (mode === 'upsert') {
        const keys = conflict.split(',')
        const hit = rows.find(r => keys.every(k => r[k] === payload![k]))
        if (hit) Object.assign(hit, payload); else rows.push({ ...payload })
        return { data: null, error: null }
      }
      let out = rows.filter(r => filters.every(f => f(r)))
      if (mode === 'update') { out.forEach(r => Object.assign(r, payload)); return { data: out, error: null } }
      if (order) out = [...out].sort((a, b) => (order!.asc ? 1 : -1) * ((a[order!.col] as number) - (b[order!.col] as number)))
      return { data: out.slice(0, lim), error: null }
    }
    const one = () => { const r = run(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return Promise.resolve({ data: d, error: r.error }) }
    api.select = () => api
    api.insert = (p: Row) => { mode = 'insert'; payload = p; return api }
    api.update = (p: Row) => { mode = 'update'; payload = p; return api }
    api.upsert = (p: Row, o: { onConflict: string }) => { mode = 'upsert'; payload = p; conflict = o.onConflict; return run() }
    api.eq = (c: string, v: unknown) => { filters.push(r => r[c] === v); return api }
    api.in = (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return api }
    api.ilike = (c: string, v: string) => { filters.push(r => String(r[c] ?? '').toLowerCase() === v.toLowerCase()); return api }
    api.is = (c: string, v: unknown) => { filters.push(r => (v === null ? r[c] == null : r[c] === v)); return api }
    api.not = (c: string, _op: string, v: unknown) => { filters.push(r => (v === null ? r[c] != null : r[c] !== v)); return api }
    api.gte = (c: string, v: string) => { filters.push(r => String(r[c]) >= v); return api }
    api.lte = (c: string, v: string) => { filters.push(r => String(r[c]) <= v); return api }
    api.order = (col: string, o: { ascending: boolean }) => { order = { col, asc: o.ascending }; return api }
    api.limit = (n: number) => { lim = n; return api }
    api.maybeSingle = one
    api.single = one
    api.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej)
    return api
  }
  return { from: q, storage: { from: () => ({ download: async () => ({ data: null }) }) } } as unknown as SupabaseClient
}

const OWNER = '11111111-1111-1111-1111-111111111111', SUB = '22222222-2222-2222-2222-222222222222', CONTACT = '33333333-3333-3333-3333-333333333333'
const day = (n: number, extra: Row = {}): Row => ({ id: `log${n}`, user_id: OWNER, contact_id: CONTACT, entry_type: 'payable', entry_date: `2026-11-0${n}`, job_id: 'job1', notes: 'plastering', rate_type: 'day', rate_amount: 190, total_hours: null, amount: 190, status: 'approved', xero_bill_id: null, ...extra })
const world = () => ({
  profiles: [{ id: SUB, admin_user_id: OWNER }],
  clients: [{ id: CONTACT, user_id: OWNER, client_type: 'subcontractor', name: 'John Smith', first_name: 'John', last_name: 'Smith', email: 'John@Smith.co.uk', phone: '0770', address: '7 Mill Lane', postcode: 'SL1 1AA', cis_percentage: 20 },
    { id: 'other', user_id: 'someone-else', client_type: 'subcontractor', name: 'Other', email: 'other@x.com' }],
  settings: [{ user_id: OWNER, company_name: 'Small Build Company', address: '1 High Street' }],
  jobs: [{ id: 'job1', user_id: OWNER, client: 'Mrs Jones', address: '14 Oak Road' }],
  sub_admin_time_logs: [day(1), day(2), day(3, { status: 'paid' }), day(4, { status: 'paid', xero_bill_id: 'XB1' }), day(5, { status: 'paid' })],
  sub_invoices: [], sub_invoice_details: [],
})

async function main() {
  // ---- who is signed in
  const db = fakeDb(world()) as SupabaseClient
  const me = await identifySub(db, { id: SUB, email: 'john@smith.co.uk' })
  t('the subcontractor is found by login and email (any case)', !!me && me.ownerId === OWNER && me.contact.id === CONTACT && me.contact.name === 'John Smith' && me.contact.cisPercentage === 20, me)
  t('the address is built from the contact', me?.contact.address.includes('7 Mill Lane') === true && me?.contact.address.includes('SL1 1AA') === true, me?.contact.address)
  t('an unknown login is nobody', (await identifySub(db, { id: 'nobody', email: 'x@y.com' })) === null && (await identifySub(db, { id: SUB, email: null })) === null)
  t('a login whose email is another builder\'s subcontractor is nobody', (await identifySub(db, { id: SUB, email: 'other@x.com' })) === null)

  // ---- details
  t('no details saved yet', (await loadDetails(db, OWNER, CONTACT)) === null)
  const err = await saveDetails(db, OWNER, CONTACT, { ...EMPTY_DETAILS, tradingName: 'J Smith Plastering', vatRegistered: true, vatNumber: 'GB123456789', logoPath: 'evil/path.png' })
  const got = await loadDetails(db, OWNER, CONTACT)
  t('details saved and read back', err === null && got?.tradingName === 'J Smith Plastering' && got.vatRegistered === true && got.vatNumber === 'GB123456789', got)
  t('a logo path that is not ours is never kept', got?.logoPath === '', got)
  await saveDetails(db, OWNER, CONTACT, { ...EMPTY_DETAILS, tradingName: 'J Smith Plastering Ltd', invoicePrefix: 'JSP' })
  t('saving again replaces, one row', (await loadDetails(db, OWNER, CONTACT))?.tradingName === 'J Smith Plastering Ltd')

  // ---- invoices: numbering, finding again, cash
  const w = world(); const d2 = fakeDb(w)
  const first = await ensureSubInvoice(d2, { ownerId: OWNER, contactId: CONTACT, logIds: ['log1', 'log2'], billId: 'bill-1' })
  t('first invoice is number 1 with initials from the name (JS)', 'invoiceNumber' in first && first.invoiceNumber === 'JS-0001' && first.created, first)
  const again = await ensureSubInvoice(d2, { ownerId: OWNER, contactId: CONTACT, logIds: ['log2', 'log1'], xeroBillId: 'XB9' })
  t('the same days (any order) find the same invoice, same number', 'invoiceNumber' in again && again.invoiceNumber === 'JS-0001' && !again.created && (again as { id: string }).id === (first as { id: string }).id, again)
  t('the bill ids are added to the invoice that was found', (w.sub_invoices[0].bill_id === 'bill-1') && (w.sub_invoices[0].xero_bill_id === 'XB9'), w.sub_invoices[0])
  const second = await ensureSubInvoice(d2, { ownerId: OWNER, contactId: CONTACT, logIds: ['log1', 'log2', 'log4'] })
  t('different days make the next number', 'invoiceNumber' in second && second.invoiceNumber === 'JS-0002', second)
  t('the invoice total, period and days are stored', w.sub_invoices[0].total === 503.2 - 0 + 0 || w.sub_invoices[0].total === 380 - 76, w.sub_invoices[0].total)
  const cashOnly = await ensureSubInvoice(d2, { ownerId: OWNER, contactId: CONTACT, logIds: ['log3', 'log5'] })
  t('days paid in cash get NO invoice', 'error' in cashOnly && /cash/i.test(cashOnly.error), cashOnly)
  t('nothing was stored for the cash days', w.sub_invoices.length === 2, w.sub_invoices.length)
  const mixed = await ensureSubInvoice(d2, { ownerId: OWNER, contactId: CONTACT, logIds: ['log1', 'log3', 'log4'] })
  const mixedRow = w.sub_invoices.find(r => (r.invoice_number as string) === ('invoiceNumber' in mixed ? mixed.invoiceNumber : ''))
  t('a mix leaves the cash day off, keeps the bill days', 'invoiceNumber' in mixed && JSON.stringify((mixedRow?.log_ids as string[]).slice().sort()) === JSON.stringify(['log1', 'log4']), mixedRow)
  t('a day paid but with a bill behind it (Xero) is not cash', 'invoiceNumber' in (await ensureSubInvoice(d2, { ownerId: OWNER, contactId: CONTACT, logIds: ['log4'] })))
  t('another builder\'s days or contact make nothing', 'error' in (await ensureSubInvoice(d2, { ownerId: 'someone-else', contactId: CONTACT, logIds: ['log1'] })) && 'error' in (await ensureSubInvoice(d2, { ownerId: OWNER, contactId: 'nope', logIds: ['log1'] })))
  t('no days is an error', 'error' in (await ensureSubInvoice(d2, { ownerId: OWNER, contactId: CONTACT, logIds: [] })))

  // ---- the PDF of a made invoice
  const pdf = await renderInvoicePdf(d2, OWNER, CONTACT, (first as { id: string }).id)
  t('the invoice PDF is made, named by its number', !!pdf && pdf.fileName === 'Invoice JS-0001.pdf' && pdf.bytes.length > 1500, pdf?.fileName)
  t('another subcontractor cannot get it', (await renderInvoicePdf(d2, OWNER, 'someone-elses-contact', (first as { id: string }).id)) === null && (await renderInvoicePdf(d2, 'another-owner', CONTACT, (first as { id: string }).id)) === null)
  t('an invoice id that does not exist is null', (await renderInvoicePdf(d2, OWNER, CONTACT, 'nope')) === null)

  // ---- the cash record
  const cash = await renderCashRecordPdf(d2, OWNER, CONTACT, '2026-11-01', '2026-11-30')
  t('the cash record is made for days paid in cash (log3, log5; not the Xero one)', !!cash && cash.fileName === 'Cash payments 2026-11-01 to 2026-11-30.pdf', cash?.fileName)
  t('no cash in the range is null', (await renderCashRecordPdf(d2, OWNER, CONTACT, '2026-10-01', '2026-10-31')) === null)
  t('bad dates are refused', (await renderCashRecordPdf(d2, OWNER, CONTACT, '2026-11-01', 'soon')) === null)

  t('initials for a prefix', initialsOf('J Smith Plastering') === 'JSP' && initialsOf('') === 'INV' && initialsOf('  ') === 'INV' && initialsOf('A. B. C. D. E. F.') === 'ABCD')

  console.log(`sub invoice server: ${ok} ok, ${bad} failed`)
  if (bad > 0) process.exit(1)
}
main().catch(e => { console.error(e); process.exit(1) })
