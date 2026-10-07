'use client'

// The subcontractor's chosen look (tile style + text size), available to every page of their portal. Starts on the default and picks up the
// saved choice as soon as the page is on screen (so the first paint is never different from the server's).

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_LOOK, readLook, saveLook, type Look } from '@/lib/sub-look'

interface Ctx { look: Look; setLook: (next: Partial<Look>) => void }
const SubLookContext = createContext<Ctx>({ look: DEFAULT_LOOK, setLook: () => {} })

export function useSubLook() { return useContext(SubLookContext) }

export function SubLookProvider({ children }: { children: ReactNode }) {
  const [look, setLookState] = useState<Look>(DEFAULT_LOOK)
  useEffect(() => { setLookState(readLook()) }, [])

  function setLook(next: Partial<Look>) {
    setLookState(prev => { const merged = { ...prev, ...next }; saveLook(merged); return merged })
  }
  return <SubLookContext.Provider value={{ look, setLook }}>{children}</SubLookContext.Provider>
}
