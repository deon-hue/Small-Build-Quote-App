'use client'

// Settings > Your email addresses: the company's own addresses for supplier quotes and for documents. They are the shared address with this company's code after a plus sign, so many builders can
// use one address. Anything emailed to them is read by the app: quotes onto the right price request, other documents into the Documents inbox.

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { withCode } from '@/lib/mail-address'

const QUOTES = (process.env.NEXT_PUBLIC_QUOTES_EMAIL || '').trim()
const DOCS = (process.env.NEXT_PUBLIC_DOCUMENTS_EMAIL || '').trim()

export default function MailAddresses() {
  const [code, setCode] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!QUOTES && !DOCS) return
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data: owner } = await sb.rpc('get_effective_owner_id')
      const { data } = await sb.from('settings').select('mail_code').eq('user_id', (owner as string) || user.id).maybeSingle()
      setCode((data?.mail_code as string) || '')
    })()
  }, [])

  if (!QUOTES && !DOCS) return null

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 2000) } catch { /* the address is on screen to copy by hand */ }
  }

  const row = (label: string, hint: string, addr: string) => addr ? (
    <div style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 6px', lineHeight: 1.4 }}>{hint}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <code style={{ fontSize: 14, background: 'var(--warm, #f4f5f3)', padding: '6px 10px', borderRadius: 6, wordBreak: 'break-all' }}>{addr}</code>
        <button className="btn-sm btn-outline" onClick={() => copy(addr)}>{copied === addr ? '✓ Copied' : 'Copy'}</button>
      </div>
    </div>
  ) : null

  return (
    <div className="card">
      <div className="card-hd">Your email addresses</div>
      <div style={{ padding: '16px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 6px', lineHeight: 1.5 }}>
          These are yours alone. Keep the part after the plus sign as it is: it is how the app knows an email is for your company.
        </p>
        {row('Supplier quotes', 'Suppliers email their own quote here, with your PO number on it. It is read and added to the right price request for you to check. Your price request emails already tell them.', QUOTES ? withCode(QUOTES, code) : '')}
        {row('Documents', 'Forward or send invoices, receipts and delivery notes here. They go into your Documents inbox.', DOCS ? withCode(DOCS, code) : '')}
      </div>
    </div>
  )
}
