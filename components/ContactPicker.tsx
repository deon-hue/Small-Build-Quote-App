'use client'

import { useState, useRef, useEffect } from 'react'

export interface ContactOption {
  id: string
  name: string
}

interface Props {
  value: string
  onChange: (id: string) => void
  contacts: ContactOption[]
  placeholder?: string
  style?: React.CSSProperties
}

export function ContactPicker({ value, onChange, contacts, placeholder = 'Search contact…', style }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = contacts.find(c => c.id === value)

  const filtered = query.trim()
    ? contacts.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))
    : contacts

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  function handleOpen() {
    setOpen(true)
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleSelect(c: ContactOption) {
    onChange(c.id)
    setOpen(false)
    setQuery('')
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('')
  }

  const base: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid #d1d5db',
    borderRadius: 6, fontSize: 13, boxSizing: 'border-box',
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', ...style }}>
      {open ? (
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          style={{ ...base, borderColor: '#2563eb', outline: 'none' }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setQuery('') }
            if (e.key === 'Enter' && filtered.length > 0) handleSelect(filtered[0])
          }}
        />
      ) : (
        <div
          onClick={handleOpen}
          style={{ ...base, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, background: '#fff' }}
        >
          <span style={{ color: selected ? '#111827' : '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.name : placeholder}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 6 }}>
            {selected && (
              <span
                onMouseDown={handleClear}
                style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}
                title="Clear"
              >✕</span>
            )}
            <span style={{ fontSize: 10, color: '#9ca3af' }}>▼</span>
          </span>
        </div>
      )}

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: '#fff', border: '1px solid #d1d5db', borderTop: '1px solid #e5e7eb',
          borderRadius: '0 0 6px 6px', maxHeight: 240, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#9ca3af' }}>No contacts found</div>
          ) : (
            filtered.map(c => (
              <div
                key={c.id}
                onMouseDown={() => handleSelect(c)}
                style={{
                  padding: '9px 12px', fontSize: 13, cursor: 'pointer',
                  borderBottom: '1px solid #f3f4f6',
                  color: c.id === value ? '#2563eb' : '#111827',
                  background: c.id === value ? '#eff6ff' : 'transparent',
                }}
                onMouseEnter={e => { if (c.id !== value) e.currentTarget.style.background = '#f9fafb' }}
                onMouseLeave={e => { e.currentTarget.style.background = c.id === value ? '#eff6ff' : 'transparent' }}
              >
                {c.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
