// Contas da Lia (Supabase Auth + tabela profiles; ver supabase.sql).
// A chave "publishable" é pública por desenho: quem protege os dados são as regras (RLS) do banco.
export const SUPABASE_URL = 'https://lxkbeqzvqtauemogoppt.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_2ttvLkNdav92zY6TQc5gFw_zurhy7WN';   // Project Settings → API Keys → Publishable

export const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
let sb = null;
async function client() {
  if (!configured) throw new Error('sem-servidor');
  if (!sb) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm');
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  return sb;
}

// Mensagens do Supabase em português; o resto vira um aviso genérico.
export function errorText(err) {
  const m = String(err?.message || err || '');
  if (/already registered|already exists/i.test(m)) return 'Esse e-mail já tem conta. Entre com ele.';
  if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos e tente de novo.';
  if (/database error saving new user|duplicate key/i.test(m)) return 'Esse @ acabou de ser escolhido por outra pessoa. Volte e tente outro.';
  if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere um minuto e tente de novo.';
  if (/failed to fetch|network|load failed/i.test(m)) return 'Sem conexão. Confira a internet e tente de novo.';
  if (/sem-conta-erro/.test(m)) return 'Entre na sua conta para informar erros.';
  if (/sem-conta/.test(m)) return 'Entre na sua conta para guardar fotos.';
  if (/exceeded the maximum allowed size|payload too large/i.test(m)) return 'Essa foto é grande demais.';
  return 'Algo deu errado. Tente de novo.';
}

export const USERNAME_RE = /^[a-z0-9._]{3,20}$/;
// regra da senha mostrada na tela, item por item
export const passwordRules = pw => [
  { ok: pw.length >= 8 && pw.length <= 20, text: '8 a 20 caracteres' },
  { ok: /[a-zA-Z]/.test(pw) && /\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw), text: 'Letras, números e caracteres especiais' },
];

export async function currentUser() {
  if (!configured) return null;
  const { data } = await (await client()).auth.getSession();
  return data.session?.user ?? null;
}

export async function myProfile() {
  const s = await client(), user = await currentUser();
  if (!user) return null;
  const { data, error } = await s.from('profiles').select('username, first_name, last_name, privacy').eq('id', user.id).maybeSingle();
  if (error) throw error;
  return data;
}

// Procura quem tem Lia pelo @ ou pelo nome (só para quem está logado; não lista você mesmo).
export async function searchProfiles(q) {
  const s = await client(), user = await currentUser();
  if (!user) return [];
  const t = q.replace(/^@/, '').toLowerCase().replace(/[^\p{L}\p{N}._ ]/gu, '').trim();   // limpa o que quebraria o filtro
  if (t.length < 2) return [];
  const { data, error } = await s.from('profiles').select('id, username, first_name, last_name')
    .or(`username.ilike.${t}%,first_name.ilike.${t}%`).neq('id', user.id).limit(5);
  if (error) throw error;
  return data;
}

export async function usernameAvailable(name) {
  const { data, error } = await (await client()).rpc('username_available', { name });
  if (error) throw error;
  return data === true;
}

// Cria a conta. O perfil (nome e @) nasce no banco pelo gatilho handle_new_user.
// Devolve { needsConfirm } quando o projeto exige confirmar o e-mail antes da primeira sessão.
export async function signUp({ email, password, firstName, lastName, username }) {
  const { data, error } = await (await client()).auth.signUp({
    email, password,
    // volta para o app (e não para a raiz do GitHub Pages) depois do link de confirmação
    options: { emailRedirectTo: location.origin + location.pathname, data: { username: username.toLowerCase(), first_name: firstName, last_name: lastName } },
  });
  if (error) throw error;
  // e-mail já cadastrado e confirmado: o Supabase devolve um usuário sem identidades em vez de erro
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('already registered');
  return { needsConfirm: !data.session };
}

export async function signIn(email, password) {
  const { error } = await (await client()).auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await (await client()).auth.signOut();
}

export async function resetPassword(email) {
  const { error } = await (await client()).auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}

// Quem volta pelo link de "esqueci a senha" chega com uma sessão de recuperação: avisa o app para pedir a senha nova.
export async function onPasswordRecovery(cb) {
  if (!configured) return;
  (await client()).auth.onAuthStateChange(event => { if (event === 'PASSWORD_RECOVERY') cb(); });
}

export async function updatePassword(password) {
  const { error } = await (await client()).auth.updateUser({ password });
  if (error) throw error;
}

// --- fotos das visitas (bucket privado "photos"; ver supabase.sql) ---
// Reduz no próprio aparelho antes de enviar: lado maior com até 1600px, JPEG 82% (por volta de 200 KB).
export async function compressPhoto(file, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });   // respeita a rotação da câmera
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('não deu para ler a foto'))), 'image/jpeg', quality));
}

