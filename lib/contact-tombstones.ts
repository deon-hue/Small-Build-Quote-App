// "Deleted contacts" that must not come back. When a contact is deleted in the app, a small record of it (its name, email and Xero ID) is kept, and the
// Xero contact sync checks that list before it creates anything, so a deleted contact is not re-created from Xero. Pure functions, tested on their own.

export interface Tombstone { name?: string | null; email?: string | null; xero_contact_id?: string | null }
export interface TombstoneIndex { ids: Set<string>; emails: Set<string>; names: Set<string> }

const COMPANY_SUFFIXES = /\s*\b(limited|ltd\.?|llc\.?|inc\.?|incorporated|plc|co\.?|company|group|holdings?|services?|solutions?|trading|enterprises?|associates?)\b\.?\s*$/gi

export const normEmail = (s?: string | null) => (s || '').trim().toLowerCase()
export const normName = (s?: string | null) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')
/** A company name with "Ltd", "Services" and the like taken off the end, so "Smith Plumbing Ltd" and "Smith Plumbing" are the same business */
export const normCompany = (s?: string | null) => normName(s).replace(COMPANY_SUFFIXES, '').replace(/\s+/g, ' ').trim()

export function buildTombstones(rows: Tombstone[] | null | undefined): TombstoneIndex {
  const idx: TombstoneIndex = { ids: new Set(), emails: new Set(), names: new Set() }
  for (const r of rows ?? []) {
    if (r.xero_contact_id) idx.ids.add(String(r.xero_contact_id))
    const e = normEmail(r.email); if (e) idx.emails.add(e)
    const n = normName(r.name); if (n) idx.names.add(n)
    const c = normCompany(r.name); if (c) idx.names.add(c)
  }
  return idx
}

/** Is this Xero (or incoming) contact one that was deleted on purpose? Matches on the Xero ID, the email address or the name. */
export function isTombstoned(idx: TombstoneIndex, c: { xeroId?: string | null; email?: string | null; name?: string | null }): boolean {
  if (c.xeroId && idx.ids.has(String(c.xeroId))) return true
  const e = normEmail(c.email); if (e && idx.emails.has(e)) return true
  const n = normName(c.name); if (n && idx.names.has(n)) return true
  const k = normCompany(c.name); if (k && idx.names.has(k)) return true
  return false
}
