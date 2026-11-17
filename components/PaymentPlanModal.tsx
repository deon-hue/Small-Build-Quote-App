'use client'

// The window where a quote's PAYMENT PLAN is made: rough working days for each sub-phase and a start date, how the customer pays (a stage as each main phase is
// finished, or every few weeks for the work done), the deposit and the retention, then the payments are worked out and can each be changed by hand.
// The rules are in lib/payment-plan.ts (pure and tested); this is only the screen. It hands the finished plan back; the quote page saves it with the quote.

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { QuotePhase } from '@/lib/types'
import { fmt, VAT } from '@/lib/utils'
import { planKeys, planTasksFromQuote, planQuoteTotal } from '@/lib/payment-plan-quote'
import {
  DEFAULT_SETTINGS, addDaysTo, cleanDays, generatePlan, isoDayOf, monthlyTotals, parseDay, planProblems, planSum, suggestDays, workDayToCalDay,
  type PaymentPlan, type PlanMode, type PlanRow, type PlanStageBy,
} from '@/lib/payment-plan'

interface Props {
  phases: QuotePhase[]
  markup: number
  vatOn: boolean
  plan: PaymentPlan | null
  onSave: (plan: PaymentPlan | null) => void
  onClose: () => void
}

const inp: React.CSSProperties = { padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', background: '#fff', color: 'var(--text)' }
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'block' }
const ORDER: Record<string, number> = { deposit: 0, stage: 1, final: 1, retention: 2 }

