// Cadastro e entrada da Lia: uma pergunta por tela, botão só libera quando a resposta vale.
// Fluxo: boas-vindas → e-mail → senha → nome → @usuário → conta criada. Ou: entrar (e-mail + senha) / senha nova.
import { signUp, signIn, usernameAvailable, resetPassword, updatePassword, passwordRules, USERNAME_RE, errorText } from './conta.mjs';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const slug = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
const ICON = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.9M6.2 6.3A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.3-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

const SLIDES = [
  { big: '<span class="onb-sig">Lia</span>', title: 'Seu ranking de Curitiba', text: 'Restaurantes, cafés e bares em ordem, do seu favorito para baixo.' },
  { big: '<span class="onb-num">9</span>', title: 'Você dá a nota', text: 'De 1 a 10, e a Lia desempata comparando com os lugares que você já conhece.' },
  { big: '<span class="onb-num">2 amigos</span>', title: 'Com quem você foi', text: 'Guarde cada visita, com quem estava e o que pediu.' },
];

export function startOnboarding({ onDone, mode = 'welcome' }) {
  const root = document.createElement('div');
  root.id = 'onb';
  document.body.append(root);
  const st = { step: mode, slide: 0, email: '', password: '', first: '', last: '', username: '', showPw: false, busy: false, error: '', userState: '', userTimer: 0 };
  const history = [];
  const go = step => { history.push(st.step); st.step = step; st.error = ''; render(); };
  const back = () => { st.step = history.pop() || 'welcome'; st.error = ''; render(); };
  const finish = () => { root.remove(); onDone(); };

  // telas -----------------------------------------------------------------
  const screen = (title, sub, body, cta, { backBtn = true } = {}) => `
    <div class="onb-screen">
      ${backBtn ? `<button class="iconbtn onb-back" data-act="back" aria-label="Voltar">${icon('back')}</button>` : '<span class="onb-back"></span>'}
      <h1>${title}</h1>${sub ? `<p class="onb-sub">${sub}</p>` : ''}
      <div class="onb-body">${body}</div>
      ${st.error ? `<p class="onb-err" role="alert">${esc(st.error)}</p>` : ''}
      <div class="onb-foot">${cta}</div>
    </div>`;
  const SPIN = '<span class="spin" aria-label="Carregando"></span>';
  const okFor = {
    email: () => EMAIL_RE.test(st.email), password: () => passwordRules(st.password).every(r => r.ok), name: () => st.first.trim().length > 0,
    username: () => st.userState === 'ok', login: () => EMAIL_RE.test(st.email) && st.password.length > 0, recovery: () => passwordRules(st.password).every(r => r.ok),
  };
  const cta = (label, ok) => `<button class="btn primary wide onb-cta" data-act="next" data-label="${label}" ${ok && !st.busy ? '' : 'disabled'}>${st.busy ? SPIN : label}</button>`;
  const USER_MSG = { checking: 'Conferindo…', taken: 'Esse @ já está em uso', bad: 'Use de 3 a 20 letras minúsculas, números, ponto ou _', offline: 'Sem conexão para conferir. Tente de novo.' };
  const field = (id, value, attrs) => `<input class="onb-in" id="${id}" value="${esc(value)}" ${attrs}>`;

  const views = {
    welcome() {
      const s = SLIDES[st.slide];
      return `<div class="onb-screen onb-welcome">
        <div class="onb-hero">${s.big}</div>
        <h1>${s.title}</h1><p class="onb-sub">${s.text}</p>
        <div class="onb-dots">${SLIDES.map((_, i) => `<button data-slide="${i}" aria-label="Tela ${i + 1}" aria-current="${i === st.slide}"></button>`).join('')}</div>
        <div class="onb-foot"><button class="btn primary wide" data-act="start">Começar</button>
          <button class="btn quiet wide" data-act="login">Já tenho conta. Entrar</button></div></div>`;
    },
    email: () => screen('Qual é o seu e-mail?', '', field('f-email', st.email, 'type="email" inputmode="email" autocomplete="email" placeholder="voce@exemplo.com" autocapitalize="off" spellcheck="false"'), cta('Continuar', EMAIL_RE.test(st.email))),
    password() {
      const rules = passwordRules(st.password);
      return screen('Crie uma senha', '', `<div class="onb-pw">${field('f-pw', st.password, `type="${st.showPw ? 'text' : 'password'}" autocomplete="new-password" placeholder="Senha"`)}
          <button class="iconbtn" data-act="eye" aria-label="${st.showPw ? 'Esconder senha' : 'Mostrar senha'}">${icon(st.showPw ? 'eyeOff' : 'eye')}</button></div>
        <p class="onb-hint">Sua senha precisa ter:</p>
        <ul class="onb-rules">${rules.map(r => `<li class="${r.ok ? 'ok' : ''}">${icon('check')}${r.text}</li>`).join('')}</ul>`,
        cta('Continuar', rules.every(r => r.ok)));
    },
    name: () => screen('Qual é o seu nome?', 'É assim que seus amigos vão te ver.',
      field('f-first', st.first, 'autocomplete="given-name" placeholder="Nome" autocapitalize="words"') + field('f-last', st.last, 'autocomplete="family-name" placeholder="Sobrenome" autocapitalize="words"'),
      cta('Continuar', st.first.trim().length > 0)),
    username() {
      const msg = USER_MSG[st.userState] ?? '';
      return screen('Seu nome de usuário', 'Como você quer ser encontrado na Lia?',
        `<div class="onb-user"><span>@</span>${field('f-user', st.username, 'autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="usuario"')}
          <i class="onb-ok ${st.userState === 'ok' ? 'on' : ''}">${icon('check')}</i></div>
         <p class="onb-hint ${['taken', 'bad', 'offline'].includes(st.userState) ? 'bad' : ''}">${msg || 'Dá para mudar depois.'}</p>`,
        cta('Criar conta', st.userState === 'ok') + '<p class="onb-legal">Ao criar a conta, você concorda com os <a href="termos.html" target="_blank">Termos de uso</a> e a <a href="privacidade.html" target="_blank">Política de privacidade</a>.</p>');
    },
    confirm: () => screen('Confirme seu e-mail', `Mandamos um link para <b>${esc(st.email)}</b>. Abra o link e depois volte aqui para entrar.`, '', `<button class="btn primary wide" data-act="to-login">Já confirmei, entrar</button>`, { backBtn: false }),
    done: () => `<div class="onb-screen onb-welcome"><div class="onb-hero"><span class="onb-sig">Lia</span></div>
        <h1>Que bom ter você aqui, ${esc(st.first.trim())}</h1><p class="onb-sub">Comece ranqueando um lugar onde você foi recentemente.</p>
        <div class="onb-foot"><button class="btn primary wide" data-act="finish">Começar</button></div></div>`,
    login: () => screen('Entrar', '', field('f-email', st.email, 'type="email" inputmode="email" autocomplete="email" placeholder="E-mail" autocapitalize="off" spellcheck="false"') +
        `<div class="onb-pw">${field('f-pw', st.password, `type="${st.showPw ? 'text' : 'password'}" autocomplete="current-password" placeholder="Senha"`)}
          <button class="iconbtn" data-act="eye" aria-label="${st.showPw ? 'Esconder senha' : 'Mostrar senha'}">${icon(st.showPw ? 'eyeOff' : 'eye')}</button></div>
         <button class="btn quiet onb-forgot" data-act="forgot">Esqueci a senha</button>`,
      cta('Entrar', EMAIL_RE.test(st.email) && st.password.length > 0)),
    forgotSent: () => screen('Confira seu e-mail', `Se existir uma conta com <b>${esc(st.email)}</b>, mandamos um link para criar uma senha nova.`, '', `<button class="btn primary wide" data-act="to-login">Voltar para entrar</button>`, { backBtn: false }),
    recovery() {
      const rules = passwordRules(st.password);
      return screen('Crie uma senha nova', '', `<div class="onb-pw">${field('f-pw', st.password, `type="${st.showPw ? 'text' : 'password'}" autocomplete="new-password" placeholder="Senha nova"`)}
          <button class="iconbtn" data-act="eye" aria-label="${st.showPw ? 'Esconder senha' : 'Mostrar senha'}">${icon(st.showPw ? 'eyeOff' : 'eye')}</button></div>
        <ul class="onb-rules">${rules.map(r => `<li class="${r.ok ? 'ok' : ''}">${icon('check')}${r.text}</li>`).join('')}</ul>`,
        cta('Salvar senha', rules.every(r => r.ok)), { backBtn: false });
    },
  };

  function render() {
    root.innerHTML = views[st.step]();
    root.querySelector('.onb-in')?.focus();   // cada tela abre com o teclado no primeiro campo
  }
  // atualiza botão, regras e avisos sem recriar o campo em uso (recriar faz o teclado do celular piscar)
  function refresh() {
    const c = root.querySelector('.onb-cta');
    if (c) { c.disabled = st.busy || !okFor[st.step]?.(); c.innerHTML = st.busy ? SPIN : c.dataset.label; }
    const rules = passwordRules(st.password);
    root.querySelectorAll('.onb-rules li').forEach((li, i) => li.classList.toggle('ok', rules[i].ok));
    const hint = root.querySelector('.onb-user + .onb-hint');
    if (hint) { hint.textContent = USER_MSG[st.userState] || 'Dá para mudar depois.'; hint.classList.toggle('bad', ['taken', 'bad', 'offline'].includes(st.userState)); }
    root.querySelector('.onb-ok')?.classList.toggle('on', st.userState === 'ok');
    const err = root.querySelector('.onb-err');
    if (!st.error) err?.remove();
    else if (err) err.textContent = st.error;
    else root.querySelector('.onb-foot')?.insertAdjacentHTML('beforebegin', `<p class="onb-err" role="alert">${esc(st.error)}</p>`);
  }

  async function checkUser() {
    const u = st.username;
    if (!USERNAME_RE.test(u)) { st.userState = u ? 'bad' : ''; return refresh(); }
    st.userState = 'checking'; refresh();
    try { const free = await usernameAvailable(u); if (u === st.username) { st.userState = free ? 'ok' : 'taken'; refresh(); } }
    catch { if (u === st.username) { st.userState = 'offline'; refresh(); } }
  }

  async function next() {
    if (st.busy || root.querySelector('.onb-cta')?.disabled) return;
    const s = st.step;
    if (s === 'email') return go('password');
    if (s === 'password') return go('name');
    if (s === 'name') { if (!st.username) { st.username = slug(st.first + st.last); } go('username'); return checkUser(); }
    st.busy = true; st.error = ''; refresh();
    try {
      if (s === 'username') {
        const { needsConfirm } = await signUp({ email: st.email.trim(), password: st.password, firstName: st.first.trim(), lastName: st.last.trim(), username: st.username });
        st.busy = false; st.password = needsConfirm ? '' : st.password; go(needsConfirm ? 'confirm' : 'done'); return;
      }
      if (s === 'login') { await signIn(st.email.trim(), st.password); st.busy = false; return finish(); }
      if (s === 'recovery') { await updatePassword(st.password); st.busy = false; return finish(); }
    } catch (err) { st.busy = false; st.error = errorText(err); refresh(); }
  }

  root.addEventListener('input', e => {
    const id = e.target.id, v = e.target.value;
    if (id === 'f-email') st.email = v;
    else if (id === 'f-pw') st.password = v;
    else if (id === 'f-first') st.first = v;
    else if (id === 'f-last') st.last = v;
    else if (id === 'f-user') {
      st.username = v.toLowerCase().replace(/\s/g, ''); if (e.target.value !== st.username) e.target.value = st.username;
      clearTimeout(st.userTimer); st.userState = ''; st.userTimer = setTimeout(checkUser, 350);   // espera parar de digitar
    }
    st.error = ''; refresh();
  });
  root.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('.onb-in')) { e.preventDefault(); next(); } });
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.slide) { st.slide = +b.dataset.slide; return render(); }
    const a = b.dataset.act;
    if (a === 'next') next();
    else if (a === 'back') back();
    else if (a === 'start') go('email');
    else if (a === 'login' || a === 'to-login') { st.password = ''; go('login'); }
    else if (a === 'eye') {
      st.showPw = !st.showPw; const pw = root.querySelector('#f-pw');
      pw.type = st.showPw ? 'text' : 'password'; b.innerHTML = icon(st.showPw ? 'eyeOff' : 'eye'); b.setAttribute('aria-label', st.showPw ? 'Esconder senha' : 'Mostrar senha'); pw.focus();
    }
    else if (a === 'finish') finish();
    else if (a === 'forgot') {
      if (!EMAIL_RE.test(st.email)) { st.error = 'Digite seu e-mail acima primeiro.'; return refresh(); }
      st.busy = true; refresh();
      try { await resetPassword(st.email.trim()); st.busy = false; go('forgotSent'); } catch (err) { st.busy = false; st.error = errorText(err); refresh(); }
    }
  });
  // arrastar para o lado troca as telas de boas-vindas
  let x0 = null;
  root.addEventListener('touchstart', e => { if (st.step === 'welcome') x0 = e.touches[0].clientX; }, { passive: true });
  root.addEventListener('touchend', e => {
    if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) { st.slide = Math.max(0, Math.min(SLIDES.length - 1, st.slide + (dx < 0 ? 1 : -1))); render(); }
  });
  render();
}
