import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoadRisk, riskLevelFor, buildPredictiveWarning } from '../src/services/riskEngine.js';

test('riskLevelFor tiers match documented thresholds', () => {
  assert.equal(riskLevelFor(0), 'green');
  assert.equal(riskLevelFor(19), 'green');
  assert.equal(riskLevelFor(20), 'yellow');
  assert.equal(riskLevelFor(44), 'yellow');
  assert.equal(riskLevelFor(45), 'orange');
  assert.equal(riskLevelFor(69), 'orange');
  assert.equal(riskLevelFor(70), 'red');
  assert.equal(riskLevelFor(100), 'red');
});

test('calculateRoadRisk: normal conditions score low with no factors', () => {
  const road = { terrain_slope_deg: 5, road_condition: 'good', landslide_history_count: 0 };
  const result = calculateRoadRisk(road, [{ rainfall_mm: 5 }, { rainfall_mm: 8 }], [], []);
  assert.equal(result.risk_level, 'green');
  assert.ok(result.risk_score < 20);
  assert.match(result.factors[0], /Normal conditions/);
});

test('calculateRoadRisk: heavy rainfall + steep terrain + poor condition compounds toward critical', () => {
  const road = { terrain_slope_deg: 22, road_condition: 'poor', landslide_history_count: 6 };
  const result = calculateRoadRisk(road, [{ rainfall_mm: 52 }], [{ severity: 'low' }], [{ condition: 'poor' }]);
  // 40 (rain) + 25 (slope) + 15 (poor) + 10 (bridge) + 15 (history cap) + 8 (1 low-severity incident) = 113 -> capped 100
  assert.equal(result.risk_score, 100);
  assert.equal(result.risk_level, 'red');
  assert.ok(result.factors.some(f => f.includes('rainfall')));
  assert.ok(result.factors.some(f => f.includes('Steep terrain')));
});

test('calculateRoadRisk: a single critical incident alone pushes an otherwise-calm road to orange/red', () => {
  const road = { terrain_slope_deg: 5, road_condition: 'good', landslide_history_count: 0 };
  const result = calculateRoadRisk(road, [{ rainfall_mm: 5 }], [{ severity: 'critical' }], []);
  assert.ok(result.risk_score >= 45, `expected >=45, got ${result.risk_score}`);
  assert.ok(['orange', 'red'].includes(result.risk_level));
});

test('calculateRoadRisk: incident severity outweighs incident count - one critical beats three low', () => {
  const road = { terrain_slope_deg: 5, road_condition: 'good', landslide_history_count: 0 };
  const oneCritical = calculateRoadRisk(road, [], [{ severity: 'critical' }], []);
  const threeLow = calculateRoadRisk(road, [], [{ severity: 'low' }, { severity: 'low' }, { severity: 'low' }], []);
  assert.ok(oneCritical.risk_score > threeLow.risk_score);
});

test('calculateRoadRisk: score never exceeds 100', () => {
  const road = { terrain_slope_deg: 30, road_condition: 'poor', landslide_history_count: 20 };
  const manyIncidents = Array.from({ length: 10 }, () => ({ severity: 'critical' }));
  const result = calculateRoadRisk(road, [{ rainfall_mm: 100 }], manyIncidents, [{ condition: 'poor' }]);
  assert.equal(result.risk_score, 100);
});

test('buildPredictiveWarning uses forward-looking, non-confirmed wording', () => {
  assert.match(buildPredictiveWarning({ risk_level: 'red' }), /PREDICTION/);
  assert.equal(buildPredictiveWarning({ risk_level: 'green' }), null);
});
