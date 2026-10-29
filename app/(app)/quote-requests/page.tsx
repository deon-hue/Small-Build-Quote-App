'use client'

// Leads: every enquiry that has not been quoted yet, whether it came from the website quote form (these used to be the whole page, "Quote Requests") or was typed in by hand (a call, a message, someone you know).
// Each lead has a stage (New, Contacted, Site visit, Quoting, Won, Lost), where it came from, and a day to chase it; "Start a quote" hands the details to New Quote and the quote is linked back
// when it is first saved (lib/leads-db.ts). The rules are in lib/leads.ts. The data is the quote_requests table, extended by supabase/leads.sql.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { JOB_TEMPLATES } from '@/lib/utils'
import {
  LEAD_STATUSES, LEAD_STATUS_LABEL, LEAD_STATUS_BADGE, LEAD_SOURCES, LOST_REASONS,
  leadStatusOf, isOpenLead, isDueForChase, isOverdue, todayUk, addDays, chaseWords, findSamePerson, whatsappLink, leadHeadline, type LeadStatus,
} from '@/lib/leads'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'
import EnquiryFormSetup from '@/components/EnquiryFormSetup'
import './touch.css'

interface ClientFile { name: string; url: string; isImage: boolean }

interface Lead {
  id: string
  client_name: string
  client_email: string
  client_phone: string
  project_type: string
  project_address: string
  scope_text: string
  ai_phases: Phase[]
  estimated_total: number
  status: string
  admin_notes: string
  quote_id: string | null
  created_at: string
  client_files: ClientFile[]
  // added by supabase/leads.sql (missing until it has been run)
  source?: string
  chase_on?: string | null
  last_contact_at?: string | null
  lost_reason?: string
}

interface Phase {
  parentPhase: string; phase: string
  labour: number; materials: number; plant: number; subcontractors: number; other: number
  labourNotes?: string; materialsNotes?: string; plantNotes?: string; subNotes?: string; otherNotes?: string
}

type Filter = 'open' | 'chase' | LeadStatus | 'all'

const fmt = (n: number) => '£' + Math.round(n).toLocaleString('en-GB')
const phaseTotal = (ph: Phase) => (ph.labour || 0) + (ph.materials || 0) + (ph.plant || 0) + (ph.subcontractors || 0) + (ph.other || 0)
function relativeDate(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 0)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const sourceOf = (l: Lead) => l.source || 'Website form'

const label: React.CSSProperties = { display: 'block', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 5 }
const input: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff' }

/** Why a save failed, in words: the usual cause is that supabase/leads.sql has not been run on this database yet */
function failText(error: { message?: string } | null): string {
  const m = error?.message || ''
  if (/column|schema cache|policy|row-level/i.test(m)) return 'That could not be saved. If this is the first time you are using Leads, the database update (supabase/leads.sql) still needs to be run. ' + m
  return 'That could not be saved: ' + (m || 'unknown error')
}

