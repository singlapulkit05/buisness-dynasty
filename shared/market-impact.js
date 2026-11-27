import Decimal from 'decimal.js';
import { currentEconomyEvent, recentEconomyEvents } from './economy-events.js';
import { sectorCompetition } from './engagement.js';
import { price, businessRate, propertyMetrics } from './engine.js';

export function sectorTagForMarket(item, category) {
  if (category === 'crypto') return 'Digital Assets';
  const id = String(item?.id || '').toLowerCase();
  const n = String(item?.name || '').toLowerCase();
  if (/apple|microsoft|alphabet|nvidia|meta|amd|intel|oracle|ibm|adobe|tsmc|samsung/.test(id + n)) return 'Tech & AI';
  if (/exxon|chevron|shell|bp|energy/.test(id + n)) return 'Energy & Oil';
  if (/jpmorgan|goldman|visa|mastercard|berkshire|bank/.test(id + n)) return 'Banking & Finance';
  if (/boeing|lockheed|tesla|toyota|ford|airbus/.test(id + n)) return 'Transport & Aero';
  return 'Consumer & Enterprise';
}

export function buildMarketImpactReport(s, catalog, { quotes = null, at = s.at } = {}) {
  const regime = currentEconomyEvent(at);
  const history = recentEconomyEvents(at, 4);

  const businessImpacts = (s.businesses || []).map(b => {
    const x = catalog.businesses.find(k => k.id === b.type);
    const comp = sectorCompetition(b.type, at);
    let regimeFactor = regime.mods.revenue * regime.mods.demand;
    const notes = [];
    if (b.type === 'oil') {
      regimeFactor *= regime.mods.oil;
      if (regime.mods.oil !== 1) notes.push(`Oil price modifier ${(regime.mods.oil * 100 - 100).toFixed(0)}%`);
    }
    if (['it', 'tech_conglomerate', 'space', 'aerospace_titan'].includes(b.type)) {
      regimeFactor *= regime.mods.it;
      if (regime.mods.it !== 1) notes.push(`IT & Aerospace modifier ${(regime.mods.it * 100 - 100).toFixed(0)}%`);
    }
    if (b.type === 'construction') {
      regimeFactor *= regime.mods.construction;
      if (regime.mods.construction !== 1) notes.push(`Construction demand ${(regime.mods.construction * 100 - 100).toFixed(0)}%`);
    }
    if (['taxi', 'transport', 'shipping', 'logistics_empire'].includes(b.type) && regime.mods.fleetExp !== 1) {
      notes.push(`Fleet & Fuel overhead ${(regime.mods.fleetExp * 100 - 100).toFixed(0)}%`);
    }
    return {
      id: b.id,
      name: b.name || x?.name || b.type,
      type: b.type,
      rate: businessRate(s, b, at, catalog),
      rivalName: comp.rivalName,
      rivalShare: comp.rivalShare,
      demandMult: comp.demandMult,
      regimePct: Number(((regimeFactor - 1) * 100).toFixed(1)),
      notes
    };
  });

  let propRentTotal = new Decimal(0);
  for (const p of catalog.properties || []) {
    const qty = s.properties?.[p.id] || 0;
    if (qty > 0) {
      propRentTotal = propRentTotal.plus(propertyMetrics(p, qty, s.propState?.[p.id], at).netIncome);
    }
  }

  const heatmap = [];
  for (const [category, list] of [['stocks', catalog.stocks], ['crypto', catalog.crypto]]) {
    for (const item of list) {
      const held = s.holdings?.[item.id] || 0;
      if (item.legacy && held <= 0) continue;
      const q = quotes?.[item.id];
      const cur = Number(q?.price ?? price(item, at));
      const prev = Number(q?.prevPrice ?? price(item, at - 3600000));
      const pct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
      const val = cur * held;
      const cost = Number(s.costBasis?.[item.id] || 0);
      heatmap.push({
        id: item.id,
        name: item.name,
        category,
        sector: sectorTagForMarket(item, category),
        price: cur,
        prevPrice: prev,
        pctChange: Number(pct.toFixed(2)),
        held,
        heldValue: Number(val.toFixed(2)),
        unrealizedPnl: held > 0 && cost > 0 ? Number((val - cost).toFixed(2)) : null,
        dividend: item.dividend || 0,
        isLive: Boolean(q)
      });
    }
  }

  return {
    regime,
    recentRegimes: history,
    businessImpacts,
    propertySummary: {
      rentPct: Number(((regime.mods.property - 1) * 100).toFixed(1)),
      totalHourlyRent: propRentTotal.toDecimalPlaces(2).toString()
    },
    heatmap
  };
}

export function buildNetWorthSeries(s, currentNetWorth) {
  const nw = Number(currentNetWorth || 0);
  const ledger = [...(s.ledger || [])].reverse();
  if (ledger.length === 0) {
    return { ready: false, points: [] };
  }
  const latestCash = ledger.at(-1) ? Number(ledger.at(-1).newCash || s.cash || 0) : Number(s.cash || 0);
  const nonCashAssets = nw - latestCash;
  const points = ledger.slice(-24).map(entry => ({
    at: entry.at,
    cash: Number(entry.newCash || 0),
    estNetWorth: Math.max(0, Number(entry.newCash || 0) + nonCashAssets)
  }));
  points.push({ at: s.at || Date.now(), cash: Number(s.cash || 0), estNetWorth: nw });
  return { ready: points.length >= 2, points };
}
