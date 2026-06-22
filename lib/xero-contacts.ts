// Two-way contact sync between the app and Xero Contacts.
// All CRM contacts (clients, suppliers, subcontractors) live in the `clients`
// table with a `client_type` column. Manual trigger, most-recent-edit-wins.
// Xero has no "subcontractor" flag — subcontractors sync as IsSupplier:true.
// Server-only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getValidConnection, xeroFetch, type XeroConn } from './xero'

interface XeroPhone { PhoneType?: string; PhoneNumber?: string }
interface XeroAddress { AddressType?: string; AddressLine1?: string }
interface XeroContact {
  ContactID?: string
  Name?: string
  FirstName?: string
  LastName?: string
  EmailAddress?: string
  AccountNumber?: string
  IsCustomer?: boolean
  IsSupplier?: boolean
  Phones?: XeroPhone[]
  Addresses?: XeroAddress[]
  UpdatedDateUTC?: string
}

export interface SyncSummary {
  created: number
  updated: number
  pushed: number
  errors: string[]
}

function parseXeroDate(s?: string): number {
  if (!s) return 0
  const m = s.match(/\/Date\((\d+)/)
  return m ? Number(m[1]) : (Date.parse(s) || 0)
}
const phone = (c: XeroContact) => c.Phones?.find(p => p.PhoneNumber)?.PhoneNumber ?? ''
const addr  = (c: XeroContact) => c.Addresses?.find(a => a.AddressLine1)?.AddressLine1 ?? ''
const norm  = (s?: string) => (s || '').trim().toLowerCase()

const COMPANY_SUFFIXES = /\s*\b(limited|ltd\.?|llc\.?|inc\.?|incorporated|plc|co\.?|company|group|holdings?|services?|solutions?|trading|enterprises?|associates?)\b\.?\s*$/gi
function normCompany(s?: string): string {
  return (s || '').trim().toLowerCase().replace(COMPANY_SUFFIXES, '').replace(/\s+/g, ' ').trim()
}

async function fetchAllContacts(conn: XeroConn): Promise<XeroContact[]> {
  const out: XeroContact[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await xeroFetch(conn, `/Contacts?page=${page}`)
    if (!res.ok) throw new Error(`Xero GET /Contacts failed: ${res.status} ${await res.text()}`)
    const data = await res.json() as { Contacts?: XeroContact[] }
    const batch = data.Contacts ?? []
    out.push(...batch)
    if (batch.length < 100) break
  }
  return out
}

async function putContacts(conn: XeroConn, contacts: XeroContact[]): Promise<XeroContact[]> {
  if (!contacts.length) return []
  const res = await xeroFetch(conn, '/Contacts', { method: 'POST', body: JSON.stringify({ Contacts: contacts }) })
  if (!res.ok) throw new Error(`Xero POST /Contacts failed: ${res.status} ${await res.text()}`)
  const data = await res.json() as { Contacts?: XeroContact[] }
  return data.Contacts ?? []
}

type Row = Record<string, unknown>

export async function syncContacts(sb: SupabaseClient, userId: string): Promise<SyncSummary> {
  const conn = await getValidConnection(sb, userId)
  if (!conn) throw new Error('Not connected to Xero')

  const summary: SyncSummary = { created: 0, updated: 0, pushed: 0, errors: [] }

  const xeroContacts = await fetchAllContacts(conn)

  const { data: allRows } = await sb.from('clients').select('*').eq('user_id', userId)
  const rows: Row[] = allRows ?? []

  // Index by Xero ContactID, normalised email/name, normalised company name
  const byId   = new Map<string, Row>()
  const byKey  = new Map<string, Row>()
  const byComp = new Map<string, Row>()
  for (const r of rows) {
    if (r.xero_contact_id) byId.set(r.xero_contact_id as string, r)
    const key  = norm(r.email as string) || norm(r.name as string)
    const comp = normCompany(r.name as string)
    if (key)  byKey.set(key, r)
    if (comp) byComp.set(comp, r)
  }

  const now = () => new Date().toISOString()

  // ── PULL (Xero → app) ──────────────────────────────────────────────────────
  for (const xc of xeroContacts) {
    if (!xc.ContactID || !xc.Name) continue
    const isSupplier = !!xc.IsSupplier
    const isCustomer = !!xc.IsCustomer || !isSupplier
    const xUpdated   = parseXeroDate(xc.UpdatedDateUTC)

    const match = byId.get(xc.ContactID)
      || byKey.get(norm(xc.EmailAddress) || norm(xc.Name))
      || byComp.get(normCompany(xc.Name))

    if (match) {
      const appUpdated = Date.parse((match.updated_at as string) || (match.created_at as string) || '') || 0
      if (xUpdated >= appUpdated) {
        const { error } = await sb.from('clients').update({
          name: xc.Name,
          first_name: xc.FirstName ?? match.first_name,
          last_name: xc.LastName ?? match.last_name,
          email: xc.EmailAddress ?? match.email,
          phone: phone(xc) || match.phone,
          address: addr(xc) || match.address,
          xero_contact_id: xc.ContactID,
          xero_synced_at: now(),
          updated_at: now(),
        }).eq('id', match.id)
        if (error) summary.errors.push(`update "${xc.Name}": ${error.message}`)
        else summary.updated++
      }
    } else {
      // Determine client_type from Xero flags
      const clientType = isCustomer && !isSupplier ? 'client' : 'supplier'
      const { error } = await sb.from('clients').insert({
        user_id: userId, name: xc.Name,
        first_name: xc.FirstName ?? '', last_name: xc.LastName ?? '',
        email: xc.EmailAddress ?? '', phone: phone(xc), address: addr(xc),
        notes: '', added_from: 'xero', client_type: clientType,
        xero_contact_id: xc.ContactID, xero_synced_at: now(), updated_at: now(),
      })
      if (error) summary.errors.push(`create "${xc.Name}": ${error.message}`)
      else summary.created++
    }
  }

  // ── PUSH (app → Xero) — contacts not yet linked to a Xero contact ──────────
  const xByKey  = new Map<string, XeroContact>()
  const xByComp = new Map<string, XeroContact>()
  for (const xc of xeroContacts) {
    const k = norm(xc.EmailAddress) || norm(xc.Name)
    if (k) xByKey.set(k, xc)
    const comp = normCompany(xc.Name)
    if (comp) xByComp.set(comp, xc)
  }

  const toPush = rows.filter(r =>
    !r.xero_contact_id
    && !xByKey.get(norm(r.email as string) || norm(r.name as string))
    && !xByComp.get(normCompany(r.name as string))
  )

  for (const r of toPush) {
    const name = (r.name as string) || [r.first_name, r.last_name].filter(Boolean).join(' ')
    if (!name) continue
    const t = (r.client_type as string) || 'client'
    const payload: XeroContact = {
      Name: name,
      FirstName: (r.first_name as string) || undefined,
      LastName: (r.last_name as string) || undefined,
      EmailAddress: (r.email as string) || undefined,
      IsCustomer: t === 'client' || undefined,
      IsSupplier: (t === 'supplier' || t === 'subcontractor') || undefined,
      Phones: r.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: r.phone as string }] : undefined,
      Addresses: r.address ? [{ AddressType: 'STREET', AddressLine1: r.address as string }] : undefined,
    }
    try {
      const created = await putContacts(conn, [payload])
      const cid = created[0]?.ContactID
      if (cid) {
        await sb.from('clients').update({ xero_contact_id: cid, xero_synced_at: now() }).eq('id', r.id)
        summary.pushed++
      }
    } catch (e) {
      summary.errors.push(`push "${name}": ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  return summary
}
