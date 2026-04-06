import test from 'node:test';
import assert from 'node:assert/strict';
import { compareForkToUpstream } from '../../scripts/check-upstream-superpowers.mjs';

test('compareForkToUpstream reports drift against the upstream fixture', async () => {
  const report = await compareForkToUpstream({
    forkPath: 'skills/brainstorming-codex/SKILL.md',
    upstreamPath: 'skills/brainstorming/SKILL.md',
    sourceDir: 'tests/fixtures/upstream-superpowers'
  });

  assert.equal(report.source, 'obra/superpowers skills/brainstorming/SKILL.md');
  assert.equal(report.status, 'drifted');
});
