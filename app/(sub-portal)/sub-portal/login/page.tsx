'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const COOLDOWN_SECS = 90
const COOLDOWN_KEY = 'sub_portal_otp_cooldown'

function SubPortalLoginForm() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Pre-fill email and handle auth errors from URL params
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) setEmail(emailParam)
    if (searchParams.get('error') === 'auth') {
      setError('Your sign-in link has expired or was already used. Please request a new one below.')
    }
  }, [searchParams])

  // Restore cooldown if the page was refreshed mid-wait
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COOLDOWN_KEY)
      if (stored) {
        const remaining = Math.ceil((parseInt(stored) - Date.now()) / 1000)
        if (remaining > 0) setCooldown(remaining)
      }
    } catch { /* localStorage unavailable */ }
  }, [])

  // Tick down every second
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  function startCooldown() {
    try { localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_SECS * 1000)) } catch { /* unavailable */ }
    setCooldown(COOLDOWN_SECS)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')
    setLoading(true)
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/sub-portal` },
      })
      if (otpError) {
        const msg = otpError.message.toLowerCase()
        if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('sending magic link')) {
          startCooldown()
          setError('Too many sign-in attempts — please wait 90 seconds before trying again.')
        } else {
          setError(otpError.message)
        }
        return
      }
      setMessage('Sign-in link sent! Check your email (and spam folder) and click the link to access your portal.')
      startCooldown()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-login-logo">🔧 Subcontractor Portal</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          Sign in to your portal
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
          View your jobs, log timesheets and track your payments — all in one place.
        </p>

        {error   && <div className="portal-alert portal-alert-error">{error}</div>}
        {message && <div className="portal-alert portal-alert-success">{message}</div>}

        {!message && (
          <form onSubmit={handleSubmit}>
            <div className="fg">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="your@email.com"
              />
            </div>
            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
              We&apos;ll email you a secure one-click sign-in link — no password needed.
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              type="submit"
              disabled={loading || cooldown > 0}
            >
              {loading ? 'Sending…' : cooldown > 0 ? `Resend available in ${cooldown}s` : '📧 Send sign-in link'}
            </button>
            {cooldown > 0 && (
              <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                Check your inbox (and spam folder). The link expires in 60 minutes.
              </p>
            )}
          </form>
        )}

        {message && (
          <button className="btn btn-outline" style={{ width: '100%', marginTop: 8 }} onClick={() => { setMessage(''); setEmail('') }}>
            Use a different email
          </button>
        )}
      </div>
    </div>
  )
}

export default function SubPortalLoginPage() {
  return (
    <Suspense>
      <SubPortalLoginForm />
    </Suspense>
  )
}
