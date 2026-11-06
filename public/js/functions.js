// One renderer per terminal function. Each renders into a panel body and may
// return { dispose() } for cleanup. ctx.run(cmdText) loads a command in the
// same panel (used by clickable rows).
import * as api from './api.js';
import { FUNCS, INTERVALS } from './commands.js';
import { esc, num, signed, pct, cls, big, ago, spark, decFor } from './format.js';

export const REFRESH_MS = { DES: 30e3, GP: 60e3, N: 120e3, WEI: 30e3, FX: 30e3, CMDTY: 30e3, CRYPTO: 30e3, GC: 60e3, W: 30e3 };

const LISTS = {
  WEI: [
    ['미주', [['^GSPC', 'S&P 500'], ['^DJI', '다우존스'], ['^IXIC', '나스닥 종합'], ['^RUT', '러셀 2000'], ['^VIX', 'VIX 변동성']]],
    ['유럽', [['^FTSE', '영국 FTSE 100'], ['^GDAXI', '독일 DAX'], ['^FCHI', '프랑스 CAC 40']]],
    ['아시아', [['^KS11', '코스피'], ['^KQ11', '코스닥'], ['^N225', '일본 닛케이 225'], ['^HSI', '홍콩 항셍'], ['000001.SS', '상하이 종합']]],
  ],
  FX: [['', [['KRW=X', 'USD/KRW 원·달러'], ['DX-Y.NYB', '달러 인덱스'], ['EURUSD=X', 'EUR/USD'], ['JPY=X', 'USD/JPY'], ['GBPUSD=X', 'GBP/USD'], ['CNY=X', 'USD/CNY']]]],
  CMDTY: [['', [['CL=F', 'WTI 원유'], ['BZ=F', '브렌트유'], ['NG=F', '천연가스'], ['GC=F', '금'], ['SI=F', '은'], ['HG=F', '구리']]]],
  CRYPTO: [['', [['BTC-USD', '비트코인'], ['ETH-USD', '이더리움'], ['SOL-USD', '솔라나'], ['XRP-USD', '리플']]]],
};

export const WATCH_KEY = 'ot.watch';
const DEFAULT_WATCH = ['AAPL', 'MSFT', 'NVDA', 'TSLA', '005930.KS'];
export function getWatch() {
  try {
    const w = JSON.parse(localStorage.getItem(WATCH_KEY));
    if (Array.isArray(w)) return w;
  } catch {}
  return [...DEFAULT_WATCH];
}
export function setWatch(list) {
  try {
    localStorage.setItem(WATCH_KEY, JSON.stringify(list));
  } catch {}
}

const loading = (el) => (el.innerHTML = '<div class="msg">불러오는 중…</div>');
const fail = (el, e) => (el.innerHTML = `<div class="msg err">데이터를 불러오지 못했습니다: ${esc(e.message)}</div>`);

// ------------------------------------------------------------ quote tables
function quoteTable(el, groups, rows, ctx) {
  const byS = Object.fromEntries(rows.map((r) => [r.symbol, r]));
  let html = '<table class="qt"><thead><tr><th>종목</th><th class="r">현재가</th><th class="r">등락</th><th class="r">등락률</th><th class="hide-s">당일</th></tr></thead><tbody>';
  for (const [g, list] of groups) {
    if (g) html += `<tr class="grp"><td colspan="5">${esc(g)}</td></tr>`;
    for (const [sym, label] of list) {
      const q = byS[sym] || {};
      const d = decFor(q.price, q.currency);
      html += `<tr class="row" data-sym="${esc(sym)}" tabindex="0">
        <td><span class="lbl">${esc(label || q.name || sym)}</span><span class="sym">${esc(sym)}</span></td>
        <td class="r">${q.error ? '<span class="dim">N/A</span>' : num(q.price, d)}</td>
        <td class="r ${cls(q.change)}">${signed(q.change, d)}</td>
        <td class="r ${cls(q.change)}">${pct(q.changePct)}</td>
        <td class="hide-s">${spark(q.spark)}</td></tr>`;
    }
  }
  el.innerHTML = html + '</tbody></table><div class="hint">행을 누르면 그 종목 개요(DES)로 이동</div>';
  el.querySelectorAll('tr.row').forEach((tr) => {
    const go = () => ctx.run(`${tr.dataset.sym} DES`);
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  });
}

