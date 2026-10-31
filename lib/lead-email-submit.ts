// The database half of "leads from email": an email that reached the company's leads address (or was forwarded with LEAD at the start of the subject) becomes a New lead in the company's Leads list,
// or, when that person already has an open lead, is added to it. What the email says is read by lib/lead-from-message.ts; the route is app/api/email-ingest. The client is passed in, so it can be tested with a stand-in.

import type { SupabaseClient } from '@supabase/supabase-js'
import { ENQUIRIES_PER_HOUR, isMissingSchema } from './enquiry-submit'
import { ENQUIRY_MAX_FILES, type EnquiryFile } from './enquiry'
import { LEAD_FILES_MAX } from './lead-files'
import { todayUk, isOpenLead } from './leads'
import type { ParsedLead } from './lead-from-message'

export interface LeadFileIn { name: string; mime: string; base64: string }

export interface LeadEmailResult {
  outcome: 'lead_created' | 'lead_updated' | 'lead_skipped'
  /** a sentence for the "emails received" log */
  detail: string
  leadId?: string
  /** the files that were kept with the lead */
  files?: EnquiryFile[]
  /** a customer (not the builder) wrote it, so the company is worth telling */
  notify: boolean
}

/** A person writing again within this many days is added to their open lead instead of making a second one */
export const SAME_PERSON_DAYS = 30
const NOTE_MAX = 4000

const prettyFromEmail = (e: string) => {
  const local = (e.split('@')[0] || '').replace(/[._+-]+/g, ' ').replace(/\d+/g, '').trim()
  return local ? local.replace(/\b\w/g, c => c.toUpperCase()).slice(0, 60) : ''
}

const ukDate = (nowMs: number) => new Date(nowMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' })

/** Saves the email as a lead. `upload` puts the attached files where the lead can show them (it is only called once the email is going to be saved). */
export async function saveLeadFromEmail(
  sb: SupabaseClient, userId: string, p: ParsedLead, attachments: LeadFileIn[],
  opts: { nowMs?: number; upload?: (files: LeadFileIn[]) => Promise<EnquiryFile[]> } = {},
): Promise<LeadEmailResult> {
  const nowMs = opts.nowMs ?? Date.now()
  const skip = (detail: string): LeadEmailResult => ({ outcome: 'lead_skipped', detail, notify: false })
  const notify = !p.fromBuilder

  if (!p.message.trim() && !p.email && !p.phone && attachments.length === 0) return skip('There was nothing in the email to make a lead from (no words, no contact details and no file).')

  const hourAgo = new Date(nowMs - 3600 * 1000).toISOString()
  const recent = await sb.from('quote_requests').select('id', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', hourAgo)
  if (!recent.error && (recent.count ?? 0) >= ENQUIRIES_PER_HOUR) return skip(`${ENQUIRIES_PER_HOUR} leads have already come in this hour, so this one was not added (a safeguard against a flood). It is in your email.`)

  const files = attachments.length && opts.upload ? (await opts.upload(attachments)).slice(0, ENQUIRY_MAX_FILES) : []
  const body = p.message.trim()
  const subject = p.subject.trim()

  // the same person already has an open lead: add this to it
  const since = new Date(nowMs - SAME_PERSON_DAYS * 24 * 3600 * 1000).toISOString()
  for (const [col, val] of [['client_email', p.email], ['client_phone', p.phone]] as const) {
    if (!val) continue
    const found = await sb.from('quote_requests').select('id, status, admin_notes, client_files').eq('user_id', userId).eq(col, val).gte('created_at', since)
    const open = ((found.data ?? []) as { id: string; status: string; admin_notes?: string; client_files?: EnquiryFile[] }[]).find(l => isOpenLead(l.status))
    if (found.error || !open) continue
    const add = `— Another email, ${ukDate(nowMs)}${subject ? `: ${subject}` : ''}\n${body.slice(0, 1200)}${p.note ? `\n(Your note: ${p.note.slice(0, 300)})` : ''}`
    const notes = `${(open.admin_notes || '').trim()}${open.admin_notes ? '\n\n' : ''}${add}`.slice(-NOTE_MAX)
    // never drops a file already on the lead (including ones the builder added by hand): only the new ones are held back when the lead is full
    const already = Array.isArray(open.client_files) ? open.client_files : []
    const merged = [...already, ...files.slice(0, Math.max(0, LEAD_FILES_MAX - already.length))]
    const patch: Record<string, unknown> = { admin_notes: notes, ...(files.length ? { client_files: merged } : {}), chase_on: todayUk(new Date(nowMs)) }
    let upd = await sb.from('quote_requests').update(patch).eq('id', open.id)
    if (upd.error && isMissingSchema(upd.error)) { const { chase_on: _c, ...plain } = patch; upd = await sb.from('quote_requests').update(plain).eq('id', open.id) }
    if (upd.error) return skip('The email was from someone who already has a lead, but it could not be added to it just now. It is in your email.')
    return { outcome: 'lead_updated', detail: `Added to the open lead for ${p.email || p.phone} (it is now due for a chase today).`, leadId: open.id, notify }
  }

  const name = p.name.trim() || prettyFromEmail(p.email) || 'Email lead'
  const scope = [subject ? `Subject: ${subject}` : '', body || (files.length ? '(Photos or plans attached.)' : '')].filter(Boolean).join('\n\n').slice(0, 5000)
  const row: Record<string, unknown> = {
    user_id: userId, client_name: name, client_email: p.email, client_phone: p.phone,
    project_type: '', project_address: '', scope_text: scope, admin_notes: p.note.slice(0, NOTE_MAX),
    ai_phases: [], estimated_total: 0, client_files: files, status: 'pending', source: 'Email',
  }
  let ins = await sb.from('quote_requests').insert(row).select('id').single()
  if (ins.error && isMissingSchema(ins.error)) { const { source: _s, ...plain } = row; ins = await sb.from('quote_requests').insert(plain).select('id').single() }
  if (ins.error || !ins.data) { console.error('[lead-email] could not save:', ins.error); return skip('The lead could not be saved just now. The email is still in your inbox.') }
  return { outcome: 'lead_created', detail: `New lead: ${name}${p.email ? ` <${p.email}>` : ''}${files.length ? `, ${files.length} file${files.length === 1 ? '' : 's'} attached` : ''}.`, leadId: (ins.data as { id: string }).id, files, notify }
}

/** Puts an email's PDFs and photos in the public client-uploads bucket (the one the enquiry form uses), each in its own random folder, and returns where they are. Server only. */
export async function uploadLeadFiles(sb: SupabaseClient, files: LeadFileIn[]): Promise<EnquiryFile[]> {
  const { randomUUID } = await import('crypto')
  const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const out: EnquiryFile[] = []
  const bucketOptions = { public: true, fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf'] }
  await sb.storage.createBucket('client-uploads', bucketOptions).catch(() => {})
  for (const f of files.slice(0, ENQUIRY_MAX_FILES)) {
    const ext = EXT[f.mime]; if (!ext) continue
    const buf = Buffer.from(f.base64, 'base64')
    if (!buf.length || buf.length > 8 * 1024 * 1024) continue
    const base = f.name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'file'
    const path = `${randomUUID()}/${base}.${ext}`
    const { error } = await sb.storage.from('client-uploads').upload(path, buf, { contentType: f.mime, upsert: false })
    if (error) { console.error('[lead-email] upload failed:', error.message); continue }
    out.push({ url: sb.storage.from('client-uploads').getPublicUrl(path).data.publicUrl, name: `${base}.${ext}`, isImage: f.mime.startsWith('image/') })
  }
  return out
}

