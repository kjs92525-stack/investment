import * as api from './api.js';
import { parseCommand, describe, suggestFuncs, FUNCS } from './commands.js';
import { render, REFRESH_MS, getWatch, setWatch, applyColors } from './functions.js';
import { esc } from './format.js';

applyColors();
const STORE = 'ot.layout.v1';
const DEFAULT = { layout: 4, active: 0, panels: ['WEI', 'AAPL GP', 'AAPL DES', 'N'] };

const $ = (s) => document.querySelector(s);
const grid = $('#grid');
const input = $('#cmd');
const status = $('#status');
const sugBox = $('#sug');

let saved;
try {
  saved = JSON.parse(localStorage.getItem(STORE)) || DEFAULT;
} catch {
  saved = DEFAULT;
}
const panels = [0, 1, 2, 3].map((i) => ({ i, text: saved.panels?.[i] || DEFAULT.panels[i], token: 0, dispose: () => {}, timer: 0 }));
let layout = [1, 2, 4].includes(saved.layout) ? saved.layout : 4;
let active = Math.min(saved.active || 0, layout - 1);

const history = (() => {
  try {
    return JSON.parse(localStorage.getItem('ot.hist')) || [];
  } catch {
    return [];
  }
})();
let histPos = history.length;

function persist() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ layout, active, panels: panels.map((p) => p.text) }));
    localStorage.setItem('ot.hist', JSON.stringify(history.slice(-50)));
  } catch {}
}

// ---------------------------------------------------------------- panels
function buildGrid() {
  grid.className = `grid l${layout}`;
  grid.innerHTML = '';
  for (const p of panels.slice(0, layout)) {
    const el = document.createElement('section');
    el.className = 'panel';
    el.innerHTML = `<header><span class="pn">${p.i + 1}</span><span class="pt"></span><span class="ps"></span></header><div class="body"></div>`;
    el.addEventListener('mousedown', () => setActive(p.i, false));
    el.addEventListener('focusin', () => setActive(p.i, false));
    p.el = el;
    grid.appendChild(el);
  }
  // panels not shown stop refreshing
  for (const p of panels.slice(layout)) {
    clearInterval(p.timer);
    p.dispose();
    p.dispose = () => {};
    p.el = null;
  }
  for (const p of panels.slice(0, layout)) load(p, p.text, false);
  setActive(active, false);
}

function setActive(i, focusInput = true) {
  active = Math.min(i, layout - 1);
  panels.forEach((p) => p.el?.classList.toggle('active', p.i === active));
  $('#target').textContent = `패널 ${active + 1}`;
  persist();
  if (focusInput) input.focus();
}

async function load(p, text, record = true) {
  const cmd = parseCommand(text);
  if (!cmd.ok) return flash(cmd.error, true);

  if (cmd.func === 'W' && cmd.action) {
    const w = getWatch().filter((s) => s !== cmd.ticker);
    if (cmd.action === 'ADD') w.push(cmd.ticker);
    setWatch(w);
    flash(`관심 종목 ${cmd.action === 'ADD' ? '추가' : '삭제'}: ${cmd.ticker}`);
    // refresh every visible watchlist panel, show it in this one
    panels.filter((q) => q.el && q !== p && parseCommand(q.text).func === 'W').forEach((q) => load(q, 'W', false));
    return load(p, 'W', record);
  }

  p.text = describe(cmd);
  if (record) persist();
  const { el } = p;
  if (!el) return;
  el.querySelector('.pt').textContent = `${p.text}`;
  el.querySelector('.ps').textContent = FUNCS[cmd.func].title;
  el.dataset.func = cmd.func;

  clearInterval(p.timer);
  p.dispose();
  p.dispose = () => {};
  const token = ++p.token;
  const body = el.querySelector('.body');
  const inner = document.createElement('div');
  inner.className = 'inner';
  body.replaceChildren(inner);
  const ctx = { run: (t) => load(p, t) };
  const dispose = await render(inner, cmd, ctx);
  if (token !== p.token) return dispose();
  p.dispose = dispose;
  stamp(el);

  const every = REFRESH_MS[cmd.func];
  if (every) p.timer = setInterval(() => refresh(p, cmd, ctx), every);
}

