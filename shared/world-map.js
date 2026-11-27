import Decimal from 'decimal.js';
import { WORLD_REGIONS } from './engagement.js';
import { propGroup } from './public-profile.js';
import { simulateBusiness, businessValuation } from './business-sim.js';
import { propertyMetrics } from './engine.js';
import { getBusinessModel } from './business-models.js';

export function toMapXY(lat, lon) {
  const x = Number((((lon + 180) / 360) * 1000).toFixed(1));
  const y = Number((((90 - lat) / 180) * 500).toFixed(1));
  return [x, y];
}

// Lightweight offline-safe continent outlines (equirectangular 1000x500)
export const WORLD_CONTINENTS = [
  {
    id: 'na',
    name: 'North America',
    pts: [[-168, 66], [-140, 70], [-95, 72], [-78, 63], [-55, 52], [-66, 44], [-80, 25], [-90, 21], [-83, 10], [-78, 8], [-92, 15], [-105, 20], [-117, 32], [-125, 49], [-150, 60]]
  },
  {
    id: 'gl',
    name: 'Greenland',
    pts: [[-58, 76], [-22, 82], [-18, 70], [-44, 60], [-54, 68]]
  },
  {
    id: 'sa',
    name: 'South America',
    pts: [[-78, 9], [-62, 11], [-48, -1], [-35, -6], [-39, -18], [-48, -28], [-64, -42], [-68, -55], [-74, -52], [-73, -36], [-71, -18], [-81, -5]]
  },
  {
    id: 'eu',
    name: 'Europe',
    pts: [[-10, 36], [-9, 43], [-2, 44], [-5, 49], [2, 51], [8, 54], [6, 61], [18, 69], [32, 70], [50, 68], [58, 56], [42, 45], [29, 41], [23, 37], [12, 38], [3, 43], [-5, 36]]
  },
  {
    id: 'af',
    name: 'Africa',
    pts: [[-17, 15], [-12, 28], [-6, 36], [10, 37], [32, 31], [43, 12], [51, 12], [41, -2], [35, -24], [20, -35], [14, -22], [9, 4], [-8, 5]]
  },
  {
    id: 'as',
    name: 'Asia',
    pts: [[30, 41], [42, 43], [50, 56], [60, 68], [105, 76], [145, 70], [175, 66], [162, 54], [142, 45], [128, 36], [122, 23], [109, 20], [104, 2], [98, 15], [88, 22], [78, 8], [67, 24], [55, 25], [36, 31]]
  },
  {
    id: 'au',
    name: 'Australia',
    pts: [[114, -22], [130, -12], [143, -11], [153, -26], [150, -37], [137, -35], [124, -34], [115, -34]]
  },
  {
    id: 'nz',
    name: 'New Zealand',
    pts: [[167, -46], [178, -37], [175, -42], [169, -46]]
  }
].map(c => ({
  ...c,
  points: c.pts.map(([lon, lat]) => toMapXY(lat, lon).join(',')).join(' ')
}));

export const HUB_COORDS = {
  nyc: { id: 'nyc', label: 'New York', country: 'USA', lat: 40.71, lon: -74.01 },
  lon: { id: 'lon', label: 'London', country: 'UK', lat: 51.51, lon: -0.13 },
  dxb: { id: 'dxb', label: 'Dubai', country: 'United Arab Emirates', lat: 25.2, lon: 55.27 },
  sgp: { id: 'sgp', label: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82 },
  tyo: { id: 'tyo', label: 'Tokyo', country: 'Japan', lat: 35.68, lon: 139.65 },
  mum: { id: 'mum', label: 'Mumbai', country: 'India', lat: 19.08, lon: 72.88 }
};

