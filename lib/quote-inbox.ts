// A supplier's own quote arriving (emailed to the quotes address, or dropped onto a request by hand): read it, work out which price request and which supplier it is from, and either record it as
// that supplier's reply (marked "please check", never approved for you) or park it in the unmatched list for a person to assign. Server only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { rowToOrder, rowToQuote, poRef, type JobOrder } from '@/lib/job-orders'
import { findPoNumbers, matchRequest, pickInvitee, buildReply, type Invitee } from '@/lib/quote-match'
import { readQuoteDocument, type ReadQuote, type RequestContext } from '@/lib/quote-reader'
import { pushToOwner } from '@/lib/push'

const BUCKET = 'job-documents'
const stamp = () => Date.now().toString(36)
const safeName = (n: string) => n.replace(/[^a-z0-9._-]/gi, '_').toLowerCase()

export interface QuoteAttachment { name: string; mime: string; base64: string }
export interface EmailMeta { from: string; subject: string; body: string }

export type InboxResult =
  | { result: 'not_a_quote' }
  | { result: 'attached'; orderId: string; quoteId: string; supplierName: string; po: string; mode: 'itemised' | 'total_only' }
  | { result: 'unmatched'; incomingId: string; reason: string }

/** Everything a reply needs from the read quote, saved onto the supplier's row. Always marked to be checked. */
async function applyReply(sb: SupabaseClient, order: JobOrder, quoteId: string, read: ReadQuote, file: { path: string; name: string }, source: 'email' | 'upload'): Promise<'itemised' | 'total_only'> {
  const reply = buildReply(order.items ?? [], { lines: read.lines, netTotal: read.netTotal, deliveryCharge: read.deliveryCharge })
  // only what the supplier wrote goes in their notes: the app's own remark about how it was read (the total-only line) is shown separately
  const notes = (read.notes || '').slice(0, 1000)
  const base = {
    status: 'replied', price: reply.price, rate_basis: 'fixed', lines: reply.lines, delivery_charge: reply.deliveryCharge,
    delivery_date: read.deliveryDate || null, valid_until: read.validUntil || null, notes,
    replied_at: new Date().toISOString(), source, needs_check: true, file_path: file.path, file_name: file.name,
  }
  // the quote number printed on their own quote (kept once supabase/job-orders-amend.sql has been run)
  const theirRef = (read.quoteNumber || '').trim().slice(0, 60)
  let { error } = await sb.from('job_order_quotes').update(theirRef ? { ...base, supplier_ref: theirRef } : base).eq('id', quoteId)
  if (error && /supplier_ref/i.test(error.message ?? '')) ({ error } = await sb.from('job_order_quotes').update(base).eq('id', quoteId))
  if (error) throw new Error(error.message)
  return reply.mode
}

async function storeFile(sb: SupabaseClient, ownerId: string, att: QuoteAttachment): Promise<string | null> {
  const path = `${ownerId}/quotes/${stamp()}-${safeName(att.name || 'quote.pdf')}`
  const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(att.base64, 'base64'), { contentType: att.mime, upsert: false })
  if (error) { console.error('[quote-inbox] upload failed:', error.message); return null }
  return path
}

/**
 * `force`: set when a person dropped the quote onto a particular request and supplier, so no matching is guessed (and it is taken as a quote whatever the AI thinks it is).
 * Without it, the quote is only used if the AI says it is a quote, and exactly one open request and one supplier fit.
 */
