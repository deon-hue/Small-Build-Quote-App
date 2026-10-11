// What is kept with a saved assembly calculator so it can be opened again and edited: which calculator, and the values of its inputs (by component, then by name).
// See components/calc-state.tsx.
export interface CalcStateSnapshot { id: string; values: Record<string, Record<string, unknown>> }
