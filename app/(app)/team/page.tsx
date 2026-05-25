'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { TeamMember, TeamMemberRole, UserPermissions } from '@/lib/types'
import { ROLE_PERMISSIONS, FULL_PERMISSIONS } from '@/lib/types'

const ROLE_LABELS: Record<TeamMemberRole, string> = {
  admin:     'Admin',
  manager:   'Manager',
  staff:     'Staff',
  view_only: 'View Only',
}

const STATUS_BADGE: Record<TeamMember['status'], string> = {
  active:   'b-active',
  invited:  'b-planning',
  disabled: 'b-onhold',
}

const STATUS_LABEL: Record<TeamMember['status'], string> = {
  active:   'Active',
  invited:  'Invited',
  disabled: 'Disabled',
}

const PERMISSION_LABELS: { key: keyof UserPermissions; label: string }[] = [
  { key: 'dashboard',   label: 'Dashboard'    },
  { key: 'calendar',    label: 'Calendar'     },
  { key: 'jobs',        label: 'Jobs'         },
  { key: 'quotes',      label: 'Quotes'       },
  { key: 'invoices',    label: 'Invoices'     },
  { key: 'clients',     label: 'Clients'      },
  { key: 'settings',    label: 'Company Setup'},
  { key: 'back_office', label: 'Back Office'  },
  { key: 'team',        label: 'Team'         },
]

const BLANK_FORM = {
  name: '',
  email: '',
  role: 'staff' as TeamMemberRole,
  permissions: ROLE_PERMISSIONS.staff,
}

interface InviteModalState {
  editId?: string      // undefined = new invite
  name: string
  email: string
  role: TeamMemberRole
  permissions: UserPermissions
}

