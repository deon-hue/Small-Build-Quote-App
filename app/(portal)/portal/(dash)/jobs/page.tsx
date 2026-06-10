'use client'

import { useState } from 'react'
import { usePortal } from '@/contexts/PortalContext'
import { STAGE_COLOR, STAGE_LABEL, fmt } from '@/lib/utils'
import PortalGanttChart from '@/components/PortalGanttChart'
import { createClient } from '@/lib/supabase/client'
import type { Variation, VariationLineItem, VariationStatus } from '@/lib/types'

// ── Helpers ─────────────────────────────────────────────────

const VAR_STATUS_LABEL: Record<VariationStatus, string> = {
  draft:     'Draft',
  sent:      'Awaiting your approval',
  approved:  'Approved',
  rejected:  'Rejected',
  cancelled: 'Cancelled',
  invoiced:  'Invoiced',
  paid:      'Paid',
}
const VAR_STATUS_COLOR: Record<VariationStatus, string> = {
  draft:     '#888',
  sent:      '#e67e22',
  approved:  '#27ae60',
  rejected:  '#c0392b',
  cancelled: '#9aa3ad',
  invoiced:  '#4a90a4',
  paid:      '#7ab533',
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return '' }
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

// Compute selling rate for a variation item (hides cost+markup from customer)
function itemSellRate(item: VariationLineItem, markup: number): number {
  return (Number(item.rate) || 0) * (1 + (markup || 0) / 100)
}
function itemSellTotal(item: VariationLineItem, markup: number): number {
  return itemSellRate(item, markup) * (Number(item.qty) || 0)
}

// ── Main page ────────────────────────────────────────────────

