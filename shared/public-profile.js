import Decimal from 'decimal.js';
import { catalog, stockTotalShares, getOwnershipTier } from './catalog.js';
import { normalizeState, netWorth, businessRate, price, propertyMetrics } from './engine.js';
import { getBusinessModel } from './business-models.js';
import { simulateBusiness, businessValuation } from './business-sim.js';
import { RESEARCH_NODES, WORLD_REGIONS, ACHIEVEMENTS, evaluateAchievements } from './engagement.js';
import { activeContractsFor, getChain } from './supply-chain.js';

export const EMPIRE_RANKS = [
  { min: 0, name: 'Startup Founder' },
  { min: 250000, name: 'Angel Investor' },
  { min: 1000000, name: 'Millionaire' },
  { min: 10000000, name: 'Business Tycoon' },
  { min: 100000000, name: 'Global Magnate' },
  { min: 1000000000, name: 'Billionaire' },
  { min: 100000000000, name: 'Empire Legend' }
];

export function getEmpireRank(nwNum) {
  const idx = EMPIRE_RANKS.findLastIndex(r => nwNum >= r.min);
  const cur = EMPIRE_RANKS[Math.max(0, idx)];
  const nxt = EMPIRE_RANKS[idx + 1] || null;
  const pct = nxt ? Math.min(100, Math.max(0, ((nwNum - cur.min) / (nxt.min - cur.min)) * 100)) : 100;
  return { cur, nxt, pct, remaining: nxt ? Math.max(0, nxt.min - nwNum) : 0 };
}

export function normalizeIdentity(raw = {}) {
  const cleanStr = (v, max) => String(v || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  return {
    displayName: cleanStr(raw?.displayName, 32),
    bio: cleanStr(raw?.bio, 160),
    preferredIndustry: cleanStr(raw?.preferredIndustry, 32)
  };
}

export function normalizePrivacy(raw = {}) {
  return {
    showOnLeaderboard: raw.showOnLeaderboard !== false,
    showFinancials: raw.showFinancials !== false,
    showCollections: raw.showCollections !== false,
    showBusinesses: raw.showBusinesses !== false,
    showInvestments: raw.showInvestments !== false,
    showProperties: (raw.showProperties ?? raw.showCollections) !== false,
    showLuxury: (raw.showLuxury ?? raw.showCollections) !== false,
    showResearch: raw.showResearch !== false,
    showAchievements: raw.showAchievements !== false,
    showVip: raw.showVip !== false,
    hiddenCategories: Array.isArray(raw.hiddenCategories) ? raw.hiddenCategories.map(String) : []
  };
}

export function propGroup(x) {
  if (x.legacy) return 'Classic Properties';
  const raw = x.name.includes(',') ? x.name.split(',').pop() : x.name;
  const cleaned = raw.replace(/\([^)]*\)/g, '').replace(/[_\d]+/g, '').trim();
  if (cleaned === 'Brasil') return 'Brazil';
  if (cleaned === 'Great Britain' || cleaned === 'Scotland') return 'UK';
  return cleaned || 'Other';
}

