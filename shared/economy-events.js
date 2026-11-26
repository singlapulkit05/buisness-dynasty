// Deterministic, versioned 2-hour economic event cycles for offline/online parity.

const PERIOD_MS = 7200000; // 2 hours

export const ECONOMY_REGIMES = [
  {
    id: 'steady',
    title: 'Balanced Market',
    summary: 'Stable consumer demand and normal credit conditions across all sectors.',
    mods: { demand: 1.0, revenue: 1.0, oil: 1.0, fleetExp: 1.0, it: 1.0, property: 1.0, construction: 1.0 }
  },
  {
    id: 'tech_rally',
    title: 'Tech & AI Boom',
    summary: 'Enterprise software and aerospace demand surges (+22% IT & Space revenue).',
    mods: { demand: 1.05, revenue: 1.04, oil: 1.0, fleetExp: 1.0, it: 1.22, property: 1.05, construction: 1.05 }
  },
  {
    id: 'oil_shock',
    title: 'Energy & Oil Surge',
    summary: 'Crude prices spike (+28% Oil revenue), increasing Fleet & Shipping fuel expenses (+18%).',
    mods: { demand: 0.96, revenue: 1.0, oil: 1.28, fleetExp: 1.18, it: 1.0, property: 1.0, construction: 1.04 }
  },
  {
    id: 'housing_boom',
    title: 'Real Estate Boom',
    summary: 'High urban occupancy boosts Real Estate rent (+18%) and Construction demand (+20%).',
    mods: { demand: 1.08, revenue: 1.04, oil: 1.0, fleetExp: 1.0, it: 1.0, property: 1.18, construction: 1.20 }
  },
  {
    id: 'recession',
    title: 'Credit Crunch & Slowdown',
    summary: 'Tighter spending reduces retail & transport demand (-14%), testing profit margins.',
    mods: { demand: 0.86, revenue: 0.92, oil: 0.94, fleetExp: 1.05, it: 0.95, property: 0.92, construction: 0.88 }
  },
  {
    id: 'boom',
    title: 'Global Economic Expansion',
    summary: 'Strong consumer confidence lifts business revenue (+12%) and demand across sectors.',
    mods: { demand: 1.14, revenue: 1.12, oil: 1.08, fleetExp: 1.0, it: 1.10, property: 1.08, construction: 1.10 }
  }
];

export function currentEconomyEvent(t = Date.now()) {
  const slot = Math.floor(t / PERIOD_MS);
  const idx = ((slot * 7 + 3) % ECONOMY_REGIMES.length + ECONOMY_REGIMES.length) % ECONOMY_REGIMES.length;
  const regime = ECONOMY_REGIMES[idx];
  return {
    ...regime,
    start: slot * PERIOD_MS,
    end: (slot + 1) * PERIOD_MS
  };
}

export function recentEconomyEvents(t = Date.now(), count = 4) {
  const slot = Math.floor(t / PERIOD_MS);
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = slot - i;
    if (s < 0) break;
    out.push(currentEconomyEvent(s * PERIOD_MS));
  }
  return out;
}
