export const SUPPLY_CHAINS = [
  {
    id: 'fuel_supply',
    name: 'Fuel & Energy Supply',
    suppliers: ['oil', 'logistics_empire'],
    buyers: ['taxi', 'transport', 'shipping', 'logistics_empire'],
    buyerDesc: '-18% operating expenses & +6% efficiency',
    supplierDesc: '+4% wholesale fuel revenue',
    buyerExpMult: 0.82,
    buyerRevMult: 1.06,
    supplierRevBonus: 0.04
  },
  {
    id: 'tech_automation',
    name: 'IT & Automation Services',
    suppliers: ['it', 'tech_conglomerate'],
    buyers: ['bank', 'factory', 'shop', 'clothing', 'dealer', 'holding'],
    buyerDesc: '-15% operating expenses & +8% revenue',
    supplierDesc: '+5% enterprise SaaS revenue',
    buyerExpMult: 0.85,
    buyerRevMult: 1.08,
    supplierRevBonus: 0.05
  },
  {
    id: 'goods_wholesale',
    name: 'Wholesale Manufacturing',
    suppliers: ['factory', 'tech_conglomerate'],
    buyers: ['shop', 'clothing', 'dealer'],
    buyerDesc: '+10% retail margin & -10% COGS',
    supplierDesc: '+5% wholesale output revenue',
    buyerExpMult: 0.90,
    buyerRevMult: 1.10,
    supplierRevBonus: 0.05
  },
  {
    id: 'logistics_delivery',
    name: 'Freight & Logistics Contract',
    suppliers: ['transport', 'shipping', 'logistics_empire'],
    buyers: ['factory', 'construction', 'oil', 'shop'],
    buyerDesc: '-12% logistics costs & +5% revenue',
    supplierDesc: '+4% freight contract revenue',
    buyerExpMult: 0.88,
    buyerRevMult: 1.05,
    supplierRevBonus: 0.04
  }
];

export const MAX_SUPPLIER_CONTRACTS = 3;

export function getChain(chainId) {
  return SUPPLY_CHAINS.find(c => c.id === chainId) || null;
}

export function activeContractsFor(s) {
  const ids = new Set((s.businesses || []).map(b => b.id));
  return (s.contracts || []).filter(ct => ids.has(ct.supplierId) && ids.has(ct.buyerId) && ct.supplierId !== ct.buyerId);
}

export function contractModifiers(s, businessId) {
  const active = activeContractsFor(s);
  let revMult = 1;
  let expMult = 1;
  let asBuyer = 0;
  let asSupplier = 0;

  for (const ct of active) {
    const ch = getChain(ct.chainId);
    if (!ch) continue;
    if (ct.buyerId === businessId) {
      revMult *= ch.buyerRevMult;
      expMult *= ch.buyerExpMult;
      asBuyer++;
    } else if (ct.supplierId === businessId) {
      revMult += ch.supplierRevBonus;
      asSupplier++;
    }
  }

  return {
    revMult: Math.min(1.45, revMult),
    expMult: Math.max(0.60, expMult),
    asBuyer,
    asSupplier
  };
}
