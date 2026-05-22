'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setError('Account created — check your email to confirm, then log in.')
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div className="logo-name" style={{ fontSize: 22, marginBottom: 4 }}>
            Small Build Company Ltd
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
              background: error.includes('created') ? 'rgba(122,181,51,0.1)' : 'rgba(192,57,43,0.1)',
              color: error.includes('created') ? '#5e8f20' : 'var(--terra)',
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
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
          {mode === 'login' ? (
            <>No account?{' '}
              <button
                onClick={() => setMode('signup')}
                style={{ background: 'none', border: 'none', color: 'var(--moss)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
              >
                Create one
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                style={{ background: 'none', border: 'none', color: 'var(--moss)', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}
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
