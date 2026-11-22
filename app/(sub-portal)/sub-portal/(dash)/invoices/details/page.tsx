'use client'

// What a subcontractor puts on their own invoices: their business, tax and bank details, how their invoice numbers start, and their logo. It starts from what the contractor already holds on them
// (name, address, email, phone); what they save here is kept for their own invoices only and never changes the contractor's record. The rules and the checking are in lib/sub-invoice.ts and the route.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { invoiceNumber, type SubInvoiceDetails } from '@/lib/sub-invoice'

interface Payload { known: { name: string; cisPercentage: number }; details: SubInvoiceDetails; logoUrl: string; hasSaved: boolean }

const inp: React.CSSProperties = { width: '100%', padding: '10px 10px', minHeight: 44, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 16, boxSizing: 'border-box', background: '#fff', fontFamily: 'inherit' }
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '14px 16px', marginBottom: 14 }
const lab: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#475569', marginBottom: 4 }
const h: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 10px' }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 12 }}><label style={lab}>{label}</label>{children}{hint && <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 3 }}>{hint}</div>}</div>
}

/** A logo picture shrunk in the phone to at most 400px (a PNG keeps its see-through background) so it is small to send and sharp enough on an A4 page. */
async function shrinkLogo(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, 400 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const png = file.type === 'image/png'
    const blob: Blob | null = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.9))
    if (blob) return new File([blob], png ? 'logo.png' : 'logo.jpg', { type: blob.type })
  } catch { /* use the file as it is */ }
  return file
}

