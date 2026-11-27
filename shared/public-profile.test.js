import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, apply } from './engine.js';
import { catalog } from './catalog.js';
import {
  normalizePrivacy,
  buildPublicProfileSummary,
  projectPublicBusinesses,
  projectPublicBusinessDetail,
  projectPublicAssets,
  projectPublicInvestments
} from './public-profile.js';

test('public profile projections enforce privacy and exclude private fields', () => {
  let s = initial(0);
  s.cash = '5000000';
  s = apply(s, { type: 'buyBusiness', item: 'bank', name: 'Vault One', id: 'b1' }, 0);
  s = apply(s, { type: 'trade', category: 'stocks', item: 'gt', qty: 7000, id: 's1' }, 0);
  const firstCar = catalog.assets.find(x => x.category === 'cars');
  s = apply(s, { type: 'trade', category: 'assets', item: firstCar.id, qty: 1, id: 'a1' }, 0);

  const u = {
    username: 'empire_user',
    passwordHash: 'secret-hash',
    state: s,
    privacy: normalizePrivacy({ showFinancials: false, hiddenCategories: ['paintings'] })
  };

  const summary = buildPublicProfileSummary(u, { rankPos: 2 });
  assert.equal(summary.username, 'empire_user');
  assert.equal(summary.overview.netWorth, null);
  assert.equal(summary.overview.businessesCount, 1);
  assert.equal(summary.passwordHash, undefined);

  const bizDetail = projectPublicBusinessDetail(u, 'b1');
  assert.equal(bizDetail.upgrades.length, 3);
  assert.equal(bizDetail.financials, null);

  const assets = projectPublicAssets(u, { category: 'cars' });
  assert.equal(assets.items.length, 1);
  assert.equal(assets.items[0].id, firstCar.id);

  const inv = projectPublicInvestments(u, {});
  assert.equal(inv.stocks[0].stakePct >= 10, true);
  assert.equal(inv.stocks[0].qty, null);
  assert.equal(inv.stocks[0].costBasis, undefined);
});