export function buildPublicProfileSummary(u, { rankPos = null, liveQuotes = null, auctions = [], followerCount = 0, isFollowing = false, isRival = false } = {}) {
  const st = normalizeState(u.state || {});
  const priv = normalizePrivacy(u.privacy);
  const identity = normalizeIdentity(u.identity);
  const now = Date.now();
  const isPrem = Boolean(u.premium) && (!u.premiumUntil || new Date(u.premiumUntil).getTime() > now);
  const nw = Number(netWorth(st, catalog));
  const rank = getEmpireRank(nw);

  let hourlyProfit = 0;
  let totalBranches = 0;
  for (const b of st.businesses) {
    totalBranches += (b.branches || []).length;
    hourlyProfit += Number(businessRate(st, b, st.at, catalog));
  }

  let investVal = 0;
  let stakesCount = 0;
  for (const x of [...catalog.stocks, ...catalog.crypto]) {
    const qty = st.holdings?.[x.id] || 0;
    if (qty > 0) {
      const p = Number(liveQuotes?.[x.id]?.price ?? price(x, st.at));
      investVal += p * qty;
      if (x.dividend !== undefined || catalog.stocks.some(s => s.id === x.id)) {
        const pct = (qty / stockTotalShares(x)) * 100;
        if (pct >= 10) stakesCount++;
      }
    }
  }

  let propCount = 0;
  let propVal = 0;
  for (const p of catalog.properties) {
    const qty = st.properties?.[p.id] || 0;
    if (qty > 0) {
      propCount += qty;
      propVal += Number(p.price) * qty;
    }
  }

  const hidden = new Set(priv.hiddenCategories);
  const catStats = {};
  let luxCount = 0;
  let luxVal = 0;
  const ownedAssets = [];
  for (const a of catalog.assets) {
    const cat = a.category || 'legacy';
    if (!a.legacy || (st.assets?.[a.id] || 0) > 0) {
      catStats[cat] ??= { category: cat, owned: 0, total: 0, value: 0 };
      catStats[cat].total++;
      if ((st.assets?.[a.id] || 0) > 0 && priv.showLuxury && !hidden.has(cat)) {
        catStats[cat].owned++;
        catStats[cat].value += Number(a.price);
        luxCount++;
        luxVal += Number(a.price);
        ownedAssets.push(a);
      }
    }
  }

  const topBusinesses = priv.showBusinesses
    ? [...st.businesses]
        .sort((a, b) => b.level - a.level)
        .slice(0, 3)
        .map(b => ({
          id: b.id,
          name: b.name || catalog.businesses.find(k => k.id === b.type)?.name || b.type,
          type: b.type,
          level: b.level,
          infra: b.upgrades?.infra || 1,
          efficiency: b.upgrades?.efficiency || 1,
          branches: (b.branches || []).length,
          val: priv.showFinancials ? businessValuation(b, catalog) : null
        }))
    : [];

  const topAssets = priv.showLuxury
    ? ownedAssets.sort((a, b) => b.price - a.price).slice(0, 4).map(a => ({
        id: a.id,
        name: a.name,
        category: a.category || 'legacy',
        price: a.price
      }))
    : [];

  return {
    username: u.username,
    identity,
    social: {
      followerCount: Number(followerCount || 0),
      isFollowing: Boolean(isFollowing),
      isRival: Boolean(isRival)
    },
    level: st.level || 1,
    premium: priv.showVip ? isPrem : false,
    privacy: {
      showFinancials: priv.showFinancials,
      showBusinesses: priv.showBusinesses,
      showInvestments: priv.showInvestments,
      showProperties: priv.showProperties,
      showLuxury: priv.showLuxury,
      showResearch: priv.showResearch,
      showAchievements: priv.showAchievements
    },
    rank: {
      current: rank.cur.name,
      next: rank.nxt?.name || null,
      pct: Number(rank.pct.toFixed(1)),
      remaining: priv.showFinancials && rank.nxt ? String(Math.round(rank.remaining)) : null
    },
    leaderboardPosition: rankPos,
    snapshotAt: st.at || null,
    overview: {
      netWorth: priv.showFinancials ? String(nw) : null,
      hourlyProfit: priv.showFinancials ? String(hourlyProfit) : null,
      businessesCount: priv.showBusinesses ? st.businesses.length : null,
      branchesCount: priv.showBusinesses ? totalBranches : null,
      propertiesCount: priv.showProperties ? propCount : null,
      propertiesVal: priv.showProperties && priv.showFinancials ? String(propVal) : null,
      luxuryCount: priv.showLuxury ? luxCount : null,
      luxuryVal: priv.showLuxury && priv.showFinancials ? String(luxVal) : null,
      investVal: priv.showInvestments && priv.showFinancials ? String(investVal) : null,
      stakesCount: priv.showInvestments ? stakesCount : null,
      researchDone: priv.showResearch ? (st.research?.completed || []).length : null,
      researchTotal: RESEARCH_NODES.length,
      achievementsDone: priv.showAchievements ? (st.achievements || []).length : null,
      achievementsTotal: ACHIEVEMENTS.length,
      activeAuctionsCount: auctions.length
    },
    featured: {
      topBusinesses,
      topAssets,
      assetCategories: priv.showLuxury
        ? Object.values(catStats).filter(c => !hidden.has(c.category)).map(c => ({
            ...c,
            value: priv.showFinancials ? String(c.value) : null
          }))
        : []
    },
    // Legacy compatibility fields for existing consumers
    netWorth: priv.showFinancials ? nw : null,
    investVal: priv.showFinancials ? investVal : null,
    businessesCount: st.businesses.length,
    businesses: priv.showBusinesses
      ? st.businesses.map(b => ({ name: b.name || b.type, type: b.type, level: b.level, branches: (b.branches || []).length }))
      : [],
    propertiesCount: priv.showProperties ? propCount : null,
    assetsCount: priv.showLuxury ? luxCount : null,
    achievementsCount: priv.showAchievements ? (st.achievements || []).length : 0,
    researchCount: priv.showResearch ? (st.research?.completed || []).length : 0
  };
}

