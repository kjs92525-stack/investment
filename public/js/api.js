// Data access. Uses /api/* when the server is up; otherwise DEMO data
// (random walk, clearly labeled) so the UI still works as a static page.

export const state = { mode: 'connecting' }; // 'live' | 'demo'

export async function init() {
  try {
    const r = await fetch('api/health', { cache: 'no-store' });
    state.mode = r.ok && (await r.json()).ok ? 'live' : 'demo';
  } catch {
    state.mode = 'demo';
  }
  return state.mode;
}

async function get(path) {
  const r = await fetch(path);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
}

export const chart = async (symbol, range) =>
  state.mode === 'live' ? get(`api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}`) : demoChart(symbol, range);

export const quotes = async (symbols) =>
  state.mode === 'live' ? get(`api/quotes?symbols=${symbols.map(encodeURIComponent).join(',')}`) : symbols.map(demoQuote);

export const search = async (q, news = 0) =>
  state.mode === 'live' ? get(`api/search?q=${encodeURIComponent(q)}&news=${news}`) : demoSearch(q, news);

// ---------------------------------------------------------------- DEMO data
const BASE = {
  AAPL: 230, MSFT: 420, NVDA: 140, TSLA: 250, AMZN: 190, GOOGL: 170, META: 560,
  '^GSPC': 5800, '^DJI': 42000, '^IXIC': 18500, '^RUT': 2200, '^VIX': 16, '^FTSE': 8200, '^GDAXI': 19000,
  '^FCHI': 7400, '^N225': 39000, '^HSI': 20000, '000001.SS': 3300, '^KS11': 2600, '^KQ11': 750,
  'KRW=X': 1380, 'EURUSD=X': 1.08, 'JPY=X': 150, 'GBPUSD=X': 1.29, 'CNY=X': 7.1, 'DX-Y.NYB': 104,
  'CL=F': 72, 'BZ=F': 76, 'GC=F': 2700, 'SI=F': 32, 'HG=F': 4.3, 'NG=F': 2.7,
  'BTC-USD': 70000, 'ETH-USD': 2600, 'SOL-USD': 170, 'XRP-USD': 0.55,
  '^IRX': 4.5, '^FVX': 4.1, '^TNX': 4.3, '^TYX': 4.5, '005930.KS': 58000,
};

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const hash = (str) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function walk(symbol, seed, n, stepSec, end) {
  const r = rng(hash(symbol + seed));
  const base = BASE[symbol] ?? 20 + (hash(symbol) % 300);
  // daily vol, scaled to the bar size
  const vol = (symbol.startsWith('^') ? 0.008 : 0.018) * Math.sqrt(Math.min(stepSec, 604800) / 86400);
  let p = base * (0.85 + r() * 0.1);
  const bars = [];
  for (let i = n - 1; i >= 0; i--) {
    const o = p;
    p = Math.max(base * 0.2, p * (1 + (r() - 0.48) * vol * 2));
    const h = Math.max(o, p) * (1 + r() * vol * 0.6);
    const l = Math.min(o, p) * (1 - r() * vol * 0.6);
    bars.push({ t: end - i * stepSec, o, h, l, c: p, v: Math.round(1e6 * (0.5 + r())) });
  }
  // Pin the last close near the base price so screens look sane.
  const k = base / bars[bars.length - 1].c;
  for (const b of bars) for (const f of ['o', 'h', 'l', 'c']) b[f] *= k;
  return bars;
}

const STEP = { '1D': [78, 300], '5D': [130, 900], '1M': [150, 3600], '6M': [182, 86400], '1Y': [365, 86400], '5Y': [260, 604800], MAX: [240, 2592000] };

export function demoChart(symbol, range = '6M') {
  const [n, step] = STEP[range] || STEP['6M'];
  const now = Math.floor(Date.now() / 1000 / step) * step;
  const bars = walk(symbol, range, n, step, now);
  const year = walk(symbol, '1Y', 365, 86400, now);
  const last = bars[bars.length - 1];
  const prev = range === '1D' ? bars[0].o : bars[bars.length - 2].c;
  return {
    symbol,
    demo: true,
    meta: {
      name: `${symbol} (DEMO)`,
      currency: symbol.endsWith('.KS') || symbol.endsWith('.KQ') ? 'KRW' : 'USD',
      exchange: 'DEMO',
      type: symbol.startsWith('^') ? 'INDEX' : 'EQUITY',
      price: last.c,
      prevClose: prev,
      dayHigh: last.h,
      dayLow: last.l,
      volume: last.v * 20,
      high52: Math.max(...year.map((b) => b.h)),
      low52: Math.min(...year.map((b) => b.l)),
      time: now,
      gmtoffset: -14400,
      timezone: 'America/New_York',
    },
    bars,
  };
}

function demoQuote(symbol) {
  const c = demoChart(symbol, '1D');
  const { price, prevClose } = c.meta;
  return {
    symbol, name: c.meta.name, currency: c.meta.currency, price, prevClose,
    change: price - prevClose, changePct: ((price - prevClose) / prevClose) * 100,
    time: c.meta.time, spark: c.bars.map((b) => b.c), demo: true,
  };
}

function demoSearch(q, news) {
  const s = q.toUpperCase();
  const known = Object.keys(BASE).filter((k) => !k.startsWith('^') && !k.includes('=') && k.startsWith(s));
  const quotes = (known.length ? known : [s]).slice(0, 6).map((k) => ({
    symbol: k, name: `${k} (DEMO)`, exchange: 'DEMO', type: 'Equity', sector: null, industry: null,
  }));
  const now = Math.floor(Date.now() / 1000);
  const items = news
    ? Array.from({ length: Math.min(news, 8) }, (_, i) => ({
        title: `[DEMO] ${s} 관련 예시 뉴스 제목 ${i + 1} — 서버를 켜면 실제 뉴스가 표시됩니다`,
        publisher: 'DEMO', link: '#', time: now - i * 3600, tickers: [s],
      }))
    : [];
  return { quotes, news: items, demo: true };
}
