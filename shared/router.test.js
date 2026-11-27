import test from 'node:test';
import assert from 'node:assert/strict';

// Pure route parsing check (no React DOM required)
import { parseRoute } from '../client/src/router.js';

test('parseRoute resolves all Phase 2 routes and unknown fallback', () => {
  assert.equal(parseRoute('/').name, 'dashboard');
  assert.equal(parseRoute('/dashboard').name, 'dashboard');
  assert.equal(parseRoute('/businesses').name, 'businesses');
  assert.equal(parseRoute('/businesses/b-123').params.businessId, 'b-123');
  assert.equal(parseRoute('/markets').name, 'markets');
  assert.deepEqual(parseRoute('/markets/stocks/gt').params, { category: 'stocks', symbol: 'gt' });
  assert.deepEqual(parseRoute('/markets/crypto/btc').params, { category: 'crypto', symbol: 'btc' });
  assert.equal(parseRoute('/properties').name, 'properties');
  assert.equal(parseRoute('/assets').name, 'assets');
  assert.equal(parseRoute('/garage').name, 'garage');
  assert.equal(parseRoute('/garage/yachts').params.category, 'yachts');
  assert.equal(parseRoute('/auctions').name, 'auctions');
  assert.equal(parseRoute('/auctions/mine').name, 'auctions_mine');
  assert.equal(parseRoute('/auctions/auc-123').params.auctionId, 'auc-123');
  assert.equal(parseRoute('/finance').name, 'finance');
  assert.equal(parseRoute('/empire').name, 'empire');
  assert.equal(parseRoute('/map').name, 'map');
  assert.equal(parseRoute('/leaderboard').name, 'leaderboard');
  assert.equal(parseRoute('/players/alice_99').params.username, 'alice_99');
  assert.deepEqual(parseRoute('/players/alice_99/showcase/paintings').params, { username: 'alice_99', showcaseCategory: 'paintings', verifiedShowcase: true });
  assert.equal(parseRoute('/profile').name, 'profile');
  assert.equal(parseRoute('/feedback').name, 'feedback');
  assert.equal(parseRoute('/admin/feedback').name, 'admin_feedback');
  assert.equal(parseRoute('/unknown/xyz').name, 'not_found');
});
