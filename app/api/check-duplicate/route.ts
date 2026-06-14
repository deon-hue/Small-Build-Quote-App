import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export interface DuplicateMatch {
  type: 'document' | 'cost'
  label: string
  detail: string
  confidence: 'high' | 'medium'
}

export async function GET(req: NextRequest) {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ matches: [] })

  const p = new URL(req.url).searchParams
  const docNumber   = (p.get('docNumber') || '').trim()
  const supplier    = (p.get('supplier') || '').trim()
  const grossAmount = (p.get('grossAmount') || '').trim()
  const docDate     = (p.get('docDate') || '').trim()
  const excludeId   = p.get('excludeDocId') || ''

  const matches: DuplicateMatch[] = []
  const supFirst = supplier.split(' ')[0].toLowerCase()

  // ── 1. Check other inbox / job documents (catches duplicate scans) ─────────
  // Fetch recent documents and filter in JS to avoid JSONB operator issues
  const { data: allDocs } = await sb
    .from('job_documents')
    .select('id, file_name, status, raw_extraction, created_at')
    .eq('user_id', user.id)
    .neq('id', excludeId)
    .not('status', 'eq', 'archived')
    .order('created_at', { ascending: false })
    .limit(200)

  for (const d of (allDocs ?? [])) {
    const ex = (d.raw_extraction ?? {}) as Record<string, unknown>
    const dNum   = String(ex.docNumber ?? '').trim()
    const dSup   = String(ex.supplier ?? '').toLowerCase()
    const dGross = String(ex.grossAmount ?? '').trim()
    const dDate  = String(ex.docDate ?? '').trim()

    // High confidence: same invoice/receipt number
    if (docNumber && dNum && dNum === docNumber) {
      const gross = Number(ex.grossAmount) || 0
      matches.push({
        type: 'document',
        confidence: 'high',
        label: `Receipt #${docNumber} already scanned${d.status === 'allocated' ? ' and allocated' : ''}`,
        detail: [d.file_name, gross ? `£${gross.toFixed(2)}` : ''].filter(Boolean).join(' · '),
      })
      continue
    }

    // Medium confidence: same supplier + same amount + same date
    if (supFirst && dSup.includes(supFirst) && grossAmount && dGross === grossAmount && docDate && dDate === docDate) {
      const gross = Number(ex.grossAmount) || 0
      matches.push({
        type: 'document',
        confidence: 'medium',
        label: `Similar receipt already in inbox`,
        detail: [d.file_name, gross ? `£${gross.toFixed(2)}` : '', dDate || ''].filter(Boolean).join(' · '),
      })
    }
  }

  // ── 2. Check job_costs (catches already-allocated duplicates) ─────────────
  if (docNumber) {
    const { data: costs } = await sb
      .from('job_costs')
      .select('supplier, doc_number, doc_date, gross_amount, document_id')
      .eq('user_id', user.id)
      .eq('doc_number', docNumber)
      .limit(10)

    for (const c of (costs ?? [])) {
      if (c.document_id === excludeId) continue
      matches.push({
        type: 'cost',
        confidence: 'high',
        label: `Receipt #${docNumber} already recorded in job costs`,
        detail: [c.supplier, c.doc_date, c.gross_amount ? `£${Number(c.gross_amount).toFixed(2)}` : ''].filter(Boolean).join(' · '),
      })
    }
  }

  // Medium confidence in job_costs: same supplier + amount + date
  if (!matches.length && supFirst && grossAmount && docDate) {
    const { data: costs } = await sb
      .from('job_costs')
      .select('supplier, doc_number, doc_date, gross_amount, document_id')
      .eq('user_id', user.id)
      .eq('doc_date', docDate)
      .ilike('supplier', `%${supFirst}%`)
      .limit(10)

    for (const c of (costs ?? [])) {
      if (c.document_id === excludeId) continue
      if (String(c.gross_amount) !== grossAmount && Number(c.gross_amount).toFixed(2) !== Number(grossAmount).toFixed(2)) continue
      matches.push({
        type: 'cost',
        confidence: 'medium',
        label: `Similar receipt already in job costs`,
        detail: [c.supplier, c.doc_date, `£${Number(c.gross_amount).toFixed(2)}`].filter(Boolean).join(' · '),
      })
    }
  }

  // Deduplicate by label + detail
  const seen = new Set<string>()
  const unique = matches.filter(m => {
    const k = m.label + m.detail
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  return NextResponse.json({
    matches: unique,
    _debug: {
      params: { docNumber, supplier, grossAmount, docDate, excludeId },
      docsScanned: (allDocs ?? []).length,
      docsSample: (allDocs ?? []).slice(0, 3).map(d => ({
        id: d.id,
        status: d.status,
        docNumber: (d.raw_extraction as Record<string, unknown>)?.docNumber,
        supplier: (d.raw_extraction as Record<string, unknown>)?.supplier,
        grossAmount: (d.raw_extraction as Record<string, unknown>)?.grossAmount,
      })),
    },
  })
}
