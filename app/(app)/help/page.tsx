'use client'

// Help & Guides: FAQs and video links. The content is written and kept up to date by the platform owner in the owner area
// (Help content); this page only reads it. The screen itself is components/HelpView.tsx.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { HelpItem } from '@/lib/help'
import HelpView from '@/components/HelpView'

export default function HelpPage() {
  const supabase = createClient()
  const [items, setItems] = useState<HelpItem[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data, error } = await supabase
        .from('help_items')
        .select('id, kind, category, title, body, url, sort_order, published')
        .order('sort_order', { ascending: true })
      if (!live) return
      if (error) { setFailed(true); setItems([]); return }
      setItems((data ?? []) as HelpItem[])
    })()
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <HelpView items={items} failed={failed} />
}
