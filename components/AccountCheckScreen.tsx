'use client'

/**
 * "Checking your account…" with a way out. The server sends this before any script has run, so the way out must work without scripts: it is plain links, shown by a style rule after a few seconds
 * (at once when we know the account could not be reached). "Sign out" needs the app's code, so it only appears once that has loaded.
 */

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const link: React.CSSProperties = { display: 'block', padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border, #d7dbd5)', background: '#fff', color: '#1f2933', fontSize: 15, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit', cursor: 'pointer', width: '100%', boxSizing: 'border-box' }

/** the help under the message: `now` shows it at once, else after a few seconds */
export function AccountCheckHelp({ now }: { now?: boolean }) {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setLoaded(true) }, [])
  async function signOut() {
    try { await createClient().auth.signOut({ scope: 'local' }) } catch { /* nothing to clear */ }
    window.location.href = '/login'
  }
  return (
    <div data-testid="account-help" className="acct-help" style={{ animationDelay: now ? '0s' : '6s', maxWidth: 320, width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 22 }}>
      <style>{`.acct-help { visibility: hidden; animation-name: acct-help-in; animation-duration: 1ms; animation-fill-mode: forwards; } @keyframes acct-help-in { from { visibility: visible } to { visibility: visible } }`}</style>
      {!now && <div style={{ fontSize: 13, marginBottom: 2 }}>Taking longer than it should?</div>}
      <a href="" style={{ ...link, background: '#9acd32', borderColor: '#9acd32' }}>↻ Try again</a>
      <a href="/sub-portal" style={link}>I&apos;m a subcontractor</a>
      <a href="/portal" style={link}>I&apos;m a customer</a>
      {loaded && <button type="button" onClick={signOut} style={{ ...link, border: 'none', background: 'transparent', fontWeight: 500, fontSize: 13, textDecoration: 'underline', color: 'var(--muted, #6b7280)' }}>Sign out and sign in again</button>}
    </div>
  )
}

export default function AccountCheckScreen({ failed }: { failed?: boolean }) {
  return (
    <div data-testid="account-check" style={{ minHeight: '100vh', height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, boxSizing: 'border-box', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
      {failed ? (
        <div role="status">
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2933', marginBottom: 6 }}>Can&apos;t reach your account</div>
          <div>Your signal may be weak. Trying again by itself…</div>
        </div>
      ) : <div role="status">Checking your account…</div>}
      <AccountCheckHelp now={failed} />
    </div>
  )
}
