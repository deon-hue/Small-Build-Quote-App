/**
 * fmb-contract.ts — pure Node.js, zero React dependency
 *
 * Fills and, once signed, flattens the FMB Domestic Building Contract (DOM1E)
 * AcroForm template at lib/contract-templates/fmb-dom1e.pdf using pdf-lib.
 * Field names below are the exact AcroForm field names in that template,
 * confirmed by inspecting the real file with pdf-lib before writing this list —
 * they must match verbatim, including FMB's own inconsistent naming/typos.
 *
 * Called only by app/api/generate-contract-pdf/route.ts and the portal sign
 * route (server-side; the template file isn't public).
 */

import { PDFDocument, PDFForm, PDFCheckBox, PDFTextField } from 'pdf-lib'
import type { Contract, ContractFields, ContractPaymentStage, Job, Quote, Settings } from './types'
import { quoteTotal } from './utils'

// ── Field names ───────────────────────────────────────────────────────────────

export const FIELD = {
  contractDate: 'Contract date 2',
  clientName: 'Client name 2',
  clientAddress: 'Client address 2',
  clientTelephone: 'Client telephone 2',
  builderName: 'Builder name 2',
  builderAddress: 'Builder address 2',
  builderTelephone: 'Builder telephone 2',
  projectSite: 'Project site 2',
  worksProvided: 'Works provided 2',
  drawings: 'Drawings 2',
  estimate: 'Estimate 2',
  specification: 'Specification 2',
  otherDocuments: 'Other documents 2',
  workStartDate: 'Work start date 2',
  completionDate: 'Completion date 2',
  designElement1Yes: 'Yes - significant design element by us 5',
  designElement1No: 'No - significant design element by us 5',
  designElement2Yes: 'Yes - significant design element by us 6',
  designElement2No: 'No - significant design element by us 6',
  defectsLiabilityMonths: 'Months 2',
  liability: 'Liability 2',
  noticeDays: 'Days',
  price: 'Price 3',
  regularBillsTick: 'Tick if regular bills are to be sent - see condition 2.6',
  regularBillsPeriod: 'Enter period between regular bills',
  stagedBillsTick: 'Tick if staged bills are to be sent – see condition 2.7 and attach a payment schedule',
  deposit: 'Deposit 2',
  alsoPay1: 'Also pay 1',
  alsoPay2: 'Also pay 2',
  toiletWc: 'Toilet and WC 2',
  water: 'Water 2',
  electricity: 'Electricity 2',
  storageSpace: 'Storage space 2',
  liveAtPropertyYes: 'Yes - you intend to live at the property while we do the work 4',
  liveAtPropertyNo: "No - you don't intend to live at the property while we do the work 4",

  pcOnlyYes: "Tick if Yes - we're the only builder / Principal Contractor",
  pcOnlyNo: "Tick if No - we're not the only builder / Principal Contractor",
  pcName: 'Enter the name of the competent person designated to carry out the functions of the Principal Contra',
  pcCompany: "Enter the company name that will be Principal Contractor (add your company name if it's you)",
  pcAddress: 'Enter Principal Contractor address',
  pcTelephone: 'Enter Principal Contractor telephone',
  pcCompetentYes: 'Tick if Yes - competent to carry out the work',
  pcCompetentNo: 'Tick if No - not competent to carry out the work',

  pdName: 'Enter the name of the competent person designated to carry out the functions of the Principal Design',
  pdCompany: 'Enter the company name that will be the Principal Designer',
  pdAddress: 'Enter Principal Contractor address 2',
  pdTelephone: 'Enter Principal Contractor telephone 2',
  pdYes: 'Tick if Yes - We are the Building Regulations Principal Designer',
  pdNo: 'Tick if No - We are not the Building Regulations Principal Designer',

  builderSignName: 'Builder name 7',
  builderSignature: 'Builder signature 6',
  clientSignName1: 'Client name 8',
  clientSignature1: 'Client signature 7',
  clientSignName2: 'Client name 9',
  clientSignature2: 'Client signature 8',

  additionalNotes: 'Additional notes 2',

  companyNameFront: 'Company Name (Front)',
  clientNameFront: 'Client name (front cover)',
} as const

/** Ordered stage-payment field triples, exactly as authored on page 16 of the
 *  template — FMB/Acrobat's own auto-numbering, not a clean 1-28 sequence.
 *  Each stage has a date and two instalment-amount fields; which figure goes
 *  in the second one isn't labelled in the field name itself, so it's left
 *  blank unless the estimator enters both — always check the "Generate &
 *  Preview" output before sending. */
