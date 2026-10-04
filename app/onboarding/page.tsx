'use client'

// First-run page for a new contractor. Lives outside the (app) layout so the "no company yet → onboarding" guard there can't loop.
//
//  1. Redeems the invite code (from the sign-up metadata, or typed in here) → this is what creates their company.
//  2. A short company-details form, saved through the app's normal saveSettings mapping.
//  3. Loads their starter Back Office data (phases, tasks, labour rates, plant, materials), then goes to the dashboard.
//
// Anyone who arrives here who is already a contractor is sent straight to the dashboard; a customer or subcontractor
// (with no invite code) is sent to their own portal. Add ?join=1 to force the invite-code form for those accounts.

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AppProvider, useApp } from '@/contexts/AppContext'
import { seedStarterData } from '@/lib/back-office-queries'
import { PRODUCT_NAME } from '@/lib/product-config'

type Stage = 'checking' | 'code' | 'details' | 'seeding' | 'unavailable'

const REDEEM_ERRORS: Record<string, string> = {
  invalid_code: 'That invite code isn’t valid. Check it and try again.',
  used: 'That invite code has already been used.',
  expired: 'That invite code has expired. Ask for a new one.',
  not_verified: 'Please confirm your email address first (check your inbox for the link), then come back to this page.',
  company_name_required: 'Please enter your company name.',
  not_signed_in: 'Please sign in again.',
}

