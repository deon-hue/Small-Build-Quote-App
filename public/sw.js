// BuildOS Pro — Service Worker
// It does two things: shows the alerts the server sends, and shows a plain "No signal" page when a page cannot be fetched. It does NOT keep copies of the app's pages: a saved page goes out of date at the next
// update (its code files are gone) and left phones stuck on "Checking your account…".

const OFFLINE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>No signal</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #f1f3ee; color: #1f2933; font-family: system-ui, -apple-system, Segoe UI, sans-serif; text-align: center; }
  main { max-width: 320px; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { color: #6b7280; line-height: 1.5; margin: 0 0 22px; }
  button { width: 100%; padding: 14px; border: 0; border-radius: 10px; background: #9acd32; color: #1f2933; font-size: 16px; font-weight: 700; font-family: inherit; }
</style></head>
<body><main><h1>No signal</h1><p>This page could not be loaded. Check your phone has signal or Wi-Fi, then try again.</p><button onclick="location.reload()">Try again</button></main>
<script>addEventListener('online', function () { location.reload() })</script></body></html>`

self.addEventListener('install', () => { self.skipWaiting() })

self.addEventListener('activate', e => {
  // throw away the pages earlier versions saved
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('bos-')).map(k => caches.delete(k)))
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
  // Only whole pages: everything else passes straight through
  if (e.request.mode !== 'navigate') return

  e.respondWith(
    fetch(e.request).catch(() => new Response(OFFLINE, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  )
})
