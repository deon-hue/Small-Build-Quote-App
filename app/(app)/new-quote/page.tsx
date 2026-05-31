'use client'

import { useState, useEffect, useRef } from 'react'
import { useApp } from '@/contexts/AppContext'
import { fmt, VAT, JOB_TYPES, calcPhase, calcPhaseSell } from '@/lib/utils'
import type { QuotePhase, QuoteItem, Quote, TakeoffPhaseMeta } from '@/lib/types'
import { itemFromTemplate, estimatorAggregates } from '@/lib/estimator'
import type { EstimatorItem, EstimatorItemTemplate, MeasurementType } from '@/lib/estimator'
import { getPhaseEstimatorDefaults } from '@/lib/estimatorDefaults'
import QuotePreviewModal from '@/components/QuotePreviewModal'
import ScopeChat from '@/components/ScopeChat'
import EstimatorBreakdown from '@/components/EstimatorBreakdown'
import TakeoffBreakdownView from '@/components/TakeoffBreakdownView'
import QuoteWorkspace from '@/components/QuoteWorkspace'
import QuoteLandingWizard, { type QuoteCreationMode } from '@/components/QuoteLandingWizard'
import AIScopeWorkspace from '@/components/AIScopeWorkspace'
import type { TakeoffItem, TakeoffPhase } from '@/lib/takeoff-types'
import { PHASE_TO_QUOTE_PARENT, ALL_MAKEUPS, calcLayerQty, WALL_OPENING_LABELS, type TakeoffLabourLine } from '@/lib/takeoff-types'
import { DEFAULT_DEMO_SUBPHASES, calcDemoSellingPrice, DEMO_UNIT_LABELS, type DemoUnit } from '@/lib/demolition-data'
import { ALL_PHASE_SUBPHASES, calcPhaseTaskSellingPrice } from '@/lib/phase-tasks'
import { sumByCategory } from '@/lib/material-recipes'
import { createClient } from '@/lib/supabase/client'
import { fetchWallTypesWithLayers, wallTypesToMakeups, fetchQuoteDefaults, upsertTask, fetchLabourTrades, fetchProducts, fetchPlantItems } from '@/lib/back-office-queries'
import type { BOLabourTrade, BOProduct, BOPlantItem } from '@/lib/back-office-types'
import type { FloorMakeup } from '@/lib/takeoff-types'

let phaseCounter = 0
let itemCounter = 0

function makePhase(
  phase: string,
  items: Omit<QuoteItem, 'id'>[],
  parentPhase?: string,
  estimatorItems?: EstimatorItem[],
  meta?: TakeoffPhaseMeta,
): QuotePhase {
  return {
    id: ++phaseCounter,
    phase,
    parentPhase,
    // Derive roomLabel from meta if available
    ...(meta?.roomName && { roomLabel: meta.roomName }),
    items: items.map(i => ({ ...i, id: ++itemCounter })),
    estimatorItems: estimatorItems ?? [],
    useEstimator: true,
    ...(meta && { meta }),
    // Auto-stamp source + itemStatus from meta so the workspace can show badges
    ...(meta?.importedFrom === 'takeoff' && { source: 'takeoff' as const, itemStatus: 'takeoff' as const }),
  }
}

