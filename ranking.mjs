// Ranking da Lia: a pessoa dá uma nota de 1 a 10 e, se empatar com outro lugar seu, desempata comparando.
// Cada item tem `value` em [1, 11): a parte inteira é a nota escolhida; a fração ordena os empates (maior = preferido).

const sameNota = (v, nota) => Math.floor(v) === nota;

// Inicia o desempate de um lugar novo com a nota escolhida.
// ranked: [{id, value, similarity?}]; similarity maior = mais parecido (opcional). Sem empates, a sessão já nasce terminada.
export function startSession(ranked, nota) {
  const sublist = ranked.filter(r => sameNota(r.value, nota)).sort((a, b) => b.value - a.value);
  const s = { nota, lower: nota, upper: nota + 1, sublist, ix: 0, history: [] };
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

// Nota exibida: a escolhida pela pessoa (1 a 10). A ordem dentro da mesma nota vem do desempate.
export function scores(ranked) {
  return Object.fromEntries(ranked.map(r => [r.id, Math.floor(r.value)]));
}

// Converte o formato antigo (value em (0,3), nota pela posição na faixa gostei/ok/não gostei) para o novo,
// mantendo a ordem: cada lugar fica com a nota antiga arredondada e os empates na mesma ordem de antes.
export function migrateV1(ranked) {
  const BANDS = [[2, 3, 10], [1, 2, 6.7], [0, 1, 3.4]];   // [de, até, nota do topo da faixa]
  const old = {};
  for (const [lo, hi, top] of BANDS) {
    const band = ranked.filter(r => r.value > lo && r.value < hi).sort((a, b) => b.value - a.value);
    band.forEach((r, i) => { old[r.id] = top - (3.3 / band.length) * i; });
  }
  const byNota = {};
  for (const r of [...ranked].sort((a, b) => b.value - a.value)) {
    const n = Math.min(10, Math.max(1, Math.round(old[r.id] ?? 5)));
    (byNota[n] ||= []).push(r);
  }
  return Object.entries(byNota).flatMap(([n, list]) => list.map((r, k) => ({ ...r, value: +n + (list.length - k) / (list.length + 1) })));
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
  const add = (id, nota, prefersOver) => {
    const s = startSession(list, nota); let asked = 0;
    while (!done(s)) { answer(s, prefersOver(current(s).id) ? 'better' : 'worse'); asked++; }
    list.push({ id, value: finalValue(s) }); return asked;
  };
  // cinco lugares com nota 9: o desempate ordena pela preferência real A > B > C > D > E
  const order = ['A', 'B', 'C', 'D', 'E'];
  for (const id of ['C', 'A', 'E', 'B', 'D']) add(id, 9, other => order.indexOf(id) < order.indexOf(other));
  // lugar com nota sem empate não faz nenhuma pergunta
  assert(add('F', 7, () => true) === 0, 'sem empate não deveria comparar');
  const sorted = [...list].sort((a, b) => b.value - a.value).map(r => r.id).join('');
  assert(sorted === 'ABCDEF', 'ordem errada: ' + sorted);
  const sc = scores(list);
  assert(sc.A === 9 && sc.E === 9 && sc.F === 7, 'notas erradas ' + JSON.stringify(sc));
  // undo volta ao estado anterior
  const s = startSession(list, 9); const before = current(s).id;
  answer(s, 'better'); undo(s); assert(current(s).id === before, 'undo falhou');
  // migração do formato antigo mantém a ordem e gera notas 1–10
  const old = [{ id: 'x', value: 2.9 }, { id: 'y', value: 2.5 }, { id: 'z', value: 1.5 }, { id: 'w', value: 0.5 }];
  const mig = migrateV1(old), ord = [...mig].sort((a, b) => b.value - a.value).map(r => r.id).join('');
  assert(ord === 'xyzw' && mig.every(r => r.value >= 1 && r.value < 11), 'migração falhou ' + JSON.stringify(mig));
  // comunidade: 3 notas 10 não batem um lugar com 40 notas 8,5
  const many = (n, score, base = 0) => Array.from({ length: n }, (_, i) => ({ user: 'u' + (base + i), score, date: 1 }));
  const few = community(many(3, 10), 7, { minShow: 0 }), solid = community(many(40, 8.5), 7);
  assert(few.score < solid.score, 'bayes falhou');
  assert(community(many(3, 10), 7).score === null && community(many(3, 10), 7).need === 7, 'mínimo falhou');
  const dup = community([{ user: 'a', score: 2, date: 1 }, { user: 'a', score: 9, date: 2 }, { user: 'b', score: 5, date: 1, private: true }], 7, { minShow: 0 });
  assert(dup.count === 1 && dup.hist[9] === 1, 'deduplicação falhou');
  console.log('ok', sorted, sc, 'migração', ord);
}
