// Small checkers shared by the AI quote's calculator pick-ups (lib/drainage-ai.ts, lib/demolition-ai.ts): whatever the AI sends back is untrusted, so every value is checked and
// anything that does not check out is treated as "not stated" (never guessed). Pure.

export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null }
/** a whole number from min to max, or null */
export const whole = (v: unknown, min: number, max: number): number | null => { const n = num(v); if (n === null) return null; const r = Math.round(n); return r >= min && r <= max ? r : null }
/** a number above min and up to max, or null (so 0, negatives and absurd values all read as "not stated") */
export const between = (v: unknown, min: number, max: number): number | null => { const n = num(v); return n !== null && n > min && n <= max ? n : null }
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
