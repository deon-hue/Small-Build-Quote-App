'use client'

/**
 * "A new version is available": a page that was opened before a deploy keeps running the OLD code until it is reloaded, so something fixed in the new version (for example a quote's status after Update) can still
 * misbehave in a tab that has been open for hours. This asks /api/version when the tab is shown again and every 5 minutes while it is open; when the live build differs from the build this page was made with it shows
 * a bar with a Reload button. It never reloads on its own (that could lose something being typed): the bar says to save first.
 */

import { useEffect, useState } from 'react'
import { isOutOfDate } from '@/lib/new-version'

const EVERY_MS = 5 * 60_000

export default function NewVersionBanner() {
  const [stale, setStale] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    let stop = false
    async function check() {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json().catch(() => null)
        if (!stop && isOutOfDate(process.env.NEXT_PUBLIC_BUILD_ID, data?.build)) setStale(true)
      } catch { /* offline or the server is busy: try again later */ }
    }
    const first = setTimeout(check, 15_000)
    const timer = setInterval(check, EVERY_MS)
    const onShow = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onShow)
    return () => { stop = true; clearTimeout(first); clearInterval(timer); document.removeEventListener('visibilitychange', onShow) }
  }, [])

  if (!stale || hidden) return null
  return (
    <div role="status" data-testid="new-version-banner"
      style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 100000, maxWidth: 640, margin: '0 auto', background: '#1e2022', color: '#fff', borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.35)', border: '1px solid #9bd24a' }}>
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
        <strong>A new version is available.</strong> Save what you are doing, then reload so this page uses the latest fixes.
      </div>
      <button type="button" onClick={() => window.location.reload()}
        style={{ background: '#9bd24a', color: '#1e2022', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        Reload
      </button>
      <button type="button" onClick={() => setHidden(true)} aria-label="Hide for now"
        style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
    </div>
  )
}
