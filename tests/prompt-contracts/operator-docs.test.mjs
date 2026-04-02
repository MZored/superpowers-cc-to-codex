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

test('README documents direct GitHub installation and the four forked skills', async () => {
  const readme = await read('README.md');
  assert.match(readme, /claude plugin marketplace add/);
  assert.match(readme, /brainstorming/);
  assert.match(readme, /writing-plans/);
  assert.match(readme, /subagent-driven-development/);
  assert.match(readme, /requesting-code-review/);
});
