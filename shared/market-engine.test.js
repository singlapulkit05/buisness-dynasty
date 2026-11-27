import test from 'node:test';
import assert from 'node:assert/strict';
import { stepMarketPrice, updateCandles } from './market-engine.js';

test('stepMarketPrice is deterministic for same secret/symbol/tick and differs across ticks', () => {
  const p1 = stepMarketPrice({
    prevPrice: 150,
    anchorPrice: 150,
    category: 'stocks',
    symbol: 'gt',
    tickId: 1001,
    secretKey: 'test-secret-key',
    t: 10010000
  });
  const p1Repeat = stepMarketPrice({
    prevPrice: 150,
    anchorPrice: 150,
    category: 'stocks',
    symbol: 'gt',
    tickId: 1001,
    secretKey: 'test-secret-key',
    t: 10010000
  });
  const p2 = stepMarketPrice({
    prevPrice: p1,
    anchorPrice: 150,
    category: 'stocks',
    symbol: 'gt',
    tickId: 1002,
    secretKey: 'test-secret-key',
    t: 10020000
  });
  assert.equal(p1, p1Repeat);
  assert.ok(Number(p1) > 0 && Number(p2) > 0);
  assert.notEqual(p1, p2);
});

test('updateCandles preserves OHLC relationships without duplicating current bucket', () => {
  let c = updateCandles([], '100', 60000, 60000);
  c = updateCandles(c, '105', 70000, 60000);
  c = updateCandles(c, '98', 80000, 60000);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0], { t: 60000, o: 100, h: 105, l: 98, c: 98 });
  c = updateCandles(c, '102', 120000, 60000);
  assert.equal(c.length, 2);
});
