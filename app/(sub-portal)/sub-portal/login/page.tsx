'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import PortalSignInForm from '@/components/PortalSignInForm'

function SubPortalLoginForm() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')

  // Pre-fill the email (from the invite email) and explain a sign-in link that did not work
  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) setEmail(emailParam)
    if (searchParams.get('error') === 'auth') {
      setNotice('That sign-in link has expired or was already used (some email apps open links before you do). Get a sign-in code instead: it works every time.')
    }
  }, [searchParams])

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
        <PortalSignInForm kind="sub" next="/sub-portal" initialEmail={email} notice={notice} />
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
