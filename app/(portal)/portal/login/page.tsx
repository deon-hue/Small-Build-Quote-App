'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const COOLDOWN_SECS = 90
const COOLDOWN_KEY = 'portal_otp_cooldown'

function PortalLoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'link' | 'password' | 'reset'>('link')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // Pre-fill email and handle auth errors from URL params
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) setEmail(emailParam)
    const errorParam = searchParams.get('error')
    if (errorParam === 'auth') {
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

  // Send magic link — works for all invited customers (no password needed)
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')
    setLoading(true)
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/portal` },
      })
      if (otpError) {
        const msg = otpError.message.toLowerCase()
        if (msg.includes('rate limit') || msg.includes('too many') || msg.includes('sending magic link')) {
          fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'magic_link_rate_limit', details: otpError.message }) }).catch(() => {})
          try { localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_SECS * 1000)) } catch { /* unavailable */ }
          setCooldown(COOLDOWN_SECS)
          setError('Too many sign-in attempts — please wait 90 seconds before trying again.')
        } else {
          fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'sign_in_failed', details: otpError.message }) }).catch(() => {})
          setError(otpError.message)
        }
        return
      }
      fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'magic_link_sent' }) }).catch(() => {})
      setMessage('Sign-in link sent! Check your email (and spam folder) and click the link to access your portal.')
      try {
        localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_SECS * 1000))
      } catch { /* localStorage unavailable */ }
      setCooldown(COOLDOWN_SECS)
    } finally {
      setLoading(false)
    }
  }

  // Password sign-in — for customers who set up a password
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'sign_in_failed', details: signInError.message }) }).catch(() => {})
        setError(signInError.message); return
      }
      await supabase.rpc('create_customer_profile')
      const { data: role } = await supabase.rpc('get_my_role')
      if (role === 'admin') {
        router.push('/dashboard')
      } else {
        router.push('/portal')
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // Password reset — send reset email
  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/portal/reset-password`,
      })
      if (resetError) {
        fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'password_reset_failed', details: resetError.message }) }).catch(() => {})
        setError(resetError.message); return
      }
      fetch('/api/portal/log-activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, eventType: 'password_reset_requested' }) }).catch(() => {})
      setMessage('Password reset email sent! Check your inbox (and spam folder) for a link to reset your password.')
      setEmail('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-login-logo">🏗 Client Portal</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          Sign in to your portal
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 16, lineHeight: 1.6 }}>
          Your private space to track your project — view quotes, approve change orders, check invoices and follow your build progress. Updated by your builder in real time.
        </p>

        {/* Mode tabs */}
        {mode !== 'reset' && (
          <div style={{ display: 'flex', background: '#f0f2ee', borderRadius: 8, padding: 3, marginBottom: 24, gap: 3 }}>
            <button
              type="button"
              onClick={() => { setMode('link'); setError(''); setMessage('') }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: mode === 'link' ? '#fff' : 'transparent',
                color: mode === 'link' ? 'var(--ink)' : 'var(--muted)',
                boxShadow: mode === 'link' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              📧 Email link
            </button>
            <button
              type="button"
              onClick={() => { setMode('password'); setError(''); setMessage('') }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s',
                background: mode === 'password' ? '#fff' : 'transparent',
                color: mode === 'password' ? 'var(--ink)' : 'var(--muted)',
                boxShadow: mode === 'password' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              🔑 Password
            </button>
          </div>
        )}

        {error && <div className="portal-alert portal-alert-error">{error}</div>}
        {message && <div className="portal-alert portal-alert-success">{message}</div>}

        {mode === 'link' ? (
          /* ── Magic link ── */
          <form onSubmit={handleMagicLink}>
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
        ) : mode === 'password' ? (
          /* ── Password ── */
          <form onSubmit={handlePassword}>
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
            <div className="fg">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                minLength={6}
              />
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 4 }}
              type="submit"
              disabled={loading}
            >
              {loading ? 'Please wait…' : 'Sign In'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setMessage(''); setPassword('') }}
                style={{
                  background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer',
                  textDecoration: 'underline', fontSize: 12, fontWeight: 500, padding: 0
                }}
              >
                Forgot your password?
              </button>
            </p>
          </form>
        ) : (
          /* ── Password Reset ── */
          <form onSubmit={handlePasswordReset}>
            <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16, lineHeight: 1.6 }}>
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>
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
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 4 }}
              type="submit"
              disabled={loading}
            >
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => { setMode('password'); setError(''); setMessage(''); setEmail('') }}
                style={{
                  background: 'none', border: 'none', color: 'var(--link)', cursor: 'pointer',
                  textDecoration: 'underline', fontSize: 12, fontWeight: 500, padding: 0
                }}
              >
                Back to sign in
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default function PortalLoginPage() {
  return (
    <Suspense>
      <PortalLoginForm />
    </Suspense>
  )
}
