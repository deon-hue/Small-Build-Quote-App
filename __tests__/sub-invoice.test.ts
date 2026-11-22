/**
 * Tests for lib/sub-invoice.ts  —  a subcontractor's invoice made from their times
 *
 * Run with:   npx tsx __tests__/sub-invoice.test.ts
 */

import { buildSubInvoice, buildCashRecord, invoiceNumber, setKey, periodLabel, dayLabel, quantityOf, rateOf, cleanDetails, isLogoPath, mergeDetails, EMPTY_DETAILS } from '../lib/sub-invoice'
import type { InvoiceLog } from '../lib/sub-invoice'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, x ?? '')) }

const logs: InvoiceLog[] = [
  { id: 'c', entry_date: '2026-11-05', job_id: 'j2', notes: 'patching', rate_type: 'hourly', rate_amount: 28, total_hours: 5.5, amount: 154 },
  { id: 'a', entry_date: '2026-11-02', job_id: 'j1', notes: 'skim ceilings', rate_type: 'day', rate_amount: 190, total_hours: null, amount: 190 },
  { id: 'b', entry_date: '2026-11-03', job_id: 'j1', notes: '', rate_type: 'day', rate_amount: 190, total_hours: null, amount: 190 },
  { id: 'z', entry_date: '2026-11-04', job_id: null, notes: 'no amount', rate_type: 'day', rate_amount: 0, total_hours: null, amount: 0 },
  { id: 'h', entry_date: '2026-11-06', job_id: 'j1', notes: null, rate_type: 'half_day', rate_amount: 95, total_hours: null, amount: 95 },
]
const label = (id: string | null) => (id === 'j1' ? '14 Oak Road' : id === 'j2' ? '3 Park Close' : '')

// ---- no VAT, no CIS
const inv = buildSubInvoice({ logs, jobLabel: label, vatRegistered: false })
t('days in date order, the one with no amount left off', inv.lines.map(l => l.date).join() === '2026-11-02,2026-11-03,2026-11-05,2026-11-06', inv.lines.map(l => l.date))
t('subtotal 629 (190+190+154+95)', inv.subtotal === 629, inv.subtotal)
t('no VAT and no CIS: total is the subtotal', inv.vat === 0 && inv.cisDeduction === 0 && inv.total === 629, inv)
t('period runs first day to last', inv.periodStart === '2026-11-02' && inv.periodEnd === '2026-11-06')
t('line wording: job then notes', inv.lines[0].what === '14 Oak Road — skim ceilings' && inv.lines[1].what === '14 Oak Road' && inv.lines[2].what === '3 Park Close — patching', inv.lines.map(l => l.what))
t('quantities in words', inv.lines.map(l => l.quantity).join('|') === '1 day|1 day|5.5 hrs|Half day', inv.lines.map(l => l.quantity))
t('rates', inv.lines[0].rate === '£190.00' && inv.lines[2].rate === '£28.00/hr', inv.lines.map(l => l.rate))
t('a day with no job and no note is just Work', buildSubInvoice({ logs: [{ id: 'x', entry_date: '2026-11-02', job_id: null, notes: '', rate_type: 'day', rate_amount: 100, total_hours: null, amount: 100 }], jobLabel: label, vatRegistered: false }).lines[0].what === 'Work')

// ---- VAT
const v = buildSubInvoice({ logs, jobLabel: label, vatRegistered: true })
t('VAT registered: 20% added, 125.80 on 629', v.vatRate === 20 && v.vat === 125.8 && v.total === 754.8, v)
t('VAT rate can be changed', buildSubInvoice({ logs, jobLabel: label, vatRegistered: true, vatRate: 5 }).vat === 31.45)

// ---- CIS (the same deduction the bill makes: on the labour, before VAT)
const c = buildSubInvoice({ logs, jobLabel: label, vatRegistered: false, cisRate: 20 })
t('CIS 20% of 629 = 125.80 off, 503.20 to pay', c.cisDeduction === 125.8 && c.total === 503.2, c)
const cv = buildSubInvoice({ logs, jobLabel: label, vatRegistered: true, cisRate: 20 })
t('CIS comes off before VAT: 629 + 125.80 VAT - 125.80 CIS = 629', cv.total === 629 && cv.vat === 125.8 && cv.cisDeduction === 125.8, cv)
t('CIS 30%', buildSubInvoice({ logs, jobLabel: label, vatRegistered: false, cisRate: 30 }).cisDeduction === 188.7)
t('a silly CIS rate is held to 0 to 100', buildSubInvoice({ logs, jobLabel: label, vatRegistered: false, cisRate: 500 }).cisDeduction === 629 && buildSubInvoice({ logs, jobLabel: label, vatRegistered: false, cisRate: -5 }).cisDeduction === 0)
t('nothing to invoice is an empty invoice', buildSubInvoice({ logs: [], jobLabel: label, vatRegistered: true }).total === 0)

// ---- numbering and keys
t('JS-0007', invoiceNumber('js', 7) === 'JS-0007')
t('no prefix is INV', invoiceNumber('', 1) === 'INV-0001' && invoiceNumber('  ', 12) === 'INV-0012')
t('a prefix is cleaned and cut to 6', invoiceNumber('J.S. & Co plastering', 3) === 'JSCOPL-0003')
t('a huge or low number is held sensible', invoiceNumber('A', 0) === 'A-0001' && invoiceNumber('A', 12345) === 'A-12345')
t('the same days make the same key however ordered, and repeats count once', setKey(['b', 'a', 'a']) === setKey(['a', 'b']) && setKey(['a']) !== setKey(['a', 'b']))

