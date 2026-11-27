// The rules behind "Checking your account…" (the builder app's first screen). On a phone with a weak signal the account check can fail without the person being signed out: that is tried again, never treated as
// "not signed in" and never left on screen for good. A subcontractor or customer who opens the builder app is sent to their own portal straight away. Pure, so it can be tested.

export type AccountState = 'ok' | 'signed-out' | 'unreachable'

/** What the answer to "who is signed in?" means: a user, certainly nobody (no session, or refused), or we could not find out (no signal, a server fault, too slow) */
export function accountState(hasUser: boolean, error: { name?: string; status?: number } | null | undefined): AccountState {
  if (hasUser) return 'ok'
  if (!error) return 'signed-out'
  if (error.name === 'AuthSessionMissingError') return 'signed-out'
  // the sign-in server refused it (a session that has run out, or an account that has gone: 400, 401, 403, 404). Too slow (408) or too busy (429) is not a refusal.
  const s = error.status ?? 0
  if (s >= 400 && s < 500 && s !== 408 && s !== 429) return 'signed-out'
  return 'unreachable'
}

/** A database answer that never reached us (no signal): the request has no status */
export const neverArrived = (answers: ({ status?: number; error?: unknown } | null | undefined)[]): boolean => answers.some(a => !!a && !!a.error && a.status === 0)

/** Where someone who is not a builder belongs: their own portal. Null = stay (a builder, a team member, someone signing up with an invite, or we are not sure). */
export function portalFor(isContractor: unknown, role: unknown, inviteCode?: unknown): '/portal' | '/sub-portal' | null {
  if (isContractor !== false || inviteCode) return null
  return role === 'customer' ? '/portal' : role === 'subcontractor' ? '/sub-portal' : null
}

/** How long to wait before the next try, milliseconds: soon at first, then every 15 seconds */
export const retryDelayMs = (attempt: number): number => [2000, 4000, 8000][Math.max(0, attempt)] ?? 15000

/** Gives up waiting for an answer after `ms` (the answer then counts as not arrived) */
export function within<T>(work: PromiseLike<T>, ms: number, late: T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => resolve(late), ms)
    work.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}
