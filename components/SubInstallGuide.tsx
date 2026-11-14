'use client'

/**
 * "Put this on your phone's home screen": a big, plain card for the subcontractor portal, shown on the sign-in page and the home screen until the portal is opened FROM the home-screen icon (or
 * the person taps "Don't show this again"). On an iPhone the steps are Share, Add to Home Screen, Add, and it says to open the new icon and sign in there once (an iPhone's home-screen app keeps its
 * own sign-in, separate from Safari's). On Android with a browser that can install it, there is one big Install button; otherwise the menu steps. Nothing is shown on a computer.
 */

import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const KEY = 'sub_install_guide_hidden'

const card: React.CSSProperties = { background: '#f0f9e8', border: '2px solid #9bd24a', borderRadius: 14, padding: '16px 16px 14px', marginTop: 20, textAlign: 'left' }
const step: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 17, lineHeight: 1.4, color: '#0f172a', marginBottom: 10 }
const num: React.CSSProperties = { flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: '#1e2022', color: '#fff', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }

export default function SubInstallGuide() {
  const [mode, setMode] = useState<'hidden' | 'ios' | 'android'>('hidden')
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    let hidden = false
    try { hidden = localStorage.getItem(KEY) === '1' } catch { /* storage unavailable */ }
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (hidden || standalone) return
    const ua = navigator.userAgent
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    const android = /Android/.test(ua)
    if (ios) setMode('ios')
    else if (android) setMode('android')
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPromptEvent) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function hide() {
    try { localStorage.setItem(KEY, '1') } catch { /* storage unavailable */ }
    setMode('hidden')
  }
  async function install() {
    if (!prompt) return
    await prompt.prompt()
    try { const r = await prompt.userChoice; if (r.outcome === 'accepted') hide() } catch { /* ignore */ }
  }

  if (mode === 'hidden') return null
  return (
    <div style={card} data-testid="sub-install-guide">
      <div style={{ fontSize: 19, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>📲 Put this on your phone</div>
      <div style={{ fontSize: 15, color: '#475569', marginBottom: 12, lineHeight: 1.4 }}>One tap to open it from your home screen, and it keeps you signed in.</div>

      {mode === 'ios' && (
        <>
          <div style={step}><span style={num}>1</span><span>Tap the <strong>Share</strong> button at the bottom of Safari (a square with an arrow pointing up).</span></div>
          <div style={step}><span style={num}>2</span><span>Scroll down and tap <strong>Add to Home Screen</strong>.</span></div>
          <div style={step}><span style={num}>3</span><span>Tap <strong>Add</strong> at the top.</span></div>
          <div style={step}><span style={num}>4</span><span>Open the new <strong>Sub Portal</strong> icon and <strong>sign in there</strong>. Do this once: after that it stays signed in.</span></div>
        </>
      )}

      {mode === 'android' && (
        prompt ? (
          <button type="button" onClick={install} style={{ width: '100%', padding: '16px', fontSize: 19, fontWeight: 700, background: '#1e2022', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', marginBottom: 8 }}>
            Put it on my home screen
          </button>
        ) : (
          <>
            <div style={step}><span style={num}>1</span><span>Tap the <strong>three dots</strong> at the top right of Chrome.</span></div>
            <div style={step}><span style={num}>2</span><span>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).</span></div>
            <div style={step}><span style={num}>3</span><span>Tap <strong>Install</strong>, then open the new <strong>Sub Portal</strong> icon.</span></div>
          </>
        )
      )}

      <button type="button" onClick={hide} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 14, textDecoration: 'underline', cursor: 'pointer', padding: '6px 0 0' }}>
        Don&apos;t show this again
      </button>
    </div>
  )
}
