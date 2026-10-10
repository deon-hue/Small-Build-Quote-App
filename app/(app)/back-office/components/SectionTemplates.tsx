'use client'

// Back Office > Job Templates (the new, linked kind): loads Phases & Tasks and the saved templates, and saves changes. The screen itself is
// components/LinkedTemplatesView.tsx; what a template stores is described in lib/quote-templates.ts.

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchPhases, fetchSubPhases, fetchTasks } from '@/lib/back-office-queries'
import { createQuoteTemplate, deleteQuoteTemplate, fetchQuoteTemplates, saveQuoteTemplate, type QuoteTemplate } from '@/lib/quote-templates'
import { JOB_TYPES } from '@/lib/utils'
import LinkedTemplatesView, { type TplPhase, type TplSubPhase } from '@/components/LinkedTemplatesView'

export default function SectionTemplates({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true)
  const [phases, setPhases] = useState<TplPhase[]>([])
  const [subPhases, setSubPhases] = useState<TplSubPhase[]>([])
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({})
  const [templates, setTemplates] = useState<QuoteTemplate[]>([])
  const [missingTable, setMissingTable] = useState(false)

  const load = useCallback(async () => {
    const sb = createClient()
    const [ph, sp, tk, tp] = await Promise.all([fetchPhases(sb, userId), fetchSubPhases(sb, userId), fetchTasks(sb, userId), fetchQuoteTemplates(sb)])
    const activePhases = ph.filter(p => p.active)
    const ok = new Set(activePhases.map(p => p.id))
    setPhases(activePhases.map(p => ({ id: p.id, name: p.name })))
    setSubPhases(sp.filter(s => s.active && ok.has(s.phase_id)).map(s => ({ id: s.id, name: s.name, phase_id: s.phase_id })))
    const counts: Record<string, number> = {}
    for (const t of tk) if (t.active && t.sub_phase_id) counts[t.sub_phase_id] = (counts[t.sub_phase_id] ?? 0) + 1
    setTaskCounts(counts)
    setTemplates(tp.templates); setMissingTable(tp.missingTable)
    setLoading(false)
  }, [userId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="card" style={{ textAlign: 'center', color: '#64748b', padding: 48 }}>Loading templates…</div>

  return (
    <LinkedTemplatesView
      phases={phases} subPhases={subPhases} taskCounts={taskCounts} templates={templates} jobTypes={JOB_TYPES} missingTable={missingTable}
      onCreate={async t => {
        const { template } = await createQuoteTemplate(createClient(), userId, t)
        if (template) setTemplates(prev => [...prev, template].sort((a, b) => a.name.localeCompare(b.name)))
        return template
      }}
      onSave={async t => {
        const err = await saveQuoteTemplate(createClient(), t)
        if (!err) setTemplates(prev => prev.map(x => x.id === t.id ? t : x).sort((a, b) => a.name.localeCompare(b.name)))
        return err
      }}
      onDelete={async id => {
        const err = await deleteQuoteTemplate(createClient(), id)
        if (!err) setTemplates(prev => prev.filter(x => x.id !== id))
        return err
      }}
    />
  )
}
