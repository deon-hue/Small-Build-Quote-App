'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { Settings } from '@/lib/types'
import XeroConnectionCard from '@/components/XeroConnectionCard'

export default function SettingsPage() {
  const { settings, saveSettings, loading } = useApp()
  const [form, setForm] = useState<Settings>(settings)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setForm(settings) }, [settings])

  async function handleSave() {
    setSaving(true)
    try {
      await saveSettings(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  function handleLogoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 3 * 1024 * 1024) { alert('Logo too large — max 3MB.'); return }
    const reader = new FileReader()
    reader.onload = e => setForm(f => ({ ...f, logo: e.target?.result as string }))
    reader.readAsDataURL(file)
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  const f = (key: keyof Settings) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  })

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Company logo */}
      <div className="card">
        <div className="card-hd">Company Logo</div>
        <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 20 }}>
          {form.logo
            ? <div>
                <img src={form.logo} alt="Logo" style={{ height: 64, maxWidth: 200, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 4 }} />
              </div>
            : <div style={{ width: 120, height: 64, background: 'var(--warm)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--muted)' }}>
                No logo
              </div>
          }
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm btn-outline" onClick={() => logoInputRef.current?.click()}>
              {form.logo ? 'Change Logo' : 'Upload Logo'}
            </button>
            {form.logo && (
              <button className="btn-sm btn-danger" onClick={() => setForm(f => ({ ...f, logo: '' }))}>Remove</button>
            )}
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const file = e.target.files?.[0]; if (file) handleLogoFile(file) }} />
        </div>
      </div>

      {/* Company details */}
      <div className="card">
        <div className="card-hd">Company Details</div>
        <div style={{ padding: '18px 20px' }}>
          <div className="row2">
            <div className="fg"><label>Company Name</label><input {...f('name')} placeholder="Buildospro" /></div>
            <div className="fg"><label>Tagline</label><input {...f('tagline')} placeholder="Building Extensions & Renovations" /></div>
          </div>
          <div className="row2">
            <div className="fg"><label>Contact Name</label><input {...f('contact')} placeholder="John Smith" /></div>
            <div className="fg"><label>Phone</label><input {...f('phone')} placeholder="01234 567890" /></div>
          </div>
          <div className="fg"><label>Email</label><input type="email" {...f('email')} placeholder="info@company.co.uk" /></div>
          <div className="fg"><label>Address</label><textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} rows={2} placeholder="123 High Street&#10;London EC1A 1BB" /></div>
        </div>
      </div>

      {/* Terms */}
      <div className="card">
        <div className="card-hd">Payment Terms</div>
        <div style={{ padding: '18px 20px' }}>
          <div className="fg">
            <label>Payment Terms</label>
            <textarea value={form.terms} onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} rows={4} />
          </div>
          <div className="fg">
            <label>Additional Terms / Exclusions</label>
            <textarea value={form.extra} onChange={e => setForm(p => ({ ...p, extra: e.target.value }))} rows={4} />
          </div>
        </div>
      </div>

      {/* Invoice defaults */}
      <div className="card">
        <div className="card-hd">Invoice Defaults</div>
        <div style={{ padding: '18px 20px' }}>

          {/* VAT + payment days */}
          <div className="row2" style={{ alignItems: 'flex-end' }}>
            <div className="fg">
              <label>Default Payment Due</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number" min={1} max={365}
                  value={form.invoicePaymentDays ?? 30}
                  onChange={e => setForm(p => ({ ...p, invoicePaymentDays: +e.target.value }))}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>days after issue date</span>
              </div>
            </div>
            <div className="fg">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.invoiceVatDefault ?? true}
                  onChange={e => setForm(p => ({ ...p, invoiceVatDefault: e.target.checked }))}
                  style={{ width: 'auto', accentColor: 'var(--moss)' }}
                />
                <span>Include VAT by default on new invoices</span>
              </label>
            </div>
          </div>

          {/* Payment methods */}
          <div className="fg" style={{ marginTop: 4 }}>
            <label>Accepted Payment Methods</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              {['Bank Transfer', 'BACS', 'Cheque', 'Cash', 'Card'].map(method => {
                const checked = (form.invoicePaymentMethods ?? []).includes(method)
                return (
                  <label key={method} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      style={{ width: 'auto', accentColor: 'var(--moss)' }}
                      onChange={() => {
                        const current = form.invoicePaymentMethods ?? []
                        setForm(p => ({
                          ...p,
                          invoicePaymentMethods: checked
                            ? current.filter(m => m !== method)
                            : [...current, method],
                        }))
                      }}
                    />
                    {method}
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bank details */}
      <div className="card">
        <div className="card-hd">Bank Details</div>
        <div style={{ padding: '18px 20px' }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14, lineHeight: 1.5 }}>
            These appear automatically on every invoice PDF in a dedicated Payment Details block.
          </p>
          <div className="row2">
            <div className="fg">
              <label>Account Name</label>
              <input
                value={form.invoiceAccountName ?? ''}
                onChange={e => setForm(p => ({ ...p, invoiceAccountName: e.target.value }))}
                placeholder="Smith Building Ltd"
              />
            </div>
            <div className="fg">
              <label>Bank Name</label>
              <input
                value={form.invoiceBankName ?? ''}
                onChange={e => setForm(p => ({ ...p, invoiceBankName: e.target.value }))}
                placeholder="Lloyds Bank"
              />
            </div>
          </div>
          <div className="row2">
            <div className="fg">
              <label>Sort Code</label>
              <input
                value={form.invoiceSortCode ?? ''}
                onChange={e => setForm(p => ({ ...p, invoiceSortCode: e.target.value }))}
                placeholder="12-34-56"
              />
            </div>
            <div className="fg">
              <label>Account Number</label>
              <input
                value={form.invoiceAccountNumber ?? ''}
                onChange={e => setForm(p => ({ ...p, invoiceAccountNumber: e.target.value }))}
                placeholder="12345678"
              />
            </div>
          </div>
          <div className="fg">
            <label>Default Invoice Notes</label>
            <textarea
              value={form.invoiceDefaultNotes ?? ''}
              onChange={e => setForm(p => ({ ...p, invoiceDefaultNotes: e.target.value }))}
              rows={3}
              placeholder="e.g. Please use the invoice number as your payment reference."
            />
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              Pre-fills the Notes field on every new invoice. You can still edit it per invoice.
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Settings'}
        </button>
        {saved && <span style={{ fontSize: 13, color: 'var(--moss)', fontWeight: 500 }}>✓ Saved</span>}
      </div>

      {/* Xero accounting integration */}
      <div style={{ marginTop: 16 }}>
        <XeroConnectionCard />
      </div>
    </div>
  )
}
