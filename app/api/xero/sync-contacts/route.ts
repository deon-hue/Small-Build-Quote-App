import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncContacts } from '@/lib/xero-contacts'

export async function POST() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  try {
    const summary = await syncContacts(sb, user.id)
    return NextResponse.json({ summary })
  } catch (e) {
    console.error('xero sync-contacts error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Sync failed' }, { status: 500 })
  }
}