export default function TeamPage() {
  const {
    teamMembers, isOwner, loading,
    inviteTeamMember, updateTeamMember, deleteTeamMember,
    resendInvite, disableTeamMember, enableTeamMember,
  } = useApp()

  const [modal, setModal] = useState<InviteModalState | null>(null)
  const [saving, setSaving] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>
  if (!isOwner) return <div style={{ padding: 40, color: 'var(--muted)' }}>Only the account owner can manage team members.</div>

  function openNew() {
    setModal({ name: '', email: '', role: 'staff', permissions: ROLE_PERMISSIONS.staff })
    setInviteLink(null)
  }

  function openEdit(m: TeamMember) {
    setModal({ editId: m.id, name: m.name, email: m.email, role: m.role, permissions: m.permissions })
    setInviteLink(null)
  }

  function setRole(role: TeamMemberRole) {
    if (!modal) return
    setModal({ ...modal, role, permissions: ROLE_PERMISSIONS[role] })
  }

  function togglePerm(key: keyof UserPermissions) {
    if (!modal) return
    // Dashboard is always on for everyone
    if (key === 'dashboard') return
    setModal({ ...modal, permissions: { ...modal.permissions, [key]: !modal.permissions[key] } })
  }

  async function handleSave() {
    if (!modal) return
    if (!modal.email.trim()) { alert('Email is required.'); return }
    setSaving(true)
    try {
      if (modal.editId) {
        // Update existing member
        const existing = teamMembers.find(m => m.id === modal.editId)
        if (!existing) return
        await updateTeamMember({ ...existing, name: modal.name, role: modal.role, permissions: modal.permissions })
        setModal(null)
      } else {
        // Create new invite
        const newMember = await inviteTeamMember({
          email: modal.email.trim().toLowerCase(),
          name: modal.name.trim(),
          role: modal.role,
          permissions: modal.permissions,
        })
        if (newMember.inviteToken) {
          const link = `${window.location.origin}/team/accept?token=${newMember.inviteToken}`
          setInviteLink(link)
        } else {
          setModal(null)
        }
      }
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || 'Failed to save.'
      alert(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleResend(m: TeamMember) {
    try {
      const newToken = await resendInvite(m.id)
      const link = `${window.location.origin}/team/accept?token=${newToken}`
      setInviteLink(link)
      setModal({ editId: m.id, name: m.name, email: m.email, role: m.role, permissions: m.permissions })
    } catch {
      alert('Failed to resend invite.')
    }
  }

  async function handleDelete(m: TeamMember) {
    if (!confirm(`Delete ${m.name || m.email}? This cannot be undone.`)) return
    await deleteTeamMember(m.id)
  }

  async function copyLink(link: string, id: string) {
    await navigator.clipboard.writeText(link)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function getInviteUrl(m: TeamMember) {
    if (!m.inviteToken) return null
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/team/accept?token=${m.inviteToken}`
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
            {teamMembers.length} team member{teamMembers.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Invite User</button>
      </div>

      {/* Owner row */}
      <div className="card" style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, color: '#fff', fontSize: 15, flexShrink: 0
          }}>👑</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>You (Owner)</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 1 }}>Full access — all permissions</div>
          </div>
          <span className="badge b-active">Owner</span>
        </div>
      </div>

      {/* Team member rows */}
      {teamMembers.length === 0 && (
        <div className="empty-dashed" style={{ marginTop: 10 }}>
          <div style={{ fontSize: 14, marginBottom: 6 }}>No team members yet</div>
          <div style={{ fontSize: 12, marginBottom: 14 }}>Invite someone to give them access.</div>
        </div>
      )}
      {teamMembers.map(m => {
        const initials = (m.name || m.email).slice(0, 2).toUpperCase()
        const inviteUrl = m.status === 'invited' ? getInviteUrl(m) : null
        return (
          <div key={m.id} className="card" style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, color: 'var(--text)', fontSize: 13, flexShrink: 0,
                opacity: m.status === 'disabled' ? 0.5 : 1,
              }}>{initials}</div>

              <div style={{ flex: 1, opacity: m.status === 'disabled' ? 0.6 : 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {m.name || '—'}{' '}
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                    {ROLE_LABELS[m.role]}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {m.email}
                  {m.lastActiveAt && (
                    <> · Last active {new Date(m.lastActiveAt).toLocaleDateString('en-GB')}</>
                  )}
                  {m.status === 'invited' && m.invitedAt && (
                    <> · Invited {new Date(m.invitedAt).toLocaleDateString('en-GB')}</>
                  )}
                </div>
                {/* Permission pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {PERMISSION_LABELS.filter(p => m.permissions[p.key]).map(p => (
                    <span key={p.key} style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 10,
                      background: 'var(--bg-alt)', border: '1px solid var(--border)',
                      color: 'var(--muted)',
                    }}>{p.label}</span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`badge ${STATUS_BADGE[m.status]}`}>{STATUS_LABEL[m.status]}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {m.status === 'invited' && (
                    <button className="btn-sm btn-outline" onClick={() => handleResend(m)} title="Resend invite link">
                      ↺ Resend
                    </button>
                  )}
                  {m.status === 'active' && (
                    <button className="btn-sm btn-outline" onClick={() => disableTeamMember(m.id)} title="Disable account">
                      🔒 Disable
                    </button>
                  )}
                  {m.status === 'disabled' && (
                    <button className="btn-sm btn-outline" onClick={() => enableTeamMember(m.id)} title="Re-enable account">
                      ✓ Enable
                    </button>
                  )}
                  <button className="btn-sm btn-outline" onClick={() => openEdit(m)}>Edit</button>
                  <button className="btn-sm btn-danger" onClick={() => handleDelete(m)}>✕</button>
                </div>
              </div>
            </div>

            {/* Show invite link directly under invited members */}
            {inviteUrl && m.status === 'invited' && (
              <div style={{
                padding: '8px 20px 12px', borderTop: '1px solid var(--border)',
                fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 10, alignItems: 'center'
              }}>
                <span style={{ flexShrink: 0 }}>🔗 Invite link:</span>
                <span style={{
                  flex: 1, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>{inviteUrl}</span>
                <button
                  className="btn-sm btn-outline"
                  onClick={() => copyLink(inviteUrl, m.id)}
                  style={{ flexShrink: 0 }}
                >
                  {copiedId === m.id ? '✓ Copied' : '📋 Copy'}
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Invite / Edit modal */}
      {modal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) { setModal(null); setInviteLink(null) } }}>
          <div className="form-modal" style={{ width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {modal.editId ? 'Edit Team Member' : 'Invite Team Member'}
              </div>
              <button className="modal-close" onClick={() => { setModal(null); setInviteLink(null) }}>×</button>
            </div>

            {/* Invite link result */}
            {inviteLink && (
              <div style={{
                margin: '0 0 0 0', padding: '16px 24px',
                background: 'rgba(39,174,96,0.08)', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: '#27ae60' }}>
                  ✅ Invite Created
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  Copy this link and send it to the new team member. It will expire once used.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    readOnly
                    value={inviteLink}
                    style={{ flex: 1, fontSize: 11, fontFamily: 'monospace', padding: '6px 10px' }}
                    onFocus={e => e.target.select()}
                  />
                  <button
                    className="btn-sm btn-primary"
                    onClick={() => copyLink(inviteLink, 'modal')}
                    style={{ flexShrink: 0 }}
                  >
                    {copiedId === 'modal' ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
                <button
                  className="btn btn-outline"
                  onClick={() => { setModal(null); setInviteLink(null) }}
                  style={{ marginTop: 12, width: '100%' }}
                >
                  Done
                </button>
              </div>
            )}

            {!inviteLink && (
              <div className="form-modal-bd">
                <div className="row2">
                  <div className="fg">
                    <label>Full Name</label>
                    <input
                      value={modal.name}
                      onChange={e => setModal({ ...modal, name: e.target.value })}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div className="fg">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={modal.email}
                      onChange={e => setModal({ ...modal, email: e.target.value })}
                      placeholder="jane@company.com"
                      readOnly={!!modal.editId}
                      style={modal.editId ? { background: 'var(--bg-alt)', color: 'var(--muted)' } : {}}
                    />
                  </div>
                </div>

                {/* Role selector */}
                <div className="fg">
                  <label>Role</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {(Object.keys(ROLE_LABELS) as TeamMemberRole[]).map(r => (
                      <button
                        key={r}
                        type="button"
                        className={modal.role === r ? 'btn-sm btn-primary' : 'btn-sm btn-outline'}
                        onClick={() => setRole(r)}
                      >
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                    Selecting a role sets default permissions below (you can customise them).
                  </div>
                </div>

                {/* Permissions grid */}
                <div className="fg">
                  <label>Permissions</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
                    {PERMISSION_LABELS.map(({ key, label }) => {
                      const enabled = modal.permissions[key]
                      const isFixed = key === 'dashboard'
                      return (
                        <div
                          key={key}
                          onClick={() => togglePerm(key)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 8,
                            border: `1px solid ${enabled ? 'var(--accent)' : 'var(--border)'}`,
                            background: enabled ? 'rgba(74,144,164,0.08)' : 'var(--bg)',
                            cursor: isFixed ? 'not-allowed' : 'pointer',
                            opacity: isFixed ? 0.6 : 1,
                            transition: 'all 0.15s',
                            userSelect: 'none',
                          }}
                        >
                          <div style={{
                            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                            background: enabled ? 'var(--accent)' : 'var(--border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {enabled && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1 }}>✓</span>}
                          </div>
                          <span style={{ fontSize: 13 }}>{label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {!inviteLink && (
              <div className="form-modal-ft">
                <button className="btn btn-outline" onClick={() => { setModal(null); setInviteLink(null) }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : modal.editId ? 'Save Changes' : 'Create Invite Link'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
