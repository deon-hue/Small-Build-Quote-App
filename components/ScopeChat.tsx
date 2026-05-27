'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AttachedFile {
  id: string
  name: string
  /** Effective MIME type sent to the API (image/jpeg for compressed images) */
  mimeType: string
  /** Original MIME type of the uploaded file */
  originalType: string
  /** Base64-encoded content for the AI API call */
  dataBase64: string
  /** Original file size in bytes (before compression) */
  size: number
  isImage: boolean
  /** Supabase storage path once the background upload completes */
  storageKey?: string
}

interface Props {
  /** Quote ID for storing documents against a specific quote; undefined/null for new unsaved quotes */
  quoteId?: string | null
  jobType: string
  address: string
  phases: string[]
  onInsert: (scope: string) => void
  onClose: () => void
  /** When provided, shows a "Build Estimate" button that converts the scope into fully-populated quote phases */
  onBuildEstimate?: (scope: string) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMessage(text: string): { scope: string | null; commentary: string } {
  const match = text.match(/\[SCOPE\]([\s\S]*?)\[\/SCOPE\]/i)
  if (match) {
    const scope = match[1].trim()
    const commentary = text.replace(/\[SCOPE\][\s\S]*?\[\/SCOPE\]/i, '').trim()
    return { scope, commentary }
  }
  return { scope: null, commentary: text }
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve((e.target?.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Compress an image to max 1600px in either dimension at JPEG 82%.
 * Building plans contain text/dimensions — 1600px keeps them readable while
 * dramatically cutting the payload size.
 */
function compressImage(file: File): Promise<string> {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1600
      const scale = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82).split(',')[1])
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      readAsBase64(file).then(resolve)
    }
    img.src = url
  })
}

