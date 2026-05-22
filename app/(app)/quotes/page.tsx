'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, quoteTotal, STAGE_LABEL, Q_BADGE, Q_LABEL } from '@/lib/utils'
import type { Quote } from '@/lib/types'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import { useRouter } from 'next/navigation'

export default function SavedQuotesPage() {
  const { quotes, jobs, settings, updateQuote, deleteQuote, deleteJob, addJob, loading } = useApp()
  const [previewQuote, setPreviewQuote] = useState<Quote | null>(null)
  const router = useRouter()

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const open = quotes.filter(q => q.status === 'pending' || q.status === 'sent')
  const pipeline = open.reduce((s, q) => s + quoteTotal(q), 0)

  async function handleStatusChange(quote: Quote, status: Quote['status']) {
    await updateQuote({ ...quote, status })
  }

  async function handleDelete(q: Quote) {
    const linkedJobs = jobs.filter(j => {
      if (j.quoteId === q.id) return true
      const jn = (j.client || '').toLowerCase()
      const qn = (q.customer.name || '').toLowerCase()
      return jn && qn && (jn === qn || jn.includes(qn) || qn.includes(jn))
    })

    let deleteLinkedJobs = false
    if (linkedJobs.length) {
      const jobList = linkedJobs.map(j => `• ${j.type} — ${j.address} (${STAGE_LABEL[j.stage] || j.stage})`).join('\n')
      const choice = confirm(
        `Deleting quote ${q.ref || q.id} for ${q.customer.name || 'this client'}.\n\n` +
        `Linked job${linkedJobs.length > 1 ? 's' : ''}:\n${jobList}\n\n` +
        `OK = delete quote AND linked jobs\nCancel = delete quote only`
      )
      if (choice === null) return
      deleteLinkedJobs = choice
    } else {
      if (!confirm(`Delete quote ${q.ref || ''}? This cannot be undone.`)) return
    }

    await deleteQuote(q.id)
    if (deleteLinkedJobs) {
      for (const j of linkedJobs) await deleteJob(j.id)
    }
  }

  async function handleConvert(q: Quote) {
    const total = quoteTotal(q)
    const estWeeks = Math.max(4, Math.floor(q.phases.length * 1.5))
    const today = new Date().toISOString().split('T')[0]
    const confirmed = confirm(
      `Convert quote ${q.ref} to a job?\n\nThis will create a new job:\n• Client: ${q.customer.name}\n• Type: ${q.jobType}\n• Value: ${fmt(total)}\n• Estimated duration: ${estWeeks} weeks`
    )
    if (!confirmed) return
    await addJob({
      client: q.customer.name, type: q.jobType, address: q.customer.address,
      value: Math.round(total), stage: 'planning', start: today,
      weeks: estWeeks, done: 0,
      notes: `Converted from quote ${q.ref}. ${q.phases.length} phases.`,
      quoteId: q.id,
    })
    await updateQuote({ ...q, convertedToJob: true })
    alert('Job created! Find it in the Jobs section.')
    router.push('/jobs')
  }

  function emailQuote(q: Quote) {
    const co = settings
    const net = q.phases.reduce((s, p) => s + p.items.reduce((ps, i) => ps + (Number(i.labour) || 0) + (Number(i.materials) || 0), 0), 0)
    const sub = net * (1 + (q.markup || 0) / 100)
    const vat = q.vatIncluded ? sub * 0.2 : 0
    const total = sub + vat
    const validDate = new Date(Date.now() + 30 * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

    let body = `Dear ${q.customer.name || ''},\n\n`
    body += `Please find attached our quotation for the ${q.jobType} works`
    body += q.customer.address ? ` at ${q.customer.address}.` : '.'
    body += `\n\nThis quotation is valid for 30 days (${validDate}).\n\n`
    if (q.scope) body += `SCOPE OF WORKS\n────────────────────────\n${q.scope}\n\n`
    body += `QUOTE SUMMARY\n─────��──────────────────\n`
    body += `Reference: ${q.ref || '—'}\nJob Type: ${q.jobType}\n`
    body += `Property: ${q.customer.address || '—'}\n\n`
    body += `Subtotal: £${sub.toLocaleString('en-GB', { minimumFractionDigits: 2 })}\n`
    if (q.vatIncluded) body += `VAT (20%): £${vat.toLocaleString('en-GB', { minimumFractionDigits: 2 })}\n`
    body += `TOTAL: £${total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}\n\n`
    body += `Please do not hesitate to contact us if you have any questions.\n\nKind regards`

    const subject = encodeURIComponent(`Quotation ${q.ref || ''} — ${q.jobType}${q.customer.address ? ' at ' + q.customer.address : ''}`)
    const to = encodeURIComponent(q.customer.email || '')
    window.location.href = `mailto:${to}?subject=${subject}&body=${encodeURIComponent(body)}`
  }

  return (
    <>
      <div style={{ marginBottom: 18, fontSize: 13, color: 'var(--muted)' }}>
        {quotes.length
          ? `${open.length} open · ${fmt(pipeline)} pipeline · ${quotes.length} total`
          : 'No quotes saved yet'}
      </div>

      {!quotes.length
        ? <div className="empty-dashed">
            <div style={{ fontSize: 14, marginBottom: 6 }}>No quotes yet</div>
            <div style={{ fontSize: 12, marginBottom: 14 }}>Create your first quote using New Quote.</div>
          </div>
        : [...quotes].reverse().map(q => {
            const alreadyJob = jobs.some(j => {
              const jn = (j.client || '').toLowerCase()
              const qn = (q.customer.name || '').toLowerCase()
              return jn === qn || jn.includes(qn) || qn.includes(jn)
            })

            return (
              <div key={q.id} className="sq-card" style={q.status === 'accepted' ? { borderLeft: '3px solid #7ab533' } : {}}>
                <div className="sq-ref">{q.ref || '—'}</div>
                <div className="sq-info">
                  <div className="sq-title">{q.jobType} — {q.customer.name || '—'}</div>
                  <div className="sq-sub">
                    {q.customer.address || ''} · Saved {q.savedDate || '—'}
                    {q.lastEdited ? ' · Edited ' + q.lastEdited : ''}
                  </div>
                </div>
                <div className="sq-val">{fmt(quoteTotal(q))}</div>
                <div style={{ textAlign: 'center', minWidth: 200 }}>
                  <span className={`badge ${Q_BADGE[q.status] || 'b-pending'}`}>{Q_LABEL[q.status] || q.status}</span>
                  <div className="sq-actions" style={{ marginTop: 6 }}>
                    <button className="btn-sm btn-primary" onClick={() => {
                      // Store quote ID in sessionStorage for the builder to pick up
                      sessionStorage.setItem('sbc_edit_quote', q.id)
                      router.push('/new-quote')
                    }}>✎ Edit</button>
                    <button className="btn-sm btn-outline" onClick={() => setPreviewQuote(q)}>View</button>
                    <button className="btn-sm" style={{ background: '#0078d4', color: 'white', border: 'none', borderRadius: 4, padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                      onClick={() => emailQuote(q)}>
                      ✉ Email
                    </button>
                    {q.status === 'accepted' && !alreadyJob && (
                      <button className="btn-sm btn-gold" onClick={() => handleConvert(q)} style={{ whiteSpace: 'nowrap' }}>
                        ⬡ Convert to Job
                      </button>
                    )}
                    {q.status === 'accepted' && alreadyJob && (
                      <span style={{ fontSize: 10, color: 'var(--moss)', fontWeight: 500 }}>✓ Job created</span>
                    )}
                    <select
                      value={q.status}
                      onChange={e => handleStatusChange(q, e.target.value as Quote['status'])}
                      style={{ padding: '4px 6px', fontSize: 11, width: 'auto' }}
                    >
                      <option value="pending">Pending</option>
                      <option value="sent">Sent</option>
                      <option value="accepted">Accepted</option>
                      <option value="declined">Declined</option>
                    </select>
                    <button className="btn-sm btn-danger" onClick={() => handleDelete(q)}>✕</button>
                  </div>
                </div>
              </div>
            )
          })
      }

      {previewQuote && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setPreviewQuote(null)} />
      )}
    </>
  )
}

