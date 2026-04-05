import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('all six agents are bash-only forwarders that resolve bundled assets via CLAUDE_PLUGIN_ROOT', async () => {
  for (const relativePath of [
    'agents/codex-brainstorm-researcher.md',
    'agents/codex-plan-drafter.md',
    'agents/codex-debug-investigator.md',
    'agents/codex-branch-analyzer.md',
    'agents/codex-implementer.md',
    'agents/codex-reviewer.md'
  ]) {
    const body = await read(relativePath);
    assert.match(body, /^---[\s\S]*tools:\s*Bash/m);
    assert.match(body, /Run exactly one Bash call/);
    assert.match(body, /Do not inspect the repository/i);
    assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs/);
    if (body.includes('--schema ')) {
      assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}\/schemas\//);
      assert.doesNotMatch(body, /--schema schemas\//);
    }
    if (body.includes('--promptFile ')) {
      assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\//);
      assert.doesNotMatch(body, /--promptFile skills\//);
    }
    assert.doesNotMatch(body, /node scripts\/codex-run\.mjs/);
    assert.doesNotMatch(body, /model:\s*inherit/);
  }
});

test('agent files are retained only as deprecated compatibility shims', async () => {
  for (const relativePath of [
    'agents/codex-brainstorm-researcher.md',
    'agents/codex-plan-drafter.md',
    'agents/codex-debug-investigator.md',
    'agents/codex-branch-analyzer.md',
    'agents/codex-implementer.md',
    'agents/codex-reviewer.md'
  ]) {
    const body = await read(relativePath);
    assert.match(body, /deprecated compatibility shim/i, `${relativePath} should contain deprecation notice`);
    assert.match(body, /scripts\/codex-run\.mjs/, `${relativePath} should reference scripts/codex-run.mjs`);
  }
});
