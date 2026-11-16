'use client'

// The client's "Payment plan" tab: the payment plan of each of their quotes that has one. The screen is components/PortalPaymentPlansView.tsx, shared with the
// builder's preview page.

import { usePortal } from '@/contexts/PortalContext'
import PortalPaymentPlansView from '@/components/PortalPaymentPlansView'

export default function PortalPaymentPlanPage() {
  const { quotes } = usePortal()
  return <PortalPaymentPlansView quotes={quotes.map(q => ({ id: q.id, ref: q.ref, status: q.status, jobType: q.jobType, title: q.title, paymentPlan: q.paymentPlan }))} />
}
