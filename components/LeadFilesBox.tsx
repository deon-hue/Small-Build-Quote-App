'use client'

// The files on a lead (or on a lead being added): what is there, and the ways to put more in: choose, take a photo (phone), paste (Ctrl+V a picture copied from WhatsApp Web, an email or a screenshot) or drag in.
// It only collects the files and shows the list: the parent uploads and saves them (lib/lead-files-upload.ts), so the same box serves the lead's window and the Add a lead window.

import { useEffect, useRef, useState } from 'react'
import { filesFromTransfer, LEAD_FILE_ACCEPT } from '@/lib/lead-files'

export interface FileTile { key: string; name: string; url: string; isImage: boolean }

const heading: React.CSSProperties = { fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)' }

export default function LeadFilesBox({ tiles, onFiles, onRemove, busy, note, noteIsError }: {
  tiles: FileTile[]
  onFiles: (files: File[]) => void
  onRemove: (index: number) => void
  busy?: boolean
  note?: string
  noteIsError?: boolean
}) {
  const pick = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const latest = useRef(onFiles)
  latest.current = onFiles
  const [over, setOver] = useState(false)
  const [phone, setPhone] = useState(false)

  useEffect(() => { try { setPhone(window.matchMedia('(pointer: coarse)').matches) } catch { /* no camera button */ } }, [])

  // Ctrl+V anywhere while this box is on screen takes a pasted picture; pasted WORDS are left alone (so typing into the notes still pastes as always)
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const files = filesFromTransfer(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      latest.current(files)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  function chosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''   // so choosing the same file again still counts
    if (files.length) onFiles(files)
  }

  return (
    <div
      onDragOver={e => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setOver(true) } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { setOver(false); const files = filesFromTransfer(e.dataTransfer); if (files.length) { e.preventDefault(); onFiles(files) } }}
      style={{ marginBottom: 20, border: `1.5px dashed ${over ? 'var(--moss)' : 'var(--border)'}`, borderRadius: 8, padding: '12px 14px', background: over ? '#f1f8ee' : '#fff' }}
      data-testid="lead-files-box"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: tiles.length ? 10 : 4 }}>
        <span style={heading}>Plans &amp; photos{tiles.length ? ` (${tiles.length})` : ''}</span>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-sm btn-outline" style={{ fontSize: 12 }} disabled={busy} onClick={() => pick.current?.click()}>＋ Add files</button>
        {phone && <button type="button" className="btn-sm btn-outline" style={{ fontSize: 12 }} disabled={busy} onClick={() => cam.current?.click()}>📷 Take a photo</button>}
        <input ref={pick} type="file" multiple accept={LEAD_FILE_ACCEPT} onChange={chosen} style={{ display: 'none' }} aria-label="Choose files to add" />
        <input ref={cam} type="file" accept="image/*" capture="environment" onChange={chosen} style={{ display: 'none' }} aria-label="Take a photo to add" />
      </div>

      {tiles.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {tiles.map((f, i) => (
            <div key={f.key} style={{ position: 'relative', flexShrink: 0 }}>
              {f.isImage && f.url ? (
                <a href={f.url} target="_blank" rel="noopener noreferrer" title={f.name} style={{ display: 'block', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={f.url} alt={f.name} style={{ width: 90, height: 90, objectFit: 'cover', display: 'block' }} />
                </a>
              ) : (
                <a href={f.url || undefined} target="_blank" rel="noopener noreferrer" title={f.name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 90, height: 90, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--warm)', gap: 4, textDecoration: 'none', color: 'var(--ink)' }}>
                  <span style={{ fontSize: 24 }}>📄</span>
                  <span style={{ fontSize: 9, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{f.name}</span>
                </a>
              )}
              <button type="button" onClick={() => onRemove(i)} disabled={busy} title={`Remove ${f.name}`} aria-label={`Remove ${f.name}`}
                style={{ position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--border)', background: '#fff', color: '#a93226', fontSize: 13, lineHeight: '16px', padding: 0, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: tiles.length ? 10 : 2, lineHeight: 1.5 }}>
        {busy ? 'Saving…' : 'Choose files, drag them in here, or press Ctrl+V to paste a picture you have copied (from WhatsApp Web, an email or a screenshot). Pictures, PDFs, Word and Excel files.'}
      </div>
      {note && <div role={noteIsError ? 'alert' : 'status'} style={{ fontSize: 12.5, marginTop: 6, color: noteIsError ? '#a93226' : '#2b5a2b', lineHeight: 1.5, whiteSpace: 'pre-line' }}>{note}</div>}
    </div>
  )
}
