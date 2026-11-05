// Leads offered wherever a client is picked (a new take-off, a new quote, a quick quote): a lead is someone who has asked for a price but is not a contact yet, so the pickers list the leads below the clients.
// This file is the pure rules: which leads are offered (every lead except a Lost one, and not one who is already a contact: the same email or phone as a client) and how a typed search narrows them. The rows are read
// from quote_requests by components/useLeadOptions.ts. Rules for the stages are in lib/leads.ts.

import { leadStatusOf, LEAD_STATUS_LABEL, findSamePerson, type LeadStatus } from './leads'

/** The columns read from quote_requests (the always-there ones: nothing that leads.sql adds) */
export interface LeadRowLite {
  id: string
  client_name?: string | null
  client_email?: string | null
  client_phone?: string | null
  project_address?: string | null
  status?: string | null
  created_at?: string | null
}

export interface LeadOption {
  id: string
  name: string
  email: string
  phone: string
  /** the address as the lead keeps it (one text, the postcode on the end) */
  address: string
  stage: LeadStatus
  stageLabel: string
}

const clean = (s: string | null | undefined) => (s || '').trim()
const digits = (s: string) => s.replace(/\D/g, '')

/** The leads to offer, newest first: every lead with a name except a Lost one, leaving out a lead who is already one of the clients (the same email or phone number), since the client is listed already. */
export function leadOptionsFrom(rows: LeadRowLite[], clients: { email?: string | null; phone?: string | null }[]): LeadOption[] {
  const out: (LeadOption & { at: string })[] = []
  for (const r of rows) {
    const name = clean(r.client_name)
    if (!name) continue
    const stage = leadStatusOf(r.status)
    if (stage === 'lost') continue
    const email = clean(r.client_email), phone = clean(r.client_phone)
    if (findSamePerson({ email, phone }, clients)) continue
    out.push({ id: r.id, name, email, phone, address: clean(r.project_address), stage, stageLabel: LEAD_STATUS_LABEL[stage], at: clean(r.created_at) })
  }
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return out.map(({ at: _at, ...o }) => o)
}

/** The leads that match what was typed: part of the name, the email, the address, or the digits of the phone number; every lead when nothing is typed. */
export function filterLeadOptions(options: LeadOption[], query: string): LeadOption[] {
  const q = clean(query).toLowerCase()
  if (!q) return options
  const qd = digits(q)
  return options.filter(o => o.name.toLowerCase().includes(q) || o.email.toLowerCase().includes(q) || o.address.toLowerCase().includes(q) || (qd.length >= 3 && digits(o.phone).includes(qd)))
}
