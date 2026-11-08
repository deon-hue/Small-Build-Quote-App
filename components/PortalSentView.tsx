'use client'

// The client portal's "Sent to you" page, as a plain display component. It is used by BOTH the real client portal (app/(portal)/portal/(dash)/sent/page.tsx) and the builder's "preview what the client sees"
// page (app/(app)/portal-preview/page.tsx), so the two can never drift apart: change this screen and both show it. It lists what the company has sent them (design ideas, photographs, drawings, a scope of
// works, a brief), newest first, with the words and the files, which open in a new tab.

import { CHANNEL_ICON, whenShort, type PortalSentItem } from '@/lib/sent-items'

export default function PortalSentView({ items, loading, companyName }: { items: PortalSentItem[]; loading?: boolean; companyName?: string }) {
  return (
    <>
      <div className="portal-page-hd">
        <h1>Sent to you</h1>
        <p>The designs, drawings, photographs and information {companyName || 'your builder'} has sent you, kept here so you can find them again.</p>
      </div>

      {loading && <div className="portal-loading"><div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="portal-notice">
          <div style={{ fontSize: 40, marginBottom: 12 }}>📨</div>
          <h2 style={{ marginBottom: 6 }}>Nothing here yet</h2>
          <p style={{ color: 'var(--muted)' }}>When {companyName || 'your builder'} sends you designs, pictures or information, it will be kept here.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="portal-section">
          {items.map(i => (
            <div key={i.id} className="portal-card" data-testid="portal-sent-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}><span aria-hidden="true">{CHANNEL_ICON[i.channel]}</span> {i.subject || (i.files.length ? 'Files for you' : 'A message for you')}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{whenShort(i.sentAt)}</div>
              </div>
              {i.body && <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10, whiteSpace: 'pre-wrap' }}>{i.body}</div>}
              {i.files.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
                  {i.files.map((f, n) => f.isImage && f.url ? (
                    <a key={n} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name} style={{ display: 'block', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <img src={f.url} alt={f.name} style={{ width: 120, height: 120, objectFit: 'cover', display: 'block' }} />
                    </a>
                  ) : f.url ? (
                    <a key={n} className="btn btn-outline" href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', fontSize: 13 }}>📄 {f.name}</a>
                  ) : (
                    <span key={n} style={{ fontSize: 12, color: 'var(--muted)' }}>{f.name} (not available right now)</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
