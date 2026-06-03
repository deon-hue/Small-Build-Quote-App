'use client'

import { useApp } from '@/contexts/AppContext'
import DocumentInbox from '@/components/DocumentInbox'

export default function DocumentsPage() {
  const { jobs, loading } = useApp()
  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>
  return (
    <div style={{ maxWidth: 900 }}>
      <DocumentInbox jobs={jobs} />
    </div>
  )
}
