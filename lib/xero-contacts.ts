// Two-way contact sync between the app (clients, suppliers, subcontractors) and Xero Contacts.
// Manual trigger, most-recent-edit-wins. Server-only.
//
// All three CRM types live in the `clients` table with a `client_type` column.
// The separate `suppliers` table is used by the document inbox and is also synced.
// Xero has no "subcontractor" concept — subcontractors are pushed as IsSupplier:true.

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
  subcontractorsCreatedLocal: number; subcontractorsUpdatedLocal: number; subcontractorsPushed: number
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

// Strip common UK/US legal suffixes so "Smith Ltd" matches "Smith Limited" etc.
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

function indexRows(rows: Row[]): { byId: Map<string, Row>; byKey: Map<string, Row>; byComp: Map<string, Row> } {
  const byId = new Map<string, Row>()
  const byKey = new Map<string, Row>()
  const byComp = new Map<string, Row>()
  for (const r of rows) {
    if (r.xero_contact_id) byId.set(r.xero_contact_id as string, r)
    const key = norm(r.email as string) || norm(r.name as string)
    const comp = normCompany(r.name as string)
    if (key)  byKey.set(key, r)
    if (comp) byComp.set(comp, r)
  }
  return { byId, byKey, byComp }
}

function findInIndex(
  { byId, byKey, byComp }: ReturnType<typeof indexRows>,
  xc: XeroContact,
): Row | undefined {
  return byId.get(xc.ContactID!)
    || byKey.get(norm(xc.EmailAddress) || norm(xc.Name))
    || byComp.get(normCompany(xc.Name))
}

