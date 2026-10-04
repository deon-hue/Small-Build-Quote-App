'use client'

// One-time "we've updated our terms" box. Shown to a company's owner when the terms version they accepted is not the current one
// (lib/legal.ts → CURRENT_TERMS_VERSION). Accepting records the new version and time on their company.

import { useState } from 'react'
import Link from 'next/link'
import { useApp } from '@/contexts/AppContext'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

export default function TermsUpdateModal() {
  const { settings, isOwner, hasCompany, loading, acceptTerms } = useApp()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // `undefined` means the database column isn't there yet (nothing to ask); `null`/old version means they haven't accepted this one.
  const needsAcceptance = !loading && hasCompany === true && isOwner && settings.termsVersion !== undefined && settings.termsVersion !== CURRENT_TERMS_VERSION
  if (!needsAcceptance) return null

  async function accept() {
    setBusy(true); setError('')
    try { await acceptTerms() } catch { setError('Sorry, that didn’t save. Please try again.'); setBusy(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: 'min(460px, 100%)', padding: 22, boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>We’ve updated our terms</div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#444' }}>
          Please read the updated <Link href="/terms" target="_blank" style={{ textDecoration: 'underline' }}>terms</Link> and{' '}
          <Link href="/privacy" target="_blank" style={{ textDecoration: 'underline' }}>privacy notice</Link>, then accept to carry on using the app.
        </div>
        {error && <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13 }}>{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={accept} disabled={busy}>{busy ? 'Saving…' : 'I accept'}</button>
      </div>
    </div>
  )
}
