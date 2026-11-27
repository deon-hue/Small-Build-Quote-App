/**
 * Tests for the phone fixes: the account check (lib/account-check.ts), drawing plans lightly (lib/pdf-phone.ts) and the service worker (public/sw.js)
 *
 * Run with:   npx tsx __tests__/phone-fixes.test.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { accountState, neverArrived, portalFor, retryDelayMs, within } from '../lib/account-check'
import { phoneRenderScale, pagesToHold, PHONE_MAX_PIXELS, PHONE_MAX_SIDE } from '../lib/pdf-phone'

let ok = 0, bad = 0
const t = (n: string, c: boolean, x?: unknown) => { c ? ok++ : (bad++, console.log('FAIL', n, JSON.stringify(x) ?? '')) }

async function main() {
  // ---- who is signed in
  t('a user is a user, whatever else', accountState(true, { name: 'x', status: 500 }) === 'ok')
  t('no session: signed out', accountState(false, { name: 'AuthSessionMissingError', status: 400 }) === 'signed-out' && accountState(false, null) === 'signed-out')
  t('refused: signed out', accountState(false, { name: 'AuthApiError', status: 401 }) === 'signed-out' && accountState(false, { name: 'AuthApiError', status: 403 }) === 'signed-out')
  t('a session that has run out is signed out, not retried for ever', accountState(false, { name: 'AuthApiError', status: 400 }) === 'signed-out')
  t('too busy or timed out is tried again', accountState(false, { name: 'AuthApiError', status: 429 }) === 'unreachable' && accountState(false, { name: 'AuthApiError', status: 408 }) === 'unreachable')
  t('no signal, a server fault or too slow: NOT signed out', [{ name: 'AuthRetryableFetchError', status: 0 }, { name: 'AuthRetryableFetchError', status: 502 }, { name: 'AuthApiError', status: 500 }, { name: 'TooSlow' }, { name: 'AuthUnknownError' }].every(e => accountState(false, e) === 'unreachable'))
  // ---- records that never arrived
  t('a dropped request has no status', neverArrived([{ status: 200 }, { status: 0, error: { message: 'Failed to fetch' } }]))
  t('answers that arrived, even with an error (a missing table), are not retried for ever', !neverArrived([{ status: 404, error: { message: 'x' } }, { status: 200, error: null }, null, undefined]))
  // ---- where someone belongs
  t('a subcontractor goes to their portal', portalFor(false, 'subcontractor') === '/sub-portal')
  t('a customer goes to theirs', portalFor(false, 'customer') === '/portal')
  t('a builder or team member stays', portalFor(true, 'subcontractor') === null && portalFor(true, 'admin') === null)
  t('not sure: stays', portalFor(null, 'subcontractor') === null && portalFor(false, null) === null && portalFor(false, 'admin') === null)
  t('someone signing up with an invite stays', portalFor(false, 'customer', 'ABC123') === null)
  t('retries: 2, 4, 8 then every 15 seconds', [0, 1, 2, 3, 30].map(retryDelayMs).join() === '2000,4000,8000,15000,15000')
  t('an answer in time is kept', (await within(Promise.resolve('a'), 50, 'late')) === 'a')
  t('one that never comes gives the late answer', (await within(new Promise<string>(() => {}), 20, 'late')) === 'late')
  t('a failure still fails', await within(Promise.reject(new Error('x')), 50, 'late').then(() => false, () => true))

  // ---- plans on a phone
  const a4 = phoneRenderScale(595, 842), a1 = phoneRenderScale(1684, 2384), a0 = phoneRenderScale(2384, 3370), long = phoneRenderScale(300, 9000)
  t('an A4 page is drawn as before (twice its size)', a4 === 2)
  t('an A1 drawing is held to the limit', Math.abs(1684 * 2384 * a1 * a1 - PHONE_MAX_PIXELS) < 10 && a1 < 2, [a1])
  t('an A0 too', 2384 * 3370 * a0 * a0 <= PHONE_MAX_PIXELS + 10)
  t('a very long page is held by its side', 9000 * long <= PHONE_MAX_SIDE + 0.001)
  t('rubbish sizes do no harm', phoneRenderScale(0, 100) === 1)
  const pages = (scroll: number) => Array.from({ length: 30 }, (_, i) => ({ top: i * 500 - scroll, height: 490 }))
  const atTop = pagesToHold(pages(0), 700)
  t('at the top: only the first few pages are held', atTop.includes(0) && atTop.includes(1) && Math.max(...atTop) <= 2 && atTop.length <= 6, atTop)
  const mid = pagesToHold(pages(5000), 700)
  t('scrolled down: the pages round what is on screen, the nearest first', mid[0] === 10 && !mid.includes(0) && !mid.includes(29) && mid.length <= 6, mid)
  t('never more than the limit', pagesToHold(Array.from({ length: 40 }, (_, i) => ({ top: i * 20, height: 19 })), 700).length === 6)

  // ---- the service worker, run against stand-ins
  const handlers: Record<string, (e: any) => void> = {}
  const deleted: string[] = []
  let offline = false
  const opened: string[] = []
  const self = { addEventListener: (n: string, f: (e: any) => void) => { handlers[n] = f }, skipWaiting: () => {}, clients: { claim: () => {} }, registration: {} }
  const caches = { keys: async () => ['bos-shell-v1', 'someone-elses'], delete: async (k: string) => { deleted.push(k); return true }, open: async (n: string) => { opened.push(n); return {} } }
  const fetchStub = async () => { if (offline) throw new TypeError('Failed to fetch'); return new Response('the page', { status: 200 }) }
  new Function('self', 'caches', 'fetch', 'Response', readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf8'))(self, caches, fetchStub, Response)
  let waited: Promise<unknown> = Promise.resolve()
  handlers.activate({ waitUntil: (p: Promise<unknown>) => { waited = p } })
  await waited
  t('the new worker throws away the saved pages of the old one (and nothing else)', deleted.join() === 'bos-shell-v1', deleted)
  const ask = async (mode: string) => { let answer: Promise<Response> | null = null; handlers.fetch({ request: { mode, method: 'GET' }, respondWith: (p: Promise<Response>) => { answer = p } }); return answer ? await (answer as Promise<Response>) : null }
  const online = await ask('navigate')
  t('with signal the page comes straight from the server', !!online && (await online.text()) === 'the page')
  offline = true
  const none = await ask('navigate')
  const text = none ? await none.text() : ''
  t('with no signal: a plain No signal page with Try again, never a saved app page', !!none && none.status === 503 && text.includes('No signal') && text.includes('Try again') && !text.includes('Checking your account'))
  t('anything that is not a page is left alone', (await ask('cors')) === null && (await ask('no-cors')) === null)
  t('nothing is saved', opened.length === 0)

  console.log(`${ok} passed, ${bad} failed`)
  if (bad) process.exit(1)
}
main()
