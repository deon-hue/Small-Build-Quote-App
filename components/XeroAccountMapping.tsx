'use client'

import { useState } from 'react'
import { useApp } from '@/contexts/AppContext'
import type { XeroAccountCodes } from '@/lib/types'
import { DEFAULT_XERO_ACCOUNT_CODES } from '@/lib/types'
import type { XeroAccount } from '@/app/api/xero/accounts/route'

const MAPPING_FIELDS: { key: keyof XeroAccountCodes; label: string; hint: string }[] = [
  { key: 'invoiceSales',  label: 'Invoice — Sales',          hint: 'Revenue account for sales invoices (e.g. 200 Sales)' },
  { key: 'billLabour',    label: 'Bill — Labour',            hint: 'Direct cost account for labour lines (e.g. 400 Direct Costs)' },
  { key: 'billMaterials', label: 'Bill — Materials',         hint: 'Purchases account for materials (e.g. 300 Purchases)' },
  { key: 'billPlant',     label: 'Bill — Plant Hire',        hint: 'Account for plant/equipment hire costs' },
  { key: 'billOther',     label: 'Bill — Other',             hint: 'Account for other / miscellaneous costs' },
  { key: 'billCis',       label: 'Bill — CIS Deduction',     hint: 'Liability account for CIS deductions withheld (e.g. 820 CIS Liability)' },
]

// Group Xero accounts by type for the select optgroup
const TYPE_LABEL: Record<string, string> = {
  REVENUE:      'Revenue',
  DIRECTCOSTS:  'Direct Costs',
  EXPENSE:      'Expenses',
  OVERHEADS:    'Overheads',
  CURRLIAB:     'Current Liabilities',
  LIABILITY:    'Liabilities',
  CURRENT:      'Current Assets',
  FIXED:        'Fixed Assets',
  EQUITY:       'Equity',
  BANK:         'Bank',
}

function groupAccounts(accounts: XeroAccount[]) {
  const groups: Record<string, XeroAccount[]> = {}
  for (const a of accounts) {
    const g = TYPE_LABEL[a.type] || a.type || 'Other'
    if (!groups[g]) groups[g] = []
    groups[g].push(a)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

export default function XeroAccountMapping() {
  const { settings, saveSettings } = useApp()
  const codes = settings.xeroAccountCodes ?? DEFAULT_XERO_ACCOUNT_CODES

  const [accounts, setAccounts]   = useState<XeroAccount[]>([])
  const [loading, setLoading]     = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [form, setForm]           = useState<XeroAccountCodes>({ ...DEFAULT_XERO_ACCOUNT_CODES, ...codes })
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)

  async function loadAccounts() {
    setLoading(true); setLoadError(null)
    try {
      const r = await fetch('/api/xero/accounts')
      const d = await r.json() as { accounts?: XeroAccount[]; error?: string }
      if (d.error) { setLoadError(d.error); return }
      setAccounts(d.accounts ?? [])
    } catch { setLoadError('Failed to load accounts from Xero') }
    finally { setLoading(false) }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveSettings({ ...settings, xeroAccountCodes: form })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally { setSaving(false) }
  }

  const groups = groupAccounts(accounts)

  function AccountSelect({ field }: { field: keyof XeroAccountCodes }) {
    const info = MAPPING_FIELDS.find(f => f.key === field)!
    return (
      <div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{info.label}</div>
        {accounts.length > 0 ? (
          <select
            value={form[field]}
            onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13 }}
          >
            <option value="">— Select account —</option>
            {groups.map(([grp, accs]) => (
              <optgroup key={grp} label={grp}>
                {accs.map(a => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <input
            value={form[field]}
            onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
            placeholder={DEFAULT_XERO_ACCOUNT_CODES[field]}
            style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
          />
        )}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>{info.hint}</div>
      </div>
    )
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-hd">Xero — Chart of Accounts Mapping</div>
      <div style={{ padding: '18px 20px' }}>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--muted)' }}>
          Map each cost type to the correct Xero account code. Load your live chart of accounts from Xero, or type codes manually.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={loadAccounts} disabled={loading}>
            {loading ? 'Loading…' : '↻ Load accounts from Xero'}
          </button>
          {accounts.length > 0 && (
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{accounts.length} accounts loaded</span>
          )}
          {loadError && (
            <span style={{ fontSize: 12, color: 'var(--danger, #e53e3e)' }}>{loadError}</span>
          )}
        </div>

        {/* Invoice mapping */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 10 }}>
            Sales Invoices
          </div>
          <div style={{ maxWidth: 360 }}>
            <AccountSelect field="invoiceSales" />
          </div>
        </div>

        {/* Bill mappings */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', marginBottom: 10 }}>
            Bills (Purchase Invoices)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            <AccountSelect field="billLabour" />
            <AccountSelect field="billMaterials" />
            <AccountSelect field="billPlant" />
            <AccountSelect field="billOther" />
            <AccountSelect field="billCis" />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Mapping'}
          </button>
          {saved && <span style={{ fontSize: 13, color: 'var(--moss)', fontWeight: 500 }}>✓ Saved</span>}
        </div>
      </div>
    </div>
  )
}
