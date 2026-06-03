// Two-way contact sync between the app (clients + suppliers) and Xero Contacts.
// Manual trigger, most-recent-edit-wins. Server-only.

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
  ContactNumber?: string
  IsCustomer?: boolean
  IsSupplier?: boolean
  Phones?: XeroPhone[]
  Addresses?: XeroAddress[]
  UpdatedDateUTC?: string
}

export interface SyncSummary {
  clientsCreatedLocal: number; clientsUpdatedLocal: number; clientsPushed: number
  suppliersCreatedLocal: number; suppliersUpdatedLocal: number; suppliersPushed: number
  errors: string[]
}

// Xero serialises dates as "/Date(1573493566943+0000)/"
function parseXeroDate(s?: string): number {
  if (!s) return 0
  const m = s.match(/\/Date\((\d+)/)
  return m ? Number(m[1]) : (Date.parse(s) || 0)
}
const phone = (c: XeroContact) => c.Phones?.find(p => p.PhoneNumber)?.PhoneNumber ?? ''
const addr  = (c: XeroContact) => c.Addresses?.find(a => a.AddressLine1)?.AddressLine1 ?? ''
const norm  = (s?: string) => (s || '').trim().toLowerCase()

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

export async function syncContacts(sb: SupabaseClient, userId: string): Promise<SyncSummary> {
  const conn = await getValidConnection(sb, userId)
  if (!conn) throw new Error('Not connected to Xero')

  const summary: SyncSummary = {
    clientsCreatedLocal: 0, clientsUpdatedLocal: 0, clientsPushed: 0,
    suppliersCreatedLocal: 0, suppliersUpdatedLocal: 0, suppliersPushed: 0, errors: [],
  }

  const xeroContacts = await fetchAllContacts(conn)
  const { data: clients } = await sb.from('clients').select('*').eq('user_id', userId)
  const { data: suppliers } = await sb.from('suppliers').select('*').eq('user_id', userId)
  const clientRows = clients ?? []
  const supplierRows = suppliers ?? []

  // Index app rows
  const cById = new Map<string, Record<string, unknown>>()
  const cByKey = new Map<string, Record<string, unknown>>()
  for (const c of clientRows) {
    if (c.xero_contact_id) cById.set(c.xero_contact_id, c)
    const key = norm(c.email as string) || norm(c.name as string)
    if (key) cByKey.set(key, c)
  }
  const sById = new Map<string, Record<string, unknown>>()
  const sByKey = new Map<string, Record<string, unknown>>()
  for (const s of supplierRows) {
    if (s.xero_contact_id) sById.set(s.xero_contact_id, s)
    const key = norm(s.email as string) || norm(s.name as string)
    if (key) sByKey.set(key, s)
  }

  const now = () => new Date().toISOString()

  // ── PULL (Xero → app) ───────────────────────────────────────────────────────
  for (const xc of xeroContacts) {
    if (!xc.ContactID || !xc.Name) continue
    const isSupplier = !!xc.IsSupplier
    const isCustomer = !!xc.IsCustomer || !isSupplier  // default un-flagged contacts to customer
    const xUpdated = parseXeroDate(xc.UpdatedDateUTC)

    if (isCustomer) {
      const match = cById.get(xc.ContactID) || cByKey.get(norm(xc.EmailAddress) || norm(xc.Name))
      if (!match) {
        const { error } = await sb.from('clients').insert({
          user_id: userId, name: xc.Name, first_name: xc.FirstName ?? '', last_name: xc.LastName ?? '',
          email: xc.EmailAddress ?? '', phone: phone(xc), address: addr(xc), notes: '', added_from: 'xero',
          xero_contact_id: xc.ContactID, xero_synced_at: now(), updated_at: now(),
        })
        if (error) summary.errors.push(`client insert ${xc.Name}: ${error.message}`); else summary.clientsCreatedLocal++
      } else {
        const appUpdated = Date.parse((match.updated_at as string) || (match.created_at as string) || '') || 0
        if (xUpdated >= appUpdated) {
          const { error } = await sb.from('clients').update({
            name: xc.Name, first_name: xc.FirstName ?? match.first_name, last_name: xc.LastName ?? match.last_name,
            email: xc.EmailAddress ?? match.email, phone: phone(xc) || match.phone, address: addr(xc) || match.address,
            xero_contact_id: xc.ContactID, xero_synced_at: now(), updated_at: now(),
          }).eq('id', match.id)
          if (error) summary.errors.push(`client update ${xc.Name}: ${error.message}`); else summary.clientsUpdatedLocal++
        }
      }
    }

    if (isSupplier) {
      const match = sById.get(xc.ContactID) || sByKey.get(norm(xc.EmailAddress) || norm(xc.Name))
      if (!match) {
        const { error } = await sb.from('suppliers').insert({
          user_id: userId, name: xc.Name, contact_name: [xc.FirstName, xc.LastName].filter(Boolean).join(' '),
          email: xc.EmailAddress ?? '', phone: phone(xc), address: addr(xc), notes: '',
          account_number: xc.AccountNumber ?? '', added_from: 'xero',
          xero_contact_id: xc.ContactID, xero_synced_at: now(), updated_at: now(),
        })
        if (error) summary.errors.push(`supplier insert ${xc.Name}: ${error.message}`); else summary.suppliersCreatedLocal++
      } else {
        const appUpdated = Date.parse((match.updated_at as string) || (match.created_at as string) || '') || 0
        if (xUpdated >= appUpdated) {
          const { error } = await sb.from('suppliers').update({
            name: xc.Name, email: xc.EmailAddress ?? match.email, phone: phone(xc) || match.phone,
            address: addr(xc) || match.address, account_number: xc.AccountNumber ?? match.account_number,
            xero_contact_id: xc.ContactID, xero_synced_at: now(), updated_at: now(),
          }).eq('id', match.id)
          if (error) summary.errors.push(`supplier update ${xc.Name}: ${error.message}`); else summary.suppliersUpdatedLocal++
        }
      }
    }
  }

  // ── PUSH (app → Xero) — app records not yet linked to a Xero contact ─────────
  const xByKey = new Map<string, XeroContact>()
  for (const xc of xeroContacts) { const k = norm(xc.EmailAddress) || norm(xc.Name); if (k) xByKey.set(k, xc) }

  const clientsToPush = clientRows.filter(c => !c.xero_contact_id && !xByKey.get(norm(c.email as string) || norm(c.name as string)))
    .map(c => ({
      Name: (c.name as string) || [c.first_name, c.last_name].filter(Boolean).join(' '),
      FirstName: (c.first_name as string) || undefined, LastName: (c.last_name as string) || undefined,
      EmailAddress: (c.email as string) || undefined, IsCustomer: true,
      Phones: c.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: c.phone as string }] : undefined,
      Addresses: c.address ? [{ AddressType: 'STREET', AddressLine1: c.address as string }] : undefined,
      _localId: c.id as string,
    })).filter(x => x.Name)

  const suppliersToPush = supplierRows.filter(s => !s.xero_contact_id && !xByKey.get(norm(s.email as string) || norm(s.name as string)))
    .map(s => ({
      Name: s.name as string, EmailAddress: (s.email as string) || undefined, IsSupplier: true,
      AccountNumber: (s.account_number as string) || undefined,
      Phones: s.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: s.phone as string }] : undefined,
      Addresses: s.address ? [{ AddressType: 'STREET', AddressLine1: s.address as string }] : undefined,
      _localId: s.id as string,
    })).filter(x => x.Name)

  // Push clients
  for (const item of clientsToPush) {
    try {
      const { _localId, ...payload } = item
      const created = await putContacts(conn, [payload])
      const cid = created[0]?.ContactID
      if (cid) { await sb.from('clients').update({ xero_contact_id: cid, xero_synced_at: now() }).eq('id', _localId); summary.clientsPushed++ }
    } catch (e) { summary.errors.push(`push client: ${e instanceof Error ? e.message : 'failed'}`) }
  }
  // Push suppliers
  for (const item of suppliersToPush) {
    try {
      const { _localId, ...payload } = item
      const created = await putContacts(conn, [payload])
      const cid = created[0]?.ContactID
      if (cid) { await sb.from('suppliers').update({ xero_contact_id: cid, xero_synced_at: now() }).eq('id', _localId); summary.suppliersPushed++ }
    } catch (e) { summary.errors.push(`push supplier: ${e instanceof Error ? e.message : 'failed'}`) }
  }

  return summary
}
