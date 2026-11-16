'use client'

// The client's "Payment plan" tab: the payment plan of each quote that has one, with the quote's reference and what it is for. Used by the real portal page and
// by the builder's preview of it (the same screen, so the preview can never drift from what the client sees). A plan is only here when the builder has switched
// it on for the client (the portal reads quotes through visiblePlan).

import PaymentPlanView from './PaymentPlanView'
import type { PaymentPlan } from '@/lib/payment-plan'

export interface PortalPlanQuote { id: string; ref: string; status: string; jobType: string; title?: string; paymentPlan?: PaymentPlan | null }

const STATUS_NOTE: Record<string, string> = {
  sent: 'This plan goes with the quote you have been sent. It applies if you accept the quote.',
  accepted: 'You have accepted this quote, so this is how the payments are planned.',
  approved: 'You have accepted this quote, so this is how the payments are planned.',
  declined: 'This quote was declined.', rejected: 'This quote was declined.',
}

export default function PortalPaymentPlansView({ quotes }: { quotes: PortalPlanQuote[] }) {
  const withPlan = quotes.filter(q => q.paymentPlan && q.paymentPlan.rows.length > 0)
  return (
    <div>
      <div className="portal-page-hd">
        <h1>Payment plan</h1>
        <p>{withPlan.length === 0 ? 'No payment plan has been set up yet.' : 'When each payment falls due, so you can plan your cash flow.'}</p>
      </div>
      {withPlan.map(q => (
        <div key={q.id} className="card" style={{ marginBottom: 20 }}>
          <div className="card-hd" style={{ flexWrap: 'wrap', gap: 6 }}>
            <span>{q.ref} · {q.title || q.jobType}</span>
          </div>
          <div style={{ padding: '4px 20px 18px' }}>
            {STATUS_NOTE[q.status] && <div style={{ fontSize: 12.5, color: 'var(--muted, #5b6570)', marginTop: 12 }}>{STATUS_NOTE[q.status]}</div>}
            <PaymentPlanView plan={q.paymentPlan as PaymentPlan} heading="Your payments" />
          </div>
        </div>
      ))}
    </div>
  )
}
