'use client'

// "Sent to them": what the company has sent a lead or a contact (design ideas, photographs, AI drawings, a scope of works, a brief), by email or WhatsApp, kept in the app: the date, how it went, the words and
// its own copy of every file, with a tick for whether the client can see it in their portal. Used on the lead's window (Leads page) and the contact's card (Contacts page). The buttons email something from the app,
// prepare a WhatsApp message, or log something that was already sent another way (SentComposer). Reads and writes through a SentStore (lib/sent-items-store.ts). Rules are lib/sent-items.ts.

import { useCallback, useEffect, useMemo, useState } from 'react'
import SentComposer, { type ComposerMode, type SentTarget } from '@/components/SentComposer'
import { CHANNEL_ICON, sortSent, summaryLine, whenShort, type SentItem } from '@/lib/sent-items'
import type { SentStore } from '@/lib/sent-items-store'

const heading: React.CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)' }

export default function SentHistory({ store, target, companyName, includeLeadsByEmail, onChanged, ensureContact }: {
  store: SentStore
  target: SentTarget
  /** on a lead's window: adds them to the contacts when something is sent to their portal (see SentComposer) */
  ensureContact?: () => Promise<string | null>
  companyName: string
  /** on a contact's card: also show what was sent to the leads that have the same email address (from before they were a contact) */
  includeLeadsByEmail?: boolean
  onChanged?: () => void
}) {
  const [items, setItems] = useState<SentItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ComposerMode | null>(null)
  const [note, setNote] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const leadIds = [...(target.leadId ? [target.leadId] : []), ...(includeLeadsByEmail && target.email ? await store.leadIdsFor(target.email) : [])]
    const r = await store.list({ clientId: target.clientId, email: target.email, leadIds: Array.from(new Set(leadIds)) })
    setItems(sortSent(r.items)); setMissing(r.missing)
    setUrls(await store.sign(r.items.flatMap(i => i.files)))
    setLoading(false)
  }, [store, target.clientId, target.leadId, target.email, includeLeadsByEmail])
  useEffect(() => { void load() }, [load])

  const count = items.length
  const nothingToSendTo = !target.leadId && !target.clientId
  const sub = useMemo(() => (count === 0 ? '' : ` (${count})`), [count])

  async function togglePortal(i: SentItem) {
    const err = await store.setPortal(i.id, !i.showInPortal)
    if (err) { setNote(err); return }
    setItems(p => p.map(x => (x.id === i.id ? { ...x, showInPortal: !x.showInPortal } : x)))
  }
  async function remove(i: SentItem) {
    if (!window.confirm('Delete this record, and the copies of its files kept here? This cannot be undone. (It does not unsend anything.)')) return
    const err = await store.remove(i)
    if (err) { setNote(err); return }
    setItems(p => p.filter(x => x.id !== i.id)); onChanged?.()
  }

  return (
    <div style={{ marginBottom: 20, border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: '#fff' }} data-testid="sent-history">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={heading}>Sent to them{sub}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-sm btn-outline" style={{ fontSize: 12 }} disabled={nothingToSendTo || missing} onClick={() => setMode('email')}>✉️ Email</button>
        <button type="button" className="btn-sm btn-outline" style={{ fontSize: 12 }} disabled={nothingToSendTo || missing} onClick={() => setMode('whatsapp')}>💬 WhatsApp</button>
        <button type="button" className="btn-sm btn-outline" style={{ fontSize: 12 }} disabled={nothingToSendTo || missing} onClick={() => setMode('log')}>📝 Log one already sent</button>
      </div>

      {missing && <div style={{ fontSize: 12.5, color: '#a93226', lineHeight: 1.5, marginBottom: 6 }}>This needs a one-off database step first: run <strong>supabase/sent-items.sql</strong>. Nothing else is affected.</div>}
      {note && <div role="status" style={{ fontSize: 12.5, color: '#2b5a2b', lineHeight: 1.5, marginBottom: 6 }}>{note}</div>}
      {loading && <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Loading…</div>}
      {!loading && !missing && items.length === 0 && (
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5 }}>Nothing sent yet. Email or WhatsApp them design ideas, photographs, drawings or a scope, and what you send is kept here, with its files, so you can always see what they have had.</div>
      )}

      {items.map(i => {
        const long = i.body.split('\n').length > 4 || i.body.length > 300
        const shown = open[i.id] || !long ? i.body : i.body.split('\n').slice(0, 4).join('\n').slice(0, 300) + '…'
        return (
          <div key={i.id} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'grid', gap: 6 }} data-testid="sent-item">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span aria-hidden="true">{CHANNEL_ICON[i.channel]}</span>
              <strong style={{ fontSize: 13 }}>{i.subject || (i.files.length ? 'Files' : 'Message')}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{whenShort(i.sentAt)}</span>
              <div style={{ flex: 1 }} />
              <label title="Whether the client can see this in their portal" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={i.showInPortal} onChange={() => togglePortal(i)} style={{ width: 'auto' }} /> In their portal
              </label>
              <button type="button" onClick={() => remove(i)} title="Delete this record" aria-label="Delete this record" style={{ background: 'none', border: 'none', color: '#a93226', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{summaryLine(i)}{i.toEmail && i.channel === 'email' ? ` · to ${i.toEmail}` : ''}</div>
            {i.body && (
              <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {shown}
                {long && <button type="button" onClick={() => setOpen(p => ({ ...p, [i.id]: !p[i.id] }))} style={{ background: 'none', border: 'none', color: 'var(--moss)', cursor: 'pointer', fontSize: 12, padding: '0 0 0 6px', fontWeight: 600 }}>{open[i.id] ? 'Show less' : 'Show more'}</button>}
              </div>
            )}
            {i.files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {i.files.map(f => {
                  const u = urls[f.path]
                  return f.isImage && u ? (
                    <a key={f.path} href={u} target="_blank" rel="noopener noreferrer" title={f.name} style={{ display: 'block', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={u} alt={f.name} style={{ width: 72, height: 72, objectFit: 'cover', display: 'block' }} />
                    </a>
                  ) : (
                    <a key={f.path} href={u || undefined} target="_blank" rel="noopener noreferrer" title={f.name} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, textDecoration: 'none', color: 'inherit', maxWidth: 220 }}>
                      <span aria-hidden="true">📄</span><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    </a>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {mode && (
        <SentComposer
          store={store} target={target} companyName={companyName} mode={mode} ensureContact={ensureContact}
          onClose={() => setMode(null)}
          onSaved={(item, msg) => { setMode(null); setNote(msg || ''); void load(); onChanged?.(); if (item) setItems(p => sortSent([item, ...p.filter(x => x.id !== item.id)])) }}
        />
      )}
    </div>
  )
}
