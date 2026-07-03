import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { contractId, date, units, description, startTime, finishTime, breakMins } = await req.json()

  if (!contractId || !date || !units) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data, error } = await sb.rpc('submit_sub_timesheet', {
    p_sub_contract_id: contractId,
    p_entry_date:      date,
    p_units:           Number(units),
    p_notes:           description || '',
    p_start_time:      startTime  || null,
    p_finish_time:     finishTime || null,
    p_break_mins:      Number(breakMins) || 0,
  })

  if (error) {
    console.error('submit_sub_timesheet error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data })
}
