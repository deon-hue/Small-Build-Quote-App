'use client'

/**
 * Quick Quote
 *
 * Streamlined quote creation:
 *   1. Customer details (name required; address, email, phone optional)
 *   2. Job type
 *   3. Brief notes → AI writes scope of works
 *   4. Enter sell price + estimated cost (both required)
 *   5. Save → single "Project Works / Lump Sum" phase quote
 *
 * No phase breakdown is generated. Cost tracking works via:
 *   estCost stored as the `other` item value;
 *   markup back-calculated so calcPhaseSell == sellPrice.
 */

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import { JOB_TYPES, fmt } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import ScopeChat from '@/components/ScopeChat'

let itemId = 1000

export default function QuickQuotePage() {
  const { clients, addQuote, upsertClientFromQuote, loading } = useApp()
  const router = useRouter()

  // ── Customer ──────────────────────────────────────────────────────────────
  const [custName,  setCustName]  = useState('')
  const [custAddr,  setCustAddr]  = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [clientDrop,   setClientDrop]   = useState(false)

  // ── Job ───────────────────────────────────────────────────────────────────
  const [jobType, setJobType] = useState('Rear Extension')
  const [notes,   setNotes]   = useState('')   // user's brief description (optional)

  // ── AI scope ──────────────────────────────────────────────────────────────
  const [scope,           setScope]           = useState('')
  const [generatingScope, setGeneratingScope] = useState(false)
  const [scopeGenerated,  setScopeGenerated]  = useState(false)

  // ── Pricing ───────────────────────────────────────────────────────────────
  const [sellPriceStr, setSellPriceStr] = useState('')
  const [estCostStr,   setEstCostStr]   = useState('')
  const [vatOn,        setVatOn]        = useState(true)

  // ── UI state ──────────────────────────────────────────────────────────────
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [showChat, setShowChat] = useState(false)

  // ── Derived numbers ───────────────────────────────────────────────────────
  const sellNum  = parseFloat(sellPriceStr.replace(/,/g, '')) || 0
  const costNum  = parseFloat(estCostStr.replace(/,/g, ''))   || 0
  const markup   = costNum > 0 ? ((sellNum / costNum) - 1) * 100 : 0
  const margin   = sellNum - costNum
  const marginPct = sellNum > 0 ? (margin / sellNum) * 100 : 0
  const vatAmt   = vatOn ? sellNum * 0.2 : 0
  const totalInc = sellNum + vatAmt

  const canSave = !!(custName.trim() && sellNum > 0 && costNum > 0 && scope.trim())

  // ── Client autocomplete ───────────────────────────────────────────────────
  const filteredClients = clientSearch.trim()
    ? clients.filter(c => {
        const q = clientSearch.toLowerCase()
        return (c.name || '').toLowerCase().includes(q)
          || (c.email || '').toLowerCase().includes(q)
      })
    : clients.slice(0, 8)

  function selectClient(cid: string) {
    const c = clients.find(x => x.id === cid)
    if (!c) return
    setCustName(c.name || '')
    setCustEmail(c.email || '')
    setCustPhone(c.phone || '')
    setCustAddr(c.address || '')
    setClientDrop(false)
    setClientSearch('')
  }

  // ── Generate scope ────────────────────────────────────────────────────────
  async function generateScope() {
    setGeneratingScope(true)
    setError('')
    try {
      const res = await fetch('/api/generate-scope', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          jobType,
          address: custAddr,
          phases:  notes ? [notes] : [],
        }),
      })
      const data = await res.json()
      if (data.scope) {
        setScope(data.scope)
        setScopeGenerated(true)
      } else {
        setError('Could not generate scope — check your API key in Company Setup.')
      }
    } catch {
      setError('Failed to generate scope. Check your connection.')
    } finally {
      setGeneratingScope(false)
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!canSave) return
    if (costNum >= sellNum) {
      const ok = confirm(
        `Your estimated cost (${fmt(costNum)}) is ≥ your sell price (${fmt(sellNum)}) — no profit margin.\n\nContinue anyway?`
      )
      if (!ok) return
    }
    setSaving(true)
    setError('')
    try {
      const customer = { name: custName.trim(), address: custAddr.trim(), email: custEmail.trim(), phone: custPhone.trim() }

      // Single lump-sum phase — estimated cost stored in `other`; markup derived to hit sellNum
      const markupPct = costNum > 0 ? ((sellNum / costNum) - 1) * 100 : 0

      const lumpPhase = {
        id: ++itemId,
        phase: 'Lump Sum',
        parentPhase: 'Project Works',
        items: [
          { id: ++itemId, desc: 'Labour',                  qty: 1, unit: 'Item', labour: 0,       materials: 0, plantHire: 0, subcontractors: 0, other: 0,       notes: '', itemType: 'labour'         as const },
          { id: ++itemId, desc: 'Materials',               qty: 1, unit: 'Item', labour: 0,       materials: 0, plantHire: 0, subcontractors: 0, other: 0,       notes: '', itemType: 'materials'      as const },
          { id: ++itemId, desc: 'Plant Hire',              qty: 1, unit: 'Item', labour: 0,       materials: 0, plantHire: 0, subcontractors: 0, other: 0,       notes: '', itemType: 'plant'          as const },
          { id: ++itemId, desc: 'Subcontractors',          qty: 1, unit: 'Item', labour: 0,       materials: 0, plantHire: 0, subcontractors: 0, other: 0,       notes: '', itemType: 'subcontractors' as const },
          { id: ++itemId, desc: 'Estimated Project Cost',  qty: 1, unit: 'Item', labour: 0,       materials: 0, plantHire: 0, subcontractors: 0, other: costNum,
            notes: `Sell £${sellNum.toLocaleString('en-GB', { minimumFractionDigits: 2 })} | Cost £${costNum.toLocaleString('en-GB', { minimumFractionDigits: 2 })} | Margin ${marginPct.toFixed(1)}%`,
            itemType: 'other' as const },
        ],
        estimatorItems: [],
        useEstimator:   false as const,
      }

      const newQuote = await addQuote({
        status:         'pending',
        jobType,
        markup:         markupPct,
        vatIncluded:    vatOn,
        scope,
        photo:          '',
        convertedToJob: false,
        lastEdited:     '',
        customer,
        phases:         [lumpPhase],
        quoteSource:    'quick',
      })
      await upsertClientFromQuote(customer)
      alert(`Quick quote saved! Reference: ${newQuote.ref}`)
      router.push('/quotes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quote.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '8px 0 48px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>Quick Quote</h1>
          <span style={{ fontSize: 11, background: '#f0f4f8', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: 20, padding: '2px 10px', fontWeight: 600 }}>
            Lump Sum
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
          AI writes the scope of works — you enter one sell price and estimated cost. No phase breakdown needed.
        </p>
      </div>

      {/* ── Section 1: Customer ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 14 }}>
          Customer Details
        </div>

        {/* Client picker */}
        <div style={{ marginBottom: 12, position: 'relative' }}>
          <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
            Search existing clients
          </label>
          <input
            value={clientSearch}
            onChange={e => { setClientSearch(e.target.value); setClientDrop(true) }}
            onFocus={() => setClientDrop(true)}
            placeholder="Type a name or email…"
            style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
          />
          {clientDrop && filteredClients.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
              {filteredClients.map(c => (
                <div
                  key={c.id}
                  onClick={() => selectClient(c.id)}
                  style={{ padding: '9px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f0f0f0' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8faf2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  {c.email && <span style={{ color: 'var(--muted)', marginLeft: 8, fontSize: 12 }}>{c.email}</span>}
                </div>
              ))}
              <div
                onClick={() => setClientDrop(false)}
                style={{ padding: '7px 14px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', textAlign: 'center', borderTop: '1px solid #f0f0f0' }}
              >
                Close
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Client Name <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <input
              value={custName}
              onChange={e => setCustName(e.target.value)}
              placeholder="Full name"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Email</label>
            <input
              type="email"
              value={custEmail}
              onChange={e => setCustEmail(e.target.value)}
              placeholder="client@email.com"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Site Address</label>
            <input
              value={custAddr}
              onChange={e => setCustAddr(e.target.value)}
              placeholder="123 Main Street…"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Phone</label>
            <input
              value={custPhone}
              onChange={e => setCustPhone(e.target.value)}
              placeholder="07…"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
        </div>
      </div>

      {/* ── Section 2: Job ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 14 }}>
          Job Details
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Job Type</label>
            <select
              value={jobType}
              onChange={e => setJobType(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 6, outline: 'none', fontFamily: 'inherit' }}
            >
              {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Brief Description <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional — helps AI)</span>
            </label>
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. single-storey rear extension, open plan kitchen-diner…"
              style={{ width: '100%', padding: '8px 10px', fontSize: 13, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit' }}
            />
          </div>
        </div>
      </div>

      {/* ── Section 3: Scope ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8' }}>
            Scope of Works <span style={{ color: '#e74c3c' }}>*</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowChat(true)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none',
                background: '#2b3a2b', color: '#fff',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              💬 Chat with AI
            </button>
            <button
              onClick={generateScope}
              disabled={generatingScope}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: '1.5px solid #7c3aed', background: 'transparent', color: '#7c3aed',
                cursor: generatingScope ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: generatingScope ? 0.6 : 1,
              }}
            >
              {generatingScope ? '⏳ Writing…' : '✦ Quick Generate'}
            </button>
          </div>
        </div>

        {!scope && !generatingScope && (
          <div style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 10, fontStyle: 'italic' }}>
            <strong style={{ color: '#2b3a2b' }}>💬 Chat with AI</strong> — have a conversation to build the perfect scope. Supports voice &amp; plan uploads.
            <br />
            <strong style={{ color: '#7c3aed' }}>✦ Quick Generate</strong> — instant one-shot scope from your job type and description above.
          </div>
        )}

        {scopeGenerated && scope && (
          <div style={{ background: '#f5f0ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#6d28d9', marginBottom: 10, fontWeight: 600 }}>
            ✦ AI-generated — review and edit below if needed
          </div>
        )}

        <textarea
          value={scope}
          onChange={e => { setScope(e.target.value); setScopeGenerated(false) }}
          rows={5}
          placeholder="Describe the scope of works for this project…"
          style={{
            width: '100%', padding: '10px 12px', fontSize: 13, boxSizing: 'border-box',
            border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit',
            resize: 'vertical', minHeight: 100, lineHeight: 1.6,
          }}
        />
      </div>

      {/* ── Section 4: Pricing ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 14 }}>
          Pricing
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          {/* Sell price */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Quote Price (ex. VAT) <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontWeight: 600, color: 'var(--muted)', fontSize: 13 }}>£</span>
              <input
                type="number"
                min="0"
                step="100"
                value={sellPriceStr}
                onChange={e => setSellPriceStr(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '8px 10px 8px 24px', fontSize: 14, fontWeight: 700, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'DM Mono, monospace' }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              The price shown to the client
            </div>
          </div>

          {/* Estimated cost */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>
              Estimated Cost (ex. VAT) <span style={{ color: '#e74c3c' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontWeight: 600, color: 'var(--muted)', fontSize: 13 }}>£</span>
              <input
                type="number"
                min="0"
                step="100"
                value={estCostStr}
                onChange={e => setEstCostStr(e.target.value)}
                placeholder="0.00"
                style={{ width: '100%', padding: '8px 10px 8px 24px', fontSize: 14, fontWeight: 700, boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'DM Mono, monospace' }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Your internal cost estimate
            </div>
          </div>
        </div>

        {/* Live margin / VAT summary */}
        {sellNum > 0 && costNum > 0 && (
          <div style={{ background: margin >= 0 ? '#f8faf2' : '#fff0ef', border: `1px solid ${margin >= 0 ? '#c8e89a' : '#ffb0b0'}`, borderRadius: 8, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Sell Price</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{fmt(sellNum)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Est. Cost</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{fmt(costNum)}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Gross Margin</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: margin >= 0 ? '#4a7c1f' : '#c0392b' }}>
                {fmt(margin)} <span style={{ fontSize: 11, fontWeight: 400 }}>({marginPct.toFixed(1)}%)</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 4 }}>Total inc. VAT</div>
              <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>
                {vatOn ? fmt(totalInc) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No VAT</span>}
              </div>
            </div>
          </div>
        )}

        {/* VAT toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            <input
              type="checkbox"
              checked={vatOn}
              onChange={e => setVatOn(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            Add VAT (20%) to the quote total
          </label>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: '#fff0f0', border: '1px solid #ffb0b0', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#c00', marginBottom: 16 }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Validation hint ── */}
      {!canSave && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
          Required:
          {!custName.trim() && <span style={{ marginLeft: 8 }}>✗ client name</span>}
          {!scope.trim() && <span style={{ marginLeft: 8 }}>✗ scope of works</span>}
          {!(sellNum > 0) && <span style={{ marginLeft: 8 }}>✗ sell price</span>}
          {!(costNum > 0) && <span style={{ marginLeft: 8 }}>✗ estimated cost</span>}
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button
          className="btn-sm btn-outline"
          onClick={() => router.push('/quotes')}
          disabled={saving}
          style={{ padding: '10px 20px', fontSize: 13 }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave || saving}
          style={{
            padding: '10px 28px', fontSize: 13, fontWeight: 700, borderRadius: 6, border: 'none',
            background: canSave && !saving ? '#2b3a2b' : '#aaa',
            color: '#fff',
            cursor: canSave && !saving ? 'pointer' : 'not-allowed',
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 7,
            opacity: canSave && !saving ? 1 : 0.7,
          }}
        >
          {saving ? '⏳ Saving…' : '⚡ Save Quick Quote'}
        </button>
      </div>

      {/* ── AI Scope Chat modal ── */}
      {showChat && (
        <ScopeChat
          quoteId={null}
          jobType={jobType}
          address={custAddr}
          phases={[]}
          onInsert={text => {
            setScope(text)
            setScopeGenerated(true)
            setShowChat(false)
          }}
          onClose={() => setShowChat(false)}
          // No onBuildEstimate — Quick Quote doesn't generate phases
        />
      )}
    </div>
  )
}
