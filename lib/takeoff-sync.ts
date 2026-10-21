/**
 * Takeoff Sync — Supabase persistence helpers for takeoff projects.
 *
 * Architecture (see lib/product-config.ts for full three-tier description):
 *
 *   localStorage  — immediate write cache + offline/recovery fallback
 *   Supabase      — system of record (per user_id, RLS protected)
 *
 * Sync flow on the takeoff page:
 *   1. Mount:  read localStorage immediately → render (fast, works offline)
 *   2. Mount:  async fetch from Supabase → if DB record is newer, merge it in
 *   3. Change: synchronous write to localStorage (always)
 *              + debounced write to Supabase (fires after last change, default 2 s)
 *
 * Plan images (data URIs — potentially several MB) are excluded from Supabase.
 * They are stored in localStorage only via the 'sbc_takeoff_project' key.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TakeoffProject, TakeoffSheet } from './takeoff-types'

/** The customer and reference details of a take-off. They have no columns of their own, so they ride inside the `calibration` JSON like the sheets do. */
export type TakeoffMeta = Pick<TakeoffProject, 'clientId' | 'client' | 'projectName' | 'takeoffRef' | 'siteAddress'>

function metaOf(p: TakeoffProject): TakeoffMeta | undefined {
  const m: TakeoffMeta = {}
  if (p.clientId !== undefined) m.clientId = p.clientId
  if (p.client !== undefined) m.client = p.client
  if (p.projectName !== undefined) m.projectName = p.projectName
  if (p.takeoffRef !== undefined) m.takeoffRef = p.takeoffRef
  if (p.siteAddress !== undefined) m.siteAddress = p.siteAddress
  return Object.keys(m).length ? m : undefined
}

// ── DB row shape ──────────────────────────────────────────────────────────────

export interface TakeoffProjectRow {
  id:          string
  user_id:     string
  name:        string
  address:     string
  job_type:    string
  /** The scale of the showing sheet. The sheets (names, scales) and which one is showing ride along inside it, so no new database column is needed. */
  calibration: TakeoffProject['calibration'] & { sheets?: TakeoffSheet[]; activeSheetId?: string; meta?: TakeoffMeta }
  elements:    TakeoffProject['elements']
  items:       TakeoffProject['items']
  created_at:  string
  updated_at:  string
}

// ── Converters ────────────────────────────────────────────────────────────────

function projectToRow(
  project: TakeoffProject,
  userId: string,
): Omit<TakeoffProjectRow, 'created_at'> {
  return {
    id:          project.id,
    user_id:     userId,
    name:        project.name,
    address:     project.address,
    job_type:    project.jobType,
    calibration: {
      ...project.calibration,
      ...(project.sheets?.length ? { sheets: project.sheets, activeSheetId: project.activeSheetId } : {}),
      ...(metaOf(project) ? { meta: metaOf(project) } : {}),
    },
    elements:    project.elements,
    items:       project.items,
    updated_at:  project.updatedAt,
  }
}

function rowToProject(row: TakeoffProjectRow): Omit<TakeoffProject, 'planImageUrl'> {
  return {
    id:          row.id,
    name:        row.name,
    address:     row.address,
    jobType:     row.job_type,
    calibration: { mpp: row.calibration?.mpp ?? 0.0265, label: row.calibration?.label } as TakeoffProject['calibration'],
    ...(row.calibration?.sheets?.length ? { sheets: row.calibration.sheets, activeSheetId: row.calibration.activeSheetId } : {}),
    ...(row.calibration?.meta ?? {}),
    elements:    row.elements ?? [],
    items:       row.items ?? [],
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  }
}

// ── Save ──────────────────────────────────────────────────────────────────────

/**
 * Upsert a takeoff project to Supabase.
 * planImageUrl is excluded — callers must save that to localStorage themselves.
 */
export async function saveTakeoffToSupabase(
  sb: SupabaseClient,
  project: TakeoffProject,
  userId: string,
): Promise<{ error: string | null }> {
  const row = projectToRow(project, userId)
  const { error } = await sb
    .from('takeoff_projects')
    .upsert({ ...row, updated_at: new Date().toISOString() })
  return { error: error?.message ?? null }
}

// ── Load single ───────────────────────────────────────────────────────────────

/**
 * Load a single project from Supabase by ID.
 * Returns null if not found or on error (caller should fall back to localStorage).
 */
export async function loadTakeoffFromSupabase(
  sb: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<Omit<TakeoffProject, 'planImageUrl'> | null> {
  const { data, error } = await sb
    .from('takeoff_projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', userId)
    .single()

  if (error || !data) return null
  return rowToProject(data as TakeoffProjectRow)
}

// ── List (project picker) ─────────────────────────────────────────────────────

/**
 * List all takeoff projects for a user, newest first.
 * Only returns metadata — no elements/items (keep the response small).
 */
export async function listTakeoffProjects(
  sb: SupabaseClient,
  userId: string,
): Promise<Array<Pick<TakeoffProjectRow, 'id' | 'name' | 'address' | 'job_type' | 'updated_at' | 'created_at'>>> {
  const { data } = await sb
    .from('takeoff_projects')
    .select('id, name, address, job_type, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  return data ?? []
}

/** One line of the "My Take-offs" list. Only the sheet names come from the project's data: counting items would mean reading every project's items. */
export interface TakeoffSummary {
  id: string
  name: string
  address: string
  jobType: string
  updatedAt: string
  createdAt: string
  /** the customer's name, if one was set */
  clientName: string
  sheetNames: string[]
}

/** Every take-off the user has saved, most recently changed first, as short summaries for choosing one to open. */
export async function listTakeoffSummaries(sb: SupabaseClient, userId: string): Promise<TakeoffSummary[]> {
  const { data } = await sb
    .from('takeoff_projects')
    .select('id, name, address, job_type, updated_at, created_at, calibration')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  return (data ?? []).map((r: any) => ({
    id: r.id, name: r.name || 'Untitled take-off', address: r.address || r.calibration?.meta?.siteAddress || '', jobType: r.job_type || '',
    updatedAt: r.updated_at, createdAt: r.created_at, clientName: r.calibration?.meta?.client?.name || '',
    sheetNames: ((r.calibration?.sheets ?? []) as TakeoffSheet[]).map(x => x.name),
  }))
}

// ── Delete ────────────────────────────────────────────────────────────────────

export async function deleteTakeoffProject(
  sb: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<void> {
  await sb
    .from('takeoff_projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId)
}

// ── Debounced save ────────────────────────────────────────────────────────────

/**
 * Returns a debounced wrapper around saveTakeoffToSupabase.
 * Only the last call within the delay window is executed.
 *
 * Usage — create once at component mount via useRef:
 *   const debouncedSaveRef = useRef(makeDebouncedSave(2000))
 *
 * Then in the save useEffect:
 *   debouncedSaveRef.current(sb, project, userId, (err) => console.warn(err))
 */
export function makeDebouncedSave(debounceMs = 2000) {
  let timer: ReturnType<typeof setTimeout> | null = null

  return function debouncedSave(
    sb: SupabaseClient,
    project: TakeoffProject,
    userId: string,
    onError?: (msg: string) => void,
  ) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      const { error } = await saveTakeoffToSupabase(sb, project, userId)
      if (error && onError) onError(error)
    }, debounceMs)
  }
}
