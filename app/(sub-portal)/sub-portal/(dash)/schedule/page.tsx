'use client'

// The subcontractor's "My schedule": the days their builder has booked them on site. The screen is components/SubScheduleView.tsx
// (shared with the builder's preview); this page just feeds it this person's own bookings.

import { useMemo } from 'react'
import { useSubPortal } from '@/contexts/SubPortalContext'
import SubScheduleView from '@/components/SubScheduleView'
import { expandSchedule } from '@/lib/task-days'

export default function SubSchedulePage() {
  const { schedule, loading, error } = useSubPortal()
  const days = useMemo(() => expandSchedule(schedule, new Date()), [schedule])

  if (loading) return (
    <div className="portal-loading">
      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
      Loading your schedule…
    </div>
  )
  if (error) return <div className="portal-section"><p className="portal-empty">Unable to load your schedule.</p></div>

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <SubScheduleView days={days} />
    </div>
  )
}
