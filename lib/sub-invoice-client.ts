// Browser side of "download a subcontractor's invoice": asks /api/sub-invoice/download for the PDF and saves it. Used by the Subcontractors page, the Bills page and the contact card's history.
// Send either the day ids of a week (the invoice is made now if those days have none) or just the bill's id (finds the invoice made for that bill). Returns '' when the file was saved, else a plain message.

/** An approved day that belongs on an invoice: not still pending and not paid in cash (paid with no Xero bill behind it). */
export function isInvoiceDay(l: { status?: string | null; xero_bill_id?: string | null }): boolean {
  return l.status !== 'pending' && !(l.status === 'paid' && !l.xero_bill_id)
}

export async function downloadSubInvoice(input: { contactId: string; logIds?: string[]; billId?: string }): Promise<string> {
  try {
    const res = await fetch('/api/sub-invoice/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
    if (!res.ok) {
      const j = await res.json().catch(() => null) as { error?: string } | null
      return j?.error || 'Could not make the invoice. Try again.'
    }
    const blob = await res.blob()
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'Invoice.pdf'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = name
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return ''
  } catch {
    return 'Could not reach the server. Check your connection and try again.'
  }
}
