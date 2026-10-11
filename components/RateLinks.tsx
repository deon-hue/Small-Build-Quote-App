'use client'
// Loads the company's Back Office Products and Plant items and the links saved for one calculator, and hands them to that calculator's cost table (BreakdownTable) through
// context. Wrapped round every calculator by lib/built-assemblies.tsx, so no calculator screen has to know about it. Outside a signed-in app (a test page) it gives
// no items, and the cost table simply shows its sample rates as before.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fetchProducts, fetchPlantItems } from '@/lib/back-office-queries'
import { toRateItems, type RateItem, type RateLink } from '@/lib/rate-links'

interface RateLinksValue {
  assemblyId: string
  items: RateItem[]
  /** keyed by layer id */
  links: Record<string, RateLink>
  ready: boolean
  /** true when the calculator was opened from a saved copy: its prices stay as saved and only change when you change them */
  frozen: boolean
  /** the saved links can hold a pack size (the per_unit column exists: supabase/calculator-rate-links-pack.sql has been run) */
  supportsPack: boolean
  setLink: (layerId: string, link: RateLink | null) => Promise<void>
}

export type { RateLinksValue }
export const RateLinksContext = createContext<RateLinksValue | null>(null)
const Ctx = RateLinksContext

export const useRateLinks = () => useContext(Ctx)

export function RateLinksProvider({ assemblyId, frozen = false, children }: { assemblyId: string; frozen?: boolean; children: React.ReactNode }) {
  const [owner, setOwner] = useState<string | null>(null)
  const [items, setItems] = useState<RateItem[]>([])
  const [links, setLinks] = useState<Record<string, RateLink>>({})
  const [ready, setReady] = useState(false)
  const [supportsPack, setSupportsPack] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const sb = createClient()
        const { data: ownerId } = await sb.rpc('get_effective_owner_id')
        if (!ownerId || !live) return
        // per_unit (a pack size such as a 50 m² roll) is a newer column: without it the links still load, they just cannot hold a pack size
        const linkQuery = (cols: string) => sb.from('calculator_rate_links').select(cols).eq('user_id', ownerId as string).eq('assembly_id', assemblyId)
        const [products, plant, lk0] = await Promise.all([
          fetchProducts(sb, ownerId as string),
          fetchPlantItems(sb, ownerId as string),
          linkQuery('layer_id, ref_kind, ref_id, per_unit'),
        ])
        let lk = lk0
        let hasPack = !lk0.error
        if (lk0.error) lk = await linkQuery('layer_id, ref_kind, ref_id')
        if (!live) return
        setSupportsPack(hasPack)
        setOwner(ownerId as string)
        setItems(toRateItems(products, plant))
        const map: Record<string, RateLink> = {}
        for (const r of (lk.data ?? []) as unknown as { layer_id: string; ref_kind: 'product' | 'plant'; ref_id: string; per_unit?: number | null }[]) {
          map[r.layer_id] = { kind: r.ref_kind, refId: r.ref_id, ...(r.per_unit && Number(r.per_unit) !== 1 ? { per: Number(r.per_unit) } : {}) }
        }
        setLinks(map)
      } catch { /* no session or no table yet: the sample rates stay */ }
      if (live) setReady(true)
    })()
    return () => { live = false }
  }, [assemblyId])

  const setLink = useCallback(async (layerId: string, link: RateLink | null) => {
    if (!owner) return
    const sb = createClient()
    setLinks(prev => {
      const next = { ...prev }
      if (link) next[layerId] = link
      else delete next[layerId]
      return next
    })
    if (link) await sb.from('calculator_rate_links').upsert({ user_id: owner, assembly_id: assemblyId, layer_id: layerId, ref_kind: link.kind, ref_id: link.refId, ...(supportsPack ? { per_unit: link.per && link.per > 0 ? link.per : 1 } : {}) }, { onConflict: 'user_id,assembly_id,layer_id' })
    else await sb.from('calculator_rate_links').delete().eq('user_id', owner).eq('assembly_id', assemblyId).eq('layer_id', layerId)
  }, [owner, assemblyId, supportsPack])

  const value = useMemo(() => ({ assemblyId, items, links, ready, frozen, supportsPack, setLink }), [assemblyId, items, links, ready, frozen, supportsPack, setLink])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
