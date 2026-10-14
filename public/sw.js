// BuildOS Pro — Service Worker
// Minimal: network-first for all requests, caches /scan for offline fallback.

const CACHE = 'bos-shell-v1'
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

// Alerts sent by the server (web push): show it, and open the right screen when it is tapped
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'BuildOS Pro', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'BuildOS Pro', {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || '/dashboard' },
  }))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/dashboard'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) { try { await c.navigate(url) } catch { /* another origin */ } return c.focus() }
    }
    return self.clients.openWindow(url)
  })())
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
