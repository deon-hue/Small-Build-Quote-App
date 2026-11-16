// A quote's payment plan as a block of HTML (for the online / downloaded quote and the print-out) and as plain lines (for the PDF). Everything typed is escaped.
// Only a plan the builder has switched on for the customer is shown (visiblePlan), so a hidden plan never reaches a printout.

import { dueLabel, monthlyTotals, planSum, visiblePlan, type PaymentPlan } from './payment-plan'

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const gbp = (n: number) => '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The sentences that go above the table: what it is, how stages are paid, the deposit and the retention. */
export function planIntro(plan: PaymentPlan): string {
  return 'This shows when each part of the price falls due, so you can plan your cash flow. The dates are estimates: they depend on the start date and on how the work goes.'
    + (plan.mode === 'phase-end' ? ' Each stage is paid when that phase is finished.' : ' Each payment is for the work planned to be done in that time.')
    + (plan.depositPct > 0 ? ` A ${plan.depositPct}% deposit is paid when you accept the quote and is taken off the later payments.` : '')
    + (plan.retentionPct > 0 ? ` ${plan.retentionPct}% is held back as retention and paid ${plan.retentionMonths} months after completion, once any defects are put right.` : '')
}

/** One line per payment for the PDF: [what for, when, amount]. */
export function planLines(plan: PaymentPlan): { what: string; when: string; amount: string }[] {
  return plan.rows.map(r => ({ what: r.description, when: dueLabel(plan, r), amount: gbp(r.amount) }))
}

/** The whole block, or '' when there is no plan the customer may see. */
export function paymentPlanHtml(raw: unknown): string {
  const plan = visiblePlan(raw)
  if (!plan) return ''
  const months = monthlyTotals(plan)
  const rows = plan.rows.map(r => `<tr><td style="padding:8px 10px;border-top:1px solid #e2e8f0;font-size:13px">${esc(r.description)}<div style="font-size:12px;color:#64748b;margin-top:2px">${esc(dueLabel(plan, r))}</div></td><td style="padding:8px 10px;border-top:1px solid #e2e8f0;text-align:right;font-weight:700;font-size:14px;white-space:nowrap;vertical-align:top">${gbp(r.amount)}</td></tr>`).join('')
  return `<div style="margin:0 40px 24px;border:1px solid #cfe3bb;border-left:4px solid #7ab533;background:#f8fbf3;border-radius:6px;padding:14px 16px;page-break-inside:avoid">
    <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#3e6b12;margin-bottom:6px">Payment plan</div>
    <div style="font-size:12.5px;color:#475569;line-height:1.55;margin-bottom:10px">${esc(planIntro(plan))}</div>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0">${rows}<tr><td style="padding:9px 10px;border-top:2px solid #cbd5e1;font-weight:700;font-size:13px">Total</td><td style="padding:9px 10px;border-top:2px solid #cbd5e1;text-align:right;font-weight:700;font-size:14px">${gbp(planSum(plan.rows))}</td></tr></table>
    ${months.length > 1 ? `<div style="margin-top:10px;font-size:12.5px;color:#475569"><strong>Month by month:</strong> ${months.map(m => `${esc(m.label)} ${gbp(m.amount)}`).join(' &nbsp;·&nbsp; ')}</div>` : ''}
  </div>`
}
