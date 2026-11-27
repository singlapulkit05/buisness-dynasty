import Decimal from 'decimal.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from './catalog.js';
import { minNextBid, validateListingInput, storageKeyForAsset } from './auctions.js';
import { initial, apply } from './engine.js';

test('auction listing validation enforces $1 to new asset price cap and minimum next bid increments', () => {
  const firstCar = catalog.assets.find(x => x.category === 'cars');
  const res = validateListingInput({
    catalogueId: firstCar.id,
    startingBid: 10,
    reservePrice: firstCar.price,
    durationMs: 3600000
  }, catalog);
  assert.equal(res.startingBid, '10');
  assert.equal(res.reservePrice, String(firstCar.price));
  assert.equal(storageKeyForAsset(firstCar), 'garage');

  // Cannot list above new asset price
  assert.throws(() => validateListingInput({
    catalogueId: firstCar.id,
    startingBid: firstCar.price + 1,
    durationMs: 3600000
  }, catalog));
  assert.throws(() => validateListingInput({
    catalogueId: firstCar.id,
    startingBid: 100,
    reservePrice: firstCar.price + 1,
    durationMs: 3600000
  }, catalog));

  // Reserve below starting bid rejected
  assert.throws(() => validateListingInput({
    catalogueId: firstCar.id,
    startingBid: 500,
    reservePrice: 400,
    durationMs: 3600000
  }, catalog));

  assert.equal(minNextBid({ startingBid: '500', cataloguePrice: '1000', highestBidId: null }), '500');
  assert.equal(minNextBid({ startingBid: '500', cataloguePrice: '1000', highestBidId: 'b1', highestBidAmount: '995' }), '1000');
  // Supports document-like wrappers (e.g., Mongoose documents with .toObject())
  const docLike = { toObject: () => ({ startingBid: '500', cataloguePrice: '2000', highestBidId: 'b2', highestBidAmount: '700' }) };
  assert.equal(minNextBid(docLike), '707');
});

test('instant selling an asset refunds 50% and lockedAssets blocks instant-sell', () => {
  const firstCar = catalog.assets.find(x => x.category === 'cars');
  let s = initial(0);
  s.cash = '1000000';
  s = apply(s, { type: 'trade', category: 'assets', item: firstCar.id, qty: 1, id: 'a1' }, 0);
  const afterBuy = s.cash;
  const sold = apply(s, { type: 'trade', category: 'assets', item: firstCar.id, qty: 1, sell: true, id: 'a2' }, 0);
  const expectedPayout = new Decimal(firstCar.price).times('0.5');
  assert.equal(new Decimal(sold.cash).minus(afterBuy).toString(), expectedPayout.toString());

  s.lockedAssets = [firstCar.id];
  assert.throws(() => apply(s, { type: 'trade', category: 'assets', item: firstCar.id, qty: 1, sell: true, id: 'a3' }, 0));
});