// ---- words
t('a day with its weekday', dayLabel('2026-11-02') === 'Mon 2 Nov' && dayLabel('2026-11-02', true) === '2 Nov 2026')
t('a bad date comes back as it was', dayLabel('soon') === 'soon' && dayLabel('') === '')
t('period within a month', periodLabel('2026-11-02', '2026-11-06') === '2 to 6 Nov 2026', periodLabel('2026-11-02', '2026-11-06'))
t('period across months', periodLabel('2026-11-30', '2026-12-04') === '30 Nov to 4 Dec 2026', periodLabel('2026-11-30', '2026-12-04'))
t('period across years', periodLabel('2026-12-30', '2027-01-02') === '30 Dec 2026 to 2 Jan 2027')
t('one day period', periodLabel('2026-11-02', '2026-11-02') === '2 Nov 2026' && periodLabel('2026-11-02', '') === '2 Nov 2026' && periodLabel('', '') === '')
t('quantities', quantityOf({ rate_type: 'hourly', total_hours: 1 }) === '1 hr' && quantityOf({ rate_type: 'half_day', total_hours: null }) === 'Half day' && quantityOf({ rate_type: 'custom', total_hours: 3 }) === '3 hrs' && quantityOf({ rate_type: 'custom', total_hours: null }) === '1 item')
t('no rate is blank', rateOf({ rate_type: 'day', rate_amount: 0 }) === '' && rateOf({ rate_type: 'day', rate_amount: null }) === '')

// ---- the details form
const good = cleanDetails({ tradingName: ' J Smith Plastering ', address: '7 Mill Lane\nSlough', email: 'j@smith.co.uk', phone: '07700 900123', utr: '1234567890', vatRegistered: false, vatNumber: '', bankAccountName: 'J Smith', sortCode: '123456', accountNumber: '12345678', paymentTerms: 'Pay within 7 days', invoicePrefix: 'js' }, 'owner/sub-logos/x.png')
t('good details accepted and tidied', good.ok && good.details.tradingName === 'J Smith Plastering' && good.details.utr === '12345 67890' && good.details.sortCode === '12-34-56' && good.details.invoicePrefix === 'JS' && good.details.logoPath === 'owner/sub-logos/x.png', good)
t('a short UTR is refused with words', (() => { const r = cleanDetails({ utr: '12345' }); return !r.ok && /10 digits/.test(r.error) })())
t('a bad sort code, account number and email are refused', !cleanDetails({ sortCode: '12-34' }).ok && !cleanDetails({ accountNumber: '1234' }).ok && !cleanDetails({ email: 'nope' }).ok)
t('VAT registered needs a number', (() => { const r = cleanDetails({ vatRegistered: true, vatNumber: '' }); return !r.ok && /VAT number/.test(r.error) })())
t('VAT registered with a number is kept as GB number', (() => { const r = cleanDetails({ vatRegistered: true, vatNumber: 'gb 123 456 789' }); return r.ok && r.details.vatRegistered && r.details.vatNumber === 'GB123456789' })())
t('a number with no VAT tick is allowed but must be real', cleanDetails({ vatNumber: '123456789' }).ok && !cleanDetails({ vatNumber: '12' }).ok)
t('only a real true turns VAT on', (() => { const r = cleanDetails({ vatRegistered: 'true', vatNumber: '123456789' }); return r.ok && !r.details.vatRegistered })())
t('nothing typed is fine: blank details', (() => { const r = cleanDetails({}); return r.ok && r.details.tradingName === '' && r.details.vatRegistered === false })())
t('rubbish input is blank, not a crash', cleanDetails(null).ok && cleanDetails('x').ok && cleanDetails([]).ok)
t('long text is cut', (() => { const r = cleanDetails({ tradingName: 'x'.repeat(500), address: 'y'.repeat(900) }); return r.ok && r.details.tradingName.length === 120 && r.details.address.length === 300 })())
t('a logo path cannot be sent in the form', (() => { const r = cleanDetails({ logoPath: 'someone/else.png' }, ''); return r.ok && r.details.logoPath === '' })())
const OWN = '11111111-1111-1111-1111-111111111111', CON = '22222222-2222-2222-2222-222222222222'
t('only our own logo path is allowed', isLogoPath(`${OWN}/sub-logos/${CON}-1790000000000.png`, OWN) && isLogoPath(`${OWN}/sub-logos/${CON}-1790000000000.jpg`) && !isLogoPath(`${OWN}/sub-logos/${CON}-1790000000000.png`, '33333333-3333-3333-3333-333333333333') && !isLogoPath('http://x/y.png') && !isLogoPath(`${OWN}/sub-logos/../${CON}-1790000000000.png`) && !isLogoPath(`${OWN}/sub-logos/${CON}-1790000000000.svg`) && !isLogoPath(5))

// ---- starting from what the builder holds
const m = mergeDetails(null, { name: 'John Smith', address: '7 Mill Lane', email: 'j@x.com', phone: '0770' })
t('the form starts from the contact', m.tradingName === 'John Smith' && m.address === '7 Mill Lane' && m.email === 'j@x.com' && m.phone === '0770')
const m2 = mergeDetails({ ...EMPTY_DETAILS, tradingName: 'J Smith Plastering', utr: '12345 67890' }, { name: 'John Smith', address: '7 Mill Lane' })
t('what they saved wins, the rest comes from the contact', m2.tradingName === 'J Smith Plastering' && m2.utr === '12345 67890' && m2.address === '7 Mill Lane')

// ---- cash record
const cash = buildCashRecord(logs.slice(0, 3), label)
t('cash record lists the days and the total, no VAT or CIS', cash.lines.length === 3 && cash.total === 534 && !('vat' in cash), cash)

console.log(`sub invoice: ${ok} ok, ${bad} failed`)
if (bad > 0) process.exit(1)
