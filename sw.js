// Service worker da Lia.
// Arquivos do próprio app: rede primeiro (sem cache HTTP), então toda versão publicada chega na próxima abertura,
// sem reinstalar. Sem internet, usa a última cópia guardada. Biblioteca de mapa (URL com versão fixa): cache primeiro.
const CACHE = 'lia-v1';
const SHELL = ['./', 'index.html', 'ranking.mjs', 'hours.mjs', 'places.json', 'manifest.webmanifest', 'fonts/eb-garamond.woff2', 'fonts/eb-garamond-italic.woff2', 'fonts/jost.woff2', 'icons/icon.svg', 'icons/icon-192.png'];
const CDN = ['https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.min.css'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll([...SHELL, ...CDN])).catch(() => {}));
  self.skipWaiting();                     // versão nova do SW assume na hora
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (url.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
  // mapa (tiles do OpenFreeMap) e o resto: direto da rede
});
