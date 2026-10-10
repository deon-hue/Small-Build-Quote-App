'use client'

// Phases & Tasks > a sub-phase: "What this covers (for the AI)". A short plain-words description the AI quote reads when it decides which sub-phase a
// piece of work belongs to. The built-in sub-phases come with a suggested wording (lib/sub-phase-hints.ts); whatever is written here wins over it.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { defaultHintFor } from '@/lib/sub-phase-hints'
import type { BOSubPhase } from '@/lib/back-office-types'

export default function SubPhaseHintBox({ sp, onSaved }: { sp: BOSubPhase; onSaved: (hint: string) => void }) {
  const suggestion = defaultHintFor(sp.canonical_id, sp.name)
  const [text, setText] = useState(sp.ai_hint ?? '')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => { setText(sp.ai_hint ?? '') }, [sp.id, sp.ai_hint])

  async function save(value: string) {
    if (value.trim() === (sp.ai_hint ?? '').trim()) return
    const { error } = await createClient().from('bo_sub_phases').update({ ai_hint: value.trim() || null }).eq('id', sp.id)
    if (error) {
      setMsg({ ok: false, text: /ai_hint|column/i.test(error.message) ? 'Needs a database update first (supabase/sub-phase-ai-hint.sql).' : 'Could not save: ' + error.message })
      return
    }
    setMsg({ ok: true, text: 'Saved' })
    onSaved(value.trim())
  }

  return (
    <div style={{ marginBottom: 10 }} onClick={e => e.stopPropagation()}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
        What this covers (for the AI)
        {msg && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500, color: msg.ok ? '#166534' : '#b91c1c' }}>{msg.text}</span>}
      </div>
      <textarea
        value={text}
        rows={2}
        onChange={e => { setText(e.target.value); setMsg(null) }}
        onBlur={() => save(text)}
        placeholder={suggestion ? 'Suggested: ' + suggestion : 'In plain words: what work belongs here, and what does not (for example "Not a new external wall").'}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', background: '#fff' }}
      />
      {!text.trim() && suggestion && (
        <button onClick={() => { setText(suggestion); save(suggestion) }} style={{ marginTop: 4, padding: '2px 10px', border: '1px solid #d1d5db', borderRadius: 5, background: '#fff', fontSize: 11.5, cursor: 'pointer', color: '#475569' }}>
          Use the suggestion
        </button>
      )}
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
        {text.trim() ? 'Your wording is what the AI reads.' : suggestion ? 'Until you write your own, the AI reads the suggestion above.' : 'Nothing written yet, so the AI only has the name and tasks to go on.'}
      </div>
    </div>
  )
}
