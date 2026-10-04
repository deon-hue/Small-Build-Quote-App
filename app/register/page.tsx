'use client'

// Contractor registration (invite-code beta). The visitor creates an account with the invite code they were given; the
// code is checked after they confirm their email, on the onboarding page (it needs a signed-in session to redeem).
// The code, company name and the time they accepted the beta terms ride along in the account's sign-up metadata.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PRODUCT_NAME } from '@/lib/product-config'
import { CURRENT_TERMS_VERSION } from '@/lib/legal'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!companyName.trim()) { setError('Please enter your company name.'); return }
    if (!inviteCode.trim()) { setError('Please enter your invite code.'); return }
    if (password.length < 8) { setError('Your password must be at least 8 characters.'); return }
    if (!accepted) { setError('Please tick the box to accept the beta terms.'); return }

    setLoading(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // The confirmation link comes back through /auth/callback, which signs them in and sends them to onboarding
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`,
          data: {
            invite_code: inviteCode.trim(),
            company_name: companyName.trim(),
            terms_accepted_at: new Date().toISOString(),
            terms_version: CURRENT_TERMS_VERSION,
          },
        },
      })
      if (signUpError) {
        setError(/rate|too many|limit/i.test(signUpError.message)
          ? 'Too many attempts just now. Please wait a few minutes and try again.'
          : signUpError.message)
        return
      }
      if (data.session) {
        // Email confirmation is switched off on this project: they are already signed in
        router.push('/onboarding')
        router.refresh()
        return
      }
      setSentTo(email.trim())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div style={{ marginBottom: 24, textAlign: 'center' }}>
          <img src="/buildospro-logo.png" alt={PRODUCT_NAME} style={{ width: 230, maxWidth: '80%', height: 'auto', marginBottom: 6 }} />
          <div className="logo-sub" style={{ color: 'var(--muted)' }}>Create your builder account</div>
        </div>

        {sentTo ? (
          <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--muted)', lineHeight: 1.6 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✉️</div>
            <div style={{ fontWeight: 700, color: 'var(--text, inherit)', marginBottom: 8 }}>Check your email</div>
            We&apos;ve sent a confirmation link to <strong>{sentTo}</strong>. Click it to finish setting up your account.
            <div style={{ marginTop: 16, fontSize: 12.5, textAlign: 'left', background: 'rgba(0,0,0,0.035)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Nothing after a few minutes?</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <li>Check your junk or spam folder.</li>
                <li>If you&apos;ve used this email with {PRODUCT_NAME} before, we don&apos;t send a second confirmation. <strong>Sign in</strong> with your existing password instead, or use <strong>Forgot password</strong> on the sign-in page.</li>
                <li>Typed it wrong? <button
                  onClick={() => setSentTo('')}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', textDecoration: 'underline', fontSize: 12.5, padding: 0 }}
                >Go back and try again</button>.</li>
              </ul>
            </div>
            <div style={{ marginTop: 14 }}>
              <Link href="/login" className="btn btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>Go to sign in</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="fg">
              <label>Invite code</label>
              <input value={inviteCode} onChange={e => setInviteCode(e.target.value)} placeholder="BOS-XXXX-XXXX-XXXX" required autoFocus
                autoCapitalize="characters" autoComplete="off" />
            </div>
            <div className="fg">
              <label>Company name</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Smith Building Ltd" required />
            </div>
            <div className="fg">
              <label>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
            </div>
            <div className="fg">
              <label>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" />
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 14px', cursor: 'pointer', lineHeight: 1.5 }}>
              <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} style={{ width: 'auto', marginTop: 3, accentColor: 'var(--moss)' }} />
              <span>I accept the <Link href="/terms" target="_blank" style={{ color: 'inherit', textDecoration: 'underline' }}>beta terms</Link> and
              {' '}<Link href="/privacy" target="_blank" style={{ color: 'inherit', textDecoration: 'underline' }}>privacy notice</Link>.</span>
            </label>

            {error && (
              <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} disabled={loading}>
              {loading ? 'Please wait…' : 'Create account'}
            </button>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--muted)' }}>
              Already registered? <Link href="/login" style={{ color: 'inherit', textDecoration: 'underline' }}>Sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
