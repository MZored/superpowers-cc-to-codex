import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareForkToUpstream } from '../../scripts/check-upstream-superpowers.mjs';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('compareForkToUpstream reports when a result matches the expected sync state', async () => {
  const report = await compareForkToUpstream({
    forkPath: 'skills/brainstorming/SKILL.md',
    upstreamPath: 'skills/brainstorming/SKILL.md',
    sourceDir: 'tests/fixtures/upstream-superpowers',
    expectedStatus: 'drifted'
  });

  assert.equal(report.expectedStatus, 'drifted');
  assert.equal(report.matchesExpectation, true);
});

test('marketplace manifest includes a plugin-level description', async () => {
  const marketplace = JSON.parse(await read('.claude-plugin/marketplace.json'));
  assert.match(marketplace.plugins[0].description, /Codex-backed fork/);
});

test('validation workflow pins Claude Code to the locally verified version', async () => {
  const workflow = await read('.github/workflows/validate.yml');
  assert.match(workflow, /CLAUDE_CODE_VERSION:\s*2\.1\.90/);
  assert.match(workflow, /@anthropic-ai\/claude-code@\$\{\{ env\.CLAUDE_CODE_VERSION \}\}/);
});

test('validation workflow installs dependencies and validates the plugin manifest directly', async () => {
  const workflow = await read('.github/workflows/validate.yml');
  assert.match(workflow, /^\s*- run: npm install$/m);
  assert.match(workflow, /^\s*- run: claude plugin validate \.claude-plugin\/plugin\.json$/m);
});
