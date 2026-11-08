import type { SupabaseClient } from '@supabase/supabase-js'
import { toJpeg } from './order-item-images'
import { isImageType, leadFileProblem, leadFileType, safeFileName, LEAD_FILE_MAX_BYTES } from './lead-files'
import { isSentFilePath, mergeSent, sentItemFromRow, type SentChannel, type SentFile, type SentItem } from './sent-items'

// The browser half of "Sent to them" (rules are lib/sent-items.ts): the records are read and written with the signed-in company's own login (row security keeps each company's apart), and the files are
// kept in the private job-documents bucket under <user>/sent/<item>/, which that bucket's policy already allows for your own folder, so there is no storage setup. A screen is given a `SentStore` so it
// does not care where the records live (a test gives it a stand-in).

const BUCKET = 'job-documents'
const TABLE = 'sent_items'
/** the longest side of a kept picture: big enough to read a dimension on a drawing */
const PICTURE_SIDE = 2000
const MISSING = /does not exist|schema cache|PGRST205|42P01/i

export interface SentStore {
  /** the records for a person: sent to their contact, to their email address, or from any of their leads. `missing` is true when supabase/sent-items.sql has not been run. */
  list(who: { clientId?: string | null; email?: string; leadIds?: string[] }): Promise<{ items: SentItem[]; missing: boolean }>
  /** the ids of the leads that have this email address (so a contact's history includes what was sent to them when they were only a lead) */
  leadIdsFor(email: string): Promise<string[]>
  /** keep a record (a message logged after the fact, or a WhatsApp message the person says they sent) */
  add(row: { leadId: string | null; clientId: string | null; channel: SentChannel; kind: 'sent' | 'logged'; subject: string; body: string; files: SentFile[]; toName: string; toEmail: string; toPhone: string; showInPortal: boolean; sentAt?: string }): Promise<{ item: SentItem } | { error: string }>
  setPortal(id: string, show: boolean): Promise<string | null>
  /** delete a record and the stored copies of its files */
  remove(item: SentItem): Promise<string | null>
  /** shrink a picture and store one file for a message about to be sent; `key` groups a message's files (a random word until it is saved) */
  upload(file: File, key: string): Promise<{ file: SentFile } | { error: string }>
  /** drop uploaded files that were never sent */
  discard(files: SentFile[]): Promise<void>
  /** links the screen can open the files from, by path */
  sign(files: SentFile[]): Promise<Record<string, string>>
}

export function createSentStore(sb: SupabaseClient): SentStore {
  return {
    async list(who) {
      const found: SentItem[][] = []
      let missing = false
      const run = async (q: PromiseLike<{ data: unknown; error: { message: string } | null }>) => {
        const { data, error } = await q
        if (error) { if (MISSING.test(error.message)) missing = true; return }
        found.push(((data ?? []) as Record<string, unknown>[]).map(sentItemFromRow))
      }
      if (who.clientId) await run(sb.from(TABLE).select('*').eq('client_id', who.clientId).order('sent_at', { ascending: false }).limit(200))
      const email = (who.email || '').trim().toLowerCase()
      if (email) await run(sb.from(TABLE).select('*').in('to_email', Array.from(new Set([email, (who.email || '').trim()]))).order('sent_at', { ascending: false }).limit(200))
      if (who.leadIds?.length) await run(sb.from(TABLE).select('*').in('lead_id', who.leadIds.slice(0, 50)).order('sent_at', { ascending: false }).limit(200))
      return { items: mergeSent(...found), missing }
    },

    async leadIdsFor(email) {
      const e = (email || '').trim()
      if (!e) return []
      const { data } = await sb.from('quote_requests').select('id').in('client_email', Array.from(new Set([e, e.toLowerCase()]))).limit(50)
      return ((data ?? []) as { id: string }[]).map(r => r.id)
    },

    async add(r) {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return { error: 'You are not signed in: please refresh and try again.' }
      const { data: owner } = await sb.rpc('get_effective_owner_id')
      const ownerId = typeof owner === 'string' && owner ? owner : user.id
      const { data, error } = await sb.from(TABLE).insert({
        user_id: ownerId, lead_id: r.leadId, client_id: r.clientId, channel: r.channel, kind: r.kind, subject: r.subject.slice(0, 200), body: r.body.slice(0, 8000), files: r.files,
        to_name: r.toName, to_email: r.toEmail, to_phone: r.toPhone, show_in_portal: r.showInPortal, sent_by: user.id, ...(r.sentAt ? { sent_at: r.sentAt } : {}),
      }).select('*').single()
      if (error || !data) return { error: MISSING.test(error?.message || '') ? 'Run supabase/sent-items.sql first: the record could not be saved.' : `The record could not be saved: ${error?.message || 'try again'}` }
      return { item: sentItemFromRow(data as Record<string, unknown>) }
    },

    async setPortal(id, show) {
      const { error } = await sb.from(TABLE).update({ show_in_portal: show }).eq('id', id)
      return error ? error.message : null
    },

    async remove(item) {
      const { error } = await sb.from(TABLE).delete().eq('id', item.id)
      if (error) return error.message
      const paths = item.files.map(f => f.path).filter(isSentFilePath)
      for (let i = 0; i < paths.length; i += 100) { try { await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)) } catch { /* left behind at worst */ } }
      return null
    },

    async upload(file, key) {
      const problem = leadFileProblem(file.name, file.type, file.size)
      if (problem) return { error: problem }
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return { error: 'You are not signed in: please refresh and try again.' }
      let blob: Blob = file
      let name = file.name || 'file'
      let type = leadFileType(file.name, file.type)
      let asImage = false
      if (isImageType(type)) {
        try {
          blob = await toJpeg(file, PICTURE_SIDE)
          type = 'image/jpeg'; asImage = true
          name = name.replace(/\.[A-Za-z0-9]{1,5}$/, '') + '.jpg'
        } catch { blob = file; asImage = false }   // a picture this browser cannot open (an iPhone HEIC on a computer) is kept as a file exactly as it was
      }
      if (blob.size > LEAD_FILE_MAX_BYTES) return { error: `${file.name} is too big to send.` }
      const k = (key || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 60) || 'new'
      const path = `${user.id}/sent/${k}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}-${safeFileName(name)}`
      if (!isSentFilePath(path)) return { error: `${file.name} could not be given a safe name.` }
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type })
      if (up.error) return { error: `${file.name} could not be saved: ${up.error.message || 'the upload failed'}` }
      return { file: { name, path, isImage: asImage, size: blob.size } }
    },

    async discard(files) {
      const paths = files.map(f => f.path).filter(isSentFilePath)
      for (let i = 0; i < paths.length; i += 100) { try { await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100)) } catch { /* left behind at worst */ } }
    },

    async sign(files) {
      const paths = files.map(f => f.path).filter(isSentFilePath)
      if (!paths.length) return {}
      const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600)
      const out: Record<string, string> = {}
      for (const r of data ?? []) if (r.path && r.signedUrl) out[r.path] = r.signedUrl
      return out
    },
  }
}
