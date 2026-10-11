'use client'

// The card-style breakdown at the bottom of a quote: cost / margin / sell, where the money goes by cost type, margin by phase, a comparison
// with the builder's own past won quotes, and plain flags. Numbers come from lib/quote-breakdown.ts. All figures ex VAT, margin = % on cost.

import React, { useEffect, useMemo, useState } from 'react'
import type { QuotePhase } from '@/lib/types'
import { fmt } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  COST_KEYS, COST_LABEL, quoteBreakdown, breakdownFlags, comparePhases,
  type CostKey, type PastPhaseRow, type MainPhaseFigures,
} from '@/lib/quote-breakdown'

const COLORS: Record<CostKey, string> = { labour: '#f59e0b', materials: '#3b82f6', plant: '#a855f7', subcontractors: '#ef4444', other: '#94a3b8' }
const GREEN = '#16a34a', AMBER = '#d97706', RED = '#dc2626'
const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px' }
const small: React.CSSProperties = { fontSize: 11, color: '#64748b' }
const heading: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: '#64748b', marginBottom: 8 }
const pct = (n: number) => `${Math.round(n)}%`

function marginColour(marginPct: number, target: number): string {
  if (marginPct >= target - 1) return GREEN
  return marginPct >= target / 2 ? AMBER : RED
}

