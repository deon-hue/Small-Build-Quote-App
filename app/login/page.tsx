'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
      setResetSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (showReset) {
    return (
      <div className="login-page">
        <div className="login-box">
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div className="logo-name" style={{ fontSize: 22, marginBottom: 4 }}>Buildospro</div>
            <div className="logo-sub" style={{ color: 'var(--muted)' }}>Reset Password</div>
          </div>

          {resetSent ? (
            <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>✉</div>
              Check your email for a password reset link.
              <br /><br />
              <button onClick={() => { setShowReset(false); setResetSent(false) }}
                style={{ background: 'none', border: 'none', color: 'var(--moss)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handleReset}>
              <div className="fg">
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus />
              </div>
              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} disabled={loading}>
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
              <div style={{ textAlign: 'center', fontSize: 13 }}>
                <button onClick={() => setShowReset(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13 }}>
                  Back to sign in
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div className="logo-name" style={{ fontSize: 22, marginBottom: 4 }}>
            Buildospro
          </div>
          <div className="logo-sub" style={{ color: 'var(--muted)' }}>Management System</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="fg">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div className="fg">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px',
              background: 'rgba(192,57,43,0.1)',
              color: 'var(--terra)',
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: 12 }}
            disabled={loading}
          >
            {loading ? 'Please wait…' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          <button
            onClick={() => setShowReset(true)}
            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}
          >
            Forgot password?
          </button>
        </div>
      </div>
    </div>
  )
}
