import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function read(relativePath) {
  return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('forked workflow entrypoints require explicit invocation', async () => {
  for (const relativePath of ['skills/brainstorming-codex/SKILL.md', 'skills/writing-plans-codex/SKILL.md']) {
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

test('brainstorming and planning skills call MCP tools instead of subagent types', async () => {
  const brainstorming = await read('skills/brainstorming-codex/SKILL.md');
  const planning = await read('skills/writing-plans-codex/SKILL.md');

  assert.match(brainstorming, /codex_research/);
  assert.match(planning, /codex_plan/);
  assert.doesNotMatch(brainstorming, /subagent_type/);
  assert.doesNotMatch(planning, /subagent_type/);
});