export async function processQuoteAttachment(
  sb: SupabaseClient, ownerId: string, att: QuoteAttachment, meta: EmailMeta, force?: { orderId: string; quoteId: string },
): Promise<InboxResult> {
  const { data: reqRows } = await sb.from('job_orders').select('*').eq('user_id', ownerId).eq('kind', 'quote_request').neq('status', 'cancelled')
  const requests = (reqRows ?? []).map(rowToOrder).filter(r => !r.deletedAt)
  if (requests.length === 0 && !force) return { result: 'not_a_quote' }

  const ctx: RequestContext[] = requests.map(r => ({ poNumber: r.poNumber, title: r.title, items: (r.items ?? []).map(i => ({ id: i.id, name: i.name, qty: i.qty, unit: i.unit })) }))
  const read = await readQuoteDocument({ base64: att.base64, mimeType: att.mime, fileName: att.name }, ctx)
  if (!force && read.kind !== 'quote') return { result: 'not_a_quote' }

  // which request?
  let order: JobOrder | undefined
  let reason = ''
  if (force) order = requests.find(r => r.id === force.orderId)
  else {
    const m = matchRequest(findPoNumbers(meta.subject, meta.body, att.name, ...read.poRefs), requests.map(r => ({ id: r.id, poNumber: r.poNumber })))
    if (m.kind === 'matched') order = requests.find(r => r.id === m.request.id)
    else reason = m.kind === 'ambiguous' ? 'It mentions more than one of your open requests.' : 'No PO number we could match to an open request.'
  }

  // which supplier?
  let inviteId = ''
  let supplierName = read.supplier
  if (order) {
    const { data: inviteRows } = await sb.from('job_order_quotes').select('*').eq('order_id', order.id)
    const invites = (inviteRows ?? []).map(rowToQuote)
    if (force) { inviteId = force.quoteId; supplierName = invites.find(i => i.id === force.quoteId)?.supplierName ?? supplierName }
    else {
      const who: Invitee[] = invites.map(i => ({ id: i.id, supplierName: i.supplierName, supplierEmail: i.supplierEmail }))
      const pick = pickInvitee(who, meta.from, read.supplier)
      if (pick) { inviteId = pick.id; supplierName = pick.supplierName } else reason = 'We could not tell which of the suppliers you asked sent it.'
    }
  }

  const path = await storeFile(sb, ownerId, att)
  if (!path) throw new Error('Could not keep the file')

  if (order && inviteId) {
    const mode = await applyReply(sb, order, inviteId, read, { path, name: att.name }, force ? 'upload' : 'email')
    await pushToOwner(ownerId, 'supplier_replies', {
      title: `Quote from ${supplierName}`,
      body: `${poRef(order.poNumber)} ${order.title}: read from their emailed quote. Please check it.`.slice(0, 180),
      url: order.jobId ? `/jobs?orders=${encodeURIComponent(order.jobId)}` : '/jobs?requests=1', tag: `reply-${inviteId}`,
    })
    return { result: 'attached', orderId: order.id, quoteId: inviteId, supplierName, po: poRef(order.poNumber), mode }
  }

  const { data: inc, error } = await sb.from('incoming_quotes').insert({
    user_id: ownerId, file_name: att.name, storage_path: path, mime_type: att.mime, source_email: meta.from, subject: meta.subject,
    extraction: read, suggested_order_id: order?.id ?? null, reason, status: 'unmatched',
  }).select('id').single()
  if (error || !inc) throw new Error(error?.message || 'Could not save the quote')
  await pushToOwner(ownerId, 'supplier_replies', {
    title: 'A quote came in by email', body: `${read.supplier || meta.from || 'A supplier'}: needs you to say which request it is for.`.slice(0, 180),
    url: '/jobs?requests=1', tag: `incoming-${inc.id}`,
  })
  return { result: 'unmatched', incomingId: inc.id as string, reason }
}

/** A person assigns an unmatched emailed quote to a request's supplier: it becomes that supplier's reply (still marked to be checked). */
export async function assignIncomingQuote(sb: SupabaseClient, ownerId: string, incomingId: string, quoteId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: inc } = await sb.from('incoming_quotes').select('*').eq('id', incomingId).eq('user_id', ownerId).maybeSingle()
  if (!inc || inc.status !== 'unmatched') return { ok: false, error: 'That quote is not waiting to be assigned.' }
  const { data: qRow } = await sb.from('job_order_quotes').select('*').eq('id', quoteId).eq('user_id', ownerId).maybeSingle()
  if (!qRow) return { ok: false, error: 'That supplier was not found.' }
  const { data: oRow } = await sb.from('job_orders').select('*').eq('id', qRow.order_id).eq('user_id', ownerId).maybeSingle()
  if (!oRow) return { ok: false, error: 'That request was not found.' }
  const order = rowToOrder(oRow)
  if (order.kind !== 'quote_request' || order.status === 'cancelled' || order.deletedAt) return { ok: false, error: 'That request is closed.' }
  await applyReply(sb, order, quoteId, inc.extraction as ReadQuote, { path: inc.storage_path as string, name: inc.file_name as string }, 'email')
  await sb.from('incoming_quotes').update({ status: 'assigned' }).eq('id', incomingId)
  return { ok: true }
}

/**
 * Is an email to the quotes address plausibly a supplier's quote for one of the open price requests? Yes if it names one of their PO numbers, or comes from the exact address of a supplier
 * who was asked. Used to decide whether to answer a no-attachment email at all: a stranger or a spammer is never answered. Returns the PO reference to quote back when it is known.
 */
export async function knownQuoteSender(sb: SupabaseClient, ownerId: string, fromEmail: string, ...texts: string[]): Promise<{ known: boolean; ref: string }> {
  const { data: reqRows } = await sb.from('job_orders').select('*').eq('user_id', ownerId).eq('kind', 'quote_request').neq('status', 'cancelled')
  const open = (reqRows ?? []).map(rowToOrder).filter(r => !r.deletedAt)
  if (open.length === 0) return { known: false, ref: '' }
  const m = matchRequest(findPoNumbers(...texts), open.map(r => ({ id: r.id, poNumber: r.poNumber })))
  if (m.kind === 'matched') return { known: true, ref: poRef(m.request.poNumber) }
  if (m.kind === 'ambiguous') return { known: true, ref: '' }
  if (!fromEmail) return { known: false, ref: '' }
  const { data: qs } = await sb.from('job_order_quotes').select('order_id, supplier_email').eq('user_id', ownerId).in('order_id', open.map(r => r.id))
  const mine = (qs ?? []).filter(q => String(q.supplier_email ?? '').trim().toLowerCase() === fromEmail.toLowerCase())
  if (mine.length === 0) return { known: false, ref: '' }
  const orders = [...new Set(mine.map(q => q.order_id as string))]
  return { known: true, ref: orders.length === 1 ? poRef(open.find(r => r.id === orders[0])?.poNumber ?? 0) : '' }
}
