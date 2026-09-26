'use client'

/**
 * MobileLauncher — the phone/tablet Home screen. Works out the headline numbers, recent work and "needs
 * attention" lists from the app's data and hands them to HomeOverview to draw. Only ever visible on touch
 * devices (globals.css hides it everywhere else), and only rendered on /dashboard. Permissions mirror the
 * desktop sidebar exactly; anything the user can't open is left out. Take-off and Back Office are
 * deliberately absent — they're desktop-only.
 */

import { useRouter } from 'next/navigation'
import {
  Briefcase, FileText, FilePlus, Camera, StickyNote, Zap, Mail, Receipt, CalendarDays,
  Contact, Inbox, Wallet, Wrench, Settings, Users, AlertTriangle, Send, PauseCircle,
  type LucideIcon,
} from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import type { UserPermissions } from '@/lib/types'
import HomeOverview, {
  type HomeLink, type HomeStat, type HomeRecent, type HomeAttention, type HomeQuick, type PillTone,
} from './HomeOverview'

interface NavItem { label: string; Icon: LucideIcon; perm: keyof UserPermissions; href: string }

/** Main areas — the rail / chip row. */
const NAV: NavItem[] = [
  { label: 'Jobs',      Icon: Briefcase,    perm: 'jobs',     href: '/jobs' },
  { label: 'Quotes',    Icon: FileText,     perm: 'quotes',   href: '/quotes' },
  { label: 'Invoices',  Icon: Receipt,      perm: 'invoices', href: '/invoices' },
  { label: 'Calendar',  Icon: CalendarDays, perm: 'calendar', href: '/calendar' },
  { label: 'Contacts',  Icon: Contact,      perm: 'clients',  href: '/clients' },
  { label: 'Documents', Icon: Inbox,        perm: 'jobs',     href: '/documents' },
]

const FOOTER_NAV: NavItem[] = [
  { label: 'Company setup', Icon: Settings, perm: 'settings', href: '/settings' },
  { label: 'Team',          Icon: Users,    perm: 'team',     href: '/team' },
]

/** Everything else, one tap away (Scan and New quote are already header buttons). */
const QUICK: (NavItem | { label: string; Icon: LucideIcon; perm: keyof UserPermissions; opensNotes: true })[] = [
  { label: 'Notes',          Icon: StickyNote, perm: 'jobs',     opensNotes: true },
  { label: 'Quick quote',    Icon: Zap,        perm: 'quotes',   href: '/quick-quote' },
  { label: 'Quote requests', Icon: Mail,       perm: 'quotes',   href: '/quote-requests' },
  { label: 'Bills',          Icon: Wallet,     perm: 'invoices', href: '/bills' },
  { label: 'Subcontractors', Icon: Wrench,     perm: 'invoices', href: '/subcontractors' },
  { label: 'Scan to job',    Icon: Camera,     perm: 'jobs',     href: '/scan' },
  { label: 'New quote',      Icon: FilePlus,   perm: 'quotes',   href: '/new-quote' },
]

const OPEN_QUOTE = new Set(['draft', 'pending', 'in-progress', 'review', 'sent'])