export async function uploadPhoto(file) {
  const s = await client(), user = await currentUser();
  if (!user) throw new Error('sem-conta');
  const blob = await compressPhoto(file);
  const path = `${user.id}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await s.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

// Links temporários (1 dia) para fotos privadas, guardados em memória para não pedir de novo.
const urlCache = new Map();
export async function photoUrls(paths) {
  const missing = paths.filter(p => !urlCache.has(p));
  if (missing.length) {
    const { data, error } = await (await client()).storage.from('photos').createSignedUrls(missing, 86400);
    if (error) throw error;
    for (const d of data) if (d.signedUrl) urlCache.set(d.path, d.signedUrl);
  }
  return Object.fromEntries(paths.map(p => [p, urlCache.get(p)]));
}

export async function deletePhotos(paths) {
  if (!paths.length) return;
  const { error } = await (await client()).storage.from('photos').remove(paths);
  if (error) throw error;
  paths.forEach(p => urlCache.delete(p));
}

// "Informar erro" num lugar (tabela reports; só quem está logado envia, ninguém lê pelo app)
export async function sendReport(r) {
  const user = await currentUser();
  if (!user) throw new Error('sem-conta-erro');
  const { error } = await (await client()).from('reports').insert(r);
  if (error) throw error;
}

// --- sincronização: documento com os dados do app (tabela user_data; só o dono lê e escreve) ---
export async function currentUserId() { return (await currentUser())?.id ?? null; }

export async function loadUserData() {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await (await client()).from('user_data').select('data, updated_at').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data;   // { data, updated_at } ou null se ainda não há nada na conta
}

export async function saveUserData(doc) {
  const user = await currentUser();
  if (!user) throw new Error('sem-conta');
  const { data, error } = await (await client()).from('user_data')
    .upsert({ user_id: user.id, data: doc, updated_at: new Date().toISOString() }).select('updated_at').single();
  if (error) throw error;
  return data.updated_at;
}

// --- LGPD: excluir a conta de vez ---
// 1) apaga todas as fotos da pasta da pessoa no Storage; 2) a função do banco apaga a conta, e o resto sai em cascata.
export async function deleteAccount() {
  const s = await client(), user = await currentUser();
  if (!user) throw new Error('sem-conta');
  for (;;) {   // lista em lotes de 1000 até esvaziar a pasta
    const { data, error } = await s.storage.from('photos').list(user.id, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) break;
    const { error: e2 } = await s.storage.from('photos').remove(data.map(f => `${user.id}/${f.name}`));
    if (e2) throw e2;
  }
  const { error } = await s.rpc('delete_my_account');
  if (error) throw error;
  await s.auth.signOut().catch(() => {});   // a sessão já não vale; limpa o que sobrou no aparelho
}

// --- Social: seguir com pedido, privacidade, feed, "quem já foi", marcações ---
const rpc = async (fn, args) => { const { data, error } = await (await client()).rpc(fn, args); if (error) throw error; return data; };
export const friendView = id => rpc('friend_view', { target: id });
export const friendsFeed = () => rpc('friends_feed', { lim: 60 });
export const friendsAt = placeId => rpc('friends_at', { pid: placeId });

export async function setPrivacy(privacy) {
  const s = await client(), user = await currentUser();
  const { error } = await s.from('profiles').update({ privacy }).eq('id', user.id);
  if (error) throw error;
}
export async function follow(id) {
  const { error } = await (await client()).from('follows').insert({ followee: id });
  if (error && error.code !== '23505') throw error;   // já pedido: tudo bem
}
export async function unfollow(id) {   // cancela pedido ou deixa de seguir
  const s = await client(), me = await currentUserId();
  const { error } = await s.from('follows').delete().eq('follower', me).eq('followee', id);
  if (error) throw error;
}
export async function acceptFollow(id) {
  const s = await client(), me = await currentUserId();
  const { error } = await s.from('follows').update({ status: 'accepted' }).eq('follower', id).eq('followee', me);
  if (error) throw error;
}
export async function removeFollower(id) {   // recusa pedido ou tira um seguidor
  const s = await client(), me = await currentUserId();
  const { error } = await s.from('follows').delete().eq('follower', id).eq('followee', me);
  if (error) throw error;
}
// minhas ligações, já com nome e @ de cada pessoa
export async function myFollows() {
  const s = await client(), me = await currentUserId();
  if (!me) return { followers: [], following: [], requests: [] };
  const { data, error } = await s.from('follows').select('follower, followee, status').or(`follower.eq.${me},followee.eq.${me}`);
  if (error) throw error;
  const ids = [...new Set(data.map(f => f.follower === me ? f.followee : f.follower))];
  const { data: ps, error: e2 } = ids.length ? await s.from('profiles').select('id, username, first_name, last_name').in('id', ids) : { data: [] };
  if (e2) throw e2;
  const P = new Map(ps.map(p => [p.id, p]));
  const pick = (rows, key) => rows.map(f => ({ ...P.get(f[key]), status: f.status })).filter(p => p.id);
  return {
    following: pick(data.filter(f => f.follower === me), 'followee'),
    followers: pick(data.filter(f => f.followee === me && f.status === 'accepted'), 'follower'),
    requests: pick(data.filter(f => f.followee === me && f.status === 'pending'), 'follower'),
  };
}
export async function sendMentions(rows) {   // rows: [{ target, place_id, place_name, visit_date }]
  if (!rows.length) return;
  const { error } = await (await client()).from('mentions').upsert(rows, { onConflict: 'author,target,place_id,visit_date', ignoreDuplicates: true });
  if (error) throw error;
}
export async function myMentions() {
  const s = await client(), me = await currentUserId();
  if (!me) return [];
  const { data, error } = await s.from('mentions').select('id, author, place_id, place_name, visit_date, seen').eq('target', me).order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  const ids = [...new Set(data.map(m => m.author))];
  const { data: ps } = ids.length ? await s.from('profiles').select('id, username, first_name').in('id', ids) : { data: [] };
  const P = new Map((ps || []).map(p => [p.id, p]));
  return data.map(m => ({ ...m, who: P.get(m.author) }));
}
export async function markMentionsSeen() {
  const s = await client(), me = await currentUserId();
  await s.from('mentions').update({ seen: true }).eq('target', me).eq('seen', false);
}

// --- avisos (Web Push) ---
export async function savePushSub(sub) {
  const j = sub.toJSON();
  const { error } = await (await client()).from('push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint', ignoreDuplicates: true });   // já inscrito: não faz nada (só precisa de permissão de inserir)
  if (error) throw error;
}
export async function deletePushSub(endpoint) {
  await (await client()).from('push_subs').delete().eq('endpoint', endpoint);
}
