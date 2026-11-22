'use client'

// A subcontractor's invoices: made automatically from their times when those times go on a bill (never for time paid in cash, which has a record of payments instead). They download the PDF,
// send it to their accountant, and change what is on it (logo, UTR, VAT, bank details) under 'My invoice details'. The rules are in lib/sub-invoice.ts.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { periodLabel } from '@/lib/sub-invoice'

interface InvoiceRow { id: string; number: string; periodStart: string | null; periodEnd: string | null; total: number; createdAt: string }
interface DetailsPayload { details: { tradingName: string; utr: string; vatRegistered: boolean; bankAccountName: string; sortCode: string; accountNumber: string; logoPath: string }; hasSaved: boolean; logoUrl: string }

const gbp = (n: number) => '£' + (n || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function monthsBack(n: number): { value: string; label: string; from: string; to: string }[] {
  const out: { value: string; label: string; from: string; to: string }[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 12)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)
    const p = (x: number) => String(x).padStart(2, '0')
    out.push({ value: `${d.getFullYear()}-${p(d.getMonth() + 1)}`, label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), from: `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`, to: `${last.getFullYear()}-${p(last.getMonth() + 1)}-${p(last.getDate())}` })
  }
  return out
}

async function download(url: string, fallbackName: string): Promise<string> {
  try {
    const res = await fetch(url)
    if (!res.ok) { const j = await res.json().catch(() => null) as { error?: string } | null; return j?.error || 'Could not make that PDF. Try again.' }
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') || ''
    const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return ''
  } catch { return 'Could not reach the server. Check your signal and try again.' }
}

export default function SubInvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[] | null>(null)
  const [det, setDet] = useState<DetailsPayload | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const months = monthsBack(12)
  const [month, setMonth] = useState(months[0].value)

  useEffect(() => {
    let live = true
    Promise.all([fetch('/api/sub-portal/invoices').then(r => r.json()), fetch('/api/sub-portal/invoice-details').then(r => (r.ok ? r.json() : null))])
      .then(([a, b]) => { if (!live) return; setInvoices((a?.invoices as InvoiceRow[]) ?? []); setDet(b as DetailsPayload | null) })
      .catch(() => { if (live) { setInvoices([]); setLoadError('Could not load your invoices. Pull down to refresh.') } })
    return () => { live = false }
  }, [])

  const missing: string[] = []
  if (det) {
    if (!det.details.bankAccountName || !det.details.sortCode || !det.details.accountNumber) missing.push('your bank details')
    if (!det.details.utr) missing.push('your UTR')
    if (!det.logoUrl) missing.push('your logo')
  }
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }
  const btn: React.CSSProperties = { display: 'inline-block', background: '#7ab533', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 18px', fontSize: 16, fontWeight: 700, cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit' }
  const btn2: React.CSSProperties = { ...btn, background: '#fff', color: '#3e6b12', border: '1.5px solid #7ab533' }

  async function getCash() {
    const m = months.find(x => x.value === month)!
    setBusy('cash'); setMsg('')
    setMsg(await download(`/api/sub-portal/invoice?kind=cash&from=${m.from}&to=${m.to}`, `Cash payments ${m.value}.pdf`))
    setBusy('')
  }
  async function getInvoice(i: InvoiceRow) {
    setBusy(i.id); setMsg('')
    setMsg(await download(`/api/sub-portal/invoice?id=${i.id}`, `Invoice ${i.number}.pdf`))
    setBusy('')
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px' }}>
      <p style={{ fontSize: 15, color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
        Your invoices are made for you from your times, once those times go on a bill. Download one and send it to your accountant. Time paid in cash does not get an invoice: it has a record of payments, below.
      </p>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>What is on your invoices</div>
            <div style={{ fontSize: 14, color: '#64748b', marginTop: 3 }}>
              {det === null ? 'Loading…' : missing.length === 0 ? 'Your details, logo and bank details are set up.' : `Not added yet: ${missing.join(', ')}.`}
            </div>
          </div>
          {det?.logoUrl && <img src={det.logoUrl} alt="Your logo" style={{ height: 44, maxWidth: 110, objectFit: 'contain' }} />}
          <Link href="/sub-portal/invoices/details" style={btn2}>My invoice details</Link>
        </div>
      </div>

      {msg && <div role="alert" style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 12, padding: '10px 14px', fontSize: 14, marginBottom: 14 }}>{msg}</div>}
      {loadError && <div style={{ color: '#b91c1c', fontSize: 14, marginBottom: 12 }}>{loadError}</div>}

      <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '4px 0 8px' }}>Your invoices</div>
      {invoices === null ? <div style={{ color: '#64748b' }}>Loading…</div>
        : invoices.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>No invoices yet</div>
            <div style={{ fontSize: 14 }}>An invoice appears here when your times go on a bill. Keep putting your times in as normal.</div>
          </div>
        ) : invoices.map(i => (
          <div key={i.id} style={{ ...card, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{i.number}</div>
              <div style={{ fontSize: 14, color: '#64748b' }}>{periodLabel(i.periodStart || '', i.periodEnd || '')}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>{gbp(i.total)}</div>
            <button type="button" style={{ ...btn, opacity: busy === i.id ? 0.6 : 1 }} disabled={busy === i.id} onClick={() => getInvoice(i)}>{busy === i.id ? 'Making…' : 'Download PDF'}</button>
          </div>
        ))}

      <div style={{ fontSize: 13, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '22px 0 8px' }}>Paid in cash</div>
      <div style={card}>
        <div style={{ fontSize: 14, color: '#475569', marginBottom: 10, lineHeight: 1.5 }}>A record of what you were paid in cash in a month. It is a record, not an invoice.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '10px 10px', minHeight: 44, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 16, background: '#fff', flex: 1, minWidth: 160 }}>
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button type="button" style={{ ...btn2, opacity: busy === 'cash' ? 0.6 : 1 }} disabled={busy === 'cash'} onClick={getCash}>{busy === 'cash' ? 'Making…' : 'Download record'}</button>
        </div>
      </div>
    </div>
  )
}
