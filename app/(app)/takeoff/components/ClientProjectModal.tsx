'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TakeoffProject, TakeoffClient } from '@/lib/takeoff-types'
import { JOB_TYPES } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string
  user_id: string
  name: string
  email?: string | null
  phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  town?: string | null
  county?: string | null
  postcode?: string | null
  notes?: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  project: TakeoffProject
  onSave: (updated: TakeoffProject) => void
  userId: string
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildAddressSnapshot(c: ClientRow): string {
  return [c.address_line1, c.address_line2, c.town, c.county, c.postcode]
    .filter(Boolean)
    .join(', ')
}

function clientRowToTakeoffClient(c: ClientRow): TakeoffClient {
  return {
    id:      c.id,
    name:    c.name,
    email:   c.email ?? undefined,
    phone:   c.phone ?? undefined,
    address: buildAddressSnapshot(c),
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClientProjectModal({ open, onClose, project, onSave, userId }: Props) {
  const supabase = createClient()

  // -- existing clients
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientsLoading, setClientsLoading] = useState(false)

  // -- mode
  const [mode, setMode] = useState<'existing' | 'new'>('existing')

  // -- existing client selection
  const [selectedClientId, setSelectedClientId] = useState<string>(project.clientId ?? '')

  // -- new client form
  const [newName, setNewName]           = useState('')
  const [newEmail, setNewEmail]         = useState('')
  const [newPhone, setNewPhone]         = useState('')
  const [newAddrLine1, setNewAddrLine1] = useState('')
  const [newAddrLine2, setNewAddrLine2] = useState('')
  const [newTown, setNewTown]           = useState('')
  const [newCounty, setNewCounty]       = useState('')
  const [newPostcode, setNewPostcode]   = useState('')
  const [newNotes, setNewNotes]         = useState('')

  // -- project fields
  const [projectName, setProjectName]   = useState(project.projectName ?? project.name ?? '')
  const [takeoffRef, setTakeoffRef]     = useState(project.takeoffRef ?? '')
  const [siteAddress, setSiteAddress]   = useState(project.siteAddress ?? project.address ?? '')
  const [jobType, setJobType]           = useState(project.jobType ?? '')

  // -- saving
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // -- fetch clients from both takeoff_clients and main clients tables
  useEffect(() => {
    if (!open) return
    setClientsLoading(true)
    Promise.all([
      supabase.from('takeoff_clients').select('*').eq('user_id', userId).order('name'),
      supabase.from('clients').select('id, name, email, phone, address, notes').eq('user_id', userId).order('name'),
    ]).then(([takeoffRes, mainRes]) => {
      setClientsLoading(false)
      const takeoffClients: ClientRow[] = (takeoffRes.data ?? []) as ClientRow[]
      // Merge main clients — adapt field names and skip duplicates by name
      const takeoffNames = new Set(takeoffClients.map(c => c.name.toLowerCase()))
      const mainClients: ClientRow[] = (mainRes.data ?? [])
        .filter((c: {name: string}) => !takeoffNames.has(c.name.toLowerCase()))
        .map((c: {id: string; name: string; email?: string|null; phone?: string|null; address?: string|null; notes?: string|null}) => ({
          id:           c.id,
          user_id:      userId,
          name:         c.name,
          email:        c.email ?? null,
          phone:        c.phone ?? null,
          address_line1:c.address ?? null,  // main clients store full address in one field
        } as ClientRow))
      setClients([...takeoffClients, ...mainClients])
    })
  }, [open, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // -- pre-fill site address when selecting an existing client
  useEffect(() => {
    if (mode !== 'existing' || !selectedClientId) return
    const c = clients.find(c => c.id === selectedClientId)
    if (c) setSiteAddress(buildAddressSnapshot(c))
  }, [selectedClientId, mode, clients])

  // -- pre-fill site address when new client address changes
  useEffect(() => {
    if (mode !== 'new') return
    const addr = [newAddrLine1, newAddrLine2, newTown, newCounty, newPostcode]
      .filter(Boolean)
      .join(', ')
    setSiteAddress(addr)
  }, [newAddrLine1, newAddrLine2, newTown, newCounty, newPostcode, mode])

  if (!open) return null

  // ── handlers ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setError(null)

    if (mode === 'new' && !newName.trim()) {
      setError('Client name is required.')
      return
    }

    setSaving(true)

    let clientSnapshot: TakeoffClient | undefined
    let clientId: string | undefined

    if (mode === 'new') {
      const fullAddress = [newAddrLine1, newAddrLine2, newTown, newCounty, newPostcode]
        .filter(Boolean).join(', ')

      // Insert into takeoff_clients (takeoff-specific records)
      const { data: inserted, error: insertErr } = await supabase
        .from('takeoff_clients')
        .insert({
          user_id:      userId,
          name:         newName.trim(),
          email:        newEmail.trim() || null,
          phone:        newPhone.trim() || null,
          address_line1: newAddrLine1.trim() || null,
          address_line2: newAddrLine2.trim() || null,
          town:         newTown.trim() || null,
          county:       newCounty.trim() || null,
          postcode:     newPostcode.trim() || null,
          notes:        newNotes.trim() || null,
        })
        .select()
        .single()

      if (insertErr || !inserted) {
        setError(insertErr?.message ?? 'Failed to create client.')
        setSaving(false)
        return
      }

      clientId = inserted.id
      clientSnapshot = clientRowToTakeoffClient(inserted as ClientRow)

      // Also insert into the main clients table so the client appears
      // in the Quote page client list and is reusable across the app.
      const nameParts = newName.trim().split(' ')
      await supabase.from('clients').insert({
        user_id:    userId,
        name:       newName.trim(),
        first_name: nameParts.slice(0, -1).join(' ') || nameParts[0] || newName.trim(),
        last_name:  nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
        email:      newEmail.trim() || null,
        phone:      newPhone.trim() || null,
        address:    fullAddress || null,
        notes:      newNotes.trim() || null,
        added_from: 'takeoff',
        updated_at: new Date().toISOString(),
      })
      // (error from main clients insert is non-blocking — takeoff still saves)
    } else if (selectedClientId) {
      const c = clients.find(c => c.id === selectedClientId)
      if (c) {
        clientId = c.id
        clientSnapshot = clientRowToTakeoffClient(c)
      }
    }

    const updated: TakeoffProject = {
      ...project,
      name:        projectName.trim() || project.name,
      projectName: projectName.trim() || undefined,
      takeoffRef:  takeoffRef.trim() || undefined,
      siteAddress: siteAddress.trim() || undefined,
      address:     siteAddress.trim() || project.address,
      jobType:     jobType || project.jobType,
      clientId,
      client:      clientSnapshot,
      updatedAt:   new Date().toISOString(),
    }

    setSaving(false)
    onSave(updated)
    onClose()
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          padding: '28px 32px',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1a1a2e' }}>
            Client &amp; Project Details
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '22px', color: '#666', lineHeight: 1,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Section: Client */}
        <Section title="Client">
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <ModeButton active={mode === 'existing'} onClick={() => setMode('existing')}>
              Select existing client
            </ModeButton>
            <ModeButton active={mode === 'new'} onClick={() => setMode('new')}>
              New client
            </ModeButton>
          </div>

          {mode === 'existing' && (
            clientsLoading ? (
              <p style={{ color: '#888', fontSize: '14px' }}>Loading clients…</p>
            ) : clients.length === 0 ? (
              <p style={{ color: '#888', fontSize: '14px' }}>
                No clients yet.{' '}
                <button
                  onClick={() => setMode('new')}
                  style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 0, fontSize: '14px', textDecoration: 'underline' }}
                >
                  Add a new client
                </button>
              </p>
            ) : (
              <Field label="Client">
                <select
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  style={selectStyle}
                >
                  <option value="">— select client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            )
          )}

          {mode === 'new' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Name *">
                <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Client name" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Email">
                  <input style={inputStyle} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" />
                </Field>
                <Field label="Phone">
                  <input style={inputStyle} type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="07700 000000" />
                </Field>
              </div>
              <Field label="Address Line 1">
                <input style={inputStyle} value={newAddrLine1} onChange={e => setNewAddrLine1(e.target.value)} placeholder="Street address" />
              </Field>
              <Field label="Address Line 2">
                <input style={inputStyle} value={newAddrLine2} onChange={e => setNewAddrLine2(e.target.value)} placeholder="Apt, suite, etc. (optional)" />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <Field label="Town">
                  <input style={inputStyle} value={newTown} onChange={e => setNewTown(e.target.value)} placeholder="Town" />
                </Field>
                <Field label="County">
                  <input style={inputStyle} value={newCounty} onChange={e => setNewCounty(e.target.value)} placeholder="County" />
                </Field>
                <Field label="Postcode">
                  <input style={inputStyle} value={newPostcode} onChange={e => setNewPostcode(e.target.value)} placeholder="SW1A 1AA" />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                  placeholder="Any notes about this client…"
                />
              </Field>
            </div>
          )}
        </Section>

        {/* Section: Project */}
        <Section title="Project">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Project Name">
                <input style={inputStyle} value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="e.g. Smith Rear Extension" />
              </Field>
              <Field label="Takeoff Ref">
                <input style={inputStyle} value={takeoffRef} onChange={e => setTakeoffRef(e.target.value)} placeholder="e.g. TO-2024-001" />
              </Field>
            </div>
            <Field label="Site Address">
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: '64px' }}
                value={siteAddress}
                onChange={e => setSiteAddress(e.target.value)}
                placeholder="Site address (pre-filled from client address)"
              />
            </Field>
            <Field label="Job Type">
              <select style={selectStyle} value={jobType} onChange={e => setJobType(e.target.value)}>
                <option value="">— select job type —</option>
                {JOB_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
        </Section>

        {/* Error */}
        {error && (
          <p style={{ color: '#dc2626', fontSize: '13px', marginTop: '8px', marginBottom: 0 }}>
            {error}
          </p>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: '7px',
              border: '1px solid #d1d5db', background: '#fff',
              cursor: 'pointer', fontSize: '14px', color: '#374151',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 22px', borderRadius: '7px',
              border: 'none', background: saving ? '#a5b4fc' : '#4f46e5',
              color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
              fontSize: '14px', fontWeight: 600,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h3 style={{
        margin: '0 0 14px 0', fontSize: '13px', fontWeight: 600,
        color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em',
      }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>{label}</label>
      {children}
    </div>
  )
}

function ModeButton({
  active, onClick, children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: '6px', fontSize: '13px',
        fontWeight: active ? 600 : 400,
        border: active ? '2px solid #4f46e5' : '2px solid #e5e7eb',
        background: active ? '#eef2ff' : '#f9fafb',
        color: active ? '#4f46e5' : '#374151',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '14px',
  color: '#1a1a2e',
  background: '#fff',
  boxSizing: 'border-box',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'auto',
}