export default function LeadsPage() {
  const sb = createClient()
  const { quotes, clients } = useApp()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Lead | null>(null)
  const [draft, setDraft] = useState({ name: '', phone: '', email: '', address: '', type: '', want: '', notes: '', source: 'Website form' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<Filter>('open')
  const [adding, setAdding] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [lostPick, setLostPick] = useState(false)
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()
  const today = todayUk()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await sb.from('quote_requests').select('*').order('created_at', { ascending: false })
    if (e) setError('The leads could not be loaded: ' + e.message)
    setLeads((data as Lead[]) ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const quoteOf = useCallback((l: Lead) => (l.quote_id ? quotes.find(q => q.id === l.quote_id) : undefined), [quotes])

  /** Saves some fields of a lead and keeps the list and the open lead in step. Says why if it could not. */
  async function patch(id: string, fields: Partial<Lead>): Promise<boolean> {
    setSaving(true); setError('')
    const { error: e } = await sb.from('quote_requests').update(fields).eq('id', id)
    setSaving(false)
    if (e) { setError(failText(e)); return false }
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...fields } : l)))
    setSelected(prev => (prev && prev.id === id ? { ...prev, ...fields } : prev))
    return true
  }

  function openLead(l: Lead) {
    setSelected(l); setLostPick(false); setError('')
    setDraft({ name: l.client_name || '', phone: l.client_phone || '', email: l.client_email || '', address: l.project_address || '', type: l.project_type || '', want: l.scope_text || '', notes: l.admin_notes || '', source: sourceOf(l) })
  }

  async function setStage(l: Lead, status: LeadStatus, lostReason = '') {
    const closed = status === 'won' || status === 'lost'
    await patch(l.id, { status, lost_reason: status === 'lost' ? lostReason : '', ...(closed ? { chase_on: null } : {}) })
    setLostPick(false)
  }
  async function setChase(l: Lead, date: string | null) { await patch(l.id, { chase_on: date }) }
  /** "Spoke to them": notes the day, moves a New lead to Contacted, and sets the next chase three days on unless one is already set for later */
  async function spoke(l: Lead) {
    const s = leadStatusOf(l.status)
    await patch(l.id, {
      last_contact_at: new Date().toISOString(),
      ...(s === 'pending' ? { status: 'contacted' } : {}),
      ...(isOpenLead(l.status) && !(l.chase_on && l.chase_on > today) ? { chase_on: addDays(today, 3) } : {}),
    })
  }
  async function saveDetails(l: Lead) {
    if (!draft.name.trim()) { setError('A lead needs a name.'); return }
    await patch(l.id, {
      client_name: draft.name.trim(), client_phone: draft.phone.trim(), client_email: draft.email.trim().toLowerCase(), project_address: draft.address.trim(),
      project_type: draft.type.trim(), scope_text: draft.want, admin_notes: draft.notes, source: draft.source,
    })
  }
  async function deleteLead(id: string) {
    if (!confirm('Delete this lead? This cannot be undone.')) return
    const { error: e } = await sb.from('quote_requests').delete().eq('id', id)
    if (e) { setError(failText(e)); return }
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelected(null)
  }

  /** Hands the lead to New Quote. One that already has the website's AI estimate carries its phases and files (as it always did); any other starts the quote from scratch with the customer filled in. */
  function startQuote(l: Lead) {
    const hasAi = (l.ai_phases?.length ?? 0) > 0
    if (hasAi) {
      if (l.client_files?.length) sessionStorage.setItem('sbc_quote_request_files', JSON.stringify(l.client_files))
      sessionStorage.setItem('sbc_quote_request_scope', l.scope_text || '')
      sessionStorage.setItem('sbc_quote_request_phases', JSON.stringify(l.ai_phases))
    } else if (l.client_files?.length) {
      sessionStorage.setItem('sbc_quote_request_files', JSON.stringify(l.client_files))
    }
    const p = new URLSearchParams({
      lead: l.id,
      clientName: draft.name || l.client_name || '', email: draft.email || l.client_email || '', phone: draft.phone || l.client_phone || '',
      address: draft.address || l.project_address || '', jobType: draft.type || l.project_type || '',
      ...(hasAi ? {} : { manual: '1' }),
    })
    window.location.href = `/new-quote?${p.toString()}`
  }

  // ── The list: what is shown and in what order ──
  const counts = useMemo(() => {
    const c: Record<string, number> = { open: 0, chase: 0, all: leads.length }
    for (const s of LEAD_STATUSES) c[s] = 0
    for (const l of leads) { c[leadStatusOf(l.status)]++; if (isOpenLead(l.status)) c.open++; if (isDueForChase(l, today)) c.chase++ }
    return c
  }, [leads, today])

  const shown = useMemo(() => {
    const pass = (l: Lead) => filter === 'all' ? true : filter === 'open' ? isOpenLead(l.status) : filter === 'chase' ? isDueForChase(l, today) : leadStatusOf(l.status) === filter
    // due for a chase first (the oldest first), then New ones, then ones with a chase date coming, then the rest, newest first within each
    const rank = (l: Lead) => (isDueForChase(l, today) ? 0 : leadStatusOf(l.status) === 'pending' ? 1 : isOpenLead(l.status) && l.chase_on ? 2 : 3)
    return leads.filter(pass).sort((a, b) => rank(a) - rank(b) || (rank(a) <= 2 && a.chase_on && b.chase_on ? a.chase_on.localeCompare(b.chase_on) : 0) || b.created_at.localeCompare(a.created_at))
  }, [leads, filter, today])

  const chips: { id: Filter; text: string }[] = [
    { id: 'open', text: `Open (${counts.open})` }, { id: 'chase', text: `To chase (${counts.chase})` },
    ...LEAD_STATUSES.map(s => ({ id: s as Filter, text: `${LEAD_STATUS_LABEL[s]} (${counts[s]})` })), { id: 'all', text: `All (${counts.all})` },
  ]

  const groupedPhases: Record<string, Phase[]> = {}
  if (selected?.ai_phases) for (const ph of selected.ai_phases) (groupedPhases[ph.parentPhase || 'Other'] ??= []).push(ph)
  const selStatus = selected ? leadStatusOf(selected.status) : 'pending'
  const selQuote = selected ? quoteOf(selected) : undefined
  const quoteApproved = !!selQuote && (selQuote.status === 'approved' || selQuote.status === 'accepted')

  return (
    <div className="qr-page" style={{ padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Touch header (phone/tablet only) */}
      <div className="tp-head">
        <div>
          <div className="tp-kicker">Enquiries{counts.pending > 0 ? ` · ${counts.pending} new` : ''}{counts.chase > 0 ? ` · ${counts.chase} to chase` : ''}</div>
          <h1 className="tp-title">Leads</h1>
        </div>
        <button className="tp-btn" onClick={() => setAdding(true)}>+ Add a lead</button>
      </div>
      <div className="tp-chips">
        {chips.map(c => <button key={c.id} className={`tp-chip${filter === c.id ? ' on' : ''}`} onClick={() => setFilter(c.id)}>{c.text}</button>)}
      </div>

      {/* Header */}
      <div className="tp-hide" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <div className="serif" style={{ fontSize: 22 }}>Leads</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Enquiries that have not been quoted yet, from your website and from people who contact you directly</div>
        </div>
        {counts.pending > 0 && <span style={{ background: '#e67e22', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{counts.pending} new</span>}
        {counts.chase > 0 && <span style={{ background: '#c0392b', color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{counts.chase} to chase</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-outline" style={{ fontSize: 13 }} onClick={() => setSetupOpen(true)} title="Your link, QR code and embed code for the enquiry form">📣 Enquiry form</button>
          <a href="/get-quote" target="_blank" style={{ fontSize: 12, color: 'var(--moss)', textDecoration: 'none', border: '1px solid var(--moss)', borderRadius: 5, padding: '5px 12px' }}>↗ View client page</a>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setAdding(true)}>＋ Add a lead</button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tp-hide" style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {chips.map(c => (
          <button key={c.id} onClick={() => setFilter(c.id)} style={{
            padding: '5px 14px', borderRadius: 20, border: '1px solid var(--border)', background: filter === c.id ? 'var(--ink)' : '#fff',
            color: filter === c.id ? '#fff' : 'var(--muted)', fontSize: 12, fontWeight: filter === c.id ? 700 : 400, cursor: 'pointer',
          }}>{c.text}</button>
        ))}
      </div>

      {error && !selected && !adding && <div style={{ background: '#fdecea', border: '1px solid #f5c6c0', color: '#a93226', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📬</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{leads.length === 0 ? 'No leads yet' : filter === 'chase' ? 'Nobody to chase today' : 'Nothing here'}</div>
          <div style={{ fontSize: 13 }}>
            {leads.length === 0
              ? <>Press <strong>Add a lead</strong> when someone gets in touch, or share your <a href="/get-quote" target="_blank" style={{ color: 'var(--moss)' }}>client quote page</a> to receive enquiries from the website.</>
              : 'Try another filter above.'}
          </div>
        </div>
      ) : (
        <div className="qr-list" style={{ background: '#fff', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
          {shown.map((l, i) => {
            const st = leadStatusOf(l.status)
            const isNew = st === 'pending'
            const due = isDueForChase(l, today)
            const q = quoteOf(l)
            return (
              <div key={l.id} className={`qr-row${isNew ? ' new' : ''}`} onClick={() => openLead(l)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < shown.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', background: isNew ? '#fffbf0' : '#fff', transition: 'background 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f8faf8')}
                onMouseLeave={e => (e.currentTarget.style.background = isNew ? '#fffbf0' : '#fff')}>
                {isNew && <div className="qr-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#e67e22', flexShrink: 0 }} />}
                <div className="qr-main" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {l.client_name}
                    <span style={{ fontWeight: 500, fontSize: 11, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 8px', marginLeft: 8 }}>{sourceOf(l)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leadHeadline(l)}</div>
                </div>
                <div className="qr-email" style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{l.client_phone || l.client_email}</div>
                <div className="qr-chase" style={{ fontSize: 12, minWidth: 130, textAlign: 'right', whiteSpace: 'nowrap', color: isOverdue(l, today) ? '#c0392b' : due ? '#c0762a' : 'var(--muted)', fontWeight: due ? 700 : 400 }}>
                  {q ? `${q.ref} · ${q.status}` : isOpenLead(l.status) && l.chase_on ? `${isOverdue(l, today) ? 'Overdue: ' : 'Chase '}${chaseWords(l.chase_on, today)}` : ''}
                </div>
                <span className={`badge qr-badge ${LEAD_STATUS_BADGE[st]}`} style={{ minWidth: 72, textAlign: 'center' }}>{LEAD_STATUS_LABEL[st]}</span>
                <div className="qr-date" style={{ fontSize: 11, color: 'var(--muted)', minWidth: 52, textAlign: 'right' }}>{relativeDate(l.created_at)}</div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Add a lead ───────────────────────────────────────────────── */}
      {setupOpen && <EnquiryFormSetup onClose={() => setSetupOpen(false)} />}

      {adding && (
        <AddLeadModal
          leads={leads} clients={clients} today={today}
          onClose={() => setAdding(false)}
          onSaved={l => { setLeads(prev => [l, ...prev]); setAdding(false); setFilter('open'); openLead(l) }}
          onOpenExisting={l => { setAdding(false); setFilter('all'); openLead(l) }}
        />
      )}

      {/* ── Lead modal ───────────────────────────────────────────────── */}
      {selected && (
        <div className="modal-overlay" onClick={e => onOverlayClick(e, () => setSelected(null))}>
          <div ref={boxRef} style={{ background: 'var(--cream)', borderRadius: 10, width: 'min(820px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', position: 'relative', ...draggableStyle }}>
            <div className="form-modal-hd" onMouseDown={onHeaderMouseDown}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{selected.client_name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{leadHeadline(selected) || 'No details yet'} · added {shortDate(selected.created_at)}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${LEAD_STATUS_BADGE[selStatus]}`}>{LEAD_STATUS_LABEL[selStatus]}</span>
                <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
                <button className="modal-close" onClick={() => setSelected(null)}>×</button>
              </div>
            </div>

            <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1 }}>
              {error && <div style={{ background: '#fdecea', border: '1px solid #f5c6c0', color: '#a93226', borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 14 }}>{error}</div>}

              {/* Stage */}
              <div style={{ marginBottom: 16 }}>
                <span style={label}>Stage</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {LEAD_STATUSES.map(s => (
                    <button key={s} disabled={saving} onClick={() => (s === 'lost' ? setLostPick(true) : setStage(selected, s))} style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)',
                      background: selStatus === s ? 'var(--ink)' : '#fff', color: selStatus === s ? '#fff' : 'var(--ink)', fontWeight: selStatus === s ? 700 : 500,
                    }}>{LEAD_STATUS_LABEL[s]}</button>
                  ))}
                </div>
                {lostPick && (
                  <div style={{ marginTop: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <span style={label}>Why was it lost?</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {LOST_REASONS.map(r => <button key={r} className="btn-sm btn-outline" disabled={saving} onClick={() => setStage(selected, 'lost', r)} style={{ fontSize: 12 }}>{r}</button>)}
                      <button className="btn-sm btn-outline" onClick={() => setLostPick(false)} style={{ fontSize: 12, color: 'var(--muted)' }}>Cancel</button>
                    </div>
                  </div>
                )}
                {selStatus === 'lost' && selected.lost_reason && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>Lost: {selected.lost_reason}</div>}
                {selQuote && (
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    Quote <strong>{selQuote.ref}</strong> ({selQuote.status}) · <a href="/quotes" style={{ color: 'var(--moss)' }}>open Saved Quotes</a>
                    {quoteApproved && selStatus !== 'won' && <button className="btn-sm btn-outline" style={{ marginLeft: 10, fontSize: 12 }} disabled={saving} onClick={() => setStage(selected, 'won')}>The quote is approved: mark this lead Won</button>}
                  </div>
                )}
              </div>

              {/* Chase */}
              {isOpenLead(selected.status) && (
                <div style={{ marginBottom: 18, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <span style={label}>Chase on</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="date" value={selected.chase_on || ''} onChange={e => setChase(selected, e.target.value || null)} style={{ ...input, width: 160 }} />
                    {([['Today', 0], ['Tomorrow', 1], ['3 days', 3], ['1 week', 7]] as const).map(([t, d]) => (
                      <button key={t} className="btn-sm btn-outline" style={{ fontSize: 12 }} disabled={saving} onClick={() => setChase(selected, addDays(today, d))}>{t}</button>
                    ))}
                    {selected.chase_on && <button className="btn-sm btn-outline" style={{ fontSize: 12, color: 'var(--muted)' }} disabled={saving} onClick={() => setChase(selected, null)}>Clear</button>}
                    <div style={{ flex: 1 }} />
                    <button className="btn-sm btn-primary" style={{ fontSize: 12 }} disabled={saving} onClick={() => spoke(selected)} title="Notes that you have just been in touch, and sets the next chase for three days' time">✓ I've spoken to them</button>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    {selected.chase_on ? `Chase ${chaseWords(selected.chase_on, today)}.` : 'No chase date set.'} {selected.last_contact_at ? `Last spoke to them ${shortDate(selected.last_contact_at)}.` : ''}
                  </div>
                </div>
              )}

              {/* Details */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><span style={label}>Name</span><input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={input} /></div>
                <div>
                  <span style={label}>Phone</span>
                  <input value={draft.phone} onChange={e => setDraft({ ...draft, phone: e.target.value })} style={input} />
                  {draft.phone.trim() && (
                    <div style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 10 }}>
                      <a href={`tel:${draft.phone.replace(/\s+/g, '')}`} style={{ color: 'var(--moss)' }}>📞 Call</a>
                      {whatsappLink(draft.phone) && <a href={whatsappLink(draft.phone)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--moss)' }}>💬 WhatsApp</a>}
                    </div>
                  )}
                </div>
                <div>
                  <span style={label}>Email</span>
                  <input value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} style={input} />
                  {draft.email.trim() && <div style={{ fontSize: 12, marginTop: 4 }}><a href={`mailto:${draft.email.trim()}`} style={{ color: 'var(--moss)' }}>✉ Email them</a></div>}
                </div>
                <div style={{ gridColumn: '1 / span 2' }}><span style={label}>Property address</span><input value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} style={input} /></div>
                <div><span style={label}>Kind of job</span><input list="lead-job-types" value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value })} style={input} /></div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <span style={label}>Where it came from</span>
                <select value={draft.source} onChange={e => setDraft({ ...draft, source: e.target.value })} style={{ ...input, width: 220 }}>
                  {Array.from(new Set([...LEAD_SOURCES, draft.source])).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <datalist id="lead-job-types">{Object.keys(JOB_TEMPLATES).map(t => <option key={t} value={t} />)}</datalist>

              <div style={{ marginBottom: 16 }}>
                <span style={label}>What they want</span>
                <textarea value={draft.want} onChange={e => setDraft({ ...draft, want: e.target.value })} rows={selected.ai_phases?.length ? 6 : 3} placeholder="A few words about the job" style={{ ...input, resize: 'vertical', lineHeight: 1.55 }} />
              </div>

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
                    <span>Total (ex-VAT)</span><span style={{ color: '#2b5a2b' }}>{fmt(selected.estimated_total)}</span>
                  </div>
                </div>
              )}

              {/* Client files */}
              {selected.client_files?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--muted)', marginBottom: 8 }}>Client Plans &amp; Photos ({selected.client_files.length})</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {selected.client_files.map((f, i) => (
                      f.isImage ? (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name} style={{ display: 'block', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                          <img src={f.url} alt={f.name} style={{ width: 90, height: 90, objectFit: 'cover', display: 'block' }} />
                        </a>
                      ) : (
                        <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 90, height: 90, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--warm)', gap: 4, textDecoration: 'none', color: 'var(--ink)', flexShrink: 0 }}>
                          <span style={{ fontSize: 24 }}>📄</span>
                          <span style={{ fontSize: 9, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80, whiteSpace: 'nowrap', color: 'var(--muted)' }}>{f.name}</span>
                        </a>
                      )
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: 8 }}>
                <span style={label}>Your notes</span>
                <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} placeholder="What was said, what to remember…" rows={3} style={{ ...input, resize: 'vertical' }} />
                <button onClick={() => saveDetails(selected)} disabled={saving} style={{ marginTop: 8, padding: '6px 16px', fontSize: 12, fontWeight: 700, background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Save changes'}</button>
              </div>
            </div>

            <div className="form-modal-ft" style={{ flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => startQuote(selected)}>
                {selected.ai_phases?.length ? '📋 Create quote from AI estimate' : selected.quote_id ? '📋 Start another quote' : '📋 Start a quote'}
              </button>
              <div style={{ flex: 1 }} />
              <button className="btn-sm btn-danger" style={{ fontSize: 12 }} onClick={() => deleteLead(selected.id)}>Delete</button>
            </div>
            {!isMaximized && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Add a lead by hand ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

function AddLeadModal({ leads, clients, today, onClose, onSaved, onOpenExisting }: {
  leads: Lead[]
  clients: { name: string; email?: string; phone?: string; clientType?: string }[]
  today: string
  onClose: () => void
  onSaved: (l: Lead) => void
  onOpenExisting: (l: Lead) => void
}) {
  const sb = createClient()
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', type: '', want: '', source: 'My contacts' })
  const [chase, setChase] = useState<string | null>(addDays(today, 1))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // is this person already here, as a lead or as a contact?
  const sameLead = findSamePerson({ email: f.email, phone: f.phone }, leads.map(l => ({ ...l, email: l.client_email, phone: l.client_phone })))
  const sameContact = findSamePerson({ email: f.email, phone: f.phone }, clients.filter(c => (c.clientType ?? 'client') === 'client'))

  async function save() {
    if (!f.name.trim()) { setErr('Please give a name.'); return }
    if (!f.phone.trim() && !f.email.trim()) { setErr('Add a phone number or an email address, so you can get back to them.'); return }
    setBusy(true); setErr('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setErr('You are not signed in: please refresh and try again.'); setBusy(false); return }
    const { data, error } = await sb.from('quote_requests').insert({
      user_id: user.id, client_name: f.name.trim(), client_phone: f.phone.trim(), client_email: f.email.trim().toLowerCase(), project_address: f.address.trim(),
      project_type: f.type.trim(), scope_text: f.want.trim(), source: f.source, status: 'pending', chase_on: chase,
    }).select('*').single()
    setBusy(false)
    if (error || !data) { setErr(failText(error)); return }
    onSaved(data as Lead)
  }

  return (
    <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
      <div ref={boxRef} style={{ background: 'var(--cream)', borderRadius: 10, width: 'min(560px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.25)', position: 'relative', ...draggableStyle }}>
        <div className="form-modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Add a lead</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Someone has been in touch and nothing is quoted yet</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>
        <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1, display: 'grid', gap: 12 }}>
          {err && <div style={{ background: '#fdecea', border: '1px solid #f5c6c0', color: '#a93226', borderRadius: 6, padding: '8px 12px', fontSize: 13 }}>{err}</div>}
          <div><span style={label}>Name *</span><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} style={input} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><span style={label}>Phone</span><input inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} style={input} /></div>
            <div><span style={label}>Email</span><input inputMode="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={input} /></div>
          </div>
          {(sameLead || sameContact) && (
            <div style={{ background: '#fffbf0', border: '1px solid #f0d9a0', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, color: '#7a5a10', lineHeight: 1.5 }}>
              {sameLead && <div>⚠ <strong>{sameLead.client_name}</strong> is already a lead ({LEAD_STATUS_LABEL[leadStatusOf(sameLead.status)]}, from {sameLead.source || 'Website form'}). <button className="btn-sm btn-outline" style={{ fontSize: 12, marginLeft: 6 }} onClick={() => onOpenExisting(sameLead)}>Open that lead</button></div>}
              {!sameLead && sameContact && <div>⚠ <strong>{sameContact.name}</strong> is already one of your contacts with this number or email.</div>}
              <div style={{ color: '#9a7a30' }}>You can still add it.</div>
            </div>
          )}
          <div><span style={label}>What they want</span><textarea value={f.want} onChange={e => setF({ ...f, want: e.target.value })} rows={3} placeholder="A few words about the job" style={{ ...input, resize: 'vertical' }} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <div><span style={label}>Property address</span><input value={f.address} onChange={e => setF({ ...f, address: e.target.value })} style={input} /></div>
            <div><span style={label}>Kind of job</span><input list="lead-job-types-add" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} style={input} /></div>
          </div>
          <datalist id="lead-job-types-add">{Object.keys(JOB_TEMPLATES).map(t => <option key={t} value={t} />)}</datalist>
          <div>
            <span style={label}>Where did it come from?</span>
            <select value={f.source} onChange={e => setF({ ...f, source: e.target.value })} style={input}>{LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <div>
            <span style={label}>Chase on</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={chase || ''} onChange={e => setChase(e.target.value || null)} style={{ ...input, width: 160 }} />
              {([['Today', 0], ['Tomorrow', 1], ['3 days', 3], ['1 week', 7]] as const).map(([t, d]) => <button key={t} type="button" className="btn-sm btn-outline" style={{ fontSize: 12 }} onClick={() => setChase(addDays(today, d))}>{t}</button>)}
              <button type="button" className="btn-sm btn-outline" style={{ fontSize: 12, color: 'var(--muted)' }} onClick={() => setChase(null)}>None</button>
            </div>
          </div>
        </div>
        <div className="form-modal-ft" style={{ gap: 8 }}>
          <div style={{ flex: 1 }} />
          <button className="btn-sm btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Add lead'}</button>
        </div>
        {!isMaximized && <ModalResizeHandle onMouseDown={onResizeMouseDown} />}
      </div>
    </div>
  )
}
