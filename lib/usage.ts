// Daily usage limits for signed-in features that cost the platform money (AI, emails/WhatsApp). The counting and the
// limit live in the database (supabase/usage-limits.sql → consume_usage), so two quick clicks can't both slip under it.
// Call usageGuard() right after the sign-in check in a route; if it returns a response, return that response.
//
// It runs BEFORE the "AI key configured" check on purpose: the limit is enforced (and testable) even where no key is set.
// It fails closed: if the usage check itself can't run, the feature is refused rather than left unlimited.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

interface UsageResult { allowed: boolean; reason?: string; used?: number; limit?: number }

interface GuardOptions {
  /** Let a subcontractor use this feature; their use is charged to the contractor they work for. */
  allowPortal?: boolean
  /** Return the message as `{ reply }` with status 200 (the chat endpoints show `reply` to the user). */
  asReply?: boolean
}

export async function usageGuard(
  sb: SupabaseClient,
  kind: 'ai' | 'send',
  route: string,
  opts: GuardOptions = {},
): Promise<NextResponse | null> {
  const respond = (message: string, status: number, extra: Record<string, unknown> = {}) =>
    opts.asReply
      ? NextResponse.json({ reply: message, ...extra })
      : NextResponse.json({ error: message, ...extra }, { status })

  const { data, error } = await sb.rpc('consume_usage', { p_kind: kind, p_route: route, p_allow_portal: !!opts.allowPortal })
  if (error) {
    console.error('[usageGuard] consume_usage failed:', error.message)
    return respond('Usage check is unavailable right now. Please try again in a moment.', 503)
  }

  const r = (data ?? {}) as UsageResult
  if (r.allowed) return null

  if (r.reason === 'limit') {
    return respond(
      kind === 'ai'
        ? `You've reached today's limit for AI features (${r.limit} uses). It resets at midnight — get in touch if you need more.`
        : `You've reached today's limit for sending messages (${r.limit}). It resets at midnight.`,
      429,
      { limitReached: true },
    )
  }
  if (r.reason === 'paused') return respond('This account is paused. Please get in touch to have it re-opened.', 403)
  return respond('This feature is only available to contractor accounts.', 403)
}
