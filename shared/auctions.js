import Decimal from 'decimal.js';

export const AUCTION_CONFIG = {
  FEE_RATE: 0.02, // 2% on successful sale only
  MAX_ACTIVE_PER_SELLER: 5,
  ANTI_SNIPE_WINDOW_MS: 30000, // 30s
  ANTI_SNIPE_MAX_EXTEND_MS: 300000, // 5m max extension
  DURATIONS: [
    { label: '15 min', ms: 15 * 60000 },
    { label: '30 min', ms: 30 * 60000 },
    { label: '1 hour', ms: 60 * 60000 },
    { label: '3 hours', ms: 3 * 60 * 60000 },
    { label: '6 hours', ms: 6 * 60 * 60000 },
    { label: '12 hours', ms: 12 * 60 * 60000 },
    { label: '24 hours', ms: 24 * 60 * 60000 },
    { label: '48 hours', ms: 48 * 60 * 60000 }
  ]
};

export function storageKeyForAsset(item) {
  return { cars: 'garage', aircraft: 'hangar', yachts: 'marina' }[item?.category] || null;
}

export function minNextBid(auction) {
  if (!auction) return '0';
  if (!auction.highestBidId || !auction.highestBidAmount) {
    return new Decimal(auction.startingBid).toDecimalPlaces(2).toString();
  }
  const cur = new Decimal(auction.highestBidAmount);
  const inc = Decimal.max(1, cur.times('0.01').toDecimalPlaces(2));
  let next = cur.plus(inc);
  if (auction.cataloguePrice) {
    const cap = new Decimal(auction.cataloguePrice);
    if (next.gt(cap)) next = cap;
  }
  return next.toDecimalPlaces(2).toString();
}

export function validateListingInput(raw = {}, catalog) {
  const catalogueId = String(raw.catalogueId || '').trim();
  const item = catalog?.assets?.find(x => x.id === catalogueId);
  if (!item) throw Error('Eligible luxury asset not found');

  const maxPrice = new Decimal(item.price);
  const startingBid = new Decimal(raw.startingBid || 0);
  if (!startingBid.isFinite() || startingBid.lt(1) || startingBid.gt(maxPrice)) {
    throw Error(`Starting bid must be between $1 and new asset price ($${maxPrice.toString()})`);
  }

  let reservePrice = null;
  if (raw.reservePrice !== undefined && raw.reservePrice !== null && raw.reservePrice !== '') {
    const res = new Decimal(raw.reservePrice);
    if (!res.isFinite() || res.lt(startingBid) || res.gt(maxPrice)) {
      throw Error(`Reserve price must be between starting bid and $${maxPrice.toString()}`);
    }
    reservePrice = res.toDecimalPlaces(2).toString();
  }

  const durationMs = Number(raw.durationMs);
  const validDur = AUCTION_CONFIG.DURATIONS.some(d => d.ms === durationMs);
  if (!validDur) throw Error('Select a valid auction duration');

  return {
    item,
    catalogueId,
    cataloguePrice: maxPrice.toDecimalPlaces(2).toString(),
    startingBid: startingBid.toDecimalPlaces(2).toString(),
    reservePrice,
    durationMs
  };
}
