'use client'

// Send, prepare or log something for a lead or a contact (opened from the "Sent to them" box). Three ways of working, all of which end with a record in the app of exactly what went:
//   email     writes the message, adds the files, and the app emails it (with the files attached) and keeps the record, only after the email has gone;
//   whatsapp  writes the message and opens WhatsApp with the words ready (a WhatsApp link cannot carry files, so the files are offered to share from a phone or to save and attach), and the record is kept when
//             the person says they sent it (the app cannot see inside WhatsApp, so it is never recorded as sent before that);
//   log       records something already sent some other way (from WhatsApp or an inbox): the words, the files and when.
// The files are shrunk and stored as they are added (lib/sent-items-store.ts), so the record has its own copy whatever happens to the original. The rules are lib/sent-items.ts.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'
import LeadFilesBox, { type FileTile } from '@/components/LeadFilesBox'
import QuoteFilePicker from '@/components/QuoteFilePicker'
import { whatsappLink } from '@/lib/leads'
import { SENT_FILES_MAX, BODY_MAX, SUBJECT_MAX, CHANNEL_LABEL, firstNameOf, whatsappMessageText, whatsappLinkWithText, type SentChannel, type SentFile, type SentItem } from '@/lib/sent-items'
import type { SentStore } from '@/lib/sent-items-store'

export type ComposerMode = 'email' | 'whatsapp' | 'log'

export interface SentTarget { leadId: string | null; clientId: string | null; name: string; email: string; phone: string }

