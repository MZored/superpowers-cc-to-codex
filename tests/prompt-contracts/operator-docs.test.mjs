import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('doctor command points to the maintained preflight checks', async () => {
  const doctor = await read('commands/doctor.md');
  assert.match(doctor, /detect-codex\.mjs/);
  assert.match(doctor, /check-codex-cli\.mjs/);
  assert.match(doctor, /claude plugin validate/);
});

test('README documents marketplace install, upstream superpowers reference, license, and all forked skills', async () => {
  const readme = await read('README.md');
  assert.match(readme, /\/plugin marketplace add mzored\/superpowers-cc-to-codex/);
  assert.match(readme, /\/plugin install superpowers-cc-to-codex@superpowers-cc-to-codex/);
  assert.match(readme, /https:\/\/github\.com\/obra\/superpowers/);
  assert.match(readme, /\/plugin marketplace add obra\/superpowers-marketplace/);
  assert.match(readme, /\/plugin install superpowers@superpowers-marketplace/);
  assert.match(readme, /MIT License/);
  assert.match(readme, /superpowers-cc-to-codex:brainstorming/);
  assert.match(readme, /superpowers-cc-to-codex:writing-plans/);
  assert.match(readme, /superpowers-cc-to-codex:subagent-driven-development/);
  assert.match(readme, /superpowers-cc-to-codex:requesting-code-review/);
  assert.match(readme, /superpowers-cc-to-codex:systematic-debugging/);
  assert.match(readme, /superpowers-cc-to-codex:test-driven-development/);
  assert.match(readme, /superpowers-cc-to-codex:finishing-a-development-branch/);
});

test('operator docs cover codex state inspection and workflow examples', async () => {
  const doctor = await read('commands/doctor.md');
  const state = await read('commands/codex-state.md');
  const readme = await read('README.md');

  assert.match(state, /list-codex-state\.mjs/);
  assert.match(state, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.match(doctor, /commands\/codex-state\.md/);
  assert.match(readme, /superpowers-cc-to-codex:brainstorming/);
  assert.match(readme, /superpowers-cc-to-codex:writing-plans/);
  assert.match(readme, /superpowers-cc-to-codex:subagent-driven-development/);
  assert.match(readme, /superpowers-cc-to-codex:requesting-code-review/);
  assert.match(readme, /superpowers-cc-to-codex:test-driven-development/);
  assert.match(readme, /superpowers-cc-to-codex:finishing-a-development-branch/);
  assert.match(readme, /task resume looks stuck inside Claude Code/i);
});
