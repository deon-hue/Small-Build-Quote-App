'use client'

// The client's Selections tab. The screen lives in components/PortalSelectionsScreen.tsx (which shows components/PortalSelectionsView.tsx, shared with the builder's
// "preview what the client sees" page); this page hands it the client's own jobs.

import { usePortal } from '@/contexts/PortalContext'
import PortalSelectionsScreen from '@/components/PortalSelectionsScreen'

export default function PortalSelectionsPage() {
  const { jobs, settings, loading } = usePortal()
  if (loading) return <div className="portal-loading"><div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>Loading…</div>
  return <PortalSelectionsScreen jobs={jobs.map(j => ({ id: j.id, title: j.title, type: j.type, address: j.address }))} companyName={settings.name || undefined} />
}