export const STAGE_PAYMENT_FIELDS: { date: string; amount1: string; amount2: string }[] = [
  { date: 'Stage payment date 64', amount1: 'Stage payment instalment 95',   amount2: 'Stage payment instalment 96' },
  { date: 'Stage payment date 65', amount1: 'Stage payment instalment 97',   amount2: 'Stage payment instalment 98' },
  { date: 'Stage payment date 66', amount1: 'Stage payment instalment 99',   amount2: 'Stage payment instalment 100' },
  { date: 'Stage payment date 67', amount1: 'Stage payment instalment 101',  amount2: 'Stage payment instalment 102' },
  { date: 'Stage payment date 68', amount1: 'Stage payment instalment 103',  amount2: 'Stage payment instalment 104' },
  { date: 'Stage payment date 69', amount1: 'Stage payment instalment 105',  amount2: 'Stage payment instalment 106' },
  { date: 'Stage payment date 70', amount1: 'Stage payment instalment 107',  amount2: 'Stage payment instalment 108' },
  { date: 'Stage payment date 71', amount1: 'Stage payment instalment 109',  amount2: 'Stage payment instalment 1010' },
  { date: 'Stage payment date 72', amount1: 'Stage payment instalment 1011', amount2: 'Stage payment instalment 1012' },
  { date: 'Stage payment date 73', amount1: 'Stage payment instalment 1013', amount2: 'Stage payment instalment 1014' },
  { date: 'Stage payment date 74', amount1: 'Stage payment instalment 1015', amount2: 'Stage payment instalment 1016' },
  { date: 'Stage payment date 75', amount1: 'Stage payment instalment 1017', amount2: 'Stage payment instalment 1018' },
  { date: 'Stage payment date 76', amount1: 'Stage payment instalment 1019', amount2: 'Stage payment instalment 1020' },
  { date: 'Stage payment date 77', amount1: 'Stage payment instalment 1021', amount2: 'Stage payment instalment 1022' },
  { date: 'Stage payment date 78', amount1: 'Stage payment instalment 1023', amount2: 'Stage payment instalment 1024' },
  { date: 'Stage payment date 79', amount1: 'Stage payment instalment 1025', amount2: 'Stage payment instalment 1026' },
  { date: 'Stage payment date 80', amount1: 'Stage payment instalment 1027', amount2: 'Stage payment instalment 1028' },
  { date: 'Stage payment date 81', amount1: 'Stage payment instalment 1029', amount2: 'Stage payment instalment 1030' },
  { date: 'Stage payment date 82', amount1: 'Stage payment instalment 1031', amount2: 'Stage payment instalment 1032' },
  { date: 'Stage payment date 83', amount1: 'Stage payment instalment 1033', amount2: 'Stage payment instalment 1034' },
  { date: 'Stage payment date 84', amount1: 'Stage payment instalment 1035', amount2: 'Stage payment instalment 1036' },
  { date: 'Stage payment date 85', amount1: 'Stage payment instalment 1037', amount2: 'Stage payment instalment 1038' },
  { date: 'Stage payment date 86', amount1: 'Stage payment instalment 1039', amount2: 'Stage payment instalment 1040' },
  { date: 'Stage payment date 87', amount1: 'Stage payment instalment 1041', amount2: 'Stage payment instalment 1042' },
  { date: 'Stage payment date 88', amount1: 'Stage payment instalment 1043', amount2: 'Stage payment instalment 1044' },
  { date: 'Stage payment date 89', amount1: 'Stage payment instalment 1045', amount2: 'Stage payment instalment 1046' },
  { date: 'Stage payment date 90', amount1: 'Stage payment instalment 1047', amount2: 'Stage payment instalment 1048' },
  { date: 'Stage payment date 91', amount1: 'Stage payment instalment 1049', amount2: 'Stage payment instalment 1050' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtGBP(n: number): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function completionDateFromJob(job: Pick<Job, 'start' | 'weeks'>): string {
  if (!job.start || !job.weeks) return ''
  const parts = job.start.split('/').map(Number)
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return ''
  const [d, m, y] = parts
  const start = new Date(y, m - 1, d)
  start.setDate(start.getDate() + job.weeks * 7)
  return start.toLocaleDateString('en-GB')
}

function setText(form: PDFForm, name: string, value: string | undefined | null) {
  if (!value) return
  try { (form.getField(name) as PDFTextField).setText(value) } catch { /* field not in this template version */ }
}

function setCheck(form: PDFForm, name: string, checked: boolean) {
  try {
    const cb = form.getField(name) as PDFCheckBox
    if (checked) cb.check(); else cb.uncheck()
  } catch { /* field not in this template version */ }
}

// ── Auto-fill from existing app data ─────────────────────────────────────────

/** The subset of contract fields fillable straight from the job/quote/settings
 *  already in the app — the estimator can still edit any of these before sending. */
export function autoFillContractFields(job: Job, quote: Quote | undefined, settings: Settings): ContractFields {
  const fields: ContractFields = {}
  fields[FIELD.contractDate] = new Date().toLocaleDateString('en-GB')
  fields[FIELD.builderName] = settings.name || ''
  fields[FIELD.builderAddress] = settings.address || ''
  fields[FIELD.builderTelephone] = settings.phone || ''
  fields[FIELD.projectSite] = job.address || ''
  fields[FIELD.workStartDate] = job.start || ''
  fields[FIELD.completionDate] = completionDateFromJob(job)
  fields[FIELD.companyNameFront] = settings.name || ''
  if (quote) {
    fields[FIELD.clientName] = quote.customer.name || ''
    fields[FIELD.clientAddress] = quote.customer.address || ''
    fields[FIELD.clientTelephone] = quote.customer.phone || ''
    fields[FIELD.worksProvided] = quote.scope || ''
    fields[FIELD.price] = fmtGBP(quoteTotal(quote))
    fields[FIELD.clientNameFront] = quote.customer.name || ''
  } else {
    fields[FIELD.clientName] = job.client || ''
    fields[FIELD.clientNameFront] = job.client || ''
  }
  return fields
}

// ── Fill (draft/preview) ──────────────────────────────────────────────────────

export async function fillContractPdf(
  templateBytes: Uint8Array | ArrayBuffer,
  fields: ContractFields,
  paymentMode: 'simple' | 'staged',
  paymentSchedule: ContractPaymentStage[],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true })
  const form = pdf.getForm()

  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'boolean') setCheck(form, name, value)
    else setText(form, name, value)
  }

  if (paymentMode === 'staged') {
    setCheck(form, FIELD.stagedBillsTick, true)
    setCheck(form, FIELD.regularBillsTick, false)
    paymentSchedule.slice(0, STAGE_PAYMENT_FIELDS.length).forEach((stage, i) => {
      const row = STAGE_PAYMENT_FIELDS[i]
      setText(form, row.date, stage.date)
      setText(form, row.amount1, fmtGBP(stage.amount))
    })
  } else {
    setCheck(form, FIELD.regularBillsTick, false)
    setCheck(form, FIELD.stagedBillsTick, false)
  }

  return pdf.save()
}

