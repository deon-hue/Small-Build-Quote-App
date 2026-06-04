'use client'

import { useState, useEffect } from 'react'
import type { QuotePhase, QuoteItem } from '@/lib/types'
import type { PhaseReviewResult, ReviewSuggestion } from '@/app/api/phase-review/route'

function uid() { return Math.random().toString(36).slice(2, 10) }

const CAT_EMOJI: Record<string, string> = {
  labour: '🔨', materials: '📦', plant: '🚜', subcontractors: '👷', other: '📋',
}
const CAT_COLOR: Record<string, string> = {
  labour: '#e74c3c', materials: '#3498db', plant: '#f39c12', subcontractors: '#9b59b6', other: '#64748b',
}

interface Props {
  phase:      QuotePhase
  jobType:    string
  markup:     number
  onAddItem:  (item: Omit<QuoteItem, 'id'>) => void
  onComplete: () => void
  onClose:    () => void
}

export default function PhaseReviewModal({ phase, jobType, markup, onAddItem, onComplete, onClose }: Props) {
  const [loading,    setLoading]    = useState(true)
  const [result,     setResult]     = useState<PhaseReviewResult | null>(null)
  const [hasHistory, setHasHistory] = useState(false)
  const [error,      setError]      = useState('')
  const [added,      setAdded]      = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res  = await fetch('/api/phase-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase, jobType, markup }),
        })
        const data = await res.json()
        if (cancelled) return
        if (!res.ok || data.error) { setError(data.error ?? 'Review failed'); return }
        setResult(data.result as PhaseReviewResult)
        setHasHistory(!!data.hasHistory)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Review failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function addSuggestion(s: ReviewSuggestion, key: string) {
    const newItem: Omit<QuoteItem, 'id'> = {
      desc:            s.desc || s.item,
      qty:             1,
      unit:            'item',
      labour:          s.category === 'labour'         ? 0 : 0,
      materials:       s.category === 'materials'      ? 0 : 0,
      plantHire:       s.category === 'plant'          ? 0 : 0,
      subcontractors:  s.category === 'subcontractors' ? 0 : 0,
      other:           s.category === 'other'          ? 0 : 0,
      notes:           `AI suggestion: ${s.reason}`,
      itemType:        s.category === 'plant' ? 'plant' : s.category === 'subcontractors' ? 'subcontractors' : s.category === 'other' ? 'other' : s.category === 'materials' ? 'materials' : 'labour',
    }
    onAddItem(newItem)
    setAdded(prev => new Set([...prev, key]))
  }

  function SuggestionCard({ s, keyId, accent }: { s: ReviewSuggestion; keyId: string; accent: string }) {
    const done = added.has(keyId)
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 8, marginBottom: 6, background: done ? '#f0fdf4' : '#f8fafc', border: `1px solid ${done ? '#86efac' : '#e2e8f0'}` }}>
        <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{CAT_EMOJI[s.category] ?? '📋'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{s.item}</span>
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 99, background: `${CAT_COLOR[s.category]}22`, color: CAT_COLOR[s.category], fontWeight: 600, textTransform: 'uppercase' }}>{s.category}</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{s.reason}</div>
          {s.desc && s.desc !== s.item && (
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>Row: &quot;{s.desc}&quot;</div>
          )}
        </div>
        <button
          onClick={() => addSuggestion(s, keyId)}
          disabled={done}
          style={{ flexShrink: 0, padding: '5px 12px', background: done ? '#16a34a' : accent, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: done ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
          {done ? '✓ Added' : '+ Add'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.4)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 28, lineHeight: 1 }}>🤖</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>AI Phase Review</div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {phase.parentPhase ? `${phase.parentPhase} → ` : ''}{phase.phase}
              {hasHistory && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: '#eff6ff', color: '#1d4ed8', fontWeight: 600 }}>✦ Using your past quotes</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#94a3b8', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {loading && (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1.5s linear infinite' }}>⟳</div>
              <div style={{ fontSize: 14, color: '#64748b' }}>Analysing phase against UK construction best practice…</div>
              {hasHistory && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>Checking your past quotes too</div>}
            </div>
          )}

          {error && (
            <div style={{ padding: '16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}

          {result && (
            <>
              {/* Gaps — missing required items */}
              {result.gaps.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e74c3c' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#dc2626' }}>
                      Possible Gaps — {result.gaps.length} item{result.gaps.length !== 1 ? 's' : ''} typically required
                    </span>
                  </div>
                  {result.gaps.map((g, i) => <SuggestionCard key={i} s={g} keyId={`gap-${i}`} accent="#dc2626" />)}
                </div>
              )}

              {/* Suggestions — worth considering */}
              {result.suggestions.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#b45309' }}>
                      Suggestions — {result.suggestions.length} worth considering
                    </span>
                  </div>
                  {result.suggestions.map((s, i) => <SuggestionCard key={i} s={s} keyId={`sug-${i}`} accent="#f59e0b" />)}
                </div>
              )}

              {/* Concerns */}
              {result.concerns.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7c3aed', marginBottom: 8 }}>
                    ⚠️ Concerns
                  </div>
                  {result.concerns.map((c, i) => (
                    <div key={i} style={{ padding: '8px 12px', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 6, fontSize: 12, color: '#6b21a8', marginBottom: 5 }}>
                      {c}
                    </div>
                  ))}
                </div>
              )}

              {/* Looks complete */}
              {result.looksComplete.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#16a34a', marginBottom: 8 }}>
                    ✅ Looks Complete
                  </div>
                  {result.looksComplete.map((c, i) => (
                    <div key={i} style={{ padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, color: '#166534', marginBottom: 4 }}>
                      {c}
                    </div>
                  ))}
                </div>
              )}

              {result.gaps.length === 0 && result.suggestions.length === 0 && result.concerns.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#16a34a' }}>Phase looks complete</div>
                  <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>No obvious gaps or missing items found.</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#f8fafc' }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, background: '#fff', cursor: 'pointer', color: '#374151' }}>
            Keep Editing
          </button>
          <button onClick={onComplete}
            style={{ padding: '8px 22px', background: '#16a34a', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            ✓ Complete Phase
          </button>
        </div>
      </div>
    </div>
  )
}
