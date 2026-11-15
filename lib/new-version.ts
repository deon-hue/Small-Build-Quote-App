// Is the page running an OLD version of the app? The page carries the build id it was built with; the server says which build is live now. Pure, so it can be tested.
// 'dev' (local development, or no id) never counts as old, and neither does a server that did not answer properly.

export function isOutOfDate(pageBuild: string | undefined | null, liveBuild: unknown): boolean {
  const mine = String(pageBuild ?? '').trim()
  const live = typeof liveBuild === 'string' ? liveBuild.trim() : ''
  if (!mine || !live) return false
  if (mine === 'dev' || live === 'dev') return false
  return mine !== live
}
