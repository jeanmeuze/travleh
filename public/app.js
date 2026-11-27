// travleh – travle, maar dan met West-Vlaamse gemeentes
const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const EPOCH = '2026-11-23'; // dag #1
const EXTRA_GUESSES = 4;
const STORE = 'travleh:v1';
// Verjaardag Jan: vaste opdrachten op /verjaardagjan/1 … /verjaardagjan/5
const JAN = [
  ['Wervik', 'Roeselare'],
  ['Roeselare', 'De Panne'],
  ['De Panne', 'Beernem'],
  ['Beernem', 'Zonnebeke'],
  ['Zonnebeke', 'Harelbeke'],
];
const JAN_BASE = '/verjaardagjan';
// Special: Wervik → Kortrijk, met afgesloten gemeentes die je pas ontdekt als je ze probeert
const SPECIAL = { start: 'Wervik', end: 'Kortrijk' };
const OBSTACLES = {
  Menen: '🔥 Menen is afgezet wegens een brand bij Galloo. De rookpluim is tot in Halluin te zien!',
  Wevelgem: '🚴 Gent-Wevelgem komt eraan: alle wegen in Wevelgem zijn afgezet voor de renners.',
  Ledegem: '✊ Stakingspost aan de rotonde in Ledegem. Niemand komt erdoor.',
  Lendelede: '🚧 Wegenwerken in Lendelede. De omleiding leidt… terug naar Lendelede.',
  Kuurne: '⛴️ Kuurne: de brug over de Leie staat open voor een binnenschip. Dat kan nog even duren.',
  Izegem: '🚜 Tractorbetoging in Izegem: honderd boeren blokkeren het centrum.',
  Ingelmunster: '🍺 Ingelmunster: een vrachtwagen vol bierbakken is gekanteld. Iedereen helpt opruimen, niemand heeft haast.',
};

const data = await fetch('/data.json').then((r) => r.json());
const M = data.municipalities;
const byId = new Map(M.map((m) => [m.id, m]));
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const byNorm = new Map(M.map((m) => [norm(m.name), m]));
let blocked = new Set(); // afgesloten gemeentes (enkel in special-modus)
const isBlocked = (id) => blocked.has(id);
function setBlocked(ids) { blocked = new Set(ids); distCache.clear(); }

// ---------- graaf ----------
const distCache = new Map();
function distFrom(id) {
  if (distCache.has(id)) return distCache.get(id);
  const d = new Map([[id, 0]]);
  const q = [id];
  while (q.length) {
    const c = q.shift();
    for (const n of byId.get(c).n) if (!d.has(n) && !blocked.has(n)) { d.set(n, d.get(c) + 1); q.push(n); }
  }
  distCache.set(id, d);
  return d;
}
const dist = (a, b) => distFrom(a).get(b) ?? Infinity;

// ---------- random ----------
function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickPair(rand) {
  for (let i = 0; i < 1000; i++) {
    const a = M[Math.floor(rand() * M.length)];
    const b = M[Math.floor(rand() * M.length)];
    const d = dist(a.id, b.id);
    if (d >= 3 && d <= 6) return [a.id, b.id];
  }
  return [M[0].id, M[1].id];
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(new Date());
const dayNumber = (d) => Math.round((Date.parse(d) - Date.parse(EPOCH)) / 864e5) + 1;

// ---------- opslag ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(s) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch {}
}

// ---------- spelstatus ----------
let game;

function newGame({ start, end, mode, day }) {
  const D = dist(start, end);
  game = { start, end, mode, day, D, maxGuesses: D - 1 + EXTRA_GUESSES, guesses: [], hints: 0, done: false, won: false };
}

