import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExperimentalFeatures } from '../../scripts/lib/experimental-features.mjs';

test('loadExperimentalFeatures enables implement-resume task mode only for the matching flag', () => {
  const features = loadExperimentalFeatures({ SUPERPOWERS_CODEX_EXPERIMENTAL_TASKS: 'implement-resume' });

  assert.deepEqual(features, { taskMode: 'implement-resume' });
});

test('loadExperimentalFeatures falls back to taskMode off for any other flag value', () => {
  const features = loadExperimentalFeatures({ SUPERPOWERS_CODEX_EXPERIMENTAL_TASKS: 'something-else' });

  assert.deepEqual(features, { taskMode: 'off' });
});

test('loadExperimentalFeatures falls back to taskMode off when the flag is missing', () => {
  const features = loadExperimentalFeatures({});

  assert.deepEqual(features, { taskMode: 'off' });
});
