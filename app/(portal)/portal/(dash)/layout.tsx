'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { PortalProvider, usePortal } from '@/contexts/PortalContext'
import { createClient } from '@/lib/supabase/client'
import PortalInstallBanner from '@/components/PortalInstallBanner'
import { PRODUCT_NAME } from '@/lib/product-config'

function PortalNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { settings, clientSettings, contracts } = usePortal()
  const visibleContracts = contracts.filter(c => c.status === 'sent' || c.status === 'signed')
  const awaitingContracts = contracts.filter(c => c.status === 'sent').length
  const [menuOpen, setMenuOpen] = useState(false)

  // Tab title shows the contractor's name once their settings have loaded
  useEffect(() => {
    if (settings.name) document.title = `${settings.name} | Client Portal`
  }, [settings.name])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/portal/login')
    router.refresh()
  }

  const navLink = (href: string, label: string, badge = 0) => {
    const active = pathname === href
    return (
      <Link
        href={href}
        className={`portal-nav-link${active ? ' active' : ''}`}
        onClick={() => setMenuOpen(false)}
      >
        {label}
        {badge > 0 && <span style={{ marginLeft: 6, background: '#e67e22', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>{badge}</span>}
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
          {visibleContracts.length > 0 && navLink('/portal/contracts', 'Contracts', awaitingContracts)}
          {navLink('/portal/build-plan', 'Work Schedule')}
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
      <div style={{ textAlign: 'center', fontSize: 11, color: '#9a9ea1', padding: '8px 0 28px' }}>
        Powered by <strong style={{ color: '#7da826' }}>{PRODUCT_NAME}</strong>
      </div>
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
