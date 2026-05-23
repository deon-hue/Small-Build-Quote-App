'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  jobType: string
  address: string
  phases: string[]
  onInsert: (scope: string) => void
  onClose: () => void
}

function parseMessage(text: string): { scope: string | null; commentary: string } {
  const match = text.match(/\[SCOPE\]([\s\S]*?)\[\/SCOPE\]/i)
  if (match) {
    const scope = match[1].trim()
    const commentary = text.replace(/\[SCOPE\][\s\S]*?\[\/SCOPE\]/i, '').trim()
    return { scope, commentary }
  }
  return { scope: null, commentary: text }
}

export default function ScopeChat({ jobType, address, phases, onInsert, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [latestScope, setLatestScope] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Greeting on open
  useEffect(() => {
    const phaseList = phases.length ? phases.join(', ') : null
    const greeting = [
      `Hi! I'll help you write the scope of works for this **${jobType}**${address ? ` at ${address}` : ''}.`,
      phaseList ? `I can see you have ${phases.length} phase${phases.length > 1 ? 's' : ''}: ${phaseList}.` : '',
      `\nTell me more about the job — any key features, materials, or specific requirements. Or just say **"write scope"** and I'll draft one based on what I know.`,
    ].filter(Boolean).join(' ')

    setMessages([{ role: 'assistant', content: greeting }])
    setTimeout(() => inputRef.current?.focus(), 100)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send() {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/scope-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updated,
          context: { jobType, address, phases },
        }),
      })
      const data = await res.json()
      const reply = data.reply || 'Sorry, something went wrong. Please try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      const { scope } = parseMessage(reply)
      if (scope) setLatestScope(scope)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect. Please check your internet and try again.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const quickPrompts = [
    'Write a scope based on the phases',
    'Make it shorter and simpler',
    'Make it more detailed',
    'Add that a structural engineer is required',
  ]

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460,
        height: 'min(82vh, 680px)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        animation: 'slideUp 0.2s ease',
      }}>

        {/* Header */}
        <div style={{
          background: 'var(--moss)', color: '#fff', padding: '14px 18px',
          borderRadius: '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
              ✦ AI Scope Writer
            </div>
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 1 }}>{jobType}{address ? ` · ${address}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: '50%', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>×</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 4px' }}>
          {messages.map((m, i) => {
            const { scope, commentary } = parseMessage(m.content)
            const isUser = m.role === 'user'
            return (
              <div key={i} style={{ marginBottom: 10, display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '88%',
                  padding: '10px 14px',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: isUser ? 'var(--moss)' : '#f0f2ee',
                  color: isUser ? '#fff' : 'var(--ink)',
                  fontSize: 13, lineHeight: 1.65,
                }}>
                  {/* Commentary text — render **bold** */}
                  {commentary && (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {commentary.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
                        part.startsWith('**') && part.endsWith('**')
                          ? <strong key={j}>{part.slice(2, -2)}</strong>
                          : part
                      )}
                    </div>
                  )}

                  {/* Scope block */}
                  {scope && (
                    <div style={{
                      marginTop: commentary ? 10 : 0,
                      background: '#fff', border: '1.5px solid #b8e08a', borderRadius: 8,
                      padding: '10px 12px',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#7ab533', marginBottom: 6 }}>
                        ✓ Scope Draft
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{scope}</div>
                      <button
                        onClick={() => { onInsert(scope); onClose() }}
                        style={{
                          marginTop: 10, background: 'var(--moss)', color: '#fff', border: 'none',
                          borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', width: '100%',
                        }}
                      >
                        ✓ Use This Scope
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Typing indicator */}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{ background: '#f0f2ee', borderRadius: '16px 16px 16px 4px', padding: '12px 16px', fontSize: 18, letterSpacing: 2, color: 'var(--muted)' }}>
                ···
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick prompts (shown until first AI scope) */}
        {!latestScope && messages.length <= 1 && (
          <div style={{ padding: '6px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 6, flexShrink: 0 }}>
            {quickPrompts.map(p => (
              <button
                key={p}
                onClick={() => { setInput(p); setTimeout(() => inputRef.current?.focus(), 0) }}
                style={{
                  background: '#f0f2ee', border: '1px solid var(--border)', borderRadius: 20,
                  padding: '5px 12px', fontSize: 11, color: 'var(--ink)', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Latest scope sticky bar */}
        {latestScope && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: '#f8faf5', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#7ab533', letterSpacing: '0.5px', textTransform: 'uppercase' }}>Latest scope</span>
              <button
                onClick={() => { onInsert(latestScope); onClose() }}
                style={{
                  background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 6,
                  padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                ✓ Insert into Quote
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxHeight: 40, overflow: 'hidden' }}>
              {latestScope.slice(0, 120)}{latestScope.length > 120 ? '…' : ''}
            </div>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Describe the job or ask for changes… (Enter to send)"
            rows={2}
            disabled={loading}
            style={{
              flex: 1, resize: 'none', border: '1px solid var(--border)', borderRadius: 8,
              padding: '8px 12px', fontSize: 13, fontFamily: 'inherit',
              outline: 'none', lineHeight: 1.5,
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              background: 'var(--moss)', color: '#fff', border: 'none', borderRadius: 8,
              width: 42, fontSize: 20, cursor: 'pointer', flexShrink: 0,
              opacity: loading || !input.trim() ? 0.45 : 1, transition: 'opacity 0.15s',
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
      `}</style>
    </div>
  )
}
