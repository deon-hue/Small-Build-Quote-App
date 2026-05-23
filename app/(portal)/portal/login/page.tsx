'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function PortalLoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')
    setLoading(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) { setError(signInError.message); return }
      router.push('/portal')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')
    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) { setError(signUpError.message); return }
      // Link customer profile to admin via email matching
      await supabase.rpc('create_customer_profile')
      setMessage('Account created! Please sign in below.')
      setMode('login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-login-logo">🏗 Client Portal</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          {mode === 'login' ? 'Sign in to your portal' : 'Create your account'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
          {mode === 'login'
            ? 'Access your quotes, jobs and invoices'
            : 'Use the email address your builder has on file for you'}
        </p>

        {error && <div className="portal-alert portal-alert-error">{error}</div>}
        {message && <div className="portal-alert portal-alert-success">{message}</div>}

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
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
            {mode === 'register' && (
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Minimum 6 characters</div>
            )}
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 4 }}
            type="submit"
            disabled={loading}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button
                className="portal-link-btn"
                onClick={() => { setMode('register'); setError(''); setMessage('') }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                className="portal-link-btn"
                onClick={() => { setMode('login'); setError(''); setMessage('') }}
              >
                Sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
