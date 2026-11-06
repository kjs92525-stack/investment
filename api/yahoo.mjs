// Market data API shared by server.mjs (local) and netlify/functions/api.mjs (deploy).
// Wraps Yahoo Finance public endpoints that work without a login cookie
// (chart v8 and search v1) and returns small, normalized JSON.

const UA = 'Mozilla/5.0 (compatible; OpenTerminal/0.1)';
const YF = 'https://query1.finance.yahoo.com';

// range -> Yahoo interval
export const RANGES = {
  '1D': ['1d', '5m'],
  '5D': ['5d', '15m'],
  '1M': ['1mo', '60m'],
  '6M': ['6mo', '1d'],
  '1Y': ['1y', '1d'],
  '5Y': ['5y', '1wk'],
  MAX: ['max', '1mo'],
};

const SYMBOL_RE = /^[A-Za-z0-9^=.\-]{1,20}$/;
const cache = new Map();
const TTL_MS = 20_000;

async function getJson(url, fetchImpl) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new HttpError(res.status === 404 ? 404 : 502, `upstream ${res.status}`);
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function checkSymbol(s) {
  if (!s || !SYMBOL_RE.test(s)) throw new HttpError(400, 'bad symbol');
  return s.toUpperCase();
}

export function normalizeChart(json) {
  const r = json?.chart?.result?.[0];
  if (!r) throw new HttpError(404, json?.chart?.error?.description || 'no data');
  const m = r.meta || {};
  const q = r.indicators?.quote?.[0] || {};
  const ts = r.timestamp || [];
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null) continue;
    bars.push({
      t: ts[i],
      o: q.open?.[i] ?? c,
      h: q.high?.[i] ?? c,
      l: q.low?.[i] ?? c,
      c,
      v: q.volume?.[i] ?? 0,
    });
  }
  return {
    symbol: m.symbol,
    meta: {
      name: m.longName || m.shortName || m.symbol,
      currency: m.currency,
      exchange: m.fullExchangeName || m.exchangeName,
      type: m.instrumentType,
      price: m.regularMarketPrice,
      prevClose: m.chartPreviousClose ?? m.previousClose,
      dayHigh: m.regularMarketDayHigh,
      dayLow: m.regularMarketDayLow,
      volume: m.regularMarketVolume,
      high52: m.fiftyTwoWeekHigh,
      low52: m.fiftyTwoWeekLow,
      time: m.regularMarketTime,
      gmtoffset: m.gmtoffset || 0,
      timezone: m.exchangeTimezoneName,
    },
    bars,
  };
}

async function chart(symbol, range, fetchImpl) {
  const [r, i] = RANGES[range] || RANGES['6M'];
  const url = `${YF}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r}&interval=${i}&includePrePost=false`;
  return normalizeChart(await getJson(url, fetchImpl));
}

async function quotes(symbols, fetchImpl) {
  const out = await Promise.all(
    symbols.map(async (s) => {
      try {
        const c = await chart(s, '1D', fetchImpl);
        const { price, prevClose } = c.meta;
        const change = price != null && prevClose ? price - prevClose : null;
        return {
          symbol: s,
          name: c.meta.name,
          currency: c.meta.currency,
          price,
          prevClose,
          change,
          changePct: change != null ? (change / prevClose) * 100 : null,
          time: c.meta.time,
          spark: c.bars.map((b) => b.c),
        };
      } catch (e) {
        return { symbol: s, error: e.message };
      }
    }),
  );
  return out;
}

async function search(q, newsCount, fetchImpl) {
  const url = `${YF}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=${newsCount}&enableFuzzyQuery=false`;
  const j = await getJson(url, fetchImpl);
  return {
    quotes: (j.quotes || [])
      .filter((x) => x.symbol)
      .map((x) => ({
        symbol: x.symbol,
        name: x.longname || x.shortname || x.symbol,
        exchange: x.exchDisp || x.exchange,
        type: x.typeDisp || x.quoteType,
        sector: x.sectorDisp || x.sector || null,
        industry: x.industryDisp || x.industry || null,
      })),
    news: (j.news || []).map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      time: n.providerPublishTime,
      tickers: n.relatedTickers || [],
    })),
  };
}

function json(data, status = 200, maxAge = 15) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? `public, max-age=${maxAge}` : 'no-store',
    },
  });
}

/** Handle /api/* requests. Returns a Response. */
export async function handleApi(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const p = url.searchParams;
  try {
    switch (path) {
      case 'health':
        return json({ ok: true, source: 'yahoo' }, 200, 0);
      case 'chart': {
        const range = (p.get('range') || '6M').toUpperCase();
        if (!RANGES[range]) throw new HttpError(400, 'bad range');
        return json(await chart(checkSymbol(p.get('symbol')), range, fetchImpl));
      }
      case 'quotes': {
        const list = (p.get('symbols') || '').split(',').filter(Boolean).slice(0, 30).map(checkSymbol);
        if (!list.length) throw new HttpError(400, 'no symbols');
        return json(await quotes(list, fetchImpl));
      }
      case 'search': {
        const q = (p.get('q') || '').trim().slice(0, 40);
        if (!q) throw new HttpError(400, 'no query');
        const n = Math.min(Number(p.get('news') || 0) || 0, 30);
        return json(await search(q, n, fetchImpl), 200, 60);
      }
      default:
        throw new HttpError(404, 'not found');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502;
    return json({ error: e.message }, status);
  }
}