function OnboardingInner() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()
  const { settings, saveSettings } = useApp()
  const started = useRef(false)

  const [stage, setStage] = useState<Stage>('checking')
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')
  const [code, setCode] = useState('')
  const [company, setCompany] = useState('')
  const [details, setDetails] = useState({ contact: '', phone: '', email: '', address: '', vatRegistered: false, vatNumber: '', terms: '' })
  const [saving, setSaving] = useState(false)
  const [seedMsg, setSeedMsg] = useState('Getting things ready…')
  const [seedIssues, setSeedIssues] = useState<string[]>([])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function redeem(c: string, name: string, uid: string, email: string, termsAcceptedAt?: string) {
    setError('')
    setStage('checking')
    const { data, error: rpcErr } = await supabase.rpc('redeem_beta_invite', { p_code: c, p_company_name: name })
    if (rpcErr) {
      // The function is missing (registration isn't switched on for this project yet) or the call failed
      setError('Registration isn’t available right now. Please try again later.')
      setStage('code')
      return
    }
    const r = data as { ok?: boolean; error?: string } | null
    if (r?.ok) {
      if (termsAcceptedAt) {
        // Best effort: record when they accepted the beta terms (needs the terms_accepted_at column)
        await supabase.from('settings').update({ terms_accepted_at: termsAcceptedAt }).eq('user_id', uid)
      }
      setDetails(d => ({ ...d, email }))
      setStage('details')
      return
    }
    setError((r?.error && REDEEM_ERRORS[r.error]) || 'Something went wrong. Please try again.')
    setStage('code')
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      setUserId(user.id)
      const meta = (user.user_metadata || {}) as Record<string, string | undefined>
      const wantsToJoin = !!meta.invite_code || params.get('join') === '1'

      // The platform owner has no company: send them to the owner area (it asks for two-step sign-in there)
      const { data: isOwnerListed } = await supabase.rpc('is_platform_admin_listed')
      if (isOwnerListed === true) { router.replace('/owner'); return }

      const { data: isContractor, error: rpcErr } = await supabase.rpc('is_contractor')
      if (rpcErr) { setStage('unavailable'); return }
      if (isContractor === true) { router.replace('/dashboard'); return }

      if (!wantsToJoin) {
        const { data: role } = await supabase.rpc('get_my_role')
        if (role === 'customer') { router.replace('/portal'); return }
        if (role === 'subcontractor') { router.replace('/sub-portal'); return }
      }

      setCompany(meta.company_name || '')
      setCode(meta.invite_code || '')
      if (meta.invite_code && meta.company_name) {
        await redeem(meta.invite_code, meta.company_name, user.id, user.email || '', meta.terms_accepted_at)
      } else {
        setDetails(d => ({ ...d, email: user.email || '' }))
        setStage('code')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/login'); return }
    const meta = (user.user_metadata || {}) as Record<string, string | undefined>
    await redeem(code.trim(), company.trim(), user.id, user.email || '', meta.terms_accepted_at)
  }

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await saveSettings({
        ...settings,
        name: company.trim() || settings.name,
        tagline: '',
        contact: details.contact.trim(),
        phone: details.phone.trim(),
        email: details.email.trim(),
        address: details.address.trim(),
        vatRegistered: details.vatRegistered,
        vatNumber: details.vatRegistered ? details.vatNumber.trim() : '',
        terms: details.terms.trim() || settings.terms,
      })
      setStage('seeding')
      const issues = await seedStarterData(supabase, userId, setSeedMsg)
      if (issues.length) { setSeedIssues(issues); return }
      router.push('/dashboard')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save your details. Please try again.')
      setStage('details')
    } finally {
      setSaving(false)
    }
  }

  const box: React.CSSProperties = { maxWidth: 440 }

  return (
    <div className="login-page">
      <div className="login-box" style={box}>
        <div style={{ marginBottom: 22, textAlign: 'center' }}>
          <img src="/buildospro-logo.png" alt={PRODUCT_NAME} style={{ width: 210, maxWidth: '80%', height: 'auto', marginBottom: 6 }} />
          <div className="logo-sub" style={{ color: 'var(--muted)' }}>
            {stage === 'details' ? 'Tell us about your business' : stage === 'seeding' ? 'Setting up your account' : 'Welcome'}
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {stage === 'checking' && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>Checking your account…</div>
        )}

        {stage === 'unavailable' && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
            Builder registration isn&apos;t switched on here yet. If you were expecting access, please contact the person who invited you.
          </div>
        )}

        {stage === 'code' && (
          <form onSubmit={submitCode}>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
              Enter the invite code you were given to set up your company.
            </div>
            <div className="fg">
              <label>Invite code</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="BOS-XXXX-XXXX-XXXX" required autoFocus autoCapitalize="characters" autoComplete="off" />
            </div>
            <div className="fg">
              <label>Company name</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="e.g. Smith Building Ltd" required />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Continue</button>
          </form>
        )}

        {stage === 'details' && (
          <form onSubmit={submitDetails}>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
              This appears on your quotes and invoices. You can change any of it later in Settings.
            </div>
            <div className="fg"><label>Company name</label><input value={company} onChange={e => setCompany(e.target.value)} required /></div>
            <div className="fg"><label>Your name</label><input value={details.contact} onChange={e => setDetails(d => ({ ...d, contact: e.target.value }))} placeholder="e.g. Dave Smith" /></div>
            <div className="fg"><label>Phone</label><input value={details.phone} onChange={e => setDetails(d => ({ ...d, phone: e.target.value }))} placeholder="01234 567890" /></div>
            <div className="fg"><label>Business email (shown to customers)</label><input type="email" value={details.email} onChange={e => setDetails(d => ({ ...d, email: e.target.value }))} /></div>
            <div className="fg"><label>Address</label><textarea rows={2} value={details.address} onChange={e => setDetails(d => ({ ...d, address: e.target.value }))} placeholder={'1 High Street\nTown AB1 2CD'} /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, margin: '2px 0 12px', cursor: 'pointer' }}>
              <input type="checkbox" checked={details.vatRegistered} onChange={e => setDetails(d => ({ ...d, vatRegistered: e.target.checked }))} style={{ width: 'auto', accentColor: 'var(--moss)' }} />
              <span>We are VAT registered</span>
            </label>
            {details.vatRegistered && (
              <div className="fg"><label>VAT number</label><input value={details.vatNumber} onChange={e => setDetails(d => ({ ...d, vatNumber: e.target.value }))} placeholder="GB 123 4567 89" /></div>
            )}
            <div className="fg">
              <label>Payment terms (printed on quotes)</label>
              <textarea rows={3} value={details.terms || settings.terms} onChange={e => setDetails(d => ({ ...d, terms: e.target.value }))} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
              {saving ? 'Saving…' : 'Save and set up my account'}
            </button>
          </form>
        )}

        {stage === 'seeding' && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
            {seedIssues.length === 0 ? (
              <>
                <div style={{ fontSize: 34, marginBottom: 8 }}>⏳</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{seedMsg}</div>
                This takes about half a minute. Please don&apos;t close this page.
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Almost done</div>
                Your account is ready, but a few starter items couldn&apos;t be loaded. You can load them later from Back Office.
                <div style={{ marginTop: 14 }}>
                  <button className="btn btn-primary" onClick={() => { router.push('/dashboard'); router.refresh() }}>Go to my dashboard</button>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 18 }}>
          <button onClick={signOut} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <AppProvider>
      <Suspense fallback={null}>
        <OnboardingInner />
      </Suspense>
    </AppProvider>
  )
}
