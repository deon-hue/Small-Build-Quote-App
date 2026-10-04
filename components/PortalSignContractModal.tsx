'use client'

// The "Sign Contract" window in the client portal. Used from the Contracts tab and from a job's card on the Jobs page.
// The client types their name (and a second client's name where the contract has two), ticks the agreement, and signs;
// then the final signed PDF is produced and the builder is told (finalize-contract).

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PortalContract } from '@/contexts/PortalContext'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'

export default function PortalSignContractModal({ contract, onClose, onSigned }: {
  contract: PortalContract
  onClose: () => void
  onSigned: () => void
}) {
  const supabase = createClient()
  const modal = useDraggableModal()
  const [sigName, setSigName]   = useState('')
  const [sig2Name, setSig2Name] = useState('')
  const [agreed, setAgreed]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')

  async function handleSign() {
    if (!sigName.trim() || !agreed) return
    if (contract.secondClientName && !sig2Name.trim()) return
    setSubmitting(true); setError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('sign_contract', {
        p_contract_id: contract.id, p_role: 'client', p_signature: sigName.trim(),
      })
      if (rpcErr || data?.error) { setError(rpcErr?.message || data?.error || 'Something went wrong.'); return }

      if (contract.secondClientName) {
        const { data: data2, error: rpcErr2 } = await supabase.rpc('sign_contract', {
          p_contract_id: contract.id, p_role: 'client2', p_signature: sig2Name.trim(),
        })
        if (rpcErr2 || data2?.error) { setError(rpcErr2?.message || data2?.error || 'Something went wrong.'); return }
      }

      // Flatten + store the final signed PDF now that every needed signature is in —
      // harmless to call even if it's already been finalized (the route is idempotent).
      await fetch('/api/portal/finalize-contract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: contract.id }),
      }).catch(() => {})

      onSigned()
    } finally { setSubmitting(false) }
  }

  return (
    <div className="modal-overlay" onClick={e => modal.onOverlayClick(e, onClose)}>
      <div ref={modal.boxRef} className="portal-modal" style={modal.draggableStyle}>
        <div className="portal-modal-hd" onMouseDown={modal.onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Sign Contract</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Your FMB building contract</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ModalMaximizeButton isMaximized={modal.isMaximized} onClick={modal.toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="portal-modal-bd">
          {contract.draftUrl && (
            <a className="btn btn-outline" href={contract.draftUrl} target="_blank" rel="noreferrer" style={{ marginBottom: 20, display: 'inline-block' }}>
              📄 Open the contract to read in full
            </a>
          )}

          <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7, marginBottom: 20, padding: '14px 16px', background: '#fffbf0', border: '1px solid #f0d080', borderRadius: 8 }}>
            <strong>Please read the contract before signing:</strong><br />
            By signing you agree to be bound by the terms of this contract. This is a legally
            binding agreement and cannot be undone.
          </div>

          <div className="fg" style={{ marginBottom: 16 }}>
            <label style={{ fontWeight: 600 }}>Your Full Name <span style={{ color: '#c0392b' }}>*</span></label>
            <input
              type="text"
              value={sigName}
              onChange={e => setSigName(e.target.value)}
              placeholder="Type your full name to sign"
              autoFocus
              style={{ fontSize: 15 }}
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>This acts as your electronic signature</div>
          </div>

          {contract.secondClientName && (
            <div className="fg" style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 600 }}>{contract.secondClientName}&rsquo;s Full Name <span style={{ color: '#c0392b' }}>*</span></label>
              <input
                type="text"
                value={sig2Name}
                onChange={e => setSig2Name(e.target.value)}
                placeholder={`Type ${contract.secondClientName}'s full name to sign`}
                style={{ fontSize: 15 }}
              />
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                This contract needs both clients&rsquo; signatures — enter both while you&rsquo;re signing together
              </div>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }} />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>
              I have read and agree to the contract{contract.secondClientName ? ' on behalf of both of us' : ''}
            </span>
          </label>

          {error && (
            <div style={{ color: '#c0392b', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fdf0ef', borderRadius: 6 }}>
              {error}
            </div>
          )}
        </div>
        <div className="portal-modal-ft">
          <button className="btn btn-outline" onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSign}
            disabled={submitting || !sigName.trim() || !agreed || (!!contract.secondClientName && !sig2Name.trim())}
            style={{ minWidth: 180 }}
          >
            {submitting ? 'Signing…' : '✍️ Sign Contract'}
          </button>
        </div>
        {!modal.isMaximized && <ModalResizeHandle onMouseDown={modal.onResizeMouseDown} />}
      </div>
    </div>
  )
}
