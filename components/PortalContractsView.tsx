'use client'

// The client portal's Contracts page, as a plain display component. It is used by BOTH the real client portal
// (app/(portal)/portal/(dash)/contracts/page.tsx) and the builder's "preview what the client sees" page
// (app/(app)/portal-preview/page.tsx), so the two can never drift apart again: change the contracts screen here and
// both show it. The preview passes `preview` to switch signing off.

import type { ReactNode } from 'react'
import type { PortalContract } from '@/contexts/PortalContext'
import { jobDisplayTitle } from '@/lib/utils'

export interface PortalJobFile {
  id: string; fileName: string; mimeType: string; fileSize: number; category: string; label: string; url: string | null
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return '' }
}

/** The job's plans and documents, shown with the contract. Photos and the contract's own PDFs are left out (the contract has
 *  its own buttons). Renders nothing when there are none. */
export function PortalFileList({ files }: { files: PortalJobFile[] }) {
  const shown = files.filter(f => f.category === 'plan' || f.category === 'document')
  if (shown.length === 0) return null
  const size = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')
  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.7px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
        Plans &amp; documents for this contract
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {shown.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: 'var(--warm, #f8f8f4)', borderRadius: 7, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.category === 'plan' ? '📐' : '📄'} {f.label || f.fileName}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.label ? f.fileName + ' · ' : ''}{size(f.fileSize)}</div>
            </div>
            {f.url
              ? <a className="btn-sm btn-outline" href={f.url} target="_blank" rel="noreferrer">Open</a>
              : <span style={{ fontSize: 11, color: 'var(--muted)' }}>Unavailable</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PortalContractsView({ contracts, jobs, renderFiles, onSign, preview }: {
  contracts: PortalContract[]
  jobs: { id: string; type: string; title?: string; address?: string }[]
  /** What to show under each contract card for that job (the plans & documents) */
  renderFiles: (jobId: string) => ReactNode
  onSign?: (c: PortalContract) => void
  /** Builder's preview: signing is switched off */
  preview?: boolean
}) {
  // A draft is the builder's own work in progress — the client only ever sees sent and signed contracts
  const visible = contracts.filter(c => c.status === 'sent' || c.status === 'signed')
  const awaiting = visible.filter(c => c.status === 'sent')
  const signed = visible.filter(c => c.status === 'signed')
  const jobOf = (c: PortalContract) => jobs.find(j => j.id === c.jobId)

  const card = (c: PortalContract) => {
    const job = jobOf(c)
    const isSigned = c.status === 'signed'
    return (
      <div key={c.id} className="portal-card" style={{ borderLeft: `4px solid ${isSigned ? '#27ae60' : '#e67e22'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Building contract{job ? ' — ' + jobDisplayTitle({ title: job.title || '', type: job.type }) : ''}</div>
            {job?.address && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{job.address.split('\n')[0]}</div>}
          </div>
          <span className="portal-badge" style={{ background: isSigned ? '#27ae60' : '#e67e22' }}>
            {isSigned ? 'Signed' : 'Awaiting your signature'}
          </span>
        </div>

        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.7 }}>
          {c.createdAt && <div>Sent to you on {fmtDate(c.createdAt)}</div>}
          {isSigned && (
            <div>
              Signed by <strong style={{ color: 'var(--ink)' }}>{[c.clientSignedBy, c.client2SignedBy].filter(Boolean).join(' and ') || 'you'}</strong>
              {c.clientSignedAt ? ' on ' + fmtDate(c.clientSignedAt) : ''}
            </div>
          )}
          {!isSigned && c.secondClientName && <div>Both you and {c.secondClientName} need to sign.</div>}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {!isSigned && (
            <>
              {c.draftUrl && <a className="btn btn-outline" href={c.draftUrl} target="_blank" rel="noreferrer">📄 View contract</a>}
              <button className="btn btn-primary" onClick={() => onSign?.(c)} disabled={preview} title={preview ? 'Signing is switched off in the preview' : undefined}>
                ✍️ Review &amp; Sign{preview ? ' (off in preview)' : ''}
              </button>
            </>
          )}
          {isSigned && (
            <>
              {c.signedUrl
                ? <a className="btn btn-primary" href={c.signedUrl} target="_blank" rel="noreferrer">📄 View signed contract</a>
                : <span style={{ fontSize: 12, color: 'var(--muted)' }}>Your signed copy is being prepared — check back in a moment.</span>}
              {c.draftUrl && <a className="btn btn-outline" href={c.draftUrl} target="_blank" rel="noreferrer">Contract as sent to you</a>}
            </>
          )}
        </div>
        {renderFiles(c.jobId)}
      </div>
    )
  }

  return (
    <>
      <div className="portal-page-hd">
        <h1>Contracts</h1>
        <p>Your building contract and the signed copy for your records.</p>
      </div>

      {visible.length === 0 && (
        <div className="portal-notice">
          <div style={{ fontSize: 40, marginBottom: 12 }}>📝</div>
          <h2 style={{ marginBottom: 6 }}>No contracts yet</h2>
          <p style={{ color: 'var(--muted)' }}>When your builder sends you a contract to sign, it will appear here.</p>
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="portal-section">
          <div className="portal-section-title">Waiting for your signature</div>
          {awaiting.map(card)}
        </div>
      )}

      {signed.length > 0 && (
        <div className="portal-section">
          <div className="portal-section-title">Signed contracts</div>
          {signed.map(card)}
        </div>
      )}
    </>
  )
}
