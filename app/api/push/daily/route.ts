// The morning summary. Called once a day by the scheduled job (netlify/functions/push-daily.mts) with the shared secret. For each person who has notifications on, it looks at what needs
// their attention (late deliveries, invoices that should have arrived, price replies to compare, overdue invoices) and sends ONE alert, only if there is something. Never sends twice in a day.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { pushToUsers, pushConfigured } from '@/lib/push'
import { rowToOrder, orderReminders } from '@/lib/job-orders'
import { summaryText } from '@/lib/push-summary'
import { rowToCost } from '@/lib/job-costs'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('x-cron-secret') !== secret) return NextResponse.json({ error: 'Not allowed' }, { status: 401 })
  if (!pushConfigured()) return NextResponse.json({ ok: true, skipped: 'notifications are not set up' })

  const sb = createServiceRoleClient()
  const { data: subs } = await sb.from('push_subscriptions').select('user_id, owner_id')
  // the owner is the one told: a subscription whose person is the owner of the company
  const owners = [...new Set((subs ?? []).filter(s => s.user_id === s.owner_id).map(s => s.owner_id as string))]
  const today = new Date().toISOString().slice(0, 10)
  let sent = 0

  for (const ownerId of owners) {
    try {
      const { data: orderRows } = await sb.from('job_orders').select('*').eq('user_id', ownerId)
      const orders = (orderRows ?? []).map(rowToOrder)
      const jobIds = [...new Set(orders.filter(o => o.kind === 'order').map(o => o.jobId).filter(Boolean))]
      const { data: costRows } = jobIds.length ? await sb.from('job_costs').select('*').in('job_id', jobIds) : { data: [] }
      const costs = (costRows ?? []).map(rowToCost)
      const reqIds = orders.filter(o => o.kind === 'quote_request' && o.status !== 'cancelled').map(o => o.id)
      const replies: Record<string, number> = {}
      if (reqIds.length) {
        const { data: qs } = await sb.from('job_order_quotes').select('order_id').eq('status', 'replied').in('order_id', reqIds)
        for (const q of qs ?? []) replies[q.order_id as string] = (replies[q.order_id as string] ?? 0) + 1
      }
      const { count: overdue } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('user_id', ownerId).eq('status', 'overdue')
      const text = summaryText(orderReminders(orders, costs, replies, today), overdue ?? 0)
      if (!text) continue
      const r = await pushToUsers([ownerId], 'daily_summary', { ...text, url: '/dashboard', tag: 'daily-summary' }, { dedupeKey: `daily-${today}` })
      sent += r.sent
    } catch (e) {
      console.error('[push daily] owner failed:', e instanceof Error ? e.message : e)
    }
  }
  return NextResponse.json({ ok: true, owners: owners.length, sent })
}
