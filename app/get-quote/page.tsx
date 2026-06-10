'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

const JOB_TYPES = [
  'Rear Extension', 'Side Extension', 'Kitchen Extension', 'Loft Conversion',
  'Full Refurbishment', 'Kitchen Fit-Out', 'Bathroom Fit-Out',
  'Garden Room', 'Landscaping', 'New Build', 'Other',
]

// ── Brand tokens ──────────────────────────────────────────────────────────────
const LIME     = '#cddc29'
const CHARCOAL = '#51545b'
const RED      = '#ef233c'
const GREY_BG  = '#f4f5f2'
const GREY_BD  = '#dde0da'
const GREY_TXT = '#838383'

interface Message { role: 'user' | 'assistant'; content: string; hasFiles?: boolean; generatedImage?: string; vizLoading?: boolean }
interface Phase {
  parentPhase: string; phase: string
  labour: number; materials: number; plant: number; subcontractors: number; other: number
}
interface AttachmentPayload {
  name: string; mimeType: string; dataBase64: string; isImage: boolean; previewUrl?: string
}

function fmt(n: number) { return '£' + Math.round(n).toLocaleString('en-GB') }
function phaseTotal(ph: Phase) {
  return (ph.labour || 0) + (ph.materials || 0) + (ph.plant || 0) + (ph.subcontractors || 0) + (ph.other || 0)
}

const STEPS = ['Your Project', 'Scope Chat', 'Your Estimate', 'Submit']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SR = any

