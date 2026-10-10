// What is a contact used for? Counts the things in the app that point at a contact (quotes and jobs for a customer, bills and costs for a supplier,
// timesheets, fixed quotes and bookings for a subcontractor), so a "Tidy up contacts" screen can show which contacts are safe to remove. Quotes, jobs,
// invoices and job costs only know a contact by NAME (or email), so those are matched exactly (capitals ignored), never loosely. Pure, tested on its own.

export interface UsageSources {
  quotes: { customerName?: string | null; customerEmail?: string | null }[]
  jobs: { client?: string | null }[]
  invoices: { clientName?: string | null }[]
  bills: { supplierId?: string | null }[]
  /** contact ids found on each kind of subcontractor record (one entry per record) */
  subContractContactIds: (string | null | undefined)[]
  subTimeLogContactIds: (string | null | undefined)[]
  subEntryContactIds: (string | null | undefined)[]
  assignmentContactIds: (string | null | undefined)[]
  /** the supplier name on each job cost line */
  costSuppliers: (string | null | undefined)[]
}

export interface UsageItem { label: string; count: number }

const n = (s?: string | null) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
const bump = (m: Map<string, number>, k: string) => { if (k) m.set(k, (m.get(k) ?? 0) + 1) }
const push = (m: Map<string, number[]>, k: string, i: number) => { if (k) { const a = m.get(k); if (a) a.push(i); else m.set(k, [i]) } }

export interface UsageIndex {
  quotesByName: Map<string, number[]>; quotesByEmail: Map<string, number[]>; jobsByName: Map<string, number>; invoicesByName: Map<string, number>
  billsById: Map<string, number>; contractsById: Map<string, number>; logsById: Map<string, number>; entriesById: Map<string, number>
  assignById: Map<string, number>; costsByName: Map<string, number>
}

export function buildUsageIndex(src: UsageSources): UsageIndex {
  const ix: UsageIndex = {
    quotesByName: new Map(), quotesByEmail: new Map(), jobsByName: new Map(), invoicesByName: new Map(),
    billsById: new Map(), contractsById: new Map(), logsById: new Map(), entriesById: new Map(), assignById: new Map(), costsByName: new Map(),
  }
  src.quotes.forEach((q, i) => { push(ix.quotesByName, n(q.customerName), i); push(ix.quotesByEmail, n(q.customerEmail), i) })
  for (const j of src.jobs) bump(ix.jobsByName, n(j.client))
  for (const i of src.invoices) bump(ix.invoicesByName, n(i.clientName))
  for (const b of src.bills) bump(ix.billsById, b.supplierId || '')
  for (const id of src.subContractContactIds) bump(ix.contractsById, id || '')
  for (const id of src.subTimeLogContactIds) bump(ix.logsById, id || '')
  for (const id of src.subEntryContactIds) bump(ix.entriesById, id || '')
  for (const id of src.assignmentContactIds) bump(ix.assignById, id || '')
  for (const s of src.costSuppliers) bump(ix.costsByName, n(s))
  return ix
}

/** Everything in the app that points at this contact (empty = not used anywhere). */
export function usageOf(ix: UsageIndex, c: { id: string; name?: string | null; email?: string | null }): UsageItem[] {
  const name = n(c.name), email = n(c.email)
  const out: UsageItem[] = []
  const add = (label: string, count: number) => { if (count > 0) out.push({ label, count }) }
  // a quote counts once even if both its name and its email match
  const quoteIds = new Set<number>([...(name ? ix.quotesByName.get(name) ?? [] : []), ...(email ? ix.quotesByEmail.get(email) ?? [] : [])])
  add('quote', quoteIds.size)
  add('job', name ? ix.jobsByName.get(name) ?? 0 : 0)
  add('invoice', name ? ix.invoicesByName.get(name) ?? 0 : 0)
  add('bill', ix.billsById.get(c.id) ?? 0)
  add('fixed quote', ix.contractsById.get(c.id) ?? 0)
  add('weekly timesheet day', ix.logsById.get(c.id) ?? 0)
  add('portal timesheet', ix.entriesById.get(c.id) ?? 0)
  add('task booking', ix.assignById.get(c.id) ?? 0)
  add('job cost', name ? ix.costsByName.get(name) ?? 0 : 0)
  return out
}

/** "2 quotes, 1 job" */
export function describeUsage(items: UsageItem[]): string {
  return items.map(i => i.count + ' ' + i.label + (i.count === 1 ? '' : 's')).join(', ')
}