// ── Sign & flatten (final) ────────────────────────────────────────────────────

export interface ContractSignatures {
  builderName: string
  builderSignedAt: string  // display date, e.g. "28 September 2026"
  clientName: string
  clientSignedAt: string
  client2Name?: string
  client2SignedAt?: string
}

/** Re-opens an already-filled contract PDF, writes in the signature block(s),
 *  and flattens the form so the final document is no longer editable. Page 15
 *  (the statutory Cancellation Notice) and its own signature fields are
 *  deliberately never touched — it stays blank, exactly as FMB intends it to
 *  be handed to the client. */
export async function signContractPdf(filledBytes: Uint8Array, sig: ContractSignatures): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(filledBytes, { ignoreEncryption: true })
  const form = pdf.getForm()

  setText(form, FIELD.builderSignName, sig.builderName)
  setText(form, FIELD.builderSignature, `${sig.builderName} (signed electronically ${sig.builderSignedAt})`)
  setText(form, FIELD.clientSignName1, sig.clientName)
  setText(form, FIELD.clientSignature1, `${sig.clientName} (signed electronically ${sig.clientSignedAt})`)
  if (sig.client2Name) {
    setText(form, FIELD.clientSignName2, sig.client2Name)
    setText(form, FIELD.clientSignature2, `${sig.client2Name} (signed electronically ${sig.client2SignedAt || sig.clientSignedAt})`)
  }

  form.flatten()
  return pdf.save()
}

/** True once every signature this contract needs has been captured. */
export function isContractFullySigned(c: Pick<Contract, 'secondClientName' | 'clientSignedAt' | 'client2SignedAt'>): boolean {
  return !!c.clientSignedAt && (!c.secondClientName || !!c.client2SignedAt)
}
