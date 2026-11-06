import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../public/js/commands.js';

const ok = (input, expected) => {
  const r = parseCommand(input);
  assert.equal(r.ok, true, `${input}: ${r.error}`);
  for (const [k, v] of Object.entries(expected)) assert.equal(r[k], v, `${input} → ${k}`);
};
const bad = (input) => assert.equal(parseCommand(input).ok, false, input);

test('ticker + function', () => {
  ok('aapl des', { func: 'DES', ticker: 'AAPL' });
  ok('AAPL GP', { func: 'GP', ticker: 'AAPL', iv: 'D' });
  ok('GP AAPL 주봉', { func: 'GP', ticker: 'AAPL', iv: 'W' });
  ok('NVDA GP W', { func: 'GP', ticker: 'NVDA', iv: 'W' });
  ok('NVDA 월봉', { func: 'GP', ticker: 'NVDA', iv: 'M' });
  ok('NVDA GP 5분', { iv: '5MIN' });
  ok('NVDA GP 1H', { iv: '60MIN' });
  ok('NVDA GP 1Y', { iv: 'D' }); // old period words still work
  ok('D GP', { func: 'GP', ticker: 'D', iv: 'D' }); // Dominion Energy
});

test('bare ticker opens DES', () => {
  ok('msft', { func: 'DES', ticker: 'MSFT' });
  ok('BTC-USD', { func: 'DES', ticker: 'BTC-USD' });
});

test('Bloomberg syntax and exchange codes', () => {
  ok('AAPL US Equity GP <GO>', { func: 'GP', ticker: 'AAPL' });
  ok('005930 KS DES', { func: 'DES', ticker: '005930.KS' });
  ok('247540 KQ GP 주봉', { func: 'GP', ticker: '247540.KQ', iv: 'W' });
  ok('005930', { func: 'DES', ticker: '005930.KS' });
  ok('7203 JP GP', { ticker: '7203.T' });
});

test('functions that look like tickers', () => {
  ok('W', { func: 'W', ticker: null });
  ok('W DES', { func: 'DES', ticker: 'W' });
  ok('W ADD nvda', { func: 'W', ticker: 'NVDA', action: 'ADD' });
  ok('w del NVDA', { func: 'W', action: 'DEL' });
});

test('market screens and aliases', () => {
  for (const f of ['WEI', 'FX', 'CMDTY', 'CRYPTO', 'GC', 'HELP']) ok(f, { func: f, ticker: null });
  ok('N', { func: 'N', ticker: null });
  ok('TSLA N', { func: 'N', ticker: 'TSLA' });
  ok('AAPL Q', { func: 'DES' });
  ok('?', { func: 'HELP' });
});

test('errors', () => {
  bad('');
  bad('GP');
  bad('AAPL WEI');
  bad('AAPL MSFT DES');
  bad('W ADD');
  bad('W NVDA');
  bad('AAPL DES 1Y');
  bad('AAPL DES 주봉');
  bad('A$B DES');
});