export const COUNTRY_COORDS = {
  Australia: { id: 'au', label: 'Sydney / Canberra, Australia', country: 'Australia', lat: -33.87, lon: 151.21 },
  Brazil: { id: 'br', label: 'Brasilia, Brazil', country: 'Brazil', lat: -15.79, lon: -47.88 },
  Canada: { id: 'ca', label: 'Toronto / Montreal, Canada', country: 'Canada', lat: 43.65, lon: -79.38 },
  China: { id: 'cn', label: 'Shanghai / Shenzhen, China', country: 'China', lat: 31.23, lon: 121.47 },
  'Classic Properties': { id: 'classic', label: 'Global Core Portfolio', country: 'Classic Properties', lat: 40.71, lon: -74.01 },
  Denmark: { id: 'dk', label: 'Copenhagen, Denmark', country: 'Denmark', lat: 55.68, lon: 12.57 },
  Finland: { id: 'fi', label: 'Helsinki, Finland', country: 'Finland', lat: 60.17, lon: 24.94 },
  France: { id: 'fr', label: 'Lyon / Riviera, France', country: 'France', lat: 45.76, lon: 4.83 },
  Germany: { id: 'de', label: 'Berlin / Nuremberg, Germany', country: 'Germany', lat: 52.52, lon: 13.4 },
  Greenland: { id: 'gl', label: 'Nuuk, Greenland', country: 'Greenland', lat: 64.18, lon: -51.72 },
  Hawaii: { id: 'hi', label: 'Molokai, Hawaii', country: 'Hawaii', lat: 21.13, lon: -157.02 },
  Italy: { id: 'it', label: 'Pisa, Italy', country: 'Italy', lat: 43.72, lon: 10.4 },
  Kazakhstan: { id: 'kz', label: 'Astana, Kazakhstan', country: 'Kazakhstan', lat: 51.16, lon: 71.47 },
  Macao: { id: 'mo', label: 'Macao', country: 'Macao', lat: 22.2, lon: 113.54 },
  Mexico: { id: 'mx', label: 'Mexico City, Mexico', country: 'Mexico', lat: 19.43, lon: -99.13 },
  Monaco: { id: 'mc', label: 'Monte-Carlo, Monaco', country: 'Monaco', lat: 43.74, lon: 7.43 },
  'New Zealand': { id: 'nz', label: 'New Plymouth, New Zealand', country: '-39.06', lat: -39.06, lon: 174.08 },
  Poland: { id: 'pl', label: 'Lublin, Poland', country: 'Poland', lat: 51.25, lon: 22.57 },
  Romania: { id: 'ro', label: 'Bucharest, Romania', country: 'Romania', lat: 44.43, lon: 26.1 },
  Russia: { id: 'ru', label: 'Moscow / St. Petersburg, Russia', country: 'Russia', lat: 55.75, lon: 37.62 },
  Singapore: { id: 'sg', label: 'Singapore', country: 'Singapore', lat: 1.35, lon: 103.82 },
  Spain: { id: 'es', label: 'Barcelona / Ibiza, Spain', country: 'Spain', lat: 41.39, lon: 2.17 },
  Sweden: { id: 'se', label: 'Karlstad, Sweden', country: 'Sweden', lat: 59.38, lon: 13.5 },
  Switzerland: { id: 'ch', label: 'Veto, Switzerland', country: 'Switzerland', lat: 46.95, lon: 7.45 },
  Taiwan: { id: 'tw', label: 'Taipei, Taiwan', country: 'Taiwan', lat: 25.03, lon: 121.56 },
  Turkey: { id: 'tr', label: 'Istanbul / Ankara, Turkey', country: 'Turkey', lat: 41.01, lon: 28.98 },
  UK: { id: 'uk', label: 'London / Manchester, UK', country: 'UK', lat: 51.51, lon: -0.13 },
  USA: { id: 'us', label: 'New York / Los Angeles, USA', country: 'USA', lat: 40.71, lon: -74.01 },
  'United Arab Emirates': { id: 'ae', label: 'Dubai / Abu Dhabi, UAE', country: 'United Arab Emirates', lat: 25.2, lon: 55.27 },
  Vietnam: { id: 'vn', label: 'Kon Tum, Vietnam', country: 'Vietnam', lat: 14.35, lon: 108.0 }
};

// Fix string literal country on NZ cleanly
COUNTRY_COORDS['New Zealand'] = { id: 'nz', label: 'New Plymouth, New Zealand', country: 'New Zealand', lat: -39.06, lon: 174.08 };

