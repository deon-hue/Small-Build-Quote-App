'use client'

// Where the contractor app's "Forgot password" email link lands. The link goes through
// /auth/callback first (which signs the person in from the one-time code), then comes here to
// choose the new password. Mirrors the customer portal's reset page.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PRODUCT_NAME } from '@/lib/product-config'

export default function AdminResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setExpired(true)
        setError('This reset link has expired or was already used. Please request a new one from the sign-in page.')
      }
    })
  }, [supabase])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setMessage('')
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) { setError(updateError.message); return }
      setMessage('Password updated. Taking you to your dashboard…')
      setTimeout(() => { router.push('/dashboard'); router.refresh() }, 1500)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div className="logo-name" style={{ fontSize: 22, marginBottom: 4 }}>{PRODUCT_NAME}</div>
          <div className="logo-sub" style={{ color: 'var(--muted)' }}>Set a new password</div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}
        {message && (
          <div style={{ padding: '10px 14px', background: 'rgba(122,181,51,0.12)', color: 'var(--moss)', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
            {message}
          </div>
        )}

        {expired ? (
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => router.push('/login')}>
            Back to sign in
          </button>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="fg">
              <label>New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required autoFocus minLength={6} placeholder="••••••••" />
            </div>
            <div className="fg">
              <label>Confirm password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                required minLength={6} placeholder="••••••••" />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 4 }} disabled={loading}>
              {loading ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
