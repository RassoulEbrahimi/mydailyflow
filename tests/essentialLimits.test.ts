import assert from 'node:assert/strict';
import test from 'node:test';

import { clampDailyEssentialTarget, MAX_DAILY_ESSENTIAL_TARGET } from '../src/types/essential';

test('new Essential targets are capped at five', () => {
  assert.equal(MAX_DAILY_ESSENTIAL_TARGET, 5);
  assert.equal(clampDailyEssentialTarget(1), 1);
  assert.equal(clampDailyEssentialTarget(3), 3);
  assert.equal(clampDailyEssentialTarget(5), 5);
  assert.equal(clampDailyEssentialTarget(6), 5);
  assert.equal(clampDailyEssentialTarget(10), 5);
});

test('target normalization never creates zero, fractions or non-finite values', () => {
  assert.equal(clampDailyEssentialTarget(0), 1);
  assert.equal(clampDailyEssentialTarget(-4), 1);
  assert.equal(clampDailyEssentialTarget(2.6), 3);
  assert.equal(clampDailyEssentialTarget(Number.NaN), 1);
  assert.equal(clampDailyEssentialTarget(Number.POSITIVE_INFINITY), 1);
});
