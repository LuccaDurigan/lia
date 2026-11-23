// Service worker da Lia.
// Arquivos do próprio app: rede primeiro (sem cache HTTP), então toda versão publicada chega na próxima abertura,
// sem reinstalar. Sem internet, usa a última cópia guardada. Bibliotecas (mapa, Supabase; URL com versão fixa): cache primeiro.
const CACHE = 'lia-20261123004145';
const SHELL = ['./', 'index.html', 'privacidade.html', 'termos.html', 'legal.css', 'ranking.mjs', 'hours.mjs', 'conta.mjs', 'onboarding.mjs', 'sync.mjs', 'places.json', 'manifest.webmanifest', 'fonts/eb-garamond.woff2', 'fonts/eb-garamond-italic.woff2', 'fonts/jost.woff2', 'fonts/caveat.woff2', 'icons/icon-192.png'];
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
    // arquivos do app (não fontes nem ícones) furam o cache de ~10 min da CDN do GitHub Pages com ?_=agora
    const code = req.mode === 'navigate' || /\.(html|m?js|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
    const net = code ? new Request(url.href + (url.search ? '&' : '?') + '_=' + Date.now(), { cache: 'no-store' }) : new Request(req, { cache: 'no-cache' });
    e.respondWith(fetch(net)
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  } else if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'cdn.jsdelivr.net') {   // bibliotecas com versão fixa na URL
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })));
  }
  // mapa (tiles do OpenFreeMap) e o resto: direto da rede
});
