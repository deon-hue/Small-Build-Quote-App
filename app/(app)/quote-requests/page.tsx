'use client'

// Leads: every enquiry that has not been quoted yet, whether it came from the website quote form (these used to be the whole page, "Quote Requests") or was typed in by hand (a call, a message, someone you know).
// Each lead has a stage (New, Contacted, Site visit, Quoting, Won, Lost), where it came from, and a day to chase it; "Start a quote" hands the details to New Quote and the quote is linked back
// when it is first saved (lib/leads-db.ts). The rules are in lib/leads.ts. The data is the quote_requests table, extended by supabase/leads.sql.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/contexts/AppContext'
import { JOB_TEMPLATES } from '@/lib/utils'
import {
  LEAD_STATUSES, LEAD_STATUS_LABEL, LEAD_STATUS_BADGE, LEAD_SOURCES, LOST_REASONS,
  leadStatusOf, isOpenLead, isDueForChase, isOverdue, todayUk, addDays, chaseWords, findSamePerson, whatsappLink, leadHeadline, type LeadStatus,
  splitPostcode, joinAddress, mapsUrl, tidyPostcode,
} from '@/lib/leads'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import ModalMaximizeButton from '@/components/ModalMaximizeButton'
import EnquiryFormSetup from '@/components/EnquiryFormSetup'
import LeadVisitModal, { type VisitFields } from '@/components/LeadVisitModal'
import { visitWhenShort, visitWhenLong, durationWords } from '@/lib/lead-visit'
import { parsePastedMessage } from '@/lib/lead-from-message'
import LeadFilesBox, { type FileTile } from '@/components/LeadFilesBox'
import { cleanLeadFiles, addLeadFiles, removeLeadFile, nameForPasted, leadFileProblem, LEAD_FILES_MAX, type LeadFile } from '@/lib/lead-files'
import { uploadLeadFile, signLeadFiles, removeLeadFiles } from '@/lib/lead-files-upload'
import './touch.css'

