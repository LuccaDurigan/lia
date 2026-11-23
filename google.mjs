// Dados do Google Places (API nova) para a ficha do lugar.
// Regras do Google: só o identificador do lugar (place id) pode ser guardado; horário, telefone, fotos etc. são buscados
// na hora e mostrados com a marca "Google Maps". Por isso só os ids ficam no aparelho; os detalhes ficam em memória nesta sessão.
export const GOOGLE_KEY = 'AIzaSyBm2n-Dcsa8BHHOPeK-C7EZdn1DeLsw6-s';   // chave restrita a lia.fluxari.com (é pública por natureza; a proteção é a restrição no Google Cloud)
export const googleOn = () => !!GOOGLE_KEY;
const BASE = 'https://places.googleapis.com/v1';
const ids = (() => { try { const o = JSON.parse(localStorage.getItem('lia:gids') || '{}'); for (const k in o) if (!o[k]) delete o[k]; return o; } catch { return {}; } })();   // "não achou" não fica guardado: tenta de novo em outra sessão
const misses = new Set();
const details = new Map();
const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.hypot(x, y) * 6371; };

const FIELDS = 'id,regularOpeningHours,currentOpeningHours.openNow,nationalPhoneNumber,websiteUri,priceLevel,priceRange,rating,userRatingCount,photos,googleMapsUri,businessStatus';
// primeira vez: a própria busca já traz os detalhes (uma ida ao Google em vez de duas); depois, só os detalhes pelo id guardado
async function search(p) {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': FIELDS.split(',').map(f => 'places.' + f).join(',') + ',places.location' },
    body: JSON.stringify({ textQuery: `${p.name}, Curitiba`, languageCode: 'pt-BR', regionCode: 'BR', maxResultCount: 3,
      locationBias: { circle: { center: { latitude: p.lat, longitude: p.lon }, radius: 400 } } }),
  });
  if (!res.ok) throw new Error('google ' + res.status);
  const hit = ((await res.json()).places || []).find(x => !p.lat || km(p.lat, p.lon, x.location.latitude, x.location.longitude) < 0.4);   // nome parecido do outro lado da cidade não vale
  if (!hit) { misses.add(p.id); return null; }
  ids[p.id] = hit.id;
  try { localStorage.setItem('lia:gids', JSON.stringify(ids)); } catch {}
  return hit;
}
const pending = new Map();   // mapa e ficha pedindo o mesmo lugar ao mesmo tempo: uma consulta só
export function googlePlace(p) {
  if (!googleOn() || !p?.name) return Promise.resolve(null);
  if (details.has(p.id)) return Promise.resolve(details.get(p.id));
  if (misses.has(p.id)) return Promise.resolve(null);
  if (!pending.has(p.id)) pending.set(p.id, (async () => {
    let d;
    if (ids[p.id]) {
      const res = await fetch(`${BASE}/places/${ids[p.id]}?languageCode=pt-BR&regionCode=BR`, { headers: { 'X-Goog-Api-Key': GOOGLE_KEY, 'X-Goog-FieldMask': FIELDS } });
      if (!res.ok) throw new Error('google ' + res.status);
      d = await res.json();
    } else d = await search(p);
    details.set(p.id, d); return d;
  })().finally(() => pending.delete(p.id)));
  return pending.get(p.id);
}
export const googlePhoto = (ph, w = 900) => `${BASE}/${ph.name}/media?maxWidthPx=${w}&key=${GOOGLE_KEY}`;
export const PRICE = { PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };
export function priceText(d) {
  const r = d?.priceRange, n = v => v?.units ? Number(v.units) : null;
  if (r && (n(r.startPrice) || n(r.endPrice))) return [n(r.startPrice), n(r.endPrice)].filter(Boolean).map(v => 'R$ ' + v).join(' a ') + ' por pessoa';
  return PRICE[d?.priceLevel] || '';
}

// Autoteste: `node google.mjs`
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('google.mjs')) {
  const assert = (c, m) => { if (!c) throw new Error(m); };
  assert(km(-25.43, -49.27, -25.43, -49.27) === 0, 'mesmo ponto');
  assert(Math.abs(km(-25.43, -49.27, -25.434, -49.27) - 0.445) < 0.01, 'distância curta');
  assert(priceText({ priceLevel: 'PRICE_LEVEL_MODERATE' }) === '$$', 'nível de preço');
  assert(priceText({ priceRange: { startPrice: { units: '40' }, endPrice: { units: '60' } } }) === 'R$ 40 a R$ 60 por pessoa', 'faixa em reais');
  console.log('ok google');
}
