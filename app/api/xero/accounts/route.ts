import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidConnection, xeroFetch } from '@/lib/xero'

export interface XeroAccount {
  code: string
  name: string
  type: string
}

interface XeroAccountRaw {
  Code?: string
  Name?: string
  Type?: string
  Status?: string
}

interface XeroResponse {
  Accounts?: XeroAccountRaw[]
}

export async function GET() {
  try {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const conn = await getValidConnection(sb, user.id)
    if (!conn) return NextResponse.json({ error: 'Xero not connected' }, { status: 400 })

    const res = await xeroFetch(conn, '/Accounts?where=Status%3D%3D%22ACTIVE%22&order=Name+ASC')
    if (!res.ok) {
      return NextResponse.json({ error: `Xero error (${res.status})` }, { status: res.status })
    }

    const data = await res.json() as XeroResponse
    const accounts: XeroAccount[] = (data.Accounts ?? [])
      .filter(a => a.Code && a.Name)
      .map(a => ({ code: a.Code!, name: a.Name!, type: a.Type || '' }))

    return NextResponse.json({ accounts })
  } catch (err) {
    return NextResponse.json({ error: `Server error: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 })
  }
}
