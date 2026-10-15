'use client'

// The client's Selections screen: loads the client's own items for a job, shows them (components/PortalSelectionsView.tsx, shared with the builder's preview), and does the
// adding, changing and deleting through /api/portal/selections. The portal page (app/(portal)/portal/(dash)/selections/page.tsx) just hands it the client's jobs.

import { useCallback, useEffect, useMemo, useState } from 'react'
import PortalSelectionsView from '@/components/PortalSelectionsView'
import PortalSelectionForm from '@/components/PortalSelectionForm'
import { type Selection } from '@/lib/selections'

const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function PortalSelectionsScreen({ jobs, companyName }: { jobs: { id: string; title?: string; type: string; address?: string }[]; companyName?: string }) {
  const [jobId, setJobId] = useState('')
  const [items, setItems] = useState<Selection[]>([])
  const [busy, setBusy] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Selection | null>(null)
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // the first job (or the one the client picks)
  useEffect(() => { if (!jobId && jobs.length > 0) setJobId(jobs[0].id) }, [jobs, jobId])

  const load = useCallback(async () => {
    if (!jobId) { setBusy(false); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/portal/selections?jobId=${encodeURIComponent(jobId)}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'Could not load your selections.'); setItems([]); return }
      setMissing(!!d.missing)
      setItems(Array.isArray(d.items) ? d.items : [])
    } catch { setError('Could not load your selections. Check your connection and try again.') } finally { setBusy(false) }
  }, [jobId])
  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>): Promise<boolean> {
    setError('')
    const res = await fetch('/api/portal/selections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Something went wrong. Please try again.'); return false }
    return true
  }

  const jobList = jobs
  const knownRooms = useMemo(() => [...new Set(items.map(i => i.room.trim()).filter(Boolean))], [items])

  if (jobs.length === 0) return <div className="portal-notice"><h2>No projects yet</h2><p>Selections appear here once your builder has set up your project.</p></div>

  return (
    <>
      <PortalSelectionsView
        items={items} jobs={jobList} jobId={jobId} onJobChange={setJobId} loading={busy} missing={missing} error={error}
        today={todayYmd()} busyId={busyId} companyName={companyName}
        onAdd={() => setAdding(true)}
        onEdit={s => setEditing(s)}
        onSetStatus={async (s, status) => { setBusyId(s.id); if (await post({ action: 'status', id: s.id, status })) await load(); setBusyId(null) }}
        onDelete={async s => {
          if (!confirm(`Delete "${s.title}"? Its photos are deleted too.`)) return
          setBusyId(s.id); if (await post({ action: 'delete', id: s.id })) await load(); setBusyId(null)
        }}
      />
      {(adding || editing) && (
        <PortalSelectionForm
          key={editing?.id ?? 'new'} jobId={jobId} item={editing} knownRooms={knownRooms}
          onClose={() => { setAdding(false); setEditing(null); void load() }}
          onSaved={() => { setAdding(false); setEditing(null); void load() }}
        />
      )}
    </>
  )
}
