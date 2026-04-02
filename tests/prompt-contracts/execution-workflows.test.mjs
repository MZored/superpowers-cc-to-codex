import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('execution workflow preserves review order and explicit status handling', async () => {
  const skill = await read('skills/subagent-driven-development/SKILL.md');
  assert.match(skill, /spec compliance/i);
  assert.match(skill, /code quality/i);
  assert.match(skill, /DONE_WITH_CONCERNS/);
  assert.match(skill, /NEEDS_CONTEXT/);
});

test('implementer and reviewer agents forward to the adapter without doing git work themselves', async () => {
  const implementer = await read('agents/codex-implementer.md');
  const reviewer = await read('agents/codex-reviewer.md');
  assert.match(implementer, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs.*implement/);
  assert.match(reviewer, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs.*review/);
  assert.doesNotMatch(implementer, /git commit/);
  assert.doesNotMatch(reviewer, /git commit/);
});
