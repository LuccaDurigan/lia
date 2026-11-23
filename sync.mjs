// Junta os dados de dois aparelhos (o deste celular e o que está na conta) sem perder nada.
// Usado só quando os dois mudaram desde a última sincronização; no resto, vale o mais recente inteiro.

const byId = (a = [], b = [], key = 'id') => {   // une listas de objetos por id; em empate fica o deste aparelho (a)
  const m = new Map(b.map(x => [x[key], x]));
  for (const x of a) m.set(x[key], x);
  return [...m.values()];
};
const uniq = (a = [], b = []) => [...new Set([...a, ...b])];

// visitas não têm id: a data (ms) identifica; em empate fica a deste aparelho
function mergeVisits(a = [], b = []) {
  const m = new Map(b.map(v => [v.date, v]));
  for (const v of a) m.set(v.date, v);
  return [...m.values()].sort((x, y) => x.date - y.date);
}

export function mergeData(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const ranked = new Map((remote.ranked || []).map(r => [r.id, r]));
  for (const r of local.ranked || []) {
    const o = ranked.get(r.id);
    if (!o) { ranked.set(r.id, r); continue; }
    const newer = (r.date || 0) >= (o.date || 0) ? r : o;   // nota e dados do lugar: da visita mais recente
    ranked.set(r.id, { ...newer, loved: r.loved || o.loved, visits: mergeVisits(r.visits || [], o.visits || []) });
  }
  const rankedIds = new Set(ranked.keys());
  return {
    ...remote, ...local,
    ranked: [...ranked.values()],
    want: uniq(local.want, remote.want).filter(id => !rankedIds.has(id)),
    custom: byId(local.custom, remote.custom),
    people: byId(local.people, remote.people),
    lists: byId(local.lists, remote.lists),
    plans: byId(local.plans, remote.plans).filter(pl => !rankedIds.has(pl.placeId) || (local.want || []).includes(pl.placeId)),
    favs: (local.favs || []).length ? local.favs : remote.favs || [],
  };
}

// Autoteste: `node sync.mjs`
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('sync.mjs')) {
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const phone = { v: 2, ranked: [{ id: 'a', value: 9.5, date: 20, visits: [{ date: 10, nota: 8 }, { date: 20, nota: 9 }] }], want: ['x', 'b'], people: [{ id: 'p1', name: 'Ana' }], lists: [], plans: [], favs: [] };
  const cloud = { v: 2, ranked: [{ id: 'a', value: 7.5, date: 15, visits: [{ date: 10, nota: 8 }, { date: 15, nota: 7 }] }, { id: 'b', value: 6.5, date: 12, visits: [{ date: 12, nota: 6 }] }],
    want: ['y'], people: [{ id: 'p2', name: 'Dada' }], lists: [{ id: 'l1', name: 'Cafés', items: ['a'] }], plans: [], favs: ['a'] };
  const m = mergeData(phone, cloud), a = m.ranked.find(r => r.id === 'a');
  assert(m.ranked.length === 2, 'lugares de um e de outro aparelho');
  assert(a.visits.length === 3 && a.value === 9.5, 'visitas unidas e nota da mais recente ' + JSON.stringify(a));
  assert(m.want.join() === 'x,y', 'quero ir unido, sem o que já foi ranqueado: ' + m.want);
  assert(m.people.length === 2 && m.lists.length === 1 && m.favs[0] === 'a', 'pessoas, listas e favoritos');
  assert(mergeData(phone, null) === phone && mergeData(null, cloud) === cloud, 'um lado vazio');
  console.log('ok sincronização');
}