async function marketList(el, cmd, ctx) {
  const groups = cmd.func === 'W' ? [['', getWatch().map((s) => [s, ''])]] : LISTS[cmd.func];
  const syms = groups.flatMap(([, l]) => l.map(([s]) => s));
  if (!syms.length) {
    el.innerHTML = '<div class="msg">관심 종목이 비어 있습니다. <b>W ADD AAPL</b> 처럼 추가하세요.</div>';
    return;
  }
  quoteTable(el, groups, await api.quotes(syms), ctx);
}

// ------------------------------------------------------------------- DES
function retFrom(bars, days) {
  if (bars.length < 2) return null;
  const last = bars[bars.length - 1];
  const cut = last.t - days * 86400;
  const base = bars.find((b) => b.t >= cut);
  return base && base !== last ? (last.c / base.c - 1) * 100 : null;
}

async function des(el, cmd, ctx) {
  const [c, s] = await Promise.all([
    api.chart(cmd.ticker, '1Y'),
    api.search(cmd.ticker).catch(() => null),
  ]);
  const m = c.meta;
  const bars = c.bars;
  const prev = bars.length > 1 ? bars[bars.length - 2].c : m.prevClose;
  const chg = m.price != null && prev ? m.price - prev : null;
  const dec = decFor(m.price, m.currency);
  const info = s?.quotes?.find((q) => q.symbol === c.symbol) || {};
  const ytdStart = new Date(new Date().getFullYear(), 0, 1).getTime() / 1000;
  const ytdBase = bars.find((b) => b.t >= ytdStart);
  const lo = m.low52, hi = m.high52;
  const pos = lo != null && hi > lo ? Math.min(100, Math.max(0, ((m.price - lo) / (hi - lo)) * 100)) : null;

  const rets = [['1주', 7], ['1개월', 30], ['3개월', 91], ['6개월', 182], ['1년', 365]]
    .map(([k, d]) => [k, retFrom(bars, d)]);
  rets.splice(4, 0, ['연초 이후', ytdBase ? (m.price / ytdBase.c - 1) * 100 : null]);

  el.innerHTML = `
    <div class="des">
      <div class="des-head">
        <div><div class="des-name">${esc(m.name)}</div>
          <div class="dim">${esc(c.symbol)} · ${esc(m.exchange || '')} · ${esc(m.currency || '')}${info.sector ? ' · ' + esc(info.sector) : ''}${info.industry ? ' / ' + esc(info.industry) : ''}</div></div>
        <div class="des-px"><div class="px">${num(m.price, dec)}</div><div class="${cls(chg)}">${signed(chg, dec)} (${pct(chg != null ? (chg / prev) * 100 : null)})</div></div>
      </div>
      <div class="des-grid">
        <div class="kv"><span>전일 종가</span><b>${num(prev, dec)}</b></div>
        <div class="kv"><span>당일 범위</span><b>${num(m.dayLow, dec)} – ${num(m.dayHigh, dec)}</b></div>
        <div class="kv"><span>거래량</span><b>${big(m.volume)}</b></div>
        <div class="kv"><span>시세 시각</span><b>${m.time ? new Date(m.time * 1000).toLocaleString('en-GB', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</b></div>
      </div>
      <div class="range52">
        <div class="dim">52주 범위</div>
        <div class="bar"><div class="mark" style="left:${pos ?? 0}%"></div></div>
        <div class="ends"><span>${num(lo, dec)}</span><span>${pos != null ? `고점 대비 ${pct((m.price / hi - 1) * 100)}` : ''}</span><span>${num(hi, dec)}</span></div>
      </div>
      <table class="rets"><tr>${rets.map(([k]) => `<th>${k}</th>`).join('')}</tr>
        <tr>${rets.map(([, v]) => `<td class="${cls(v)}">${pct(v)}</td>`).join('')}</tr></table>
      <div class="des-spark">${spark(bars.map((b) => b.c), 400, 60)}</div>
      <div class="links"><button data-go="${esc(c.symbol)} GP">GP 일봉</button><button data-go="${esc(c.symbol)} GP W">주봉</button><button data-go="${esc(c.symbol)} N">N 뉴스</button><button data-go="W ADD ${esc(c.symbol)}">W 관심 추가</button></div>
    </div>`;
  el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => ctx.run(b.dataset.go)));
}

