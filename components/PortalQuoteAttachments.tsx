'use client'

import { useState, useEffect } from 'react'

type QuoteFile = { id: string; fileName: string; mimeType: string; fileSize: number; category: string; label: string; url: string | null }

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function PortalQuoteAttachments({ quoteId }: { quoteId: string }) {
  const [files, setFiles] = useState<QuoteFile[] | 'loading'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/portal/quote-documents?quoteId=${quoteId}`)
      .then(res => res.ok ? res.json() : [])
      .then((data: QuoteFile[]) => { if (!cancelled) setFiles(data) })
      .catch(() => { if (!cancelled) setFiles([]) })
    return () => { cancelled = true }
  }, [quoteId])

  if (files === 'loading' || files.length === 0) return null

  const photos = files.filter(f => f.category === 'photo')
  const others = files.filter(f => f.category !== 'photo')

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
        Attachments
      </div>

      {photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 6, marginBottom: others.length > 0 ? 8 : 0 }}>
          {photos.map(f => (
            <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noreferrer"
              style={{ display: 'block', borderRadius: 6, overflow: 'hidden', aspectRatio: '1', background: '#f0f2f4' }}>
              {f.url
                ? <img src={f.url} alt={f.label || f.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>📷</div>
              }
            </a>
          ))}
        </div>
      )}

      {others.map(f => (
        <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, marginBottom: 4, background: '#fafaf8', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
          <span style={{ fontSize: 16 }}>{f.category === 'plan' ? '📐' : '📄'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.label || f.fileName}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtSize(f.fileSize)}</div>
          </div>
        </a>
      ))}
    </div>
  )
}