const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }
const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }
const pad = (n: number) => String(n).padStart(2, '0')
const nowLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` }

export default function SentComposer({ store, target, companyName, mode, onClose, onSaved, ensureContact }: {
  store: SentStore
  target: SentTarget
  /** for a lead who is not a contact yet: adds them to the contacts (so they can sign in to the portal) and gives back the contact's id, or null when it cannot (no email address) */
  ensureContact?: () => Promise<string | null>
  companyName: string
  mode: ComposerMode
  onClose: () => void
  onSaved: (item: SentItem | null, note?: string) => void
}) {
  const { boxRef, draggableStyle, onHeaderMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()
  const key = useRef(Math.random().toString(36).slice(2, 10))
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<SentFile[]>([])
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [noteBad, setNoteBad] = useState(false)
  const [showInPortal, setShowInPortal] = useState(true)
  const [channel, setChannel] = useState<SentChannel>(mode === 'whatsapp' ? 'whatsapp' : 'email')
  const [when, setWhen] = useState(nowLocal())
  const [pick, setPick] = useState(false)
  const [opened, setOpened] = useState(false)       // WhatsApp has been opened for this message: now it can be recorded
  const done = useRef(false)
  const filesRef = useRef<SentFile[]>([])
  filesRef.current = files
  const first = firstNameOf(target.name)
  const chat = whatsappLink(target.phone)

  // files uploaded for a message that was never sent are taken away again when the window closes
  useEffect(() => () => { if (!done.current && filesRef.current.length) void store.discard(filesRef.current) }, [store])
  useEffect(() => () => { for (const u of Object.values(previews)) { try { URL.revokeObjectURL(u) } catch { /* nothing to free */ } } }, [previews])

  async function addFiles(list: File[]) {
    if (!list.length) return
    setBusy(true); setNote(''); setNoteBad(false)
    const problems: string[] = []
    const added: SentFile[] = []
    const newPrev: Record<string, string> = {}
    for (const f of list) {
      if (filesRef.current.length + added.length >= SENT_FILES_MAX) { problems.push(`Only ${SENT_FILES_MAX} files can go in one message.`); break }
      const r = await store.upload(f, key.current)
      if ('error' in r) problems.push(r.error)
      else { added.push(r.file); if (r.file.isImage) { try { newPrev[r.file.path] = URL.createObjectURL(f) } catch { /* no preview */ } } }
    }
    if (added.length) { setFiles(p => [...p, ...added]); setPreviews(p => ({ ...p, ...newPrev })) }
    if (problems.length) { setNote(problems.join('\n')); setNoteBad(true) }
    setBusy(false)
  }
  async function removeFile(i: number) {
    const f = files[i]
    if (!f) return
    setFiles(p => p.filter((_, x) => x !== i))
    void store.discard([f])
  }
  const tiles: FileTile[] = files.map(f => ({ key: f.path, name: f.name, url: previews[f.path] || '', isImage: f.isImage && !!previews[f.path] }))

  const waText = useMemo(() => whatsappMessageText({ companyName, firstName: first, subject, body, fileCount: files.length }), [companyName, first, subject, body, files.length])
  const waUrl = whatsappLinkWithText(chat, waText)
  const canShareFiles = typeof navigator !== 'undefined' && typeof (navigator as Navigator & { canShare?: unknown }).canShare === 'function' && files.length > 0

  const empty = !subject.trim() && !body.trim() && files.length === 0

  /** something going to their portal needs them to be a contact (that is who the portal belongs to): a lead who is not one yet is added to the contacts first */
  async function contactIdForPortal(): Promise<{ id: string | null; added: boolean }> {
    if (target.clientId || !showInPortal || !ensureContact || !target.email.trim()) return { id: target.clientId, added: false }
    try { const id = await ensureContact(); return { id, added: !!id } } catch { return { id: null, added: false } }
  }

  async function sendEmail() {
    if (empty) { setNote('Write a message or add a file first.'); setNoteBad(true); return }
    setBusy(true); setNote(''); setNoteBad(false)
    try {
      const who = await contactIdForPortal()
      const res = await fetch('/api/sent-items/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leadId: target.leadId, clientId: who.id, subject, body, files, showInPortal }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.ok) { setNote(j.error || 'The email could not be sent. Please try again.'); setNoteBad(true); setBusy(false); return }
      done.current = true
      onSaved(j.item ?? null, j.warning || `Emailed to ${target.name || target.email}.${who.added ? ' They have been added to your contacts, so they can sign in to their portal.' : ''}`)
    } catch { setNote('The email could not be sent. Check your connection and try again.'); setNoteBad(true); setBusy(false) }
  }

  async function keepRecord(ch: SentChannel, kind: 'sent' | 'logged') {
    if (empty) { setNote('Write the message or add a file first.'); setNoteBad(true); return }
    setBusy(true); setNote(''); setNoteBad(false)
    const at = kind === 'logged' && when ? new Date(when) : null
    const who = await contactIdForPortal()
    const r = await store.add({
      leadId: target.leadId, clientId: who.id, channel: ch, kind, subject, body, files,
      toName: target.name, toEmail: target.email, toPhone: target.phone, showInPortal, ...(at && Number.isFinite(at.getTime()) ? { sentAt: at.toISOString() } : {}),
    })
    if ('error' in r) { setNote(r.error); setNoteBad(true); setBusy(false); return }
    done.current = true
    onSaved(r.item, (kind === 'logged' ? 'Added to what was sent.' : 'Recorded as sent by WhatsApp.') + (who.added ? ' They have been added to your contacts, so they can sign in to their portal.' : ''))
  }

  async function shareFiles() {
    setBusy(true); setNote(''); setNoteBad(false)
    try {
      const urls = await store.sign(files)
      const blobs: File[] = []
      for (const f of files) {
        const u = urls[f.path]
        if (!u) continue
        const b = await (await fetch(u)).blob()
        blobs.push(new File([b], f.name, { type: b.type }))
      }
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files: File[]; text?: string }) => Promise<void> }
      if (!blobs.length || !nav.canShare?.({ files: blobs }) || !nav.share) { setNote('This device cannot share the files straight to WhatsApp. Save them with the links below and attach them in WhatsApp.'); setNoteBad(true) }
      else { await nav.share({ files: blobs, text: waText }); setOpened(true) }
    } catch (e) {
      if (!(e instanceof Error) || e.name !== 'AbortError') { setNote('The files could not be shared from here. Save them with the links below and attach them in WhatsApp.'); setNoteBad(true) }
    }
    setBusy(false)
  }

  const title = mode === 'email' ? 'Email them' : mode === 'whatsapp' ? 'Send by WhatsApp' : 'Log something already sent'
  const noEmail = mode === 'email' && !target.email.trim()

  return (
    <>
      <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
        <div ref={boxRef} style={{ background: 'var(--cream)', borderRadius: 10, width: 'min(620px, 96vw)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', position: 'relative', ...draggableStyle }} onClick={e => e.stopPropagation()}>
          <div className="form-modal-hd" onMouseDown={onHeaderMouseDown}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{mode === 'email' ? '✉️' : mode === 'whatsapp' ? '💬' : '📝'} {title}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {target.name || 'This person'}{mode === 'email' ? (target.email ? ` · ${target.email}` : ' · no email address on file') : mode === 'whatsapp' ? (target.phone ? ` · ${target.phone}` : ' · no phone number on file') : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
              <button className="modal-close" onClick={onClose}>×</button>
            </div>
          </div>

          <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 12, alignContent: 'start' }}>
            {mode === 'log' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={label}>How it was sent</label>
                  <select value={channel} onChange={e => setChannel(e.target.value as SentChannel)} style={input}>
                    {(['whatsapp', 'email', 'other'] as SentChannel[]).map(c => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>When</label>
                  <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} style={input} />
                </div>
              </div>
            )}

            <div>
              <label style={label}>{mode === 'email' ? 'Subject' : 'Title (what this is, for your own record)'}</label>
              <input value={subject} maxLength={SUBJECT_MAX} onChange={e => setSubject(e.target.value)} placeholder={mode === 'email' ? 'Design ideas for your extension' : 'Design ideas and photos'} style={input} />
            </div>
            <div>
              <label style={label}>{mode === 'log' ? 'What was said (paste it in)' : 'Message'}</label>
              <textarea value={body} maxLength={BODY_MAX} onChange={e => setBody(e.target.value)} rows={mode === 'log' ? 5 : 6} placeholder={mode === 'log' ? 'Paste the message you sent' : `Hi${first ? ' ' + first : ''}, here are some ideas for the job…`} style={{ ...input, resize: 'vertical' }} />
            </div>

            <div>
              <LeadFilesBox heading="Pictures and files to send" tiles={tiles} onFiles={addFiles} onRemove={removeFile} busy={busy} note={note} noteIsError={noteBad} />
              <button type="button" className="btn-sm btn-outline" style={{ fontSize: 12, marginTop: -10 }} disabled={busy} onClick={() => setPick(true)}>📁 Pick from their files, or a Take-off drawing</button>
            </div>

            {mode === 'whatsapp' && (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 4 }}>What WhatsApp will open with</div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{waText}</div>
                {files.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                    A WhatsApp link cannot carry files. {canShareFiles ? 'On a phone or tablet use Share the files (below). ' : ''}On a computer, open WhatsApp Web and drag the files in, or save them from here.
                  </div>
                )}
                {!chat && <div style={{ fontSize: 12.5, color: '#a93226', marginTop: 8 }}>There is no usable phone number on file, so WhatsApp cannot be opened from here. You can still log the message.</div>}
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={showInPortal} onChange={e => setShowInPortal(e.target.checked)} style={{ width: 'auto' }} />
              Show this in their client portal
            </label>
            {showInPortal && !target.clientId && ensureContact && (
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: -6 }}>
                {target.email.trim() ? 'The portal belongs to a contact, so if they are not one yet they are added to your Contacts (as a lead) so they can sign in with their email address.' : 'They have no email address on file, so they cannot sign in to a portal yet. Add one to their lead first.'}
              </div>
            )}
            {noEmail && <div style={{ fontSize: 12.5, color: '#a93226' }}>There is no email address on file for them. Add one first, or use WhatsApp.</div>}
            {mode === 'email' && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>It is emailed from your company, replies come to you, and a copy of the email comes to your own inbox. The files are attached and kept here. If they are one of your contacts and the box above is ticked, the email also has a button to view it in their portal.</div>}
          </div>

          <div className="form-modal-ft" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            {mode === 'email' && <button className="btn btn-primary" onClick={sendEmail} disabled={busy || noEmail}>{busy ? 'Sending…' : '✉️ Send email'}</button>}
            {mode === 'log' && <button className="btn btn-primary" onClick={() => keepRecord(channel, 'logged')} disabled={busy}>{busy ? 'Saving…' : '📝 Add to the record'}</button>}
            {mode === 'whatsapp' && (
              <>
                {canShareFiles && <button className="btn btn-outline" onClick={shareFiles} disabled={busy}>📤 Share the files…</button>}
                {waUrl && <a className="btn btn-outline" href={waUrl} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} style={{ textDecoration: 'none' }}>💬 Open WhatsApp</a>}
                <button className="btn btn-primary" onClick={() => keepRecord('whatsapp', 'sent')} disabled={busy || !opened} title={opened ? '' : 'Open WhatsApp and send it first'}>{opened ? '✓ I sent it: keep the record' : 'Keep the record after you send it'}</button>
              </>
            )}
          </div>
        </div>
      </div>
      {pick && <QuoteFilePicker open onClose={() => setPick(false)} customer={{ name: target.name, email: target.email, phone: target.phone }} leadId={target.leadId} onPick={async picked => { setPick(false); await addFiles(picked) }} />}
    </>
  )
}
