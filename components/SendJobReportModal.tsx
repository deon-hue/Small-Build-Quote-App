'use client'

/**
 * SendJobReportModal
 *
 * Emails the customer financial report (lib/jobReportHtml.ts) to the client — an HTML
 * attachment, same pattern as SendQuoteModal's PDF attachment, via /api/notify-client
 * (job_report type). The email body is a short branded summary; the full breakdown
 * (variations/invoices/payments, no cost/labour detail) is in the attachment.
 */

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Invoice, JobPayment, Variation } from '@/lib/types'
import type { NotifyClientPayload } from '@/app/api/notify-client/route'
import { buildJobReportHtml } from '@/lib/jobReportHtml'
import { useDraggableModal } from './useDraggableModal'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

interface Props {
  clientName: string
  jobType: string
  jobAddress?: string
  contractValue: number
  variations: Variation[]
  invoices: Invoice[]
  payments: JobPayment[]
  onClose: () => void
  onSent?: () => void
}

// Resend expects base64 attachment content — btoa alone chokes on non-Latin1 chars (£ is
// fine, but be safe for anything else that ends up in company details or client names).
function utf8ToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

export default function SendJobReportModal({ clientName, jobType, jobAddress, contractValue, variations, invoices, payments, onClose, onSent }: Props) {
  const { settings, clients } = useApp()

  // Best-effort recipient guess — the Job record itself has no email field, so try the
  // matching Client record first, then whichever invoice on this job has one. Always
  // shown and editable before sending, never auto-sent without the user confirming it.
  const guessedEmail =
    clients.find(c => c.name.toLowerCase() === clientName.toLowerCase())?.email ||
    invoices.find(i => i.clientEmail)?.clientEmail ||
    ''

  const [toEmail, setToEmail] = useState(guessedEmail)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()

  const approvedVariations = variations.filter(v => v.status === 'approved' || v.status === 'invoiced' || v.status === 'paid')
  const approvedTotal = approvedVariations.reduce((s, v) => s + v.total, 0)
  const adjustedContractTotal = contractValue + approvedTotal
  const invoicedTotal = invoices.reduce((s, i) => s + i.total, 0)
  const paidInvoicesTotal = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0)
  const cashReceived = payments.reduce((s, p) => s + p.amount, 0)
  const totalReceived = paidInvoicesTotal + cashReceived
  const outstanding = +(adjustedContractTotal - totalReceived).toFixed(2)

  async function handleSend() {
    if (!toEmail.trim()) { setError('Please enter a recipient email address.'); return }
    setError('')
    setBusy(true)
    try {
      const html = buildJobReportHtml({ jobType, clientName, jobAddress, contractValue, variations, invoices, payments }, settings)
      const filename = `Job-Financial-Summary-${clientName.replace(/[^a-z0-9]/gi, '_')}.html`

      const payload: NotifyClientPayload = {
        type: 'job_report',
        clientName,
        clientEmail: toEmail.trim(),
        jobType,
        jobAddress: jobAddress || '',
        reportContractTotal: adjustedContractTotal,
        reportInvoicedTotal: invoicedTotal,
        reportPaidTotal: totalReceived,
        reportOutstanding: outstanding,
        message: message.trim() || undefined,
        companyName: settings.name,
        companyPhone: settings.phone,
        companyEmail: settings.email,
        pdfBase64: utf8ToBase64(html),
        pdfFilename: filename,
      }

      const res = await fetch('/api/notify-client', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      const result = data?.sent as { email: boolean; errors?: string[] } | undefined

      if (!result?.email) {
        const errs: string[] = result?.errors ?? []
        const detail = errs.length ? errs.join(' | ') : 'No error detail returned. Check RESEND_API_KEY and NOTIFY_FROM_EMAIL are set in Netlify and trigger a new deploy.'
        throw new Error(`Email not sent: ${detail}`)
      }

      setSent(true)
      onSent?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
      <div ref={boxRef} className="modal-box" style={{ width: 'min(480px,96vw)', maxHeight: '90vh', ...draggableStyle }}>

        <div className="modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700 }}>✉ Email Financial Summary</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{clientName} · {jobType}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {sent ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Report sent!</div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
                Emailed to <strong>{toEmail}</strong>
              </div>
              <button className="btn-sm btn-primary" onClick={onClose} style={{ padding: '8px 24px', fontSize: 13 }}>
                Close
              </button>
            </div>
          ) : (
            <>
              <div style={{ background: '#f8faf2', border: '1px solid #c8e89a', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 13 }}>
                  <span style={{ color: '#6b7580' }}>Adjusted contract total</span>
                  <span style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace' }}>£{adjustedContractTotal.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</span>
                  <span style={{ color: '#6b7580' }}>Balance outstanding</span>
                  <span style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: outstanding > 0 ? '#b45309' : '#4a7c1f' }}>
                    £{Math.abs(outstanding).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#5d4037' }}>
                📎 The full report (contract value, variations, invoices, payments — no cost or labour detail) will be attached to the email.
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                  Send to (email)
                </label>
                <input
                  type="email"
                  value={toEmail}
                  onChange={e => setToEmail(e.target.value)}
                  placeholder="client@email.com"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
                  Extra note <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional — added on top of the standard message)</span>
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  placeholder="Anything you'd like to add…"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'inherit', resize: 'vertical', minHeight: 70 }}
                />
              </div>

              {error && (
                <div style={{ background: '#fff0f0', border: '1px solid #ffb0b0', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#c00' }}>
                  ⚠ {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                <button className="btn-sm btn-outline" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={busy || !toEmail.trim()}
                  style={{
                    padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 4, border: 'none',
                    background: busy ? '#aaa' : '#2b3a2b', color: '#fff',
                    cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    opacity: !toEmail.trim() ? 0.5 : 1,
                  }}
                >
                  {busy ? '📤 Sending…' : '📤 Send Report'}
                </button>
              </div>

              <div style={{ fontSize: 11, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                Emails are sent via Resend. Make sure <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 2 }}>RESEND_API_KEY</code> and <code style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: 2 }}>NOTIFY_FROM_EMAIL</code> are set in your Netlify environment variables.
              </div>
            </>
          )}
        </div>
        {!isMaximized && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
      </div>
    </div>
  )
}
