'use client'

// The client portal dashboard's cards for the Selections and Sent to you tabs: a short summary of each with a button to open it. A plain display component used by BOTH the real dashboard and the builder's
// preview of it (so they cannot drift apart); the numbers come from lib/portal-glance.ts. A card is left out when its tab is not available to this client (Sent to you also when nothing has been sent).

import { selectionsLine, type SelectionsGlance, type SentGlance } from '@/lib/portal-glance'
import { whenShort } from '@/lib/sent-items'

const TITLE: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }
const badge = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 10.5, fontWeight: 700, color: fg, background: bg, borderRadius: 10, padding: '2px 9px', letterSpacing: 0.3 })

export default function PortalGlanceCards({ selections, sent, onOpenSelections, onOpenSent }: {
  /** null = the Selections tab is not available to this client */
  selections: SelectionsGlance | null
  /** null = nothing has been sent to this client yet */
  sent: SentGlance | null
  onOpenSelections: () => void
  onOpenSent: () => void
}) {
  if (!selections && !sent) return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 24 }} data-testid="portal-glance">
      {selections && (
        <div className="portal-card" style={{ margin: 0, borderLeft: `4px solid ${selections.late > 0 ? '#c0392b' : '#7ab533'}` }}>
          <div style={TITLE}>Your selections</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>{selectionsLine(selections)}</div>
          {(selections.late > 0 || selections.soon > 0) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {selections.late > 0 && <span style={badge('#fde8e6', '#a93226')}>{selections.late} needed by a date that has passed</span>}
              {selections.soon > 0 && <span style={badge('#fff4d6', '#8a5a00')}>{selections.soon} needed within 2 weeks</span>}
            </div>
          )}
          <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={onOpenSelections}>{selections.total === 0 ? 'Add your first idea →' : 'Open your selections →'}</button>
        </div>
      )}
      {sent && (
        <div className="portal-card" style={{ margin: 0, borderLeft: '4px solid #4a90a4' }}>
          <div style={TITLE}>Sent to you</div>
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            {sent.count} {sent.count === 1 ? 'message' : 'messages'}{sent.fileCount > 0 ? `, ${sent.fileCount} ${sent.fileCount === 1 ? 'file' : 'files'}` : ''}
          </div>
          {sent.latestTitle && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>Latest: <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{sent.latestTitle}</strong>{sent.latestAt ? ` · ${whenShort(sent.latestAt)}` : ''}</div>}
          <button type="button" className="btn btn-outline" style={{ marginTop: 12 }} onClick={onOpenSent}>See what has been sent →</button>
        </div>
      )}
    </div>
  )
}
