// Sending alerts to a person's phone and tablet (web push). Server only. Each device that was switched on in Settings has a saved address; this sends to those, honours what the
// person turned off in Settings, never sends the same alert twice (a key per alert), and tidies away devices that no longer exist.
// It needs three secret settings on the host (VAPID_PRIVATE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_SUBJECT). Until they are there it quietly does nothing, so no feature depends on it.

import webpush from 'web-push'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { PushCategory } from '@/lib/push-categories'

export type { PushCategory }

export interface PushPayload { title: string; body: string; /** where tapping it goes, on this site */ url: string; /** a later alert with the same tag replaces an earlier one */ tag?: string }

let configured: boolean | null = null
export function pushConfigured(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) { configured = false; return false }
  try { webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@buildospro.ai', pub, priv); configured = true } catch { configured = false }
  return configured
}

interface Prefs { enabled: boolean; supplier_replies: boolean; sub_notes: boolean; timesheets: boolean; selections: boolean; daily_summary: boolean }
const DEFAULT_PREFS: Prefs = { enabled: true, supplier_replies: true, sub_notes: true, timesheets: true, selections: true, daily_summary: true }

/**
 * Sends one alert to every device of the given people, for those who have that kind of alert on. `category: null` skips the preferences (a test the person asked for).
 * `dedupeKey`: if this person has already been sent that key, nothing is sent. Never throws.
 */
export async function pushToUsers(userIds: string[], category: PushCategory | null, payload: PushPayload, opts: { dedupeKey?: string } = {}): Promise<{ sent: number; skipped?: string }> {
  try {
    if (!pushConfigured()) return { sent: 0, skipped: 'not configured' }
    if (userIds.length === 0) return { sent: 0 }
    const sb = createServiceRoleClient()
    const { data: prefRows } = await sb.from('notification_prefs').select('*').in('user_id', userIds)
    const prefsOf = (id: string): Prefs => ({ ...DEFAULT_PREFS, ...((prefRows ?? []).find(r => r.user_id === id) as Partial<Prefs> | undefined) })
    const wanted = userIds.filter(id => { const p = prefsOf(id); return category === null || (p.enabled && p[category]) })
    if (wanted.length === 0) return { sent: 0, skipped: 'switched off' }

    let todo = wanted
    if (opts.dedupeKey) {
      const { data: done } = await sb.from('push_sent').select('user_id').eq('key', opts.dedupeKey).in('user_id', wanted)
      const had = new Set((done ?? []).map(r => r.user_id as string))
      todo = wanted.filter(id => !had.has(id))
      if (todo.length === 0) return { sent: 0, skipped: 'already sent' }
    }

    const { data: subs } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', todo)
    if (!subs || subs.length === 0) return { sent: 0, skipped: 'no devices' }
    const body = JSON.stringify(payload)
    let sent = 0
    const gone: string[] = []
    await Promise.all(subs.map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } }, body, { TTL: 60 * 60 * 12 })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) gone.push(s.id as string)
      }
    }))
    if (gone.length) await sb.from('push_subscriptions').delete().in('id', gone)
    if (opts.dedupeKey && sent > 0) {
      const delivered = new Set(subs.map(s => s.user_id as string))
      await sb.from('push_sent').upsert([...delivered].map(user_id => ({ user_id, key: opts.dedupeKey!, sent_at: new Date().toISOString() })), { onConflict: 'user_id,key' })
    }
    return { sent }
  } catch (e) {
    console.error('[push] failed:', e instanceof Error ? e.message : e)
    return { sent: 0, skipped: 'error' }
  }
}

/** The company owner is the person who is told (team members are not sent these alerts yet). */
export const pushToOwner = (ownerId: string, category: PushCategory, payload: PushPayload, opts: { dedupeKey?: string } = {}) => pushToUsers([ownerId], category, payload, opts)
