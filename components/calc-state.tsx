'use client'

/**
 * Keeping what was typed into an assembly calculator, so a saved calculator can be opened again and edited instead of starting from nothing.
 * A calculator's inputs used to live only in React state, and only the priced lines were saved. Now a calculator's own `useState` calls are
 * `useCalcState` (same behaviour), which also report their value to the CalcScope around it; on Save & Price the scope hands the whole set of values
 * back with the result (`calcState`), the quote or Take-off item keeps them, and opening the calculator again gives them back.
 * Values must be plain data (numbers, text, lists, objects, Sets); a state that holds something else is simply not restored.
 */

import React, { createContext, useContext, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { CalcStateSnapshot } from '@/lib/calc-snapshot'

export type { CalcStateSnapshot }

interface Ctx { initial?: Record<string, Record<string, unknown>>; record: (ns: string, key: string, value: unknown) => void }
const CalcCtx = createContext<Ctx | null>(null)

function toPlain(values: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  try { return JSON.parse(JSON.stringify(values, (_k, v) => (v instanceof Set ? { __set: Array.from(v) } : v))) } catch { return {} }
}

function revive(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(revive)
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>
    if (Array.isArray(o.__set) && Object.keys(o).length === 1) return new Set(o.__set.map(revive))
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, revive(v)]))
  }
  return x
}

/** Wraps one calculator. `children` renders it and is given the onSave to use, which adds `calcState` to the result. */
export function CalcScope({ assemblyId, initial, onSave, children }: {
  assemblyId: string
  initial?: CalcStateSnapshot
  onSave?: (result: never) => void
  children: (onSave: ((result: { [k: string]: unknown }) => void) | undefined) => React.ReactNode
}) {
  const values = useRef<Record<string, Record<string, unknown>>>({})
  const ctx = useRef<Ctx>({
    initial: initial && initial.id === assemblyId ? initial.values : undefined,
    record: (ns, key, value) => { (values.current[ns] ??= {})[key] = value },
  })
  const wrapped = onSave
    ? (result: { [k: string]: unknown }) => (onSave as (r: unknown) => void)({ ...result, calcState: { id: assemblyId, values: toPlain(values.current) } satisfies CalcStateSnapshot })
    : undefined
  return <CalcCtx.Provider value={ctx.current}>{children(wrapped)}</CalcCtx.Provider>
}

/** Exactly useState, but the value starts from what was saved with the calculator (if anything) and is reported so it can be saved. */
export function useCalcState<T>(ns: string, key: string, init: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const ctx = useContext(CalcCtx)
  const [value, setValue] = useState<T>(() => {
    const saved = ctx?.initial?.[ns]?.[key]
    if (saved !== undefined) return revive(saved) as T
    return typeof init === 'function' ? (init as () => T)() : init
  })
  ctx?.record(ns, key, value)
  return [value, setValue]
}
