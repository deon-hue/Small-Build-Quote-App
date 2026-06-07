'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AppProvider } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import type { UserPermissions } from '@/lib/types'

// Routes that require a specific permission key
const ROUTE_PERMISSIONS: Partial<Record<string, keyof UserPermissions>> = {
  '/calendar':    'calendar',
  '/jobs':        'jobs',
  '/quotes':      'quotes',
  '/new-quote':    'quotes',
  '/quick-quote':  'quotes',
  '/invoices':    'invoices',
  '/clients':     'clients',
  '/suppliers':   'clients',
  '/settings':    'settings',
  '/documents':   'jobs',
  '/scan':        'jobs',
  '/back-office': 'back_office',
  '/team':        'team',
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { settings, permissions, isOwner, currentMember } = useApp()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const can = (key: keyof UserPermissions) => isOwner || permissions[key]

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
          <div className="logo-name">{settings.name || 'Buildospro'}</div>
          <div className="logo-sub">
            {currentMember
              ? <span style={{ fontSize: 11, opacity: 0.75 }}>{currentMember.name || currentMember.email}</span>
              : settings.tagline || 'Management System'}
          </div>
        </div>
        <nav className="nav">
          <div className="nav-section">Overview</div>
          {navItem('/dashboard', '◈', 'Dashboard')}
          {can('calendar') && navItem('/calendar', '▦', 'Calendar')}
          <div className="nav-section">Work</div>
          {can('jobs')    && navItem('/jobs',      '⬡', 'Jobs')}
          {can('quotes')  && navItem('/quotes',      '◎', 'Saved Quotes')}
          {can('quotes')  && navItem('/new-quote',   '✎', 'New Quote')}
          {can('quotes')  && navItem('/quick-quote', '⚡', 'Quick Quote')}
          {can('quotes')  && navItem('/takeoff',   '📐', 'Take-off')}
          {can('invoices')&& navItem('/invoices',  '◻', 'Invoices')}
          {can('jobs')    && navItem('/scan',      '📷', 'Scan to Job')}
          <div className="nav-section">People</div>
          {can('clients') && navItem('/clients', '○', 'Clients')}
          {can('clients') && navItem('/suppliers', '◐', 'Suppliers')}
          <div className="nav-section">Settings</div>
          {can('jobs')        && navItem('/documents',   '📥', 'Documents')}
          {can('settings')    && navItem('/settings',    '◇', 'Company Setup')}
          {can('back_office') && navItem('/back-office', '⊞', 'Back Office')}
          {can('team')        && navItem('/team',        '👥', 'Team')}
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
  '/dashboard':    'Dashboard',
  '/calendar':     'Calendar',
  '/jobs':         'Jobs',
  '/quotes':       'Saved Quotes',
  '/new-quote':    'New Quote',
  '/quick-quote':  'Quick Quote',
  '/takeoff':      'Take-off',
  '/invoices':     'Invoices',
  '/clients':      'Clients',
  '/suppliers':    'Suppliers',
  '/settings':     'Company Setup',
  '/documents':    'Documents',
  '/back-office':  'Back Office',
  '/portal-preview':'Portal Preview',
  '/team':         'Team',
}

function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { permissions, isOwner, loading, currentMember } = useApp()
  const title = PAGE_TITLES[pathname] || 'Dashboard'

  // Route-level permission guard
  const requiredPermission = ROUTE_PERMISSIONS[pathname]
  useEffect(() => {
    if (loading) return
    // Disabled team members see nothing
    if (currentMember?.status === 'disabled') {
      router.replace('/dashboard')
      return
    }
    // Check page permission
    if (!isOwner && requiredPermission && !permissions[requiredPermission]) {
      router.replace('/dashboard')
    }
  }, [loading, isOwner, permissions, requiredPermission, currentMember, router])

  // Show disabled message on dashboard
  if (!loading && currentMember?.status === 'disabled') {
    return (
      <AppLayoutInner title="Access Disabled">
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Account Disabled</div>
          <div style={{ color: 'var(--muted)', marginBottom: 24 }}>
            Your account has been disabled. Please contact your administrator.
          </div>
          <button className="btn btn-outline" onClick={async () => {
            const supabase = createClient()
            await supabase.auth.signOut()
            router.push('/login')
          }}>Sign Out</button>
        </div>
      </AppLayoutInner>
    )
  }

  // Suppress content while redirecting (prevents flash)
  if (!loading && !isOwner && requiredPermission && !permissions[requiredPermission]) {
    return null
  }

  return <AppLayoutInner title={title}>{children}</AppLayoutInner>
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <AppLayoutWrapper>{children}</AppLayoutWrapper>
    </AppProvider>
  )
}