export default function SubInvoiceDetailsPage() {
  const [p, setP] = useState<Payload | null>(null)
  const [d, setD] = useState<SubInvoiceDetails | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let live = true
    fetch('/api/sub-portal/invoice-details').then(async r => {
      if (!r.ok) { const j = await r.json().catch(() => null) as { error?: string } | null; throw new Error(j?.error || 'Could not load your details.') }
      return r.json() as Promise<Payload>
    }).then(x => { if (live) { setP(x); setD(x.details) } }).catch(e => { if (live) setError(e instanceof Error ? e.message : 'Could not load your details.') })
    return () => { live = false }
  }, [])

  const set = <K extends keyof SubInvoiceDetails>(k: K, v: SubInvoiceDetails[K]) => { setD(x => (x ? { ...x, [k]: v } : x)); setSaved('') }

  async function save() {
    if (!d) return
    setBusy(true); setError(''); setSaved('')
    try {
      const res = await fetch('/api/sub-portal/invoice-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ details: d }) })
      const j = await res.json() as Payload & { error?: string }
      if (!res.ok) { setError(j.error || 'Could not save. Try again.'); return }
      setP(j); setD(j.details); setSaved('Saved')
    } catch { setError('Could not reach the server. Check your signal and try again.') } finally { setBusy(false) }
  }

  async function pickLogo(f: File | undefined) {
    if (!f) return
    if (!/^image\/(png|jpeg)$/.test(f.type)) { setError('The logo must be a PNG or JPEG picture.'); return }
    setLogoBusy(true); setError(''); setSaved('')
    try {
      const small = await shrinkLogo(f)
      const form = new FormData(); form.append('logo', small)
      const res = await fetch('/api/sub-portal/invoice-details', { method: 'POST', body: form })
      const j = await res.json() as Payload & { error?: string }
      if (!res.ok) { setError(j.error || 'Could not save the logo.'); return }
      setP(j); setSaved('Logo saved')
    } catch { setError('Could not reach the server. Check your signal and try again.') } finally { setLogoBusy(false); if (fileRef.current) fileRef.current.value = '' }
  }
  async function removeLogo() {
    setLogoBusy(true); setError(''); setSaved('')
    try {
      const res = await fetch('/api/sub-portal/invoice-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ removeLogo: true }) })
      const j = await res.json() as Payload & { error?: string }
      if (!res.ok) { setError(j.error || 'Could not remove the logo.'); return }
      setP(j); setSaved('Logo removed')
    } catch { setError('Could not reach the server.') } finally { setLogoBusy(false) }
  }

  if (!d || !p) return <div style={{ maxWidth: 640, margin: '0 auto', padding: 20, color: error ? '#b91c1c' : '#64748b' }}>{error || 'Loading…'}</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 16px 40px' }}>
      <p style={{ fontSize: 15, color: '#475569', margin: '0 0 16px', lineHeight: 1.5 }}>
        This is what goes on your invoices. We have filled in what the office already holds for you. Change anything that is not right: it only changes your invoices, not the office's records.
      </p>

      <div style={card}>
        <h2 style={h}>Your logo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 96, height: 64, border: '1px dashed #cbd5e1', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, overflow: 'hidden' }}>
            {p.logoUrl ? <img src={p.logoUrl} alt="Your logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : 'No logo'}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => pickLogo(e.target.files?.[0])} />
          <button type="button" disabled={logoBusy} onClick={() => fileRef.current?.click()} style={{ ...inp, width: 'auto', fontWeight: 700, color: '#3e6b12', borderColor: '#7ab533', cursor: 'pointer', padding: '10px 16px' }}>{logoBusy ? 'Working…' : p.logoUrl ? 'Change logo' : 'Add my logo'}</button>
          {p.logoUrl && <button type="button" disabled={logoBusy} onClick={removeLogo} style={{ background: 'none', border: 'none', color: '#b91c1c', fontSize: 15, cursor: 'pointer', padding: '10px 4px' }}>Remove</button>}
        </div>
        <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 8 }}>A PNG or JPEG picture. It is saved straight away.</div>
      </div>

      <div style={card}>
        <h2 style={h}>Your business</h2>
        <Field label="Business or trading name"><input style={inp} value={d.tradingName} onChange={e => set('tradingName', e.target.value)} placeholder="J Smith Plastering" autoComplete="organization" /></Field>
        <Field label="Address"><textarea style={{ ...inp, minHeight: 84 }} value={d.address} onChange={e => set('address', e.target.value)} placeholder={'7 Mill Lane\nSlough\nSL1 1AA'} /></Field>
        <Field label="Email"><input style={inp} type="email" inputMode="email" value={d.email} onChange={e => set('email', e.target.value)} autoComplete="email" /></Field>
        <Field label="Phone"><input style={inp} type="tel" inputMode="tel" value={d.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" /></Field>
      </div>

      <div style={card}>
        <h2 style={h}>Tax</h2>
        <Field label="UTR (optional)" hint="10 digits, if you want it on your invoices."><input style={inp} inputMode="numeric" value={d.utr} onChange={e => set('utr', e.target.value)} placeholder="12345 67890" /></Field>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 16, margin: '4px 0 10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={d.vatRegistered} onChange={e => set('vatRegistered', e.target.checked)} style={{ width: 22, height: 22 }} />
          I am VAT registered (add 20% VAT to my invoices)
        </label>
        {d.vatRegistered && <Field label="VAT number"><input style={inp} value={d.vatNumber} onChange={e => set('vatNumber', e.target.value)} placeholder="GB 123 456 789" /></Field>}
        {p.known.cisPercentage > 0 && <div style={{ fontSize: 13.5, color: '#64748b', background: '#f8fafc', borderRadius: 10, padding: '8px 12px' }}>Your invoices show the CIS deduction of {p.known.cisPercentage}% that the office makes. That is set by the office.</div>}
      </div>

      <div style={card}>
        <h2 style={h}>How to pay you</h2>
        <Field label="Account name"><input style={inp} value={d.bankAccountName} onChange={e => set('bankAccountName', e.target.value)} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Field label="Sort code"><input style={inp} inputMode="numeric" value={d.sortCode} onChange={e => set('sortCode', e.target.value)} placeholder="12-34-56" /></Field>
          <Field label="Account number"><input style={inp} inputMode="numeric" value={d.accountNumber} onChange={e => set('accountNumber', e.target.value)} placeholder="12345678" /></Field>
        </div>
        <Field label="Payment terms (optional)"><textarea style={{ ...inp, minHeight: 64 }} value={d.paymentTerms} onChange={e => set('paymentTerms', e.target.value)} placeholder="Please pay within 7 days." /></Field>
      </div>

      <div style={card}>
        <h2 style={h}>Invoice numbers</h2>
        <Field label="Letters before the number (optional)" hint={`Your next invoice would be ${invoiceNumber(d.invoicePrefix || initialsHint(d.tradingName || p.known.name), 1)}, then 0002 and so on. Numbers already used do not change.`}>
          <input style={{ ...inp, maxWidth: 160 }} value={d.invoicePrefix} onChange={e => set('invoicePrefix', e.target.value)} placeholder={initialsHint(d.tradingName || p.known.name)} maxLength={6} />
        </Field>
      </div>

      {error && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 12, padding: '10px 14px', fontSize: 14, marginBottom: 14 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={save} disabled={busy} style={{ background: '#7ab533', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 26px', fontSize: 17, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}>{busy ? 'Saving…' : 'Save my details'}</button>
        {saved && <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ {saved}</span>}
        <Link href="/sub-portal/invoices" style={{ color: '#3e6b12', fontWeight: 600, marginLeft: 'auto' }}>Back to my invoices</Link>
      </div>
    </div>
  )
}

function initialsHint(name: string): string {
  return (name || '').split(/\s+/).map(w => w.replace(/[^A-Za-z0-9]/g, '').charAt(0)).join('').toUpperCase().slice(0, 4) || 'INV'
}
