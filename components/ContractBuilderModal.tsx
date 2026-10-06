'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { createClient } from '@/lib/supabase/client'
import { uploadAttachment, signedAttachmentUrl } from '@/lib/job-attachments'
import { fmt, jobDisplayTitle, quoteTotal } from '@/lib/utils'
import type { Job, Quote, Contract, ContractFields, ContractPaymentStage } from '@/lib/types'
import { CollapsibleSection } from './assembly-ui'
import { useDraggableModal } from './useDraggableModal'
import { syncFromQuote, contractFingerprint } from '@/lib/contract-sync'
import ModalResizeHandle from './ModalResizeHandle'
import ModalMaximizeButton from './ModalMaximizeButton'

// Field names mirrored from lib/fmb-contract.ts's FIELD map — kept as plain
// strings here (not imported) so this client component never pulls in
// pdf-lib, which is server-only everywhere else in this app.
const F = {
  clientName: 'Client name 2', clientAddress: 'Client address 2', clientTelephone: 'Client telephone 2',
  builderName: 'Builder name 2', builderAddress: 'Builder address 2', builderTelephone: 'Builder telephone 2',
  projectSite: 'Project site 2', worksProvided: 'Works provided 2',
  drawings: 'Drawings 2', estimate: 'Estimate 2', specification: 'Specification 2', otherDocuments: 'Other documents 2',
  workStartDate: 'Work start date 2', completionDate: 'Completion date 2', price: 'Price 3',
  defectsLiabilityMonths: 'Months 2', liability: 'Liability 2', noticeDays: 'Days',
  deposit: 'Deposit 2',
  toiletWc: 'Toilet and WC 2', water: 'Water 2', electricity: 'Electricity 2', storageSpace: 'Storage space 2',
  liveAtPropertyYes: 'Yes - you intend to live at the property while we do the work 4',
  liveAtPropertyNo: "No - you don't intend to live at the property while we do the work 4",
  pcOnlyYes: "Tick if Yes - we're the only builder / Principal Contractor",
  pcOnlyNo: "Tick if No - we're not the only builder / Principal Contractor",
  pcName: 'Enter the name of the competent person designated to carry out the functions of the Principal Contra',
  pcCompany: "Enter the company name that will be Principal Contractor (add your company name if it's you)",
  pcAddress: 'Enter Principal Contractor address', pcTelephone: 'Enter Principal Contractor telephone',
  pdYes: 'Tick if Yes - We are the Building Regulations Principal Designer',
  pdNo: 'Tick if No - We are not the Building Regulations Principal Designer',
  pdName: 'Enter the name of the competent person designated to carry out the functions of the Principal Design',
  pdCompany: 'Enter the company name that will be the Principal Designer',
  pdAddress: 'Enter Principal Contractor address 2', pdTelephone: 'Enter Principal Contractor telephone 2',
  additionalNotes: 'Additional notes 2',
} as const

const MAX_STAGE_PAYMENTS = 28

// Remembers which quote scope the contract's "Works provided" was last copied from, so a later change to the quote can be
// told apart from the builder's own edits to the contract. (Not a PDF field: the contract filler ignores names starting with "_".)
const SCOPE_SNAPSHOT = '_quoteScopeSnapshot'
// Dated changes to the scope agreed after the quote was accepted (copied from the quote's "Changes to the scope"; printed on Schedule 1)
const CHANGES = '_scopeChanges'
const CHANGES_SNAPSHOT = '_quoteScopeChangesSnapshot'
// What the contract looked like when it was last sent to the client (a fingerprint), so the window can say when it has been changed since
const SENT_FP = '_sentFingerprint'

function completionDateFromJob(job: Job): string {
  if (!job.start || !job.weeks) return ''
  const parts = job.start.split('/').map(Number)
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return ''
  const [d, m, y] = parts
  const start = new Date(y, m - 1, d)
  start.setDate(start.getDate() + job.weeks * 7)
  return start.toLocaleDateString('en-GB')
}

