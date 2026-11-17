'use client'

// How a customer sees a payment plan: plain words, a table of what is due and when, a total, and (when the start date is known) what leaves their account each
// month. Used by the quote in the customer's portal, the portal's own Payment plan page and the builder's preview of both.
// It only displays: the rules and the sums are in lib/payment-plan.ts.

import { dueLabel, monthlyTotals, planSum, type PaymentPlan } from '@/lib/payment-plan'
import { planDiscountLines, planIntro } from '@/lib/payment-plan-html'

const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PaymentPlanView({ plan, vatNote, heading = 'Payment plan' }: { plan: PaymentPlan; vatNote?: string; heading?: string }) {
  const months = monthlyTotals(plan)
  const sum = planSum(plan.rows)
  return (
    <section aria-label={heading} style={{ marginTop: 18 }}>
      <h3 style={{ fontSize: 17, margin: '0 0 6px', color: 'var(--ink, #1e2022)' }}>{heading}</h3>
      <p style={{ fontSize: 13, color: 'var(--muted, #5b6570)', margin: '0 0 10px', lineHeight: 1.55 }}>
        {planIntro(plan)}
        {vatNote ? ` ${vatNote}` : ''}
      </p>
      {plan.discountTotal > 0 && (
        <div style={{ margin: '0 0 10px', maxWidth: 460 }}>
          {planDiscountLines(plan).map(l => (
            <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, padding: '3px 2px', fontWeight: l.strong ? 700 : 400, borderTop: l.strong ? '1px solid var(--border, #e2e6ea)' : 'none', color: 'var(--ink, #1e2022)' }}>
              <span>{l.label}</span><span style={{ whiteSpace: 'nowrap' }}>{l.amount}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ border: '1px solid var(--border, #e2e6ea)', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
        {plan.rows.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', padding: '10px 14px', borderTop: i ? '1px solid var(--border, #e2e6ea)' : 'none' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink, #1e2022)', lineHeight: 1.4 }}>{r.description}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted, #5b6570)', marginTop: 2 }}>{dueLabel(plan, r)}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--ink, #1e2022)' }}>{gbp(r.amount)}</div>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderTop: '2px solid var(--border, #e2e6ea)', background: 'var(--warm, #f6f4f0)', fontWeight: 700, fontSize: 14 }}>
          <span>Total</span><span>{gbp(sum)}</span>
        </div>
      </div>
      {months.length > 1 && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--muted, #5b6570)' }}>
          <div style={{ fontWeight: 600, marginBottom: 3, color: 'var(--ink, #1e2022)' }}>Month by month</div>
          {months.map(m => (
            <div key={m.label} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 320, padding: '1px 0' }}><span>{m.label}</span><span>{gbp(m.amount)}</span></div>
          ))}
        </div>
      )}
    </section>
  )
}
