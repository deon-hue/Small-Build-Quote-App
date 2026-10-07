// Builds the final signed PDF of a contract from the copy that was sent to the client plus the signatures recorded on the contract row.
// Used when the client finishes signing (app/api/portal/finalize-contract) and when the builder asks to rebuild the signed copy
// (app/api/contracts/rebuild-signed). Server-only: it pulls in pdf-lib via lib/fmb-contract.ts.

import { signContractPdf } from './fmb-contract'

interface SignedRow {
  builder_signed_by?: string | null
  builder_signed_at?: string | null
  client_signed_by?: string | null
  client_signed_at?: string | null
  client2_signed_by?: string | null
  client2_signed_at?: string | null
}

const longDate = (iso: string | null | undefined, fallback: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : fallback

export async function signedContractBytes(contract: SignedRow, draftBytes: Uint8Array): Promise<Uint8Array> {
  const today = longDate(new Date().toISOString(), '')
  return signContractPdf(draftBytes, {
    builderName: contract.builder_signed_by || '',
    builderSignedAt: longDate(contract.builder_signed_at, today),
    clientName: contract.client_signed_by || '',
    clientSignedAt: longDate(contract.client_signed_at, today),
    client2Name: contract.client2_signed_by || undefined,
    client2SignedAt: contract.client2_signed_at ? longDate(contract.client2_signed_at, today) : undefined,
  })
}
