import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { currentEconomyEvent } from './economy-events.js';

export const MARKET_CONFIG = {
  STOCK_TICK_MS: 10000, // 10 seconds
  CRYPTO_TICK_MS: 5000, // 5 seconds
  MAX_CANDLES: 120
};

export function stepMarketPrice({
  prevPrice,
  anchorPrice,
  category,
  symbol,
  tickId,
  secretKey,
  t
}) {
  const isCrypto = category === 'crypto';
  const volPerTick = isCrypto ? 0.008 : 0.003;
  const meanRev = isCrypto ? 0.012 : 0.018;

  // Deterministic server-keyed pseudo-normal shock in [-2.2, 2.2]
  const digest = crypto
    .createHmac('sha256', String(secretKey || 'dev-market-key'))
    .update(`${symbol}:${tickId}`)
    .digest();
  const u1 = digest.readUInt32BE(0) / 0xffffffff;
  const u2 = digest.readUInt32BE(4) / 0xffffffff;
  const z = Math.max(-2.2, Math.min(2.2, (u1 - u2) * 2.6));

  const ev = currentEconomyEvent(t);
  const regimeBias = (ev.mods.revenue - 1) * 0.002;

  const anchor = Math.max(0.00001, Number(anchorPrice));
  const prev = Math.max(0.00001, Number(prevPrice || anchor));
  const rawLogRet =
    volPerTick * z +
    meanRev * (Math.log(anchor) - Math.log(prev)) +
    regimeBias;

  const clampedLogRet = Math.max(-0.05, Math.min(0.05, rawLogRet));
  const minFloor = Math.max(0.00001, anchor * 0.15);
  const maxCeil = anchor * 4.5;
  const next = Math.max(minFloor, Math.min(maxCeil, prev * Math.exp(clampedLogRet)));

  const decimals = next < 0.01 ? 6 : next < 1 ? 4 : 2;
  return new Decimal(next).toDecimalPlaces(decimals).toString();
}

export function updateCandles(candles = [], priceStr, t, bucketMs = 60000) {
  const p = Number(priceStr);
  const bucket = Math.floor(t / bucketMs) * bucketMs;
  const out = [...candles];
  const last = out[out.length - 1];
  if (last && last.t === bucket) {
    last.h = Math.max(last.h, p);
    last.l = Math.min(last.l, p);
    last.c = p;
  } else {
    out.push({ t: bucket, o: p, h: p, l: p, c: p });
  }
  return out.slice(-MARKET_CONFIG.MAX_CANDLES);
}
