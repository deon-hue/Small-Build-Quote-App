'use client'

// The subcontractor portal's frame. The home screen is a dashboard of big tiles (see page.tsx); every other page opens from a tile and has a
// "Home" button back. The small paintbrush in the top corner opens "Your look" (tile style, text size, sign out), saved on their phone.

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Palette } from 'lucide-react'
import { SubPortalProvider, useSubPortal } from '@/contexts/SubPortalContext'
import { SubLookProvider, useSubLook } from '@/contexts/SubLookContext'
import SubLookSheet from '@/components/SubLookSheet'
import { createClient } from '@/lib/supabase/client'

const TITLES: Record<string, string> = {
  '/sub-portal/schedule': 'Schedule',
  '/sub-portal/calendar': 'Company calendar',
  '/sub-portal/timesheets': 'Timesheets',
  '/sub-portal/add-time': 'Add my time',
  '/sub-portal/notes': 'Job notes',
  '/sub-portal/payments': 'Fixed-price payments',
}

function SubPortalNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { settings, companyCalendarStatus } = useSubPortal()
  const [sheet, setSheet] = useState(false)

  const isHome = pathname === '/sub-portal'
  let title = TITLES[pathname] ?? ''
  if (pathname === '/sub-portal/calendar' && companyCalendarStatus === 'off') title = 'Calendar'

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/sub-portal/login')
    router.refresh()
  }

  return (
    <>
      <header className="portal-header">
        <div className="portal-header-inner" style={{ height: 60 }}>
          {isHome ? (
            <div className="portal-logo">
              {settings.logo
                ? <img src={settings.logo} alt="logo" style={{ height: 34, objectFit: 'contain' }} />
                : <span>{settings.name || 'Subcontractor Portal'}</span>}
            </div>
          ) : (
            <Link href="/sub-portal" style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#9bd24a', fontSize: 17, fontWeight: 600, textDecoration: 'none', padding: '8px 4px' }}>
              <ChevronLeft size={24} />Home
            </Link>
          )}
          {!isHome && <span style={{ color: '#fff', fontSize: 17, fontWeight: 600, flex: 1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>}
          <button type="button" onClick={() => setSheet(true)} aria-label="Your look and sign out"
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
            <Palette size={22} />
          </button>
        </div>
      </header>
      {sheet && <SubLookSheet onClose={() => setSheet(false)} onSignOut={signOut} />}
    </>
  )
}

function SubPortalLayoutInner({ children }: { children: React.ReactNode }) {
  const { look } = useSubLook()
  return (
    <div className="portal-wrap">
      <SubPortalNav />
      {/* "Large" text: the whole page is scaled up a little, so every screen gets bigger writing without changing each one */}
      <main className="portal-main" style={look.size === 'large' ? { zoom: 1.15 } : undefined}>{children}</main>
    </div>
  )
}

export default function SubPortalDashLayout({ children }: { children: React.ReactNode }) {
  return (
    <SubPortalProvider>
      <SubLookProvider>
        <SubPortalLayoutInner>{children}</SubPortalLayoutInner>
      </SubLookProvider>
    </SubPortalProvider>
  )
}
