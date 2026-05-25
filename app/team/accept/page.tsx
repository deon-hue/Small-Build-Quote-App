'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface InviteDetails {
  member_id: string
  email: string
  name: string
  owner_company: string
}

function AcceptInviteForm() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''

  const [invite, setInvite] = useState<InviteDetails | null>(null)
  const [loadingInvite, setLoadingInvite] = useState(true)
  const [invalidToken, setInvalidToken] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  // Load invite details from token
  useEffect(() => {
    if (!token) { setInvalidToken(true); setLoadingInvite(false); return }
    async function fetchInvite() {
      try {
        const { data } = await supabase.rpc('get_invite_details', { p_token: token })
        if (!data || !Array.isArray(data) || data.length === 0) {
          setInvalidToken(true)
        } else {
          setInvite(data[0] as InviteDetails)
        }
      } catch {
        setInvalidToken(true)
      }
      setLoadingInvite(false)
    }
    fetchInvite()
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    if (!invite) return

    setSubmitting(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          // Prevent sending a confirmation email for team invites
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (signUpError) {
        if (signUpError.message.includes('already registered') || signUpError.message.includes('already in use')) {
          setError('This email is already registered. Please go to the login page and sign in with your password.')
        } else {
          setError(signUpError.message)
        }
        setSubmitting(false)
        return
      }

      setSuccess(true)
      // Redirect to login after a short delay
      setTimeout(() => router.push('/login'), 3000)
    } catch {
      setError('Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  // ── Loading state ────────────────────────────────────────────
  if (loadingInvite) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        Validating invite link…
      </div>
    )
  }

  // ── Invalid / expired token ──────────────────────────────────
  if (invalidToken) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Invalid Invite Link</div>
        <div style={{ color: 'var(--muted)', marginBottom: 24 }}>
          This invite link is invalid or has already been used.
          Please ask your administrator to send a new invite.
        </div>
        <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
          Go to Login
        </a>
      </div>
    )
  }

  // ── Success ──────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Account Created!</div>
        <div style={{ color: 'var(--muted)' }}>
          Your account has been set up. Redirecting to login…
        </div>
      </div>
    )
  }

  // ── Accept form ──────────────────────────────────────────────
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          You&apos;ve been invited to join
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>
          {invite?.owner_company}
        </div>
        {invite?.name && (
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Hi {invite.name}, set a password to get started.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="fg" style={{ marginBottom: 14 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Email</label>
          <input
            type="email"
            value={invite?.email || ''}
            readOnly
            style={{ background: 'var(--bg-alt)', color: 'var(--muted)', cursor: 'not-allowed' }}
          />
        </div>

        <div className="fg" style={{ marginBottom: 14 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Password <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(min 8 characters)</span></label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Choose a strong password"
            autoFocus
            required
          />
        </div>

        <div className="fg" style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Repeat your password"
            required
          />
        </div>

        {error && (
          <div style={{
            background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#e74c3c', marginBottom: 16
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
          style={{ width: '100%' }}
        >
          {submitting ? 'Setting up your account…' : 'Create Account & Join'}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--muted)' }}>
        Already have an account?{' '}
        <a href="/login" style={{ color: 'var(--accent)' }}>Sign in here</a>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 420,
        background: 'var(--card)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '32px 28px',
      }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>}>
          <AcceptInviteForm />
        </Suspense>
      </div>
    </div>
  )
}
