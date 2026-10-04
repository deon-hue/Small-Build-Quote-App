'use client'

// A small "Report a problem" button for contractors. The message goes to the platform owner's Feedback page tagged with the
// company, the person and the page they were on (database function submit_feedback — limited to 20 a day per person).

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function FeedbackButton() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const supabase = createClient()
      const { data, error: rpcErr } = await supabase.rpc('submit_feedback', { p_page: pathname, p_message: text })
      if (rpcErr) throw rpcErr
      const r = data as { ok?: boolean; error?: string } | null
      if (!r?.ok) {
        throw new Error(r?.error === 'limit' ? 'You’ve sent a lot of messages today — please try again tomorrow.'
          : r?.error === 'too_long' ? 'That message is too long. Please shorten it.'
          : r?.error === 'empty' ? 'Please write a message first.'
          : 'Sorry, that didn’t send. Please try again.')
      }
      setDone(true); setText('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sorry, that didn’t send. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function close() { setOpen(false); setDone(false); setError('') }

  // Lets other screens (the Help page) open this same form: window.dispatchEvent(new Event('open-feedback'))
  useEffect(() => {
    const openIt = () => setOpen(true)
    window.addEventListener('open-feedback', openIt)
    return () => window.removeEventListener('open-feedback', openIt)
  }, [])

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report a problem or suggest something"
        aria-label="Report a problem or suggest something"
        style={{
          position: 'fixed', right: 14, bottom: 14, zIndex: 900, width: 38, height: 38, borderRadius: '50%',
          border: '1.5px solid var(--border)', background: '#fff', color: '#4a5058', fontSize: 17, fontWeight: 800,
          cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
        }}
      >?</button>

      {open && (
        <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 12 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 'min(440px, 100%)', padding: 18, marginBottom: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            {done ? (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 34 }}>✅</div>
                <div style={{ fontWeight: 700, margin: '6px 0' }}>Thank you — that’s been sent</div>
                <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>It helps us make the app better.</div>
                <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={close}>Close</button>
              </div>
            ) : (
              <form onSubmit={send}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Report a problem or suggest something</div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 10 }}>Tell us what happened or what you’d like. We’ll see which page you’re on.</div>
                <textarea rows={5} value={text} onChange={e => setText(e.target.value)} placeholder="What went wrong, or what would make this better?" required maxLength={4000} style={{ width: '100%' }} autoFocus />
                {error && <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(192,57,43,0.1)', color: 'var(--terra)', borderRadius: 6, fontSize: 13 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-outline" onClick={close}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
