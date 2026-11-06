import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleApi } from '../api/yahoo.mjs';

const chartJson = (symbol, price = 101) => ({
  chart: {
    result: [{
      meta: { symbol, longName: `${symbol} Inc`, currency: 'USD', regularMarketPrice: price, chartPreviousClose: 100, fiftyTwoWeekHigh: 120, fiftyTwoWeekLow: 80, gmtoffset: -18000 },
      timestamp: [1, 2, 3],
      indicators: { quote: [{ open: [99, 100, null], high: [101, 102, null], low: [98, 99, null], close: [100, 101, null], volume: [10, 20, null] }] },
    }],
  },
});

function mockFetch(calls) {
  return async (url) => {
    calls.push(url);
    const u = new URL(url);
    if (u.pathname.startsWith('/v8/finance/chart/')) {
      const sym = decodeURIComponent(u.pathname.split('/').pop());
      if (sym === 'BAD') return new Response('{}', { status: 404 });
      return Response.json(chartJson(sym));
    }
    if (u.pathname === '/v1/finance/search') {
      return Response.json({
        quotes: [{ symbol: 'AAPL', longname: 'Apple Inc.', exchDisp: 'NASDAQ', typeDisp: 'Equity', sectorDisp: 'Technology' }],
        news: [{ title: 'Hello', publisher: 'X', link: 'https://x', providerPublishTime: 5, relatedTickers: ['AAPL'] }],
      });
    }
    return new Response('nope', { status: 500 });
  };
}

const call = async (path, calls = []) => {
  const r = await handleApi(new Request('http://t' + path), mockFetch(calls));
  return { status: r.status, body: await r.json(), calls };
};

test('health', async () => {
  assert.deepEqual((await call('/api/health')).body.ok, true);
});

test('chart normalizes and drops null bars', async () => {
  const { status, body, calls } = await call('/api/chart?symbol=aapl&range=1y');
  assert.equal(status, 200);
  assert.equal(body.symbol, 'AAPL');
  assert.equal(body.bars.length, 2);
  assert.equal(body.meta.price, 101);
  assert.match(calls[0], /range=1y&interval=1d/);
});

test('quotes compute change and keep per-symbol errors', async () => {
  const { body } = await call('/api/quotes?symbols=MSFT,BAD');
  assert.equal(body[0].change, 1);
  assert.equal(body[0].changePct, 1);
  assert.ok(body[1].error);
});

test('search maps quotes and news', async () => {
  const { body } = await call('/api/search?q=apple&news=5');
  assert.equal(body.quotes[0].sector, 'Technology');
  assert.equal(body.news[0].title, 'Hello');
});

test('input validation', async () => {
  assert.equal((await call('/api/chart?symbol=a/b')).status, 400);
  assert.equal((await call('/api/chart?symbol=AAPL&range=2W')).status, 400);
  assert.equal((await call('/api/quotes')).status, 400);
  assert.equal((await call('/api/nope')).status, 404);
});
