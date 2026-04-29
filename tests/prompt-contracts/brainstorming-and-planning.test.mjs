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

test('brainstorming and planning skills call MCP tools instead of subagent types', async () => {
  const brainstorming = await read('skills/brainstorming-codex/SKILL.md');
  const planning = await read('skills/writing-plans-codex/SKILL.md');

  assert.match(brainstorming, /codex_research/);
  assert.match(planning, /codex_plan/);
  assert.doesNotMatch(brainstorming, /subagent_type/);
  assert.doesNotMatch(planning, /subagent_type/);
});

test('plan prompt and schema contract include the full markdown plan body', async () => {
  const prompt = await read('skills/writing-plans-codex/prompts/planning-brief.md');
  const schema = JSON.parse(await read('schemas/plan-draft.schema.json'));

  assert.match(prompt, /plan_markdown/);
  assert.ok(schema.required.includes('plan_markdown'), 'plan-draft schema must require plan_markdown');
  assert.equal(schema.properties.plan_markdown.type, 'string');
});
