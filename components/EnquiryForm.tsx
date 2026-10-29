'use client'

// The public enquiry form of one company (page: app/enquiry/[slug]). A visitor tells the company who they are and what they want, with photos or plans if they like, and it lands in the company's Leads list.
// Talks only to /api/public/enquiry/<slug> and the existing /api/public/upload-client-file. `embed` is for when a web designer shows it in a frame on the company's own site: no page chrome,
// and it tells the page around it how tall it is (the embed code in the Leads page listens for that).

import { useEffect, useRef, useState } from 'react'
import { ENQUIRY_JOB_TYPES, ENQUIRY_TIMINGS, ENQUIRY_MAX_FILES, looksLikeEmail, looksLikePhone, type EnquiryFile } from '@/lib/enquiry'

interface Company { companyName: string; intro: string; enabled: boolean; logoUrl: string | null }
type Load = { state: 'loading' } | { state: 'ready'; company: Company } | { state: 'unavailable' }

const LIME = '#7ab533', INK = '#1e2022', MUTED = '#64748b', LINE = '#d7dde5'
const MAX_PDF_BYTES = 4 * 1024 * 1024   // a request to the server is limited to about 6MB, and a file is a third bigger once it is sent as text
const MAX_EDGE = 2000

const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', fontSize: 16, border: `1px solid ${LINE}`, borderRadius: 8, background: '#fff', color: INK, fontFamily: 'inherit' }
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: INK, marginBottom: 5 }

/** A photo made small enough to send: longest side 2000px, as a JPEG. Null when the browser cannot read it (a format it does not know). */
async function shrinkImage(file: File): Promise<{ dataBase64: string } | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement | null>(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url })
    if (!img || !img.naturalWidth) return null
    const k = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k))
    const ctx = c.getContext('2d'); if (!ctx) return null
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)   // a transparent PNG would otherwise turn black as a JPEG
    ctx.drawImage(img, 0, 0, c.width, c.height)
    const data = c.toDataURL('image/jpeg', 0.85)
    return { dataBase64: data.slice(data.indexOf(',') + 1) }
  } finally { URL.revokeObjectURL(url) }
}

const readBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => { const s = String(r.result); resolve(s.slice(s.indexOf(',') + 1)) }
  r.onerror = () => reject(r.error)
  r.readAsDataURL(file)
})

