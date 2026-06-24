// sw.js — cachea la app para funcionar offline
const CACHE = 'casino-v2';
const ASSETS = ['/', '/index.html', '/supabase.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return; // no cachear API calls
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request))
  );
});
