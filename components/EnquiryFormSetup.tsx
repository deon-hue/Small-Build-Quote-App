'use client'

// The "Enquiry form" window on the Leads page: choose the company-name link, switch the form on or off, say what shows above it, and copy what is needed to put it on a website, a social page,
// a message or a printed leaflet: the plain link, a link per place (so each lead says where it came from), a QR code, and embed code for a web designer.
// The pure rules are in lib/enquiry.ts; the server half is app/api/enquiry/settings. The form people fill in is components/EnquiryForm.tsx.

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'
import { slugProblem, enquiryLink, embedCode, cleanSrcTag, SOURCE_LINKS, SLUG_MAX } from '@/lib/enquiry'

interface Cfg { companyName: string; slug: string | null; suggestion: string; enabled: boolean; intro: string; notify: boolean; slugs: string[] }
type Avail = 'free' | 'yours' | 'taken' | 'invalid' | 'unknown'

const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }
const h: React.CSSProperties = { fontWeight: 700, fontSize: 14, marginBottom: 4 }
const sub: React.CSSProperties = { fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 8 }
const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', background: '#fff' }

export default function EnquiryFormSetup({ onClose }: { onClose: () => void }) {
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const [fatal, setFatal] = useState('')
  const [slugInput, setSlugInput] = useState('')
  const [changing, setChanging] = useState(false)
  const [avail, setAvail] = useState<Avail | 'checking' | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [msg, setMsg] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [intro, setIntro] = useState('')
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState('')
  const [customTag, setCustomTag] = useState('')
  const [qr, setQr] = useState('')
  const checkSeq = useRef(0)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const onLive = /buildospro\.ai$/i.test(typeof window !== 'undefined' ? window.location.hostname : '')

  useEffect(() => {
    let alive = true
    fetch('/api/enquiry/settings', { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!alive) return
        if (d.setupNeeded || !r.ok || d.error) { setFatal(d.error || 'Could not load the enquiry form settings.'); return }
        setCfg(d); setSlugInput(d.slug || d.suggestion || ''); setEnabled(d.enabled); setIntro(d.intro); setNotify(d.notify)
      })
      .catch(() => { if (alive) setFatal('Could not load the enquiry form settings. Please check your connection.') })
    return () => { alive = false }
  }, [])

  const slug = cfg?.slug || null
  const choosing = cfg !== null && (!slug || changing)

  // is the name being typed free? (local rules first, then the server)
  useEffect(() => {
    if (!choosing) return
    const s = slugInput.trim().toLowerCase()
    if (!s) { setAvail(null); return }
    if (slugProblem(s)) { setAvail('invalid'); return }
    setAvail('checking')
    const seq = ++checkSeq.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/enquiry/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'check', slug: s }) })
        const d = await r.json().catch(() => ({}))
        if (seq === checkSeq.current) setAvail((d.availability as Avail) || 'unknown')
      } catch { if (seq === checkSeq.current) setAvail('unknown') }
    }, 400)
    return () => clearTimeout(t)
  }, [slugInput, choosing])

  // the QR code for the link a leaflet or van would carry
  useEffect(() => {
    if (!slug || !origin) { setQr(''); return }
    let alive = true
    QRCode.toDataURL(enquiryLink(origin, slug, 'qr'), { width: 520, margin: 2, errorCorrectionLevel: 'M' }).then(u => { if (alive) setQr(u) }).catch(() => { if (alive) setQr('') })
    return () => { alive = false }
  }, [slug, origin])

  async function claim() {
    const s = slugInput.trim().toLowerCase()
    setClaiming(true); setMsg('')
    try {
      const r = await fetch('/api/enquiry/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'claim', slug: s }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.slug) { setCfg(c => c ? { ...c, slug: d.slug, slugs: c.slugs.includes(d.slug) ? c.slugs : [...c.slugs, d.slug] } : c); setChanging(false) }
      else setMsg(d.error || 'Could not save that name. Please try again.')
    } catch { setMsg('Could not save that name. Please check your connection.') }
    finally { setClaiming(false) }
  }

  async function save() {
    setSaving(true); setMsg(''); setSaved(false)
    try {
      const r = await fetch('/api/enquiry/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'save', enabled, intro, notify }) })
      const d = await r.json().catch(() => ({}))
      if (r.ok) { setSaved(true); setCfg(c => c ? { ...c, enabled, intro: intro.trim(), notify } : c) } else setMsg(d.error || 'Could not save. Please try again.')
    } catch { setMsg('Could not save. Please check your connection.') }
    finally { setSaving(false) }
  }

  async function copy(text: string, key: string) {
    try { await navigator.clipboard.writeText(text) }
    catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* nothing more to try */ }
      document.body.removeChild(ta)
    }
    setCopied(key); setTimeout(() => setCopied(c => (c === key ? '' : c)), 1800)
  }

  async function downloadSvg() {
    if (!slug) return
    const svg = await QRCode.toString(enquiryLink(origin, slug, 'qr'), { type: 'svg', margin: 2, errorCorrectionLevel: 'M' })
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const a = document.createElement('a'); a.href = url; a.download = `enquiry-qr-${slug}.svg`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  const dirty = !!cfg && (enabled !== cfg.enabled || intro.trim() !== cfg.intro || notify !== cfg.notify)
  // a function that returns a button (not a component defined here): a component defined inside would be a new one on every render, and its button would be rebuilt each time
  const copyBtn = (text: string, id: string, label = 'Copy') => (
    <button key={id} className="btn-sm btn-outline" style={{ fontSize: 12, whiteSpace: 'nowrap' }} onClick={() => copy(text, id)}>{copied === id ? 'Copied ✓' : label}</button>
  )
  const availText: Record<string, { t: string; c: string }> = {
    checking: { t: 'Checking…', c: 'var(--muted)' }, free: { t: '✓ Available', c: '#2e7d32' }, yours: { t: '✓ This is already one of yours', c: '#2e7d32' },
    taken: { t: 'That name is taken. Please choose another.', c: '#c0392b' }, unknown: { t: 'Could not check that name just now.', c: '#b45309' },
  }
  const prob = slugProblem(slugInput.trim().toLowerCase())

  return (
    <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
      <div ref={boxRef} style={{ background: 'var(--cream)', borderRadius: 10, width: 'min(720px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', position: 'relative', ...draggableStyle }}>
        <div className="form-modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>📣 Enquiry form</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>A page with your company name on it where people can send you an enquiry. It lands in this Leads list.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 14, alignContent: 'start' }}>
          {fatal && <div style={{ ...box, borderColor: '#e0b4b4', background: '#fdf3f3', fontSize: 13, lineHeight: 1.6 }}>{fatal}</div>}
          {!cfg && !fatal && <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</div>}

          {cfg && choosing && (
            <div style={box}>
              <div style={h}>{slug ? 'Change your link name' : 'Choose your link name'}</div>
              <div style={sub}>
                This is the part of the link with your company name in it. {slug ? <>Your old link <strong>{enquiryLink(origin, slug)}</strong> will keep working, so nothing already shared breaks.</> : 'Use your company name, or something short that people will recognise.'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>{(origin || 'https://app.buildospro.ai').replace(/^https?:\/\//, '')}/enquiry/</span>
                <input value={slugInput} onChange={e => { setSlugInput(e.target.value.toLowerCase().replace(/\s+/g, '-')); setMsg('') }} maxLength={SLUG_MAX} style={{ ...input, flex: 1, minWidth: 180 }} aria-label="Link name" />
              </div>
              <div style={{ fontSize: 12, marginTop: 6, minHeight: 18, color: prob && slugInput ? '#c0392b' : availText[avail || '']?.c }}>
                {slugInput && prob ? prob : avail && availText[avail] ? availText[avail].t : ''}
              </div>
              {msg && <div style={{ fontSize: 12, color: '#c0392b', marginTop: 4 }}>{msg}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={claim} disabled={claiming || !!prob || !slugInput.trim() || avail === 'taken' || avail === 'checking'}>{claiming ? 'Saving…' : slug ? 'Use this name' : 'Create my enquiry link'}</button>
                {slug && <button className="btn-sm btn-outline" onClick={() => { setChanging(false); setSlugInput(slug); setMsg('') }}>Cancel</button>}
              </div>
              {slug && cfg.slugs.length > 1 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Names you have used: {cfg.slugs.map(s => <button key={s} className="btn-sm btn-outline" style={{ fontSize: 11, margin: '0 4px 0 0' }} onClick={() => setSlugInput(s)}>{s}</button>)}</div>}
            </div>
          )}

          {cfg && slug && !choosing && (<>
            <div style={box}>
              <div style={h}>Your enquiry link</div>
              <div style={sub}>Send this to anyone, or put it on your website, Facebook, Instagram or TikTok page, in a WhatsApp message or an email signature.</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input readOnly value={enquiryLink(origin, slug)} onFocus={e => e.currentTarget.select()} style={{ ...input, flex: 1, minWidth: 240, fontFamily: 'var(--font-mono, monospace)' }} aria-label="Your enquiry link" />
                {copyBtn(enquiryLink(origin, slug), 'link')}
                <a className="btn-sm btn-outline" href={enquiryLink(origin, slug)} target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: 'none' }}>↗ Open</a>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
                <button className="btn-sm btn-outline" style={{ fontSize: 11 }} onClick={() => { setChanging(true); setMsg('') }}>Change link name</button>
                {!onLive && <span style={{ marginLeft: 10 }}>These links use the address you are on now ({origin.replace(/^https?:\/\//, '')}). Copy them from your live site to share them.</span>}
              </div>
            </div>

            <div style={box}>
              <div style={h}>The form</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
                <input type="checkbox" checked={enabled} onChange={e => { setEnabled(e.target.checked); setSaved(false) }} /> The form is taking enquiries
              </label>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>A sentence above the form (optional)</div>
              <textarea value={intro} onChange={e => { setIntro(e.target.value); setSaved(false) }} maxLength={300} rows={3} placeholder="For example: We cover Bucks and Berks. Tell us about your project and we will come back to you within two working days." style={{ ...input, resize: 'vertical' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 10 }}>
                <input type="checkbox" checked={notify} onChange={e => { setNotify(e.target.checked); setSaved(false) }} /> Email me when an enquiry comes in (to your company email; replying goes straight to them)
              </label>
              {msg && <div style={{ fontSize: 12, color: '#c0392b', marginTop: 6 }}>{msg}</div>}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save'}</button>
                {saved && !dirty && <span style={{ fontSize: 12, color: '#2e7d32' }}>✓ Saved</span>}
              </div>
            </div>

            <div style={box}>
              <div style={h}>A link for each place you share it</div>
              <div style={sub}>Each enquiry shows where it came from in your Leads list (the “Where it came from” label), so you can see which place brings work in. Copy the one for the place you are posting.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SOURCE_LINKS.map(s => (
                  <button key={s.tag} className="btn-sm btn-outline" style={{ fontSize: 12 }} onClick={() => copy(enquiryLink(origin, slug, s.tag), 'src-' + s.tag)} title={enquiryLink(origin, slug, s.tag)}>
                    {copied === 'src-' + s.tag ? 'Copied ✓' : `Copy ${s.label} link`}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                <input value={customTag} onChange={e => setCustomTag(e.target.value)} maxLength={30} placeholder="Your own, for example leaflet-march" style={{ ...input, width: 260 }} aria-label="Your own place name" />
                {copyBtn(enquiryLink(origin, slug, customTag), 'src-custom', 'Copy this link')}
                {cleanSrcTag(customTag) && <span style={{ fontSize: 12, color: 'var(--muted)' }}>?src={cleanSrcTag(customTag)}</span>}
              </div>
            </div>

            <div style={box}>
              <div style={h}>QR code</div>
              <div style={sub}>For a leaflet, van, business card or site board: scanning it opens your form. Enquiries from it show as “QR code”.</div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                {qr ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr} alt="QR code for your enquiry form" width={160} height={160} style={{ border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }} /> : <div style={{ width: 160, height: 160, background: '#eee', borderRadius: 6 }} />}
                <div style={{ display: 'grid', gap: 8 }}>
                  <a className="btn-sm btn-outline" href={qr || undefined} download={`enquiry-qr-${slug}.png`} style={{ fontSize: 12, textDecoration: 'none', opacity: qr ? 1 : 0.5 }}>⬇ Download picture (PNG)</a>
                  <button className="btn-sm btn-outline" style={{ fontSize: 12 }} onClick={downloadSvg}>⬇ Download for printing (SVG)</button>
                </div>
              </div>
            </div>

            <div style={box}>
              <div style={h}>For your web designer</div>
              <div style={sub}>Paste this into the page where the form should appear. It shows the form inside the page and grows to fit it. Or just link a button to your enquiry link above.</div>
              <textarea readOnly value={embedCode(origin, slug)} onFocus={e => e.currentTarget.select()} rows={5} style={{ ...input, fontFamily: 'var(--font-mono, monospace)', fontSize: 12, resize: 'vertical' }} aria-label="Embed code" />
              <div style={{ marginTop: 8 }}>{copyBtn(embedCode(origin, slug), 'embed', 'Copy the code')}</div>
            </div>
          </>)}
        </div>

        <div className="form-modal-ft" style={{ gap: 8 }}>
          <button className="btn-sm btn-outline" onClick={onClose}>Close</button>
        </div>
        {!isMaximized && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
      </div>
    </div>
  )
}
