'use client'

// The subcontractor's Calendar: their own booked days plus (unless the builder has switched it off for them) the company's other jobs in grey.
// The screen is components/SubCalendarView.tsx (shared with the builder's preview); this page just feeds it this person's data.

import { useSubPortal } from '@/contexts/SubPortalContext'
import SubCalendarView from '@/components/SubCalendarView'

export default function SubCalendarPage() {
  const { schedule, companyCalendar, companyCalendarStatus, loading, error } = useSubPortal()

  if (loading) return (
    <div className="portal-loading">
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      Loading your calendar…
    </div>
  )
  if (error) return <div className="portal-section"><p className="portal-empty">Unable to load your calendar.</p></div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <SubCalendarView schedule={schedule} companyRows={companyCalendar} companyProblem={companyCalendarStatus === 'problem'} />
    </div>
  )
}
