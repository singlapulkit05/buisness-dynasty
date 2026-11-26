// Structured, configurable business definitions for Business Dynasty.
// Purchase prices match the existing catalogue; operational models are balanced simulation formulas.

export const BUSINESS_MODELS = {
  shop: {
    kind: 'retail',
    subtitle: 'Neighborhood & chain retail store',
    upgrades: [
      { key: 'level', name: 'Store Expansion', desc: 'Expand floor space and checkout lanes', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Shelf capacity', capBase: 100, capStep: 40 },
      { key: 'infra', name: 'Cold Chain & Storage', desc: 'Increase backroom inventory capacity and reduce spoilage', max: 25, baseCost: 0.3, mult: 1.22, dur: 45000, capLabel: 'Storage units', capBase: 80, capStep: 35 },
      { key: 'efficiency', name: 'POS & Inventory AI', desc: 'Automate restocking and reduce operating overhead', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Efficiency bonus', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'markup', label: 'Price Markup', min: 5, max: 80, step: 1, def: 25, unit: '%', tip: 'Higher markup increases margin per item but lowers customer demand.' },
      { key: 'inventory', label: 'Stock Level', min: 20, max: 100, step: 5, def: 80, unit: '%', tip: 'Insufficient stock caps sales; excess stock adds holding costs.' }
    ],
    extra: { key: 'staff', label: 'Cashiers & Clerks', costPct: 0.15, unit: 'staff' }
  },
  taxi: {
    kind: 'fleet',
    subtitle: 'Urban passenger transport fleet',
    upgrades: [
      { key: 'level', name: 'Dispatch Network', desc: 'Expand city operating zones and ride volume', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Daily ride demand', capBase: 120, capStep: 45 },
      { key: 'infra', name: 'Garage & Service Bay', desc: 'Support larger fleets and cut vehicle maintenance costs', max: 25, baseCost: 0.32, mult: 1.22, dur: 45000, capLabel: 'Fleet bay cap', capBase: 6, capStep: 3 },
      { key: 'efficiency', name: 'Route Optimization App', desc: 'Boost driver utilization and cut empty-mile fuel burn', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Fuel efficiency', capBase: 100, capStep: 5 }
    ],
    controls: [
      { key: 'fare', label: 'Fare Multiplier', min: 0.6, max: 2.0, step: 0.05, def: 1.0, unit: 'x', tip: 'Higher fares boost revenue per ride but reduce passenger demand.' }
    ],
    extra: { key: 'fleet', label: 'Taxi Vehicles', costPct: 0.15, unit: 'cars' },
    staff: { label: 'Licensed Drivers', costPct: 0.08, unit: 'drivers' }
  },
  transport: {
    kind: 'fleet',
    subtitle: 'Regional freight & logistics hauler',
    upgrades: [
      { key: 'level', name: 'Regional Hubs', desc: 'Unlock higher-paying freight corridors', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Route demand', capBase: 150, capStep: 55 },
      { key: 'infra', name: 'Warehouse & Docks', desc: 'Increase cargo staging and fleet capacity', max: 25, baseCost: 0.32, mult: 1.22, dur: 50000, capLabel: 'Warehouse tons', capBase: 200, capStep: 90 },
      { key: 'efficiency', name: 'Telematics & Fuel Tech', desc: 'Lower fuel & maintenance cost per kilometer', max: 20, baseCost: 0.35, mult: 1.25, dur: 55000, capLabel: 'Logistics efficiency', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'fare', label: 'Freight Rate', min: 0.7, max: 1.8, step: 0.05, def: 1.05, unit: 'x', tip: 'Higher rates increase per-contract revenue but reduce shippers.' }
    ],
    extra: { key: 'fleet', label: 'Cargo Trucks', costPct: 0.15, unit: 'trucks' },
    staff: { label: 'Haulage Drivers', costPct: 0.08, unit: 'drivers' }
  },
  construction: {
    kind: 'project',
    subtitle: 'Commercial & residential contractor',
    upgrades: [
      { key: 'level', name: 'Contractor License', desc: 'Qualify for larger, higher-margin builds', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Contract scale', capBase: 100, capStep: 35 },
      { key: 'infra', name: 'Heavy Machinery Yard', desc: 'Cranes and excavators speed up builds and cut rental costs', max: 25, baseCost: 0.35, mult: 1.22, dur: 55000, capLabel: 'Equipment units', capBase: 4, capStep: 2 },
      { key: 'efficiency', name: 'BIM & Prefab Systems', desc: 'Reduce material waste and labor overruns', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Build efficiency', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'margin', label: 'Contract Bid Margin', min: 5, max: 45, step: 1, def: 20, unit: '%', tip: 'Aggressive bids win more work; high margins risk losing bids.' }
    ],
    extra: { key: 'staff', label: 'Workers & Engineers', costPct: 0.15, unit: 'crew' },
    projectLabel: 'Start Contract'
  },
  it: {
    kind: 'project',
    subtitle: 'Enterprise software & cloud studio',
    upgrades: [
      { key: 'level', name: 'Studio Scale', desc: 'Take on larger enterprise SaaS & AI clients', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Client demand', capBase: 100, capStep: 40 },
      { key: 'infra', name: 'Cloud & Dev Infrastructure', desc: 'Increase team seat capacity and uptime', max: 25, baseCost: 0.3, mult: 1.22, dur: 45000, capLabel: 'Workstations', capBase: 10, capStep: 5 },
      { key: 'efficiency', name: 'CI/CD & AI Tooling', desc: 'Boost developer velocity and cut bug-fix overhead', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Dev velocity', capBase: 100, capStep: 7 }
    ],
    controls: [
      { key: 'fare', label: 'Hourly Billing Rate', min: 0.7, max: 1.8, step: 0.05, def: 1.05, unit: 'x', tip: 'Higher billing rates raise revenue per dev but reduce client demand.' }
    ],
    extra: { key: 'staff', label: 'Developers & Designers', costPct: 0.15, unit: 'devs' },
    projectLabel: 'Launch Sprint'
  },
  bank: {
    kind: 'bank',
    subtitle: 'Commercial deposits, lending & reserves',
    upgrades: [
      { key: 'level', name: 'Charter & Branches', desc: 'Expand customer base and lending reach', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Customer demand', capBase: 100, capStep: 35 },
      { key: 'infra', name: 'Vault & Reserve Expansion', desc: 'Increase maximum deposits and cash reserve capacity', max: 25, baseCost: 0.25, mult: 1.22, dur: 50000, capLabel: 'Vault capacity', capBase: 5000000, capStep: 3500000 },
      { key: 'efficiency', name: 'Risk & Underwriting AI', desc: 'Lower loan default risk and operating overhead', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Risk reduction', capBase: 100, capStep: 5 }
    ],
    controls: [
      { key: 'deposit', label: 'Deposit Interest Rate', min: 1.0, max: 12.0, step: 0.1, def: 4.5, unit: '%', tip: 'Higher deposit rates attract more customer deposits but increase interest expense.' },
      { key: 'loan', label: 'Loan Interest Rate', min: 2.0, max: 22.0, step: 0.1, def: 10.5, unit: '%', tip: 'Higher loan rates earn more per loan but reduce borrower demand and raise default risk.' }
    ],
    extra: { key: 'vault', label: 'Vault Expansion', costPct: 0.15, unit: 'vaults' }
  },
  clothing: {
    kind: 'retail',
    subtitle: 'Apparel design, manufacturing & retail',
    upgrades: [
      { key: 'level', name: 'Flagship Boutiques', desc: 'Expand retail presence and seasonal collections', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Distribution cap', capBase: 100, capStep: 40 },
      { key: 'infra', name: 'Automated Garment Mills', desc: 'Lower unit manufacturing costs and boost output', max: 25, baseCost: 0.32, mult: 1.22, dur: 50000, capLabel: 'Production units', capBase: 120, capStep: 50 },
      { key: 'efficiency', name: 'Brand Marketing Studio', desc: 'Build brand reputation and customer loyalty', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Brand appeal', capBase: 100, capStep: 7 }
    ],
    controls: [
      { key: 'markup', label: 'Retail Markup', min: 10, max: 90, step: 2, def: 35, unit: '%', tip: 'Premium pricing boosts margins if marketing supports demand.' },
      { key: 'marketing', label: 'Marketing Spend', min: 0, max: 100, step: 5, def: 35, unit: '%', tip: 'Drives brand demand, but excessive ad spend erodes net profit.' }
    ],
    extra: { key: 'staff', label: 'Designers & Retail Staff', costPct: 0.15, unit: 'staff' }
  },
  factory: {
    kind: 'retail',
    subtitle: 'Industrial mass manufacturing plant',
    upgrades: [
      { key: 'level', name: 'Assembly Lines', desc: 'Add production lines and bulk buyer contracts', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Plant output', capBase: 100, capStep: 45 },
      { key: 'infra', name: 'Power & Robotics', desc: 'Reduce electricity waste and increase machinery uptime', max: 25, baseCost: 0.34, mult: 1.22, dur: 55000, capLabel: 'Machine capacity', capBase: 100, capStep: 40 },
      { key: 'efficiency', name: 'Lean Supply Chain', desc: 'Negotiate cheaper raw materials and faster turnover', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Yield efficiency', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'output', label: 'Production Utilization', min: 20, max: 100, step: 5, def: 80, unit: '%', tip: 'Running near 100% without enough workers/machinery spikes maintenance.' },
      { key: 'markup', label: 'Wholesale Margin', min: 5, max: 60, step: 1, def: 22, unit: '%', tip: 'Higher wholesale prices lower bulk order volume.' }
    ],
    extra: { key: 'staff', label: 'Plant Operators', costPct: 0.15, unit: 'workers' }
  },
  dealer: {
    kind: 'retail',
    subtitle: 'New & luxury automotive showroom',
    upgrades: [
      { key: 'level', name: 'Showroom Expansion', desc: 'Display more vehicles and attract high-net-worth buyers', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Showroom bays', capBase: 12, capStep: 4 },
      { key: 'infra', name: 'Service & Detailing Wing', desc: 'Add post-sale service revenue and cut lot upkeep', max: 25, baseCost: 0.3, mult: 1.22, dur: 45000, capLabel: 'Service bays', capBase: 4, capStep: 2 },
      { key: 'efficiency', name: 'Auto Financing Desk', desc: 'Boost buyer conversion and inventory turnover', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Conversion rate', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'markup', label: 'Dealer Markup', min: 5, max: 50, step: 1, def: 18, unit: '%', tip: 'High dealer markups increase profit per car but slow turnover.' },
      { key: 'inventory', label: 'Lot Inventory', min: 20, max: 100, step: 5, def: 75, unit: '%', tip: 'More inventory boosts selection, but unsold cars cost upkeep.' }
    ],
    extra: { key: 'staff', label: 'Sales Specialists', costPct: 0.15, unit: 'sales' }
  },
  shipping: {
    kind: 'fleet',
    subtitle: 'Global maritime container & cargo fleet',
    upgrades: [
      { key: 'level', name: 'Port Terminal Rights', desc: 'Access major international shipping lanes', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Lane demand', capBase: 100, capStep: 45 },
      { key: 'infra', name: 'Drydock & Cranes', desc: 'Speed up turnaround and lower hull maintenance', max: 25, baseCost: 0.34, mult: 1.22, dur: 55000, capLabel: 'Berth capacity', capBase: 4, capStep: 2 },
      { key: 'efficiency', name: 'Hybrid Propulsion', desc: 'Cut bunker fuel burn across ocean routes', max: 20, baseCost: 0.35, mult: 1.25, dur: 55000, capLabel: 'Fuel savings', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'fare', label: 'Container Rate', min: 0.7, max: 1.8, step: 0.05, def: 1.05, unit: 'x', tip: 'Balances per-TEU revenue against global shipper demand.' }
    ],
    extra: { key: 'fleet', label: 'Cargo Vessels', costPct: 0.15, unit: 'ships' },
    staff: { label: 'Maritime Crew', costPct: 0.08, unit: 'crew' }
  },
  oil: {
    kind: 'retail',
    subtitle: 'Upstream drilling, reserves & refining',
    upgrades: [
      { key: 'level', name: 'Drilling Concessions', desc: 'Unlock deeper, higher-yield oil & gas reserves', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Reserve barrels/hr', capBase: 100, capStep: 50 },
      { key: 'infra', name: 'Refinery & Pipelines', desc: 'Refine crude into higher-margin fuel products', max: 25, baseCost: 0.35, mult: 1.22, dur: 60000, capLabel: 'Refinery throughput', capBase: 100, capStep: 45 },
      { key: 'efficiency', name: 'Seismic & Rig Tech', desc: 'Reduce extraction cost per barrel and rig downtime', max: 20, baseCost: 0.35, mult: 1.25, dur: 55000, capLabel: 'Extraction efficiency', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'output', label: 'Extraction Rate', min: 20, max: 100, step: 5, def: 75, unit: '%', tip: 'Over-pumping beyond refinery capacity wastes extraction costs.' }
    ],
    extra: { key: 'fleet', label: 'Oil Wells & Rigs', costPct: 0.15, unit: 'rigs' },
    staff: { label: 'Petroleum Engineers', costPct: 0.08, unit: 'engineers' }
  },
  sports: {
    kind: 'sports',
    subtitle: 'Professional franchise, stadium & sponsors',
    upgrades: [
      { key: 'level', name: 'League Prestige', desc: 'Attract bigger TV deals and corporate sponsors', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Sponsor tier', capBase: 100, capStep: 40 },
      { key: 'infra', name: 'Stadium & Training', desc: 'Expand seat capacity and boost player development', max: 25, baseCost: 0.35, mult: 1.22, dur: 55000, capLabel: 'Stadium seats', capBase: 15000, capStep: 5000 },
      { key: 'efficiency', name: 'Sports Science & Scouting', desc: 'Increase team rating and cut injury/wage waste', max: 20, baseCost: 0.35, mult: 1.25, dur: 50000, capLabel: 'Team synergy', capBase: 100, capStep: 6 }
    ],
    controls: [
      { key: 'fare', label: 'Ticket Price', min: 0.6, max: 2.0, step: 0.05, def: 1.0, unit: 'x', tip: 'Expensive tickets raise per-seat revenue but lower stadium attendance.' }
    ],
    extra: { key: 'players', label: 'Star Players', costPct: 0.15, unit: 'players' },
    staff: { label: 'Coaching Staff', costPct: 0.08, unit: 'coaches' },
    projectLabel: 'Play Match'
  },
  holding: {
    kind: 'retail',
    subtitle: 'Multi-sector corporate conglomerate',
    upgrades: [
      { key: 'level', name: 'Portfolio Expansion', desc: 'Acquire stakes in profitable subsidiary sectors', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Subsidiary cap', capBase: 100, capStep: 45 },
      { key: 'infra', name: 'Treasury & HQ', desc: 'Centralize capital allocation across subsidiaries', max: 25, baseCost: 0.32, mult: 1.22, dur: 55000, capLabel: 'Capital pool', capBase: 100, capStep: 40 },
      { key: 'efficiency', name: 'Executive Synergy', desc: 'Cut corporate overhead and boost subsidiary margins', max: 20, baseCost: 0.35, mult: 1.25, dur: 55000, capLabel: 'Synergy bonus', capBase: 100, capStep: 7 }
    ],
    controls: [
      { key: 'margin', label: 'Management Fee', min: 5, max: 35, step: 1, def: 15, unit: '%', tip: 'Excessive HQ fees slow subsidiary growth; balanced fees maximize net return.' }
    ],
    extra: { key: 'staff', label: 'Managing Directors', costPct: 0.15, unit: 'execs' }
  },
  space: {
    kind: 'project',
    subtitle: 'Orbital launch, satellites & deep-space contracts',
    upgrades: [
      { key: 'level', name: 'Orbital Contracts', desc: 'Secure commercial satellite and defense launches', max: 50, baseCost: 0.4, mult: 1.2, dur: 60000, capLabel: 'Launch demand', capBase: 100, capStep: 45 },
      { key: 'infra', name: 'Launch Pads & Hangars', desc: 'Support rapid rocket turnarounds and heavy payloads', max: 25, baseCost: 0.35, mult: 1.22, dur: 60000, capLabel: 'Launch pads', capBase: 2, capStep: 1 },
      { key: 'efficiency', name: 'Reusable Boosters', desc: 'Dramatically cut per-launch fuel and hardware costs', max: 20, baseCost: 0.35, mult: 1.25, dur: 55000, capLabel: 'Reusability', capBase: 100, capStep: 7 }
    ],
    controls: [
      { key: 'output', label: 'Launch Cadence', min: 20, max: 100, step: 5, def: 70, unit: '%', tip: 'High cadence increases revenue but requires matching engineers and pads.' }
    ],
    extra: { key: 'staff', label: 'Aerospace Engineers', costPct: 0.15, unit: 'engineers' },
    projectLabel: 'Launch Mission'
  }
};

// Merged mega-corporations inherit and scale their core sector models
BUSINESS_MODELS.logistics_empire = { ...BUSINESS_MODELS.shipping, subtitle: 'Merged global road, taxi & ocean logistics empire' };
BUSINESS_MODELS.tech_conglomerate = { ...BUSINESS_MODELS.it, subtitle: 'Merged software, engineering & industrial powerhouse' };
BUSINESS_MODELS.aerospace_titan = { ...BUSINESS_MODELS.space, subtitle: 'Merged energy, holding & orbital aerospace titan' };

export function getBusinessModel(type) {
  return BUSINESS_MODELS[type] || BUSINESS_MODELS.shop;
}
