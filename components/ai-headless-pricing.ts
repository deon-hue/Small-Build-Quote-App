// Prices a calculator with the calculator ITSELF: it is mounted out of sight (never on screen), opened on the values the AI quote heard in the scope, given a moment to work out its labour, and its own
// Save & Price is pressed, exactly as an estimator would. What comes back is what the calculator saves (the costed lines, the quote line and full wording, the profit, the saved state and the size), so an
// AI-priced floor or roof is always the same figure the calculator gives when opened, and it follows every later change to the calculator with nothing here to keep in step. Used by the floor and roof
// pick-ups (components/ai-floor-roof-pricing.ts). Browser only: it returns null on the server, if the calculator does not come up, or if it gives nothing back.

import { createRoot } from 'react-dom/client'
import { BUILT_ASSEMBLY_CANON_IDS, type AssemblySaveResult } from '@/lib/built-assemblies'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'
import type { BOLabourTrade } from '@/lib/back-office-types'

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms))
const saveButton = (host: HTMLElement) => [...host.querySelectorAll('button')].find(b => b.textContent?.includes('Save & Price')) as HTMLButtonElement | undefined

export async function priceCalculatorHeadless(o: { canonicalId: string; calcState: CalcStateSnapshot; labourTrades: BOLabourTrade[]; timeoutMs?: number }): Promise<AssemblySaveResult | null> {
  if (typeof document === 'undefined') return null
  const entry = BUILT_ASSEMBLY_CANON_IDS[o.canonicalId]
  if (!entry) return null
  const timeout = o.timeoutMs ?? 4000
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:900px;overflow:hidden;visibility:hidden;pointer-events:none'
  document.body.appendChild(host)
  const root = createRoot(host)
  let give: (r: AssemblySaveResult | null) => void = () => {}
  const saved = new Promise<AssemblySaveResult | null>(res => { give = res })
  try {
    root.render(entry.render({ labourTrades: o.labourTrades, calcState: o.calcState, onSave: (r: AssemblySaveResult) => give(r) }))
    const deadline = Date.now() + timeout
    while (!saveButton(host) && Date.now() < deadline) await sleep(50)
    if (!saveButton(host)) return null
    await sleep(600)   // the labour suggestions and sizes follow the values just set: give them a moment to settle
    saveButton(host)?.click()
    const r = await Promise.race([saved, sleep(2500).then(() => null)])
    if (!r || !Array.isArray(r.lines) || r.lines.length === 0) return null
    if (r.lines.some(l => !Number.isFinite(l.cost))) return null
    return r
  } catch {
    return null
  } finally {
    try { root.unmount() } catch { /* already gone */ }
    host.remove()
  }
}
