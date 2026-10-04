'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePortal, type PortalContract } from '@/contexts/PortalContext'
import { jobDisplayTitle } from '@/lib/utils'
import PortalSignContractModal from '@/components/PortalSignContractModal'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }
  catch { return '' }
}

export default function PortalContractsPage() {
  const { jobs, contracts, reloadContracts, loading, error } = usePortal()
  const [signing, setSigning] = useState<PortalContract | null>(null)

  if (loading) {
    return (
      <div className="portal-loading">
        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
        Loading your contracts…
      </div>
    )
  }
  if (error) return <div className="portal-section"><p className="portal-empty">Unable to load your contracts.</p></div>

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
            <div style={{ fontWeight: 700, fontSize: 16 }}>Building contract{job ? ' — ' + jobDisplayTitle(job) : ''}</div>
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
              <button className="btn btn-primary" onClick={() => setSigning(c)}>✍️ Review &amp; Sign</button>
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
          {job && <Link href="/portal/jobs" className="btn btn-outline">Plans &amp; documents for this job →</Link>}
        </div>
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

      {signing && (
        <PortalSignContractModal
          contract={signing}
          onClose={() => setSigning(null)}
          onSigned={() => { setSigning(null); reloadContracts() }}
        />
      )}
    </>
  )
}
