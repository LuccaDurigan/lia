// Ranking por comparação — reimplementação própria da mecânica observada no Beli (ver relatorio-beli.md).
// Cada item da lista do usuário tem `value` em (0,3): (2,3) gostei, (1,2) ok, (0,1) não gostei.

const BANDS = { 1: [2, 3], 0: [1, 2], [-1]: [0, 1] };   // likeCode -> [lower, upper]
const TOP = { 1: 10, 0: 6.7, [-1]: 3.4 };               // nota máxima de cada faixa

const inBand = (v, code) => v > BANDS[code][0] && v < BANDS[code][1];

// Inicia uma sessão de ranking para um novo restaurante.
// ranked: [{id, value, similarity?}]; similarity maior = mais parecido (opcional).
export function startSession(ranked, likeCode) {
  const [lower, upper] = BANDS[likeCode];
  const sublist = ranked.filter(r => inBand(r.value, likeCode)).sort((a, b) => b.value - a.value);
  const s = { likeCode, lower, upper, sublist, ix: 0, history: [] };
  pick(s, null);
  return s;
}

// Escolhe o próximo adversário: meio da sublista, preferindo os mais parecidos.
function pick(s, dir) {
  if (!s.sublist.length) return;
  const sims = s.sublist.map(r => r.similarity ?? 0);
  const max = Math.max(...sims);
  const best = sims.flatMap((v, i) => (v === max ? [i] : []));
  const pool = best.length === s.sublist.length ? s.sublist.map((_, i) => i) : best;
  const mid = (pool.length - 1) / 2;
  s.ix = pool[dir === 'better' ? Math.ceil(mid) : Math.floor(mid)];
}

export const current = s => s.sublist[s.ix] ?? null;
export const done = s => s.sublist.length === 0;

// answer: 'better' (novo é melhor), 'worse', 'skip'
export function answer(s, ans) {
  s.history.push({ sublist: s.sublist, ix: s.ix, lower: s.lower, upper: s.upper });
  const cmp = s.sublist[s.ix];
  if (ans === 'skip') {
    s.sublist = s.sublist.filter((_, i) => i !== s.ix);
  } else if (ans === 'better') {
    s.lower = cmp.value;
    s.sublist = s.sublist.slice(0, s.ix).filter(r => r.value !== cmp.value);
  } else {
    s.upper = cmp.value;
    s.sublist = s.sublist.slice(s.ix + 1).filter(r => r.value !== cmp.value);
  }
  pick(s, ans);
}

export function undo(s) {
  const h = s.history.pop();
  if (h) Object.assign(s, h);
}

// "Too tough" / fim: o novo item fica no meio do intervalo restante.
export const finalValue = s => (s.lower + s.upper) / 2;

// Nota 0–10: posição dentro da faixa, espaçada linearmente.
export function scores(ranked) {
  const out = {};
  for (const code of [1, 0, -1]) {
    const band = ranked.filter(r => inBand(r.value, code)).sort((a, b) => b.value - a.value);
    band.forEach((r, i) => { out[r.id] = +(TOP[code] - (3.3 / band.length) * i).toFixed(1); });
  }
  return out;
}

// Nota da comunidade, no estilo Letterboxd/IMDb: média bayesiana que puxa lugares com poucas notas para a média da cidade.
// ratings: [{user, score (0–10), date, private?}]; cada pessoa conta uma vez (a visita mais recente) e privadas ficam de fora.
// C = média da cidade, m = peso do "prior" (quantas notas fictícias na média da cidade), minShow = mínimo para exibir.
export const COMMUNITY = { m: 10, minShow: 10 };
export function community(ratings, C, { m = COMMUNITY.m, minShow = COMMUNITY.minShow } = {}) {
  const latest = new Map();
  for (const r of ratings) if (!r.private && !(latest.get(r.user)?.date > r.date)) latest.set(r.user, r);
  const xs = [...latest.values()].map(r => r.score);
  const hist = Array(10).fill(0);                         // faixas 0–1, 1–2, … 9–10
  xs.forEach(s => hist[Math.min(9, Math.floor(s))]++);
  const v = xs.length, R = v ? xs.reduce((a, b) => a + b, 0) / v : 0;
  const score = v >= minShow ? (v / (v + m)) * R + (m / (v + m)) * C : null;
  return { score, count: v, hist, need: Math.max(0, minShow - v) };
}

// Autoteste: `node ranking.mjs`
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('ranking.mjs')) {
  const assert = (c, m) => { if (!c) throw new Error(m); };
  let list = [];
  const add = (id, code, prefersOver) => {
    const s = startSession(list, code);
    while (!done(s)) answer(s, prefersOver(current(s).id) ? 'better' : 'worse');
    list.push({ id, value: finalValue(s) });
  };
  // ordem real de preferência: A > B > C > D > E (todos "gostei")
  const order = ['A', 'B', 'C', 'D', 'E'];
  for (const id of ['C', 'A', 'E', 'B', 'D'])
    add(id, 1, other => order.indexOf(id) < order.indexOf(other));
  const sorted = [...list].sort((a, b) => b.value - a.value).map(r => r.id).join('');
  assert(sorted === 'ABCDE', 'ordem errada: ' + sorted);
  const sc = scores(list);
  assert(sc.A === 10 && sc.E < sc.D && sc.E > 6.7, 'notas erradas ' + JSON.stringify(sc));
  // undo volta ao estado anterior
  const s = startSession(list, 1); const before = current(s).id;
  answer(s, 'better'); undo(s); assert(current(s).id === before, 'undo falhou');
  // comunidade: 3 notas 10 não batem um lugar com 40 notas 8,5
  const many = (n, score, base = 0) => Array.from({ length: n }, (_, i) => ({ user: 'u' + (base + i), score, date: 1 }));
  const few = community(many(3, 10), 7, { minShow: 0 }), solid = community(many(40, 8.5), 7);
  assert(few.score < solid.score, 'bayes falhou');
  assert(community(many(3, 10), 7).score === null && community(many(3, 10), 7).need === 7, 'mínimo falhou');
  // mesma pessoa conta uma vez, pela visita mais recente; privada não conta
  const dup = community([{ user: 'a', score: 2, date: 1 }, { user: 'a', score: 9, date: 2 }, { user: 'b', score: 5, date: 1, private: true }], 7, { minShow: 0 });
  assert(dup.count === 1 && dup.hist[9] === 1, 'deduplicação falhou');
  console.log('ok', sorted, sc, 'comunidade', few.score.toFixed(2), '<', solid.score.toFixed(2));
}
