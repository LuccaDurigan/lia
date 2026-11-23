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
  const { data, error } = await s.from('profiles').select('username, first_name, last_name').eq('id', user.id).maybeSingle();
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
