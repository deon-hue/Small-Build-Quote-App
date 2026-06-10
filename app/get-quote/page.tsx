'use client'

import { useState, useRef, useEffect } from 'react'

const JOB_TYPES = [
  'Rear Extension', 'Side Extension', 'Kitchen Extension', 'Loft Conversion',
  'Full Refurbishment', 'Kitchen Fit-Out', 'Bathroom Fit-Out',
  'Garden Room', 'Landscaping', 'New Build', 'Other',
]

interface Message { role: 'user' | 'assistant'; content: string }
interface Phase {
  parentPhase: string; phase: string
  labour: number; materials: number; plant: number; subcontractors: number; other: number
  labourNotes?: string; materialsNotes?: string; plantNotes?: string; subNotes?: string; otherNotes?: string
}

function fmt(n: number) {
  return '£' + Math.round(n).toLocaleString('en-GB')
}

function phaseTotal(ph: Phase) {
  return (ph.labour || 0) + (ph.materials || 0) + (ph.plant || 0) + (ph.subcontractors || 0) + (ph.other || 0)
}

const STEPS = ['Project', 'Scope Interview', 'Your Estimate', 'Submit']

export default function GetQuotePage() {
  const [step, setStep] = useState(0)

  // Step 1 — project info
  const [jobType, setJobType] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')

  // Step 2 — scope chat
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [scope, setScope]       = useState('')
  const [scopeReady, setScopeReady] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Step 3 — estimate
  const [phases, setPhases]       = useState<Phase[]>([])
  const [total, setTotal]         = useState(0)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError]   = useState('')

  // Step 4 — contact
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [email, setEmail]         = useState('')
  const [phone, setPhone]         = useState('')
  const [message, setMessage]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, chatLoading])

  // ── Start the interview ───────────────────────────────────────────────
  async function startInterview() {
    if (!jobType || !address.trim()) return
    setStep(1)
    const greeting = description.trim()
      ? `Hi! I'm looking to get a quote for a ${jobType} at ${address}. ${description}`
      : `Hi! I'm looking to get a quote for a ${jobType} at ${address}.`
    await sendMessage(greeting, [])
  }

  async function sendMessage(text: string, history: Message[]) {
    const newHistory: Message[] = [...history, { role: 'user', content: text }]
    setMessages(newHistory)
    setInput('')
    setChatLoading(true)

    try {
      const res = await fetch('/api/public/scope-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory,
          context: { jobType, address },
        }),
      })
      const data = await res.json()
      const reply: string = data.reply || 'Sorry, something went wrong. Please try again.'

      const assistantMsgs: Message[] = [...newHistory, { role: 'assistant', content: reply }]
      setMessages(assistantMsgs)

      // Detect scope completion
      if (reply.includes('[READY_TO_BUILD]')) {
        const scopeMatch = reply.match(/\[SCOPE\]([\s\S]*?)\[\/SCOPE\]/)
        if (scopeMatch) {
          setScope(scopeMatch[1].trim())
          setScopeReady(true)
        }
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setChatLoading(false)
    }
  }

  function handleSend() {
    if (!input.trim() || chatLoading) return
    sendMessage(input.trim(), messages)
  }

  // ── Generate estimate ────────────────────────────────────────────────
  async function generateEstimate() {
    setStep(2)
    setGenLoading(true)
    setGenError('')
    try {
      const res = await fetch('/api/public/generate-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, jobType, address }),
      })
      const data = await res.json()
      if (data.error) { setGenError(data.error); return }
      setPhases(data.phases || [])
      setTotal(data.total || 0)
    } catch {
      setGenError('Failed to generate estimate. Please try again.')
    } finally {
      setGenLoading(false)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !email.trim()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/public/submit-quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName:      `${firstName.trim()} ${lastName.trim()}`.trim(),
          clientEmail:     email.trim(),
          clientPhone:     phone.trim(),
          projectType:     jobType,
          projectAddress:  address,
          scopeText:       scope,
          aiPhases:        phases,
          estimatedTotal:  total,
          message:         message.trim(),
        }),
      })
      const data = await res.json()
      if (data.error) { setSubmitError(data.error); return }
      setSubmitted(true)
    } catch {
      setSubmitError('Failed to submit. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Group phases by parentPhase for display ──────────────────────────
  const groupedPhases: Record<string, Phase[]> = {}
  for (const ph of phases) {
    const key = ph.parentPhase || 'Other'
    if (!groupedPhases[key]) groupedPhases[key] = []
    groupedPhases[key].push(ph)
  }

  // ── Strip [SCOPE]...[/SCOPE][READY_TO_BUILD] from displayed text
  function cleanReply(text: string) {
    return text
      .replace(/\[SCOPE\][\s\S]*?\[\/SCOPE\]/g, '')
      .replace(/\[READY_TO_BUILD\]/g, '')
      .trim()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6f4', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ background: '#2b2f33', color: '#fff', padding: '0 24px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.3px' }}>Small Build Company</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>AI Quote Builder</div>
        </div>
      </div>

      {/* Step indicator */}
      {!submitted && (
        <div style={{ background: '#fff', borderBottom: '1px solid #e4e7e4' }}>
          <div style={{ maxWidth: 780, margin: '0 auto', padding: '0 24px', display: 'flex' }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{
                flex: 1, textAlign: 'center', padding: '12px 4px',
                fontSize: 12, fontWeight: i === step ? 700 : 400,
                color: i === step ? '#3a7a3a' : i < step ? '#2b2f33' : '#9aa09a',
                borderBottom: i === step ? '3px solid #3a7a3a' : '3px solid transparent',
                transition: 'all 0.2s',
              }}>
                <span style={{ marginRight: 4, opacity: i < step ? 1 : 0.5 }}>
                  {i < step ? '✓' : `${i + 1}.`}
                </span>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>

        {/* ── STEP 0: Project Details ─────────────────────────────────── */}
        {step === 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6, color: '#1e2022' }}>Get your building estimate</div>
            <div style={{ fontSize: 14, color: '#6b7580', marginBottom: 32 }}>
              Answer a few questions and our AI will generate an indicative cost estimate for your project.
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#2b2f33' }}>
                What type of project is it? *
              </label>
              <select
                value={jobType}
                onChange={e => setJobType(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, background: '#fff' }}
              >
                <option value="">Select project type…</option>
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#2b2f33' }}>
                Property address *
              </label>
              <input
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="e.g. 14 Oak Avenue, Windsor, SL4 1AA"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#2b2f33' }}>
                Briefly describe your project <span style={{ fontWeight: 400, color: '#9aa09a' }}>(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="e.g. We'd like a single-storey rear extension, around 4m x 5m, with bifold doors and a new kitchen…"
                rows={4}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            <button
              onClick={startInterview}
              disabled={!jobType || !address.trim()}
              style={{
                width: '100%', padding: '13px', borderRadius: 8, border: 'none',
                background: jobType && address.trim() ? '#3a7a3a' : '#c8d0c8',
                color: '#fff', fontSize: 15, fontWeight: 700, cursor: jobType && address.trim() ? 'pointer' : 'default',
                transition: 'background 0.2s',
              }}
            >
              Start Scope Interview →
            </button>
            <div style={{ fontSize: 11, color: '#9aa09a', textAlign: 'center', marginTop: 12 }}>
              Takes 2–5 minutes · No obligation · Indicative estimate only
            </div>
          </div>
        )}

        {/* ── STEP 1: Scope Chat ──────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', minHeight: 500 }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e8ebe8' }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Scope Interview</div>
              <div style={{ fontSize: 12, color: '#6b7580', marginTop: 2 }}>
                {jobType} · {address}
              </div>
            </div>

            {/* Chat messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 300, maxHeight: 480 }}>
              {messages.map((m, i) => {
                const displayText = m.role === 'assistant' ? cleanReply(m.content) : m.content
                if (!displayText) return null
                return (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                  }}>
                    <div style={{
                      maxWidth: '80%', padding: '10px 14px', borderRadius: 12,
                      background: m.role === 'user' ? '#3a7a3a' : '#f2f4f2',
                      color: m.role === 'user' ? '#fff' : '#1e2022',
                      fontSize: 14, lineHeight: 1.55,
                      borderBottomRightRadius: m.role === 'user' ? 3 : 12,
                      borderBottomLeftRadius: m.role === 'assistant' ? 3 : 12,
                      whiteSpace: 'pre-wrap',
                    }}>
                      {displayText}
                    </div>
                  </div>
                )
              })}
              {chatLoading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ background: '#f2f4f2', padding: '10px 16px', borderRadius: 12, borderBottomLeftRadius: 3, fontSize: 20, color: '#6b7580' }}>
                    ···
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Scope ready banner */}
            {scopeReady && (
              <div style={{ margin: '0 24px', padding: '14px 16px', background: '#f0f7ee', border: '1px solid #b8d8b8', borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#2b5a2b', marginBottom: 4 }}>✓ Scope of works ready</div>
                <div style={{ fontSize: 12, color: '#4a7a4a', marginBottom: 12, lineHeight: 1.5 }}>{scope.slice(0, 200)}{scope.length > 200 ? '…' : ''}</div>
                <button
                  onClick={generateEstimate}
                  style={{ padding: '10px 20px', background: '#3a7a3a', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Generate My Estimate →
                </button>
              </div>
            )}

            {/* Input */}
            {!scopeReady && (
              <div style={{ padding: '16px 24px', borderTop: '1px solid #e8ebe8', display: 'flex', gap: 10 }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type your reply…"
                  disabled={chatLoading}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14 }}
                />
                <button
                  onClick={handleSend}
                  disabled={chatLoading || !input.trim()}
                  style={{
                    padding: '10px 18px', background: chatLoading || !input.trim() ? '#c8d0c8' : '#3a7a3a',
                    color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Send
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Estimate ────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '28px 32px' }}>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Your Indicative Estimate</div>
            <div style={{ fontSize: 13, color: '#6b7580', marginBottom: 20 }}>{jobType} · {address}</div>

            {genLoading && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: '#6b7580' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <div style={{ fontSize: 14 }}>Generating your estimate…</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>This takes about 20 seconds</div>
              </div>
            )}

            {genError && (
              <div style={{ padding: '14px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
                ⚠ {genError}
                <button onClick={generateEstimate} style={{ marginLeft: 12, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontSize: 13 }}>
                  Try again
                </button>
              </div>
            )}

            {!genLoading && phases.length > 0 && (
              <>
                {/* Disclaimer */}
                <div style={{ padding: '12px 14px', background: '#fffbeb', border: '1px solid #f5d87a', borderRadius: 8, fontSize: 12, color: '#92400e', marginBottom: 20, lineHeight: 1.5 }}>
                  ⚠ <strong>Indicative estimate only.</strong> Costs are based on your description and may vary once a surveyor has visited the site. All costs are ex-VAT. Final price confirmed after a free site visit.
                </div>

                {/* Phase table */}
                {Object.entries(groupedPhases).map(([parent, phs]) => (
                  <div key={parent} style={{ marginBottom: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.6px', color: '#3a7a3a', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e4e7e4' }}>
                      {parent}
                    </div>
                    {phs.map((ph, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid #f0f2f0', fontSize: 13 }}>
                        <span style={{ color: '#2b2f33' }}>{ph.phase}</span>
                        <span style={{ fontWeight: 600, color: '#1e2022', minWidth: 80, textAlign: 'right' }}>{fmt(phaseTotal(ph))}</span>
                      </div>
                    ))}
                  </div>
                ))}

                {/* Total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: '2px solid #2b2f33', marginTop: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>Total Estimate (ex-VAT)</span>
                  <span style={{ fontWeight: 800, fontSize: 22, color: '#2b5a2b' }}>{fmt(total)}</span>
                </div>

                <div style={{ marginTop: 8, fontSize: 11, color: '#9aa09a', marginBottom: 24 }}>
                  VAT at 20% would add approx. {fmt(total * 0.2)} — standard rate applies to most new-build and extension works.
                </div>

                <button
                  onClick={() => setStep(3)}
                  style={{ width: '100%', padding: '13px', borderRadius: 8, border: 'none', background: '#3a7a3a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
                >
                  Submit for Review →
                </button>
                <div style={{ fontSize: 11, color: '#9aa09a', textAlign: 'center', marginTop: 10 }}>
                  We'll review and confirm your quote — usually within 2 working days
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: Contact Details ─────────────────────────────────── */}
        {step === 3 && !submitted && (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '28px 32px' }}>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Your Details</div>
            <div style={{ fontSize: 13, color: '#6b7580', marginBottom: 24 }}>
              We'll review your estimate and be in touch to discuss next steps.
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5 }}>First name *</label>
                  <input required value={firstName} onChange={e => setFirstName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5 }}>Last name</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5 }}>Email address *</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5 }}>Phone number</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 5 }}>
                  Anything else to add? <span style={{ fontWeight: 400, color: '#9aa09a' }}>(optional)</span>
                </label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  placeholder="Any questions, timescales, or additional details…"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid #d0d5d0', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              {/* Estimate summary */}
              <div style={{ background: '#f5f6f4', borderRadius: 8, padding: '14px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{jobType} · {address}</div>
                  <div style={{ fontSize: 12, color: '#6b7580', marginTop: 2 }}>Indicative estimate (ex-VAT)</div>
                </div>
                <div style={{ fontWeight: 800, fontSize: 20, color: '#2b5a2b' }}>{fmt(total)}</div>
              </div>

              {submitError && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#991b1b', fontSize: 13, marginBottom: 14 }}>
                  ⚠ {submitError}
                </div>
              )}

              <button type="submit" disabled={submitting}
                style={{ width: '100%', padding: '13px', borderRadius: 8, border: 'none', background: submitting ? '#8aaa8a' : '#3a7a3a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer' }}>
                {submitting ? 'Submitting…' : 'Submit Quote Request'}
              </button>
              <div style={{ fontSize: 11, color: '#9aa09a', textAlign: 'center', marginTop: 10 }}>
                By submitting you agree to being contacted by Small Build Company regarding this quote.
              </div>
            </form>
          </div>
        )}

        {/* ── Confirmation ─────────────────────────────────────────────── */}
        {submitted && (
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '48px 36px', textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
            <div style={{ fontWeight: 800, fontSize: 24, color: '#2b5a2b', marginBottom: 8 }}>Quote Request Submitted!</div>
            <div style={{ fontSize: 15, color: '#4a5a4a', maxWidth: 440, margin: '0 auto 32px', lineHeight: 1.6 }}>
              Thank you, {firstName}. We've received your estimate request and will review it shortly. You'll hear from us within 2 working days.
            </div>
            <div style={{ background: '#f5f6f4', borderRadius: 10, padding: '16px 20px', maxWidth: 340, margin: '0 auto 32px', display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, color: '#6b7580' }}>Your estimate</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: '#2b5a2b' }}>{fmt(total)}</div>
            </div>
            <button
              onClick={() => {
                setStep(0); setJobType(''); setAddress(''); setDescription('')
                setMessages([]); setScope(''); setScopeReady(false)
                setPhases([]); setTotal(0)
                setFirstName(''); setLastName(''); setEmail(''); setPhone(''); setMessage('')
                setSubmitted(false)
              }}
              style={{ padding: '11px 28px', borderRadius: 7, border: '1px solid #d0d5d0', background: '#fff', fontSize: 14, cursor: 'pointer', color: '#2b2f33' }}
            >
              Start a new quote
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
