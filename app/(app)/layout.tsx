'use client'

import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AppProvider } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { settings } = useApp()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navItem = (href: string, icon: string, label: string) => {
    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
    return (
      <Link href={href} className={`nav-item${active ? ' active' : ''}`} onClick={onClose}>
        <span className="nav-icon">{icon}</span> {label}
      </Link>
    )
  }

  return (
    <>
      {open && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-name">{settings.name || 'Small Build Company Ltd'}</div>
          <div className="logo-sub">{settings.tagline || 'Management System'}</div>
        </div>
        <nav className="nav">
          <div className="nav-section">Overview</div>
          {navItem('/dashboard', '◈', 'Dashboard')}
          {navItem('/calendar', '▦', 'Calendar')}
          <div className="nav-section">Work</div>
          {navItem('/jobs', '⬡', 'Jobs')}
          {navItem('/quotes', '◎', 'Saved Quotes')}
          {navItem('/new-quote', '✎', 'New Quote')}
          {navItem('/invoices', '◻', 'Invoices')}
          <div className="nav-section">People</div>
          {navItem('/clients', '○', 'Clients')}
          <div className="nav-section">Settings</div>
          {navItem('/settings', '◇', 'Company Setup')}
          {navItem('/back-office', '⊞', 'Back Office')}
          <div className="nav-section">Account</div>
          <div className="nav-item" onClick={signOut} style={{ cursor: 'pointer' }}>
            <span className="nav-icon">⏻</span> Sign Out
          </div>
        </nav>
      </aside>
    </>
  )
}

function AppLayoutInner({ children, title }: { children: React.ReactNode, title: string }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="app">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main">
        <div className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(v => !v)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <div className="topbar-title serif">{title}</div>
        </div>
        <div className="content">
          {children}
        </div>
      </div>
    </div>
  )
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/calendar': 'Calendar',
  '/jobs': 'Jobs',
  '/quotes': 'Saved Quotes',
  '/new-quote': 'New Quote',
  '/invoices': 'Invoices',
  '/clients': 'Clients',
  '/settings': 'Company Setup',
  '/back-office': 'Back Office',
}

function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] || 'Dashboard'
  return <AppLayoutInner title={title}>{children}</AppLayoutInner>
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppLayoutWrapper>{children}</AppLayoutWrapper>
    </AppProvider>
  )
}
