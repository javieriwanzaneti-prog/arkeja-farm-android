/* ARKEJA FARM — cache ketat, timeout jaringan, fallback offline */
const CACHE = 'arkeja-v23';
const NETWORK_TIMEOUT_MS = 3500;
const ASSETS = [
  './', './index.html', './manifest.json', './offline.html', './icon-192.png', './icon-512.png',
  './css/style.css', './css/components.css', './css/responsive.css',
  './js/utilities.js','./js/database.js','./js/product-mapping.js','./js/crop-engine.js','./js/sop-engine.js',
  './js/nutrition-engine.js','./js/advanced-nutrition.js','./js/calculator.js','./js/monitoring.js',
  './js/irrigation.js','./js/pest-disease.js','./js/financial.js',
  './js/inventory.js','./js/harvest.js','./js/analytics.js',
  './js/pdf-export.js','./js/filesystem-bridge.bundle.js','./js/reports.js','./js/settings.js','./js/mixed-fertilizer.js','./js/router.js','./js/app.js'
];

// Instalasi baru hanya boleh aktif setelah seluruh aset inti berhasil masuk cache.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      await cache.addAll(ASSETS);
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(CACHE);
      console.error('[SW] Instalasi dibatalkan: aset inti tidak lengkap.', error);
      throw error; // worker lama tetap aktif; jangan aktifkan cache setengah jadi.
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('arkeja-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function fetchWithTimeout(request, timeoutMs=NETWORK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(request, { cache:'no-cache', signal:controller.signal }); }
  finally { clearTimeout(timer); }
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetchWithTimeout(request);
      if (response && response.ok) {
        try { await cache.put(request, response.clone()); }
        catch(error) { console.warn('[SW] Cache tidak diperbarui:', error); }
      }
      return response;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return (await caches.match('./offline.html')) || Response.error();
      return Response.error();
    }
  })());
});
