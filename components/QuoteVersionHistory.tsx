'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface Version {
  id: string
  ref: string
  version_number: number
  status: string
  savedDate: string
  lastEdited: string
  created_from_version_id?: string
}

interface Props {
  quoteId: string
  currentVersion?: number
  onVersionChange?: (versionId: string) => void
}

export default function QuoteVersionHistory({ quoteId, currentVersion, onVersionChange }: Props) {
  const router = useRouter()
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    fetchVersions()
  }, [quoteId])

  async function fetchVersions() {
    try {
      const res = await fetch(`/api/quotes/versions?quoteId=${quoteId}`)
      if (res.ok) {
        const data = await res.json()
        setVersions(data)
      }
    } catch (err) {
      console.error('Failed to fetch versions:', err)
    }
  }

  async function createNewVersion() {
    setCreating(true)
    try {
      const res = await fetch('/api/quotes/create-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId }),
      })

      if (res.ok) {
        const newQuote = await res.json()
        sessionStorage.setItem('sbc_edit_quote', newQuote.id)
        window.location.href = '/new-quote'
      } else {
        const errorData = await res.json()
        alert(`Failed to create new version: ${errorData.error}${errorData.details ? ` (${errorData.details})` : ''}`)
      }
    } catch (err) {
      console.error('Error creating version:', err)
      alert('Error creating new version')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {/* Current version badge */}
      <div style={{
        padding: '6px 12px',
        background: 'var(--lightGreen)',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        color: '#3a7a1a',
      }}>
        v{currentVersion || 1}
      </div>

      {/* Create new version button */}
      <button
        onClick={createNewVersion}
        disabled={creating}
        title="Create a new version of this quote"
        style={{
          padding: '6px 14px',
          background: '#e67e22',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: creating ? 'not-allowed' : 'pointer',
          opacity: creating ? 0.7 : 1,
        }}
      >
        {creating ? 'Creating…' : '+ New Version'}
      </button>

      {/* Version history dropdown */}
      {versions.length > 1 && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            style={{
              padding: '6px 10px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--muted)',
            }}
          >
            📋 {versions.length} versions
          </button>

          {showHistory && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 1000,
              minWidth: 280,
              maxHeight: 400,
              overflow: 'auto',
            }}>
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    router.push(`/quotes/${v.id}`)
                    setShowHistory(false)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: v.id === quoteId ? 'var(--lightGreen)' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--ink)',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {v.ref} {v.id === quoteId && '(current)'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 3 }}>
                    {new Date(v.lastEdited).toLocaleDateString()} · {v.status}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
