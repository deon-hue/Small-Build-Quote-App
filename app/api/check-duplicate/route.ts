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
  const grossAmount = p.get('grossAmount') || ''
  const docDate     = (p.get('docDate') || '').trim()
  const excludeId   = p.get('excludeDocId') || ''

  const matches: DuplicateMatch[] = []

  // ── 1. Exact invoice number match in job_costs ────────────────────────────
  if (docNumber) {
    const { data: costs } = await sb
      .from('job_costs')
      .select('supplier, doc_number, doc_date, gross_amount, document_id')
      .eq('user_id', user.id)
      .eq('doc_number', docNumber)
      .limit(5)

    for (const c of (costs ?? [])) {
      // Skip costs that belong to the document currently being reviewed
      if (c.document_id && c.document_id === excludeId) continue
      matches.push({
        type: 'cost',
        confidence: 'high',
        label: `Invoice #${c.doc_number} already recorded in job costs`,
        detail: [c.supplier, c.doc_date, c.gross_amount ? `£${Number(c.gross_amount).toFixed(2)}` : ''].filter(Boolean).join(' · '),
      })
    }
  }

  // ── 2. Same invoice number in other inbox documents ───────────────────────
  if (docNumber) {
    const { data: docs } = await sb
      .from('job_documents')
      .select('id, file_name, status, raw_extraction, created_at')
      .eq('user_id', user.id)
      .neq('id', excludeId)
      .not('status', 'eq', 'archived')
      .filter('raw_extraction->>docNumber', 'eq', docNumber)
      .limit(5)

    for (const d of (docs ?? [])) {
      const ex = (d.raw_extraction ?? {}) as Record<string, unknown>
      const gross = Number(ex.grossAmount) || 0
      matches.push({
        type: 'document',
        confidence: 'high',
        label: `Invoice #${docNumber} already scanned${d.status === 'allocated' ? ' and allocated' : ''}`,
        detail: [d.file_name, gross ? `£${gross.toFixed(2)}` : ''].filter(Boolean).join(' · '),
      })
    }
  }

  // ── 3. Same supplier + amount + date (even if different doc number) ───────
  if (supplier && grossAmount && docDate && !matches.length) {
    const { data: costs } = await sb
      .from('job_costs')
      .select('supplier, doc_number, doc_date, gross_amount, document_id')
      .eq('user_id', user.id)
      .eq('doc_date', docDate)
      .eq('gross_amount', grossAmount)
      .ilike('supplier', `%${supplier.split(' ')[0]}%`)
      .limit(5)

    for (const c of (costs ?? [])) {
      if (c.document_id && c.document_id === excludeId) continue
      matches.push({
        type: 'cost',
        confidence: 'medium',
        label: `Similar receipt already in job costs`,
        detail: [c.supplier, c.doc_date, `£${Number(c.gross_amount).toFixed(2)}`].filter(Boolean).join(' · '),
      })
    }
  }

  // Deduplicate by label
  const seen = new Set<string>()
  const unique = matches.filter(m => { const k = m.label + m.detail; if (seen.has(k)) return false; seen.add(k); return true })

  return NextResponse.json({ matches: unique })
}
