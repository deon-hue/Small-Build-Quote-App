'use client'

/**
 * SendQuoteModal
 *
 * Allows the user to send a quote to a client via email with a PDF attachment.
 * - Generates the PDF server-side via /api/generate-quote-pdf
 * - Sends via Resend through /api/notify-client (quote_sent type)
 * - Includes an optional personal message field
 */

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Quote } from '@/lib/types'
import { DEFAULT_CLIENT_PORTAL_SETTINGS } from '@/lib/types'
import type { NotifyClientPayload } from '@/app/api/notify-client/route'
import { quoteTotal } from '@/lib/utils'

interface Props {
  quote: Quote
  onClose: () => void
  onSent?: () => void
}

export default function SendQuoteModal({ quote, onClose, onSent }: Props) {
  const { settings, clients } = useApp()

  // Look up this client's portal settings to pre-select the right PDF type
  const matchedClient = clients.find(
    c => c.email && quote.customer.email &&
      c.email.toLowerCase() === quote.customer.email.toLowerCase()
  )
  const clientSettings = matchedClient?.portalSettings ?? DEFAULT_CLIENT_PORTAL_SETTINGS

  const [toEmail, setToEmail]     = useState(quote.customer.email || '')
  const [message, setMessage]     = useState('')
  const [pdfType, setPdfType]     = useState<'customer' | 'detailed'>(clientSettings.defaultPdfType)
  const [busy, setBusy]           = useState<'pdf' | 'sending' | null>(null)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState('')

  const total = quoteTotal(quote)

  async function handleSend() {
    if (!toEmail.trim()) { setError('Please enter a recipient email address.'); return }
    setError('')
    setBusy('pdf')

    try {
      // 1. Generate PDF
      const pdfRes = await fetch('/api/generate-quote-pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          quote,
          settings,
          customerView:     pdfType === 'customer',
          showScope:        clientSettings.showScope,
          showPaymentTerms: clientSettings.showPaymentTerms,
        }),
      })

      if (!pdfRes.ok) {
        const e = await pdfRes.json().catch(() => ({}))
        throw new Error(e.error || `PDF generation failed (${pdfRes.status})`)
      }

      const { pdf: pdfBase64 } = await pdfRes.json()
      setBusy('sending')

      // 2. Send via Resend — call directly so we can check the result
      const filename = `Quote-${quote.ref || 'Draft'}-${(quote.customer.name || 'Client').replace(/[^a-z0-9]/gi, '_')}.pdf`

      const portalUrl = `${window.location.origin}/portal/login?email=${encodeURIComponent(toEmail.trim())}`
      const payload: NotifyClientPayload = {
        type:         'quote_sent',
        clientName:   quote.customer.name || 'Customer',
        clientEmail:  toEmail.trim(),
        jobType:      quote.jobType || '',
        jobAddress:   quote.customer.address || '',
        quoteRef:     quote.ref || '',
        quoteTotal:   total,
        vatIncluded:  quote.vatIncluded,
        message:      message.trim() || undefined,
        companyName:  settings.name,
        companyPhone: settings.phone,
        companyEmail: settings.email,
        portalUrl,
        pdfBase64,
        pdfFilename:  filename,
      }

      const notifyRes = await fetch('/api/notify-client', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })

      const notifyData = await notifyRes.json().catch(() => ({}))
      const result = notifyData?.sent as { email: boolean; errors?: string[] } | undefined

      // Check if email was actually delivered
      if (!result?.email) {
        const errs: string[] = result?.errors ?? []
        // Identify the most likely cause and show a clear message
        if (errs.some(e => /api.?key|unauthorized|forbidden/i.test(e))) {
          throw new Error('Resend API key is missing or invalid. Set RESEND_API_KEY in Netlify environment variables.')
        }
        if (errs.some(e => /domain|sender|from|verified/i.test(e))) {
          throw new Error(`Sender email not verified. Set NOTIFY_FROM_EMAIL to an address on a domain you've verified in Resend (resend.com).`)
        }
        if (errs.some(e => /test|sandbox/i.test(e))) {
          throw new Error('Resend test mode: you can only send to the Resend account owner\'s email address. Add a verified domain to send to any address.')
        }
        // Generic fallback with raw errors
        const detail = errs.length ? ` Details: ${errs.join('; ')}` : ' Check that RESEND_API_KEY and NOTIFY_FROM_EMAIL are set in Netlify.'
        throw new Error(`Email was not delivered.${detail}`)
      }

      setSent(true)
      onSent?.()

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ width: 'min(520px,96vw)', maxHeight: '90vh' }}>

        {/* Header */}
        <div className="modal-hd">
          <div>
            <div style={{ fontWeight: 700 }}>✉ Send Quote to Client</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              {quote.ref || 'Draft'} — {quote.customer.name || '—'} · {quote.jobType}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {sent ? (
            /* ── Success state ── */
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Quote sent!</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
                Email with PDF attachment sent to <strong>{toEmail}</strong>
              </div>
              <button
                className="btn-sm btn-primary"
                onClick={onClose}
                style={{ padding: '8px 24px', fontSize: 13 }}
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Quote summary card */}
              <div style={{
                background: '#f8faf2',
                border: '1px solid #c8e89a',
                borderRadius: 8,
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{quote.ref || 'Draft'} — {quote.jobType}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {quote.customer.address || 'No address'}
                  </div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: '#2b3a2b' }}>
                  £{total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  {quote.vatIncluded && <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--muted)', marginLeft: 4 }}>inc. VAT</span>}
                </div>
              </div>

              {/* PDF type toggle */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  PDF Format
                </label>
                <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1.5px solid var(--border)' }}>
                  {(['customer', 'detailed'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setPdfType(type)}
                      style={{
                        flex: 1, padding: '9px 12px', border: 'none', cursor: 'pointer',
                        background: pdfType === type ? '#2b3a2b' : '#fff',
                        color: pdfType === type ? '#fff' : 'var(--text)',
                        fontSize: 12, fontWeight: pdfType === type ? 700 : 400,
                        fontFamily: 'inherit', transition: 'all 0.15s',
                      }}
                    >
                      {type === 'customer' ? '👤 Customer Quote' : '📊 Detailed Quote'}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
                  {pdfType === 'customer'
                    ? '✓ Shows scope & line descriptions — final total only. No phase prices shown.'
                    : '✓ Shows all phase totals and individual line prices.'}
                </div>
              </div>

              {/* PDF notice */}
              <div style={{
                background: '#fff8e1',
                border: '1px solid #ffe082',
                borderRadius: 6,
                padding: '10px 14px',
                fontSize: 12,
                color: '#5d4037',
              }}>
                📎 A PDF copy of this quote will be automatically attached to the email.
              </div>

              {/* Recipient */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                  Send to (email)
                </label>
                <input
                  type="email"
                  value={toEmail}
                  onChange={e => setToEmail(e.target.value)}
                  placeholder="client@email.com"
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box',
                    border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'inherit',
                  }}
                />
              </div>

              {/* Personal message */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                  Personal message <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                  placeholder={`e.g. Hi ${quote.customer.name?.split(' ')[0] || 'there'}, please find attached our quotation for the works we discussed. We look forward to hearing from you.`}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box',
                    border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'inherit',
                    resize: 'vertical', minHeight: 90,
                  }}
                />
              </div>

              {/* Error */}
              {error && (
                <div style={{ background: '#fff0f0', border: '1px solid #ffb0b0', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#c00' }}>
                  ⚠ {error}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn-sm btn-outline" onClick={onClose} disabled={!!busy}>
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={!!busy || !toEmail.trim()}
                  style={{
                    padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none',
                    background: busy ? '#aaa' : '#2b3a2b', color: '#fff',
                    cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 7,
                    opacity: !toEmail.trim() ? 0.5 : 1,
                  }}
                >
                  {busy === 'pdf'
                    ? '⏳ Generating PDF…'
                    : busy === 'sending'
                    ? '📤 Sending…'
                    : '📤 Send Quote + PDF'}
                </button>
              </div>

              {/* Resend config hint */}
              <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                Emails are sent via Resend. Make sure <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 2 }}>RESEND_API_KEY</code> and <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 2 }}>NOTIFY_FROM_EMAIL</code> are set in your Netlify environment variables.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
