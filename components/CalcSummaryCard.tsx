'use client'

/**
 * The live summary of a calculator, as a steel merchant's beam calculator has beside the choices: the job by kind of cost, the profit and the total, with a switch between ex VAT and inc VAT. It follows every change as it is
 * made. The price a calculator saves is always ex VAT (the quote adds the VAT), so the inc-VAT figures are for comparing with a merchant's or a customer's price. The sums are lib/calc-summary.ts.
 */

import React from 'react'
import { useCalcState } from '@/components/calc-state'
import { buildSummary, type CalcTotals } from '@/lib/calc-summary'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const seg = (on: boolean): React.CSSProperties => ({ flex: 1, padding: '4px 0', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: '1px solid #0369a1', background: on ? '#0369a1' : '#fff', color: on ? '#fff' : '#0369a1' })

export default function CalcSummaryCard({ id, totals, kg, members, steelWord = 'steel' }: {
  /** the calculator's saved-state name, so the VAT choice is kept with it */
  id: string
  totals: CalcTotals
  /** kilos of steel in the job, for the price per kilo */
  kg?: number
  /** how many members, for the heading */
  members?: number
  steelWord?: string
}) {
  const [inc, setInc] = useCalcState(id, 'summaryVatInc', false)
  const [vatRate, setVatRate] = useCalcState(id, 'summaryVatRate', 20)
  const s = buildSummary(totals, { inc, vatRate, kg })
  return (
    <div data-calc-summary style={{ background: '#fff', border: '1px solid #bae6fd', borderRadius: 8, padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 }}>Summary</span>
        <div style={{ display: 'flex', width: 130 }} role="group" aria-label="Show prices ex VAT or inc VAT">
          <button type="button" onClick={() => setInc(false)} aria-pressed={!inc} style={{ ...seg(!inc), borderRadius: '5px 0 0 5px' }}>Ex VAT</button>
          <button type="button" onClick={() => setInc(true)} aria-pressed={inc} style={{ ...seg(inc), borderRadius: '0 5px 5px 0', borderLeft: 'none' }}>Inc VAT</button>
        </div>
      </div>
      {(members != null || (kg ?? 0) > 0) && (
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>
          {members != null ? `${members} member${members === 1 ? '' : 's'}` : ''}{members != null && (kg ?? 0) > 0 ? ', ' : ''}{(kg ?? 0) > 0 ? `about ${kg}kg of ${steelWord}` : ''}{totals.qty > 1 ? `, x ${totals.qty}` : ''}
        </div>
      )}
      {s.rows.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8' }}>Nothing priced yet.</div>}
      {s.rows.map(r => (
        <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: r.key === 'profit' ? '#64748b' : '#334155', padding: '2px 0' }}>
          <span>{r.label}</span><span style={{ fontFamily: 'monospace' }}>{gbp(r.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Total {inc ? 'inc' : 'ex'} VAT</span>
        <span data-calc-summary-total style={{ fontFamily: 'monospace', fontSize: 17, fontWeight: 700, color: '#4d7c0f' }}>{gbp(s.shown)}</span>
      </div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span>{gbp(s.totalEx)} + VAT</span>
        <input type="number" min={0} max={100} step={0.5} value={vatRate} onChange={e => { const n = +e.target.value; if (e.target.value !== '' && Number.isFinite(n)) setVatRate(Math.min(100, Math.max(0, n))) }} title="VAT rate %" style={{ width: 52, fontSize: 11, padding: '1px 4px', border: '1px solid #cbd5e1', borderRadius: 4 }} />
        <span>% {gbp(s.vat)} = {gbp(s.totalInc)}</span>
      </div>
      {s.perKg != null && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>About {gbp(s.perKg)} per kg of {steelWord}, all in {inc ? 'inc' : 'ex'} VAT.</div>}
      <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>Saved to the quote ex VAT: the quote adds the VAT. Switch to inc VAT to compare with a merchant&apos;s price.</div>
    </div>
  )
}
