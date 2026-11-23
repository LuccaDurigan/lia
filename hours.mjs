// Horário de funcionamento no formato do OpenStreetMap (opening_hours), só os casos comuns:
// "Mo-Fr 11:00-15:00,18:00-23:00; Sa,Su 12:00-16:00", "24/7", "Tu-Su 18:00-02:00", "Mo off".
// shortcut: feriados (PH), meses e nascer do sol são ignorados ou devolvem null; trocar por opening_hours.js se precisar.
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const PT = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const min = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Devolve 7 listas (segunda a domingo) de intervalos [abre, fecha] em minutos, ou null se não entender.
export function parseHours(str) {
  if (!str) return null;
  const week = DAYS.map(() => []);
  let used = 0;
  // variações comuns no OSM de Curitiba: "07:00 - 20:30", "…21:00, Su 09:00…", "Sa,PH 19:00…"
  str = str.replace(/\s*-\s*/g, '-').replace(/(\d),\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)/g, '$1;');
  for (let rule of str.split(';').map(s => s.trim()).filter(Boolean)) {
    rule = rule.replace(/,PH\b|\bPH,/g, '');
    if (rule === '24/7') { week.forEach(d => d.splice(0, d.length, [0, 1440])); used++; continue; }
    if (/^(PH|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(rule)) continue;   // feriados e exceções por mês
    used++;
    const m = rule.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?)(?:,(?:[A-Z][a-z](?:-[A-Z][a-z])?))*)\s+(.+)$/);
    let days = DAYS.map((_, i) => i), times = rule;
    if (m) {
      days = [];
      for (const part of m[1].split(',')) {
        const [a, b = a] = part.split('-').map(d => DAYS.indexOf(d));
        if (a < 0 || b < 0) return null;
        for (let i = a; ; i = (i + 1) % 7) { days.push(i); if (i === b) break; }
      }
      times = m[2];
    }
    times = times.replace(/,\s*PH.*$/, '').trim();
    const spans = [];
    if (!/^(off|closed)$/.test(times)) for (const t of times.split(',').map(s => s.trim())) {
      const r = t.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      if (!r) return null;
      let [o, c] = [min(r[1]), min(r[2])];
      if (c <= o) c += 1440;                     // passa da meia-noite
      spans.push([o, c]);
    }
    days.forEach(d => { week[d] = [...spans]; });  // regra posterior substitui a anterior, como no OSM
  }
  return used ? week : null;
}

// Status agora: { open, text } em português.
export function hoursStatus(week, now = new Date()) {
  if (!week) return null;
  const d = (now.getDay() + 6) % 7, t = now.getHours() * 60 + now.getMinutes();
  const prev = (d + 6) % 7;
  for (const [o, c] of week[d]) if (t >= o && t < c) return { open: true, text: o === 0 && c === 1440 ? 'Aberto 24 horas' : `Aberto · fecha às ${hhmm(c)}` };
  for (const [, c] of week[prev]) if (c > 1440 && t < c - 1440) return { open: true, text: `Aberto · fecha às ${hhmm(c)}` };
  const later = week[d].filter(([o]) => o > t).sort((a, b) => a[0] - b[0])[0];
  if (later) return { open: false, text: `Fechado · abre às ${hhmm(later[0])}` };
  for (let k = 1; k <= 7; k++) {
    const s = [...week[(d + k) % 7]].sort((a, b) => a[0] - b[0])[0];
    if (s) return { open: false, text: `Fechado · abre ${k === 1 ? 'amanhã' : PT[(d + k) % 7].toLowerCase()} às ${hhmm(s[0])}` };
  }
  return { open: false, text: 'Fechado' };
}

// Linhas da semana para a ficha: [{ day, text, today }]
export function hoursWeek(week, now = new Date()) {
  const d = (now.getDay() + 6) % 7;
  return week.map((spans, i) => ({ day: PT[i], today: i === d,
    text: spans.length ? spans.map(([o, c]) => o === 0 && c === 1440 ? '24 horas' : `${hhmm(o)}–${hhmm(c)}`).join(', ') : 'Fechado' }));
}

// Autoteste: `node hours.mjs`
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('hours.mjs')) {
  const assert = (c, m) => { if (!c) throw new Error(m); };
  const at = (day, hm) => { const x = new Date(2026, 10, 23 + day); const [h, m] = hm.split(':'); x.setHours(+h, +m); return x; }; // 23/11/2026 = segunda
  const w = parseHours('Mo-Fr 11:00-15:00,18:00-23:00; Sa,Su 12:00-16:00; Mo off');
  assert(w[0].length === 0 && w[1].length === 2 && w[6][0][0] === 720, 'parse');
  assert(hoursStatus(w, at(1, '12:00')).text === 'Aberto · fecha às 15:00', 'aberto');
  assert(hoursStatus(w, at(1, '16:00')).text === 'Fechado · abre às 18:00', 'reabre');
  assert(hoursStatus(w, at(0, '12:00')).text === 'Fechado · abre amanhã às 11:00', 'segunda off');
  const n = parseHours('Tu-Su 18:00-02:00');
  assert(hoursStatus(n, at(2, '01:00')).text === 'Aberto · fecha às 02:00', 'madrugada');
  assert(hoursStatus(parseHours('24/7'), at(3, '04:00')).text === 'Aberto 24 horas', '24/7');
  assert(parseHours('Mo-Fr sunrise-sunset') === null && parseHours('Jan-Mar 10:00-12:00') === null, 'desconhecido');
  assert(hoursWeek(w, at(0, '10:00'))[0].text === 'Fechado' && hoursWeek(w, at(0, '10:00'))[0].today, 'semana');
  const v = parseHours('Mo-Sa 07:00-21:00, Su 09:00 - 20:00');
  assert(v && v[6][0][0] === 540 && v[0][0][1] === 1260, 'vírgula entre regras e espaços');
  assert(parseHours('Mo-Su,PH 06:30-18:30')[3].length === 1, 'PH na lista de dias');
  assert(parseHours('12:00-19:00; Jun-Aug 12:00-18:00; Dec 25,Jan 01 off')[0][0][1] === 1140, 'exceção por mês ignorada');
  console.log('ok horários');
}