type ClientFile = LeadFile

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
  // added by supabase/lead-visits.sql (missing until it has been run)
  visit_at?: string | null
  visit_minutes?: number
  visit_note?: string
  visit_address?: string
  visit_status?: string
  visit_emailed_at?: string | null
  visit_seq?: number
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
  const [draft, setDraft] = useState({ name: '', phone: '', email: '', address: '', postcode: '', type: '', want: '', notes: '', source: 'Website form' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<Filter>('open')
  const [adding, setAdding] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [visitMode, setVisitMode] = useState<'book' | 'reschedule' | 'cancel' | null>(null)
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

  // a link such as /quote-requests?lead=<id> (from a visit on the Calendar) opens that lead once the list is in
  const deepLinkDone = useRef(false)
  useEffect(() => {
    if (deepLinkDone.current || loading || leads.length === 0) return
    const id = new URLSearchParams(window.location.search).get('lead')
    if (!id) { deepLinkDone.current = true; return }
    const l = leads.find(x => x.id === id)
    if (l) { deepLinkDone.current = true; openLead(l) }
  }, [leads, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  /** What a visit booking changed on a lead, put into the list and the open lead (the server has already saved it) */
  function applyVisitFields(id: string, f: VisitFields) {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...f } : l)))
    setSelected(prev => (prev && prev.id === id ? { ...prev, ...f } : prev))
  }

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
    setDraft({ name: l.client_name || '', phone: l.client_phone || '', email: l.client_email || '', address: splitPostcode(l.project_address).address, postcode: splitPostcode(l.project_address).postcode, type: l.project_type || '', want: l.scope_text || '', notes: l.admin_notes || '', source: sourceOf(l) })
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
      client_name: draft.name.trim(), client_phone: draft.phone.trim(), client_email: draft.email.trim().toLowerCase(), project_address: joinAddress(draft.address, draft.postcode),
      project_type: draft.type.trim(), scope_text: draft.want, admin_notes: draft.notes, source: draft.source,
    })
  }
  async function deleteLead(id: string) {
    if (!confirm('Delete this lead? This cannot be undone.')) return
    const gone = leads.find(l => l.id === id)
    const { error: e } = await sb.from('quote_requests').delete().eq('id', id)
    if (e) { setError(failText(e)); return }
    if (gone) removeLeadFiles(sb, cleanLeadFiles(gone.client_files))   // the files you added go with it (best effort)
    setLeads(prev => prev.filter(l => l.id !== id))
    setSelected(null)
  }

  // ── Files on a lead: the ones that arrived with it, and the ones you add (chosen, photographed, pasted or dragged in) ──
  const [fileBusy, setFileBusy] = useState(false)
  const [fileNote, setFileNote] = useState<{ text: string; bad: boolean } | null>(null)
  const [signed, setSigned] = useState<Record<string, string>>({})
  const selFiles = useMemo(() => cleanLeadFiles(selected?.client_files), [selected?.client_files])

  // the files you added are private: each needs a link signed for a while before it can be shown
  useEffect(() => {
    const need = selFiles.filter(f => f.path && !signed[f.path])
    if (!need.length) return
    let live = true
    signLeadFiles(sb, need).then(m => { if (live && Object.keys(m).length) setSigned(prev => ({ ...prev, ...m })) })
    return () => { live = false }
  }, [selFiles]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFileNote(null) }, [selected?.id])

  const fileTiles: FileTile[] = selFiles.map((f, i) => ({ key: `${f.path || f.url}#${i}`, name: f.name, url: f.path ? (signed[f.path] || '') : f.url, isImage: f.isImage }))

  async function addFiles(l: Lead, picked: File[]) {
    if (!picked.length || fileBusy) return
    setFileBusy(true); setFileNote(null)
    const have = cleanLeadFiles(l.client_files)
    const added: LeadFile[] = []
    const problems: string[] = []
    let n = 0
    for (const raw of picked) {
      if (have.length + added.length >= LEAD_FILES_MAX) { problems.push(`A lead can hold ${LEAD_FILES_MAX} files: ${raw.name || 'a file'} was not added.`); continue }
      n++
      const file = new File([raw], nameForPasted(raw.name, raw.type, n), { type: raw.type })
      const r = await uploadLeadFile(sb, file, l.id)
      if ('error' in r) problems.push(r.error); else added.push(r.file)
    }
    if (added.length) {
      const next = addLeadFiles(have, added).files
      const ok = await patch(l.id, { client_files: next })
      if (!ok) { await removeLeadFiles(sb, added); setFileBusy(false); return }   // patch() has said why; nothing is left behind in storage
    }
    setFileNote({
      text: [added.length ? `${added.length} file${added.length === 1 ? '' : 's'} added.` : '', ...problems].filter(Boolean).join('\n'),
      bad: problems.length > 0,
    })
    setFileBusy(false)
  }

  async function removeFile(l: Lead, index: number) {
    const have = cleanLeadFiles(l.client_files)
    const target = have[index]
    if (!target) return
    if (!confirm(`Remove ${target.name} from this lead?`)) return
    const { files, removed } = removeLeadFile(have, index)
    setFileBusy(true); setFileNote(null)
    const ok = await patch(l.id, { client_files: files })
    if (ok && removed) await removeLeadFiles(sb, [removed])
    setFileBusy(false)
  }

  /** Hands the lead to New Quote. One that already has the website's AI estimate carries its phases and files (as it always did); any other starts the quote from scratch with the customer filled in. */
  async function startQuote(l: Lead) {
    const hasAi = (l.ai_phases?.length ?? 0) > 0
    // files you added are private: New Quote gets links that work for a day
    const have = cleanLeadFiles(l.client_files)
    const links = await signLeadFiles(sb, have, 24 * 3600)
    const handOver = have.map(f => ({ name: f.name, isImage: f.isImage, url: f.path ? (links[f.path] || '') : f.url })).filter(f => f.url)
    if (hasAi) {
      if (handOver.length) sessionStorage.setItem('sbc_quote_request_files', JSON.stringify(handOver))
      sessionStorage.setItem('sbc_quote_request_scope', l.scope_text || '')
      sessionStorage.setItem('sbc_quote_request_phases', JSON.stringify(l.ai_phases))
    } else if (handOver.length) {
      sessionStorage.setItem('sbc_quote_request_files', JSON.stringify(handOver))
    }
    const p = new URLSearchParams({
      lead: l.id,
      clientName: draft.name || l.client_name || '', email: draft.email || l.client_email || '', phone: draft.phone || l.client_phone || '',
      address: joinAddress(draft.address, draft.postcode) || l.project_address || '', jobType: draft.type || l.project_type || '',
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
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.visit_status === 'booked' && l.visit_at && <strong style={{ color: 'var(--moss)' }}>📅 {visitWhenShort(l.visit_at)} · </strong>}{leadHeadline(l)}</div>
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

      {visitMode && selected && (
        <LeadVisitModal lead={{ ...selected, project_address: joinAddress(draft.address, draft.postcode) || selected.project_address }} mode={visitMode} today={today} onClose={() => setVisitMode(null)} onDone={f => applyVisitFields(selected.id, f)} />
      )}

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

              {/* Site visit */}
              {(isOpenLead(selected.status) || selected.visit_status === 'booked') && (
                <div style={{ marginBottom: 18, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <span style={label}>Site visit</span>
                  {selected.visit_status === 'booked' && selected.visit_at ? (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>📅 {visitWhenLong(selected.visit_at)}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 0 8px', lineHeight: 1.5 }}>
                        {durationWords(selected.visit_minutes || 60)} · {(selected.visit_address || selected.project_address || 'no address yet').replace(/\s*\n\s*/g, ', ')}
                        {selected.visit_note ? <><br />Note to them: {selected.visit_note}</> : null}
                        <br />{selected.visit_emailed_at ? `They were emailed ${shortDate(selected.visit_emailed_at)}.` : 'They have not been emailed about it.'}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button className="btn-sm btn-outline" style={{ fontSize: 12 }} onClick={() => setVisitMode('reschedule')}>Change the time</button>
                        <button className="btn-sm btn-outline" style={{ fontSize: 12, color: '#c0392b' }} onClick={() => setVisitMode('cancel')}>Cancel the visit</button>
                        <a className="btn-sm btn-outline" style={{ fontSize: 12, textDecoration: 'none' }} target="_blank" rel="noreferrer" href={mapsUrl((selected.visit_address || selected.project_address || ''), '')}>📍 Directions</a>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button className="btn-sm btn-primary" style={{ fontSize: 12 }} onClick={() => setVisitMode('book')}>📅 Book a site visit</button>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {selected.visit_status === 'cancelled' && selected.visit_at ? `The visit on ${visitWhenShort(selected.visit_at)} was cancelled. ` : ''}
                        The customer is emailed the date, time and address with a calendar file, and it goes on your Calendar.
                      </span>
                    </div>
                  )}
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
                <div style={{ gridColumn: '1 / span 2' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                    <div><span style={label}>Property address</span><input value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} style={input} /></div>
                    <div><span style={label}>Postcode</span><input value={draft.postcode} onChange={e => setDraft({ ...draft, postcode: e.target.value.toUpperCase() })} onBlur={() => setDraft(d => ({ ...d, postcode: tidyPostcode(d.postcode) }))} autoComplete="postal-code" maxLength={10} style={{ ...input, textTransform: 'uppercase' }} /></div>
                  </div>
                  {mapsUrl(draft.address, draft.postcode) && <div style={{ fontSize: 12, marginTop: 4 }}><a href={mapsUrl(draft.address, draft.postcode)} target="_blank" rel="noreferrer" style={{ color: 'var(--moss)' }}>📍 {draft.postcode ? tidyPostcode(draft.postcode) + ' on' : 'Show on'} Google Maps</a></div>}
                </div>
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
              <LeadFilesBox tiles={fileTiles} onFiles={files => addFiles(selected, files)} onRemove={i => removeFile(selected, i)} busy={fileBusy || saving} note={fileNote?.text} noteIsError={fileNote?.bad} />

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
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', postcode: '', type: '', want: '', source: 'My contacts' })
  const [chase, setChase] = useState<string | null>(addDays(today, 1))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [paste, setPaste] = useState('')
  const [pasteNote, setPasteNote] = useState('')
  // pictures and plans picked for a lead that is not saved yet: kept in the browser until Add lead is pressed
  const [pending, setPending] = useState<{ key: string; file: File; url: string }[]>([])
  const [fileNote, setFileNote] = useState<{ text: string; bad: boolean } | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => () => { for (const p of pendingRef.current) URL.revokeObjectURL(p.url) }, [])

  function pickFiles(picked: File[]) {
    const problems: string[] = []
    const keep: { key: string; file: File; url: string }[] = []
    let n = 0
    for (const raw of picked) {
      if (pending.length + keep.length >= LEAD_FILES_MAX) { problems.push(`A lead can hold ${LEAD_FILES_MAX} files: ${raw.name || 'a file'} was not added.`); continue }
      n++
      const file = new File([raw], nameForPasted(raw.name, raw.type, pending.length + n), { type: raw.type })
      const p = leadFileProblem(file.name, file.type, file.size)
      if (p) { problems.push(p); continue }
      keep.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, file, url: URL.createObjectURL(file) })
    }
    if (keep.length) setPending(cur => [...cur, ...keep])
    setFileNote(problems.length ? { text: problems.join('\n'), bad: true } : null)
  }
  function dropPending(i: number) {
    setPending(cur => { const gone = cur[i]; if (gone) URL.revokeObjectURL(gone.url); return cur.filter((_, k) => k !== i) })
  }
  const pendingTiles: FileTile[] = pending.map(p => ({ key: p.key, name: p.file.name, url: p.url, isImage: /^image\/(jpe?g|png|webp|gif)$/i.test(p.file.type) }))

  /** Reads a pasted email or message and fills in what it finds: nothing already typed is overwritten */
  function fillFromPaste() {
    const p = parsePastedMessage(paste)
    if (!paste.trim()) return
    const found: string[] = []
    setF(cur => {
      const next = { ...cur }
      if (!cur.name.trim() && p.name) { next.name = p.name; found.push('name') }
      if (!cur.email.trim() && p.email) { next.email = p.email; found.push('email') }
      if (!cur.phone.trim() && p.phone) { next.phone = p.phone; found.push('phone') }
      if (!cur.want.trim() && p.want) { next.want = p.want; found.push('what they want') }
      if (cur.source === 'My contacts') next.source = p.kind === 'email' ? 'Email' : p.kind === 'chat' ? 'WhatsApp' : cur.source
      return next
    })
    setPasteNote(p.name || p.email || p.phone ? `Filled in what could be found${p.name ? '' : ': there was no name, so please type one'}. Check it below.` : 'No name, phone or email could be found in that. The words are in "What they want": please type the rest.')
  }

  // is this person already here, as a lead or as a contact?
  const sameLead = findSamePerson({ email: f.email, phone: f.phone }, leads.map(l => ({ ...l, email: l.client_email, phone: l.client_phone })))
  const sameContact = findSamePerson({ email: f.email, phone: f.phone }, clients.filter(c => (c.clientType ?? 'client') === 'client'))

  async function save() {
    if (!f.name.trim()) { setErr('Please give a name.'); return }
    if (!f.phone.trim() && !f.email.trim()) { setErr('Add a phone number or an email address, so you can get back to them.'); return }
    setBusy(true); setErr('')
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { setErr('You are not signed in: please refresh and try again.'); setBusy(false); return }
    // the files go up first (into a folder of their own), so the lead is saved with them in one step
    const folder = `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const stored: LeadFile[] = []
    const failed: string[] = []
    for (const p of pending) {
      const r = await uploadLeadFile(sb, p.file, folder)
      if ('error' in r) failed.push(r.error); else stored.push(r.file)
    }
    if (failed.length) { await removeLeadFiles(sb, stored); setErr(`The lead was not added, because:\n${failed.join('\n')}`); setBusy(false); return }
    const { data, error } = await sb.from('quote_requests').insert({
      user_id: user.id, client_name: f.name.trim(), client_phone: f.phone.trim(), client_email: f.email.trim().toLowerCase(), project_address: joinAddress(f.address, f.postcode),
      project_type: f.type.trim(), scope_text: f.want.trim(), source: f.source, status: 'pending', chase_on: chase, ...(stored.length ? { client_files: stored } : {}),
    }).select('*').single()
    setBusy(false)
    if (error || !data) { await removeLeadFiles(sb, stored); setErr(failText(error)); return }
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
          {err && <div style={{ background: '#fdecea', border: '1px solid #f5c6c0', color: '#a93226', borderRadius: 6, padding: '8px 12px', fontSize: 13, whiteSpace: 'pre-line' }}>{err}</div>}
          <details style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', background: '#fff' }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>📋 Paste an email or a message</summary>
            <div style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0' }}>Paste an email (with its From and Subject lines), a WhatsApp or Messenger message, or your own note. It fills in the name, phone, email and what they want where it can.</div>
            <textarea value={paste} onChange={e => { setPaste(e.target.value); setPasteNote('') }} rows={5} style={{ ...input, resize: 'vertical' }} placeholder="Paste here" aria-label="Pasted email or message" />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <button type="button" className="btn-sm btn-primary" style={{ fontSize: 12 }} onClick={fillFromPaste} disabled={!paste.trim()}>Fill in the details</button>
              {pasteNote && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{pasteNote}</span>}
            </div>
          </details>
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
            <div><span style={label}>Postcode</span><input value={f.postcode} onChange={e => setF({ ...f, postcode: e.target.value.toUpperCase() })} onBlur={() => setF(c => ({ ...c, postcode: tidyPostcode(c.postcode) }))} autoComplete="postal-code" maxLength={10} style={{ ...input, textTransform: 'uppercase' }} /></div>
          </div>
          {mapsUrl(f.address, f.postcode) && <div style={{ fontSize: 12, marginTop: -6 }}><a href={mapsUrl(f.address, f.postcode)} target="_blank" rel="noreferrer" style={{ color: 'var(--moss)' }}>📍 Show on Google Maps</a></div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <div><span style={label}>Kind of job</span><input list="lead-job-types-add" value={f.type} onChange={e => setF({ ...f, type: e.target.value })} style={input} /></div>
          </div>
          <datalist id="lead-job-types-add">{Object.keys(JOB_TEMPLATES).map(t => <option key={t} value={t} />)}</datalist>
          <div style={{ marginBottom: -8 }}>
            <LeadFilesBox tiles={pendingTiles} onFiles={pickFiles} onRemove={dropPending} busy={busy} note={fileNote?.text} noteIsError={fileNote?.bad} />
          </div>
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
