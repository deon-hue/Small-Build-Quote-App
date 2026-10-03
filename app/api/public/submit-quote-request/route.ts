import { NextRequest, NextResponse } from 'next/server'
import { publicGuard } from '@/lib/public-guard'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const limited = await publicGuard(req, 'upload')
  if (limited) return limited

  const body = await req.json()
  const { clientName, clientEmail, clientPhone, projectType, projectAddress, scopeText, aiPhases, estimatedTotal, clientFiles } = body

  if (!clientName?.trim() || !clientEmail?.trim()) {
    return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
  }

  // Field-length caps: this is a public form that writes into the inbox
  const tooLong = (v: unknown, max: number) => typeof v === 'string' && v.length > max
  if (tooLong(clientName, 200) || tooLong(clientEmail, 320) || tooLong(clientPhone, 60) || tooLong(projectType, 200) ||
      tooLong(projectAddress, 500) || tooLong(scopeText, 30_000) ||
      (Array.isArray(aiPhases) && aiPhases.length > 100) || (Array.isArray(clientFiles) && clientFiles.length > 25)) {
    return NextResponse.json({ error: 'Some of the information is too long. Please shorten it and try again.' }, { status: 413 })
  }

  let sb
  try {
    sb = createServiceRoleClient()
  } catch (err) {
    console.error('Service role client error:', err)
    return NextResponse.json({ error: 'Service unavailable' }, { status: 500 })
  }

  const { data, error } = await sb.from('quote_requests').insert({
    user_id:         'c1d9fdaf-5f12-4b1d-b6f5-6318be733d71',
    client_name:     clientName.trim(),
    client_email:    clientEmail.trim().toLowerCase(),
    client_phone:    (clientPhone || '').trim(),
    project_type:    projectType || '',
    project_address: projectAddress || '',
    scope_text:      scopeText || '',
    ai_phases:       aiPhases || [],
    estimated_total: estimatedTotal || 0,
    client_files:    clientFiles || [],
    status:          'pending',
  }).select('id').single()

  if (error) {
    console.error('Quote request insert error:', error)
    return NextResponse.json({ error: 'Failed to save quote request' }, { status: 500 })
  }

  // Optional: notify builder via email if configured
  const builderEmail = process.env.BUILDER_NOTIFICATION_EMAIL
  if (builderEmail && process.env.ANTHROPIC_API_KEY) {
    // Fire-and-forget — don't block the response
    fetch(`${req.nextUrl.origin}/api/notify-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'quote_request',
        clientName,
        clientEmail,
        projectType,
        projectAddress,
        estimatedTotal,
        builderEmail,
      }),
    }).catch(() => { /* ignore notification errors */ })
  }

  return NextResponse.json({ id: data.id })
}
