// The registration details a company prints on its own paperwork (quote footer, invoice header).
// Everything here comes from the company's own settings — a line only appears when its number is filled in,
// so a company that is not VAT-registered or is a sole trader never claims to be either.

interface LegalSettings {
  vatNumber?: string
  companyNumber?: string
}

export function companyLegalParts(co: LegalSettings): string[] {
  const parts: string[] = []
  const companyNo = (co.companyNumber || '').trim()
  const vatNo = (co.vatNumber || '').trim()
  if (companyNo) parts.push(`Registered in England & Wales No. ${companyNo}`)
  if (vatNo) parts.push(`VAT No. ${vatNo}`)
  return parts
}