function autoFill(job: Job, quote: Quote | undefined, settings: { name: string; address: string; phone: string }): ContractFields {
  const f: ContractFields = {
    [F.builderName]: settings.name || '', [F.builderAddress]: settings.address || '', [F.builderTelephone]: settings.phone || '',
    [F.projectSite]: job.address || '', [F.workStartDate]: job.start || '', [F.completionDate]: completionDateFromJob(job),
  }
  if (quote) {
    f[F.clientName] = quote.customer.name || ''
    f[F.clientAddress] = quote.customer.address || ''
    f[F.clientTelephone] = quote.customer.phone || ''
    f[F.worksProvided] = quote.scope || ''
    f[SCOPE_SNAPSHOT] = quote.scope || ''
    f[CHANGES] = quote.scopeNotes?.trim() || ''
    f[CHANGES_SNAPSHOT] = quote.scopeNotes?.trim() || ''
    f[F.price] = fmt(quoteTotal(quote))
  } else {
    f[F.clientName] = job.client || ''
  }
  return f
}

function Field({ label, value, onChange, textarea, hint, rows }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean; hint?: string; rows?: number
}) {
  return (
    <div className="fg" style={{ margin: 0 }}>
      <label style={{ fontSize: 11 }}>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows ?? 3} style={{ width: '100%', fontSize: 13, fontFamily: 'inherit' }} />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '7px 9px', fontSize: 13, boxSizing: 'border-box' }} />
      )}
      {hint && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

function YesNo({ label, value, onYes, onNo }: { label: string; value: boolean | null; onYes: () => void; onNo: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginBottom: 8 }}>
      <span style={{ flex: 1 }}>{label}</span>
      <button type="button" onClick={onYes} className={`btn-sm ${value === true ? 'btn-primary' : 'btn-outline'}`}>Yes</button>
      <button type="button" onClick={onNo} className={`btn-sm ${value === false ? 'btn-primary' : 'btn-outline'}`}>No</button>
    </div>
  )
}

interface Props { job: Job; quote: Quote | undefined; onClose: () => void }

