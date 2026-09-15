import test from 'node:test';
import assert from 'node:assert/strict';
import { speedForCondition, delayFactorFor, estimateSegmentDuration } from '../src/services/etaPredictor.js';

test('speedForCondition maps road conditions to plausible speeds', () => {
  assert.equal(speedForCondition('good'), 60);
  assert.equal(speedForCondition('fair'), 45);
  assert.equal(speedForCondition('poor'), 30);
  assert.equal(speedForCondition('unknown'), 45); // safe default
});

test('delayFactorFor increases monotonically with risk level', () => {
  const green = delayFactorFor('green');
  const yellow = delayFactorFor('yellow');
  const orange = delayFactorFor('orange');
  const red = delayFactorFor('red');
  assert.ok(green < yellow && yellow < orange && orange < red);
});

test('estimateSegmentDuration: higher risk on the same road adds delay minutes', () => {
  const calm = estimateSegmentDuration(100, 'fair', 'green');
  const risky = estimateSegmentDuration(100, 'fair', 'red');
  assert.equal(calm.base_minutes, risky.base_minutes); // same base distance/condition
  assert.ok(risky.duration_minutes > calm.duration_minutes);
  assert.ok(risky.delay_minutes > calm.delay_minutes);
});
