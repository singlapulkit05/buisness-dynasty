import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from './catalog.js';
import { initial, apply, netWorth } from './engine.js';
import { buildMarketImpactReport, buildNetWorthSeries } from './market-impact.js';

test('market impact report tracks sector modifiers and live quotes without inventing prices', () => {
  let s = initial(100000);
  s.cash = '2000000';
  s = apply(s, { type: 'buyBusiness', item: 'it', name: 'Quantum IT', id: 'b1' }, 100000);
  const firstStock = catalog.stocks.find(x => !x.legacy);
  s.holdings[firstStock.id] = 10;

  const rep = buildMarketImpactReport(s, catalog, {
    quotes: { [firstStock.id]: { price: '250', prevPrice: '200' } },
    at: 4 * 7200000 // Tech & AI Boom slot: (4*7+3)%6 === 1
  });

  assert.equal(rep.regime.id, 'tech_rally');
  assert.equal(rep.businessImpacts.length, 1);
  assert.ok(rep.businessImpacts[0].regimePct > 0);
  const row = rep.heatmap.find(h => h.id === firstStock.id);
  assert.equal(row.price, 250);
  assert.equal(row.pctChange, 25);
  assert.equal(row.heldValue, 2500);
  assert.equal(row.isLive, true);
});

test('net worth series returns honest empty state on fresh saves and plots ledger history on active accounts', () => {
  const empty = initial(100000);
  const sEmpty = buildNetWorthSeries(empty, netWorth(empty, catalog));
  assert.equal(sEmpty.ready, false);

  const active = apply(empty, { type: 'buyBusiness', item: 'shop', id: 'b1' }, 105000);
  const sActive = buildNetWorthSeries(active, netWorth(active, catalog));
  assert.equal(sActive.ready, true);
  assert.ok(sActive.points.length >= 2);
});