export default function ContractBuilderModal({ job, quote, onClose }: Props) {
  const sb = createClient()
  const { contracts, settings, clients, addContract, updateContract } = useApp()
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown, onOverlayClick, isMaximized, toggleMaximize } = useDraggableModal()

  const existing = contracts
    .filter(c => c.jobId === job.id)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]

  const [contract, setContract] = useState<Contract | null>(existing && existing.status !== 'signed' ? existing : null)
  const [fields, setFields] = useState<ContractFields>({})
  const [paymentMode, setPaymentMode] = useState<'simple' | 'staged'>('simple')
  const [schedule, setSchedule] = useState<ContractPaymentStage[]>([])
  const [secondClientOn, setSecondClientOn] = useState(false)
  const [secondClientName, setSecondClientName] = useState('')
  const [signName, setSignName] = useState('')
  const [signConfirmed, setSignConfirmed] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<'preview' | 'send' | 'save' | null>(null)
  const [error, setError] = useState('')
  // The quote's scope of works vs the contract's: 'updated' = copied across automatically, 'changed' = the quote has changed but the contract's text was edited by hand
  const [scopeNote, setScopeNote] = useState<'' | 'updated' | 'changed'>('')
  const [changesNote, setChangesNote] = useState<'' | 'updated' | 'changed'>('')   // same, for the changes-to-the-scope notes
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const initedRef = useRef(false)

  // Bootstrap: create the draft row if none exists, then seed local form state.
  useEffect(() => {
    if (initedRef.current) return
    initedRef.current = true
    ;(async () => {
      let c = contract
      if (!c) {
        setCreating(true)
        c = await addContract(job.id, quote?.id ?? null)
        setContract(c)
        setCreating(false)
      }
      let seeded = Object.keys(c.fields || {}).length ? c.fields : autoFill(job, quote, settings)

      // Keep "Works provided" in step with the quote's scope of works. A contract made before the quote's scope was
      // changed would otherwise keep the old text for ever.
      if (quote) {
        const strOf = (k: string) => (typeof seeded[k] === 'string' ? String(seeded[k]) : undefined)
        const sc = syncFromQuote(strOf(F.worksProvided) ?? '', quote.scope || '', strOf(SCOPE_SNAPSHOT))
        seeded = { ...seeded, [F.worksProvided]: sc.value, [SCOPE_SNAPSHOT]: sc.snapshot }
        if (sc.status === 'followed') setScopeNote('updated'); else if (sc.status === 'differs') setScopeNote('changed')

        // Changes to the scope: only when the database has the column (scopeNotes undefined = not added yet)
        if (quote.scopeNotes !== undefined) {
          const ch = syncFromQuote(strOf(CHANGES) ?? '', quote.scopeNotes || '', strOf(CHANGES_SNAPSHOT))
          seeded = { ...seeded, [CHANGES]: ch.value, [CHANGES_SNAPSHOT]: ch.snapshot }
          if (ch.status === 'followed' || ch.status === 'filled') { if (ch.value) setChangesNote('updated') } else if (ch.status === 'differs') setChangesNote('changed')
        }
      }
      setFields(seeded)
      setPaymentMode(c.paymentMode)
      setSchedule(c.paymentSchedule || [])
      setSecondClientOn(!!c.secondClientName)
      setSecondClientName(c.secondClientName || '')
      setSignName(c.builderSignedBy || settings.contact || '')
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Any change to the contract clears the signature tick: the builder must confirm they are signing the changed version
  const signTickReady = useRef(false)
  useEffect(() => {
    if (!signTickReady.current) { signTickReady.current = true; return }
    setSignConfirmed(false)
  }, [fields, paymentMode, schedule, secondClientOn, secondClientName])

  // If the most recent contract for this job is already signed, show that instead of a builder.
  useEffect(() => {
    if (existing?.status === 'signed' && existing.signedAttachmentId) {
      // Resolve a signed URL for the "View signed contract" link — attachments live in
      // job_attachments; we only have the id here, so fetch it the same way any other
      // attachment link in the app does (signedAttachmentUrl needs a storage_path, so
      // look the row up first).
      sb.from('job_attachments').select('storage_path').eq('id', existing.signedAttachmentId).maybeSingle()
        .then(async ({ data }) => {
          if (data?.storage_path) setSignedUrl(await signedAttachmentUrl(sb, data.storage_path))
        })
    }
  }, [existing]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(name: string, value: string) {
    setFields(prev => ({ ...prev, [name]: value }))
  }
  function setBool(name: string, value: boolean) {
    setFields(prev => ({ ...prev, [name]: value }))
  }
  function yesNoValue(yesField: string, noField: string): boolean | null {
    if (fields[yesField]) return true
    if (fields[noField]) return false
    return null
  }
  function setYesNo(yesField: string, noField: string, yes: boolean) {
    setFields(prev => ({ ...prev, [yesField]: yes, [noField]: !yes }))
  }

  async function persist(status?: Contract['status'], extra?: Partial<Contract>) {
    if (!contract) return contract
    const updated: Contract = {
      ...contract,
      fields, paymentMode, paymentSchedule: paymentMode === 'staged' ? schedule : [],
      secondClientName: secondClientOn ? (secondClientName.trim() || null) : null,
      ...(status ? { status } : {}),
      ...extra,
    }
    await updateContract(updated)
    setContract(updated)
    return updated
  }

  // The builder's signature: their own typed name + today's date, once they have ticked to confirm. Shown in the preview and on the copy sent to the client.
  const todayDisplay = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const builderSignature = signName.trim() && signConfirmed ? { name: signName.trim(), signedAt: todayDisplay } : undefined

  async function generatePdf(fieldsToUse: ContractFields) {
    const res = await fetch('/api/generate-contract-pdf', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: fieldsToUse, paymentMode, paymentSchedule: paymentMode === 'staged' ? schedule : [], builderSignature }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error || 'Failed to generate the contract PDF')
    return data.pdf as string  // base64
  }

  async function handlePreview() {
    setError(''); setBusy('preview')
    try {
      await persist()
      const base64 = await generatePdf(fields)
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'application/pdf' })
      window.open(URL.createObjectURL(blob), '_blank')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong generating the preview')
    } finally { setBusy(null) }
  }

  async function handleSaveDraft() {
    setError(''); setBusy('save')
    try { await persist() } catch (err) { setError(err instanceof Error ? err.message : 'Could not save') }
    finally { setBusy(null) }
  }

  async function handleSend() {
    if (!contract) return
    if (!signName.trim() || !signConfirmed) { setError('Please sign as builder first: type your name and tick the confirmation box.'); return }
    setError(''); setBusy('send')
    try {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const base64 = await generatePdf(fields)
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
      const file = new File([bytes], `Contract - ${jobDisplayTitle(job)}.pdf`, { type: 'application/pdf' })

      const result = await uploadAttachment(sb, user.id, job.id, file, 'contract', 'Contract — awaiting signature')
      if ('error' in result) throw new Error(result.error)

      // remember exactly what the client now holds, so a later change can be flagged as "not sent yet"
      const fp = contractFingerprint(fields, paymentMode, paymentMode === 'staged' ? schedule : [], secondClientOn ? secondClientName : null, [CHANGES])
      const sentFields: ContractFields = { ...fields, [SENT_FP]: fp }
      setFields(sentFields)
      await persist('sent', {
        fields: sentFields,
        draftAttachmentId: result.attachment.id,
        builderSignedAt: new Date().toISOString(),
        builderSignedBy: signName.trim(),
      })

      // Tell the client by email (with a one-click link into their portal) and WhatsApp where that's set up.
      // The contract is already sent and visible in their portal, so a problem here only needs reporting, not undoing.
      const savedClient = clients.find(c => c.name?.toLowerCase() === (job.client || '').toLowerCase())
      const clientEmail = savedClient?.email || quote?.customer?.email || ''
      const clientPhone = savedClient?.phone || quote?.customer?.phone || ''
      let told = false
      let reason = ''
      if (!clientEmail && !clientPhone) {
        reason = 'there is no email address or phone number saved for the client'
      } else {
        try {
          const res = await fetch('/api/notify-client', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'contract_sent',
              clientName: savedClient?.name || job.client || quote?.customer?.name || 'there',
              clientEmail: clientEmail || undefined, clientPhone: clientPhone || undefined, clientId: savedClient?.id,
              jobType: jobDisplayTitle(job), jobAddress: job.address,
              secondClientName: secondClientOn ? (secondClientName.trim() || undefined) : undefined,
              companyName: settings.name, companyPhone: settings.phone, companyEmail: settings.email,
              portalUrl: window.location.origin + '/portal/login',
            }),
          })
          const body = await res.json().catch(() => ({}))
          told = !!(body?.sent?.email || body?.sent?.whatsapp)
          if (!told) reason = (body?.sent?.errors?.length ? body.sent.errors.join('; ') : body?.error) || 'the message could not be sent'
        } catch { reason = 'the message could not be sent' }
      }
      if (!told) {
        window.alert('The contract has been sent and is waiting in the client’s portal, but they have NOT been emailed: ' + reason + '.\n\nPlease tell them to open their portal to review and sign it.')
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong sending the contract')
    } finally { setBusy(null) }
  }

  function addStage() {
    if (schedule.length >= MAX_STAGE_PAYMENTS) return
    setSchedule(prev => [...prev, { date: '', amount: 0 }])
  }
  function updateStage(i: number, patch: Partial<ContractPaymentStage>) {
    setSchedule(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function removeStage(i: number) {
    setSchedule(prev => prev.filter((_, idx) => idx !== i))
  }

  const readOnlySigned = existing?.status === 'signed'

  return (
    <div className="modal-overlay" onClick={e => onOverlayClick(e, onClose)}>
      <div ref={boxRef} className="form-modal" style={{ maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column', ...draggableStyle }}>
        <div className="form-modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>📝 FMB Contract</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
              {jobDisplayTitle(job)} — {job.client} · {job.address}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ModalMaximizeButton isMaximized={isMaximized} onClick={toggleMaximize} />
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="form-modal-bd" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {creating && <div style={{ color: 'var(--muted)' }}>Setting up…</div>}

          {readOnlySigned && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ Signed</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                {existing?.clientSignedBy && <>Signed by {existing.clientSignedBy}{existing.client2SignedBy ? ` and ${existing.client2SignedBy}` : ''}</>}
                {existing?.clientSignedAt && <> on {new Date(existing.clientSignedAt).toLocaleDateString('en-GB')}</>}
              </div>
              {signedUrl && <a className="btn-sm btn-outline" href={signedUrl} target="_blank" rel="noreferrer">View signed contract →</a>}
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                To raise a new contract for this job (e.g. after a variation), close this and reopen — a fresh draft will be started.
              </div>
            </div>
          )}

          {!readOnlySigned && contract && (
            <>
              {contract.status === 'sent' && (
                <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#5d4037' }}>
                  📤 Sent — waiting on the client{contract.secondClientName ? ' and second client' : ''} to sign in their portal.
                  Editing below and sending again will replace the copy they're reviewing.
                </div>
              )}
              {error && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: '#991b1b' }}>
                  ⚠️ {error}
                </div>
              )}
              {contract.status === 'sent' && typeof fields[SENT_FP] === 'string' && fields[SENT_FP] !== contractFingerprint(fields, paymentMode, paymentMode === 'staged' ? schedule : [], secondClientOn ? secondClientName : null, [CHANGES]) && (
                <div style={{ background: '#fff3cd', border: '1px solid #ffda6a', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#664d03', lineHeight: 1.5 }}>
                  ⚠️ <strong>You have changed this contract since you sent it.</strong> Your client still has the earlier copy in their portal. The changes only reach them when you click <strong>Send for signature</strong> again (sign as builder, tick the box, then send).
                </div>
              )}
              {changesNote === 'updated' && quote && (
                <div style={{ background: 'rgba(122,181,51,0.12)', border: '1px solid rgba(122,181,51,0.45)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  ✓ The &ldquo;Changes to the scope&rdquo; from quote <strong>{quote.ref}</strong> have been added to this contract. They print under the scope on Schedule 1.
                </div>
              )}
              {changesNote === 'changed' && quote && (
                <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1 }}>
                    ⚠️ The &ldquo;Changes to the scope&rdquo; on quote <strong>{quote.ref}</strong> are different from the ones on this contract. The contract still has its own wording.
                  </span>
                  <button type="button" className="btn-sm btn-primary" onClick={() => { setFields(prev => ({ ...prev, [CHANGES]: quote.scopeNotes?.trim() || '', [CHANGES_SNAPSHOT]: quote.scopeNotes?.trim() || '' })); setChangesNote('') }}>Use the quote&rsquo;s changes</button>
                </div>
              )}
              {!quote && (
                <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  This job has no linked quote, so the scope of works can&rsquo;t follow a quote. Type it into &ldquo;Works provided&rdquo; under Site, Scope &amp; Documents.
                </div>
              )}
              {scopeNote === 'updated' && quote && (
                <div style={{ background: 'rgba(122,181,51,0.12)', border: '1px solid rgba(122,181,51,0.45)', borderRadius: 8, padding: '10px 14px', fontSize: 12 }}>
                  ✓ The scope of works on quote <strong>{quote.ref}</strong> had changed, so the contract&rsquo;s &ldquo;Works provided&rdquo; has been updated to match it.
                </div>
              )}
              {scopeNote === 'changed' && quote && (
                <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 8, padding: '10px 14px', fontSize: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ flex: 1 }}>
                    ⚠️ The scope of works on quote <strong>{quote.ref}</strong> is different from the &ldquo;Works provided&rdquo; on this contract. The contract still has its own wording.
                  </span>
                  <button type="button" className="btn-sm btn-primary" onClick={() => { setFields(prev => ({ ...prev, [F.worksProvided]: quote.scope || '', [SCOPE_SNAPSHOT]: quote.scope || '' })); setScopeNote('') }}>Use the quote&rsquo;s scope</button>
                </div>
              )}

              <CollapsibleSection title="Client & Builder" defaultOpen>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <Field label="Client name" value={String(fields[F.clientName] || '')} onChange={v => set(F.clientName, v)} />
                  <Field label="Client telephone" value={String(fields[F.clientTelephone] || '')} onChange={v => set(F.clientTelephone, v)} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <Field label="Client address" value={String(fields[F.clientAddress] || '')} onChange={v => set(F.clientAddress, v)} textarea />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input type="checkbox" checked={secondClientOn} onChange={e => setSecondClientOn(e.target.checked)} id="secondClientOn" />
                  <label htmlFor="secondClientOn" style={{ fontSize: 12 }}>This job has a second (joint) client who also needs to sign</label>
                </div>
                {secondClientOn && (
                  <div style={{ marginBottom: 10 }}>
                    <Field label="Second client name" value={secondClientName} onChange={setSecondClientName} />
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Builder name" value={String(fields[F.builderName] || '')} onChange={v => set(F.builderName, v)} />
                  <Field label="Builder telephone" value={String(fields[F.builderTelephone] || '')} onChange={v => set(F.builderTelephone, v)} />
                </div>
                <div style={{ marginTop: 10 }}>
                  <Field label="Builder address" value={String(fields[F.builderAddress] || '')} onChange={v => set(F.builderAddress, v)} textarea />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Site, Scope & Documents">
                <div style={{ marginBottom: 10 }}>
                  <Field label="Project site" value={String(fields[F.projectSite] || '')} onChange={v => set(F.projectSite, v)} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <Field label="Works provided (scope)" value={String(fields[F.worksProvided] || '')} onChange={v => { set(F.worksProvided, v); setScopeNote('') }} textarea rows={8}
                    hint="Comes from the quote's Scope of Works. A scope too long for the contract's one-line box is printed in full on a Schedule 1 page at the end of the contract." />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <Field label="Changes to the scope (agreed after the quote was accepted)" value={String(fields[CHANGES] || '')} onChange={v => { set(CHANGES, v); setChangesNote('') }} textarea rows={4}
                    hint="Printed under the scope on Schedule 1. Comes from the quote's Changes to the scope box; you can also type here. Leave empty if there are none." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Drawings referenced" value={String(fields[F.drawings] || '')} onChange={v => set(F.drawings, v)} hint="Plans and documents uploaded to this job (Files on the Jobs page) show beside the contract on the client's Contracts tab." />
                  <Field label="Estimate referenced" value={String(fields[F.estimate] || '')} onChange={v => set(F.estimate, v)} />
                  <Field label="Specification referenced" value={String(fields[F.specification] || '')} onChange={v => set(F.specification, v)} />
                  <Field label="Other documents" value={String(fields[F.otherDocuments] || '')} onChange={v => set(F.otherDocuments, v)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Dates & Price">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <Field label="Work start date" value={String(fields[F.workStartDate] || '')} onChange={v => set(F.workStartDate, v)} />
                  <Field label="Completion date" value={String(fields[F.completionDate] || '')} onChange={v => set(F.completionDate, v)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Contract price" value={String(fields[F.price] || '')} onChange={v => set(F.price, v)} />
                  <Field label="Notice period (days)" value={String(fields[F.noticeDays] || '')} onChange={v => set(F.noticeDays, v)}
                    hint="How many days' notice either side must give to end the contract" />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Defects Liability & Insurance">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Defects liability period (months)" value={String(fields[F.defectsLiabilityMonths] || '')} onChange={v => set(F.defectsLiabilityMonths, v)} />
                  <Field label="Insurance liability" value={String(fields[F.liability] || '')} onChange={v => set(F.liability, v)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="CDM Roles (Building Regulations)">
                <YesNo label="We are the only builder / Principal Contractor" value={yesNoValue(F.pcOnlyYes, F.pcOnlyNo)}
                  onYes={() => setYesNo(F.pcOnlyYes, F.pcOnlyNo, true)} onNo={() => setYesNo(F.pcOnlyYes, F.pcOnlyNo, false)} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <Field label="Principal Contractor — competent person" value={String(fields[F.pcName] || '')} onChange={v => set(F.pcName, v)} />
                  <Field label="Principal Contractor — company" value={String(fields[F.pcCompany] || '')} onChange={v => set(F.pcCompany, v)} />
                  <Field label="Principal Contractor — address" value={String(fields[F.pcAddress] || '')} onChange={v => set(F.pcAddress, v)} />
                  <Field label="Principal Contractor — telephone" value={String(fields[F.pcTelephone] || '')} onChange={v => set(F.pcTelephone, v)} />
                </div>
                <YesNo label="We are the Building Regulations Principal Designer" value={yesNoValue(F.pdYes, F.pdNo)}
                  onYes={() => setYesNo(F.pdYes, F.pdNo, true)} onNo={() => setYesNo(F.pdYes, F.pdNo, false)} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <Field label="Principal Designer — competent person" value={String(fields[F.pdName] || '')} onChange={v => set(F.pdName, v)} />
                  <Field label="Principal Designer — company" value={String(fields[F.pdCompany] || '')} onChange={v => set(F.pdCompany, v)} />
                  <Field label="Principal Designer — address" value={String(fields[F.pdAddress] || '')} onChange={v => set(F.pdAddress, v)} />
                  <Field label="Principal Designer — telephone" value={String(fields[F.pdTelephone] || '')} onChange={v => set(F.pdTelephone, v)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Payment Terms">
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button type="button" className={`btn-sm ${paymentMode === 'simple' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPaymentMode('simple')}>Deposit + balance</button>
                  <button type="button" className={`btn-sm ${paymentMode === 'staged' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPaymentMode('staged')}>Staged schedule</button>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <Field label="Deposit" value={String(fields[F.deposit] || '')} onChange={v => set(F.deposit, v)} />
                </div>
                {paymentMode === 'staged' && (
                  <div>
                    {schedule.map((stage, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <input placeholder="Date (dd/mm/yyyy)" value={stage.date} onChange={e => updateStage(i, { date: e.target.value })}
                          style={{ flex: 1, padding: '6px 8px', fontSize: 12 }} />
                        <input placeholder="Amount" type="number" value={stage.amount || ''} onChange={e => updateStage(i, { amount: Number(e.target.value) || 0 })}
                          style={{ width: 110, padding: '6px 8px', fontSize: 12 }} />
                        <button type="button" className="btn-sm btn-danger" onClick={() => removeStage(i)}>✕</button>
                      </div>
                    ))}
                    {schedule.length < MAX_STAGE_PAYMENTS && (
                      <button type="button" className="btn-sm btn-outline" onClick={addStage}>+ Add stage</button>
                    )}
                  </div>
                )}
              </CollapsibleSection>

              <CollapsibleSection title="Site Facilities">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 10 }}>
                  {[[F.toiletWc, 'Toilet & WC'], [F.water, 'Water'], [F.electricity, 'Electricity'], [F.storageSpace, 'Storage space']].map(([field, label]) => (
                    <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <input type="checkbox" checked={!!fields[field]} onChange={e => setBool(field, e.target.checked)} />
                      {label}
                    </label>
                  ))}
                </div>
                <YesNo label="Client intends to live at the property during the work" value={yesNoValue(F.liveAtPropertyYes, F.liveAtPropertyNo)}
                  onYes={() => setYesNo(F.liveAtPropertyYes, F.liveAtPropertyNo, true)} onNo={() => setYesNo(F.liveAtPropertyYes, F.liveAtPropertyNo, false)} />
              </CollapsibleSection>

              <CollapsibleSection title="Additional Notes">
                <Field label="Additional notes" value={String(fields[F.additionalNotes] || '')} onChange={v => set(F.additionalNotes, v)} textarea />
              </CollapsibleSection>

              <div style={{ border: '1.5px solid var(--border)', borderRadius: 8, padding: '12px 14px', margin: '14px 0 12px', background: signConfirmed && signName.trim() ? 'rgba(122,181,51,0.10)' : 'rgba(0,0,0,0.02)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>✍️ Sign as builder</div>
                <Field label="Your full name (this is your signature)" value={signName} onChange={setSignName} />
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, margin: '8px 0 4px', cursor: 'pointer', lineHeight: 1.45 }}>
                  <input type="checkbox" checked={signConfirmed} onChange={e => setSignConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>I have checked the contract details and I sign this contract as the builder, electronically, on {todayDisplay}.</span>
                </label>
                <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                  {builderSignature ? <>The contract will show: <strong>{builderSignature.name} (signed electronically {builderSignature.signedAt})</strong>. Use “Generate &amp; Preview” to see it before sending.</>
                    : 'Type your name and tick the box to sign. “Send for signature” unlocks once you have. If you change anything afterwards, you’ll be asked to tick again.'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                <button className="btn-sm btn-outline" onClick={handleSaveDraft} disabled={busy !== null}>
                  {busy === 'save' ? '…' : '💾 Save draft'}
                </button>
                <button className="btn-sm btn-outline" onClick={handlePreview} disabled={busy !== null}>
                  {busy === 'preview' ? '⏳ Generating…' : '👁 Generate & Preview'}
                </button>
                <button className="btn-sm btn-primary" onClick={handleSend} disabled={busy !== null || !builderSignature} title={builderSignature ? '' : 'Sign as builder first'}>
                  {busy === 'send' ? '⏳ Sending…' : '📤 Send for signature'}
                </button>
              </div>
            </>
          )}
        </div>
        <ModalResizeHandle onMouseDown={onResizeMouseDown} />
      </div>
    </div>
  )
}