export function projectPublicBusinesses(u, { sort = 'level', sector = 'all', cursor = 0, limit = 24 } = {}) {
  const priv = normalizePrivacy(u.privacy);
  if (!priv.showBusinesses) return { hidden: true, items: [], nextCursor: null };
  const st = normalizeState(u.state || {});
  let rows = st.businesses.map(b => {
    const x = catalog.businesses.find(k => k.id === b.type);
    const m = getBusinessModel(b.type);
    const sim = priv.showFinancials ? simulateBusiness(st, b, st.at, catalog) : null;
    const val = priv.showFinancials ? businessValuation(b, catalog) : null;
    return {
      id: b.id,
      type: b.type,
      kind: x?.kind || m.kind,
      name: b.name || x?.name || b.type,
      catalogueName: x?.name || b.type,
      color: b.color || null,
      level: b.level,
      upgrades: [
        { key: m.upgrades[0].key, name: m.upgrades[0].name, level: b.upgrades?.level || b.level },
        { key: m.upgrades[1].key, name: m.upgrades[1].name, level: b.upgrades?.infra || 1 },
        { key: m.upgrades[2].key, name: m.upgrades[2].name, level: b.upgrades?.efficiency || 1 }
      ],
      branches: (b.branches || []).map(id => WORLD_REGIONS.find(r => r.id === id)?.name || id),
      val,
      netProfit: sim ? sim.netProfit : null
    };
  });
  if (sector !== 'all') rows = rows.filter(r => r.kind === sector);
  rows.sort((a, b) => sort === 'val' ? Number(b.val || 0) - Number(a.val || 0) : b.level - a.level);
  const start = Math.max(0, Number(cursor) || 0);
  const lim = Math.min(50, Math.max(1, Number(limit) || 24));
  const slice = rows.slice(start, start + lim);
  return { hidden: false, total: rows.length, items: slice, nextCursor: start + lim < rows.length ? start + lim : null };
}

export function projectPublicBusinessDetail(u, businessId) {
  const priv = normalizePrivacy(u.privacy);
  if (!priv.showBusinesses) return null;
  const st = normalizeState(u.state || {});
  const b = st.businesses.find(x => x.id === businessId);
  if (!b) return null;
  const x = catalog.businesses.find(k => k.id === b.type);
  const m = getBusinessModel(b.type);
  const sim = priv.showFinancials ? simulateBusiness(st, b, st.at, catalog) : null;
  const contracts = activeContractsFor(st).filter(ct => ct.supplierId === b.id || ct.buyerId === b.id);

  const resources = [];
  if (m.extra) resources.push({ label: m.extra.label, count: b[m.extra.key] || 0 });
  if (m.staff) resources.push({ label: m.staff.label, count: b.staff || 0 });

  return {
    id: b.id,
    type: b.type,
    kind: x?.kind || m.kind,
    name: b.name || x?.name || b.type,
    catalogueName: x?.name || b.type,
    color: b.color || null,
    level: b.level,
    upgrades: [
      { key: m.upgrades[0].key, name: m.upgrades[0].name, level: b.upgrades?.level || b.level },
      { key: m.upgrades[1].key, name: m.upgrades[1].name, level: b.upgrades?.infra || 1 },
      { key: m.upgrades[2].key, name: m.upgrades[2].name, level: b.upgrades?.efficiency || 1 }
    ],
    resources,
    branches: (b.branches || []).map(id => WORLD_REGIONS.find(r => r.id === id)?.name || id),
    managerStatus: b.manager ? (b.manager === 'paused' ? 'Paused' : `Auto (${b.manager})`) : 'Manual',
    supplyContractsSummary: contracts.map(ct => ({
      role: ct.supplierId === b.id ? 'Supplier' : 'Buyer',
      chain: getChain(ct.chainId)?.name || ct.chainId
    })),
    financials: priv.showFinancials && sim ? {
      valuation: businessValuation(b, catalog),
      revenue: sim.revenue,
      expenses: sim.expenses,
      netProfit: sim.netProfit,
      margin: sim.margin,
      demand: sim.demand,
      utilization: sim.utilization,
      efficiency: sim.efficiency,
      capacityLabel: sim.capacityLabel,
      capacityValue: sim.capacityValue
    } : null
  };
}

