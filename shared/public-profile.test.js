import test from 'node:test';
import assert from 'node:assert/strict';
import { initial, apply } from './engine.js';
import { catalog } from './catalog.js';
import {
  normalizePrivacy,
  normalizeIdentity,
  buildPublicProfileSummary,
  compareProfiles,
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
    identity: { displayName: 'Imperial Vaults', bio: 'Long-term builder', preferredIndustry: 'Finance' },
    state: s,
    privacy: normalizePrivacy({ showFinancials: false, hiddenCategories: ['paintings'] })
  };

  const summary = buildPublicProfileSummary(u, { rankPos: 2, followerCount: 4, isFollowing: true, isRival: true });
  assert.equal(summary.username, 'empire_user');
  assert.equal(summary.identity.displayName, 'Imperial Vaults');
  assert.equal(summary.social.followerCount, 4);
  assert.equal(summary.social.isFollowing, true);
  assert.equal(summary.overview.netWorth, null);
  assert.equal(summary.overview.businessesCount, 1);
  assert.equal(summary.passwordHash, undefined);

  const viewer = buildPublicProfileSummary({ username: 'viewer_one', state: initial(0), privacy: normalizePrivacy() });
  const cmp = compareProfiles(viewer, summary);
  const nwRow = cmp.rows.find(r => r.label === 'Net Worth');
  assert.equal(nwRow.target, null); // Private stays null, never 0!

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
