// Small Build Company — Service Worker
// Minimal: network-first for all requests, caches /scan for offline fallback.

const CACHE = 'sbc-shell-v1'
const SHELL = ['/scan']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  )
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Only handle GET navigation requests — let everything else pass through
  if (e.request.method !== 'GET') return
  if (!e.request.headers.get('accept')?.includes('text/html')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {})
        return res
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('/scan')))
  )
})