function initFromUrl() {
  if (/^\/special\/?$/i.test(location.pathname)) {
    setBlocked(Object.keys(OBSTACLES).map((n) => byNorm.get(norm(n)).id));
    const [start, end] = [SPECIAL.start, SPECIAL.end].map((n) => byNorm.get(norm(n)).id);
    const saved = load().special;
    if (saved && saved.start === start && saved.end === end) game = saved;
    else { newGame({ start, end, mode: 'special' }); game.maxGuesses = 999; }
    return;
  }
  const jm = location.pathname.match(/^\/verjaardagjan(?:\/(\d+))?\/?$/i);
  if (jm) {
    let lvl = Number(jm[1] || 1);
    if (!(lvl >= 1 && lvl <= JAN.length)) lvl = 1;
    if (location.pathname !== `${JAN_BASE}/${lvl}`) history.replaceState(null, '', `${JAN_BASE}/${lvl}`);
    const [start, end] = JAN[lvl - 1].map((n) => byNorm.get(norm(n)).id);
    const saved = load().jan?.[lvl];
    if (saved && saved.start === start && saved.end === end) game = saved;
    else newGame({ start, end, mode: 'jan', day: lvl });
    return;
  }
  const p = new URLSearchParams(location.search);
  const van = p.get('van') && byNorm.get(norm(p.get('van')));
  const naar = p.get('naar') && byNorm.get(norm(p.get('naar')));
  if (van && naar && van.id !== naar.id && dist(van.id, naar.id) >= 2) {
    newGame({ start: van.id, end: naar.id, mode: 'custom' });
    return;
  }
  const d = today();
  const [start, end] = pickPair(rng(hash('travleh-' + d)));
  const st = load();
  if (st.daily && st.daily.day === d && st.daily.start === start) {
    game = st.daily;
  } else {
    newGame({ start, end, mode: 'daily', day: d });
  }
}

function persist() {
  if (game.mode === 'special') {
    const st = load();
    st.special = game;
    save(st);
    return;
  }
  if (game.mode === 'jan') {
    const st = load();
    st.jan = st.jan || {};
    st.jan[game.day] = game;
    save(st);
    renderJanNav();
    return;
  }
  if (game.mode !== 'daily') return;
  const st = load();
  st.daily = game;
  save(st);
}

const scoreOf = (id) => {
  const extra = dist(game.start, id) + dist(id, game.end) - game.D;
  return extra <= 0 ? 1 : extra === 1 ? 2 : extra === 2 ? 3 : 4;
};

function connected() {
  const S = new Set([game.start, game.end, ...game.guesses.filter((id) => !isBlocked(id))]);
  const seen = new Set([game.start]);
  const q = [game.start];
  while (q.length) {
    const c = q.shift();
    if (c === game.end) return true;
    for (const n of byId.get(c).n) if (S.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
  }
  return false;
}

function bestPath() {
  // kortste route, bij gelijke lengte bij voorkeur via geraden gemeentes
  const dE = distFrom(game.end);
  const guessed = new Set(game.guesses);
  const path = [];
  let c = game.start;
  while (c !== game.end) {
    const opts = byId.get(c).n.filter((n) => dE.get(n) === dE.get(c) - 1);
    c = opts.find((n) => guessed.has(n)) || opts[0];
    if (c !== game.end) path.push(c);
  }
  return path;
}

// ---------- kaart ----------
const svg = $('map');
const pathEls = new Map();
const labelLayer = document.createElementNS(SVGNS, 'g');
// Onderste laag: buitengrens van de provincie (dikke lijn rond alle gemeentes;
// de binnengrenzen worden afgedekt door de gevulde laag erboven).
const outline = document.createElementNS(SVGNS, 'path');
outline.setAttribute('d', M.map((m) => m.d).join(''));
outline.setAttribute('class', 'outline');
svg.appendChild(outline);
const hiddenLayer = document.createElementNS(SVGNS, 'g');
const shownLayer = document.createElementNS(SVGNS, 'g');
svg.append(hiddenLayer, shownLayer, labelLayer);
for (const m of M) {
  const p = document.createElementNS(SVGNS, 'path');
  p.setAttribute('d', m.d);
  p.setAttribute('class', 'm hidden');
  p.dataset.id = m.id;
  hiddenLayer.appendChild(p);
  pathEls.set(m.id, p);
}

let vb = { x: 0, y: 0, w: data.width, h: data.height };
let anim;
function setVB(v) {
  vb = v;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  // labels op constante schermgrootte houden
  const px = svg.getBoundingClientRect().width || 600;
  labelLayer.style.fontSize = (13 * v.w) / px + 'px';
}
function animateVB(target, ms = 600) {
  cancelAnimationFrame(anim);
  const from = { ...vb };
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    setVB({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
    if (k < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
function aspect() { const r = svg.getBoundingClientRect(); return r.width && r.height ? r.width / r.height : 1; }
function fitTo(ids, animate = true) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const bb = byId.get(id).bb;
    b = [Math.min(b[0], bb[0]), Math.min(b[1], bb[1]), Math.max(b[2], bb[2]), Math.max(b[3], bb[3])];
  }
  let w = b[2] - b[0], h = b[3] - b[1];
  const pad = Math.max(w, h) * 0.18 + 30;
  w += pad * 2; h += pad * 2;
  const a = aspect();
  if (w / h > a) h = w / a; else w = h * a;
  const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
  const t = { x: cx - w / 2, y: cy - h / 2, w, h };
  animate ? animateVB(t) : setVB(t);
}
function zoom(f, cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2) {
  const w = Math.min(Math.max(vb.w * f, 80), data.width * 2.5);
  const h = w * (vb.h / vb.w);
  setVB({ x: cx - (cx - vb.x) * (w / vb.w), y: cy - (cy - vb.y) * (h / vb.h), w, h });
}
$('zoomIn').onclick = () => zoom(0.75);
$('zoomOut').onclick = () => zoom(1.33);
$('zoomFit').onclick = () => fitTo(visibleIds());
svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  zoom(e.deltaY < 0 ? 0.85 : 1.18, vb.x + ((e.clientX - r.left) / r.width) * vb.w, vb.y + ((e.clientY - r.top) / r.height) * vb.h);
}, { passive: false });
let drag = null;
svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vb: { ...vb } }; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); });
svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = svg.getBoundingClientRect();
  setVB({ ...drag.vb, x: drag.vb.x - ((e.clientX - drag.x) / r.width) * vb.w, y: drag.vb.y - ((e.clientY - drag.y) / r.height) * vb.h });
});
const endDrag = () => { drag = null; svg.classList.remove('dragging'); };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

