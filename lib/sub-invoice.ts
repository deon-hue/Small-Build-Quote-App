// A subcontractor's own INVOICE, made from their approved times (Deon, 2026-11-22). Pure rules, no imports: what goes on the invoice, the totals (VAT only if they are VAT registered, CIS as the
// builder already deducts it), the invoice number, and the cleaning of the details a subcontractor types in their portal. The PDF is drawn in lib/sub-invoice-pdf.ts; the database and Xero
// halves are in lib/sub-invoice-server.ts. An invoice is only ever made for time that goes on a BILL (sent to Bills or to Xero); time paid in cash gets a record of payments, never an invoice.
// Tested: __tests__/sub-invoice.test.ts.

export interface SubInvoiceDetails {
  tradingName: string
  address: string
  email: string
  phone: string
  utr: string
  vatRegistered: boolean
  vatNumber: string
  bankAccountName: string
  sortCode: string
  accountNumber: string
  paymentTerms: string
  /** the letters before the number: JS gives JS-0001 */
  invoicePrefix: string
  /** where the logo is kept (a private storage path); '' when there is none */
  logoPath: string
}

export const EMPTY_DETAILS: SubInvoiceDetails = {
  tradingName: '', address: '', email: '', phone: '', utr: '', vatRegistered: false, vatNumber: '',
  bankAccountName: '', sortCode: '', accountNumber: '', paymentTerms: '', invoicePrefix: '', logoPath: '',
}

/** One day of work as the invoice needs it (a row of the builder's time logs). */
export interface InvoiceLog {
  id: string
  entry_date: string
  job_id: string | null
  notes: string | null
  rate_type: string | null
  rate_amount: number | null
  total_hours: number | null
  amount: number | null
  status?: string | null
  paid_date?: string | null
}

export interface InvoiceLine { date: string; dateLabel: string; what: string; quantity: string; rate: string; amount: number }

export interface SubInvoice {
  lines: InvoiceLine[]
  subtotal: number
  vatRate: number
  vat: number
  cisRate: number
  cisDeduction: number
  total: number
  periodStart: string
  periodEnd: string
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** yyyy-mm-dd as 'Mon 2 Nov' (or '2 Nov 2026' with the year). Anything else is returned as it came. */
export function dayLabel(iso: string, withYear = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return iso || ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  if (Number.isNaN(d.getTime())) return iso
  return withYear ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** How long a day was, in words: '1 day', 'Half day', '5.5 hrs'. */
export function quantityOf(l: Pick<InvoiceLog, 'rate_type' | 'total_hours'>): string {
  const rt = (l.rate_type || '').toLowerCase()
  if (rt === 'hourly' || rt === 'hour') { const h = Number(l.total_hours) || 0; return `${h % 1 === 0 ? h : h.toFixed(2).replace(/0$/, '')} hr${h === 1 ? '' : 's'}` }
  if (rt === 'half_day') return 'Half day'
  if (rt === 'day' || rt === 'daily') return '1 day'
  const h = Number(l.total_hours) || 0
  return h > 0 ? `${h} hrs` : '1 item'
}

export function rateOf(l: Pick<InvoiceLog, 'rate_type' | 'rate_amount'>): string {
  const a = Number(l.rate_amount) || 0
  if (!(a > 0)) return ''
  return (l.rate_type || '').toLowerCase().startsWith('hour') ? `${gbp(a)}/hr` : gbp(a)
}

/** The invoice: a line for each day, the subtotal, VAT when the subcontractor is VAT registered, the CIS deduction the builder makes (the same rate and base as the bill: on the labour, before VAT),
 *  and what is to be paid. `jobLabel` turns a job id into 'Client, address'. Days with no amount are left off. */
export function buildSubInvoice(input: { logs: InvoiceLog[]; jobLabel: (id: string | null) => string; vatRegistered: boolean; vatRate?: number; cisRate?: number }): SubInvoice {
  const vatRate = input.vatRegistered ? (input.vatRate ?? 20) : 0
  const cisRate = Math.min(100, Math.max(0, Number(input.cisRate) || 0))
  const logs = [...input.logs].filter(l => Number(l.amount) > 0).sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const lines: InvoiceLine[] = logs.map(l => {
    const job = input.jobLabel(l.job_id)
    const note = (l.notes || '').trim()
    return {
      date: l.entry_date, dateLabel: dayLabel(l.entry_date),
      what: [job, note].filter(Boolean).join(' — ') || 'Work',
      quantity: quantityOf(l), rate: rateOf(l), amount: round2(Number(l.amount)),
    }
  })
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0))
  const vat = round2(subtotal * vatRate / 100)
  const cisDeduction = round2(subtotal * cisRate / 100)
  return {
    lines, subtotal, vatRate, vat, cisRate, cisDeduction, total: round2(subtotal + vat - cisDeduction),
    periodStart: lines[0]?.date ?? '', periodEnd: lines[lines.length - 1]?.date ?? '',
  }
}

