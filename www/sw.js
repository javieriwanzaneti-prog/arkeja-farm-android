const CACHE = 'arkeja-v1';
const ASSETS = [
  './', './index.html', './manifest.json', './offline.html', './icon-192.png', './icon-512.png',
  './css/style.css', './css/components.css', './css/responsive.css',
  './js/utilities.js','./js/database.js','./js/crop-engine.js','./js/sop-engine.js',
  './js/nutrition-engine.js','./js/calculator.js','./js/monitoring.js',
  './js/irrigation.js','./js/pest-disease.js','./js/financial.js',
  './js/inventory.js','./js/harvest.js','./js/analytics.js',
  './js/reports.js','./js/settings.js','./js/mixed-fertilizer.js','./js/router.js','./js/app.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match('./offline.html')))
  );
});
