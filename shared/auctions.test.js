import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from './catalog.js';
import { minNextBid, validateListingInput, storageKeyForAsset } from './auctions.js';
import { initial, apply } from './engine.js';

test('auction listing validation and minimum next bid increments', () => {
  const firstCar = catalog.assets.find(x => x.category === 'cars');
  const res = validateListingInput({
    catalogueId: firstCar.id,
    startingBid: 50000,
    reservePrice: 60000,
    durationMs: 3600000
  }, catalog);
  assert.equal(res.startingBid, '50000');
  assert.equal(res.reservePrice, '60000');
  assert.equal(storageKeyForAsset(firstCar), 'garage');

  assert.throws(() => validateListingInput({
    catalogueId: firstCar.id,
    startingBid: 50000,
    reservePrice: 40000,
    durationMs: 3600000
  }, catalog));

  assert.equal(minNextBid({ startingBid: '50000', highestBidId: null }), '50000');
  assert.equal(minNextBid({ startingBid: '50000', highestBidId: 'b1', highestBidAmount: '50000' }), '50500');
});

test('lockedAssets prevents instant-sell while asset is listed in an auction', () => {
  const firstCar = catalog.assets.find(x => x.category === 'cars');
  let s = initial(0);
  s.cash = '1000000';
  s = apply(s, { type: 'trade', category: 'assets', item: firstCar.id, qty: 1, id: 'a1' }, 0);
  s.lockedAssets = [firstCar.id];
  assert.throws(() => apply(s, { type: 'trade', category: 'assets', item: firstCar.id, qty: 1, sell: true, id: 'a2' }, 0));
});
