'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { SubPortalProvider, useSubPortal } from '@/contexts/SubPortalContext'
import { createClient } from '@/lib/supabase/client'

function SubPortalNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { settings } = useSubPortal()
  const [menuOpen, setMenuOpen] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/sub-portal/login')
    router.refresh()
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href
    return (
      <Link href={href} className={`portal-nav-link${active ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>
        {label}
      </Link>
    )
  }

  return (
    <header className="portal-header">
      <div className="portal-header-inner">
        <div className="portal-logo">
          {settings.logo
            ? <img src={settings.logo} alt="logo" style={{ height: 32, objectFit: 'contain' }} />
            : <span>🔧 {settings.name || 'Subcontractor Portal'}</span>
          }
        </div>
        <nav className={`portal-nav${menuOpen ? ' open' : ''}`}>
          {navLink('/sub-portal', 'Dashboard')}
          {navLink('/sub-portal/timesheets', 'Timesheets')}
          {navLink('/sub-portal/payments', 'Payments')}
          <button className="portal-signout-btn" onClick={signOut}>Sign Out</button>
        </nav>
        <button className="portal-hamburger" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">
          <span /><span /><span />
        </button>
      </div>
      {menuOpen && <div className="portal-nav-overlay" onClick={() => setMenuOpen(false)} />}
    </header>
  )
}

function SubPortalLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-wrap">
      <SubPortalNav />
      <main className="portal-main">{children}</main>
    </div>
  )
}

export default function SubPortalDashLayout({ children }: { children: React.ReactNode }) {
  return (
    <SubPortalProvider>
      <SubPortalLayoutInner>{children}</SubPortalLayoutInner>
    </SubPortalProvider>
  )
}
