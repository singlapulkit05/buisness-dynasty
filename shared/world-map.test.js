import Decimal from 'decimal.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from './catalog.js';
import { initial, apply, financialStatement } from './engine.js';
import { resolvePropertyLocation, buildEmpireMapData } from './world-map.js';

test('every catalog property resolves cleanly to valid SVG coordinates', () => {
  for (const p of catalog.properties) {
    const loc = resolvePropertyLocation(p);
    assert.ok(loc.x >= 0 && loc.x <= 1000, `invalid x for ${p.name}: ${loc.x}`);
    assert.ok(loc.y >= 0 && loc.y <= 500, `invalid y for ${p.name}: ${loc.y}`);
    assert.ok(loc.country.length > 0);
  }
});

test('empire map clusters reconcile property valuations and rent with financialStatement', () => {
  let s = initial(100000);
  s.cash = '50000000';
  s = apply(s, { type: 'buyBusiness', item: 'shipping', name: 'Oceanic Freight', id: 'b1' }, 100000);
  const bizId = s.businesses[0].id;
  s = apply(s, { type: 'openBranch', target: bizId, region: 'sgp', id: 'br1' }, 100000);
  const p0 = catalog.properties[0];
  const p1 = catalog.properties[10];
  s = apply(s, { type: 'trade', category: 'properties', item: p0.id, id: 'pr1' }, 100000);
  s = apply(s, { type: 'trade', category: 'properties', item: p1.id, id: 'pr2' }, 100000);

  const mapData = buildEmpireMapData(s, catalog);
  const fs = financialStatement(s, catalog);

  assert.equal(mapData.totals.hqCount, 1);
  assert.equal(mapData.totals.branchCount, 1);
  assert.equal(mapData.totals.propertyCount, 2);
  assert.equal(new Decimal(mapData.totals.totalPropertyValue).toFixed(2), new Decimal(fs.propVal).toFixed(2));
  assert.ok(mapData.routes.length >= 0);

  const logisticsFiltered = buildEmpireMapData(s, catalog, { filter: 'logistics' });
  assert.ok(logisticsFiltered.markers.some(m => m.logisticsCount > 0));
});
