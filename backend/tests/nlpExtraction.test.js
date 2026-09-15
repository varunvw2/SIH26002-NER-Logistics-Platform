import test from 'node:test';
import assert from 'node:assert/strict';
import { NLPExtractionProvider } from '../src/providers/ai/NLPExtractionProvider.js';

const nlp = new NLPExtractionProvider();

test('extracts bridge damage caused by flood, matching the spec example', () => {
  const result = nlp.extract('Bridge near village X is partially damaged because of flooding.');
  assert.equal(result.type, 'bridge_damaged');
  assert.equal(result.cause, 'flood'); // matches the spec's own worked example exactly
  assert.equal(result.severity, 'high'); // "partially damaged" -> high
});

test('extracts landslide with critical severity when fully blocked', () => {
  const result = nlp.extract('Landslide has completely blocked the road, impassable for all vehicles.');
  assert.equal(result.type, 'landslide');
  assert.equal(result.severity, 'critical');
});

test('falls back to defaults with low confidence on empty text', () => {
  const result = nlp.extract('   ');
  assert.equal(result.type, 'other');
  assert.equal(result.confidence, 0);
});

test('never returns confidence above 1 or below 0', () => {
  const result = nlp.extract('minor traffic jam due to overloaded truck near the bridge');
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
});
