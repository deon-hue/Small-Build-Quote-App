export interface QuoteItem {
  id: number
  desc: string
  qty: number
  unit: string
  labour: number
  materials: number
  notes: string
}

export interface QuotePhase {
  id: number
  phase: string
  items: QuoteItem[]
}

export interface QuoteCustomer {
  name: string
  address: string
  email: string
  phone: string
}

export interface Quote {
  id: string
  ref: string
  savedDate: string
  lastEdited: string
  status: 'pending' | 'sent' | 'accepted' | 'declined'
  jobType: string
  markup: number
  vatIncluded: boolean
  scope: string
  photo: string
  convertedToJob: boolean
  customer: QuoteCustomer
  phases: QuotePhase[]
  clientApprovedAt?: string | null
  clientApprovedBy?: string | null
}

export interface Job {
  id: string
  client: string
  type: string
  address: string
  value: number
  stage: 'planning' | 'active' | 'onhold' | 'complete'
  start: string
  weeks: number
  done: number
  notes: string
  quoteId?: string
}

export interface Client {
  id: string
  name: string
  first: string
  last: string
  phone: string
  email: string
  address: string
  notes: string
  addedFrom: string
}

export interface Settings {
  name: string
  tagline: string
  contact: string
  phone: string
  email: string
  address: string
  terms: string
  extra: string
  logo: string
}

export interface GanttPhase {
  label: string
  startDay: number
  durDays: number
}

export interface GanttState {
  phases: GanttPhase[]
  totalDays: number
}

export interface InvoiceLineItem {
  id: number
  desc: string
  qty: number
  unitPrice: number
  total: number
}

export interface PaymentMilestone {
  id: number
  description: string
  amount: number
  dueDate: string
  paid: boolean
  paidDate: string
}

export interface Invoice {
  id: string
  ref: string
  jobId: string
  quoteId: string
  clientName: string
  clientAddress: string
  clientEmail: string
  lineItems: InvoiceLineItem[]
  subtotal: number
  vatIncluded: boolean
  vatAmount: number
  total: number
  status: 'draft' | 'sent' | 'paid' | 'overdue'
  issueDate: string
  dueDate: string
  notes: string
  createdAt: string
  paymentPlan: PaymentMilestone[] | null
}

export interface JobNote {
  id: string
  jobId: string
  note: string
  createdAt: string
}
