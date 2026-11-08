'use client'

// The client's "Sent to you" tab: what the company has sent them (designs, drawings, photographs, a scope), kept in the app and shown here. The screen is components/PortalSentView.tsx (shared with the
// builder's "preview what the client sees" page); this page fetches the client's own records from app/api/portal/sent-items.

import { useEffect, useState } from 'react'
import { usePortal } from '@/contexts/PortalContext'
import PortalSentView from '@/components/PortalSentView'
import type { PortalSentItem } from '@/lib/sent-items'

export default function PortalSentPage() {
  const { settings } = usePortal()
  const [items, setItems] = useState<PortalSentItem[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    fetch('/api/portal/sent-items')
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(d => { if (live) setItems(Array.isArray(d.items) ? d.items : []) })
      .catch(() => { if (live) setItems([]) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])
  return <PortalSentView items={items} loading={loading} companyName={settings.name || undefined} />
}
