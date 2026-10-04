'use client'

// Owner area: write and manage the Help page — FAQs and video links (YouTube plays on the page; TikTok and other links open in a new tab).
// Everything goes through the owner_help_* database functions, which refuse anyone but the owner signed in with two-step verification.

import { useState } from 'react'
import { useOwnerData, ErrorNote, PageTitle, TH, TD, Badge } from '@/components/OwnerUi'
import { ownerRpc } from '@/lib/owner-api'
import { type HelpItem, parseVideoUrl } from '@/lib/help'

const ERRORS: Record<string, string> = {
  bad_kind: 'Choose FAQ or Video.',
  title_required: 'Please add a title / question.',
  answer_required: 'An FAQ needs an answer.',
  video_needs_link: 'A video needs a link.',
  bad_url: 'That link has to start with http:// or https://',
  not_found: 'That item no longer exists. Reload the page.',
}

interface Draft { id: string | null; kind: 'faq' | 'video'; category: string; title: string; body: string; url: string; sort: string; published: boolean }
const EMPTY: Draft = { id: null, kind: 'faq', category: 'Getting started', title: '', body: '', url: '', sort: '100', published: true }

export default function OwnerHelpPage() {
  const { data, error, loading, reload } = useOwnerData<HelpItem[]>('owner_help_list')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const categories = Array.from(new Set((data ?? []).map(i => i.category)))
  const set = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d))

  function edit(i: HelpItem) {
    setErr('')
    setDraft({ id: i.id, kind: i.kind, category: i.category, title: i.title, body: i.body, url: i.url || '', sort: String(i.sort_order), published: i.published })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!draft) return
    setErr(''); setBusy(true)
    try {
      const r = await ownerRpc<{ ok?: boolean; error?: string }>('owner_help_save', {
        p_id: draft.id, p_kind: draft.kind, p_category: draft.category, p_title: draft.title, p_body: draft.body,
        p_url: draft.url.trim() || null, p_sort: Number(draft.sort) || 100, p_published: draft.published,
      })
      if (!r.ok) throw new Error(ERRORS[r.error || ''] || 'Could not save')
      setDraft(null)
      reload()
    } catch (e2: unknown) { setErr(e2 instanceof Error ? e2.message : 'Could not save') } finally { setBusy(false) }
  }

  async function del(i: HelpItem) {
    if (!window.confirm(`Delete “${i.title}”? This can't be undone.`)) return
    setErr('')
    try {
      const r = await ownerRpc<{ ok?: boolean; error?: string }>('owner_help_delete', { p_id: i.id })
      if (!r.ok) throw new Error(ERRORS[r.error || ''] || 'Could not delete')
      if (draft?.id === i.id) setDraft(null)
      reload()
    } catch (e2: unknown) { setErr(e2 instanceof Error ? e2.message : 'Could not delete') }
  }

  const videoNote = draft && draft.kind === 'video' && draft.url.trim()
    ? (() => { const v = parseVideoUrl(draft.url); return !v ? 'That link isn’t a valid web address.' : v.provider === 'youtube' ? 'YouTube video — plays on the Help page.' : `${v.provider === 'tiktok' ? 'TikTok' : 'Video'} link — opens in a new tab.` })()
    : ''

  return (
    <>
      <PageTitle sub="The FAQs and videos signed-in builders see on their Help page. Changes show straight away — no release needed.">Help content</PageTitle>
      <ErrorNote message={err || error} />

      {!draft && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn btn-primary" onClick={() => { setErr(''); setDraft({ ...EMPTY }) }}>+ Add FAQ or video</button>
        </div>
      )}

      {draft && (
        <form onSubmit={save} className="card" style={{ marginBottom: 18 }}>
          <div className="card-hd">{draft.id ? 'Edit item' : 'New item'}</div>
          <div style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="fg" style={{ margin: 0, width: 150 }}>
                <label>Type</label>
                <select value={draft.kind} onChange={e => set({ kind: e.target.value as 'faq' | 'video' })}>
                  <option value="faq">FAQ</option>
                  <option value="video">Video</option>
                </select>
              </div>
              <div className="fg" style={{ margin: 0, flex: '1 1 220px' }}>
                <label>Category</label>
                <input list="help-cats" value={draft.category} onChange={e => set({ category: e.target.value })} maxLength={80} required />
                <datalist id="help-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div className="fg" style={{ margin: 0, width: 110 }}>
                <label>Order</label>
                <input type="number" value={draft.sort} onChange={e => set({ sort: e.target.value })} />
              </div>
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label>{draft.kind === 'faq' ? 'Question' : 'Video title'}</label>
              <input value={draft.title} onChange={e => set({ title: e.target.value })} maxLength={200} required />
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label>{draft.kind === 'faq' ? 'Answer' : 'Short description (optional)'}</label>
              <textarea value={draft.body} onChange={e => set({ body: e.target.value })} rows={draft.kind === 'faq' ? 7 : 3} maxLength={8000} style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label>{draft.kind === 'video' ? 'Video link (YouTube, TikTok…)' : 'Link (optional, shown as “Learn more”)'}</label>
              <input value={draft.url} onChange={e => set({ url: e.target.value })} placeholder="https://" maxLength={600} required={draft.kind === 'video'} />
              {videoNote && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{videoNote}</div>}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.published} onChange={e => set({ published: e.target.checked })} />
              Show this on the Help page (untick to keep it as a hidden draft)
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button type="button" className="btn btn-outline" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      {loading && !data && <div style={{ color: 'var(--muted)' }}>Loading…</div>}
      {data && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr><th style={TH}>Type</th><th style={TH}>Category</th><th style={TH}>Title</th><th style={TH}>Order</th><th style={TH}>Status</th><th style={TH} /></tr></thead>
            <tbody>
              {data.length === 0 && <tr><td colSpan={6} style={{ ...TD, color: 'var(--muted)' }}>Nothing yet. Add your first FAQ or video above.</td></tr>}
              {data.map(i => (
                <tr key={i.id}>
                  <td style={TD}>{i.kind === 'video' ? <Badge tone="amber">Video</Badge> : <Badge>FAQ</Badge>}</td>
                  <td style={TD}>{i.category}</td>
                  <td style={TD}>{i.title}</td>
                  <td style={TD}>{i.sort_order}</td>
                  <td style={TD}>{i.published ? <Badge tone="green">Shown</Badge> : <Badge tone="red">Hidden</Badge>}</td>
                  <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                    <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => edit(i)}>Edit</button>{' '}
                    <button className="btn btn-outline" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => del(i)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
