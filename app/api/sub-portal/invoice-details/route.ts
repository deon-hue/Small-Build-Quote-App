// A subcontractor's own invoice details, from their portal (lib/sub-invoice.ts has the rules). GET gives the form its starting values (what the builder already holds on their contact, with what
// they have saved on top) and a link to their logo; POST saves the details, or, sent as a form with a file, their logo. Only a signed-in subcontractor can reach it, and only their own record.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { identifySub, loadDetails, saveDetails } from '@/lib/sub-invoice-server'
import { cleanDetails, mergeDetails, EMPTY_DETAILS, isLogoPath } from '@/lib/sub-invoice'

const MAX_LOGO = 800 * 1024

async function who() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const admin = createServiceRoleClient()
  const sub = await identifySub(admin, user)
  if (!sub) return { error: NextResponse.json({ error: 'No subcontractor record was found for this login.' }, { status: 403 }) }
  return { admin, sub }
}

async function payload(admin: ReturnType<typeof createServiceRoleClient>, ownerId: string, contact: { id: string; name: string; address: string; email: string; phone: string; cisPercentage: number }) {
  const saved = await loadDetails(admin, ownerId, contact.id)
  const details = mergeDetails(saved, contact)
  let logoUrl = ''
  if (details.logoPath) {
    const { data } = await admin.storage.from('job-documents').createSignedUrl(details.logoPath, 3600)
    logoUrl = data?.signedUrl ?? ''
  }
  return { known: { name: contact.name, address: contact.address, email: contact.email, phone: contact.phone, cisPercentage: contact.cisPercentage }, details, logoUrl, hasSaved: !!saved }
}

export async function GET() {
  const w = await who()
  if ('error' in w) return w.error
  return NextResponse.json(await payload(w.admin, w.sub.ownerId, w.sub.contact))
}

export async function POST(req: NextRequest) {
  const w = await who()
  if ('error' in w) return w.error
  const { admin, sub } = w
  const current = (await loadDetails(admin, sub.ownerId, sub.contact.id)) ?? { ...EMPTY_DETAILS }

  const type = req.headers.get('content-type') || ''
  if (type.includes('multipart/form-data')) {
    // the logo: a picture, small, checked by what it really is (not by its name)
    const form = await req.formData()
    const file = form.get('logo')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No picture was sent.' }, { status: 400 })
    if (file.size === 0 || file.size > MAX_LOGO) return NextResponse.json({ error: 'The logo is too big. Use a picture under 800 KB.' }, { status: 400 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if (!isPng && !isJpg) return NextResponse.json({ error: 'The logo must be a PNG or JPEG picture.' }, { status: 400 })
    const path = `${sub.ownerId}/sub-logos/${sub.contact.id}-${Date.now()}.${isPng ? 'png' : 'jpg'}`
    const up = await admin.storage.from('job-documents').upload(path, bytes, { contentType: isPng ? 'image/png' : 'image/jpeg', upsert: false })
    if (up.error) return NextResponse.json({ error: 'Could not save the logo. Try again.' }, { status: 500 })
    const err = await saveDetails(admin, sub.ownerId, sub.contact.id, { ...current, logoPath: path })
    if (err) { await admin.storage.from('job-documents').remove([path]); return NextResponse.json({ error: 'Could not save the logo. Try again.' }, { status: 500 }) }
    if (current.logoPath && isLogoPath(current.logoPath, sub.ownerId)) await admin.storage.from('job-documents').remove([current.logoPath])
    return NextResponse.json(await payload(admin, sub.ownerId, sub.contact))
  }

  let body: { details?: unknown; removeLogo?: boolean } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (body.removeLogo === true) {
    if (current.logoPath && isLogoPath(current.logoPath, sub.ownerId)) await admin.storage.from('job-documents').remove([current.logoPath])
    const err = await saveDetails(admin, sub.ownerId, sub.contact.id, { ...current, logoPath: '' })
    if (err) return NextResponse.json({ error: 'Could not remove the logo. Try again.' }, { status: 500 })
    return NextResponse.json(await payload(admin, sub.ownerId, sub.contact))
  }
  const cleaned = cleanDetails(body.details, current.logoPath)   // the logo path is never taken from the form
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 })
  const err = await saveDetails(admin, sub.ownerId, sub.contact.id, cleaned.details)
  if (err) return NextResponse.json({ error: 'Could not save your details. Try again.' }, { status: 500 })
  return NextResponse.json(await payload(admin, sub.ownerId, sub.contact))
}
