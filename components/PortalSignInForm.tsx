'use client'

/**
 * The passwordless sign-in for the subcontractor and client portals: type your email, get a 6-digit code (and a one-tap button) by email, type the code on this same page. The code is
 * the easy way in because it works however the person's email app opens links. Server side: /api/portal/send-code. The session is set here by verifying the code with Supabase.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const COOLDOWN_SECS = 30

export default function PortalSignInForm({ kind, next, initialEmail, notice }: { kind: 'sub' | 'client'; next: string; initialEmail?: string; notice?: string }) {
  const supabase = createClient()
  const cooldownKey = `portal_code_cooldown_${kind}`
  const [email, setEmail] = useState(initialEmail ?? '')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(notice ?? '')
  const [cooldown, setCooldown] = useState(0)
  // how many digits the emailed code has (the server says; it is 6 unless the Supabase project is set otherwise)
  const [codeLength, setCodeLength] = useState<number | null>(null)

  useEffect(() => { if (initialEmail) setEmail(initialEmail) }, [initialEmail])
  useEffect(() => { if (notice) setError(notice) }, [notice])
  useEffect(() => {
    try {
      const stored = localStorage.getItem(cooldownKey)
      const remaining = stored ? Math.ceil((parseInt(stored) - Date.now()) / 1000) : 0
      if (remaining > 0) setCooldown(remaining)
    } catch { /* localStorage unavailable */ }
  }, [cooldownKey])
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError(''); setBusy(true)
    try {
      const res = await fetch('/api/portal/send-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, kind }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'Could not send the code. Please try again.'); return }
      setCodeLength(typeof data?.codeLength === 'number' ? data.codeLength : null)
      setStep('code'); setCode('')
      try { localStorage.setItem(cooldownKey, String(Date.now() + COOLDOWN_SECS * 1000)) } catch { /* unavailable */ }
      setCooldown(COOLDOWN_SECS)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(token: string) {
    setError(''); setBusy(true)
    try {
      let { error: vErr } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'email' })
      if (vErr) ({ error: vErr } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'magiclink' }))
      if (vErr) {
        fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'sign_in_failed', details: 'code' }) }).catch(() => {})
        setError('That code is not right, or it has run out. Check the newest email, or send a new code.')
        setCode('')
        return
      }
      fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'sign_in' }) }).catch(() => {})
      window.location.href = next   // a full page load, so the new session is picked up everywhere
    } finally {
      setBusy(false)
    }
  }

  function onCodeChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 10)
    setCode(digits)
    if (codeLength && digits.length === codeLength && !busy) verify(digits)
  }

  if (step === 'code') {
    return (
      <div>
        {error && <div className="portal-alert portal-alert-error">{error}</div>}
        <div className="portal-alert portal-alert-success" style={{ lineHeight: 1.5 }}>
          If <strong>{email}</strong> is registered, we have just emailed it a sign-in code. Type it below, or tap the button in the email.
        </div>
        <div className="fg">
          <label>Sign-in code</label>
          <input
            value={code} onChange={e => onCodeChange(e.target.value)} inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={12}
            placeholder={codeLength ? '0'.repeat(codeLength) : '123456'} aria-label="Sign-in code from your email"
            style={{ fontSize: 26, letterSpacing: 8, textAlign: 'center', fontFamily: 'monospace' }}
          />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || code.length < 6} onClick={() => verify(code)}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 12, lineHeight: 1.6 }}>
          Nothing there? Check your junk or spam folder. The code runs out after 60 minutes.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} disabled={busy || cooldown > 0} onClick={() => sendCode()}>
            {cooldown > 0 ? `New code in ${cooldown}s` : 'Send a new code'}
          </button>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { setStep('email'); setCode(''); setError('') }}>
            Different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={sendCode}>
      {error && <div className="portal-alert portal-alert-error">{error}</div>}
      <div className="fg">
        <label>Email Address</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="your@email.com" autoComplete="email" />
      </div>
      <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
        We&apos;ll email you a code to type in here (and a one-tap button). No password to remember.
      </div>
      <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={busy || cooldown > 0}>
        {busy ? 'Sending…' : cooldown > 0 ? `Send again in ${cooldown}s` : '📧 Email me a sign-in code'}
      </button>
    </form>
  )
}
