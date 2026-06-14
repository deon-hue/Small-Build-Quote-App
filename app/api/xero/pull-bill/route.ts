import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'
import type { BillStatus } from '@/lib/types'

interface XeroBill { Status?: string }
interface XeroResponse { Invoices?: XeroBill[] }

function mapXeroStatus(s: string): BillStatus {
  switch (s) {
    case 'PAID':        return 'paid'
    case 'AUTHORISED':  return 'approved'
    case 'SUBMITTED':   return 'approved'
    case 'DRAFT':       return 'draft'
    case 'VOIDED':      return 'draft'
    default:            return 'approved'
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const body = await req.json() as { xeroBillId?: string; billId?: string }
    const { xeroBillId, billId } = body
    if (!xeroBillId || !billId) {
      return NextResponse.json({ error: 'xeroBillId and billId are required' }, { status: 400 })
    }

    const res = await xeroFetch(conn, `/Invoices/${xeroBillId}`)
    if (!res.ok) {
      return NextResponse.json({ error: `Xero error (${res.status})` }, { status: res.status })
    }

    const data = await res.json() as XeroResponse
    const xeroBill = data?.Invoices?.[0]
    if (!xeroBill) return NextResponse.json({ error: 'Bill not found in Xero' }, { status: 404 })

    const newStatus = mapXeroStatus(xeroBill.Status || '')

    await sb.from('bills')
      .update({ status: newStatus })
      .eq('id', billId)
      .eq('user_id', user.id)

    return NextResponse.json({ status: newStatus, xeroStatus: xeroBill.Status })
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