export function resolvePropertyLocation(prop) {
  const grp = propGroup(prop);
  const coord = COUNTRY_COORDS[grp] || COUNTRY_COORDS['Classic Properties'];
  const [x, y] = toMapXY(coord.lat, coord.lon);
  return { ...coord, group: grp, x, y };
}

function defaultHqHubForBusiness(b, index) {
  const hubIds = Object.keys(HUB_COORDS);
  const firstBranch = b.branches?.[0];
  if (firstBranch && HUB_COORDS[firstBranch]) return HUB_COORDS[firstBranch];
  const key = hubIds[index % hubIds.length];
  return HUB_COORDS[key];
}

export function buildEmpireMapData(s, catalog, { filter = 'all', q = '' } = {}) {
  const cleanQ = String(q || '').trim().toLowerCase();
  const clusters = new Map();

  function ensureCluster(id, meta) {
    if (!clusters.has(id)) {
      const [x, y] = toMapXY(meta.lat, meta.lon);
      clusters.set(id, {
        id,
        label: meta.label,
        country: meta.country,
        lat: meta.lat,
        lon: meta.lon,
        x,
        y,
        hqs: [],
        branches: [],
        properties: [],
        logisticsCount: 0,
        totalValue: new Decimal(0),
        hourlyIncome: new Decimal(0),
        hourlyExpenses: new Decimal(0)
      });
    }
    return clusters.get(id);
  }

  const routes = [];
  const logisticsTypes = new Set(['taxi', 'transport', 'shipping', 'logistics_empire']);

  (s.businesses || []).forEach((b, idx) => {
    const catBiz = catalog.businesses.find(k => k.id === b.type);
    const m = getBusinessModel(b.type);
    const sim = simulateBusiness(s, b, s.at, catalog);
    const val = new Decimal(businessValuation(b, catalog));
    const hqHub = defaultHqHubForBusiness(b, idx);
    const hqCluster = ensureCluster(`hub:${hqHub.id}`, hqHub);
    const isLogistics = logisticsTypes.has(b.type) || m.kind === 'fleet';

    hqCluster.hqs.push({
      id: b.id,
      name: b.name || catBiz?.name || b.type,
      type: b.type,
      catalogueName: catBiz?.name || b.type,
      level: b.level,
      isLogistics,
      revenue: sim.revenue,
      expenses: sim.expenses,
      netProfit: sim.netProfit,
      valuation: val.toString()
    });
    if (isLogistics) hqCluster.logisticsCount++;
    hqCluster.totalValue = hqCluster.totalValue.plus(val);
    hqCluster.hourlyIncome = hqCluster.hourlyIncome.plus(sim.revenue);
    hqCluster.hourlyExpenses = hqCluster.hourlyExpenses.plus(sim.expenses);

    for (const brId of b.branches || []) {
      const reg = WORLD_REGIONS.find(r => r.id === brId);
      const brHub = HUB_COORDS[brId];
      if (!reg || !brHub) continue;
      const brCluster = ensureCluster(`hub:${brHub.id}`, brHub);
      brCluster.branches.push({
        businessId: b.id,
        businessName: b.name || catBiz?.name || b.type,
        regionId: brId,
        regionName: reg.name,
        revMult: reg.revMult,
        expMult: reg.expMult
      });
      if (isLogistics) brCluster.logisticsCount++;
      if (hqHub.id !== brHub.id) {
        const [x1, y1] = toMapXY(hqHub.lat, hqHub.lon);
        const [x2, y2] = toMapXY(brHub.lat, brHub.lon);
        routes.push({
          id: `${b.id}:${hqHub.id}->${brHub.id}`,
          from: hqHub.label,
          to: brHub.label,
          businessName: b.name || catBiz?.name || b.type,
          isLogistics,
          x1,
          y1,
          x2,
          y2
        });
      }
    }
  });

  let totalRegionalPropValue = new Decimal(0);
  let totalRegionalPropRent = new Decimal(0);

  for (const p of catalog.properties || []) {
    const qty = s.properties?.[p.id] || 0;
    if (qty <= 0) continue;
    const loc = resolvePropertyLocation(p);
    // Merge into existing hub if US/UK/Singapore overlaps or distinct country cluster
    const clusterKey = loc.country === 'USA'
      ? 'hub:nyc'
      : loc.country === 'UK'
        ? 'hub:lon'
        : loc.country === 'United Arab Emirates'
          ? 'hub:dxb'
          : loc.country === 'Singapore'
            ? 'hub:sgp'
            : `country:${loc.id}`;
    const meta = loc.country === 'USA'
      ? HUB_COORDS.nyc
      : loc.country === 'UK'
        ? HUB_COORDS.lon
        : loc.country === 'United Arab Emirates'
          ? HUB_COORDS.dxb
          : loc.country === 'Singapore'
            ? HUB_COORDS.sgp
            : loc;
    const cluster = ensureCluster(clusterKey, meta);
    const pm = propertyMetrics(p, qty, s.propState?.[p.id], s.at);
    const val = new Decimal(p.price).times(qty);
    const rent = new Decimal(pm.netIncome);
    totalRegionalPropValue = totalRegionalPropValue.plus(val);
    totalRegionalPropRent = totalRegionalPropRent.plus(rent);

    cluster.properties.push({
      id: p.id,
      name: p.name,
      qty,
      group: loc.group,
      valuation: val.toString(),
      netRent: rent.toString(),
      occupancy: Number((pm.occupancy * 100).toFixed(0)),
      condition: pm.condition
    });
    cluster.totalValue = cluster.totalValue.plus(val);
    cluster.hourlyIncome = cluster.hourlyIncome.plus(rent);
  }

  let markers = [...clusters.values()].map(c => ({
    ...c,
    totalValue: c.totalValue.toDecimalPlaces(2).toString(),
    hourlyIncome: c.hourlyIncome.toDecimalPlaces(2).toString(),
    hourlyExpenses: c.hourlyExpenses.toDecimalPlaces(2).toString(),
    netHourly: c.hourlyIncome.minus(c.hourlyExpenses).toDecimalPlaces(2).toString(),
    totalCount: c.hqs.length + c.branches.length + c.properties.length
  }));

  if (filter === 'properties') markers = markers.filter(m => m.properties.length > 0);
  else if (filter === 'hq') markers = markers.filter(m => m.hqs.length > 0);
  else if (filter === 'branches') markers = markers.filter(m => m.branches.length > 0);
  else if (filter === 'logistics') markers = markers.filter(m => m.logisticsCount > 0);

  if (cleanQ) {
    markers = markers.filter(m =>
      m.label.toLowerCase().includes(cleanQ) ||
      m.country.toLowerCase().includes(cleanQ) ||
      m.hqs.some(h => h.name.toLowerCase().includes(cleanQ)) ||
      m.properties.some(p => p.name.toLowerCase().includes(cleanQ))
    );
  }

  // Regional expansion opportunities strictly from WORLD_REGIONS configuration
  const allOpenBranches = new Set();
  for (const b of s.businesses || []) {
    for (const r of b.branches || []) allOpenBranches.add(r);
  }
  const opportunities = WORLD_REGIONS.map(reg => {
    const hub = HUB_COORDS[reg.id];
    const [x, y] = toMapXY(hub.lat, hub.lon);
    return {
      ...reg,
      x,
      y,
      activeInCount: (s.businesses || []).filter(b => (b.branches || []).includes(reg.id)).length
    };
  });

  return {
    markers,
    routes,
    opportunities,
    totals: {
      locationsCount: markers.length,
      hqCount: (s.businesses || []).length,
      branchCount: (s.businesses || []).reduce((n, b) => n + (b.branches || []).length, 0),
      propertyCount: Object.values(s.properties || {}).reduce((a, b) => a + b, 0),
      totalPropertyValue: totalRegionalPropValue.toDecimalPlaces(2).toString(),
      totalPropertyRent: totalRegionalPropRent.toDecimalPlaces(2).toString()
    }
  };
}