export function projectPublicInvestments(u, { type = 'all', liveQuotes = null } = {}) {
  const priv = normalizePrivacy(u.privacy);
  if (!priv.showInvestments) return { hidden: true, stocks: [], crypto: [] };
  const st = normalizeState(u.state || {});
  const stocks = [];
  const crypto = [];

  for (const s of catalog.stocks) {
    const qty = st.holdings?.[s.id] || 0;
    if (qty > 0) {
      const p = Number(liveQuotes?.[s.id]?.price ?? price(s, st.at));
      const pct = (qty / stockTotalShares(s)) * 100;
      const tier = getOwnershipTier(pct);
      stocks.push({
        id: s.id,
        name: s.name,
        category: 'stocks',
        currentPrice: String(p),
        stakePct: Number(pct.toFixed(2)),
        milestone: tier.tier,
        divBonus: tier.divBonus,
        qty: priv.showFinancials ? qty : null,
        value: priv.showFinancials ? new Decimal(p).times(qty).toString() : null,
        hourlyDiv: priv.showFinancials ? new Decimal(s.dividend).times(qty).times(1 + tier.divBonus).toString() : null
      });
    }
  }
  for (const cItem of catalog.crypto) {
    const qty = st.holdings?.[cItem.id] || 0;
    if (qty > 0) {
      const p = Number(liveQuotes?.[cItem.id]?.price ?? price(cItem, st.at));
      crypto.push({
        id: cItem.id,
        name: cItem.name,
        category: 'crypto',
        currentPrice: String(p),
        qty: priv.showFinancials ? qty : null,
        value: priv.showFinancials ? new Decimal(p).times(qty).toString() : null
      });
    }
  }
  return {
    hidden: false,
    stocks: type === 'crypto' ? [] : stocks,
    crypto: type === 'stocks' ? [] : crypto
  };
}

export function projectPublicProperties(u, { country = 'all', sort = 'value_desc', cursor = 0, limit = 24 } = {}) {
  const priv = normalizePrivacy(u.privacy);
  if (!priv.showProperties) return { hidden: true, items: [], countries: [], nextCursor: null };
  const st = normalizeState(u.state || {});
  const countries = new Set();
  let rows = [];
  for (const p of catalog.properties) {
    const qty = st.properties?.[p.id] || 0;
    if (qty > 0) {
      const grp = propGroup(p);
      countries.add(grp);
      const pm = priv.showFinancials ? propertyMetrics(p, qty, st.propState?.[p.id], st.at) : null;
      rows.push({
        id: p.id,
        name: p.name,
        country: grp,
        qty,
        cataloguePrice: String(p.price),
        condition: pm ? pm.condition : null,
        occupancy: pm ? Number((pm.occupancy * 100).toFixed(0)) : null,
        netRent: pm ? pm.netIncome.toString() : null
      });
    }
  }
  if (country !== 'all') rows = rows.filter(r => r.country === country);
  rows.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : Number(b.cataloguePrice) - Number(a.cataloguePrice));
  const start = Math.max(0, Number(cursor) || 0);
  const lim = Math.min(24, Math.max(1, Number(limit) || 24));
  return {
    hidden: false,
    countries: [...countries].sort(),
    total: rows.length,
    items: rows.slice(start, start + lim),
    nextCursor: start + lim < rows.length ? start + lim : null
  };
}

