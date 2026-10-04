'use client'

// The owner area shell. It decides who gets in:
//   • not signed in                       → the normal sign-in page (middleware)
//   • signed in but not a listed owner    → a plain "page not found" (the area doesn't announce itself)
//   • listed owner without two-step login → the two-step set-up / code page
//   • listed owner with two-step login    → the area
// This is only the front door: every piece of data comes from database functions that make the same checks again.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PRODUCT_NAME } from '@/lib/product-config'

const NAV = [
  { href: '/owner', label: 'Overview' },
  { href: '/owner/companies', label: 'Companies' },
  { href: '/owner/invites', label: 'Invite codes' },
  { href: '/owner/feedback', label: 'Feedback' },
  { href: '/owner/help', label: 'Help content' },
  { href: '/owner/audit', label: 'Audit log' },
]

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [state, setState] = useState<'checking' | 'notfound' | 'ok'>('checking')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/login'); return }
      const { data: listed } = await supabase.rpc('is_platform_admin_listed')
      if (cancelled) return
      if (listed !== true) { setState('notfound'); return }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (cancelled) return
      if (aal?.currentLevel !== 'aal2') {
        if (pathname !== '/owner/mfa') { router.replace('/owner/mfa'); return }
      }
      setState('ok')
    })()
    return () => { cancelled = true }
  }, [pathname, router])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  if (state === 'notfound') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#444' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>404</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>This page could not be found.</div>
        </div>
      </div>
    )
  }
  if (state === 'checking') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontFamily: 'system-ui, sans-serif' }}>Checking…</div>
  }

  const onMfa = pathname === '/owner/mfa'
  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--paper)' }}>
      <header style={{ background: '#1e2022', color: '#fff', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontWeight: 800, letterSpacing: 0.3 }}>
          {PRODUCT_NAME} <span style={{ color: '#9acd32' }}>Owner</span>
        </div>
        {!onMfa && (
          <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {NAV.map(n => {
              const active = n.href === '/owner' ? pathname === '/owner' : pathname.startsWith(n.href)
              return (
                <Link key={n.href} href={n.href} style={{
                  color: active ? '#1e2022' : '#d6dade', background: active ? '#9acd32' : 'transparent',
                  padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, textDecoration: 'none',
                }}>{n.label}</Link>
              )
            })}
          </nav>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={signOut} style={{ background: 'none', border: '1px solid #4a5058', color: '#d6dade', borderRadius: 6, padding: '4px 12px', fontSize: 12.5, cursor: 'pointer' }}>
          Sign out
        </button>
      </header>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px 80px' }}>{children}</main>
    </div>
  )
}