let revealed = [];
function visibleIds() { return [game.start, game.end, ...game.guesses, ...revealed]; }

function renderMap(flashId) {
  for (const [id, el] of pathEls) {
    let cls = 'm hidden';
    if (id === game.start) cls = 'm start';
    else if (id === game.end) cls = 'm end';
    else if (game.guesses.includes(id)) cls = isBlocked(id) ? 'm blocked' : 'm g' + scoreOf(id);
    else if (revealed.includes(id)) cls = 'm reveal';
    if (id === flashId) cls += ' flash';
    el.setAttribute('class', cls);
    // getoonde gemeentes bovenop, zodat hun grenzen zichtbaar blijven
    const layer = cls.startsWith('m hidden') ? hiddenLayer : shownLayer;
    if (el.parentNode !== layer) layer.appendChild(el);
  }
  labelLayer.replaceChildren();
  for (const id of visibleIds()) {
    const m = byId.get(id);
    const t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', m.c[0]);
    t.setAttribute('y', m.c[1]);
    t.textContent = m.name;
    labelLayer.appendChild(t);
  }
}

// ---------- UI ----------
const input = $('guess');
const list = $('suggest');
let active = -1;

function suggestions(q) {
  const n = norm(q);
  if (!n) return [];
  const starts = M.filter((m) => norm(m.name).startsWith(n));
  const contains = M.filter((m) => !norm(m.name).startsWith(n) && norm(m.name).includes(n));
  return [...starts, ...contains].slice(0, 8);
}
function renderSuggest() {
  const items = suggestions(input.value);
  list.replaceChildren(...items.map((m, i) => {
    const li = document.createElement('li');
    li.textContent = m.name;
    if (game.guesses.includes(m.id) || m.id === game.start || m.id === game.end) li.classList.add('used');
    if (i === active) li.classList.add('active');
    li.onmousedown = (e) => { e.preventDefault(); input.value = m.name; list.hidden = true; submit(); };
    return li;
  }));
  list.hidden = !items.length;
}
input.addEventListener('input', () => { active = -1; renderSuggest(); });
input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 100));
input.addEventListener('keydown', (e) => {
  const n = list.children.length;
  if (e.key === 'ArrowDown' && n) { active = (active + 1) % n; renderSuggest(); e.preventDefault(); }
  else if (e.key === 'ArrowUp' && n) { active = (active - 1 + n) % n; renderSuggest(); e.preventDefault(); }
  else if (e.key === 'Enter' && active >= 0 && !list.hidden) { input.value = list.children[active].textContent; }
  else if (e.key === 'Escape') list.hidden = true;
});
$('guessForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });

function msg(t) { $('msg').textContent = t; }
function toast(t) {
  const el = $('toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 2200);
}

function submit() {
  if (game.done) return;
  const raw = input.value.trim();
  if (!raw) return;
  let m = byNorm.get(norm(raw));
  if (!m) { const s = suggestions(raw); if (s.length === 1) m = s[0]; }
  if (!m) { msg(`"${raw}" is geen West-Vlaamse gemeente.`); return; }
  if (m.id === game.start || m.id === game.end) { msg(`${m.name} is je vertrek- of eindpunt.`); input.value = ''; return; }
  if (game.guesses.includes(m.id)) { msg(`${m.name} heb je al geraden.`); input.value = ''; return; }
  game.guesses.push(m.id);
  input.value = '';
  list.hidden = true;
  active = -1;
  if (isBlocked(m.id)) {
    msg(OBSTACLES[m.name] + ' Zoek een omweg!');
    persist();
    render(m.id);
    shake();
    return;
  }
  const sc = scoreOf(m.id);
  msg(['', 'Ligt op een kortste route!', 'Bijna – één omweg.', 'Twee omwegen.', 'Dat ligt ver van de route.'][sc]);
  if (connected()) { game.done = true; game.won = true; }
  else if (game.guesses.length >= game.maxGuesses) { game.done = true; }
  persist();
  render(m.id);
  if (game.done) finish();
}

// special: elke rit kost tijd, een afgesloten weg nog meer
const wv = (n) => `${n} ${n === 1 ? "wegversperring" : "wegversperringen"}`;
const minutes = () => game.guesses.reduce((t, id) => t + (isBlocked(id) ? 12 : 6), 0);
const fmtTime = (m) => (m >= 60 ? `${Math.floor(m / 60)}u ${String(m % 60).padStart(2, '0')}` : `${m} min`);
function shake() {
  const el = document.querySelector('.mapbox');
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

function render(flashId) {
  const sp = game.mode === 'special';
  $('startName').textContent = byId.get(game.start).name;
  $('endName').textContent = byId.get(game.end).name;
  const left = game.maxGuesses - game.guesses.length;
  $('counter').textContent = game.done ? ''
    : sp ? `${game.guesses.length} ${game.guesses.length === 1 ? 'gok' : 'gokken'} · ${wv(game.guesses.filter(isBlocked).length)}`
    : `Nog ${left} ${left === 1 ? 'gok' : 'gokken'} · kortste route: ${game.D - 1} ${game.D - 1 === 1 ? 'gemeente' : 'gemeentes'}`;
  $('guessList').replaceChildren(...game.guesses.map((id) => {
    const li = document.createElement('li');
    li.className = isBlocked(id) ? 'blocked' : 'g' + scoreOf(id);
    li.textContent = (isBlocked(id) ? '🚧 ' : '') + byId.get(id).name;
    if (isBlocked(id)) li.title = OBSTACLES[byId.get(id).name];
    return li;
  }));
  $('play').querySelector('form').hidden = game.done;
  $('hintBtn').hidden = $('giveUpBtn').hidden = game.done;
  if (sp) $('giveUpBtn').hidden = true;
  renderMap(flashId);
  fitTo(visibleIds());
}

const EMOJI = ['', '🟩', '🟨', '🟧', '🟥'];
// ✅ = juiste gemeente in de juiste volgorde: ligt op een kortste route én sluit op het moment
//      van raden aan op de keten vanaf het vertrek- of eindpunt.
// 🟩 = juiste gemeente, maar in de verkeerde volgorde (nog los van de keten).
function reach(from, S) {
  const seen = new Set([from]);
  const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const n of byId.get(c).n) if (S.has(n) && !seen.has(n)) { seen.add(n); q.push(n); }
  }
  return seen;
}
function marks() {
  const S = new Set([game.start, game.end]);
  return game.guesses.map((id) => {
    if (isBlocked(id)) return '🚧';
    const sc = scoreOf(id);
    let e = EMOJI[sc];
    if (sc === 1) {
      const chain = new Set([...reach(game.start, S), ...reach(game.end, S)]);
      if (byId.get(id).n.some((n) => chain.has(n))) e = '✅';
    }
    S.add(id);
    return e;
  });
}
function squares() { return marks().join(''); }

function finish() {
  const optimal = game.D - 1;
  const real = game.guesses.filter((id) => !isBlocked(id)).length;
  if (!game.won) revealed = bestPath().filter((id) => !game.guesses.includes(id));
  renderMap();
  fitTo(visibleIds());
  const route = [game.start, ...bestPath(), game.end].map((id) => byId.get(id).name).join(' → ');
  $('result').hidden = false;
  $('resultTitle').textContent = game.won
    ? (game.guesses.length === optimal ? 'Perfect! 🎉' : 'Gelukt! 🧭')
    : 'Helaas…';
  $('resultText').textContent = game.mode === 'special'
    ? `Je raakte van ${byId.get(game.start).name} in ${byId.get(game.end).name} na ${fmtTime(minutes())}, ${real} gemeentes en ${wv(game.guesses.length - real)} (minimum ${optimal} gemeentes). Een kortste omweg: ${route}.`
    : game.won
    ? `Je reisde van ${byId.get(game.start).name} naar ${byId.get(game.end).name} met ${game.guesses.length} ${game.guesses.length === 1 ? 'gok' : 'gokken'} (minimum ${optimal}). Een kortste route: ${route}.`
    : `Een kortste route was: ${route}.`;
  $('squares').textContent = squares();
  if (game.mode === 'jan') {
    const next = game.day + 1;
    $('nextBtn').hidden = next > JAN.length;
    $('nextBtn').href = `${JAN_BASE}/${next}`;
    if (next > JAN.length) $('resultTitle').textContent += ' Alle opdrachten gedaan – gelukkige verjaardag, Jan! 🎂';
  } else $('nextBtn').hidden = true;
  $('replayBtn').hidden = game.mode !== 'special';
  if (game.mode === 'special') {
    $('resultTitle').textContent = 'Oef, net op tijd! 👶';
    $('babyTime').textContent = `Na ${fmtTime(minutes())} onderweg en ${wv(game.guesses.length - real)}…`;
    if (!game.babySeen) { game.babySeen = true; persist(); setTimeout(() => $('babyPop').showModal(), 900); }
  }
  $('msg').textContent = '';
  setTimeout(() => $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 300);
  if (game.mode === 'daily' && !game.statsCounted) {
    const st = load();
    st.stats = st.stats || { played: 0, won: 0, perfect: 0, streak: 0, best: 0, lastWin: null };
    const s = st.stats;
    s.played++;
    if (game.won) {
      s.won++;
      if (game.guesses.length === optimal && !game.hints) s.perfect++;
      const yesterday = new Date(Date.parse(game.day) - 864e5).toISOString().slice(0, 10);
      s.streak = s.lastWin === yesterday ? s.streak + 1 : 1;
      s.best = Math.max(s.best, s.streak);
      s.lastWin = game.day;
    } else s.streak = 0;
    game.statsCounted = true;
    st.daily = game;
    save(st);
  }
  const s = load().stats;
  $('stats').textContent = s ? `Gespeeld ${s.played} · gewonnen ${s.won} · perfect ${s.perfect} · reeks ${s.streak} (beste ${s.best})` : '';
}

function shareText() {
  const tag = game.mode === 'daily' ? `#travleh #${dayNumber(game.day)}`
    : game.mode === 'jan' ? `#travleh 🎂 Jan ${game.day}/${JAN.length}`
    : game.mode === 'special' ? `#travleh 🚧 ${byId.get(game.start).name} → ${byId.get(game.end).name}`
    : `#travleh ${byId.get(game.start).name} → ${byId.get(game.end).name}`;
  const extra = game.guesses.filter((id) => !isBlocked(id)).length - (game.D - 1);
  const res = game.mode === 'special' ? `${fmtTime(minutes())}, +${extra}` : game.won ? (extra === 0 ? '(perfect)' : `+${extra}`) : '❌';
  const hints = game.hints ? ` (${game.hints} hint${game.hints > 1 ? 's' : ''})` : '';
  return `${tag} ${res}${hints}\n${squares()}\n${location.origin}${location.pathname}`;
}
async function share(text) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    toast('Gekopieerd naar klembord');
  } catch {
    prompt('Kopieer:', text);
  }
}
$('shareResultBtn').onclick = () => share(shareText());
$('shareRouteBtn').onclick = () => {
  if (game.mode === 'special') { share(`Raak jij met travleh van Wervik in Kortrijk? Opgelet voor wegversperringen! 🚧 ${location.origin}/special`); return; }
  const u = new URL(location.origin + (game.mode === 'jan' ? '/' : location.pathname));
  u.searchParams.set('van', byId.get(game.start).name);
  u.searchParams.set('naar', byId.get(game.end).name);
  share(`Kan jij met travleh van ${byId.get(game.start).name} naar ${byId.get(game.end).name} reizen? ${u}`);
};