// Re-render off-screen, then swap, so the panel never blanks or flickers.
async function refresh(p, cmd, ctx) {
  if (document.hidden || !p.el) return;
  const token = p.token;
  const body = p.el.querySelector('.body');
  const next = document.createElement('div');
  next.className = 'inner';
  next.hidden = true;
  body.appendChild(next);
  const scroll = body.scrollTop;
  const dispose = await render(next, cmd, ctx, { quiet: true });
  if (token !== p.token || !next.textContent) {
    dispose();
    next.remove();
    return;
  }
  p.dispose();
  p.dispose = dispose;
  [...body.children].forEach((c) => c !== next && c.remove());
  next.hidden = false;
  body.scrollTop = scroll;
  stamp(p.el);
}

function stamp(el) {
  el.querySelector('.ps').dataset.t = new Date().toLocaleTimeString('en-GB');
}

// ------------------------------------------------------------ command bar
function execute(text) {
  const t = text.trim();
  if (!t) return;
  history.push(t);
  histPos = history.length;
  const lay = t.toUpperCase().match(/^LAYOUT\s*([124])$/);
  if (lay) {
    layout = Number(lay[1]);
    if (active >= layout) active = 0;
    persist();
    buildGrid();
    flash(`화면 ${layout}분할`);
    return;
  }
  const cmd = parseCommand(t);
  if (!cmd.ok) return flash(cmd.error, true);
  input.value = '';
  hideSug();
  load(panels[active], t);
}

let flashTimer;
function flash(msg, err = false) {
  status.textContent = msg;
  status.className = err ? 'err' : 'ok';
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    status.textContent = '';
    status.className = '';
  }, 4000);
}

// autocomplete: functions + ticker search
let sugItems = [], sugSel = -1, sugReq = 0, sugTimer;
function hideSug() {
  sugBox.hidden = true;
  sugItems = [];
  sugSel = -1;
}
function showSug(items) {
  sugItems = items;
  sugSel = -1;
  if (!items.length) return hideSug();
  sugBox.innerHTML = items
    .map((s, i) => `<li data-i="${i}"><b>${esc(s.key)}</b><span>${esc(s.title)}</span><em>${esc(s.note || '')}</em></li>`)
    .join('');
  sugBox.hidden = false;
  sugBox.querySelectorAll('li').forEach((li) =>
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      pick(Number(li.dataset.i), true);
    }),
  );
}
function pick(i, run) {
  const s = sugItems[i];
  if (!s) return;
  const parts = input.value.trimEnd().split(/\s+/);
  parts[parts.length - 1] = s.key;
  input.value = parts.join(' ') + ' ';
  hideSug();
  if (run && s.kind === 'func') execute(input.value);
  else input.focus();
}
function updateSug() {
  const v = input.value;
  const last = v.trim().split(/\s+/).pop() || '';
  clearTimeout(sugTimer);
  if (!v.trim()) return hideSug();
  const funcs = suggestFuncs(v).filter((f) => f.key !== last.toUpperCase()).slice(0, 5).map((f) => ({ ...f, note: f.help, kind: 'func' }));
  showSug(funcs);
  if (last.length < 1 || FUNCS[last.toUpperCase()]) return;
  const req = ++sugReq;
  sugTimer = setTimeout(async () => {
    try {
      const r = await api.search(last);
      if (req !== sugReq) return;
      const tick = r.quotes.slice(0, 6).map((q) => ({ key: q.symbol, title: q.name, note: [q.exchange, q.type].filter(Boolean).join(' · '), kind: 'ticker' }));
      showSug([...tick, ...funcs].slice(0, 8));
    } catch {}
  }, 220);
}
function moveSel(d) {
  if (!sugItems.length) return false;
  sugSel = (sugSel + d + sugItems.length) % sugItems.length;
  sugBox.querySelectorAll('li').forEach((li, i) => li.classList.toggle('sel', i === sugSel));
  return true;
}

