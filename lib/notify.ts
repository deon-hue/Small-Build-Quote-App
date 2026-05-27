/**
 * Client-side notification helper.
 *
 * Calls POST /api/notify-client and swallows all errors — notifications
 * are always fire-and-forget and must never block or break the main action.
 */

import type { NotifyClientPayload } from '@/app/api/notify-client/route'
export type { NotifyClientPayload }

export async function notifyClient(payload: NotifyClientPayload): Promise<void> {
  try {
    await fetch('/api/notify-client', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
  } catch (err) {
    // Non-fatal — log and move on
    console.warn('[notifyClient] failed (non-fatal):', err)
  }
}
