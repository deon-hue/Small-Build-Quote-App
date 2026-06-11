'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ClientFile { name: string; url: string; isImage: boolean }

interface QuoteRequest {
  id: string
  client_name: string
  client_email: string
  client_phone: string
  project_type: string
  project_address: string
  scope_text: string
  ai_phases: Phase[]
  estimated_total: number
  status: 'pending' | 'reviewing' | 'accepted' | 'declined'
  admin_notes: string
  quote_id: string | null
  created_at: string
  client_files: ClientFile[]
}

interface Phase {
  parentPhase: string; phase: string
  labour: number; materials: number; plant: number; subcontractors: number; other: number
  labourNotes?: string; materialsNotes?: string; plantNotes?: string; subNotes?: string; otherNotes?: string
}

const STATUS_BADGE: Record<string, string> = {
  pending:   'b-pending',
  reviewing: 'b-progress',
  accepted:  'b-active',
  declined:  'b-declined',
}
const STATUS_LABEL: Record<string, string> = {
  pending:   'Pending',
  reviewing: 'Reviewing',
  accepted:  'Accepted',
  declined:  'Declined',
}

function fmt(n: number) {
  return '£' + Math.round(n).toLocaleString('en-GB')
}
function phaseTotal(ph: Phase) {
  return (ph.labour || 0) + (ph.materials || 0) + (ph.plant || 0) + (ph.subcontractors || 0) + (ph.other || 0)
}
function relativeDate(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function QuoteRequestsPage() {
  const sb = createClient()
  const [requests, setRequests] = useState<QuoteRequest[]>([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<QuoteRequest | null>(null)
  const [notes, setNotes]       = useState('')
  const [saving, setSaving]     = useState(false)
  const [filter, setFilter]     = useState<'all' | 'pending' | 'reviewing' | 'accepted' | 'declined'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await sb.from('quote_requests').select('*').order('created_at', { ascending: false })
    setRequests((data as QuoteRequest[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: QuoteRequest['status']) {
    setSaving(true)
    await sb.from('quote_requests').update({ status }).eq('id', id)
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, status } : null)
    setSaving(false)
  }

  async function saveNotes(id: string) {
    setSaving(true)
    await sb.from('quote_requests').update({ admin_notes: notes }).eq('id', id)
    setRequests(prev => prev.map(r => r.id === id ? { ...r, admin_notes: notes } : r))
    setSaving(false)
  }

  async function deleteRequest(id: string) {
    if (!confirm('Delete this quote request? This cannot be undone.')) return
    await sb.from('quote_requests').delete().eq('id', id)
    setRequests(prev => prev.filter(r => r.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  function openRequest(r: QuoteRequest) {
    setSelected(r)
    setNotes(r.admin_notes || '')
    if (r.status === 'pending') updateStatus(r.id, 'reviewing')
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)
  const pendingCount = requests.filter(r => r.status === 'pending').length

  // Group AI phases by parentPhase for the modal
  const groupedPhases: Record<string, Phase[]> = {}
  if (selected?.ai_phases) {
    for (const ph of selected.ai_phases) {
      const key = ph.parentPhase || 'Other'
      if (!groupedPhases[key]) groupedPhases[key] = []
      groupedPhases[key].push(ph)
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="serif" style={{ fontSize: 22 }}>Quote Requests</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            Client-submitted AI estimates awaiting review
          </div>
        </div>
        {pendingCount > 0 && (
          <span style={{ background: '#e67e22', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
            {pendingCount} new
          </span>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <a
            href="/get-quote"
            target="_blank"
            style={{ fontSize: 12, color: 'var(--moss)', textDecoration: 'none', border: '1px solid var(--moss)', borderRadius: 5, padding: '5px 12px' }}
          >
            ↗ View client page
          </a>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['all', 'pending', 'reviewing', 'accepted', 'declined'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)',
            background: filter === f ? 'var(--ink)' : '#fff',
            color: filter === f ? '#fff' : 'var(--muted)',
            fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: 'pointer',
          }}>
            {f === 'all' ? `All (${requests.length})` : `${STATUS_LABEL[f]} (${requests.filter(r => r.status === f).length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No quote requests yet</div>
          <div style={{ fontSize: 13 }}>
            Share your{' '}
            <a href="/get-quote" target="_blank" style={{ color: 'var(--moss)' }}>
              client quote page
            </a>{' '}
            to start receiving requests.
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {filtered.map((r, i) => (
            <div
              key={r.id}
              onClick={() => openRequest(r)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px',
                borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer', background: r.status === 'pending' ? '#fffbf0' : '#fff',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f8faf8')}
              onMouseLeave={e => (e.currentTarget.style.background = r.status === 'pending' ? '#fffbf0' : '#fff')}
            >
              {r.status === 'pending' && (
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e67e22', flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.client_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.project_type} · {r.project_address}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.client_email}</div>
              <div style={{ fontWeight: 700, fontSize: 15, minWidth: 90, textAlign: 'right', color: '#2b5a2b' }}>
                {fmt(r.estimated_total)}
              </div>
              <span className={`badge ${STATUS_BADGE[r.status] || 'b-pending'}`} style={{ minWidth: 72, textAlign: 'center' }}>
                {STATUS_LABEL[r.status]}
              </span>
              <div style={{ fontSize: 11, color: 'var(--muted)', minWidth: 52, textAlign: 'right' }}>
                {relativeDate(r.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Review modal ─────────────────────────────────────────────── */}
      {selected && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div style={{ background: 'var(--cream)', borderRadius: 10, width: 'min(820px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
            <div className="form-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{selected.client_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {selected.project_type} · {selected.project_address}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${STATUS_BADGE[selected.status]}`}>{STATUS_LABEL[selected.status]}</span>
                <button className="modal-close" onClick={() => setSelected(null)}>×</button>
              </div>
            </div>

            <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1 }}>
              {/* Client details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Email', value: selected.client_email },
                  { label: 'Phone', value: selected.client_phone || '—' },
                  { label: 'Submitted', value: new Date(selected.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
                ].map(item => (
                  <div key={item.label} style={{ background: 'var(--warm)', borderRadius: 6, padding: '10px 12px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Scope */}
              {selected.scope_text && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Scope of Works</div>
                  <div style={{ background: 'var(--warm)', borderRadius: 6, padding: '12px 14px', fontSize: 13, lineHeight: 1.65, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                    {selected.scope_text}
                  </div>
                </div>
              )}

              {/* AI estimate */}
              {selected.ai_phases?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>AI-Generated Estimate</div>
                  {Object.entries(groupedPhases).map(([parent, phs]) => (
                    <div key={parent} style={{ marginBottom: 14 }}>
                      <div style={{ fontWeight: 700, fontSize: 11, color: '#3a7a3a', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>{parent}</div>
                      {phs.map((ph, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                          <span>{ph.phase}</span>
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            {ph.labour > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>L: {fmt(ph.labour)}</span>}
                            {ph.materials > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>M: {fmt(ph.materials)}</span>}
                            {ph.plant > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>P: {fmt(ph.plant)}</span>}
                            {ph.subcontractors > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>S: {fmt(ph.subcontractors)}</span>}
                            <span style={{ fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{fmt(phaseTotal(ph))}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '2px solid var(--ink)', fontWeight: 700, fontSize: 15 }}>
                    <span>Total (ex-VAT)</span>
                    <span style={{ color: '#2b5a2b' }}>{fmt(selected.estimated_total)}</span>
                  </div>
                </div>
              )}

              {/* Client files */}
              {selected.client_files?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>
                    Client Plans &amp; Photos ({selected.client_files.length})
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {selected.client_files.map((f, i) => (
                      f.isImage ? (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name}
                          style={{ display: 'block', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                          <img src={f.url} alt={f.name}
                            style={{ width: 90, height: 90, objectFit: 'cover', display: 'block' }} />
                        </a>
                      ) : (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 90, height: 90, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--warm)', gap: 4, textDecoration: 'none', color: 'var(--ink)', flexShrink: 0 }}>
                          <span style={{ fontSize: 24 }}>📄</span>
                          <span style={{ fontSize: 9, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{f.name}</span>
                        </a>
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* Admin notes */}
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 6 }}>
                  Your Notes
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about this request…"
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
                <button
                  onClick={() => saveNotes(selected.id)}
                  disabled={saving}
                  style={{ marginTop: 6, padding: '5px 14px', fontSize: 12, background: 'var(--warm)', border: '1px solid var(--border)', borderRadius: 5, cursor: 'pointer' }}
                >
                  {saving ? 'Saving…' : 'Save notes'}
                </button>
              </div>
            </div>

            <div className="form-modal-ft" style={{ flexWrap: 'wrap', gap: 8 }}>
              {/* Status actions */}
              {selected.status !== 'accepted' && (
                <button
                  className="btn btn-outline"
                  style={{ fontSize: 13 }}
                  onClick={() => updateStatus(selected.id, 'accepted')}
                  disabled={saving}
                >
                  ✓ Accept
                </button>
              )}
              {selected.status !== 'declined' && (
                <button
                  className="btn-sm btn-outline"
                  style={{ fontSize: 13, color: '#c0392b', borderColor: '#f5a0a0' }}
                  onClick={() => updateStatus(selected.id, 'declined')}
                  disabled={saving}
                >
                  Decline
                </button>
              )}
              {/* Open in quote builder — store client files in sessionStorage first */}
              <button
                className="btn"
                style={{ fontSize: 13 }}
                onClick={() => {
                  if (selected.client_files?.length) {
                    sessionStorage.setItem('sbc_quote_request_files', JSON.stringify(selected.client_files))
                  }
                  sessionStorage.setItem('sbc_quote_request_scope', selected.scope_text || '')
                  const p = new URLSearchParams({
                    clientName: selected.client_name || '',
                    email:      selected.client_email || '',
                    phone:      selected.client_phone || '',
                    address:    selected.project_address || '',
                    jobType:    selected.project_type || '',
                  })
                  window.location.href = `/new-quote?${p.toString()}`
                }}
              >
                ✎ Open in Quote Builder
              </button>
              <div style={{ flex: 1 }} />
              <button
                className="btn-sm btn-danger"
                style={{ fontSize: 12 }}
                onClick={() => deleteRequest(selected.id)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