// -------------------------------------------------------------------- GP
// Korean brokerage style by default: red = up, blue = down. Toggle in the chart bar.
export const COLOR_KEY = 'ot.colors';
export function getColors() {
  try {
    return localStorage.getItem(COLOR_KEY) === 'us' ? 'us' : 'kr';
  } catch {
    return 'kr';
  }
}
export function applyColors(mode = getColors()) {
  document.documentElement.dataset.colors = mode;
  try {
    localStorage.setItem(COLOR_KEY, mode);
  } catch {}
}

const MAS = [[5, '#ffd400'], [20, '#ff5fd2'], [60, '#22d3ee'], [120, '#c8c8c8']];
const INTRADAY = new Set(['5MIN', '15MIN', '60MIN']);
const VISIBLE_BARS = { '5MIN': 156, '15MIN': 130, '60MIN': 140, D: 120, W: 104, M: 120 };

function sma(bars, n) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= n) sum -= bars[i - n].c;
    if (i >= n - 1) out.push({ time: bars[i].time, value: sum / n });
  }
  return out;
}

async function gp(el, cmd, ctx) {
  const c = await api.chart(cmd.ticker, cmd.iv);
  const m = c.meta;
  const dec = decFor(m.price, m.currency);
  const intraday = INTRADAY.has(cmd.iv);
  const off = m.gmtoffset || 0; // show exchange-local time
  const bars = c.bars.map((b) => ({ ...b, time: b.t + off }));
  const prevOf = new Map(bars.map((b, i) => [b.time, i ? bars[i - 1].c : null]));

  el.innerHTML = `
    <div class="gp">
      <div class="gp-bar">
        <span class="gp-name">${esc(m.name)}</span>
        <span class="tabs">${INTERVALS.map(([k, label]) => `<button class="${k === cmd.iv ? 'on' : ''}" data-iv="${k}">${label}</button>`).join('')}</span>
        <button class="clr" title="상승·하락 색 바꾸기">${getColors() === 'kr' ? '색: 한국식' : '색: 미국식'}</button>
      </div>
      <div class="gp-legend"></div>
      <div class="gp-ma">${MAS.map(([n, col]) => `<span style="color:${col}">MA${n}</span>`).join('')}</div>
      <div class="gp-chart"></div>
    </div>`;
  el.querySelectorAll('[data-iv]').forEach((b) => b.addEventListener('click', () => ctx.run(`${cmd.ticker} GP ${b.dataset.iv}`)));
  el.querySelector('.clr').addEventListener('click', () => {
    applyColors(getColors() === 'kr' ? 'us' : 'kr');
    ctx.run(`${cmd.ticker} GP ${cmd.iv}`);
  });

  const legend = el.querySelector('.gp-legend');
  const fmtTime = (t) => {
    const d = new Date(t * 1000);
    const p = (n) => String(n).padStart(2, '0');
    const day = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
    return intraday ? `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : cmd.iv === 'M' ? day.slice(0, 7) : day;
  };
  const showBar = (b) => {
    if (!b) return;
    const prev = prevOf.get(b.time);
    const chg = prev ? (b.c / prev - 1) * 100 : null;
    const k = (v) => `<b class="${cls(v - (prev ?? v))}">${num(v, dec)}</b>`;
    legend.innerHTML = `<span class="dim">${fmtTime(b.time)}</span> 시 ${k(b.o)} 고 ${k(b.h)} 저 ${k(b.l)} 종 ${k(b.c)} <span class="${cls(chg)}">${pct(chg)}</span> <span class="dim">거래량</span> ${big(b.v)}`;
  };
  showBar(bars[bars.length - 1]);

  const LC = window.LightweightCharts;
  const box = el.querySelector('.gp-chart');
  if (!LC) {
    box.innerHTML = spark(bars.map((b) => b.c), 600, 200);
    return;
  }
  const css = getComputedStyle(document.documentElement);
  const up = css.getPropertyValue('--up').trim(), dn = css.getPropertyValue('--dn').trim();
  const chart = LC.createChart(box, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: css.getPropertyValue('--fg-dim').trim(), fontFamily: 'inherit', fontSize: 11 },
    grid: { vertLines: { color: '#161616' }, horzLines: { color: '#161616' } },
    rightPriceScale: { borderColor: '#333', scaleMargins: { top: 0.06, bottom: 0.24 } },
    timeScale: { borderColor: '#333', timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
    crosshair: { mode: 0 },
    localization: { priceFormatter: (v) => num(v, dec), timeFormatter: fmtTime },
  });
  const candles = chart.addCandlestickSeries({
    upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn,
    priceFormat: { type: 'price', precision: dec, minMove: dec ? 10 ** -dec : 1 },
  });
  candles.setData(bars.map((b) => ({ time: b.time, open: b.o, high: b.h, low: b.l, close: b.c })));
  for (const [n, color] of MAS) {
    if (bars.length < n) continue;
    const s = chart.addLineSeries({ color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    s.setData(sma(bars, n));
  }
  const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  vol.setData(bars.map((b) => ({ time: b.time, value: b.v, color: (b.c >= b.o ? up : dn) + '80' })));

  const byTime = new Map(bars.map((b) => [b.time, b]));
  chart.subscribeCrosshairMove((p) => showBar(p?.time != null ? byTime.get(p.time) : bars[bars.length - 1]));
  // Keep the user's scroll/zoom across the 60s refresh (ctx lives as long as this command).
  const n = VISIBLE_BARS[cmd.iv] || 120;
  chart.timeScale().setVisibleLogicalRange(ctx.view || { from: Math.max(0, bars.length - n), to: bars.length + 3 });
  chart.timeScale().subscribeVisibleLogicalRangeChange((r) => {
    if (r && box.clientWidth) ctx.view = r;
  });
  return { dispose: () => chart.remove() };
}

// --------------------------------------------------------------------- N
async function news(el, cmd) {
  const s = await api.search(cmd.ticker || 'stock market', 20);
  if (!s.news.length) {
    el.innerHTML = '<div class="msg">뉴스가 없습니다.</div>';
    return;
  }
  el.innerHTML = `<ol class="news">${s.news
    .map(
      (n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <div class="dim">${esc(n.publisher)} · ${ago(n.time)}${n.tickers?.length ? ' · ' + n.tickers.slice(0, 4).map(esc).join(' ') : ''}</div></li>`,
    )
    .join('')}</ol>`;
}

// -------------------------------------------------------------------- GC
const TENORS = [['^IRX', '3개월', 0.25], ['^FVX', '5년', 5], ['^TNX', '10년', 10], ['^TYX', '30년', 30]];
async function gc(el) {
  const rows = await api.quotes(TENORS.map((t) => t[0]));
  const pts = TENORS.map(([s, label, yrs], i) => ({ label, yrs, y: rows[i]?.price, prev: rows[i]?.prevClose }));
  const ys = pts.flatMap((p) => [p.y, p.prev]).filter((v) => v != null);
  const lo = Math.min(...ys) - 0.15, hi = Math.max(...ys) + 0.15;
  const W = 400, H = 150, P = 28;
  // x on a sqrt scale so the short end is readable
  const X = (yrs) => P + (Math.sqrt(yrs) / Math.sqrt(30)) * (W - 2 * P);
  const Y = (v) => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const line = (k, color, dash) =>
    `<polyline fill="none" stroke="${color}" stroke-width="2" ${dash ? 'stroke-dasharray="4 3"' : ''} points="${pts
      .filter((p) => p[k] != null)
      .map((p) => `${X(p.yrs)},${Y(p[k])}`)
      .join(' ')}"/>`;
  const inverted = pts[0].y != null && pts[2].y != null && pts[0].y > pts[2].y;
  el.innerHTML = `
    <svg class="curve" viewBox="0 0 ${W} ${H}">
      ${line('prev', '#555', true)}${line('y', 'var(--accent)')}
      ${pts.map((p) => (p.y == null ? '' : `<circle cx="${X(p.yrs)}" cy="${Y(p.y)}" r="3" fill="var(--accent)"/>
        <text x="${X(p.yrs)}" y="${Y(p.y) - 8}" text-anchor="middle">${num(p.y, 2)}</text>
        <text x="${X(p.yrs)}" y="${H - 8}" text-anchor="middle" class="ax">${p.label}</text>`)).join('')}
    </svg>
    <div class="legend"><span class="sw acc"></span>현재 <span class="sw prev"></span>전일 ${inverted ? '<span class="tag dn">장단기 역전 (3개월 > 10년)</span>' : ''}</div>
    <table class="qt"><thead><tr><th>만기</th><th class="r">금리(%)</th><th class="r">전일 대비(bp)</th></tr></thead><tbody>
    ${pts.map((p) => {
      const bp = p.y != null && p.prev != null ? (p.y - p.prev) * 100 : null;
      return `<tr><td>${p.label}</td><td class="r">${num(p.y, 3)}</td><td class="r ${cls(bp)}">${signed(bp, 1)}</td></tr>`;
    }).join('')}</tbody></table>`;
}

// ------------------------------------------------------------------ HELP
function help(el, cmd, ctx) {
  el.innerHTML = `
    <div class="help">
      <p>위 명령줄에 <b>종목 + 기능</b>을 입력하고 Enter. 결과는 선택된(주황 테두리) 패널에 열립니다.</p>
      <table class="qt">${Object.entries(FUNCS)
        .map(([k, v]) => `<tr class="row" data-go="${k === 'DES' || k === 'GP' || k === 'N' ? 'AAPL ' + k : k}"><td class="fk">${k}</td><td>${esc(v.title)}</td><td class="dim hide-s">${esc(v.help)}</td></tr>`)
        .join('')}</table>
      <h4>입력 예시</h4>
      <ul class="ex">
        <li><code>AAPL</code> 종목만 치면 개요(DES)</li>
        <li><code>NVDA GP</code> 일봉 · <code>NVDA GP 주봉</code> (또는 <code>W</code>) · <code>월봉</code> <code>60분</code> <code>15분</code> <code>5분</code></li>
        <li><code>005930 KS DES</code> 삼성전자 (KS 코스피, KQ 코스닥, JP 일본)</li>
        <li><code>AAPL US Equity GP &lt;GO&gt;</code> 블룸버그 문법도 인식</li>
        <li><code>W ADD NVDA</code> 관심 종목 추가 · <code>W DEL NVDA</code> 삭제</li>
        <li><code>LAYOUT 1</code> / <code>2</code> / <code>4</code> 화면 분할</li>
      </ul>
      <h4>단축키</h4>
      <ul class="ex">
        <li><kbd>/</kbd> 명령줄로 이동 · <kbd>Esc</kbd> 입력 지우기 · <kbd>↑</kbd><kbd>↓</kbd> 이전 명령</li>
        <li><kbd>Alt</kbd>+<kbd>1</kbd>~<kbd>4</kbd> 패널 선택 · 패널 클릭으로도 선택</li>
        <li><kbd>F1</kbd> 도움말 · <kbd>F2</kbd> WEI · <kbd>F3</kbd> FX · <kbd>F4</kbd> 관심 종목</li>
      </ul>
    </div>`;
  el.querySelectorAll('[data-go]').forEach((tr) => tr.addEventListener('click', () => ctx.run(tr.dataset.go)));
}

const RENDER = { DES: des, GP: gp, N: news, WEI: marketList, FX: marketList, CMDTY: marketList, CRYPTO: marketList, W: marketList, GC: gc, HELP: help };

/** Render cmd into el. Returns a dispose function. */
export async function render(el, cmd, ctx, { quiet = false } = {}) {
  if (!quiet) loading(el);
  try {
    const r = await RENDER[cmd.func](el, cmd, ctx);
    return r?.dispose || (() => {});
  } catch (e) {
    if (!quiet) fail(el, e);
    return () => {};
  }
}