export default function PortalJobsPage() {
  const supabase = createClient()
  const { jobs, variations, ganttStates, settings, clientSettings, loading, error, reload } = usePortal()

  const [expandedGantt, setExpandedGantt]   = useState<string | null>(null)
  const [expandedVars, setExpandedVars]      = useState<string | null>(null)   // job id
  const [viewingVar, setViewingVar]          = useState<Variation | null>(null)

  // Attachments per job: { [jobId]: loaded files | 'loading' }
  type AttFile = { id: string; fileName: string; mimeType: string; fileSize: number; category: string; label: string; url: string | null }
  const [expandedFiles, setExpandedFiles]    = useState<string | null>(null)
  const [fileCache, setFileCache]            = useState<Record<string, AttFile[] | 'loading'>>({})

  async function loadAttachments(jobId: string) {
    setFileCache(prev => ({ ...prev, [jobId]: 'loading' }))
    try {
      const res = await fetch(`/api/portal/job-attachments?jobId=${jobId}`)
      const data: AttFile[] = res.ok ? await res.json() : []
      setFileCache(prev => ({ ...prev, [jobId]: data }))
    } catch {
      setFileCache(prev => ({ ...prev, [jobId]: [] }))
    }
  }

  function toggleFiles(jobId: string) {
    if (expandedFiles === jobId) { setExpandedFiles(null); return }
    setExpandedFiles(jobId)
    if (!fileCache[jobId]) loadAttachments(jobId)
  }

  function fmtSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  // Approve flow
  const [approvingVar, setApprovingVar]      = useState<Variation | null>(null)
  const [sigName, setSigName]                = useState('')
  const [agreed, setAgreed]                  = useState(false)
  const [submitting, setSubmitting]          = useState(false)
  const [actionError, setActionError]        = useState('')

  // Reject flow
  const [rejectingVar, setRejectingVar]      = useState<Variation | null>(null)
  const [rejectReason, setRejectReason]      = useState('')

  function openApprove(v: Variation) {
    setApprovingVar(v); setSigName(''); setAgreed(false); setActionError('')
  }
  function openReject(v: Variation) {
    setRejectingVar(v); setRejectReason(''); setActionError('')
  }

  async function handleApprove() {
    if (!approvingVar || !sigName.trim() || !agreed) return
    setSubmitting(true); setActionError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('approve_variation', {
        p_variation_id: approvingVar.id,
        p_signature: sigName.trim(),
      })
      if (rpcErr || data?.error) {
        setActionError(rpcErr?.message || data?.error || 'Something went wrong.')
        return
      }
      setApprovingVar(null)
      reload()
    } finally { setSubmitting(false) }
  }

  async function handleReject() {
    if (!rejectingVar) return
    setSubmitting(true); setActionError('')
    try {
      const { data, error: rpcErr } = await supabase.rpc('reject_variation', {
        p_variation_id: rejectingVar.id,
        p_reason: rejectReason.trim(),
      })
      if (rpcErr || data?.error) {
        setActionError(rpcErr?.message || data?.error || 'Something went wrong.')
        return
      }
      setRejectingVar(null)
      reload()
    } finally { setSubmitting(false) }
  }

  if (loading) return <div className="portal-loading">Loading…</div>
  if (error && error !== 'no_admin_linked') {
    return <div className="portal-notice"><p>Unable to load jobs.</p></div>
  }

  return (
    <>
      <div className="portal-page-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h1>Your Jobs</h1>
          <p>{jobs.length} job{jobs.length !== 1 ? 's' : ''} on file</p>
        </div>
        <button onClick={reload} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
          ↻ Refresh
        </button>
      </div>

      {!jobs.length ? (
        <div className="portal-notice">
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏗</div>
          <p>No jobs on file yet.</p>
        </div>
      ) : (
        jobs.map(j => {
          const pct = j.weeks ? Math.min(100, Math.round((j.done / j.weeks) * 100)) : 0
          const col = STAGE_COLOR[j.stage] || '#888'
          const ganttState   = ganttStates[j.id] || null
          const ganttOpen    = expandedGantt === j.id
          const varsOpen     = expandedVars === j.id

          // Variations for this job
          const jobVars      = variations.filter(v => v.jobId === j.id)
          const sentVars     = jobVars.filter(v => v.status === 'sent')
          const approvedVars = jobVars.filter(v => ['approved','invoiced','paid'].includes(v.status))
          const rejectedVars = jobVars.filter(v => ['rejected','cancelled'].includes(v.status))
          const approvedTotal = approvedVars.reduce((s, v) => s + v.total, 0)
          const effectiveTotal = j.value + approvedTotal
          const hasAnyVars   = jobVars.length > 0

          return (
            <div key={j.id} className="portal-card">
              {/* Job header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 17 }}>{j.type}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{j.address}</div>
                  {j.start && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      Started {new Date(j.start).toLocaleDateString('en-GB')}
                    </div>
                  )}
                </div>
                <span className="portal-badge" style={{ background: col }}>
                  {STAGE_LABEL[j.stage] || j.stage}
                </span>
              </div>

              {/* Progress */}
              <div className="portal-progress">
                <div className="portal-progress-bar" style={{ width: pct + '%', background: col }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginTop: 5 }}>
                <span>Week {j.done} of {j.weeks}</span>
                <span style={{ fontWeight: 600 }}>{pct}% complete</span>
              </div>

              {j.notes && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--warm)', borderRadius: 6, fontSize: 13, color: 'var(--ink)', lineHeight: 1.6 }}>
                  {j.notes}
                </div>
              )}

              {/* Contract summary */}
              <div style={{ marginTop: 14, padding: '12px 14px', background: '#f0f4f8', borderRadius: 8, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 2 }}>Original Contract</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16 }}>{fmt(j.value)}</div>
                </div>
                {approvedTotal > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#27ae60', marginBottom: 2 }}>Approved Variations</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16, color: '#27ae60' }}>+{fmt(approvedTotal)}</div>
                  </div>
                )}
                {sentVars.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#e67e22', marginBottom: 2 }}>Pending Approval</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 16, color: '#e67e22' }}>
                      {fmt(sentVars.reduce((s, v) => s + v.total, 0))}
                    </div>
                  </div>
                )}
                {(approvedTotal > 0) && (
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 2 }}>Total Contract Value</div>
                    <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 18 }}>{fmt(effectiveTotal)}</div>
                  </div>
                )}
              </div>

              {/* Pending variations — call-to-action */}
              {sentVars.length > 0 && (
                <div style={{ marginTop: 14, padding: '12px 14px', background: '#fff8ee', border: '1px solid #f5c77a', borderRadius: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#856a00', marginBottom: 8 }}>
                    ⏳ {sentVars.length} variation{sentVars.length > 1 ? 's' : ''} awaiting your decision
                  </div>
                  {sentVars.map(v => (
                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #f5c77a', gap: 8, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{v.ref} · {v.title}</div>
                        {v.description && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{v.description.slice(0, 80)}{v.description.length > 80 ? '…' : ''}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15 }}>{fmt(v.total)}</span>
                        <button className="btn-sm btn-outline" onClick={() => setViewingVar(v)}>View Details</button>
                        <button className="btn-sm btn-danger" onClick={() => openReject(v)}>Reject</button>
                        <button className="btn-sm btn-primary" onClick={() => openApprove(v)}>Approve</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Variations section (toggle) */}
              {hasAnyVars && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <button
                    onClick={() => setExpandedVars(varsOpen ? null : j.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    📝 {varsOpen ? 'Hide Variations ▲' : `View All Variations (${jobVars.length}) ▼`}
                  </button>

                  {varsOpen && (
                    <div style={{ marginTop: 12 }}>

                      {/* Approved */}
                      {approvedVars.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#27ae60', marginBottom: 6 }}>Approved Changes</div>
                          {approvedVars.map(v => (
                            <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f0f9e8', border: '1px solid #b8e08a', borderRadius: 6, marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                              <div>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#4a7c1f' }}>{v.ref}</span>
                                <span style={{ fontWeight: 600, fontSize: 13, marginLeft: 8 }}>{v.title}</span>
                                {v.clientApprovedBy && (
                                  <div style={{ fontSize: 11, color: '#6a9a3a' }}>
                                    Approved by {v.clientApprovedBy} · {fmtDate(v.clientApprovedAt)}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: '#27ae60' }}>+{fmt(v.total)}</span>
                                <button className="btn-sm btn-outline" onClick={() => setViewingVar(v)}>View</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rejected / cancelled */}
                      {rejectedVars.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 6 }}>Rejected / Cancelled</div>
                          {rejectedVars.map(v => (
                            <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#fafaf8', border: '1px solid var(--border)', borderRadius: 6, marginBottom: 4, gap: 8, flexWrap: 'wrap', opacity: 0.7 }}>
                              <div>
                                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: 'var(--muted)' }}>{v.ref}</span>
                                <span style={{ fontWeight: 500, fontSize: 13, marginLeft: 8 }}>{v.title}</span>
                                <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 10, background: v.status === 'rejected' ? '#fdf0ef' : '#f0f2ee', color: v.status === 'rejected' ? '#c0392b' : '#888' }}>
                                  {VAR_STATUS_LABEL[v.status]}
                                </span>
                                {v.clientRejectionReason && (
                                  <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2 }}>
                                    &ldquo;{v.clientRejectionReason}&rdquo;
                                  </div>
                                )}
                              </div>
                              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: 'var(--muted)', textDecoration: 'line-through' }}>{fmt(v.total)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Programme / Gantt toggle — hidden if admin disabled it */}
              {clientSettings.showProgramme && (
                <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <button
                    onClick={() => setExpandedGantt(ganttOpen ? null : j.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span>📋</span>
                    {ganttOpen ? 'Hide Programme ▲' : 'View Programme ▼'}
                  </button>
                  {ganttOpen && (
                    <PortalGanttChart job={j} phases={[]} ganttState={ganttState} />
                  )}
                </div>
              )}

              {/* ── Attachments ──────────────────────────────── */}
              <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <button
                  onClick={() => toggleFiles(j.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  📎 {expandedFiles === j.id ? 'Hide Files ▲' : 'Plans, Photos & Documents ▼'}
                </button>

                {expandedFiles === j.id && (
                  <div style={{ marginTop: 12 }}>
                    {fileCache[j.id] === 'loading' ? (
                      <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>Loading…</div>
                    ) : !fileCache[j.id] || (fileCache[j.id] as AttFile[]).length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--muted)', padding: '8px 0' }}>No files shared yet.</div>
                    ) : (
                      (['photo', 'plan', 'document'] as const)
                        .map(cat => {
                          const catFiles = (fileCache[j.id] as AttFile[]).filter(f => f.category === cat)
                          if (!catFiles.length) return null
                          const catLabel = cat === 'photo' ? '📷 Photos' : cat === 'plan' ? '📐 Plans & Drawings' : '📄 Documents'
                          return (
                            <div key={cat} style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'var(--muted)', marginBottom: 8 }}>
                                {catLabel}
                              </div>

                              {cat === 'photo' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 6 }}>
                                  {catFiles.map(f => (
                                    <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noreferrer"
                                      style={{ display: 'block', borderRadius: 6, overflow: 'hidden', aspectRatio: '1', background: '#f0f2f4', textDecoration: 'none' }}>
                                      {f.url
                                        ? <img src={f.url} alt={f.label || f.fileName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>📷</div>
                                      }
                                    </a>
                                  ))}
                                </div>
                              ) : (
                                catFiles.map(f => (
                                  <a key={f.id} href={f.url ?? '#'} target="_blank" rel="noreferrer"
                                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, marginBottom: 4, background: '#f8f9fa', border: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}>
                                    <span style={{ fontSize: 18 }}>{cat === 'plan' ? '📐' : '📄'}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {f.label || f.fileName}
                                      </div>
                                      {f.label && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.fileName}</div>}
                                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{fmtSize(f.fileSize)}</div>
                                    </div>
                                    <span style={{ fontSize: 11, color: 'var(--moss)', fontWeight: 600, flexShrink: 0 }}>Open ↗</span>
                                  </a>
                                ))
                              )}
                            </div>
                          )
                        })
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })
      )}

      {/* ── Variation detail modal ──────────────────────────── */}
      {viewingVar && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setViewingVar(null) }}>
          <div className="portal-modal" style={{ width: 'min(680px, 96vw)' }}>
            <div className="portal-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Variation Details</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {viewingVar.ref} · {viewingVar.title}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewingVar(null)}>×</button>
            </div>
            <div className="portal-modal-bd">
              {/* Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{ background: VAR_STATUS_COLOR[viewingVar.status], color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20 }}>
                  {VAR_STATUS_LABEL[viewingVar.status]}
                </span>
                {viewingVar.status === 'approved' && viewingVar.clientApprovedBy && (
                  <span style={{ fontSize: 12, color: '#27ae60' }}>
                    ✓ Approved by {viewingVar.clientApprovedBy} · {fmtDateTime(viewingVar.clientApprovedAt)}
                  </span>
                )}
                {viewingVar.status === 'rejected' && viewingVar.clientRejectedAt && (
                  <span style={{ fontSize: 12, color: '#c0392b' }}>
                    Rejected {fmtDate(viewingVar.clientRejectedAt)}
                  </span>
                )}
              </div>

              {/* Description */}
              {viewingVar.description && (
                <div style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--warm)', borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
                  {viewingVar.description}
                </div>
              )}

              {/* Line items */}
              {viewingVar.items.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 90px', padding: '7px 14px', background: '#f0f2ee', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', gap: 8 }}>
                    <div>Description</div>
                    <div style={{ textAlign: 'right' }}>Qty</div>
                    <div style={{ textAlign: 'center' }}>Unit</div>
                    <div style={{ textAlign: 'right' }}>Total</div>
                  </div>
                  {viewingVar.items.map((item, idx) => {
                    const lineTotal = itemSellTotal(item, viewingVar.markup)
                    return (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 70px 90px', padding: '8px 14px', borderTop: '1px solid var(--border)', background: idx % 2 === 0 ? '#fff' : '#fafaf8', alignItems: 'center', gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{item.desc}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{item.itemType.charAt(0).toUpperCase() + item.itemType.slice(1)}</div>
                          {item.notes && <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic', marginTop: 1 }}>{item.notes}</div>}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 13 }}>{item.qty}</div>
                        <div style={{ textAlign: 'center', fontSize: 13 }}>{item.unit}</div>
                        <div style={{ textAlign: 'right', fontFamily: 'DM Mono, monospace', fontSize: 13, fontWeight: 600 }}>{fmt(lineTotal)}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Totals */}
              {(() => {
                const markup = viewingVar.markup || 0
                const sellEx = viewingVar.items.reduce((s, i) => s + itemSellTotal(i, markup), 0)
                const vatAmt = viewingVar.vatIncluded ? sellEx * 0.2 : 0
                const total  = sellEx + vatAmt
                return (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                    <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                      <span style={{ fontSize: 13, color: 'var(--muted)' }}>Subtotal (ex. VAT)</span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>{fmt(sellEx)}</span>
                    </div>
                    {viewingVar.vatIncluded && (
                      <div style={{ padding: '9px 14px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', background: '#fafaf8' }}>
                        <span style={{ fontSize: 13, color: 'var(--muted)' }}>VAT (20%)</span>
                        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 13 }}>+{fmt(vatAmt)}</span>
                      </div>
                    )}
                    <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--moss)' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
                        Total{viewingVar.vatIncluded ? ' (inc. VAT)' : ''}
                      </span>
                      <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 20, color: '#fff' }}>{fmt(total)}</span>
                    </div>
                  </div>
                )
              })()}

              {/* Notes */}
              {viewingVar.notes && (
                <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
                  {viewingVar.notes}
                </div>
              )}

              {/* Sent at */}
              {viewingVar.sentAt && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  Sent {fmtDateTime(viewingVar.sentAt)}
                </div>
              )}

              {/* Rejection reason */}
              {viewingVar.clientRejectionReason && (
                <div style={{ padding: '10px 14px', background: '#fdf0ef', border: '1px solid #f5a0a0', borderRadius: 8, fontSize: 13, color: '#c0392b', marginTop: 8 }}>
                  <strong>Rejection reason:</strong> &ldquo;{viewingVar.clientRejectionReason}&rdquo;
                </div>
              )}
            </div>
            <div className="portal-modal-ft">
              {viewingVar.status === 'sent' && (
                <>
                  <button className="btn btn-danger" onClick={() => { setViewingVar(null); openReject(viewingVar) }}>
                    ✗ Reject
                  </button>
                  <button className="btn btn-primary" onClick={() => { setViewingVar(null); openApprove(viewingVar) }}>
                    ✓ Approve This Variation
                  </button>
                </>
              )}
              {viewingVar.status !== 'sent' && (
                <button className="btn btn-outline" onClick={() => setViewingVar(null)}>Close</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Approve modal ───────────────────────────────────── */}
      {approvingVar && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setApprovingVar(null) }}>
          <div className="portal-modal">
            <div className="portal-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Approve Variation</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {approvingVar.ref} — {approvingVar.title}
                </div>
              </div>
              <button className="modal-close" onClick={() => setApprovingVar(null)}>×</button>
            </div>
            <div className="portal-modal-bd">
              {/* Summary */}
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Variation</span>
                  <span style={{ fontSize: 13, fontFamily: 'DM Mono, monospace' }}>{approvingVar.ref}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Description</span>
                  <span style={{ fontSize: 13, fontWeight: 600, maxWidth: '60%', textAlign: 'right' }}>{approvingVar.title}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Amount</span>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'DM Mono, monospace' }}>
                    {fmt(approvingVar.total)}
                    {approvingVar.vatIncluded && <span style={{ fontSize: 11, fontWeight: 400, marginLeft: 4 }}>inc. VAT</span>}
                  </span>
                </div>
              </div>

              {/* Warning */}
              <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.7, marginBottom: 20, padding: '14px 16px', background: '#fffbf0', border: '1px solid #f0d080', borderRadius: 8 }}>
                <strong>Please read before approving:</strong><br />
                By approving this variation you authorise the additional works and agree to the
                additional cost stated above. This approval is legally binding and cannot be undone.
              </div>

              {/* Signature */}
              <div className="fg" style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 600 }}>Your Full Name <span style={{ color: '#c0392b' }}>*</span></label>
                <input
                  type="text"
                  value={sigName}
                  onChange={e => setSigName(e.target.value)}
                  placeholder="Type your full name to sign"
                  autoFocus
                  style={{ fontSize: 15 }}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>This acts as your electronic signature</div>
              </div>

              {/* Agree checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, flexShrink: 0, width: 16, height: 16 }} />
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>
                  I have read and agree to the variation details and additional cost above
                </span>
              </label>

              {actionError && (
                <div style={{ color: '#c0392b', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fdf0ef', borderRadius: 6 }}>
                  {actionError}
                </div>
              )}
            </div>
            <div className="portal-modal-ft">
              <button className="btn btn-outline" onClick={() => setApprovingVar(null)} disabled={submitting}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleApprove}
                disabled={submitting || !sigName.trim() || !agreed}
                style={{ minWidth: 180 }}
              >
                {submitting ? 'Approving…' : '✍️ Approve Variation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject modal ────────────────────────────────────── */}
      {rejectingVar && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setRejectingVar(null) }}>
          <div className="portal-modal">
            <div className="portal-modal-hd">
              <div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>Reject Variation</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {rejectingVar.ref} — {rejectingVar.title}
                </div>
              </div>
              <button className="modal-close" onClick={() => setRejectingVar(null)}>×</button>
            </div>
            <div className="portal-modal-bd">
              <div style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>
                Please let us know why you are rejecting this variation. Your builder will be notified.
              </div>
              <div className="fg">
                <label>Reason (optional but helpful)</label>
                <textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Price too high — please provide a revised quote…"
                />
              </div>
              {actionError && (
                <div style={{ color: '#c0392b', fontSize: 13, marginTop: 12, padding: '8px 12px', background: '#fdf0ef', borderRadius: 6 }}>
                  {actionError}
                </div>
              )}
            </div>
            <div className="portal-modal-ft">
              <button className="btn btn-outline" onClick={() => setRejectingVar(null)} disabled={submitting}>Cancel</button>
              <button className="btn btn-danger" onClick={handleReject} disabled={submitting} style={{ minWidth: 160 }}>
                {submitting ? 'Rejecting…' : '✗ Reject Variation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
