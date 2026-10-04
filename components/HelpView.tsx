'use client'

// The Help & Guides screen as a plain display component (search, category chips, videos, FAQs). The signed-in page
// app/(app)/help/page.tsx loads the content and hands it to this.

import { useMemo, useState } from 'react'
import { type HelpItem, parseVideoUrl, safeHttpUrl, helpMatches } from '@/lib/help'

function VideoCard({ item }: { item: HelpItem }) {
  const info = parseVideoUrl(item.url)
  const [playing, setPlaying] = useState(false)
  if (!info) return null
  return (
    <div className="card" style={{ margin: 0, overflow: 'hidden' }}>
      {info.provider === 'youtube' ? (
        playing ? (
          <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
            <iframe
              src={info.embedUrl}
              title={item.title}
              allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${item.title}`}
            style={{ all: 'unset', cursor: 'pointer', display: 'block', position: 'relative', paddingTop: '56.25%', background: '#1e2022', width: '100%' } as React.CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={info.thumbUrl} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,0,0,0.65)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, paddingLeft: 4 }}>▶</span>
            </span>
          </button>
        )
      ) : (
        <a href={info.link} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 120, background: '#1e2022', color: '#fff', textDecoration: 'none', fontWeight: 700 }}>
          <span style={{ fontSize: 26 }}>{info.provider === 'tiktok' ? '🎵' : '▶'}</span> {info.label} ↗
        </a>
      )}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.35 }}>{item.title}</div>
        {item.body && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{item.body}</div>}
        {info.provider === 'youtube' && (
          <a href={info.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8, fontSize: 12, color: 'var(--moss)', fontWeight: 600 }}>Open on YouTube ↗</a>
        )}
      </div>
    </div>
  )
}

export default function HelpView({ items, failed }: { items: HelpItem[] | null; failed: boolean }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')

  const categories = useMemo(() => {
    const seen: string[] = []
    ;(items ?? []).forEach(i => { if (!seen.includes(i.category)) seen.push(i.category) })
    return seen
  }, [items])

  const shown = useMemo(
    () => (items ?? []).filter(i => (category === 'All' || i.category === category) && helpMatches(i, query)),
    [items, category, query],
  )
  const faqs = shown.filter(i => i.kind === 'faq')
  const videos = shown.filter(i => i.kind === 'video' && parseVideoUrl(i.url))

  return (
    <div style={{ maxWidth: 980, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 26, margin: 0 }}>Help &amp; Guides</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13.5, margin: '4px 0 0' }}>Answers to common questions and short how-to videos.</p>
      </div>

      <div className="card" style={{ padding: '14px 18px', marginBottom: 16 }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search help… e.g. contract, invoice, portal"
          aria-label="Search help"
          style={{ width: '100%', padding: '10px 12px', fontSize: 14, boxSizing: 'border-box' }}
        />
        {categories.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {['All', ...categories].map(c => (
              <button key={c} type="button" onClick={() => setCategory(c)}
                className={`btn-sm ${category === c ? 'btn-primary' : 'btn-outline'}`}>{c}</button>
            ))}
          </div>
        )}
      </div>

      {items === null && <div style={{ color: 'var(--muted)', padding: 20 }}>Loading…</div>}

      {failed && (
        <div className="card" style={{ padding: '18px 20px', color: 'var(--muted)' }}>
          The help guides aren&rsquo;t available right now. Please try again in a little while, or use the <strong>Report a problem</strong> button to tell us.
        </div>
      )}

      {items !== null && !failed && faqs.length === 0 && videos.length === 0 && (
        <div className="card" style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--muted)' }}>
          {query || category !== 'All' ? 'Nothing matches that search.' : 'There are no help guides yet.'}
        </div>
      )}

      {videos.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Videos</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {videos.map(v => <VideoCard key={v.id} item={v} />)}
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>Frequently asked questions</div>
          <div className="card" style={{ margin: 0 }}>
            {faqs.map((f, idx) => {
              const link = safeHttpUrl(f.url)
              return (
                <details key={f.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border)', padding: '0 18px' }}>
                  <summary style={{ cursor: 'pointer', padding: '14px 0', fontWeight: 600, fontSize: 14.5, listStyle: 'none', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span>{f.title}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{f.category}</span>
                  </summary>
                  <div style={{ padding: '0 0 16px', fontSize: 13.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                    {f.body}
                    {link && (
                      <div style={{ marginTop: 8 }}>
                        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--moss)', fontWeight: 600 }}>Learn more ↗</a>
                      </div>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </section>
      )}

      <div style={{ fontSize: 13, color: 'var(--muted)', padding: '4px 2px 24px' }}>
        Can&rsquo;t find what you need? Use the <strong>Report a problem</strong> button in the corner of the screen and tell us what you were trying to do.
      </div>
    </div>
  )
}