export default function EnquiryForm({ slug, src = '', embed = false }: { slug: string; src?: string; embed?: boolean }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [f, setF] = useState({ name: '', email: '', phone: '', address: '', postcode: '', jobType: '', description: '', timing: '', website: '' })
  const [files, setFiles] = useState<EnquiryFile[]>([])
  const [uploading, setUploading] = useState(0)
  const [fileMsg, setFileMsg] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const startedAt = useRef(Date.now())
  const sessionId = useRef('')
  const wrap = useRef<HTMLDivElement>(null)
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    sessionId.current = Math.random().toString(36).slice(2) + Date.now().toString(36)
    startedAt.current = Date.now()
    let alive = true
    fetch(`/api/public/enquiry/${encodeURIComponent(slug)}`, { cache: 'no-store' })
      .then(async r => { const d = await r.json().catch(() => ({})); if (!alive) return; if (r.ok && d.companyName) { setLoad({ state: 'ready', company: d }); document.title = `Enquiry — ${d.companyName}` } else setLoad({ state: 'unavailable' }) })
      .catch(() => { if (alive) setLoad({ state: 'unavailable' }) })
    return () => { alive = false }
  }, [slug])

  // in a frame on someone else's page: tell it how tall this is, whenever that changes
  useEffect(() => {
    if (!embed || typeof ResizeObserver === 'undefined' || !wrap.current) return
    const el = wrap.current
    const tell = () => { try { window.parent?.postMessage({ type: 'buildos-enquiry-height', height: Math.ceil(el.getBoundingClientRect().height) + 8 }, '*') } catch { /* not in a frame */ } }
    const ro = new ResizeObserver(tell); ro.observe(el); tell()
    return () => ro.disconnect()
  }, [embed, load.state, sent])

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setFileMsg('')
    const room = ENQUIRY_MAX_FILES - files.length
    if (room <= 0) { setFileMsg(`You can add up to ${ENQUIRY_MAX_FILES} files.`); return }
    const picked = Array.from(list).slice(0, room)
    if (list.length > room) setFileMsg(`Only ${ENQUIRY_MAX_FILES} files can be added: the first ${room} were used.`)
    for (const file of picked) {
      setUploading(n => n + 1)
      try {
        const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
        let body: { name: string; mimeType: string; dataBase64: string; isImage: boolean }
        if (isPdf) {
          if (file.size > MAX_PDF_BYTES) { setFileMsg(`${file.name} is over 4 MB. Please send a smaller PDF, or send it to us by email afterwards.`); continue }
          body = { name: file.name, mimeType: 'application/pdf', dataBase64: await readBase64(file), isImage: false }
        } else if (file.type.startsWith('image/')) {
          const s = await shrinkImage(file)
          if (!s) { setFileMsg(`${file.name} could not be read. Please use a JPEG or PNG photo.`); continue }
          body = { name: file.name.replace(/\.[^.]*$/, '') + '.jpg', mimeType: 'image/jpeg', dataBase64: s.dataBase64, isImage: true }
        } else { setFileMsg(`${file.name}: only photos and PDF files can be added.`); continue }
        const res = await fetch('/api/public/upload-client-file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: sessionId.current, ...body }) })
        const d = await res.json().catch(() => ({}))
        if (res.ok && d.url) setFiles(p => [...p, { url: d.url, name: d.name || body.name, isImage: body.isImage }])
        else setFileMsg(d.error || `${file.name} could not be added. Please try again.`)
      } catch { setFileMsg(`${file.name} could not be added. Please try again.`) }
      finally { setUploading(n => n - 1) }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (sending || uploading > 0) return
    setError('')
    const name = f.name.trim(), email = f.email.trim(), phone = f.phone.trim(), desc = f.description.trim()
    if (!name) return setError('Please tell us your name.')
    if (!email && !phone) return setError('Please give an email address or a phone number so we can reply.')
    if (email && !looksLikeEmail(email)) return setError('That email address does not look right.')
    if (phone && !looksLikePhone(phone)) return setError('That phone number does not look right.')
    if (desc.length < 5) return setError('Please tell us a little about what you would like done.')
    setSending(true)
    try {
      const res = await fetch(`/api/public/enquiry/${encodeURIComponent(slug)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, files, src, startedAt: startedAt.current }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setSent(name.split(/\s+/)[0])
      else setError(d.error || 'Sorry, we could not send that just now. Please try again.')
    } catch { setError('Sorry, we could not send that. Please check your connection and try again.') }
    finally { setSending(false) }
  }

  const page: React.CSSProperties = embed ? { padding: 0, background: 'transparent' } : { minHeight: '100vh', background: '#f1f5f9', padding: '28px 14px 40px' }
  const card: React.CSSProperties = { maxWidth: 640, margin: '0 auto', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '26px 24px', boxShadow: embed ? 'none' : '0 2px 14px rgba(0,0,0,0.06)', fontFamily: "'DM Sans', Helvetica, Arial, sans-serif", color: INK }

  if (load.state === 'loading') return <div style={page}><div ref={wrap} style={{ ...card, color: MUTED }}>Loading…</div></div>
  if (load.state === 'unavailable') return <div style={page}><div ref={wrap} style={card}><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>This enquiry form is not available</h1><p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>The link may have been typed wrongly. Please check it, or contact the company directly.</p></div></div>
  const c = load.company

  if (!c.enabled) return <div style={page}><div ref={wrap} style={card}><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>{c.companyName}</h1><p style={{ margin: 0, color: MUTED, lineHeight: 1.6 }}>This company is not taking enquiries through this form at the moment. Please contact them directly.</p></div></div>

  if (sent !== null) {
    return (
      <div style={page}><div ref={wrap} style={{ ...card, textAlign: 'center', padding: '40px 24px' }}>
        <div style={{ width: 54, height: 54, borderRadius: 27, background: LIME, color: '#fff', fontSize: 30, lineHeight: '54px', margin: '0 auto 16px' }}>✓</div>
        <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Thank you{sent ? `, ${sent}` : ''}</h1>
        <p style={{ margin: '0 0 6px', color: MUTED, lineHeight: 1.6 }}>{c.companyName} has your enquiry and will be in touch.</p>
        <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Powered by BuildOS Pro</p>
      </div></div>
    )
  }

  return (
    <div style={page}>
      <div ref={wrap} style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          {c.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.logoUrl} alt="" style={{ maxHeight: 48, maxWidth: 140, width: 'auto', height: 'auto' }} />}
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: MUTED }}>{c.companyName}</div>
            <h1 style={{ fontSize: 22, margin: '2px 0 0' }}>Send us an enquiry</h1>
          </div>
        </div>
        {c.intro && <p style={{ margin: '10px 0 0', color: MUTED, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{c.intro}</p>}

        <form onSubmit={submit} noValidate style={{ marginTop: 20, display: 'grid', gap: 14 }}>
          <div><label style={label} htmlFor="enq-name">Your name *</label><input id="enq-name" style={input} value={f.name} onChange={e => set('name', e.target.value)} autoComplete="name" maxLength={200} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div><label style={label} htmlFor="enq-email">Email</label><input id="enq-email" type="email" inputMode="email" style={input} value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" maxLength={320} /></div>
            <div><label style={label} htmlFor="enq-phone">Phone</label><input id="enq-phone" type="tel" inputMode="tel" style={input} value={f.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" maxLength={40} /></div>
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: -8 }}>Email or phone: at least one, so we can reply.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(110px, 1fr)', gap: 14 }}>
            <div><label style={label} htmlFor="enq-address">Address of the job</label><input id="enq-address" style={input} value={f.address} onChange={e => set('address', e.target.value)} autoComplete="street-address" maxLength={300} /></div>
            <div><label style={label} htmlFor="enq-post">Postcode</label><input id="enq-post" style={{ ...input, textTransform: 'uppercase' }} value={f.postcode} onChange={e => set('postcode', e.target.value)} autoComplete="postal-code" maxLength={12} /></div>
          </div>
          <div><label style={label} htmlFor="enq-type">What kind of job is it?</label>
            <select id="enq-type" style={input} value={f.jobType} onChange={e => set('jobType', e.target.value)}><option value="">Choose…</option>{ENQUIRY_JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label style={label} htmlFor="enq-desc">Tell us about it *</label><textarea id="enq-desc" style={{ ...input, minHeight: 120, resize: 'vertical' }} value={f.description} onChange={e => set('description', e.target.value)} maxLength={5000} placeholder="What would you like done? Anything that helps: rooms, sizes, what you have in mind." /></div>
          <div><label style={label} htmlFor="enq-timing">When are you hoping to start?</label>
            <select id="enq-timing" style={input} value={f.timing} onChange={e => set('timing', e.target.value)}><option value="">Choose…</option>{ENQUIRY_TIMINGS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>

          <div>
            <label style={label} htmlFor="enq-files">Photos or plans (optional)</label>
            <input id="enq-files" type="file" multiple accept="image/*,application/pdf" onChange={e => { addFiles(e.target.files); e.target.value = '' }} disabled={files.length >= ENQUIRY_MAX_FILES} style={{ fontSize: 14 }} />
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>Up to {ENQUIRY_MAX_FILES} photos or PDFs (a PDF up to 4 MB).</div>
            {uploading > 0 && <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>Adding…</div>}
            {fileMsg && <div role="status" style={{ fontSize: 13, color: '#b45309', marginTop: 6 }}>{fileMsg}</div>}
            {files.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0', display: 'grid', gap: 6 }}>
                {files.map((fl, i) => (
                  <li key={fl.url} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, border: `1px solid ${LINE}`, borderRadius: 6, padding: '6px 10px' }}>
                    <span aria-hidden>{fl.isImage ? '🖼' : '📄'}</span><span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fl.name}</span>
                    <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} aria-label={`Remove ${fl.name}`} style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 16 }}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* the trap for scripts: people never see or fill this */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
            <label>Leave this empty<input tabIndex={-1} autoComplete="off" name="hp-field" value={f.website} onChange={e => set('website', e.target.value)} /></label>
          </div>

          {error && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '10px 12px', fontSize: 14 }}>{error}</div>}

          <button type="submit" disabled={sending || uploading > 0} style={{ background: LIME, color: '#fff', border: 'none', borderRadius: 8, padding: '14px 18px', fontSize: 16, fontWeight: 700, cursor: sending || uploading > 0 ? 'default' : 'pointer', opacity: sending || uploading > 0 ? 0.65 : 1 }}>
            {sending ? 'Sending…' : uploading > 0 ? 'Adding your files…' : 'Send enquiry'}
          </button>
          <p style={{ margin: 0, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
            By sending this you agree that {c.companyName} may use these details to reply to you about your enquiry. See the <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: MUTED }}>privacy policy</a>. Powered by BuildOS Pro.
          </p>
        </form>
      </div>
    </div>
  )
}
