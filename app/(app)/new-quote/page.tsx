'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
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
import QuoteVersionHistory from '@/components/QuoteVersionHistory'
import { useDraggableModal } from '@/components/useDraggableModal'
import ModalResizeHandle from '@/components/ModalResizeHandle'
import type { TakeoffItem, TakeoffPhase, LayerCostRecord } from '@/lib/takeoff-types'
import { PHASE_TO_QUOTE_PARENT, ALL_MAKEUPS, calcLayerQty, WALL_OPENING_LABELS, type TakeoffLabourLine } from '@/lib/takeoff-types'
import { DEFAULT_DEMO_SUBPHASES, calcDemoSellingPrice, DEMO_UNIT_LABELS, type DemoUnit } from '@/lib/demolition-data'
import { ALL_PHASE_SUBPHASES, calcPhaseTaskSellingPrice } from '@/lib/phase-tasks'
import { sumByCategory } from '@/lib/material-recipes'
import { createClient } from '@/lib/supabase/client'
import { fetchWallTypesWithLayers, wallTypesToMakeups, fetchQuoteDefaults, fetchAllQuoteDefaults, upsertTask, fetchLabourTrades, fetchProducts, fetchPlantItems, fetchPhases, fetchSubPhases, fetchTasks } from '@/lib/back-office-queries'
import type { BOLabourTrade, BOProduct, BOPlantItem, BOPhase, BOSubPhase, BOTask } from '@/lib/back-office-types'
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

