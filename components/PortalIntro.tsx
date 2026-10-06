'use client'

// The short "what this portal is for" box at the top of the client portal dashboard. A plain display component used by both the real
// portal and the builder's preview. It only lists the areas this client can actually open (the builder can hide tabs per client, and the
// Contracts tab only exists once a contract has been sent), and ends with the builder's contact details.

export interface PortalIntroProps {
  companyName?: string
  phone?: string
  email?: string
  showQuotes: boolean
  showContracts: boolean
  showVariations: boolean
  showInvoices: boolean
}

export default function PortalIntro({ companyName, phone, email, showQuotes, showContracts, showVariations, showInvoices }: PortalIntroProps) {
  const areas: [string, string][] = [
    ...(showQuotes ? [['Quotes', 'review your quote and approve it online']] as [string, string][] : []),
    ...(showContracts ? [['Contracts', 'read and sign your building contract, and keep the signed copy']] as [string, string][] : []),
    ['Work Schedule', 'see what is happening on site and when'],
    ...(showVariations ? [['Variations', 'review and approve any changes to the agreed work']] as [string, string][] : []),
    ...(showInvoices ? [['Invoices', 'see what is due and what you have paid']] as [string, string][] : []),
  ]
  const contact = [phone ? `call ${phone}` : '', email ? `email ${email}` : ''].filter(Boolean).join(' or ')

  return (
    <div style={{ background: '#f8faf2', border: '1px solid #d4e8b0', borderLeft: '4px solid #b8cc00', borderRadius: 8, padding: '16px 20px', marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Your project portal</div>
      <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink)', lineHeight: 1.7 }}>
        This is a private place where {companyName || 'your builder'} keeps everything about your project in one place, so you can always see where things stand.
        It is kept up to date for you, and you can come back to it at any time.
      </p>
      <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.75 }}>
        {areas.map(([name, what]) => (
          <li key={name}><strong>{name}</strong> — {what}</li>
        ))}
      </ul>
      {contact && <div style={{ fontSize: 13, color: 'var(--muted)' }}>Questions? Please {contact}.</div>}
    </div>
  )
}
