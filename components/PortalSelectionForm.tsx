'use client'

// "Add an item" / "Edit item" window in the client portal's Selections. Saves the item first, then uploads its photos one at a time (each shrunk in the browser first).
// If a photo fails the item is still saved and the window stays open so the photo can be tried again.

import { useMemo, useRef, useState } from 'react'
import { useDraggableModal } from '@/components/useDraggableModal'
import { shrinkImage } from '@/lib/image-shrink'
import {
  type Selection, type SuppliedBy, SELECTION_CATEGORIES, SUGGESTED_ROOMS, SUPPLIED_BY_LABEL, SELECTION_MAX_FILES, SELECTION_MAX_FILE_BYTES,
} from '@/lib/selections'

interface Picked { key: string; file: File; preview: string | null; error?: string }

export default function PortalSelectionForm({ jobId, item, knownRooms, onClose, onSaved }: {
  jobId: string
  /** set when editing an existing item */
  item?: Selection | null
  knownRooms: string[]
  onClose: () => void
  /** called after a successful save (and uploads); the page reloads its list */
  onSaved: () => void
}) {
  const modal = useDraggableModal()
  const [id, setId] = useState<string | null>(item?.id ?? null)
  const [title, setTitle] = useState(item?.title ?? '')
  const [room, setRoom] = useState(item?.room ?? '')
  const [category, setCategory] = useState(item?.category ?? 'other')
  const [details, setDetails] = useState(item?.details ?? '')
  const [link, setLink] = useState(item?.link ?? '')
  const [suppliedBy, setSuppliedBy] = useState<SuppliedBy>(item?.suppliedBy ?? 'unsure')
  const [neededBy, setNeededBy] = useState(item?.neededBy ?? '')
  const [existing, setExisting] = useState(item?.files ?? [])
  const [picked, setPicked] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  // set once the item itself is saved, so "try the photos again" only retries the photos
  const [saved, setSaved] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)
  const pdfRef = useRef<HTMLInputElement>(null)

  const roomOptions = useMemo(() => [...new Set([...knownRooms, ...SUGGESTED_ROOMS])], [knownRooms])
  const fileCount = existing.length + picked.length
  const full = fileCount >= SELECTION_MAX_FILES

  function addFiles(list: FileList | null) {
    if (!list) return
    setError('')
    const next: Picked[] = []
    for (const f of Array.from(list)) {
      if (fileCount + next.length >= SELECTION_MAX_FILES) { setError(`You can add up to ${SELECTION_MAX_FILES} photos or files to one item.`); break }
      const isImg = /^image\//i.test(f.type), isPdf = f.type === 'application/pdf'
      if (!isImg && !isPdf) { setError(`${f.name} is not a photo or a PDF.`); continue }
      next.push({ key: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, file: f, preview: isImg ? URL.createObjectURL(f) : null })
    }
    if (next.length) setPicked(p => [...p, ...next])
  }

  async function removeExisting(fileId: string) {
    setError('')
    const res = await fetch('/api/portal/selections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove-file', fileId }) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Could not remove that file.'); return }
    setExisting(e => e.filter(f => f.id !== fileId))
  }

  async function save() {
    if (!title.trim()) { setError('Please say what the item is.'); return }
    if (link.trim() && !/^https?:\/\/\S+$/i.test(link.trim())) { setError('The link must start with http:// or https://'); return }
    setBusy(true); setError(''); setProgress('')
    try {
      let itemId = id
      if (!saved) {
        const res = await fetch('/api/portal/selections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          action: 'save', jobId, id: itemId, title: title.trim(), room: room.trim(), category, details: details.trim(), link: link.trim(), suppliedBy, neededBy: neededBy || null,
        }) })
        const d = await res.json().catch(() => ({}))
        if (!res.ok) { setError(d.error || 'Could not save this item. Please try again.'); return }
        itemId = d.id as string
        setId(itemId)
        setSaved(true)
      }
      // photos, one at a time
      const failed: string[] = []
      const remaining: Picked[] = []
      for (let i = 0; i < picked.length; i++) {
        const p = picked[i]
        setProgress(`Adding photo ${i + 1} of ${picked.length}…`)
        const small = await shrinkImage(p.file)
        if (small.size > SELECTION_MAX_FILE_BYTES) { failed.push(`${p.file.name} is too big (over 4 MB)`); remaining.push({ ...p, error: 'too big' }); continue }
        const fd = new FormData()
        fd.append('selectionId', itemId!)
        fd.append('file', small)
        const r = await fetch('/api/portal/selection-files', { method: 'POST', body: fd })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) { failed.push(`${p.file.name}: ${j.error || 'could not be added'}`); remaining.push({ ...p, error: j.error || 'failed' }) }
      }
      setProgress('')
      if (failed.length === 0) { onSaved(); return }
      setPicked(remaining)
      setError(`Your item is saved, but ${failed.length === 1 ? 'one photo' : failed.length + ' photos'} could not be added. ${failed.map(x => x.replace(/[.]+$/, '')).join('. ')}. You can try again, or close this window.`)
    } finally { setBusy(false) }
  }

  const lab: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', margin: '14px 0 5px' }
  const inp: React.CSSProperties = { width: '100%', padding: '10px 11px', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

  return (
    <div className="modal-overlay" onClick={e => modal.onOverlayClick(e, busy ? () => {} : onClose)}>
      <div ref={modal.boxRef} className="portal-modal" style={modal.draggableStyle}>
        <div className="portal-modal-hd" onMouseDown={modal.onHeaderMouseDown}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{item ? 'Edit item' : 'Add an item'}</div>
          <button className="modal-close" onClick={onClose} disabled={busy}>×</button>
        </div>
        <div className="portal-modal-bd">
          <label style={{ ...lab, marginTop: 0 }}>What is it? *</label>
          <input style={inp} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="e.g. Skirting boards, bathroom taps" autoFocus />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lab}>Room</label>
              <input style={inp} value={room} maxLength={60} list="selection-rooms" onChange={e => setRoom(e.target.value)} placeholder="e.g. Kitchen" />
              <datalist id="selection-rooms">{roomOptions.map(r => <option key={r} value={r} />)}</datalist>
            </div>
            <div>
              <label style={lab}>Kind of thing</label>
              <select style={inp} value={category} onChange={e => setCategory(e.target.value)}>
                {SELECTION_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
            </div>
          </div>

          <label style={lab}>Photos, a screenshot or a PDF</label>
          <div style={{ border: '2px dashed #cbd5e1', borderRadius: 9, padding: 14, textAlign: 'center' }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" disabled={busy || full} onClick={() => photoRef.current?.click()}>📷 Take or choose photos</button>
              <button type="button" className="btn btn-outline" disabled={busy || full} onClick={() => pdfRef.current?.click()}>📄 Add a PDF</button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            <input ref={pdfRef} type="file" accept="application/pdf" multiple hidden onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            {(existing.length > 0 || picked.length > 0) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, justifyContent: 'center' }}>
                {existing.map(f => (
                  <div key={f.id} style={{ position: 'relative' }}>
                    {f.mimeType.startsWith('image/') && f.url
                      ? <div style={{ width: 64, height: 64, borderRadius: 7, background: `#f1f5f9 url("${f.url}") center/cover` }} />
                      : <div style={{ width: 64, height: 64, borderRadius: 7, background: '#f4f6ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, padding: 4, overflow: 'hidden' }}>📄 {f.fileName}</div>}
                    <button type="button" disabled={busy} onClick={() => removeExisting(f.id)} aria-label="Remove" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 99, border: 'none', background: '#334155', color: '#fff', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                ))}
                {picked.map(p => (
                  <div key={p.key} style={{ position: 'relative' }} title={p.error || ''}>
                    {p.preview
                      ? <div style={{ width: 64, height: 64, borderRadius: 7, background: `#f1f5f9 url("${p.preview}") center/cover`, outline: p.error ? '2px solid #dc2626' : undefined }} />
                      : <div style={{ width: 64, height: 64, borderRadius: 7, background: '#f4f6ef', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, padding: 4, overflow: 'hidden', outline: p.error ? '2px solid #dc2626' : undefined }}>📄 {p.file.name}</div>}
                    <button type="button" disabled={busy} onClick={() => setPicked(list => list.filter(x => x.key !== p.key))} aria-label="Remove" style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 99, border: 'none', background: '#334155', color: '#fff', fontSize: 12, cursor: 'pointer', lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Up to {SELECTION_MAX_FILES} per item. Photos are made smaller automatically.</div>
          </div>

          <label style={lab}>Link to the product (optional)</label>
          <input style={inp} value={link} maxLength={500} onChange={e => setLink(e.target.value)} placeholder="https://" inputMode="url" />

          <label style={lab}>Product code, size, colour or any notes</label>
          <textarea style={{ ...inp, minHeight: 84, resize: 'vertical' }} value={details} maxLength={2000} onChange={e => setDetails(e.target.value)} placeholder="e.g. SK-150V, 150mm, primed white. To match the picture rails." />

          <label style={lab}>Who is buying it?</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['client', 'builder', 'unsure'] as SuppliedBy[]).map(k => (
              <button key={k} type="button" onClick={() => setSuppliedBy(k)} style={{ flex: 1, font: 'inherit', fontSize: 13, fontWeight: 600, padding: '9px 6px', borderRadius: 7, border: '1.5px solid ' + (suppliedBy === k ? 'var(--lime, #7ab533)' : 'var(--border)'), background: suppliedBy === k ? '#f3f9e8' : '#fff', color: suppliedBy === k ? '#5e8f20' : 'var(--ink)', cursor: 'pointer' }}>
                {SUPPLIED_BY_LABEL[k]}
              </button>
            ))}
          </div>

          <label style={lab}>Needed by (if you know)</label>
          <input style={{ ...inp, maxWidth: 220 }} type="date" value={neededBy} onChange={e => setNeededBy(e.target.value)} />

          {progress && <div style={{ marginTop: 14, fontSize: 13, color: 'var(--muted)' }}>{progress}</div>}
          {error && <div className="portal-alert portal-alert-error" style={{ marginTop: 14 }}>{error}</div>}
        </div>
        <div className="portal-modal-ft">
          <button className="btn btn-outline" onClick={onClose} disabled={busy}>{id && error ? 'Close' : 'Cancel'}</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !title.trim()}>{busy ? 'Saving…' : id && picked.length > 0 ? 'Try the photos again' : 'Save to my selections'}</button>
        </div>
      </div>
    </div>
  )
}
