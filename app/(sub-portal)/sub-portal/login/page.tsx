'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SubPortalLoginForm() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) setEmail(emailParam)
    if (searchParams.get('error') === 'auth') setError('Sign-in link expired or invalid — please request a new one.')
  }, [searchParams])

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
        if (msg.includes('rate limit') || msg.includes('too many')) {
          setError('Too many attempts — please wait a few minutes and try again.')
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
            <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
              {loading ? 'Sending…' : '📧 Send sign-in link'}
            </button>
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
