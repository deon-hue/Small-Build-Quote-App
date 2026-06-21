'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function PortalLoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'link' | 'password'>('link')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Pre-fill email from URL param (set by admin portal button)
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) setEmail(emailParam)
  }, [searchParams])

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
        if (msg.includes('rate limit') || msg.includes('too many')) {
          setError('Too many sign-in attempts — please wait a few minutes and try again, or use the Password tab instead.')
        } else {
          setError(otpError.message)
        }
        return
      }
      setMessage('Sign-in link sent! Check your email and click the link to access your portal.')
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
      if (signInError) { setError(signInError.message); return }
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
              disabled={loading}
            >
              {loading ? 'Sending…' : '📧 Send sign-in link'}
            </button>
          </form>
        ) : (
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
