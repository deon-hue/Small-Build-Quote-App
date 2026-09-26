'use client'

/**
 * HomeOverview — the phone/tablet Home screen: a left navigation rail (tablets in landscape), a greeting,
 * three headline numbers, recent work, what needs attention and quick access. Purely presentational — the
 * numbers, lists and permission filtering are worked out by MobileLauncher and passed in, so this can be
 * shown with sample data on a scratch page. Styles are in HomeOverview.css; only the wrapper that shows it
 * (globals.css, `.launcher`) is limited to touch hardware.
 */

import Link from 'next/link'
import { ChevronRight, LayoutGrid, LogOut, Plus, Camera, type LucideIcon } from 'lucide-react'
import './HomeOverview.css'

export interface HomeLink { label: string; href: string; Icon: LucideIcon }
export interface HomeStat { label: string; value: number; hint: string; href: string; Icon: LucideIcon }
export type PillTone = 'draft' | 'live' | 'sent' | 'stop' | 'done'
export interface HomeRecent { id: string; title: string; subtitle: string; pill: string; tone: PillTone; href: string; Icon: LucideIcon }
export interface HomeAttention { id: string; title: string; hint: string; href: string; Icon: LucideIcon }
export interface HomeQuick { label: string; Icon: LucideIcon; href?: string; onClick?: () => void }

export interface HomeOverviewProps {
  companyName: string
  userName: string
  roleLabel: string
  greeting: string
  nav: HomeLink[]
  footerNav: HomeLink[]
  stats: HomeStat[]
  recent: HomeRecent[]
  attention: HomeAttention[]
  quick: HomeQuick[]
  canScan: boolean
  canNewQuote: boolean
  activePath?: string
  onSignOut: () => void
}

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?'

function Brand() {
  return (
    <div className="ho-brand">
      <span className="ho-brand-mark">B</span>
      <span className="ho-brand-name">Build<span>OS</span> Pro</span>
    </div>
  )
}

export default function HomeOverview(p: HomeOverviewProps) {
  const active = p.activePath ?? '/dashboard'
  return (
    <div className="ho">
      {/* Navigation rail — wide (tablet landscape) screens */}
      <aside className="ho-side" aria-label="Main navigation">
        <Brand />
        <div className="ho-workspace">
          <span className="ho-workspace-ico">{initials(p.companyName)}</span>
          <span className="ho-workspace-text">
            <span className="ho-workspace-name">{p.companyName}</span>
            <span className="ho-workspace-sub">Company workspace</span>
          </span>
        </div>
        <div className="ho-side-label">Workspace</div>
        <nav className="ho-nav">
          {[{ label: 'Overview', href: '/dashboard', Icon: LayoutGrid }, ...p.nav].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className={`ho-nav-item${href === active ? ' is-active' : ''}`}>
              <Icon size={20} strokeWidth={1.9} /><span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="ho-side-foot">
          {p.footerNav.map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="ho-nav-item"><Icon size={20} strokeWidth={1.9} /><span>{label}</span></Link>
          ))}
          <div className="ho-user">
            <span className="ho-user-ico">{initials(p.userName)}</span>
            <span className="ho-user-text">
              <span className="ho-user-name">{p.userName}</span>
              <span className="ho-user-sub">{p.roleLabel}</span>
            </span>
            <button type="button" className="ho-icon-btn" onClick={p.onSignOut} aria-label="Sign out"><LogOut size={18} /></button>
          </div>
        </div>
      </aside>

      <main className="ho-main">
        {/* Narrow screens (phones, tablet portrait): brand + a scrolling row of areas instead of the rail */}
        <div className="ho-compact">
          <Brand />
          <div className="ho-compact-co">{p.companyName}</div>
        </div>
        <nav className="ho-chips" aria-label="Areas">
          {[...p.nav, ...p.footerNav].map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="ho-chip"><Icon size={17} strokeWidth={1.9} />{label}</Link>
          ))}
          <button type="button" className="ho-chip ho-chip-out" onClick={p.onSignOut}><LogOut size={17} />Sign out</button>
        </nav>

        <div className="ho-crumb"><span>Workspace</span><span className="ho-crumb-sep">/</span><strong>Overview</strong></div>

        <div className="ho-hello">
          <div>
            <div className="ho-kicker">Your business at a glance</div>
            <h1 className="ho-title">{p.greeting}, {p.userName.split(' ')[0]}</h1>
            <p className="ho-lead">Pick up where you left off and keep your jobs moving.</p>
          </div>
          <div className="ho-actions">
            {p.canScan && <Link href="/scan" className="ho-btn ho-btn-light"><Camera size={18} />Scan to job</Link>}
            {p.canNewQuote && <Link href="/new-quote" className="ho-btn ho-btn-lime"><Plus size={18} strokeWidth={2.4} />New quote</Link>}
          </div>
        </div>

        {p.stats.length > 0 && (
          <section className="ho-stats">
            {p.stats.map(({ label, value, hint, href, Icon }) => (
              <Link key={label} href={href} className="ho-card ho-stat">
                <span className="ho-stat-ico"><Icon size={22} strokeWidth={1.8} /></span>
                <span className="ho-stat-label">{label}</span>
                <span className="ho-stat-value">{value}</span>
                <span className="ho-stat-hint">{hint}</span>
              </Link>
            ))}
          </section>
        )}

        <div className="ho-two">
          <section className="ho-card ho-panel">
            <div className="ho-panel-head">
              <div>
                <h2 className="ho-h2">Recent work</h2>
                <p className="ho-sub">Quotes and jobs you have been working on</p>
              </div>
            </div>
            {p.recent.length === 0 ? (
              <div className="ho-empty">Nothing yet — start a new quote to get going.</div>
            ) : (
              <div className="ho-list">
                {p.recent.map(({ id, title, subtitle, pill, tone, href, Icon }) => (
                  <Link key={id} href={href} className="ho-row">
                    <span className="ho-row-ico"><Icon size={20} strokeWidth={1.8} /></span>
                    <span className="ho-row-text">
                      <span className="ho-row-title">{title}</span>
                      <span className="ho-row-sub">{subtitle}</span>
                    </span>
                    <span className={`ho-pill tone-${tone}`}>{pill}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="ho-card ho-panel">
            <div className="ho-panel-head">
              <div>
                <h2 className="ho-h2">Needs your attention</h2>
                <p className="ho-sub">Useful next steps, all in one place</p>
              </div>
            </div>
            <div className="ho-list">
              {p.attention.map(({ id, title, hint, href, Icon }) => (
                <Link key={id} href={href} className="ho-row">
                  <span className="ho-row-ico"><Icon size={20} strokeWidth={1.8} /></span>
                  <span className="ho-row-text">
                    <span className="ho-row-title">{title}</span>
                    <span className="ho-row-sub">{hint}</span>
                  </span>
                  <ChevronRight size={18} className="ho-row-go" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        {p.quick.length > 0 && (
          <section className="ho-quick">
            <div className="ho-quick-head">
              <h2 className="ho-h2">Quick access</h2>
              <p className="ho-sub">Everything else is one tap away</p>
            </div>
            <div className="ho-quick-grid">
              {p.quick.map(({ label, Icon, href, onClick }) => {
                const inner = <><Icon size={19} strokeWidth={1.9} /><span>{label}</span></>
                return href
                  ? <Link key={label} href={href} className="ho-card ho-quick-item">{inner}</Link>
                  : <button key={label} type="button" className="ho-card ho-quick-item" onClick={onClick}>{inner}</button>
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
