'use client'

// Two-step sign-in for the owner: first time, scan a QR code with an authenticator app (Google Authenticator, Microsoft Authenticator,
// 1Password, Authy…) and enter the 6-digit code; after that, just enter the code each time you sign in.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function OwnerMfaPage() {
  const router = useRouter()
  const supabase = createClient()
  const started = useRef(false)
  const [stage, setStage] = useState<'loading' | 'enroll' | 'verify'>('loading')
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === 'aal2') { router.replace('/owner'); return }
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) { setError(listErr.message); setStage('verify'); return }
      const verified = factors?.totp?.[0]
      if (verified) { setFactorId(verified.id); setStage('verify'); return }
      // Clear any half-finished earlier set-up, then start a fresh one
      for (const f of factors?.all ?? []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data: enrolled, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `BuildOS owner ${new Date().toISOString().slice(0, 10)}` })
      if (enrollErr || !enrolled) {
        setError(enrollErr?.message || 'Could not start two-step set-up. Check that multi-factor sign-in is switched on for this Supabase project.')
        setStage('enroll')
        return
      }
      setFactorId(enrolled.id)
      setQr(enrolled.totp.qr_code)
      setSecret(enrolled.totp.secret)
      setStage('enroll')
    })()
  }, [router, supabase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId })
      if (cErr || !challenge) throw cErr || new Error('Could not start the check')
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
      if (vErr) throw vErr
      router.replace('/owner')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'That code didn’t work. Try the newest code from your app.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: 460, margin: '30px auto' }}>
      <div className="card-hd">Two-step sign-in</div>
      <div style={{ padding: '18px 20px' }}>
        {stage === 'loading' && <div style={{ color: 'var(--muted)' }}>Getting things ready…</div>}

        {stage === 'enroll' && (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
              The owner area needs a second step to sign in. <strong>Set it up once:</strong>
              <ol style={{ margin: '8px 0 0 18px' }}>
                <li>On your phone, open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password or Authy).</li>
                <li>Add an account and scan this code.</li>
                <li>Type the 6-digit number the app shows below.</li>
              </ol>
            </div>
            {qr && <div style={{ textAlign: 'center', margin: '10px 0' }}><img src={qr} alt="QR code to scan with your authenticator app" style={{ width: 190, height: 190 }} /></div>}
            {secret && <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginBottom: 12, wordBreak: 'break-all' }}>Can’t scan? Enter this key by hand: <strong>{secret}</strong></div>}
          </>
        )}

        {stage === 'verify' && <div style={{ fontSize: 13.5, marginBottom: 12 }}>Enter the 6-digit code from your authenticator app.</div>}

        {(stage === 'enroll' || stage === 'verify') && factorId && (
          <form onSubmit={submit}>
            <div className="fg">
              <label>6-digit code</label>
              <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" autoFocus required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
          </form>
        )}

        {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  )
}
