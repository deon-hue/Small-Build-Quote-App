// Who a signed-in subcontractor works for and what they are called, so the builder's alert can say "Dave sent a timesheet". Server only; any failure just means a plainer alert.

import { createServiceRoleClient } from '@/lib/supabase/service-role'

export async function subIdentity(user: { id: string; email?: string | null }): Promise<{ ownerId: string | null; name: string }> {
  try {
    const sb = createServiceRoleClient()
    const { data: prof } = await sb.from('profiles').select('admin_user_id').eq('id', user.id).maybeSingle()
    const ownerId = (prof?.admin_user_id as string | null) ?? null
    let name = ''
    if (ownerId && user.email) {
      const { data: c } = await sb.from('clients').select('name, first_name, last_name').eq('user_id', ownerId).eq('client_type', 'subcontractor').ilike('email', user.email).limit(1).maybeSingle()
      if (c) name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || (c.name as string) || ''
    }
    return { ownerId, name }
  } catch {
    return { ownerId: null, name: '' }
  }
}