function practice() {
  const [start, end] = pickPair(Math.random);
  history.replaceState(null, '', game.mode === 'special' ? '/' : location.pathname);
  setBlocked([]);
  newGame({ start, end, mode: 'practice' });
  revealed = [];
  $('janNav').hidden = true;
  $('result').hidden = true;
  msg('Oefenroute – telt niet mee voor je statistieken.');
  render();
  input.focus();
}
$('newBtn').onclick = practice;
$('againBtn').onclick = practice;

$('hintBtn').onclick = () => {
  if (game.done) return;
  const guessed = new Set(game.guesses);
  // gemeente op een kortste route via al geraden gemeentes
  const path = bestPath().filter((id) => !guessed.has(id));
  if (!path.length) return;
  const m = byId.get(path[0]);
  game.hints++;
  persist();
  msg(`Hint: probeer een gemeente die begint met "${m.name.slice(0, 2)}…" (${m.name.length} letters).`);
};
$('giveUpBtn').onclick = () => {
  if (game.done || !confirm('Wil je opgeven en de route zien?')) return;
  game.done = true;
  persist();
  render();
  finish();
};

$('helpBtn').onclick = () => $('help').showModal();
window.addEventListener('resize', () => fitTo(visibleIds(), false));

function renderJanNav() {
  const nav = $('janNav');
  if (game.mode !== 'jan') { nav.hidden = true; return; }
  const st = load().jan || {};
  const lbl = document.createElement('span');
  lbl.className = 'lbl';
  lbl.textContent = '🎂 Verjaardag Jan · opdracht';
  nav.replaceChildren(lbl, ...JAN.map((_, i) => {
    const a = document.createElement('a');
    a.href = `${JAN_BASE}/${i + 1}`;
    a.textContent = st[i + 1]?.won ? '✓' + (i + 1) : String(i + 1);
    if (st[i + 1]?.won) a.classList.add('done');
    if (i + 1 === game.day) a.classList.add('cur');
    return a;
  }));
  nav.hidden = false;
}

// ---------- start ----------
initFromUrl();
renderJanNav();
setVB(vb);
render();
fitTo(visibleIds(), false);
if (game.done) finish();
else if (game.mode === 'jan') msg(`Opdracht ${game.day} van ${JAN.length} – gelukkige verjaardag, Jan!`);
else if (game.mode === 'custom') msg('Route van een vriend – telt niet mee voor je statistieken.');
const st = load();
if (!st.seenHelp) { $('help').showModal(); st.seenHelp = true; save(st); }
function replaySpecial() { const s2 = load(); delete s2.special; save(s2); location.reload(); }
$('babyAgain').onclick = $('replayBtn').onclick = replaySpecial;
