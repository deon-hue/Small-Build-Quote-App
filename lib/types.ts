import type { EstimatorItem, EstimatorItemTemplate } from './estimator'
import type { LabourTrade, TaskLabourLine } from './tradeRates'
export type { EstimatorItem, EstimatorItemTemplate, LabourTrade, TaskLabourLine }

export interface QuoteItem {
  id: number
  desc: string
  qty: number
  unit: string
  labour: number
  materials: number
  plantHire?: number
  subcontractors?: number
  other?: number
  itemType?: 'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'
  notes: string
}

export interface QuotePhase {
  id: number
  phase: string          // Sub-phase / category name
  parentPhase?: string   // Main phase grouping header
  items: QuoteItem[]
  estimatorItems?: EstimatorItem[]
  useEstimator?: boolean  // true = lump sums auto-computed from estimatorItems
  labourTrades?: LabourTrade[]  // explicit day-rate trade entries for this phase
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

export type PortalStatus = 'no_email' | 'not_invited' | 'invited' | 'active'

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
  portalInvitedAt?: string | null
  portalStatus?: PortalStatus
  portalLastLogin?: string | null
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
  id?: string
  level?: 0 | 1 | 2   // 0 = parentPhase group header, 1 = phase bar, 2 = task bar
  parentId?: string
  collapsed?: boolean
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

export interface TemplatePhaseData {
  parentPhase: string
  phase: string
  items: Omit<QuoteItem, 'id'>[]
  estimatorItems?: EstimatorItemTemplate[]
}

// ── Team Members & Permissions ────────────────────────────────

export interface UserPermissions {
  dashboard:   boolean
  calendar:    boolean
  jobs:        boolean
  quotes:      boolean
  invoices:    boolean
  clients:     boolean
  settings:    boolean
  back_office: boolean
  team:        boolean
}

export type TeamMemberRole   = 'admin' | 'manager' | 'staff' | 'view_only'
export type TeamMemberStatus = 'invited' | 'active' | 'disabled'

export interface TeamMember {
  id:           string
  ownerId:      string
  authUserId:   string | null
  email:        string
  name:         string
  role:         TeamMemberRole
  status:       TeamMemberStatus
  permissions:  UserPermissions
  inviteToken:  string | null
  invitedAt:    string | null
  lastActiveAt: string | null
  createdAt:    string
}

export const FULL_PERMISSIONS: UserPermissions = {
  dashboard: true, calendar: true, jobs: true, quotes: true,
  invoices: true, clients: true, settings: true, back_office: true, team: true,
}

export const ROLE_PERMISSIONS: Record<TeamMemberRole, UserPermissions> = {
  admin: {
    dashboard: true, calendar: true, jobs: true, quotes: true,
    invoices: true, clients: true, settings: true, back_office: true, team: true,
  },
  manager: {
    dashboard: true, calendar: true, jobs: true, quotes: true,
    invoices: true, clients: true, settings: false, back_office: false, team: false,
  },
  staff: {
    dashboard: true, calendar: true, jobs: true, quotes: false,
    invoices: false, clients: false, settings: false, back_office: false, team: false,
  },
  view_only: {
    dashboard: true, calendar: true, jobs: false, quotes: false,
    invoices: false, clients: false, settings: false, back_office: false, team: false,
  },
}

// ── Variations / Change Orders ───────────────────────────────

export type VariationStatus =
  | 'draft'
  | 'sent'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'invoiced'
  | 'paid'

export interface VariationLineItem {
  id: number
  itemType: 'labour' | 'materials' | 'plant' | 'subcontractors' | 'other'
  desc: string
  qty: number
  unit: string
  rate: number   // cost rate per unit; selling price = rate × (1 + markup/100)
  notes: string
}

export interface Variation {
  id: string
  jobId: string
  ref: string
  title: string
  description: string
  status: VariationStatus
  items: VariationLineItem[]
  markup: number
  vatIncluded: boolean
  total: number           // final total (sell + VAT if applicable)
  notes: string
  locked: boolean
  clientApprovedAt: string | null
  clientApprovedBy: string | null
  clientRejectedAt: string | null
  clientRejectionReason: string | null
  sentAt: string | null
  createdAt: string
}