export default function QuoteBreakdownCards({ phases, markup, jobType, quoteRefs = [] }: {
  phases: QuotePhase[]
  /** the quote's own margin setting: it is the target every sub-phase is measured against */
  markup: number
  jobType?: string
  /** this quote's own reference/id, so it is never compared with itself */
  quoteRefs?: (string | undefined)[]
}) {
  const b = useMemo(() => quoteBreakdown(phases, markup), [phases, markup])
  const flags = useMemo(() => breakdownFlags(b, markup), [b, markup])
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<PastPhaseRow[] | null>(null)

  // The builder's past won quotes, read once (their own rows only: the table is per company)
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const sb = createClient()
        const { data, error } = await sb.from('quote_intelligence')
          .select('quote_ref, job_type, phase_name, labour_total, materials_total, plant_total, subcontract_total, other_total, total_sell, markup_pct')
          .in('quote_outcome', ['won', 'completed'])
          .order('created_at', { ascending: false })
          .limit(800)
        if (live) setHistory(error ? [] : (data ?? []) as PastPhaseRow[])
      } catch { if (live) setHistory([]) }
    })()
    return () => { live = false }
  }, [])

  const refsKey = quoteRefs.filter(Boolean).join('|')
  const comparisons = useMemo(
    () => history ? comparePhases(b.subPhases, history, { jobType, excludeRefs: refsKey ? refsKey.split('|') : [] }) : [],
    [b, history, jobType, refsKey],
  )

  if (b.costTotal <= 0) return null

  const diffPts = b.marginPct - markup
  const marginOfSell = b.sellTotal > 0 ? (b.margin / b.sellTotal) * 100 : 0
  const toggle = (name: string) => setOpen(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })
  const bar = (value: number, of: number, colour: string) => (
    <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, (value / of) * 100))}%`, height: '100%', background: colour, borderRadius: 4 }} />
    </div>
  )

  const rowFor = (name: string, cost: number, margin: number, marginPct: number, indent = false, expandable?: MainPhaseFigures) => {
    const colour = marginColour(marginPct, markup)
    return (
      <div key={(indent ? 's:' : 'm:') + name + cost} className="qb-row" style={{ alignItems: 'center', padding: '5px 0', paddingLeft: indent ? 16 : 0, fontSize: 12, borderBottom: '1px solid #f1f5f9', cursor: expandable ? 'pointer' : 'default' }}
        onClick={expandable ? () => toggle(name) : undefined}>
        <span style={{ fontWeight: indent ? 400 : 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>
          {expandable && <span style={{ color: '#94a3b8', marginRight: 4 }}>{open.has(name) ? '▾' : '▸'}</span>}{name}
        </span>
        <span title={`Margin ${pct(marginPct)} on cost; your target is ${pct(markup)}`}>{bar(marginPct, Math.max(markup * 1.5, 1), colour)}</span>
        <span className="qb-cost" style={{ fontFamily: 'monospace', textAlign: 'right', color: '#e67e22' }} title="Cost">{fmt(cost)}</span>
        <span style={{ fontFamily: 'monospace', textAlign: 'right', color: colour }} title="Margin">{fmt(margin)}</span>
        <span style={{ textAlign: 'right', fontWeight: 700, color: colour }}>{cost > 0 ? pct(marginPct) : '—'}</span>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 20, padding: '16px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
      <style>{`.qb-row{display:grid;grid-template-columns:minmax(110px,1.4fr) minmax(70px,1fr) 76px 76px 52px;gap:8px}@media (max-width:560px){.qb-row{grid-template-columns:minmax(80px,1.3fr) minmax(40px,1fr) 70px 40px;gap:6px}.qb-cost{display:none}}`}</style>
      <div style={heading}>Quote breakdown <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· all figures ex VAT</span></div>

      {/* Headline cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={card}>
          <div style={small}>Your cost</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: '#e67e22' }}>{fmt(b.costTotal)}</div>
        </div>
        <div style={{ ...card, borderColor: marginColour(b.marginPct, markup) }}>
          <div style={small}>Your margin</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: marginColour(b.marginPct, markup) }}>{fmt(b.margin)}</div>
          <div style={{ ...small, color: marginColour(b.marginPct, markup) }}>{pct(b.marginPct)} on cost · {pct(marginOfSell)} of sell</div>
        </div>
        <div style={card}>
          <div style={small}>Sell price</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'monospace', color: '#1e293b' }}>{fmt(b.sellTotal)}</div>
        </div>
        <div style={card}>
          <div style={small}>Your target margin</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>{pct(markup)}</div>
          <div style={{ ...small, color: Math.abs(diffPts) < 0.5 ? '#64748b' : marginColour(b.marginPct, markup) }}>
            {Math.abs(diffPts) < 0.5 ? 'right on it' : `${Math.abs(Math.round(diffPts))} point${Math.abs(Math.round(diffPts)) === 1 ? '' : 's'} ${diffPts > 0 ? 'above' : 'below'}`}
          </div>
        </div>
      </div>

      {/* Where the money goes */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>Where the money goes</div>
        <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', background: '#e2e8f0', marginBottom: 10 }}>
          {COST_KEYS.map(k => b.cost[k] > 0 && (
            <div key={k} title={`${COST_LABEL[k]}: ${fmt(b.cost[k])}`} style={{ width: `${(b.cost[k] / b.costTotal) * 100}%`, background: COLORS[k], minWidth: 2 }} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
          {COST_KEYS.map(k => {
            const c = b.cost[k], s = b.sell[k], m = s - c
            return (
              <div key={k} style={{ border: '1px solid #e2e8f0', borderTop: `3px solid ${COLORS[k]}`, borderRadius: 8, padding: '8px 10px', opacity: c > 0 ? 1 : 0.55 }}>
                <div style={small}>{COST_LABEL[k]}</div>
                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: '#1e293b' }}>{c > 0 ? fmt(c) : '—'}</div>
                <div style={small}>{c > 0 ? `${pct((c / b.costTotal) * 100)} of cost` : 'nothing priced'}</div>
                {c > 0 && <div style={{ fontSize: 11, color: marginColour((m / c) * 100, markup) }}>margin {fmt(m)} · {pct((m / c) * 100)}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Margin by phase */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>Margin by phase <span style={{ fontWeight: 400, color: '#64748b' }}>· tap a phase to see its sub-phases</span></div>
        <div className="qb-row" style={{ ...small, padding: '0 0 3px', borderBottom: '1px solid #e2e8f0' }}>
          <span>Phase</span><span>Margin vs target</span><span className="qb-cost" style={{ textAlign: 'right' }}>Cost</span><span style={{ textAlign: 'right' }}>Margin</span><span style={{ textAlign: 'right' }}>%</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {b.mainPhases.filter(m => m.costTotal > 0 || open.has(m.name)).map(m => (
            <React.Fragment key={m.name}>
              {rowFor(m.name, m.costTotal, m.margin, m.marginPct, false, m)}
              {open.has(m.name) && m.subPhases.filter(s => s.costTotal > 0).map(s => rowFor(s.room ? `${s.name} (${s.room})` : s.name, s.costTotal, s.margin, s.marginPct, true))}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11, color: '#64748b', flexWrap: 'wrap' }}>
          <span><span style={{ color: GREEN }}>●</span> on or above target</span>
          <span><span style={{ color: AMBER }}>●</span> a bit under</span>
          <span><span style={{ color: RED }}>●</span> well under (less than half your target)</span>
        </div>
      </div>

      {/* Compared with your similar jobs */}
      {history !== null && (
        <div style={{ ...card, marginBottom: 12, background: comparisons.length ? '#fffbeb' : '#fff', borderColor: comparisons.length ? '#fde68a' : '#e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: comparisons.length ? '#92400e' : '#1e293b', marginBottom: 4 }}>Compared with your similar jobs</div>
          {comparisons.length === 0 ? (
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
              {history.length === 0
                ? 'Nothing to compare with yet. When you mark a quote as won, it is remembered here, and later quotes are checked against it.'
                : 'Nothing stands out: the sub-phases that match your past won jobs are priced in line with them.'}
            </div>
          ) : comparisons.slice(0, 5).map(c => (
            <div key={c.name} style={{ fontSize: 12.5, lineHeight: 1.55, color: '#44403c', padding: '4px 0', borderTop: '1px solid #fde68a' }}>
              <strong>{c.name}</strong> is {fmt(c.thisCost)} here. {c.count === 1 ? 'On your last similar job' : `Across your last ${c.count} similar jobs`} it was {fmt(c.pastCost)}
              {' '}({pct(Math.abs(c.diff) * 100)} {c.direction === 'cheaper' ? 'cheaper now' : 'dearer now'}).
              {' '}Mostly {COST_LABEL[c.driver].toLowerCase()}: {fmt(c.driverThis)} here against {fmt(c.driverPast)}.
              {c.direction === 'cheaper' && ' Worth checking nothing has been left out.'}
              {c.pastMarginPct !== undefined && ` Margin then ${pct(c.pastMarginPct)}, now ${pct(c.thisMarginPct)}.`}
            </div>
          ))}
          {comparisons.length > 0 && <div style={{ fontSize: 11, color: '#92400e', marginTop: 4 }}>Based on your own won quotes. It tells you where this differs, not which price is right.</div>}
        </div>
      )}

      {/* Things to look at */}
      {flags.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Things to look at</div>
          {flags.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.6, color: '#334155' }}>
              <span style={{ color: f.level === 'ok' ? GREEN : f.level === 'bad' ? RED : AMBER, fontWeight: 700, width: 14, flexShrink: 0 }}>{f.level === 'ok' ? '✓' : '!'}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
