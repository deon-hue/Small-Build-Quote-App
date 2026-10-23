'use client'

/**
 * A short animated how-to for subcontractors (and clients): how to sign in to the portal with the emailed code. It plays by itself on a phone-shaped screen, one step at a time with a caption, and
 * can be paused, replayed or jumped to any step. Public (no sign-in needed) so the link can go in the invite email and on the sign-in page.
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const LIME = '#7ab533'
const INK = '#2a3036'
const MUTED = '#6b7480'

interface Scene { title: string; caption: string; ms: number }
const SCENES: Scene[] = [
  { title: '1. Open the sign-in page', caption: 'Open the link in your invite email, or type the address into your phone: app.buildospro.ai/sub-portal/login', ms: 6500 },
  { title: '2. Type your email', caption: 'Type the same email address your builder has for you.', ms: 5500 },
  { title: '3. Ask for a code', caption: 'Press “Email me a sign-in code”. There is no password to make up or remember.', ms: 5000 },
  { title: '4. Find the email', caption: 'Open your email app and find the email called “Your subcontractor portal sign-in code”. It can take a minute. Not there? Look in your junk or spam folder.', ms: 7500 },
  { title: '5. Type the code', caption: 'Go back to the sign-in page and type in the code from the email. It signs you in as soon as the last number is typed.', ms: 7000 },
  { title: '6. You are in', caption: 'That is it. Next time, do the same again: email, code, in. The code only works once and runs out after an hour.', ms: 6000 },
  { title: 'Tip: keep it one tap away', caption: 'On iPhone: open the portal in Safari, tap Share, then “Add to Home Screen”. On Android: tap the ⋮ menu, then “Add to Home screen”.', ms: 8000 },
]
const TOTAL = SCENES.reduce((s, c) => s + c.ms, 0)
const CODE = '48271956'
const EMAIL = 'you@email.com'

const typed = (text: string, lt: number, start: number, perChar: number) => text.slice(0, Math.max(0, Math.min(text.length, Math.floor((lt - start) / perChar))))

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: 300, height: 560, borderRadius: 38, background: '#111', padding: 10, boxShadow: '0 18px 50px rgba(0,0,0,0.35)', flexShrink: 0 }}>
      <div style={{ width: '100%', height: '100%', borderRadius: 29, background: '#fff', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 90, height: 20, background: '#111', borderRadius: '0 0 14px 14px', zIndex: 5 }} />
        {children}
      </div>
    </div>
  )
}

function Browser({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '30px 12px 8px', background: '#f1f3f1', borderBottom: '1px solid #e1e5e1' }}>
        <div style={{ background: '#fff', border: '1px solid #dde2dd', borderRadius: 18, padding: '5px 12px', fontSize: 11, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🔒 {url}</div>
      </div>
      <div style={{ flex: 1, padding: 16, background: '#f6f8f5', overflow: 'hidden' }}>{children}</div>
    </div>
  )
}

function LoginCard({ email, code, step, busy }: { email: string; code?: string; step: 'email' | 'code'; busy?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e1e5e1', borderRadius: 10, padding: 16 }}>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 13, color: LIME, marginBottom: 6 }}>🔧 Subcontractor Portal</div>
      <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 17, marginBottom: 14, color: INK }}>Sign in to your portal</div>
      {step === 'email' ? (<>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 4, letterSpacing: 0.5 }}>EMAIL ADDRESS</div>
        <div style={{ border: '2px solid ' + (email ? LIME : '#d6dbd6'), borderRadius: 6, padding: '9px 10px', fontSize: 13, minHeight: 20, color: INK, marginBottom: 12 }}>{email}<span style={{ opacity: email.length < EMAIL.length ? 1 : 0 }}>|</span></div>
        <div style={{ background: busy ? '#5d8f26' : LIME, color: '#fff', borderRadius: 6, padding: '11px 0', textAlign: 'center', fontWeight: 700, fontSize: 13, transform: busy ? 'scale(0.97)' : 'none', transition: 'transform .15s' }}>
          {busy ? 'Sending…' : '📧 Email me a sign-in code'}
        </div>
      </>) : (<>
        <div style={{ background: '#e8f5dc', border: '1px solid #c5e3a8', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#2f5d12', marginBottom: 12, lineHeight: 1.4 }}>
          We have just emailed a sign-in code to <strong>{EMAIL}</strong>. Type it below.
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, marginBottom: 4, letterSpacing: 0.5 }}>SIGN-IN CODE</div>
        <div style={{ border: '2px solid ' + LIME, borderRadius: 6, padding: '8px 6px', fontSize: 22, letterSpacing: 5, textAlign: 'center', fontFamily: 'monospace', minHeight: 30, color: INK }}>{code || ''}<span style={{ opacity: (code || '').length < CODE.length ? 1 : 0 }}>|</span></div>
      </>)}
    </div>
  )
}

function MailApp({ show }: { show: boolean }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ padding: '32px 14px 10px', fontWeight: 700, fontSize: 18, borderBottom: '1px solid #eee', color: INK }}>Inbox</div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 12, color: MUTED }}>
        <div style={{ fontWeight: 700, color: INK }}>A friendly builder</div>
        <div>Site meeting on Thursday</div>
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 12, color: MUTED, background: show ? '#f3f9ec' : '#fff', transition: 'background .4s', opacity: show ? 1 : 0, transform: show ? 'none' : 'translateY(-14px)' }}>
        <div style={{ fontWeight: 700, color: INK }}>BuildOS Pro <span style={{ float: 'right', color: LIME, fontSize: 10 }}>now</span></div>
        <div style={{ fontWeight: 600, color: INK }}>Your subcontractor portal sign-in code</div>
        <div style={{ marginTop: 4, fontFamily: 'monospace', letterSpacing: 3, fontSize: 18, color: INK }}>{CODE.slice(0, 4)} {CODE.slice(4)}</div>
      </div>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 12, color: MUTED }}>
        <div style={{ fontWeight: 700, color: INK }}>Merchant</div>
        <div>Your order is ready to collect</div>
      </div>
    </div>
  )
}

function PortalHome() {
  const row = (a: string, b: string) => (
    <div style={{ background: '#fff', border: '1px solid #e1e5e1', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: INK }}>{a}</div><div style={{ fontSize: 11, color: MUTED }}>{b}</div>
    </div>
  )
  return (
    <div style={{ height: '100%', background: '#f6f8f5' }}>
      <div style={{ background: '#3a4149', color: '#fff', padding: '34px 16px 12px', fontWeight: 700, fontSize: 15 }}>🔧 Your portal</div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, marginBottom: 8 }}>YOUR JOBS</div>
        {row('14 Elm Road', 'Rear extension · this week')}
        {row('3 High Street', 'Bathroom · from Monday')}
        <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, margin: '14px 0 8px' }}>TIMESHEETS · PAYMENTS</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, background: LIME, color: '#fff', borderRadius: 8, padding: '10px 0', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>Log hours</div>
          <div style={{ flex: 1, background: '#fff', border: '1px solid #e1e5e1', color: INK, borderRadius: 8, padding: '10px 0', textAlign: 'center', fontWeight: 700, fontSize: 12 }}>Payments</div>
        </div>
      </div>
    </div>
  )
}

function ShareSheet() {
  return (
    <div style={{ height: '100%', background: '#f6f8f5', position: 'relative' }}>
      <PortalHome />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: '#f2f2f4', borderRadius: '16px 16px 0 0', padding: '14px 16px 22px', boxShadow: '0 -4px 16px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', fontSize: 11, color: MUTED, marginBottom: 10 }}>Share</div>
        <div style={{ background: '#fff', borderRadius: 10, padding: '11px 12px', fontSize: 13, color: INK, display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Copy</span><span>⧉</span></div>
        <div style={{ background: '#fff', borderRadius: 10, padding: '11px 12px', fontSize: 13, color: INK, display: 'flex', justifyContent: 'space-between', outline: '3px solid ' + LIME }}><span><strong>Add to Home Screen</strong></span><span>＋</span></div>
      </div>
    </div>
  )
}

export default function HowToSignInPage() {
  const [playing, setPlaying] = useState(true)
  const [t, setT] = useState(0)
  const last = useRef<number | null>(null)

  useEffect(() => {
    if (!playing) { last.current = null; return }
    const id = setInterval(() => {
      const now = performance.now()
      const dt = last.current == null ? 0 : now - last.current
      last.current = now
      setT(prev => (prev + dt) % TOTAL)
    }, 50)
    return () => clearInterval(id)
  }, [playing])

  let acc = 0, idx = 0
  for (let i = 0; i < SCENES.length; i++) { if (t < acc + SCENES[i].ms) { idx = i; break } acc += SCENES[i].ms; idx = i }
  const lt = t - acc
  const scene = SCENES[idx]
  const jump = (i: number) => { setT(SCENES.slice(0, i).reduce((s, c) => s + c.ms, 0) + 1); setPlaying(true) }

  let screen: React.ReactNode
  if (idx === 0) screen = <Browser url={lt < 2200 ? typed('app.buildospro.ai/sub-portal/login', lt, 300, 55) : 'app.buildospro.ai/sub-portal/login'}><div style={{ opacity: lt > 2400 ? 1 : 0, transition: 'opacity .5s' }}><LoginCard email="" step="email" /></div></Browser>
  else if (idx === 1) screen = <Browser url="app.buildospro.ai/sub-portal/login"><LoginCard email={typed(EMAIL, lt, 500, 150)} step="email" /></Browser>
  else if (idx === 2) screen = <Browser url="app.buildospro.ai/sub-portal/login"><LoginCard email={EMAIL} step={lt > 2600 ? 'code' : 'email'} busy={lt > 1400 && lt <= 2600} /></Browser>
  else if (idx === 3) screen = <MailApp show={lt > 1500} />
  else if (idx === 4) screen = <Browser url="app.buildospro.ai/sub-portal/login"><LoginCard email={EMAIL} step="code" code={typed(CODE, lt, 800, 380)} /></Browser>
  else if (idx === 5) screen = <PortalHome />
  else screen = <ShareSheet />

  return (
    <div style={{ minHeight: '100vh', background: '#eef2ec', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', color: INK }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px 40px' }}>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: LIME, letterSpacing: 1 }}>BUILDOS PRO</div>
          <h1 style={{ fontSize: 26, margin: '4px 0 6px' }}>How to sign in to your portal</h1>
          <p style={{ margin: 0, color: MUTED, fontSize: 15 }}>About a minute. No password to remember: you get a code by email.</p>
        </div>

        <div style={{ display: 'flex', gap: 28, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Phone>{screen}</Phone>
          <div style={{ flex: '1 1 280px', maxWidth: 380 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: LIME, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Step {Math.min(idx + 1, 6)}{idx === 6 ? ' (tip)' : ' of 6'}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}>{scene.title}</div>
            <div style={{ fontSize: 17, lineHeight: 1.6, color: '#3d454e', minHeight: 130 }}>{scene.caption}</div>
            <div style={{ height: 6, background: '#d9e0d5', borderRadius: 3, margin: '18px 0 12px', overflow: 'hidden' }}>
              <div style={{ width: `${(t / TOTAL) * 100}%`, height: '100%', background: LIME }} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setPlaying(p => !p)} style={{ background: INK, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>{playing ? '⏸ Pause' : '▶ Play'}</button>
              <button onClick={() => { setT(0); setPlaying(true) }} style={{ background: '#fff', color: INK, border: '1px solid #c9d1c5', borderRadius: 8, padding: '10px 14px', fontSize: 15, cursor: 'pointer' }}>↺ Start again</button>
              <div style={{ display: 'flex', gap: 6, marginLeft: 6 }}>
                {SCENES.map((s, i) => (
                  <button key={i} onClick={() => jump(i)} aria-label={s.title} title={s.title}
                    style={{ width: i === idx ? 26 : 12, height: 12, borderRadius: 6, border: 'none', background: i === idx ? LIME : '#c3ccbd', cursor: 'pointer', padding: 0, transition: 'width .2s' }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <Link href="/sub-portal/login" style={{ display: 'inline-block', background: LIME, color: '#fff', textDecoration: 'none', padding: '14px 28px', borderRadius: 8, fontWeight: 700, fontSize: 16 }}>Go to the sign-in page →</Link>
          <p style={{ color: MUTED, fontSize: 13, marginTop: 14, lineHeight: 1.6 }}>Still stuck? Tell your builder what the page says and they can help.</p>
        </div>
      </div>
    </div>
  )
}
