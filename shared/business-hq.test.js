import test from 'node:test';
import assert from 'node:assert/strict';
import { catalog } from './catalog.js';
import { getBusinessHqTier } from './business-hq.js';

test('all 17 business types map to 3 distinct HQ visual progression stages', () => {
  assert.equal(catalog.businesses.length, 17);
  for (const b of catalog.businesses) {
    const t1 = getBusinessHqTier(b.id, 1);
    const t2 = getBusinessHqTier(b.id, 10);
    const t3 = getBusinessHqTier(b.id, 25);
    assert.equal(t1.tier, 1);
    assert.equal(t2.tier, 2);
    assert.equal(t3.tier, 3);
    assert.ok(t1.stageTitle && t2.stageTitle && t3.stageTitle);
    assert.notEqual(t1.stageTitle, t2.stageTitle);
    assert.notEqual(t2.stageTitle, t3.stageTitle);
  }
});