const MAX_ATTACH = 3
const MAX_FILE_BYTES = 8 * 1024 * 1024          // 8MB raw (images get compressed)
const MAX_PDF_BYTES = 3.5 * 1024 * 1024         // 3.5MB for PDFs (no compression possible)
const MAX_TOTAL_BASE64 = 4 * 1024 * 1024        // 4MB total base64 payload ceiling

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScopeChat({ quoteId, jobType, address, phases, onInsert, onClose, onBuildEstimate }: Props) {
  const supabase = createClient()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<AnySpeechRecognition>(null)
  const [loading, setLoading] = useState(false)
  const [latestScope, setLatestScope] = useState<string | null>(null)

  const [attachments, setAttachments] = useState<AttachedFile[]>([])
  const [processing, setProcessing] = useState(false)

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Speech recognition ──────────────────────────────────────
  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }, [])

  const toggleMic = useCallback(() => {
    if (listening) { stopListening(); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { alert('Voice input is not supported in this browser. Please use Chrome or Edge.'); return }
    const rec: AnySpeechRecognition = new SR()
    rec.lang = 'en-GB'; rec.continuous = true; rec.interimResults = true
    rec.onstart = () => setListening(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as ArrayLike<unknown>)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((r: any) => r[0].transcript).join('')
      setInput(transcript)
    }
    rec.onend  = () => { setListening(false); recognitionRef.current = null; setTimeout(() => inputRef.current?.focus(), 50) }
    rec.onerror = () => { setListening(false); recognitionRef.current = null }
    recognitionRef.current = rec
    rec.start()
  }, [listening, stopListening])

  useEffect(() => () => stopListening(), [stopListening])

  // ── Greeting ────────────────────────────────────────────────
  useEffect(() => {
    const phaseList = phases.length ? phases.join(', ') : null
    const greeting = [
      `Hi! I'll help you write the scope of works for this **${jobType}**${address ? ` at ${address}` : ''}.`,
      phaseList
        ? `I can see you have ${phases.length} phase${phases.length > 1 ? 's' : ''}: ${phaseList}.`
        : '',
      `\nYou can **📎 attach building plans, drawings, or photos** — I'll read them and extract the key details. Or describe the job and say **"write scope"** to get started.`,
    ].filter(Boolean).join(' ')

    setMessages([{ role: 'assistant', content: greeting }])
    setTimeout(() => inputRef.current?.focus(), 100)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── File attachment ─────────────────────────────────────────
  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList)
    if (attachments.length + files.length > MAX_ATTACH) {
      alert(`Max ${MAX_ATTACH} files per message. Remove some first.`)
      return
    }
    setProcessing(true)

    for (const file of files) {
      const isImage = file.type.startsWith('image/')
      const isPdf   = file.type === 'application/pdf'

      if (!isImage && !isPdf) {
        alert(`"${file.name}" isn't supported. Please attach images (JPG, PNG) or PDF drawings.`)
        continue
      }
      const sizeLimit = isPdf ? MAX_PDF_BYTES : MAX_FILE_BYTES
      if (file.size > sizeLimit) {
        alert(`"${file.name}" is too large (max ${fmtBytes(sizeLimit)}${isPdf ? ' for PDFs' : ''}).`)
        continue
      }

      try {
        const dataBase64 = isImage ? await compressImage(file) : await readAsBase64(file)
        const mimeType   = isImage ? 'image/jpeg' : 'application/pdf'
        const id = Math.random().toString(36).slice(2, 9)
        const att: AttachedFile = { id, name: file.name, mimeType, originalType: file.type, dataBase64, size: file.size, isImage }
        setAttachments(prev => [...prev, att])

        // Background upload — chat works even if Supabase storage isn't set up yet
        uploadToStorage(att, isImage
          ? new Blob([Uint8Array.from(atob(dataBase64), c => c.charCodeAt(0))], { type: 'image/jpeg' })
          : file
        ).catch(() => { /* storage unavailable — not a blocker */ })
      } catch {
        alert(`Could not read "${file.name}". Please try again.`)
      }
    }

    setProcessing(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadToStorage(att: AttachedFile, uploadable: File | Blob) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const safeName  = att.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path      = `${user.id}/${quoteId || 'draft'}/${Date.now()}-${safeName}`
    const { data }  = await supabase.storage
      .from('quote-documents')
      .upload(path, uploadable, { contentType: att.mimeType })
    if (!data) return
    setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, storageKey: data.path } : a))
    await supabase.from('quote_documents').insert({
      user_id:      user.id,
      quote_id:     quoteId || 'draft',
      filename:     att.name,
      storage_path: data.path,
      mime_type:    att.originalType,
      file_size:    att.size,
    })
  }

  // ── Send ───────────────────────────────────────────────────
  async function send() {
    const textInput = input.trim()
    if (!textInput && attachments.length === 0) return
    if (loading) return

    // Guard: check combined base64 payload size before sending
    const currentAttachments = [...attachments]
    const totalBase64Bytes = currentAttachments.reduce(
      (s, a) => s + Math.ceil(a.dataBase64.length * 0.75), 0
    )
    if (totalBase64Bytes > MAX_TOTAL_BASE64) {
      alert(`Files are too large to send together (max ~4MB total). Please remove some or use smaller files.`)
      return
    }

    // Build the display message (shows file names in the chat bubble)
    const fileLabel = currentAttachments.length > 0
      ? `📎 ${currentAttachments.map(a => a.name).join(', ')}`
      : ''
    const displayContent = [fileLabel, textInput].filter(Boolean).join('\n')
    const userMsg: Message = { role: 'user', content: displayContent }
    const updated = [...messages, userMsg]

    setMessages(updated)
    setInput('')
    setAttachments([])
    setLoading(true)

    try {
      const res = await fetch('/api/scope-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated,
          context: { jobType, address, phases },
          // rawInput is the plain text only — the API never sees "📎 filename.pdf"
          rawInput: textInput,
          attachments: currentAttachments.map(a => ({
            name:       a.name,
            mimeType:   a.mimeType,
            dataBase64: a.dataBase64,
            isImage:    a.isImage,
          })),
        }),
      })

      // If Netlify returns an error page (502/504) it won't be JSON
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        const hint = res.status === 413
          ? 'Files are too large — try a smaller image or PDF.'
          : res.status >= 500
          ? `Server error (${res.status}). The function may have timed out — try without attachments first.`
          : `Request failed (${res.status}).`
        setMessages(prev => [...prev, { role: 'assistant', content: hint }])
        console.error('scope-chat non-OK response:', res.status, text.slice(0, 300))
        return
      }

      const data  = await res.json()
      const reply = data.reply || 'Sorry, something went wrong. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      const { scope } = parseMessage(reply)
      if (scope) setLatestScope(scope)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('scope-chat fetch error:', detail)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Connection error: ${detail}`,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  // ── Quick prompts ──────────────────────────────────────────
  const quickPrompts = attachments.length > 0
    ? [
        'Analyse the plans and write a scope',
        'What construction phases are needed?',
        'Extract all dimensions and room names',
        'What structural work is shown?',
      ]
    : !latestScope
    ? [
        'Write a scope based on the phases',
        'Make it detailed with all trades',
        'Keep it simple – two paragraphs',
        'Add structural engineer requirement',
      ]
    : [
        'Make it shorter and simpler',
        'Make it more detailed',
        'Add exclusions at the end',
        'Add a provisional sums paragraph',
      ]

  const canSend = !loading && (input.trim().length > 0 || attachments.length > 0)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 500,
        height: 'min(90vh, 740px)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        animation: 'slideUp 0.2s ease',
      }}>

        {/* ── Header ── */}
        <div style={{ background: 'var(--moss)', color: '#fff', padding: '14px 18px', borderRadius: '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>✦ AI Scope Writer</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 1 }}>
              {jobType}{address ? ` · ${address}` : ''}
              <span style={{ opacity: 0.65 }}> · Attach plans with 📎</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}
          >×</button>
        </div>

        {/* ── Messages ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 4px' }}>
          {messages.map((m, i) => {
            const { scope, commentary } = parseMessage(m.content)
            const isUser = m.role === 'user'
            return (
              <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%', padding: '10px 14px',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isUser ? 'var(--moss)' : '#f0f2ee',
                  color: isUser ? '#fff' : 'var(--ink)',
                  fontSize: 13, lineHeight: 1.65,
                }}>
                  {commentary && (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {commentary.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                        part.startsWith('**') && part.endsWith('**')
                          ? <strong key={j}>{part.slice(2, -2)}</strong>
                          : part
                      )}
                    </div>
                  )}
                  {scope && (
                    <div style={{ marginTop: commentary ? 10 : 0, background: '#fff', border: '1.5px solid #b8e08a', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#7ab533', marginBottom: 6 }}>
                        ✓ Scope Draft
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{scope}</div>
                      <button
                        onClick={() => { onInsert(scope); onClose() }}
                        style={{ marginTop: 10, background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%' }}
                      >
                        ✓ Use This Scope
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{ background: '#f0f2ee', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', fontSize: 18, letterSpacing: 2, color: 'var(--muted)' }}>···</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Quick prompts ── */}
        {(!latestScope && messages.length <= 1 && !loading) || (attachments.length > 0 && !loading)
          ? (
            <div style={{ padding: '6px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
              {quickPrompts.map(p => (
                <button
                  key={p}
                  onClick={() => { setInput(p); setTimeout(() => inputRef.current?.focus(), 0) }}
                  style={{ background: '#f0f2ee', border: '1px solid var(--border)', borderRadius: 20, padding: '5px 12px', fontSize: 11, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {p}
                </button>
              ))}
            </div>
          ) : null
        }

        {/* ── Latest scope sticky bar ── */}
        {latestScope && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: '#f8faf5', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7ab533', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Latest scope</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {onBuildEstimate && (
                  <button
                    onClick={() => { onBuildEstimate(latestScope); onClose() }}
                    title="Analyse the scope and auto-populate all phases and tasks from the task library"
                    style={{ background: '#e67e22', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    ✦ Build Estimate
                  </button>
                )}
                <button
                  onClick={() => { onInsert(latestScope); onClose() }}
                  style={{ background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  ✓ Insert into Quote
                </button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxHeight: 40, overflow: 'hidden' }}>
              {latestScope.slice(0, 120)}{latestScope.length > 120 ? '…' : ''}
            </div>
          </div>
        )}

        {/* ── Attachment preview strip ── */}
        {(attachments.length > 0 || processing) && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', background: '#f4f7fb', flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {attachments.map(att => (
              <div
                key={att.id}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px 4px 5px', background: '#fff', border: '1px solid #cdd6e0', borderRadius: 8, fontSize: 11, maxWidth: 190 }}
              >
                {att.isImage
                  ? <img src={`data:image/jpeg;base64,${att.dataBase64}`} alt={att.name}
                      style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>📄</span>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)', fontSize: 11 }}>{att.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 10 }}>
                    {fmtBytes(att.size)}
                    {att.storageKey ? ' · ✓ saved' : ''}
                  </div>
                </div>
                <button
                  onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c0392b', fontSize: 16, padding: 0, lineHeight: 1, flexShrink: 0 }}
                >×</button>
              </div>
            ))}
            {processing && (
              <span style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>Reading file…</span>
            )}
            <div style={{ fontSize: 10, color: 'var(--muted)', width: '100%', marginTop: 2 }}>
              📎 {attachments.length}/{MAX_ATTACH} files — send your message to analyse{attachments.length > 1 ? ' them' : ' it'}
            </div>
          </div>
        )}

        {/* ── Input row ── */}
        <div style={{ padding: '10px 16px 14px', borderTop: attachments.length > 0 || processing ? 'none' : '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0, alignItems: 'flex-end' }}>

          {/* Attach button — overlay pattern so no programmatic .click() needed */}
          <div
            title={
              attachments.length >= MAX_ATTACH
                ? `Max ${MAX_ATTACH} files per message`
                : 'Attach building plans, drawings, or photos (PDF, JPG, PNG)'
            }
            style={{ position: 'relative', width: 42, height: 42, flexShrink: 0 }}
          >
            {/* Visual button face */}
            <div
              style={{
                width: '100%', height: '100%', borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20,
                background: attachments.length > 0 ? '#dff0f8' : '#f0f2ee',
                color:      attachments.length > 0 ? '#1a6080' : 'var(--ink)',
                opacity: (processing || attachments.length >= MAX_ATTACH) ? 0.4 : 1,
                transition: 'background 0.2s',
                pointerEvents: 'none',          // let the input on top receive clicks
              }}
            >
              📎
            </div>
            {/* Transparent file input covers the whole button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              multiple
              disabled={processing || attachments.length >= MAX_ATTACH}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%',
                opacity: 0,
                cursor: (processing || attachments.length >= MAX_ATTACH) ? 'not-allowed' : 'pointer',
              }}
              onChange={e => {
                if (e.target.files?.length) handleFiles(e.target.files)
                // Reset so the same file can be re-selected if needed
                e.target.value = ''
              }}
            />
          </div>

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={
              listening
                ? 'Listening… speak now'
                : attachments.length > 0
                ? 'Add any context, or just send to analyse the plans…'
                : 'Describe the job or ask for changes… (Enter to send)'
            }
            rows={2}
            disabled={loading}
            style={{
              flex: 1, resize: 'none', borderRadius: 8, padding: '8px 12px',
              fontSize: 13, fontFamily: 'inherit', outline: 'none', lineHeight: 1.5,
              border: listening ? '2px solid #e74c3c' : '1px solid var(--border)',
              background: listening ? '#fff8f8' : '#fff',
              transition: 'border-color 0.2s, background 0.2s',
            }}
          />

          {/* Mic button */}
          <button
            onClick={toggleMic}
            title={listening ? 'Stop recording' : 'Click to speak'}
            style={{
              border: 'none', borderRadius: 8, width: 42, height: 42, flexShrink: 0,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, transition: 'background 0.2s',
              background: listening ? '#e74c3c' : '#f0f2ee',
              color:      listening ? '#fff' : 'var(--ink)',
              position: 'relative',
            }}
          >
            🎤
            {listening && (
              <span style={{ position: 'absolute', inset: -3, borderRadius: 11, border: '2px solid #e74c3c', animation: 'micPulse 1s ease-in-out infinite', pointerEvents: 'none' }} />
            )}
          </button>

          {/* Send button */}
          <button
            onClick={send}
            disabled={!canSend}
            style={{
              background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 8,
              width: 42, height: 42, fontSize: 20, cursor: 'pointer', flexShrink: 0,
              opacity: canSend ? 1 : 0.4, transition: 'opacity 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ↑
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        @keyframes micPulse {
          0%, 100% { transform: scale(1);    opacity: 1; }
          50%       { transform: scale(1.25); opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
