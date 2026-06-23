'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PortalProvider, usePortal } from '@/contexts/PortalContext'
import { createClient } from '@/lib/supabase/client'
import PortalInstallBanner from '@/components/PortalInstallBanner'

function PortalNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { settings, clientSettings } = usePortal()
  const [menuOpen, setMenuOpen] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href
    return (
      <Link
        href={href}
        className={`portal-nav-link${active ? ' active' : ''}`}
        onClick={() => setMenuOpen(false)}
      >
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
            : <span>🏗 {settings.name || 'Client Portal'}</span>
          }
        </div>
        <nav className={`portal-nav${menuOpen ? ' open' : ''}`}>
          {navLink('/portal', 'Dashboard')}
          {clientSettings.showQuotesTab     && navLink('/portal/quotes',      'Quotes')}
          {clientSettings.showVariationsTab && navLink('/portal/variations',  'Variations')}
          {clientSettings.showInvoicesTab   && navLink('/portal/invoices',    'Invoices')}
          {clientSettings.showJobsTab       && navLink('/portal/build-plan',  'Build Plan')}
          <button className="portal-signout-btn" onClick={signOut}>Sign Out</button>
        </nav>
        <button
          className="portal-hamburger"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Menu"
        >
          <span /><span /><span />
        </button>
      </div>
      {menuOpen && <div className="portal-nav-overlay" onClick={() => setMenuOpen(false)} />}
    </header>
  )
}

function PortalLayoutInner({ children }: { children: React.ReactNode }) {
  return (
    <div className="portal-wrap">
      <PortalNav />
      <main className="portal-main">
        {children}
      </main>
      <PortalInstallBanner />
    </div>
  )
}

export default function PortalDashLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalProvider>
      <PortalLayoutInner>{children}</PortalLayoutInner>
    </PortalProvider>
  )
}