// Maps a /api/scope-to-quote response into QuotePhase[], preferring real Back Office
// rates and flagging anything the AI had to invent or couldn't match for human review.
// Shared by generatePhases() (new-quote landing flow) and handleBuildEstimate()
// (in-workspace "Edit with AI") so both entry points behave identically instead of
// one silently letting the AI invent its own pricing.
function buildPhasesFromScopeToQuote(
  scopePhases: ScopeToQuotePhase[],
  taskRates: Record<string, TaskRateEntry>
): QuotePhase[] {
  const VALID_TYPES: MeasurementType[] = ['area', 'volume', 'linear', 'quantity']

  return scopePhases.map(sp => {
    const selectedSet = new Set(sp.selectedTasks ?? [])

    // Build template items — prefer Back Office rates, fall back to static defaults
    const templateItems: EstimatorItemTemplate[] = []
    for (const taskName of sp.selectedTasks ?? []) {
      if (taskRates[taskName]) {
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
}

// Snapshots a quote as a new version before an AI action replaces its phases, so the
// prior state is never silently lost. Best-effort — a failure here doesn't block the
// AI action itself, same as the existing (non-blocking) document-upload pattern.
async function backupQuoteBeforeReplace(quoteId: string): Promise<void> {
  try {
    await fetch('/api/quotes/create-version', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId }),
    })
  } catch (err) {
    console.error('[backupQuoteBeforeReplace] snapshot failed (non-blocking):', err)
  }
}

export default function NewQuotePage() {
  const { quotes, clients, addQuote, updateQuote, upsertClientFromQuote, getTemplate, loading, setPageTitle } = useApp()
  const router = useRouter()

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
  const [autoSaving,  setAutoSaving]  = useState(false)
  const [lastSaved,   setLastSaved]   = useState<Date | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards the one-shot init effect below against running twice for the same
  // mount. Must be a ref, not state — a second invocation can happen before
  // React has re-rendered with state set by the first, so a state-based guard
  // sees stale (pre-update) values on both calls. A ref mutates synchronously
  // and is shared across both, so it reliably blocks the second run.
  const initRanRef = useRef(false)
  const [generatingScope, setGeneratingScope] = useState(false)
  const [generatingPhases, setGeneratingPhases] = useState(false)
  const [showScopeChat, setShowScopeChat] = useState(false)
  const [buildingEstimate, setBuildingEstimate] = useState(false)
  // Quick Quote pricing (only used when quoteSource === 'quick')
  const [quickSellStr, setQuickSellStr] = useState('')
  const [quickCostStr, setQuickCostStr] = useState('')
  const [loadingBO, setLoadingBO] = useState(false)   // true while fetching BO defaults for manual quotes
  const [estimateUsedDB, setEstimateUsedDB] = useState(false)
  const [showScopeHelp, setShowScopeHelp] = useState(false)
  const scopeHelpModal = useDraggableModal()
  const [clientDrop, setClientDrop] = useState(false)
  const [clientSearch, setClientSearch] = useState('')
  const [contactSaved, setContactSaved] = useState(false)
  const [collapsedPhases, setCollapsedPhases] = useState<Set<number>>(new Set())
  const [labourTrades,  setLabourTrades]  = useState<BOLabourTrade[]>([])
  const [boProducts,    setBoProducts]    = useState<BOProduct[]>([])
  const [boPlantItems,  setBoPlantItems]  = useState<BOPlantItem[]>([])
  const [boPhases,      setBoPhases]      = useState<BOPhase[]>([])
  const [boSubPhases,   setBoSubPhases]   = useState<BOSubPhase[]>([])
  const [boTasks,       setBoTasks]       = useState<BOTask[]>([])
  const [showLibrary,   setShowLibrary]   = useState(false)
  const [libraryData,   setLibraryData]   = useState<Awaited<ReturnType<typeof fetchAllQuoteDefaults>>>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
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
  const [clientRequestFiles, setClientRequestFiles] = useState<{name: string; url: string; isImage: boolean}[]>([])
  const [clientFilesExpanded, setClientFilesExpanded] = useState(true)

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
      fetchPhases(sb, data.user.id).then(ps => setBoPhases(ps.filter(p => p.active)))
      fetchSubPhases(sb, data.user.id).then(sp => setBoSubPhases(sp.filter(s => s.active)))
      fetchTasks(sb, data.user.id).then(tasks => setBoTasks(tasks.filter(t => t.active)))
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

    // Guard against this effect running twice for the same mount (observed:
    // React invokes it a second time using the SAME pre-update closure before
    // the first invocation's state changes have been re-rendered — a
    // state-based guard can't see that, hence the ref). sessionStorage's
    // 'sbc_edit_quote' flag is consumed (deleted) on first read below, so a
    // second run would find it gone and fall through to the blank "new quote"
    // branch — resetting phases to [] while editingId stays pointed at the
    // real quote, which the auto-save would then persist over real data.
    // This exact bug wiped a live customer quote (QT-1282, Sept 2026).
    if (initRanRef.current) return
    initRanRef.current = true

    // Resume editing an existing saved quote
    const editId = sessionStorage.getItem('sbc_edit_quote')
    if (editId) {
      sessionStorage.removeItem('sbc_edit_quote')
      const q = quotes.find(x => x.id === editId)
      if (q) { loadQuoteForEdit(q); setStep('workspace'); return }
    }

    // Sent directly from the Takeoff tool — auto-import without file dialog
    const rawTakeoff = sessionStorage.getItem('sbc_takeoff_for_quote')
    if (rawTakeoff) {
      sessionStorage.removeItem('sbc_takeoff_for_quote')
      ;(async () => {
        try {
          const data = JSON.parse(rawTakeoff)
          await applyTakeoffData(data)
          setStep('workspace')
        } catch {
          alert('Could not process takeoff data.')
          setStep('landing')
        }
      })()
      return
    }

    // Client files from a quote request — load alongside the quote
    const rawFiles = sessionStorage.getItem('sbc_quote_request_files')
    if (rawFiles) {
      sessionStorage.removeItem('sbc_quote_request_files')
      try { setClientRequestFiles(JSON.parse(rawFiles)) } catch { /* ignore */ }
    }

    // Quote request — URL params mean we came from the quote requests page.
    const params = new URLSearchParams(window.location.search)
    const reqClientName = params.get('clientName') || ''
    if (reqClientName) {
      const reqEmail   = params.get('email')   || ''
      const reqPhone   = params.get('phone')   || ''
      const reqAddress = params.get('address') || ''
      const reqJobType = params.get('jobType') || 'Rear Extension'
      const reqScope   = sessionStorage.getItem('sbc_quote_request_scope') || ''
      sessionStorage.removeItem('sbc_quote_request_scope')

      setCustName(reqClientName)
      setCustEmail(reqEmail)
      setCustPhone(reqPhone)
      setCustAddr(reqAddress)
      setJobType(reqJobType)
      if (reqScope) setScope(reqScope)
      setQuoteSource('ai')
      setMarkup(0)    // phases already priced at sell price (markup applied by the customer quote API)
      setVatOn(true)  // VAT is separate — QB adds it on top of the sell prices
      setStep('workspace')

      // Preferred path: customer's AI estimate phases are stored directly — no re-call needed.
      const rawPhases = sessionStorage.getItem('sbc_quote_request_phases')
      sessionStorage.removeItem('sbc_quote_request_phases')
      if (rawPhases) {
        try {
          const aiPhases = JSON.parse(rawPhases) as Array<{
            parentPhase?: string; phase: string
            labour: number;        labourNotes?: string
            materials: number;     materialsNotes?: string
            plant: number;         plantNotes?: string
            subcontractors?: number; subNotes?: string
            other?: number;        otherNotes?: string
          }>
          setPhases(aiPhases.map(p => {
            const ph = makePhase(p.phase, [
              { desc: p.labourNotes        || 'Labour',       qty: 1, unit: 'Item', labour: Number(p.labour)         || 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour'         as const },
              { desc: p.materialsNotes     || 'Materials',    qty: 1, unit: 'Item', labour: 0, materials: Number(p.materials)      || 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials'      as const },
              { desc: p.plantNotes         || 'Plant hire',   qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: Number(p.plant)          || 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant'          as const },
              { desc: p.subNotes           || 'Subcontract',  qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: Number(p.subcontractors) || 0, other: 0, notes: '', itemType: 'subcontractors' as const },
              { desc: p.otherNotes         || 'Other',        qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: Number(p.other)         || 0, notes: '', itemType: 'other'          as const },
            ], p.parentPhase || undefined)
            return { ...ph, source: 'ai' as const, itemStatus: 'ai' as const }
          }))
          return
        } catch { /* fall through to AI re-generate */ }
      }

      // Fallback: no stored phases — re-generate from scope text via AI.
      if (reqScope) {
        ;(async () => {
          const ok = await generatePhases({ scope: reqScope, jobType: reqJobType })
          if (!ok) loadTemplate(reqJobType)
        })()
      } else {
        loadTemplate(reqJobType)
      }
      return
    }

    // New quote — show landing wizard
    setPhases([])
    setStep('landing')
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update page title based on editing state
  useEffect(() => {
    if (editingId) {
      const quote = quotes.find(q => q.id === editingId)
      setPageTitle(`Editing: ${quote?.ref || 'Quote'}`)
      document.title = `Editing: ${quote?.ref || 'Quote'} - Small Build Quote App`
    } else {
      setPageTitle(null)
      document.title = 'New Quote - Small Build Quote App'
    }
  }, [editingId, quotes, setPageTitle])

  // ── Auto-save when editing an existing saved quote ───────────────────────────
  // Debounced 2s — fires silently on any change to phases, customer data or settings.
  // Does NOT fire for new unsaved quotes, locked quotes, or during initial load.
  useEffect(() => {
    if (!editingId || isLockedQuote || loading) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const existing = quotes.find(q => q.id === editingId)
      if (!existing) return
      // Never let a silent, unattended save wipe out phases that are still
      // saved in the database — this exact scenario caused a real quote to
      // lose all its data (QT-1282, Sept 2026). If the local state somehow
      // ends up empty while the DB still has phases, skip this save cycle
      // rather than overwrite good data with a race condition or stale state.
      if (phases.length === 0 && existing.phases.length > 0) {
        console.error('[autosave] refusing to save empty phases over existing data for quote', editingId)
        return
      }
      setAutoSaving(true)
      try {
        const customer = { name: custName, address: custAddr, email: custEmail, phone: custPhone }
        const qData = {
          status: existing.status,
          jobType, markup, vatIncluded: vatOn, scope, photo,
          convertedToJob: existing.convertedToJob ?? false,
          lastEdited: new Date().toISOString(),
          customer,
          phases: JSON.parse(JSON.stringify(phases)),
          quoteSource: quoteSource ?? undefined,
        }
        await updateQuote({ ...existing, ...qData })
        setLastSaved(new Date())
      } catch { /* silent — user can still save manually */ }
      finally { setAutoSaving(false) }
    }, 2000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, custName, custAddr, custEmail, custPhone, jobType, markup, vatOn, scope, photo, editingId])

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
        // Use task description (preferred — more human-readable) then name as fallback
        const taskNames = Array.from(new Set(
          row.tasks.map(t => (t.description?.trim() || t.client_description?.trim() || t.name)?.trim()).filter(Boolean)
        ))
        built.push({ ...ph, source: 'manual', itemStatus: 'bo-default', boSubPhaseId: row.subPhaseId, taskName: taskNames.join(' · ') || undefined })
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

  async function openLibrary() {
    setShowLibrary(true)
    if (libraryData.length) return  // already loaded
    setLibraryLoading(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const data = await fetchAllQuoteDefaults(sb, user.id)
      setLibraryData(data)
    } finally {
      setLibraryLoading(false)
    }
  }

  function addFromLibrary(selectedSubPhaseIds: string[]) {
    const toAdd = libraryData.filter(row => selectedSubPhaseIds.includes(row.subPhaseId))
    const newPhases: QuotePhase[] = toAdd.map(row => {
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
      if (!items.length) {
        items.push(
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'labour'         as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'materials'      as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'plant'          as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'subcontractors' as const },
          { desc: '', qty: 1, unit: 'Item', labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0, notes: '', itemType: 'other'          as const },
        )
      }
      return makePhase(row.subPhaseName, items, row.phaseName) as QuotePhase
    })
    setPhases(prev => [...prev, ...newPhases])
    setShowLibrary(false)
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
    // Detect Quick Quotes by structure when quoteSource wasn't persisted (legacy saves)
    const isQuickByStructure =
      q.phases.length === 1 &&
      q.phases[0]?.parentPhase === 'Project Works' &&
      q.phases[0]?.phase === 'Lump Sum'
    const resolvedSource = q.quoteSource ?? (isQuickByStructure ? 'quick' : 'manual')
    setQuoteSource(resolvedSource)
    // Quick Quote: extract sell price + cost from the lump-sum phase
    // Sum ALL item types — the cost may be split across labour/materials/other in legacy saves
    if (resolvedSource === 'quick' && q.phases.length > 0) {
      const lump = q.phases[0]
      const costVal = lump.items.reduce((sum: number, i: QuoteItem) =>
        sum + (i.labour || 0) + (i.materials || 0) + (i.plantHire || 0) + (i.subcontractors || 0) + (i.other || 0), 0)
      const sellVal = calcPhaseSell(lump, q.markup || 0)
      setQuickCostStr(costVal > 0 ? String(Math.round(costVal)) : '')
      setQuickSellStr(sellVal > 0 ? String(Math.round(sellVal)) : '')
    }
    setPhases(JSON.parse(JSON.stringify(q.phases)).map((p: QuotePhase) => ({
      ...p, id: ++phaseCounter,
      items: toTypedItems(p.items).map((i: Omit<QuoteItem,'id'>) => ({ ...i, id: ++itemCounter })),
    })))
    setEditingId(q.id)
    setIsLockedQuote(q.status === 'accepted')
  }

  // ── Quick Quote pricing update ─────────────────────────────────────────────
  function applyQuickPricing(sellStr: string, costStr: string) {
    const sellNum = parseFloat(sellStr.replace(/,/g, '')) || 0
    const costNum = parseFloat(costStr.replace(/,/g, '')) || 0
    if (sellNum <= 0 || costNum <= 0) return
    const newMarkup = ((sellNum / costNum) - 1) * 100
    const marginPct = ((sellNum - costNum) / sellNum * 100).toFixed(1)
    setMarkup(newMarkup)
    setPhases(prev => prev.map((p, idx) => {
      if (idx !== 0) return p
      return {
        ...p,
        items: p.items.map(i => {
          // Consolidate everything into the 'other' row — zero out all other types
          // so the Quick Quote panel is the single source of truth for cost
          if (i.itemType === 'other') {
            return { ...i, other: costNum, labour: 0, materials: 0, plantHire: 0, subcontractors: 0,
              desc: 'Estimated Project Cost',
              notes: `Sell £${sellNum.toLocaleString('en-GB', { minimumFractionDigits: 2 })} | Cost £${costNum.toLocaleString('en-GB', { minimumFractionDigits: 2 })} | Margin ${marginPct}%` }
          }
          // Zero out all other typed rows so they don't double-count
          return { ...i, labour: 0, materials: 0, plantHire: 0, subcontractors: 0, other: 0 }
        }),
      }
    }))
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
      // Navigate to the Takeoff tool — user draws plans there, then
      // clicks "Send to Quote" which stores data in sessionStorage and
      // redirects back here with the takeoff data pre-loaded.
      router.push('/takeoff')
    } else {
      setStep('workspace')
    }
  }

  // Called from AIScopeWorkspace when user clicks "Export to Quote"
  // scopeText is passed directly to avoid relying on React state having committed yet
  async function handleBuildFromScope(scopeText?: string) {
    const ok = await generatePhases(scopeText ? { scope: scopeText } : undefined)
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
        if (!phases.length && existing.phases.length > 0) {
          alert('This quote currently has no lines — refusing to overwrite the saved version, which still has data. Reload the page before continuing.')
          return
        }
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

  // AI generate phases from scope.
  // opts can override scope/jobType/address when called before React state has committed
  // (e.g. straight from the initialization useEffect when coming from a quote request).
  // Builds phases from a written scope by selecting real tasks from the contractor's
  // Back Office library (falling back to static UK-standard defaults only when no
  // Back Office data exists for that job type) — the AI never invents prices itself.
  // Shares its response-mapping logic with handleBuildEstimate() below so both
  // "Build Estimate" entry points behave identically.
  async function generatePhases(opts?: { scope?: string; jobType?: string }): Promise<boolean> {
    const effectiveScope   = opts?.scope   ?? scope
    const effectiveJobType = opts?.jobType ?? jobType
    if (!effectiveScope.trim()) { alert('Write a scope of works first — then click Generate Phases.'); return false }
    if (phases.length) {
      if (!confirm('Replace current phases with AI-generated ones? (Your current version will be saved first.)')) return false
      if (editingId) await backupQuoteBeforeReplace(editingId)
    }
    setGeneratingPhases(true)
    try {
      const res = await fetch('/api/scope-to-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: effectiveScope, jobType: effectiveJobType }),
      })
      const data = await res.json()
      if (data.error) { alert('Could not generate phases: ' + data.error); return false }
      if (!Array.isArray(data.phases)) { alert('Unexpected response from AI.'); return false }

      const built = buildPhasesFromScopeToQuote(data.phases as ScopeToQuotePhase[], data.taskRates ?? {})
      setPhases(built)
      setEstimateUsedDB(!!data.usingDB)
      return true   // phases were set — safe to transition
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
  // ── Core take-off processing (shared by file import + direct send) ──────────
  async function applyTakeoffData(data: {
    version:      number
    items:        TakeoffItem[]
    address?:     string
    jobType?:     string
    client?:      { name?: string; email?: string; phone?: string; addressLine1?: string; town?: string; postcode?: string }
    siteAddress?: string
    projectName?: string
    takeoffRef?:  string
  }) {
    // Fetch Back Office task rates (from_takeoff=true tasks, grouped by phase)
    const boRates = await fetchBOTakeoffRates()
    const hasBORates = Object.keys(boRates).length > 0

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
                // Use layerCosts from the Construction Layer Editor if available
                const lc = (item.layerCosts ?? {})[layer.id] as LayerCostRecord | undefined
                const lcLabour    = lc ? lc.labourItems.reduce((s, x) => s + x.total, 0)    : 0
                const lcMaterials = lc ? lc.materialItems.reduce((s, x) => s + x.total, 0)  : 0
                const lcPlant     = lc ? lc.plantItems.reduce((s, x) => s + x.total, 0)     : 0
                const lcSub       = lc ? lc.subItems.reduce((s, x) => s + x.total, 0)       : 0
                const lcOther     = lc ? lc.otherItems.reduce((s, x) => s + x.total, 0)     : 0

                layerRows.push({
                  desc,
                  qty,
                  unit,
                  labour:         lcLabour,
                  materials:      lcMaterials,
                  plantHire:      lcPlant,
                  subcontractors: lcSub,
                  other:          lcOther,
                  notes:          layerRows.length === 0 ? notes : layer.description,
                  itemType:       (layer.category === 'plant' ? 'plant'
                                : layer.category === 'other'  ? 'other'
                                : layer.category === 'labour' ? 'labour'
                                : 'materials') as QuoteItem['itemType'],
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
        const resolvedAddr = data.siteAddress
          || (data.client && [data.client.addressLine1, data.client.town, data.client.postcode].filter(Boolean).join(', '))
          || data.address
          || ''
        if (!custAddr && resolvedAddr) setCustAddr(resolvedAddr)
        if (data.jobType) setJobType(data.jobType)

        // Prefill client fields if blank
        if (!custName && data.client?.name)  setCustName(data.client.name)
        if (!custEmail && data.client?.email) setCustEmail(data.client.email)
        if (!custPhone && data.client?.phone) setCustPhone(data.client.phone)

        // Prefill project name into scope if blank
        if (data.projectName && !scope) setScope(data.projectName)

        // Prepend takeoff ref to scope so it's visible in the quote
        if (data.takeoffRef) {
          setScope(prev => {
            const prefix = `[Ref: ${data.takeoffRef}]`
            return prev.startsWith(prefix) ? prev : `${prefix}${prev ? ' — ' + prev : ''}`
          })
        }

        const buildupCount = (data.items as TakeoffItem[]).filter((i: TakeoffItem) => i.floorMakeupId).length
        const ratesNote = hasBORates ? ' Back Office rates applied.' : ' Add your rates to complete the estimate.'
        const msg = buildupCount > 0
          ? `✓ Imported ${newPhases.length} sub-phases (including ${buildupCount} build-up${buildupCount !== 1 ? 's' : ''} expanded into layers).${ratesNote}`
          : `✓ Imported ${newPhases.length} sub-phases.${ratesNote}`
        alert(msg)
      } catch {
        alert('Could not process take-off data. Make sure it was exported from the Take-off tool.')
      }
  }

  async function importTakeoff(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      await applyTakeoffData(data)
    } catch {
      alert('Could not parse take-off file. Make sure it was exported from the Take-off tool.')
    }
    e.target.value = ''
  }

  // ── AI Scope → fully-populated estimate ───────────────────────────────────
  async function handleBuildEstimate(scopeText: string) {
    if (phases.length) {
      if (!confirm('Replace current phases with AI-generated estimate from scope? (Your current version will be saved first.)')) return
      if (editingId) await backupQuoteBeforeReplace(editingId)
    }
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

      const built = buildPhasesFromScopeToQuote(data.phases as ScopeToQuotePhase[], data.taskRates ?? {})
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

  // Locked/accepted quotes can't change prices, but the admin may still need to
  // correct WHICH customer the quote is linked to. This saves only the customer.
  async function saveCustomerOnly() {
    if (!editingId) return
    const existing = quotes.find(q => q.id === editingId)
    if (!existing) return
    setSaving(true)
    try {
      const customer = { name: custName, address: custAddr, email: custEmail, phone: custPhone }
      await updateQuote({ ...existing, customer })
      alert('Customer updated for this quote.')
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

  async function saveAsNewContact() {
    if (!custName.trim()) return
    await upsertClientFromQuote({ name: custName, address: custAddr, email: custEmail, phone: custPhone })
    setContactSaved(true)
    setClientDrop(false); setClientSearch('')
    setTimeout(() => setContactSaved(false), 3000)
  }

  const clientNameIsNew = custName.trim().length > 0 &&
    !clients.some(c => (c.name || '').toLowerCase() === custName.trim().toLowerCase())

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
            🔒 <strong>Accepted quote — prices locked.</strong>{' '}
            <span style={{ color: 'var(--muted)' }}>
              {quotes.find(q => q.id === editingId)?.ref || editingId} · Prices &amp; scope can&apos;t change, but you can still fix the linked customer.
            </span>
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="btn-sm btn-primary"
              onClick={saveCustomerOnly}
              disabled={saving}
              title="Update which customer this quote is linked to (does not change prices or scope)"
            >
              {saving ? 'Saving…' : '💾 Update customer'}
            </button>
            <button className="btn-sm btn-outline" onClick={cancelEdit}>Close</button>
          </div>
        </div>
      )}
      {editingId && !isLockedQuote && (
        <div style={{ background: 'rgba(74,144,164,0.1)', border: '1px solid #4a90a4', borderRadius: 6, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>✎ Editing: <strong>{quotes.find(q => q.id === editingId)?.ref || editingId}</strong></span>
            <QuoteVersionHistory
              quoteId={editingId}
              currentVersion={quotes.find(q => q.id === editingId)?.versionNumber}
            />
            {autoSaving && (
              <span style={{ fontSize: 11, color: '#4a90a4' }}>⟳ Saving…</span>
            )}
            {!autoSaving && lastSaved && (
              <span style={{ fontSize: 11, color: '#64748b' }}>
                ✓ Saved {Math.round((Date.now() - lastSaved.getTime()) / 1000)}s ago
              </span>
            )}
          </div>
          <button className="btn-sm btn-outline" onClick={cancelEdit}>Cancel Edit</button>
        </div>
      )}

      {/* ── Client Plans & Photos (from quote request) ── */}
      {clientRequestFiles.length > 0 && (
        <div style={{ background: '#f0f7ff', border: '1.5px solid #bfdbfe', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
          <button
            onClick={() => setClientFilesExpanded(v => !v)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontSize: 14 }}>📎</span>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#1e40af' }}>Client Plans &amp; Photos</span>
            <span style={{ fontSize: 11, color: '#60a5fa', marginLeft: 4 }}>{clientRequestFiles.length} file{clientRequestFiles.length !== 1 ? 's' : ''}</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#93c5fd' }}>{clientFilesExpanded ? '▲' : '▼'}</span>
          </button>
          {clientFilesExpanded && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '4px 16px 14px' }}>
              {clientRequestFiles.map((f, i) => (
                f.isImage ? (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name}
                    style={{ display: 'block', borderRadius: 6, overflow: 'hidden', border: '1px solid #bfdbfe', flexShrink: 0 }}>
                    <img src={f.url} alt={f.name} style={{ width: 100, height: 100, objectFit: 'cover', display: 'block' }} />
                  </a>
                ) : (
                  <a key={i} href={f.url} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 100, height: 100, borderRadius: 6, border: '1px solid #bfdbfe', background: '#fff', gap: 4, textDecoration: 'none', color: '#1e40af', flexShrink: 0 }}>
                    <span style={{ fontSize: 28 }}>📄</span>
                    <span style={{ fontSize: 9, textAlign: 'center', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#60a5fa' }}>{f.name}</span>
                  </a>
                )
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Scope of Works — full-width, above the two-column grid ── */}
      {(quoteSource === 'manual' || quoteSource === 'ai' || quoteSource === 'quick' || !quoteSource) && (
        <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {quoteSource === 'manual' && !editingId && (
                <button
                  onClick={() => { if (!phases.length || confirm('Go back to selection? Current lines will be cleared.')) { setPhases([]); setStep('landing'); setQuoteSource(null) } }}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--muted)', cursor: 'pointer', padding: '0 4px' }}
                >← Change</button>
              )}
              {quoteSource === 'manual' && (
                <select
                  value={jobType}
                  onChange={e => onJobTypeChange(e.target.value)}
                  style={{ padding: '6px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 600, background: 'white', minWidth: 180 }}
                >
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              )}
              {quoteSource === 'ai' && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✦ AI-Generated Scope of Works</span>
              )}
              {quoteSource === 'quick' && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Quick Quote — Scope of Works</span>
              )}
              {(quoteSource === 'manual' || !quoteSource) && (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scope of Works</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Editable — included on the quote PDF</span>
              <button
                onClick={() => setShowScopeChat(true)}
                style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: 600, borderRadius: 6, border: 'none',
                  background: '#2b3a2b', color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                }}
              >
                💬 {scope.trim() ? 'Edit with AI' : 'Write with AI'}
              </button>
            </div>
          </div>
          <textarea
            value={scope}
            onChange={e => setScope(e.target.value)}
            rows={6}
            placeholder={quoteSource === 'ai' ? 'AI-generated scope will appear here — you can edit it freely.' : 'Describe the scope of works… or click "Write with AI" to build it conversationally'}
            style={{ width: '100%', resize: 'vertical', fontSize: 13, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text)', lineHeight: 1.6 }}
          />
        </div>
      )}

      {/* ── Quick Quote Pricing ── only shown for quick-source quotes ── */}
      {quoteSource === 'quick' && (() => {
        const qSell = parseFloat(quickSellStr.replace(/,/g, '')) || 0
        const qCost = parseFloat(quickCostStr.replace(/,/g, '')) || 0
        const qMargin = qSell - qCost
        const qMarginPct = qSell > 0 ? (qMargin / qSell) * 100 : 0
        const qVatAmt = vatOn ? qSell * 0.2 : 0
        const qTotal = qSell + qVatAmt
        return (
          <div style={{ background: 'var(--cream)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              ⚡ Quick Quote Pricing
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: qSell > 0 && qCost > 0 ? 12 : 0 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Quote Price (ex. VAT) <span style={{ color: '#e74c3c' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>£</span>
                  <input
                    type="number" min="0" step="100"
                    value={quickSellStr}
                    onChange={e => {
                      setQuickSellStr(e.target.value)
                      applyQuickPricing(e.target.value, quickCostStr)
                    }}
                    placeholder="0"
                    style={{ width: '100%', padding: '8px 10px 8px 22px', fontSize: 14, fontWeight: 700, boxSizing: 'border-box', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'DM Mono, monospace' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Price shown to the client</div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Estimated Cost (ex. VAT) <span style={{ color: '#e74c3c' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>£</span>
                  <input
                    type="number" min="0" step="100"
                    value={quickCostStr}
                    onChange={e => {
                      setQuickCostStr(e.target.value)
                      applyQuickPricing(quickSellStr, e.target.value)
                    }}
                    placeholder="0"
                    style={{ width: '100%', padding: '8px 10px 8px 22px', fontSize: 14, fontWeight: 700, boxSizing: 'border-box', border: '1.5px solid var(--border)', borderRadius: 6, fontFamily: 'DM Mono, monospace' }}
                  />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>Your internal cost estimate</div>
              </div>
            </div>
            {qSell > 0 && qCost > 0 && (
              <div style={{ background: qMargin >= 0 ? '#f0f7e6' : '#fff0ef', border: `1px solid ${qMargin >= 0 ? '#c8e89a' : '#ffb0b0'}`, borderRadius: 6, padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 3 }}>Sell</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14 }}>{fmt(qSell)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 3 }}>Cost</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14 }}>{fmt(qCost)}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 3 }}>Margin</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14, color: qMargin >= 0 ? '#4a7c1f' : '#c0392b' }}>
                    {fmt(qMargin)} <span style={{ fontSize: 11, fontWeight: 400 }}>({qMarginPct.toFixed(1)}%)</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748b', marginBottom: 3 }}>Total inc. VAT</div>
                  <div style={{ fontFamily: 'DM Mono, monospace', fontWeight: 700, fontSize: 14 }}>
                    {vatOn ? fmt(qTotal) : <span style={{ color: 'var(--muted)', fontSize: 12 }}>No VAT</span>}
                  </div>
                </div>
              </div>
            )}
            {qCost > 0 && qSell > 0 && qCost >= qSell && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#c0392b', fontWeight: 600 }}>
                ⚠ Estimated cost equals or exceeds the sell price — no profit margin.
              </div>
            )}
          </div>
        )
      })()}

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
                {clientDrop && (filteredClients.length > 0 || clientNameIsNew) && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1.5px solid var(--border)', borderRadius: 6, zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto' }}>
                    {filteredClients.map(c => (
                      <div key={c.id} onMouseDown={e => { e.preventDefault(); selectClient(c.id) }}
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
                    {clientNameIsNew && (
                      <div onMouseDown={e => { e.preventDefault(); saveAsNewContact() }}
                        style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: '#16a34a', fontWeight: 600, fontSize: 12, borderTop: filteredClients.length > 0 ? '1px solid var(--border)' : 'none', background: '#f0fdf4' }}>
                        <span style={{ fontSize: 14 }}>＋</span> Add &ldquo;{custName}&rdquo; as new contact
                      </div>
                    )}
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
              {contactSaved && (
                <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginBottom: 4 }}>✓ Contact saved</div>
              )}
              {clientNameIsNew && !contactSaved && (
                <button type="button" onClick={saveAsNewContact}
                  style={{ width: '100%', padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#16a34a', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', marginBottom: 4 }}>
                  ＋ Save &ldquo;{custName}&rdquo; as new contact
                </button>
              )}
              <div className="fg">
                <label>Job Type</label>
                <select
                  value={jobType}
                  onChange={e => setJobType(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)', borderRadius: 6, fontSize: 13, fontWeight: 600, background: 'white' }}
                >
                  {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
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
              <QuoteWorkspace
                phases={phases}
                markup={markup}
                vatOn={vatOn}
                isLocked={isLockedQuote}
                onChange={setPhases}
                onAIGenerate={generatePhases}
                aiGenerating={generatingPhases}
                onLoadTemplate={loadTemplate}
                jobType={jobType}
                onSaveToBO={handleSaveToBO}
                labourTrades={labourTrades}
                boProducts={boProducts}
                boPlantItems={boPlantItems}
                boPhases={boPhases}
                boSubPhases={boSubPhases}
                boTasks={boTasks}
                quoteSource={quoteSource ?? undefined}
                onOpenLibrary={openLibrary}
              />
            </>
          )}
        </div>
      </div>

      {showPreview && (
        <QuotePreviewModal quote={previewQuote} onClose={() => setShowPreview(false)} />
      )}

      {showLibrary && (
        <BOLibraryModal
          data={libraryData}
          loading={libraryLoading}
          onAdd={addFromLibrary}
          onClose={() => setShowLibrary(false)}
        />
      )}

      {/* ── Scope of Works AI help modal ── */}
      {showScopeHelp && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowScopeHelp(false) }}>
          <div ref={scopeHelpModal.boxRef} className="form-modal" style={{ width: 'min(500px, 96vw)', maxHeight: '90vh', overflowY: 'auto', ...scopeHelpModal.draggableStyle }}>
            <div className="form-modal-hd" onMouseDown={scopeHelpModal.onHeaderMouseDown}>
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
            <ModalResizeHandle onMouseDown={scopeHelpModal.onResizeMouseDown} />
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
          initialScope={scope || undefined}
        />
      )}
    </>
  )
}

// ── BO Library picker modal ───────────────────────────────────────────────────
function BOLibraryModal({
  data, loading, onAdd, onClose,
}: {
  data: Array<{ phaseName: string; phaseId: string; subPhaseName: string; subPhaseId: string; tasks: { id: string }[] }>
  loading: boolean
  onAdd: (ids: string[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const { boxRef, draggableStyle, onHeaderMouseDown, onResizeMouseDown } = useDraggableModal()

  // Group sub-phases by main phase
  const grouped = React.useMemo(() => {
    const map = new Map<string, typeof data>()
    for (const row of data) {
      if (!map.has(row.phaseName)) map.set(row.phaseName, [])
      map.get(row.phaseName)!.push(row)
    }
    return map
  }, [data])

  function toggleSub(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll(phaseSubIds: string[]) {
    const allOn = phaseSubIds.every(id => selected.has(id))
    setSelected(prev => {
      const n = new Set(prev)
      phaseSubIds.forEach(id => allOn ? n.delete(id) : n.add(id))
      return n
    })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={boxRef} className="modal-box" style={{ width: 'min(580px,96vw)', maxHeight: '85vh', display: 'flex', flexDirection: 'column', ...draggableStyle }}>
        <div className="modal-hd" onMouseDown={onHeaderMouseDown}>
          <div>
            <div style={{ fontWeight: 700 }}>📚 Add from Back Office Library</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Select sub-phases to add to this quote</div>
          </div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>⏳ Loading library…</div>}
          {!loading && grouped.size === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              No phases found in Back Office.<br/>Add phases in <strong>Back Office → Phases &amp; Tasks</strong> first.
            </div>
          )}
          {!loading && Array.from(grouped.entries()).map(([phaseName, subs]) => {
            const subIds = subs.map(s => s.subPhaseId)
            const allChecked = subIds.every(id => selected.has(id))
            const someChecked = subIds.some(id => selected.has(id))
            return (
              <div key={phaseName} style={{ borderBottom: '1px solid #e2e8f0' }}>
                {/* Main phase header — always visible, not collapsible */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#1e293b' }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                    onChange={() => toggleAll(subIds)}
                    style={{ flexShrink: 0, width: 15, height: 15, cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {phaseName}
                  </span>
                  <span style={{ flexShrink: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)', marginLeft: 6 }}>
                    {subs.length} sub-phase{subs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Sub-phases — always shown */}
                {subs.map(sub => (
                  <label
                    key={sub.subPhaseId}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 16px 7px 38px', cursor: 'pointer', borderTop: '1px solid #f0f4f8', background: '#fff' }}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(sub.subPhaseId)}
                      onChange={() => toggleSub(sub.subPhaseId)}
                      style={{ flexShrink: 0, width: 15, height: 15 }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#1e293b' }}>{sub.subPhaseName}</span>
                    {sub.tasks.length > 0 && (
                      <span style={{ flexShrink: 0, fontSize: 11, color: '#94a3b8' }}>{sub.tasks.length} task{sub.tasks.length !== 1 ? 's' : ''}</span>
                    )}
                  </label>
                ))}
              </div>
            )
          })}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{selected.size} sub-phase{selected.size !== 1 ? 's' : ''} selected</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-sm btn-outline" onClick={onClose}>Cancel</button>
            <button
              className="btn-sm btn-primary"
              disabled={selected.size === 0}
              onClick={() => onAdd(Array.from(selected))}
              style={{ opacity: selected.size === 0 ? 0.5 : 1 }}
            >
              + Add {selected.size > 0 ? selected.size : ''} to Quote
            </button>
          </div>
        </div>
        <ModalResizeHandle onMouseDown={onResizeMouseDown} />
      </div>
    </div>
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
