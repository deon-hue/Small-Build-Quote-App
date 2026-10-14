// A subcontractor has just added a site note: tell the builder on their phone. The note is checked to be the signed-in subcontractor's own (the same database check the photo upload uses),
// so this cannot be used to send alerts about anything else. The note is already saved; if the alert cannot be sent nothing else is affected.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { pushToOwner } from '@/lib/push'

export async function POST(req: NextRequest) {
  const sbAuth = await createClient()
  const { data: { user } } = await sbAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  let noteId = ''
  try { noteId = String((await req.json()).noteId || '') } catch { /* bad body */ }
  if (!/^[0-9a-f-]{36}$/i.test(noteId)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { data: target } = await sbAuth.rpc('sub_note_photo_target', { p_note_id: noteId })
  const t = target as { error?: string; admin_id?: string; job_id?: string } | null
  if (!t || t.error || !t.admin_id || !t.job_id) return NextResponse.json({ ok: true })

  try {
    const sb = createServiceRoleClient()
    const { data: n } = await sb.from('job_notes').select('note, author_name').eq('id', noteId).maybeSingle()
    const { data: j } = await sb.from('jobs').select('client, address').eq('id', t.job_id).maybeSingle()
    const who = (n?.author_name as string) || 'A subcontractor'
    const text = ((n?.note as string) || '').replace(/\s+/g, ' ').trim()
    await pushToOwner(t.admin_id, 'sub_notes', {
      title: `New site note from ${who}`,
      body: `${j?.client ? j.client + ': ' : ''}${text.length > 110 ? text.slice(0, 107) + '…' : text}` || 'Open the job to read it.',
      url: `/jobs?notes=${encodeURIComponent(t.job_id)}`,
      tag: `note-${noteId}`,
    })
  } catch { /* the note is saved; the alert is a bonus */ }
  return NextResponse.json({ ok: true })
}