export async function syncContacts(sb: SupabaseClient, userId: string): Promise<SyncSummary> {
  const conn = await getValidConnection(sb, userId)
  if (!conn) throw new Error('Not connected to Xero')

  const summary: SyncSummary = {
    clientsCreatedLocal: 0, clientsUpdatedLocal: 0, clientsPushed: 0,
    suppliersCreatedLocal: 0, suppliersUpdatedLocal: 0, suppliersPushed: 0,
    subcontractorsCreatedLocal: 0, subcontractorsUpdatedLocal: 0, subcontractorsPushed: 0,
    errors: [],
  }

  const xeroContacts = await fetchAllContacts(conn)

  // Load all CRM contacts (all three client_types) from the clients table
  const { data: allCrmRows } = await sb.from('clients').select('*').eq('user_id', userId)
  const crmRows = allCrmRows ?? []

  // Load document-inbox suppliers (separate table — used for bill linking)
  const { data: docSupplierData } = await sb.from('suppliers').select('*').eq('user_id', userId)
  const docSupplierRows = docSupplierData ?? []

  // Build indexes
  const crmIdx = indexRows(crmRows)
  const docIdx = indexRows(docSupplierRows)

  const now = () => new Date().toISOString()

  // ── PULL (Xero → app) ──────────────────────────────────────────────────────
  for (const xc of xeroContacts) {
    if (!xc.ContactID || !xc.Name) continue
    const isSupplier = !!xc.IsSupplier
    const isCustomer = !!xc.IsCustomer || !isSupplier // default un-flagged contacts to customer
    const xUpdated   = parseXeroDate(xc.UpdatedDateUTC)

    // Check clients table first (all types)
    const crmMatch = findInIndex(crmIdx, xc)
    if (crmMatch) {
      const appUpdated = Date.parse((crmMatch.updated_at as string) || (crmMatch.created_at as string) || '') || 0
      if (xUpdated >= appUpdated) {
        const { error } = await sb.from('clients').update({
          name: xc.Name,
          first_name: xc.FirstName ?? crmMatch.first_name,
          last_name: xc.LastName ?? crmMatch.last_name,
          email: xc.EmailAddress ?? crmMatch.email,
          phone: phone(xc) || crmMatch.phone,
          address: addr(xc) || crmMatch.address,
          xero_contact_id: xc.ContactID,
          xero_synced_at: now(),
          updated_at: now(),
        }).eq('id', crmMatch.id)
        if (error) {
          summary.errors.push(`update client ${xc.Name}: ${error.message}`)
        } else {
          const t = (crmMatch.client_type as string) || 'client'
          if (t === 'supplier') summary.suppliersUpdatedLocal++
          else if (t === 'subcontractor') summary.subcontractorsUpdatedLocal++
          else summary.clientsUpdatedLocal++
        }
      }
      continue
    }

    // Check document-inbox suppliers table
    const docMatch = findInIndex(docIdx, xc)
    if (docMatch && isSupplier) {
      const appUpdated = Date.parse((docMatch.updated_at as string) || (docMatch.created_at as string) || '') || 0
      if (xUpdated >= appUpdated) {
        const { error } = await sb.from('suppliers').update({
          name: xc.Name,
          email: xc.EmailAddress ?? docMatch.email,
          phone: phone(xc) || docMatch.phone,
          address: addr(xc) || docMatch.address,
          account_number: xc.AccountNumber ?? docMatch.account_number,
          xero_contact_id: xc.ContactID,
          xero_synced_at: now(),
          updated_at: now(),
        }).eq('id', docMatch.id)
        if (error) summary.errors.push(`update doc-supplier ${xc.Name}: ${error.message}`)
        else summary.suppliersUpdatedLocal++
      }
      continue
    }

    // No match anywhere — create in clients table
    if (isCustomer && !isSupplier) {
      const { error } = await sb.from('clients').insert({
        user_id: userId, name: xc.Name,
        first_name: xc.FirstName ?? '', last_name: xc.LastName ?? '',
        email: xc.EmailAddress ?? '', phone: phone(xc), address: addr(xc),
        notes: '', added_from: 'xero', client_type: 'client',
        xero_contact_id: xc.ContactID, xero_synced_at: now(), updated_at: now(),
      })
      if (error) summary.errors.push(`create client ${xc.Name}: ${error.message}`)
      else summary.clientsCreatedLocal++
    } else if (isSupplier) {
      // Suppliers without a doc-inbox record go into the CRM as client_type='supplier'
      const { error } = await sb.from('clients').insert({
        user_id: userId, name: xc.Name,
        first_name: xc.FirstName ?? '', last_name: xc.LastName ?? '',
        email: xc.EmailAddress ?? '', phone: phone(xc), address: addr(xc),
        notes: '', added_from: 'xero', client_type: 'supplier',
        xero_contact_id: xc.ContactID, xero_synced_at: now(), updated_at: now(),
      })
      if (error) summary.errors.push(`create supplier ${xc.Name}: ${error.message}`)
      else summary.suppliersCreatedLocal++
    }
  }

  // ── PUSH (app → Xero) — records not yet in Xero ────────────────────────────
  const xByKey  = new Map<string, XeroContact>()
  const xByComp = new Map<string, XeroContact>()
  for (const xc of xeroContacts) {
    const k = norm(xc.EmailAddress) || norm(xc.Name)
    if (k) xByKey.set(k, xc)
    const comp = normCompany(xc.Name)
    if (comp) xByComp.set(comp, xc)
  }

  function notInXero(r: Row): boolean {
    return !r.xero_contact_id
      && !xByKey.get(norm(r.email as string) || norm(r.name as string))
      && !xByComp.get(normCompany(r.name as string))
  }

  type PushItem = XeroContact & { _localId: string; _table: 'clients' | 'suppliers'; _type: string }

  const toPush: PushItem[] = []

  for (const r of crmRows.filter(notInXero)) {
    const name = (r.name as string) || [r.first_name, r.last_name].filter(Boolean).join(' ')
    if (!name) continue
    const t = (r.client_type as string) || 'client'
    toPush.push({
      Name: name,
      FirstName: (r.first_name as string) || undefined,
      LastName: (r.last_name as string) || undefined,
      EmailAddress: (r.email as string) || undefined,
      // clients → IsCustomer; suppliers and subcontractors → IsSupplier (Xero has no subcontractor flag)
      IsCustomer: t === 'client' || undefined,
      IsSupplier: (t === 'supplier' || t === 'subcontractor') || undefined,
      Phones: r.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: r.phone as string }] : undefined,
      Addresses: r.address ? [{ AddressType: 'STREET', AddressLine1: r.address as string }] : undefined,
      _localId: r.id as string,
      _table: 'clients',
      _type: t,
    })
  }

  for (const r of docSupplierRows.filter(notInXero)) {
    if (!r.name) continue
    toPush.push({
      Name: r.name as string,
      EmailAddress: (r.email as string) || undefined,
      IsSupplier: true,
      AccountNumber: (r.account_number as string) || undefined,
      Phones: r.phone ? [{ PhoneType: 'DEFAULT', PhoneNumber: r.phone as string }] : undefined,
      Addresses: r.address ? [{ AddressType: 'STREET', AddressLine1: r.address as string }] : undefined,
      _localId: r.id as string,
      _table: 'suppliers',
      _type: 'supplier',
    })
  }

  for (const item of toPush) {
    const { _localId, _table, _type, ...payload } = item
    try {
      const created = await putContacts(conn, [payload])
      const cid = created[0]?.ContactID
      if (cid) {
        await sb.from(_table).update({ xero_contact_id: cid, xero_synced_at: now() }).eq('id', _localId)
        if (_type === 'supplier') summary.suppliersPushed++
        else if (_type === 'subcontractor') summary.subcontractorsPushed++
        else summary.clientsPushed++
      }
    } catch (e) {
      summary.errors.push(`push ${_type} "${item.Name}": ${e instanceof Error ? e.message : 'failed'}`)
    }
  }

  return summary
}
