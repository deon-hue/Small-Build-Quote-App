'use client'

/**
 * MobileLauncher — the phone/tablet Home screen: one icon per area of the app, grouped by
 * purpose (On site / Quotes / Money / Office), one colour per group. Only ever visible on touch
 * devices (globals.css hides it everywhere else), and only rendered on /dashboard. Permissions
 * mirror the desktop sidebar exactly; a group with nothing visible is left out. Take-off and
 * Back Office are deliberately absent — they're desktop-only.
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
}

interface Group {
  key: 'site' | 'quotes' | 'money' | 'office'
  title: string
  items: Item[]
}

const GROUPS: Group[] = [
  { key: 'site', title: 'On site', items: [
    { label: 'Jobs',        Icon: Briefcase,    perm: 'jobs',     href: '/jobs' },
    { label: 'Scan to job', Icon: Camera,       perm: 'jobs',     href: '/scan' },
    { label: 'Notes',       Icon: StickyNote,   perm: 'jobs',     opensNotes: true },
    { label: 'Calendar',    Icon: CalendarDays, perm: 'calendar', href: '/calendar' },
  ] },
  { key: 'quotes', title: 'Quotes', items: [
    { label: 'Quotes',         Icon: FileText, perm: 'quotes', href: '/quotes' },
    { label: 'New quote',      Icon: FilePlus, perm: 'quotes', href: '/new-quote' },
    { label: 'Quick quote',    Icon: Zap,      perm: 'quotes', href: '/quick-quote' },
    { label: 'Quote requests', Icon: Mail,     perm: 'quotes', href: '/quote-requests' },
  ] },
  { key: 'money', title: 'Money', items: [
    { label: 'Invoices',       Icon: Receipt, perm: 'invoices', href: '/invoices' },
    { label: 'Bills',          Icon: Wallet,  perm: 'invoices', href: '/bills' },
    { label: 'Subcontractors', Icon: Wrench,  perm: 'invoices', href: '/subcontractors' },
  ] },
  { key: 'office', title: 'Office', items: [
    { label: 'Contacts',      Icon: Contact,  perm: 'clients',  href: '/clients' },
    { label: 'Documents',     Icon: Inbox,    perm: 'jobs',     href: '/documents' },
    { label: 'Company setup', Icon: Settings, perm: 'settings', href: '/settings' },
    { label: 'Team',          Icon: Users,    perm: 'team',     href: '/team' },
  ] },
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
      <div className="launcher-groups">
        {GROUPS.map(group => {
          const items = group.items.filter(i => can(i.perm))
          if (items.length === 0) return null
          return (
            <section key={group.key} className={`launcher-group g-${group.key}`}>
              <div className="launcher-group-title">{group.title}</div>
              <div className="launcher-grid">
                {items.map(({ label, Icon, href, opensNotes }) => {
                  const inner = (
                    <>
                      <span className="launcher-ico"><Icon size={26} strokeWidth={1.75} /></span>
                      <span className="launcher-label">{label}</span>
                    </>
                  )
                  return opensNotes
                    ? <button key={label} type="button" className="launcher-item" onClick={onOpenNotes}>{inner}</button>
                    : <Link key={label} href={href!} className="launcher-item">{inner}</Link>
                })}
              </div>
            </section>
          )
        })}
      </div>
      <button type="button" className="launcher-signout" onClick={signOut}><LogOut size={15} /> Sign out</button>
    </div>
  )
}
