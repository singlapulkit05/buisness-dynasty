export const RESEARCH_NODES = [
  {
    id: 'automation',
    name: 'Automated Operations',
    desc: 'Streamlines workflows across all businesses (-6% operating expenses).',
    cost: 50000,
    duration: 600000,
    requires: [],
    revMult: 1.0,
    expMult: 0.94
  },
  {
    id: 'ai_analytics',
    name: 'AI Demand Analytics',
    desc: 'Dynamic pricing & demand forecasting (+8% business revenue).',
    cost: 150000,
    duration: 1200000,
    requires: ['automation'],
    revMult: 1.08,
    expMult: 1.0
  },
  {
    id: 'supply_opt',
    name: 'Smart Supply Routing',
    desc: 'Optimizes procurement and delivery (+6% revenue, -4% expenses).',
    cost: 300000,
    duration: 1800000,
    requires: ['automation'],
    revMult: 1.06,
    expMult: 0.96
  },
  {
    id: 'fintech',
    name: 'FinTech Core',
    desc: 'Automated treasury & underwriting (+6% revenue, +0.5% personal savings APY).',
    cost: 500000,
    duration: 2700000,
    requires: ['ai_analytics'],
    revMult: 1.06,
    expMult: 1.0
  },
  {
    id: 'green_energy',
    name: 'Renewable Energy Grid',
    desc: 'Lowers energy & fuel overhead across operations (-8% expenses).',
    cost: 1000000,
    duration: 3600000,
    requires: ['supply_opt'],
    revMult: 1.0,
    expMult: 0.92
  },
  {
    id: 'robotics',
    name: 'Autonomous Robotics',
    desc: 'Next-gen autonomous production & fulfillment (+12% business revenue).',
    cost: 2500000,
    duration: 5400000,
    requires: ['ai_analytics', 'green_energy'],
    revMult: 1.12,
    expMult: 1.0
  }
];

export const WORLD_REGIONS = [
  { id: 'nyc', name: 'New York', costMult: 0.35, revMult: 1.18, expMult: 1.12, desc: 'High consumer demand, higher wages & taxes' },
  { id: 'lon', name: 'London', costMult: 0.30, revMult: 1.14, expMult: 1.09, desc: 'Strong global finance & services hub' },
  { id: 'dxb', name: 'Dubai', costMult: 0.40, revMult: 1.16, expMult: 1.04, desc: 'Low corporate tax, luxury & trade demand' },
  { id: 'sgp', name: 'Singapore', costMult: 0.32, revMult: 1.15, expMult: 1.06, desc: 'Asia-Pacific logistics & fintech gateway' },
  { id: 'tyo', name: 'Tokyo', costMult: 0.34, revMult: 1.13, expMult: 1.08, desc: 'High-tech & precision consumer market' },
  { id: 'mum', name: 'Mumbai', costMult: 0.20, revMult: 1.10, expMult: 0.96, desc: 'Rapid urban growth & competitive labor costs' }
];

const RIVALS = ['Apex Corp', 'Nova Ventures', 'Titan Group', 'Vanguard Co.', 'Helios Holdings', 'Zenith Global'];

export function sectorCompetition(type, t = 0) {
  const slot = Math.floor(t / 14400000); // 4-hour cycle
  let h = 0;
  for (const ch of String(type || 'shop')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const rivalName = RIVALS[Math.abs(h) % RIVALS.length];
  const wave = Math.sin(slot * 0.9 + h);
  const demandMult = Number((1 + wave * 0.05).toFixed(4)); // 0.95 to 1.05
  const rivalShare = Math.round(28 - wave * 8); // 20% to 36%
  return { rivalName, demandMult, rivalShare };
}

export function researchModifiers(s) {
  const done = new Set(s.research?.completed || []);
  let revMult = 1;
  let expMult = 1;
  for (const node of RESEARCH_NODES) {
    if (done.has(node.id)) {
      revMult *= node.revMult;
      expMult *= node.expMult;
    }
  }
  return { revMult, expMult, hasFintech: done.has('fintech') };
}

export function branchModifiers(b) {
  const branches = b.branches || [];
  let revMult = 1;
  let expMult = 1;
  for (const id of branches) {
    const reg = WORLD_REGIONS.find(r => r.id === id);
    if (reg) {
      revMult += (reg.revMult - 1);
      expMult += (reg.expMult - 1);
    }
  }
  return { revMult, expMult, count: branches.length };
}

export const ACHIEVEMENTS = [
  {
    id: 'first_biz',
    title: 'First Venture',
    desc: 'Own at least 1 active business.',
    rewardCash: 10000,
    check: s => ({ cur: s.businesses.length, target: 1 })
  },
  {
    id: 'five_biz',
    title: 'Portfolio Builder',
    desc: 'Operate 5 businesses simultaneously.',
    rewardCash: 100000,
    check: s => ({ cur: s.businesses.length, target: 5 })
  },
  {
    id: 'supply_chain',
    title: 'Connected Empire',
    desc: 'Sign an intercompany supply chain contract.',
    rewardCash: 50000,
    check: s => ({ cur: (s.contracts || []).length, target: 1 })
  },
  {
    id: 'millionaire',
    title: 'Self-Made Millionaire',
    desc: 'Reach $1,000,000 net worth.',
    rewardCash: 100000,
    check: (_s, _c, nw) => ({ cur: Math.floor(nw), target: 1000000 })
  },
  {
    id: 'tycoon_10m',
    title: 'Business Tycoon',
    desc: 'Reach $10,000,000 net worth.',
    rewardCash: 500000,
    check: (_s, _c, nw) => ({ cur: Math.floor(nw), target: 10000000 })
  },
  {
    id: 'first_research',
    title: 'R&D Pioneer',
    desc: 'Complete 1 technology research node.',
    rewardCash: 75000,
    check: s => ({ cur: (s.research?.completed || []).length, target: 1 })
  },
  {
    id: 'global_branch',
    title: 'Multinational',
    desc: 'Open a worldwide branch in any city.',
    rewardCash: 150000,
    check: s => ({ cur: s.businesses.reduce((n, b) => n + (b.branches?.length || 0), 0), target: 1 })
  },
  {
    id: 'landlord',
    title: 'Real Estate Mogul',
    desc: 'Own 5 properties in your portfolio.',
    rewardCash: 120000,
    check: s => ({ cur: Object.values(s.properties || {}).reduce((a, b) => a + b, 0), target: 5 })
  },
  {
    id: 'credit_star',
    title: 'Prime Borrower',
    desc: 'Reach a 700+ credit score by repaying loans.',
    rewardCash: 40000,
    check: s => ({ cur: s.banking?.creditScore || 680, target: 700 })
  }
];

export function evaluateAchievements(s, c, nwNum) {
  const claimed = new Set(s.achievements || []);
  return ACHIEVEMENTS.map(a => {
    const res = a.check(s, c, nwNum);
    const done = res.cur >= res.target;
    return {
      ...a,
      cur: Math.min(res.cur, res.target),
      target: res.target,
      done,
      claimed: claimed.has(a.id)
    };
  });
}
