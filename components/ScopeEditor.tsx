'use client'

// The scope of works box: a small word-processor with Bold, Underline and Bullets. It shows real bold/underline/bullets (never stars) and
// saves the same plain string as before, with the marks described in lib/scope-format.ts, so the contract, PDF, portal and AI keep working.

import React, { useEffect, useRef, useState } from 'react'
import { scopeToEditorHtml, scopeLineForEditor, domToScope } from '@/lib/scope-format'
import { DragHandle } from '@/components/DragHandle'

export default function ScopeEditor({
  value, onChange, readOnly = false, placeholder = '', minHeight = 140, autoGrow = false, style, onFocus, onBlur,
}: {
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
  placeholder?: string
  minHeight?: number
  /** true = the box grows to fit all its text (the full-screen AI writer); default false = a fixed small box that scrolls, enlarged by dragging its edges */
  autoGrow?: boolean
  /** extra styles for the writing area (border, padding, font size, ...) */
  style?: React.CSSProperties
  onFocus?: () => void
  onBlur?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // The last value the editor itself reported: when the parent hands back something different (the AI wrote a new scope), reload the box
  const last = useRef<string | null>(null)
  const [active, setActive] = useState({ bold: false, underline: false, list: false })
  // Size set by dragging the bottom or right edge (null = the default: full width, minHeight)
  const [size, setSize] = useState<{ w: number | null; h: number | null }>({ w: null, h: null })
  const boxRef = useRef<HTMLDivElement>(null)
  const startSize = useRef({ w: 0, h: 0 })
  const grabSize = () => { startSize.current = { w: boxRef.current?.offsetWidth ?? 0, h: ref.current?.offsetHeight ?? 0 } }
  const pullHeight = (up: number) => setSize(p => ({ ...p, h: Math.max(80, Math.min(1400, startSize.current.h - up)) }))
  const pullWidth = (left: number) => {
    const max = boxRef.current?.parentElement?.clientWidth ?? 2000
    setSize(p => ({ ...p, w: Math.max(240, Math.min(max, startSize.current.w - left)) }))
  }

  useEffect(() => {
    const el = ref.current
    if (!el || value === last.current) return
    el.innerHTML = scopeToEditorHtml(value)
    last.current = value
  }, [value])

  // Keep the B / U / bullet buttons lit to match where the cursor is
  useEffect(() => {
    const update = () => {
      const el = ref.current
      if (!el || !el.contains(document.getSelection()?.anchorNode ?? null)) return
      try {
        setActive({ bold: document.queryCommandState('bold'), underline: document.queryCommandState('underline'), list: document.queryCommandState('insertUnorderedList') })
      } catch { /* not supported: buttons just stay unlit */ }
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  function emit() {
    const el = ref.current
    if (!el) return
    const v = domToScope(el)
    last.current = v
    onChange(v)
  }
  function run(cmd: 'bold' | 'underline' | 'insertUnorderedList') {
    ref.current?.focus()
    document.execCommand(cmd)
    emit()
  }
  function paste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Paste as plain text (no fonts or colours from Word or a web page); marks such as **bold** from our own AI come through as formatting
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n')
    // Line by line through the browser's own commands, so new lines and bullets behave exactly as if they had been typed
    text.split('\n').forEach((raw, i) => {
      if (i > 0) document.execCommand('insertParagraph')
      const { bullet, html } = scopeLineForEditor(raw)
      const inList = document.queryCommandState('insertUnorderedList')
      // The first pasted line carries on from the cursor's own line, so it never changes whether that line is a bullet
      if (i > 0 && bullet !== inList) document.execCommand('insertUnorderedList')
      if (html) document.execCommand('insertHTML', false, html)
    })
    emit()
  }

  const btn = (on: boolean): React.CSSProperties => ({
    minWidth: 30, height: 28, padding: '0 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, lineHeight: 1,
    border: `1px solid ${on ? '#7ab533' : '#d1d5db'}`, background: on ? '#ecfccb' : '#fff', color: '#1e293b', fontFamily: 'inherit',
  })
  const empty = !value.trim()

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
          {/* mouse-down is cancelled so pressing a button keeps the text selected */}
          <button type="button" title="Bold (Ctrl+B)" aria-label="Bold" style={{ ...btn(active.bold), fontWeight: 800 }} onMouseDown={e => e.preventDefault()} onClick={() => run('bold')}>B</button>
          <button type="button" title="Underline (Ctrl+U)" aria-label="Underline" style={{ ...btn(active.underline), textDecoration: 'underline' }} onMouseDown={e => e.preventDefault()} onClick={() => run('underline')}>U</button>
          <button type="button" title="Bullet list" aria-label="Bullet list" style={btn(active.list)} onMouseDown={e => e.preventDefault()} onClick={() => run('insertUnorderedList')}>• List</button>
          <span style={{ fontSize: 11, color: '#94a3b8' }}>Select some text, then press a button</span>
        </div>
      )}
      <div ref={boxRef} style={{ position: 'relative', width: size.w ?? '100%', maxWidth: '100%' }}>
        {empty && placeholder && (
          <div style={{ position: 'absolute', left: 0, top: 0, right: 0, pointerEvents: 'none', color: '#94a3b8', fontSize: 13, padding: style?.padding ?? '10px 12px' }}>{placeholder}</div>
        )}
        <div
          ref={ref}
          className="scope-editor"
          contentEditable={!readOnly}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Scope of works"
          onInput={emit}
          onPaste={paste}
          onFocus={onFocus}
          onBlur={onBlur}
          style={{
            minHeight: autoGrow ? minHeight : undefined, height: size.h ?? (autoGrow ? undefined : minHeight), overflowY: 'auto', resize: 'none', whiteSpace: 'pre-wrap', wordBreak: 'break-word', outline: 'none',
            width: '100%', boxSizing: 'border-box', fontSize: 13, lineHeight: 1.6, padding: '10px 12px',
            border: '1px solid var(--border)', borderRadius: 6, background: readOnly ? '#f8fafc' : '#fff', color: 'var(--text, #1e293b)', fontFamily: 'inherit',
            ...style,
          }}
        />
        {/* Drag the bottom edge to make it taller, the right edge to make it narrower or wider, the corner for both */}
        <DragHandle cursor="ns-resize" title="Drag to make the box taller or shorter" onStart={grabSize} onMove={(_l, up) => pullHeight(up)} style={{ left: 12, right: 12, bottom: -10, height: 10 }} />
        <DragHandle cursor="ew-resize" title="Drag to make the box wider or narrower" onStart={grabSize} onMove={left => pullWidth(left)} style={{ top: 12, bottom: 12, right: -10, width: 10 }} />
        <DragHandle cursor="nwse-resize" title="Drag to resize" onStart={grabSize} onMove={(left, up) => { pullWidth(left); pullHeight(up) }} style={{ right: -10, bottom: -10, width: 14, height: 14 }} />
        <div aria-hidden style={{ position: 'absolute', left: '50%', bottom: -7, width: 36, height: 4, marginLeft: -18, borderRadius: 2, background: '#cbd5e1', pointerEvents: 'none' }} />
        <div aria-hidden style={{ position: 'absolute', top: '50%', right: -7, height: 36, width: 4, marginTop: -18, borderRadius: 2, background: '#cbd5e1', pointerEvents: 'none' }} />
      </div>
      <style>{`.scope-editor ul{margin:4px 0 6px 20px;padding:0}.scope-editor li{margin:0 0 2px}`}</style>
    </div>
  )
}