input.addEventListener('input', updateSug);
input.addEventListener('blur', () => setTimeout(hideSug, 100));
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (sugSel >= 0) return pick(sugSel, false);
    return execute(input.value);
  }
  if (e.key === 'Tab' && sugItems.length) {
    e.preventDefault();
    return pick(sugSel >= 0 ? sugSel : 0, false);
  }
  if (e.key === 'Escape') {
    input.value = '';
    return hideSug();
  }
  if (e.key === 'ArrowDown' && moveSel(1)) return e.preventDefault();
  if (e.key === 'ArrowUp' && moveSel(-1)) return e.preventDefault();
  if (e.key === 'ArrowUp' && history.length) {
    e.preventDefault();
    histPos = Math.max(0, histPos - 1);
    input.value = history[histPos] || '';
  }
  if (e.key === 'ArrowDown' && history.length) {
    e.preventDefault();
    histPos = Math.min(history.length, histPos + 1);
    input.value = history[histPos] || '';
  }
});
$('#cmdform').addEventListener('submit', (e) => {
  e.preventDefault();
  execute(input.value);
});

const FKEYS = { F1: 'HELP', F2: 'WEI', F3: 'FX', F4: 'W' };
document.addEventListener('keydown', (e) => {
  if (FKEYS[e.key]) {
    e.preventDefault();
    return execute(FKEYS[e.key]);
  }
  if (e.altKey && /^[1-4]$/.test(e.key)) {
    e.preventDefault();
    if (Number(e.key) <= layout) setActive(Number(e.key) - 1);
    return;
  }
  if (e.key === '/' && document.activeElement !== input) {
    e.preventDefault();
    input.focus();
  }
});

// bottom function-key strip
document.querySelectorAll('#fkeys [data-cmd]').forEach((b) =>
  b.addEventListener('click', () => {
    const c = b.dataset.cmd;
    if (c.startsWith('LAYOUT')) return execute(c);
    // DES/GP/N reuse the active panel's ticker
    if (['GP', 'DES', 'N'].includes(c)) {
      const cur = parseCommand(panels[active].text);
      const t = cur.ok && cur.ticker ? cur.ticker : 'AAPL';
      return execute(`${t} ${c}`);
    }
    execute(c);
  }),
);

// ------------------------------------------------------------------ clocks
const ZONES = [['뉴욕', 'America/New_York'], ['런던', 'Europe/London'], ['도쿄', 'Asia/Tokyo'], ['서울', 'Asia/Seoul']];
function nyOpen(now) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  const mins = Number(p.hour) * 60 + Number(p.minute);
  if (['Sat', 'Sun'].includes(p.weekday)) return '휴장';
  if (mins >= 570 && mins < 960) return '장중';
  if (mins >= 240 && mins < 570) return '장전';
  if (mins >= 960 && mins < 1200) return '장후';
  return '마감';
}
function tick() {
  const now = new Date();
  $('#clocks').innerHTML =
    ZONES.map(
      ([n, z]) => `<span><em>${n}</em> ${now.toLocaleTimeString('en-GB', { timeZone: z, hour: '2-digit', minute: '2-digit' })}</span>`,
    ).join('') + `<span class="mkt">미국 ${nyOpen(now)}</span>`;
}
tick();
setInterval(tick, 10_000);

// -------------------------------------------------------------------- boot
(async () => {
  const mode = await api.init();
  const badge = $('#mode');
  badge.textContent = mode === 'live' ? 'LIVE' : 'DEMO';
  badge.className = mode;
  badge.title = mode === 'live' ? '서버를 통해 실제 시세(지연)를 받고 있습니다' : '서버가 없어 가짜 데이터로 동작 중입니다';
  if (mode === 'demo') $('#demo-banner').hidden = false;
  buildGrid();
  if (matchMedia('(pointer: fine)').matches) input.focus();
})();