export default function PaymentPlanModal({ phases, markup, vatOn, plan, onSave, onClose }: Props) {
  const keys = useMemo(() => planKeys(phases), [phases])
  const total = useMemo(() => planQuoteTotal(phases, markup, vatOn), [phases, markup, vatOn])

  const [start, setStart] = useState(plan?.startDate ?? '')
  const [mode, setMode] = useState<PlanMode>(plan?.mode ?? DEFAULT_SETTINGS.mode)
  const [stageBy, setStageBy] = useState<PlanStageBy>(plan?.stageBy ?? 'phase')
  const [splitMaterials, setSplitMaterials] = useState(plan?.splitMaterials ?? false)
  const [everyWeeks, setEveryWeeks] = useState(plan?.everyWeeks ?? 1)
  const [dep, setDep] = useState(plan?.depositPct ?? DEFAULT_SETTINGS.depositPct)
  const [ret, setRet] = useState(plan?.retentionPct ?? DEFAULT_SETTINGS.retentionPct)
  const [retMonths, setRetMonths] = useState(plan?.retentionMonths ?? DEFAULT_SETTINGS.retentionMonths)
  const [show, setShow] = useState(plan?.showToClient ?? true)
  const [days, setDays] = useState<Record<string, number>>(() => {
    const d: Record<string, number> = {}
    phases.forEach((p, i) => { d[keys[i]] = plan?.days?.[keys[i]] ?? suggestDays(p) })
    return d
  })
  // customer discount %, by sub-phase key (only those above 0 are kept)
  const [discounts, setDiscounts] = useState<Record<string, number>>(plan?.discounts ?? {})
  const setDiscount = (keys: string[], v: number) => setDiscounts(d => {
    const n = { ...d }
    const p = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0
    for (const k of keys) { if (p > 0) n[k] = p; else delete n[k] }
    return n
  })
  const [rows, setRows] = useState<PlanRow[]>(plan?.rows ?? [])
  const [edited, setEdited] = useState(false)   // rows changed by hand since they were worked out

  const settings = { startDate: start, mode, everyWeeks, depositPct: dep, retentionPct: ret, retentionMonths: retMonths, stageBy, splitMaterials }
  const tasks = useMemo(() => planTasksFromQuote(phases, markup, vatOn, days), [phases, markup, vatOn, days])
  const groups = useMemo(() => {
    const out: { name: string; value: number; items: { key: string; name: string; value: number }[] }[] = []
    for (const t of tasks) {
      let g = out.find(x => x.name === t.group)
      if (!g) { g = { name: t.group, value: 0, items: [] }; out.push(g) }
      g.value += t.value; g.items.push({ key: t.key, name: t.name, value: t.value })
    }
    return out
  }, [tasks])
  const totalDays = tasks.filter(t => t.value > 0).reduce((a, t) => a + cleanDays(days[t.key] ?? 1), 0)
  const startD = parseDay(start)
  const finishLabel = startD ? addDaysTo(startD, workDayToCalDay(startD, totalDays)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const candidate: PaymentPlan = { ...generatePlan(tasks, days, settings, total, new Date(), show, discounts), rows }
  const problems = planProblems(candidate, total).filter(p => !(rows.length === 0))
  const months = monthlyTotals(candidate)
  // the discount typed for a phase's tasks: the one figure when they all agree, else 'mixed'
  const groupPct = (ks: string[]): number | 'mixed' | '' => {
    const first = discounts[ks[0]] ?? 0
    return ks.every(k => (discounts[k] ?? 0) === first) ? (first === 0 ? '' : first) : 'mixed'
  }

  function work() {
    if (edited && rows.length > 0 && !confirm('Working the payments out again replaces the changes you made to them by hand. Carry on?')) return
    setRows(generatePlan(tasks, days, settings, total, new Date(), show, discounts).rows)
    setEdited(false)
  }
  function setRow(id: string, patch: Partial<PlanRow>) { setRows(r => r.map(x => (x.id === id ? { ...x, ...patch } : x))); setEdited(true) }
  function addRow() {
    const last = rows.filter(r => r.dueDay != null).reduce((m, r) => Math.max(m, r.dueDay as number), 0)
    setRows(r => [...r, { id: 'm' + Date.now().toString(36), kind: 'stage', description: 'Payment', amount: 0, dueDay: last + 7 }]); setEdited(true)
  }
  function save() {
    const sorted = [...rows].sort((a, b) => (ORDER[a.kind] - ORDER[b.kind]) || ((a.dueDay ?? -1) - (b.dueDay ?? -1)))
    onSave({ ...candidate, rows: sorted })
  }

  const body = (
    <div className="modal-overlay" style={{ zIndex: 1200 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="form-modal" style={{ width: 'min(900px, 97vw)', maxHeight: '92vh' }} role="dialog" aria-label="Payment plan">
        <div className="form-modal-hd">
          <div style={{ fontWeight: 700, fontSize: 17 }}>💳 Payment plan</div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="form-modal-bd" style={{ overflowY: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 14 }}>
            Works out when each part of the price falls due, so the customer can plan their cash flow before the job is confirmed. It is kept with the quote, shown to the customer in the quote and in their portal, and goes with the job when the quote is accepted.
            Quote total <strong>{fmt(total)}</strong>{vatOn ? ' including VAT' : ' (no VAT)'}. A <strong>customer discount</strong> can be set on any task (or a whole phase): it comes off before the deposit, stages and retention are worked out.
          </div>

          {/* 1. Timescales */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>1. How long each part takes</div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
            <div>
              <span style={label}>Start date (if you know it)</span>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', paddingBottom: 6 }}>
              {totalDays} working days in all{finishLabel ? <> · finishing about <strong>{finishLabel}</strong></> : ' · no start date, so the customer is told "about N weeks after work starts"'}
            </div>
            <button type="button" className="btn-sm btn-outline" onClick={() => { const d: Record<string, number> = {}; phases.forEach((p, i) => { d[keys[i]] = suggestDays(p) }); setDays(d) }}>Suggest the days again</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>The days are a guess from the labour in each sub-phase (working days, Monday to Friday, one after another). Type the real figures.</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, maxHeight: 260, overflowY: 'auto' }}>
            {groups.map(g => (
              <div key={g.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: 'var(--warm, #f3efe9)', padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>
                  <span>{g.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>{fmt(g.value)} · {g.items.reduce((a, i) => a + cleanDays(days[i.key] ?? 1), 0)} days</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }} title="Sets the customer discount on every task in this phase">
                      Discount all
                      <input type="number" min={0} max={100} step={0.5} placeholder={groupPct(g.items.map(i => i.key)) === 'mixed' ? 'mixed' : '0'}
                        value={groupPct(g.items.map(i => i.key)) === 'mixed' ? '' : groupPct(g.items.map(i => i.key))}
                        onChange={e => setDiscount(g.items.map(i => i.key), e.target.value === '' ? 0 : Number(e.target.value))}
                        style={{ ...inp, width: 68, padding: '3px 6px' }} />%
                    </label>
                  </span>
                </div>
                {g.items.map(i => (
                  <div key={i.key} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 92px', gap: 8, alignItems: 'center', padding: '4px 10px', fontSize: 12, borderTop: '1px solid var(--border)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
                    <span style={{ textAlign: 'right', color: 'var(--muted)' }}>{fmt(i.value)}</span>
                    <span><input type="number" min={1} max={400} value={days[i.key] ?? 1} onChange={e => setDays(d => ({ ...d, [i.key]: cleanDays(e.target.value) }))} style={{ ...inp, width: 60, padding: '3px 6px' }} /> days</span>
                    <span title="Customer discount on this task"><input type="number" min={0} max={100} step={0.5} value={discounts[i.key] ?? ''} placeholder="0" onChange={e => setDiscount([i.key], e.target.value === '' ? 0 : Number(e.target.value))} style={{ ...inp, width: 58, padding: '3px 6px' }} /> %</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {candidate.discountTotal > 0 && (
            <div style={{ fontSize: 12.5, lineHeight: 1.55, background: '#f6fbf1', border: '1px solid #c9e2b3', borderRadius: 8, padding: '8px 12px', margin: '-6px 0 16px' }}>
              <strong>Customer discount {fmt(candidate.discountTotal)}</strong> off the quote total of {fmt(total)}, so the customer pays <strong>{fmt(total - candidate.discountTotal)}</strong>.
              {' '}It comes straight off your profit: {fmt(candidate.discountTotal / (vatOn ? 1 + VAT : 1))} before VAT. The customer sees it as its own line, "Customer discount".
            </div>
          )}

          {/* 2. How they pay */}
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>2. How the customer pays</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" name="ppmode" checked={mode === 'phase-end'} onChange={() => setMode('phase-end')} style={{ marginTop: 3, width: 'auto', flexShrink: 0 }} />
              <span><strong>On completion</strong><br /><span style={{ fontSize: 12, color: 'var(--muted)' }}>A payment as each part is finished. Best when it is paid for once it is done.</span></span>
            </label>
            {mode === 'phase-end' && (
              <div style={{ marginLeft: 26, display: 'grid', gap: 8, padding: '8px 12px', background: 'var(--warm, #f3efe9)', borderRadius: 8 }}>
                <label style={{ fontSize: 12.5 }}>One payment for{' '}
                  <select value={stageBy} onChange={e => setStageBy(e.target.value as PlanStageBy)} style={{ ...inp, padding: '2px 6px', width: 'auto', display: 'inline-block' }}>
                    <option value="phase">each main phase</option>
                    <option value="task">each task (so two tasks in a phase can be paid at different times)</option>
                  </select>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={splitMaterials} onChange={e => setSplitMaterials(e.target.checked)} style={{ marginTop: 2, width: 'auto', flexShrink: 0 }} />
                  <span><strong>Two dates for each payment</strong>: the <strong>materials</strong> are due when the {stageBy === 'task' ? 'task' : 'phase'} <strong>starts</strong>; the labour and everything else when it is <strong>completed</strong>.<br />
                    <span style={{ color: 'var(--muted)' }}>Only the materials lines in the quote count as materials. Each date can still be changed by hand in the payments below.</span></span>
                </label>
              </div>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
              <input type="radio" name="ppmode" checked={mode === 'periodic'} onChange={() => setMode('periodic')} style={{ marginTop: 3, width: 'auto', flexShrink: 0 }} />
              <span><strong>For the work done, every
                <select value={everyWeeks} onChange={e => setEveryWeeks(Number(e.target.value))} onClick={e => e.stopPropagation()} style={{ ...inp, margin: '0 6px', padding: '2px 6px', width: 'auto', display: 'inline-block' }}>
                  <option value={1}>week</option><option value={2}>2 weeks</option><option value={4}>4 weeks</option>
                </select></strong><br /><span style={{ fontSize: 12, color: 'var(--muted)' }}>A payment for the percentage of each phase planned to be done in that time. Suits a phase that may not finish exactly on time.</span></span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
            <div><span style={label}>Deposit %</span><input type="number" min={0} max={100} step={1} value={dep} onChange={e => setDep(Number(e.target.value))} style={{ ...inp, width: 80 }} /></div>
            <div><span style={label}>Retention %</span><input type="number" min={0} max={100} step={0.5} value={ret} onChange={e => setRet(Number(e.target.value))} style={{ ...inp, width: 80 }} /></div>
            <div><span style={label}>Retention released after</span><span><input type="number" min={0} max={60} value={retMonths} onChange={e => setRetMonths(Number(e.target.value))} style={{ ...inp, width: 70 }} /> months</span></div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>The deposit is taken off the later payments in proportion. The retention is held back from the last payment and paid once the time is up and any defects are put right. Sample figures: 10% and 5%; change them.</div>

          <button type="button" className="btn btn-primary" onClick={work}>{rows.length ? '↻ Work the payments out again' : 'Work the payments out'}</button>

          {/* 3. The payments */}
          {rows.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>3. The payments {edited && <span style={{ fontWeight: 400, fontSize: 11, color: '#92400e' }}> (changed by hand)</span>}</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflowX: 'auto' }}>
                <div style={{ minWidth: 560 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 110px 28px', gap: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', background: 'var(--warm, #f3efe9)' }}>
                    <span>What for</span><span>When</span><span style={{ textAlign: 'right' }}>Amount £</span><span />
                  </div>
                  {rows.map(r => (
                    <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 150px 110px 28px', gap: 8, alignItems: 'center', padding: '5px 10px', borderTop: '1px solid var(--border)' }}>
                      <input value={r.description} onChange={e => setRow(r.id, { description: e.target.value })} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                      {r.dueDay == null
                        ? <span style={{ fontSize: 12, color: 'var(--muted)' }}>On acceptance</span>
                        : startD
                          ? <input type="date" value={isoDayOf(addDaysTo(startD, r.dueDay))} onChange={e => { const d = parseDay(e.target.value); if (d) setRow(r.id, { dueDay: Math.max(0, Math.round((d.getTime() - startD.getTime()) / 86400000)) }) }} style={inp} />
                          : <span style={{ fontSize: 12 }}><input type="number" min={0} value={r.dueDay} onChange={e => setRow(r.id, { dueDay: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ ...inp, width: 64 }} /> days in</span>}
                      <input type="number" min={0} step={0.01} value={r.amount} onChange={e => setRow(r.id, { amount: Math.max(0, Math.round((Number(e.target.value) || 0) * 100) / 100) })} style={{ ...inp, width: '100%', boxSizing: 'border-box', textAlign: 'right' }} />
                      <button type="button" title="Remove this payment" onClick={() => { setRows(x => x.filter(y => y.id !== r.id)); setEdited(true) }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#b91c1c', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 110px 28px', gap: 8, padding: '7px 10px', borderTop: '2px solid var(--border)', fontWeight: 700, fontSize: 13 }}>
                    <span><button type="button" className="btn-sm btn-outline" onClick={addRow}>+ Add a payment</button></span><span style={{ textAlign: 'right' }}>Total</span><span style={{ textAlign: 'right' }}>{fmt(planSum(rows))}</span><span />
                  </div>
                </div>
              </div>
              {problems.map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: /come to/.test(p) ? '#b91c1c' : '#92400e', marginTop: 6, fontWeight: /come to/.test(p) ? 700 : 400 }}>⚠ {p}</div>
              ))}
              {months.length > 1 && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
                  <strong>Month by month:</strong> {months.map(m => `${m.label} ${fmt(m.amount)}`).join(' · ')}
                </div>
              )}
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginTop: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} style={{ width: 'auto' }} />
            Show this payment plan to the customer (in the quote and in their portal)
          </label>
        </div>
        <div className="form-modal-ft" style={{ justifyContent: 'space-between' }}>
          <span>{plan && <button type="button" className="btn btn-outline" onClick={() => { if (confirm('Remove this payment plan from the quote?')) onSave(null) }}>Remove the plan</button>}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={rows.length === 0}>Save the plan</button>
          </span>
        </div>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? null : createPortal(body, document.body)
}