const QUOTE_PILL: Record<string, { text: string; tone: PillTone }> = {
  draft: { text: 'Draft', tone: 'draft' }, pending: { text: 'Ready', tone: 'draft' },
  'in-progress': { text: 'In progress', tone: 'live' }, review: { text: 'In review', tone: 'draft' },
  sent: { text: 'Sent', tone: 'sent' }, approved: { text: 'Approved', tone: 'live' }, accepted: { text: 'Approved', tone: 'live' },
  rejected: { text: 'Declined', tone: 'stop' }, declined: { text: 'Declined', tone: 'stop' }, archived: { text: 'Archived', tone: 'done' },
}
const JOB_PILL: Record<string, { text: string; tone: PillTone }> = {
  planning: { text: 'Planning', tone: 'draft' }, active: { text: 'Active', tone: 'live' },
  onhold: { text: 'On hold', tone: 'stop' }, complete: { text: 'Complete', tone: 'done' },
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
const time = (s?: string) => { const t = s ? Date.parse(s) : NaN; return Number.isNaN(t) ? 0 : t }

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function MobileLauncher({ onOpenNotes }: { onOpenNotes: () => void }) {
  const router = useRouter()
  const { settings, permissions, isOwner, currentMember, jobs, quotes, invoices } = useApp()
  const can = (key: keyof UserPermissions) => isOwner || permissions[key]

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const toLink = ({ label, href, Icon }: NavItem): HomeLink => ({ label, href, Icon })
  const nav = NAV.filter(i => can(i.perm)).map(toLink)
  const footerNav = FOOTER_NAV.filter(i => can(i.perm)).map(toLink)

  // Headline numbers
  const activeJobs = jobs.filter(j => j.stage === 'active')
  const openQuotes = quotes.filter(q => OPEN_QUOTE.has(q.status))
  const unpaid = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const overdue = invoices.filter(i => i.status === 'overdue')
  const sentQuotes = quotes.filter(q => q.status === 'sent')
  const draftQuotes = quotes.filter(q => q.status === 'draft')
  const heldJobs = jobs.filter(j => j.stage === 'onhold')

  const stats: HomeStat[] = []
  if (can('jobs')) stats.push({ label: 'Active jobs', value: activeJobs.length, hint: `${plural(jobs.length, 'job')} in total`, href: '/jobs', Icon: Briefcase })
  if (can('quotes')) stats.push({ label: 'Open quotes', value: openQuotes.length, hint: `${sentQuotes.length} waiting on a reply`, href: '/quotes', Icon: FileText })
  if (can('invoices')) stats.push({ label: 'Unpaid invoices', value: unpaid.length, hint: overdue.length ? `${overdue.length} overdue` : 'None overdue', href: '/invoices', Icon: Receipt })

  // Recent work — most recently edited quotes and the latest jobs, newest first
  const recentAll: (HomeRecent & { at: number })[] = []
  if (can('quotes')) {
    for (const q of quotes) {
      const pill = QUOTE_PILL[q.status] ?? { text: q.status, tone: 'done' as PillTone }
      recentAll.push({
        id: `q-${q.id}`, title: q.customer?.name || q.ref, subtitle: `${q.ref} · ${q.jobType || 'Quote'}`,
        pill: pill.text, tone: pill.tone, href: '/quotes', Icon: FileText,
        at: time(q.lastEdited) || time(q.savedDate),
      })
    }
  }
  if (can('jobs')) {
    for (const j of jobs) {
      const pill = JOB_PILL[j.stage] ?? { text: j.stage, tone: 'done' as PillTone }
      recentAll.push({
        id: `j-${j.id}`, title: j.client || j.type, subtitle: [j.type, j.address].filter(Boolean).join(' · '),
        pill: pill.text, tone: pill.tone, href: '/jobs', Icon: Briefcase, at: time(j.start),
      })
    }
  }
  const recent: HomeRecent[] = recentAll.sort((a, b) => b.at - a.at).slice(0, 5)

  // Needs attention — only items that actually apply; a couple of steady prompts if nothing does
  const attention: HomeAttention[] = []
  if (can('invoices') && overdue.length) attention.push({ id: 'overdue', title: `${plural(overdue.length, 'overdue invoice')}`, hint: 'Chase payment', href: '/invoices', Icon: AlertTriangle })
  if (can('quotes') && sentQuotes.length) attention.push({ id: 'sent', title: `${plural(sentQuotes.length, 'quote')} awaiting a reply`, hint: 'Follow up with the client', href: '/quotes', Icon: Send })
  if (can('quotes') && draftQuotes.length) attention.push({ id: 'draft', title: `${plural(draftQuotes.length, 'draft quote')} to finish`, hint: 'Pick up where you left off', href: '/quotes', Icon: FileText })
  if (can('jobs') && heldJobs.length) attention.push({ id: 'held', title: `${plural(heldJobs.length, 'job')} on hold`, hint: 'Review and restart', href: '/jobs', Icon: PauseCircle })
  if (can('quotes')) attention.push({ id: 'requests', title: 'Quote requests', hint: 'Check for new enquiries', href: '/quote-requests', Icon: Mail })
  if (can('invoices') && attention.length < 4) attention.push({ id: 'bills', title: 'Bills and subcontractors', hint: 'Timesheets and payments', href: '/bills', Icon: Wallet })

  const quick: HomeQuick[] = QUICK.filter(i => can(i.perm) && i.label !== 'Scan to job' && i.label !== 'New quote').map(i =>
    'opensNotes' in i ? { label: i.label, Icon: i.Icon, onClick: onOpenNotes } : { label: i.label, Icon: i.Icon, href: i.href },
  )

  const userName = currentMember?.name || settings.contact || settings.name || 'there'
  const roleLabel = isOwner ? 'Owner' : currentMember?.role ? currentMember.role.charAt(0).toUpperCase() + currentMember.role.slice(1) : 'Team'

  return (
    <div className="launcher">
      <HomeOverview
        companyName={settings.name || 'Your company'}
        userName={userName}
        roleLabel={roleLabel}
        greeting={greeting()}
        nav={nav}
        footerNav={footerNav}
        stats={stats}
        recent={recent}
        attention={attention.slice(0, 4)}
        quick={quick}
        canScan={can('jobs')}
        canNewQuote={can('quotes')}
        onSignOut={signOut}
      />
    </div>
  )
}
