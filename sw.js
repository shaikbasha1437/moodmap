const CACHE = 'moodmap-v3';
const ASSETS = ['./', './index.html', './styles.css', './core.js', './app.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', (e) => {
  self.skipWaiting();
  // Cache each file individually so one failed request can't break install.
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(ASSETS.map((a) => c.add(a).catch(() => {})))));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('moodmap-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
// Network-first: always try fresh files; fall back to cache only when offline.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)).then((r) => r || Response.error())));
});
