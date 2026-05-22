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