export default function GetQuotePage() {
  const [step, setStep] = useState(0)

  const [jobType, setJobType]         = useState('')
  const [address, setAddress]         = useState('')
  const [description, setDescription] = useState('')

  const [messages, setMessages]       = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [scope, setScope]             = useState('')
  const [scopeReady, setScopeReady]   = useState(false)
  const chatEndRef                    = useRef<HTMLDivElement>(null)

  const [attachments, setAttachments]       = useState<AttachmentPayload[]>([])
  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const cameraInputRef                      = useRef<HTMLInputElement>(null)
  const sessionIdRef                        = useRef<string>(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`)
  const [storedFileRefs, setStoredFileRefs] = useState<{name: string; url: string; isImage: boolean}[]>([])

  const [listening, setListening]   = useState(false)
  const [micTarget, setMicTarget]   = useState<'description' | 'chat'>('chat')
  const recognitionRef              = useRef<SR>(null)
  const finalTranscriptRef          = useRef('')  // accumulates confirmed final text across restarts
  const keepListeningRef            = useRef(false) // true while mic should stay on; set false to stop
  const hasTriggeredVizRef           = useRef(false) // only generate one visualization per interview session
  const [hasMic, setHasMic]        = useState(false)

  const [phases, setPhases]         = useState<Phase[]>([])
  const [total, setTotal]           = useState(0)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError]     = useState('')

  const [firstName, setFirstName]   = useState('')
  const [lastName, setLastName]     = useState('')
  const [email, setEmail]           = useState('')
  const [phone, setPhone]           = useState('')
  const [message, setMessage]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, chatLoading])
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setHasMic(!!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition))
  }, [])

  const startListening = useCallback((target: 'description' | 'chat') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SRClass) return
    setMicTarget(target)
    finalTranscriptRef.current = ''
    keepListeningRef.current = true

    function spawnRec() {
      if (!keepListeningRef.current) { setListening(false); return }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rec = new SRClass()
      rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true
      recognitionRef.current = rec
      rec.onstart = () => setListening(true)
      // Spawn a brand-new object on each restart — never reuse the same instance.
      // Reusing causes mobile browsers (Chrome/Android) to replay previously-finalized
      // results through onresult, doubling the accumulated text.
      rec.onend = () => { if (keepListeningRef.current) spawnRec(); else setListening(false) }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onerror = (e: any) => {
        if (e.error === 'aborted' || e.error === 'no-speech') return
        keepListeningRef.current = false; setListening(false); recognitionRef.current = null
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rec.onresult = (e: any) => {
        let newFinal = ''
        let interim  = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript
          if (e.results[i].isFinal) newFinal += text
          else interim += text
        }
        if (newFinal) {
          const sep = finalTranscriptRef.current && !finalTranscriptRef.current.endsWith(' ') ? ' ' : ''
          finalTranscriptRef.current += sep + newFinal
        }
        const display = (finalTranscriptRef.current + (interim ? ' ' + interim : '')).trimStart()
        if (target === 'description') setDescription(display); else setInput(display)
      }
      try { rec.start() } catch { setListening(false) }
    }

    spawnRec()
  }, [])

  function stopListening() {
    keepListeningRef.current = false  // signal onend not to restart
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

  async function resizeToJpeg(file: File): Promise<string | null> {
    const MAX_PX = 1536
    return new Promise(resolve => {
      const img = new Image()
      const objUrl = URL.createObjectURL(file)
      img.onload = () => {
        const maxDim = Math.max(img.width, img.height)
        const scale = maxDim > MAX_PX ? MAX_PX / maxDim : 1
        const w = Math.round(img.width * scale); const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(objUrl); resolve(null); return }
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(objUrl)
        resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
      }
      img.onerror = () => { URL.revokeObjectURL(objUrl); resolve(null) }
      img.src = objUrl
    })
  }

  async function handleFileSelect(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      if (isImage) {
        if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
          alert(`${file.name}: unsupported format. Please use JPEG, PNG, WebP or GIF.`)
          continue
        }
        const base64 = await resizeToJpeg(file)
        if (!base64) { alert(`${file.name}: could not process. Try saving as JPEG or PNG first.`); continue }
        const previewUrl = URL.createObjectURL(file)
        setAttachments(prev => [...prev, { name: file.name, mimeType: 'image/jpeg', dataBase64: base64, isImage: true, previewUrl }])
      } else if (file.type === 'application/pdf') {
        if (file.size > 4 * 1024 * 1024) { alert(`${file.name} is too large (max 4 MB for PDFs).`); continue }
        const base64 = await new Promise<string>(resolve => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.readAsDataURL(file)
        })
        setAttachments(prev => [...prev, { name: file.name, mimeType: 'application/pdf', dataBase64: base64, isImage: false }])
      } else {
        alert(`${file.name}: only JPEG, PNG, WebP, GIF images and PDFs are supported.`)
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAttachment(i: number) {
    setAttachments(prev => {
      if (prev[i]?.previewUrl) URL.revokeObjectURL(prev[i].previewUrl!)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  async function startInterview() {
    if (!firstName.trim() || !jobType || !address.trim()) return
    hasTriggeredVizRef.current = false
    setStep(1)
    const greeting = description.trim()
      ? `Hi, I'm ${firstName.trim()}. I'm looking to get a quote for a ${jobType} at ${address}. ${description}`
      : `Hi, I'm ${firstName.trim()}. I'm looking to get a quote for a ${jobType} at ${address}.`
    await sendMessage(greeting, [])
  }

  async function sendMessage(text: string, history: Message[], files?: AttachmentPayload[]) {
    const pendingFiles = files ?? attachments
    const displayContent = text || (pendingFiles.length ? `[${pendingFiles.length} file${pendingFiles.length > 1 ? 's' : ''} attached]` : '')
    const newHistory: Message[] = [...history, { role: 'user', content: displayContent, hasFiles: pendingFiles.length > 0 }]
    setMessages(newHistory); setInput(''); setAttachments([]); setChatLoading(true)

    const imageRefs: { url: string; name: string }[] = []
    const pdfBase64s: { dataBase64: string; name: string; mimeType: string }[] = []

    if (pendingFiles.length > 0) {
      await Promise.all(pendingFiles.map(async att => {
        if (att.isImage) {
          try {
            const res = await fetch('/api/public/upload-client-file', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: sessionIdRef.current, name: att.name, mimeType: att.mimeType, dataBase64: att.dataBase64, isImage: true }),
            })
            const d = await res.json()
            if (d.url) { imageRefs.push({ url: d.url, name: att.name }); setStoredFileRefs(prev => [...prev, { name: att.name, url: d.url, isImage: true }]) }
          } catch { /* silent */ }
        } else {
          pdfBase64s.push({ dataBase64: att.dataBase64, name: att.name, mimeType: att.mimeType })
          setStoredFileRefs(prev => [...prev, { name: att.name, url: '', isImage: false }])
        }
      }))
    }

    const apiHistory = newHistory.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    const lastMsg = { role: 'user' as const, content: text || 'Please analyse these files and extract all relevant details.' }
    const apiMessages = [...apiHistory, lastMsg]

    try {
      const res = await fetch('/api/public/scope-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages, context: { jobType, address, clientName: firstName.trim() }, rawInput: text,
          imageRefs: imageRefs.length > 0 ? imageRefs : undefined,
          pdfBase64s: pdfBase64s.length > 0 ? pdfBase64s : undefined,
        }),
      })
      const data = await res.json()
      const reply: string = data.reply || 'Sorry, something went wrong. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      if (reply.includes('[READY_TO_BUILD]')) {
        const scopeMatch = reply.match(/\[SCOPE\]([\s\S]*?)\[\/SCOPE\]/)
        if (scopeMatch) { setScope(scopeMatch[1].trim()); setScopeReady(true) }
      }
      const vizMatch = reply.match(/\[VISUALIZE:\s*([^\]]+)\]/)
      if (vizMatch) generateVisualization(vizMatch[1].trim())
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally { setChatLoading(false) }
  }

  function handleSend() {
    if ((!input.trim() && attachments.length === 0) || chatLoading) return
    sendMessage(input.trim(), messages)
  }

  async function generateEstimate() {
    setStep(2); setGenLoading(true); setGenError('')
    try {
      const res = await fetch('/api/public/generate-quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, jobType, address }),
      })
      const data = await res.json()
      if (data.error) { setGenError(data.error); return }
      setPhases(data.phases || []); setTotal(data.total || 0)
    } catch { setGenError('Failed to generate estimate. Please try again.') }
    finally { setGenLoading(false) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !email.trim()) return
    setSubmitting(true); setSubmitError('')
    try {
      const res = await fetch('/api/public/submit-quote-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          clientEmail: email.trim(), clientPhone: phone.trim(),
          projectType: jobType, projectAddress: address,
          scopeText: scope, aiPhases: phases, estimatedTotal: total, message: message.trim(),
          clientFiles: storedFileRefs,
        }),
      })
      const data = await res.json()
      if (data.error) { setSubmitError(data.error); return }
      setSubmitted(true)
    } catch { setSubmitError('Failed to submit. Please try again.') }
    finally { setSubmitting(false) }
  }

  const groupedPhases: Record<string, Phase[]> = {}
  for (const ph of phases) {
    const key = ph.parentPhase || 'Other'
    if (!groupedPhases[key]) groupedPhases[key] = []
    groupedPhases[key].push(ph)
  }

  async function generateVisualization(description: string) {
    if (hasTriggeredVizRef.current) return
    hasTriggeredVizRef.current = true
    setMessages(prev => [...prev, { role: 'assistant' as const, content: '', vizLoading: true }])
    try {
      const res = await fetch('/api/public/generate-visualization', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      })
      const data = await res.json()
      setMessages(prev => {
        const without = prev.filter(m => !m.vizLoading)
        if (data.imageUrl) {
          return [...without, {
            role: 'assistant' as const,
            content: "Here's a rough AI concept of what that could look like — just an impression to help visualise the idea, not an architect's drawing!",
            generatedImage: data.imageUrl,
          }]
        }
        return without
      })
    } catch {
      setMessages(prev => prev.filter(m => !m.vizLoading))
    }
  }

  function cleanReply(text: string) {
    return text
      .replace(/\[SCOPE\][\s\S]*?\[\/SCOPE\]/g, '')
      .replace(/\[READY_TO_BUILD\]/g, '')
      .replace(/\[VISUALIZE:[^\]]*\]/g, '')
      .trim()
  }

  const MIC_BTN = (target: 'description' | 'chat', size = 38) => hasMic ? (
    <button
      type="button"
      onClick={() => listening && micTarget === target ? stopListening() : startListening(target)}
      title={listening && micTarget === target ? 'Stop recording' : 'Speak your answer'}
      style={{
        width: size, height: size, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0,
        background: listening && micTarget === target ? RED : '#eaebe8',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .2s',
        boxShadow: listening && micTarget === target ? `0 0 0 4px ${RED}33` : 'none',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={listening && micTarget === target ? '#fff' : CHARCOAL} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="2" width="6" height="11" rx="3"/>
        <path d="M5 10a7 7 0 0 0 14 0"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
        <line x1="8" y1="22" x2="16" y2="22"/>
      </svg>
    </button>
  ) : null

  // ── INPUT field style ────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 6,
    border: `1.5px solid ${GREY_BD}`, fontSize: 14, boxSizing: 'border-box',
    fontFamily: "'Montserrat', sans-serif", color: CHARCOAL, outline: 'none',
    transition: 'border-color .2s',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontWeight: 600, fontSize: 12, letterSpacing: '0.3px',
    textTransform: 'uppercase', color: CHARCOAL, marginBottom: 7,
  }
  const primaryBtn: React.CSSProperties = {
    width: '100%', padding: '14px', borderRadius: 6, border: 'none',
    background: LIME, color: '#000', fontSize: 14, fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.2px', transition: 'transform .15s, opacity .15s',
    fontFamily: "'Montserrat', sans-serif",
  }

  return (
    <div style={{ minHeight: '100vh', background: GREY_BG, fontFamily: "'Montserrat', sans-serif", color: CHARCOAL }}>

      {/* Announcement bar */}
      <div style={{ background: CHARCOAL, color: '#fff', fontSize: 12, fontWeight: 500 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '8px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ opacity: 0.85 }}>Free consultation · No obligation · Windsor, Maidenhead &amp; Berkshire area</span>
          <a href="https://www.smallbuildcompany.com" target="_blank" rel="noreferrer"
            style={{ color: LIME, textDecoration: 'none', fontWeight: 600, fontSize: 11 }}>
            smallbuildcompany.com
          </a>
        </div>
      </div>

      {/* Header / Logo */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${GREY_BD}` }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 66 }}>
          <a href="https://www.smallbuildcompany.com" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.5px', color: '#000', lineHeight: 1 }}>
              THE SMALL BUILD <span style={{ color: RED }}>CO</span>
            </div>
          </a>
          <div style={{ background: LIME, color: '#000', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 4, letterSpacing: '0.3px', textTransform: 'uppercase' }}>
            AI Estimate
          </div>
        </div>
      </div>

      {/* Step indicator */}
      {!submitted && (
        <div style={{ background: '#fff', borderBottom: `1px solid ${GREY_BD}` }}>
          <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px', display: 'flex' }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{
                flex: 1, textAlign: 'center', padding: '13px 4px', fontSize: 11,
                fontWeight: i === step ? 700 : 500,
                color: i === step ? '#000' : i < step ? CHARCOAL : '#aaa',
                borderBottom: i === step ? `3px solid ${LIME}` : '3px solid transparent',
                letterSpacing: '0.2px', textTransform: 'uppercase',
                transition: 'all .2s',
              }}>
                {i < step ? '✓ ' : ''}{s}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '36px 24px 60px' }}>

        {/* ── STEP 0: Project Details ────────────────────────────────────────── */}
        {step === 0 && (
          <>
            {/* Hero banner */}
            <div style={{
              background: CHARCOAL, color: '#fff', borderRadius: 10, padding: '36px 40px 32px',
              marginBottom: 24, position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', top: -30, right: -30, width: 180, height: 180, borderRadius: '50%', background: LIME, opacity: 0.08 }} />
              <div style={{ position: 'absolute', bottom: -40, right: 40, width: 120, height: 120, borderRadius: '50%', background: LIME, opacity: 0.06 }} />
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: LIME, marginBottom: 12 }}>
                Free · Instant · No Obligation
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, marginBottom: 12, maxWidth: 480 }}>
                Get your building estimate in minutes
              </div>
              <div style={{ fontSize: 14, opacity: 0.75, lineHeight: 1.6, maxWidth: 460 }}>
                Our AI estimator will guide you through your project scope and generate an indicative cost breakdown — ready to review with our team.
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 24, flexWrap: 'wrap' }}>
                {['100+ projects completed', 'Fully insured', 'Based in Windsor'].map(t => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: LIME, flexShrink: 0, display: 'block' }} />
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Form card */}
            <div style={{ background: '#fff', borderRadius: 10, padding: '36px 40px', boxShadow: '0 2px 16px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, color: '#000' }}>Tell us about your project</div>
              <div style={{ fontSize: 13, color: GREY_TXT, marginBottom: 30, lineHeight: 1.5 }}>
                Fill in a few details and we'll start a short conversation to scope out your works.
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Your first name *</label>
                <input value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="e.g. Sarah"
                  style={inputStyle} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Project type *</label>
                <select value={jobType} onChange={e => setJobType(e.target.value)} style={{ ...inputStyle, appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2351545b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center', paddingRight: 36 }}>
                  <option value="">Select project type…</option>
                  {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Property address *</label>
                <input value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. 14 Oak Avenue, Windsor, SL4 1AA"
                  style={inputStyle} />
              </div>

              <div style={{ marginBottom: 32 }}>
                <label style={labelStyle}>
                  Brief description
                  <span style={{ textTransform: 'none', fontWeight: 400, color: GREY_TXT, marginLeft: 6 }}>— optional, or use the mic</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Single-storey rear extension, roughly 4m × 5m, bifold doors, open-plan kitchen…"
                    rows={4}
                    style={{ ...inputStyle, paddingRight: 50, resize: 'vertical', lineHeight: 1.55 }} />
                  <div style={{ position: 'absolute', bottom: 10, right: 10 }}>
                    {MIC_BTN('description', 34)}
                  </div>
                </div>
                {listening && micTarget === 'description' && (
                  <div style={{ fontSize: 11, color: RED, marginTop: 5, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: RED, display: 'inline-block', animation: 'pulse 1s infinite' }} />
                    Listening…
                  </div>
                )}
              </div>

              <button onClick={startInterview} disabled={!firstName.trim() || !jobType || !address.trim()}
                style={{ ...primaryBtn, opacity: firstName.trim() && jobType && address.trim() ? 1 : 0.45, cursor: firstName.trim() && jobType && address.trim() ? 'pointer' : 'default' }}
                onMouseEnter={e => { if (firstName.trim() && jobType && address.trim()) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
              >
                Start Scope Interview →
              </button>
              <div style={{ fontSize: 11, color: '#aaa', textAlign: 'center', marginTop: 12 }}>
                Takes 2–5 minutes · Indicative estimate only · No obligation
              </div>
            </div>
          </>
        )}

        {/* ── STEP 1: Scope Chat ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>

            {/* Chat header */}
            <div style={{ padding: '18px 24px 16px', borderBottom: `1px solid ${GREY_BD}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#000' }}>Scope Interview</div>
                <div style={{ fontSize: 12, color: GREY_TXT, marginTop: 2 }}>{jobType} · {address}</div>
              </div>
              <div style={{ background: `${LIME}22`, border: `1px solid ${LIME}99`, borderRadius: 5, padding: '4px 10px', fontSize: 10, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                AI Interview
              </div>
            </div>

            {/* Messages */}
            <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 300, maxHeight: 460 }}>
              {messages.map((m, i) => {
                if (m.vizLoading) return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: LIME, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000', marginBottom: 2 }}>SB</div>
                    <div style={{ background: GREY_BG, padding: '11px 16px', borderRadius: 12, borderBottomLeftRadius: 3, display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 16, height: 16, borderRadius: '50%', border: `3px solid ${GREY_BD}`, borderTopColor: LIME, animation: 'spin 0.9s linear infinite', flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: GREY_TXT }}>Generating concept image…</span>
                    </div>
                  </div>
                )
                const displayText = m.role === 'assistant' ? cleanReply(m.content) : m.content
                if (!displayText && !m.generatedImage) return null
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                    {m.role === 'assistant' && (
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: LIME, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000', marginBottom: 2 }}>
                        SB
                      </div>
                    )}
                    <div style={{
                      maxWidth: '78%', padding: '11px 15px', borderRadius: 12,
                      background: m.role === 'user' ? CHARCOAL : GREY_BG,
                      color: m.role === 'user' ? '#fff' : '#1e2022',
                      fontSize: 13.5, lineHeight: 1.58,
                      borderBottomRightRadius: m.role === 'user' ? 3 : 12,
                      borderBottomLeftRadius: m.role === 'assistant' ? 3 : 12,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {m.hasFiles && m.role === 'user' && (
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span>📎</span> Files attached
                        </div>
                      )}
                      {displayText}
                      {m.generatedImage && (
                        <div style={{ marginTop: displayText ? 12 : 0 }}>
                          <img src={m.generatedImage} alt="AI concept visualization"
                            style={{ width: '100%', maxWidth: 440, borderRadius: 8, display: 'block' }} />
                          <div style={{ fontSize: 10, color: GREY_TXT, marginTop: 5, fontStyle: 'italic' }}>
                            AI concept impression — for discussion only, not an architect&#39;s drawing
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: LIME, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000' }}>SB</div>
                  <div style={{ background: GREY_BG, padding: '10px 16px', borderRadius: 12, borderBottomLeftRadius: 3, fontSize: 18, letterSpacing: 4, color: CHARCOAL, opacity: 0.6 }}>•••</div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Scope ready banner */}
            {scopeReady && (
              <div style={{ margin: '0 24px 20px', borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${LIME}` }}>
                <div style={{ background: LIME, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>✓</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#000' }}>Scope of works ready</span>
                </div>
                <div style={{ padding: '12px 16px', background: '#fff' }}>
                  <div style={{ fontSize: 12, color: GREY_TXT, marginBottom: 12, lineHeight: 1.6 }}>
                    {scope.slice(0, 200)}{scope.length > 200 ? '…' : ''}
                  </div>
                  <button onClick={generateEstimate}
                    style={{ padding: '10px 22px', background: '#000', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: "'Montserrat', sans-serif", transition: 'transform .15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                  >
                    Generate My Estimate →
                  </button>
                </div>
              </div>
            )}

            {/* Input area */}
            {!scopeReady && (
              <div style={{ padding: '12px 24px 18px', borderTop: `1px solid ${GREY_BD}` }}>

                {/* Attachment previews */}
                {attachments.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {attachments.map((att, i) => (
                      <div key={i} style={{ position: 'relative', borderRadius: 6, overflow: 'hidden', border: `1px solid ${GREY_BD}`, background: GREY_BG }}>
                        {att.isImage && att.previewUrl ? (
                          <img src={att.previewUrl} alt={att.name} style={{ width: 60, height: 60, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ width: 60, height: 60, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 4 }}>
                            <span style={{ fontSize: 18 }}>📄</span>
                            <span style={{ fontSize: 8, color: GREY_TXT, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 52, whiteSpace: 'nowrap' }}>{att.name}</span>
                          </div>
                        )}
                        <button onClick={() => removeAttachment(i)}
                          style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  {/* Paperclip — gallery / PDFs */}
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    title="Attach plans, photos or PDFs"
                    style={{ width: 38, height: 38, borderRadius: '50%', border: `1.5px solid ${GREY_BD}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color .2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = LIME }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = GREY_BD }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={CHARCOAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </button>
                  <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf"
                    style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files)} />

                  {/* Camera — opens camera directly on mobile */}
                  <button type="button" onClick={() => cameraInputRef.current?.click()}
                    title="Take a photo"
                    style={{ width: 38, height: 38, borderRadius: '50%', border: `1.5px solid ${GREY_BD}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color .2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = LIME }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = GREY_BD }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={CHARCOAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </button>
                  {/* capture="environment" goes straight to the rear camera on mobile */}
                  <input ref={cameraInputRef} type="file" multiple accept="image/*" capture="environment"
                    style={{ display: 'none' }} onChange={e => handleFileSelect(e.target.files)} />

                  <input value={input} onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder="Type your reply, attach plans, or use the mic…"
                    disabled={chatLoading}
                    style={{ flex: 1, padding: '10px 13px', borderRadius: 6, border: `1.5px solid ${GREY_BD}`, fontSize: 13.5, fontFamily: "'Montserrat', sans-serif", outline: 'none', color: CHARCOAL }} />

                  {MIC_BTN('chat', 38)}

                  <button onClick={handleSend}
                    disabled={chatLoading || (!input.trim() && attachments.length === 0)}
                    style={{
                      padding: '0 20px', height: 38, flexShrink: 0,
                      background: (chatLoading || (!input.trim() && attachments.length === 0)) ? `${LIME}55` : LIME,
                      color: '#000', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13,
                      cursor: chatLoading || (!input.trim() && attachments.length === 0) ? 'default' : 'pointer',
                      fontFamily: "'Montserrat', sans-serif", transition: 'transform .15s',
                    }}
                    onMouseEnter={e => { if (!chatLoading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                  >
                    Send
                  </button>
                </div>

                {listening && micTarget === 'chat' && (
                  <div style={{ fontSize: 11, color: RED, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: RED, display: 'inline-block', animation: 'pulse 1s infinite' }} />
                    Listening… speak now, then click Send
                  </div>
                )}

                {/* Attach plans prompt */}
                {attachments.length === 0 && storedFileRefs.length === 0 && (
                  <div style={{
                    marginTop: 10, width: '100%', padding: '10px 14px',
                    background: `${LIME}18`, border: `1.5px dashed ${LIME}`,
                    borderRadius: 7, display: 'flex', alignItems: 'center', gap: 10,
                    boxSizing: 'border-box',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: '#000', marginBottom: 2 }}>Got plans, drawings or photos?</div>
                      <div style={{ fontSize: 11, color: GREY_TXT }}>Attach from your gallery or take a photo — Deon will read them for the estimate</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {/* Gallery / files */}
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        title="Attach from gallery or files"
                        style={{ width: 36, height: 36, borderRadius: 7, background: LIME, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                        </svg>
                      </button>
                      {/* Camera */}
                      <button type="button" onClick={() => cameraInputRef.current?.click()}
                        title="Take a photo"
                        style={{ width: 36, height: 36, borderRadius: 7, background: CHARCOAL, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                          <circle cx="12" cy="13" r="4"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
                {hasMic && (
                  <div style={{ fontSize: 11, color: '#bbb', marginTop: 6 }}>🎤 Mic enabled — speak your answers</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Estimate ───────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', padding: '32px 36px' }}>

            {/* Estimate header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 22, color: '#000', marginBottom: 3 }}>Your Indicative Estimate</div>
                <div style={{ fontSize: 12, color: GREY_TXT }}>{jobType} · {address}</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: LIME, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, color: '#000', flexShrink: 0 }}>SB</div>
            </div>

            {genLoading && (
              <div style={{ textAlign: 'center', padding: '64px 0' }}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', border: `4px solid ${GREY_BD}`, borderTopColor: LIME, animation: 'spin 0.9s linear infinite', margin: '0 auto 20px' }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: CHARCOAL, marginBottom: 6 }}>Generating your estimate…</div>
                <div style={{ fontSize: 12, color: GREY_TXT }}>This typically takes 15–25 seconds</div>
              </div>
            )}

            {genError && (
              <div style={{ padding: '14px 16px', background: '#fff2f2', border: '1px solid #fcd5d5', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
                ⚠ {genError}
                <button onClick={generateEstimate} style={{ marginLeft: 12, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 13, fontFamily: 'inherit' }}>Try again</button>
              </div>
            )}

            {!genLoading && phases.length > 0 && (
              <>
                <div style={{ padding: '11px 14px', background: '#fffceb', border: '1px solid #f0d96e', borderRadius: 7, fontSize: 12, color: '#7a5f00', marginTop: 18, marginBottom: 22, lineHeight: 1.55 }}>
                  ⚠ <strong>Indicative estimate only.</strong> All costs ex-VAT, based on your description. Final price confirmed after a free site visit from our team.
                </div>

                {Object.entries(groupedPhases).map(([parent, phs]) => (
                  <div key={parent} style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 3, height: 14, background: LIME, borderRadius: 2, flexShrink: 0 }} />
                      <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: CHARCOAL }}>
                        {parent}
                      </div>
                    </div>
                    {phs.map((ph, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '8px 0',
                        borderBottom: `1px solid ${GREY_BD}`, fontSize: 13.5,
                        background: i % 2 === 0 ? 'transparent' : '#fafafa',
                      }}>
                        <span style={{ color: CHARCOAL }}>{ph.phase}</span>
                        <span style={{ fontWeight: 700, minWidth: 90, textAlign: 'right', color: '#000' }}>{fmt(phaseTotal(ph))}</span>
                      </div>
                    ))}
                  </div>
                ))}

                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '18px 20px', background: CHARCOAL, borderRadius: 8, marginTop: 12, marginBottom: 8,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Total Estimate (ex-VAT)</span>
                  <span style={{ fontWeight: 800, fontSize: 24, color: LIME }}>{fmt(total)}</span>
                </div>
                <div style={{ fontSize: 11, color: GREY_TXT, marginBottom: 28, paddingLeft: 4 }}>
                  VAT at 20% would add approximately {fmt(total * 0.2)}
                </div>

                <button onClick={() => setStep(3)} style={primaryBtn}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
                >
                  Submit for Review — Get a Confirmed Quote →
                </button>
                <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 10 }}>
                  A member of our team will review and contact you within 2 working days
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: Contact Details ────────────────────────────────────────── */}
        {step === 3 && !submitted && (
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', padding: '32px 36px' }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: '#000', marginBottom: 4 }}>
              Almost there{firstName ? `, ${firstName}` : ''}!
            </div>
            <div style={{ fontSize: 13, color: GREY_TXT, marginBottom: 28, lineHeight: 1.5 }}>
              Just a couple of contact details and we'll get your estimate over to the team. Someone will be in touch to arrange a free site visit.
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>First name *</label>
                  <input required value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Last name</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email address *</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Phone number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ marginBottom: 28 }}>
                <label style={labelStyle}>
                  Anything else to add?
                  <span style={{ textTransform: 'none', fontWeight: 400, color: GREY_TXT, marginLeft: 6 }}>optional</span>
                </label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  placeholder="Any questions, timescales, or additional details…"
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.55 }} />
              </div>

              {/* Estimate summary */}
              <div style={{ background: CHARCOAL, borderRadius: 8, padding: '16px 20px', marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>{jobType}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{address} · Indicative ex-VAT</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 22, color: LIME }}>{fmt(total)}</div>
              </div>

              {submitError && (
                <div style={{ padding: '11px 14px', background: '#fff2f2', border: '1px solid #fcd5d5', borderRadius: 6, color: '#991b1b', fontSize: 13, marginBottom: 14 }}>
                  ⚠ {submitError}
                </div>
              )}

              <button type="submit" disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'default' : 'pointer' }}
                onMouseEnter={e => { if (!submitting) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)' }}
              >
                {submitting ? 'Submitting…' : 'Submit Quote Request'}
              </button>
              <div style={{ fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: 10 }}>
                By submitting you agree to being contacted by The Small Build Co regarding this estimate.
              </div>
            </form>
          </div>
        )}

        {/* ── Confirmation ───────────────────────────────────────────────────── */}
        {submitted && (
          <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 16px rgba(0,0,0,0.06)', padding: '56px 40px', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: LIME, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800, color: '#000' }}>
              ✓
            </div>
            <div style={{ fontWeight: 800, fontSize: 24, color: '#000', marginBottom: 10 }}>Quote request submitted!</div>
            <div style={{ fontSize: 14, color: GREY_TXT, maxWidth: 440, margin: '0 auto 32px', lineHeight: 1.7 }}>
              Thank you, <strong>{firstName}</strong>. We've received your estimate and our team will review it shortly.
              Expect to hear from us within 2 working days.
            </div>

            <div style={{ background: CHARCOAL, borderRadius: 8, padding: '16px 24px', maxWidth: 340, margin: '0 auto 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Your estimate (ex-VAT)</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: LIME }}>{fmt(total)}</div>
            </div>

            <a href="https://www.smallbuildcompany.com" target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', padding: '11px 28px', borderRadius: 6, border: `1.5px solid ${GREY_BD}`, background: '#fff', fontSize: 13, cursor: 'pointer', textDecoration: 'none', color: CHARCOAL, fontWeight: 600 }}>
              Visit smallbuildcompany.com
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background: CHARCOAL, color: '#fff', padding: '28px 24px', marginTop: 'auto' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 15 }}>
            THE SMALL BUILD <span style={{ color: RED }}>CO</span>
          </div>
          <div style={{ fontSize: 11, opacity: 0.55 }}>
            © {new Date().getFullYear()} The Small Build Co · All estimates are indicative and ex-VAT
          </div>
          <a href="https://www.smallbuildcompany.com" target="_blank" rel="noreferrer"
            style={{ fontSize: 11, color: LIME, textDecoration: 'none', fontWeight: 600 }}>
            smallbuildcompany.com
          </a>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');
        body { overflow-y: auto !important; height: auto !important; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to { transform: rotate(360deg) } }
        input:focus, textarea:focus, select:focus { border-color: ${LIME} !important; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  )
}
