'use client'

// Book, change or cancel a site visit with a lead (opened from the lead's window on the Leads page). It saves the visit on the lead, emails the customer the details with a calendar file, and, for a customer
// with no email address (or as well), gives the same words as a WhatsApp message to press send on. The server half is app/api/leads/visit; the rules are in lib/lead-visit.ts.

import { useState } from 'react'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'
import { addDays, whatsappLink } from '@/lib/leads'
import { localParts, visitWhenLong, VISIT_DEFAULT_MINUTES, VISIT_NOTE_MAX } from '@/lib/lead-visit'

export interface VisitLead {
  id: string
  client_name: string
  client_email: string
  client_phone: string
  project_address: string
  visit_at?: string | null
  visit_minutes?: number
  visit_note?: string
  visit_address?: string
  visit_status?: string
}

/** What a booking changes on the lead, handed back so the list and the open lead can be updated without a reload */
export interface VisitFields {
  visit_at: string | null; visit_minutes: number; visit_note: string; visit_address: string; visit_status: string; visit_seq: number
  status: string; chase_on: string | null
}

const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }
const LENGTHS: [number, string][] = [[30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours']]

export default function LeadVisitModal({ lead, mode, today, onClose, onDone }: {
  lead: VisitLead; mode: 'book' | 'reschedule' | 'cancel'; today: string; onClose: () => void; onDone: (f: VisitFields) => void
}) {
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()
  const had = localParts(lead.visit_at)
  const [date, setDate] = useState(mode === 'reschedule' && had ? had.ymd : addDays(today, 1))
  const [time, setTime] = useState(mode === 'reschedule' && had ? had.hm : '10:00')
  const [minutes, setMinutes] = useState(mode === 'reschedule' ? lead.visit_minutes || VISIT_DEFAULT_MINUTES : VISIT_DEFAULT_MINUTES)
  const [address, setAddress] = useState((mode === 'reschedule' ? lead.visit_address : '') || lead.project_address || '')
  const [note, setNote] = useState(mode === 'reschedule' ? lead.visit_note || '' : '')
  const hasEmail = !!lead.client_email.trim()
  const [sendEmail, setSendEmail] = useState(hasEmail)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ kind: string; emailed: boolean; emailNote: string; message: string } | null>(null)

  async function go() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/leads/visit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, action: mode, date, time, minutes, note, address, sendEmail: sendEmail && hasEmail }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.ok) { setErr(d.error || 'Something went wrong. Please try again.'); return }
      onDone({ visit_at: d.visit.at, visit_minutes: d.visit.minutes, visit_note: d.visit.note, visit_address: d.visit.address, visit_status: d.visit.status, visit_seq: d.visit.seq, status: d.status, chase_on: d.chase_on })
      setResult({ kind: d.kind, emailed: !!d.emailed, emailNote: d.emailNote || '', message: d.message || '' })
    } catch { setErr('Could not reach the server. Please check your connection and try again.') }
    finally { setBusy(false) }
  }

  const wa = (msg: string) => { const base = whatsappLink(lead.client_phone); return base ? `${base}?text=${encodeURIComponent(msg)}` : '' }
  const title = mode === 'cancel' ? 'Cancel the site visit' : mode === 'reschedule' ? 'Change the site visit' : 'Book a site visit'
  const first = (lead.client_name || '').trim().split(/\s+/)[0]

  return (
    <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
      <div ref={boxRef} style={{ background: 'var(--cream)', borderRadius: 10, width: 'min(520px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', position: 'relative', ...draggableStyle }}>
        <div className="form-modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>📅 {title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{lead.client_name}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        {result ? (
          <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 12, alignContent: 'start' }}>
            <div style={{ background: '#f0f9ec', border: '1px solid #cfe8c3', borderRadius: 8, padding: '12px 14px', fontSize: 14, lineHeight: 1.6 }}>
              <strong>✓ {result.kind === 'cancelled' ? 'The visit is cancelled.' : result.kind === 'changed' ? 'The visit has been changed.' : 'The visit is booked.'}</strong>
              <div>{result.emailed ? `${first || 'The customer'} has been emailed${result.kind === 'cancelled' ? '.' : ' with a calendar file they can add to their phone.'}` : result.emailNote || (sendEmail ? '' : 'No email was sent.')}</div>
              {result.kind !== 'cancelled' && <div style={{ color: 'var(--muted)', fontSize: 12.5, marginTop: 4 }}>It is on your Calendar, and a chase reminder is set for the day after.</div>}
            </div>
            {wa(result.message) && (
              <div>
                <a className="btn btn-outline" href={wa(result.message)} target="_blank" rel="noreferrer" style={{ fontSize: 13, textDecoration: 'none' }}>💬 Send them a WhatsApp message too</a>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Opens WhatsApp with the same words ready to send. You press send.</div>
              </div>
            )}
            <details style={{ fontSize: 12.5, color: 'var(--muted)' }}><summary style={{ cursor: 'pointer' }}>See the message</summary><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '6px 0 0' }}>{result.message}</pre></details>
          </div>
        ) : (
          <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 12, alignContent: 'start' }}>
            {err && <div role="alert" style={{ background: '#fdecea', border: '1px solid #f5c6c0', color: '#a93226', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>{err}</div>}

            {mode === 'cancel' ? (
              <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                The visit on <strong>{lead.visit_at ? visitWhenLong(lead.visit_at) : ''}</strong> will be cancelled{hasEmail ? ' and the customer can be told by email' : ''}. The lead goes back to Contacted.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div><span style={label}>Date *</span><input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} style={input} /></div>
                  <div><span style={label}>Time *</span><input type="time" value={time} step={300} onChange={e => setTime(e.target.value)} style={input} /></div>
                  <div><span style={label}>How long</span><select value={minutes} onChange={e => setMinutes(Number(e.target.value))} style={input}>{LENGTHS.map(([m, t]) => <option key={m} value={m}>{t}</option>)}</select></div>
                </div>
                <div><span style={label}>Where to go</span><input value={address} onChange={e => setAddress(e.target.value)} style={input} maxLength={300} /></div>
                <div>
                  <span style={label}>A note for the customer (optional)</span>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={VISIT_NOTE_MAX} placeholder="For example: Please have your drawings ready. I will ring when I am 15 minutes away." style={{ ...input, resize: 'vertical' }} />
                </div>
              </>
            )}

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, opacity: hasEmail ? 1 : 0.6 }}>
              <input type="checkbox" checked={sendEmail && hasEmail} disabled={!hasEmail} onChange={e => setSendEmail(e.target.checked)} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
              <span>
                {mode === 'cancel' ? 'Tell them it is cancelled' : 'Email them the details and a calendar file'}{hasEmail ? <> (to <strong>{lead.client_email}</strong>)</> : ''}
                {!hasEmail && <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>This lead has no email address. After saving you can send the same words by WhatsApp{lead.client_phone ? '' : ' (add a phone number first)'}.</span>}
              </span>
            </label>
          </div>
        )}

        <div className="form-modal-ft" style={{ gap: 8 }}>
          {result ? (
            <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="btn-sm btn-outline" onClick={onClose} disabled={busy}>Close</button>
              <button className={mode === 'cancel' ? 'btn btn-danger' : 'btn btn-primary'} style={{ fontSize: 13 }} onClick={go} disabled={busy || (mode !== 'cancel' && (!date || !time))}>
                {busy ? 'Saving…' : mode === 'cancel' ? 'Cancel the visit' : mode === 'reschedule' ? 'Save the change' : 'Book the visit'}
              </button>
            </>
          )}
        </div>
        {!isMaximized && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
      </div>
    </div>
  )
}