function defaultTypedItems(): Omit<QuoteItem, 'id'>[] {
  return [
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' as const },
    { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' as const },
  ]
}


// Shape returned by /api/scope-to-quote
interface ScopeToQuotePhase {
  parentPhase: string
  phase: string
  selectedTasks: string[]
  extraTasks?: {
    name: string
    description?: string
    measurementType?: string
    unit?: string
    labourRate?: number
    materialsRate?: number
    plantRate?: number
    subRate?: number
    otherRate?: number
    wastePercent?: number
  }[]
}

// Per-task rate data returned from scope-to-quote (populated from Back Office when available)
interface TaskRateEntry {
  description: string
  unit: string
  labourRate: number
  materialsRate: number
  plantRate: number
  subRate: number
  otherRate: number
  wastePercent: number
  measurementType: string
}

export default function NewQuotePage() {
  const { quotes, clients, addQuote, updateQuote, upsertClientFromQuote, getTemplate, loading } = useApp()

  const [custName, setCustName] = useState('')
  const [custAddr, setCustAddr] = useState('')
  const [custEmail, setCustEmail] = useState('')
  const [custPhone, setCustPhone] = useState('')
  const [jobType, setJobType] = useState('Rear Extension')
  const [markup, setMarkup] = useState(15)
  const [vatOn, setVatOn] = useState(true)
  const [scope, setScope] = useState('')
  const [photo, setPhoto] = useState('')
  const [phases, setPhases] = useState<QuotePhase[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isLockedQuote, setIsLockedQuote] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatingScope, setGeneratingScope] = useState(false)
  const [generatingPhases, setGeneratingPhases] = useState(false)
  const [showScopeChat, setShowScopeChat] = useState(false)
  const [buildingEstimate, setBuildingEstimate] = useState(false)
  const [loadingBO, setLoadingBO] = useState(false)   // true while fetching BO defaults for manual quotes
  const [estimateUsedDB, setEstimateUsedDB] = useState(false)
  const [showScopeHelp, setShowScopeHelp] = useState(false)
  const [clientDrop, setClientDrop] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set())
  const [labourTrades,  setLabourTrades]  = useState<BOLabourTrade[]>([])
  const [boProducts,    setBoProducts]    = useState<BOProduct[]>([])
  const [boPlantItems,  setBoPlantItems]  = useState<BOPlantItem[]>([])
  // 'breakdown' = structured visual view (after takeoff import); 'edit' = normal editable rows
  const [viewMode, setViewMode] = useState<'breakdown' | 'edit'>('edit')
  const hasTakeoffPhases = phases.some(p => p.meta?.importedFrom === 'takeoff')
  // Landing wizard step:
  //   'landing'   → 3-card selection
  //   'ai-scope'  → dedicated AI scope writing screen
  //   'workspace' → full quoting workspace
  const [step, setStep] = useState<'landing' | 'ai-scope' | 'workspace'>('landing')
  const [quoteSource, setQuoteSource] = useState<QuoteCreationMode | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const takeoffInputRef = useRef<HTMLInputElement>(null)

  // DB wall types — loaded from Back Office on mount for quote import lookups
  const [dbWallTypes, setDbWallTypes] = useState<FloorMakeup[]>([])
  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const types = await fetchWallTypesWithLayers(sb, data.user.id)
      const makeups = wallTypesToMakeups(types)
      if (makeups.length > 0) setDbWallTypes(makeups)
      // Load BO labour trades and products for the quote workspace
      fetchLabourTrades(sb, data.user.id).then(trades => setLabourTrades(trades.filter(t => t.active)))
      fetchProducts(sb, data.user.id).then(prods => setBoProducts(prods.filter(p => p.active)))
      fetchPlantItems(sb, data.user.id).then(items => setBoPlantItems(items.filter(i => i.active)))
    })
  }, [])

  // ── Phase collapse helpers ────────────────────────────────────────────────
  function togglePhase(id: number) {
    setCollapsedPhases(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function collapseAllPhases() { setCollapsedPhases(new Set(phases.map(p => p.id))) }
  function expandAllPhases()   { setCollapsedPhases(new Set()) }
  const allCollapsed = phases.length > 0 && phases.every(p => collapsedPhases.has(p.id))

  // Wait for ALL context data (including customTemplates) to finish loading before
  // calling loadTemplate. Previously this depended on [quotes] which fires before
  // customTemplates is populated — causing the hardcoded JOB_TEMPLATES to be used
  // instead of the saved Back Office template with zeroed rates.
  useEffect(() => {
    if (loading) return
    const editId = sessionStorage.getItem('sbc_edit_quote')
    if (editId) {
      sessionStorage.removeItem('sbc_edit_quote')
      const q = quotes.find(x => x.id === editId)
      if (q) { loadQuoteForEdit(q); setStep('workspace'); return }
    }
    // New quote — show landing wizard
    setPhases([])
    setStep('landing')
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load from Back Office (primary path for manual quotes) ───────────────────
  // Fetches live bo_phases → bo_sub_phases → bo_tasks for the selected job type
  // and builds QuotePhase[] with itemStatus:'bo-default' and boTaskId stamped.
  // Falls back to loadTemplate() if no BO data exists.
  async function loadFromBackOffice(type: string) {
    setLoadingBO(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) { loadTemplateStamped(type); return }

      const defaults = await fetchQuoteDefaults(sb, user.id, type)
      if (!defaults.length) {
        console.warn('[loadFromBackOffice] No BO defaults found for', type, '— falling back to template')
        loadTemplateStamped(type)
        return
      }

      const built: QuotePhase[] = []
      for (const row of defaults) {
        const items: Omit<QuoteItem, 'id'>[] = []
        for (const task of row.tasks) {
          const tg = task.name
          items.push(
            { desc: task.description || task.name, qty: task.default_qty, unit: task.unit, labour: task.labour_cost, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: task.client_description || '', itemType: 'labour'         as const, taskGroup: tg, boTaskId: task.id },
            { desc: '',                              qty: task.default_qty, unit: task.unit, labour: 0, materials: task.materials_cost,   plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials'      as const, taskGroup: tg, boTaskId: task.id },
            { desc: '',                              qty: task.default_qty, unit: task.unit, labour: 0, materials: 0, plantHire: task.plant_cost,  subcontractors: 0, other: 0, notes: '', itemType: 'plant'          as const, taskGroup: tg, boTaskId: task.id },
            { desc: '',                              qty: task.default_qty, unit: task.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: task.subcontract_cost, other: 0, notes: '', itemType: 'subcontractors' as const, taskGroup: tg, boTaskId: task.id },
            { desc: '',                              qty: task.default_qty, unit: task.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: task.other_cost, notes: '', itemType: 'other'          as const, taskGroup: tg, boTaskId: task.id },
          )
        }
        const ph = makePhase(row.subPhaseName, items, row.phaseName)
        built.push({ ...ph, source: 'manual', itemStatus: 'bo-default', boSubPhaseId: row.subPhaseId })
      }
      console.log('[loadFromBackOffice] Loaded', built.length, 'sub-phases from Back Office for', type)
      setPhases(built)
    } catch (err) {
      console.error('[loadFromBackOffice] Error:', err)
      loadTemplateStamped(type)
    } finally {
      setLoadingBO(false)
    }
  }

  /** Fallback: load hardcoded template but stamp itemStatus:'manual' so badges always show */
  function loadTemplateStamped(type: string) {
    const tpl = getTemplate(type)
    setPhases(tpl.map(p => {
      const estimatorItems = p.estimatorItems?.map(itemFromTemplate) ?? []
      let typedItems: Omit<QuoteItem, 'id'>[] = p.items
      if (estimatorItems.length > 0) {
        const agg = estimatorAggregates(estimatorItems, [])
        typedItems = p.items.map(qi => {
          if (qi.itemType === 'labour')         return { ...qi, labour:         agg.labour }
          if (qi.itemType === 'materials')      return { ...qi, materials:      agg.materials }
          if (qi.itemType === 'plant')          return { ...qi, plantHire:      agg.plant }
          if (qi.itemType === 'subcontractors') return { ...qi, subcontractors: agg.subcontractors }
          if (qi.itemType === 'other')          return { ...qi, other:          agg.other }
          return qi
        })
      }
      const ph = makePhase(p.phase, typedItems, p.parentPhase || undefined, estimatorItems)
      return { ...ph, source: 'manual' as const, itemStatus: 'manual' as const }
    }))
    setLoadingBO(false)
  }

  // ── Save a sub-phase's costs back to BO default tasks ────────────────────────
  async function handleSaveToBO(phase: QuotePhase) {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return

    // Group items by boTaskId and upsert each
    const byTaskId = new Map<string, QuoteItem[]>()
    for (const item of phase.items) {
      if (!item.boTaskId) continue
      const arr = byTaskId.get(item.boTaskId) ?? []
      arr.push(item)
      byTaskId.set(item.boTaskId, arr)
    }

    for (const [taskId, items] of byTaskId.entries()) {
      const labour        = items.find(i => i.itemType === 'labour')?.labour ?? 0
      const materials     = items.find(i => i.itemType === 'materials')?.materials ?? 0
      const plant         = items.find(i => i.itemType === 'plant')?.plantHire ?? 0
      const subcontract   = items.find(i => i.itemType === 'subcontractors')?.subcontractors ?? 0
      const other         = items.find(i => i.itemType === 'other')?.other ?? 0
      const firstItem     = items[0]
      await upsertTask(sb, {
        id:               taskId,
        user_id:          user.id,
        labour_cost:      labour,
        materials_cost:   materials,
        plant_cost:       plant,
        subcontract_cost: subcontract,
        other_cost:       other,
        default_qty:      firstItem.qty,
        unit:             firstItem.unit,
      })
    }
    // Mark the phase as bo-default again since it now matches BO
    setPhases(prev => prev.map(p => p.id === phase.id ? { ...p, itemStatus: 'bo-default' as const } : p))
    alert('Saved back to Back Office defaults.')
  }

  function loadTemplate(type: string) {
    const tpl = getTemplate(type)
    setPhases(tpl.map(p => {
      const estimatorItems = p.estimatorItems?.map(itemFromTemplate) ?? []

      // Synchronously sync typed QuoteItems from current estimator aggregates.
      // This ensures stale hardcoded template amounts (e.g. labour=£800) are
      // replaced by the actual estimator values immediately — including £0
      // when Back Office defaults have been zeroed. Zero is a valid cost value.
      let typedItems: Omit<QuoteItem, 'id'>[] = p.items
      if (estimatorItems.length > 0) {
        const agg = estimatorAggregates(estimatorItems, [])
        typedItems = p.items.map(qi => {
          if (qi.itemType === 'labour')         return { ...qi, labour:         agg.labour }
          if (qi.itemType === 'materials')      return { ...qi, materials:      agg.materials }
          if (qi.itemType === 'plant')          return { ...qi, plantHire:      agg.plant }
          if (qi.itemType === 'subcontractors') return { ...qi, subcontractors: agg.subcontractors }
          if (qi.itemType === 'other')          return { ...qi, other:          agg.other }
          return qi
        })
      }

      return makePhase(p.phase, typedItems, p.parentPhase || undefined, estimatorItems)
    }))
  }

  function toTypedItems(items: QuoteItem[]): Omit<QuoteItem, 'id'>[] {
    if (items.length > 0 && items.every(i => !i.itemType)) {
      // Legacy: aggregate old-format items into 5 typed rows
      const l = items.reduce((s, i) => s + (Number(i.labour) || 0), 0)
      const m = items.reduce((s, i) => s + (Number(i.materials) || 0), 0)
      const p = items.reduce((s, i) => s + (Number(i.plantHire) || 0), 0)
      return [
        { desc: '', qty: 1, unit: 'Item', labour: l, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: m, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: p, subcontractors: 0, other: 0, notes: '', itemType: 'plant' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' as const },
        { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' as const },
      ]
    }
    return items
  }

  function loadQuoteForEdit(q: Quote) {
    setCustName(q.customer.name || '')
    setCustAddr(q.customer.address || '')
    setCustEmail(q.customer.email || '')
    setCustPhone(q.customer.phone || '')
    setJobType(q.jobType || 'Rear Extension')
    setMarkup(q.markup || 15)
    setVatOn(q.vatIncluded !== false)
    setScope(q.scope || '')
    setPhoto(q.photo || '')
    setPhases(JSON.parse(JSON.stringify(q.phases)).map((p: QuotePhase) => ({
      ...p, id: ++phaseCounter,
      items: toTypedItems(p.items).map((i: Omit<QuoteItem,'id'>) => ({ ...i, id: ++itemCounter })),
    })))
    setEditingId(q.id)
    setIsLockedQuote(q.status === 'accepted')
  }

  function onJobTypeChange(type: string) {
    setJobType(type)
    if (phases.length && !confirm('Load the ' + type + ' template? This replaces current lines.')) return
    loadTemplate(type)
  }

  // ── Landing wizard selection ───────────────────────────────────────────────
  function handleLandingSelect(mode: QuoteCreationMode, selectedJobType?: string) {
    setQuoteSource(mode)
    if (mode === 'ai') {
      // Go to the dedicated AI Scope screen first
      setStep('ai-scope')
    } else if (mode === 'manual' && selectedJobType) {
      setJobType(selectedJobType)
      setStep('workspace')
      if (selectedJobType === 'Other') {
        // "Other" starts blank — user builds from scratch
        setPhases([])
      } else {
        loadFromBackOffice(selectedJobType)  // async — BO defaults first, template fallback
      }
    } else if (mode === 'takeoff') {
      setStep('workspace')
      // Trigger file picker after workspace renders
      setTimeout(() => takeoffInputRef.current?.click(), 100)
    } else {
      setStep('workspace')
    }
  }

  // Called from AIScopeWorkspace when user clicks "Build Estimate"
  async function handleBuildFromScope() {
    const ok = await generatePhases()
    // Only transition to workspace if phases were actually generated
    if (ok) setStep('workspace')
  }

  // Save as draft
  async function handleSaveDraft() {
    if (!custName && !confirm('No customer name — save draft anyway?')) return
    setSaving(true)
    try {
      const customer = { name: custName, address: custAddr, email: custEmail, phone: custPhone }
      const qData = { status: 'draft' as const, jobType, markup, vatIncluded: vatOn, scope, photo, convertedToJob: false, lastEdited: '', customer, phases: JSON.parse(JSON.stringify(phases)), quoteSource: quoteSource ?? undefined }
      if (editingId) {
        const existing = quotes.find(q => q.id === editingId)!
        await updateQuote({ ...existing, ...qData })
        alert('Draft updated.')
      } else {
        const newQuote = await addQuote(qData)
        await upsertClientFromQuote(customer)
        alert('Saved as draft — ref: ' + newQuote.ref)
      }
    } finally {
      setSaving(false)
    }
  }

  // AI generate phases from scope
  async function generatePhases(): Promise<boolean> {
    if (!scope.trim()) { alert('Write a scope of works first — then click Generate Phases.'); return false }
    if (phases.length && !confirm('Replace current phases with AI-generated ones?')) return false
    setGeneratingPhases(true)
    try {
      const res = await fetch('/api/generate-phases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, jobType, address: custAddr }),
      })
      const data = await res.json()
      if (data.error) { alert('Could not generate phases: ' + data.error); return false }
      if (Array.isArray(data.phases) && data.phases.length) {
        setPhases(data.phases.map((p: {
          parentPhase?: string; phase: string
          labour: number; labourNotes: string
          materials: number; materialsNotes: string
          plant: number; plantNotes: string
          subcontractors?: number; subNotes?: string
          other?: number; otherNotes?: string
        }) => {
          const ph = makePhase(p.phase, [
            { desc: p.labourNotes    || 'Labour',        qty: 1, unit: 'Item', labour: Number(p.labour) || 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour'         as const },
            { desc: p.materialsNotes || 'Materials',     qty: 1, unit: 'Item', labour: 0, materials: Number(p.materials) || 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials'      as const },
            { desc: p.plantNotes     || 'Plant hire',    qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: Number(p.plant) || 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant'          as const },
            { desc: p.subNotes       || 'Subcontract',   qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: Number(p.subcontractors) || 0, other: 0, notes: '', itemType: 'subcontractors' as const },
            { desc: p.otherNotes     || 'Other',         qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: Number(p.other) || 0, notes: '', itemType: 'other'          as const },
          ], p.parentPhase)
          return { ...ph, source: 'ai' as const, itemStatus: 'ai' as const }
        }))
        return true   // phases were set — safe to transition
      }
      return false
    } catch {
      alert('Failed to generate phases — check your connection.')
      return false
    } finally {
      setGeneratingPhases(false)
    }
  }

  // ── Fetch Back Office task rates grouped by phase name ─────────────────────
  async function fetchBOTakeoffRates(): Promise<Record<string, Array<{
    name: string; unit: string;
    labour: number; materials: number; plant: number; sub: number; other: number; markup: number;
  }>>> {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return {}

    const [{ data: phases }, { data: subPhases }, { data: tasks }] = await Promise.all([
      sb.from('bo_phases').select('id, name').eq('user_id', user.id).eq('active', true),
      sb.from('bo_sub_phases').select('id, name, phase_id').eq('user_id', user.id).eq('active', true),
      sb.from('bo_tasks').select('name, unit, labour_cost, materials_cost, plant_cost, subcontract_cost, other_cost, markup_pct, phase_id, sub_phase_id')
        .eq('user_id', user.id).eq('active', true).eq('from_takeoff', true),
    ])

    if (!tasks || tasks.length === 0) return {}

    const phaseById = Object.fromEntries((phases ?? []).map(p => [p.id, p.name]))
    const subPhaseToPhase = Object.fromEntries((subPhases ?? []).map(sp => [sp.id, sp.phase_id]))

    const result: Record<string, Array<{ name: string; unit: string; labour: number; materials: number; plant: number; sub: number; other: number; markup: number }>> = {}

    for (const t of tasks) {
      // Resolve the top-level phase name (go through sub-phase if needed)
      const phaseId = t.sub_phase_id ? (subPhaseToPhase[t.sub_phase_id] ?? t.phase_id) : t.phase_id
      const phaseName = phaseId ? phaseById[phaseId] : null
      if (!phaseName) continue

      if (!result[phaseName]) result[phaseName] = []
      result[phaseName].push({
        name: t.name,
        unit: t.unit,
        labour: t.labour_cost,
        materials: t.materials_cost,
        plant: t.plant_cost,
        sub: t.subcontract_cost,
        other: t.other_cost,
        markup: t.markup_pct,
      })
    }
    return result
  }

  // ── Save estimator item rates back to Back Office ─────────────────────────
  async function savePhaseRatesToBO(phase: QuotePhase) {
    const items = phase.estimatorItems ?? []
    if (items.length === 0) {
      alert('No estimator items in this phase — rates are set using the Estimator panel.')
      return
    }
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) { alert('Not logged in.'); return }

    const taskNames = items.map(i => i.name)

    // Fetch all matching tasks in one query
    const { data: existing } = await sb
      .from('bo_tasks')
      .select('id, name')
      .eq('user_id', user.id)
      .in('name', taskNames)

    const existingByName = Object.fromEntries((existing ?? []).map(t => [t.name, t.id]))

    let updated = 0
    let created = 0
    const toCreate: object[] = []

    for (const item of items) {
      const taskId = existingByName[item.name]
      if (taskId) {
        await sb.from('bo_tasks').update({
          labour_cost: item.labourRate,
          materials_cost: item.materialsRate,
          plant_cost: item.plantRate,
          subcontract_cost: item.subRate,
          other_cost: item.otherRate,
          unit: item.unit,
        }).eq('id', taskId)
        updated++
      } else {
        // Create new task — resolve phase_id by matching phase name
        const { data: boPhase } = await sb
          .from('bo_phases')
          .select('id')
          .eq('user_id', user.id)
          .ilike('name', phase.phase)
          .single()

        toCreate.push({
          user_id: user.id,
          name: item.name,
          description: item.description ?? '',
          unit: item.unit,
          labour_cost: item.labourRate,
          materials_cost: item.materialsRate,
          plant_cost: item.plantRate,
          subcontract_cost: item.subRate,
          other_cost: item.otherRate,
          markup_pct: 0,
          from_takeoff: true,
          from_ai: true,
          phase_id: boPhase?.id ?? null,
          display_order: 999,
        })
        created++
      }
    }

    if (toCreate.length > 0) {
      await sb.from('bo_tasks').insert(toCreate)
    }

    const parts = []
    if (updated > 0) parts.push(`${updated} task${updated !== 1 ? 's' : ''} updated`)
    if (created > 0) parts.push(`${created} new task${created !== 1 ? 's' : ''} added`)
    alert(`✓ Back Office updated — ${parts.join(', ')}.`)
  }

  // ── Import from Take-off tool ─────────────────────────────────────────────
  async function importTakeoff(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Fetch Back Office task rates (from_takeoff=true tasks, grouped by phase)
    const boRates = await fetchBOTakeoffRates()
    const hasBORates = Object.keys(boRates).length > 0

    let data: { version: number; items: TakeoffItem[]; address?: string; jobType?: string }
    try {
      const text = await file.text()
      data = JSON.parse(text)
    } catch {
      alert('Could not parse take-off file. Make sure it was exported from the Take-off tool.')
      e.target.value = ''
      return
    }

    try {
        if (data.version !== 1 || !Array.isArray(data.items)) {
          alert('Not a valid take-off file. Export a take-off from the Take-off tool first.')
          return
        }

        if (phases.length && !confirm('Import take-off? This will replace your current phases.')) return

        const newPhases: QuotePhase[] = []

        for (const item of data.items as TakeoffItem[]) {
          // Use the original takeoff phase name as the parent so the hierarchy is clear
          // (e.g. "External Walls" not "Phase 3 – Structural Shell")
          const parentPhase = item.phase
          // sub-phase name = the take-off phase name (matches back-office template)
          const subPhaseName = item.phase

          // Build notes string; for wall items include opening deductions
          const openingsSummary = item.openings && item.openings.length > 0
            ? `Openings: ${item.openings.map(o => `${WALL_OPENING_LABELS[o.type as keyof typeof WALL_OPENING_LABELS] ?? o.type} ${o.width.toFixed(2)}×${o.height.toFixed(2)}m`).join(', ')} (−${item.openings.reduce((s, o) => s + o.width * o.height, 0).toFixed(2)}m² deducted)`
            : ''
          const wallAreaSummary = item.phase === 'External Walls' && item.wallHeight != null
            ? `Gross ${(item.area ?? 0).toFixed(2)}m² → net ${item.qty.toFixed(2)}m² | H=${item.wallHeight.toFixed(2)}m`
            : ''

          const notes = [
            item.name,  // drawing label as a note so it's not lost
            wallAreaSummary,
            openingsSummary,
            item.buildingRegsNotes ? `Bldg Regs: ${item.buildingRegsNotes}` : '',
            item.notes ?? '',
          ].filter(Boolean).join(' | ')

          if (item.floorMakeupId) {
            // ── Build-up item: one sub-phase per build-up type, layers as rows ──
            // DB wall types take precedence (Back Office master); ALL_MAKEUPS is the static fallback
            const makeup = dbWallTypes.find(m => m.id === item.floorMakeupId) ?? ALL_MAKEUPS.find(m => m.id === item.floorMakeupId)
            if (makeup) {
              // For wall items: area = gross, qty = net (after openings); use net for layers
              const grossArea  = item.area ?? item.qty ?? 0
              const area       = item.phase === 'External Walls' ? item.qty : grossArea
              const perimeter  = item.phase === 'External Walls'
                ? (item.length ?? item.perimeter ?? 0)   // wall run for DPC/perimeter layers
                : (item.perimeter ?? 0)
              const toggles    = item.floorLayerToggles    ?? {}
              const thicknesses = item.floorLayerThicknesses ?? {}

              // Build one row per enabled layer — categorised by layer.category
              const layerRows: Omit<QuoteItem, 'id'>[] = []
              for (const layer of makeup.layers) {
                const enabled = toggles[layer.id] ?? layer.defaultEnabled
                if (!enabled) continue
                const thkOverride = thicknesses[layer.id]
                const { qty, unit } = calcLayerQty(layer, area, perimeter, thkOverride)
                const desc = `${layer.name} — ${qty} ${unit}`
                layerRows.push({
                  desc,
                  qty,
                  unit,
                  labour:         0,
                  materials:      0,
                  plantHire:      0,
                  subcontractors: 0,
                  other:          0,
                  notes:          layerRows.length === 0 ? notes : layer.description,
                  itemType:       (layer.category === 'plant' ? 'plant'
                                : layer.category === 'other'  ? 'other'
                                : layer.category === 'labour' ? 'labour'
                                : 'materials') as QuoteItem['itemType'],
                  // taskGroup = layer name so each layer is its own task group
                  taskGroup: layer.name,
                })
              }

              if (layerRows.length > 0) {
                // Sub-phase name = just the build-up type (no phase prefix)
                const meta: TakeoffPhaseMeta = {
                  importedFrom: 'takeoff',
                  phaseName:    item.phase,
                  buildupType:  makeup.name,
                  roomName:     item.roomName,
                  drawingLabel: item.name,
                  measurements: {
                    length: item.length, area: item.area ?? (item.phase === 'External Walls' ? undefined : area),
                    volume: item.volume, qty: item.qty, unit: item.unit,
                    height: item.wallHeight,
                  },
                }
                const p = makePhase(makeup.name, layerRows, parentPhase, undefined, meta)
                newPhases.push({ ...p, source: 'takeoff' })
              }
              continue
            }
          }

          // ── Demolition item: pre-fill costs from takeoff ──
          if (item.demoSubphaseId && item.demoTaskId) {
            const demoSub = DEFAULT_DEMO_SUBPHASES.find(s => s.id === item.demoSubphaseId)
            const demoTask = demoSub?.tasks.find(t => t.id === item.demoTaskId)
            const markupPct = item.demoMarkupPct ?? demoSub?.markupPct ?? 20
            const labour    = item.demoLabour        ?? 0
            const materials = item.demoMaterials     ?? 0
            const plant     = item.demoPlant         ?? 0
            const waste     = item.demoWaste         ?? 0
            const subCost   = item.demoSubcontractor ?? 0
            const other     = item.demoOther         ?? 0
            const selling   = calcDemoSellingPrice(labour, materials, plant, waste, subCost, other, markupPct)
            const unitLabel = DEMO_UNIT_LABELS[item.unit as DemoUnit] ?? item.unit
            const taskDesc  = item.spec || demoTask?.clientDescription || item.name
            const refStr    = item.drawingRef ? ` [${item.drawingRef}]` : ''
            const demoPhaseName = demoSub?.name ?? item.subPhase ?? 'Demolition'

            // Build meta for this takeoff item
            const demoMeta: TakeoffPhaseMeta = {
              importedFrom: 'takeoff', phaseName: item.phase, taskType: demoPhaseName,
              roomName: item.roomName, drawingLabel: item.name,
              measurements: { qty: item.qty, unit: item.unit, length: item.length, area: item.area },
            }
            newPhases.push(makePhase(
              demoPhaseName,
              [
                { desc: `${item.qty} ${unitLabel} — ${taskDesc}${refStr}`, qty: item.qty, unit: item.unit, labour, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes, itemType: 'labour' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: plant, subcontractors: 0, other: 0, notes: `Plant inc.`, itemType: 'plant' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: subCost, other: 0, notes: '', itemType: 'subcontractors' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: waste + other, notes: `Waste £${waste.toFixed(0)} | Other £${other.toFixed(0)} | Markup ${markupPct}% → sell £${selling.toFixed(2)}`, itemType: 'other' },
              ],
              parentPhase, undefined, demoMeta,
            ))
            continue
          }

          // ── Generic phase task item: pre-fill costs from takeoff ──
          if (item.taskSubphaseId && item.taskId) {
            const phaseSub  = ALL_PHASE_SUBPHASES.find(s => s.id === item.taskSubphaseId)
            const phaseTask = phaseSub?.tasks.find(t => t.id === item.taskId)
            const markupPct = item.taskMarkupPct ?? phaseSub?.markupPct ?? 20
            const labour    = item.taskLabour        ?? 0
            const materials = item.taskMaterials     ?? 0
            const plant     = item.taskPlant         ?? 0
            const subCost   = item.taskSubcontractor ?? 0
            const other     = item.taskOther         ?? 0
            const selling   = calcPhaseTaskSellingPrice(labour, materials, plant, subCost, other, markupPct)
            const taskDesc  = item.spec || phaseTask?.notes || item.name
            const refStr    = item.drawingRef ? ` [${item.drawingRef}]` : ''
            const taskSubName = phaseSub?.name ?? item.subPhase ?? item.phase
            const taskMeta: TakeoffPhaseMeta = {
              importedFrom: 'takeoff', phaseName: item.phase, taskType: taskSubName,
              roomName: item.roomName, drawingLabel: item.name,
              measurements: { qty: item.qty, unit: item.unit, length: item.length, area: item.area, volume: item.volume },
            }
            newPhases.push(makePhase(
              taskSubName,
              [
                { desc: `${item.qty} ${item.unit} — ${taskDesc}${refStr}`, qty: item.qty, unit: item.unit, labour, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes, itemType: 'labour' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: plant, subcontractors: 0, other: 0, notes: plant > 0 ? 'Plant/equipment' : '', itemType: 'plant' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: subCost, other: 0, notes: '', itemType: 'subcontractors' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other, notes: `Markup ${markupPct}% → sell £${selling.toFixed(2)}`, itemType: 'other' },
              ],
              parentPhase, undefined, taskMeta,
            ))
            continue
          }

          // ── Wall Measurement Engine item: pre-fill costs from confirmed recipe ──
          if (item.calculatedMaterials && item.calculatedMaterials.length > 0 && item.materialsConfirmed) {
            const matTotals  = sumByCategory(item.calculatedMaterials)
            const refStr     = item.drawingRef ? ` [${item.drawingRef}]` : ''
            const wallSummary = [
              item.wallConstructionType ? `${item.wallConstructionType}` : '',
              item.wallFinishType       ? `finish: ${item.wallFinishType}` : '',
              item.finishSides          ? `${item.finishSides}-sided` : '',
              item.area != null         ? `gross ${item.area.toFixed(2)}m²` : '',
              item.qty  != null         ? `net ${item.qty.toFixed(2)}m²` : '',
            ].filter(Boolean).join(' | ')
            const wallDesc = `${item.qty?.toFixed(2) ?? '?'} m² — ${item.name}${refStr}`
            const wallSubName = item.subPhase || item.phase
            const wallMeta: TakeoffPhaseMeta = {
              importedFrom: 'takeoff', phaseName: item.phase,
              roomName: item.roomName, drawingLabel: item.name,
              measurements: { area: item.area, qty: item.qty, unit: 'm²', height: item.wallHeight, length: item.length },
            }
            newPhases.push(makePhase(
              wallSubName,
              [
                { desc: wallDesc, qty: item.qty ?? 1, unit: 'm²', labour: matTotals.labour, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: [wallSummary, notes].filter(Boolean).join(' | '), itemType: 'labour' },
                { desc: '',       qty: item.qty ?? 1, unit: 'm²', labour: 0, materials: matTotals.materials, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
                { desc: '',       qty: item.qty ?? 1, unit: 'm²', labour: 0, materials: 0, plantHire: matTotals.plant, subcontractors: 0, other: 0, notes: matTotals.plant > 0 ? 'Plant/equipment' : '', itemType: 'plant' },
                { desc: '',       qty: item.qty ?? 1, unit: 'm²', labour: 0, materials: 0, plantHire: 0, subcontractors: matTotals.subcontractors, other: 0, notes: '', itemType: 'subcontractors' },
                { desc: '',       qty: item.qty ?? 1, unit: 'm²', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: matTotals.other, notes: matTotals.other > 0 ? 'Other costs' : '', itemType: 'other' },
              ],
              parentPhase, undefined, wallMeta,
            ))
            continue
          }

          // ── Regular item — use Back Office task rates if available ──
          const refStr = item.drawingRef ? ` [${item.drawingRef}]` : ''
          const specStr = item.spec ? ` · ${item.spec}` : ''
          const desc = `${item.qty} ${item.unit}${specStr}${refStr}`
          const regularMeta: TakeoffPhaseMeta = {
            importedFrom: 'takeoff', phaseName: item.phase,
            roomName: item.roomName, drawingLabel: item.name,
            measurements: { qty: item.qty, unit: item.unit, length: item.length, area: item.area, volume: item.volume },
          }

          const boTasksForPhase = boRates[item.phase] ?? []

          if (hasBORates && boTasksForPhase.length > 0) {
            // Create one sub-phase row per Back Office task, with costs = qty × rate
            for (const boTask of boTasksForPhase) {
              const taskDesc = `${item.qty} ${item.unit} — ${boTask.name}${refStr}`
              newPhases.push(makePhase(
                boTask.name,
                [
                  { desc: taskDesc, qty: item.qty, unit: boTask.unit, labour: +(item.qty * boTask.labour).toFixed(2), materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes, itemType: 'labour' },
                  { desc: '', qty: item.qty, unit: boTask.unit, labour: 0, materials: +(item.qty * boTask.materials).toFixed(2), plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
                  { desc: '', qty: item.qty, unit: boTask.unit, labour: 0, materials: 0, plantHire: +(item.qty * boTask.plant).toFixed(2), subcontractors: 0, other: 0, notes: '', itemType: 'plant' },
                  { desc: '', qty: item.qty, unit: boTask.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: +(item.qty * boTask.sub).toFixed(2), other: 0, notes: '', itemType: 'subcontractors' },
                  { desc: '', qty: item.qty, unit: boTask.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: +(item.qty * boTask.other).toFixed(2), notes: `Markup ${boTask.markup}%`, itemType: 'other' },
                ],
                parentPhase, undefined, regularMeta,
              ))
            }
          } else {
            // No Back Office data — create empty phase (user fills rates manually)
            newPhases.push(makePhase(
              subPhaseName,
              [
                { desc, qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes, itemType: 'labour' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' },
                { desc: '', qty: item.qty, unit: item.unit, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' },
              ],
              parentPhase, undefined, regularMeta,
            ))
          }
        }

        // ── Labour lines pass: add BO trade-labour sub-phases for any item
        //    that has labourLines saved on it.  These are ADDITIVE to the
        //    material/task rows already created above.
        for (const item of data.items as TakeoffItem[]) {
          if (!item.labourLines?.length) continue
          const labTotal = item.labourLines.reduce((s, l) => s + l.total, 0)
          if (labTotal <= 0) continue
          const labParent = PHASE_TO_QUOTE_PARENT[item.phase as TakeoffPhase] || item.phase
          const labDesc = item.labourLines
            .map(l => `${l.tradeName} (${l.rateType}): ${l.quantity} × £${l.rate.toFixed(2)}${l.operatives > 1 ? ` × ${l.operatives} ops` : ''} = £${l.total.toFixed(2)}`)
            .join(' | ')
          const labSubPhase = `Labour — ${item.name || item.phase}`
          newPhases.push(makePhase(
            labSubPhase,
            [
              { desc: labDesc, qty: 1, unit: 'sum', labour: labTotal, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: labDesc, itemType: 'labour' },
              { desc: '', qty: 1, unit: 'sum', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials' },
              { desc: '', qty: 1, unit: 'sum', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant' },
              { desc: '', qty: 1, unit: 'sum', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' },
              { desc: '', qty: 1, unit: 'sum', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other' },
            ],
            labParent,
          ))
        }

        setPhases(newPhases)
        setViewMode('breakdown')  // switch to structured view after import

        // Prefill address / job type if blank
        if (!custAddr && data.address) setCustAddr(data.address)
        if (data.jobType) setJobType(data.jobType)

        const buildupCount = (data.items as TakeoffItem[]).filter((i: TakeoffItem) => i.floorMakeupId).length
        const ratesNote = hasBORates ? ' Back Office rates applied.' : ' Add your rates to complete the estimate.'
        const msg = buildupCount > 0
          ? `✓ Imported ${newPhases.length} sub-phases (including ${buildupCount} build-up${buildupCount !== 1 ? 's' : ''} expanded into layers).${ratesNote}`
          : `✓ Imported ${newPhases.length} sub-phases.${ratesNote}`
        alert(msg)
      } catch {
        alert('Could not process take-off file. Make sure it was exported from the Take-off tool.')
      }
    e.target.value = ''
  }

  // ── AI Scope → fully-populated estimate ───────────────────────────────────
  async function handleBuildEstimate(scopeText: string) {
    if (phases.length && !confirm('Replace current phases with AI-generated estimate from scope?')) return
    setBuildingEstimate(true)
    try {
      const res = await fetch('/api/scope-to-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: scopeText, jobType }),
      })
      const data = await res.json()
      if (data.error) { alert('Could not build estimate: ' + data.error); return }
      if (!Array.isArray(data.phases)) { alert('Unexpected response from AI.'); return }

      // taskRates comes from Back Office when available; otherwise empty
      const taskRates: Record<string, TaskRateEntry> = data.taskRates ?? {}
      const VALID_TYPES: MeasurementType[] = ['area', 'volume', 'linear', 'quantity']

      const built: QuotePhase[] = (data.phases as ScopeToQuotePhase[]).map(sp => {
        const selectedSet = new Set(sp.selectedTasks ?? [])

        // Build template items — prefer Back Office rates, fall back to static defaults
        const templateItems: EstimatorItemTemplate[] = []
        for (const taskName of sp.selectedTasks ?? []) {
          if (taskRates[taskName]) {
            // ✅ Back Office rate found
            const r = taskRates[taskName]
            templateItems.push({
              id: `bo-${taskName}`,
              name: taskName,
              description: r.description,
              measurementType: VALID_TYPES.includes(r.measurementType as MeasurementType)
                ? (r.measurementType as MeasurementType)
                : 'quantity',
              unit: r.unit,
              labourRate:    r.labourRate,
              materialsRate: r.materialsRate,
              plantRate:     r.plantRate,
              subRate:       r.subRate,
              otherRate:     r.otherRate,
              wastePercent:  r.wastePercent,
            })
          } else {
            // Fallback: look up static defaults
            const allDefaults = getPhaseEstimatorDefaults(sp.phase)
            const match = allDefaults.find(t => selectedSet.has(t.name) && t.name === taskName)
            if (match) templateItems.push(match)
          }
        }

        // Convert extra tasks (genuinely out-of-library work) to EstimatorItemTemplate
        const extraTemplates: EstimatorItemTemplate[] = (sp.extraTasks ?? []).map(et => ({
          id: `extra-${Date.now()}-${Math.floor(Math.random() * 99999)}`,
          name: et.name,
          description: et.description ?? '',
          measurementType: VALID_TYPES.includes(et.measurementType as MeasurementType)
            ? (et.measurementType as MeasurementType)
            : 'quantity',
          unit: et.unit ?? 'nr',
          labourRate:    et.labourRate    ?? 0,
          materialsRate: et.materialsRate ?? 0,
          plantRate:     et.plantRate     ?? 0,
          subRate:       et.subRate       ?? 0,
          otherRate:     et.otherRate     ?? 0,
          wastePercent:  et.wastePercent  ?? 0,
        }))

        const estimatorItems = [...templateItems, ...extraTemplates].map(itemFromTemplate)

        // Sync the 5 typed QuoteItem rows from estimator aggregates
        const agg = estimatorAggregates(estimatorItems, [])
        const typedItems: Omit<QuoteItem, 'id'>[] = [
          { desc: '', qty: 1, unit: 'Item', labour: agg.labour,         materials: 0, plantHire: 0, subcontractors: 0, other: 0,         notes: '', itemType: 'labour'         as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: agg.materials,      plantHire: 0, subcontractors: 0, other: 0,         notes: '', itemType: 'materials'      as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0,    plantHire: agg.plant,        subcontractors: 0, other: 0,         notes: '', itemType: 'plant'          as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0,    plantHire: 0, subcontractors: agg.subcontractors, other: 0,       notes: '', itemType: 'subcontractors' as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0,    plantHire: 0, subcontractors: 0, other: agg.other,                notes: '', itemType: 'other'          as const },
        ]

        const hasExtraTasks = (sp.extraTasks ?? []).length > 0
        const allTasksFound = (sp.selectedTasks ?? []).every(t => !!taskRates[t])
        const ph = makePhase(sp.phase, typedItems, sp.parentPhase || undefined, estimatorItems)
        return {
          ...ph,
          source: 'ai' as const,
          itemStatus: 'ai' as const,
          // Flag if AI had to invent tasks (extraTasks) or couldn't find BO rates
          ...(hasExtraTasks && {
            needsReview: true,
            reviewNote: `Contains ${(sp.extraTasks ?? []).length} task(s) not found in Back Office master data`,
          }),
          ...(!allTasksFound && !hasExtraTasks && {
            needsReview: true,
            reviewNote: 'Some tasks could not be matched to Back Office rates — verify costs',
          }),
        }
      })

      setPhases(built)
      setScope(scopeText)
      setEstimateUsedDB(!!data.usingDB)
    } catch {
      alert('Failed to build estimate — check your connection.')
    } finally {
      setBuildingEstimate(false)
    }
  }

  // ── Main phase / sub-phase management ─────────────────────────────────────
  function addMainPhase() {
    const name = 'New Phase'
    setPhases(prev => [...prev, makePhase('New Sub-Phase', defaultTypedItems(), name)])
  }

  function addSubPhase(parentPhase: string) {
    setPhases(prev => [...prev, makePhase('New Sub-Phase', defaultTypedItems(), parentPhase)])
  }

  function removeMainPhase(parentPhase: string) {
    if (!confirm(`Remove "${parentPhase}" and all its sub-phases?`)) return
    setPhases(prev => prev.filter(p => p.parentPhase !== parentPhase))
  }

  function updateMainPhaseName(oldName: string, newName: string) {
    setPhases(prev => prev.map(p => p.parentPhase === oldName ? { ...p, parentPhase: newName } : p))
  }

  function removePhase(id: number) { setPhases(prev => prev.filter(p => p.id !== id)) }
  function updatePhaseName(id: number, name: string) {
    setPhases(prev => prev.map(p => p.id === id ? { ...p, phase: name } : p))
  }

  // ── Full-phase update (used by EstimatorBreakdown) ───────────────────────
  function updatePhase(updated: QuotePhase) {
    setPhases(prev => prev.map(p => p.id === updated.id ? updated : p))
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const cost = phases.reduce((s, p) => s + calcPhase(p), 0)
  const sell = phases.reduce((s, p) => s + calcPhaseSell(p, markup), 0)
  const mu = sell - cost
  const vatAmt = vatOn ? sell * VAT : 0
  const total = sell + vatAmt

  function mainPhaseTotal(parentPhase: string) {
    return phases.filter(p => p.parentPhase === parentPhase).reduce((s, p) => s + calcPhaseSell(p, markup), 0)
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (isLockedQuote) { alert('This quote has been accepted and is locked — it cannot be modified.'); return }
    if (!custName && !confirm('No customer name — save anyway?')) return
    if (!phases.length) { alert('Add some quote lines first.'); return }
    setSaving(true)
    try {
      const customer = { name: custName, address: custAddr, email: custEmail, phone: custPhone }
      const qData = { status: 'pending' as const, jobType, markup, vatIncluded: vatOn, scope, photo, convertedToJob: false, lastEdited: '', customer, phases: JSON.parse(JSON.stringify(phases)), quoteSource: quoteSource ?? undefined }
      if (editingId) {
        const existing = quotes.find(q => q.id === editingId)!
        await updateQuote({ ...existing, ...qData })
        setEditingId(null)
        alert('Quote updated successfully.')
      } else {
        const newQuote = await addQuote(qData)
        await upsertClientFromQuote(customer)
        alert('Quote saved! Reference: ' + newQuote.ref)
      }
      setCustName(''); setCustAddr(''); setCustEmail(''); setCustPhone('')
      setScope(''); setPhoto('')
      loadTemplate(jobType)
    } finally {
      setSaving(false)
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setIsLockedQuote(false)
    setCustName(''); setCustAddr(''); setCustEmail(''); setCustPhone('')
    setScope(''); setPhoto('')
    loadTemplate(jobType)
  }

  function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (file.size > 4 * 1024 * 1024) { alert('Photo too large — max 4MB.'); return }
    const reader = new FileReader()
    reader.onload = e => setPhoto(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const filteredClients = clientSearch.trim()
    ? clients.filter(c => {
        const n = c.name || ''
        const q = clientSearch.toLowerCase()
        return n.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
      })
    : clients

  function selectClient(cid: string) {
    const c = clients.find(x => x.id === cid)
    if (!c) return
    setCustName(c.name || ''); setCustEmail(c.email || '')
    setCustPhone(c.phone || ''); setCustAddr(c.address || '')
    setClientDrop(false); setClientSearch('')
  }

  async function generateScope() {
    if (!jobType || !custAddr) { alert('Please fill in the job type and address first.'); return }
    setGeneratingScope(true)
    try {
      const res = await fetch('/api/generate-scope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobType, address: custAddr, phases: phases.map(p => p.phase) }),
      })
      const data = await res.json()
      if (data.scope) setScope(data.scope)
      else alert('Could not generate scope — check your API key in settings.')
    } catch {
      alert('Failed to generate scope.')
    } finally {
      setGeneratingScope(false)
    }
  }

  // Build ordered list of unique main phase names
  const mainPhaseOrder: string[] = []
  const seenMain = new Set<string>()
  for (const p of phases) {
    const mp = p.parentPhase || ''
    if (mp && !seenMain.has(mp)) { seenMain.add(mp); mainPhaseOrder.push(mp) }
  }
  const orphanPhases = phases.filter(p => !p.parentPhase)

  const previewQuote: Quote = {
    id: editingId || 'preview', ref: 'PREVIEW',
    savedDate: new Date().toLocaleDateString('en-GB'), lastEdited: '',
    status: 'pending', jobType, markup, vatIncluded: vatOn, scope, photo,
    convertedToJob: false,
    customer: { name: custName, address: custAddr, email: custEmail, phone: custPhone },
    phases: JSON.parse(JSON.stringify(phases)),
  }



  if (loading) return <div style={{ padding: 40, color: 'var(--muted)' }}>Loading…</div>

  // ── Landing wizard ─────────────────────────────────────────────────────────
  if (step === 'landing') {
    return <QuoteLandingWizard onSelect={handleLandingSelect} />
  }

  // ── AI Scope Workspace ─────────────────────────────────────────────────────
  if (step === 'ai-scope') {
    return (
      <>
        <AIScopeWorkspace
          onScopeChange={setScope}
          onJobTypeChange={jt => setJobType(jt)}
          onBuildEstimate={handleBuildFromScope}
          onBack={() => setStep('landing')}
          generating={generatingPhases}
          initialJobType={jobType !== 'Rear Extension' ? jobType : undefined}
        />
        {/* Interview is now embedded in AIScopeWorkspace — no separate modal needed */}
      </>
    )
  }

  return (
    <>
      {editingId && isLockedQuote && (
        <div style={{ background: '#f0f9e8', border: '1.5px solid #7ab533', borderRadius: 6, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span>
            🔒 <strong>Accepted quote — read only.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              {quotes.find(q => q.id === editingId)?.ref || editingId} · This quote has been accepted and cannot be modified.
            </span>
          </span>
          <button className="btn-sm btn-outline" onClick={cancelEdit}>Close</button>
        </div>
      )}
      {editingId && !isLockedQuote && (
        <div style={{ background: 'rgba(74,144,164,0.1)', border: '1px solid #4a90a4', borderRadius: 6, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <span>✎ Editing saved quote: <strong>{quotes.find(q => q.id === editingId)?.ref || editingId}</strong></span>
          <button className="btn-sm btn-outline" onClick={cancelEdit}>Cancel Edit</button>
        </div>
      )}

      <div className="qb-grid" style={{ gridTemplateColumns: '270px 1fr' }}>
        {/* Left panel */}
        <div className="qb-left">
          <div className="card">
            <div className="card-hd">Customer Details</div>
            <div style={{ padding: '14px 16px' }}>
              <div className="fg" style={{ position: 'relative' }}>
                <label>Client Name</label>
                <input
                  value={custName}
                  onChange={e => { setCustName(e.target.value); setClientSearch(e.target.value) }}
                  onFocus={() => setClientDrop(true)}
                  onBlur={() => setTimeout(() => setClientDrop(false), 200)}
                  placeholder="Search or type name…"
                  autoComplete="off"
                />
                {clientDrop && filteredClients.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1.5px solid var(--border)', borderRadius: 6, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 200, overflowY: 'auto' }}>
                    {filteredClients.map(c => (
                      <div key={c.id} onMouseDown={() => selectClient(c.id)}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--slate)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 600, flexShrink: 0 }}>
                          {(c.name[0] || '').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                          {c.phone && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{c.phone}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="fg">
                <label>Address</label>
                <textarea value={custAddr} onChange={e => setCustAddr(e.target.value)} rows={2} placeholder="14 Thornton Road&#10;London SW1 2AB" />
              </div>
              <div className="fg">
                <label>Email</label>
                <input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} placeholder="client@email.com" />
              </div>
              <div className="fg">
                <label>Phone</label>
                <input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="07700 900000" />
              </div>
              {custAddr && (
                <a href={`https://www.google.com/maps/search/${encodeURIComponent(custAddr)}`}
                  target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--sky)', display: 'inline-block', marginBottom: 8 }}>
                  🗺 View on Maps
                </a>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">Property Photo</div>
            <div style={{ padding: '14px 16px' }}>
              {photo
                ? <div>
                    <img src={photo} alt="Property" style={{ width: '100%', borderRadius: 4, objectFit: 'cover', maxHeight: 140, marginBottom: 8 }} />
                    <button className="btn-sm btn-danger" onClick={() => setPhoto('')}>Remove Photo</button>
                  </div>
                : <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handlePhotoFile(f) }}
                    onClick={() => photoInputRef.current?.click()}
                    style={{ border: '2px dashed var(--border)', borderRadius: 6, padding: 24, textAlign: 'center', cursor: 'pointer', fontSize: 12, color: 'var(--muted)' }}>
                    Drag & drop or click to upload
                    <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f) }} />
                  </div>
              }
            </div>
          </div>

          {/* Summary */}
          <div className="totals-box">
            <div style={{ marginBottom: 12, fontWeight: 600, fontSize: 13 }}>
              Quote Summary
              <span className="mono" style={{ marginLeft: 10, fontSize: 16, color: '#7ab533' }}>{fmt(total)}</span>
            </div>
            <div className="tot-row"><span>Your Cost</span><span className="mono" style={{ color: '#e67e22' }}>{fmt(cost)}</span></div>
            <div className="tot-row"><span>Markup ({markup}%)</span><span className="mono" style={{ color: '#7ab533' }}>{fmt(mu)}</span></div>
            <div className="tot-row"><span>Sell Price (ex-VAT)</span><span className="mono">{fmt(sell)}</span></div>
            {vatOn && <div className="tot-row"><span>VAT (20%)</span><span className="mono" style={{ color: '#4a90a4' }}>{fmt(vatAmt)}</span></div>}
            <div className="tot-final">
              <span style={{ fontWeight: 700 }}>TOTAL</span>
              <span className="mono" style={{ fontSize: 20, fontWeight: 700 }}>{fmt(total)}</span>
            </div>
          </div>

          <div style={{ marginTop: 14, background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '14px 16px' }}>
            <div className="fg" style={{ marginBottom: 8 }}>
              <label>Markup: {markup}%</label>
              <input type="range" min={0} max={40} value={markup} onChange={e => setMarkup(Number(e.target.value))} style={{ padding: 0, border: 'none', background: 'none' }} />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={vatOn} onChange={e => setVatOn(e.target.checked)} style={{ width: 'auto' }} />
              Include VAT (20%)
            </label>
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => setShowPreview(true)} style={{ flex: 1 }}>👁 Preview</button>
            {!isLockedQuote && (
              <button className="btn btn-outline" onClick={handleSaveDraft} disabled={saving} style={{ flex: 1 }}>
                {saving ? 'Saving…' : '📝 Save Draft'}
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || isLockedQuote}
              style={{ flex: 1, opacity: isLockedQuote ? 0.45 : 1 }}
              title={isLockedQuote ? 'Accepted quotes are locked and cannot be modified' : undefined}>
              {saving ? 'Saving…' : isLockedQuote ? '🔒 Locked' : editingId ? '💾 Update' : '💾 Save Quote'}
            </button>
          </div>
        </div>

        {/* Right panel — Quote Workspace */}
        <div className="qb-right">

          {/* ── Workspace header: only shown for manual entry ── */}
          {quoteSource === 'manual' && <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
            {/* Row 1: Job type + action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              {/* Back to landing */}
              {!editingId && (
                <button
                  onClick={() => { if (!phases.length || confirm('Go back to selection? Current lines will be cleared.')) { setPhases([]); setStep('landing'); setQuoteSource(null) } }}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  ← Change
                </button>
              )}
              <select
                value={jobType}
                onChange={e => onJobTypeChange(e.target.value)}
                style={{ padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 600, background: 'white', minWidth: 180 }}
              >
                {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>

              <div style={{ flex: 1 }} />

            </div>

            {/* Row 2: Scope textarea */}
            <textarea
              value={scope}
              onChange={e => setScope(e.target.value)}
              rows={3}
              placeholder="Describe the scope of works… (used by AI to generate the quote)"
              style={{ width: '100%', resize: 'vertical', fontSize: 12, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text)' }}
            />
          </div>}

          {(buildingEstimate || loadingBO || generatingPhases) ? (
            <div className="empty-dashed" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>
                {loadingBO ? 'Loading Back Office defaults…' : generatingPhases ? 'Building Estimate…' : 'Building Estimate…'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {loadingBO ? 'Fetching phases, sub-phases and task rates from Back Office.' : 'Analysing scope and generating phases. This takes a few seconds.'}
              </div>
            </div>
          ) : (
            <>
              {estimateUsedDB && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, marginBottom: 12, fontSize: 12, color: '#1d4ed8' }}>
                  <span style={{ fontWeight: 700 }}>✓ Back Office rates applied</span>
                  <span style={{ color: '#64748b' }}>— costs based on your configured defaults</span>
                </div>
              )}
              {/* Always-present hidden file input so takeoffInputRef.current?.click() works
                  regardless of which route opened the workspace */}
              <input ref={takeoffInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importTakeoff} />
              <QuoteWorkspace
                phases={phases}
                markup={markup}
                vatOn={vatOn}
                isLocked={isLockedQuote}
                onChange={setPhases}
                onImportTakeoff={() => takeoffInputRef.current?.click()}
                onAIGenerate={generatePhases}
                aiGenerating={generatingPhases}
                onLoadTemplate={loadTemplate}
                jobType={jobType}
                onSaveToBO={handleSaveToBO}
                labourTrades={labourTrades}
                boProducts={boProducts}
                boPlantItems={boPlantItems}
                quoteSource={quoteSource ?? undefined}
              />
            </>
          )}
        </div>
      </div>

      {showPreview && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setShowPreview(false)} />
      )}

      {/* ── Scope of Works AI help modal ── */}
      {showScopeHelp && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowScopeHelp(false) }}>
          <div className="form-modal" style={{ width: 'min(500px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="form-modal-hd">
              <div style={{ fontWeight: 700, fontSize: 17 }}>✦ How to use the AI Scope Writer</div>
              <button className="modal-close" onClick={() => setShowScopeHelp(false)}>×</button>
            </div>
            <div className="form-modal-bd" style={{ fontSize: 13, lineHeight: 1.7 }}>

              {/* Step list */}
              {[
                {
                  n: '1', icon: '🖊️', title: 'Open the chat',
                  body: 'Click the “✦ AI Chat” button on the Scope of Works card. A chat panel will open — this is your pre-estimate interview.',
                },
                {
                  n: '2', icon: '💬', title: 'Describe the job',
                  body: 'Tell the AI about the project in plain English — job type, approximate size, and the main works. For example: "Single storey rear extension, roughly 4m wide × 5m out, flat roof, bifold doors, open-plan kitchen."',
                },
                {
                  n: '3', icon: '❓', title: 'Answer the follow-up questions',
                  body: "The AI will ask a few targeted questions about things it needs to know — roof type, structural works, drainage, finishes, etc. Answer naturally. If you're unsure, say \"not sure\" or \"make an allowance\" and the AI will use a sensible standard assumption.",
                },
                {
                  n: '4', icon: '📎', title: 'Attach plans or photos (optional)',
                  body: 'Click the paperclip button to attach building plans, architect drawings, or site photos. The AI will extract dimensions, room names and structural details automatically. Supports PDF, JPG and PNG (max 3 files, 8 MB each).',
                },
                {
                  n: '5', icon: '🎤', title: 'Or speak it (optional)',
                  body: 'Click the microphone button and describe the job aloud instead of typing. Works in Chrome and Edge.',
                },
                {
                  n: '6', icon: '✦', title: 'Build the estimate',
                  body: `Once the AI has enough information it generates a scope and shows a green "✦ Build Estimate" button. Click it — the system automatically creates all phases, selects tasks from your library, and populates labour, materials, plant and subcontractor allowances from Back Office rates.`,
                },
                {
                  n: '7', icon: '✏️', title: 'Review and adjust',
                  body: 'The estimate is now live. Add or remove phases, adjust quantities and rates on any task — totals update instantly. Nothing is locked before you save.',
                },
                {
                  n: '8', icon: '💬', title: 'Refine the scope text',
                  body: `Re-open the chat at any time to tweak the scope wording. Try: "Add a list of exclusions", "Add a provisional sums paragraph", or "Simplify the language."`,
                },
              ].map(step => (
                <div key={step.n} style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)',
                    color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{step.n}</div>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 2 }}>{step.icon} {step.title}</div>
                    <div style={{ color: 'var(--muted)' }}>{step.body}</div>
                  </div>
                </div>
              ))}

              {/* Tip box */}
              <div style={{
                background: 'rgba(74,144,164,0.08)', border: '1px solid rgba(74,144,164,0.25)',
                borderRadius: 8, padding: '12px 14px', marginTop: 4,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>💡 Tips</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--muted)' }}>
                  <li>Fill in <strong>job type</strong> and <strong>client address</strong> first — the AI reads them automatically.</li>
                  <li>You don't need to write a long description — a sentence or two is enough to start the interview.</li>
                  <li>If you answer “not sure” or “skip”, the AI makes a sensible industry-standard assumption and notes it in the scope.</li>
                  <li>The <strong>✦ Build Estimate</strong> button appears once the AI has enough info — clicking it auto-populates all phases and tasks from your Back Office rates.</li>
                  <li>Nothing is saved until you click <strong>”Save Quote”</strong> — you can keep adjusting.</li>
                </ul>
              </div>
            </div>
            <div className="form-modal-ft">
              <button className="btn btn-primary" onClick={() => { setShowScopeHelp(false); setShowScopeChat(true) }}>
                ✦ Open AI Chat
              </button>
              <button className="btn btn-outline" onClick={() => setShowScopeHelp(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showScopeChat && (
        <ScopeChat
          quoteId={editingId}
          jobType={jobType}
          address={custAddr}
          phases={phases.map(p => p.phase)}
          onInsert={text => setScope(text)}
          onClose={() => setShowScopeChat(false)}
          onBuildEstimate={handleBuildEstimate}
        />
      )}
    </>
  )
}

// ── Sub-phase block component ─────────────────────────────────────────────────
interface SubPhaseBlockProps {
  p: QuotePhase
  pi: number
  markup: number
  vatOn: boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onUpdatePhaseName: (id: number, name: string) => void
  onRemovePhase: (id: number) => void
  onUpdatePhase: (updated: QuotePhase) => void
  onSaveToBO: () => void
}

function SubPhaseBlock({ p, pi, markup, collapsed, onToggleCollapse, onUpdatePhaseName, onRemovePhase, onUpdatePhase, onSaveToBO }: SubPhaseBlockProps) {
  const subSell = calcPhaseSell(p, markup)
  const hasEstimatorItems = (p.estimatorItems?.length ?? 0) > 0

  return (
    <div className="phase-block" style={{ borderRadius: p.parentPhase ? '0' : undefined, marginBottom: 2 }}>
      <div className="phase-hd" style={{ background: '#f7f9f7', borderTop: '1px solid #e8ede8' }}>
        {/* Collapse / expand toggle */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand phase' : 'Collapse phase'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: 10, padding: '0 2px',
            lineHeight: 1, flexShrink: 0,
          }}
        >
          {collapsed ? '▶' : '▼'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, minWidth: 16 }}>{pi + 1}.</span>
        <input value={p.phase} onChange={e => onUpdatePhaseName(p.id, e.target.value)} style={{ fontSize: 13 }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--slate)', fontWeight: 600, minWidth: 70, textAlign: 'right' }}>{fmt(subSell)}</span>
        {hasEstimatorItems && (
          <button
            onClick={onSaveToBO}
            title="Save these rates back to your Back Office defaults"
            style={{
              background: 'none', border: '1px solid #bfdbfe', borderRadius: 4,
              color: '#3b82f6', fontSize: 10, padding: '1px 6px', cursor: 'pointer',
              fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.4,
            }}
          >💾 BO</button>
        )}
        <button className="rm-btn" onClick={() => onRemovePhase(p.id)} title="Remove this sub-phase">×</button>
      </div>

      {/* Cost breakdown — estimator is the sole pricing engine */}
      {!collapsed && (
        <EstimatorBreakdown phase={p} onUpdatePhase={onUpdatePhase} markup={markup} />
      )}
    </div>
  )
}
