'use client'

import { useEffect, useState } from 'react'

export default function PortalInstallBanner() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    const dismissed = localStorage.getItem('pwa-banner-dismissed')
    const mobile = window.innerWidth < 768
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream

    setIsIOS(ios)
    if (!standalone && !dismissed && mobile) setShow(true)
  }, [])

  if (!show) return null

  function dismiss() {
    localStorage.setItem('pwa-banner-dismissed', '1')
    setShow(false)
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: '#484f5a', color: '#fff',
      padding: '14px 16px', zIndex: 9999,
      borderTop: '3px solid #b8cc00',
      boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
            📲 Add to your home screen
          </div>
          {isIOS ? (
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
              Tap <strong>Share</strong> ↑ then <strong>"Add to Home Screen"</strong> for one-tap access
            </div>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.85, lineHeight: 1.5 }}>
              Tap <strong>⋮ menu</strong> then <strong>"Add to Home Screen"</strong> for one-tap access
            </div>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            background: 'none', border: 'none', color: '#fff',
            fontSize: 20, cursor: 'pointer', lineHeight: 1,
            padding: '2px 4px', opacity: 0.7, flexShrink: 0,
          }}
        >✕</button>
      </div>
    </div>
  )
}