export function projectPublicAssets(u, { category = 'all', q = '', sort = 'price_desc', cursor = 0, limit = 24 } = {}) {
  const priv = normalizePrivacy(u.privacy);
  if (!priv.showLuxury) return { hidden: true, items: [], categories: [], storage: null, nextCursor: null };
  const st = normalizeState(u.state || {});
  const hidden = new Set(priv.hiddenCategories);
  const lockedSet = new Set(st.lockedAssets || []);
  const cleanQ = String(q || '').trim().toLowerCase();

  const catCounts = {};
  const owned = [];
  for (const a of catalog.assets) {
    const cat = a.category || 'legacy';
    if (hidden.has(cat)) continue;
    if (!a.legacy || (st.assets?.[a.id] || 0) > 0) {
      catCounts[cat] ??= { category: cat, owned: 0, total: 0 };
      catCounts[cat].total++;
      if ((st.assets?.[a.id] || 0) > 0) {
        catCounts[cat].owned++;
        owned.push({
          id: a.id,
          name: a.name,
          category: cat,
          cataloguePrice: String(a.price),
          inAuction: lockedSet.has(a.id)
        });
      }
    }
  }

  let filtered = owned;
  if (category !== 'all') filtered = filtered.filter(x => x.category === category);
  if (cleanQ) filtered = filtered.filter(x => x.name.toLowerCase().includes(cleanQ));
  filtered.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'price_asc') return Number(a.cataloguePrice) - Number(b.cataloguePrice);
    return Number(b.cataloguePrice) - Number(a.cataloguePrice);
  });

  const start = Math.max(0, Number(cursor) || 0);
  const lim = Math.min(24, Math.max(1, Number(limit) || 24));
  const usedStorage = catName => catalog.assets.filter(x => x.category === catName).reduce((n, x) => n + (st.assets?.[x.id] || 0), 0);

  return {
    hidden: false,
    categories: Object.values(catCounts),
    storage: priv.showFinancials ? {
      garage: { used: usedStorage('cars'), cap: st.storage?.garage || 4 },
      hangar: { used: usedStorage('aircraft'), cap: st.storage?.hangar || 2 },
      marina: { used: usedStorage('yachts'), cap: st.storage?.marina || 2 }
    } : null,
    total: filtered.length,
    items: filtered.slice(start, start + lim),
    nextCursor: start + lim < filtered.length ? start + lim : null
  };
}

export function projectPublicResearch(u) {
  const priv = normalizePrivacy(u.privacy);
  if (!priv.showResearch) return { hidden: true, nodes: [] };
  const st = normalizeState(u.state || {});
  const done = new Set(st.research?.completed || []);
  return {
    hidden: false,
    completedCount: done.size,
    totalCount: RESEARCH_NODES.length,
    nodes: RESEARCH_NODES.map(n => ({
      id: n.id,
      name: n.name,
      desc: n.desc,
      requires: n.requires,
      status: done.has(n.id) ? 'completed' : st.research?.active?.id === n.id ? 'researching' : 'locked'
    }))
  };
}

export function projectPublicAchievements(u) {
  const priv = normalizePrivacy(u.privacy);
  if (!priv.showAchievements) return { hidden: true, items: [] };
  const st = normalizeState(u.state || {});
  const nw = Number(netWorth(st, catalog));
  const evals = evaluateAchievements(st, catalog, nw);
  return {
    hidden: false,
    items: evals.map(a => ({
      id: a.id,
      title: a.title,
      desc: a.desc,
      unlocked: a.claimed || a.done,
      progressPct: priv.showFinancials ? Math.min(100, Math.round((a.cur / a.target) * 100)) : null
    }))
  };
}

export function compareProfiles(viewerSummary, targetSummary) {
  const v = viewerSummary?.overview || {};
  const t = targetSummary?.overview || {};
  return {
    viewer: {
      username: viewerSummary.username,
      displayName: viewerSummary.identity?.displayName || viewerSummary.username,
      level: viewerSummary.level,
      rank: viewerSummary.rank?.current
    },
    target: {
      username: targetSummary.username,
      displayName: targetSummary.identity?.displayName || targetSummary.username,
      level: targetSummary.level,
      rank: targetSummary.rank?.current
    },
    rows: [
      { label: 'Net Worth', viewer: v.netWorth, target: t.netWorth, kind: 'money' },
      { label: 'Hourly Profit', viewer: v.hourlyProfit, target: t.hourlyProfit, kind: 'money' },
      { label: 'Businesses', viewer: v.businessesCount, target: t.businessesCount, kind: 'count' },
      { label: 'Global Branches', viewer: v.branchesCount, target: t.branchesCount, kind: 'count' },
      { label: 'Properties', viewer: v.propertiesCount, target: t.propertiesCount, kind: 'count' },
      { label: 'Luxury Items', viewer: v.luxuryCount, target: t.luxuryCount, kind: 'count' },
      { label: 'Research Unlocked', viewer: v.researchDone, target: t.researchDone, kind: 'count' },
      { label: 'Achievements', viewer: v.achievementsDone, target: t.achievementsDone, kind: 'count' }
    ]
  };
}
