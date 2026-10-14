// "Send me a test" from Settings: one alert to the signed-in person's own devices, so they can see it works. Only ever sends to the caller.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushToUsers, pushConfigured } from '@/lib/push'

export async function POST() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (!pushConfigured()) return NextResponse.json({ error: 'Notifications are not set up on this site yet.' }, { status: 503 })
  const r = await pushToUsers([user.id], null, { title: 'BuildOS Pro', body: 'This is a test. Notifications are working on this device.', url: '/dashboard', tag: 'test' })
  if (r.sent === 0) return NextResponse.json({ error: r.skipped === 'no devices' ? 'No device is switched on yet. Turn notifications on first.' : 'Could not send the test. Try turning notifications off and on again on this device.' }, { status: 400 })
  return NextResponse.json({ ok: true, sent: r.sent })
}
