import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('forked workflow entrypoints require explicit invocation', async () => {
  for (const relativePath of ['skills/brainstorming/SKILL.md', 'skills/writing-plans/SKILL.md']) {
    const body = await read(relativePath);
    assert.match(body, /disable-model-invocation:\s*true/);
    assert.match(body, /Upstream source: obra\/superpowers/);
  }
});

test('brainstorm and plan agents are thin codex forwarders', async () => {
  const researchAgent = await read('agents/codex-brainstorm-researcher.md');
  const planAgent = await read('agents/codex-plan-drafter.md');
  assert.match(researchAgent, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs.*research/);
  assert.match(planAgent, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/codex-run\.mjs.*plan/);
  assert.doesNotMatch(researchAgent, /git commit/);
  assert.doesNotMatch(planAgent, /git commit/);
});

test('brainstorming and writing-plans dispatch named subagents instead of raw adapter commands', async () => {
  const brainstorming = await read('skills/brainstorming/SKILL.md');
  const planning = await read('skills/writing-plans/SKILL.md');

  assert.match(brainstorming, /subagent_type:\s*"codex-brainstorm-researcher"/);
  assert.match(planning, /subagent_type:\s*"codex-plan-drafter"/);
  assert.doesNotMatch(brainstorming, /codex-run\.mjs/);
  assert.doesNotMatch(planning, /codex-run\.mjs/);
});
