'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        setError('Your session has expired or is invalid. Please request a new password reset link.')
        setTimeout(() => router.push('/portal/login'), 3000)
      }
    }
    checkAuth()
  }, [supabase, router])

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        fetch('/api/portal/log-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'password_reset_failed', details: updateError.message })
        }).catch(() => {})
        setError(updateError.message)
        return
      }

      fetch('/api/portal/log-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType: 'password_reset_success' })
      }).catch(() => {})

      setMessage('Password reset successfully! Redirecting you to the portal...')
      setTimeout(() => {
        router.push('/portal')
        router.refresh()
      }, 2000)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="portal-login-wrap">
      <div className="portal-login-card">
        <div className="portal-login-logo">🔑 Reset Password</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, textAlign: 'center' }}>
          Set your new password
        </h1>
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', marginBottom: 24, lineHeight: 1.6 }}>
          Choose a strong password to secure your portal account.
        </p>

        {error && <div className="portal-alert portal-alert-error">{error}</div>}
        {message && <div className="portal-alert portal-alert-success">{message}</div>}

        {!error || error.includes('expired') ? (
          <form onSubmit={handlePasswordReset}>
            <div className="fg">
              <label>New Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                placeholder="••••••••"
                minLength={6}
              />
            </div>
            <div className="fg">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
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
              {loading ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  )
}
