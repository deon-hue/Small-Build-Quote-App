// Switching alerts on and off for THIS phone, tablet or computer (browser side). The device gives us a private address from its own push service when the person allows notifications;
// it is saved against their account (push_subscriptions) so the server can send to it. Nothing here sends anything.

import { createClient } from '@/lib/supabase/client'

export type PushState = 'not-configured' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

const isIos = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)

export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return ''
  const ua = navigator.userAgent
  if (/iPad/i.test(ua)) return 'iPad'
  if (/iPhone/i.test(ua)) return 'iPhone'
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet'
  if (/Windows/i.test(ua)) return 'Windows computer'
  if (/Mac/i.test(ua)) return 'Mac'
  return 'This device'
}

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return await Promise.race([navigator.serviceWorker.ready, new Promise<null>(r => setTimeout(() => r(null), 4000))])
  } catch { return null }
}

export async function getPushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (!supported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await readyRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export async function enablePush(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!supported() || !VAPID_PUBLIC_KEY) return { ok: false, error: 'This device cannot show notifications here.' }
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, error: 'Notifications were not allowed. You can allow them in your phone or browser settings, then try again.' }
    const reg = await readyRegistration()
    if (!reg) return { ok: false, error: 'The app is still starting up. Wait a moment and try again.' }
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return { ok: false, error: 'This device did not give a usable address for notifications.' }
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, error: 'Please sign in again.' }
    const { data: owner } = await sb.rpc('get_effective_owner_id')
    const { error } = await sb.from('push_subscriptions').upsert(
      { user_id: user.id, owner_id: (owner as string) || user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device_label: deviceLabel() },
      { onConflict: 'endpoint' },
    )
    if (error) return { ok: false, error: /does not exist|schema cache|PGRST205|42P01/i.test(error.message) ? 'Notifications need a small database update first: run supabase/push-notifications.sql in the Supabase SQL editor.' : `Could not save this device. ${error.message}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not turn notifications on.' }
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await readyRegistration()
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) {
      await createClient().from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch { /* nothing to undo */ }
}
