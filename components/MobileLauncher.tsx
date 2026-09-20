'use client'

/**
 * MobileLauncher — the phone/tablet Home screen: one icon per area of the app. Only ever
 * visible on touch devices (globals.css hides it everywhere else), and only rendered on
 * /dashboard. Permissions mirror the desktop sidebar exactly. Take-off and Back Office are
 * deliberately absent — they're desktop-only.
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Briefcase, FileText, FilePlus, Camera, StickyNote, Zap, Mail, Receipt, CalendarDays,
  Contact, Inbox, Wallet, Wrench, Settings, Users, LogOut,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import type { UserPermissions } from '@/lib/types'

interface Item {
  label: string
  Icon: LucideIcon
  perm: keyof UserPermissions
  href?: string
  opensNotes?: boolean
  main?: boolean
}

const ITEMS: Item[] = [
  { label: 'Jobs',           Icon: Briefcase,    perm: 'jobs',     href: '/jobs',           main: true },
  { label: 'Quotes',         Icon: FileText,     perm: 'quotes',   href: '/quotes',         main: true },
  { label: 'New quote',      Icon: FilePlus,     perm: 'quotes',   href: '/new-quote',      main: true },
  { label: 'Scan to job',    Icon: Camera,       perm: 'jobs',     href: '/scan',           main: true },
  { label: 'Notes',          Icon: StickyNote,   perm: 'jobs',     opensNotes: true,        main: true },
  { label: 'Quick quote',    Icon: Zap,          perm: 'quotes',   href: '/quick-quote' },
  { label: 'Quote requests', Icon: Mail,         perm: 'quotes',   href: '/quote-requests' },
  { label: 'Invoices',       Icon: Receipt,      perm: 'invoices', href: '/invoices' },
  { label: 'Calendar',       Icon: CalendarDays, perm: 'calendar', href: '/calendar' },
  { label: 'Contacts',       Icon: Contact,      perm: 'clients',  href: '/clients' },
  { label: 'Documents',      Icon: Inbox,        perm: 'jobs',     href: '/documents' },
  { label: 'Bills',          Icon: Wallet,       perm: 'invoices', href: '/bills' },
  { label: 'Subcontractors', Icon: Wrench,       perm: 'invoices', href: '/subcontractors' },
  { label: 'Company setup',  Icon: Settings,     perm: 'settings', href: '/settings' },
  { label: 'Team',           Icon: Users,        perm: 'team',     href: '/team' },
]

export default function MobileLauncher({ onOpenNotes }: { onOpenNotes: () => void }) {
  const router = useRouter()
  const { settings, permissions, isOwner } = useApp()
  const can = (key: keyof UserPermissions) => isOwner || permissions[key]

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="launcher">
      <div className="launcher-head">
        <div className="launcher-sub">{settings.name || 'Buildospro'}</div>
        <div className="launcher-title">Home</div>
      </div>
      <div className="launcher-grid">
        {ITEMS.filter(i => can(i.perm)).map(({ label, Icon, href, opensNotes, main }) => {
          const inner = (
            <>
              <span className={`launcher-ico${main ? ' main' : ''}`}><Icon size={26} strokeWidth={1.75} /></span>
              <span>{label}</span>
            </>
          )
          return opensNotes
            ? <button key={label} type="button" className="launcher-item" onClick={onOpenNotes}>{inner}</button>
            : <Link key={label} href={href!} className="launcher-item">{inner}</Link>
        })}
      </div>
      <button type="button" className="launcher-signout" onClick={signOut}><LogOut size={15} /> Sign out</button>
    </div>
  )
}
