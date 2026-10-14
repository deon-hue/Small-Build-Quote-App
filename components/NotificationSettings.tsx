'use client'

// Settings > Notifications: switch alerts on for THIS phone or tablet, choose what you are told about, send yourself a test, and turn them off. Alerts go to the person who owns the
// company. The choices are saved against the person (notification_prefs), the on/off for a device against that device (push_subscriptions).

import React, { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPushState, enablePush, disablePush, type PushState } from '@/lib/push-client'
import { PUSH_CATEGORIES } from '@/lib/push-categories'

type Prefs = { enabled: boolean; supplier_replies: boolean; sub_notes: boolean; timesheets: boolean; daily_summary: boolean }
const DEFAULTS: Prefs = { enabled: true, supplier_replies: true, sub_notes: true, timesheets: true, daily_summary: true }

function Switch({ on, onChange, label, hint, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      <span role="switch" aria-checked={on} style={{ flexShrink: 0, marginTop: 2, width: 44, height: 26, borderRadius: 13, background: on ? '#7ab533' : '#cbd5e1', position: 'relative', transition: 'background 0.15s' }}>
        <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.15s' }} />
      </span>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>{hint}</span>}
      </span>
    </label>
  )
}

export default function NotificationSettings() {
  const [state, setState] = useState<PushState | null>(null)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [prefsMissing, setPrefsMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const refresh = useCallback(async () => { setState(await getPushState()) }, [])

  useEffect(() => {
    void refresh()
    ;(async () => {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const { data, error } = await sb.from('notification_prefs').select('*').eq('user_id', user.id).maybeSingle()
      if (error) { setPrefsMissing(/does not exist|schema cache|PGRST205|42P01/i.test(error.message)); return }
      if (data) setPrefs({ ...DEFAULTS, ...(data as Partial<Prefs>) })
    })()
  }, [refresh])

  async function savePrefs(next: Prefs) {
    setPrefs(next)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { error } = await sb.from('notification_prefs').upsert({ user_id: user.id, ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) setNotice({ ok: false, text: /does not exist|schema cache|PGRST205|42P01/i.test(error.message) ? 'Notifications need a small database update first: run supabase/push-notifications.sql in the Supabase SQL editor.' : `Could not save that. ${error.message}` })
  }

  async function turnOn() {
    setBusy(true); setNotice(null)
    const r = await enablePush()
    setBusy(false)
    if (!r.ok) setNotice({ ok: false, text: r.error || 'Could not turn notifications on.' })
    else setNotice({ ok: true, text: 'Notifications are on for this device. Press “Send me a test” to see one.' })
    await refresh()
  }

  async function turnOff() {
    setBusy(true); setNotice(null)
    await disablePush()
    setBusy(false)
    setNotice({ ok: true, text: 'Notifications are off for this device.' })
    await refresh()
  }

  async function sendTest() {
    setBusy(true); setNotice(null)
    try {
      const res = await fetch('/api/push/test', { method: 'POST' })
      const d = await res.json().catch(() => ({})) as { error?: string }
      setNotice(res.ok ? { ok: true, text: 'Test sent. It should pop up in a few seconds.' } : { ok: false, text: d.error || 'Could not send the test.' })
    } catch { setNotice({ ok: false, text: 'Could not send the test. Check your connection.' }) }
    setBusy(false)
  }

  const btn: React.CSSProperties = { padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
  const primary: React.CSSProperties = { ...btn, background: '#7ab533', borderColor: '#7ab533', color: '#fff' }

  return (
    <div className="card" id="notifications">
      <div className="card-hd">Notifications</div>
      <div style={{ padding: '16px 20px' }}>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
          Get an alert on your phone or tablet when something needs you, even when the app is closed. Switch it on separately for each device you use.
        </p>

        {state === null && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Checking this device…</div>}
        {state === 'not-configured' && <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px' }}>Notifications are not set up on this site yet.</div>}
        {state === 'unsupported' && <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>This browser cannot show notifications. Try Chrome, Edge or Safari, or the app added to your Home Screen.</div>}
        {state === 'needs-install' && (
          <div style={{ fontSize: 13, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6 }}>
            On an iPhone or iPad, add the app to your Home Screen first:<br />
            1. Tap the <strong>Share</strong> button (the square with an arrow) at the bottom of Safari.<br />
            2. Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.<br />
            3. Open the app from the new icon, come back to <strong>Settings, Notifications</strong> and turn them on there.
          </div>
        )}
        {state === 'blocked' && <div style={{ fontSize: 13, color: '#991b1b', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>Notifications are blocked for this app on this device. Allow them in your phone or browser settings for this site, then come back and press the button.</div>}

        {state === 'off' && <button style={primary} disabled={busy} onClick={turnOn}>{busy ? 'Turning on…' : '🔔 Turn on notifications on this device'}</button>}
        {state === 'on' && (
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#166534', marginBottom: 10 }}>✓ Notifications are on for this device</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={btn} disabled={busy} onClick={sendTest}>Send me a test</button>
              <button style={btn} disabled={busy} onClick={turnOff}>Turn off on this device</button>
            </div>
          </div>
        )}

        {notice && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 8, fontSize: 13, background: notice.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${notice.ok ? '#bbf7d0' : '#fecaca'}`, color: notice.ok ? '#166534' : '#991b1b', lineHeight: 1.5 }}>{notice.text}</div>}

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>What to tell me about</div>
          {prefsMissing && <div style={{ fontSize: 12, color: '#92400e', margin: '6px 0' }}>Saving these choices needs supabase/push-notifications.sql to be run once.</div>}
          <Switch on={prefs.enabled} onChange={v => savePrefs({ ...prefs, enabled: v })} label="Notifications" hint="The master switch. Off pauses every alert on all your devices without losing your choices below." />
          {PUSH_CATEGORIES.map(c => (
            <Switch key={c.key} on={prefs[c.key]} disabled={!prefs.enabled} onChange={v => savePrefs({ ...prefs, [c.key]: v })} label={c.label} hint={c.hint} />
          ))}
        </div>
      </div>
    </div>
  )
}