/** 'JS-0007'. A prefix of letters and numbers, up to 6; INV when none. */
export function invoiceNumber(prefix: string, n: number): string {
  const p = (prefix || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'INV'
  return `${p}-${String(Math.max(1, Math.floor(n))).padStart(4, '0')}`
}

/** The same days always make the same key, however they are ordered: how an invoice already made for them is found again (so the number never changes). */
export function setKey(logIds: string[]): string {
  return [...new Set(logIds)].sort().join(',')
}

/** The period in words: '2 to 6 Nov 2026', '30 Nov to 4 Dec 2026', or one day. */
export function periodLabel(start: string, end: string): string {
  if (!start) return ''
  if (!end || end === start) return dayLabel(start, true)
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(start), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(end)
  if (!a || !b) return `${start} to ${end}`
  if (a[1] === b[1] && a[2] === b[2]) return `${Number(a[3])} to ${Number(b[3])} ${MONTHS[Number(b[2]) - 1]} ${b[1]}`
  if (a[1] === b[1]) return `${Number(a[3])} ${MONTHS[Number(a[2]) - 1]} to ${Number(b[3])} ${MONTHS[Number(b[2]) - 1]} ${b[1]}`
  return `${dayLabel(start, true)} to ${dayLabel(end, true)}`
}

// ── What a subcontractor types in their portal ─────────────────────────────────

const cut = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n) : '')
const digits = (v: string) => v.replace(/\D/g, '')

/** Makes what came from the browser safe, and says what is wrong in plain words. Nothing is trusted: text is trimmed and cut, numbers are checked, the logo path is never taken from here. */
export function cleanDetails(raw: unknown, keepLogoPath = ''): { ok: true; details: SubInvoiceDetails } | { ok: false; error: string } {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const utr = digits(cut(o.utr, 20))
  if (utr && utr.length !== 10) return { ok: false, error: 'A UTR has 10 digits. Check it, or leave it blank.' }
  const sc = digits(cut(o.sortCode, 12))
  if (sc && sc.length !== 6) return { ok: false, error: 'A sort code has 6 digits, like 12-34-56.' }
  const an = digits(cut(o.accountNumber, 20))
  if (an && an.length !== 8) return { ok: false, error: 'An account number has 8 digits.' }
  const vatRegistered = o.vatRegistered === true
  const vatRaw = cut(o.vatNumber, 20).toUpperCase().replace(/\s/g, '')
  const vatDigits = digits(vatRaw)
  if (vatRegistered && !(vatDigits.length === 9 || vatDigits.length === 12)) return { ok: false, error: 'Enter your VAT number (9 digits, with GB in front if you like), or untick that you are VAT registered.' }
  if (!vatRegistered && vatRaw && !(vatDigits.length === 9 || vatDigits.length === 12)) return { ok: false, error: 'A VAT number has 9 digits. Check it, or leave it blank.' }
  const email = cut(o.email, 120)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That email address does not look right.' }
  const prefix = cut(o.invoicePrefix, 12).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  return {
    ok: true,
    details: {
      tradingName: cut(o.tradingName, 120), address: cut(o.address, 300), email, phone: cut(o.phone, 30),
      utr: utr ? `${utr.slice(0, 5)} ${utr.slice(5)}` : '',
      vatRegistered, vatNumber: vatDigits ? `GB${vatDigits.slice(0, 9)}${vatDigits.length === 12 ? ' ' + vatDigits.slice(9) : ''}`.trim() : '',
      bankAccountName: cut(o.bankAccountName, 80), sortCode: sc ? `${sc.slice(0, 2)}-${sc.slice(2, 4)}-${sc.slice(4)}` : '', accountNumber: an,
      paymentTerms: cut(o.paymentTerms, 300), invoicePrefix: prefix, logoPath: keepLogoPath,
    },
  }
}

/** A path of ours for a logo: <owner id>/sub-logos/<contact id>-<time>.<png|jpg>, nothing else. */
export function isLogoPath(v: unknown, ownerId?: string): v is string {
  if (typeof v !== 'string' || v.includes('..')) return false
  const m = /^([0-9a-f-]{36})\/sub-logos\/[0-9a-f-]{36}-\d{9,15}\.(png|jpg)$/i.exec(v)
  return !!m && (!ownerId || m[1].toLowerCase() === ownerId.toLowerCase())
}

/** Starts the details form from what the builder already holds on the contact; what the subcontractor has saved wins. */
export function mergeDetails(saved: Partial<SubInvoiceDetails> | null, known: { name?: string; address?: string; email?: string; phone?: string }): SubInvoiceDetails {
  const s = { ...EMPTY_DETAILS, ...(saved ?? {}) }
  return {
    ...s,
    tradingName: s.tradingName || known.name || '',
    address: s.address || known.address || '',
    email: s.email || known.email || '',
    phone: s.phone || known.phone || '',
  }
}

/** 'Record of payments' for time paid in cash: never an invoice, no VAT or CIS, just what was paid and when. */
export function buildCashRecord(logs: InvoiceLog[], jobLabel: (id: string | null) => string): { lines: InvoiceLine[]; total: number } {
  const lines = [...logs].filter(l => Number(l.amount) > 0).sort((a, b) => a.entry_date.localeCompare(b.entry_date)).map((l): InvoiceLine => ({
    date: l.entry_date, dateLabel: dayLabel(l.entry_date),
    what: [jobLabel(l.job_id), (l.notes || '').trim()].filter(Boolean).join(' — ') || 'Work',
    quantity: quantityOf(l), rate: rateOf(l), amount: round2(Number(l.amount)),
  }))
  return { lines, total: round2(lines.reduce((s, l) => s + l.amount, 0)) }
}
